"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  BookOpen,
  Plus,
  Search,
  Heart,
  Layers,
  Sparkles,
  SlidersHorizontal,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  Image as ImageIcon,
  Star,
  Database,
  Smartphone,
  CheckCircle2,
  Clock,
  Trash2,
  BookMarked,
  Library,
  Upload,
  LogOut,
  UserCheck,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertTriangle,
  Lock,
  Filter,
  Calendar,
  Tag,
  User as UserIcon,
  X,
  BarChart3,
} from "lucide-react";
import {
  CollectionData,
  UserProfile,
  VolumeItem,
  WorkItem,
  WorkStatus,
  WorkType,
} from "@/types/library";
import CreateWorkModal from "@/components/CreateWorkModal";
import WorkDetailModal from "@/components/WorkDetailModal";
import PdfReaderModal from "@/components/PdfReaderModal";
import GoogleLoginModal from "@/components/GoogleLoginModal";
import AdminStatsModal from "@/components/AdminStatsModal";
import { uploadFileDirectToCloud } from "@/lib/supabase-upload-client";
import { isWorkSensitive } from "@/lib/sensitive";
import { getWorkNonSpanishLanguage } from "@/lib/language";

const DEFAULT_GENRE_SUGGESTIONS = [
  "Acción",
  "Terror",
  "Seinen",
  "Shonen",
  "Psicológico",
  "Drama",
  "Fantasía",
  "Ciencia Ficción",
  "Misterio",
  "Romance",
  "Comedia",
  "Aventura",
  "Sobrenatural",
];

