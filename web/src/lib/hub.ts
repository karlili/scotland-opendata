import { createServerFn } from "@tanstack/react-start";
import createClient from "openapi-fetch";
import { z } from "zod";
import type { components, paths } from "./hub-api";

// Every call to the hub goes through a server function, so the hub URL stays
// server-side and the browser never needs CORS access to it.

export type Source = components["schemas"]["Source"];
export type Council = components["schemas"]["Council"];
export type Dataset = components["schemas"]["Dataset"];
export type DatasetDetail = components["schemas"]["DatasetDetail"];
export type Resource = components["schemas"]["Resource"];
/** JSON as it crosses the server function boundary. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Rows = Omit<components["schemas"]["Rows"], "records"> & { records: Record<string, Json>[] };
export type Provision = Council["provision"];
export type AccessType = Resource["access_type"];

const hubUrl = () => (process.env.HUB_URL ?? "http://localhost:8787").replace(/\/$/, "");

const client = () => createClient<paths>({ baseUrl: hubUrl() });

/** Turns a hub error body into a message the error boundary can show. */
function fail(status: number, error: unknown): never {
  const message =
    error && typeof error === "object" && "error" in error && typeof error.error === "string"
      ? error.error
      : `The hub answered ${status}`;
  throw new Error(message);
}

/** Returns the body, null on 404 (the route turns that into notFound()), and throws on anything else. */
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T | null {
  if (result.response.status === 404) return null;
  if (result.data === undefined) fail(result.response.status, result.error);
  return result.data;
}

function unreachable(err: unknown): never {
  if (err instanceof TypeError) {
    throw new Error(`Can't reach the hub at ${hubUrl()}. Is it running? (${err.message})`);
  }
  throw err;
}

const id = z.object({ id: z.string().min(1) });

export const getConfig = createServerFn({ method: "GET" }).handler(async () => ({
  // The hub's own URL for links the browser follows (API docs, raw JSON).
  publicHubUrl: (process.env.HUB_PUBLIC_URL ?? hubUrl()).replace(/\/$/, ""),
}));

export const listSources = createServerFn({ method: "GET" }).handler(async () =>
  unwrap(await client().GET("/v1/sources").catch(unreachable)) ?? [],
);

export const getSource = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) =>
    unwrap(await client().GET("/v1/sources/{id}", { params: { path: data } }).catch(unreachable)),
  );

export const listCouncils = createServerFn({ method: "GET" })
  .validator(z.object({ provision: z.enum(["portal", "landing-page", "none"]).optional() }))
  .handler(
    async ({ data }) =>
      unwrap(await client().GET("/v1/councils", { params: { query: data } }).catch(unreachable)) ?? [],
  );

export const getCouncil = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) =>
    unwrap(await client().GET("/v1/councils/{id}", { params: { path: data } }).catch(unreachable)),
  );

export const DatasetSearch = z.object({
  q: z.string().optional(),
  source: z.string().optional(),
  has_api: z.enum(["true", "false", "any"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const searchDatasets = createServerFn({ method: "GET" })
  .validator(DatasetSearch)
  .handler(async ({ data }) => {
    const page = unwrap(await client().GET("/v1/datasets", { params: { query: data } }).catch(unreachable));
    return page ?? { total: 0, limit: data.limit ?? 25, offset: data.offset ?? 0, items: [] };
  });

export const getDataset = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) =>
    unwrap(await client().GET("/v1/datasets/{id}", { params: { path: data } }).catch(unreachable)),
  );

export const getResource = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) =>
    unwrap(await client().GET("/v1/resources/{id}", { params: { path: data } }).catch(unreachable)),
  );

export const RowsSearch = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
  q: z.string().optional(),
  sort: z.string().optional(),
  filters: z.string().optional(),
});

export const queryRows = createServerFn({ method: "GET" })
  .validator(id.extend(RowsSearch.shape))
  .handler(async ({ data: { id, ...query } }) => {
    // A failed upstream query is shown inside the page rather than replacing it,
    // so the user can still see the resource and follow its download link.
    try {
      const result = await client().GET("/v1/resources/{id}/rows", { params: { path: { id }, query } });
      if (result.data) return { ok: true as const, rows: result.data as Rows };
      const error = result.error as { error?: unknown } | undefined;
      return {
        ok: false as const,
        status: result.response.status,
        error: typeof error?.error === "string" ? error.error : `The hub answered ${result.response.status}`,
      };
    } catch (err) {
      return { ok: false as const, status: 0, error: `Can't reach the hub at ${hubUrl()}: ${String(err)}` };
    }
  });
