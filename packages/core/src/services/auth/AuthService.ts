// Signs a user in (T079, research R12): checks the email and password with bcrypt and issues an
// 8-hour HS256 JWT naming the user, role, and agent. Every failure gets the same message, and an
// unknown email still runs one bcrypt comparison, so neither the answer nor its timing tells a
// caller which emails have accounts.
import { createSessionSchema, type SessionResponse } from "@clever/contracts/auth";
import { ValidationError } from "@clever/contracts/common";
import { toUserView } from "@clever/contracts/user";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import type { IClock } from "../../providers/clock/IClock.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";

const SESSION_SECONDS = 8 * 60 * 60;
let decoyHash: string | undefined;
/** A hash to compare against when the email is unknown; made once, on first use. */
const decoy = () => (decoyHash ??= bcrypt.hashSync("not-a-password", 10));

export interface IAuthService {
  signIn(input: unknown): Promise<SessionResponse>;
}

export class AuthService implements IAuthService {
  private readonly key: Uint8Array;

  constructor(
    private readonly uow: IUnitOfWork,
    private readonly options: { jwtSecret: string; clock: IClock },
  ) {
    this.key = new TextEncoder().encode(options.jwtSecret);
  }

  async signIn(input: unknown): Promise<SessionResponse> {
    const { email, password } = createSessionSchema.parse(input);
    const found = await this.uow.run((repos) => repos.users.findByEmail(email));
    const matches = await bcrypt.compare(password, found?.passwordHash ?? decoy());
    if (!found || !matches || !found.user.active) {
      throw new ValidationError("Invalid email or password");
    }
    const { user } = found;
    const now = Math.floor(this.options.clock.now().getTime() / 1000);
    const token = await new SignJWT({ userId: user.id, role: user.role, agentId: user.agentId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + SESSION_SECONDS)
      .sign(this.key);
    return { token, user: toUserView(user) };
  }
}
