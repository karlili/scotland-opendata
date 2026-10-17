import { config } from "../config.ts";

export type Fetch = typeof fetch;

/** Raised when an upstream portal fails or answers with something unusable. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export async function fetchJson<T>(fetchImpl: Fetch, url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { accept: "application/json", "user-agent": "scotland-opendata-hub", ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(config.upstreamTimeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`Request to ${new URL(url).host} failed: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new UpstreamError(`${new URL(url).host} answered ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new UpstreamError(`${new URL(url).host} returned a response that is not JSON`);
  }
}
