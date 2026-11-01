"use client";
// The signed-in user's name in the header (T106, T358), from `GET /me`, so a reviewer switching
// demo accounts always sees who they are. Nothing shows until it loads, or if it fails: the page
// works without it.
import { useQuery } from "@tanstack/react-query";
import { session } from "@/lib/bff-client";

export function CurrentUser({ tone = "light" }: { tone?: "light" | "inverse" }) {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => session.me() });
  if (!me) return null;
  return (
    <span className={`text-body ${tone === "inverse" ? "text-inverse-muted" : "text-muted"}`}>
      {me.displayName}
    </span>
  );
}
