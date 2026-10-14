import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { councils } from "../src/councils.ts";
import { openCatalogue } from "../src/db/catalogue.ts";
import { Hub } from "../src/hub.ts";
import { sources, type SourceDefinition } from "../src/sources/registry.ts";

// Hand-written responses in the shapes an ArcGIS Hub DCAT-AP 2.0.1 feed and
// the opendata.arcgis.com v3 search API return. Fixtures, not recordings.

const dcatFeed = {
  "@context": {},
  "@type": "dcat:Catalog",
  "dcat:dataset": [
    {
      "@id": "https://hub.test/datasets/HighlandGIS::school-catchments",
      "@type": "dcat:Dataset",
      "dct:identifier": "https://www.arcgis.com/home/item.html?id=abc123&sublayer=0",
      "dct:title": "School Catchments",
      "dct:description": "Primary school catchment areas​",
      "dct:publisher": { "foaf:name": "Highland Council" },
      "dct:modified": "2026-08-25T10:00:00.000Z",
      "dct:license": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      "dcat:keyword": ["schools", "education"],
      "dcat:distribution": [
        { "dct:title": "ArcGIS Hub Dataset", "dcat:accessURL": { "@id": "https://hub.test/datasets/HighlandGIS::school-catchments" } },
        { "dct:title": "ArcGIS GeoService", "dct:description": "Feature service", "dcat:accessURL": { "@id": "https://services.test/arcgis/rest/services/Schools/FeatureServer/0" } },
        { "dct:title": "CSV", "dcat:accessURL": { "@id": "https://hub.test/api/download/v1/items/abc123/csv?layers=0" } },
        { "dct:title": "ZIP", "dcat:accessURL": { "@id": "https://hub.test/api/download/v1/items/abc123/shapefile?layers=0" } },
      ],
    },
    {
      "@id": "https://hub.test/datasets/HighlandGIS::council-budget",
      "dct:title": "Council Budget",
      "dcat:keyword": "finance",
      "dcat:distribution": { "dct:title": "CSV", "dcat:accessURL": "https://hub.test/budget.csv" },
    },
  ],
};

const arcgisPages = [
  {
    data: [
      {
        id: "feat1",
        attributes: { name: "Grit Bins", source: "Moray Council", type: "Feature Layer", tags: ["roads"], modified: 1751760000000, url: "https://services.test/arcgis/rest/services/Grit/FeatureServer/0" },
        links: { itemPage: "https://www.arcgis.com/home/item.html?id=feat1" },
      },
    ],
    meta: { next: "https://opendata.arcgis.com/api/v3/search?page=2" },
  },
  {
    data: [{ id: "csv1", attributes: { name: "Car Park Tariffs", source: "Moray Council", type: "CSV", licenseInfo: "<p>Open Government Licence</p>" } }],
    meta: { next: null },
  },
];

const testSources: SourceDefinition[] = [
  { id: "highland", title: "Highland", publisher: "Highland Council", kind: "dcat", baseUrl: "https://hub.test/api/feed/dcat-ap/2.0.1.json", homepage: "https://hub.test", councilId: "highland" },
  { id: "moray", title: "Moray", publisher: "Moray Council", kind: "arcgis", baseUrl: "https://opendata.arcgis.com/api/v3/search?q=x", homepage: "https://moray.test", councilId: "moray" },
];

const fakeFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  const ok = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  if (url.host === "hub.test") return ok(dcatFeed);
  if (url.host === "opendata.arcgis.com") return ok(arcgisPages[url.searchParams.get("page") === "2" ? 1 : 0]);
  return new Response("not found", { status: 404 });
}) as typeof fetch;

async function setup() {
  const hub = await Hub.create(await openCatalogue(":memory:"), fakeFetch, testSources);
  const reports = await hub.sync();
  return { hub, reports, app: createApp(hub) };
}

