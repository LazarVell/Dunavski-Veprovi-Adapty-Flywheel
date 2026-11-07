/**
 * Language catalog for Creative Studio.
 *
 * Tier 1: in the demo, checked by us. Tier 2: machine-written, flagged for native review.
 * "data": suggested because it is a strong market in the app's own data (see insights.langSuggestions).
 */
import insights from "../../data/derived/insights.json";

export type Tier = 1 | 2 | "data";
export type Script = "latin" | "cyrillic" | "cjk" | "devanagari" | "rtl";

export type Lang = {
  /** our key, also used as the cache key */
  key: string;
  name: string;
  native: string;
  tier: Tier;
  script: Script;
  /** value for the HTML lang attribute (drives glyph shapes, e.g. Serbian Cyrillic italics) */
  htmlLang: string;
  /** locale id/code written into the Adapty flow config */
  flowLocale: string;
  /** ISO language code in the dataset's locale column */
  dataLang: string;
  rtl?: boolean;
  /** what the text model writes in; Serbian is written in Cyrillic and transliterated to Latin in code */
  writeAs?: string;
};

export const LANGS: Lang[] = [
  { key: "en", name: "English", native: "English", tier: 1, script: "latin", htmlLang: "en", flowLocale: "en", dataLang: "en" },
  { key: "ru", name: "Russian", native: "Русский", tier: 1, script: "cyrillic", htmlLang: "ru", flowLocale: "ru", dataLang: "ru" },
  { key: "sr-Latn", name: "Serbian (Latin)", native: "Srpski", tier: 1, script: "latin", htmlLang: "sr-Latn", flowLocale: "sr-Latn", dataLang: "sr", writeAs: "sr-Cyrl" },
  { key: "sr-Cyrl", name: "Serbian (Cyrillic)", native: "Српски", tier: 1, script: "cyrillic", htmlLang: "sr-Cyrl", flowLocale: "sr", dataLang: "sr" },
  { key: "de", name: "German", native: "Deutsch", tier: 1, script: "latin", htmlLang: "de", flowLocale: "de", dataLang: "de" },
  { key: "es", name: "Spanish", native: "Español", tier: 1, script: "latin", htmlLang: "es", flowLocale: "es", dataLang: "es" },
  { key: "pt-BR", name: "Portuguese (Brazil)", native: "Português", tier: 2, script: "latin", htmlLang: "pt-BR", flowLocale: "pt-BR", dataLang: "pt" },
  { key: "fr", name: "French", native: "Français", tier: 2, script: "latin", htmlLang: "fr", flowLocale: "fr", dataLang: "fr" },
  { key: "it", name: "Italian", native: "Italiano", tier: 2, script: "latin", htmlLang: "it", flowLocale: "it", dataLang: "it" },
  { key: "nl", name: "Dutch", native: "Nederlands", tier: 2, script: "latin", htmlLang: "nl", flowLocale: "nl", dataLang: "nl" },
  { key: "sv", name: "Swedish", native: "Svenska", tier: 2, script: "latin", htmlLang: "sv", flowLocale: "sv", dataLang: "sv" },
  { key: "tr", name: "Turkish", native: "Türkçe", tier: 2, script: "latin", htmlLang: "tr", flowLocale: "tr", dataLang: "tr" },
];

/** Languages that are not defaults but qualify as strong markets in the app's own data. */
const DATA_LANG_META: Record<string, Omit<Lang, "tier" | "dataLang" | "key">> = {
  ja: { name: "Japanese", native: "日本語", script: "cjk", htmlLang: "ja", flowLocale: "ja" },
  pl: { name: "Polish", native: "Polski", script: "latin", htmlLang: "pl", flowLocale: "pl" },
  hi: { name: "Hindi", native: "हिन्दी", script: "devanagari", htmlLang: "hi", flowLocale: "hi" },
  ar: { name: "Arabic", native: "العربية", script: "rtl", htmlLang: "ar", flowLocale: "ar", rtl: true },
};

export type LangSuggestion = (typeof insights.langSuggestions)[number];

export const dataLangs: { lang: Lang; s: LangSuggestion }[] = insights.langSuggestions
  .filter((s) => DATA_LANG_META[s.key])
  .map((s) => ({ s, lang: { key: s.key, dataLang: s.key, tier: "data" as const, ...DATA_LANG_META[s.key] } }));

export const suggestedDataLangs = dataLangs.filter((d) => d.s.suggested);
export const notSuggestedDataLangs = dataLangs.filter((d) => !d.s.suggested);

/** Demo switcher order: English > Russian > Serbian > the rest. */
export const ALL_LANGS: Lang[] = [...LANGS, ...suggestedDataLangs.map((d) => d.lang)];
export const langByKey = (k: string) => ALL_LANGS.find((l) => l.key === k) ?? dataLangs.find((d) => d.lang.key === k)?.lang;

export const needsReview = (l: Lang) => l.tier !== 1;

/** Market numbers for a language, from the app's own data (60-day window). */
export function marketFor(l: Lang) {
  return insights.languages.find((x) => x.key === l.dataLang) ?? null;
}

// ---------- Serbian Cyrillic -> Latin (exact in this direction; the reverse is ambiguous) ----------
const SR_MAP: Record<string, string> = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Ђ: "Đ", Е: "E", Ж: "Ž", З: "Z", И: "I", Ј: "J", К: "K", Л: "L", Љ: "Lj",
  М: "M", Н: "N", Њ: "Nj", О: "O", П: "P", Р: "R", С: "S", Т: "T", Ћ: "Ć", У: "U", Ф: "F", Х: "H", Ц: "C", Ч: "Č",
  Џ: "Dž", Ш: "Š",
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj",
  м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č",
  џ: "dž", ш: "š",
};
const DIGRAPH_UPPER: Record<string, string> = { Љ: "LJ", Њ: "NJ", Џ: "DŽ" };

export function srCyrlToLatn(text: string): string {
  const chars = [...text];
  return chars
    .map((ch, i) => {
      if (DIGRAPH_UPPER[ch]) {
        // ALL-CAPS context (neighbour is an uppercase letter) -> "LJ", otherwise title case "Lj"
        const next = chars[i + 1] ?? "", prev = chars[i - 1] ?? "";
        const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
        return isUpper(next) || (isUpper(prev) && !/[a-zа-я]/.test(next)) ? DIGRAPH_UPPER[ch] : SR_MAP[ch];
      }
      return SR_MAP[ch] ?? ch;
    })
    .join("");
}

/** Recursively transliterate every string in a JSON-like value. */
export function deepTranslit<T>(v: T): T {
  if (typeof v === "string") return srCyrlToLatn(v) as T;
  if (Array.isArray(v)) return v.map(deepTranslit) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepTranslit(x)])) as T;
  return v;
}
