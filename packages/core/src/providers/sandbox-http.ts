// The one way core calls the sandbox (contracts/providers.md): every call has a 5 s timeout, and a
// network failure, a timeout, or a 5xx becomes an InfrastructureError, never a raw fetch error.
import { InfrastructureError } from "../errors/InfrastructureError.js";

const TIMEOUT_MS = 5_000;

export async function sandboxRequest(
  fetchFn: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const what = `${init.method ?? "GET"} ${new URL(url).pathname}`;
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (cause) {
    throw new InfrastructureError(`The sandbox did not answer ${what}`, 503, cause);
  }
  if (res.status >= 500) {
    throw new InfrastructureError(`The sandbox answered ${res.status} to ${what}`, 503);
  }
  return res;
}
