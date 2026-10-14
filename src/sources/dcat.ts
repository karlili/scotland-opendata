import type { DatasetInput } from "../db/catalogue.ts";
import { classifyResource } from "./classify.ts";
import { fetchJson, UpstreamError, type Fetch } from "./http.ts";

type Ref = string | { "@id"?: string } | null | undefined;
type Text = string | { "@value"?: string } | null | undefined;

interface DcatDistribution {
  "dct:title"?: Text;
  "dct:description"?: Text;
  "dct:format"?: Ref | Text;
  "dcat:mediaType"?: Ref | Text;
  "dcat:accessURL"?: Ref;
  "dcat:downloadURL"?: Ref;
}

interface DcatDataset {
  "@id"?: string;
  "dct:identifier"?: Text;
  "dct:title"?: Text;
  "dct:description"?: Text;
  "dct:publisher"?: { "foaf:name"?: Text } | null;
  "dct:license"?: Ref | Text;
  "dct:modified"?: Text;
  "dcat:keyword"?: string | string[];
  "dcat:landingPage"?: Ref;
  "dcat:distribution"?: DcatDistribution | DcatDistribution[];
}

interface DcatCatalog {
  "dcat:dataset"?: DcatDataset[];
}

const str = (v: Ref | Text): string | null => {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return ("@id" in v ? v["@id"] : undefined) ?? ("@value" in v ? v["@value"] : undefined) ?? null;
};

const list = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** ArcGIS Hub lists the dataset's own landing page as a distribution; it is not a resource. */
const LANDING_PAGE_TITLES = new Set(["ARCGIS HUB DATASET"]);

/** Hub titles for distributions that are live services rather than downloads. */
const SERVICE_TITLES = new Set(["ARCGIS GEOSERVICE", "OGC WMS", "OGC WFS", "OGC API FEATURES"]);

/**
 * Harvests a DCAT-AP catalogue served as JSON-LD, such as the
 * `/api/feed/dcat-ap/2.0.1.json` feed every ArcGIS Hub site publishes.
 * The whole catalogue comes back in one response.
 */
export class DcatClient {
  constructor(
    readonly feedUrl: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async harvest(): Promise<DatasetInput[]> {
    const body = await fetchJson<DcatCatalog>(this.fetchImpl, this.feedUrl);
    if (!Array.isArray(body["dcat:dataset"])) {
      throw new UpstreamError(`${new URL(this.feedUrl).host} did not return a DCAT catalogue`);
    }
    return body["dcat:dataset"].map((d) => this.toDataset(d)).filter((d): d is DatasetInput => d !== null);
  }

  toDataset(d: DcatDataset): DatasetInput | null {
    const landing = d["@id"] ?? str(d["dcat:landingPage"]);
    const identifier = str(d["dct:identifier"]);
    const name = datasetName(landing, identifier);
    if (!name) return null;
    const resources = list(d["dcat:distribution"]).flatMap((r, i) => {
      const title = str(r["dct:title"]);
      const url = str(r["dcat:accessURL"]) ?? str(r["dcat:downloadURL"]);
      const format = title ?? str(r["dct:format"]) ?? str(r["dcat:mediaType"]);
      const key = (format ?? "").trim().toUpperCase();
      if (!url || LANDING_PAGE_TITLES.has(key)) return [];
      return [
        {
          upstreamId: `${name}:${i}`,
          name: str(r["dct:description"]) ?? title,
          format,
          url,
          ...(SERVICE_TITLES.has(key) ? { accessType: "api" as const, queryable: false } : classifyResource({ format, url })),
        },
      ];
    });
    return {
      name,
      title: str(d["dct:title"]) || name,
      description: str(d["dct:description"])?.replace(/​/g, "").trim() || null,
      publisher: str(d["dct:publisher"]?.["foaf:name"]),
      license: str(d["dct:license"]),
      tags: list(d["dcat:keyword"]).filter((k) => typeof k === "string" && k.trim() !== ""),
      modified: str(d["dct:modified"]),
      upstreamUrl: landing ?? identifier ?? this.feedUrl,
      resources,
    };
  }
}

/**
 * A stable dataset name: the last path segment of the landing page (ArcGIS Hub
 * uses `Owner::slug`), else the ArcGIS item id from the identifier URL.
 */
function datasetName(landing: string | null | undefined, identifier: string | null): string | null {
  for (const candidate of [landing, identifier]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const id = url.searchParams.get("id");
      if (id) return id;
      const segment = url.pathname.split("/").filter(Boolean).pop();
      if (segment) return decodeURIComponent(segment);
    } catch {
      return candidate;
    }
  }
  return null;
}
