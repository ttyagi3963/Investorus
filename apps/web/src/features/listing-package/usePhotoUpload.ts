// Adds and removes a package's photos (T270). Each file is checked for type and size first, then
// uploaded straight to storage with the signed instruction the api issues (never through the BFF),
// then attached at the first free position. The api checks everything again. A failure always
// reads as something to try again, never as the browser's own error text.
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES } from "@clever/contracts/photo";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { photos as photosApi } from "../../lib/bff-client";
import { errorText } from "../../lib/errors";
import { packageKeys } from "./queries";

const MAX_PHOTOS = 20;
const ACCEPTED: readonly string[] = PHOTO_CONTENT_TYPES;

function problemWith(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return `${file.name}: use a JPEG, PNG, or WebP image.`;
  if (file.size > MAX_PHOTO_BYTES) return `${file.name}: the limit is 10 MB.`;
  return null;
}

export function usePhotoUpload(packageId: string, existing: readonly { position: number }[]) {
  const queryClient = useQueryClient();
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: packageKeys.all });
  }

  async function upload(files: File[]): Promise<void> {
    setError(null);
    const problem = files.map(problemWith).find((p) => p !== null);
    if (problem) return setError(problem);
    const taken = new Set(existing.map((p) => p.position));
    setBusy(true);
    try {
      for (const file of files) {
        const position = [...Array(MAX_PHOTOS).keys()].find((i) => !taken.has(i));
        if (position === undefined)
          return setError(`A package holds at most ${MAX_PHOTOS} photos.`);
        const { storageKey, upload } = await photosApi.requestUpload(packageId, {
          contentType: file.type as (typeof PHOTO_CONTENT_TYPES)[number],
          sizeBytes: file.size,
        });
        // A storage outage can also surface as a network error, which the browser words as it likes.
        const stored = await fetch(upload.url, {
          method: upload.method,
          headers: upload.headers,
          body: file,
        }).catch(() => null);
        if (!stored?.ok) return setError(`${file.name} could not be uploaded. Try again.`);
        await photosApi.attach(packageId, { storageKey, position });
        taken.add(position);
      }
    } catch (err) {
      setError(errorText(err, "The upload failed. Try again."));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function remove(photoId: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await photosApi.remove(packageId, photoId);
    } catch (err) {
      setError(errorText(err, "The photo could not be removed."));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  return { upload, remove, isBusy, error };
}
