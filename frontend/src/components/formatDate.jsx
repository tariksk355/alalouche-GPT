const TZ = "Europe/Zurich";

// Forces UTC parsing regardless of string format
function toDate(dateStr) {
  if (!dateStr) return null;
  // If string has no timezone indicator, treat it as UTC
  const s = String(dateStr);
  const normalized = s.endsWith("Z") || s.includes("+") ? s : s + "Z";
  return new Date(normalized);
}

export function formatTime(dateStr) {
  const d = toDate(dateStr);
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-CH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
}

export function formatDate(dateStr) {
  const d = toDate(dateStr);
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-CH", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
}

export function formatDateFull(dateStr) {
  const d = toDate(dateStr);
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-CH", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}