// The demo data the reviewer signs in with (T260, T299, T314, T323): two agents, five investors with
// their buy boxes, an operations login, and a login for each, upserted by email (boxes by investor
// and name), so running it on every `docker compose up` adds nothing. Each seeded box gets its
// version snapshot, as a save would write. Blake's deal demo is in deal-demo.ts. The password is a demo value listed in the README; it is
// stored only as a bcrypt hash. expected-matches.json records which boxes match the sample listing.
import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { toBuyBox } from "../../repositories/buy-box/buy-box.mapper.js";

export const DEMO_PASSWORD = "demo1234";

const DEMO_AGENTS = [
  { name: "Avery Agent", email: "avery@example.com", brokerage: "Demo Realty" },
  { name: "Blake Agent", email: "blake@example.com", brokerage: "Demo Realty" },
] as const;

type DemoBox = Omit<Prisma.BuyBoxUncheckedCreateInput, "investorId" | "geographyMode"> & {
  name: string;
  places?: { kind: "STATE" | "ZIP"; values: string[] };
};

const DEMO_INVESTORS: {
  email: string;
  companyName: string;
  contactName: string;
  /** A demo number, so a match notice also shows up as a text in the sandbox (T339). */
  phone?: string;
  boxes: DemoBox[];
}[] = [
  {
    email: "summit@example.com",
    companyName: "Summit Home Buyers",
    contactName: "Sam Summit",
    phone: "+15125550100",
    // Both boxes match the sample listing: Austin 78704, single family, Fair, $250k–$300k.
    boxes: [
      {
        name: "Austin flips",
        strategy: "FIX_FLIP",
        places: { kind: "ZIP", values: ["78704", "78745"] },
        propertyTypes: ["SINGLE_FAMILY"],
        priceMin: 250_000,
        priceMax: 300_000,
        conditionsAccepted: ["FAIR", "POOR"],
      },
      {
        name: "Texas rentals",
        strategy: "BUY_HOLD",
        places: { kind: "STATE", values: ["TX"] },
        propertyTypes: ["SINGLE_FAMILY", "TOWNHOME"],
        priceMax: 350_000,
        bedsMin: 2,
      },
    ],
  },
  {
    email: "harbor@example.com",
    companyName: "Harbor Capital",
    contactName: "Hal Harbor",
    boxes: [{ name: "Anywhere", strategy: "WHOLESALE" }],
  },
  {
    email: "ridge@example.com",
    companyName: "Ridge Investments",
    contactName: "Rae Ridge",
    // Narrow on purpose: it does not match the sample listing.
    boxes: [
      {
        name: "Dallas condos",
        places: { kind: "ZIP", values: ["75201", "75204"] },
        propertyTypes: ["CONDO"],
        priceMax: 200_000,
      },
    ],
  },
  // Cobalt and Dune complete Blake's deal demo (T314): both boxes fit its 78745 listing, and
  // neither covers the sample listing's 78704, so expected-matches.json is unchanged.
  {
    email: "cobalt@example.com",
    companyName: "Cobalt Property Group",
    contactName: "Cam Cobalt",
    boxes: [
      {
        name: "Austin starter homes",
        strategy: "BUY_HOLD",
        places: { kind: "ZIP", values: ["78744", "78745"] },
        propertyTypes: ["SINGLE_FAMILY"],
        priceMax: 320_000,
      },
    ],
  },
  {
    email: "dune@example.com",
    companyName: "Dune Holdings",
    contactName: "Dee Dune",
    boxes: [
      {
        name: "South Austin flips",
        strategy: "FIX_FLIP",
        places: { kind: "ZIP", values: ["78745", "78748", "78749"] },
        priceMin: 200_000,
        priceMax: 350_000,
        conditionsAccepted: ["FAIR", "POOR", "DISTRESSED"],
      },
    ],
  },
];

const DEMO_OPS = { email: "morgan@example.com", displayName: "Morgan Ops" } as const;

const YEAR = 365 * 24 * 60 * 60 * 1_000;

export async function seedDemoAccounts(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
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
        passwordHash,
        role: "AGENT",
        displayName: demo.name,
        agentId: agent.id,
      },
      update: {},
    });
  }

  await prisma.user.upsert({
    where: { email: DEMO_OPS.email },
    create: { ...DEMO_OPS, passwordHash, role: "OPS" },
    update: {},
  });

  for (const { email, companyName, contactName, phone, boxes } of DEMO_INVESTORS) {
    const investor = await prisma.investor.upsert({
      where: { email },
      create: {
        email,
        companyName,
        contactName,
        phone: phone ?? null,
        investorType: "DIRECT_BUYER",
        proofOfFundsExpiresAt: new Date(Date.now() + YEAR),
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        role: "INVESTOR",
        displayName: contactName,
        investorId: investor.id,
      },
      update: {},
    });
    for (const { places, ...box } of boxes) {
      // A list criterion left out stays NULL ("any"); the CHECKs refuse an empty list.
      const saved = await prisma.buyBox.upsert({
        where: { investorId_name: { investorId: investor.id, name: box.name } },
        create: {
          ...box,
          investorId: investor.id,
          geographyMode: !places ? "NATIONWIDE" : places.kind === "ZIP" ? "ZIPS" : "STATES",
        },
        update: {},
      });
      if (places) {
        await prisma.buyBoxGeography.createMany({
          data: places.values.map((value) => ({ buyBoxId: saved.id, kind: places.kind, value })),
          skipDuplicates: true,
        });
      }
    }
  }
}

/** Every seeded box's current version as a snapshot, once (the deal demo's boxes included). */
export async function seedBuyBoxVersions(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.buyBox.findMany({ include: { geography: true } });
  await prisma.buyBoxVersion.createMany({
    data: rows.map((row) => {
      const { id, investorId: _investorId, version, ...snapshot } = toBuyBox(row);
      return { buyBoxId: id, version, snapshot };
    }),
    skipDuplicates: true,
  });
}
