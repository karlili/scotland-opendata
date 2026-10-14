export const config = {
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.CATALOGUE_DB ?? "data/catalogue.db",
  /** Upstream request timeout in milliseconds. */
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 30_000),
};
