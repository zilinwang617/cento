// The faces kept from the Figma "Colors & Typography" frame (RNdrvPrcyNqPQ32ICmm4Pa, 21:10).
// Lato was dropped by hand and Lexend Giga took its slot in the frame; sans carries two faces.
// `category` reuses the vocabulary classifyFontFamily() produces for source pages, so a capture's
// category names the pool it draws from. Special Elite ships locally; the rest come from the
// Google Fonts CDN, so every stack ends in a same-category system fallback for offline reads.
// `figmaSize` is the size that frame sets each face at: 15 for the two that run optically large,
// 16 for the rest. Holding those ratios against our own base reproduces the frame's balance.
// The handwritten face runs at 700: Charmonman's regular is a hairline against the others, and a
// bold stroke is what reads as ink on paper at strip size.
export const TYPEFACES = [
  { id: "special-elite", family: "Special Elite", category: "display", figmaSize: 16, weight: 400, fallback: "Georgia, serif" },
  { id: "charmonman", family: "Charmonman", category: "handwritten", figmaSize: 18, size: 18, weight: 700, fallback: "\"Segoe Script\", cursive" },
  { id: "libre-baskerville", family: "Libre Baskerville", category: "serif", figmaSize: 15, weight: 400, fallback: "Georgia, serif" },
  { id: "poppins", family: "Poppins", category: "sans", figmaSize: 15, weight: 400, fallback: "Helvetica, Arial, sans-serif" },
  { id: "lexend-giga", family: "Lexend Giga", category: "sans", figmaSize: 15, weight: 400, fallback: "Verdana, Helvetica, sans-serif" },
];

export const DEFAULT_TYPEFACE = "special-elite";
export const BASE_TYPE_SIZE = 18;
const FIGMA_BASE_SIZE = 16;

// Source categories the library cannot answer — mono, mixed, unknown — collapse to "other",
// which draws from the whole library rather than quietly defaulting to one.
export const OTHER_CATEGORY = "other";

// Special Elite is the local file; the rest are requested here. The <link> in index.html and
// extension/sidepanel.html must stay identical to this.
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Charmonman:wght@700&family=Lexend+Giga&family=Libre+Baskerville&family=Poppins&display=swap";

// Fortune's face is recognized by notes/export, but never enters the capture font lottery.
const FORTUNE_FACE = { id: "abeezee", family: "ABeeZee", category: "sans", size: 20, weight: 400, fallback: "Arial, sans-serif" };
const byId = new Map([...TYPEFACES, FORTUNE_FACE].map((face) => [face.id, face]));
const byCategory = new Map();
for (const face of TYPEFACES) byCategory.set(face.category, [...(byCategory.get(face.category) ?? []), face]);

export function typeface(id) {
  return byId.get(id) ?? byId.get(DEFAULT_TYPEFACE);
}

export function isTypefaceId(value) {
  return byId.has(value);
}

export function libraryCategory(category) {
  return byCategory.has(category) ? category : OTHER_CATEGORY;
}

export function typefacePool(category) {
  return byCategory.get(libraryCategory(category)) ?? TYPEFACES;
}

export function pickTypeface(category, random = Math.random) {
  const pool = typefacePool(category);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].id;
}

// Notes authored before typefaces existed carry no stored id. Seeding the draw with the note ID
// keeps it random-looking yet identical on every reload, re-render and export.
export function seededTypeface(category, seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const pool = typefacePool(category);
  return pool[(hash >>> 0) % pool.length].id;
}

export function fontStack(id) {
  const face = typeface(id);
  return `"${face.family}", ${face.fallback}`;
}

// The size a strip is set in when nothing forces it smaller, scaled per face the way Figma does.
export function referenceSize(id) {
  const face = typeface(id);
  // Explicit sizes are actual workspace pixels, not Figma ratios to scale a second time.
  return face.size ?? BASE_TYPE_SIZE * face.figmaSize / FIGMA_BASE_SIZE;
}

export function fontWeight(id) {
  return typeface(id).weight;
}

export function fontShorthand(id, size = referenceSize(id)) {
  return `${fontWeight(id)} ${size}px ${fontStack(id)}`;
}

// Widths are measured at each face's reference size; displayFontSize() scales from there.
export function createTextMeasure() {
  const context = document.createElement("canvas").getContext("2d");
  let applied = "";
  return (text, typefaceId) => {
    const font = fontShorthand(typefaceId);
    if (font !== applied) { context.font = font; applied = font; }
    return context.measureText(text).width;
  };
}

export function loadNoteFonts() {
  return Promise.all([...TYPEFACES, FORTUNE_FACE].map((face) => document.fonts.load(`${face.weight} ${referenceSize(face.id)}px "${face.family}"`)));
}
