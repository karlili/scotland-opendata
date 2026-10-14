import type { AccessType } from "../db/catalogue.ts";

const API_FORMATS = new Set([
  "API", "JSON", "GEOJSON", "XML", "RDF", "JSON-LD", "SPARQL", "ODATA",
  "WMS", "WFS", "WMTS", "ESRI REST", "ARCGIS", "ARCGIS REST", "OGC API",
]);
const API_URL = /\/api\/|\/rest\/services\/|[?&]service=(wms|wfs)\b|\/(wms|wfs|ows)\b|\/sparql\b/i;

/**
 * Decides how a portal resource can be reached. CKAN datastore resources
 * are always API-queryable; otherwise the declared format wins, then the URL
 * decides (so a CSV dump served under /api/ still counts as a CSV).
 */
export function classifyResource(input: {
  format?: string | null;
  url?: string | null;
  datastoreActive?: boolean;
}): { accessType: AccessType; queryable: boolean } {
  if (input.datastoreActive) return { accessType: "api", queryable: true };
  const format = (input.format ?? "").trim().toUpperCase().replace(/^\./, "");
  const url = input.url ?? "";
  if (API_FORMATS.has(format)) return { accessType: "api", queryable: false };
  if (format === "CSV" || /\.csv(\?|$)/i.test(url)) return { accessType: "csv", queryable: false };
  if (API_URL.test(url)) return { accessType: "api", queryable: false };
  return { accessType: "file", queryable: false };
}
