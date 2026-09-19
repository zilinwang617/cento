export const WORLD = { width: 1440, height: 1024 };
export const ARTBOARD = { x: 550, y: 68, width: 686, height: 888 };
export const THEMES = [
  { id: "original", name: "Original", page: "#f5f1df", back: "#668a8e", strip: "#1a3b9e", ink: "#ffffff" },
  { id: "tidal", name: "Tidal", page: "#668a8e", back: "#f5f1df", strip: "#f5f1df", ink: "#48413d" },
  { id: "lilac", name: "Lilac", page: "#b09ac3", back: "#f2ac76", strip: "#f5f1df", ink: "#48413d" },
  { id: "poppy", name: "Poppy", page: "#cd594b", back: "#d9b8da", strip: "#f5f1df", ink: "#48413d" },
  { id: "midnight", name: "Midnight", page: "#253c59", back: "#c5b38a", strip: "#e8c77e", ink: "#253c59" },
];
const EXAMPLE_TEXT = [
  "the quiet between things", "stay", "a little longer", "blue", "as the afternoon",
  "nothing is ever quite still", "almost", "home", "where the light lands",
  "I kept the small things", "in my pocket", "rain", "and the sound of your name",
  "again", "somewhere beyond the window", "softly", "we begin", "the sea remembers",
  "what the shore forgets", "here", "a borrowed bit of sky", "slow", "down",
  "there is room for wonder", "under the same moon", "breathe", "between two ordinary days",
  "a small bright thing", "found", "the morning comes undone", "with you", "still",
];
export const INITIAL_NOTES = [
  { id: "note-1", location: "desk", text: "text", x: 636.031, y: 255.181, width: 117.213, height: 43, angle: 5, z: 10 },
  { id: "note-2", location: "desk", text: "longer text and such", x: 859.568, y: 251.944, width: 302.437, height: 43, angle: -2, z: 11 },
  { id: "note-3", location: "tray", text: "a much longer text and such", x: 77.66, y: 199.143, width: 295.479, height: 43, angle: -2, z: 12 },
  ...placeCuts(EXAMPLE_TEXT, EXAMPLE_TEXT.map((text) => text.length * 9.5)).map((note, index) => ({ ...note, id: `note-${index + 4}`, z: index + 13 })),
];
export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

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

export function isOnPage(note) {
  const x = note.x + note.width / 2;
  const y = note.y + note.height / 2;
  return x >= ARTBOARD.x && x <= ARTBOARD.x + ARTBOARD.width && y >= ARTBOARD.y && y <= ARTBOARD.y + ARTBOARD.height;
}

export function noteColors(note, theme) {
  const onPage = note.location === "tray" ? false : note.colorSource ? note.colorSource === "page" : isOnPage(note);
  return onPage ? { paper: theme.strip, ink: theme.ink } : { paper: "#1a3b9e", ink: "#ffffff" };
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
