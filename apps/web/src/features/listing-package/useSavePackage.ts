// Saves the package form (T270, T422): creates a draft and opens its page, where photos are added,
// or updates a package with the version the agent opened and returns to the listings page, where a
// toast confirms which listing was saved.
// The api's field errors are keyed by field path (for example `seller.email`), which is also each
// input's name, so every error lands on its field; anything else becomes a notice above the form.
import type {
  AgentPackageView,
  CreateListingPackageInput,
  UpdateListingPackageInput,
} from "@clever/contracts/listing-package";
import { ApiError } from "@clever/contracts/client";
import { showToast } from "@clever/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { listingPackages } from "../../lib/bff-client";
import { packageKeys } from "./queries";

export type SaveNotice = {
  message: string;
  existingPackageId?: string;
  requestId?: string;
};

type SaveInput =
  | { mode: "create"; input: CreateListingPackageInput }
  | { mode: "update"; id: string; input: UpdateListingPackageInput };

export function useSavePackage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<SaveNotice | null>(null);

  const mutation = useMutation({
    mutationFn: (save: SaveInput) =>
      save.mode === "create"
        ? listingPackages.create(save.input)
        : listingPackages.update(save.id, save.input),
    onMutate: () => {
      setFieldErrors({});
      setNotice(null);
    },
    onSuccess: async (saved: AgentPackageView, save) => {
      // "all" also refetches the off-screen list, so the page the agent lands on already has the
      // saved version; otherwise its Publish would send the old one and be refused (409).
      await queryClient.invalidateQueries({ queryKey: packageKeys.all, refetchType: "all" });
      if (save.mode === "create") router.replace(`/agent/packages/${saved.id}`);
      else {
        showToast(`Saved changes to ${saved.property.streetLine}.`);
        router.push("/agent");
      }
    },
    onError: (err) => {
      if (!(err instanceof ApiError) || err.status >= 500) {
        setNotice({
          message: "The package could not be saved. Try again.",
          requestId: err instanceof ApiError ? (err.requestId ?? undefined) : undefined,
        });
        return;
      }
      setFieldErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
      const existing = err.details.existingPackageId;
      setNotice({
        message: err.message,
        existingPackageId: typeof existing === "string" ? existing : undefined,
        requestId: err.requestId ?? undefined,
      });
    },
  });

  return { save: mutation.mutate, isSaving: mutation.isPending, fieldErrors, notice };
}
