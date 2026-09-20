import { liftedPaper } from "./texture.js";

export const WORLD = { width: 1440, height: 1024 };
// The sheet is US Letter, in inches, so the export can be a whole 8.5 × 11 rather than an arbitrary
// multiple of the artboard.
export const LETTER = { width: 8.5, height: 11 };
// Height is the fixed side: 888 leaves an even 68px above and below inside the 1024-tall world, and
// the width follows from the proportion. Figma's 686 was 0.026% off Letter; deriving it keeps the
// page honest, and every consumer — the CSS sheets, isOnPage, the export — reads it from here.
export const ARTBOARD = { x: 550, y: 68, width: 888 * LETTER.width / LETTER.height, height: 888 };
export const THEMES = [
  { id: "original", name: "Original", page: "#f5f1e1", texture: "/assets/paper-original.png", textureOpacity: 0.5, back: "#668a8e", strip: "#2f5493", ink: "#ffffff" },
  { id: "tidal", name: "Tidal", page: "#6e898d", texture: "/assets/paper-tidal.png", textureOpacity: 0.2, back: "#f5f1df", strip: "#f5f1df", ink: "#48413d" },
  { id: "lilac", name: "Lilac", page: "#ad9bc0", texture: "/assets/paper-lilac.png", textureOpacity: 0.15, back: "#f2ac76", strip: "#f5f1df", ink: "#48413d" },
  { id: "poppy", name: "Poppy", page: "#bf6051", back: "#d9b8da", strip: "#f5f1df", ink: "#48413d" },
  { id: "midnight", name: "Midnight", page: "#2a3c57", texture: "/assets/paper-midnight.png", textureOpacity: 0.2, back: "#c5b38a", strip: "#e8c77e", ink: "#253c59" },
  // Figma's black paper is translucent over the Colors & Typography frame's #464646.
  { id: "monochrome", name: "Black & White", page: "#464646", texture: "/assets/paper-monochrome.png", textureOpacity: 0.54, back: "#cecece", strip: "#cecece", ink: "#1f1f1f" },
];
export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

// Tilt comes from a fixed library rather than a fresh roll: ten angles a side, following the
// quantiles of a normal curve so the shallow ones far outnumber the rakish ones. Four of the ten
// sit under 2°, six under 3°, and the 8° is the single strip per deck that really got thrown — the
// one that gives a page its energy. Spaced to land σ on 3.6, which puts 2σ at ±7 with 8 as the hard
// ceiling. Written out, the whole range is legible and tunable here instead of implied by a
// formula: move a number and you know exactly what you changed.
export const TILT_LIBRARY = [0.3, 0.7, 1.1, 1.5, 1.9, 2.4, 3, 3.8, 5.2, 8]
  .flatMap((degrees) => [-degrees, degrees]);

function shuffled(values, random) {
  const deck = [...values];
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

let deck = [];
let lastTilt = null;

// Dealt from a shuffled deck, not drawn independently. Twenty strips laid on the desk then use
// every angle exactly once, instead of landing on the same one twice by chance and reading as a
// grid — the spread a person sees is the spread that was designed. The deck reshuffles when spent,
// and never repeats across the seam.
export function nextTilt(random = Math.random) {
  if (!deck.length) {
    deck = shuffled(TILT_LIBRARY, random);
    if (deck.at(-1) === lastTilt) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
  }
  lastTilt = deck.pop();
  return lastTilt;
}

export function noteBounds(note) {
  const angle = note.angle * Math.PI / 180;
  const width = Math.abs(note.width * Math.cos(angle)) + Math.abs(note.height * Math.sin(angle));
  const height = Math.abs(note.width * Math.sin(angle)) + Math.abs(note.height * Math.cos(angle));
  return { x: note.x + (note.width - width) / 2, y: note.y + (note.height - height) / 2, width, height };
}

export function constrainNote(note) {
  const bounds = noteBounds(note);
  const gutter = 14;
  return {
    x: note.x + (clamp(bounds.x, gutter, WORLD.width - bounds.width - gutter) - bounds.x),
    y: note.y + (clamp(bounds.y, gutter, WORLD.height - bounds.height - gutter) - bounds.y),
  };
}

// Figma Desktop - 5 (`19:7`): the bin sits in the right-hand margin, clear of the page.
export const TRASH = { x: 1245, y: 404, width: 185, height: 301 };
// Forgiving on the three sides that face empty desk, tight on the left so a strip resting
// against the page's right edge is never mistaken for a throw-away.
const TRASH_REACH = { left: 4, top: 22, right: 22, bottom: 22 };

export function isOverTrash(point) {
  return point.x >= TRASH.x - TRASH_REACH.left && point.x <= TRASH.x + TRASH.width + TRASH_REACH.right
    && point.y >= TRASH.y - TRASH_REACH.top && point.y <= TRASH.y + TRASH.height + TRASH_REACH.bottom;
}

export function isOnPage(note) {
  const x = note.x + note.width / 2;
  const y = note.y + note.height / 2;
  return x >= ARTBOARD.x && x <= ARTBOARD.x + ARTBOARD.width && y >= ARTBOARD.y && y <= ARTBOARD.y + ARTBOARD.height;
}

export function noteColors(note, theme) {
  if (note.kind === "fortune") return { paper: "#ffffff", ink: "#364891" };
  // Paper keeps the active palette in the tray, while dragging, and on the page. It is handed over
  // lifted for the patch of paper this particular strip is printed on, so that multiplying that
  // patch over it averages back out to the palette colour rather than a shade under — texture.js.
  return { paper: liftedPaper(theme.strip, note), ink: theme.ink };
}

export function cutText(text, mode = "words") {
  return text.split(mode === "lines" ? /\r?\n/ : /\s+/u).map((part) => part.trim()).filter(Boolean);
}

export function placeCuts(pieces, measuredWidths) {
  // Coordinates for tray notes are derived by packTray, never scattered or wrapped.
  return pieces.map((text, index) => {
    const textWidth = measuredWidths[index];
    const width = Math.min(382, Math.max(78, textWidth + 34));
    const fontSize = Math.min(18, 18 * (width - 34) / Math.max(1, textWidth));
    return { text, location: "tray", x: 36, y: 68, width, textWidth, height: 43, fontSize, angle: 0 };
  });
}
