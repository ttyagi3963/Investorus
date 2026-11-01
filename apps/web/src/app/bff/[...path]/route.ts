// The BFF proxy route (T263): every `/bff/<path>` call from the browser, forwarded to the api with
// the session cookie's token. The logic lives in src/bff/proxy.ts, where it is tested.
import { forwardToApi } from "@/bff/proxy";
import { serverEnv } from "@/env";

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, { params }: Context): Promise<Response> {
  const { path } = await params;
  return forwardToApi(request, path, { apiUrl: serverEnv().API_URL });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const dynamic = "force-dynamic";
