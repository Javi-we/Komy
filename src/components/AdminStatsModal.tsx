"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  BarChart3,
  TrendingUp,
  BookOpen,
  Clock,
  MessageCircle,
  Star,
  Heart,
  Users,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Layers,
  Tag,
  ArrowUpRight,
  Bookmark,
  Award,
  ChevronRight,
  Flame,
} from "lucide-react";
import { WorkItem } from "@/types/library";

interface AdminStatsModalProps {
  onClose: () => void;
  onOpenWork?: (workId: string) => void;
}

interface StatsData {
  overview: {
    totalWorks: number;
    totalVolumes: number;
    totalUsers: number;
    totalBookmarks: number;
    totalPagesRead: number;
    totalReadingMinutes: number;
    totalReadingHours: number;
    totalCompletions: number;
    totalComments: number;
    totalRatings: number;
  };
  mostReadWorks: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    readingMode: string;
    coverUrl: string | null;
    volumesCount: number;
    readersCount: number;
    pagesRead: number;
    totalWorkPages: number;
    completionPercentage: number;
    estimatedMinutes: number;
    estimatedHours: number;
    completedCount: number;
    commentsCount: number;
    favoritesCount: number;
    rating: number;
  }>;
  mostTimeReadWorks: Array<{
    id: string;
    title: string;
    type: string;
    coverUrl: string | null;
    estimatedMinutes: number;
    estimatedHours: number;
    pagesRead: number;
    readersCount: number;
    rating: number;
  }>;
  mostCommentedWorks: Array<{
    id: string;
    title: string;
    type: string;
    coverUrl: string | null;
    commentsCount: number;
    readersCount: number;
    rating: number;
  }>;
  topRatedWorks: Array<{
    id: string;
    title: string;
    type: string;
    coverUrl: string | null;
    rating: number;
    votesCount: number;
    storyAvg: number;
    artAvg: number;
    charAvg: number;
  }>;
  topFavoritedWorks: Array<{
    id: string;
    title: string;
    type: string;
    coverUrl: string | null;
    favoritesCount: number;
    readersCount: number;
  }>;
  formatDistribution: Array<{
    id: string;
    label: string;
    color: string;
    count: number;
    percentage: number;
  }>;
  readingModeDistribution: Array<{
    id: string;
    label: string;
    color: string;
    count: number;
  }>;
  topGenres: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
}

