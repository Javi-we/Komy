import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Solo el Administrador puede subir o agregar nuevos tomos." },
        { status: 403 }
      );
    }

    const workId = params.id;
    const body = await req.json();

    const existingVolumes = await prisma.volume.findMany({
      where: { workId },
      orderBy: { sortOrder: "desc" },
    });

    const nextSortOrder =
      existingVolumes.length > 0 ? existingVolumes[0].sortOrder + 1 : 1;
    const defaultVolNum =
      body.volumeNumber !== undefined
        ? Number(body.volumeNumber)
        : existingVolumes.length + 1;

    const title = body.title?.trim() || `Tomo ${defaultVolNum}`;

    const newVolume = await prisma.volume.create({
      data: {
        workId,
        volumeNumber: defaultVolNum,
        sortOrder: nextSortOrder,
        title,
        synopsis: body.synopsis?.trim() || null,
        coverUrl: body.coverUrl || null,
        fileUrl: body.fileUrl || null,
        fileName: body.fileName || null,
        fileSize: Number(body.fileSize) || 0,
        totalPages: Number(body.totalPages) || 1,
        currentPage: 1,
      },
      include: {
        chapters: true,
        bookmarks: true,
      },
    });

    if (body.coverUrl) {
      const parentWork = await prisma.work.findUnique({ where: { id: workId } });
      if (parentWork && !parentWork.coverUrl) {
        await prisma.work.update({
          where: { id: workId },
          data: { coverUrl: body.coverUrl },
        });
      }
    }

    return NextResponse.json(newVolume, { status: 201 });
  } catch (error) {
    console.error("POST /api/works/[id]/volumes error:", error);
    return NextResponse.json(
      { error: "Error al crear el tomo" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Solo el Administrador puede reordenar los tomos." },
        { status: 403 }
      );
    }

    const workId = params.id;
    const body = await req.json();

    if (Array.isArray(body.orderedVolumeIds)) {
      await prisma.$transaction(
        body.orderedVolumeIds.map((volId: string, idx: number) =>
          prisma.volume.update({
            where: { id: volId },
            data: { sortOrder: idx + 1 },
          })
        )
      );
    } else if (body.sortBy) {
      const volumes = await prisma.volume.findMany({
        where: { workId },
      });

      const sorted = [...volumes].sort((a, b) => {
        if (body.sortBy === "number_asc") return a.volumeNumber - b.volumeNumber;
        if (body.sortBy === "number_desc") return b.volumeNumber - a.volumeNumber;
        if (body.sortBy === "title_asc") return a.title.localeCompare(b.title);
        if (body.sortBy === "date_desc")
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        return a.sortOrder - b.sortOrder;
      });

      await prisma.$transaction(
        sorted.map((vol, idx) =>
          prisma.volume.update({
            where: { id: vol.id },
            data: { sortOrder: idx + 1 },
          })
        )
      );
    }

    const updatedVolumes = await prisma.volume.findMany({
      where: { workId },
      orderBy: [{ sortOrder: "asc" }, { volumeNumber: "asc" }],
      include: {
        chapters: {
          orderBy: [{ sortOrder: "asc" }, { chapterNumber: "asc" }],
        },
        bookmarks: true,
      },
    });

    return NextResponse.json(updatedVolumes);
  } catch (error) {
    console.error("PUT /api/works/[id]/volumes error:", error);
    return NextResponse.json(
      { error: "Error al reordenar los tomos" },
      { status: 500 }
    );
  }
}
