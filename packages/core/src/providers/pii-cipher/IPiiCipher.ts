// The ports for seller PII at rest (constitution XII, XX.1): a cipher the repository mappers use to
// encrypt and decrypt, and an address hash that finds duplicates without decrypting anything.

export interface IPiiCipher {
  encrypt(plaintext: string): string;
  decrypt(stored: string): string;
}

export type AddressHasher = (address: { streetLine: string; zip: string }) => string;
