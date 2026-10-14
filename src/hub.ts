import type { Catalogue } from "./db/catalogue.ts";
import { CkanClient } from "./sources/ckan.ts";
import type { Fetch } from "./sources/http.ts";
import { sources as defaultSources, type SourceDefinition } from "./sources/registry.ts";
import { SparqlClient } from "./sources/sparql.ts";

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}

export interface RowQuery {
  limit: number;
  offset: number;
  q?: string;
  filters?: Record<string, unknown>;
  sort?: string;
}

export interface RowResult {
  resource_id: string;
  fields: { id: string; type: string }[];
  records: Record<string, unknown>[];
  total: number | null;
  limit: number;
  offset: number;
}

export interface SyncReport {
  source_id: string;
  ok: boolean;
  datasets?: number;
  resources?: number;
  error?: string;
}

/**
 * The hub's core: harvesting upstream catalogues into DuckDB and proxying
 * live queries. The REST API and the MCP server are thin layers over this.
 */
export class Hub {
  readonly sources: SourceDefinition[];

  private constructor(
    readonly catalogue: Catalogue,
    private readonly fetchImpl: Fetch,
    sources: SourceDefinition[],
  ) {
    this.sources = sources;
  }

  /** Builds a hub and registers its sources in the catalogue. */
  static async create(
    catalogue: Catalogue,
    fetchImpl: Fetch = fetch,
    sources: SourceDefinition[] = defaultSources,
  ): Promise<Hub> {
    for (const s of sources) await catalogue.upsertSource(s);
    return new Hub(catalogue, fetchImpl, sources);
  }

  private definition(sourceId: string): SourceDefinition {
    const def = this.sources.find((s) => s.id === sourceId);
    if (!def) throw new NotFoundError(`Unknown source: ${sourceId}`);
    return def;
  }

  private ckan(def: SourceDefinition) {
    return new CkanClient(def.baseUrl, this.fetchImpl);
  }

  private sparql(def: SourceDefinition) {
    return new SparqlClient(def.baseUrl, this.fetchImpl);
  }

  /** Re-harvests one source (or all). A failed source keeps its previous catalogue. */
  async sync(sourceId?: string): Promise<SyncReport[]> {
    const targets = sourceId ? [this.definition(sourceId)] : this.sources;
    const reports: SyncReport[] = [];
    for (const def of targets) {
      try {
        const datasets = def.kind === "ckan" ? await this.ckan(def).harvest() : await this.sparql(def).harvest();
        await this.catalogue.replaceSourceContents(def.id, datasets, new Date().toISOString());
        reports.push({
          source_id: def.id,
          ok: true,
          datasets: datasets.length,
          resources: datasets.reduce((n, d) => n + d.resources.length, 0),
        });
      } catch (err) {
        const message = (err as Error).message;
        await this.catalogue.recordSyncError(def.id, message);
        reports.push({ source_id: def.id, ok: false, error: message });
      }
    }
    return reports;
  }

  /** Proxies a row-level query to whichever upstream API backs the resource. */
  async queryResource(resourceId: string, query: RowQuery): Promise<RowResult> {
    const resource = await this.catalogue.getResource(resourceId);
    if (!resource) throw new NotFoundError(`Unknown resource: ${resourceId}`);
    if (!resource.queryable) {
      throw new BadRequestError(
        `Resource ${resourceId} is not queryable through the hub (access: ${resource.access_type}); fetch it from its url instead`,
      );
    }
    const def = this.definition(resource.source_id);
    if (def.kind === "ckan") {
      const result = await this.ckan(def).datastoreSearch(resource.upstream_id, query);
      return { resource_id: resourceId, ...result, limit: query.limit, offset: query.offset };
    }
    if (query.q || query.filters || query.sort) {
      throw new BadRequestError("q, filters and sort are not supported on SPARQL resources; use the sparql endpoint");
    }
    const result = await this.sparql(def).observations(resource.url ?? "", query);
    return { resource_id: resourceId, ...result, total: null, limit: query.limit, offset: query.offset };
  }

  /** Runs a raw SPARQL query against a SPARQL source. */
  async sparqlQuery(sourceId: string, query: string) {
    const def = this.definition(sourceId);
    if (def.kind !== "sparql") throw new BadRequestError(`Source ${sourceId} is not a SPARQL endpoint`);
    if (/^\s*(INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD)\b/im.test(query.replace(/#.*$/gm, ""))) {
      throw new BadRequestError("Only read queries are allowed");
    }
    return this.sparql(def).query(query);
  }
}
