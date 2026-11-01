// Guards the encryption-at-rest rules (constitution XII, XX.1): seller PII is stored as versioned
// ciphertext that cannot be read or altered without the key, and duplicate addresses can be found
// without decrypting anything.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AesGcmPiiCipherImpl } from "./AesGcmPiiCipherImpl.js";
import { createAddressHasher } from "./address-hasher.js";

const key = `v1:${randomBytes(32).toString("base64")}`;

describe("AesGcmPiiCipherImpl", () => {
  it("encrypts with a random IV under a version prefix, and decrypts back", () => {
    const cipher = new AesGcmPiiCipherImpl(key);
    const a = cipher.encrypt("Maria Lopez");
    const b = cipher.encrypt("Maria Lopez");
    expect(a).toMatch(/^v1:/);
    expect(a).not.toContain("Maria");
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe("Maria Lopez");
  });

  it("refuses ciphertext that was altered", () => {
    const cipher = new AesGcmPiiCipherImpl(key);
    const stored = cipher.encrypt("Maria Lopez");
    const bytes = Buffer.from(stored.slice(3), "base64");
    bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 1, bytes.length - 1);
    expect(() => cipher.decrypt(`v1:${bytes.toString("base64")}`)).toThrow();
  });
});

describe("createAddressHasher", () => {
  it("gives the same hash for the same address however it is typed, and a different one otherwise", () => {
    const hash = createAddressHasher("demo-hash-key");
    const same = hash({ streetLine: "12 Elm St.", zip: "78701" });
    expect(hash({ streetLine: "  12  elm st ", zip: "78701" })).toBe(same);
    expect(hash({ streetLine: "14 Elm St", zip: "78701" })).not.toBe(same);
  });
});
