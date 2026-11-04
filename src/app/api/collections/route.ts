import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json([]);
    }

    const collections = await prisma.collection.findMany({
      where: { userId: sessionUser.id },
      include: {
        items: {
          include: {
            work: true,
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(collections);
  } catch (error) {
    console.error("GET /api/collections error:", error);
    return NextResponse.json(
      { error: "Error al obtener colecciones" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Inicia sesión con tu cuenta de Google para crear estanterías personales." },
        { status: 401 }
      );
    }

    const body = await req.json();

    if (body.action === "toggleWork") {
      const { collectionId, workId } = body;
      const col = await prisma.collection.findFirst({
        where: { id: collectionId, userId: sessionUser.id },
      });
      if (!col) {
        return NextResponse.json(
          { error: "Estantería no encontrada" },
          { status: 404 }
        );
      }

      const existing = await prisma.collectionItem.findUnique({
        where: {
          collectionId_workId: {
            collectionId,
            workId,
          },
        },
      });

      if (existing) {
        await prisma.collectionItem.delete({ where: { id: existing.id } });
        return NextResponse.json({ added: false });
      } else {
        await prisma.collectionItem.create({
          data: { collectionId, workId },
        });
        return NextResponse.json({ added: true });
      }
    }

    const count = await prisma.collection.count({
      where: { userId: sessionUser.id },
    });
    const collection = await prisma.collection.create({
      data: {
        userId: sessionUser.id,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        color: body.color || "#8b5cf6",
        sortOrder: count + 1,
      },
      include: { items: true },
    });

    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    console.error("POST /api/collections error:", error);
    return NextResponse.json(
      { error: "Error al procesar la colección" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Inicia sesión para eliminar tus estanterías." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }
    await prisma.collection.deleteMany({
      where: { id, userId: sessionUser.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al eliminar colección" },
      { status: 500 }
    );
  }
}
