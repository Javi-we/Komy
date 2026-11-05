import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "komy-files";

export async function ensureUploadDirs() {
  // En entornos Cloudflare Pages / Edge el almacenamiento es 100% en la nube (Supabase Storage).
}

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function getContentTypeForFile(fileName: string, fallbackType?: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".epub")) return "application/epub+zip";
  if (lower.endsWith(".cbz") || lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallbackType || "application/octet-stream";
}

async function detectPageCount(buffer: Uint8Array, fileName: string): Promise<number | undefined> {
  const lower = fileName.toLowerCase();
  try {
    if (lower.endsWith(".pdf")) {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      return pdfDoc.getPageCount();
    }
    if (lower.endsWith(".cbz") || lower.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(buffer);
      const imageEntries = Object.keys(zip.files).filter(
        (k) =>
          !zip.files[k].dir &&
          !k.includes("__MACOSX") &&
          /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(k)
      );
      return Math.max(1, imageEntries.length);
    }
    if (lower.endsWith(".epub")) {
      const zip = await JSZip.loadAsync(buffer);
      const htmlEntries = Object.keys(zip.files).filter(
        (k) =>
          !zip.files[k].dir &&
          /\.(xhtml|html|htm)$/i.test(k) &&
          !k.toLowerCase().includes("toc") &&
          !k.toLowerCase().includes("nav")
      );
      return Math.max(1, htmlEntries.length);
    }
    if (lower.endsWith(".txt") || lower.endsWith(".md")) {
      const text = new TextDecoder().decode(buffer);
      return Math.max(1, Math.ceil(text.length / 2600));
    }
    if (/\.(jpe?g|png|webp|gif|svg)$/i.test(lower)) {
      return 1;
    }
  } catch (err) {
    console.warn("No se pudo detectar el conteo de páginas:", err);
  }
  return undefined;
}

async function uploadBufferToSupabase(
  buffer: Uint8Array,
  objectPath: string,
  contentType: string
): Promise<string> {
  const cleanBase = SUPABASE_URL.replace(/\/+$/, "");
  const uploadUrl = `${cleanBase}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`;

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: new Blob([buffer as any], { type: contentType }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error subiendo a Supabase Storage: ${errText}`);
  }

  return `${cleanBase}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;
}

export async function saveUploadedFile(
  file: File,
  folder: "pdfs" | "covers"
): Promise<{
  url: string;
  fileName: string;
  fileSize: number;
  totalPages?: number;
}> {
  const bytes = await file.arrayBuffer();
  const buffer = new Uint8Array(bytes);
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const safeName = sanitizeFileName(file.name || "file");
  const finalName = `${timestamp}-${randomSuffix}-${safeName}`;

  const totalPages =
    folder === "pdfs" ? await detectPageCount(buffer, file.name) : undefined;

  if (SUPABASE_URL && SUPABASE_KEY) {
    const contentType = getContentTypeForFile(file.name, file.type);
    const cloudUrl = await uploadBufferToSupabase(
      buffer,
      `${folder}/${finalName}`,
      contentType
    );
    return {
      url: cloudUrl,
      fileName: file.name,
      fileSize: buffer.length,
      totalPages,
    };
  }

  return {
    url: `/uploads/${folder}/${finalName}`,
    fileName: file.name,
    fileSize: buffer.length,
    totalPages,
  };
}

export async function saveBase64Cover(
  dataUrl: string,
  prefix = "cover"
): Promise<string> {
  const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Formato de imagen base64 inválido");
  }
  const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
  const contentType = `image/${matches[1]}`;
  const base64Data = matches[2];

  const binaryString = atob(base64Data);
  const buffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    buffer[i] = binaryString.charCodeAt(i);
  }

  const finalName = `${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 7)}-${prefix}.${ext}`;

  if (SUPABASE_URL && SUPABASE_KEY) {
    return await uploadBufferToSupabase(
      buffer,
      `covers/${finalName}`,
      contentType
    );
  }

  return `/uploads/covers/${finalName}`;
}

export async function deleteUploadedFile(url?: string | null) {
  if (!url) return;
  // En Cloudflare Pages / Supabase, el borrado se gestiona vía API de Supabase Storage.
}
