export type SourceKind = "ckan" | "sparql";

export interface SourceDefinition {
  id: string;
  title: string;
  publisher: string;
  kind: SourceKind;
  /** CKAN: site root that serves /api/3/action. SPARQL: the query endpoint. */
  baseUrl: string;
  homepage: string;
}

/**
 * Upstream portals the hub harvests. Adding a council that runs CKAN or a
 * SPARQL endpoint is a new entry here; base URLs can be overridden by env
 * var so a moved endpoint doesn't need a code change.
 */
export const sources: SourceDefinition[] = [
  {
    id: "data-gov-scot",
    title: "data.gov.scot",
    publisher: "Scottish Government",
    kind: "ckan",
    baseUrl: process.env.DATA_GOV_SCOT_CKAN_URL ?? "https://api.data.gov.scot",
    homepage: "https://data.gov.scot/data",
  },
  {
    id: "statistics-gov-scot",
    title: "statistics.gov.scot",
    publisher: "Scottish Government",
    kind: "sparql",
    baseUrl: process.env.STATISTICS_GOV_SCOT_SPARQL_URL ?? "https://statistics.gov.scot/sparql",
    homepage: "https://statistics.gov.scot",
  },
];

export function getSourceDefinition(id: string): SourceDefinition | undefined {
  return sources.find((s) => s.id === id);
}