describe("council register", () => {
  it("covers all 32 councils exactly once", () => {
    expect(councils).toHaveLength(32);
    expect(new Set(councils.map((c) => c.id)).size).toBe(32);
    expect(new Set(councils.map((c) => c.gss)).size).toBe(32);
  });

  it("links every council source to a council, and every harvested portal council to a source", () => {
    const ids = new Set(councils.map((c) => c.id));
    const councilSources = sources.filter((s) => s.councilId);
    for (const s of councilSources) expect(ids).toContain(s.councilId);
    const withSource = new Set(councilSources.map((s) => s.councilId));
    for (const c of councils.filter((c) => c.provision === "portal" && c.platform !== "USMART")) {
      expect(withSource, c.id).toContain(c.id);
    }
  });

  it("serves the register over REST with each council's sources and dataset counts", async () => {
    const { app } = await setup();
    const all = await (await app.request("/v1/councils")).json();
    expect(all).toHaveLength(32);
    const none = await (await app.request("/v1/councils?provision=none")).json();
    expect(none.every((c: { provision: string }) => c.provision === "none")).toBe(true);
    const highland = await (await app.request("/v1/councils/highland")).json();
    expect(highland).toMatchObject({ gss: "S12000017", provision: "portal", source_ids: ["highland"], dataset_count: 2 });
    const fife = await (await app.request("/v1/councils/fife")).json();
    expect(fife).toMatchObject({ source_ids: [], dataset_count: 0 });
    expect(fife.endpoints[0].format).toBe("ArcGIS REST");
    expect((await app.request("/v1/councils/narnia")).status).toBe(404);
  });
});

describe("council portal harvesters", () => {
  it("harvests DCAT-AP feeds and ArcGIS searches across pages", async () => {
    const { reports } = await setup();
    expect(reports).toEqual([
      { source_id: "highland", ok: true, datasets: 2, resources: 4 },
      { source_id: "moray", ok: true, datasets: 2, resources: 2 },
    ]);
  });

  it("classifies DCAT distributions and skips the Hub landing page", async () => {
    const { hub } = await setup();
    const ds = await hub.catalogue.getDataset("highland:HighlandGIS::school-catchments");
    expect(ds).toMatchObject({
      title: "School Catchments",
      description: "Primary school catchment areas",
      publisher: "Highland Council",
      tags: ["schools", "education"],
      has_api: true,
      has_csv: true,
    });
    expect(ds?.resources.map((r) => [r.format, r.access_type]).sort()).toEqual([
      ["ArcGIS GeoService", "api"],
      ["CSV", "csv"],
      ["ZIP", "file"],
    ]);
    const budget = await hub.catalogue.getDataset("highland:HighlandGIS::council-budget");
    expect(budget).toMatchObject({ has_api: false, has_csv: true, tags: ["finance"] });
  });

  it("maps ArcGIS item types to access types", async () => {
    const { hub } = await setup();
    expect(await hub.catalogue.getResource("moray:feat1")).toMatchObject({
      access_type: "api",
      queryable: false,
      url: "https://services.test/arcgis/rest/services/Grit/FeatureServer/0",
    });
    const csv = await hub.catalogue.getDataset("moray:csv1");
    expect(csv).toMatchObject({ has_api: false, has_csv: true, license: "Open Government Licence" });
  });

  it("lists council portals as sources with their council", async () => {
    const { app } = await setup();
    const body = await (await app.request("/v1/sources/moray")).json();
    expect(body).toMatchObject({ kind: "arcgis", council_id: "moray", dataset_count: 2 });
  });

  it("lists councils through MCP", async () => {
    const { app } = await setup();
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_councils", arguments: { provision: "landing-page" } } }),
    });
    const payload = JSON.parse((await res.json()).result.content[0].text);
    expect(payload.map((c: { id: string }) => c.id)).toContain("falkirk");
    expect(payload.every((c: { provision: string }) => c.provision === "landing-page")).toBe(true);
  });
});
