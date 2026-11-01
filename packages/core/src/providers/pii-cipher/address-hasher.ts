// Hashes an address (HMAC-SHA256 with ADDRESS_HASH_KEY) after normalizing it, so "12 Elm St." and
// " 12  elm st " match. The hash finds a package for the same address (FR-013) without decrypting
// the street, and the key keeps it from being guessed by hashing known addresses.
import { createHmac } from "node:crypto";
import type { AddressHasher } from "./IPiiCipher.js";

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function createAddressHasher(key: string): AddressHasher {
  return ({ streetLine, zip }) =>
    createHmac("sha256", key)
      .update(`${normalize(streetLine)}|${normalize(zip)}`)
      .digest("hex");
}
