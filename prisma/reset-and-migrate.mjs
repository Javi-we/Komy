import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("1. Liberando conexiones inactivas y vaciando todas las tablas...");

  // 1. Crear nuevas tablas de historial por cuenta si no existen
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserWorkPreference" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "workId" TEXT NOT NULL,
      "isFavorite" BOOLEAN NOT NULL DEFAULT false,
      "status" TEXT NOT NULL DEFAULT 'PLAN_TO_READ',
      "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserWorkPreference_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserWorkPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "UserWorkPreference_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserWorkPreference_userId_workId_key" ON "UserWorkPreference"("userId", "workId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserWorkPreference_userId_idx" ON "UserWorkPreference"("userId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserVolumeProgress" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "volumeId" TEXT NOT NULL,
      "currentPage" INTEGER NOT NULL DEFAULT 1,
      "isCompleted" BOOLEAN NOT NULL DEFAULT false,
      "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserVolumeProgress_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserVolumeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "UserVolumeProgress_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserVolumeProgress_userId_volumeId_key" ON "UserVolumeProgress"("userId", "volumeId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserVolumeProgress_userId_idx" ON "UserVolumeProgress"("userId");
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Bookmark" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  `);

  // 2. Vaciar TODA la base de datos desde cero (Obras, Tomos, Capítulos, Marcadores, Estanterías, Progresos)
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "UserVolumeProgress",
      "UserWorkPreference",
      "Bookmark",
      "Chapter",
      "CollectionItem",
      "Collection",
      "Volume",
      "Work"
    RESTART IDENTITY CASCADE;
  `);

  console.log("✅ Base de datos vaciada 100% y tablas por usuario creadas con éxito.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
