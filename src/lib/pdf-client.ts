"use client";

import JSZip from "jszip";

// Polyfills esenciales para navegadores móviles (Android / iOS Safari) requeridos por pdfjs-dist v4
if (typeof Promise !== "undefined" && !(Promise as any).withResolvers) {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof URL !== "undefined" && !(URL as any).parse) {
  (URL as any).parse = function (url: string, base?: string) {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

let pdfjsLibPromise: Promise<any> | null = null;

export async function getPdfJs() {
  if (typeof window === "undefined") return null;
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      return pdfjs;
    });
  }
  return pdfjsLibPromise;
}

export type DetectedFileFormat = "PDF" | "CBZ" | "EPUB" | "TEXT" | "IMAGE";

export function detectFileFormat(urlOrName: string): DetectedFileFormat {
  const clean = urlOrName.split("?")[0].toLowerCase();
  if (clean.endsWith(".cbz") || clean.endsWith(".zip")) return "CBZ";
  if (clean.endsWith(".epub")) return "EPUB";
  if (clean.endsWith(".txt") || clean.endsWith(".md")) return "TEXT";
  if (/\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i.test(clean)) return "IMAGE";
  return "PDF";
}

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function getMimeFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

/**
 * Extrae automáticamente la portada (de cualquier página indicada, ej. página 1, 3, etc.)
 * y el número de páginas de cualquier formato: PDF, CBZ, ZIP, EPUB, TXT, MD o Imagen.
 */
export async function extractCoverFromPdfFile(
  file: File | Blob,
  pageNumber = 1,
  fileNameHint?: string
): Promise<{ dataUrl: string; numPages: number } | null> {
  const nameToUse =
    fileNameHint || (file instanceof File ? file.name : "document.pdf");
  const format = detectFileFormat(nameToUse);

  try {
    // 1. Archivos PDF
    if (format === "PDF") {
      const pdfjs = await getPdfJs();
      if (!pdfjs) return null;

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      const targetPage = Math.min(Math.max(1, pageNumber), numPages);
      const page = await pdf.getPage(targetPage);

      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return null;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
      return { dataUrl, numPages };
    }

    // 2. Archivos de Manga/Cómic (.CBZ / .ZIP)
    if (format === "CBZ") {
      const zip = await JSZip.loadAsync(file);
      const imageKeys = Object.keys(zip.files)
        .filter(
          (k) =>
            !zip.files[k].dir &&
            !k.includes("__MACOSX") &&
            /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(k)
        )
        .sort(naturalSort);

      if (imageKeys.length === 0) return null;
      const targetIdx = Math.min(
        Math.max(0, pageNumber - 1),
        imageKeys.length - 1
      );
      const selectedKey = imageKeys[targetIdx];
      const base64 = await zip.files[selectedKey].async("base64");
      const mime = getMimeFromFilename(selectedKey);
      return {
        dataUrl: `data:${mime};base64,${base64}`,
        numPages: imageKeys.length,
      };
    }

    // 3. Archivos de Libros Electrónicos (.EPUB)
    if (format === "EPUB") {
      const zip = await JSZip.loadAsync(file);
      const allKeys = Object.keys(zip.files).filter((k) => !zip.files[k].dir);

      const htmlKeys = allKeys.filter(
        (k) =>
          /\.(xhtml|html|htm)$/i.test(k) &&
          !k.toLowerCase().includes("toc") &&
          !k.toLowerCase().includes("nav")
      );

      // Buscar imagen de portada dentro del EPUB (o usar pageNumber si el usuario eligió otra imagen)
      const imageKeys = allKeys
        .filter((k) => /\.(jpe?g|png|webp|gif)$/i.test(k))
        .sort(naturalSort);
      const coverKey =
        pageNumber > 1 && imageKeys.length > 0
          ? imageKeys[Math.min(pageNumber - 1, imageKeys.length - 1)]
          : imageKeys.find((k) => k.toLowerCase().includes("cover")) ||
            imageKeys[0];

      if (coverKey) {
        const base64 = await zip.files[coverKey].async("base64");
        const mime = getMimeFromFilename(coverKey);
        return {
          dataUrl: `data:${mime};base64,${base64}`,
          numPages: Math.max(1, htmlKeys.length, imageKeys.length),
        };
      }

      return {
        dataUrl: generateTitleCoverDataUrl(nameToUse, "EPUB"),
        numPages: Math.max(1, htmlKeys.length),
      };
    }

    // 4. Archivos de Imagen directa
    if (format === "IMAGE") {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return { dataUrl, numPages: 1 };
    }

    // 5. Archivos de Texto (.TXT / .MD)
    if (format === "TEXT") {
      const text = await file.text();
      const numPages = Math.max(1, Math.ceil(text.length / 2600));
      const dataUrl = generateTitleCoverDataUrl(nameToUse, "LIBRO TXT");
      return { dataUrl, numPages };
    }
  } catch (err) {
    console.warn("No se pudo extraer vista previa automática:", err);
  }
  return null;
}

function generateTitleCoverDataUrl(fileName: string, badge: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 680;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const grad = ctx.createLinearGradient(0, 0, 480, 680);
  grad.addColorStop(0, "#1e1b4b");
  grad.addColorStop(1, "#4c1d95");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 480, 680);

  ctx.strokeStyle = "rgba(167, 139, 250, 0.4)";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 432, 632);

  ctx.fillStyle = "#c4b5fd";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(badge, 48, 80);

  const cleanTitle = fileName.replace(/\.[a-z0-9]+$/i, "");
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(cleanTitle.slice(0, 22), 48, 300);
  if (cleanTitle.length > 22) {
    ctx.fillText(cleanTitle.slice(22, 44), 48, 340);
  }

  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Carga las páginas de un archivo .CBZ o .ZIP como URLs de imagen en memoria
 */
