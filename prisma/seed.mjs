import { PrismaClient } from "@prisma/client";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function createSampleMangaPdf(filePath, title, tomoTitle, pagesCount = 8, isManga = true) {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= pagesCount; i++) {
    const page = pdfDoc.addPage([600, 850]);
    const { width, height } = page.getSize();

    // Background
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: i === 1 ? (isManga ? rgb(0.11, 0.09, 0.22) : rgb(0.08, 0.16, 0.24)) : rgb(0.97, 0.96, 0.94),
    });

    if (i === 1) {
      // Cover page inside PDF
      page.drawRectangle({
        x: 30,
        y: 30,
        width: width - 60,
        height: height - 60,
        borderColor: rgb(0.65, 0.55, 0.98),
        borderWidth: 3,
      });

      page.drawText(isManga ? "MANGA EDITION" : "EDICION LITERARIA", {
        x: 60,
        y: height - 100,
        size: 14,
        font: fontBold,
        color: rgb(0.65, 0.55, 0.98),
      });

      page.drawText(title, {
        x: 60,
        y: height - 160,
        size: 32,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      page.drawText(tomoTitle, {
        x: 60,
        y: height - 210,
        size: 20,
        font: fontRegular,
        color: rgb(0.85, 0.85, 0.95),
      });

      // Decorative manga panel boxes on cover
      page.drawRectangle({
        x: 60,
        y: 140,
        width: width - 120,
        height: 380,
        color: rgb(0.18, 0.15, 0.34),
        borderColor: rgb(0.8, 0.75, 1),
        borderWidth: 2,
      });

      page.drawText(`PAGINA DE PORTADA (1 / ${pagesCount})`, {
        x: 160,
        y: 80,
        size: 13,
        font: fontBold,
        color: rgb(0.75, 0.75, 0.88),
      });
    } else if (isManga) {
      // Draw comic/manga panels for demonstration
      page.drawText(`${title} - ${tomoTitle}`, {
        x: 40,
        y: height - 35,
        size: 10,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.35),
      });

      // Panel 1 (Top wide)
      page.drawRectangle({
        x: 40,
        y: height - 290,
        width: width - 80,
        height: 230,
        color: rgb(0.91, 0.91, 0.94),
        borderColor: rgb(0.1, 0.1, 0.12),
        borderWidth: 3,
      });
      page.drawText(`Viñeta Principal - Página ${i}`, {
        x: 70,
        y: height - 120,
        size: 22,
        font: fontBold,
        color: rgb(0.12, 0.12, 0.18),
      });
      page.drawText(
        "Modo de lectura soportado: Derecha a Izquierda (Manga), Cascada (Webtoon) o Normal.",
        {
          x: 70,
          y: height - 160,
          size: 11,
          font: fontRegular,
          color: rgb(0.25, 0.25, 0.3),
        }
      );

      // Panel 2 (Middle Left)
      page.drawRectangle({
        x: 40,
        y: height - 560,
        width: 250,
        height: 250,
        color: rgb(0.88, 0.89, 0.95),
        borderColor: rgb(0.1, 0.1, 0.12),
        borderWidth: 3,
      });
      page.drawText("Viñeta Izquierda", {
        x: 65,
        y: height - 430,
        size: 16,
        font: fontBold,
        color: rgb(0.15, 0.15, 0.25),
      });

      // Panel 3 (Middle Right)
      page.drawRectangle({
        x: 310,
        y: height - 560,
        width: 250,
        height: 250,
        color: rgb(0.93, 0.89, 0.95),
        borderColor: rgb(0.1, 0.1, 0.12),
        borderWidth: 3,
      });
      page.drawText("Viñeta Derecha (1ro en Manga)", {
        x: 325,
        y: height - 430,
        size: 14,
        font: fontBold,
        color: rgb(0.25, 0.12, 0.3),
      });

      // Panel 4 (Bottom Wide)
      page.drawRectangle({
        x: 40,
        y: 60,
        width: width - 80,
        height: 210,
        color: rgb(0.15, 0.14, 0.22),
        borderColor: rgb(0.1, 0.1, 0.12),
        borderWidth: 3,
      });
      page.drawText(`"¡Puedes subir tus propios archivos PDF en cualquier Tomo!"`, {
        x: 75,
        y: 170,
        size: 15,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText(`Página ${i} de ${pagesCount}`, {
        x: width / 2 - 45,
        y: 25,
        size: 12,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.25),
      });
    } else {
      // Book Page layout
      page.drawText(`${title}  |  ${tomoTitle}`, {
        x: 60,
        y: height - 50,
        size: 11,
        font: fontBold,
        color: rgb(0.35, 0.35, 0.4),
      });

      page.drawText(`Capítulo ${Math.ceil((i - 1) / 2)}: Crónicas del Archivo Digital`, {
        x: 60,
        y: height - 110,
        size: 20,
        font: fontBold,
        color: rgb(0.1, 0.12, 0.18),
      });

      const paragraphs = [
        "Esta es una página de demostración generada automáticamente en formato PDF para tu biblioteca digital.",
        "Desde el panel de administración de cada obra puedes:",
        "1. Subir archivos PDF para cada tomo o volumen de manera independiente.",
        "2. Cambiar la portada general de la serie o asignar una portada exclusiva a cada tomo.",
        "3. Ordenar los tomos con botones rápidos (Subir, Bajar, Ordenar por Número de Tomo).",
        "4. Leer con guardado automático de página, marcadores, zoom y pantalla completa.",
        "5. Alternar entre vista de Libro tradicional (Izquierda a Derecha), Manga (Derecha a Izquierda) o Cascada continua.",
      ];

      let yPos = height - 170;
      for (const line of paragraphs) {
        page.drawText(line, {
          x: 60,
          y: yPos,
          size: 12,
          font: fontRegular,
          color: rgb(0.18, 0.18, 0.22),
          maxWidth: width - 120,
        });
        yPos -= 55;
      }

      page.drawText(`— Página ${i} de ${pagesCount} —`, {
        x: width / 2 - 50,
        y: 40,
        size: 11,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.45),
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(filePath, Buffer.from(pdfBytes));
}

async function createSvgCover(filePath, title, subtitle, badge, gradientStart, gradientEnd) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 850" width="600" height="850">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${gradientStart}" />
        <stop offset="100%" stop-color="${gradientEnd}" />
      </linearGradient>
    </defs>
    <rect width="600" height="850" fill="url(#bg)" />
    <rect x="28" y="28" width="544" height="794" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="3" rx="16" />
    <circle cx="480" cy="180" r="140" fill="rgba(255,255,255,0.07)" />
    <circle cx="120" cy="680" r="190" fill="rgba(255,255,255,0.05)" />
    <rect x="55" y="65" width="160" height="36" rx="18" fill="rgba(255,255,255,0.18)" />
    <text x="135" y="89" font-family="sans-serif" font-size="15" font-weight="bold" fill="#ffffff" text-anchor="middle">${badge}</text>
    <text x="55" y="420" font-family="sans-serif" font-size="48" font-weight="900" fill="#ffffff">${title}</text>
    <text x="55" y="475" font-family="sans-serif" font-size="24" font-weight="600" fill="rgba(255,255,255,0.85)">${subtitle}</text>
    <rect x="55" y="720" width="490" height="4" fill="rgba(255,255,255,0.3)" />
    <text x="55" y="765" font-family="sans-serif" font-size="18" font-weight="bold" fill="rgba(255,255,255,0.8)">KOMA LIBRARY EDITION</text>
  </svg>`;
  await fs.writeFile(filePath, svg, "utf-8");
}

async function main() {
  const existingCount = await prisma.work.count();
  if (existingCount > 0) {
    console.log("Database already seeded.");
    return;
  }

  const pdfDir = path.join(process.cwd(), "public", "uploads", "pdfs");
  const coverDir = path.join(process.cwd(), "public", "uploads", "covers");
  await fs.mkdir(pdfDir, { recursive: true });
  await fs.mkdir(coverDir, { recursive: true });

  // Create sample covers
  await createSvgCover(
    path.join(coverDir, "manga-chronicles.svg"),
    "AETHER BLADE",
    "Tomo 01 - El Despertar",
    "MANGA • SHONEN",
    "#311042",
    "#7c3aed"
  );
  await createSvgCover(
    path.join(coverDir, "manga-chronicles-v2.svg"),
    "AETHER BLADE",
    "Tomo 02 - Tormenta Carmesí",
    "MANGA • TOMO 2",
    "#4c0519",
    "#e11d48"
  );
  await createSvgCover(
    path.join(coverDir, "manga-chronicles-v3.svg"),
    "AETHER BLADE",
    "Tomo 03 - Eclipse Final",
    "MANGA • TOMO 3",
    "#0f172a",
    "#2563eb"
  );
  await createSvgCover(
    path.join(coverDir, "book-architecture.svg"),
    "EL ARCHIVO INFINITO",
    "Novela de Ciencia Ficción",
    "LIBRO • PDF",
    "#064e3b",
    "#0d9488"
  );

  // Create sample PDFs
  await createSampleMangaPdf(
    path.join(pdfDir, "aether-blade-tomo-1.pdf"),
    "Aether Blade",
    "Tomo 1: El Despertar",
    8,
    true
  );
  await createSampleMangaPdf(
    path.join(pdfDir, "aether-blade-tomo-2.pdf"),
    "Aether Blade",
    "Tomo 2: Tormenta Carmesí",
    6,
    true
  );
  await createSampleMangaPdf(
    path.join(pdfDir, "aether-blade-tomo-3.pdf"),
    "Aether Blade",
    "Tomo 3: Eclipse Final",
    7,
    true
  );
  await createSampleMangaPdf(
    path.join(pdfDir, "archivo-infinito-vol-1.pdf"),
    "El Archivo Infinito",
    "Volumen 1: La Biblioteca Oculta",
    6,
    false
  );

  // Create sample Works + Volumes
  const mangaWork = await prisma.work.create({
    data: {
      title: "Aether Blade",
      subtitle: "Crónicas del Filo Etéreo",
      author: "Kenji Takahashi",
      description:
        "En un mundo fragmentado por islas flotantes, un joven herrero descubre un antiguo grimorio capaz de forjar espadas que cortan el espacio-tiempo. Serie de ejemplo con 3 tomos ordenables y listos para leer.",
      type: "MANGA",
      status: "READING",
      readingMode: "MANGA_RTL",
      coverUrl: "/uploads/covers/manga-chronicles.svg",
      isFavorite: true,
      rating: 4.9,
      tags: "Acción, Fantasía, Shonen, Aventura",
      sortOrder: 1,
      volumes: {
        create: [
          {
            volumeNumber: 1,
            sortOrder: 1,
            title: "Tomo 1: El Despertar",
            synopsis: "El encuentro con la espada ancestral y el primer duelo en la capital celeste.",
            coverUrl: "/uploads/covers/manga-chronicles.svg",
            fileUrl: "/uploads/pdfs/aether-blade-tomo-1.pdf",
            fileName: "aether-blade-tomo-1.pdf",
            fileSize: 18450,
            totalPages: 8,
            currentPage: 3,
            isCompleted: false,
            lastReadAt: new Date(),
            chapters: {
              create: [
                { chapterNumber: 1, title: "Cap. 1: La Forja del Cielo", startPage: 1, sortOrder: 1 },
                { chapterNumber: 2, title: "Cap. 2: El Eco del Acero", startPage: 4, sortOrder: 2 },
                { chapterNumber: 3, title: "Cap. 3: Juramento", startPage: 6, sortOrder: 3 },
              ],
            },
          },
          {
            volumeNumber: 2,
            sortOrder: 2,
            title: "Tomo 2: Tormenta Carmesí",
            synopsis: "La invasión de la flota imperial sobre el archipiélago del norte.",
            coverUrl: "/uploads/covers/manga-chronicles-v2.svg",
            fileUrl: "/uploads/pdfs/aether-blade-tomo-2.pdf",
            fileName: "aether-blade-tomo-2.pdf",
            fileSize: 16200,
            totalPages: 6,
            currentPage: 1,
            isCompleted: false,
            chapters: {
              create: [
                { chapterNumber: 4, title: "Cap. 4: Cielos en Llamas", startPage: 1, sortOrder: 1 },
                { chapterNumber: 5, title: "Cap. 5: Duelo en la Niebla", startPage: 4, sortOrder: 2 },
              ],
            },
          },
          {
            volumeNumber: 3,
            sortOrder: 3,
            title: "Tomo 3: Eclipse Final",
            synopsis: "El secreto de los antiguos arquitectos sale a la luz.",
            coverUrl: "/uploads/covers/manga-chronicles-v3.svg",
            fileUrl: "/uploads/pdfs/aether-blade-tomo-3.pdf",
            fileName: "aether-blade-tomo-3.pdf",
            fileSize: 17100,
            totalPages: 7,
            currentPage: 1,
            isCompleted: false,
          },
        ],
      },
    },
  });

  const bookWork = await prisma.work.create({
    data: {
      title: "El Archivo Infinito",
      subtitle: "Edición Especial Ilustrada",
      author: "Elena Valdés",
      description:
        "Una novela envolvente sobre un bibliotecario que descubre que los libros de su bóveda subterránea se reescriben cada noche reflejando futuros alternativos.",
      type: "BOOK",
      status: "READING",
      readingMode: "BOOK_LTR",
      coverUrl: "/uploads/covers/book-architecture.svg",
      isFavorite: false,
      rating: 4.7,
      tags: "Ciencia Ficción, Misterio, Novela",
      sortOrder: 2,
      volumes: {
        create: [
          {
            volumeNumber: 1,
            sortOrder: 1,
            title: "Volumen 1: La Biblioteca Oculta",
            synopsis: "Primera parte de la trilogía.",
            coverUrl: "/uploads/covers/book-architecture.svg",
            fileUrl: "/uploads/pdfs/archivo-infinito-vol-1.pdf",
            fileName: "archivo-infinito-vol-1.pdf",
            fileSize: 15400,
            totalPages: 6,
            currentPage: 2,
            isCompleted: false,
            lastReadAt: new Date(Date.now() - 3600 * 1000 * 5),
            chapters: {
              create: [
                { chapterNumber: 1, title: "Prólogo y Capítulo I", startPage: 1, sortOrder: 1 },
                { chapterNumber: 2, title: "Capítulo II: El Manuscrito", startPage: 4, sortOrder: 2 },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.collection.create({
    data: {
      name: "Mis Favoritos de Fantasía",
      description: "Series principales que estoy leyendo actualmente",
      color: "#8b5cf6",
      sortOrder: 1,
      items: {
        create: [{ workId: mangaWork.id }, { workId: bookWork.id }],
      },
    },
  });

  console.log("Seed completado con éxito.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
