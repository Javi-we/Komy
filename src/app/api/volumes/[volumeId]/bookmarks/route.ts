import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { volumeId: string } }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Inicia sesión con tu cuenta de Google para guardar marcadores." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const volumeId = params.volumeId;
    const pageNumber = Number(body.pageNumber) || 1;

    const volume = await prisma.volume.findUnique({
      where: { id: volumeId },
    });

    if (!volume) {
      return NextResponse.json(
        { error: "Tomo no encontrado" },
        { status: 404 }
      );
    }

    // Buscar marcador perteneciente exclusivamente a la cuenta actual
    const existing = await prisma.bookmark.findFirst({
      where: {
        userId: sessionUser.id,
        volumeId,
        pageNumber,
      },
    });

    if (existing && !body.forceCreate) {
      await prisma.bookmark.delete({ where: { id: existing.id } });
      return NextResponse.json({ removed: true, id: existing.id });
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        userId: sessionUser.id,
        workId: volume.workId,
        volumeId,
        pageNumber,
        label: body.label?.trim() || `Página ${pageNumber}`,
      },
    });

    return NextResponse.json(bookmark, { status: 201 });
  } catch (error) {
    console.error("POST /api/volumes/[volumeId]/bookmarks error:", error);
    return NextResponse.json(
      { error: "Error al guardar el marcador" },
      { status: 500 }
    );
  }
}
