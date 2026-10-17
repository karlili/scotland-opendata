import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { syncedHub } from "./helpers.ts";

async function rpc(app: ReturnType<typeof createApp>, method: string, params: object = {}) {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

describe("MCP over HTTP", () => {
  it("lists the catalogue tools", async () => {
    const { hub } = await syncedHub();
    const app = createApp(hub);
    await rpc(app, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    const tools = await rpc(app, "tools/list");
    expect(tools.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "get_dataset",
      "list_sources",
      "query_resource",
      "run_sparql",
      "search_datasets",
    ]);
  });

  it("searches datasets through a tool call", async () => {
    const { hub } = await syncedHub();
    const app = createApp(hub);
    const res = await rpc(app, "tools/call", { name: "search_datasets", arguments: { query: "bus" } });
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.items.map((d: { id: string }) => d.id)).toEqual(["ckan-test:bus-stops"]);
  });

  it("reports proxy errors as tool errors", async () => {
    const { hub } = await syncedHub();
    const app = createApp(hub);
    const res = await rpc(app, "tools/call", { name: "query_resource", arguments: { resource_id: "ckan-test:res-school-csv" } });
    expect(res.result.isError).toBe(true);
  });
});
