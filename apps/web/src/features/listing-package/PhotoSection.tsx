"use client";
// The photo section of a saved package (T270): the photos in order, each with a remove button,
// and a picker to add more. Photos are optional on a draft, so this appears only after the first save;
// publishing needs one, and a publish blocker links here (#photos).
import { PHOTO_CONTENT_TYPES } from "@clever/contracts/photo";
import type { AgentPackageView } from "@clever/contracts/listing-package";
import { Button, PhotoPicker } from "@clever/ui";
import { usePhotoUpload } from "./usePhotoUpload";

export function PhotoSection({ pkg }: { pkg: AgentPackageView }) {
  const { upload, remove, isBusy, error } = usePhotoUpload(pkg.id, pkg.photos);

  return (
    <section
      id="photos"
      aria-labelledby="photos-heading"
      className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card"
    >
      <h2 id="photos-heading" className="font-heading text-heading-sm">
        Photos
      </h2>
      <p className="text-label text-muted">
        At least one is needed to publish. JPEG, PNG, or WebP, up to 10 MB each and 20 in all.
      </p>
      {pkg.photos.length === 0 ? (
        <p className="text-muted">No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-stack-md md:grid-cols-4">
          {pkg.photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-stack-sm">
              <img
                src={photo.url}
                alt={`${pkg.property.streetLine}, view ${index + 1}`}
                className="aspect-square w-full rounded-control border border-default object-cover"
              />
              <Button
                variant="secondary"
                isDisabled={isBusy}
                onPress={() => void remove(photo.id)}
                aria-label={`Remove view ${index + 1}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-label text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-inline-md">
        <PhotoPicker
          label="Add photos"
          acceptedTypes={PHOTO_CONTENT_TYPES}
          onSelect={(files) => void upload(files)}
          isDisabled={isBusy}
        />
        {isBusy && (
          <span role="status" className="text-label text-muted">
            Working…
          </span>
        )}
      </div>
    </section>
  );
}
