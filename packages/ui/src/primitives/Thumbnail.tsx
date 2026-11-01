// A listing's thumbnail (T327): its first photo, cropped to the thumbnail size, or a dashed
// "No image" box when it has none. Photos come from storage at their own address, so this is a
// plain lazy-loaded <img> rather than an optimized one.
export type ThumbnailProps = {
  /** The photo's address, or null when the listing has no photo yet. */
  src: string | null;
  /** What the photo shows, for screen readers. */
  alt: string;
  size?: "sm" | "fill";
};

const SIZES = {
  sm: "h-thumbnail-h w-thumbnail-w",
  fill: "aspect-4/3 w-full",
} as const;

export function Thumbnail({ src, alt, size = "sm" }: ThumbnailProps) {
  if (!src) {
    return (
      <div
        className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-control border border-dashed border-empty bg-placeholder text-caption text-muted`}
      >
        No image
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${SIZES[size]} shrink-0 rounded-control bg-placeholder object-cover`}
    />
  );
}
