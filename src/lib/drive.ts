/**
 * Utilidades para conectar archivos alojados en Google Drive (50 GB+)
 * directamente con el lector interactivo de Komy sin límites de tamaño.
 */

export function extractGoogleDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Caso 1: /file/d/FILE_ID/
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/);
  if (fileMatch?.[1]) return fileMatch[1];

  // Caso 2: ?id=FILE_ID o &id=FILE_ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (idParamMatch?.[1]) return idParamMatch[1];

  // Caso 3: El usuario pegó directamente el ID de Google Drive
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Convierte cualquier link compartido de Google Drive en una URL interna de streaming
 * de Komy (/api/drive?id=...) compatible con PDF.js, CBZ, EPUB y TXT.
 */
export function buildKomyDriveStreamUrl(
  driveLinkOrId: string,
  formatExt: string = ".pdf"
): { streamUrl: string; fileId: string; virtualFileName: string } | null {
  const fileId = extractGoogleDriveFileId(driveLinkOrId);
  if (!fileId) return null;

  const cleanExt = formatExt.startsWith(".") ? formatExt : `.${formatExt}`;
  const virtualFileName = `google-drive-${fileId.slice(0, 8)}${cleanExt}`;
  const streamUrl = `/api/drive?id=${encodeURIComponent(fileId)}&name=${encodeURIComponent(virtualFileName)}`;

  return {
    streamUrl,
    fileId,
    virtualFileName,
  };
}
