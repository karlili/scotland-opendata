import { DuckDBInstance, LIST, VARCHAR, type DuckDBConnection, type DuckDBValue } from "@duckdb/node-api";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { SourceDefinition, SourceKind } from "../sources/registry.ts";

/**
 * How a resource can be reached:
 * - api:  a live, queryable endpoint (CKAN datastore, SPARQL, JSON/GeoJSON/WFS service)
 * - csv:  a CSV download only
 * - file: any other download (XLSX, PDF, ZIP, ...)
 */
export type AccessType = "api" | "csv" | "file";

export interface SourceRow {
  id: string;
  title: string;
  publisher: string;
  kind: SourceKind;
  base_url: string;
  homepage: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  dataset_count: number;
  resource_count: number;
}

export interface DatasetRow {
  id: string;
  source_id: string;
  name: string;
  title: string;
  description: string | null;
  publisher: string | null;
  license: string | null;
  tags: string[];
  modified: string | null;
  upstream_url: string;
  has_api: boolean;
  has_csv: boolean;
  resource_count: number;
}

export interface ResourceRow {
  id: string;
  dataset_id: string;
  source_id: string;
  upstream_id: string;
  name: string | null;
  format: string | null;
  url: string | null;
  access_type: AccessType;
  /** True when the hub can proxy row-level queries for this resource. */
  queryable: boolean;
}

export interface DatasetInput {
  name: string;
  title: string;
  description?: string | null;
  publisher?: string | null;
  license?: string | null;
  tags?: string[];
  modified?: string | null;
  upstreamUrl: string;
  resources: ResourceInput[];
}

export interface ResourceInput {
  upstreamId: string;
  name?: string | null;
  format?: string | null;
  url?: string | null;
  accessType: AccessType;
  queryable: boolean;
}

// No foreign keys: DuckDB's FK checks make the delete-then-reload in
// replaceSourceContents awkward, and that method is the only writer.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id VARCHAR PRIMARY KEY,
  title VARCHAR NOT NULL,
  publisher VARCHAR NOT NULL,
  kind VARCHAR NOT NULL,
  base_url VARCHAR NOT NULL,
  homepage VARCHAR NOT NULL,
  last_synced_at VARCHAR,
  last_sync_error VARCHAR
);

