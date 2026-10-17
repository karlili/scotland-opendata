import type { DatasetInput } from "../db/catalogue.ts";
import { fetchJson, UpstreamError, type Fetch } from "./http.ts";

type Term = { type: "uri" | "literal" | "bnode" | "typed-literal"; value: string; datatype?: string; "xml:lang"?: string };

export interface SparqlResults {
  head: { vars: string[] };
  results: { bindings: Record<string, Term>[] };
}

const PREFIXES = `
PREFIX qb: <http://purl.org/linked-data/cube#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
`;

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const QB_DATASET = "http://purl.org/linked-data/cube#dataSet";

/** Rejects anything that could break out of an <IRI> in a query. */
function assertIri(iri: string): string {
  if (!/^https?:\/\/[^\s<>"{}|^`\\]+$/.test(iri)) throw new UpstreamError(`Not a safe IRI: ${iri}`);
  return iri;
}

/** Short column name for a predicate IRI: its fragment or last path segment. */
export function localName(iri: string): string {
  const m = iri.match(/[#/]([^#/]+)$/);
  return m?.[1] ?? iri;
}

/** Client for a SPARQL 1.1 endpoint publishing RDF Data Cube datasets (statistics.gov.scot). */
export class SparqlClient {
  constructor(
    readonly endpoint: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async query(sparql: string): Promise<SparqlResults> {
    return fetchJson<SparqlResults>(this.fetchImpl, this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/sparql-results+json",
      },
      body: new URLSearchParams({ query: sparql }).toString(),
    });
  }

  /** Lists every qb:DataSet with its descriptive metadata. */
  async harvest(): Promise<DatasetInput[]> {
    const res = await this.query(`${PREFIXES}
SELECT ?ds ?label ?comment ?modified ?license ?publisherLabel WHERE {
  ?ds a qb:DataSet .
  OPTIONAL { ?ds rdfs:label ?label }
  OPTIONAL { ?ds rdfs:comment ?comment }
  OPTIONAL { ?ds dcterms:modified ?modified }
  OPTIONAL { ?ds dcterms:license ?license }
  OPTIONAL { ?ds dcterms:publisher ?publisher . OPTIONAL { ?publisher rdfs:label ?publisherLabel } }
}`);
    const byUri = new Map<string, DatasetInput>();
    for (const b of res.results.bindings) {
      const uri = b.ds?.value;
      if (!uri || byUri.has(uri)) continue;
      const name = localName(uri);
      byUri.set(uri, {
        name,
        title: b.label?.value ?? name,
        description: b.comment?.value ?? null,
        publisher: b.publisherLabel?.value ?? null,
        license: b.license?.value ?? null,
        modified: b.modified?.value ?? null,
        upstreamUrl: uri,
        resources: [
          { upstreamId: name, name: "SPARQL observations", format: "SPARQL", url: uri, accessType: "api", queryable: true },
        ],
      });
    }
    return [...byUri.values()];
  }

  /**
   * Fetches a page of observations from a data cube and pivots the triples
   * into one record per observation, keyed by predicate local name. IRI
   * values carry their rdfs:label when the endpoint has one.
   */
  async observations(
    datasetIri: string,
    page: { limit: number; offset: number },
  ): Promise<{ fields: { id: string; type: string }[]; records: Record<string, unknown>[] }> {
    const res = await this.query(`${PREFIXES}
SELECT ?obs ?p ?o ?oLabel WHERE {
  { SELECT ?obs WHERE { ?obs qb:dataSet <${assertIri(datasetIri)}> } ORDER BY ?obs LIMIT ${page.limit} OFFSET ${page.offset} }
  ?obs ?p ?o .
  OPTIONAL { ?o rdfs:label ?oLabel }
}`);
    const rows = new Map<string, Record<string, unknown>>();
    const fields = new Map<string, string>();
    for (const b of res.results.bindings) {
      const obs = b.obs?.value;
      const p = b.p?.value;
      const o = b.o;
      if (!obs || !p || !o || p === RDF_TYPE || p === QB_DATASET) continue;
      const row = rows.get(obs) ?? { observation: obs };
      rows.set(obs, row);
      const key = localName(p);
      if (key in row && o.type === "uri") continue; // keep the first label we saw for a dimension
      if (o.type === "uri") {
        row[key] = b.oLabel?.value ?? o.value;
        if (b.oLabel) row[`${key}_uri`] = o.value;
        fields.set(key, "text");
      } else {
        const numeric = o.datatype && /#(decimal|double|float|integer|int|long)$/.test(o.datatype);
        row[key] = numeric ? Number(o.value) : o.value;
        fields.set(key, numeric ? "numeric" : "text");
      }
    }
    return {
      fields: [{ id: "observation", type: "text" }, ...[...fields].map(([id, type]) => ({ id, type }))],
      records: [...rows.values()],
    };
  }
}
