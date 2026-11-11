import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { env } from '../config/env.js';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Runs a database transaction setting `app.user_id` in session context for RLS policies.
 * The configuration is scoped strictly to the transaction (SET LOCAL equivalent),
 * ensuring safe execution even with connection poolers like PgBouncer.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const id = z.string().uuid().parse(userId);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.user_id', ${id}, true)`;
      return fn(tx);
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
