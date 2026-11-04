"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Upload,
  BookOpen,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Trash2,
  Edit3,
  Check,
  Plus,
  Star,
  Heart,
  FileText,
  Sparkles,
  CheckCircle2,
  Clock,
  FolderPlus,
  Cloud,
  Download,
  WifiOff,
  LayoutGrid,
  List,
  AlertTriangle,
  Bookmark,
} from "lucide-react";
import {
  CollectionData,
  ReadingMode,
  UserProfile,
  VolumeItem,
  WorkItem,
  WorkStatus,
  WorkType,
} from "@/types/library";
import { extractCoverFromPdfFile } from "@/lib/pdf-client";
import { buildKomyDriveStreamUrl } from "@/lib/drive";
import {
  uploadFileDirectToCloud,
  uploadBase64CoverDirectToCloud,
} from "@/lib/supabase-upload-client";
import { isWorkSensitive } from "@/lib/sensitive";
import { getWorkNonSpanishLanguage } from "@/lib/language";
import {
  fetchAndCacheVolumeBlob,
  getAllOfflineVolumeIds,
  removeVolumeOffline,
} from "@/lib/offline-storage";
import WorkCommunitySection from "@/components/WorkCommunitySection";

interface WorkDetailModalProps {
  work: WorkItem;
  collections: CollectionData[];
  user?: UserProfile | null;
  isAdmin: boolean;
  initialShowAddVolume?: boolean;
  initialVolumesOnly?: boolean;
  onClose: () => void;
  onWorkUpdated: (updated: WorkItem) => void;
  onWorkDeleted: (workId: string) => void;
  onOpenReader: (work: WorkItem, volume: VolumeItem) => void;
  onToggleWorkCollection: (collectionId: string, workId: string) => void;
  onRequestLogin?: () => void;
  onSelectGenre?: (genre: string) => void;
  onSelectAuthor?: (author: string) => void;
  onSelectYear?: (year: string) => void;
  existingGenres?: string[];
}

const PRESET_GENRES = [
  "+18",
  "Adulto",
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
  "Gore",
  "Thriller",
  "Slice of Life",
];

