import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { syncedHub } from "./helpers.ts";

async function setup(opts?: { failCkan?: boolean }) {
  const ctx = await syncedHub(opts);
  return { ...ctx, app: createApp(ctx.hub, { adminToken: "secret" }) };
}

describe("sync", () => {
  it("harvests both sources into the catalogue", async () => {
    const { reports } = await setup();
    expect(reports).toEqual([
      { source_id: "ckan-test", ok: true, datasets: 4, resources: 5 },
      { source_id: "sparql-test", ok: true, datasets: 1, resources: 1 },
    ]);
  });

  it("keeps the previous catalogue when a source fails", async () => {
    const { hub, upstream } = await setup();
    upstream.failCkan = true;
    const [report] = await hub.sync("ckan-test");
    expect(report).toMatchObject({ ok: false, error: expect.stringContaining("503") });
    const source = await hub.catalogue.getSource("ckan-test");
    expect(source?.dataset_count).toBe(4);
    expect(source?.last_sync_error).toContain("503");
  });
});

describe("REST API", () => {
  it("lists only API-backed datasets by default", async () => {
    const { app } = await setup();
    const body = await (await app.request("/v1/datasets")).json();
    expect(body.items.map((d: { id: string }) => d.id).sort()).toEqual([
      "ckan-test:bus-stops",
      "ckan-test:population-estimates",
      "sparql-test:house-prices",
    ]);
    const all = await (await app.request("/v1/datasets?has_api=any")).json();
    expect(all.total).toBe(5);
  });

  it("searches the catalogue by text", async () => {
    const { app } = await setup();
    const body = await (await app.request("/v1/datasets?q=hous")).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: "sparql-test:house-prices", publisher: "Registers of Scotland", has_api: true });
  });

  it("tracks CSV sources alongside APIs", async () => {
    const { app } = await setup();
    const csv = await (await app.request("/v1/resources?access=csv")).json();
    expect(csv.items.map((r: { id: string }) => r.id).sort()).toEqual(["ckan-test:res-bus-csv", "ckan-test:res-school-csv"]);
    const dataset = await (await app.request("/v1/datasets/ckan-test:school-rolls")).json();
    expect(dataset).toMatchObject({ has_api: false, has_csv: true, resource_count: 1 });
  });

  it("proxies datastore queries to CKAN", async () => {
    const { app, calls } = await setup();
    const res = await app.request('/v1/resources/ckan-test:res-pop-ds/rows?limit=10&filters={"Council":"Fife"}&sort=Population%20desc');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resource_id: "ckan-test:res-pop-ds",
      fields: [{ id: "Council", type: "text" }, { id: "Population", type: "int" }],
      records: [{ _id: 1, Council: "Fife", Population: 374130 }],
      total: 32,
      limit: 10,
      offset: 0,
    });
    const upstream = calls.at(-1)!.url;
    expect(upstream.pathname).toBe("/api/3/action/datastore_search");
    expect(upstream.searchParams.get("resource_id")).toBe("res-pop-ds");
    expect(upstream.searchParams.get("filters")).toBe('{"Council":"Fife"}');
    expect(upstream.searchParams.get("sort")).toBe("Population desc");
  });

  it("pivots SPARQL observations into rows", async () => {
    const { app } = await setup();
    const body = await (await app.request("/v1/resources/sparql-test:house-prices/rows?limit=5")).json();
    expect(body.records).toEqual([
      {
        observation: "http://statistics.test/obs/1",
        refArea: "City of Edinburgh",
        refArea_uri: "http://statistics.test/id/S12000036",
        median: 312000,
      },
    ]);
  });

  it("refuses to proxy download-only resources", async () => {
    const { app } = await setup();
    const res = await app.request("/v1/resources/ckan-test:res-school-csv/rows");
    expect(res.status).toBe(400);
  });

  it("rejects bad filters and unknown ids", async () => {
    const { app } = await setup();
    expect((await app.request("/v1/resources/ckan-test:res-pop-ds/rows?filters=nope")).status).toBe(400);
    expect((await app.request("/v1/datasets/ckan-test:nope")).status).toBe(404);
    expect((await app.request("/v1/datasets?limit=5000")).status).toBe(400);
  });

  it("passes read-only SPARQL through and blocks updates", async () => {
    const { app } = await setup();
    const post = (query: string, source = "sparql-test") =>
      app.request(`/v1/sources/${source}/sparql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
    expect((await post("SELECT * WHERE { ?s ?p ?o } LIMIT 1")).status).toBe(200);
    expect((await post("PREFIX x: <http://x/>\nDELETE WHERE { ?s ?p ?o }")).status).toBe(400);
    expect((await post("SELECT * WHERE { ?s ?p ?o }", "ckan-test")).status).toBe(400);
  });

  it("protects the sync endpoint", async () => {
    const { app } = await setup();
    expect((await app.request("/v1/admin/sync", { method: "POST" })).status).toBe(401);
    const ok = await app.request("/v1/admin/sync?source=sparql-test", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    });
    expect(await ok.json()).toEqual([{ source_id: "sparql-test", ok: true, datasets: 1, resources: 1 }]);
  });

  it("publishes an OpenAPI spec covering every route", async () => {
    const { app } = await setup();
    const spec = await (await app.request("/openapi.json")).json();
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/v1/admin/sync",
      "/v1/datasets",
      "/v1/datasets/{id}",
      "/v1/resources",
      "/v1/resources/{id}",
      "/v1/resources/{id}/rows",
      "/v1/sources",
      "/v1/sources/{id}",
      "/v1/sources/{id}/sparql",
    ]);
    const params = spec.paths["/v1/datasets"].get.parameters.map((p: { name: string }) => p.name);
    expect(params).toEqual(expect.arrayContaining(["q", "source", "has_api", "limit", "offset"]));
  });
});
