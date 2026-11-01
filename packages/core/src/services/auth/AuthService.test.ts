// Guards the sign-in rules (T078, research R12): the right email and password get an 8-hour token
// naming the user, role, and agent; every failure gets the same message, so a caller cannot learn
// which emails have accounts.
import { randomBytes } from "node:crypto";
import { ValidationError } from "@clever/contracts/common";
import type { UserCredentials } from "@clever/contracts/user";
import bcrypt from "bcryptjs";
import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { AuthService } from "./AuthService.js";

const NOW = new Date("2026-11-01T12:00:00Z");
/** Made fresh for each run, so no secret-like value sits in the code. */
const SECRET = randomBytes(32).toString("hex");
const at = (email: string, active = true): UserCredentials => ({
  user: {
    id: `user-${email}`,
    email,
    role: "AGENT",
    agentId: "agent-1",
    displayName: "Avery Agent",
    active,
    createdAt: NOW,
    updatedAt: NOW,
  },
  passwordHash: bcrypt.hashSync("demo1234", 4),
});
const service = () =>
  new AuthService(
    new InMemoryUnitOfWork([at("avery@example.com"), at("gone@example.com", false)]),
    {
      jwtSecret: SECRET,
      clock: { now: () => NOW },
    },
  );

describe("AuthService.signIn", () => {
  it("returns an 8-hour token naming the user, role, and agent, and the user's view", async () => {
    const { token, user } = await service().signIn({
      email: " Avery@Example.com ",
      password: "demo1234",
    });
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      currentDate: NOW,
    });
    expect(payload).toMatchObject({
      userId: "user-avery@example.com",
      role: "AGENT",
      agentId: "agent-1",
    });
    expect(payload.exp! - payload.iat!).toBe(8 * 60 * 60);
    expect(user).toEqual({
      id: "user-avery@example.com",
      email: "avery@example.com",
      role: "AGENT",
      displayName: "Avery Agent",
    });
  });

  it("gives a wrong password, an unknown email, and an inactive user the same answer", async () => {
    const attempts = [
      { email: "avery@example.com", password: "wrong" },
      { email: "nobody@example.com", password: "demo1234" },
      { email: "gone@example.com", password: "demo1234" },
    ];
    for (const attempt of attempts) {
      const err = await service()
        .signIn(attempt)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toBe("Invalid email or password");
    }
  });
});
