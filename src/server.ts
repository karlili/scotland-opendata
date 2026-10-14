import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { openCatalogue } from "./db/catalogue.ts";
import { Hub } from "./hub.ts";

const hub = new Hub(openCatalogue(config.dbPath));
const app = createApp(hub, { adminToken: process.env.ADMIN_TOKEN });

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Scotland Open Data Hub on http://localhost:${port} (docs at /docs, MCP at /mcp)`);
});
