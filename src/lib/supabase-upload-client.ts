"use client";

/**
 * Subida directa desde el navegador hacia Supabase Cloud Storage con particionado
 * automático (Chunking de 38 MB) para evitar:
 * 1. El límite de 4.5 MB de funciones Serverless en Vercel.
 * 2. El límite de 50 MB por archivo individual del plan gratuito de Supabase.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ttwhrnodqfvndvqwrele.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_tIPu5Bzvp2g4HZLy_ea73A_kkobjdlU";
const BUCKET = "komy-files";

// Tamaño máximo por fragmento: 38 MB (por debajo del tope de 50 MB de Supabase Free)
const CHUNK_SIZE = 38 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadBlobToSupabasePath(
  objectPath: string,
  blob: Blob,
  contentType: string
): Promise<string> {
  const endpoint = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: blob,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Error al subir a Supabase (${res.status}): ${errText}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

export async function uploadFileDirectToCloud(
  file: File,
  folder: "pdfs" | "covers" = "pdfs",
  onProgress?: (statusText: string) => void
): Promise<{
  url: string;
  fileName: string;
  fileSize: number;
}> {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);
  const safeName = sanitizeFileName(file.name);

  // Si el archivo pesa 38 MB o menos, se sube en una sola pieza directo a Supabase
  if (file.size <= CHUNK_SIZE) {
    onProgress?.(`Subiendo ${file.name}...`);
    const objectPath = `${folder}/${timestamp}-${rand}-${safeName}`;
    const publicUrl = await uploadBlobToSupabasePath(
      objectPath,
      file,
      file.type || "application/octet-stream"
    );
    return {
      url: publicUrl,
      fileName: file.name,
      fileSize: file.size,
    };
  }

  // Si el archivo supera los 38 MB (ej. mangas de 70 MB, 120 MB), lo dividimos automáticamente en partes
  const totalParts = Math.ceil(file.size / CHUNK_SIZE);
  const partUrls: string[] = [];

  for (let i = 0; i < totalParts; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);

    onProgress?.(
      `Subiendo parte ${i + 1} de ${totalParts} (${Math.round(
        (end / file.size) * 100
      )}%)...`
    );

    const partPath = `${folder}/parts/${timestamp}-${rand}-part${i}-${safeName}.bin`;
    const partUrl = await uploadBlobToSupabasePath(
      partPath,
      chunkBlob,
      "application/octet-stream"
    );
    partUrls.push(partUrl);
  }

  // Subir manifiesto JSON ligero que une todas las partes de forma transparente al leer
  const manifestData = {
    komyMultipart: true,
    originalName: file.name,
    totalSize: file.size,
    mimeType: file.type || "application/pdf",
    parts: partUrls,
  };

  const manifestBlob = new Blob([JSON.stringify(manifestData)], {
    type: "application/json",
  });
  const manifestPath = `${folder}/${timestamp}-${rand}-${safeName}.komyparts.json`;
  const manifestUrl = await uploadBlobToSupabasePath(
    manifestPath,
    manifestBlob,
    "application/json"
  );

  return {
    url: manifestUrl,
    fileName: file.name,
    fileSize: file.size,
  };
}

export async function uploadBase64CoverDirectToCloud(
  base64DataUrl: string,
  prefix: string = "cover"
): Promise<string | null> {
  try {
    const res = await fetch(base64DataUrl);
    const blob = await res.blob();
    const ext = blob.type.includes("png")
      ? "png"
      : blob.type.includes("webp")
      ? "webp"
      : "jpg";
    const objectPath = `covers/${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 6)}.${ext}`;
    return await uploadBlobToSupabasePath(objectPath, blob, blob.type);
  } catch (err) {
    console.error("Error uploading base64 cover:", err);
    return null;
  }
}
