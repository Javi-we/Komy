export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/storage";
import { getSessionUser, verifyAdminRequest } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser(req);
    const work: any = await prisma.work.findUnique({
      where: { id: params.id },
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
    });

    if (!work) {
      return NextResponse.json(
        { error: "Obra no encontrada" },
        { status: 404 }
      );
    }

    const pref = work.userPreferences?.[0] || null;
    const mappedVolumes = work.volumes.map((v: any) => {
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

    let workReleaseYear: number | null = null;
    let workLanguage: string | null = null;
    try {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT "releaseYear", "language" FROM "Work" WHERE "id" = $1`,
        params.id
      )) as Array<{ releaseYear: number | null; language: string | null }>;
      workReleaseYear = rows[0]?.releaseYear ?? null;
      workLanguage = rows[0]?.language ?? null;
    } catch {
      try {
        const rows = (await prisma.$queryRawUnsafe(
          `SELECT "releaseYear" FROM "Work" WHERE "id" = $1`,
          params.id
        )) as Array<{ releaseYear: number | null }>;
        workReleaseYear = rows[0]?.releaseYear ?? null;
      } catch {
        // Fallback silencioso
      }
    }

    return NextResponse.json({
      ...work,
      releaseYear: workReleaseYear,
      language: workLanguage ?? null,
      isFavorite: pref ? pref.isFavorite : false,
      status: pref ? pref.status : work.status,
      volumes: mappedVolumes,
      userPreferences: undefined,
    });
  } catch (error) {
    console.error("GET /api/works/[id] error:", error);
    return NextResponse.json(
      { error: "Error al obtener detalles de la obra" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const sessionUser = await getSessionUser(req);
    const isAdmin = await verifyAdminRequest(req);

    const isModifyingAdminFields =
      body.title !== undefined ||
      body.subtitle !== undefined ||
      body.author !== undefined ||
      body.releaseYear !== undefined ||
      body.description !== undefined ||
      body.type !== undefined ||
      body.coverUrl !== undefined ||
      body.tags !== undefined ||
      body.sortOrder !== undefined;

    if (isModifyingAdminFields && !isAdmin) {
      return NextResponse.json(
        { error: "Solo el Administrador puede editar los datos o la portada de la obra." },
        { status: 403 }
      );
    }

    const existing = await prisma.work.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Obra no encontrada" },
        { status: 404 }
      );
    }

    // 1. Guardar preferencias individuales de la cuenta actual (Favorito, Estado)
    if (
      sessionUser &&
      (body.isFavorite !== undefined || body.status !== undefined)
    ) {
      await prisma.userWorkPreference.upsert({
        where: {
          userId_workId: {
            userId: sessionUser.id,
            workId: params.id,
          },
        },
        update: {
          ...(body.isFavorite !== undefined
            ? { isFavorite: Boolean(body.isFavorite) }
            : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
        create: {
          userId: sessionUser.id,
          workId: params.id,
          isFavorite:
            body.isFavorite !== undefined ? Boolean(body.isFavorite) : false,
          status: body.status || "PLAN_TO_READ",
        },
      });
    }

    // 2. Si el Admin modificó datos del catálogo global
    const data: any = {};
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.subtitle !== undefined)
      data.subtitle = body.subtitle?.trim() || null;
    if (body.author !== undefined) data.author = body.author?.trim() || null;
    if (body.description !== undefined)
      data.description = body.description?.trim() || null;
    if (body.type !== undefined) data.type = body.type;
    if (body.status !== undefined) data.status = body.status;
    if (body.readingMode !== undefined) data.readingMode = body.readingMode;
    if (body.coverUrl !== undefined) data.coverUrl = body.coverUrl;
    if (body.rating !== undefined) data.rating = Number(body.rating);
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);

    if (Object.keys(data).length > 0 && isAdmin) {
      await prisma.work.update({
        where: { id: params.id },
        data,
      });
    }

    if (body.releaseYear !== undefined && isAdmin) {
      const parsedYear =
        body.releaseYear === null || body.releaseYear === ""
          ? null
          : Number(body.releaseYear) || null;
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Work" SET "releaseYear" = $1 WHERE "id" = $2`,
          parsedYear,
          params.id
        );
      } catch {
        // Ignorar si no existe columna
      }
    }

    if (body.language !== undefined && isAdmin) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Work" ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'ES'`
        );
        await prisma.$executeRawUnsafe(
          `UPDATE "Work" SET "language" = $1 WHERE "id" = $2`,
          body.language || null,
          params.id
        );
      } catch {
        // Ignorar si no existe columna
      }
    }

    // Devolver la obra con el estado personalizado del usuario actual
    const updated: any = await prisma.work.findUnique({
      where: { id: params.id },
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
    });

    let updatedReleaseYear: number | null = null;
    let updatedLanguage: string | null = null;
    try {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT "releaseYear", "language" FROM "Work" WHERE "id" = $1`,
        params.id
      )) as Array<{ releaseYear: number | null; language: string | null }>;
      updatedReleaseYear = rows[0]?.releaseYear ?? null;
      updatedLanguage = rows[0]?.language ?? null;
    } catch {
      try {
        const rows = (await prisma.$queryRawUnsafe(
          `SELECT "releaseYear" FROM "Work" WHERE "id" = $1`,
          params.id
        )) as Array<{ releaseYear: number | null }>;
        updatedReleaseYear = rows[0]?.releaseYear ?? null;
      } catch {
        // Fallback silencioso
      }
    }

    const pref = updated.userPreferences?.[0] || null;
    const mappedVolumes = updated.volumes.map((v: any) => {
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

    return NextResponse.json({
      ...updated,
      releaseYear: updatedReleaseYear,
      language: updatedLanguage ?? null,
      isFavorite: pref
        ? pref.isFavorite
        : body.isFavorite !== undefined
        ? Boolean(body.isFavorite)
        : false,
      status: pref ? pref.status : body.status || updated.status,
      volumes: mappedVolumes,
      userPreferences: undefined,
    });
  } catch (error) {
    console.error("PATCH /api/works/[id] error:", error);
    return NextResponse.json(
      { error: "Error al actualizar la obra" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Solo el Administrador puede eliminar obras." },
        { status: 403 }
      );
    }

    const work = await prisma.work.findUnique({
      where: { id: params.id },
      include: { volumes: true },
    });

    if (!work) {
      return NextResponse.json(
        { error: "Obra no encontrada" },
        { status: 404 }
      );
    }

    await deleteUploadedFile(work.coverUrl);
    for (const vol of work.volumes) {
      await deleteUploadedFile(vol.coverUrl);
      await deleteUploadedFile(vol.fileUrl);
    }

    await prisma.work.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/works/[id] error:", error);
    return NextResponse.json(
      { error: "Error al eliminar la obra" },
      { status: 500 }
    );
  }
}
