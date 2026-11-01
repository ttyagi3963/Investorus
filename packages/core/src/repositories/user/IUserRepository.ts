// The user port (T049): how services find a login. Only sign-in reads the password hash, through
// `findByEmail`, which returns it beside the user, never inside it.
import type { User, UserCredentials } from "@clever/contracts/user";

export interface IUserRepository {
  /** `email` is matched as stored: lowercase. */
  findByEmail(email: string): Promise<UserCredentials | null>;
  findById(id: string): Promise<User | null>;
}
