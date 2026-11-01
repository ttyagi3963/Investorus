"use server";
// The brand switcher's action (T351): remembers the visitor's brand in the `brand` cookie, which
// brand resolution reads before the host. Setting a cookie in an action re-renders the page, so the
// new theme shows at once. A server action is a public endpoint: only a brand that exists is kept.
import { z } from "zod";
import { cookies } from "next/headers";
import { serverEnv } from "@/env";
import { BRAND_COOKIE, listBrands } from "./active-brand";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function chooseBrand(input: unknown): Promise<void> {
  const brandId = z.string().min(1).parse(input);
  if (!(await listBrands()).some((b) => b.brandId === brandId)) return;
  (await cookies()).set(BRAND_COOKIE, brandId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().COOKIE_SECURE,
    maxAge: ONE_YEAR_SECONDS,
  });
}
