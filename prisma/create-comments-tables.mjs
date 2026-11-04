import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creando tablas de Calificaciones (Historia, Arte, Personajes) y Comentarios...");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WorkRating" (
      "id" TEXT NOT NULL,
      "workId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "storyScore" DOUBLE PRECISION NOT NULL DEFAULT 8,
      "artScore" DOUBLE PRECISION NOT NULL DEFAULT 8,
      "charactersScore" DOUBLE PRECISION NOT NULL DEFAULT 8,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WorkRating_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "WorkRating_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "WorkRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WorkRating_userId_workId_key" ON "WorkRating"("userId", "workId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WorkRating_workId_idx" ON "WorkRating"("workId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WorkComment" (
      "id" TEXT NOT NULL,
      "workId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WorkComment_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "WorkComment_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "WorkComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WorkComment_workId_createdAt_idx" ON "WorkComment"("workId", "createdAt" DESC);
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WorkCommentLike" (
      "id" TEXT NOT NULL,
      "commentId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WorkCommentLike_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "WorkCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "WorkComment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "WorkCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WorkCommentLike_commentId_userId_key" ON "WorkCommentLike"("commentId", "userId");
  `);

  await prisma.$executeRawUnsafe(`
    DELETE FROM "User" WHERE "googleId" LIKE 'google-%';
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Work" ADD COLUMN IF NOT EXISTS "releaseYear" INTEGER;
  `);

  console.log("✅ Tablas WorkRating, WorkComment, WorkCommentLike y columna releaseYear listas!");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
