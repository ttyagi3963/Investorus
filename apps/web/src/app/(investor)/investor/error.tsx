"use client";
// The investor area's error page (T334): a record that no longer exists, or an unexpected failure, shown
// inside the area's layout so its header and navigation stay (features/errors/RouteError.tsx).
import { RouteError } from "@/features/errors/RouteError";

export default function InvestorError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      home={{ href: "/investor", label: "Back to opportunities" }}
    />
  );
}
