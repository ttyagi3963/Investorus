// Checks deactivation against a real Postgres (T370, T398; FR-024, XII): a banned login (its user
// switched off) stops working the moment it is banned and cannot sign in; reactivating restores
// access. An investor marked INACTIVE (as the legacy import's Active = N does) is only not matched,
// and keeps signing in.
import { randomBytes } from "node:crypto";
import { UnauthenticatedError, ValidationError } from "@clever/contracts/common";
import bcrypt from "bcryptjs";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { AuthService } from "../src/services/auth/AuthService.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;
let auth: AuthService;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  const uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );
  auth = new AuthService(uow, {
    jwtSecret: randomBytes(32).toString("hex"),
    clock: { now: () => new Date() },
  });
  await db.query(
    `INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
       VALUES ('investor-1', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now());
     INSERT INTO "User" (id, email, "passwordHash", role, "displayName", "investorId", "updatedAt")
       VALUES ('user-summit', 'summit@example.test', $1, 'INVESTOR', 'Sam', 'investor-1', now());`.replace(
      "$1",
      `'${bcrypt.hashSync("demo1234", 4)}'`,
    ),
  );
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("deactivation", () => {
  it("keeps an inactive investor signed in, and ends a banned login's session at once", async () => {
    const signIn = () => auth.signIn({ email: "summit@example.test", password: "demo1234" });
    const { token } = await signIn();

    await db.query(`UPDATE "Investor" SET status = 'INACTIVE' WHERE id = 'investor-1'`);
    expect(await auth.verify(token)).toMatchObject({ investorId: "investor-1" });
    await expect(signIn()).resolves.toMatchObject({ token: expect.any(String) });

    await db.query(`UPDATE "User" SET active = false WHERE id = 'user-summit'`);
    await expect(auth.verify(token)).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(signIn()).rejects.toBeInstanceOf(ValidationError);

    await db.query(`UPDATE "User" SET active = true WHERE id = 'user-summit'`);
    expect(await auth.verify(token)).toMatchObject({ investorId: "investor-1" });
  });
});
