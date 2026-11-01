// Maps a database Deal row to the domain type, decrypting the fall-through reason: the only place
// the row type or the reason's ciphertext is seen (constitution IV, XII).
import type { Deal } from "@clever/contracts/deal";
import type { Deal as DealRow } from "../../generated/prisma/client.js";
import type { IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";

export const toDeal = (row: DealRow, cipher: IPiiCipher): Deal => ({
  ...row,
  fellThroughReason: row.fellThroughReason === null ? null : cipher.decrypt(row.fellThroughReason),
});
