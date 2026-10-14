import { config } from "../config.ts";
import { openCatalogue } from "../db/catalogue.ts";
import { Hub } from "../hub.ts";

// Usage: pnpm sync [source-id]
const catalogue = await openCatalogue(config.dbPath);
const reports = await (await Hub.create(catalogue)).sync(process.argv[2]);
for (const r of reports) {
  console.log(r.ok ? `✓ ${r.source_id}: ${r.datasets} datasets, ${r.resources} resources` : `✗ ${r.source_id}: ${r.error}`);
}
catalogue.close();
process.exitCode = reports.every((r) => r.ok) ? 0 : 1;
