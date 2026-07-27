import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Force new PrismaClient if the cached one is stale (missing new models).
// In dev, globalThis persists across HMR reloads, so the cached client may
// not have newly-added Prisma models.
const cached = globalForPrisma.prisma
const isStale = cached && typeof (cached as Record<string, unknown>).aIConnector === 'undefined'

if (isStale) {
  try { cached!.$disconnect() } catch { /* ignore */ }
  globalForPrisma.prisma = undefined
}

export const db =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['query'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db