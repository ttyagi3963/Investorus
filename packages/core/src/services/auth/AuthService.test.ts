// Guards the sign-in and token rules (T078, T253, research R12): the right email and password get an
// 8-hour token naming the user, role, and agent; every failure gets the same message, so a caller
// cannot learn which emails have accounts; and only an unexpired HS256 token we signed is accepted.
import { randomBytes } from "node:crypto";
import { UnauthenticatedError, ValidationError } from "@clever/contracts/common";
import type { UserCredentials } from "@clever/contracts/user";
import bcrypt from "bcryptjs";
import { SignJWT, UnsecuredJWT, jwtVerify } from "jose";
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
const investor: UserCredentials = {
  user: {
    id: "user-summit",
    email: "summit@example.com",
    role: "INVESTOR",
    agentId: null,
    investorId: "investor-1",
    displayName: "Summit Capital",
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  passwordHash: bcrypt.hashSync("demo1234", 4),
};
const service = () =>
  new AuthService(
    new InMemoryUnitOfWork([at("avery@example.com"), at("gone@example.com", false), investor]),
    {
      jwtSecret: SECRET,
      clock: { now: () => NOW },
    },
  );

describe("AuthService.signIn", () => {
  it("returns an 8-hour token naming the user, role, and agent, and the user's view", async () => {
    const { token, user } = await service().signIn({
      email: "avery@example.com",
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

  it("gives an investor a session that names their investor, which the services rely on", async () => {
    const auth = service();
    const { token } = await auth.signIn({ email: "summit@example.com", password: "demo1234" });
    await expect(auth.verify(token)).resolves.toEqual({
      userId: "user-summit",
      role: "INVESTOR",
      investorId: "investor-1",
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

describe("AuthService.verify", () => {
  const claims = { userId: "user-avery@example.com", role: "AGENT", agentId: "agent-1" };
  const sign = (alg: string, key = SECRET) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(key));

  it("returns the actor for a token it signed", async () => {
    const { token } = await service().signIn({ email: "avery@example.com", password: "demo1234" });
    expect(await service().verify(token)).toEqual(claims);
  });

  it("refuses an expired, tampered, wrongly signed, or unsigned token", async () => {
    const { token } = await service().signIn({ email: "avery@example.com", password: "demo1234" });
    const later = new AuthService(new InMemoryUnitOfWork(), {
      jwtSecret: SECRET,
      clock: { now: () => new Date(NOW.getTime() + 9 * 60 * 60 * 1000) },
    });
    const [head, body, sig] = token.split(".");
    const tampered = `${head}.${Buffer.from(JSON.stringify({ ...claims, role: "OPS", agentId: null })).toString("base64url")}.${sig}`;
    const refused = [
      () => later.verify(token),
      () => service().verify(tampered),
      async () => service().verify(await sign("HS256", randomBytes(32).toString("hex"))),
      async () => service().verify(await sign("HS512")),
      () =>
        service().verify(new UnsecuredJWT(claims).setIssuedAt().setExpirationTime("1h").encode()),
      () => service().verify(`${head}.${body}`),
    ];
    for (const attempt of refused) {
      await expect(attempt()).rejects.toBeInstanceOf(UnauthenticatedError);
    }
  });

  it("refuses a banned login's token at once, while an inactive investor keeps access (T370, T398)", async () => {
    const uow = new InMemoryUnitOfWork([at("avery@example.com"), investor]);
    const auth = new AuthService(uow, { jwtSecret: SECRET, clock: { now: () => NOW } });
    const signIn = (email: string) => auth.signIn({ email, password: "demo1234" });
    const agentToken = (await signIn("avery@example.com")).token;
    const investorToken = (await signIn("summit@example.com")).token;

    (await uow.repos.users.findById("user-avery@example.com"))!.active = false;
    uow.repos.investors.inactive.add("investor-1");

    await expect(auth.verify(agentToken)).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(signIn("avery@example.com")).rejects.toBeInstanceOf(ValidationError);
    await expect(auth.verify(investorToken)).resolves.toMatchObject({ investorId: "investor-1" });
  });

  it("answers /me only while the user is still active", async () => {
    const actor = { userId: "user-avery@example.com", role: "AGENT" as const, agentId: "agent-1" };
    expect(await service().me(actor)).toMatchObject({ email: "avery@example.com" });
    const gone = { ...actor, userId: "user-gone@example.com" };
    await expect(service().me(gone)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
