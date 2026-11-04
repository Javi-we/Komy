import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyAdminRequest } from "@/lib/auth";

async function buildCommunityPayload(workId: string, currentUserId?: string) {
  // 1. Obtener calificaciones (Historia, Arte, Personajes)
  const ratings: Array<{
    userId: string;
    storyScore: number;
    artScore: number;
    charactersScore: number;
  }> = await prisma.$queryRawUnsafe(
    `SELECT "userId", "storyScore", "artScore", "charactersScore" FROM "WorkRating" WHERE "workId" = $1`,
    workId
  );

  const votesCount = ratings.length;
  let storyAvg = 0;
  let artAvg = 0;
  let charactersAvg = 0;
  let overallScore = 0;

  if (votesCount > 0) {
    storyAvg =
      ratings.reduce((acc, r) => acc + Number(r.storyScore || 0), 0) /
      votesCount;
    artAvg =
      ratings.reduce((acc, r) => acc + Number(r.artScore || 0), 0) / votesCount;
    charactersAvg =
      ratings.reduce((acc, r) => acc + Number(r.charactersScore || 0), 0) /
      votesCount;
    overallScore = (storyAvg + artAvg + charactersAvg) / 3;
  }

  const myRating = currentUserId
    ? ratings.find((r) => r.userId === currentUserId) || null
    : null;

  // 2. Contar favoritos totales y lectores activos de esta obra
  const favRows: Array<{ count: bigint | number }> =
    await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "UserWorkPreference" WHERE "workId" = $1 AND "isFavorite" = true`,
      workId
    );
  const favoritesCount = Number(favRows[0]?.count || 0);

  const readerRows: Array<{ count: bigint | number }> =
    await prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT uvp."userId")::int AS count
       FROM "UserVolumeProgress" uvp
       INNER JOIN "Volume" v ON v."id" = uvp."volumeId"
       WHERE v."workId" = $1`,
      workId
    );
  const readersCount = Math.max(1, Number(readerRows[0]?.count || 0));

  // 3. Obtener comentarios con autor y likes
  const rawComments: Array<{
    id: string;
    workId: string;
    userId: string;
    content: string;
    createdAt: Date;
    userName: string;
    userPicture: string | null;
    userEmail: string;
  }> = await prisma.$queryRawUnsafe(
    `SELECT
       c."id",
       c."workId",
       c."userId",
       c."content",
       c."createdAt",
       u."name" AS "userName",
       u."picture" AS "userPicture",
       u."email" AS "userEmail"
     FROM "WorkComment" c
     INNER JOIN "User" u ON u."id" = c."userId"
     WHERE c."workId" = $1
     ORDER BY c."createdAt" DESC`,
    workId
  );

  const rawLikes: Array<{ commentId: string; userId: string }> =
    await prisma.$queryRawUnsafe(
      `SELECT l."commentId", l."userId"
       FROM "WorkCommentLike" l
       INNER JOIN "WorkComment" c ON c."id" = l."commentId"
       WHERE c."workId" = $1`,
      workId
    );

  const comments = rawComments.map((c) => {
    const cLikes = rawLikes.filter((l) => l.commentId === c.id);
    return {
      id: c.id,
      workId: c.workId,
      userId: c.userId,
      content: c.content,
      createdAt: c.createdAt,
      userName: c.userName,
      userPicture: c.userPicture,
      userEmail: c.userEmail,
      likesCount: cLikes.length,
      likedByMe: currentUserId
        ? cLikes.some((l) => l.userId === currentUserId)
        : false,
    };
  });

  return {
    stats: {
      votesCount,
      overallScore: Number(overallScore.toFixed(1)),
      storyAvg: Number(storyAvg.toFixed(1)),
      artAvg: Number(artAvg.toFixed(1)),
      charactersAvg: Number(charactersAvg.toFixed(1)),
      favoritesCount,
      readersCount,
      myRating,
    },
    comments,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workId } = await params;
    const sessionUser = await getSessionUser(req);
    const payload = await buildCommunityPayload(workId, sessionUser?.id);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/works/[id]/community error:", error);
    return NextResponse.json(
      { error: "Error cargando comentarios y calificaciones" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workId } = await params;
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Inicia sesión con tu cuenta de Google para participar." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const action = body.action;

    // ACCIÓN 1: VOTAR CALIFICACIÓN (Historia, Arte, Personajes en escala 1 a 10)
    if (action === "rate") {
      const storyScore = Math.min(10, Math.max(1, Number(body.storyScore || 8)));
      const artScore = Math.min(10, Math.max(1, Number(body.artScore || 8)));
      const charactersScore = Math.min(
        10,
        Math.max(1, Number(body.charactersScore || 8))
      );

      const ratingId = `rate-${sessionUser.id}-${workId}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "WorkRating" ("id", "workId", "userId", "storyScore", "artScore", "charactersScore", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT ("userId", "workId")
         DO UPDATE SET
           "storyScore" = EXCLUDED."storyScore",
           "artScore" = EXCLUDED."artScore",
           "charactersScore" = EXCLUDED."charactersScore",
           "updatedAt" = CURRENT_TIMESTAMP`,
        ratingId,
        workId,
        sessionUser.id,
        storyScore,
        artScore,
        charactersScore
      );

      const payload = await buildCommunityPayload(workId, sessionUser.id);

      // Actualizar el promedio general en la Obra
      await prisma.work.update({
        where: { id: workId },
        data: { rating: payload.stats.overallScore },
      });

      return NextResponse.json(payload);
    }

    // ACCIÓN 2: PUBLICAR UN COMENTARIO
    if (action === "comment") {
      const content = String(body.content || "").trim();
      if (!content) {
        return NextResponse.json(
          { error: "Escribe un comentario antes de enviar." },
          { status: 400 }
        );
      }

      const commentId = `cmt-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "WorkComment" ("id", "workId", "userId", "content", "createdAt")
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        commentId,
        workId,
        sessionUser.id,
        content
      );

      const payload = await buildCommunityPayload(workId, sessionUser.id);
      return NextResponse.json(payload);
    }

    // ACCIÓN 3: DAR / QUITAR CORAZÓN (LIKE) A UN COMENTARIO
    if (action === "toggleLike") {
      const commentId = String(body.commentId || "");
      if (!commentId) {
        return NextResponse.json(
          { error: "ID de comentario inválido" },
          { status: 400 }
        );
      }

      const existing: Array<{ id: string }> = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "WorkCommentLike" WHERE "commentId" = $1 AND "userId" = $2`,
        commentId,
        sessionUser.id
      );

      if (existing.length > 0) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "WorkCommentLike" WHERE "id" = $1`,
          existing[0].id
        );
      } else {
        const likeId = `like-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 7)}`;
        await prisma.$executeRawUnsafe(
          `INSERT INTO "WorkCommentLike" ("id", "commentId", "userId", "createdAt")
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
          likeId,
          commentId,
          sessionUser.id
        );
      }

      const payload = await buildCommunityPayload(workId, sessionUser.id);
      return NextResponse.json(payload);
    }

    // ACCIÓN 4: ELIMINAR COMENTARIO (Autor del comentario o Admin sotgg45@gmail.com)
    if (action === "deleteComment") {
      const commentId = String(body.commentId || "");
      const isAdmin = await verifyAdminRequest(req);

      if (isAdmin) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "WorkComment" WHERE "id" = $1`,
          commentId
        );
      } else {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "WorkComment" WHERE "id" = $1 AND "userId" = $2`,
          commentId,
          sessionUser.id
        );
      }

      const payload = await buildCommunityPayload(workId, sessionUser.id);
      return NextResponse.json(payload);
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/works/[id]/community error:", error);
    return NextResponse.json(
      { error: "Error procesando tu solicitud" },
      { status: 500 }
    );
  }
}
