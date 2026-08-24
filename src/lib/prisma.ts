import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnvironment } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const environment = getServerEnvironment();
  const connectionString = environment.databaseUrl;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pool = new Pool({
    connectionString,
    max: environment.databasePoolMax,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
