import { openCatalogue } from "../src/db/catalogue.ts";
import { Hub } from "../src/hub.ts";
import type { SourceDefinition } from "../src/sources/registry.ts";

// Hand-written upstream responses in the shape CKAN and SPARQL 1.1 return.
// They are fixtures, not recordings of live data.

export const testSources: SourceDefinition[] = [
  { id: "ckan-test", title: "CKAN test", publisher: "Test", kind: "ckan", baseUrl: "https://ckan.test", homepage: "https://ckan.test" },
  { id: "sparql-test", title: "SPARQL test", publisher: "Test", kind: "sparql", baseUrl: "https://sparql.test/sparql", homepage: "https://sparql.test" },
];

const pkg = (name: string, title: string, resources: object[], extra: object = {}) => ({
  id: `id-${name}`,
  name,
  title,
  notes: `${title} notes`,
  organization: { title: "Scottish Government" },
  license_title: "Open Government Licence v3.0",
  metadata_modified: "2026-09-01T00:00:00",
  tags: [{ name: "statistics" }],
  resources,
  ...extra,
});

export const ckanPackages = [
  pkg("population-estimates", "Population Estimates", [
    { id: "res-pop-ds", name: "Population by council", format: "CSV", url: "https://ckan.test/x.csv", datastore_active: true },
  ]),
  pkg("bus-stops", "Bus Stops", [
    { id: "res-bus-geojson", name: "Bus stops GeoJSON", format: "GeoJSON", url: "https://maps.test/stops.geojson" },
    { id: "res-bus-csv", name: "Bus stops CSV", format: "CSV", url: "https://ckan.test/stops.csv" },
  ]),
  pkg("school-rolls", "School Rolls", [
    { id: "res-school-csv", name: "School rolls 2025", format: "CSV", url: "https://ckan.test/schools.csv" },
  ]),
  pkg("annual-report", "Annual Report", [{ id: "res-report-pdf", name: "Report", format: "PDF", url: "https://ckan.test/r.pdf" }]),
];

export const sparqlDatasets = {
  head: { vars: ["ds", "label", "comment", "modified", "license", "publisherLabel"] },
  results: {
    bindings: [
      {
        ds: { type: "uri", value: "http://statistics.test/data/house-prices" },
        label: { type: "literal", value: "House Prices" },
        comment: { type: "literal", value: "Median house prices by council area" },
        publisherLabel: { type: "literal", value: "Registers of Scotland" },
      },
    ],
  },
};

export const sparqlObservations = {
  head: { vars: ["obs", "p", "o", "oLabel"] },
  results: {
    bindings: [
      { obs: { type: "uri", value: "http://statistics.test/obs/1" }, p: { type: "uri", value: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" }, o: { type: "uri", value: "http://purl.org/linked-data/cube#Observation" } },
      { obs: { type: "uri", value: "http://statistics.test/obs/1" }, p: { type: "uri", value: "http://purl.org/linked-data/sdmx/2009/dimension#refArea" }, o: { type: "uri", value: "http://statistics.test/id/S12000036" }, oLabel: { type: "literal", value: "City of Edinburgh" } },
      { obs: { type: "uri", value: "http://statistics.test/obs/1" }, p: { type: "uri", value: "http://statistics.test/def/measure/median" }, o: { type: "literal", value: "312000", datatype: "http://www.w3.org/2001/XMLSchema#decimal" } },
    ],
  },
};

export interface Call {
  url: URL;
  body?: string;
}

/** A fetch stand-in that answers like the two test portals and records every call. */
export function fakeFetch(opts: { failCkan?: boolean } = {}) {
  const state = { failCkan: opts.failCkan ?? false };
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, body });
    const ok = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    if (url.host === "ckan.test") {
      if (state.failCkan) return new Response("down", { status: 503 });
      const action = url.pathname.split("/").pop();
      if (action === "package_search") {
        const start = Number(url.searchParams.get("start"));
        return ok({ success: true, result: { count: ckanPackages.length, results: start === 0 ? ckanPackages : [] } });
      }
      if (action === "datastore_search") {
        return ok({
          success: true,
          result: {
            fields: [{ id: "_id", type: "int" }, { id: "Council", type: "text" }, { id: "Population", type: "int" }],
            records: [{ _id: 1, Council: "Fife", Population: 374130 }],
            total: 32,
          },
        });
      }
    }
    if (url.host === "sparql.test") {
      const query = new URLSearchParams(body).get("query") ?? "";
      return ok(query.includes("?ds a qb:DataSet") ? sparqlDatasets : sparqlObservations);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { impl, calls, state };
}

export async function syncedHub(opts: { failCkan?: boolean } = {}) {
  const fetcher = fakeFetch(opts);
  const hub = new Hub(openCatalogue(":memory:"), fetcher.impl, testSources);
  const reports = await hub.sync();
  return { hub, reports, calls: fetcher.calls, upstream: fetcher.state };
}
