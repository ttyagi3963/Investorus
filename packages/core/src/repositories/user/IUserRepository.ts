// The user port (T049): how services find a login. Only sign-in reads the password hash, through
// `findByEmail`, which returns it beside the user, never inside it. Matching finds an investor's
// login to notify it (T288), and the offer round finds the agent's (T306).
import type { User, UserCredentials } from "@clever/contracts/user";

export interface IUserRepository {
  /** `email` is matched as stored: lowercase. */
  findByEmail(email: string): Promise<UserCredentials | null>;
  findById(id: string): Promise<User | null>;
  /** The ID of the investor's login, or null when the investor has none. */
  findIdByInvestorId(investorId: string): Promise<string | null>;
  /** The ID of the agent's login, or null when the agent has none (T306: the agent's notices). */
  findIdByAgentId(agentId: string): Promise<string | null>;
}
