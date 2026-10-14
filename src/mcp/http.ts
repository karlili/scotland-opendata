import { StreamableHTTPTransport } from "@hono/mcp";
import type { Hono } from "hono";
import type { Hub } from "../hub.ts";
import { createMcpServer } from "./server.ts";

/** Serves MCP over Streamable HTTP at /mcp, stateless: one server per request. */
export function mountMcp(app: Hono, hub: Hub): void {
  app.all("/mcp", async (c) => {
    const server = createMcpServer(hub);
    const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(c);
  });
}
