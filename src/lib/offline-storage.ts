"use client";

/**
 * Memoria Offline (IndexedDB) para Komy:
 * Permite guardar cualquier Tomo en la memoria interna del celular o navegador
 * para abrirlo en 0.1 segundos y leerlo SIN CONEXIÓN A INTERNET.
 * Además reconstruye automáticamente los archivos grandes (.komyparts.json).
 */

const DB_NAME = "komy_offline_library_db";
const STORE_NAME = "offline_volumes";
const DB_VERSION = 1;

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB no disponible"));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "volumeId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineVolumeBlob(
  volumeId: string
): Promise<Blob | null> {
  try {
    const db = await openOfflineDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(volumeId);
      req.onsuccess = () => {
        const record = req.result;
        resolve(record?.blob || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function isVolumeSavedOffline(volumeId: string): Promise<boolean> {
  const blob = await getOfflineVolumeBlob(volumeId);
  return Boolean(blob);
}

export async function getAllOfflineVolumeIds(): Promise<string[]> {
  try {
    const db = await openOfflineDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        resolve((req.result || []).map(String));
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function removeVolumeOffline(volumeId: string): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(volumeId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("Error removing offline volume:", err);
  }
}

/**
 * Descarga un archivo desde la nube (soporta archivos simples y archivos grandes divididos .komyparts.json)
 * y opcionalmente lo guarda en IndexedDB para lectura sin internet.
 */
export async function fetchAndCacheVolumeBlob(
  volumeId: string,
  fileUrl: string,
  persistOffline: boolean = true,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  // 1. Verificar primero si ya está guardado en la memoria Offline del dispositivo
  const cachedBlob = await getOfflineVolumeBlob(volumeId);
  if (cachedBlob) {
    onProgress?.("Abriendo desde memoria offline...");
    return cachedBlob;
  }

  let finalBlob: Blob;

  // 2. Si es un archivo grande dividido en partes (.komyparts.json)
  if (fileUrl.endsWith(".komyparts.json")) {
    const manifestRes = await fetch(fileUrl);
    if (!manifestRes.ok) {
      throw new Error("No se pudo descargar el manifiesto del tomo.");
    }
    const manifest = await manifestRes.json();
    const parts: string[] = manifest.parts || [];
    const partBlobs: Blob[] = [];

    for (let i = 0; i < parts.length; i++) {
      const pct = Math.round(((i + 0.2) / parts.length) * 100);
      onProgress?.(`Descargando parte ${i + 1} de ${parts.length} (${pct}%)...`);
      const pRes = await fetch(parts[i]);
      if (!pRes.ok) {
        throw new Error(`Error descargando la parte ${i + 1} del tomo.`);
      }
      const pBlob = await pRes.blob();
      partBlobs.push(pBlob);
      const pctDone = Math.round(((i + 1) / parts.length) * 100);
      onProgress?.(`Descargando parte ${i + 1} de ${parts.length} (${pctDone}%)...`);
    }

    finalBlob = new Blob(partBlobs, {
      type: manifest.mimeType || "application/pdf",
    });
  } else {
    // 3. Archivo normal de una sola pieza
    onProgress?.("Descargando documento...");
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error("No se pudo descargar el archivo del tomo.");
    }
    finalBlob = await res.blob();
    onProgress?.("Listo");
  }

  // 4. Guardar en IndexedDB para que la próxima vez abra al instante y funcione sin internet
  if (persistOffline) {
    try {
      const db = await openOfflineDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put({
          volumeId,
          blob: finalBlob,
          savedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore quota errors on restricted devices
    }
  }

  return finalBlob;
}
