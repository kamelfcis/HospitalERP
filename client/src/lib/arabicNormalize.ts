export function normalizeArabic(text: string): string {
  let n = text;
  n = n.replace(/[أإآ]/g, "ا");
  n = n.replace(/ى/g, "ي");
  n = n.replace(/ة/g, "ه");
  n = n.replace(/ـ/g, "");
  n = n.replace(/[\u064B-\u065F]/g, "");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}
