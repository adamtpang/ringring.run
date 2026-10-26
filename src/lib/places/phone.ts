// Display formatting for phone numbers from OpenStreetMap, which stores them in
// many shapes ("+1 5122985223", "512.298.5223", "+1-512-298-5223;+1-512-...").
// US and Canada numbers become "(512) 298-5223"; anything else is left as written.

function formatOne(raw: string): string {
  const s = raw.trim();
  const ext = s.match(/\s*(?:ext\.?|x|#)\s*(\d{1,6})\s*$/i);
  const main = ext ? s.slice(0, ext.index) : s;
  // Only reformat values that are plainly a phone number: digits and separators.
  if (!/^[+\d\s().-]+$/.test(main)) return s;
  let d = main.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  else if (main.trim().startsWith("+") && !main.trim().startsWith("+1")) return s;
  if (d.length !== 10 || /^[01]/.test(d)) return s;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}${ext ? ` ext. ${ext[1]}` : ""}`;
}

/** "(512) 298-5223", or several joined with ", ". */
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(/\s*[;,/]\s*/).map(formatOne).filter(Boolean);
  return parts.length ? [...new Set(parts)].join(", ") : null;
}

/** A tel: link for the first number. */
export function telHref(phone: string): string {
  const first = phone.split(",")[0] ?? phone;
  const main = first.replace(/\s*ext\..*$/i, "");
  const d = main.replace(/[^\d+]/g, "");
  if (/^\(\d{3}\) \d{3}-\d{4}/.test(first)) return `tel:+1${d}`;
  return `tel:${d}`;
}
