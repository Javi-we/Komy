"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Bookmark,
  BookOpen,
  List,
  Maximize2,
  Minimize2,
  Columns,
  ArrowLeftRight,
  ScrollText,
  Plus,
  Trash2,
  Download,
  RotateCcw,
  WifiOff,
  Check,
  ImagePlus,
  Play,
  Pause,
  SlidersHorizontal,
  Sun,
  Moon,
  Gauge,
} from "lucide-react";
import {
  DetectedFileFormat,
  detectFileFormat,
  extractCoverFromPdfFile,
  getPdfJs,
  loadCbzArchivePages,
  loadEpubBookPages,
  loadTextBookPages,
} from "@/lib/pdf-client";
import { fetchAndCacheVolumeBlob } from "@/lib/offline-storage";
import { uploadBase64CoverDirectToCloud } from "@/lib/supabase-upload-client";
import {
  BookmarkItem,
  ChapterItem,
  ReadingMode,
  VolumeItem,
  WorkItem,
} from "@/types/library";

interface PdfReaderModalProps {
  work: WorkItem;
  initialVolume: VolumeItem;
  isAdmin?: boolean;
  onClose: () => void;
  onProgressUpdated: (
    volumeId: string,
    currentPage: number,
    totalPages: number,
    isCompleted: boolean
  ) => void;
  onSelectVolume: (vol: VolumeItem) => void;
  onCoverUpdated?: (
    workId: string,
    volumeId: string,
    newCoverUrl: string,
    target: "volume" | "work" | "both"
  ) => void;
}

// Sub-componente optimizado para renderizar una página PDF en Modo Cascada (Vertical)
function VerticalPdfPage({
  pdfDoc,
  pageNumber,
  scale,
  imageWidth,
  onPageVisible,
}: {
  pdfDoc: any;
  pageNumber: number;
  scale: number;
  imageWidth?: number;
  onPageVisible: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onPageVisibleRef = useRef(onPageVisible);
  onPageVisibleRef.current = onPageVisible;

  const [isInRange, setIsInRange] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [estimatedHeight, setEstimatedHeight] = useState<number | null>(null);
  const hasRenderedRef = useRef(false);
  const lastWidthRef = useRef<number>(0);

  const baseWidth = imageWidth || 900;
  const targetWidth = Math.round(baseWidth * (scale ? Math.max(0.6, scale / 1.1) : 1));

  // 1. Observer para pre-cargar páginas antes de que toquen la pantalla (1200px arriba/abajo)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const renderObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInRange(true);
          }
        });
      },
      {
        rootMargin: "1200px 0px 1200px 0px",
        threshold: 0,
      }
    );

    // 2. Observer para detectar qué página está leyendo activamente el usuario
    const visibleObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            onPageVisibleRef.current(pageNumber);
          }
        });
      },
      {
        threshold: [0.25, 0.5, 0.75],
      }
    );

    renderObserver.observe(el);
    visibleObserver.observe(el);

    return () => {
      renderObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [pageNumber]);

  // 3. Renderizar la página en Canvas con Alta Definición y doble buffer
  useEffect(() => {
    if (!isInRange || !pdfDoc) return;
    if (hasRenderedRef.current && Math.abs(lastWidthRef.current - targetWidth) < 60) return;

    let cancelled = false;
    let renderTask: any = null;

    async function renderPage() {
      setIsRendering(true);
      setRenderError(false);

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled || !canvasRef.current || !containerRef.current) return;

        const unscaledViewport = page.getViewport({ scale: 1 });
        const dpr =
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, 2.5)
            : 2;

        // Altura proporcional exacta sin saltos
        const trueDisplayedHeight = Math.round(
          (unscaledViewport.height / unscaledViewport.width) * targetWidth
        );
        setEstimatedHeight(trueDisplayedHeight);

        // Escala en Alta Definición para máxima nitidez
        const desiredScale = (targetWidth / unscaledViewport.width) * dpr;
        const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
        const safeScale = Math.min(desiredScale, 3800 / maxDim, 4.0);
        const viewport = page.getViewport({ scale: safeScale });

        // Buffer fuera de pantalla para que jamás se corte una página a mitad de dibujo
        const offscreen = document.createElement("canvas");
        offscreen.width = viewport.width;
        offscreen.height = viewport.height;
        const offCtx = offscreen.getContext("2d", { alpha: false });
        if (!offCtx) return;

        renderTask = page.render({
          canvasContext: offCtx,
          viewport,
        });

        await renderTask.promise;

        if (!cancelled && canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d", { alpha: false });
          ctx?.drawImage(offscreen, 0, 0);

          hasRenderedRef.current = true;
          lastWidthRef.current = targetWidth;
          setIsRendered(true);
          setIsRendering(false);
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          console.error(`Error renderizando pág ${pageNumber}:`, err);
          setRenderError(true);
          setIsRendering(false);
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask?.cancel) {
        try {
          renderTask.cancel();
        } catch {}
      }
      setIsRendering(false);
    };
  }, [isInRange, pdfDoc, pageNumber, targetWidth]);

  return (
    <div
      ref={containerRef}
      id={`reader-vertical-page-${pageNumber}`}
      style={{
        minHeight: estimatedHeight ? `${estimatedHeight}px` : "400px",
        maxWidth: `${targetWidth}px`,
        width: "100%",
      }}
      className="relative flex flex-col items-center justify-center my-0 w-full"
    >
      <canvas
        ref={canvasRef}
        style={{
          display: isRendered ? "block" : "none",
        }}
        className="w-full h-auto shadow-2xl bg-zinc-900 block"
      />

      {/* Placeholder de carga mientras renderiza */}
      {!isRendered && (
        <div
          style={{
            minHeight: estimatedHeight ? `${estimatedHeight}px` : "400px",
          }}
          className="w-full rounded-sm bg-zinc-900/60 border border-zinc-800/80 flex flex-col items-center justify-center p-6 text-center animate-pulse"
        >
          <BookOpen className="w-8 h-8 text-zinc-600 mb-2" />
          <span className="text-xs font-semibold text-zinc-400">
            {isRendering
              ? `Cargando Pág. ${pageNumber}...`
              : `Pág. ${pageNumber}`}
          </span>
          {renderError && (
            <button
              type="button"
              onClick={() => {
                hasRenderedRef.current = false;
                setIsInRange(true);
              }}
              className="mt-3 px-3 py-1 rounded-lg bg-violet-600 text-white text-xs font-bold"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      <span className="mt-1 mb-2 text-[11px] px-2.5 py-0.5 rounded-full bg-black/60 text-zinc-400">
        Pág. {pageNumber}
      </span>
    </div>
  );
}

// Sub-componente optimizado para imágenes CBZ/ZIP en Modo Cascada
function VerticalImagePage({
  imgUrl,
  pageNumber,
  scale,
  imageWidth,
  onPageVisible,
}: {
  imgUrl: string;
  pageNumber: number;
  scale: number;
  imageWidth?: number;
  onPageVisible: (page: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onPageVisibleRef = useRef(onPageVisible);
  onPageVisibleRef.current = onPageVisible;

  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const visibleObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            onPageVisibleRef.current(pageNumber);
          }
        });
      },
      { threshold: [0.25, 0.5, 0.75] }
    );

    visibleObserver.observe(el);
    return () => visibleObserver.disconnect();
  }, [pageNumber]);

  return (
    <div
      ref={containerRef}
      id={`reader-vertical-page-${pageNumber}`}
      style={{ maxWidth: imageWidth ? `${imageWidth}px` : `${Math.round(scale * 850)}px` }}
      className="flex flex-col items-center my-0.5 w-full min-h-[350px]"
    >
      {hasError ? (
        <div className="w-full min-h-[350px] rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-xs text-rose-400 mb-2">
            Error cargando Pág. {pageNumber}
          </p>
          <button
            type="button"
            onClick={() => {
              setHasError(false);
              setRetryKey((k) => k + 1);
            }}
            className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
          >
            Reintentar carga
          </button>
        </div>
      ) : (
        <img
          key={retryKey}
          src={imgUrl}
          alt={`Página ${pageNumber}`}
          loading="lazy"
          decoding="async"
          className="w-full h-auto shadow-2xl rounded-sm bg-zinc-900"
          onError={() => setHasError(true)}
        />
      )}
      <span className="mt-1 mb-2 text-[11px] px-2.5 py-0.5 rounded-full bg-black/60 text-zinc-400">
        Pág. {pageNumber}
      </span>
    </div>
  );
}

