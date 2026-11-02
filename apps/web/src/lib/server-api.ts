// The web server's own calls to the api (T395): the brand reads and the theme save go from the Next
// server straight to the api, not through the BFF. One place builds them, so every call carries the
// request's trace ID (T283) and, when given, the visitor's session.
import { createApiClient, type ApiClient } from "@clever/contracts/client";
import { headers } from "next/headers";
import { traceparentFor } from "@/bff/shared";
import { serverEnv } from "@/env";

/** Next's fetch options: its data cache, or none. */
type ServerFetchInit = Pick<RequestInit, "cache"> & {
  next?: { revalidate: number; tags: string[] };
};

export async function serverApi(init: ServerFetchInit, session?: string): Promise<ApiClient> {
  const traceparent = traceparentFor({ headers: await headers() });
  return createApiClient({
    baseUrl: `${serverEnv().API_URL}/api/v1`,
    fetch: (url, request) =>
      fetch(url, {
        ...request,
        ...init,
        headers: {
          ...request?.headers,
          traceparent,
          ...(session && { Authorization: `Bearer ${session}` }),
        },
      }),
  });
}
