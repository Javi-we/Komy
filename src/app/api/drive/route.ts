export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/drive?id=GOOGLE_DRIVE_FILE_ID&name=tomo1.pdf
 * Actúa como puente (proxy streaming) hacia Google Drive para poder leer
 * archivos de cualquier tamaño (50 MB, 200 MB, etc.) alojados en los 50 GB
 * de Google Drive del administrador sin errores de CORS ni avisos de "archivo grande".
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id");

  if (!fileId) {
    return NextResponse.json(
      { error: "Falta el parámetro id del archivo de Google Drive." },
      { status: 400 }
    );
  }

  // URL directa de descarga de Google Drive (incluye confirm=t para archivos >25MB/100MB)
  const driveDownloadUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
    fileId
  )}&export=download&confirm=t`;

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    let upstreamRes = await fetch(driveDownloadUrl, {
      headers,
      redirect: "follow",
    });

    // Fallback al endpoint clásico si drive.usercontent falla
    if (!upstreamRes.ok) {
      const fallbackUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(
        fileId
      )}&confirm=t`;
      upstreamRes = await fetch(fallbackUrl, {
        headers,
        redirect: "follow",
      });
    }

    if (!upstreamRes.ok || !upstreamRes.body) {
      return NextResponse.json(
        {
          error:
            "No se pudo descargar el archivo desde Google Drive. Asegúrate de que el archivo tenga acceso 'Cualquier persona con el enlace'.",
        },
        { status: upstreamRes.status || 404 }
      );
    }

    const contentType =
      upstreamRes.headers.get("content-type") || "application/octet-stream";

    // Si Google Drive devuelve una página HTML en vez del archivo binario, es porque el archivo es privado
    if (contentType.includes("text/html")) {
      return NextResponse.json(
        {
          error:
            "El archivo en Google Drive está en modo Restringido. En Google Drive haz clic derecho en el archivo -> Compartir -> Cualquier persona con el enlace.",
        },
        { status: 403 }
      );
    }

    const resHeaders = new Headers();
    resHeaders.set("Content-Type", contentType);
    resHeaders.set("Access-Control-Allow-Origin", "*");
    resHeaders.set("Cache-Control", "public, max-age=86400");

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) {
      resHeaders.set("Content-Length", contentLength);
    }
    const contentRange = upstreamRes.headers.get("content-range");
    if (contentRange) {
      resHeaders.set("Content-Range", contentRange);
    }

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: resHeaders,
    });
  } catch (error) {
    console.error("Error streaming from Google Drive:", error);
    return NextResponse.json(
      { error: "Error de conexión con Google Drive." },
      { status: 500 }
    );
  }
}
