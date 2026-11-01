// Which brand a request renders (T349; FR-092): the brand cookie the switcher sets, if it names a
// brand that exists; else the brand whose hosts include the address the browser asked for; else
// the default brand. A cookie naming no brand is ignored, so a stale or forged one changes nothing.
import type { BrandSummary } from "@clever/contracts/brand";

export function pickBrand(
  brands: readonly BrandSummary[],
  request: { cookie: string | undefined; host: string | null; defaultBrandId: string },
): string {
  if (request.cookie && brands.some((b) => b.brandId === request.cookie)) return request.cookie;
  const hostname = request.host?.toLowerCase().replace(/:\d+$/, "");
  const byHost = hostname ? brands.find((b) => b.hosts.includes(hostname)) : undefined;
  return byHost?.brandId ?? request.defaultBrandId;
}
