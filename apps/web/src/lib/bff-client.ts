// The browser's api client (T093's Sprint 1 part): every call goes to the BFF at /bff, which adds
// the session cookie's token, so browser code never sees the token.
import { createApiClient, sessionClient } from "@clever/contracts/client";

const bff = createApiClient({ baseUrl: "/bff" });

export const session = sessionClient(bff);