export default function WorkDetailModal({
  work,
  collections,
  user = null,
  isAdmin,
  initialShowAddVolume = false,
  onClose,
  onWorkUpdated,
  onWorkDeleted,
  onOpenReader,
  onToggleWorkCollection,
  onRequestLogin,
  onSelectGenre,
  onSelectAuthor,
  onSelectYear,
  existingGenres = [],
  initialVolumesOnly = false,
}: WorkDetailModalProps) {
  const isBook = work.type === "BOOK";
  const isNovel = work.type === "LIGHT_NOVEL";
  const isComic = work.type === "COMIC";

  const unitSingular = isBook
    ? "Libro"
    : isNovel
    ? "Volumen"
    : isComic
    ? "Número"
    : "Tomo";

  const unitPlural = isBook
    ? "Libros de la Saga"
    : isNovel
    ? "Volúmenes"
    : isComic
    ? "Números"
    : "Tomos";

  const hasMultipleVolumes = Boolean(work.volumes && work.volumes.length > 1);
  const [activeTab, setActiveTab] = useState<"details" | "volumes">(
    initialVolumesOnly && hasMultipleVolumes ? "volumes" : "details"
  );
  const [volumeViewMode, setVolumeViewMode] = useState<"grid" | "list">("grid");

  const [editingMeta, setEditingMeta] = useState(false);
  const [title, setTitle] = useState(work.title);
  const [subtitle, setSubtitle] = useState(work.subtitle || "");
  const [author, setAuthor] = useState(work.author || "");
  const [releaseYear, setReleaseYear] = useState<string>(
    work.releaseYear ? String(work.releaseYear) : ""
  );
  const [description, setDescription] = useState(work.description || "");
  const [type, setType] = useState<WorkType>(work.type);
  const [status, setStatus] = useState<WorkStatus>(work.status);
  const [readingMode, setReadingMode] = useState<ReadingMode>(work.readingMode);
  const [tags, setTags] = useState(work.tags || "");
  const [rating, setRating] = useState(work.rating || 0);
  const [language, setLanguage] = useState<string>(() => {
    if (work.language) return work.language.toUpperCase();
    const t = (work.tags || "").toLowerCase();
    if (t.includes("inglés") || t.includes("ingles") || t.includes("english"))
      return "EN";
    if (t.includes("japonés") || t.includes("japones") || t.includes("japanese"))
      return "JP";
    return "ES";
  });

  useEffect(() => {
    if (work.language) {
      setLanguage(work.language.toUpperCase());
    } else {
      const t = (work.tags || "").toLowerCase();
      if (
        t.includes("inglés") ||
        t.includes("ingles") ||
        t.includes("english")
      ) {
        setLanguage("EN");
      } else if (
        t.includes("japonés") ||
        t.includes("japones") ||
        t.includes("japanese")
      ) {
        setLanguage("JP");
      } else {
        setLanguage("ES");
      }
    }
  }, [work.id, work.language, work.tags]);

  const allGenreOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const g of existingGenres) {
      const clean = g.replace(/\.+$/, "").trim();
      if (clean) map.set(clean.toLowerCase(), clean);
    }
    for (const g of PRESET_GENRES) {
      if (!map.has(g.toLowerCase())) map.set(g.toLowerCase(), g);
    }
    for (const typed of tags.split(",")) {
      const clean = typed.replace(/\.+$/, "").trim();
      if (clean && !map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), clean);
      }
    }
    return Array.from(map.values());
  }, [existingGenres, tags]);

  const togglePresetGenre = (genre: string) => {
    const current = tags
      .split(",")
      .map((t) => t.replace(/\.+$/, "").trim())
      .filter(Boolean);
    const exists = current.some((g) => g.toLowerCase() === genre.toLowerCase());
    const next = exists
      ? current.filter((g) => g.toLowerCase() !== genre.toLowerCase())
      : [...current, genre];
    setTags(next.join(", "));
  };

  // New Volume Upload state
  const [showAddVolume, setShowAddVolume] = useState(initialShowAddVolume);
  const [volNumber, setVolNumber] = useState<number>(
    work.volumes.length > 0
      ? Math.max(...work.volumes.map((v) => v.volumeNumber)) + 1
      : 1
  );
  const [volTitle, setVolTitle] = useState<string>(
    `${unitSingular} ${
      work.volumes.length > 0
        ? Math.max(...work.volumes.map((v) => v.volumeNumber)) + 1
        : 1
    }`
  );
  const [volSynopsis, setVolSynopsis] = useState("");
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [driveLinkInput, setDriveLinkInput] = useState<string>("");
  const [driveFormatExt, setDriveFormatExt] = useState<string>(".pdf");
  const [driveBlobForNewVol, setDriveBlobForNewVol] = useState<Blob | null>(null);
  const [driveExtractingNewVol, setDriveExtractingNewVol] = useState<boolean>(false);
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [autoExtractedCoverDataUrl, setAutoExtractedCoverDataUrl] = useState<
    string | null
  >(null);
  const [newVolCoverPage, setNewVolCoverPage] = useState<number>(1);
  const [detectedPages, setDetectedPages] = useState<number>(1);
  const [uploadingVolume, setUploadingVolume] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string>("");
  const [isDraggingNewVol, setIsDraggingNewVol] = useState(false);

  // Seleccionar página de un Tomo ya subido como portada (del Tomo o del Manga principal)
  const [pickingCoverVolId, setPickingCoverVolId] = useState<string | null>(
    null
  );
  const [pickerPageNumber, setPickerPageNumber] = useState<number>(1);
  const [pickerTotalPages, setPickerTotalPages] = useState<number>(1);
  const [pickerPreviewDataUrl, setPickerPreviewDataUrl] = useState<
    string | null
  >(null);
  const [pickerLoading, setPickerLoading] = useState<boolean>(false);
  const [pickerSavingTarget, setPickerSavingTarget] = useState<
    "volume" | "work" | "both" | null
  >(null);

  // Linking existing volume to Google Drive
  const [linkingDriveVolId, setLinkingDriveVolId] = useState<string | null>(
    null
  );
  const [existingVolDriveUrl, setExistingVolDriveUrl] = useState<string>("");
  const [existingVolDriveExt, setExistingVolDriveExt] =
    useState<string>(".pdf");

  const handleUpdateReadingStatus = async (newStatus: WorkStatus) => {
    setStatus(newStatus);
    onWorkUpdated({ ...work, status: newStatus });
    try {
      await fetch(`/api/works/${work.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.error("Error al actualizar estado de lectura:", err);
    }
  };

  // Batch upload state
  const [batchUploading, setBatchUploading] = useState(false);

  // Offline saved volumes state (IndexedDB)
  const [offlineVolumeIds, setOfflineVolumeIds] = useState<Set<string>>(
    new Set()
  );
  const [downloadingOfflineVolId, setDownloadingOfflineVolId] = useState<
    string | null
  >(null);
  const [offlineDownloadText, setOfflineDownloadText] = useState<string>("");

  // Inline editing a Volume
  const [editingVolId, setEditingVolId] = useState<string | null>(null);
  const [editVolNumber, setEditVolNumber] = useState<number>(1);
  const [editVolTitle, setEditVolTitle] = useState<string>("");

  const workCoverInputRef = useRef<HTMLInputElement | null>(null);
  const batchPdfInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getAllOfflineVolumeIds().then((ids) => {
      setOfflineVolumeIds(new Set(ids));
    });
  }, [work.volumes]);

  const handleToggleOfflineVolume = async (vol: VolumeItem) => {
    if (!vol.fileUrl) return;
    if (offlineVolumeIds.has(vol.id)) {
      await removeVolumeOffline(vol.id);
      setOfflineVolumeIds((prev) => {
        const next = new Set(prev);
        next.delete(vol.id);
        return next;
      });
      return;
    }

    setDownloadingOfflineVolId(vol.id);
    setOfflineDownloadText("Guardando...");
    try {
      await fetchAndCacheVolumeBlob(vol.id, vol.fileUrl, true, (msg) =>
        setOfflineDownloadText(msg)
      );
      setOfflineVolumeIds((prev) => {
        const next = new Set(prev);
        next.add(vol.id);
        return next;
      });
    } catch (err) {
      console.error("Error guardando tomo offline:", err);
    } finally {
      setDownloadingOfflineVolId(null);
      setOfflineDownloadText("");
    }
  };

  // Extraer una página específica de un tomo YA subido para previsualizarla como portada
  const handleLoadPageFromUploadedVolume = async (
    vol: VolumeItem,
    pageNum: number
  ) => {
    if (!vol.fileUrl) return;
    setPickerLoading(true);
    try {
      const blob = await fetchAndCacheVolumeBlob(vol.id, vol.fileUrl, true);
      const maxP = Math.max(1, vol.totalPages || 9999);
      const targetPage = Math.min(Math.max(1, pageNum), maxP);
      setPickerPageNumber(targetPage);

      const extracted = await extractCoverFromPdfFile(
        blob,
        targetPage,
        vol.fileName || vol.fileUrl
      );
      if (extracted) {
        setPickerPreviewDataUrl(extracted.dataUrl);
        setPickerTotalPages(extracted.numPages || vol.totalPages || 1);
      }
    } catch (err) {
      console.error("Error extrayendo página del documento:", err);
    } finally {
      setPickerLoading(false);
    }
  };

  // Abrir el selector de página para portada en un tomo ya subido
  const handleOpenCoverPagePicker = async (
    vol: VolumeItem,
    initialPage = 1
  ) => {
    if (pickingCoverVolId === vol.id) {
      setPickingCoverVolId(null);
      setPickerPreviewDataUrl(null);
      return;
    }
    setPickingCoverVolId(vol.id);
    setPickerPageNumber(initialPage);
    setPickerTotalPages(vol.totalPages || 1);
    setPickerPreviewDataUrl(null);
    await handleLoadPageFromUploadedVolume(vol, initialPage);
  };

  // Guardar la página previsualizada como portada del Tomo, del Manga Principal, o de Ambos
  const handleApplyPickedPageCover = async (
    vol: VolumeItem,
    target: "volume" | "work" | "both"
  ) => {
    if (!pickerPreviewDataUrl) return;
    setPickerSavingTarget(target);
    try {
      const uploadedUrl = await uploadBase64CoverDirectToCloud(
        pickerPreviewDataUrl,
        `page-${pickerPageNumber}-tomo-${vol.volumeNumber}`
      );
      if (!uploadedUrl) return;

      let updatedWorkCover = work.coverUrl;
      let updatedVolumes = [...work.volumes];

      if (target === "volume" || target === "both") {
        const vRes = await fetch(`/api/volumes/${vol.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coverUrl: uploadedUrl }),
        });
        if (vRes.ok) {
          const updatedVol = await vRes.json();
          updatedVolumes = updatedVolumes.map((v) =>
            v.id === vol.id ? updatedVol : v
          );
        }
      }

      if (target === "work" || target === "both") {
        const wRes = await fetch(`/api/works/${work.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coverUrl: uploadedUrl }),
        });
        if (wRes.ok) {
          updatedWorkCover = uploadedUrl;
        }
      }

      onWorkUpdated({
        ...work,
        coverUrl: updatedWorkCover,
        volumes: updatedVolumes,
      });
      setPickingCoverVolId(null);
      setPickerPreviewDataUrl(null);
    } catch (err) {
      console.error("Error aplicando página como portada:", err);
    } finally {
      setPickerSavingTarget(null);
    }
  };

  // Save Work Metadata
  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let finalTags = tags;
      if (language === "EN") {
        const lower = tags.toLowerCase();
        if (!lower.includes("inglés") && !lower.includes("ingles")) {
          finalTags = tags ? `${tags}, Inglés` : "Inglés";
        }
      } else if (language === "ES") {
        finalTags = tags
          .split(",")
          .map((t) => t.trim())
          .filter(
            (t) =>
              t.toLowerCase() !== "inglés" &&
              t.toLowerCase() !== "ingles" &&
              t.toLowerCase() !== "english"
          )
          .join(", ");
      }

      const res = await fetch(`/api/works/${work.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle,
          author,
          releaseYear: releaseYear ? Number(releaseYear) : null,
          description,
          type,
          status,
          readingMode,
          language: language === "ES" ? null : language,
          tags: finalTags,
          rating,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onWorkUpdated(updated);
        setEditingMeta(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Alternar Ocultar / Mostrar Obra
  const handleToggleHideWork = async () => {
    const current = (tags || work.tags || "")
      .split(",")
      .map((t) => t.replace(/\.+$/, "").trim())
      .filter(Boolean);
    const isHidden = isWorkSensitive({ tags: tags || work.tags });
    let nextTags: string[];
    if (isHidden) {
      nextTags = current.filter(
        (t) =>
          t.toLowerCase() !== "+18" &&
          t.toLowerCase() !== "adulto" &&
          t.toLowerCase() !== "oculto"
      );
    } else {
      nextTags = ["+18", ...current];
    }
    const tagsStr = nextTags.join(", ");
    setTags(tagsStr);

    try {
      const res = await fetch(`/api/works/${work.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: tagsStr }),
      });
      if (res.ok) {
        const updated = await res.json();
        onWorkUpdated(updated);
      }
    } catch (err) {
      console.error("Error al alternar ocultar obra:", err);
    }
  };

  // Change Main Work Cover
  const handleWorkCoverChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { url } = await uploadFileDirectToCloud(file, "covers");
      if (!url) return;

      const res = await fetch(`/api/works/${work.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverUrl: url }),
      });
      if (res.ok) {
        const updated = await res.json();
        onWorkUpdated(updated);
      }
    } catch (err) {
      console.error("Error changing work cover:", err);
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async () => {
    try {
      const res = await fetch(`/api/works/${work.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !work.isFavorite }),
      });
      if (res.ok) {
        const updated = await res.json();
        onWorkUpdated(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle PDF Selection or Drag & Drop for New Volume (with auto-cover extraction!)
  const handlePdfFileObject = async (file: File | null) => {
    if (!file) return;
    setSelectedPdfFile(file);
    setDriveBlobForNewVol(null);
    setNewVolCoverPage(1);

    // Auto-fill title if still default
    const cleanName = file.name.replace(/\.[a-z0-9]+$/i, "");
    if (!volTitle || volTitle.startsWith("Tomo ") || volTitle.startsWith("Libro ") || volTitle.startsWith("Volumen ")) {
      setVolTitle(`${unitSingular} ${volNumber}: ${cleanName}`);
    }

    // Extract page 1 as automatic cover preview
    try {
      const extracted = await extractCoverFromPdfFile(file, 1);
      if (extracted) {
        setAutoExtractedCoverDataUrl(extracted.dataUrl);
        setDetectedPages(extracted.numPages);
      }
    } catch (err) {
      console.error("Error auto-extracting cover:", err);
    }
  };

  const handlePdfFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    handlePdfFileObject(e.target.files?.[0] || null);
  };

  // Extraer automáticamente portada al pegar enlace de Google Drive en Nuevo Tomo
  const handleDriveLinkInputChange = async (
    link: string,
    ext = driveFormatExt
  ) => {
    setDriveLinkInput(link);
    setDriveFormatExt(ext);
    const parsed = buildKomyDriveStreamUrl(link.trim(), ext);
    if (!parsed) return;

    setDriveExtractingNewVol(true);
    try {
      const res = await fetch(parsed.streamUrl);
      if (!res.ok) return;
      const blob = await res.blob();
      setDriveBlobForNewVol(blob);
      const extracted = await extractCoverFromPdfFile(
        blob,
        1,
        parsed.virtualFileName
      );
      if (extracted) {
        setAutoExtractedCoverDataUrl(extracted.dataUrl);
        setDetectedPages(extracted.numPages);
        setNewVolCoverPage(1);
      }
    } catch (err) {
      console.error("Error auto-extracting cover from drive link:", err);
    } finally {
      setDriveExtractingNewVol(false);
    }
  };

  // Cambiar el número de página para portada al agregar un nuevo tomo (PC o Drive)
  const handleNewVolCoverPageChange = async (pageNum: number) => {
    const source = selectedPdfFile || driveBlobForNewVol;
    if (!source) return;
    const clamped = Math.min(Math.max(1, pageNum), detectedPages || 9999);
    setNewVolCoverPage(clamped);
    const hint = selectedPdfFile
      ? selectedPdfFile.name
      : `drive${driveFormatExt}`;
    const extracted = await extractCoverFromPdfFile(source, clamped, hint);
    if (extracted) {
      setAutoExtractedCoverDataUrl(extracted.dataUrl);
      setSelectedCoverFile(null);
      setDetectedPages(extracted.numPages);
    }
  };

  // Create New Volume via Direct Cloud Upload OR Google Drive Link
  const handleCreateVolume = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadingVolume(true);
    setUploadProgressMsg("Preparando subida...");

    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileSize = 0;
      let totalPages = detectedPages || 1;
      let coverUrl: string | null = null;
      let workingCoverDataUrl = autoExtractedCoverDataUrl;

      // 1A. Si el Admin pegó un enlace de Google Drive
      if (driveLinkInput.trim()) {
        const parsedDrive = buildKomyDriveStreamUrl(
          driveLinkInput,
          driveFormatExt
        );
        if (parsedDrive) {
          fileUrl = parsedDrive.streamUrl;
          fileName = parsedDrive.virtualFileName;

          // Si aún no se extrajo la portada, extraerla automáticamente de la primera página
          if (!workingCoverDataUrl && !selectedCoverFile) {
            try {
              setUploadProgressMsg("Extrayendo portada de primera página desde Drive...");
              const dRes = await fetch(parsedDrive.streamUrl);
              if (dRes.ok) {
                const dBlob = await dRes.blob();
                const ext = await extractCoverFromPdfFile(
                  dBlob,
                  newVolCoverPage || 1,
                  parsedDrive.virtualFileName
                );
                if (ext) {
                  workingCoverDataUrl = ext.dataUrl;
                  setAutoExtractedCoverDataUrl(ext.dataUrl);
                  totalPages = ext.numPages || totalPages;
                }
              }
            } catch {
              // Continuar
            }
          }
        }
      } else if (selectedPdfFile) {
        // 1B. Subida directa a la nube (divide automáticamente archivos >38MB)
        const pdfData = await uploadFileDirectToCloud(
          selectedPdfFile,
          "pdfs",
          (msg) => setUploadProgressMsg(msg)
        );
        fileUrl = pdfData.url;
        fileName = pdfData.fileName;
        fileSize = pdfData.fileSize;
      }

      // 2. Upload custom cover file OR auto-extracted PDF page 1 cover
      if (selectedCoverFile) {
        setUploadProgressMsg(`Subiendo portada de ${unitSingular.toLowerCase()}...`);
        const covData = await uploadFileDirectToCloud(
          selectedCoverFile,
          "covers"
        );
        coverUrl = covData.url;
      } else if (workingCoverDataUrl) {
        setUploadProgressMsg("Subiendo portada automática...");
        coverUrl = await uploadBase64CoverDirectToCloud(
          workingCoverDataUrl,
          `vol-${volNumber}`
        );
      }

      setUploadProgressMsg(`Guardando ${unitSingular.toLowerCase()} en tu biblioteca...`);

      // 3. Save Volume in DB
      const createRes = await fetch(`/api/works/${work.id}/volumes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          volumeNumber: volNumber,
          title: volTitle,
          synopsis: volSynopsis,
          coverUrl,
          fileUrl,
          fileName,
          fileSize,
          totalPages,
        }),
      });

      if (createRes.ok) {
        const newVol = await createRes.json();
        const updatedVolumes = [...work.volumes, newVol];
        onWorkUpdated({
          ...work,
          coverUrl: work.coverUrl || coverUrl,
          volumes: updatedVolumes,
        });

        // Reset form for next volume
        const nextNum = Number(volNumber) + 1;
        setVolNumber(nextNum);
        setVolTitle(`${unitSingular} ${nextNum}`);
        setVolSynopsis("");
        setSelectedPdfFile(null);
        setDriveLinkInput("");
        setDriveBlobForNewVol(null);
        setSelectedCoverFile(null);
        setAutoExtractedCoverDataUrl(null);
        setShowAddVolume(false);
      }
    } catch (err) {
      console.error("Error creating volume:", err);
    } finally {
      setUploadingVolume(false);
      setUploadProgressMsg("");
    }
  };

  // Link an existing Volume to Google Drive (with auto-cover extraction!)
  const handleSaveVolumeDriveLink = async (volumeId: string) => {
    const parsed = buildKomyDriveStreamUrl(
      existingVolDriveUrl,
      existingVolDriveExt
    );
    if (!parsed) return;

    let autoCoverUrl: string | null = null;
    const targetVol = work.volumes.find((v) => v.id === volumeId);
    if (targetVol && !targetVol.coverUrl) {
      try {
        const dRes = await fetch(parsed.streamUrl);
        if (dRes.ok) {
          const dBlob = await dRes.blob();
          const ext = await extractCoverFromPdfFile(
            dBlob,
            1,
            parsed.virtualFileName
          );
          if (ext) {
            autoCoverUrl = await uploadBase64CoverDirectToCloud(
              ext.dataUrl,
              `vol-${targetVol.volumeNumber}`
            );
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    const payload: any = {
      fileUrl: parsed.streamUrl,
      fileName: parsed.virtualFileName,
    };
    if (autoCoverUrl) payload.coverUrl = autoCoverUrl;

    const res = await fetch(`/api/volumes/${volumeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updatedVol = await res.json();
      onWorkUpdated({
        ...work,
        volumes: work.volumes.map((v) => (v.id === volumeId ? updatedVol : v)),
      });
      setLinkingDriveVolId(null);
      setExistingVolDriveUrl("");
    }
  };

  // Batch upload multiple files at once (supports >50MB files automatically!)
  const handleBatchPdfUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setBatchUploading(true);
    let currentMaxVol =
      work.volumes.length > 0
        ? Math.max(...work.volumes.map((v) => v.volumeNumber))
        : 0;
    const newlyCreated: VolumeItem[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        currentMaxVol += 1;
        setUploadProgressMsg(
          `Subiendo Tomo ${currentMaxVol} (${i + 1}/${files.length})...`
        );

        const pdfData = await uploadFileDirectToCloud(
          file,
          "pdfs",
          (msg) =>
            setUploadProgressMsg(
              `Tomo ${currentMaxVol} (${i + 1}/${files.length}): ${msg}`
            )
        );
        if (!pdfData.url) continue;

        // Extract cover from page 1
        let coverUrl: string | null = null;
        const extracted = await extractCoverFromPdfFile(file, 1);
        if (extracted) {
          coverUrl = await uploadBase64CoverDirectToCloud(
            extracted.dataUrl,
            `tomo-${currentMaxVol}`
          );
        }

        const cleanTitle = file.name.replace(/\.[a-z0-9]+$/i, "");
        const volRes = await fetch(`/api/works/${work.id}/volumes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            volumeNumber: currentMaxVol,
            title: `Tomo ${currentMaxVol}: ${cleanTitle}`,
            coverUrl,
            fileUrl: pdfData.url,
            fileName: pdfData.fileName,
            fileSize: pdfData.fileSize,
            totalPages: extracted?.numPages || 1,
          }),
        });

        if (volRes.ok) {
          const created = await volRes.json();
          newlyCreated.push(created);
        }
      }

      if (newlyCreated.length > 0) {
        onWorkUpdated({
          ...work,
          coverUrl: work.coverUrl || newlyCreated[0].coverUrl,
          volumes: [...work.volumes, ...newlyCreated],
        });
      }
    } catch (err) {
      console.error("Batch upload error:", err);
    } finally {
      setBatchUploading(false);
      setUploadProgressMsg("");
    }
  };

  // Reorder Volumes (Move Up / Down or Sort by Number)
  const handleMoveVolume = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= work.volumes.length) return;

    const reordered = [...work.volumes];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    // Optimistic update
    onWorkUpdated({ ...work, volumes: reordered });

    await fetch(`/api/works/${work.id}/volumes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderedVolumeIds: reordered.map((v) => v.id),
      }),
    });
  };

  const handleSortVolumesBy = async (
    sortBy: "number_asc" | "number_desc" | "title_asc"
  ) => {
    const res = await fetch(`/api/works/${work.id}/volumes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortBy }),
    });
    if (res.ok) {
      const sortedVolumes = await res.json();
      onWorkUpdated({ ...work, volumes: sortedVolumes });
    }
  };

  // Update individual Volume Cover
  const handleUpdateVolumeCover = async (volumeId: string, file: File) => {
    const { url } = await uploadFileDirectToCloud(file, "covers");
    if (!url) return;

    const res = await fetch(`/api/volumes/${volumeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverUrl: url }),
    });

    if (res.ok) {
      const updatedVol = await res.json();
      onWorkUpdated({
        ...work,
        volumes: work.volumes.map((v) => (v.id === volumeId ? updatedVol : v)),
      });
    }
  };

  // Update or Upload file for an existing Volume (supports >50MB)
  const handleUpdateVolumePdf = async (volumeId: string, file: File) => {
    setBatchUploading(true);
    setUploadProgressMsg(`Subiendo ${file.name}...`);
    try {
      const pdfData = await uploadFileDirectToCloud(file, "pdfs", (msg) =>
        setUploadProgressMsg(msg)
      );
      if (!pdfData.url) return;

      const extracted = await extractCoverFromPdfFile(file, 1);

      const res = await fetch(`/api/volumes/${volumeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: pdfData.url,
          fileName: pdfData.fileName,
          fileSize: pdfData.fileSize,
          totalPages: extracted?.numPages || 1,
        }),
      });

      if (res.ok) {
        const updatedVol = await res.json();
        onWorkUpdated({
          ...work,
          volumes: work.volumes.map((v) =>
            v.id === volumeId ? updatedVol : v
          ),
        });
      }
    } finally {
      setBatchUploading(false);
      setUploadProgressMsg("");
    }
  };

  // Save inline volume title & number
  const handleSaveVolumeInline = async (volumeId: string) => {
    const res = await fetch(`/api/volumes/${volumeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        volumeNumber: editVolNumber,
        title: editVolTitle,
      }),
    });
    if (res.ok) {
      const updatedVol = await res.json();
      onWorkUpdated({
        ...work,
        volumes: work.volumes.map((v) => (v.id === volumeId ? updatedVol : v)),
      });
      setEditingVolId(null);
    }
  };

  // Delete a Volume
  const handleDeleteVolume = async (volumeId: string) => {
    const res = await fetch(`/api/volumes/${volumeId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onWorkUpdated({
        ...work,
        volumes: work.volumes.filter((v) => v.id !== volumeId),
      });
    }
  };

  // Delete Entire Work
  const handleDeleteWork = async () => {
    const res = await fetch(`/api/works/${work.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onWorkDeleted(work.id);
    }
  };

  // Find volume to "Continue Reading"
  const lastReadVolume =
    [...work.volumes]
      .filter((v) => v.lastReadAt)
      .sort(
        (a, b) =>
          new Date(b.lastReadAt!).getTime() - new Date(a.lastReadAt!).getTime()
      )[0] || work.volumes[0];

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-950/70 shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-2.5">
            <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30">
              {work.type === "MANGA"
                ? "MANGA"
                : work.type === "BOOK"
                ? "LIBRO"
                : work.type === "LIGHT_NOVEL"
                ? "NOVELA LIGERA"
                : "CÓMIC"}
            </span>
            <h2 className="text-sm sm:text-base font-bold text-white leading-snug break-words line-clamp-2">
              {work.title}
            </h2>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleToggleFavorite}
              className={`p-2 rounded-xl border transition ${
                work.isFavorite
                  ? "bg-rose-500/20 border-rose-500/50 text-rose-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
              }`}
              title="Marcar como Favorito"
            >
              <Heart
                className="w-4 h-4"
                fill={work.isFavorite ? "currentColor" : "none"}
              />
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleToggleHideWork}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                    isWorkSensitive(work)
                      ? "bg-rose-600/30 border-rose-500/60 text-rose-200 hover:bg-rose-600/40"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  }`}
                  title={
                    isWorkSensitive(work)
                      ? "Esta obra está oculta (Visible con filtro +18). Clic para desocultar."
                      : "Ocultar esta obra del catálogo público."
                  }
                >
                  {isWorkSensitive(work) ? (
                    <>
                      <span>👁️‍🗨️</span>
                      <span className="hidden sm:inline">Obra Oculta</span>
                    </>
                  ) : (
                    <>
                      <span>👁️</span>
                      <span className="hidden sm:inline">Ocultar</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setEditingMeta((m) => !m)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                    editingMeta
                      ? "bg-violet-600 border-violet-500 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar Obra</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs (Solo si la obra cuenta con más de un tomo) */}
        {hasMultipleVolumes && (
          <div className="flex border-b border-zinc-800 bg-zinc-950/70 px-5 gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className={`py-3 px-2 text-sm font-bold border-b-2 transition ${
                activeTab === "details"
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Obra y Detalles
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("volumes")}
              className={`py-3 px-2 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
                activeTab === "volumes"
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span>{unitPlural}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === "volumes"
                    ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {work.volumes.length}
              </span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-8">
          {activeTab === "details" ? (
            /* Hero Section: Cover + Metadata / Edit Form */
            <div className="flex flex-col md:flex-row gap-6">
              {/* Cover Column with Quick Change Cover Button (Admin Only) */}
              <div className="w-44 sm:w-52 shrink-0 mx-auto md:mx-0 flex flex-col gap-2.5">
                <div className="relative aspect-[3/4.2] w-full rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700 shadow-xl group">
                  {work.coverUrl ? (
                    <img
                    src={work.coverUrl}
                    alt={work.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-zinc-500">
                    <BookOpen className="w-12 h-12 mb-2 text-zinc-600" />
                    <span className="text-xs font-medium">{work.title}</span>
                  </div>
                )}

                {isAdmin && (
                  <button
                    onClick={() => workCoverInputRef.current?.click()}
                    className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-2 text-white text-xs font-semibold p-3 text-center"
                  >
                    <ImageIcon className="w-6 h-6 text-violet-400" />
                    <span>Cambiar Portada Principal</span>
                  </button>
                )}

                {/* Número de páginas en la portada (Libros o Mangas únicos) */}
                {work.volumes.length <= 1 && lastReadVolume && lastReadVolume.totalPages > 0 && (
                  <div className="absolute bottom-2.5 right-2.5 pointer-events-none z-10">
                    <span className="px-2 py-0.5 rounded-md bg-black/85 backdrop-blur-md text-[10px] font-black text-zinc-200 border border-white/15 shadow-md flex items-center gap-1">
                      <span>{lastReadVolume.totalPages}</span>
                      <span className="text-[9px] text-zinc-400 font-semibold">págs</span>
                    </span>
                  </div>
                )}
              </div>

              {isAdmin && (
                <>
                  <input
                    ref={workCoverInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif,image/bmp,image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
                    onChange={handleWorkCoverChange}
                    className="hidden"
                  />

                  <button
                    onClick={() => workCoverInputRef.current?.click()}
                    className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                    <span>Subir Imagen Portada</span>
                  </button>

                  {work.volumes.some((v) => v.fileUrl) && (
                    <button
                      type="button"
                      onClick={() => {
                        const firstWithFile = work.volumes.find(
                          (v) => v.fileUrl
                        );
                        if (firstWithFile) {
                          handleOpenCoverPagePicker(firstWithFile, 1);
                        }
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-200 text-[11px] font-bold flex items-center justify-center gap-1.5 transition"
                      title="Seleccionar cualquier página del documento subido (ej. página 3) como portada"
                    >
                      <FileText className="w-3.5 h-3.5 text-violet-400" />
                      <span>Elegir pág. del documento</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Work Info or Edit Form */}
            <div className="flex-1 min-w-0">
              {isAdmin && editingMeta ? (
                <form
                  onSubmit={handleSaveMetadata}
                  className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4 space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Título de la Obra *
                      </label>
                      <input
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Subtítulo / Nombre Alternativo
                      </label>
                      <input
                        type="text"
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Autor / Mangaka
                      </label>
                      <input
                        type="text"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Año de Publicación
                      </label>
                      <input
                        type="number"
                        value={releaseYear}
                        onChange={(e) => setReleaseYear(e.target.value)}
                        placeholder="Ej. 1487, 1999, 2024..."
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-zinc-400 mb-1">
                        Etiquetas / Géneros (separados por coma)
                      </label>
                      <input
                        type="text"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="Acción, Fantasía, Seinen"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white mb-2"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {allGenreOptions.map((g) => {
                          const active = tags
                            .split(",")
                            .map((t) => t.replace(/\.+$/, "").trim().toLowerCase())
                            .includes(g.toLowerCase());
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() => togglePresetGenre(g)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                                active
                                  ? "bg-violet-600/30 border-violet-500 text-violet-200"
                                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              {active ? `✓ ${g}` : `+ ${g}`}
                            </button>
                          );
                        })}
                      </div>

                      {/* Control de Ocultar Obra (+18 / Sensible) */}
                      <div
                        className={`mt-3 p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                          isWorkSensitive({ tags })
                            ? "bg-rose-950/25 border-rose-500/60 shadow-lg shadow-rose-950/20"
                            : "bg-zinc-900 border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-xs ${
                              isWorkSensitive({ tags })
                                ? "bg-rose-600 text-white shadow-md shadow-rose-950/50"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {isWorkSensitive({ tags }) ? "🔞" : "👁️"}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>Ocultar esta Obra del catálogo</span>
                              {isWorkSensitive({ tags }) && (
                                <span className="px-1.5 py-0.5 rounded-full bg-rose-600/30 text-rose-300 border border-rose-500/40 text-[9px] font-black uppercase">
                                  Oculta (+18)
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              Solo se mostrará a lectores que activen el botón de contenido adulto (+18) con confirmación.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const current = tags
                              .split(",")
                              .map((t) => t.replace(/\.+$/, "").trim())
                              .filter(Boolean);
                            const exists = current.some(
                              (t) =>
                                t.toLowerCase() === "+18" ||
                                t.toLowerCase() === "oculto"
                            );
                            let next: string[];
                            if (exists) {
                              next = current.filter(
                                (t) =>
                                  t.toLowerCase() !== "+18" &&
                                  t.toLowerCase() !== "adulto" &&
                                  t.toLowerCase() !== "oculto"
                              );
                            } else {
                              next = ["+18", ...current];
                            }
                            setTags(next.join(", "));
                          }}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition border shrink-0 flex items-center gap-1.5 shadow ${
                            isWorkSensitive({ tags })
                              ? "bg-rose-600 border-rose-500 text-white shadow-rose-950/30"
                              : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-zinc-600"
                          }`}
                        >
                          {isWorkSensitive({ tags }) ? (
                            <>
                              <span>👁️‍🗨️ Obra Oculta</span>
                              <span className="text-[10px] opacity-80 font-normal">
                                (Click para desocultar)
                              </span>
                            </>
                          ) : (
                            <>
                              <span>👁️ Ocultar Obra</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Tipo de Obra
                      </label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as WorkType)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                      >
                        <option value="MANGA">Manga</option>
                        <option value="BOOK">Libro</option>
                        <option value="LIGHT_NOVEL">Novela Ligera</option>
                        <option value="COMIC">Cómic</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Estado de Lectura
                      </label>
                      <select
                        value={status}
                        onChange={(e) =>
                          setStatus(e.target.value as WorkStatus)
                        }
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                      >
                        <option value="READING">Leyendo actualmente</option>
                        <option value="PLAN_TO_READ">Pendiente por leer</option>
                        <option value="COMPLETED">Terminado</option>
                        <option value="ON_HOLD">En pausa</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Modo de Lectura Predeterminado
                      </label>
                      <select
                        value={readingMode}
                        onChange={(e) =>
                          setReadingMode(e.target.value as ReadingMode)
                        }
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                      >
                        <option value="MANGA_RTL">
                          Modo Manga (Derecha a Izquierda)
                        </option>
                        <option value="BOOK_LTR">
                          Modo Libro (Izquierda a Derecha)
                        </option>
                        <option value="WEBTOON_VERTICAL">
                          Modo Cascada / Webtoon (Vertical)
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Idioma de la Obra
                      </label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                      >
                        <option value="ES">🇪🇸 Español (Predeterminado - Portada limpia)</option>
                        <option value="EN">🇬🇧 Inglés (Muestra insignia EN en portada)</option>
                        <option value="JP">🇯🇵 Japonés (Muestra insignia JP en portada)</option>
                        <option value="OTHER">🌐 Otro idioma</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Calificación (0 - 10)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={rating}
                        onChange={(e) => setRating(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Sinopsis / Descripción
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={handleDeleteWork}
                      className="px-3 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar Obra Completa
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingMeta(false)}
                        className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        Guardar Cambios
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div>
                    {work.subtitle && (
                      <p className="text-sm text-violet-400 font-medium">
                        {work.subtitle}
                      </p>
                    )}
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                      {work.title}
                    </h1>
                    <p className="text-sm text-zinc-400 mt-1">
                      Por{" "}
                      <button
                        type="button"
                        onClick={() => {
                          if (work.author && onSelectAuthor) {
                            onSelectAuthor(work.author.trim());
                          }
                        }}
                        className="text-zinc-200 hover:text-violet-300 hover:underline font-semibold transition"
                        title="Ver todas las obras de este autor"
                      >
                        {work.author || "Autor Desconocido"}
                      </button>
                      {work.releaseYear ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (work.releaseYear && onSelectYear) {
                              onSelectYear(String(work.releaseYear));
                            }
                          }}
                          className="text-zinc-400 hover:text-emerald-300 font-medium ml-1 transition"
                          title="Ver obras de este año"
                        >
                          · Año {work.releaseYear}
                        </button>
                      ) : null}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 text-xs font-medium border border-zinc-700">
                      {work.volumes.length}{" "}
                      {work.volumes.length === 1 ? "Tomo" : "Tomos"}
                    </span>
                    {work.releaseYear && (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectYear && onSelectYear(String(work.releaseYear))
                        }
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-emerald-950/60 text-emerald-300 text-xs font-semibold border border-zinc-700 hover:border-emerald-500/50 transition"
                        title={`Ver cartelera del año ${work.releaseYear}`}
                      >
                        📅 {work.releaseYear}
                      </button>
                    )}
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-amber-400 text-xs font-semibold border border-zinc-700 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      {work.rating.toFixed(1)}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-violet-300 text-xs font-medium border border-zinc-700">
                      Lectura:{" "}
                      {work.readingMode === "MANGA_RTL"
                        ? "Manga (D ← I)"
                        : work.readingMode === "BOOK_LTR"
                        ? "Libro (I → D)"
                        : "Cascada"}
                    </span>
                    {getWorkNonSpanishLanguage(work) && (
                      <span className="px-2.5 py-1 rounded-lg bg-blue-950/70 text-blue-300 text-xs font-semibold border border-blue-500/40 flex items-center gap-1.5 shadow-sm">
                        <span>{getWorkNonSpanishLanguage(work) === "EN" ? "🇬🇧" : getWorkNonSpanishLanguage(work) === "JP" ? "🇯🇵" : "🌐"}</span>
                        <span>Idioma: {getWorkNonSpanishLanguage(work) === "EN" ? "Inglés" : getWorkNonSpanishLanguage(work) === "JP" ? "Japonés" : getWorkNonSpanishLanguage(work)}</span>
                      </span>
                    )}
                    {work.tags
                      ?.split(",")
                      .map((t) => t.replace(/\.+$/, "").trim())
                      .filter(Boolean)
                      .map((tag) => {
                        const isNsfwTag =
                          tag.toLowerCase() === "+18" ||
                          tag.toLowerCase() === "adulto" ||
                          tag.toLowerCase() === "nsfw" ||
                          tag.toLowerCase() === "hentai" ||
                          tag.toLowerCase() === "gore";
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => onSelectGenre && onSelectGenre(tag)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm border ${
                              isNsfwTag
                                ? "bg-rose-950/70 hover:bg-rose-600 text-rose-300 hover:text-white border-rose-800/80"
                                : "bg-violet-950/60 hover:bg-violet-600 text-violet-300 hover:text-white border-violet-800/60 hover:border-violet-400"
                            }`}
                            title={`Ir a la cartelera de ${tag}`}
                          >
                            {isNsfwTag && <span className="mr-1">🔞</span>}
                            {tag}
                          </button>
                        );
                      })}
                  </div>

                  {/* Selector Interactivo de Estado de Lectura */}
                  <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                        <Bookmark className="w-3.5 h-3.5 text-violet-400" />
                        <span>Mi Estado de Lectura:</span>
                      </span>
                      <span className="text-[11px] font-semibold text-zinc-400">
                        {status === "READING"
                          ? "📖 Leyendo actualmente"
                          : status === "COMPLETED"
                          ? "✅ Lectura terminada"
                          : status === "ON_HOLD"
                          ? "⏸️ Lectura en pausa"
                          : "⏳ Pendiente por leer"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5">
                      {[
                        {
                          id: "READING",
                          label: "📖 Leyendo",
                          activeClass:
                            "bg-sky-600 text-white border-sky-500 shadow-md shadow-sky-600/30 font-bold",
                        },
                        {
                          id: "PLAN_TO_READ",
                          label: "⏳ Pendiente",
                          activeClass:
                            "bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/30 font-bold",
                        },
                        {
                          id: "COMPLETED",
                          label: "✅ Terminado",
                          activeClass:
                            "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30 font-bold",
                        },
                        {
                          id: "ON_HOLD",
                          label: "⏸️ En pausa",
                          activeClass:
                            "bg-zinc-700 text-white border-zinc-600 shadow-md font-bold",
                        },
                      ].map((item) => {
                        const isSelected = (status || "PLAN_TO_READ") === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              handleUpdateReadingStatus(item.id as WorkStatus)
                            }
                            className={`py-2 px-2.5 rounded-xl text-xs transition border flex items-center justify-center gap-1.5 ${
                              isSelected
                                ? item.activeClass
                                : "bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                            }`}
                          >
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {isWorkSensitive(work) && (
                    <div className="w-full p-3 rounded-2xl bg-rose-950/40 border border-rose-800/60 flex items-center gap-3 text-xs text-rose-200 shadow">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <div>
                        <strong className="font-bold text-rose-100">
                          Contenido Sensible / +18:
                        </strong>{" "}
                        <span>
                          Esta obra está clasificada para público adulto debido a
                          temáticas maduras o contenido explícito.
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {work.description ||
                      (isAdmin
                        ? "Sin descripción. Haz clic en 'Editar Obra' para añadir una sinopsis o cambiar detalles."
                        : "Disfruta de todos los tomos disponibles de esta obra en el lector interactivo.")}
                  </p>

                  {/* Assign to Collections / Estanterías (Admin Only) */}
                  {isAdmin && collections.length > 0 && (
                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-400 flex items-center gap-1">
                        <FolderPlus className="w-3.5 h-3.5" /> Estanterías:
                      </span>
                      {collections.map((col) => {
                        const isInCol = work.collectionItems?.some(
                          (ci) => ci.collectionId === col.id
                        );
                        return (
                          <button
                            key={col.id}
                            onClick={() =>
                              onToggleWorkCollection(col.id, work.id)
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                              isInCol
                                ? "bg-violet-600/25 border-violet-500 text-violet-200"
                                : "bg-zinc-800/70 border-zinc-700 text-zinc-400 hover:text-white"
                            }`}
                          >
                            {isInCol ? "✓ " : "+ "}
                            {col.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick Primary Actions */}
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    {lastReadVolume && (
                      <button
                        onClick={() => onOpenReader(work, lastReadVolume)}
                        className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-violet-600/25 transition"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>
                          {lastReadVolume.currentPage > 1
                            ? `Continuar Lectura (Pág. ${lastReadVolume.currentPage})`
                            : !hasMultipleVolumes
                            ? `Leer ${isBook ? "Libro" : isNovel ? "Novela" : isComic ? "Cómic" : "Obra"}`
                            : `Leer ${lastReadVolume.title}`}
                        </span>
                      </button>
                    )}

                    {isAdmin && (
                      <>
                        <button
                          onClick={() => setShowAddVolume((s) => !s)}
                          className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-semibold text-sm flex items-center gap-2 transition"
                        >
                          <Plus className="w-4 h-4 text-violet-400" />
                          <span>
                            {!hasMultipleVolumes
                              ? `+ Añadir ${unitSingular} 2`
                              : `Subir Nuevo ${unitSingular}`}
                          </span>
                        </button>

                        <button
                          onClick={() => batchPdfInputRef.current?.click()}
                          disabled={batchUploading}
                          className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold text-sm flex items-center gap-2 transition"
                          title="Selecciona varios archivos (PDF, CBZ, ZIP, EPUB, TXT) sin importar el peso (70MB, 100MB+) y se crearán como tomos numerados con portada automática"
                        >
                          <Upload className="w-4 h-4 text-emerald-400" />
                          <span>
                            {batchUploading
                              ? uploadProgressMsg || "Subiendo Tomos..."
                              : "Subida Múltiple de Archivos"}
                          </span>
                        </button>
                        <input
                          ref={batchPdfInputRef}
                          type="file"
                          accept=".pdf,.cbz,.zip,.epub,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,application/epub+zip,text/plain,image/*"
                          multiple
                          onChange={handleBatchPdfUpload}
                          className="hidden"
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
            /* Compact Header for Volumes Only View (Page 2) */
            <div className="p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800 flex items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-16 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0">
                  {work.coverUrl ? (
                    <img
                      src={work.coverUrl}
                      alt={work.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <BookOpen className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30">
                      {work.type === "MANGA"
                        ? "MANGA"
                        : work.type === "BOOK"
                        ? "LIBRO"
                        : work.type === "LIGHT_NOVEL"
                        ? "NOVELA LIGERA"
                        : "CÓMIC"}
                    </span>
                    <h3 className="text-base font-bold text-white truncate">
                      {work.title}
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-400 truncate">
                    {work.author ? `Por ${work.author}` : "Autor desconocido"}
                    {work.releaseYear ? ` • ${work.releaseYear}` : ""}
                    {` • ${work.volumes.length} ${unitPlural.toLowerCase()}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("details")}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold shrink-0 transition"
              >
                Ver Ficha Completa
              </button>
            </div>
          )}

          {/* Add New Volume (Tomo) Form (Admin Only) */}
          {isAdmin && showAddVolume && (
            <form
              onSubmit={handleCreateVolume}
              className="bg-zinc-950/90 border border-violet-500/40 rounded-2xl p-5 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  Agregar Nuevo Tomo / Volumen
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddVolume(false)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Cerrar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Número de {unitSingular} *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={volNumber}
                    onChange={(e) => setVolNumber(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Título de {unitSingular} *
                  </label>
                  <input
                    type="text"
                    required
                    value={volTitle}
                    onChange={(e) => setVolTitle(e.target.value)}
                    placeholder={`Ej. ${unitSingular} 1: El Comienzo`}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Multi-Format File Picker OR Google Drive Link */}
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-200 mb-2">
                      1A. Subir Archivo desde tu PC (Arrastrar o seleccionar)
                    </label>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingNewVol(true);
                      }}
                      onDragLeave={() => setIsDraggingNewVol(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingNewVol(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handlePdfFileObject(file);
                      }}
                      className={`p-4 rounded-xl border-2 border-dashed transition text-center cursor-pointer ${
                        isDraggingNewVol
                          ? "border-violet-500 bg-violet-600/20 text-violet-300 scale-[1.01]"
                          : "border-zinc-700 hover:border-violet-500/70 bg-zinc-950/60 text-zinc-300"
                      }`}
                    >
                      <label className="cursor-pointer block w-full space-y-1">
                        <input
                          type="file"
                          accept=".pdf,.cbz,.zip,.epub,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,application/epub+zip,text/plain,image/*"
                          onChange={handlePdfFileSelect}
                          className="hidden"
                        />
                        <Upload className="w-5 h-5 text-violet-400 mx-auto" />
                        <p className="text-xs font-bold text-white">
                          {isDraggingNewVol
                            ? "¡Suelta el archivo aquí!"
                            : "Arrastra tu archivo aquí o haz clic para subir"}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          PDF, CBZ, ZIP, EPUB, TXT
                        </p>
                      </label>
                    </div>

                    {selectedPdfFile && (
                      <p className="mt-2 text-xs text-emerald-400 font-medium">
                        ✓ {selectedPdfFile.name} ({detectedPages} págs. detectadas)
                      </p>
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-zinc-800 space-y-1.5">
                    <label className="block text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5" />
                      1B. O pega enlace de Google Drive (Portada Pág. 1 automática)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={driveLinkInput}
                        onChange={(e) =>
                          handleDriveLinkInputChange(
                            e.target.value,
                            driveFormatExt
                          )
                        }
                        placeholder="https://drive.google.com/file/d/.../view"
                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                      <select
                        value={driveFormatExt}
                        onChange={(e) =>
                          handleDriveLinkInputChange(
                            driveLinkInput,
                            e.target.value
                          )
                        }
                        className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
                      >
                        <option value=".pdf">PDF</option>
                        <option value=".cbz">CBZ/ZIP</option>
                        <option value=".epub">EPUB</option>
                        <option value=".txt">TXT</option>
                      </select>
                    </div>
                    {driveExtractingNewVol && (
                      <p className="text-[11px] text-sky-400 font-medium animate-pulse flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Analizando enlace de Drive y extrayendo portada de Página 1...
                      </p>
                    )}
                    {driveBlobForNewVol && !driveExtractingNewVol && (
                      <p className="text-[11px] text-emerald-400 font-medium">
                        ✓ Enlace de Drive conectado ({detectedPages} págs. detectadas)
                      </p>
                    )}
                  </div>
                </div>

                {/* Custom Cover Picker (or Auto-extracted preview from any page) */}
                <div className="p-4 rounded-xl bg-zinc-900 border border-dashed border-zinc-700 flex items-center gap-4">
                  <div className="w-16 h-24 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
                    {selectedCoverFile ? (
                      <img
                        src={URL.createObjectURL(selectedCoverFile)}
                        alt="Portada"
                        className="w-full h-full object-cover"
                      />
                    ) : autoExtractedCoverDataUrl ? (
                      <img
                        src={autoExtractedCoverDataUrl}
                        alt="Auto Portada"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-zinc-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-200 mb-0.5">
                        2. Portada de {unitSingular} (Automática de Pág. 1)
                      </label>
                      <p className="text-[11px] text-zinc-400">
                        {(selectedPdfFile || driveBlobForNewVol) && detectedPages > 1
                          ? `Elige qué página del archivo usar como portada (Pág. ${newVolCoverPage} de ${detectedPages}):`
                          : "Pega enlace de Drive o sube archivo para extraer portada automáticamente:"}
                      </p>
                    </div>

                    {(selectedPdfFile || driveBlobForNewVol) && detectedPages > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950 px-2.5 py-1.5 rounded-xl border border-violet-500/40">
                        <span className="text-[11px] text-violet-300 font-bold">
                          Página:
                        </span>
                        <button
                          type="button"
                          disabled={newVolCoverPage <= 1}
                          onClick={() =>
                            handleNewVolCoverPageChange(newVolCoverPage - 1)
                          }
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-xs text-white font-bold"
                        >
                          ◀
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={detectedPages}
                          value={newVolCoverPage}
                          onChange={(e) =>
                            handleNewVolCoverPageChange(
                              Number(e.target.value) || 1
                            )
                          }
                          className="w-14 bg-zinc-900 border border-violet-500/50 rounded-lg px-2 py-0.5 text-xs text-center text-white font-bold"
                        />
                        <button
                          type="button"
                          disabled={newVolCoverPage >= detectedPages}
                          onClick={() =>
                            handleNewVolCoverPageChange(newVolCoverPage + 1)
                          }
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-xs text-white font-bold"
                        >
                          ▶
                        </button>
                        <span className="text-[10px] text-zinc-400">
                          de {detectedPages}
                        </span>
                      </div>
                    )}

                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif,image/bmp,image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
                      onChange={(e) =>
                        setSelectedCoverFile(e.target.files?.[0] || null)
                      }
                      className="block w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddVolume(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingVolume}
                  className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    {uploadingVolume
                      ? uploadProgressMsg || `Guardando ${unitSingular}...`
                      : `Guardar ${unitSingular}`}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Obra de Tomo Único / Gestión del Archivo Principal */}
          {!hasMultipleVolumes && isAdmin && (
            <div className="rounded-2xl bg-zinc-950/70 border border-zinc-800 overflow-hidden divide-y divide-zinc-800/80">
              {/* Header con botón para añadir Tomo 2 */}
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>📖 {isBook ? "Libro Único" : "Obra de Tomo Único"}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                      Archivo Principal
                    </span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Puedes reemplazar el archivo si lo subiste mal, editar su portada, renombrarlo o borrarlo. Si deseas convertir la obra en saga, usa el botón de añadir tomo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddVolume(true)}
                  className="px-4 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600 border border-violet-500/40 text-violet-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Añadir {unitSingular} 2</span>
                </button>
              </div>

              {/* Fila del archivo principal si existe */}
              {work.volumes[0] ? (
                (() => {
                  const vol = work.volumes[0];
                  const isEditingThis = editingVolId === vol.id;
                  const isLinkingDrive = linkingDriveVolId === vol.id;
                  const isPickingCoverPage = pickingCoverVolId === vol.id;

                  return (
                    <div className="p-4 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Miniatura de portada del tomo */}
                          <label
                            className="relative w-12 h-16 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0 cursor-pointer group shadow"
                            title="Clic para cambiar la portada de este archivo"
                          >
                            {vol.coverUrl || work.coverUrl ? (
                              <img
                                src={vol.coverUrl || work.coverUrl!}
                                alt={vol.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-500 text-[10px] font-bold">
                                Portada
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-white" />
                            </div>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif,image/bmp,image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUpdateVolumeCover(vol.id, f);
                              }}
                              className="hidden"
                            />
                          </label>

                          <div className="min-w-0">
                            {isEditingThis ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editVolTitle}
                                  onChange={(e) => setEditVolTitle(e.target.value)}
                                  placeholder="Título del tomo..."
                                  className="bg-zinc-900 border border-violet-500 rounded-lg px-2.5 py-1 text-xs text-white"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveVolumeInline(vol.id)}
                                  className="p-1 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-500"
                                  title="Guardar"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingVolId(null)}
                                  className="p-1 rounded-lg bg-zinc-800 text-zinc-400 text-xs hover:text-white"
                                  title="Cancelar"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-white truncate">
                                  {vol.title || `Archivo Principal (${unitSingular} 1)`}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingVolId(vol.id);
                                    setEditVolNumber(vol.volumeNumber);
                                    setEditVolTitle(vol.title);
                                  }}
                                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                                  title="Renombrar archivo"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-1">
                              <span className="text-emerald-400 font-semibold">
                                📄 {vol.totalPages} páginas
                              </span>
                              {vol.fileName && (
                                <>
                                  <span>·</span>
                                  <span className="truncate max-w-[220px] text-zinc-300" title={vol.fileName}>
                                    {vol.fileName}
                                  </span>
                                </>
                              )}
                              {vol.fileSize ? (
                                <>
                                  <span>·</span>
                                  <span>{(vol.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Botones de acción directos: Reemplazar, Portada, Eliminar */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {/* Reemplazar Archivo */}
                          <label
                            className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition shadow-sm"
                            title="Subir archivo nuevo para reemplazar el actual (si te equivocaste de archivo o tienes una versión corregida)"
                          >
                            <Upload className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Reemplazar Archivo</span>
                            <input
                              type="file"
                              accept=".pdf,.cbz,.zip,.epub,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,application/epub+zip,text/plain,image/*"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUpdateVolumePdf(vol.id, f);
                              }}
                              className="hidden"
                            />
                          </label>

                          {/* Elegir página de portada */}
                          <button
                            type="button"
                            onClick={() => handleOpenCoverPagePicker(vol, 1)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                              isPickingCoverPage
                                ? "bg-violet-600 border-violet-500 text-white"
                                : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-violet-300"
                            }`}
                            title="Elegir una página de este documento como portada"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                            <span>Pág. Portada</span>
                          </button>

                          {/* Vincular Drive */}
                          <button
                            type="button"
                            onClick={() => {
                              setLinkingDriveVolId(isLinkingDrive ? null : vol.id);
                              setExistingVolDriveUrl("");
                            }}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                              isLinkingDrive
                                ? "bg-sky-600 border-sky-500 text-white"
                                : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-sky-300"
                            }`}
                            title="Vincular con Google Drive"
                          >
                            <Cloud className="w-3.5 h-3.5 text-sky-400" />
                            <span>Drive</span>
                          </button>

                          {/* Eliminar Archivo */}
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("¿Estás seguro de eliminar este archivo? La obra quedará vacía y podrás subir un archivo nuevo.")) {
                                handleDeleteVolume(vol.id);
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-300 hover:text-white text-xs font-semibold transition flex items-center gap-1.5"
                            title="Eliminar este archivo de la obra"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            <span>Eliminar Archivo</span>
                          </button>
                        </div>
                      </div>

                      {/* Sub-panel vincular Drive */}
                      {isLinkingDrive && (
                        <div className="pt-3 border-t border-zinc-800 flex items-center gap-2">
                          <input
                            type="url"
                            value={existingVolDriveUrl}
                            onChange={(e) => setExistingVolDriveUrl(e.target.value)}
                            placeholder="Pega el enlace de Google Drive aquí..."
                            className="flex-1 bg-zinc-900 border border-sky-500/40 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveVolumeDriveLink(vol.id)}
                            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition"
                          >
                            Vincular
                          </button>
                          <button
                            type="button"
                            onClick={() => setLinkingDriveVolId(null)}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 text-xs hover:text-white"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}

                      {/* Sub-panel selector de página de portada */}
                      {isPickingCoverPage && (
                        <div className="pt-3 border-t border-zinc-800 bg-violet-950/20 p-3.5 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
                          <div className="w-24 h-36 rounded-xl bg-zinc-900 border border-violet-500/40 overflow-hidden shrink-0 flex items-center justify-center shadow-lg">
                            {pickerLoading ? (
                              <span className="text-[11px] text-violet-300 animate-pulse text-center px-2">
                                Extrayendo pág. {pickerPageNumber}...
                              </span>
                            ) : pickerPreviewDataUrl ? (
                              <img
                                src={pickerPreviewDataUrl}
                                alt={`Página ${pickerPageNumber}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[10px] text-zinc-500 text-center px-2">
                                Sin vista previa
                              </span>
                            )}
                          </div>

                          <div className="flex-1 space-y-3 w-full">
                            <div className="flex items-center justify-between">
                              <div>
                                <h5 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                                  <Sparkles className="w-4 h-4 text-violet-400" />
                                  <span>Elegir página de este documento como Portada</span>
                                </h5>
                                <p className="text-[11px] text-zinc-400">
                                  Escribe el número de página (ej. 3) o usa las flechas para ver la página y guardarla como portada.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPickingCoverVolId(null)}
                                className="p-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-zinc-300">Página:</span>
                              <button
                                type="button"
                                disabled={pickerLoading || pickerPageNumber <= 1}
                                onClick={() => handleLoadPageFromUploadedVolume(vol, pickerPageNumber - 1)}
                                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-xs text-white font-bold"
                              >
                                ← Anterior
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={pickerTotalPages}
                                value={pickerPageNumber}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 1;
                                  setPickerPageNumber(val);
                                  handleLoadPageFromUploadedVolume(vol, val);
                                }}
                                className="w-16 bg-zinc-900 border border-violet-500/60 rounded-lg px-2.5 py-1 text-xs text-center text-white font-bold"
                              />
                              <button
                                type="button"
                                disabled={pickerLoading || pickerPageNumber >= pickerTotalPages}
                                onClick={() => handleLoadPageFromUploadedVolume(vol, pickerPageNumber + 1)}
                                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-xs text-white font-bold"
                              >
                                Siguiente →
                              </button>
                              <span className="text-xs text-zinc-400">de {pickerTotalPages} págs.</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={pickerLoading || !pickerPreviewDataUrl || pickerSavingTarget !== null}
                                onClick={() => handleApplyPickedPageCover(vol, "volume")}
                                className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold transition shadow"
                              >
                                Guardar como Portada del Tomo
                              </button>
                              <button
                                type="button"
                                disabled={pickerLoading || !pickerPreviewDataUrl || pickerSavingTarget !== null}
                                onClick={() => handleApplyPickedPageCover(vol, "work")}
                                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40 text-zinc-200 text-xs font-bold transition"
                              >
                                Como Portada Principal del Manga
                              </button>
                              <button
                                type="button"
                                disabled={pickerLoading || !pickerPreviewDataUrl || pickerSavingTarget !== null}
                                onClick={() => handleApplyPickedPageCover(vol, "both")}
                                className="px-3 py-1.5 rounded-xl bg-violet-900/60 hover:bg-violet-800/80 border border-violet-500/40 disabled:opacity-40 text-violet-200 text-xs font-bold transition"
                              >
                                En Ambos
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                /* Cuando la obra no tiene ningún archivo asignado (ej: si lo eliminó) */
                <div className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white">Esta obra no tiene archivo asignado</h5>
                    <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                      Eliminaste el archivo anterior o la obra no tiene tomos. Sube el archivo correcto (PDF, CBZ, EPUB) para que quede disponible para lectura.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer transition shadow">
                    <Upload className="w-4 h-4" />
                    <span>Subir Archivo Principal</span>
                    <input
                      type="file"
                      accept=".pdf,.cbz,.zip,.epub,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,application/epub+zip,text/plain,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setShowAddVolume(true);
                          setSelectedPdfFile(f);
                          setVolTitle(f.name.replace(/\.[^/.]+$/, ""));
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Volumes (Tomos) Section (Solo cuando la obra cuenta con más de un tomo) */}
          {hasMultipleVolumes && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>
                    {isAdmin
                      ? `Organizador de ${unitPlural}`
                      : `${work.volumes.length} Capítulos / ${unitPlural}`}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                    {work.volumes.length}
                  </span>
                </h3>
                <p className="text-xs text-zinc-400">
                  {isAdmin
                    ? `Gestiona y añade ${unitPlural.toLowerCase()} desde tu PC o enlace de Google Drive con portada automática.`
                    : `Selecciona cualquier ${unitSingular.toLowerCase()} para leer o guardar offline.`}
                </p>
              </div>

              {/* Action buttons on top of Volumes section: Sort, Grid/List Switcher, and + Añadir Tomo */}
              <div className="flex flex-wrap items-center gap-2">
                {/* View switcher: Grid vs List */}
                <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setVolumeViewMode("grid")}
                    className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      volumeViewMode === "grid"
                        ? "bg-violet-600 text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    title="Vista en Cuadrícula (Portadas Grandes)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cuadrícula</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVolumeViewMode("list")}
                    className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      volumeViewMode === "list"
                        ? "bg-violet-600 text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    title="Vista en Lista Detallada"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Lista</span>
                  </button>
                </div>

                {/* Sort buttons */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSortVolumesBy("number_asc")}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-1"
                    title={`Ordenar del ${unitSingular} 1 al último`}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-violet-400" />
                    <span>(1 → N)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSortVolumesBy("number_desc")}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-1"
                    title={`Ordenar del último al 1`}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-violet-400" />
                    <span>(N → 1)</span>
                  </button>
                </div>

                {/* Top Add Volume Button (Admin Only) - Point 3 requirement */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddVolume(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-violet-600/30 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Añadir {isBook ? "Libro de Saga" : unitSingular}</span>
                  </button>
                )}
              </div>
            </div>

            {work.volumes.length === 0 ? (
              <div className="p-10 rounded-2xl bg-zinc-950/50 border border-dashed border-zinc-800 text-center space-y-4">
                <FileText className="w-10 h-10 text-zinc-600 mx-auto" />
                <p className="text-sm font-semibold text-zinc-300">
                  Esta obra aún no tiene {unitPlural.toLowerCase()} cargados
                </p>
                {isAdmin && (
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddVolume(true)}
                      className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-violet-600/20"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Añadir {isBook ? "Libro de Saga" : unitSingular}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : volumeViewMode === "grid" ? (
              /* Big Cover Grid (Page 2 Requirement) */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {work.volumes.map((vol) => {
                  const progressPct = Math.round(
                    (vol.currentPage / Math.max(1, vol.totalPages)) * 100
                  );
                  const isSavedOffline = offlineVolumeIds.has(vol.id);

                  return (
                    <div
                      key={vol.id}
                      onClick={() => onOpenReader(work, vol)}
                      className="group relative rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800/90 hover:border-violet-500/80 transition-all duration-200 hover:shadow-xl hover:shadow-violet-900/20 flex flex-col cursor-pointer"
                    >
                      {/* Big Cover Image */}
                      <div className="relative aspect-[3/4.4] w-full overflow-hidden bg-zinc-900">
                        {vol.coverUrl || work.coverUrl ? (
                          <img
                            src={vol.coverUrl || work.coverUrl || undefined}
                            alt={vol.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-zinc-500">
                            <BookOpen className="w-10 h-10 mb-1 text-zinc-700" />
                            <span className="text-[11px] font-semibold">{vol.title}</span>
                          </div>
                        )}

                        {/* Top Badges */}
                        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                          {vol.totalPages > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/75 backdrop-blur-md text-zinc-200 border border-white/10 shadow">
                              {vol.totalPages} Págs
                            </span>
                          ) : <span />}

                          {isSavedOffline && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/80 backdrop-blur-md text-white shadow flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> Offline
                            </span>
                          )}
                        </div>

                        {/* Hover Overlay with Read Button */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-3 text-center gap-2">
                          <div className="w-11 h-11 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-600/50 transform group-hover:scale-110 transition-transform">
                            <BookOpen className="w-5 h-5 ml-0.5" />
                          </div>
                          <span className="text-xs font-bold text-white drop-shadow">
                            {vol.currentPage > 1 ? `Continuar (pág. ${vol.currentPage})` : `Leer ${unitSingular}`}
                          </span>
                        </div>

                        {/* Reading Progress Line */}
                        {vol.currentPage > 1 && (
                          <div className="absolute bottom-0 inset-x-0 h-1 bg-zinc-800">
                            <div
                              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Bottom Capsule Badge (Like Page 2 screenshot: "Tomo - 01") */}
                      <div className="p-2.5 bg-zinc-950 flex flex-col gap-1 border-t border-zinc-900">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-violet-600/20 text-violet-300 border border-violet-500/30 truncate">
                            {unitSingular} - {String(vol.volumeNumber).padStart(2, "0")}
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setVolumeViewMode("list");
                                setEditingVolId(vol.id);
                                setEditVolNumber(vol.volumeNumber);
                                setEditVolTitle(vol.title);
                              }}
                              className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
                              title={`Editar ${unitSingular}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <h4 className="text-xs font-semibold text-zinc-200 truncate group-hover:text-violet-300 transition" title={vol.title}>
                          {vol.title}
                        </h4>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {work.volumes.map((vol, idx) => {
                  const progressPct = Math.round(
                    (vol.currentPage / Math.max(1, vol.totalPages)) * 100
                  );
                  const isEditingThis = isAdmin && editingVolId === vol.id;
                  const isLinkingDrive = isAdmin && linkingDriveVolId === vol.id;
                  const isPickingCoverPage =
                    isAdmin && pickingCoverVolId === vol.id;
                  const isSavedOffline = offlineVolumeIds.has(vol.id);
                  const isDownloadingThisOffline =
                    downloadingOfflineVolId === vol.id;

                  return (
                    <div
                      key={vol.id}
                      className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 hover:border-zinc-700 flex flex-col gap-3 transition"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          {/* Reorder Up/Down Buttons (Admin Only) */}
                          {isAdmin && (
                            <div className="flex flex-col gap-1 shrink-0">
                              <button
                                onClick={() => handleMoveVolume(idx, "up")}
                                disabled={idx === 0}
                                className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300"
                                title="Subir posición"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveVolume(idx, "down")}
                                disabled={idx === work.volumes.length - 1}
                                className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300"
                                title="Bajar posición"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {/* Volume Cover Thumbnail */}
                          {isAdmin ? (
                            <label
                              className="relative w-14 h-20 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0 cursor-pointer group"
                              title="Clic para cambiar la portada de este tomo"
                            >
                              {vol.coverUrl || work.coverUrl ? (
                                <img
                                  src={vol.coverUrl || work.coverUrl!}
                                  alt={vol.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-500 text-[10px] font-bold">
                                  T.{vol.volumeNumber}
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-white" />
                              </div>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif,image/bmp,image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUpdateVolumeCover(vol.id, f);
                                }}
                                className="hidden"
                              />
                            </label>
                          ) : (
                            <div
                              onClick={() => onOpenReader(work, vol)}
                              className="relative w-14 h-20 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0 cursor-pointer"
                            >
                              {vol.coverUrl || work.coverUrl ? (
                                <img
                                  src={vol.coverUrl || work.coverUrl!}
                                  alt={vol.title}
                                  className="w-full h-full object-cover hover:scale-105 transition"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-500 text-[10px] font-bold">
                                  T.{vol.volumeNumber}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Volume Info or Inline Edit */}
                          <div className="min-w-0 flex-1">
                            {isEditingThis ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={editVolNumber}
                                  onChange={(e) =>
                                    setEditVolNumber(Number(e.target.value))
                                  }
                                  className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white"
                                  placeholder="N° Tomo"
                                />
                                <input
                                  type="text"
                                  value={editVolTitle}
                                  onChange={(e) =>
                                    setEditVolTitle(e.target.value)
                                  }
                                  className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white"
                                  placeholder="Título del tomo"
                                />
                                <button
                                  onClick={() => handleSaveVolumeInline(vol.id)}
                                  className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-xs font-semibold flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" /> Guardar
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-md bg-violet-600/20 text-violet-300 border border-violet-500/30 text-[11px] font-bold">
                                    Tomo {vol.volumeNumber}
                                  </span>
                                  <h4 className="text-sm font-bold text-white truncate">
                                    {vol.title}
                                  </h4>
                                  {vol.isCompleted && (
                                    <span title="Tomo completado" className="inline-flex">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                    </span>
                                  )}
                                  {isSavedOffline && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1">
                                      <WifiOff className="w-2.5 h-2.5" />
                                      Sin Internet
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-zinc-400">
                                  <span>
                                    Pág.{" "}
                                    <strong className="text-zinc-200">
                                      {vol.currentPage}
                                    </strong>{" "}
                                    de {vol.totalPages} ({progressPct}%)
                                  </span>
                                  {isAdmin && vol.fileUrl?.includes("/api/drive") ? (
                                    <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-semibold">
                                      ☁️ Google Drive
                                    </span>
                                  ) : (
                                    isAdmin &&
                                    vol.fileName && (
                                      <span className="truncate max-w-[200px] text-zinc-500">
                                        📄 {vol.fileName}
                                      </span>
                                    )
                                  )}
                                  {vol.lastReadAt && (
                                    <span className="flex items-center gap-1 text-violet-400/90">
                                      <Clock className="w-3 h-3" />
                                      Leído recientemente
                                    </span>
                                  )}
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full max-w-xs h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2">
                                  <div
                                    className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all"
                                    style={{ width: `${progressPct}%` }}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Volume Action Buttons */}
                        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-end border-t sm:border-t-0 border-zinc-800/80 pt-2.5 sm:pt-0">
                          <button
                            onClick={() => onOpenReader(work, vol)}
                            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-violet-600/20 transition"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Leer Tomo</span>
                          </button>

                          {/* Save / Remove Offline in Device (Available to all users) */}
                          {vol.fileUrl && (
                            <button
                              onClick={() => handleToggleOfflineVolume(vol)}
                              disabled={isDownloadingThisOffline}
                              className={`px-2.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
                                isSavedOffline
                                  ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40"
                                  : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200"
                              }`}
                              title={
                                isSavedOffline
                                  ? "Guardado en tu dispositivo para leer sin internet (Clic para liberar espacio)"
                                  : "Descargar este tomo en la memoria de tu app/navegador para leer sin internet"
                              }
                            >
                              {isSavedOffline ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="hidden md:inline">
                                    Sin Internet
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="hidden md:inline">
                                    {isDownloadingThisOffline
                                      ? offlineDownloadText || "Bajando..."
                                      : "Offline"}
                                  </span>
                                </>
                              )}
                            </button>
                          )}

                          {isAdmin && (
                            <>
                              {/* Elegir una página del documento como Portada */}
                              {vol.fileUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenCoverPagePicker(vol, 1)
                                  }
                                  className={`px-2.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
                                    isPickingCoverPage
                                      ? "bg-violet-600 border-violet-500 text-white"
                                      : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-violet-300"
                                  }`}
                                  title="Elegir una página de este documento (ej. página 3) como portada del tomo o del manga"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span className="hidden md:inline">
                                    Pág. Portada
                                  </span>
                                </button>
                              )}

                              {/* Link with Google Drive */}
                              <button
                                onClick={() => {
                                  setLinkingDriveVolId(
                                    linkingDriveVolId === vol.id ? null : vol.id
                                  );
                                  setExistingVolDriveUrl("");
                                }}
                                className={`px-2.5 py-2 rounded-xl border text-xs font-medium flex items-center gap-1 transition ${
                                  linkingDriveVolId === vol.id
                                    ? "bg-sky-600 border-sky-500 text-white"
                                    : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-sky-300"
                                }`}
                                title="Vincular este tomo con un archivo de tu Google Drive (50 GB)"
                              >
                                <Cloud className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Drive</span>
                              </button>

                              {/* Upload/Replace File for this volume */}
                              <label
                                className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer flex items-center gap-1 transition"
                                title="Subir o cambiar el archivo de este tomo (PDF, CBZ, ZIP, EPUB, TXT)"
                              >
                                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="hidden md:inline">Archivo</span>
                                <input
                                  type="file"
                                  accept=".pdf,.cbz,.zip,.epub,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,application/epub+zip,text/plain,image/*"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUpdateVolumePdf(vol.id, f);
                                  }}
                                  className="hidden"
                                />
                              </label>

                              {/* Change Cover button for this volume */}
                              <label
                                className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer flex items-center gap-1 transition"
                                title="Subir imagen externa como portada de este tomo"
                              >
                                <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                                <span className="hidden md:inline">Portada</span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif,image/bmp,image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUpdateVolumeCover(vol.id, f);
                                  }}
                                  className="hidden"
                                />
                              </label>

                              {/* Edit Number & Title */}
                              <button
                                onClick={() => {
                                  setEditingVolId(vol.id);
                                  setEditVolNumber(vol.volumeNumber);
                                  setEditVolTitle(vol.title);
                                }}
                                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300"
                                title="Renombrar o cambiar número de tomo"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete Volume */}
                              <button
                                onClick={() => handleDeleteVolume(vol.id)}
                                className="p-2 rounded-xl bg-zinc-800 hover:bg-red-500/20 border border-zinc-700 hover:border-red-500/40 text-zinc-400 hover:text-red-400 transition"
                                title="Eliminar este tomo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Panel interactivo para elegir cualquier página del documento subido como Portada */}
                      {isPickingCoverPage && (
                        <div className="pt-3 border-t border-zinc-800 bg-violet-950/20 p-3.5 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
                          <div className="w-24 h-36 rounded-xl bg-zinc-900 border border-violet-500/40 overflow-hidden shrink-0 flex items-center justify-center shadow-lg">
                            {pickerLoading ? (
                              <span className="text-[11px] text-violet-300 animate-pulse text-center px-2">
                                Extrayendo pág. {pickerPageNumber}...
                              </span>
                            ) : pickerPreviewDataUrl ? (
                              <img
                                src={pickerPreviewDataUrl}
                                alt={`Página ${pickerPageNumber}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[10px] text-zinc-500 text-center px-2">
                                Sin vista previa
                              </span>
                            )}
                          </div>

                          <div className="flex-1 space-y-3 w-full">
                            <div className="flex items-center justify-between">
                              <div>
                                <h5 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                                  <Sparkles className="w-4 h-4 text-violet-400" />
                                  <span>
                                    Elegir página de este documento como Portada
                                  </span>
                                </h5>
                                <p className="text-[11px] text-zinc-400">
                                  Escribe el número de página (ej. 3) o usa las
                                  flechas para ver la página y guardarla como
                                  portada.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPickingCoverVolId(null)}
                                className="p-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-zinc-300">
                                Página:
                              </span>
                              <button
                                type="button"
                                disabled={pickerLoading || pickerPageNumber <= 1}
                                onClick={() =>
                                  handleLoadPageFromUploadedVolume(
                                    vol,
                                    pickerPageNumber - 1
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-xs text-white font-bold"
                              >
                                ◀ Anterior
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={pickerTotalPages}
                                value={pickerPageNumber}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 1;
                                  setPickerPageNumber(val);
                                  handleLoadPageFromUploadedVolume(vol, val);
                                }}
                                className="w-16 bg-zinc-900 border border-violet-500/60 rounded-lg px-2.5 py-1 text-xs text-center text-white font-bold"
                              />
                              <button
                                type="button"
                                disabled={
                                  pickerLoading ||
                                  pickerPageNumber >= pickerTotalPages
                                }
                                onClick={() =>
                                  handleLoadPageFromUploadedVolume(
                                    vol,
                                    pickerPageNumber + 1
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-xs text-white font-bold"
                              >
                                Siguiente ▶
                              </button>
                              <span className="text-xs text-zinc-400">
                                de {pickerTotalPages} págs.
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={
                                  pickerLoading ||
                                  !pickerPreviewDataUrl ||
                                  pickerSavingTarget !== null
                                }
                                onClick={() =>
                                  handleApplyPickedPageCover(vol, "volume")
                                }
                                className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold transition shadow"
                              >
                                {pickerSavingTarget === "volume"
                                  ? "Guardando..."
                                  : `Usar como Portada de Tomo ${vol.volumeNumber}`}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  pickerLoading ||
                                  !pickerPreviewDataUrl ||
                                  pickerSavingTarget !== null
                                }
                                onClick={() =>
                                  handleApplyPickedPageCover(vol, "work")
                                }
                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 text-xs font-bold transition shadow"
                              >
                                {pickerSavingTarget === "work"
                                  ? "Guardando..."
                                  : "Usar como Portada del Manga Principal"}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  pickerLoading ||
                                  !pickerPreviewDataUrl ||
                                  pickerSavingTarget !== null
                                }
                                onClick={() =>
                                  handleApplyPickedPageCover(vol, "both")
                                }
                                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40 text-zinc-200 text-xs font-semibold transition"
                              >
                                {pickerSavingTarget === "both"
                                  ? "Guardando..."
                                  : "Usar en Ambos"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Inline Google Drive Link Input for this Volume */}
                      {isLinkingDrive && (
                        <div className="pt-2.5 border-t border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-sky-950/20 p-2.5 rounded-xl">
                          <span className="text-xs font-semibold text-sky-300 flex items-center gap-1 shrink-0">
                            <Cloud className="w-3.5 h-3.5" />
                            Enlace de Google Drive:
                          </span>
                          <input
                            type="text"
                            value={existingVolDriveUrl}
                            onChange={(e) =>
                              setExistingVolDriveUrl(e.target.value)
                            }
                            placeholder="Pega aquí el enlace compartido de Google Drive (Cualquier persona con el enlace)..."
                            className="flex-1 bg-zinc-900 border border-sky-500/40 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400"
                          />
                          <select
                            value={existingVolDriveExt}
                            onChange={(e) =>
                              setExistingVolDriveExt(e.target.value)
                            }
                            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
                          >
                            <option value=".pdf">PDF</option>
                            <option value=".cbz">CBZ/ZIP</option>
                            <option value=".epub">EPUB</option>
                            <option value=".txt">TXT</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleSaveVolumeDriveLink(vol.id)}
                            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-xs shrink-0"
                          >
                            Vincular Drive
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            )}
          </div>
          )}

          {/* Calificaciones (Historia, Arte, Personajes) y Comentarios de la Comunidad */}
          {activeTab === "details" && (
            <WorkCommunitySection
              work={work}
              user={user}
              isAdmin={isAdmin}
              onToggleFavorite={handleToggleFavorite}
              onRequestLogin={() => {
                if (onRequestLogin) onRequestLogin();
              }}
              onRatingUpdated={(newScore) => {
                onWorkUpdated({
                  ...work,
                  rating: newScore,
                });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