export default function PdfReaderModal({
  work,
  initialVolume,
  isAdmin = false,
  onClose,
  onProgressUpdated,
  onSelectVolume,
  onCoverUpdated,
}: PdfReaderModalProps) {
  const [volume, setVolume] = useState<VolumeItem>(initialVolume);
  const [readingMode, setReadingMode] = useState<ReadingMode>(
    work.readingMode || (work.type === "MANGA" ? "MANGA_RTL" : "BOOK_LTR")
  );
  const [doublePage, setDoublePage] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1.1);
  const [bgTheme, setBgTheme] = useState<"dark" | "sepia" | "light">("dark");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showSidebar, setShowSidebar] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<"chapters" | "bookmarks">(
    "chapters"
  );

  // Estado para elegir la página actual como portada (Admin)
  const [showCoverMenu, setShowCoverMenu] = useState<boolean>(false);
  const [settingCover, setSettingCover] = useState<boolean>(false);
  const [coverSuccessMsg, setCoverSuccessMsg] = useState<string>("");

  // Estado Multi-Formato
  const [fileFormat, setFileFormat] = useState<DetectedFileFormat>("PDF");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [imagePages, setImagePages] = useState<string[]>([]);
  const [epubSections, setEpubSections] = useState<
    { title: string; html: string }[]
  >([]);
  const [textPages, setTextPages] = useState<string[]>([]);

  const [numPages, setNumPages] = useState<number>(volume.totalPages || 1);
  const [currentPage, setCurrentPage] = useState<number>(
    Math.max(1, volume.currentPage || 1)
  );
  const [loadingFile, setLoadingFile] = useState<boolean>(true);
  const [loadingProgressMsg, setLoadingProgressMsg] = useState<string>("");
  const [isCachedOffline, setIsCachedOffline] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(
    volume.bookmarks || []
  );
  const [chapters, setChapters] = useState<ChapterItem[]>(
    volume.chapters || []
  );
  const [newChapterTitle, setNewChapterTitle] = useState("");

  const primaryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const secondaryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const readerContainerRef = useRef<HTMLDivElement | null>(null);

  // Estados para Ajustes de lectura (Auto-scroll, Brillo, Ancho de imagen)
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(45); // px por segundo
  const [brightness, setBrightness] = useState<number>(100); // 30% a 120%
  const [imageWidth, setImageWidth] = useState<number>(900); // 400px a 1600px
  const [showReadingSettings, setShowReadingSettings] = useState<boolean>(false);

  const verticalScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollAnimRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  // Cargar preferencias guardadas en localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedWidth = localStorage.getItem("komy_reader_image_width");
      if (savedWidth)
        setImageWidth(Math.max(400, Math.min(1600, Number(savedWidth))));

      const savedBrightness = localStorage.getItem("komy_reader_brightness");
      if (savedBrightness)
        setBrightness(Math.max(30, Math.min(120, Number(savedBrightness))));

      const savedSpeed = localStorage.getItem("komy_reader_scroll_speed");
      if (savedSpeed)
        setScrollSpeed(Math.max(10, Math.min(200, Number(savedSpeed))));
    } catch {}
  }, []);

  const handleImageWidthChange = (val: number) => {
    setImageWidth(val);
    try {
      localStorage.setItem("komy_reader_image_width", String(val));
    } catch {}
  };

  const handleBrightnessChange = (val: number) => {
    setBrightness(val);
    try {
      localStorage.setItem("komy_reader_brightness", String(val));
    } catch {}
  };

  const handleScrollSpeedChange = (val: number) => {
    setScrollSpeed(val);
    try {
      localStorage.setItem("komy_reader_scroll_speed", String(val));
    } catch {}
  };

  // Bucle de auto-scroll suave para modo Cascada (requestAnimationFrame)
  useEffect(() => {
    if (!isAutoScrolling || readingMode !== "WEBTOON_VERTICAL") {
      if (autoScrollAnimRef.current) {
        cancelAnimationFrame(autoScrollAnimRef.current);
        autoScrollAnimRef.current = null;
      }
      lastTimestampRef.current = null;
      return;
    }

    const container = verticalScrollContainerRef.current;
    if (!container) return;

    let animId: number;
    const scrollStep = (timestamp: number) => {
      if (!lastTimestampRef.current) {
        lastTimestampRef.current = timestamp;
      }
      const delta = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;

      if (container) {
        container.scrollTop += scrollSpeed * delta;
        // Si llega al final del contenido, pausar auto-scroll
        if (
          container.scrollTop + container.clientHeight >=
          container.scrollHeight - 6
        ) {
          setIsAutoScrolling(false);
          return;
        }
      }

      animId = requestAnimationFrame(scrollStep);
      autoScrollAnimRef.current = animId;
    };

    animId = requestAnimationFrame(scrollStep);
    autoScrollAnimRef.current = animId;

    return () => {
      cancelAnimationFrame(animId);
      autoScrollAnimRef.current = null;
      lastTimestampRef.current = null;
    };
  }, [isAutoScrolling, scrollSpeed, readingMode]);

  useEffect(() => {
    setVolume(initialVolume);
    setCurrentPage(Math.max(1, initialVolume.currentPage || 1));
    setBookmarks(initialVolume.bookmarks || []);
    setChapters(initialVolume.chapters || []);
  }, [initialVolume]);

  // Cargar cualquier formato (PDF, CBZ/ZIP, EPUB, TXT/MD, IMAGEN) desde memoria Offline (IndexedDB) o Nube (con soporte multi-partes >50MB)
  useEffect(() => {
    let active = true;
    let createdObjectUrl: string | null = null;
    setLoadingFile(true);
    setLoadingProgressMsg("Verificando memoria offline...");
    setFileError(null);
    setPdfDoc(null);
    setImagePages([]);
    setEpubSections([]);
    setTextPages([]);

    async function loadUniversalDocument() {
      if (!volume.fileUrl) {
        setFileError("Este tomo aún no tiene un archivo subido.");
        setLoadingFile(false);
        return;
      }

      const detected = detectFileFormat(volume.fileName || volume.fileUrl);
      setFileFormat(detected);

      try {
        // 1. Obtener archivo desde IndexedDB (instantáneo sin internet) o descargarlo/unir partes y guardarlo offline automáticamente
        const blob = await fetchAndCacheVolumeBlob(
          volume.id,
          volume.fileUrl,
          true,
          (msg) => {
            if (active) setLoadingProgressMsg(msg);
          }
        );
        if (!active) return;
        setIsCachedOffline(true);

        createdObjectUrl = URL.createObjectURL(blob);
        let totalDetected = 1;

        if (detected === "PDF") {
          const pdfjs = await getPdfJs();
          if (!pdfjs) return;
          const arrayBuf = await blob.arrayBuffer();
          const loadingTask = pdfjs.getDocument({ data: arrayBuf });
          const doc = await loadingTask.promise;
          if (!active) return;
          setPdfDoc(doc);
          totalDetected = doc.numPages;
        } else if (detected === "CBZ") {
          const urls = await loadCbzArchivePages(createdObjectUrl);
          if (!active) return;
          if (urls.length === 0) {
            throw new Error(
              "El archivo CBZ/ZIP no contiene imágenes compatibles."
            );
          }
          setImagePages(urls);
          totalDetected = urls.length;
        } else if (detected === "IMAGE") {
          setImagePages([createdObjectUrl]);
          totalDetected = 1;
        } else if (detected === "EPUB") {
          const sections = await loadEpubBookPages(createdObjectUrl);
          if (!active) return;
          setEpubSections(sections);
          totalDetected = sections.length;
        } else if (detected === "TEXT") {
          const pages = await loadTextBookPages(createdObjectUrl);
          if (!active) return;
          setTextPages(pages);
          totalDetected = pages.length;
        }

        setNumPages(totalDetected);
        setLoadingFile(false);

        if (totalDetected !== volume.totalPages) {
          fetch(`/api/volumes/${volume.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ totalPages: totalDetected }),
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error("Error loading file in reader:", err);
        if (active) {
          setFileError(
            err?.message ||
              "No se pudo abrir el archivo. Verifica tu conexión a internet si aún no estaba descargado offline."
          );
          setLoadingFile(false);
        }
      }
    }

    loadUniversalDocument();
    return () => {
      active = false;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [volume.id, volume.fileUrl, volume.fileName, volume.totalPages]);

  // Renderizar páginas en Canvas cuando el archivo es PDF en modo paginado (Libro o Manga) con Alta Definición y doble buffer
  useEffect(() => {
    if (fileFormat !== "PDF" || !pdfDoc || readingMode === "WEBTOON_VERTICAL")
      return;
    let renderTask1: any = null;
    let renderTask2: any = null;
    let cancelled = false;

    async function renderPages() {
      try {
        const availableHeight =
          typeof window !== "undefined"
            ? Math.max(400, window.innerHeight - 136)
            : 800;
        const targetDisplayHeight = Math.round(availableHeight * (scale || 1.1));
        const dpr =
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, 2.5)
            : 2;

        // --- PÁGINA 1 ---
        const page1 = await pdfDoc.getPage(currentPage);
        if (cancelled || !primaryCanvasRef.current) return;

        const unscaled1 = page1.getViewport({ scale: 1 });
        const fitScale1 = targetDisplayHeight / unscaled1.height;
        const maxDim1 = Math.max(unscaled1.width, unscaled1.height);
        const safeScale1 = Math.min(fitScale1 * dpr, 3800 / maxDim1, 4.0);
        const viewport1 = page1.getViewport({ scale: Math.max(safeScale1, 1.2) });

        const offscreen1 = document.createElement("canvas");
        offscreen1.width = viewport1.width;
        offscreen1.height = viewport1.height;
        const offCtx1 = offscreen1.getContext("2d", { alpha: false });

        if (offCtx1) {
          renderTask1 = page1.render({
            canvasContext: offCtx1,
            viewport: viewport1,
          });
          await renderTask1.promise;

          if (!cancelled && primaryCanvasRef.current) {
            const canvas1 = primaryCanvasRef.current;
            canvas1.width = viewport1.width;
            canvas1.height = viewport1.height;
            canvas1.style.height = `${targetDisplayHeight}px`;
            canvas1.style.maxHeight = scale <= 1.15 ? "calc(100vh - 8.5rem)" : "none";
            canvas1.style.maxWidth = doublePage ? "48vw" : "95vw";
            canvas1.style.width = "auto";

            const ctx1 = canvas1.getContext("2d", { alpha: false });
            ctx1?.drawImage(offscreen1, 0, 0);
          }
        }

        // --- PÁGINA 2 (si está activada la doble página) ---
        if (
          doublePage &&
          currentPage + 1 <= numPages &&
          secondaryCanvasRef.current
        ) {
          const page2 = await pdfDoc.getPage(currentPage + 1);
          if (cancelled || !secondaryCanvasRef.current) return;

          const unscaled2 = page2.getViewport({ scale: 1 });
          const fitScale2 = targetDisplayHeight / unscaled2.height;
          const maxDim2 = Math.max(unscaled2.width, unscaled2.height);
          const safeScale2 = Math.min(fitScale2 * dpr, 3800 / maxDim2, 4.0);
          const viewport2 = page2.getViewport({ scale: Math.max(safeScale2, 1.2) });

          const offscreen2 = document.createElement("canvas");
          offscreen2.width = viewport2.width;
          offscreen2.height = viewport2.height;
          const offCtx2 = offscreen2.getContext("2d", { alpha: false });

          if (offCtx2) {
            renderTask2 = page2.render({
              canvasContext: offCtx2,
              viewport: viewport2,
            });
            await renderTask2.promise;

            if (!cancelled && secondaryCanvasRef.current) {
              const canvas2 = secondaryCanvasRef.current;
              canvas2.width = viewport2.width;
              canvas2.height = viewport2.height;
              canvas2.style.height = `${targetDisplayHeight}px`;
              canvas2.style.maxHeight = scale <= 1.15 ? "calc(100vh - 8.5rem)" : "none";
              canvas2.style.maxWidth = "48vw";
              canvas2.style.width = "auto";

              const ctx2 = canvas2.getContext("2d", { alpha: false });
              ctx2?.drawImage(offscreen2, 0, 0);
            }
          }
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          console.error("Error renderizando página de PDF:", err);
        }
      }
    }

    renderPages();

    return () => {
      cancelled = true;
      if (renderTask1?.cancel) {
        try {
          renderTask1.cancel();
        } catch {}
      }
      if (renderTask2?.cancel) {
        try {
          renderTask2.cancel();
        } catch {}
      }
    };
  }, [fileFormat, pdfDoc, currentPage, scale, doublePage, readingMode, numPages]);

  const saveProgress = useCallback(
    (page: number) => {
      const completed = page >= numPages;
      onProgressUpdated(
        volume.id,
        page,
        numPages,
        completed || volume.isCompleted
      );
      fetch(`/api/volumes/${volume.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPage: page,
          totalPages: numPages,
          isCompleted: completed ? true : volume.isCompleted,
        }),
      }).catch(() => {});
    },
    [volume.id, volume.isCompleted, numPages, onProgressUpdated]
  );

  const handlePageVisible = useCallback(
    (visiblePage: number) => {
      setCurrentPage(visiblePage);
      saveProgress(visiblePage);
    },
    [saveProgress]
  );

  const goToPage = useCallback(
    (targetPage: number) => {
      const clamped = Math.min(Math.max(1, targetPage), numPages);
      setCurrentPage(clamped);
      saveProgress(clamped);

      if (readingMode === "WEBTOON_VERTICAL") {
        const el = document.getElementById(`reader-vertical-page-${clamped}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    },
    [numPages, readingMode, saveProgress]
  );

  const isVisualFormat =
    fileFormat === "PDF" || fileFormat === "CBZ" || fileFormat === "IMAGE";
  const step = doublePage && isVisualFormat ? 2 : 1;

  const goNext = useCallback(() => {
    if (currentPage < numPages) {
      goToPage(Math.min(numPages, currentPage + step));
    }
  }, [currentPage, numPages, step, goToPage]);

  const goPrev = useCallback(() => {
    if (currentPage > 1) {
      goToPage(Math.max(1, currentPage - step));
    }
  }, [currentPage, step, goToPage]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        if (readingMode === "MANGA_RTL") {
          goPrev();
        } else {
          goNext();
        }
      } else if (e.key === "ArrowLeft") {
        if (readingMode === "MANGA_RTL") {
          goNext();
        } else {
          goPrev();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readingMode, goNext, goPrev, onClose]);

  const toggleFullscreen = () => {
    if (!readerContainerRef.current) return;
    if (!document.fullscreenElement) {
      readerContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const isCurrentPageBookmarked = bookmarks.some(
    (b) => b.pageNumber === currentPage
  );

  const handleToggleBookmark = async () => {
    try {
      const res = await fetch(`/api/volumes/${volume.id}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageNumber: currentPage,
          label: `Página ${currentPage} - ${volume.title}`,
        }),
      });
      const data = await res.json();
      if (data.removed) {
        setBookmarks((prev) => prev.filter((b) => b.id !== data.id));
      } else if (data.id) {
        setBookmarks((prev) =>
          [...prev, data].sort((a, b) => a.pageNumber - b.pageNumber)
        );
      }
    } catch (e) {
      console.error("Error bookmarking:", e);
    }
  };

  const handleAddChapterHere = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapterTitle.trim()) return;
    try {
      const res = await fetch(`/api/volumes/${volume.id}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newChapterTitle.trim(),
          startPage: currentPage,
          chapterNumber: chapters.length + 1,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setChapters((prev) => [...prev, created]);
        setNewChapterTitle("");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    try {
      await fetch(
        `/api/volumes/${volume.id}/chapters?chapterId=${chapterId}`,
        {
          method: "DELETE",
        }
      );
      setChapters((prev) => prev.filter((c) => c.id !== chapterId));
    } catch (e) {
      console.error(e);
    }
  };

  // Usar la página actual que se está viendo en el lector como Portada del Tomo o del Manga Principal
  const handleSetCurrentPageAsCover = async (
    target: "volume" | "work" | "both"
  ) => {
    setSettingCover(true);
    setCoverSuccessMsg("");
    try {
      let coverDataUrl: string | null = null;

      if (fileFormat === "PDF" && pdfDoc) {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          coverDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        }
      } else if (volume.fileUrl) {
        const blob = await fetchAndCacheVolumeBlob(
          volume.id,
          volume.fileUrl,
          true
        );
        const res = await extractCoverFromPdfFile(
          blob,
          currentPage,
          volume.fileName || volume.fileUrl
        );
        coverDataUrl = res?.dataUrl || null;
      }

      if (!coverDataUrl) {
        alert("No se pudo capturar la imagen de esta página.");
        return;
      }

      let finalCoverUrl = coverDataUrl;
      try {
        const uploadedUrl = await uploadBase64CoverDirectToCloud(
          coverDataUrl,
          `page_${currentPage}`
        );
        if (uploadedUrl) {
          finalCoverUrl = uploadedUrl;
        }
      } catch {
        // Fallback a DataURL si falla nube
      }

      if (target === "volume" || target === "both") {
        await fetch(`/api/volumes/${volume.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coverUrl: finalCoverUrl }),
        });
      }

      if (target === "work" || target === "both") {
        await fetch(`/api/works/${work.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coverUrl: finalCoverUrl }),
        });
      }

      if (onCoverUpdated) {
        onCoverUpdated(work.id, volume.id, finalCoverUrl, target);
      }

      setCoverSuccessMsg(
        target === "both"
          ? `¡Pág. ${currentPage} aplicada al Manga y Tomo ${volume.volumeNumber}!`
          : target === "work"
          ? `¡Pág. ${currentPage} aplicada al Manga Principal!`
          : `¡Pág. ${currentPage} aplicada al Tomo ${volume.volumeNumber}!`
      );
      setTimeout(() => {
        setCoverSuccessMsg("");
        setShowCoverMenu(false);
      }, 2200);
    } catch (e) {
      console.error("Error setting cover from reader:", e);
    } finally {
      setSettingCover(false);
    }
  };

  const currentVolIndex = work.volumes.findIndex((v) => v.id === volume.id);
  const nextVolume =
    currentVolIndex >= 0 && currentVolIndex + 1 < work.volumes.length
      ? work.volumes[currentVolIndex + 1]
      : null;

  const bgClasses =
    bgTheme === "dark"
      ? "bg-zinc-950 text-zinc-100"
      : bgTheme === "sepia"
      ? "bg-[#1e1a14] text-amber-50"
      : "bg-zinc-200 text-zinc-900";

  const textCardClasses =
    bgTheme === "dark"
      ? "bg-zinc-900/90 text-zinc-100 border-zinc-800"
      : bgTheme === "sepia"
      ? "bg-[#2b241b] text-amber-100 border-amber-900/40"
      : "bg-white text-zinc-900 border-zinc-300";

  return (
    <div
      ref={readerContainerRef}
      className={`fixed inset-0 z-50 flex flex-col select-none ${bgClasses}`}
    >
      {/* Top Toolbar */}
      <header className="h-14 px-3 sm:px-5 bg-zinc-900/95 border-b border-zinc-800 text-zinc-100 flex items-center justify-between gap-2 shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition flex items-center gap-1.5 text-xs font-medium"
            title="Volver a la obra (Esc)"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-violet-600/30 border border-violet-500/40 text-[10px] font-extrabold text-violet-300">
                {fileFormat}
              </span>
              {isCachedOffline && (
                <span
                  className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 flex items-center gap-1"
                  title="Este tomo ya está guardado en la memoria de tu dispositivo y funciona sin internet"
                >
                  <Check className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">Sin Internet</span>
                </span>
              )}
              <h2 className="text-xs sm:text-sm font-bold truncate text-white">
                {work.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <select
                value={volume.id}
                onChange={(e) => {
                  const found = work.volumes.find(
                    (v) => v.id === e.target.value
                  );
                  if (found) onSelectVolume(found);
                }}
                className="bg-zinc-800 text-violet-300 text-xs rounded px-2 py-0.5 border border-zinc-700 focus:outline-none focus:border-violet-500 max-w-[180px] sm:max-w-[260px] truncate"
              >
                {work.volumes.map((v) => (
                  <option key={v.id} value={v.id}>
                    Tomo {v.volumeNumber}: {v.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Reading Mode Switcher */}
        <div className="hidden md:flex items-center bg-zinc-800/90 p-1 rounded-xl border border-zinc-700/80 gap-1">
          <button
            onClick={() => setReadingMode("MANGA_RTL")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              readingMode === "MANGA_RTL"
                ? "bg-violet-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
            title="Lectura estilo Manga Japonés (Derecha a Izquierda)"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Manga (D ← I)
          </button>
          <button
            onClick={() => setReadingMode("BOOK_LTR")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              readingMode === "BOOK_LTR"
                ? "bg-violet-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
            title="Lectura estilo Libro Occidental (Izquierda a Derecha)"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Libro (I → D)
          </button>
          <button
            onClick={() => setReadingMode("WEBTOON_VERTICAL")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              readingMode === "WEBTOON_VERTICAL"
                ? "bg-violet-600 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
            title="Lectura continua en Cascada / Webtoon"
          >
            <ScrollText className="w-3.5 h-3.5" />
            Cascada
          </button>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => {
              const next: ReadingMode =
                readingMode === "MANGA_RTL"
                  ? "BOOK_LTR"
                  : readingMode === "BOOK_LTR"
                  ? "WEBTOON_VERTICAL"
                  : "MANGA_RTL";
              setReadingMode(next);
            }}
            className="md:hidden px-2.5 py-1.5 rounded-lg bg-zinc-800 text-violet-300 text-xs font-semibold border border-zinc-700"
          >
            {readingMode === "MANGA_RTL"
              ? "Manga ←"
              : readingMode === "BOOK_LTR"
              ? "Libro →"
              : "Cascada ↓"}
          </button>

          {readingMode !== "WEBTOON_VERTICAL" && isVisualFormat && (
            <button
              onClick={() => setDoublePage((d) => !d)}
              className={`hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                doublePage
                  ? "bg-violet-600/20 border-violet-500 text-violet-300"
                  : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
              }`}
              title="Vista de Doble Página"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>2 Págs</span>
            </button>
          )}

          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center bg-zinc-800 rounded-lg border border-zinc-700">
            <button
              onClick={() =>
                setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))
              }
              className="p-1.5 hover:bg-zinc-700 text-zinc-300 rounded-l-lg"
              title="Reducir Zoom / Tamaño"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setScale(1.1)}
              className="px-2 text-xs font-mono text-zinc-300 hover:text-white"
              title="Restablecer Zoom"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={() =>
                setScale((s) => Math.min(2.6, +(s + 0.15).toFixed(2)))
              }
              className="p-1.5 hover:bg-zinc-700 text-zinc-300 rounded-r-lg"
              title="Aumentar Zoom / Tamaño"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Botón Admin: Usar esta página actual como Portada */}
          {isAdmin && isVisualFormat && (
            <div className="relative">
              <button
                onClick={() => setShowCoverMenu((m) => !m)}
                className={`px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 text-xs font-bold ${
                  showCoverMenu
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-violet-600/20 border-violet-500/40 text-violet-300 hover:bg-violet-600/30"
                }`}
                title={`Usar la Página ${currentPage} actual como portada`}
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  Usar Pág. {currentPage} de Portada
                </span>
              </button>

              {showCoverMenu && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-zinc-900 border border-violet-500/50 shadow-2xl p-3 z-50 space-y-2">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                    <span className="text-xs font-bold text-violet-300">
                      Portada desde Página {currentPage}
                    </span>
                    <button
                      onClick={() => setShowCoverMenu(false)}
                      className="text-zinc-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  {coverSuccessMsg ? (
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center">
                      {coverSuccessMsg}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        disabled={settingCover}
                        onClick={() => handleSetCurrentPageAsCover("volume")}
                        className="w-full py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold text-left flex items-center justify-between transition"
                      >
                        <span>Portada de Tomo {volume.volumeNumber}</span>
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={settingCover}
                        onClick={() => handleSetCurrentPageAsCover("work")}
                        className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-xs font-semibold text-left flex items-center justify-between transition"
                      >
                        <span>Portada del Manga Principal</span>
                        <Check className="w-3.5 h-3.5 text-violet-400" />
                      </button>
                      <button
                        disabled={settingCover}
                        onClick={() => handleSetCurrentPageAsCover("both")}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/30 disabled:opacity-50 text-emerald-300 text-xs font-bold text-left flex items-center justify-between transition"
                      >
                        <span>Usar en Ambos (Manga y Tomo)</span>
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      {settingCover && (
                        <p className="text-[11px] text-center text-violet-300 animate-pulse pt-1">
                          Guardando portada en la nube...
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleToggleBookmark}
            className={`p-2 rounded-lg border transition ${
              isCurrentPageBookmarked
                ? "bg-amber-500/20 border-amber-500 text-amber-400"
                : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
            }`}
            title="Guardar marcador en esta página"
          >
            <Bookmark
              className="w-4 h-4"
              fill={isCurrentPageBookmarked ? "currentColor" : "none"}
            />
          </button>

          <button
            onClick={() => setShowSidebar((s) => !s)}
            className={`p-2 rounded-lg border transition flex items-center gap-1 text-xs ${
              showSidebar
                ? "bg-violet-600 border-violet-500 text-white"
                : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
            }`}
            title="Índice de Capítulos y Marcadores"
          >
            <List className="w-4 h-4" />
            <span className="hidden xl:inline">Índice</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hidden sm:flex"
            title="Pantalla completa"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="relative flex-1 flex overflow-hidden">
        <div className="flex-1 h-full overflow-auto flex items-center justify-center relative">
          {loadingFile ? (
            <div className="flex flex-col items-center gap-3 text-zinc-400 text-center px-4">
              <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-white">
                Abriendo {volume.title} ({fileFormat})...
              </p>
              {loadingProgressMsg && (
                <p className="text-xs text-violet-300">{loadingProgressMsg}</p>
              )}
            </div>
          ) : fileError ? (
            <div className="max-w-md p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-center space-y-4">
              <p className="text-red-400 font-medium">{fileError}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold"
              >
                Volver y subir archivo al Tomo
              </button>
            </div>
          ) : readingMode === "WEBTOON_VERTICAL" ? (
            /* MODO CASCADA / SCROLL VERTICAL CONTINUO (Para todos los formatos) */
            <div
              ref={verticalScrollContainerRef}
              style={{ filter: `brightness(${brightness}%)` }}
              className="w-full h-full overflow-y-auto px-2 py-4 flex flex-col items-center transition-[filter] duration-150"
            >
              {fileFormat === "PDF" &&
                Array.from({ length: numPages }, (_, idx) => idx + 1).map(
                  (pageNum) => (
                    <VerticalPdfPage
                      key={pageNum}
                      pdfDoc={pdfDoc}
                      pageNumber={pageNum}
                      scale={scale}
                      imageWidth={imageWidth}
                      onPageVisible={handlePageVisible}
                    />
                  )
                )}

              {(fileFormat === "CBZ" || fileFormat === "IMAGE") &&
                imagePages.map((imgUrl, idx) => (
                  <VerticalImagePage
                    key={idx}
                    imgUrl={imgUrl}
                    pageNumber={idx + 1}
                    scale={scale}
                    imageWidth={imageWidth}
                    onPageVisible={handlePageVisible}
                  />
                ))}

              {fileFormat === "EPUB" &&
                epubSections.map((sec, idx) => (
                  <article
                    key={idx}
                    id={`reader-vertical-page-${idx + 1}`}
                    style={{ fontSize: `${Math.round(scale * 16)}px` }}
                    className={`max-w-3xl w-full p-6 sm:p-10 my-3 rounded-2xl border shadow-xl leading-relaxed select-text ${textCardClasses}`}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider text-violet-400 mb-4">
                      Sección {idx + 1} de {numPages} — {sec.title}
                    </div>
                    <div
                      className="prose prose-invert max-w-none space-y-4 [&_img]:max-h-[70vh] [&_img]:mx-auto [&_img]:rounded-lg"
                      dangerouslySetInnerHTML={{ __html: sec.html }}
                    />
                  </article>
                ))}

              {fileFormat === "TEXT" &&
                textPages.map((txt, idx) => (
                  <article
                    key={idx}
                    id={`reader-vertical-page-${idx + 1}`}
                    style={{ fontSize: `${Math.round(scale * 16)}px` }}
                    className={`max-w-3xl w-full p-6 sm:p-10 my-3 rounded-2xl border shadow-xl leading-relaxed whitespace-pre-wrap select-text ${textCardClasses}`}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider text-violet-400 mb-3">
                      Página {idx + 1} de {numPages}
                    </div>
                    {txt}
                  </article>
                ))}

              {nextVolume && (
                <div className="my-8 p-6 rounded-2xl bg-zinc-900 border border-violet-500/40 text-center max-w-md w-full">
                  <p className="text-xs text-violet-400 uppercase font-bold tracking-wider mb-1">
                    Has llegado al final de {volume.title}
                  </p>
                  <h4 className="text-base font-bold text-white mb-4">
                    Siguiente: {nextVolume.title}
                  </h4>
                  <button
                    onClick={() => onSelectVolume(nextVolume)}
                    className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition"
                  >
                    Abrir Siguiente Tomo →
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* MODO PAGINADO: MANGA (RTL) O LIBRO (LTR) */
            <div
              style={{ filter: `brightness(${brightness}%)` }}
              className="relative w-full h-full flex items-center justify-center overflow-auto p-2 sm:p-4 transition-[filter] duration-150"
            >
              {/* Clickable Left & Right Navigation Zones */}
              <div
                onClick={() =>
                  readingMode === "MANGA_RTL" ? goNext() : goPrev()
                }
                className="fixed left-0 top-14 bottom-16 w-1/6 z-10 cursor-pointer group flex items-center justify-start pl-3"
                title={
                  readingMode === "MANGA_RTL"
                    ? "Siguiente Página (Modo Manga)"
                    : "Página Anterior"
                }
              >
                <div className="p-2.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition backdrop-blur-sm border border-white/10">
                  <ChevronLeft className="w-6 h-6" />
                </div>
              </div>

              <div
                onClick={() =>
                  readingMode === "MANGA_RTL" ? goPrev() : goNext()
                }
                className="fixed right-0 top-14 bottom-16 w-1/6 z-10 cursor-pointer group flex items-center justify-end pr-3"
                title={
                  readingMode === "MANGA_RTL"
                    ? "Página Anterior (Modo Manga)"
                    : "Siguiente Página"
                }
              >
                <div className="p-2.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition backdrop-blur-sm border border-white/10">
                  <ChevronRight className="w-6 h-6" />
                </div>
              </div>

              {/* Renderizado según el Formato */}
              {fileFormat === "PDF" && (
                <div
                  className={`flex items-center justify-center gap-2 my-auto ${
                    doublePage && readingMode === "MANGA_RTL"
                      ? "flex-row-reverse"
                      : "flex-row"
                  }`}
                >
                  <canvas
                    ref={primaryCanvasRef}
                    className="max-h-[calc(100vh-8.5rem)] w-auto max-w-full object-contain shadow-2xl rounded-sm bg-zinc-900"
                  />
                  {doublePage && currentPage + 1 <= numPages && (
                    <canvas
                      ref={secondaryCanvasRef}
                      className="max-h-[calc(100vh-8.5rem)] w-auto max-w-full object-contain shadow-2xl rounded-sm bg-zinc-900 hidden lg:block"
                    />
                  )}
                </div>
              )}

              {(fileFormat === "CBZ" || fileFormat === "IMAGE") && (
                <div
                  className={`flex items-center justify-center gap-2 my-auto ${
                    doublePage && readingMode === "MANGA_RTL"
                      ? "flex-row-reverse"
                      : "flex-row"
                  }`}
                >
                  {imagePages[currentPage - 1] && (
                    <img
                      src={imagePages[currentPage - 1]}
                      alt={`Página ${currentPage}`}
                      style={{
                        maxHeight: `${Math.round(scale * 82)}vh`,
                      }}
                      className="w-auto max-w-full object-contain shadow-2xl rounded-sm bg-zinc-900"
                    />
                  )}
                  {doublePage && imagePages[currentPage] && (
                    <img
                      src={imagePages[currentPage]}
                      alt={`Página ${currentPage + 1}`}
                      style={{
                        maxHeight: `${Math.round(scale * 82)}vh`,
                      }}
                      className="w-auto max-w-full object-contain shadow-2xl rounded-sm bg-zinc-900 hidden lg:block"
                    />
                  )}
                </div>
              )}

              {fileFormat === "EPUB" && epubSections[currentPage - 1] && (
                <div className="w-full h-full overflow-y-auto flex justify-center py-4 px-3">
                  <article
                    style={{ fontSize: `${Math.round(scale * 16)}px` }}
                    className={`max-w-3xl w-full p-6 sm:p-10 rounded-2xl border shadow-2xl h-fit leading-relaxed select-text ${textCardClasses}`}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider text-violet-400 mb-4">
                      {epubSections[currentPage - 1].title}
                    </div>
                    <div
                      className="prose prose-invert max-w-none space-y-4 [&_img]:max-h-[70vh] [&_img]:mx-auto [&_img]:rounded-lg"
                      dangerouslySetInnerHTML={{
                        __html: epubSections[currentPage - 1].html,
                      }}
                    />
                  </article>
                </div>
              )}

              {fileFormat === "TEXT" && textPages[currentPage - 1] && (
                <div className="w-full h-full overflow-y-auto flex justify-center py-4 px-3">
                  <article
                    style={{ fontSize: `${Math.round(scale * 16)}px` }}
                    className={`max-w-3xl w-full p-6 sm:p-10 rounded-2xl border shadow-2xl h-fit leading-relaxed whitespace-pre-wrap select-text ${textCardClasses}`}
                  >
                    {textPages[currentPage - 1]}
                  </article>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Side Drawer: Chapters, Bookmarks & Reader Settings */}
        {showSidebar && (
          <aside className="w-80 bg-zinc-900 border-l border-zinc-800 text-zinc-100 flex flex-col z-30 shrink-0">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex gap-1 bg-zinc-800 p-1 rounded-lg w-full">
                <button
                  onClick={() => setSidebarTab("chapters")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition ${
                    sidebarTab === "chapters"
                      ? "bg-violet-600 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Capítulos ({chapters.length})
                </button>
                <button
                  onClick={() => setSidebarTab("bookmarks")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition ${
                    sidebarTab === "bookmarks"
                      ? "bg-violet-600 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Marcadores ({bookmarks.length})
                </button>
              </div>
            </div>

            <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Fondo del lector:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setBgTheme("dark")}
                  className={`px-2 py-1 rounded border ${
                    bgTheme === "dark"
                      ? "border-violet-500 bg-zinc-950 text-white"
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  Oscuro
                </button>
                <button
                  onClick={() => setBgTheme("sepia")}
                  className={`px-2 py-1 rounded border ${
                    bgTheme === "sepia"
                      ? "border-amber-500 bg-[#262016] text-amber-200"
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  Sepia
                </button>
                <button
                  onClick={() => setBgTheme("light")}
                  className={`px-2 py-1 rounded border ${
                    bgTheme === "light"
                      ? "border-violet-500 bg-zinc-200 text-zinc-900 font-semibold"
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  Claro
                </button>
              </div>
            </div>

            {sidebarTab === "chapters" ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                  {chapters.length === 0 ? (
                    <p className="text-xs text-zinc-500 text-center py-6">
                      {isAdmin
                        ? "No hay capítulos marcados en este tomo todavía. Puedes añadir uno en la página actual abajo."
                        : "Este tomo no tiene índice de capítulos registrado."}
                    </p>
                  ) : (
                    chapters.map((ch) => {
                      const isActive = currentPage >= ch.startPage;
                      return (
                        <div
                          key={ch.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition ${
                            isActive
                              ? "bg-violet-600/15 border-violet-500/40 text-violet-200"
                              : "bg-zinc-800/60 border-zinc-800 hover:bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          <button
                            onClick={() => goToPage(ch.startPage)}
                            className="flex-1 text-left min-w-0"
                          >
                            <p className="text-xs font-semibold truncate">
                              {ch.title}
                            </p>
                            <p className="text-[11px] text-zinc-400">
                              Inicia en pág. {ch.startPage}
                            </p>
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteChapter(ch.id)}
                              className="p-1.5 text-zinc-500 hover:text-red-400"
                              title="Eliminar marcador de capítulo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {isAdmin && (
                  <form
                    onSubmit={handleAddChapterHere}
                    className="p-3 border-t border-zinc-800 bg-zinc-950/60 space-y-2"
                  >
                    <label className="block text-[11px] text-zinc-400">
                      Marcar inicio de capítulo en pág. actual ({currentPage}):
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newChapterTitle}
                        onChange={(e) => setNewChapterTitle(e.target.value)}
                        placeholder="Ej. Cap. 4: El Duelo"
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Añadir
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {bookmarks.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-6">
                    No tienes páginas guardadas en marcadores. Pulsa el icono de marcador arriba para guardar tu página favorita.
                  </p>
                ) : (
                  bookmarks.map((bm) => (
                    <button
                      key={bm.id}
                      onClick={() => goToPage(bm.pageNumber)}
                      className="w-full p-2.5 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/70 flex items-center justify-between text-left transition"
                    >
                      <div>
                        <p className="text-xs font-semibold text-amber-300">
                          Página {bm.pageNumber}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {bm.label || volume.title}
                        </p>
                      </div>
                      <Bookmark className="w-4 h-4 text-amber-400 fill-amber-400" />
                    </button>
                  ))
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Bottom Progress Bar & Page Slider */}
      <footer className="h-14 px-3 sm:px-6 bg-zinc-900/95 border-t border-zinc-800 text-zinc-200 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => (readingMode === "MANGA_RTL" ? goNext() : goPrev())}
            disabled={
              readingMode === "MANGA_RTL"
                ? currentPage >= numPages
                : currentPage <= 1
            }
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-medium flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">
              {readingMode === "MANGA_RTL" ? "Sig. (←)" : "Ant."}
            </span>
          </button>

          <button
            onClick={() => goToPage(1)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
            title="Volver a la página 1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 max-w-xl flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-400 whitespace-nowrap">
            Pág. <strong className="text-white">{currentPage}</strong> /{" "}
            {numPages}
          </span>
          <input
            type="range"
            min={1}
            max={Math.max(1, numPages)}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            dir={readingMode === "MANGA_RTL" ? "rtl" : "ltr"}
            className="w-full accent-violet-500 cursor-pointer h-1.5 bg-zinc-700 rounded-lg"
          />
          <span className="hidden sm:inline text-xs font-semibold text-violet-400 w-10 text-right">
            {Math.round((currentPage / Math.max(1, numPages)) * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Botón rápido Play / Pausa en footer si está en Cascada */}
          {readingMode === "WEBTOON_VERTICAL" && (
            <button
              onClick={() => setIsAutoScrolling((p) => !p)}
              className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition ${
                isAutoScrolling
                  ? "bg-emerald-600 border-emerald-500 text-white animate-pulse"
                  : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
              }`}
              title={
                isAutoScrolling
                  ? "Pausar bajada automática"
                  : "Iniciar bajada automática (Play)"
              }
            >
              {isAutoScrolling ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
          )}

          {/* Botón Ajustes de lectura */}
          <button
            onClick={() => setShowReadingSettings((s) => !s)}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
              showReadingSettings
                ? "bg-violet-600 border-violet-500 text-white"
                : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
            }`}
            title="Ajustes de lectura (Brillo, Velocidad, Ancho)"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden md:inline">Ajustes</span>
          </button>

          {currentPage >= numPages && nextVolume ? (
            <button
              onClick={() => onSelectVolume(nextVolume)}
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-1 shadow-lg shadow-violet-600/30"
            >
              <span>Sig. Tomo</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() =>
                readingMode === "MANGA_RTL" ? goPrev() : goNext()
              }
              disabled={
                readingMode === "MANGA_RTL"
                  ? currentPage <= 1
                  : currentPage >= numPages
              }
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-medium flex items-center gap-1"
            >
              <span className="hidden sm:inline">
                {readingMode === "MANGA_RTL" ? "Ant. (→)" : "Sig."}
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {isAdmin && volume.fileUrl && (
            <a
              href={volume.fileUrl}
              download={volume.fileName || `${volume.title}`}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hidden md:flex"
              title="Descargar archivo original (Solo Admin)"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      </footer>

      {/* Widget Flotante Lateral de Control (Estilo LectorTMO) */}
      {readingMode === "WEBTOON_VERTICAL" && (
        <div className="fixed right-3 sm:right-6 bottom-20 z-40 flex flex-col items-center bg-zinc-950/90 backdrop-blur-md rounded-2xl p-1.5 shadow-2xl border border-zinc-800 gap-1.5 animate-in fade-in slide-in-from-right duration-200">
          <button
            onClick={() => setShowReadingSettings((s) => !s)}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition ${
              showReadingSettings
                ? "bg-violet-600 text-white"
                : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
            }`}
            title="Ajustes de lectura (Brillo, velocidad, ancho)"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsAutoScrolling((prev) => !prev)}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition shadow-lg ${
              isAutoScrolling
                ? "bg-emerald-600 text-white shadow-emerald-600/40 animate-pulse"
                : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200"
            }`}
            title={
              isAutoScrolling
                ? "Pausar bajada automática"
                : "Iniciar bajada automática (Play)"
            }
          >
            {isAutoScrolling ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>
        </div>
      )}

      {/* Modal / Card emergente: Ajustes de Lectura (Estilo LectorTMO) */}
      {showReadingSettings && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="absolute inset-0"
            onClick={() => setShowReadingSettings(false)}
          />

          <div className="relative w-full max-w-sm sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-left space-y-5 z-10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-violet-400" />
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Ajustes de lectura
                </h3>
              </div>
              <button
                onClick={() => setShowReadingSettings(false)}
                className="p-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 1. Ancho de imagen */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium">
                    Ancho de imagen
                  </span>
                  <span className="font-mono font-bold text-violet-400">
                    {imageWidth}px
                  </span>
                </div>
                <input
                  type="range"
                  min={450}
                  max={1500}
                  step={25}
                  value={imageWidth}
                  onChange={(e) => handleImageWidthChange(Number(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 px-0.5">
                  <span>Estrecho (450px)</span>
                  <span>Móvil (900px)</span>
                  <span>Completo (1500px)</span>
                </div>
              </div>

              {/* 2. Brillo */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Brillo</span>
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    {brightness}%
                  </span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={120}
                  step={5}
                  value={brightness}
                  onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 px-0.5">
                  <button
                    type="button"
                    onClick={() => handleBrightnessChange(50)}
                    className="hover:text-amber-300 transition"
                  >
                    🌙 Modo Noche (50%)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBrightnessChange(100)}
                    className="hover:text-amber-300 transition"
                  >
                    ☀️ Normal (100%)
                  </button>
                </div>
              </div>

              {/* 3. Velocidad de bajada (Auto-scroll) */}
              {readingMode === "WEBTOON_VERTICAL" ? (
                <div className="space-y-2 pt-1 border-t border-zinc-800/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Velocidad de bajada</span>
                    </span>
                    <span className="font-mono font-bold text-emerald-400">
                      {scrollSpeed} px/s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={150}
                    step={5}
                    value={scrollSpeed}
                    onChange={(e) =>
                      handleScrollSpeedChange(Number(e.target.value))
                    }
                    className="w-full accent-emerald-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 px-0.5">
                    <button
                      type="button"
                      onClick={() => handleScrollSpeedChange(25)}
                      className="hover:text-emerald-300 transition"
                    >
                      🐢 Lento (25)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScrollSpeedChange(50)}
                      className="hover:text-emerald-300 transition"
                    >
                      Normal (50)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScrollSpeedChange(90)}
                      className="hover:text-emerald-300 transition"
                    >
                      🐇 Rápido (90)
                    </button>
                  </div>

                  {/* Botón Principal de Play / Pausa Auto-scroll */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAutoScrolling((p) => !p)}
                      className={`w-full py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg ${
                        isAutoScrolling
                          ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40 animate-pulse"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
                      }`}
                    >
                      {isAutoScrolling ? (
                        <>
                          <Pause className="w-4 h-4 fill-current" />
                          <span>Pausar bajada automática</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                          <span>Iniciar bajada automática (Play)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-violet-600/10 border border-violet-500/20 text-xs text-violet-300 text-center">
                  <p>
                    Cambia a <strong>Modo Cascada</strong> para activar la
                    bajada automática continua.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
