// What API responses show of a user (`POST /sessions`, `GET /me`): only what the browser needs.
// `toUserView` names each field, so nothing added to User later reaches a response by accident.
import type { User } from "./user.js";

export type UserView = Pick<User, "id" | "username" | "role" | "displayName">;

export const toUserView = (user: User): UserView => ({
  id: user.id,
  username: user.username,
  role: user.role,
  displayName: user.displayName,
});
