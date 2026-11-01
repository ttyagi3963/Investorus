"use client";
// The photo card of a saved package (T270, T330): the photos in order as a grid of tiles, each with
// a remove button, and a picker to add more. Photos are optional on a draft, so this appears only
// after the first save; publishing needs one, and a publish blocker links here (#photos).
import { PHOTO_CONTENT_TYPES } from "@clever/contracts/photo";
import type { AgentPackageView } from "@clever/contracts/listing-package";
import { Button, Card, PhotoPicker, Thumbnail } from "@clever/ui";
import { usePhotoUpload } from "./usePhotoUpload";

export function PhotoSection({ pkg }: { pkg: AgentPackageView }) {
  const { upload, remove, isBusy, error } = usePhotoUpload(pkg.id, pkg.photos);

  return (
    <div id="photos">
      <Card
        title="Photos"
        description="At least one is needed to publish. JPEG, PNG, or WebP, up to 10 MB each and 20 in all."
      >
        {pkg.photos.length === 0 ? (
          <p className="text-body text-muted">No photos yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-inline-md md:grid-cols-4">
            {pkg.photos.map((photo, index) => (
              <li key={photo.id} className="flex flex-col gap-stack-sm">
                <Thumbnail
                  src={photo.url}
                  alt={`${pkg.property.streetLine}, view ${index + 1}`}
                  size="fill"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
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
      </Card>
    </div>
  );
}
