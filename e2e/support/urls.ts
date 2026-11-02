// Where the stack under test listens (T411). The defaults are the demo's own ports; E2E_* variables
// point the specs at another stack, for example a second compose project on other ports.
const env = (name: string, fallback: string) => process.env[name]?.trim() || fallback;

export const URLS = {
  web: env("E2E_BASE_URL", "http://localhost:3000"),
  /** The partner brand's host (seed/brands/larkspur/hosts.json) on the web server's port. */
  partner: env("E2E_PARTNER_URL", "http://partner.localhost:3000"),
  api: env("E2E_API_URL", "http://localhost:4000"),
  /** The stand-in storage the browser uploads photos to and loads them from. */
  sandbox: env("E2E_SANDBOX_URL", "http://localhost:4100"),
};
