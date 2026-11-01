// One user action at a time (T315–T317): a decision, a milestone, a promotion, a change to the
// offer round, or an investor's answer. Never optimistic (constitution XIII): the screen changes
// only once the api has answered, then the given queries are refreshed. A refusal (a 409 such as
// "already has an accepted offer") becomes a notice with its request ID.
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useState } from "react";
import { describeError, type ErrorInfo } from "./errors";

export function useAction(fallback: string, refresh: QueryKey) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<ErrorInfo | null>(null);
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refresh }),
    onError: (err) => setError(describeError(err, fallback)),
  });
  return { run: mutation.mutate, isBusy: mutation.isPending, error };
}
