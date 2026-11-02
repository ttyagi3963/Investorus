// The web app's security headers (T362, T389). The fixed ones go on every answer (next.config.ts):
// no framing, no type sniffing, no paths in referrers, no camera or location. The page policy is
// set per request (proxy.ts), because it names the photo storage the settings give at run time.
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** Two years, the usual HSTS lifetime; no includeSubDomains, which would bind sites this app does not own. */
const HSTS = "max-age=63072000";

/**
 * The Content-Security-Policy, and HSTS when the browser came over HTTPS (over plain HTTP a browser
 * ignores HSTS anyway). A page loads from this site, except photos, which the browser uploads to
 * and shows from the storage (signed PUT, public GET). Scripts and styles may be inline: Next's
 * bootstrap scripts and the brand's style element would need a nonce per request (plan.md,
 * Prototype Shortcuts). Next's dev server also needs eval.
 */
export function pageSecurityHeaders({
  storageOrigin,
  https,
  dev,
}: {
  storageOrigin: string;
  https: boolean;
  dev: boolean;
}): Record<string, string> {
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' ${storageOrigin}`,
    `connect-src 'self' ${storageOrigin}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    "Content-Security-Policy": policy,
    ...(https && { "Strict-Transport-Security": HSTS }),
  };
}
