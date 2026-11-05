import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Se requieren privilegios de Administrador." },
        { status: 403 }
      );
    }

    // 1. Métricas Globales
    const [
      totalWorks,
      totalVolumes,
      totalUsers,
      totalBookmarks,
      worksList,
      volumesList,
    ] = await Promise.all([
      prisma.work.count(),
      prisma.volume.count(),
      prisma.user.count(),
      prisma.bookmark.count(),
      prisma.work.findMany({
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          readingMode: true,
          coverUrl: true,
          rating: true,
          tags: true,
          createdAt: true,
          volumes: {
            select: {
              id: true,
              totalPages: true,
              currentPage: true,
              isCompleted: true,
            },
          },
        },
      }),
      prisma.volume.findMany({
        select: {
          id: true,
          workId: true,
          totalPages: true,
          currentPage: true,
          isCompleted: true,
          lastReadAt: true,
        },
      }),
    ]);

    // 2. Progreso de usuarios por tomo (UserVolumeProgress)
    let userProgressList: Array<{
      volumeId: string;
      userId: string;
      currentPage: number;
      isCompleted: boolean;
      lastReadAt: Date;
    }> = [];

    try {
      userProgressList = await prisma.userVolumeProgress.findMany({
        select: {
          volumeId: true,
          userId: true,
          currentPage: true,
          isCompleted: true,
          lastReadAt: true,
        },
      });
    } catch {
      userProgressList = [];
    }

    // 3. Comentarios por obra
    let rawComments: Array<{ workId: string; count: number }> = [];
    try {
      rawComments = await prisma.$queryRawUnsafe(
        `SELECT "workId", COUNT(*)::int AS count FROM "WorkComment" GROUP BY "workId" ORDER BY count DESC`
      );
    } catch {
      rawComments = [];
    }
    const commentsMap = new Map<string, number>();
    for (const r of rawComments) {
      commentsMap.set(r.workId, Number(r.count || 0));
    }

    // 4. Calificaciones detalladas de la comunidad (WorkRating)
    let rawRatings: Array<{
      workId: string;
      votesCount: number;
      avgScore: number;
      storyAvg: number;
      artAvg: number;
      charAvg: number;
    }> = [];
    try {
      rawRatings = await prisma.$queryRawUnsafe(
        `SELECT 
           "workId", 
           COUNT(*)::int AS "votesCount", 
           ROUND(AVG(("storyScore" + "artScore" + "charactersScore") / 3.0)::numeric, 2)::float AS "avgScore",
           ROUND(AVG("storyScore")::numeric, 2)::float AS "storyAvg",
           ROUND(AVG("artScore")::numeric, 2)::float AS "artAvg",
           ROUND(AVG("charactersScore")::numeric, 2)::float AS "charAvg"
         FROM "WorkRating" 
         GROUP BY "workId"`
      );
    } catch {
      rawRatings = [];
    }
    const ratingsMap = new Map<string, {
      votesCount: number;
      avgScore: number;
      storyAvg: number;
      artAvg: number;
      charAvg: number;
    }>();
    for (const r of rawRatings) {
      ratingsMap.set(r.workId, {
        votesCount: Number(r.votesCount || 0),
        avgScore: Number(r.avgScore || 0),
        storyAvg: Number(r.storyAvg || 0),
        artAvg: Number(r.artAvg || 0),
        charAvg: Number(r.charAvg || 0),
      });
    }

    // 5. Favoritos por obra (UserWorkPreference)
    let rawFavorites: Array<{ workId: string; count: number }> = [];
    try {
      rawFavorites = await prisma.$queryRawUnsafe(
        `SELECT "workId", COUNT(*)::int AS count FROM "UserWorkPreference" WHERE "isFavorite" = true GROUP BY "workId"`
      );
    } catch {
      rawFavorites = [];
    }
    const favoritesMap = new Map<string, number>();
    for (const f of rawFavorites) {
      favoritesMap.set(f.workId, Number(f.count || 0));
    }

    // 6. Mapear volumen -> obra
    const volumeToWorkMap = new Map<string, string>();
    for (const v of volumesList) {
      volumeToWorkMap.set(v.id, v.workId);
    }

    // 7. Calcular lectura agregada por obra (lectores únicos, páginas leídas, tomos completados)
    const workStatsMap = new Map<
      string,
      {
        readersSet: Set<string>;
        pagesRead: number;
        completedCount: number;
      }
    >();

    for (const p of userProgressList) {
      const workId = volumeToWorkMap.get(p.volumeId);
      if (!workId) continue;
      if (!workStatsMap.has(workId)) {
        workStatsMap.set(workId, {
          readersSet: new Set(),
          pagesRead: 0,
          completedCount: 0,
        });
      }
      const st = workStatsMap.get(workId)!;
      st.readersSet.add(p.userId);
      st.pagesRead += p.currentPage || 1;
      if (p.isCompleted) st.completedCount++;
    }

    // Si aún no hay usuarios múltiples leyendo, incluir el progreso guardado en los propios tomos
    for (const v of volumesList) {
      if (!workStatsMap.has(v.workId)) {
        workStatsMap.set(v.workId, {
          readersSet: new Set(["local"]),
          pagesRead: 0,
          completedCount: 0,
        });
      }
      const st = workStatsMap.get(v.workId)!;
      if (v.currentPage > 1) {
        st.pagesRead += v.currentPage;
      }
      if (v.isCompleted) {
        st.completedCount++;
      }
    }

    // 8. Totales de lectura generales
    let totalPagesReadAcrossAll = 0;
    let totalCompletionsAcrossAll = 0;
    workStatsMap.forEach((st) => {
      totalPagesReadAcrossAll += st.pagesRead;
      totalCompletionsAcrossAll += st.completedCount;
    });
    // Tiempo estimado de lectura: mangas ~0.75 min por pág, libros ~1.8 min por pág (promedio ponderado 1.25 min)
    const totalReadingMinutes = Math.round(totalPagesReadAcrossAll * 1.25);
    const totalReadingHours = +(totalReadingMinutes / 60).toFixed(1);

    // 9. Rankings de Obras
    const enrichedWorks = worksList.map((w) => {
      const st = workStatsMap.get(w.id) || {
        readersSet: new Set(),
        pagesRead: 0,
        completedCount: 0,
      };
      const readersCount = Math.max(
        st.readersSet.size,
        w.volumes.some((v) => v.currentPage > 1) ? 1 : 0
      );
      const commentsCount = commentsMap.get(w.id) || 0;
      const favCount = favoritesMap.get(w.id) || 0;
      const ratingData = ratingsMap.get(w.id);
      const effectiveRating = ratingData?.avgScore || w.rating || 0;
      const votesCount = ratingData?.votesCount || (w.rating > 0 ? 1 : 0);

      // Total de páginas de todos los tomos de esta obra
      const totalWorkPages = w.volumes.reduce(
        (sum, v) => sum + (v.totalPages || 1),
        0
      );
      const completionPercentage =
        totalWorkPages > 0
          ? Math.min(100, Math.round((st.pagesRead / totalWorkPages) * 100))
          : 0;

      // Tiempo estimado en minutos y horas
      const estimatedMinutes = Math.round(
        st.pagesRead * (w.type === "BOOK" ? 1.8 : 0.8)
      );

      return {
        id: w.id,
        title: w.title,
        type: w.type,
        status: w.status,
        readingMode: w.readingMode,
        coverUrl: w.coverUrl,
        volumesCount: w.volumes.length,
        readersCount,
        pagesRead: st.pagesRead,
        totalWorkPages,
        completionPercentage,
        estimatedMinutes,
        estimatedHours: +(estimatedMinutes / 60).toFixed(1),
        completedCount: st.completedCount,
        commentsCount,
        favoritesCount: favCount,
        rating: effectiveRating,
        votesCount,
        storyAvg: ratingData?.storyAvg || effectiveRating,
        artAvg: ratingData?.artAvg || effectiveRating,
        charAvg: ratingData?.charAvg || effectiveRating,
        tags: w.tags,
      };
    });

    // Ranking 1: Más Leídas (por páginas leídas y lectores)
    const mostReadWorks = [...enrichedWorks]
      .sort((a, b) => b.pagesRead - a.pagesRead || b.readersCount - a.readersCount)
      .slice(0, 10);

    // Ranking 2: Mayor Tiempo de Lectura
    const mostTimeReadWorks = [...enrichedWorks]
      .sort((a, b) => b.estimatedMinutes - a.estimatedMinutes)
      .slice(0, 10);

    // Ranking 3: Más Comentadas
    const mostCommentedWorks = [...enrichedWorks]
      .sort((a, b) => b.commentsCount - a.commentsCount || b.pagesRead - a.pagesRead)
      .slice(0, 10);

    // Ranking 4: Mejor Calificadas
    const topRatedWorks = [...enrichedWorks]
      .filter((w) => w.rating > 0)
      .sort((a, b) => b.rating - a.rating || b.votesCount - a.votesCount)
      .slice(0, 10);

    // Ranking 5: Más Populares en Favoritos
    const topFavoritedWorks = [...enrichedWorks]
      .sort((a, b) => b.favoritesCount - a.favoritesCount || b.pagesRead - a.pagesRead)
      .slice(0, 10);

    // 10. Distribución por Formato (Mangas, Libros, Novelas Ligeras, Cómics)
    const formatCounts: Record<string, number> = {
      MANGA: 0,
      BOOK: 0,
      LIGHT_NOVEL: 0,
      COMIC: 0,
    };
    for (const w of worksList) {
      if (formatCounts[w.type] !== undefined) {
        formatCounts[w.type]++;
      } else {
        formatCounts.MANGA++;
      }
    }
    const formatDistribution = [
      {
        id: "MANGA",
        label: "Mangas",
        color: "#8b5cf6", // Violeta
        count: formatCounts.MANGA,
        percentage:
          totalWorks > 0
            ? Math.round((formatCounts.MANGA / totalWorks) * 100)
            : 0,
      },
      {
        id: "BOOK",
        label: "Libros",
        color: "#3b82f6", // Azul
        count: formatCounts.BOOK,
        percentage:
          totalWorks > 0 ? Math.round((formatCounts.BOOK / totalWorks) * 100) : 0,
      },
      {
        id: "LIGHT_NOVEL",
        label: "Novelas Ligeras",
        color: "#ec4899", // Rosa
        count: formatCounts.LIGHT_NOVEL,
        percentage:
          totalWorks > 0
            ? Math.round((formatCounts.LIGHT_NOVEL / totalWorks) * 100)
            : 0,
      },
      {
        id: "COMIC",
        label: "Cómics / Webtoons",
        color: "#10b981", // Esmeralda
        count: formatCounts.COMIC,
        percentage:
          totalWorks > 0
            ? Math.round((formatCounts.COMIC / totalWorks) * 100)
            : 0,
      },
    ];

    // 11. Distribución por Modo de Lectura
    const readingModeCounts: Record<string, number> = {
      WEBTOON_VERTICAL: 0,
      MANGA_RTL: 0,
      BOOK_LTR: 0,
    };
    for (const w of worksList) {
      if (readingModeCounts[w.readingMode] !== undefined) {
        readingModeCounts[w.readingMode]++;
      } else {
        readingModeCounts.MANGA_RTL++;
      }
    }
    const readingModeDistribution = [
      {
        id: "WEBTOON_VERTICAL",
        label: "Cascada / Scroll Vertical",
        color: "#a855f7",
        count: readingModeCounts.WEBTOON_VERTICAL,
      },
      {
        id: "MANGA_RTL",
        label: "Manga (Derecha ← Izquierda)",
        color: "#f59e0b",
        count: readingModeCounts.MANGA_RTL,
      },
      {
        id: "BOOK_LTR",
        label: "Libro (Izquierda → Derecha)",
        color: "#06b6d4",
        count: readingModeCounts.BOOK_LTR,
      },
    ];

    // 12. Distribución de Géneros Top
    const genreMap = new Map<string, number>();
    for (const w of worksList) {
      const parts = (w.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      for (const p of parts) {
        const key = p.toLowerCase();
        genreMap.set(key, (genreMap.get(key) || 0) + 1);
      }
    }
    const topGenres = Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
        percentage:
          totalWorks > 0 ? Math.round((count / totalWorks) * 100) : 0,
      }));

    // 13. Resumen Global para el Dashboard
    return NextResponse.json({
      overview: {
        totalWorks,
        totalVolumes,
        totalUsers: Math.max(1, totalUsers),
        totalBookmarks,
        totalPagesRead: totalPagesReadAcrossAll,
        totalReadingMinutes,
        totalReadingHours,
        totalCompletions: totalCompletionsAcrossAll,
        totalComments: Array.from(commentsMap.values()).reduce(
          (acc, c) => acc + c,
          0
        ),
        totalRatings: Array.from(ratingsMap.values()).reduce(
          (acc, r) => acc + r.votesCount,
          0
        ),
      },
      mostReadWorks,
      mostTimeReadWorks,
      mostCommentedWorks,
      topRatedWorks,
      topFavoritedWorks,
      formatDistribution,
      readingModeDistribution,
      topGenres,
    });
  } catch (error) {
    console.error("GET /api/admin/stats error:", error);
    return NextResponse.json(
      { error: "Error al generar las estadísticas del catálogo." },
      { status: 500 }
    );
  }
}
