// The web app's security headers (T362), sent on every page and BFF answer (next.config.ts). The
// policy forbids framing (clickjacking), plugins, a changed <base>, and forms posting elsewhere.
// It does not restrict scripts or styles: Next's inline scripts would need a nonce per request, a
// production step listed in plan.md's Prototype Shortcuts.
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
