// The home page (T103, T356): reads the sandbox's address from the settings at request time, and
// renders the home screen, a client component because the @clever/ui barrel has no server-safe entry.
import { connection } from "next/server";
import { serverEnv } from "@/env";
import { HomeScreen } from "@/features/home/HomeScreen";

export default async function HomePage() {
  await connection();
  return <HomeScreen sandboxUrl={serverEnv().PUBLIC_SANDBOX_URL} />;
}
