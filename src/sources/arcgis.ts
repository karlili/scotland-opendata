import type { AccessType, DatasetInput } from "../db/catalogue.ts";
import { fetchJson, UpstreamError, type Fetch } from "./http.ts";

interface ArcgisItem {
  id: string;
  attributes?: {
    name?: string | null;
    title?: string | null;
    source?: string | null;
    owner?: string | null;
    description?: string | null;
    searchDescription?: string | null;
    snippet?: string | null;
    licenseInfo?: string | null;
    modified?: number | null;
    type?: string | null;
    tags?: string[] | null;
    url?: string | null;
  };
  links?: { itemPage?: string | null; siteUrl?: string | null };
}

interface ArcgisSearchPage {
  data?: ArcgisItem[];
  meta?: { next?: string | null };
}

/** ArcGIS item types that are live, queryable services. */
const SERVICE_TYPES = new Set([
  "FEATURE SERVICE", "FEATURE LAYER", "MAP SERVICE", "IMAGE SERVICE", "TABLE",
  "VECTOR TILE SERVICE", "WFS", "WMS", "WMTS", "OGCFEATURESERVER",
]);

const MAX_PAGES = 200;

/**
 * Harvests the ArcGIS Hub search API (`opendata.arcgis.com/api/v3/search`)
 * for a query such as `catalog[groupIds]=any(<group>)`, the way councils
 * without their own Hub feed share their open data groups.
 */
export class ArcgisSearchClient {
  constructor(
    readonly searchUrl: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async harvest(): Promise<DatasetInput[]> {
    const out: DatasetInput[] = [];
    let url: string | null | undefined = this.searchUrl;
    for (let page = 0; url; page++) {
      if (page === MAX_PAGES) throw new UpstreamError(`ArcGIS search did not finish after ${MAX_PAGES} pages`);
      const body: ArcgisSearchPage = await fetchJson<ArcgisSearchPage>(this.fetchImpl, url);
      if (!Array.isArray(body.data)) throw new UpstreamError(`${new URL(url).host} did not return ArcGIS search results`);
      out.push(...body.data.map((item) => this.toDataset(item)));
      url = body.meta?.next;
    }
    return out;
  }

  toDataset(item: ArcgisItem): DatasetInput {
    const a = item.attributes ?? {};
    const itemPage = item.links?.itemPage ?? `https://www.arcgis.com/home/item.html?id=${item.id}`;
    const type = a.type ?? null;
    const upper = (type ?? "").toUpperCase();
    const accessType: AccessType = SERVICE_TYPES.has(upper) ? "api" : upper === "CSV" ? "csv" : "file";
    return {
      name: item.id,
      title: a.title || a.name || item.id,
      description: a.searchDescription || a.snippet || a.description || null,
      publisher: a.source ?? a.owner ?? null,
      license: a.licenseInfo ? a.licenseInfo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null : null,
      tags: a.tags ?? [],
      modified: typeof a.modified === "number" ? new Date(a.modified).toISOString() : null,
      upstreamUrl: itemPage,
      resources: [
        {
          upstreamId: item.id,
          name: a.title || a.name || null,
          format: type,
          url: a.url || itemPage,
          accessType,
          queryable: false,
        },
      ],
    };
  }
}
