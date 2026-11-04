"use client";

import React, { useEffect, useState } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  BookOpen,
  Palette,
  Users,
  Lock,
  Send,
  Trash2,
  Eye,
  Check,
  Sliders,
} from "lucide-react";
import { UserProfile, WorkItem } from "@/types/library";

interface CommunityStats {
  votesCount: number;
  overallScore: number;
  storyAvg: number;
  artAvg: number;
  charactersAvg: number;
  favoritesCount: number;
  readersCount: number;
  myRating: {
    storyScore: number;
    artScore: number;
    charactersScore: number;
  } | null;
}

interface CommunityComment {
  id: string;
  workId: string;
  userId: string;
  content: string;
  createdAt: string;
  userName: string;
  userPicture: string | null;
  userEmail: string;
  likesCount: number;
  likedByMe: boolean;
}

interface WorkCommunitySectionProps {
  work: WorkItem;
  user: UserProfile | null;
  isAdmin: boolean;
  onToggleFavorite: () => void;
  onRequestLogin: () => void;
  onRatingUpdated?: (newRating: number) => void;
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mes`;
}

function formatScoreComma(num: number): string {
  if (!num || num <= 0) return "—";
  return Number.isInteger(num)
    ? String(num)
    : num.toFixed(1).replace(".", ",");
}

export default function WorkCommunitySection({
  work,
  user,
  isAdmin,
  onToggleFavorite,
  onRequestLogin,
  onRatingUpdated,
}: WorkCommunitySectionProps) {
  const [stats, setStats] = useState<CommunityStats>({
    votesCount: 0,
    overallScore: work.rating || 0,
    storyAvg: 0,
    artAvg: 0,
    charactersAvg: 0,
    favoritesCount: work.isFavorite ? 1 : 0,
    readersCount: 1,
    myRating: null,
  });
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);

  // Voting form state (1-10 scale)
  const [showVotePanel, setShowVotePanel] = useState(false);
  const [storyScore, setStoryScore] = useState<number>(8);
  const [artScore, setArtScore] = useState<number>(9);
  const [charactersScore, setCharactersScore] = useState<number>(8);
  const [submittingVote, setSubmittingVote] = useState(false);

  // Comment input state
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadCommunityData = async () => {
    try {
      const res = await fetch(`/api/works/${work.id}/community`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setComments(data.comments || []);
        if (data.stats.myRating) {
          setStoryScore(data.stats.myRating.storyScore);
          setArtScore(data.stats.myRating.artScore);
          setCharactersScore(data.stats.myRating.charactersScore);
        }
      }
    } catch (err) {
      console.error("Error loading community section:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommunityData();
  }, [work.id, user?.id]);

  const handleSaveVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequestLogin();
      return;
    }
    setSubmittingVote(true);
    try {
      const res = await fetch(`/api/works/${work.id}/community`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rate",
          storyScore,
          artScore,
          charactersScore,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setComments(data.comments || []);
        setShowVotePanel(false);
        if (onRatingUpdated) {
          onRatingUpdated(data.stats.overallScore);
        }
      }
    } finally {
      setSubmittingVote(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequestLogin();
      return;
    }
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/works/${work.id}/community`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          content: commentText.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setComments(data.comments || []);
        setCommentText("");
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleToggleCommentLike = async (commentId: string) => {
    if (!user) {
      onRequestLogin();
      return;
    }
    const res = await fetch(`/api/works/${work.id}/community`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggleLike",
        commentId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setComments(data.comments || []);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const res = await fetch(`/api/works/${work.id}/community`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteComment",
        commentId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setComments(data.comments || []);
    }
  };

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const scrollToComments = () => {
    const el = document.getElementById("komy-comments-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="space-y-6">
      {/* BARRA RÁPIDA DE INTERACCIÓN (Estilo YUP - Captura 2) */}
      <div className="flex flex-wrap items-center gap-2.5 pt-2">
        {/* Cuadro de Puntuación General */}
        <button
          type="button"
          onClick={scrollToComments}
          className="h-11 px-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 font-black text-base flex items-center justify-center shadow-sm hover:bg-amber-500/25 transition"
          title="Ver desglose de calificaciones (Historia, Arte, Personajes)"
        >
          {formatScoreComma(stats.overallScore || work.rating)}
        </button>

        {/* Botón de Favoritos con Contador */}
        <button
          type="button"
          onClick={onToggleFavorite}
          className={`h-11 px-4 rounded-xl border font-bold text-sm flex items-center gap-2 transition ${
            work.isFavorite
              ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
              : "bg-zinc-800/90 hover:bg-zinc-800 border-zinc-700 text-zinc-200"
          }`}
          title="Me gusta / Añadir a Favoritos"
        >
          <Heart
            className={`w-4 h-4 ${
              work.isFavorite ? "text-rose-400 fill-rose-400" : "text-rose-400"
            }`}
          />
          <span>
            {Math.max(
              stats.favoritesCount,
              work.isFavorite ? 1 : stats.favoritesCount
            )}
          </span>
        </button>

        {/* Botón de Guardar / Marcador de Serie */}
        <button
          type="button"
          onClick={onToggleFavorite}
          className="h-11 w-11 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center transition"
          title="Guardar en mi lista"
        >
          <Bookmark
            className="w-4 h-4"
            fill={work.isFavorite ? "currentColor" : "none"}
          />
        </button>

        {/* Botón Compartir */}
        <button
          type="button"
          onClick={handleShare}
          className="h-11 px-3.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          title="Copiar enlace para compartir"
        >
          {copiedLink ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300">¡Copiado!</span>
            </>
          ) : (
            <Share2 className="w-4 h-4" />
          )}
        </button>

        {/* Botón Grande de Comentarios con Contador */}
        <button
          type="button"
          onClick={scrollToComments}
          className="h-11 px-5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition ml-auto sm:ml-0"
        >
          <MessageCircle className="w-4 h-4 text-violet-400 fill-violet-400/20" />
          <span>{comments.length}</span>
        </button>

        {/* Indicador de usuarios leyéndolo */}
        <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-300 ml-auto">
          <Eye className="w-4 h-4 text-violet-400" />
          <span>
            {stats.readersCount}{" "}
            {stats.readersCount === 1
              ? "usuario leyéndolo"
              : "usuarios leyéndolo"}
          </span>
        </div>
      </div>

      {/* SECCIÓN DE CALIFICACIONES Y COMENTARIOS (Estilo YUP - Captura 1) */}
      <div
        id="komy-comments-section"
        className="pt-4 border-t border-zinc-800 space-y-5"
      >
        {/* TARJETA 1: Calificaciones de Historia, Arte y Personajes */}
        <div className="p-5 rounded-3xl bg-zinc-950/90 border border-zinc-800/90 space-y-5 shadow-xl">
          {/* Cabecera con Miniatura, Título, Votos y Nota General */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-14 h-20 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0">
                {work.coverUrl ? (
                  <img
                    src={work.coverUrl}
                    alt={work.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    <BookOpen className="w-5 h-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-base sm:text-lg font-extrabold text-white truncate">
                  {work.title}
                </h4>
                <p className="text-xs sm:text-sm text-zinc-400 font-medium mt-0.5">
                  {stats.votesCount}{" "}
                  {stats.votesCount === 1 ? "voto" : "votos"}
                </p>
              </div>
            </div>

            {/* Nota General Grande */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center shrink-0">
              <span className="text-2xl sm:text-3xl font-black text-amber-400">
                {formatScoreComma(stats.overallScore)}
              </span>
            </div>
          </div>

          {/* 3 Tarjetas de Categorías: Historia, Arte, Personajes */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            {/* Historia */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col items-center text-center">
              <span className="text-xl sm:text-2xl font-black text-white">
                {formatScoreComma(stats.storyAvg)}
              </span>
              <span className="text-xs text-zinc-400 font-medium mt-0.5 mb-3">
                Historia
              </span>
              <div className="w-full h-6 rounded-full bg-zinc-800 p-1 relative flex items-center overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-600 transition-all flex items-center pl-2 min-w-[26px]"
                  style={{
                    width: `${Math.max(22, (stats.storyAvg / 10) * 100)}%`,
                  }}
                >
                  <BookOpen className="w-3 h-3 text-white shrink-0" />
                </div>
              </div>
            </div>

            {/* Arte */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col items-center text-center">
              <span className="text-xl sm:text-2xl font-black text-white">
                {formatScoreComma(stats.artAvg)}
              </span>
              <span className="text-xs text-zinc-400 font-medium mt-0.5 mb-3">
                Arte
              </span>
              <div className="w-full h-6 rounded-full bg-zinc-800 p-1 relative flex items-center overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all flex items-center pl-2 min-w-[26px]"
                  style={{
                    width: `${Math.max(22, (stats.artAvg / 10) * 100)}%`,
                  }}
                >
                  <Palette className="w-3 h-3 text-white shrink-0" />
                </div>
              </div>
            </div>

            {/* Personajes */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col items-center text-center">
              <span className="text-xl sm:text-2xl font-black text-white">
                {formatScoreComma(stats.charactersAvg)}
              </span>
              <span className="text-xs text-zinc-400 font-medium mt-0.5 mb-3">
                Personajes
              </span>
              <div className="w-full h-6 rounded-full bg-zinc-800 p-1 relative flex items-center overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all flex items-center pl-2 min-w-[26px]"
                  style={{
                    width: `${Math.max(22, (stats.charactersAvg / 10) * 100)}%`,
                  }}
                >
                  <Users className="w-3 h-3 text-white shrink-0" />
                </div>
              </div>
            </div>
          </div>

          {/* Botón para votar o editar calificación */}
          {!showVotePanel ? (
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onRequestLogin();
                } else {
                  setShowVotePanel(true);
                }
              }}
              className="w-full py-2.5 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs sm:text-sm font-bold text-zinc-200 flex items-center justify-center gap-2 transition"
            >
              <Sliders className="w-4 h-4 text-violet-400" />
              <span>
                {stats.myRating
                  ? "Editar mi calificación (Historia, Arte, Personajes)"
                  : "Calificar esta serie (Historia, Arte, Personajes)"}
              </span>
            </button>
          ) : (
            <form
              onSubmit={handleSaveVote}
              className="p-4 rounded-2xl bg-zinc-900/90 border border-violet-500/40 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">
                  Tu Calificación (Escala 1 al 10)
                </span>
                <button
                  type="button"
                  onClick={() => setShowVotePanel(false)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-violet-300">📖 Historia</span>
                    <span className="text-white">{storyScore}/10</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={storyScore}
                    onChange={(e) => setStoryScore(Number(e.target.value))}
                    className="w-full accent-violet-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-blue-300">🎨 Arte</span>
                    <span className="text-white">{artScore}/10</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={artScore}
                    onChange={(e) => setArtScore(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-emerald-300">👥 Personajes</span>
                    <span className="text-white">{charactersScore}/10</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={charactersScore}
                    onChange={(e) => setCharactersScore(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submittingVote}
                  className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold"
                >
                  {submittingVote ? "Guardando voto..." : "Guardar mi voto"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* TARJETA 2: Comenta sobre esta serie */}
        <div className="p-5 rounded-3xl bg-zinc-950/90 border border-zinc-800/90 space-y-5 shadow-xl">
          <h3 className="text-lg font-extrabold text-white">
            Comenta sobre esta serie
          </h3>

          {/* Si NO ha iniciado sesión -> Mostrar cuadro "Inicia sesión para comentar" igual a la captura */}
          {!user ? (
            <button
              type="button"
              onClick={onRequestLogin}
              className="w-full py-7 px-4 rounded-2xl bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 hover:border-violet-500/40 flex flex-col items-center justify-center gap-2.5 transition group"
            >
              <Lock className="w-9 h-9 text-blue-400 group-hover:scale-105 transition" />
              <span className="text-sm font-semibold text-zinc-200">
                Inicia sesión para comentar
              </span>
            </button>
          ) : (
            <form onSubmit={handlePostComment} className="space-y-3">
              <div className="flex items-start gap-3">
                <img
                  src={
                    user.picture ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      user.name
                    )}&background=7c3aed&color=fff`
                  }
                  alt={user.name}
                  className="w-10 h-10 rounded-xl object-cover shrink-0 border border-zinc-700"
                />
                <div className="flex-1">
                  <textarea
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={`Escribe tu opinión sobre ${work.title}...`}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl p-3.5 text-sm text-white focus:outline-none resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submittingComment || !commentText.trim()}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-violet-600/20 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {submittingComment
                      ? "Publicando..."
                      : "Publicar comentario"}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Lista de Comentarios */}
          <div className="divide-y divide-zinc-800/80 pt-2">
            {loading ? (
              <p className="text-xs text-zinc-500 py-4 text-center">
                Cargando comentarios...
              </p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                Aún no hay comentarios en esta serie. ¡Sé el primero en opinar!
              </p>
            ) : (
              comments.map((cmt) => {
                const canDelete =
                  isAdmin || (user && user.id === cmt.userId);
                return (
                  <div
                    key={cmt.id}
                    className="py-4 first:pt-2 last:pb-1 flex items-start gap-3.5"
                  >
                    <img
                      src={
                        cmt.userPicture ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          cmt.userName
                        )}&background=3b82f6&color=fff`
                      }
                      alt={cmt.userName}
                      className="w-11 h-11 rounded-2xl object-cover shrink-0 border border-zinc-800"
                    />

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">
                            {cmt.userName}
                          </span>
                          <span className="text-xs text-zinc-500 font-medium">
                            {formatRelativeTime(cmt.createdAt)}
                          </span>
                        </div>

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(cmt.id)}
                            className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="Eliminar comentario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                        {cmt.content}
                      </p>

                      {/* Botón de Corazón (Like) debajo del comentario igual a la captura */}
                      <div className="pt-1 flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => handleToggleCommentLike(cmt.id)}
                          className={`flex items-center gap-1.5 text-xs font-semibold transition ${
                            cmt.likedByMe
                              ? "text-rose-400"
                              : "text-zinc-500 hover:text-rose-400"
                          }`}
                        >
                          <Heart
                            className="w-4 h-4"
                            fill={cmt.likedByMe ? "currentColor" : "none"}
                          />
                          {cmt.likesCount > 0 && <span>{cmt.likesCount}</span>}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
