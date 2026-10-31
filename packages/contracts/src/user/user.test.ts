// Guards the one user rule a unit test can protect: responses show only four fields, so an
// internal field (agentId, timestamps) is never sent to the browser by mistake.
import { describe, expect, it } from "vitest";
import { toUserView, type User } from "./index.js";

const agent = {
  id: "user-1",
  username: "agent.avery",
  role: "AGENT",
  displayName: "Avery Agent",
  agentId: "agent-1",
  active: true,
  createdAt: new Date("2026-10-31T12:00:00Z"),
  updatedAt: new Date("2026-10-31T12:00:00Z"),
} satisfies User;

describe("toUserView", () => {
  it("exposes only id, username, role, and display name", () => {
    expect(Object.keys(toUserView(agent)).sort()).toEqual([
      "displayName",
      "id",
      "role",
      "username",
    ]);
  });
});
