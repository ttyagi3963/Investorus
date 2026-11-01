// Publishing and withdrawing a package (T301), from the dashboard row or the package page. A refused
// publish keeps the fields the api named, so the screen lists each with a link to it; any other
// failure becomes a notice with its request ID. Either success refreshes every package query.
import type { FieldError } from "@clever/contracts/client";
import { ApiError } from "@clever/contracts/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listingPackages } from "../../lib/bff-client";
import { describeError, type ErrorInfo } from "../../lib/errors";
import { packageKeys } from "./queries";

type Target = { id: string; version: number };
export type Blockers = { packageId: string; fields: FieldError[]; requestId?: string };

export function usePublication() {
  const queryClient = useQueryClient();
  const [blockers, setBlockers] = useState<Blockers | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const reset = () => {
    setBlockers(null);
    setError(null);
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: packageKeys.all });

  const publish = useMutation({
    mutationFn: ({ id, version }: Target) => listingPackages.publish(id, { version }),
    onMutate: reset,
    onSuccess: refresh,
    onError: (err, { id }) => {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED" && err.fields.length > 0) {
        setBlockers({ packageId: id, fields: err.fields, requestId: err.requestId ?? undefined });
      } else {
        setError(describeError(err, "The package could not be published. Try again."));
      }
    },
  });
  const withdraw = useMutation({
    mutationFn: ({ id, version }: Target) => listingPackages.withdraw(id, { version }),
    onMutate: reset,
    onSuccess: refresh,
    onError: (err) =>
      setError(describeError(err, "The package could not be withdrawn. Try again.")),
  });

  return {
    publish: publish.mutate,
    withdraw: withdraw.mutate,
    isBusy: publish.isPending || withdraw.isPending,
    blockers,
    error,
  };
}
