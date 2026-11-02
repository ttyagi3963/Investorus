// The stored object's type as the checks compare it (T397): an HTTP server may add parameters
// ("text/csv; charset=utf-8" from Express), so the storage adapters report the media type alone.
export const mediaType = (contentType: string): string =>
  contentType.split(";")[0]!.trim().toLowerCase();
