import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

const UPLOAD_BASE_DIR = path.join(process.cwd(), "public", "uploads");
const PDF_DIR = path.join(UPLOAD_BASE_DIR, "pdfs");
const COVER_DIR = path.join(UPLOAD_BASE_DIR, "covers");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "komy-files";

export async function ensureUploadDirs() {
  try {
    await fs.mkdir(PDF_DIR, { recursive: true });
    await fs.mkdir(COVER_DIR, { recursive: true });
  } catch {
    // En entornos serverless se ignora
  }
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

async function detectPageCount(buffer: Buffer, fileName: string): Promise<number | undefined> {
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
      const text = buffer.toString("utf-8");
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
  buffer: Buffer,
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
    body: new Uint8Array(buffer),
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
  const buffer = Buffer.from(bytes);
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const safeName = sanitizeFileName(file.name || "file");
  const finalName = `${timestamp}-${randomSuffix}-${safeName}`;

  const totalPages =
    folder === "pdfs" ? await detectPageCount(buffer, file.name) : undefined;

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
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
    } catch (cloudErr: any) {
      console.warn(
        "Archivo grande o límite de Supabase Storage alcanzado, guardando localmente:",
        cloudErr?.message
      );
    }
  }

  await ensureUploadDirs();
  const targetDir = folder === "pdfs" ? PDF_DIR : COVER_DIR;
  const filePath = path.join(targetDir, finalName);
  await fs.writeFile(filePath, buffer);

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
  const buffer = Buffer.from(base64Data, "base64");
  const finalName = `${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 7)}-${prefix}.${ext}`;

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      return await uploadBufferToSupabase(
        buffer,
        `covers/${finalName}`,
        contentType
      );
    } catch {
      // Fallback local
    }
  }

  await ensureUploadDirs();
  const filePath = path.join(COVER_DIR, finalName);
  await fs.writeFile(filePath, buffer);
  return `/uploads/covers/${finalName}`;
}

export async function deleteUploadedFile(url?: string | null) {
  if (!url) return;
  if (url.startsWith("/uploads/")) {
    try {
      const filePath = path.join(process.cwd(), "public", url);
      await fs.unlink(filePath);
    } catch {
      // Ignore
    }
  }
}
