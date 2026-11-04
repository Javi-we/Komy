import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();
const SUPABASE_URL = "https://ttwhrnodqfvndvqwrele.supabase.co";
const SUPABASE_KEY = "sb_publishable_tIPu5Bzvp2g4HZLy_ea73A_kkobjdlU";
const BUCKET = "komy-files";

async function uploadToSupabase(localFile, remotePath, contentType) {
  const buffer = await fs.readFile(localFile);
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${remotePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: new Uint8Array(buffer),
    }
  );
  if (!res.ok) {
    console.warn("Upload warn:", remotePath, await res.text());
    return null;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${remotePath}`;
}

async function main() {
  // 1. Create komy-files bucket & public policies in Supabase Storage
  await prisma.$executeRawUnsafe(`
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('komy-files', 'komy-files', true)
    ON CONFLICT (id) DO UPDATE SET public = true;
  `);

  try {
    await prisma.$executeRawUnsafe(`
      CREATE POLICY "Acceso publico total komy-files"
      ON storage.objects FOR ALL
      USING (bucket_id = 'komy-files')
      WITH CHECK (bucket_id = 'komy-files');
    `);
  } catch {
    // Policy already exists
  }

  console.log("✓ Bucket 'komy-files' y permisos públicos activados en Supabase Storage.");

  // 2. Upload sample PDFs and covers to Supabase Storage so they work from any device/cloud
  const pdfDir = path.join(process.cwd(), "public", "uploads", "pdfs");
  const coverDir = path.join(process.cwd(), "public", "uploads", "covers");

  const coverFiles = await fs.readdir(coverDir);
  for (const f of coverFiles) {
    const ext = f.endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
    const cloudUrl = await uploadToSupabase(
      path.join(coverDir, f),
      `covers/${f}`,
      ext
    );
    if (cloudUrl) {
      await prisma.work.updateMany({
        where: { coverUrl: `/uploads/covers/${f}` },
        data: { coverUrl: cloudUrl },
      });
      await prisma.volume.updateMany({
        where: { coverUrl: `/uploads/covers/${f}` },
        data: { coverUrl: cloudUrl },
      });
    }
  }

  const pdfFiles = await fs.readdir(pdfDir);
  for (const f of pdfFiles) {
    const cloudUrl = await uploadToSupabase(
      path.join(pdfDir, f),
      `pdfs/${f}`,
      "application/pdf"
    );
    if (cloudUrl) {
      await prisma.volume.updateMany({
        where: { fileUrl: `/uploads/pdfs/${f}` },
        data: { fileUrl: cloudUrl },
      });
    }
  }

  console.log("✓ Archivos PDF y portadas sincronizados con Supabase Cloud Storage.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
