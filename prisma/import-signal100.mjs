import { PrismaClient } from "@prisma/client";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();
const SOURCE_DIR = "C:\\Users\\ASUS VIVOBOOK PRO\\Downloads\\Signal 100\\Signal 100";
const DEST_PDF_DIR = path.join(process.cwd(), "public", "uploads", "pdfs");
const DEST_COVER_DIR = path.join(process.cwd(), "public", "uploads", "covers");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ttwhrnodqfvndvqwrele.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_publishable_tIPu5Bzvp2g4HZLy_ea73A_kkobjdlU";

async function extractFirstJpegFromPdf(pdfDoc) {
  try {
    const enumerated = pdfDoc.context.enumerateIndirectObjects();
    for (const [, obj] of enumerated) {
      if (obj instanceof PDFRawStream) {
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of("Subtype"));
        const filter = dict.get(PDFName.of("Filter"));
        if (
          subtype === PDFName.of("Image") &&
          (filter === PDFName.of("DCTDecode") ||
            (filter && filter.toString().includes("DCTDecode")))
        ) {
          const bytes = obj.contents;
          if (bytes && bytes.length > 8000) {
            return Buffer.from(bytes);
          }
        }
      }
    }
  } catch (e) {
    console.warn("Could not extract raw JPEG from PDF:", e.message);
  }
  return null;
}

async function uploadCoverToSupabase(buffer, fileName) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/komy-files/covers/${fileName}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
          "Content-Type": "image/jpeg",
          "x-upsert": "true",
        },
        body: new Uint8Array(buffer),
      }
    );
    if (res.ok) {
      return `${SUPABASE_URL}/storage/v1/object/public/komy-files/covers/${fileName}`;
    }
  } catch {
    // Fallback
  }
  return `/uploads/covers/${fileName}`;
}

async function main() {
  await fs.mkdir(DEST_PDF_DIR, { recursive: true });
  await fs.mkdir(DEST_COVER_DIR, { recursive: true });

  // Inspect existing works
  const existingWorks = await prisma.work.findMany({
    include: { volumes: true },
  });
  console.log(
    "Obras actuales en BD:",
    existingWorks.map((w) => ({
      id: w.id,
      title: w.title,
      volumesCount: w.volumes.length,
    }))
  );

  // Find or create "Signal 100"
  const allSignalWorks = existingWorks.filter((w) =>
    w.title.toLowerCase().includes("signal")
  );
  let signalWork = allSignalWorks[0];
  if (allSignalWorks.length > 1) {
    const extraIds = allSignalWorks.slice(1).map((w) => w.id);
    await prisma.work.deleteMany({ where: { id: { in: extraIds } } });
    console.log("✓ Duplicados anteriores de Signal 100 limpiados:", extraIds.length);
  }

  const files = (await fs.readdir(SOURCE_DIR))
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  console.log("Archivos encontrados en Signal 100:", files);

  const volumeEntries = [];
  let mainSeriesCoverUrl = null;

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const volNum = i + 1;
    const srcPath = path.join(SOURCE_DIR, fileName);
    const safeFileName = `signal-100-tomo-0${volNum}.pdf`;
    const destPath = path.join(DEST_PDF_DIR, safeFileName);

    console.log(`Procesando ${fileName}...`);
    const pdfBuffer = await fs.readFile(srcPath);
    await fs.writeFile(destPath, pdfBuffer);

    const pdfDoc = await PDFDocument.load(pdfBuffer, {
      ignoreEncryption: true,
    });
    const totalPages = pdfDoc.getPageCount();
    console.log(` -> Total de páginas detectadas en Tomo ${volNum}: ${totalPages}`);

    // Extract real cover image from page 1 of the manga PDF!
    let coverUrl = null;
    const jpegBuffer = await extractFirstJpegFromPdf(pdfDoc);
    if (jpegBuffer) {
      const coverFileName = `signal-100-tomo-0${volNum}-cover.jpg`;
      await fs.writeFile(path.join(DEST_COVER_DIR, coverFileName), jpegBuffer);
      coverUrl = await uploadCoverToSupabase(jpegBuffer, coverFileName);
      console.log(` -> Portada original extraída del PDF: ${coverUrl}`);
      if (volNum === 1) mainSeriesCoverUrl = coverUrl;
    }

    volumeEntries.push({
      volumeNumber: volNum,
      sortOrder: volNum,
      title: `Tomo 0${volNum} - Signal 100`,
      synopsis: `Tomo ${volNum} del manga Signal 100 (${totalPages} páginas).`,
      coverUrl,
      fileUrl: `/uploads/pdfs/${safeFileName}`,
      fileName,
      fileSize: pdfBuffer.length,
      totalPages,
      currentPage: 1,
      isCompleted: false,
    });
  }

  if (signalWork) {
    // Delete any incomplete volumes on existing Signal 100 work and replace with complete 4 volumes
    await prisma.volume.deleteMany({ where: { workId: signalWork.id } });
    signalWork = await prisma.work.update({
      where: { id: signalWork.id },
      data: {
        title: "Signal 100",
        subtitle: "Edición Completa (4 Tomos)",
        author: "Miyatsuki Arata & Kondou Shigure",
        description:
          "Treinta y seis estudiantes son sometidos a un lavado de cerebro por su profesor mediante 100 señales de hipnosis mortal. Para sobrevivir, deberán descubrir cuáles son las señales antes de que toda la clase caiga.",
        type: "MANGA",
        status: "READING",
        readingMode: "MANGA_RTL",
        coverUrl: mainSeriesCoverUrl || signalWork.coverUrl,
        tags: " Seinen, Terror, Psicológico, Supervivencia, Escolar",
        rating: 4.8,
        volumes: {
          create: volumeEntries,
        },
      },
      include: { volumes: true },
    });
    console.log("✓ Obra existente Signal 100 actualizada con sus 4 tomos completos!");
  } else {
    signalWork = await prisma.work.create({
      data: {
        title: "Signal 100",
        subtitle: "Edición Completa (4 Tomos)",
        author: "Miyatsuki Arata & Kondou Shigure",
        description:
          "Treinta y seis estudiantes son sometidos a un lavado de cerebro por su profesor mediante 100 señales de hipnosis mortal. Para sobrevivir, deberán descubrir cuáles son las señales antes de que toda la clase caiga.",
        type: "MANGA",
        status: "READING",
        readingMode: "MANGA_RTL",
        coverUrl: mainSeriesCoverUrl,
        isFavorite: true,
        tags: "Seinen, Terror, Psicológico, Supervivencia, Escolar",
        rating: 4.8,
        sortOrder: 0,
        volumes: {
          create: volumeEntries,
        },
      },
      include: { volumes: true },
    });
    console.log("✓ Nueva obra Signal 100 creada con sus 4 tomos completos!");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
