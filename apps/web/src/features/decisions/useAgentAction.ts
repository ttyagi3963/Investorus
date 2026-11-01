// One agent action at a time (T315, T316): a decision, a milestone, a fall-through, a promotion, or
// a change to the offer round. Never optimistic (constitution XIII): the screen shows the result
// only once the api has answered, then every query of the package is refreshed. A refusal (a 409
// such as "already has an accepted offer") becomes a notice with its request ID.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { describeError, type ErrorInfo } from "../../lib/errors";
import { packageKeys } from "../listing-package/queries";

export function useAgentAction(fallback: string) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<ErrorInfo | null>(null);
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: packageKeys.all }),
    onError: (err) => setError(describeError(err, fallback)),
  });
  return { run: mutation.mutate, isBusy: mutation.isPending, error };
}
