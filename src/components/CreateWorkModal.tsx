"use client";

import React, { useState, useRef } from "react";
import {
  X,
  Upload,
  BookOpen,
  Image as ImageIcon,
  Sparkles,
  Check,
  Plus,
  Trash2,
  Cloud,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { ReadingMode, WorkItem, WorkStatus, WorkType } from "@/types/library";
import { extractCoverFromPdfFile } from "@/lib/pdf-client";
import { buildKomyDriveStreamUrl } from "@/lib/drive";
import {
  uploadFileDirectToCloud,
  uploadBase64CoverDirectToCloud,
} from "@/lib/supabase-upload-client";
import { isWorkSensitive } from "@/lib/sensitive";

interface CreateWorkModalProps {
  existingGenres?: string[];
  initialType?: WorkType | null;
  lockType?: boolean;
  onClose: () => void;
  onWorkCreated: (newWork: WorkItem) => void;
}

interface DraftVolumeRow {
  id: string;
  volumeNumber: number;
  title: string;
  sourceMode: "FILE" | "DRIVE";
  file: File | null;
  driveBlob?: Blob | null;
  driveExtracting?: boolean;
  driveLink: string;
  driveExt: string;
  coverFile: File | null;
  autoCoverDataUrl: string | null;
  coverPageNumber: number;
  detectedPages: number;
}

const GENRES_BY_TYPE: Record<WorkType, string[]> = {
  MANGA: [
    "+18",
    "Adulto",
    "Seinen",
    "Shonen",
    "Horror",
    "Psicológico",
    "Drama",
    "Sobrenatural",
    "Tragedia",
    "Misterio",
    "Gore",
    "Suspenso",
    "Acción",
    "Fantasía",
    "Romance",
    "Comedia",
    "Aventura",
    "Ecchi",
    "Slice of Life",
  ],
  BOOK: [
    "Novela",
    "Fantasía",
    "Ciencia Ficción",
    "Thriller",
    "Misterio",
    "Terror",
    "Romance",
    "Historia",
    "Filosofía",
    "Psicología",
    "Desarrollo Personal",
    "Biografía",
    "Clásico",
    "Drama",
  ],
  LIGHT_NOVEL: [
    "Isekai",
    "Fantasía",
    "Romance",
    "Aventura",
    "Escolar",
    "Acción",
    "Misterio",
    "Ciencia Ficción",
    "Drama",
    "Comedia",
    "Sobrenatural",
    "Psicológico",
  ],
  COMIC: [
    "Acción",
    "Superhéroes",
    "Webtoon",
    "Fantasía",
    "Ciencia Ficción",
    "Horror",
    "Noir",
    "Aventura",
    "Drama",
    "Thriller",
    "Comedia",
    "Misterio",
  ],
};

function getTypeMeta(type: WorkType) {
  if (type === "BOOK") {
    return {
      modalTitle: "Añadir Nuevo Libro / Saga",
      step1Header: "1. DATOS PRINCIPALES DEL LIBRO O SAGA",
      titleLabel: "Título del Libro o Saga *",
      titlePlaceholder:
        "Ej. Hábitos Atómicos, Harry Potter, El Señor de los Anillos...",
      authorLabel: "Autor / Escritor",
      authorPlaceholder: "Nombre del escritor o autor",
      tagsPlaceholder: "Novela, Fantasía, Thriller, Filosofía...",
      step2Header:
        "2. ARCHIVO DEL LIBRO (O LIBROS DE LA SAGA)",
      step2Desc:
        "Sube el archivo de tu libro (PDF, EPUB, etc.) o pega el enlace de Google Drive. Si es una saga de varios libros, puedes pulsar el botón para añadir más libros.",
      unitSingular: "Libro",
      singleUnitName: "Libro Completo",
      unitPlural: "Libros",
      addBtnLabel: (nextNum: number) =>
        `+ ¿Es una saga de varios libros? Añadir Libro ${nextNum}`,
      submitSingleLabel: "Subir y Guardar Libro",
    };
  }
  if (type === "LIGHT_NOVEL") {
    return {
      modalTitle: "Añadir Nueva Novela Ligera",
      step1Header: "1. DATOS PRINCIPALES DE LA NOVELA LIGERA",
      titleLabel: "Título de la Novela Ligera *",
      titlePlaceholder: "Ej. Overlord, Classroom of the Elite, Re:Zero...",
      authorLabel: "Autor / Ilustrador",
      authorPlaceholder: "Nombre del autor o ilustrador",
      tagsPlaceholder: "Isekai, Fantasía, Romance, Aventura...",
      step2Header: "2. ARCHIVO DE LA NOVELA (O MÚLTIPLES VOLÚMENES)",
      step2Desc:
        "Sube el archivo de la novela ligera. Si cuenta con más volúmenes, puedes pulsar el botón de abajo para agregarlos.",
      unitSingular: "Volumen",
      singleUnitName: "Volumen Único",
      unitPlural: "Volúmenes",
      addBtnLabel: (nextNum: number) =>
        `+ ¿Cuenta con más volúmenes? Añadir Volumen ${nextNum}`,
      submitSingleLabel: "Subir y Guardar Novela Ligera",
    };
  }
  if (type === "COMIC") {
    return {
      modalTitle: "Añadir Nuevo Cómic / Webtoon",
      step1Header: "1. DATOS PRINCIPALES DEL CÓMIC / WEBTOON",
      titleLabel: "Título del Cómic o Serie Webtoon *",
      titlePlaceholder: "Ej. Solo Leveling, Invincible, Spider-Man...",
      authorLabel: "Guionista / Artista",
      authorPlaceholder: "Nombre del guionista o artista",
      tagsPlaceholder: "Acción, Superhéroes, Webtoon, Fantasía...",
      step2Header: "2. ARCHIVO DEL CÓMIC / WEBTOON",
      step2Desc:
        "Sube el archivo del cómic o número principal. Si tiene más números o episodios, usa el botón de abajo para añadirlos.",
      unitSingular: "Número",
      singleUnitName: "Número Único",
      unitPlural: "Números",
      addBtnLabel: (nextNum: number) =>
        `+ ¿Tiene más números o episodios? Añadir Número ${nextNum}`,
      submitSingleLabel: "Subir y Guardar Cómic",
    };
  }
  return {
    modalTitle: "Añadir Nuevo Manga",
    step1Header: "1. DATOS PRINCIPALES DEL MANGA (EJ. SIGNAL 100)",
    titleLabel: "Nombre del Manga Principal *",
    titlePlaceholder: "Ej. Signal 100, Rastros de Sangre, Berserk...",
    authorLabel: "Mangaka / Autor",
    authorPlaceholder: "Nombre del mangaka",
    tagsPlaceholder: "Seinen, Horror, Psicológico, Drama...",
    step2Header: "2. ARCHIVO DEL MANGA (O MÚLTIPLES TOMOS)",
    step2Desc:
      "Sube el archivo principal de tu manga (tomo único). Si es una serie con más tomos, pulsa el botón de abajo para agregar los siguientes tomos.",
    unitSingular: "Tomo",
    singleUnitName: "Tomo Único",
    unitPlural: "Tomos",
    addBtnLabel: (nextNum: number) =>
      `+ ¿Esta obra tiene más tomos? Añadir Tomo ${nextNum}`,
    submitSingleLabel: "Subir y Guardar Manga",
  };
}

export default function CreateWorkModal({
  existingGenres = [],
  initialType = null,
  lockType = false,
  onClose,
  onWorkCreated,
}: CreateWorkModalProps) {
  const effectiveInitialType = initialType || "MANGA";
  const initialMeta = getTypeMeta(effectiveInitialType);

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [author, setAuthor] = useState("");
  const [releaseYear, setReleaseYear] = useState<string>("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<WorkType>(effectiveInitialType);
  const [status, setStatus] = useState<WorkStatus>("READING");
  const [readingMode, setReadingMode] = useState<ReadingMode>(
    effectiveInitialType === "MANGA"
      ? "MANGA_RTL"
      : "BOOK_LTR"
  );
  const [language, setLanguage] = useState<string>("ES");
  const [tags, setTags] = useState("");

  const meta = getTypeMeta(type);

  const allGenreOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const g of GENRES_BY_TYPE[type] || GENRES_BY_TYPE.MANGA) {
      map.set(g.toLowerCase(), g);
    }
    for (const g of existingGenres) {
      const clean = g.replace(/\.+$/, "").trim();
      if (clean && !map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), clean);
      }
    }
    for (const typed of tags.split(",")) {
      const clean = typed.replace(/\.+$/, "").trim();
      if (clean && !map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), clean);
      }
    }
    return Array.from(map.values());
  }, [existingGenres, tags, type]);

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

  // Portada principal de la Obra / Serie
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [autoCoverPreview, setAutoCoverPreview] = useState<string | null>(null);

  // Lista de Tomos / Libros de Saga / Volúmenes debajo de la obra principal
  const [draftVolumes, setDraftVolumes] = useState<DraftVolumeRow[]>([
    {
      id: "draft-vol-1",
      volumeNumber: 1,
      title: "",
      sourceMode: "FILE",
      file: null,
      driveBlob: null,
      driveExtracting: false,
      driveLink: "",
      driveExt: ".pdf",
      coverFile: null,
      autoCoverDataUrl: null,
      coverPageNumber: 1,
      detectedPages: 1,
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState<string>("");

  // Estados para Arrastrar y Soltar (Drag & Drop)
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const globalFileInputRef = useRef<HTMLInputElement>(null);

  const handleTypeChange = (newType: WorkType) => {
    const newMeta = getTypeMeta(newType);
    setType(newType);
    if (newType === "MANGA") {
      setReadingMode("MANGA_RTL");
    } else if (newType === "BOOK" || newType === "LIGHT_NOVEL") {
      setReadingMode("BOOK_LTR");
    } else if (newType === "COMIC") {
      setReadingMode("BOOK_LTR");
    }

    // Actualizar nombres por defecto de filas que aún no fueron editadas manualmente
    setDraftVolumes((prev) =>
      prev.map((v) => {
        const isDefaultTitle =
          /^(Tomo|Libro|Volumen|Número)\s+\d+(\.\d+)?$/i.test(v.title.trim());
        return isDefaultTitle
          ? { ...v, title: `${newMeta.unitSingular} ${v.volumeNumber}` }
          : v;
      })
    );
  };

  // Añadir una nueva fila (Tomo 2 / Libro de Saga 2 / Volumen 2 / Número 2)
  const handleAddDraftVolumeRow = () => {
    const nextNum =
      draftVolumes.length > 0
        ? Math.max(...draftVolumes.map((v) => v.volumeNumber)) + 1
        : 1;
    setDraftVolumes((prev) => {
      const updated = prev.map((v, idx) =>
        idx === 0 && !v.title.trim()
          ? { ...v, title: `${meta.unitSingular} 1` }
          : v
      );
      return [
        ...updated,
        {
          id: `draft-vol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          volumeNumber: nextNum,
          title: `${meta.unitSingular} ${nextNum}`,
          sourceMode: "FILE",
          file: null,
          driveBlob: null,
          driveExtracting: false,
          driveLink: "",
          driveExt: ".pdf",
          coverFile: null,
          autoCoverDataUrl: null,
          coverPageNumber: 1,
          detectedPages: 1,
        },
      ];
    });
  };

  const handleRemoveDraftVolumeRow = (rowId: string) => {
    setDraftVolumes((prev) => prev.filter((v) => v.id !== rowId));
  };

  const updateDraftVolume = (
    rowId: string,
    patch: Partial<DraftVolumeRow>
  ) => {
    setDraftVolumes((prev) =>
      prev.map((v) => (v.id === rowId ? { ...v, ...patch } : v))
    );
  };

  // Cambiar qué página del documento (Archivo o Google Drive) usar como portada
  const handleDraftCoverPageChange = async (
    vol: DraftVolumeRow,
    newPage: number,
    alsoSetMainCover = false
  ) => {
    const sourceBlob = vol.file || vol.driveBlob;
    if (!sourceBlob) return;
    const clamped = Math.min(Math.max(1, newPage), vol.detectedPages || 9999);
    updateDraftVolume(vol.id, { coverPageNumber: clamped });

    const fileNameHint = vol.file ? vol.file.name : `drive${vol.driveExt}`;
    const extracted = await extractCoverFromPdfFile(
      sourceBlob,
      clamped,
      fileNameHint
    );
    if (extracted) {
      updateDraftVolume(vol.id, {
        autoCoverDataUrl: extracted.dataUrl,
        coverFile: null,
        detectedPages: extracted.numPages,
      });
      if (alsoSetMainCover || (vol.volumeNumber === 1 && !coverFile)) {
        setAutoCoverPreview(extracted.dataUrl);
        setCoverFile(null);
      }
    }
  };

  // Extraer automáticamente la primera página (Pág. 1) apenas el usuario pegue el enlace de Google Drive
  const handleDriveLinkChange = async (
    vol: DraftVolumeRow,
    newLink: string,
    newExt?: string
  ) => {
    const extToUse = newExt ?? vol.driveExt;
    updateDraftVolume(vol.id, {
      driveLink: newLink,
      driveExt: extToUse,
    });

    const parsed = buildKomyDriveStreamUrl(newLink.trim(), extToUse);
    if (!parsed) return;

    updateDraftVolume(vol.id, { driveExtracting: true });
    try {
      const res = await fetch(parsed.streamUrl);
      if (!res.ok) return;
      const blob = await res.blob();
      const extracted = await extractCoverFromPdfFile(
        blob,
        1,
        parsed.virtualFileName
      );
      if (extracted) {
        updateDraftVolume(vol.id, {
          driveBlob: blob,
          autoCoverDataUrl: extracted.dataUrl,
          coverPageNumber: 1,
          detectedPages: extracted.numPages,
        });
        if (!coverFile && vol.volumeNumber === 1) {
          setAutoCoverPreview(extracted.dataUrl);
        }
      }
    } catch (err) {
      console.error("Error auto-extracting cover from Drive link:", err);
    } finally {
      updateDraftVolume(vol.id, { driveExtracting: false });
    }
  };

  // Seleccionar o arrastrar archivo desde PC
  const handleSingleVolumeFileSelect = async (
    rowId: string,
    volNum: number,
    file: File | null
  ) => {
    if (!file) return;

    const cleanName = file.name.replace(/\.[a-z0-9]+$/i, "");
    if (!title.trim()) {
      setTitle(cleanName.replace(/[-_]/g, " "));
    }

    updateDraftVolume(rowId, {
      file,
      title:
        type === "BOOK" && draftVolumes.length === 1
          ? cleanName
          : `${meta.unitSingular} ${volNum}: ${cleanName}`,
      coverPageNumber: 1,
    });

    const extracted = await extractCoverFromPdfFile(file, 1);
    if (extracted) {
      updateDraftVolume(rowId, {
        autoCoverDataUrl: extracted.dataUrl,
        detectedPages: extracted.numPages,
      });
      if (!autoCoverPreview && !coverFile && volNum === 1) {
        setAutoCoverPreview(extracted.dataUrl);
      }
    }
  };

  // Procesar lote de archivos (por selección o arrastre múltiple)
  const processBatchFiles = async (files: File[]) => {
    if (files.length === 0) return;

    if (!title.trim()) {
      const clean = files[0].name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[-_]/g, " ");
      setTitle(clean);
    }

    const newRows: DraftVolumeRow[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const vNum = i + 1;
      const extracted = await extractCoverFromPdfFile(f, 1);
      if (i === 0 && extracted && !autoCoverPreview && !coverFile) {
        setAutoCoverPreview(extracted.dataUrl);
      }
      newRows.push({
        id: `batch-vol-${i}-${Date.now()}`,
        volumeNumber: vNum,
        title:
          files.length === 1 && type === "BOOK"
            ? f.name.replace(/\.[a-z0-9]+$/i, "")
            : `${meta.unitSingular} ${vNum}: ${f.name.replace(/\.[a-z0-9]+$/i, "")}`,
        sourceMode: "FILE",
        file: f,
        driveBlob: null,
        driveExtracting: false,
        driveLink: "",
        driveExt: ".pdf",
        coverFile: null,
        autoCoverDataUrl: extracted?.dataUrl || null,
        coverPageNumber: 1,
        detectedPages: extracted?.numPages || 1,
      });
    }
    setDraftVolumes(newRows);
  };

  // Seleccionar varios archivos a la vez
  const handleBatchFilesSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    processBatchFiles(files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setUploadStatusText("Subiendo portada principal...");

    try {
      let mainCoverUrl: string | null = null;

      // 1. Subir portada principal de la Obra (si se eligió o extrajo)
      if (coverFile) {
        const uploadedCov = await uploadFileDirectToCloud(coverFile, "covers");
        mainCoverUrl = uploadedCov.url;
      } else if (autoCoverPreview) {
        mainCoverUrl = await uploadBase64CoverDirectToCloud(
          autoCoverPreview,
          "work-cover"
        );
      }

      setUploadStatusText(`Creando "${title}" en tu biblioteca...`);

      // 2. Crear la Obra Principal
      const workRes = await fetch("/api/works", {
        method: "POST",
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
          coverUrl: mainCoverUrl,
          tags:
            language === "EN" &&
            !tags.toLowerCase().includes("inglés") &&
            !tags.toLowerCase().includes("ingles")
              ? (tags ? `${tags}, Inglés` : "Inglés")
              : tags,
        }),
      });

      if (!workRes.ok) {
        setSubmitting(false);
        setUploadStatusText("");
        return;
      }

      const createdWork: WorkItem = await workRes.json();
      const createdVolumes = [];

      // 3. Procesar cada Tomo / Libro de Saga que tenga un archivo o un link de Google Drive
      const validDrafts = draftVolumes.filter(
        (d) =>
          (d.sourceMode === "FILE" && d.file) ||
          (d.sourceMode === "DRIVE" && d.driveLink.trim() !== "")
      );

      for (let i = 0; i < validDrafts.length; i++) {
        const draft = validDrafts[i];
        let fileUrl: string | null = null;
        let fileName: string | null = null;
        let fileSize = 0;
        let totalPages = draft.detectedPages || 1;
        let volCoverUrl: string | null = null;

        if (draft.sourceMode === "DRIVE" && draft.driveLink.trim()) {
          setUploadStatusText(
            `Vinculando ${meta.unitSingular} ${draft.volumeNumber} con Google Drive...`
          );
          const parsed = buildKomyDriveStreamUrl(
            draft.driveLink,
            draft.driveExt
          );
          if (parsed) {
            fileUrl = parsed.streamUrl;
            fileName = parsed.virtualFileName;

            // Si aún no se había extraído la primera página del link de Drive, extraerla ahora mismo automáticamente
            if (!draft.autoCoverDataUrl && !draft.coverFile) {
              try {
                setUploadStatusText(
                  `Extrayendo primera página de portada desde Google Drive...`
                );
                const dRes = await fetch(parsed.streamUrl);
                if (dRes.ok) {
                  const dBlob = await dRes.blob();
                  const extCov = await extractCoverFromPdfFile(
                    dBlob,
                    draft.coverPageNumber || 1,
                    parsed.virtualFileName
                  );
                  if (extCov) {
                    draft.autoCoverDataUrl = extCov.dataUrl;
                    totalPages = extCov.numPages || totalPages;
                  }
                }
              } catch {
                // Continuar si el archivo de Drive no pudo pre-renderizarse
              }
            }
          }
        } else if (draft.sourceMode === "FILE" && draft.file) {
          setUploadStatusText(
            `Subiendo ${meta.unitSingular} ${draft.volumeNumber} (${draft.file.name})...`
          );
          const pdfData = await uploadFileDirectToCloud(
            draft.file,
            "pdfs",
            (msg) =>
              setUploadStatusText(
                `${meta.unitSingular} ${draft.volumeNumber} (${i + 1}/${validDrafts.length}): ${msg}`
              )
          );
          fileUrl = pdfData.url;
          fileName = pdfData.fileName;
          fileSize = pdfData.fileSize;
        }

        // Portada del Tomo / Libro
        if (draft.coverFile) {
          const covData = await uploadFileDirectToCloud(
            draft.coverFile,
            "covers"
          );
          volCoverUrl = covData.url;
        } else if (draft.autoCoverDataUrl) {
          volCoverUrl = await uploadBase64CoverDirectToCloud(
            draft.autoCoverDataUrl,
            `tomo-${draft.volumeNumber}`
          );
        } else if (i === 0 && mainCoverUrl) {
          volCoverUrl = mainCoverUrl;
        }

        // Si la obra principal no tenía portada pero el primer libro/tomo sí, ponerla automáticamente
        if (!mainCoverUrl && volCoverUrl) {
          mainCoverUrl = volCoverUrl;
          await fetch(`/api/works/${createdWork.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coverUrl: mainCoverUrl }),
          });
        }

        const isSingleVolume = validDrafts.length === 1;
        const defaultTitle = isSingleVolume
          ? (title.trim() || meta.singleUnitName || "Obra Completa")
          : `${meta.unitSingular} ${draft.volumeNumber}`;
        const finalTitle =
          draft.title &&
          !/^(Tomo|Libro|Volumen|Número)\s+1$/i.test(draft.title.trim())
            ? draft.title
            : defaultTitle;

        const volRes = await fetch(`/api/works/${createdWork.id}/volumes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            volumeNumber: draft.volumeNumber,
            title: finalTitle,
            coverUrl: volCoverUrl,
            fileUrl,
            fileName,
            fileSize,
            totalPages,
          }),
        });

        if (volRes.ok) {
          const v = await volRes.json();
          createdVolumes.push(v);
        }
      }

      onWorkCreated({
        ...createdWork,
        coverUrl: mainCoverUrl || createdWork.coverUrl,
        volumes: createdVolumes,
      });
      onClose();
    } catch (err) {
      console.error("Error creating work:", err);
    } finally {
      setSubmitting(false);
      setUploadStatusText("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-3xl w-full max-h-[94vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-bold text-white">{meta.modalTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6"
        >
          {/* PASO 1: Datos según el tipo de obra */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold text-violet-300 uppercase tracking-wider">
                {meta.step1Header}
              </label>
              {lockType && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/30">
                  {type === "BOOK"
                    ? "📖 Formato: Libro"
                    : type === "MANGA"
                    ? "📚 Formato: Manga"
                    : type === "LIGHT_NOVEL"
                    ? "📑 Formato: Novela Ligera"
                    : "🎨 Formato: Cómic"}
                </span>
              )}
            </div>

            {!lockType && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "MANGA", label: "Manga", sub: "Por Tomos (D ← I)" },
                  { id: "BOOK", label: "Libro", sub: "Libro / Saga (I → D)" },
                  {
                    id: "LIGHT_NOVEL",
                    label: "Novela Ligera",
                    sub: "Por Volúmenes (I → D)",
                  },
                  {
                    id: "COMIC",
                    label: "Cómic / Webtoon",
                    sub: "Por Números / Cascada",
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTypeChange(item.id as WorkType)}
                    className={`p-3 rounded-2xl border text-left transition ${
                      type === item.id
                        ? "bg-violet-600/20 border-violet-500 text-white"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="font-semibold text-sm">{item.label}</div>
                    <div className="text-[11px] opacity-75">{item.sub}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-5">
              {/* Cover Preview */}
              <div className="w-28 sm:w-32 shrink-0 flex flex-col items-center gap-2 mx-auto sm:mx-0">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingCover(true);
                  }}
                  onDragLeave={() => setIsDraggingCover(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingCover(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f && f.type.startsWith("image/")) {
                      setCoverFile(f);
                    }
                  }}
                  className={`w-28 h-40 sm:w-32 sm:h-44 rounded-2xl bg-zinc-950 border-2 border-dashed overflow-hidden flex items-center justify-center relative group transition ${
                    isDraggingCover
                      ? "border-violet-500 bg-violet-600/20 scale-105 shadow-lg shadow-violet-900/30"
                      : "border-zinc-700"
                  }`}
                >
                  {coverFile ? (
                    <img
                      src={URL.createObjectURL(coverFile)}
                      alt="Portada"
                      className="w-full h-full object-cover"
                    />
                  ) : autoCoverPreview ? (
                    <img
                      src={autoCoverPreview}
                      alt="Portada extraída"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-3 text-zinc-600">
                      <BookOpen className="w-7 h-7 mx-auto mb-1" />
                      <span className="text-[10px] block">
                        {isDraggingCover
                          ? "¡Suelta la imagen aquí!"
                          : "Portada Automática (o arrastra imagen)"}
                      </span>
                    </div>
                  )}
                </div>

                <label className="w-full py-1.5 px-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[11px] font-semibold text-center cursor-pointer flex flex-col items-center justify-center gap-0.5">
                  <div className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                    <span>Subir Portada</span>
                  </div>
                  <span className="text-[9px] text-zinc-400">PNG, JPG, WebP, GIF</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif,image/bmp,image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
                    onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Text Inputs */}
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    {meta.titleLabel}
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={meta.titlePlaceholder}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      {meta.authorLabel}
                    </label>
                    <input
                      type="text"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder={meta.authorPlaceholder}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
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
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Idioma
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="ES">🇪🇸 Español (Default)</option>
                      <option value="EN">🇬🇧 Inglés (English)</option>
                      <option value="JP">🇯🇵 Japonés (日本語)</option>
                      <option value="OTHER">🌐 Otro idioma</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Modo de Lectura
                    </label>
                    <select
                      value={readingMode}
                      onChange={(e) =>
                        setReadingMode(e.target.value as ReadingMode)
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="MANGA_RTL">
                        Manga (Derecha ← Izquierda)
                      </option>
                      <option value="BOOK_LTR">
                        Libro (Izquierda → Derecha)
                      </option>
                      <option value="WEBTOON_VERTICAL">
                        Cascada / Webtoon (Vertical)
                      </option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Géneros / Etiquetas (separados por coma)
                    </label>
                    <input
                      type="text"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder={meta.tagsPlaceholder}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Sinopsis (Opcional)
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Breve resumen de la historia..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                {/* Selector rápido de Géneros adaptado a Manga / Libro / Novela / Cómic */}
                <div>
                  <span className="block text-[11px] text-zinc-400 mb-1.5">
                    Toque rápido para añadir/quitar géneros (cualquier etiqueta
                    nueva creará su propio botón de filtro automáticamente):
                  </span>
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
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                            active
                              ? "bg-violet-600/30 border-violet-500 text-violet-200"
                              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                          }`}
                        >
                          {active ? `✓ ${g}` : `+ ${g}`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Botón y Control de Ocultar Obra (+18 / Sensible) */}
                <div
                  className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                    isWorkSensitive({ tags })
                      ? "bg-rose-950/25 border-rose-500/60 shadow-lg shadow-rose-950/20"
                      : "bg-zinc-900/60 border-zinc-800"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-xs ${
                        isWorkSensitive({ tags })
                          ? "bg-rose-600 text-white shadow-lg shadow-rose-950/50"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {isWorkSensitive({ tags }) ? "🔞" : "👁️"}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Ocultar esta Obra del catálogo público</span>
                        {isWorkSensitive({ tags }) && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-600/30 text-rose-300 border border-rose-500/40 text-[9px] font-black uppercase">
                            Oculta
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                        Solo tú o lectores que activen el botón de contenido adulto (+18) con confirmación podrán verla.
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
                        ? "bg-rose-600 border-rose-500 text-white shadow-rose-950/40"
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
            </div>
          </div>

          {/* PASO 2: Archivos (Tomos / Libro o Saga / Volúmenes / Números) */}
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-extrabold text-violet-300 uppercase tracking-wider">
                  {meta.step2Header}
                </label>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {meta.step2Desc}
                </p>
              </div>

              <label className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-emerald-300 text-xs font-semibold cursor-pointer flex items-center gap-1.5 shrink-0 self-start">
                <Upload className="w-3.5 h-3.5" />
                <span>Seleccionar varios archivos a la vez</span>
                <input
                  type="file"
                  accept=".pdf,.cbz,.zip,.epub,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,application/epub+zip,text/plain,image/*"
                  multiple
                  onChange={handleBatchFilesSelect}
                  className="hidden"
                />
              </label>
            </div>

            {/* Zona Principal de Arrastrar y Soltar Archivo(s) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsGlobalDragging(true);
              }}
              onDragLeave={() => setIsGlobalDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsGlobalDragging(false);
                const files = Array.from(e.dataTransfer.files || []);
                if (files.length === 1) {
                  handleSingleVolumeFileSelect(
                    draftVolumes[0]?.id || "draft-vol-1",
                    1,
                    files[0]
                  );
                } else if (files.length > 1) {
                  processBatchFiles(files);
                }
              }}
              onClick={() => globalFileInputRef.current?.click()}
              className={`p-5 sm:p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center group ${
                isGlobalDragging
                  ? "border-violet-500 bg-violet-600/20 scale-[1.01] shadow-xl shadow-violet-950/40"
                  : "border-zinc-700 hover:border-violet-500 bg-zinc-950/80 hover:bg-zinc-900/60"
              }`}
            >
              <input
                ref={globalFileInputRef}
                type="file"
                accept=".pdf,.cbz,.zip,.epub,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,application/epub+zip,text/plain,image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 1) {
                    handleSingleVolumeFileSelect(
                      draftVolumes[0]?.id || "draft-vol-1",
                      1,
                      files[0]
                    );
                  } else if (files.length > 1) {
                    processBatchFiles(files);
                  }
                }}
                className="hidden"
              />

              <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/40 text-violet-400 flex items-center justify-center group-hover:scale-110 group-hover:bg-violet-600 group-hover:text-white transition shadow-sm">
                <Upload className="w-6 h-6" />
              </div>

              <div>
                <p className="text-sm font-extrabold text-white group-hover:text-violet-300 transition">
                  {isGlobalDragging
                    ? "¡Suelta tu archivo aquí!"
                    : "Arrastra y suelta tu archivo aquí para subir"}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  o haz clic para explorar en tus carpetas (PDF, EPUB, CBZ, ZIP, TXT)
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Arrastra 1 archivo individual o varios archivos a la vez para cargarlos automáticamente
                </p>
              </div>
            </div>

            {/* Lista de filas */}
            <div className="space-y-3">
              {draftVolumes.map((vol) => {
                const hasPageSelector =
                  (Boolean(vol.file) || Boolean(vol.driveBlob)) &&
                  vol.detectedPages > 1;

                return (
                  <div
                    key={vol.id}
                    className="p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <span className="px-2.5 py-1 rounded-lg bg-violet-600/20 border border-violet-500/40 text-violet-300 text-xs font-bold shrink-0">
                          {draftVolumes.length === 1
                            ? (meta.singleUnitName || "Archivo Principal")
                            : `${meta.unitSingular} ${vol.volumeNumber}`}
                        </span>
                        {draftVolumes.length > 1 && (
                          <input
                            type="number"
                            step="0.5"
                            value={vol.volumeNumber}
                            onChange={(e) =>
                              updateDraftVolume(vol.id, {
                                volumeNumber: Number(e.target.value),
                              })
                            }
                            className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white font-bold"
                          />
                        )}
                        <input
                          type="text"
                          value={vol.title}
                          onChange={(e) =>
                            updateDraftVolume(vol.id, { title: e.target.value })
                          }
                          placeholder={
                            draftVolumes.length === 1
                              ? (title.trim() || meta.singleUnitName || "Archivo Principal")
                              : `${meta.unitSingular} ${vol.volumeNumber}`
                          }
                          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1 text-xs text-white"
                        />
                      </div>

                      {/* Selector de modo: Subir Archivo vs Link de Google Drive */}
                      <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                        <button
                          type="button"
                          onClick={() =>
                            updateDraftVolume(vol.id, { sourceMode: "FILE" })
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition ${
                            vol.sourceMode === "FILE"
                              ? "bg-violet-600 text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          <FileText className="w-3 h-3" />
                          Subir Archivo
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraftVolume(vol.id, { sourceMode: "DRIVE" })
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition ${
                            vol.sourceMode === "DRIVE"
                              ? "bg-sky-600 text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          <Cloud className="w-3 h-3" />
                          Link de Google Drive
                        </button>
                      </div>

                      {draftVolumes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftVolumeRow(vol.id)}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-800"
                          title={`Quitar este ${meta.unitSingular.toLowerCase()}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Contenido según si eligió Archivo o Google Drive */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
                      {/* Miniatura de portada */}
                      <label
                        className="w-12 h-16 rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer relative group"
                        title="Portada automática (o clic para subir imagen)"
                      >
                        {vol.coverFile ? (
                          <img
                            src={URL.createObjectURL(vol.coverFile)}
                            alt="Portada"
                            className="w-full h-full object-cover"
                          />
                        ) : vol.autoCoverDataUrl ? (
                          <img
                            src={vol.autoCoverDataUrl}
                            alt="Auto portada"
                            className="w-full h-full object-cover"
                          />
                        ) : vol.driveExtracting ? (
                          <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-zinc-600" />
                        )}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif,image/bmp,image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
                          onChange={(e) =>
                            updateDraftVolume(vol.id, {
                              coverFile: e.target.files?.[0] || null,
                            })
                          }
                          className="hidden"
                        />
                      </label>

                      <div className="flex-1 w-full space-y-2">
                        {vol.sourceMode === "FILE" ? (
                          <div className="space-y-2">
                            {vol.file ? (
                              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-emerald-500/40 text-xs">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-bold text-white truncate">{vol.file.name}</p>
                                    <p className="text-[11px] text-emerald-400">
                                      ✓ {vol.detectedPages} páginas • Portada en Pág. {vol.coverPageNumber}
                                    </p>
                                  </div>
                                </div>
                                <label className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold shrink-0 transition cursor-pointer">
                                  Cambiar
                                  <input
                                    type="file"
                                    accept=".pdf,.cbz,.zip,.epub,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,application/epub+zip,text/plain,image/*"
                                    onChange={(e) =>
                                      handleSingleVolumeFileSelect(
                                        vol.id,
                                        vol.volumeNumber,
                                        e.target.files?.[0] || null
                                      )
                                    }
                                    className="hidden"
                                  />
                                </label>
                              </div>
                            ) : (
                              <div
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  setDraggingRowId(vol.id);
                                }}
                                onDragLeave={() => setDraggingRowId(null)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setDraggingRowId(null);
                                  const f = e.dataTransfer.files?.[0];
                                  if (f)
                                    handleSingleVolumeFileSelect(
                                      vol.id,
                                      vol.volumeNumber,
                                      f
                                    );
                                }}
                                className={`p-3 rounded-xl border-2 border-dashed transition text-center cursor-pointer ${
                                  draggingRowId === vol.id
                                    ? "border-violet-500 bg-violet-600/20 text-violet-300"
                                    : "border-zinc-700 hover:border-violet-500/70 bg-zinc-900/60 hover:bg-zinc-900 text-zinc-300"
                                }`}
                              >
                                <label className="cursor-pointer block w-full">
                                  <input
                                    type="file"
                                    accept=".pdf,.cbz,.zip,.epub,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,application/epub+zip,text/plain,image/*"
                                    onChange={(e) =>
                                      handleSingleVolumeFileSelect(
                                        vol.id,
                                        vol.volumeNumber,
                                        e.target.files?.[0] || null
                                      )
                                    }
                                    className="hidden"
                                  />
                                  <p className="text-xs font-semibold flex items-center justify-center gap-1.5">
                                    <Upload className="w-4 h-4 text-violet-400" />
                                    <span>
                                      {draggingRowId === vol.id
                                        ? "¡Suelta el archivo aquí!"
                                        : "Arrastra tu archivo aquí o haz clic para subir"}
                                    </span>
                                  </p>
                                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                                    PDF, EPUB, CBZ, ZIP, TXT
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={vol.driveLink}
                                onChange={(e) =>
                                  handleDriveLinkChange(vol, e.target.value)
                                }
                                placeholder="Pega aquí el enlace de Google Drive (https://drive.google.com/file/d/.../view)"
                                className="flex-1 bg-zinc-900 border border-sky-500/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                              />
                              <select
                                value={vol.driveExt}
                                onChange={(e) =>
                                  handleDriveLinkChange(
                                    vol,
                                    vol.driveLink,
                                    e.target.value
                                  )
                                }
                                className="bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-zinc-200"
                              >
                                <option value=".pdf">PDF</option>
                                <option value=".cbz">CBZ/ZIP</option>
                                <option value=".epub">EPUB</option>
                                <option value=".txt">TXT</option>
                              </select>
                            </div>
                            {vol.driveExtracting && (
                              <p className="text-[11px] text-sky-300 animate-pulse">
                                Extrayendo automáticamente la primera página como
                                portada desde Google Drive...
                              </p>
                            )}
                            {!vol.driveExtracting && vol.autoCoverDataUrl && (
                              <p className="text-[11px] text-emerald-400 font-medium">
                                ✓ Primera hoja puesta como portada
                                automáticamente ({vol.detectedPages} págs.)
                              </p>
                            )}
                          </>
                        )}

                        {/* Selector opcional de Página para Portada (Funciona tanto para Archivo de PC como para Link de Google Drive) */}
                        {hasPageSelector && (
                          <div className="flex flex-wrap items-center gap-1.5 bg-zinc-900 px-2.5 py-1.5 rounded-xl border border-zinc-800">
                            <span className="text-[11px] text-zinc-300 font-semibold">
                              Cambiar página de portada (opcional):
                            </span>
                            <button
                              type="button"
                              disabled={vol.coverPageNumber <= 1}
                              onClick={() =>
                                handleDraftCoverPageChange(
                                  vol,
                                  vol.coverPageNumber - 1
                                )
                              }
                              className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-xs text-white font-bold"
                            >
                              ◀
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={vol.detectedPages}
                              value={vol.coverPageNumber}
                              onChange={(e) =>
                                handleDraftCoverPageChange(
                                  vol,
                                  Number(e.target.value) || 1
                                )
                              }
                              className="w-14 bg-zinc-950 border border-violet-500/50 rounded-lg px-2 py-0.5 text-xs text-center text-white font-bold"
                            />
                            <button
                              type="button"
                              disabled={
                                vol.coverPageNumber >= vol.detectedPages
                              }
                              onClick={() =>
                                handleDraftCoverPageChange(
                                  vol,
                                  vol.coverPageNumber + 1
                                )
                              }
                              className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-xs text-white font-bold"
                            >
                              ▶
                            </button>
                            <span className="text-[10px] text-zinc-500">
                              / {vol.detectedPages}
                            </span>
                            {vol.autoCoverDataUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAutoCoverPreview(vol.autoCoverDataUrl);
                                  setCoverFile(null);
                                }}
                                className="ml-1 px-2 py-0.5 rounded-lg bg-violet-600/25 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/40 text-[10px] font-bold transition"
                              >
                                Usar en Portada Principal
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botón adaptado según el tipo: "+ Añadir Tomo" vs "+ Añadir Libro de Saga" vs "+ Añadir Volumen" */}
            <button
              type="button"
              onClick={handleAddDraftVolumeRow}
              className="w-full py-3 rounded-2xl bg-violet-600/15 hover:bg-violet-600/25 border border-dashed border-violet-500/50 text-violet-300 text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <Plus className="w-4 h-4" />
              <span>
                {meta.addBtnLabel(
                  draftVolumes.length > 0
                    ? Math.max(...draftVolumes.map((v) => v.volumeNumber)) + 1
                    : 1
                )}
              </span>
            </button>
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-violet-600/25"
            >
              {submitting ? (
                <span>{uploadStatusText || "Subiendo archivos..."}</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{meta.submitSingleLabel}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
