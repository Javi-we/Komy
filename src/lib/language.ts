import { WorkItem } from "@/types/library";

/**
 * Retorna el código o etiqueta de idioma si NO es español.
 * Si es español (ES) o no se especifica, retorna null (no se muestra nada en portada).
 * Si es inglés, retorna "EN".
 * Si es japonés, retorna "JP".
 * Si es otro idioma no español, retorna el código correspondiente.
 */
export function getWorkNonSpanishLanguage(work?: {
  language?: string | null;
  tags?: string | null;
} | null): string | null {
  if (!work) return null;

  // 1. Verificar campo dedicado `language`
  if (work.language) {
    const lang = work.language.trim().toUpperCase();
    if (lang === "EN" || lang === "INGLÉS" || lang === "INGLES" || lang === "ENGLISH") {
      return "EN";
    }
    if (lang === "JP" || lang === "JAPONÉS" || lang === "JAPONES" || lang === "JAPANESE") {
      return "JP";
    }
    if (lang !== "ES" && lang !== "ESPAÑOL" && lang !== "ESPANOL" && lang !== "SPANISH" && lang !== "NONE") {
      return lang.slice(0, 3);
    }
    return null;
  }

  // 2. Verificar etiquetas (tags)
  if (work.tags) {
    const rawTags = work.tags
      .split(",")
      .map((t) => t.replace(/\.+$/, "").trim().toLowerCase());

    if (
      rawTags.includes("inglés") ||
      rawTags.includes("ingles") ||
      rawTags.includes("english") ||
      rawTags.includes("en")
    ) {
      return "EN";
    }
    if (
      rawTags.includes("japonés") ||
      rawTags.includes("japones") ||
      rawTags.includes("japanese") ||
      rawTags.includes("jp")
    ) {
      return "JP";
    }
  }

  return null;
}
