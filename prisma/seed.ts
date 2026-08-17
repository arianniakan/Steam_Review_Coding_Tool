import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const aiCoder = await prisma.coder.upsert({
    where: { email: "ai@system.local" },
    update: {},
    create: {
      kind: "AI",
      name: "AI Coder",
      email: "ai@system.local",
    },
  });

  const researcher = await prisma.coder.upsert({
    where: { email: "researcher@example.com" },
    update: {},
    create: {
      kind: "HUMAN",
      name: "Default Researcher",
      email: "researcher@example.com",
    },
  });

  console.log("Seeded coders:", { aiCoder, researcher });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
