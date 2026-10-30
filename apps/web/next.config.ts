import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Small runtime image and memory footprint for the 2 GB limit (research R4, R19).
  output: "standalone",
  // Next runs this file with cwd = apps/web; trace from the monorepo root.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@clever/ui", "@clever/contracts"],
  poweredByHeader: false,
};

export default nextConfig;
