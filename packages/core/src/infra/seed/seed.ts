// The demo data the reviewer signs in with (T260): one agent and its AGENT login, upserted by email,
// so running it on every `docker compose up` adds nothing. The password is a demo value listed in
// the README; it is stored only as a bcrypt hash.
import bcrypt from "bcryptjs";
import type { PrismaClient } from "../../generated/prisma/client.js";

export const DEMO_PASSWORD = "demo1234";

const DEMO_AGENTS = [
  { name: "Avery Agent", email: "avery@example.com", brokerage: "Demo Realty" },
] as const;

export async function seedDemoAccounts(prisma: PrismaClient): Promise<void> {
  for (const demo of DEMO_AGENTS) {
    const agent = await prisma.agent.upsert({
      where: { email: demo.email },
      create: demo,
      update: {},
    });
    await prisma.user.upsert({
      where: { email: demo.email },
      create: {
        email: demo.email,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: "AGENT",
        displayName: demo.name,
        agentId: agent.id,
      },
      update: {},
    });
  }
}
