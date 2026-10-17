import type { DatasetInput } from "../db/catalogue.ts";
import { classifyResource } from "./classify.ts";
import { fetchJson, UpstreamError, type Fetch } from "./http.ts";

interface CkanEnvelope<T> {
  success: boolean;
  result: T;
  error?: { message?: string; __type?: string };
}

interface CkanResource {
  id: string;
  name?: string | null;
  format?: string | null;
  url?: string | null;
  datastore_active?: boolean;
}

interface CkanPackage {
  id: string;
  name: string;
  title?: string | null;
  notes?: string | null;
  organization?: { title?: string | null } | null;
  license_title?: string | null;
  metadata_modified?: string | null;
  tags?: { name: string }[];
  resources?: CkanResource[];
}

export interface DatastoreQuery {
  limit: number;
  offset: number;
  q?: string;
  filters?: Record<string, unknown>;
  sort?: string;
  fields?: string[];
}

export interface DatastoreResult {
  fields: { id: string; type: string }[];
  records: Record<string, unknown>[];
  total: number | null;
}

const PAGE_SIZE = 1000;

/** Client for the standard CKAN Action API (/api/3/action/*). */
export class CkanClient {
  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private actionUrl(action: string, params: Record<string, string | number | undefined>): string {
    const url = new URL(`api/3/action/${action}`, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    return url.toString();
  }

  private async action<T>(action: string, params: Record<string, string | number | undefined>): Promise<T> {
    const body = await fetchJson<CkanEnvelope<T>>(this.fetchImpl, this.actionUrl(action, params));
    if (!body.success) {
      throw new UpstreamError(`CKAN ${action} failed: ${body.error?.message ?? body.error?.__type ?? "unknown error"}`);
    }
    return body.result;
  }

  /** Pages through package_search to harvest every public dataset. */
  async harvest(): Promise<DatasetInput[]> {
    const out: DatasetInput[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      const page = await this.action<{ count: number; results: CkanPackage[] }>("package_search", {
        rows: PAGE_SIZE,
        start,
      });
      out.push(...page.results.map((p) => this.toDataset(p)));
      if (page.results.length === 0 || start + page.results.length >= page.count) break;
    }
    return out;
  }

  toDataset(p: CkanPackage): DatasetInput {
    return {
      name: p.name,
      title: p.title || p.name,
      description: p.notes ?? null,
      publisher: p.organization?.title ?? null,
      license: p.license_title ?? null,
      tags: (p.tags ?? []).map((t) => t.name),
      modified: p.metadata_modified ?? null,
      upstreamUrl: this.actionUrl("package_show", { id: p.name }),
      resources: (p.resources ?? []).map((r) => ({
        upstreamId: r.id,
        name: r.name ?? null,
        format: r.format ?? null,
        url: r.url ?? null,
        ...classifyResource({ format: r.format, url: r.url, datastoreActive: r.datastore_active }),
      })),
    };
  }

  /** Row-level query against a datastore-backed resource. */
  async datastoreSearch(resourceId: string, query: DatastoreQuery): Promise<DatastoreResult> {
    const result = await this.action<{
      fields: { id: string; type: string }[];
      records: Record<string, unknown>[];
      total?: number;
    }>("datastore_search", {
      resource_id: resourceId,
      limit: query.limit,
      offset: query.offset,
      q: query.q,
      filters: query.filters ? JSON.stringify(query.filters) : undefined,
      sort: query.sort,
      fields: query.fields?.join(","),
    });
    return {
      fields: result.fields.filter((f) => f.id !== "_id"),
      records: result.records,
      total: result.total ?? null,
    };
  }
}