export async function loadCbzArchivePages(fileUrl: string): Promise<string[]> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("No se pudo descargar el archivo CBZ/ZIP");
  const buffer = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const imageKeys = Object.keys(zip.files)
    .filter(
      (k) =>
        !zip.files[k].dir &&
        !k.includes("__MACOSX") &&
        /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(k)
    )
    .sort(naturalSort);

  const urls: string[] = [];
  for (const key of imageKeys) {
    const blob = await zip.files[key].async("blob");
    urls.push(URL.createObjectURL(blob));
  }
  return urls;
}

/**
 * Carga las secciones/capítulos de un libro .EPUB (incluyendo imágenes internas)
 */
export async function loadEpubBookPages(
  fileUrl: string
): Promise<{ title: string; html: string }[]> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("No se pudo descargar el archivo EPUB");
  const buffer = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // Crear mapa de imágenes internas en Blob URLs para que se vean las ilustraciones del EPUB
  const imageBlobMap: Record<string, string> = {};
  const allKeys = Object.keys(zip.files).filter((k) => !zip.files[k].dir);

  for (const key of allKeys) {
    if (/\.(jpe?g|png|webp|gif|svg)$/i.test(key)) {
      const blob = await zip.files[key].async("blob");
      const blobUrl = URL.createObjectURL(blob);
      const baseName = key.split("/").pop() || key;
      imageBlobMap[key] = blobUrl;
      imageBlobMap[baseName] = blobUrl;
    }
  }

  // Determinar orden de lectura desde el archivo .opf si existe
  let orderedHtmlKeys: string[] = [];
  const opfKey = allKeys.find((k) => k.toLowerCase().endsWith(".opf"));

  if (opfKey) {
    try {
      const opfXml = await zip.files[opfKey].async("text");
      const opfDir = opfKey.includes("/")
        ? opfKey.substring(0, opfKey.lastIndexOf("/") + 1)
        : "";
      const parser = new DOMParser();
      const doc = parser.parseFromString(opfXml, "application/xml");

      const manifestMap: Record<string, string> = {};
      doc.querySelectorAll("manifest > item").forEach((item) => {
        const id = item.getAttribute("id");
        const href = item.getAttribute("href");
        if (id && href) manifestMap[id] = opfDir + decodeURIComponent(href);
      });

      doc.querySelectorAll("spine > itemref").forEach((ref) => {
        const idref = ref.getAttribute("idref");
        if (idref && manifestMap[idref] && zip.files[manifestMap[idref]]) {
          orderedHtmlKeys.push(manifestMap[idref]);
        }
      });
    } catch {
      // Fallback al orden natural
    }
  }

  if (orderedHtmlKeys.length === 0) {
    orderedHtmlKeys = allKeys
      .filter(
        (k) =>
          /\.(xhtml|html|htm)$/i.test(k) &&
          !k.toLowerCase().includes("toc") &&
          !k.toLowerCase().includes("nav")
      )
      .sort(naturalSort);
  }

  const sections: { title: string; html: string }[] = [];

  for (let i = 0; i < orderedHtmlKeys.length; i++) {
    const key = orderedHtmlKeys[i];
    const rawHtml = await zip.files[key].async("text");
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");

    // Reemplazar rutas de imágenes por sus Blob URLs en memoria
    doc.querySelectorAll("img, image").forEach((imgEl) => {
      const src =
        imgEl.getAttribute("src") ||
        imgEl.getAttribute("xlink:href") ||
        imgEl.getAttribute("href");
      if (src) {
        const baseName = src.split("/").pop() || src;
        if (imageBlobMap[baseName]) {
          if (imgEl.tagName.toLowerCase() === "image") {
            imgEl.setAttribute("href", imageBlobMap[baseName]);
          } else {
            imgEl.setAttribute("src", imageBlobMap[baseName]);
          }
        }
      }
    });

    const heading =
      doc.querySelector("h1, h2, h3, title")?.textContent?.trim() ||
      `Sección ${i + 1}`;
    const bodyHtml = doc.body ? doc.body.innerHTML : rawHtml;

    if (bodyHtml.trim().length > 0) {
      sections.push({
        title: heading,
        html: bodyHtml,
      });
    }
  }

  return sections.length > 0
    ? sections
    : [{ title: "Contenido", html: "<p>Archivo EPUB vacío.</p>" }];
}

/**
 * Carga y pagina archivos de texto (.TXT o .MD)
 */
export async function loadTextBookPages(fileUrl: string): Promise<string[]> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("No se pudo descargar el archivo de texto");
  const text = await res.text();
  const paragraphs = text.split(/\r?\n\r?\n/);

  const pages: string[] = [];
  let currentChunk = "";

  for (const p of paragraphs) {
    if ((currentChunk + "\n\n" + p).length > 2600 && currentChunk.length > 0) {
      pages.push(currentChunk.trim());
      currentChunk = p;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + p;
    }
  }
  if (currentChunk.trim().length > 0) {
    pages.push(currentChunk.trim());
  }

  return pages.length > 0 ? pages : [text || "Archivo vacío"];
}