export default function AdminStatsModal({
  onClose,
  onOpenWork,
}: AdminStatsModalProps) {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "most_read" | "time_read" | "comments" | "ratings" | "formats"
  >("overview");

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("No se pudieron cargar las estadísticas.");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Error al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl max-w-5xl w-full h-[92vh] flex flex-col overflow-hidden shadow-2xl relative">
        {/* Glow de fondo decorativo */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/30">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Panel de Estadísticas & Métricas
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-[10px] font-extrabold uppercase text-violet-300">
                  Admin
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">
                Análisis de lectura, obras más leídas, tiempo acumulado, comunidad y formatos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadStats}
              disabled={loading}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              title="Recargar estadísticas"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin text-violet-400" : ""}`}
              />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
              title="Cerrar panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 pb-2 border-b border-zinc-800/80 bg-zinc-950 flex items-center gap-1.5 overflow-x-auto scrollbar-thin shrink-0">
          {[
            { id: "overview", label: "Resumen General", icon: BarChart3 },
            { id: "most_read", label: "Más Leídas", icon: Flame },
            { id: "time_read", label: "Tiempo Leído", icon: Clock },
            { id: "comments", label: "Comentadas", icon: MessageCircle },
            { id: "ratings", label: "Mejor Calificadas", icon: Star },
            { id: "formats", label: "Formatos & Géneros", icon: Layers },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 ${
                  active
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/25"
                    : "bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading && !data ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400 py-16">
              <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-white">
                Calculando métricas y diagramas en tiempo real...
              </p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-center space-y-3 max-w-md mx-auto my-12">
              <p className="text-sm text-rose-400 font-semibold">{error}</p>
              <button
                onClick={loadStats}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition"
              >
                Reintentar
              </button>
            </div>
          ) : data ? (
            <>
              {/* TAB 1: RESUMEN GENERAL (KPIS & DIAGRAMAS PRINCIPALES) */}
              {(activeTab === "overview" || activeTab === "most_read") && (
                <div className="space-y-6">
                  {/* KPI Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-violet-950/40 to-zinc-900 border border-violet-500/20">
                      <div className="flex items-center justify-between text-violet-400 mb-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          Obras
                        </span>
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-white">
                        {data.overview.totalWorks}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {data.overview.totalVolumes} tomos subidos
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-zinc-900 border border-emerald-500/20">
                      <div className="flex items-center justify-between text-emerald-400 mb-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          Págs. Leídas
                        </span>
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-white">
                        {data.overview.totalPagesRead.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-emerald-400/80 mt-0.5">
                        +{data.overview.totalCompletions} tomos finalizados
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-sky-950/40 to-zinc-900 border border-sky-500/20">
                      <div className="flex items-center justify-between text-sky-400 mb-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          Tiempo Leído
                        </span>
                        <Clock className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-white">
                        {data.overview.totalReadingHours >= 1
                          ? `${data.overview.totalReadingHours}h`
                          : `${data.overview.totalReadingMinutes}m`}
                      </p>
                      <p className="text-[10px] text-sky-400/80 mt-0.5">
                        {data.overview.totalReadingMinutes.toLocaleString()} min acumulados
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-950/40 to-zinc-900 border border-amber-500/20">
                      <div className="flex items-center justify-between text-amber-400 mb-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          Lectores
                        </span>
                        <Users className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-white">
                        {data.overview.totalUsers}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Cuentas registradas
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-pink-950/40 to-zinc-900 border border-pink-500/20">
                      <div className="flex items-center justify-between text-pink-400 mb-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          Opiniones
                        </span>
                        <MessageCircle className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-white">
                        {data.overview.totalComments}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Comentarios recibidos
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-yellow-950/40 to-zinc-900 border border-yellow-500/20">
                      <div className="flex items-center justify-between text-yellow-400 mb-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          Votos
                        </span>
                        <Star className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-white">
                        {data.overview.totalRatings}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Calificaciones hechas
                      </p>
                    </div>
                  </div>

                  {/* DIAGRAMA DE BARRAS VISUAL: OBRAS MÁS LEÍDAS */}
                  <div className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Flame className="w-5 h-5 text-amber-400" />
                        <h4 className="text-sm sm:text-base font-bold text-white">
                          Diagrama de Obras Más Leídas (Páginas Acumuladas)
                        </h4>
                      </div>
                      <span className="text-xs text-zinc-400">
                        Top 10 documentos con mayor consumo
                      </span>
                    </div>

                    {data.mostReadWorks.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-6 text-center">
                        Aún no hay páginas registradas como leídas en los tomos.
                      </p>
                    ) : (
                      <div className="space-y-3 pt-2">
                        {(() => {
                          const maxPages = Math.max(
                            ...data.mostReadWorks.map((w) => w.pagesRead),
                            1
                          );
                          return data.mostReadWorks.map((work, idx) => {
                            const barPct = Math.max(
                              4,
                              Math.round((work.pagesRead / maxPages) * 100)
                            );
                            return (
                              <div
                                key={work.id}
                                onClick={() => {
                                  if (onOpenWork) {
                                    onOpenWork(work.id);
                                    onClose();
                                  }
                                }}
                                className="group p-2.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/60 hover:border-violet-500/50 transition cursor-pointer flex flex-col sm:flex-row sm:items-center gap-3"
                              >
                                {/* Ranking badge & Thumbnail */}
                                <div className="flex items-center gap-2.5 shrink-0">
                                  <div
                                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                      idx === 0
                                        ? "bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/30"
                                        : idx === 1
                                        ? "bg-zinc-300 text-zinc-950"
                                        : idx === 2
                                        ? "bg-amber-700 text-white"
                                        : "bg-zinc-800 text-zinc-400"
                                    }`}
                                  >
                                    #{idx + 1}
                                  </div>
                                  <div className="w-9 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                                    {work.coverUrl ? (
                                      <img
                                        src={work.coverUrl}
                                        alt={work.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                        <BookOpen className="w-4 h-4" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 max-w-[200px] sm:max-w-[220px]">
                                    <p className="text-xs font-bold text-white truncate group-hover:text-violet-300 transition">
                                      {work.title}
                                    </p>
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                      <span className="capitalize text-violet-400 font-semibold">
                                        {work.type.toLowerCase()}
                                      </span>
                                      <span>•</span>
                                      <span>{work.volumesCount} tomos</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Diagram Bar */}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                  <div className="flex items-center justify-between text-[11px] mb-1">
                                    <span className="text-zinc-400 font-medium">
                                      {work.pagesRead.toLocaleString()} páginas leídas
                                    </span>
                                    <span className="text-violet-400 font-bold">
                                      {work.completionPercentage}% completado
                                    </span>
                                  </div>
                                  <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden relative">
                                    <div
                                      style={{ width: `${barPct}%` }}
                                      className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 group-hover:from-violet-500 group-hover:to-pink-500 transition-all duration-500 shadow-sm shadow-violet-500/50"
                                    />
                                  </div>
                                </div>

                                {/* Stats Extra */}
                                <div className="hidden md:flex items-center gap-4 shrink-0 text-right text-xs">
                                  <div>
                                    <p className="text-white font-bold">
                                      {work.estimatedHours >= 1
                                        ? `${work.estimatedHours} h`
                                        : `${work.estimatedMinutes} m`}
                                    </p>
                                    <p className="text-[10px] text-zinc-500">
                                      Tiempo
                                    </p>
                                  </div>
                                  {work.rating > 0 && (
                                    <div className="flex items-center gap-1 text-amber-400 font-bold">
                                      <Star className="w-3.5 h-3.5 fill-current" />
                                      <span>{work.rating.toFixed(1)}</span>
                                    </div>
                                  )}
                                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition" />
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: MAYOR TIEMPO DE LECTURA */}
              {activeTab === "time_read" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-sky-400" />
                      <h4 className="text-sm font-bold text-white">
                        Obras con Mayor Tiempo de Lectura Invertido
                      </h4>
                    </div>
                    <span className="text-xs text-zinc-400">
                      Total acumulado: {data.overview.totalReadingHours} horas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.mostTimeReadWorks.map((work, idx) => (
                      <div
                        key={work.id}
                        onClick={() => {
                          if (onOpenWork) {
                            onOpenWork(work.id);
                            onClose();
                          }
                        }}
                        className="p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-sky-500/40 transition flex items-center gap-3 cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-xl bg-sky-500/20 text-sky-300 font-black flex items-center justify-center text-xs shrink-0">
                          #{idx + 1}
                        </div>
                        <div className="w-12 h-16 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                          {work.coverUrl ? (
                            <img
                              src={work.coverUrl}
                              alt={work.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <BookOpen className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate group-hover:text-sky-300 transition">
                            {work.title}
                          </p>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            {work.pagesRead.toLocaleString()} páginas leídas
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 text-xs font-black">
                              {work.estimatedHours >= 1
                                ? `${work.estimatedHours} horas`
                                : `${work.estimatedMinutes} minutos`}
                            </span>
                            {work.rating > 0 && (
                              <span className="text-amber-400 text-xs font-bold flex items-center gap-0.5">
                                <Star className="w-3 h-3 fill-current" />
                                {work.rating.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: OBRAS MÁS COMENTADAS */}
              {activeTab === "comments" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-pink-400" />
                      <h4 className="text-sm font-bold text-white">
                        Obras Más Comentadas y Debatidas por la Comunidad
                      </h4>
                    </div>
                    <span className="text-xs text-zinc-400">
                      Total: {data.overview.totalComments} comentarios
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.mostCommentedWorks.map((work, idx) => (
                      <div
                        key={work.id}
                        onClick={() => {
                          if (onOpenWork) {
                            onOpenWork(work.id);
                            onClose();
                          }
                        }}
                        className="p-3.5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-pink-500/40 transition flex items-center gap-3 cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-xl bg-pink-500/20 text-pink-300 font-black flex items-center justify-center text-xs shrink-0">
                          #{idx + 1}
                        </div>
                        <div className="w-12 h-16 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                          {work.coverUrl ? (
                            <img
                              src={work.coverUrl}
                              alt={work.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <BookOpen className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate group-hover:text-pink-300 transition">
                            {work.title}
                          </p>
                          <p className="text-[11px] text-zinc-500 mt-0.5 capitalize">
                            Formato: {work.type.toLowerCase()}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-pink-500/20 text-pink-300 text-xs font-black flex items-center gap-1">
                              <MessageCircle className="w-3 h-3" />
                              {work.commentsCount} comentarios
                            </span>
                            {work.rating > 0 && (
                              <span className="text-amber-400 text-xs font-bold flex items-center gap-0.5">
                                <Star className="w-3 h-3 fill-current" />
                                {work.rating.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: MEJOR CALIFICADAS */}
              {activeTab === "ratings" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-amber-400" />
                      <h4 className="text-sm font-bold text-white">
                        Obras Mejor Calificadas (Historia, Arte, Personajes)
                      </h4>
                    </div>
                    <span className="text-xs text-zinc-400">
                      Total: {data.overview.totalRatings} votos registrados
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.topRatedWorks.map((work, idx) => (
                      <div
                        key={work.id}
                        onClick={() => {
                          if (onOpenWork) {
                            onOpenWork(work.id);
                            onClose();
                          }
                        }}
                        className="p-3.5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-amber-500/40 transition flex items-center gap-3 cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-300 font-black flex items-center justify-center text-xs shrink-0">
                          #{idx + 1}
                        </div>
                        <div className="w-12 h-16 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                          {work.coverUrl ? (
                            <img
                              src={work.coverUrl}
                              alt={work.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <BookOpen className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition">
                            {work.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-amber-400 text-sm font-black flex items-center gap-1">
                              <Star className="w-4 h-4 fill-current" />
                              {work.rating.toFixed(1)} / 10
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              ({work.votesCount} votos)
                            </span>
                          </div>
                          {work.storyAvg > 0 && (
                            <div className="grid grid-cols-3 gap-1 mt-2 text-[10px] text-zinc-400 border-t border-zinc-800/80 pt-1.5">
                              <div>
                                Hist:{" "}
                                <strong className="text-zinc-200">
                                  {work.storyAvg.toFixed(1)}
                                </strong>
                              </div>
                              <div>
                                Arte:{" "}
                                <strong className="text-zinc-200">
                                  {work.artAvg.toFixed(1)}
                                </strong>
                              </div>
                              <div>
                                Pers:{" "}
                                <strong className="text-zinc-200">
                                  {work.charAvg.toFixed(1)}
                                </strong>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: FORMATOS, GÉNEROS & MODOS DE LECTURA */}
              {(activeTab === "overview" || activeTab === "formats") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                  {/* DIAGRAMA DE FORMATOS */}
                  <div className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-violet-400" />
                        <h4 className="text-sm font-bold text-white">
                          Distribución por Formato
                        </h4>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {data.overview.totalWorks} obras totales
                      </span>
                    </div>

                    <div className="space-y-3 pt-1">
                      {data.formatDistribution.map((fmt) => (
                        <div key={fmt.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-300 font-semibold flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: fmt.color }}
                              />
                              {fmt.label}
                            </span>
                            <span className="text-zinc-400 font-bold">
                              {fmt.count} ({fmt.percentage}%)
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              style={{
                                width: `${fmt.percentage}%`,
                                backgroundColor: fmt.color,
                              }}
                              className="h-full rounded-full transition-all duration-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* DIAGRAMA DE GÉNEROS TOP */}
                  <div className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-sm font-bold text-white">
                          Géneros con Mayor Catálogo
                        </h4>
                      </div>
                      <span className="text-xs text-zinc-400">Top 8 géneros</span>
                    </div>

                    <div className="space-y-2.5 pt-1">
                      {data.topGenres.map((g, idx) => (
                        <div key={g.name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                              <span className="text-zinc-500 font-bold text-[10px]">
                                #{idx + 1}
                              </span>
                              {g.name}
                            </span>
                            <span className="text-emerald-400 font-bold">
                              {g.count} obras ({g.percentage}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              style={{ width: `${g.percentage}%` }}
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800/80 bg-zinc-950 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>Métricas actualizadas en tiempo real desde la Base de Datos</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
