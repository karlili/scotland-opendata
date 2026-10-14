import Database from "better-sqlite3";
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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL,
  homepage TEXT NOT NULL,
  last_synced_at TEXT,
  last_sync_error TEXT
);

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  publisher TEXT,
  license TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  modified TEXT,
  upstream_url TEXT NOT NULL,
  has_api INTEGER NOT NULL DEFAULT 0,
  has_csv INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS datasets_source ON datasets(source_id);
CREATE INDEX IF NOT EXISTS datasets_has_api ON datasets(has_api);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  upstream_id TEXT NOT NULL,
  name TEXT,
  format TEXT,
  url TEXT,
  access_type TEXT NOT NULL CHECK (access_type IN ('api', 'csv', 'file')),
  queryable INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS resources_dataset ON resources(dataset_id);
CREATE INDEX IF NOT EXISTS resources_access ON resources(access_type);

CREATE VIRTUAL TABLE IF NOT EXISTS datasets_fts USING fts5(
  dataset_id UNINDEXED, title, description, tags, publisher
);
`;

export function openCatalogue(path: string): Catalogue {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return new Catalogue(db);
}

type RawDataset = Omit<DatasetRow, "tags" | "has_api" | "has_csv"> & {
  tags: string;
  has_api: number;
  has_csv: number;
};
type RawResource = Omit<ResourceRow, "queryable"> & { queryable: number };

const toDataset = (r: RawDataset): DatasetRow => ({
  ...r,
  tags: JSON.parse(r.tags) as string[],
  has_api: r.has_api === 1,
  has_csv: r.has_csv === 1,
});
const toResource = (r: RawResource): ResourceRow => ({ ...r, queryable: r.queryable === 1 });

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

/** Turns free text into an FTS5 query that matches every word as a prefix. */
function ftsQuery(q: string): string | null {
  const terms = q.match(/[\p{L}\p{N}]+/gu);
  if (!terms) return null;
  return terms.map((t) => `"${t}"*`).join(" ");
}

const DATASET_COLUMNS = `
  d.id, d.source_id, d.name, d.title, d.description, d.publisher, d.license, d.tags,
  d.modified, d.upstream_url, d.has_api, d.has_csv,
  (SELECT COUNT(*) FROM resources r WHERE r.dataset_id = d.id) AS resource_count`;

export class Catalogue {
  constructor(readonly db: Database.Database) {}

  upsertSource(s: SourceDefinition): void {
    this.db
      .prepare(
        `INSERT INTO sources (id, title, publisher, kind, base_url, homepage)
         VALUES (@id, @title, @publisher, @kind, @baseUrl, @homepage)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, publisher = excluded.publisher,
           kind = excluded.kind, base_url = excluded.base_url, homepage = excluded.homepage`,
      )
      .run(s);
  }

  /** Atomically replaces everything held for one source with a fresh harvest. */
  replaceSourceContents(sourceId: string, datasets: DatasetInput[], syncedAt: string): void {
    const insertDataset = this.db.prepare(
      `INSERT INTO datasets (id, source_id, name, title, description, publisher, license, tags,
         modified, upstream_url, has_api, has_csv)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertResource = this.db.prepare(
      `INSERT OR REPLACE INTO resources (id, dataset_id, source_id, upstream_id, name, format, url,
         access_type, queryable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertFts = this.db.prepare(
      `INSERT INTO datasets_fts (dataset_id, title, description, tags, publisher) VALUES (?, ?, ?, ?, ?)`,
    );

    this.db.transaction(() => {
      this.db
        .prepare(`DELETE FROM datasets_fts WHERE dataset_id IN (SELECT id FROM datasets WHERE source_id = ?)`)
        .run(sourceId);
      this.db.prepare(`DELETE FROM resources WHERE source_id = ?`).run(sourceId);
      this.db.prepare(`DELETE FROM datasets WHERE source_id = ?`).run(sourceId);

      const seen = new Set<string>();
      for (const d of datasets) {
        const id = `${sourceId}:${d.name}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const hasApi = d.resources.some((r) => r.accessType === "api");
        const hasCsv = d.resources.some((r) => r.accessType === "csv");
        const tags = d.tags ?? [];
        insertDataset.run(
          id, sourceId, d.name, d.title, d.description ?? null, d.publisher ?? null,
          d.license ?? null, JSON.stringify(tags), d.modified ?? null, d.upstreamUrl,
          hasApi ? 1 : 0, hasCsv ? 1 : 0,
        );
        insertFts.run(id, d.title, d.description ?? "", tags.join(" "), d.publisher ?? "");
        for (const r of d.resources) {
          insertResource.run(
            `${sourceId}:${r.upstreamId}`, id, sourceId, r.upstreamId, r.name ?? null,
            r.format ?? null, r.url ?? null, r.accessType, r.queryable ? 1 : 0,
          );
        }
      }
      this.db
        .prepare(`UPDATE sources SET last_synced_at = ?, last_sync_error = NULL WHERE id = ?`)
        .run(syncedAt, sourceId);
    })();
  }

  recordSyncError(sourceId: string, error: string): void {
    this.db.prepare(`UPDATE sources SET last_sync_error = ? WHERE id = ?`).run(error, sourceId);
  }

  listSources(): SourceRow[] {
    return this.db
      .prepare(
        `SELECT s.*,
           (SELECT COUNT(*) FROM datasets d WHERE d.source_id = s.id) AS dataset_count,
           (SELECT COUNT(*) FROM resources r WHERE r.source_id = s.id) AS resource_count
         FROM sources s ORDER BY s.id`,
      )
      .all() as SourceRow[];
  }

  getSource(id: string): SourceRow | undefined {
    return this.listSources().find((s) => s.id === id);
  }

  searchDatasets(query: DatasetQuery): { total: number; items: DatasetRow[] } {
    const where: string[] = [];
    const params: Record<string, unknown> = { limit: query.limit, offset: query.offset };
    const match = query.q ? ftsQuery(query.q) : null;
    let from = "datasets d";
    let order = "d.title COLLATE NOCASE";
    if (match) {
      from = "datasets_fts f JOIN datasets d ON d.id = f.dataset_id";
      where.push("datasets_fts MATCH @match");
      params.match = match;
      order = "bm25(datasets_fts)";
    }
    if (query.source) {
      where.push("d.source_id = @source");
      params.source = query.source;
    }
    if (query.hasApi !== undefined) {
      where.push("d.has_api = @hasApi");
      params.hasApi = query.hasApi ? 1 : 0;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM ${from} ${whereSql}`)
      .get(params) as { total: number };
    const rows = this.db
      .prepare(`SELECT ${DATASET_COLUMNS} FROM ${from} ${whereSql} ORDER BY ${order} LIMIT @limit OFFSET @offset`)
      .all(params) as RawDataset[];
    return { total, items: rows.map(toDataset) };
  }

  getDataset(id: string): (DatasetRow & { resources: ResourceRow[] }) | undefined {
    const row = this.db.prepare(`SELECT ${DATASET_COLUMNS} FROM datasets d WHERE d.id = ?`).get(id) as
      | RawDataset
      | undefined;
    if (!row) return undefined;
    const resources = (
      this.db.prepare(`SELECT * FROM resources WHERE dataset_id = ? ORDER BY access_type, name`).all(id) as RawResource[]
    ).map(toResource);
    return { ...toDataset(row), resources };
  }

  listResources(query: ResourceQuery): { total: number; items: ResourceRow[] } {
    const where: string[] = [];
    const params: Record<string, unknown> = { limit: query.limit, offset: query.offset };
    if (query.source) {
      where.push("source_id = @source");
      params.source = query.source;
    }
    if (query.dataset) {
      where.push("dataset_id = @dataset");
      params.dataset = query.dataset;
    }
    if (query.access) {
      where.push("access_type = @access");
      params.access = query.access;
    }
    if (query.format) {
      where.push("UPPER(format) = UPPER(@format)");
      params.format = query.format;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { total } = this.db.prepare(`SELECT COUNT(*) AS total FROM resources ${whereSql}`).get(params) as {
      total: number;
    };
    const rows = this.db
      .prepare(`SELECT * FROM resources ${whereSql} ORDER BY id LIMIT @limit OFFSET @offset`)
      .all(params) as RawResource[];
    return { total, items: rows.map(toResource) };
  }

  getResource(id: string): ResourceRow | undefined {
    const row = this.db.prepare(`SELECT * FROM resources WHERE id = ?`).get(id) as RawResource | undefined;
    return row && toResource(row);
  }

  close(): void {
    this.db.close();
  }
}
