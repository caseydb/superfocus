import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaClientSingleton = () => {
  // Log environment variable status for debugging
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not defined in environment variables");
    console.error("Available env vars:", Object.keys(process.env).filter(key => key.includes('DATABASE') || key.includes('FIREBASE')));
  }
  
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
