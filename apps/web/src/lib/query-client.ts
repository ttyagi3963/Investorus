// The app's React Query client (T334). Reads are not retried (the api answers fast and the screens say
// what failed). A 404 is thrown to the area's error page even when the tab still remembers the
// record: React Query keeps the last good data when a refetch fails, which suits an outage but would
// keep showing a record that was deleted. A query whose 404 is a normal state opts out. A 401 means
// the tab's session has ended (expired, banned, or its account reset): the remembered data is hidden
// the same way, and the tab goes to sign-in once (T418).
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isGone, isSignedOut } from "./errors";

/** A full load of /login, which also drops everything this tab remembered. */
function goToSignIn(): void {
  if (window.location.pathname !== "/login") window.location.assign("/login");
}

export function createQueryClient(toSignIn: () => void = goToSignIn): QueryClient {
  let ended = false;
  const endIfSignedOut = (error: unknown) => {
    if (ended || !isSignedOut(error)) return;
    ended = true;
    toSignIn();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: endIfSignedOut }),
    mutationCache: new MutationCache({ onError: endIfSignedOut }),
    defaultOptions: {
      queries: { retry: false, throwOnError: (error) => isGone(error) || isSignedOut(error) },
    },
  });
}
