import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Hub } from "../hub.ts";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const failure = (err: unknown) => ({ content: [{ type: "text" as const, text: (err as Error).message }], isError: true });

/** MCP server exposing the same catalogue lookups and proxies as the REST API. */
export function createMcpServer(hub: Hub): McpServer {
  const server = new McpServer({ name: "scotland-opendata", version: "0.1.0" });
  const readOnly = { readOnlyHint: true, openWorldHint: true };

  server.registerTool(
    "list_sources",
    {
      title: "List data portals",
      description: "List the Scottish open data portals the hub harvests, with dataset counts and last sync time.",
      annotations: readOnly,
    },
    async () => text(hub.catalogue.listSources()),
  );

  server.registerTool(
    "search_datasets",
    {
      title: "Search datasets",
      description:
        "Full-text search of the Scottish open data catalogue. By default returns only datasets with API access; set include_csv_only to also see datasets that are CSV downloads only.",
      inputSchema: {
        query: z.string().optional().describe("Words to search for, e.g. 'population estimates council'"),
        source: z.string().optional().describe("Restrict to one source id, e.g. data-gov-scot"),
        include_csv_only: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: readOnly,
    },
    async ({ query, source, include_csv_only, limit, offset }) =>
      text(
        hub.catalogue.searchDatasets({
          q: query,
          source,
          hasApi: include_csv_only ? undefined : true,
          limit,
          offset,
        }),
      ),
  );

  server.registerTool(
    "get_dataset",
    {
      title: "Get dataset",
      description: "Get a dataset's metadata and all of its resources (API endpoints and downloads).",
      inputSchema: { dataset_id: z.string().describe("Hub dataset id, e.g. data-gov-scot:population-estimates") },
      annotations: readOnly,
    },
    async ({ dataset_id }) => {
      const dataset = hub.catalogue.getDataset(dataset_id);
      return dataset ? text(dataset) : failure(new Error(`Unknown dataset: ${dataset_id}`));
    },
  );

  server.registerTool(
    "query_resource",
    {
      title: "Query resource rows",
      description:
        "Fetch rows from a queryable resource (queryable: true in get_dataset). For data.gov.scot datastore resources, q, filters and sort are supported.",
      inputSchema: {
        resource_id: z.string(),
        limit: z.number().int().min(1).max(1000).default(50),
        offset: z.number().int().min(0).default(0),
        q: z.string().optional().describe("Full-text search across rows"),
        filters: z.record(z.string(), z.unknown()).optional().describe("Exact-match column filters"),
        sort: z.string().optional().describe('e.g. "DateCode desc"'),
      },
      annotations: readOnly,
    },
    async ({ resource_id, ...query }) => {
      try {
        return text(await hub.queryResource(resource_id, query));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    "run_sparql",
    {
      title: "Run SPARQL query",
      description:
        "Run a read-only SPARQL 1.1 query against a SPARQL source such as statistics-gov-scot, which publishes statistics as RDF Data Cubes.",
      inputSchema: {
        source_id: z.string().default("statistics-gov-scot"),
        query: z.string().max(20_000),
      },
      annotations: readOnly,
    },
    async ({ source_id, query }) => {
      try {
        return text(await hub.sparqlQuery(source_id, query));
      } catch (err) {
        return failure(err);
      }
    },
  );

  return server;
}
