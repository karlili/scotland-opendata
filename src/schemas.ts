import { z } from "zod";

const intParam = (def: number, max: number) => z.coerce.number().int().min(0).max(max).default(def);

export const AccessTypeSchema = z
  .enum(["api", "csv", "file"])
  .describe("api: live queryable endpoint; csv: CSV download only; file: other downloads");

export const SourceSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    publisher: z.string(),
    kind: z.enum(["ckan", "sparql", "dcat", "arcgis"]),
    base_url: z.string().describe("CKAN site root, SPARQL endpoint, DCAT-AP feed or ArcGIS search URL"),
    homepage: z.string(),
    council_id: z.string().nullable().describe("Set when the source is a council's own portal"),
    last_synced_at: z.string().nullable(),
    last_sync_error: z.string().nullable(),
    dataset_count: z.number().int(),
    resource_count: z.number().int(),
  })
  .meta({ ref: "Source" });

export const ProvisionSchema = z
  .enum(["portal", "landing-page", "none"])
  .describe(
    "portal: a data portal with a catalogue; landing-page: downloads or feeds on the council site; none: nothing on the council's own site (all councils still publish on Spatial Hub)",
  );

export const CouncilSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    gss: z.string().describe("GSS council area code, e.g. S12000036"),
    website: z.string(),
    provision: ProvisionSchema,
    open_data_url: z.string().nullable(),
    platform: z.string().nullable().describe("e.g. ArcGIS Hub, CKAN, USMART"),
    endpoints: z
      .array(z.object({ title: z.string(), url: z.string(), format: z.string() }))
      .describe("Feeds and services the hub tracks but does not harvest"),
    notes: z.string(),
    checked_at: z.string().describe("When the register entry was last checked"),
    source_ids: z.array(z.string()).describe("Hub sources harvested from the council's own portal"),
    dataset_count: z.number().int(),
  })
  .meta({ ref: "Council" });

export const CouncilListQuery = z.object({ provision: ProvisionSchema.optional() });

export const ResourceSchema = z
  .object({
    id: z.string().describe("Hub resource id, `<source>:<upstream id>`"),
    dataset_id: z.string(),
    source_id: z.string(),
    upstream_id: z.string(),
    name: z.string().nullable(),
    format: z.string().nullable(),
    url: z.string().nullable(),
    access_type: AccessTypeSchema,
    queryable: z.boolean().describe("True when rows can be fetched through /v1/resources/{id}/rows"),
  })
  .meta({ ref: "Resource" });

export const DatasetSchema = z
  .object({
    id: z.string().describe("Hub dataset id, `<source>:<name>`"),
    source_id: z.string(),
    name: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    publisher: z.string().nullable(),
    license: z.string().nullable(),
    tags: z.array(z.string()),
    modified: z.string().nullable(),
    upstream_url: z.string().describe("Where the hub read this dataset's metadata"),
    has_api: z.boolean(),
    has_csv: z.boolean(),
    resource_count: z.number().int(),
  })
  .meta({ ref: "Dataset" });

export const DatasetDetailSchema = DatasetSchema.extend({ resources: z.array(ResourceSchema) }).meta({
  ref: "DatasetDetail",
});

export const page = <T extends z.ZodType>(item: T) =>
  z.object({ total: z.number().int(), limit: z.number().int(), offset: z.number().int(), items: z.array(item) });

export const DatasetListQuery = z.object({
  q: z.string().optional().describe("Full-text search over title, description, tags and publisher"),
  source: z.string().optional(),
  has_api: z
    .enum(["true", "false", "any"])
    .default("true")
    .describe("Defaults to datasets with at least one API resource; `any` includes CSV-only datasets"),
  limit: intParam(25, 200),
  offset: intParam(0, 1_000_000),
});

export const ResourceListQuery = z.object({
  source: z.string().optional(),
  dataset: z.string().optional(),
  access: AccessTypeSchema.optional(),
  format: z.string().optional(),
  limit: intParam(50, 500),
  offset: intParam(0, 1_000_000),
});

export const RowsQuery = z.object({
  limit: intParam(100, 1000),
  offset: intParam(0, 10_000_000),
  q: z.string().optional().describe("Full-text search across the rows (CKAN datastore only)"),
  filters: z
    .string()
    .optional()
    .describe('JSON object of exact-match column filters, e.g. {"DateCode":2023} (CKAN datastore only)'),
  sort: z.string().optional().describe('e.g. "DateCode desc" (CKAN datastore only)'),
});

export const RowsSchema = z
  .object({
    resource_id: z.string(),
    fields: z.array(z.object({ id: z.string(), type: z.string() })),
    records: z.array(z.record(z.string(), z.unknown())),
    total: z.number().int().nullable(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .meta({ ref: "Rows" });

export const SparqlBody = z.object({ query: z.string().min(1).max(20_000) });

export const SparqlResultsSchema = z
  .object({
    head: z.object({ vars: z.array(z.string()) }),
    results: z.object({ bindings: z.array(z.record(z.string(), z.unknown())) }),
  })
  .meta({ ref: "SparqlResults" });

export const SyncReportSchema = z.object({
  source_id: z.string(),
  ok: z.boolean(),
  datasets: z.number().int().optional(),
  resources: z.number().int().optional(),
  error: z.string().optional(),
});

export const ErrorSchema = z.object({ error: z.string() }).meta({ ref: "Error" });