export default function LibraryHomePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAdminAccount, setIsAdminAccount] = useState<boolean>(false);
  const [previewAsPublic, setPreviewAsPublic] = useState<boolean>(false);
  const [showAdminPinPrompt, setShowAdminPinPrompt] = useState<boolean>(false);
  const [adminPinInput, setAdminPinInput] = useState<string>("");
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  const [showAdminStatsModal, setShowAdminStatsModal] = useState<boolean>(false);

  const [works, setWorks] = useState<WorkItem[]>([]);
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [loading, setLoading] = useState(true);

  // Effective Admin permissions (false when viewing as Public)
  const effectiveIsAdmin = isAdminAccount && !previewAsPublic;

  // Filters, Classification & Organization
  const [showClassifyPanel, setShowClassifyPanel] = useState<boolean>(false);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [authorFilter, setAuthorFilter] = useState<string>("ALL");
  const [yearFilter, setYearFilter] = useState<string>("ALL");
  const [genreFilter, setGenreFilter] = useState<string>("ALL");
  const [readingModeFilter, setReadingModeFilter] = useState<string>("ALL");
  const [groupBy, setGroupBy] = useState<
    "none" | "genre" | "author" | "year" | "type" | "status"
  >("none");
  const [favoriteOnly, setFavoriteOnly] = useState<boolean>(false);
  const [selectedCollectionId, setSelectedCollectionId] =
    useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<
    | "custom"
    | "title"
    | "author"
    | "year_desc"
    | "year_asc"
    | "rating"
    | "volumes"
    | "recent"
  >("custom");
  const [organizeMode, setOrganizeMode] = useState<boolean>(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalType, setCreateModalType] = useState<WorkType | null>(null);
  const [showGoogleLoginModal, setShowGoogleLoginModal] = useState(false);
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);
  const [openAddVolumeOnModal, setOpenAddVolumeOnModal] = useState(false);
  const [openVolumesOnlyOnModal, setOpenVolumesOnlyOnModal] = useState(false);
  const [readerState, setReaderState] = useState<{
    work: WorkItem;
    volume: VolumeItem;
  } | null>(null);
  const [showDbGuideModal, setShowDbGuideModal] = useState(false);

  // Etiqueta dinámica para el botón de añadir obra según la sección actual
  const sectionAddBtnLabel = useMemo(() => {
    switch (typeFilter) {
      case "BOOK":
        return "Añadir Libro";
      case "MANGA":
        return "Añadir Manga";
      case "LIGHT_NOVEL":
        return "Añadir Novela Ligera";
      case "COMIC":
        return "Añadir Cómic";
      default:
        return "Añadir obra";
    }
  }, [typeFilter]);

  // New Collection input
  const [showNewCollectionInput, setShowNewCollectionInput] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  // Detect if user is running inside the native mobile APK / standalone app
  const [isMobileApp, setIsMobileApp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkIsApp = () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("app") === "true" || urlParams.get("apk") === "true") {
        try {
          localStorage.setItem("komy_is_native_app", "true");
        } catch {}
        return true;
      }

      try {
        if (localStorage.getItem("komy_is_native_app") === "true") {
          return true;
        }
      } catch {}

      const win = window as any;
      if (win.Capacitor || win.androidBridge || win.webkit?.messageHandlers) {
        return true;
      }

      if (
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true
      ) {
        return true;
      }

      const ua = navigator.userAgent || "";
      if (
        /;\s*wv\b/i.test(ua) ||
        /Version\/[\d.]+\s+(Mobile\s+)?Chrome/i.test(ua) ||
        /KomyApp/i.test(ua)
      ) {
        return true;
      }

      return false;
    };

    if (checkIsApp()) {
      setIsMobileApp(true);
      try {
        localStorage.setItem("komy_is_native_app", "true");
      } catch {}
    }
  }, []);

  // Filtro y modo de ocultar Contenido Sensible (+18) controlado por el Administrador
  const [hideSensitiveMode, setHideSensitiveMode] = useState<boolean>(true);
  const [updatingSensitiveMode, setUpdatingSensitiveMode] =
    useState<boolean>(false);
  const [showSensitive, setShowSensitive] = useState<boolean>(false);
  const [showSensitiveWarningModal, setShowSensitiveWarningModal] =
    useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("komy_show_sensitive");
      if (saved === "true") {
        setShowSensitive(true);
      }
    } catch {}

    // Cargar estado global del modo ocultar +18 configurado por el Administrador
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.hideSensitiveMode === "boolean") {
          setHideSensitiveMode(data.hideSensitiveMode);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleSensitiveMode = async () => {
    if (!effectiveIsAdmin) return;
    const nextVal = !hideSensitiveMode;
    setUpdatingSensitiveMode(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hideSensitiveMode: nextVal,
          adminPin: "1234",
        }),
      });
      if (res.ok) {
        setHideSensitiveMode(nextVal);
      }
    } catch (err) {
      console.error("Error al alternar modo ocultar +18:", err);
    } finally {
      setUpdatingSensitiveMode(false);
    }
  };

  const fetchLibraryData = async () => {
    setLoading(true);
    try {
      const [authRes, worksRes, colsRes] = await Promise.all([
        fetch("/api/auth/google", { cache: "no-store" }),
        fetch("/api/works", { cache: "no-store" }),
        fetch("/api/collections", { cache: "no-store" }),
      ]);
      if (authRes.ok) {
        const authData = await authRes.json();
        setUser(authData.user || null);
        setIsAdminAccount(
          Boolean(authData.isAdmin || authData.user?.role === "ADMIN")
        );
      }
      if (worksRes.ok) {
        const wData = await worksRes.json();
        setWorks(wData);
        try {
          localStorage.setItem("komy_cached_works", JSON.stringify(wData));
        } catch {
          // ignore storage quota errors
        }
      }
      if (colsRes.ok) {
        const cData = await colsRes.json();
        setCollections(cData);
      }
    } catch (err) {
      console.error("Error loading library (using offline cache):", err);
      try {
        const cached = localStorage.getItem("komy_cached_works");
        if (cached) {
          setWorks(JSON.parse(cached));
        }
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibraryData();
  }, []);

  // Control de Retroceso Móvil Inteligente:
  // Evita salir de toda la app al pulsar el botón o gesto Atrás en el celular;
  // retrocede únicamente un paso (Lector -> Ficha de Obra -> Catálogo).
  const backActionStateRef = useRef({
    readerState,
    activeWorkId,
    showAdminStatsModal,
    showCreateModal,
    showGoogleLoginModal,
    showDbGuideModal,
    showSensitiveWarningModal,
    showClassifyPanel,
    hasFilters: false,
  });

  const hasActiveFilters = Boolean(
    searchQuery !== "" ||
    genreFilter !== "ALL" ||
    authorFilter !== "ALL" ||
    yearFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    favoriteOnly
  );

  backActionStateRef.current = {
    readerState,
    activeWorkId,
    showAdminStatsModal,
    showCreateModal,
    showGoogleLoginModal,
    showDbGuideModal,
    showSensitiveWarningModal,
    showClassifyPanel,
    hasFilters: hasActiveFilters,
  };

  const handleStepBackAction = useCallback((): boolean => {
    const s = backActionStateRef.current;

    // 1. Si está leyendo un tomo (PDF/CBZ), cerrar el lector y volver a la obra
    if (s.readerState) {
      setReaderState(null);
      return true;
    }

    // 2. Si está en la ficha o tomos de la obra, cerrarla y volver al catálogo
    if (s.activeWorkId) {
      setActiveWorkId(null);
      setOpenAddVolumeOnModal(false);
      setOpenVolumesOnlyOnModal(false);
      return true;
    }

    // 3. Modales secundarios (Estadísticas, Subir obra, Login, Filtros)
    if (s.showAdminStatsModal) {
      setShowAdminStatsModal(false);
      return true;
    }
    if (s.showCreateModal) {
      setShowCreateModal(false);
      setCreateModalType(null);
      return true;
    }
    if (s.showGoogleLoginModal) {
      setShowGoogleLoginModal(false);
      return true;
    }
    if (s.showDbGuideModal) {
      setShowDbGuideModal(false);
      return true;
    }
    if (s.showSensitiveWarningModal) {
      setShowSensitiveWarningModal(false);
      return true;
    }
    if (s.showClassifyPanel) {
      setShowClassifyPanel(false);
      return true;
    }

    // 4. Si hay filtros activos en el catálogo, limpiarlos
    if (s.hasFilters) {
      handleResetFilters();
      return true;
    }

    // Si ya está en la vista principal limpia sin nada abierto, retorna false (permite salir de la app)
    return false;
  }, []);

  // Registrar listeners para WebView nativo Android y navegadores móviles (popstate & keydown)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Conexión con MainActivity.java de Android (onBackPressed)
    (window as any).__komyHandleBackAction = handleStepBackAction;

    // 2. Integración con el historial de navegación móvil (popstate)
    const onPopState = (e: PopStateEvent) => {
      const handled = handleStepBackAction();
      if (handled) {
        e.preventDefault?.();
        window.history.pushState({ komyStep: true }, "");
      }
    };

    window.history.replaceState({ komyRoot: true }, "");
    window.history.pushState({ komyStep: true }, "");
    window.addEventListener("popstate", onPopState);

    // 3. Soporte para teclas Escape / GoBack
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "GoBack") {
        const handled = handleStepBackAction();
        if (handled) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      delete (window as any).__komyHandleBackAction;
    };
  }, [handleStepBackAction]);

  const handleLogout = async () => {
    await fetch("/api/auth/google", { method: "DELETE" });
    setUser(null);
    setIsAdminAccount(false);
    setPreviewAsPublic(false);
    setOrganizeMode(false);
    setSelectedCollectionId("ALL");
    setFavoriteOnly(false);
    fetchLibraryData();
  };

  const handleUnlockAdminWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPinError(null);
    try {
      const res = await fetch("/api/auth/google", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activateAdmin",
          adminPin: adminPinInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdminPinError(data.error || "PIN de Administrador incorrecto.");
        return;
      }
      if (data.user) setUser(data.user);
      setIsAdminAccount(true);
      setPreviewAsPublic(false);
      setShowAdminPinPrompt(false);
      setAdminPinInput("");
    } catch {
      setAdminPinError("No se pudo verificar el PIN.");
    }
  };

  const activeWork = useMemo(
    () => works.find((w) => w.id === activeWorkId) || null,
    [works, activeWorkId]
  );

  // Obras base visibles según si el modo ocultar +18 está activo o si el admin las visualiza
  const baseWorks = useMemo(() => {
    // Si el Administrador desactivó el modo ocultar, las obras +18 están visibles para todos
    if (!hideSensitiveMode) return works;
    // Si el Administrador está navegando y activó verlas temporalmente (y no en vista pública)
    if (effectiveIsAdmin && showSensitive) return works;
    // Por defecto con el modo ocultar activo, se oculta cualquier obra sensible
    return works.filter((w) => !isWorkSensitive(w));
  }, [works, hideSensitiveMode, effectiveIsAdmin, showSensitive]);

  // Listas dinámicas de Autores, Años y Géneros presentes en el catálogo
  const availableAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const w of baseWorks) {
      const a = (w.author || "").trim();
      if (a && a.toLowerCase() !== "autor desconocido") {
        set.add(a);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseWorks]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const w of baseWorks) {
      if (w.releaseYear) {
        set.add(String(w.releaseYear));
      }
    }
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [baseWorks]);

  const { availableGenres, genreCounts } = useMemo(() => {
    const map = new Map<string, string>();
    const counts = new Map<string, number>();

    for (const w of baseWorks) {
      const parts = (w.tags || "")
        .split(",")
        .map((t) => t.replace(/\.+$/, "").trim())
        .filter(Boolean);
      const seenInWork = new Set<string>();
      for (const p of parts) {
        const key = p.toLowerCase();
        if (!map.has(key)) {
          map.set(key, p);
        }
        if (!seenInWork.has(key)) {
          seenInWork.add(key);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }

    // Si aún no hay ningún género añadido en las obras, mostrar sugerencias base
    if (map.size === 0) {
      for (const g of DEFAULT_GENRE_SUGGESTIONS) {
        map.set(g.toLowerCase(), g);
      }
    }

    return {
      availableGenres: Array.from(map.values()).sort((a, b) =>
        a.localeCompare(b, "es", { sensitivity: "base" })
      ),
      genreCounts: counts,
    };
  }, [baseWorks]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== "ALL") count++;
    if (statusFilter !== "ALL") count++;
    if (authorFilter !== "ALL") count++;
    if (yearFilter !== "ALL") count++;
    if (genreFilter !== "ALL") count++;
    if (readingModeFilter !== "ALL") count++;
    if (groupBy !== "none") count++;
    if (favoriteOnly) count++;
    return count;
  }, [
    typeFilter,
    statusFilter,
    authorFilter,
    yearFilter,
    genreFilter,
    readingModeFilter,
    groupBy,
    favoriteOnly,
  ]);

  const handleResetFilters = () => {
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setAuthorFilter("ALL");
    setYearFilter("ALL");
    setGenreFilter("ALL");
    setReadingModeFilter("ALL");
    setGroupBy("none");
    setFavoriteOnly(false);
    setSelectedCollectionId("ALL");
    setSearchQuery("");
    setSortBy("custom");
  };

  const handleOpenGenreCartelera = (rawGenre: string) => {
    const clean = rawGenre.replace(/\.+$/, "").trim();
    if (!clean) return;
    setActiveWorkId(null);
    setOpenAddVolumeOnModal(false);
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setAuthorFilter("ALL");
    setYearFilter("ALL");
    setSearchQuery("");
    setGroupBy("none");
    setGenreFilter(clean);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleOpenAuthorCartelera = (rawAuthor: string) => {
    const clean = rawAuthor.trim();
    if (!clean) return;
    setActiveWorkId(null);
    setOpenAddVolumeOnModal(false);
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setGenreFilter("ALL");
    setYearFilter("ALL");
    setSearchQuery("");
    setGroupBy("none");
    setAuthorFilter(clean);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleOpenYearCartelera = (rawYear: string) => {
    const clean = rawYear.trim();
    if (!clean) return;
    setActiveWorkId(null);
    setOpenAddVolumeOnModal(false);
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setGenreFilter("ALL");
    setAuthorFilter("ALL");
    setSearchQuery("");
    setGroupBy("none");
    setYearFilter(clean);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Filtered and Sorted Works
  const filteredWorks = useMemo(() => {
    const list = baseWorks.filter((w) => {
      if (typeFilter !== "ALL" && w.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && w.status !== statusFilter) return false;
      if (readingModeFilter !== "ALL" && w.readingMode !== readingModeFilter)
        return false;
      if (favoriteOnly && !w.isFavorite) return false;
      if (
        authorFilter !== "ALL" &&
        (w.author || "Autor Desconocido").trim().toLowerCase() !==
          authorFilter.toLowerCase()
      ) {
        return false;
      }
      if (yearFilter !== "ALL") {
        const wYear = w.releaseYear ? String(w.releaseYear) : "Sin año";
        if (wYear !== yearFilter) return false;
      }
      if (genreFilter !== "ALL") {
        const target = genreFilter.replace(/\.+$/, "").trim().toLowerCase();
        const workGenres = (w.tags || "")
          .split(",")
          .map((t) => t.replace(/\.+$/, "").trim().toLowerCase())
          .filter(Boolean);
        if (!workGenres.includes(target)) return false;
      }
      if (
        selectedCollectionId !== "ALL" &&
        !w.collectionItems?.some(
          (ci) => ci.collectionId === selectedCollectionId
        )
      ) {
        return false;
      }
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchTitle = w.title.toLowerCase().includes(q);
        const matchAuthor = (w.author || "").toLowerCase().includes(q);
        const matchTags = (w.tags || "").toLowerCase().includes(q);
        const matchYear = w.releaseYear
          ? String(w.releaseYear).includes(q)
          : false;
        if (!matchTitle && !matchAuthor && !matchTags && !matchYear)
          return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "author")
        return (a.author || "").localeCompare(b.author || "");
      if (sortBy === "year_desc")
        return (b.releaseYear || 0) - (a.releaseYear || 0);
      if (sortBy === "year_asc")
        return (a.releaseYear || 9999) - (b.releaseYear || 9999);
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "volumes") return b.volumes.length - a.volumes.length;
      if (sortBy === "recent")
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      return a.sortOrder - b.sortOrder;
    });
  }, [
    baseWorks,
    typeFilter,
    statusFilter,
    readingModeFilter,
    favoriteOnly,
    authorFilter,
    yearFilter,
    genreFilter,
    selectedCollectionId,
    searchQuery,
    sortBy,
  ]);

  // Agrupación dinámica de la estantería (Por Género, Por Autor, Por Año, Por Tipo, Por Estado)
  const groupedSections = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "Catálogo", items: filteredWorks }];
    }

    const map = new Map<string, WorkItem[]>();

    for (const w of filteredWorks) {
      if (groupBy === "author") {
        const key = (w.author || "Autor Desconocido").trim();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(w);
      } else if (groupBy === "year") {
        const key = w.releaseYear
          ? `Año ${w.releaseYear}`
          : "Sin año especificado";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(w);
      } else if (groupBy === "genre") {
        const genres = (w.tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (genres.length === 0) {
          const key = "Sin género asignado";
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(w);
        } else {
          for (const g of genres) {
            if (!map.has(g)) map.set(g, []);
            map.get(g)!.push(w);
          }
        }
      } else if (groupBy === "type") {
        const key =
          w.type === "MANGA"
            ? "Mangas"
            : w.type === "BOOK"
            ? "Libros"
            : w.type === "LIGHT_NOVEL"
            ? "Novelas Ligeras"
            : "Cómics / Webtoons";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(w);
      } else if (groupBy === "status") {
        const key =
          w.status === "READING"
            ? "📖 Leyendo actualmente"
            : w.status === "COMPLETED"
            ? "✅ Terminados"
            : w.status === "ON_HOLD"
            ? "⏸️ En pausa"
            : "⏳ Pendientes por leer";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(w);
      }
    }

    return Array.from(map.entries()).map(([label, items]) => ({
      key: label,
      label,
      items,
    }));
  }, [filteredWorks, groupBy]);

  // "Continue Reading" volumes across all works
  const continueReadingItems = useMemo(() => {
    const items: { work: WorkItem; volume: VolumeItem }[] = [];
    for (const w of works) {
      for (const v of w.volumes) {
        if (v.lastReadAt || v.currentPage > 1) {
          items.push({ work: w, volume: v });
        }
      }
    }
    return items
      .sort((a, b) => {
        const tA = a.volume.lastReadAt
          ? new Date(a.volume.lastReadAt).getTime()
          : 0;
        const tB = b.volume.lastReadAt
          ? new Date(b.volume.lastReadAt).getTime()
          : 0;
        return tB - tA;
      })
      .slice(0, 6);
  }, [works]);

  // Reorder Works manually on the shelf
  const handleMoveWork = async (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredWorks.length) return;

    const currentList = [...filteredWorks];
    const [moved] = currentList.splice(index, 1);
    currentList.splice(targetIndex, 0, moved);

    const updatedOrderIds = currentList.map((w) => w.id);
    setSortBy("custom");

    setWorks((prev) =>
      prev.map((w) => {
        const idx = updatedOrderIds.indexOf(w.id);
        return idx !== -1 ? { ...w, sortOrder: idx + 1 } : w;
      })
    );

    await fetch("/api/works", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: updatedOrderIds }),
    });
  };

  // Quick Change Cover directly from Card in Organize Mode
  const handleQuickCardCoverChange = async (workId: string, file: File) => {
    const { url } = await uploadFileDirectToCloud(file, "covers");
    if (!url) return;

    const res = await fetch(`/api/works/${workId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverUrl: url }),
    });
    if (res.ok) {
      const updated = await res.json();
      setWorks((prev) => prev.map((w) => (w.id === workId ? updated : w)));
    }
  };

  // Create New Custom Collection (Estantería)
  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;

    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCollectionName.trim() }),
    });
    if (res.ok) {
      const created = await res.json();
      setCollections((prev) => [...prev, created]);
      setNewCollectionName("");
      setShowNewCollectionInput(false);
    }
  };

  const handleDeleteCollection = async (colId: string) => {
    await fetch(`/api/collections?id=${colId}`, { method: "DELETE" });
    setCollections((prev) => prev.filter((c) => c.id !== colId));
    if (selectedCollectionId === colId) setSelectedCollectionId("ALL");
  };

  const handleToggleWorkCollection = async (
    collectionId: string,
    workId: string
  ) => {
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggleWork",
        collectionId,
        workId,
      }),
    });
    fetchLibraryData();
  };

  // Stats
  const totalVolumesCount = baseWorks.reduce((acc, w) => acc + w.volumes.length, 0);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-zinc-950 text-zinc-100 pb-20 lg:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 xl:w-72 bg-zinc-900/70 border-r border-zinc-800/80 flex-col justify-between p-5 shrink-0 max-h-screen sticky top-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto pr-1 space-y-6">
          {/* App Brand - Solo las letras de KOMY sin recuadro ni bordes */}
          <div
            onClick={handleResetFilters}
            className="cursor-pointer group flex items-center justify-center py-1 select-none transition-transform hover:scale-[1.04]"
            title="Inicio - Komy"
          >
            <div className="w-full h-20 flex items-center justify-center relative">
              <img
                src="/komy-wordmark.png"
                alt="Komy"
                className="w-full h-full object-contain filter drop-shadow-[0_0_16px_rgba(168,85,247,0.45)] group-hover:drop-shadow-[0_0_24px_rgba(168,85,247,0.7)] transition duration-300"
              />
            </div>
          </div>

          {/* Google / Gmail Account Card + Admin vs Public Role Controls */}
          <div className="p-3 rounded-2xl bg-zinc-950/90 border border-zinc-800 space-y-2.5">
            {user ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={
                      user.picture ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        user.name
                      )}&background=7c3aed&color=fff`
                    }
                    alt={user.name}
                    className="w-9 h-9 rounded-full object-cover border border-violet-500/40 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-white truncate">
                        {user.name}
                      </p>
                      {isAdminAccount && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase shrink-0 bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition shrink-0"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowGoogleLoginModal(true)}
                className="w-full py-2 px-3 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs flex items-center justify-center gap-2 shadow transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                  />
                </svg>
                <span>Iniciar Sesión</span>
              </button>
            )}

            {/* Admin Mode Switcher (Visible ONLY when logged in with sotgg45@gmail.com) */}
            {isAdminAccount && (
              <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Vista de la Aplicación:
                </p>
                <div className="grid grid-cols-2 gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setPreviewAsPublic(false)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                      !previewAsPublic
                        ? "bg-amber-500 text-zinc-950 shadow"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    title="Habilita subir obras/tomos, cambiar portadas, ordenar y editar"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </button>
                  <button
                    onClick={() => {
                      setPreviewAsPublic(true);
                      setOrganizeMode(false);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                      previewAsPublic
                        ? "bg-violet-600 text-white shadow"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    title="Ver exactamente cómo ven la app los lectores públicos (solo lectura)"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Público</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Primary Upload CTA (Admin Only) */}
          {effectiveIsAdmin && (
            <div className="space-y-1.5">
              <button
                onClick={() => {
                  setCreateModalType(null);
                  setShowCreateModal(true);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-600/25 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Subir Manga o Libro</span>
              </button>
              <button
                onClick={() => setShowAdminStatsModal(true)}
                className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border border-emerald-500/30 text-emerald-200 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-sm"
              >
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Estadísticas de Lectura</span>
              </button>
            </div>
          )}

          {/* Library Type Navigation */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
              Catálogo de Lectura
            </p>
            {[
              { id: "ALL", label: "Todo el Catálogo", icon: Library },
              { id: "MANGA", label: "Mangas", icon: BookOpen },
              { id: "BOOK", label: "Libros", icon: BookMarked },
              { id: "LIGHT_NOVEL", label: "Novelas Ligeras", icon: Layers },
              { id: "COMIC", label: "Cómics / Webtoons", icon: Sparkles },
            ].map((item) => {
              const Icon = item.icon;
              const active = typeFilter === item.id && !favoriteOnly;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setTypeFilter(item.id);
                    setFavoriteOnly(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                    active
                      ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => setFavoriteOnly((f) => !f)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                favoriteOnly
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Heart className="w-4 h-4" />
                Mis Favoritos
              </span>
            </button>
          </div>

          {/* Custom Shelves / Collections */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Estanterías
              </p>
              {effectiveIsAdmin && (
                <button
                  onClick={() => setShowNewCollectionInput((s) => !s)}
                  className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-0.5 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Nueva
                </button>
              )}
            </div>

            {effectiveIsAdmin && showNewCollectionInput && (
              <form onSubmit={handleCreateCollection} className="px-2 space-y-2">
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Nombre de estantería..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowNewCollectionInput(false)}
                    className="px-2 py-1 text-[11px] text-zinc-400"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-[11px] font-semibold"
                  >
                    Crear
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-1 max-h-40 overflow-y-auto">
              <button
                onClick={() => setSelectedCollectionId("ALL")}
                className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-medium transition ${
                  selectedCollectionId === "ALL"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-800/40"
                }`}
              >
                Todas las estanterías
              </button>
              {collections.map((col) => (
                <div
                  key={col.id}
                  className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium transition ${
                    selectedCollectionId === col.id
                      ? "bg-violet-600/20 text-violet-200 border border-violet-500/30"
                      : "text-zinc-400 hover:bg-zinc-800/50"
                  }`}
                >
                  <button
                    onClick={() => setSelectedCollectionId(col.id)}
                    className="flex-1 text-left truncate flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: col.color }}
                    />
                    <span className="truncate">{col.name}</span>
                  </button>
                  {effectiveIsAdmin && (
                    <button
                      onClick={() => handleDeleteCollection(col.id)}
                      className="text-zinc-600 hover:text-red-400 ml-1"
                      title="Eliminar estantería"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Genres / Categorías en la Barra Lateral Izquierda */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-violet-400" />
                <span>Géneros</span>
              </p>
              {genreFilter !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setGenreFilter("ALL")}
                  className="text-[11px] text-violet-400 hover:text-violet-300 font-semibold"
                >
                  Ver todos
                </button>
              )}
            </div>

            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setGenreFilter("ALL")}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium transition ${
                  genreFilter === "ALL"
                    ? "bg-zinc-800 text-white font-bold"
                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                }`}
              >
                <span>Todos los géneros</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-900 text-zinc-400">
                  {baseWorks.length}
                </span>
              </button>

              {availableGenres.map((genre) => {
                const count = genreCounts.get(genre.toLowerCase()) || 0;
                const isSelected =
                  genreFilter.toLowerCase() === genre.toLowerCase();
                const isAdultGenre =
                  genre.toLowerCase() === "+18" ||
                  genre.toLowerCase() === "adulto" ||
                  genre.toLowerCase() === "nsfw";

                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setGenreFilter("ALL");
                      } else {
                        handleOpenGenreCartelera(genre);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-1.5 rounded-xl text-xs font-medium transition group ${
                      isSelected
                        ? isAdultGenre
                          ? "bg-rose-600/30 text-rose-200 border border-rose-500/50 font-bold"
                          : "bg-violet-600/25 text-violet-200 border border-violet-500/40 font-bold"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                    }`}
                  >
                    <span className="truncate flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 transition ${
                          isSelected
                            ? isAdultGenre
                              ? "bg-rose-400 scale-125"
                              : "bg-violet-400 scale-125"
                            : isAdultGenre
                            ? "bg-rose-500/70 group-hover:bg-rose-400"
                            : "bg-zinc-600 group-hover:bg-violet-400"
                        }`}
                      />
                      <span className="truncate flex items-center gap-1">
                        {isAdultGenre && <span>🔞</span>}
                        <span>{genre}</span>
                      </span>
                    </span>
                    {count > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${
                          isSelected
                            ? isAdultGenre
                              ? "bg-rose-600/40 text-rose-200"
                              : "bg-violet-600/40 text-violet-200"
                            : "bg-zinc-900 text-zinc-500 group-hover:text-zinc-300"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Control Exclusivo de Administrador en Barra Lateral: Modo Ocultar +18 */}
            {effectiveIsAdmin && (
              <div className="pt-2">
                <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
                      <span className="text-xs">🔞</span>
                      <span>Modo Ocultar +18</span>
                    </span>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${
                        hideSensitiveMode
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-rose-600/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {hideSensitiveMode ? "Oculto" : "Visible"}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-tight">
                    {hideSensitiveMode
                      ? "Contenido +18 protegido y oculto para los usuarios."
                      : "Contenido +18 habilitado y visible para los usuarios."}
                  </p>
                  <button
                    type="button"
                    disabled={updatingSensitiveMode}
                    onClick={handleToggleSensitiveMode}
                    className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow ${
                      hideSensitiveMode
                        ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
                        : "bg-rose-600 hover:bg-rose-500 text-white"
                    }`}
                  >
                    {updatingSensitiveMode
                      ? "Guardando..."
                      : hideSensitiveMode
                      ? "Desactivar Ocultar (Mostrar a usuarios)"
                      : "Activar Modo Ocultar (Ocultar a usuarios)"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Stats & Server DB Info Button */}
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 flex items-center justify-between text-xs">
            <div>
              <p className="text-zinc-400">Disponibles para Leer</p>
              <p className="font-bold text-white mt-0.5">
                {baseWorks.length} Obras • {totalVolumesCount} Tomos
              </p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>

          {!isMobileApp && (
            <a
              href="/komy.apk"
              download="Komy.apk"
              className="w-full py-3 px-3.5 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-between shadow-lg shadow-violet-600/30 hover:shadow-violet-600/50 transition group border border-violet-400/30"
              title="Descargar app oficial Komy para celular Android (.apk)"
            >
              <div className="flex items-center gap-2.5">
                <img
                  src="/komy-logo.png"
                  alt="Komy"
                  className="w-6 h-6 object-contain shrink-0 group-hover:scale-110 transition-transform filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]"
                />
                <div className="text-left leading-tight">
                  <p className="text-[10px] text-violet-200 font-medium">Instalar en Celular</p>
                  <p className="font-extrabold text-white text-xs tracking-wide">Descargar App (.apk)</p>
                </div>
              </div>
              <ArrowDown className="w-4 h-4 text-violet-200 group-hover:translate-y-0.5 transition-transform shrink-0" />
            </a>
          )}

          {effectiveIsAdmin && (
            <button
              onClick={() => setShowDbGuideModal(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-2 transition"
            >
              <Database className="w-3.5 h-3.5 text-violet-400" />
              <span>Base de Datos & Servidor</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Search & Organization Bar */}
        <header className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 sm:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Mobile Brand + Gmail Login + Admin/Public Toggle */}
            <div className="flex items-center justify-between lg:hidden">
              <div
                onClick={handleResetFilters}
                className="flex items-center cursor-pointer select-none py-0.5"
              >
                <div className="w-32 sm:w-40 h-10 flex items-center justify-center relative">
                  <img
                    src="/komy-wordmark.png"
                    alt="Komy"
                    className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(168,85,247,0.45)]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {isAdminAccount && (
                  <button
                    onClick={() => {
                      setPreviewAsPublic((p) => !p);
                      setOrganizeMode(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 ${
                      previewAsPublic
                        ? "bg-violet-600/20 border-violet-500 text-violet-300"
                        : "bg-amber-500/20 border-amber-500 text-amber-300"
                    }`}
                  >
                    {previewAsPublic ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Público</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Admin</span>
                      </>
                    )}
                  </button>
                )}

                {user ? (
                  <button
                    onClick={handleLogout}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 flex items-center gap-1.5"
                    title="Cerrar sesión"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="max-w-[80px] truncate">{user.name}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowGoogleLoginModal(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                    title="Iniciar sesión"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-zinc-700" />
                    <span>Iniciar sesión</span>
                  </button>
                )}

                {/* Control Exclusivo de Administrador en cabecera móvil: Activar / Desactivar Modo Ocultar +18 */}
                {effectiveIsAdmin && (
                  <button
                    type="button"
                    disabled={updatingSensitiveMode}
                    onClick={handleToggleSensitiveMode}
                    className={`px-2 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition shrink-0 ${
                      hideSensitiveMode
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                        : "bg-rose-600/25 border-rose-500/60 text-rose-200"
                    }`}
                    title={
                      hideSensitiveMode
                        ? "Modo +18 Oculto para usuarios"
                        : "Modo +18 Visible para usuarios"
                    }
                  >
                    {updatingSensitiveMode ? (
                      <span className="text-[10px]">...</span>
                    ) : hideSensitiveMode ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[10px] font-bold text-amber-300">
                          +18 Oculto
                        </span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-rose-400" />
                        <span className="text-[10px] font-bold text-rose-300">
                          +18 Visible
                        </span>
                      </>
                    )}
                  </button>
                )}

                {!isMobileApp && (
                  <a
                    href="/komy.apk"
                    download="Komy.apk"
                    className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 border border-violet-400/30 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-violet-600/30 transition active:scale-95 group"
                    title="Descargar app oficial Komy para Android (.apk)"
                  >
                    <img
                      src="/komy-logo.png"
                      alt="Komy"
                      className="w-4 h-4 object-contain shrink-0 group-hover:scale-110 transition-transform filter drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
                    />
                    <span>APK</span>
                  </a>
                )}

                {effectiveIsAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowAdminStatsModal(true)}
                      className="p-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:text-white transition"
                      title="Estadísticas de Lectura"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setCreateModalType(null);
                        setShowCreateModal(true);
                      }}
                      className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Subir</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar manga, libro, autor o etiqueta..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* Organization & Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Botón Principal: Clasificar / Filtrar por Autor, Año, Género, etc. */}
              <button
                onClick={() => setShowClassifyPanel((p) => !p)}
                className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                  showClassifyPanel || activeFiltersCount > 0
                    ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-600/25"
                    : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Clasificar / Filtrar</span>
                {activeFiltersCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white text-violet-900 text-[10px] font-extrabold leading-none">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Control Exclusivo de Administrador: Activar / Desactivar Modo Ocultar +18 */}
              {effectiveIsAdmin && (
                <button
                  type="button"
                  disabled={updatingSensitiveMode}
                  onClick={handleToggleSensitiveMode}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition shadow ${
                    hideSensitiveMode
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                      : "bg-rose-600/25 border-rose-500/60 text-rose-200 hover:bg-rose-600/35"
                  }`}
                  title={
                    hideSensitiveMode
                      ? "Modo Ocultar +18 ACTIVO: El contenido adulto está oculto a los usuarios. Clic para desactivar y mostrar a usuarios."
                      : "Modo Ocultar +18 DESACTIVADO: El contenido adulto está visible a los usuarios. Clic para activar modo ocultar."
                  }
                >
                  {updatingSensitiveMode ? (
                    <span>Guardando...</span>
                  ) : hideSensitiveMode ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>Modo +18: Oculto</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-rose-400" />
                      <span>Modo +18: Visible</span>
                    </>
                  )}
                </button>
              )}

              {/* Botón Admin: Estadísticas & Métricas de Lectura */}
              {effectiveIsAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminStatsModal(true)}
                  className="px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-bold flex items-center gap-1.5 transition shadow"
                  title="Ver estadísticas en tiempo real: documentos más leídos, tiempo de lectura, comunidad y diagramas"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Estadísticas</span>
                </button>
              )}

              {/* Reading Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
              >
                <option value="ALL">Todos los estados</option>
                <option value="READING">📖 Leyendo</option>
                <option value="PLAN_TO_READ">⏳ Pendientes</option>
                <option value="COMPLETED">✅ Terminados</option>
                <option value="ON_HOLD">⏸️ En pausa</option>
              </select>

              {/* Sort Order Selector */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
              >
                <option value="custom">Orden del Catálogo</option>
                <option value="title">Título (A → Z)</option>
                <option value="author">Autor (A → Z)</option>
                <option value="year_desc">Año (Más recientes)</option>
                <option value="year_asc">Año (Más antiguos)</option>
                <option value="volumes">Más Tomos primero</option>
                <option value="rating">Mejor Calificados</option>
                <option value="recent">Actualizados reciente</option>
              </select>

              {/* Toggle Organize Shelf Mode (Admin Only) */}
              {effectiveIsAdmin && (
                <button
                  onClick={() => setOrganizeMode((o) => !o)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                    organizeMode
                      ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-lg shadow-amber-500/10"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  }`}
                  title="Activa los botones rápidos en cada tarjeta para mover de lugar o cambiar portadas directamente"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>
                    {organizeMode ? "Listo Organizar" : "Organizar Todo"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Barra Automática de Botones por Género (Cada etiqueta nueva en cualquier obra genera su botón aquí automáticamente) */}
          {availableGenres.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-zinc-900 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-1 shrink-0 mr-1">
                <Tag className="w-3 h-3 text-violet-400" />
                <span>Géneros:</span>
              </span>
              <button
                type="button"
                onClick={() => setGenreFilter("ALL")}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition shrink-0 ${
                  genreFilter === "ALL"
                    ? "bg-violet-600 text-white border-violet-500 shadow-sm shadow-violet-600/30"
                    : "bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                }`}
              >
                Todos
              </button>
              {availableGenres.map((genre) => {
                const active =
                  genreFilter.toLowerCase() === genre.toLowerCase();
                const count = genreCounts.get(genre.toLowerCase()) || 0;
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => setGenreFilter(active ? "ALL" : genre)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition shrink-0 flex items-center gap-1.5 ${
                      active
                        ? "bg-violet-600 text-white border-violet-400 font-bold shadow-sm shadow-violet-600/30"
                        : "bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:text-white hover:border-violet-500/50"
                    }`}
                  >
                    <span>{genre}</span>
                    {count > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          active
                            ? "bg-white/20 text-white"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Panel Desplegable de Clasificación por Autor, Año, Género, Formato y Agrupación */}
          {showClassifyPanel && (
            <div className="mt-4 p-4 rounded-2xl bg-zinc-900/95 border border-zinc-800 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-violet-400" />
                  <h3 className="text-xs sm:text-sm font-extrabold text-white">
                    Clasificar y Filtrar Biblioteca (Autor, Año, Género, Tipo)
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={handleResetFilters}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-semibold"
                    >
                      Limpiar filtros ({activeFiltersCount})
                    </button>
                  )}
                  <button
                    onClick={() => setShowClassifyPanel(false)}
                    className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 1. Agrupar Estantería por */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  Agrupar Estantería por:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "none", label: "Sin agrupar (Cuadrícula)" },
                    { id: "genre", label: "🏷️ Por Género" },
                    { id: "author", label: "✍️ Por Autor" },
                    { id: "year", label: "📅 Por Año" },
                    { id: "type", label: "📚 Por Formato (Manga/Libro)" },
                    { id: "status", label: "📖 Por Estado de Lectura" },
                  ].map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGroupBy(g.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        groupBy === g.id
                          ? "bg-violet-600 text-white border-violet-500 shadow"
                          : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Selectores de Autor, Año, Tipo y Modo de Lectura */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                    <UserIcon className="w-3.5 h-3.5 text-violet-400" />
                    <span>Filtrar por Autor</span>
                  </label>
                  <select
                    value={authorFilter}
                    onChange={(e) => setAuthorFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="ALL">Todos los autores</option>
                    {availableAuthors.map((auth) => (
                      <option key={auth} value={auth}>
                        {auth}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Filtrar por Año</span>
                  </label>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="ALL">Todos los años</option>
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        Año {yr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                    <Library className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tipo de Obra</span>
                  </label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="ALL">Todos los tipos</option>
                    <option value="MANGA">Mangas</option>
                    <option value="BOOK">Libros</option>
                    <option value="LIGHT_NOVEL">Novelas Ligeras</option>
                    <option value="COMIC">Cómics / Webtoons</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-sky-400" />
                    <span>Modo de Lectura</span>
                  </label>
                  <select
                    value={readingModeFilter}
                    onChange={(e) => setReadingModeFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="ALL">Cualquier dirección</option>
                    <option value="MANGA_RTL">Manga (Derecha ← Izquierda)</option>
                    <option value="BOOK_LTR">Libro (Izquierda → Derecha)</option>
                    <option value="WEBTOON_VERTICAL">Cascada / Webtoon</option>
                  </select>
                </div>
              </div>

              {/* 3. Píldoras de Género */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-violet-400" />
                  <span>Filtrar por Género / Categoría (Generados automáticamente de tus obras):</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGenreFilter("ALL")}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold border transition ${
                      genreFilter === "ALL"
                        ? "bg-violet-600 text-white border-violet-500"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    Todos los géneros
                  </button>
                  {availableGenres.map((genre) => {
                    const active =
                      genreFilter.toLowerCase() === genre.toLowerCase();
                    const count = genreCounts.get(genre.toLowerCase()) || 0;
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() =>
                          setGenreFilter(active ? "ALL" : genre)
                        }
                        className={`px-3 py-1 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 ${
                          active
                            ? "bg-violet-600/30 border-violet-400 text-violet-200 font-bold"
                            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                        }`}
                      >
                        <span>{genre}</span>
                        {count > 0 && (
                          <span className="text-[10px] opacity-75">
                            ({count})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Page Body */}
        <div className="p-4 sm:p-8 space-y-8 flex-1">
          {/* Public Preview Banner when Admin is previewing Public mode */}
          {isAdminAccount && previewAsPublic && (
            <div className="p-3.5 rounded-2xl bg-violet-600/15 border border-violet-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-violet-200">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-violet-400 shrink-0" />
                <span>
                  <strong>Vista Previa como Público (Lector):</strong> Así es
                  exactamente como ven la aplicación los usuarios normales (pueden
                  explorar, buscar y leer todos los tomos, pero no pueden subir,
                  editar, cambiar portadas ni borrar nada).
                </span>
              </div>
              <button
                onClick={() => setPreviewAsPublic(false)}
                className="px-3 py-1.5 rounded-xl bg-amber-500 text-zinc-950 font-bold shrink-0 flex items-center gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Volver a Modo Admin</span>
              </button>
            </div>
          )}

          {/* Continue Reading Section */}
          {continueReadingItems.length > 0 &&
            searchQuery === "" &&
            typeFilter === "ALL" && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-violet-400" />
                    <span>Continuar Leyendo</span>
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {continueReadingItems.map(({ work, volume }) => {
                    const pct = Math.round(
                      (volume.currentPage / Math.max(1, volume.totalPages)) *
                        100
                    );
                    return (
                      <div
                        key={volume.id}
                        className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800/90 hover:border-violet-500/50 flex items-center gap-3.5 transition group"
                      >
                        <div
                          onClick={() => setReaderState({ work, volume })}
                          className="w-14 h-20 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0 cursor-pointer"
                        >
                          {volume.coverUrl || work.coverUrl ? (
                            <img
                              src={volume.coverUrl || work.coverUrl!}
                              alt={volume.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                              T.{volume.volumeNumber}
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                            {work.title}
                          </span>
                          <h4 className="text-sm font-bold text-white truncate">
                            {volume.title}
                          </h4>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            Página {volume.currentPage} de {volume.totalPages} (
                            {pct}%)
                          </p>
                          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-violet-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => setReaderState({ work, volume })}
                          className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shrink-0 shadow-md shadow-violet-600/20"
                        >
                          Leer
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          {/* Organize Mode Banner (Admin Only) */}
          {effectiveIsAdmin && organizeMode && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Modo Organización Activo (Admin):</strong> Usa las
                  flechas <strong>← / →</strong> en cualquier obra para cambiar
                  su orden en la estantería, o pulsa{" "}
                  <strong>Cambiar Portada</strong> directamente sobre su imagen.
                  Para ordenar los <strong>Tomos</strong>, entra a cualquier obra.
                </span>
              </div>
              <button
                onClick={() => setOrganizeMode(false)}
                className="px-3 py-1 rounded-lg bg-amber-500 text-zinc-950 font-bold shrink-0"
              >
                Terminar edición
              </button>
            </div>
          )}

          {/* Main Works Shelf Grid */}
          <section className="space-y-4">
            {/* Banner de Cartelera cuando se selecciona un Género, Autor o Año */}
            {(genreFilter !== "ALL" ||
              authorFilter !== "ALL" ||
              yearFilter !== "ALL") && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-950/70 via-zinc-900 to-zinc-900 border border-violet-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-600/25 border border-violet-500/40 flex items-center justify-center text-violet-300 shrink-0">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-violet-400">
                      Cartelera Seleccionada
                    </p>
                    <h2 className="text-lg sm:text-xl font-black text-white flex flex-wrap items-center gap-2">
                      {genreFilter !== "ALL" && (
                        <span>Género: {genreFilter}</span>
                      )}
                      {authorFilter !== "ALL" && (
                        <span>Autor: {authorFilter}</span>
                      )}
                      {yearFilter !== "ALL" && <span>Año: {yearFilter}</span>}
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-600/30 text-violet-200 border border-violet-500/40 font-bold">
                        {filteredWorks.length}{" "}
                        {filteredWorks.length === 1 ? "obra" : "obras"}
                      </span>
                    </h2>
                  </div>
                </div>
                <button
                  onClick={handleResetFilters}
                  className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-violet-400" />
                  <span>Ver Todo el Catálogo</span>
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                  <span>
                    {genreFilter !== "ALL"
                      ? `Cartelera de ${genreFilter}`
                      : authorFilter !== "ALL"
                      ? `Obras de ${authorFilter}`
                      : yearFilter !== "ALL"
                      ? `Obras del Año ${yearFilter}`
                      : typeFilter === "ALL"
                      ? "Catálogo Digital"
                      : typeFilter === "MANGA"
                      ? "Mangas"
                      : typeFilter === "BOOK"
                      ? "Libros"
                      : typeFilter === "LIGHT_NOVEL"
                      ? "Novelas Ligeras"
                      : "Cómics"}
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-semibold">
                    {filteredWorks.length}
                  </span>
                </h2>

                {/* Chips activos de filtro */}
                {genreFilter !== "ALL" && (
                  <button
                    onClick={() => setGenreFilter("ALL")}
                    className="px-2.5 py-1 rounded-full bg-violet-600/20 border border-violet-500/40 text-violet-300 text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Género: {genreFilter}</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
                {authorFilter !== "ALL" && (
                  <button
                    onClick={() => setAuthorFilter("ALL")}
                    className="px-2.5 py-1 rounded-full bg-violet-600/20 border border-violet-500/40 text-violet-300 text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Autor: {authorFilter}</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
                {yearFilter !== "ALL" && (
                  <button
                    onClick={() => setYearFilter("ALL")}
                    className="px-2.5 py-1 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Año: {yearFilter}</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {effectiveIsAdmin && (
                <button
                  onClick={() => {
                    const targetType =
                      typeFilter !== "ALL" ? (typeFilter as WorkType) : null;
                    setCreateModalType(targetType);
                    setShowCreateModal(true);
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>{sectionAddBtnLabel}</span>
                </button>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="aspect-[3/4.3] rounded-2xl bg-zinc-900 animate-pulse border border-zinc-800"
                  />
                ))}
              </div>
            ) : filteredWorks.length === 0 ? (
              <div className="p-12 rounded-3xl bg-zinc-900/50 border border-dashed border-zinc-800 text-center space-y-4 max-w-lg mx-auto my-8">
                <div className="w-14 h-14 rounded-2xl bg-violet-600/20 text-violet-400 flex items-center justify-center mx-auto">
                  <BookOpen className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-white">
                  No se encontraron obras en esta sección
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400">
                  {activeFiltersCount > 0
                    ? "No hay obras que coincidan con los filtros seleccionados."
                    : effectiveIsAdmin
                    ? "Sube tus archivos de mangas o libros, ordénalos por tomos y personaliza sus portadas fácilmente."
                    : "Pronto se publicarán nuevos mangas y libros en el catálogo."}
                </p>
                {activeFiltersCount > 0 ? (
                  <button
                    onClick={handleResetFilters}
                    className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    <span>Quitar filtros</span>
                  </button>
                ) : (
                  effectiveIsAdmin && (
                    <button
                      onClick={() => {
                        const targetType =
                          typeFilter !== "ALL" ? (typeFilter as WorkType) : null;
                        setCreateModalType(targetType);
                        setShowCreateModal(true);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        {typeFilter === "BOOK"
                          ? "Subir Primer Libro"
                          : typeFilter === "MANGA"
                          ? "Subir Primer Manga"
                          : typeFilter === "LIGHT_NOVEL"
                          ? "Subir Primera Novela Ligera"
                          : typeFilter === "COMIC"
                          ? "Subir Primer Cómic"
                          : "Subir Primer Manga o Libro"}
                      </span>
                    </button>
                  )
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {groupedSections.map((section) => (
                  <div key={section.key} className="space-y-3">
                    {groupBy !== "none" && (
                      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                        <h3 className="text-sm sm:text-base font-extrabold text-violet-300 flex items-center gap-2">
                          <span>{section.label}</span>
                          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs">
                            {section.items.length}
                          </span>
                        </h3>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                      {section.items.map((work, idx) => {
                        const firstVol = work.volumes[0];
                        const workLang = getWorkNonSpanishLanguage(work);
                        const cardGenres = (work.tags || "")
                          .split(",")
                          .map((t) => t.replace(/\.+$/, "").trim())
                          .filter(Boolean)
                          .slice(0, 3);
                        const unitPlural =
                          work.type === "BOOK"
                            ? "Libros"
                            : work.type === "LIGHT_NOVEL"
                            ? "Volúmenes"
                            : work.type === "COMIC"
                            ? "Números"
                            : "Tomos";
                        const unitSingular =
                          work.type === "BOOK"
                            ? "Libro"
                            : work.type === "LIGHT_NOVEL"
                            ? "Volumen"
                            : work.type === "COMIC"
                            ? "Número"
                            : "Tomo";

                        return (
                          <div
                            key={`${section.key}-${work.id}`}
                            className="group bg-zinc-900/80 border border-zinc-800/90 hover:border-violet-500/60 rounded-2xl overflow-hidden flex flex-col transition shadow-lg hover:shadow-violet-950/20"
                          >
                            {/* Cover Art Container */}
                            <div className="relative aspect-[3/4.2] w-full bg-zinc-950 overflow-hidden">
                              {work.coverUrl ? (
                                <img
                                  src={work.coverUrl}
                                  alt={work.title}
                                  onClick={() => {
                                    setOpenVolumesOnlyOnModal(false);
                                    setOpenAddVolumeOnModal(false);
                                    setActiveWorkId(work.id);
                                  }}
                                  className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition duration-300"
                                />
                              ) : (
                                <div
                                  onClick={() => {
                                    setOpenVolumesOnlyOnModal(false);
                                    setOpenAddVolumeOnModal(false);
                                    setActiveWorkId(work.id);
                                  }}
                                  className="w-full h-full flex flex-col items-center justify-center p-4 text-center cursor-pointer"
                                >
                                  <BookOpen className="w-10 h-10 text-zinc-700 mb-2" />
                                  <span className="text-xs font-bold text-zinc-400">
                                    {work.title}
                                  </span>
                                </div>
                              )}

                              {/* Top Badges */}
                              <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                                <div className="flex items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[10px] font-extrabold text-violet-300 border border-white/10">
                                    {work.type === "MANGA"
                                      ? "MANGA"
                                      : work.type === "BOOK"
                                      ? "LIBRO"
                                      : work.type === "LIGHT_NOVEL"
                                      ? "NOVELA"
                                      : "CÓMIC"}
                                  </span>
                                  {workLang && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-blue-600/90 backdrop-blur-md text-[10px] font-black text-white border border-blue-400/50 shadow flex items-center gap-1">
                                      <span>{workLang === "EN" ? "🇬🇧" : workLang === "JP" ? "🇯🇵" : "🌐"}</span>
                                      <span>{workLang}</span>
                                    </span>
                                  )}
                                  {isWorkSensitive(work) && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-rose-600/90 backdrop-blur-md text-[10px] font-black text-white border border-rose-400/50 shadow flex items-center gap-0.5">
                                      <span>🔞</span>
                                      <span>+18</span>
                                    </span>
                                  )}
                                </div>
                                <span className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[10px] font-bold text-zinc-200 border border-white/10">
                                  {work.volumes.length <= 1
                                    ? work.type === "BOOK"
                                      ? "1 Libro"
                                      : work.type === "LIGHT_NOVEL"
                                      ? "1 Vol."
                                      : work.type === "COMIC"
                                      ? "1 Núm."
                                      : "Tomo Único"
                                    : `${work.volumes.length} ${unitPlural}`}
                                </span>
                              </div>

                              {/* Número de páginas en la parte inferior derecha de la portada (Libros o Mangas únicos) */}
                              {work.volumes.length <= 1 && firstVol && firstVol.totalPages > 0 && (
                                <div className="absolute bottom-2.5 right-2.5 pointer-events-none z-10 group-hover:opacity-0 transition-opacity">
                                  <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-black text-zinc-200 border border-white/15 shadow-md flex items-center gap-1">
                                    <span>{firstVol.totalPages}</span>
                                    <span className="text-[9px] text-zinc-400 font-semibold">págs</span>
                                  </span>
                                </div>
                              )}

                              {/* Organize Mode Overlay Controls (Admin Only) */}
                              {effectiveIsAdmin && organizeMode ? (
                                <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-2">
                                  <label className="w-full py-1.5 px-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold text-center cursor-pointer flex items-center justify-center gap-1 shadow">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    <span>Cambiar Portada</span>
                                    <input
                                      type="file"
                                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif,image/bmp,image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f)
                                          handleQuickCardCoverChange(
                                            work.id,
                                            f
                                          );
                                      }}
                                      className="hidden"
                                    />
                                  </label>
                                  <div className="flex items-center justify-between gap-1">
                                    <button
                                      onClick={() =>
                                        handleMoveWork(idx, "left")
                                      }
                                      disabled={idx === 0}
                                      className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white text-xs flex items-center justify-center"
                                      title="Mover antes"
                                    >
                                      <ArrowLeft className="w-3.5 h-3.5" />
                                    </button>
                                    {work.volumes.length > 1 && (
                                      <button
                                        onClick={() => {
                                          setOpenVolumesOnlyOnModal(true);
                                          setOpenAddVolumeOnModal(false);
                                          setActiveWorkId(work.id);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-[11px] font-semibold"
                                      >
                                        {unitPlural}
                                      </button>
                                    )}
                                    <button
                                      onClick={() =>
                                        handleMoveWork(idx, "right")
                                      }
                                      disabled={
                                        idx === filteredWorks.length - 1
                                      }
                                      className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white text-xs flex items-center justify-center"
                                      title="Mover después"
                                    >
                                      <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* Hover Quick Actions */
                                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition flex items-center gap-1.5">
                                  {firstVol && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setReaderState({
                                          work,
                                          volume: firstVol,
                                        });
                                      }}
                                      className="flex-1 py-1.5 px-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center justify-center gap-1 shadow"
                                    >
                                      <BookOpen className="w-3.5 h-3.5" />
                                      <span>Leer</span>
                                    </button>
                                  )}
                                  {work.volumes.length > 1 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenVolumesOnlyOnModal(true);
                                        setOpenAddVolumeOnModal(false);
                                        setActiveWorkId(work.id);
                                      }}
                                      className="py-1.5 px-2.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold border border-zinc-700"
                                    >
                                      {unitPlural}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Card Footer */}
                            <div className="p-3 flex-1 flex flex-col justify-between">
                              <div
                                onClick={() => {
                                  setOpenVolumesOnlyOnModal(false);
                                  setOpenAddVolumeOnModal(false);
                                  setActiveWorkId(work.id);
                                }}
                                className="cursor-pointer"
                              >
                                <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-violet-300 transition">
                                  {work.title}
                                </h3>
                                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                  {work.author || "Autor Desconocido"}
                                  {work.releaseYear
                                    ? ` · ${work.releaseYear}`
                                    : ""}
                                </p>
                                {cardGenres.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {cardGenres.map((g) => (
                                      <button
                                        key={g}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenGenreCartelera(g);
                                        }}
                                        className="px-1.5 py-0.5 rounded bg-violet-950/60 hover:bg-violet-600 text-violet-300 hover:text-white text-[9px] font-medium border border-violet-800/60 transition"
                                        title={`Ir a la cartelera de ${g}`}
                                      >
                                        {g}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {effectiveIsAdmin && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenVolumesOnlyOnModal(false);
                                    setOpenAddVolumeOnModal(true);
                                    setActiveWorkId(work.id);
                                  }}
                                  className="mt-2.5 w-full py-1.5 px-2.5 rounded-xl bg-violet-600/20 hover:bg-violet-600 border border-violet-500/40 text-violet-200 hover:text-white text-[11px] font-bold flex items-center justify-center gap-1 transition"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>
                                    {work.type === "BOOK"
                                      ? "Añadir Libro de Saga"
                                      : `Añadir ${unitSingular}`}
                                  </span>
                                </button>
                              )}

                              <div
                                onClick={() => {
                                  setOpenVolumesOnlyOnModal(false);
                                  setOpenAddVolumeOnModal(false);
                                  setActiveWorkId(work.id);
                                }}
                                className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400 cursor-pointer"
                              >
                                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                                  <Star className="w-3 h-3 fill-amber-400" />
                                  {work.rating.toFixed(1)}
                                </span>

                                {/* Indicador de Estado: Solo visible si está Leyendo, Terminado o En Pausa (Vacío si está Pendiente / sin abrir) */}
                                {work.status === "READING" ? (
                                  <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                                    <span>📖</span>
                                    <span>Leyendo</span>
                                  </span>
                                ) : work.status === "COMPLETED" ? (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                                    <span>✅</span>
                                    <span>Terminado</span>
                                  </span>
                                ) : work.status === "ON_HOLD" ? (
                                  <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] font-bold flex items-center gap-1">
                                    <span>⏸️</span>
                                    <span>En pausa</span>
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 px-3 py-2 flex items-center justify-around">
        {[
          { id: "ALL", label: "Todo", icon: Library },
          { id: "MANGA", label: "Mangas", icon: BookOpen },
          { id: "BOOK", label: "Libros", icon: BookMarked },
        ].map((nav) => {
          const Icon = nav.icon;
          const active = typeFilter === nav.id && !favoriteOnly;
          return (
            <button
              key={nav.id}
              onClick={() => {
                setTypeFilter(nav.id);
                setFavoriteOnly(false);
              }}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl text-[11px] font-semibold ${
                active ? "text-violet-400" : "text-zinc-400"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{nav.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => setFavoriteOnly((f) => !f)}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl text-[11px] font-semibold ${
            favoriteOnly ? "text-rose-400" : "text-zinc-400"
          }`}
        >
          <Heart className="w-5 h-5" />
          <span>Favoritos</span>
        </button>

        {effectiveIsAdmin && (
          <button
            onClick={() => {
              setCreateModalType(null);
              setShowCreateModal(true);
            }}
            className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl text-[11px] font-bold text-violet-300"
          >
            <Plus className="w-5 h-5" />
            <span>Subir</span>
          </button>
        )}
      </nav>

      {/* Google Login Modal */}
      {showGoogleLoginModal && (
        <GoogleLoginModal
          onClose={() => setShowGoogleLoginModal(false)}
          onSuccess={(loggedUser) => {
            setUser(loggedUser);
            setIsAdminAccount(loggedUser.role === "ADMIN");
            fetchLibraryData();
          }}
        />
      )}

      {/* Create Work Modal (Admin Only) */}
      {effectiveIsAdmin && showCreateModal && (
        <CreateWorkModal
          existingGenres={availableGenres}
          initialType={createModalType}
          lockType={Boolean(createModalType)}
          onClose={() => {
            setShowCreateModal(false);
            setCreateModalType(null);
          }}
          onWorkCreated={(newWork) => {
            setWorks((prev) => [newWork, ...prev]);
            setOpenAddVolumeOnModal(false);
            setOpenVolumesOnlyOnModal(false);
            setActiveWorkId(newWork.id);
          }}
        />
      )}

      {/* Work Details & Volume Organizer Modal */}
      {activeWork && (
        <WorkDetailModal
          work={activeWork}
          collections={collections}
          user={user}
          isAdmin={effectiveIsAdmin}
          initialShowAddVolume={openAddVolumeOnModal}
          initialVolumesOnly={openVolumesOnlyOnModal}
          existingGenres={availableGenres}
          onClose={() => {
            setActiveWorkId(null);
            setOpenAddVolumeOnModal(false);
            setOpenVolumesOnlyOnModal(false);
          }}
          onWorkUpdated={(updated) => {
            setWorks((prev) =>
              prev.map((w) => (w.id === updated.id ? updated : w))
            );
          }}
          onWorkDeleted={(deletedId) => {
            setWorks((prev) => prev.filter((w) => w.id !== deletedId));
            setActiveWorkId(null);
          }}
          onOpenReader={(w, vol) => {
            setReaderState({ work: w, volume: vol });
          }}
          onToggleWorkCollection={handleToggleWorkCollection}
          onRequestLogin={() => setShowGoogleLoginModal(true)}
          onSelectGenre={handleOpenGenreCartelera}
          onSelectAuthor={handleOpenAuthorCartelera}
          onSelectYear={handleOpenYearCartelera}
        />
      )}

      {/* Fullscreen PDF Manga & Book Reader Modal */}
      {readerState && (
        <PdfReaderModal
          work={readerState.work}
          initialVolume={readerState.volume}
          isAdmin={effectiveIsAdmin}
          onClose={() => setReaderState(null)}
          onSelectVolume={(nextVol) =>
            setReaderState((prev) =>
              prev ? { ...prev, volume: nextVol } : null
            )
          }
          onProgressUpdated={(volumeId, currentPage, totalPages, isCompleted) => {
            setWorks((prev) =>
              prev.map((w) => {
                const hasMatchingVol = w.volumes.some((v) => v.id === volumeId);
                if (!hasMatchingVol) return w;
                const nextStatus =
                  w.status === "PLAN_TO_READ"
                    ? isCompleted
                      ? "COMPLETED"
                      : "READING"
                    : w.status;
                return {
                  ...w,
                  status: nextStatus,
                  volumes: w.volumes.map((v) =>
                    v.id === volumeId
                      ? {
                          ...v,
                          currentPage,
                          totalPages,
                          isCompleted,
                          lastReadAt: new Date().toISOString(),
                        }
                      : v
                  ),
                };
              })
            );
          }}
          onCoverUpdated={(workId, volumeId, newCoverUrl, target) => {
            setWorks((prev) =>
              prev.map((w) => {
                if (w.id !== workId) return w;
                return {
                  ...w,
                  coverUrl:
                    target === "work" || target === "both"
                      ? newCoverUrl
                      : w.coverUrl,
                  volumes: w.volumes.map((v) =>
                    v.id === volumeId &&
                    (target === "volume" || target === "both")
                      ? { ...v, coverUrl: newCoverUrl }
                      : v
                  ),
                };
              })
            );
          }}
        />
      )}

      {/* Database & Server Architecture Modal */}
      {showDbGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-violet-400" />
                <h3 className="text-base font-bold text-white">
                  Arquitectura de Base de Datos & Despliegue en Servidor
                </h3>
              </div>
              <button
                onClick={() => setShowDbGuideModal(false)}
                className="px-3 py-1 rounded-lg bg-zinc-800 text-xs text-zinc-300"
              >
                Cerrar
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-zinc-300">
              <div className="p-4 rounded-2xl bg-violet-950/30 border border-violet-500/30 space-y-1.5">
                <p className="font-bold text-violet-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  1. Lista para Android Studio y Web (Con Inicio de Sesión Gmail)
                </p>
                <p className="text-xs text-zinc-300">
                  Incluye tabla <code>User</code> vinculada a Google OAuth 2.0 API (
                  <code>/api/auth/google</code>). Cada usuario que inicia sesión
                  con su cuenta de Gmail sincroniza sus propios mangas, libros y
                  progreso de lectura.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white">
                  2. Estructura Relacional de la Base de Datos (Prisma ORM + SQL)
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-400">
                  <li>
                    <strong className="text-zinc-200">User (Gmail):</strong>{" "}
                    Guarda <code>email</code>, <code>name</code>,{" "}
                    <code>picture</code> y <code>googleId</code> verificados por
                    la API de Google.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Work (Obra):</strong>{" "}
                    Almacena título, autor, tipo (Manga/Libro/Novela), modo de
                    lectura (<code>MANGA_RTL</code>, <code>BOOK_LTR</code>,{" "}
                    <code>WEBTOON_VERTICAL</code>), portada general y orden en
                    estantería (<code>sortOrder</code>).
                  </li>
                  <li>
                    <strong className="text-zinc-200">Volume (Tomo):</strong>{" "}
                    Relación <code>1:N</code> con <code>Work</code>. Guarda el
                    número de tomo, orden personalizado (<code>sortOrder</code>),
                    portada exclusiva del tomo, ruta al archivo PDF, total de
                    páginas y progreso de lectura automático (
                    <code>currentPage</code>, <code>lastReadAt</code>).
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Advertencia de Contenido Sensible (+18) */}
      {showSensitiveWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-zinc-950 border border-rose-500/40 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl shadow-rose-950/50 space-y-5 text-center relative overflow-hidden">
            {/* Resplandor decorativo */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-rose-600/20 rounded-full blur-3xl pointer-events-none" />

            <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle className="w-8 h-8 text-rose-500 animate-pulse" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-black uppercase tracking-wider">
                <span>🔞 Clasificación +18</span>
              </div>
              <h3 className="text-xl font-black text-white">
                Aviso de Contenido Sensible
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Esta sección contiene mangas y lecturas clasificadas exclusivamente para{" "}
                <strong>mayores de 18 años</strong> o con temáticas de{" "}
                <strong>contenido adulto, violencia o gore</strong>.
              </p>
              <p className="text-[11px] text-zinc-400">
                Puedes volver a ocultar este contenido en cualquier momento
                presionando el botón <strong>"🔞 +18"</strong>.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSensitiveWarningModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-xs transition"
              >
                Cancelar (Mantener oculto)
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSensitive(true);
                  try {
                    localStorage.setItem("komy_show_sensitive", "true");
                  } catch {}
                  setShowSensitiveWarningModal(false);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-900/40 transition"
              >
                Sí, mostrar contenido (+18)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Estadísticas & Métricas de Lectura (Admin) */}
      {showAdminStatsModal && (
        <AdminStatsModal
          onClose={() => setShowAdminStatsModal(false)}
          onOpenWork={(workId) => {
            setActiveWorkId(workId);
          }}
        />
      )}
    </div>
  );
}
