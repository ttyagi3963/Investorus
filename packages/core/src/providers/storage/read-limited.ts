// Reads a stored object's body only as far as the caller needs (T384), for both storage providers:
// the bytes up to a limit and whether more followed. Reading stops there and the rest of the
// stream is cancelled, so an object larger than expected is never held in memory whole.

export async function readLimited(
  body: AsyncIterable<Uint8Array>,
  limit: number,
): Promise<{ bytes: Buffer; more: boolean }> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    size += chunk.byteLength;
    // Leaving the loop cancels the stream.
    if (size > limit) return { bytes: Buffer.concat(chunks).subarray(0, limit), more: true };
  }
  return { bytes: Buffer.concat(chunks), more: false };
}
