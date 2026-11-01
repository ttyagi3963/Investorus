// The app's React Query client (T334). Reads are not retried (the api answers fast and the screens say
// what failed). A 404 is thrown to the area's error page even when the tab still remembers the
// record: React Query keeps the last good data when a refetch fails, which suits an outage but would
// keep showing a record that was deleted. A query whose 404 is a normal state opts out.
import { QueryClient } from "@tanstack/react-query";
import { isGone } from "./errors";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, throwOnError: (error) => isGone(error) } },
  });
}
