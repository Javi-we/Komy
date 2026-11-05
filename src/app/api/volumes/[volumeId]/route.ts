export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/storage";
import { getSessionUser, verifyAdminRequest } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { volumeId: string } }
) {
  try {
    const sessionUser = await getSessionUser(req);
    const volume: any = await prisma.volume.findUnique({
      where: { id: params.volumeId },
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
    });

    if (!volume) {
      return NextResponse.json(
        { error: "Tomo no encontrado" },
        { status: 404 }
      );
    }

    const prog = volume.userProgresses?.[0] || null;
    return NextResponse.json({
      ...volume,
      currentPage: prog ? prog.currentPage : 1,
      isCompleted: prog ? prog.isCompleted : false,
      lastReadAt: prog ? prog.lastReadAt : null,
      bookmarks: volume.bookmarks || [],
      userProgresses: undefined,
    });
  } catch (error) {
    console.error("GET /api/volumes/[volumeId] error:", error);
    return NextResponse.json(
      { error: "Error al obtener detalles del tomo" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { volumeId: string } }
) {
  try {
    const body = await req.json();
    const sessionUser = await getSessionUser(req);
    const isAdmin = await verifyAdminRequest(req);

    const isEditingAdminProps =
      body.title !== undefined ||
      body.volumeNumber !== undefined ||
      body.sortOrder !== undefined ||
      body.coverUrl !== undefined ||
      body.fileUrl !== undefined;

    if (isEditingAdminProps && !isAdmin) {
      return NextResponse.json(
        { error: "Solo el Administrador puede modificar archivos o portadas del tomo." },
        { status: 403 }
      );
    }

    const existing = await prisma.volume.findUnique({
      where: { id: params.volumeId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tomo no encontrado" },
        { status: 404 }
      );
    }

    // 1. Si el usuario inició sesión con su cuenta de Google, guardar su progreso individual en UserVolumeProgress
    if (
      sessionUser &&
      (body.currentPage !== undefined || body.isCompleted !== undefined)
    ) {
      const nextCurrentPage =
        body.currentPage !== undefined
          ? Math.max(1, Number(body.currentPage))
          : 1;
      const nextCompleted =
        body.isCompleted !== undefined ? Boolean(body.isCompleted) : false;

      await prisma.userVolumeProgress.upsert({
        where: {
          userId_volumeId: {
            userId: sessionUser.id,
            volumeId: params.volumeId,
          },
        },
        update: {
          ...(body.currentPage !== undefined
            ? { currentPage: nextCurrentPage, lastReadAt: new Date() }
            : {}),
          ...(body.isCompleted !== undefined
            ? { isCompleted: nextCompleted }
            : {}),
        },
        create: {
          userId: sessionUser.id,
          volumeId: params.volumeId,
          currentPage: nextCurrentPage,
          isCompleted: nextCompleted,
          lastReadAt: new Date(),
        },
      });
    }

    // 2. Actualizar metadatos del tomo en el catálogo si aplica (totalPages o campos de Admin)
    const data: any = {};
    if (body.title !== undefined && isAdmin) data.title = body.title.trim();
    if (body.volumeNumber !== undefined && isAdmin)
      data.volumeNumber = Number(body.volumeNumber);
    if (body.sortOrder !== undefined && isAdmin)
      data.sortOrder = Number(body.sortOrder);
    if (body.synopsis !== undefined && isAdmin)
      data.synopsis = body.synopsis?.trim() || null;
    if (body.coverUrl !== undefined && isAdmin) data.coverUrl = body.coverUrl;
    if (body.fileUrl !== undefined && isAdmin) data.fileUrl = body.fileUrl;
    if (body.fileName !== undefined && isAdmin) data.fileName = body.fileName;
    if (body.fileSize !== undefined && isAdmin)
      data.fileSize = Number(body.fileSize);
    if (body.totalPages !== undefined)
      data.totalPages = Math.max(1, Number(body.totalPages));

    if (Object.keys(data).length > 0) {
      await prisma.volume.update({
        where: { id: params.volumeId },
        data,
      });
    }

    const updated: any = await prisma.volume.findUnique({
      where: { id: params.volumeId },
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
    });

    const prog = updated.userProgresses?.[0] || null;
    return NextResponse.json({
      ...updated,
      currentPage: prog
        ? prog.currentPage
        : body.currentPage !== undefined
        ? Number(body.currentPage)
        : 1,
      isCompleted: prog
        ? prog.isCompleted
        : body.isCompleted !== undefined
        ? Boolean(body.isCompleted)
        : false,
      lastReadAt: prog ? prog.lastReadAt : null,
      bookmarks: updated.bookmarks || [],
      userProgresses: undefined,
    });
  } catch (error) {
    console.error("PATCH /api/volumes/[volumeId] error:", error);
    return NextResponse.json(
      { error: "Error al actualizar el tomo" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { volumeId: string } }
) {
  try {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Solo el Administrador puede eliminar tomos." },
        { status: 403 }
      );
    }

    const existing = await prisma.volume.findUnique({
      where: { id: params.volumeId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tomo no encontrado" },
        { status: 404 }
      );
    }

    await deleteUploadedFile(existing.coverUrl);
    await deleteUploadedFile(existing.fileUrl);

    await prisma.volume.delete({
      where: { id: params.volumeId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/volumes/[volumeId] error:", error);
    return NextResponse.json(
      { error: "Error al eliminar el tomo" },
      { status: 500 }
    );
  }
}
