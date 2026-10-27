/** WCAG 2 contrast helpers. Pure; used by /design, tests/contrast.test.ts and scripts/contrast.ts. */
export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

/** Composite a translucent color over an opaque one (what a soft badge fill looks like on a card). */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((v, i) => Math.round(v * alpha + (bg[i] ?? 0) * (1 - alpha))) as Rgb;
}

export function luminance([r, g, b]: Rgb) {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: Rgb | string, b: Rgb | string) {
  const x = luminance(typeof a === "string" ? hexToRgb(a) : a);
  const y = luminance(typeof b === "string" ? hexToRgb(b) : b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Reads `--pal-*: #hex` and `--color-*-soft-raw: rgba(...)` pairs out of tokens.css (first, light block wins). */
export function readPalette(css: string) {
  const hex: Record<string, string> = {};
  for (const m of css.matchAll(/--pal-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) if (m[1] && m[2]) hex[m[1]] ??= m[2];
  return hex;
}

export type Pair = { label: string; fg: Rgb; bg: Rgb; min: number };

/** Every text/background pairing the light theme uses. `min` is 4.5 for text, 3 for large display numbers. */
export function lightPairs(css: string): Pair[] {
  const p = readPalette(css);
  const c = (k: string) => {
    if (!p[k]) throw new Error(`tokens.css is missing --pal-${k}`);
    return hexToRgb(p[k]);
  };
  const white: Rgb = [255, 255, 255];
  const canvas = hexToRgb("#fbfbfd");
  const mist = hexToRgb("#f5f5f7");
  const soft = (k: string, a: number, bg: Rgb = white) => over(c(k), a, bg);
  return [
    { label: "accent (ringy-ink) on white", fg: c("ringy-ink"), bg: white, min: 4.5 },
    { label: "accent (ringy-ink) on canvas", fg: c("ringy-ink"), bg: canvas, min: 4.5 },
    { label: "accent (ringy-ink) on mist", fg: c("ringy-ink"), bg: mist, min: 4.5 },
    { label: "accent badge: ringy-ink on ringy 18%", fg: c("ringy-ink"), bg: soft("ringy", 0.18), min: 4.5 },
    { label: "accent badge on mist card", fg: c("ringy-ink"), bg: soft("ringy", 0.18, mist), min: 4.5 },
    { label: "primary button: ringy-on on ringy", fg: c("ringy-on"), bg: c("ringy"), min: 4.5 },
    { label: "primary hover: ringy-on on ringy-hover", fg: c("ringy-on"), bg: c("ringy-hover"), min: 4.5 },
    { label: "success badge: ringy-ink on lime 45%", fg: c("ringy-ink"), bg: soft("lime", 0.45), min: 4.5 },
    { label: "success badge on mist card", fg: c("ringy-ink"), bg: soft("lime", 0.45, mist), min: 4.5 },
    { label: "rungy text on white", fg: c("rungy-ink"), bg: white, min: 4.5 },
    { label: "rungy badge: rungy-ink on peach 22%", fg: c("rungy-ink"), bg: soft("rungy", 0.22), min: 4.5 },
    { label: "rungy button: rungy-on on peach", fg: c("rungy-on"), bg: c("rungy"), min: 4.5 },
    { label: "rungy hover: rungy-on on peach-hover", fg: c("rungy-on"), bg: c("rungy-hover"), min: 4.5 },
    { label: "danger (coral-ink) on white", fg: c("coral-ink"), bg: white, min: 4.5 },
    { label: "danger badge: coral-ink on coral 16%", fg: c("coral-ink"), bg: soft("coral", 0.16), min: 4.5 },
    { label: "danger badge on mist card", fg: c("coral-ink"), bg: soft("coral", 0.16, mist), min: 4.5 },
    { label: "warning (yellow-ink) on white", fg: c("yellow-ink"), bg: white, min: 4.5 },
    { label: "warning badge: yellow-ink on yellow 40%", fg: c("yellow-ink"), bg: soft("yellow", 0.4), min: 4.5 },
    { label: "warning badge on mist card", fg: c("yellow-ink"), bg: soft("yellow", 0.4, mist), min: 4.5 },
    { label: "ink on lime highlight", fg: hexToRgb("#1d1d1f"), bg: c("lime"), min: 4.5 },
    { label: "ink on yellow fill", fg: hexToRgb("#1d1d1f"), bg: c("yellow"), min: 4.5 },
  ];
}

/** Dark theme: raw hues are the text colors, on Surface #161618 and their soft tints. */
export function darkPairs(css: string): Pair[] {
  const p = readPalette(css);
  const c = (k: string) => hexToRgb(p[k] ?? "#000000");
  const surface = hexToRgb("#161618");
  const black: Rgb = [0, 0, 0];
  const coralDark = hexToRgb((css.match(/--color-danger-raw:\s*(#[0-9a-fA-F]{6})/) ?? [])[1] ?? "#f4847b");
  return [
    { label: "dark accent: ringy on surface", fg: c("ringy"), bg: surface, min: 4.5 },
    { label: "dark accent badge: ringy on ringy 17%", fg: c("ringy"), bg: over(c("ringy"), 0.17, surface), min: 4.5 },
    { label: "dark rungy: peach on surface", fg: c("rungy"), bg: surface, min: 4.5 },
    { label: "dark warning: yellow on surface", fg: c("yellow"), bg: surface, min: 4.5 },
    { label: "dark danger on surface", fg: coralDark, bg: surface, min: 4.5 },
    { label: "dark danger badge", fg: coralDark, bg: over(c("coral"), 0.18, surface), min: 4.5 },
    { label: "dark danger on black", fg: coralDark, bg: black, min: 4.5 },
  ];
}
