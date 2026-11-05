import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { volumeId: string } }
) {
  try {
    const body = await req.json();
    const volumeId = params.volumeId;

    const count = await prisma.chapter.count({ where: { volumeId } });
    const chapterNumber =
      body.chapterNumber !== undefined ? Number(body.chapterNumber) : count + 1;

    const chapter = await prisma.chapter.create({
      data: {
        volumeId,
        chapterNumber,
        title: body.title?.trim() || `Capítulo ${chapterNumber}`,
        startPage: Math.max(1, Number(body.startPage) || 1),
        fileUrl: body.fileUrl || null,
        sortOrder: count + 1,
      },
    });

    return NextResponse.json(chapter, { status: 201 });
  } catch (error) {
    console.error("POST /api/volumes/[volumeId]/chapters error:", error);
    return NextResponse.json(
      { error: "Error al agregar el capítulo" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get("chapterId");

    if (!chapterId) {
      return NextResponse.json(
        { error: "Se requiere chapterId" },
        { status: 400 }
      );
    }

    await prisma.chapter.delete({
      where: { id: chapterId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE chapter error:", error);
    return NextResponse.json(
      { error: "Error al eliminar el capítulo" },
      { status: 500 }
    );
  }
}
