import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { describeRoute, openAPIRouteHandler, resolver, validator } from "hono-openapi";
import type { z } from "zod";
import { BadRequestError, NotFoundError, type Hub } from "./hub.ts";
import { mountMcp } from "./mcp/http.ts";
import {
  DatasetDetailSchema,
  DatasetListQuery,
  DatasetSchema,
  ErrorSchema,
  ResourceListQuery,
  ResourceSchema,
  RowsQuery,
  RowsSchema,
  SourceSchema,
  SparqlBody,
  SparqlResultsSchema,
  SyncReportSchema,
  page,
} from "./schemas.ts";
import { UpstreamError } from "./sources/http.ts";

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { "application/json": { schema: resolver(schema) } },
});
const notFound = json(ErrorSchema, "Not found");
const badGateway = json(ErrorSchema, "The upstream portal failed");

export function createApp(hub: Hub, opts: { adminToken?: string } = {}) {
  const app = new Hono();
  app.use("*", cors());

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof BadRequestError) return c.json({ error: err.message }, 400);
    if (err instanceof UpstreamError) return c.json({ error: err.message }, 502);
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  const v1 = new Hono();

  v1.get(
    "/sources",
    describeRoute({
      tags: ["Catalogue"],
      summary: "List upstream portals",
      responses: { 200: json(SourceSchema.array(), "Sources the hub harvests") },
    }),
    async (c) => c.json(await hub.catalogue.listSources()),
  );

  v1.get(
    "/sources/:id",
    describeRoute({
      tags: ["Catalogue"],
      summary: "Get one upstream portal",
      responses: { 200: json(SourceSchema, "The source"), 404: notFound },
    }),
    async (c) => {
      const source = await hub.catalogue.getSource(c.req.param("id"));
      if (!source) throw new NotFoundError(`Unknown source: ${c.req.param("id")}`);
      return c.json(source);
    },
  );

  v1.post(
    "/sources/:id/sparql",
    describeRoute({
      tags: ["Proxy"],
      summary: "Run a read-only SPARQL query against a SPARQL source",
      description: "Passes the query through to the upstream endpoint (e.g. statistics.gov.scot) and returns SPARQL JSON results.",
      responses: {
        200: json(SparqlResultsSchema, "SPARQL 1.1 JSON results"),
        400: json(ErrorSchema, "Not a SPARQL source, or a write query"),
        404: notFound,
        502: badGateway,
      },
    }),
    validator("json", SparqlBody),
    async (c) => c.json(await hub.sparqlQuery(c.req.param("id"), c.req.valid("json").query)),
  );

  v1.get(
    "/datasets",
    describeRoute({
      tags: ["Catalogue"],
      summary: "Search datasets",
      description: "Served from the local DuckDB catalogue. By default only datasets with API access are returned.",
      responses: { 200: json(page(DatasetSchema), "A page of datasets") },
    }),
    validator("query", DatasetListQuery),
    async (c) => {
      const q = c.req.valid("query");
      const result = await hub.catalogue.searchDatasets({
        q: q.q,
        source: q.source,
        hasApi: q.has_api === "any" ? undefined : q.has_api === "true",
        limit: q.limit,
        offset: q.offset,
      });
      return c.json({ ...result, limit: q.limit, offset: q.offset });
    },
  );

  v1.get(
    "/datasets/:id",
    describeRoute({
      tags: ["Catalogue"],
      summary: "Get a dataset with its resources",
      responses: { 200: json(DatasetDetailSchema, "The dataset"), 404: notFound },
    }),
    async (c) => {
      const dataset = await hub.catalogue.getDataset(c.req.param("id"));
      if (!dataset) throw new NotFoundError(`Unknown dataset: ${c.req.param("id")}`);
      return c.json(dataset);
    },
  );

  v1.get(
    "/resources",
    describeRoute({
      tags: ["Catalogue"],
      summary: "List tracked endpoints and downloads",
      description: "Every API endpoint and CSV/file download the hub knows about, filterable by access type.",
      responses: { 200: json(page(ResourceSchema), "A page of resources") },
    }),
    validator("query", ResourceListQuery),
    async (c) => {
      const q = c.req.valid("query");
      return c.json({ ...(await hub.catalogue.listResources(q)), limit: q.limit, offset: q.offset });
    },
  );

  v1.get(
    "/resources/:id",
    describeRoute({
      tags: ["Catalogue"],
      summary: "Get one resource",
      responses: { 200: json(ResourceSchema, "The resource"), 404: notFound },
    }),
    async (c) => {
      const resource = await hub.catalogue.getResource(c.req.param("id"));
      if (!resource) throw new NotFoundError(`Unknown resource: ${c.req.param("id")}`);
      return c.json(resource);
    },
  );

  v1.get(
    "/resources/:id/rows",
    describeRoute({
      tags: ["Proxy"],
      summary: "Query rows from a queryable resource",
      description:
        "Proxies to the upstream API: CKAN datastore_search for data.gov.scot, an observation query for statistics.gov.scot data cubes.",
      responses: {
        200: json(RowsSchema, "Rows"),
        400: json(ErrorSchema, "Resource is not queryable, or bad parameters"),
        404: notFound,
        502: badGateway,
      },
    }),
    validator("query", RowsQuery),
    async (c) => {
      const q = c.req.valid("query");
      let filters: Record<string, unknown> | undefined;
      if (q.filters) {
        try {
          filters = JSON.parse(q.filters);
        } catch {
          throw new BadRequestError("filters must be a JSON object");
        }
        if (typeof filters !== "object" || filters === null || Array.isArray(filters)) {
          throw new BadRequestError("filters must be a JSON object");
        }
      }
      return c.json(
        await hub.queryResource(c.req.param("id"), { limit: q.limit, offset: q.offset, q: q.q, sort: q.sort, filters }),
      );
    },
  );

  v1.post(
    "/admin/sync",
    describeRoute({
      tags: ["Admin"],
      summary: "Re-harvest upstream catalogues",
      description: "Requires `Authorization: Bearer $ADMIN_TOKEN`. Disabled when ADMIN_TOKEN is unset.",
      responses: { 200: json(SyncReportSchema.array(), "One report per source"), 401: json(ErrorSchema, "Unauthorised") },
    }),
    async (c) => {
      if (!opts.adminToken || c.req.header("authorization") !== `Bearer ${opts.adminToken}`) {
        return c.json({ error: "Unauthorised" }, 401);
      }
      return c.json(await hub.sync(c.req.query("source")));
    },
  );

  app.route("/v1", v1);
  mountMcp(app, hub);

  app.get(
    "/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "Scotland Open Data Hub",
          version: "0.1.0",
          description:
            "One REST API over Scottish public sector open data portals. The catalogue is served from DuckDB; row queries are proxied live to the upstream API.",
        },
        servers: [{ url: "/" }],
      },
    }),
  );
  app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "Scotland Open Data Hub" }));

  return app;
}
