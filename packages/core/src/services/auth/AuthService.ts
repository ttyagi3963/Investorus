// Sessions (T079, T253, research R12): signs a user in with bcrypt and issues an 8-hour HS256 JWT
// naming the user, role, and agent; verifies a token on every request (HS256 only, unexpired, and a
// payload that is a valid actor, whose user may still act); and answers /me while the user may act.
// A user may act while active and, for an investor's login, while the investor is ACTIVE, checked
// against the database on every request, so deactivation takes effect at once (T370). Every sign-in failure
// gets the same message, and an unknown email still runs one bcrypt comparison, so neither the
// answer nor its timing tells a caller which emails have accounts.
import {
  actorSchema,
  createSessionSchema,
  type Actor,
  type SessionResponse,
} from "@clever/contracts/auth";
import { UnauthenticatedError, ValidationError } from "@clever/contracts/common";
import { toUserView, type UserView } from "@clever/contracts/user";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { IClock } from "../../providers/clock/IClock.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";

const SESSION_SECONDS = 8 * 60 * 60;
let decoyHash: string | undefined;
/** A hash to compare against when the email is unknown; made once, on first use. */
const decoy = () => (decoyHash ??= bcrypt.hashSync("not-a-password", 10));

export interface IAuthService {
  signIn(input: unknown): Promise<SessionResponse>;
  /** The actor in a token this service signed; UnauthenticatedError for anything else. */
  verify(token: string): Promise<Actor>;
  /** The signed-in user's view (GET /me); UnauthenticatedError once they are inactive. */
  me(actor: Actor): Promise<UserView>;
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
    const mayAct =
      found !== null && (await this.uow.run((repos) => repos.users.canAct(found.user.id)));
    if (!found || !matches || !mayAct) {
      throw new ValidationError("Invalid email or password");
    }
    const { user } = found;
    const now = Math.floor(this.options.clock.now().getTime() / 1000);
    const claims =
      user.role === "INVESTOR"
        ? { userId: user.id, role: user.role, investorId: user.investorId }
        : { userId: user.id, role: user.role, agentId: user.agentId };
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + SESSION_SECONDS)
      .sign(this.key);
    return { token, user: toUserView(user) };
  }

  async verify(token: string): Promise<Actor> {
    let actor: Actor;
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        currentDate: this.options.clock.now(),
      });
      actor = actorSchema.parse({
        userId: payload.userId,
        role: payload.role,
        agentId: payload.agentId,
        investorId: payload.investorId,
      });
    } catch {
      throw new UnauthenticatedError("Sign in again");
    }
    // A valid token is not enough: its user, or their investor, may have been deactivated since.
    if (!(await this.uow.run((repos) => repos.users.canAct(actor.userId)))) {
      throw new UnauthenticatedError("Sign in again");
    }
    return actor;
  }

  async me(actor: Actor): Promise<UserView> {
    const user = await this.uow.run(async (repos) =>
      (await repos.users.canAct(actor.userId)) ? repos.users.findById(actor.userId) : null,
    );
    if (!user) throw new UnauthenticatedError("Sign in again");
    return toUserView(user);
  }
}
