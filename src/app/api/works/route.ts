export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyAdminRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const collectionId = searchParams.get("collectionId");

    const where: any = {};

    if (type && type !== "ALL") {
      where.type = type;
    }
    if (collectionId && collectionId !== "ALL") {
      where.collectionItems = {
        some: {
          collectionId,
        },
      };
    }
    if (search && search.trim() !== "") {
      where.OR = [
        { title: { contains: search.trim() } },
        { author: { contains: search.trim() } },
        { tags: { contains: search.trim() } },
      ];
    }

    const works = await prisma.work.findMany({
      where,
      include: {
        userPreferences: sessionUser
          ? { where: { userId: sessionUser.id } }
          : false,
        volumes: {
          orderBy: [{ sortOrder: "asc" }, { volumeNumber: "asc" }],
          include: {
            chapters: {
              orderBy: [{ sortOrder: "asc" }, { chapterNumber: "asc" }],
            },
            userProgresses: sessionUser
              ? { where: { userId: sessionUser.id } }
              : false,
            bookmarks: sessionUser
              ? {
                  where: { userId: sessionUser.id },
                  orderBy: { pageNumber: "asc" },
                }
              : false,
          },
        },
        collectionItems: {
          include: {
            collection: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    });

    // Obtener mapa de releaseYear y language desde la columna SQL si existen
    let yearMap: Record<string, number | null> = {};
    let langMap: Record<string, string | null> = {};
    try {
      const extraRows = (await prisma.$queryRawUnsafe(
        `SELECT "id", "releaseYear", "language" FROM "Work"`
      )) as Array<{ id: string; releaseYear: number | null; language: string | null }>;
      for (const r of extraRows) {
        yearMap[r.id] = r.releaseYear;
        langMap[r.id] = r.language;
      }
    } catch {
      try {
        const yearRows = (await prisma.$queryRawUnsafe(
          `SELECT "id", "releaseYear" FROM "Work"`
        )) as Array<{ id: string; releaseYear: number | null }>;
        for (const r of yearRows) {
          yearMap[r.id] = r.releaseYear;
        }
      } catch {}
    }

    // Mapear cada Obra y Tomo con el historial exclusivo de la cuenta actual (o limpio si no hay sesión)
    const personalizedWorks = works.map((w: any) => {
      const pref = w.userPreferences?.[0] || null;
      const mappedVolumes = w.volumes.map((v: any) => {
        const prog = v.userProgresses?.[0] || null;
        return {
          ...v,
          currentPage: prog ? prog.currentPage : 1,
          isCompleted: prog ? prog.isCompleted : false,
          lastReadAt: prog ? prog.lastReadAt : null,
          bookmarks: v.bookmarks || [],
          userProgresses: undefined,
        };
      });

      const hasStartedAnyVolume = mappedVolumes.some(
        (mv: any) => mv.lastReadAt || mv.currentPage > 1
      );
      const allCompleted =
        mappedVolumes.length > 0 &&
        mappedVolumes.every((mv: any) => mv.isCompleted);

      const userStatus = pref
        ? pref.status
        : allCompleted
        ? "COMPLETED"
        : hasStartedAnyVolume
        ? "READING"
        : "PLAN_TO_READ";

      return {
        ...w,
        releaseYear: yearMap[w.id] ?? w.releaseYear ?? null,
        language: langMap[w.id] ?? null,
        isFavorite: pref ? pref.isFavorite : false,
        status: userStatus,
        volumes: mappedVolumes,
        userPreferences: undefined,
      };
    });

    return NextResponse.json(personalizedWorks);
  } catch (error: any) {
    console.error("GET /api/works error:", error);
    return NextResponse.json(
      {
        error: "Error al obtener la biblioteca",
        details: error?.message || String(error),
        code: error?.code,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Solo el Administrador puede subir o crear nuevas obras." },
        { status: 403 }
      );
    }

    const sessionUser = await getSessionUser(req);
    const body = await req.json();

    const {
      title,
      subtitle,
      author,
      releaseYear,
      language,
      description,
      type = "MANGA",
      status = "PLAN_TO_READ",
      readingMode,
      coverUrl,
      tags = "",
      rating = 0,
    } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "El título de la obra es obligatorio" },
        { status: 400 }
      );
    }

    const defaultReadingMode =
      readingMode || (type === "MANGA" ? "MANGA_RTL" : "BOOK_LTR");

    const count = await prisma.work.count();

    const newWork = await prisma.work.create({
      data: {
        userId: sessionUser?.id || null,
        title: title.trim(),
        subtitle: subtitle?.trim() || null,
        author: author?.trim() || "Autor Desconocido",
        description: description?.trim() || null,
        type,
        status,
        readingMode: defaultReadingMode,
        coverUrl: coverUrl || null,
        tags,
        rating: Number(rating) || 0,
        isFavorite: false,
        sortOrder: count + 1,
      },
      include: {
        volumes: true,
      },
    });

    const parsedYear = releaseYear ? Number(releaseYear) : null;
    if (parsedYear && !isNaN(parsedYear)) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Work" SET "releaseYear" = $1 WHERE "id" = $2`,
          parsedYear,
          newWork.id
        );
      } catch {
        // Ignorar si no existe columna
      }
    }

    if (language) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Work" ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'ES'`
        );
        await prisma.$executeRawUnsafe(
          `UPDATE "Work" SET "language" = $1 WHERE "id" = $2`,
          language,
          newWork.id
        );
      } catch {
        // Ignorar si no existe columna
      }
    }

    return NextResponse.json(
      { ...newWork, releaseYear: parsedYear, language: language || null },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/works error:", error);
    return NextResponse.json(
      { error: "Error al crear la obra" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Solo el Administrador puede reordenar el catálogo." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: "Se requiere un arreglo orderedIds" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      orderedIds.map((id: string, index: number) =>
        prisma.work.update({
          where: { id },
          data: { sortOrder: index + 1 },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/works reorder error:", error);
    return NextResponse.json(
      { error: "Error al reordenar las obras" },
      { status: 500 }
    );
  }
}