CREATE TABLE IF NOT EXISTS datasets (
  id VARCHAR PRIMARY KEY,
  source_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  description VARCHAR,
  publisher VARCHAR,
  license VARCHAR,
  tags VARCHAR[] NOT NULL,
  modified VARCHAR,
  upstream_url VARCHAR NOT NULL,
  has_api BOOLEAN NOT NULL,
  has_csv BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  id VARCHAR PRIMARY KEY,
  dataset_id VARCHAR NOT NULL,
  source_id VARCHAR NOT NULL,
  upstream_id VARCHAR NOT NULL,
  name VARCHAR,
  format VARCHAR,
  url VARCHAR,
  access_type VARCHAR NOT NULL CHECK (access_type IN ('api', 'csv', 'file')),
  queryable BOOLEAN NOT NULL
);
`;

export async function openCatalogue(path: string): Promise<Catalogue> {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const instance = await DuckDBInstance.create(path);
  const conn = await instance.connect();
  await conn.run(SCHEMA);
  return new Catalogue(instance, conn);
}

export interface DatasetQuery {
  q?: string;
  source?: string;
  /** true: datasets with at least one API resource; false: without; undefined: all. */
  hasApi?: boolean;
  limit: number;
  offset: number;
}

export interface ResourceQuery {
  source?: string;
  dataset?: string;
  access?: AccessType;
  format?: string;
  limit: number;
  offset: number;
}

const DATASET_COLUMNS = `
  d.id, d.source_id, d.name, d.title, d.description, d.publisher, d.license, d.tags,
  d.modified, d.upstream_url, d.has_api, d.has_csv,
  (SELECT COUNT(*) FROM resources r WHERE r.dataset_id = d.id)::INTEGER AS resource_count`;

const opt = (v: string | null | undefined, append: (s: string) => void, appendNull: () => void) =>
  v == null ? appendNull() : append(v);

export class Catalogue {
  constructor(
    private readonly instance: DuckDBInstance,
    private readonly conn: DuckDBConnection,
  ) {}

  private async all<T>(sql: string, params: Record<string, DuckDBValue> = {}): Promise<T[]> {
    const reader = await this.conn.runAndReadAll(sql, params);
    return reader.getRowObjectsJson() as T[];
  }

  async upsertSource(s: SourceDefinition): Promise<void> {
    await this.conn.run(
      `INSERT INTO sources (id, title, publisher, kind, base_url, homepage)
       VALUES ($id, $title, $publisher, $kind, $baseUrl, $homepage)
       ON CONFLICT (id) DO UPDATE SET title = excluded.title, publisher = excluded.publisher,
         kind = excluded.kind, base_url = excluded.base_url, homepage = excluded.homepage`,
      { id: s.id, title: s.title, publisher: s.publisher, kind: s.kind, baseUrl: s.baseUrl, homepage: s.homepage },
    );
  }

  /**
   * Atomically replaces everything held for one source with a fresh harvest.
   * Runs on its own connection so readers keep seeing the old catalogue
   * until the transaction commits.
   */
  async replaceSourceContents(sourceId: string, datasets: DatasetInput[], syncedAt: string): Promise<void> {
    const conn = await this.instance.connect();
    try {
      await conn.run("BEGIN TRANSACTION");
      try {
        await conn.run(`DELETE FROM resources WHERE source_id = $s`, { s: sourceId });
        await conn.run(`DELETE FROM datasets WHERE source_id = $s`, { s: sourceId });

        const ds = await conn.createAppender("datasets");
        const rs = await conn.createAppender("resources");
        const seenDatasets = new Set<string>();
        const seenResources = new Set<string>();
        for (const d of datasets) {
          const id = `${sourceId}:${d.name}`;
          if (seenDatasets.has(id)) continue;
          seenDatasets.add(id);
          ds.appendVarchar(id);
          ds.appendVarchar(sourceId);
          ds.appendVarchar(d.name);
          ds.appendVarchar(d.title);
          opt(d.description, (v) => ds.appendVarchar(v), () => ds.appendNull());
          opt(d.publisher, (v) => ds.appendVarchar(v), () => ds.appendNull());
          opt(d.license, (v) => ds.appendVarchar(v), () => ds.appendNull());
          ds.appendList(d.tags ?? [], LIST(VARCHAR));
          opt(d.modified, (v) => ds.appendVarchar(v), () => ds.appendNull());
          ds.appendVarchar(d.upstreamUrl);
          ds.appendBoolean(d.resources.some((r) => r.accessType === "api"));
          ds.appendBoolean(d.resources.some((r) => r.accessType === "csv"));
          ds.endRow();

          for (const r of d.resources) {
            const rid = `${sourceId}:${r.upstreamId}`;
            if (seenResources.has(rid)) continue;
            seenResources.add(rid);
            rs.appendVarchar(rid);
            rs.appendVarchar(id);
            rs.appendVarchar(sourceId);
            rs.appendVarchar(r.upstreamId);
            opt(r.name, (v) => rs.appendVarchar(v), () => rs.appendNull());
            opt(r.format, (v) => rs.appendVarchar(v), () => rs.appendNull());
            opt(r.url, (v) => rs.appendVarchar(v), () => rs.appendNull());
            rs.appendVarchar(r.accessType);
            rs.appendBoolean(r.queryable);
            rs.endRow();
          }
        }
        ds.closeSync();
        rs.closeSync();

        await conn.run(`UPDATE sources SET last_synced_at = $at, last_sync_error = NULL WHERE id = $s`, {
          at: syncedAt,
          s: sourceId,
        });
        await conn.run("COMMIT");
      } catch (err) {
        await conn.run("ROLLBACK");
        throw err;
      }
    } finally {
      conn.closeSync();
    }
  }

  async recordSyncError(sourceId: string, error: string): Promise<void> {
    await this.conn.run(`UPDATE sources SET last_sync_error = $e WHERE id = $s`, { e: error, s: sourceId });
  }

  private sourcesSql(where = "") {
    return `SELECT s.*,
        (SELECT COUNT(*) FROM datasets d WHERE d.source_id = s.id)::INTEGER AS dataset_count,
        (SELECT COUNT(*) FROM resources r WHERE r.source_id = s.id)::INTEGER AS resource_count
      FROM sources s ${where} ORDER BY s.id`;
  }

  listSources(): Promise<SourceRow[]> {
    return this.all<SourceRow>(this.sourcesSql());
  }

  async getSource(id: string): Promise<SourceRow | undefined> {
    return (await this.all<SourceRow>(this.sourcesSql("WHERE s.id = $id"), { id }))[0];
  }

  /**
   * Every search word must appear somewhere in the title, description,
   * tags or publisher (case-insensitive). Title hits rank first.
   */
  async searchDatasets(query: DatasetQuery): Promise<{ total: number; items: DatasetRow[] }> {
    const where: string[] = [];
    const params: Record<string, DuckDBValue> = {};
    const terms = query.q?.match(/[\p{L}\p{N}]+/gu) ?? [];
    const titleHits: string[] = [];
    terms.forEach((t, i) => {
      params[`t${i}`] = `%${t}%`;
      where.push(
        `concat_ws(' ', d.title, d.description, array_to_string(d.tags, ' '), d.publisher) ILIKE $t${i}`,
      );
      titleHits.push(`(d.title ILIKE $t${i})::INTEGER`);
    });
    if (query.source) {
      where.push("d.source_id = $source");
      params.source = query.source;
    }
    if (query.hasApi !== undefined) {
      where.push("d.has_api = $hasApi");
      params.hasApi = query.hasApi;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const order = titleHits.length ? `${titleHits.join(" + ")} DESC, lower(d.title)` : "lower(d.title)";
    const [{ total } = { total: 0 }] = await this.all<{ total: number }>(
      `SELECT COUNT(*)::INTEGER AS total FROM datasets d ${whereSql}`,
      params,
    );
    const items = await this.all<DatasetRow>(
      `SELECT ${DATASET_COLUMNS} FROM datasets d ${whereSql} ORDER BY ${order}, d.id
       LIMIT ${Math.trunc(query.limit)} OFFSET ${Math.trunc(query.offset)}`,
      params,
    );
    return { total, items };
  }

  async getDataset(id: string): Promise<(DatasetRow & { resources: ResourceRow[] }) | undefined> {
    const [row] = await this.all<DatasetRow>(`SELECT ${DATASET_COLUMNS} FROM datasets d WHERE d.id = $id`, { id });
    if (!row) return undefined;
    const resources = await this.all<ResourceRow>(
      `SELECT * FROM resources WHERE dataset_id = $id ORDER BY access_type, name, id`,
      { id },
    );
    return { ...row, resources };
  }

  async listResources(query: ResourceQuery): Promise<{ total: number; items: ResourceRow[] }> {
    const where: string[] = [];
    const params: Record<string, DuckDBValue> = {};
    if (query.source) {
      where.push("source_id = $source");
      params.source = query.source;
    }
    if (query.dataset) {
      where.push("dataset_id = $dataset");
      params.dataset = query.dataset;
    }
    if (query.access) {
      where.push("access_type = $access");
      params.access = query.access;
    }
    if (query.format) {
      where.push("upper(format) = upper($format)");
      params.format = query.format;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [{ total } = { total: 0 }] = await this.all<{ total: number }>(
      `SELECT COUNT(*)::INTEGER AS total FROM resources ${whereSql}`,
      params,
    );
    const items = await this.all<ResourceRow>(
      `SELECT * FROM resources ${whereSql} ORDER BY id LIMIT ${Math.trunc(query.limit)} OFFSET ${Math.trunc(query.offset)}`,
      params,
    );
    return { total, items };
  }

  async getResource(id: string): Promise<ResourceRow | undefined> {
    return (await this.all<ResourceRow>(`SELECT * FROM resources WHERE id = $id`, { id }))[0];
  }

  close(): void {
    this.conn.closeSync();
    this.instance.closeSync();
  }
}
