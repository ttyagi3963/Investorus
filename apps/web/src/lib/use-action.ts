// One user action at a time (T315–T317): a decision, a milestone, a promotion, a change to the
// offer round, or an investor's answer. Never optimistic (constitution XIII): the screen changes
// only once the api has answered, then the given queries are refreshed. A refusal (a 409 such as
// "already has an accepted offer") becomes a notice with its request ID. A press while an action
// runs starts nothing, even before the screen re-renders to disable the button (T381).
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { describeError, type ErrorInfo } from "./errors";

export function useAction(fallback: string, refresh: QueryKey) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<ErrorInfo | null>(null);
  const busy = useRef(false);
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refresh }),
    onError: (err) => setError(describeError(err, fallback)),
    onSettled: () => {
      busy.current = false;
    },
  });
  const run = (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    mutation.mutate(action);
  };
  return { run, isBusy: mutation.isPending, error };
}
