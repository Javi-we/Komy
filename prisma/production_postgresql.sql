-- =============================================================================
-- ESQUEMA SQL POSTGRESQL PARA PRODUCCIÓN (Supabase, Railway, Neon, Render, VPS)
-- Base de datos estructurada para App de Lectura de Mangas y Libros (KomaRead)
-- Incluye tabla User para Inicio de Sesión con Google (Gmail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "picture" TEXT,
    "googleId" TEXT UNIQUE,
    "role" TEXT NOT NULL DEFAULT 'USER', -- 'ADMIN' | 'USER'
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Work" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "author" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'MANGA', -- 'MANGA', 'BOOK', 'LIGHT_NOVEL', 'COMIC'
    "status" TEXT NOT NULL DEFAULT 'READING', -- 'READING', 'PLAN_TO_READ', 'COMPLETED', 'ON_HOLD'
    "readingMode" TEXT NOT NULL DEFAULT 'MANGA_RTL', -- 'MANGA_RTL', 'BOOK_LTR', 'WEBTOON_VERTICAL'
    "coverUrl" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tags" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Work_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Volume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workId" TEXT NOT NULL,
    "volumeNumber" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "coverUrl" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "totalPages" INTEGER NOT NULL DEFAULT 1,
    "currentPage" INTEGER NOT NULL DEFAULT 1,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Volume_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "volumeId" TEXT NOT NULL,
    "chapterNumber" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "startPage" INTEGER NOT NULL DEFAULT 1,
    "fileUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Chapter_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Bookmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bookmark_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bookmark_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#8b5cf6',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CollectionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionItem_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionItem_collectionId_workId_key" UNIQUE ("collectionId", "workId")
);

CREATE INDEX IF NOT EXISTS "Work_userId_idx" ON "Work"("userId");
CREATE INDEX IF NOT EXISTS "Work_type_idx" ON "Work"("type");
CREATE INDEX IF NOT EXISTS "Work_status_idx" ON "Work"("status");
CREATE INDEX IF NOT EXISTS "Work_sortOrder_idx" ON "Work"("sortOrder");
CREATE INDEX IF NOT EXISTS "Volume_workId_sortOrder_idx" ON "Volume"("workId", "sortOrder");
CREATE INDEX IF NOT EXISTS "Volume_workId_volumeNumber_idx" ON "Volume"("workId", "volumeNumber");
CREATE INDEX IF NOT EXISTS "Chapter_volumeId_sortOrder_idx" ON "Chapter"("volumeId", "sortOrder");
CREATE INDEX IF NOT EXISTS "Bookmark_volumeId_pageNumber_idx" ON "Bookmark"("volumeId", "pageNumber");
CREATE INDEX IF NOT EXISTS "Collection_userId_idx" ON "Collection"("userId");
