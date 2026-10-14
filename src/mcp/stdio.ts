import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "../config.ts";
import { openCatalogue } from "../db/catalogue.ts";
import { Hub } from "../hub.ts";
import { createMcpServer } from "./server.ts";

// For local MCP clients (e.g. Claude Desktop) that launch the server as a subprocess.
const hub = new Hub(openCatalogue(config.dbPath));
await createMcpServer(hub).connect(new StdioServerTransport());
