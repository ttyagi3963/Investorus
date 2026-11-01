// Encrypts seller PII with AES-256-GCM: a random 12-byte IV per value, stored as
// `<keyVersion>:<base64 of IV, auth tag, ciphertext>`. The version prefix lets a key be rotated
// later; GCM's auth tag makes any altered value fail to decrypt.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { IPiiCipher } from "./IPiiCipher.js";

const IV_BYTES = 12;
const TAG_BYTES = 16;

export class AesGcmPiiCipherImpl implements IPiiCipher {
  readonly #version: string;
  readonly #key: Buffer;

  /** `keyring` is `PII_ENCRYPTION_KEY`: `<version>:<base64 of 32 bytes>`, e.g. `v1:…`. */
  constructor(keyring: string) {
    const [version, encoded] = keyring.split(":");
    const key = Buffer.from(encoded ?? "", "base64");
    if (!version || key.length !== 32) {
      throw new Error("PII_ENCRYPTION_KEY must be <version>:<base64 of 32 bytes>");
    }
    this.#version = version;
    this.#key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    return `${this.#version}:${packed.toString("base64")}`;
  }

  decrypt(stored: string): string {
    const at = stored.indexOf(":");
    if (stored.slice(0, at) !== this.#version) throw new Error("Unknown PII key version");
    const packed = Buffer.from(stored.slice(at + 1), "base64");
    const decipher = createDecipheriv("aes-256-gcm", this.#key, packed.subarray(0, IV_BYTES));
    decipher.setAuthTag(packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(packed.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  }
}
