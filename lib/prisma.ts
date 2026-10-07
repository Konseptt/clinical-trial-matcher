import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString ?? "postgresql://localhost/clinical_trial_matcher" }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;