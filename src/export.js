import { ARTBOARD, LETTER, noteColors } from "./workspace.js";
import { displayFontSize } from "./tray.js";
import { createTextMeasure, fontShorthand, loadNoteFonts } from "./typeface.js";
import { FORTUNE } from "./fortune.js";

// The page is Letter, so the PNG is a whole 8.5 × 11 inches at print resolution — 2550 × 3300 —
// instead of an arbitrary multiple of the artboard. Deriving the scale from one edge and applying
// it to both is what keeps the export from ever drifting out of proportion with the page.
export const EXPORT_DPI = 300;

export async function renderPoem(notes, theme) {
  await loadNoteFonts();
  const measure = createTextMeasure();
  let fortuneEnds;
  if (notes.some((note) => note.kind === "fortune" && note.location !== "tray")) {
    fortuneEnds = new Image();
    fortuneEnds.src = FORTUNE.endsAsset;
    await fortuneEnds.decode();
  }
  const canvas = document.createElement("canvas");
  const resolution = LETTER.width * EXPORT_DPI / ARTBOARD.width;
  canvas.width = Math.round(ARTBOARD.width * resolution);
  canvas.height = Math.round(ARTBOARD.height * resolution);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is unavailable.");
  context.scale(resolution, resolution);
  context.fillStyle = theme.page;
  context.fillRect(0, 0, ARTBOARD.width, ARTBOARD.height);
  if (theme.texture) {
    const texture = new Image();
    texture.src = theme.texture;
    await texture.decode();
    // Match the page and swatch's centered object-fit: cover, including Figma's fill opacity.
    const fit = Math.max(ARTBOARD.width / texture.naturalWidth, ARTBOARD.height / texture.naturalHeight);
    const width = texture.naturalWidth * fit;
    const height = texture.naturalHeight * fit;
    context.save();
    context.globalAlpha = theme.textureOpacity;
    context.drawImage(texture, (ARTBOARD.width - width) / 2, (ARTBOARD.height - height) / 2, width, height);
    context.restore();
  }
  context.translate(-ARTBOARD.x, -ARTBOARD.y);
  // Clip to the page: tray, tools and off-page parts are never exported.
  for (const note of notes.filter((item) => item.location !== "tray").sort((a, b) => a.z - b.z)) {
    const colors = noteColors(note, theme);
    context.save();
    context.translate(note.x + note.width / 2, note.y + note.height / 2);
    context.rotate(note.angle * Math.PI / 180);
    context.shadowColor = "rgba(0, 0, 0, 0.15)";
    context.shadowOffsetY = (note.kind === "fortune" ? 4 : 2) * resolution;
    context.shadowBlur = (note.kind === "fortune" ? 4 : 2) * resolution;
    context.fillStyle = colors.paper;
    context.fillRect(-note.width / 2, -note.height / 2, note.width, note.height);
    context.shadowColor = "transparent";
    if (note.kind === "fortune" && fortuneEnds) {
      const edge = Math.min(FORTUNE.endWidth, note.width);
      if (note.fortuneLeft) context.drawImage(fortuneEnds, 0, 0, edge, 52, -note.width / 2, -note.height / 2, edge, note.height);
      if (note.fortuneRight) context.drawImage(fortuneEnds, 376.5 - edge, 0, edge, 52, note.width / 2 - edge, -note.height / 2, edge, note.height);
    }
    context.fillStyle = "rgba(255,255,255,0.09)";
    context.fillRect(-note.width / 2, -note.height / 2, note.width, 0.5);
    context.fillStyle = colors.ink;
    context.font = fontShorthand(note.typeface, displayFontSize(note, measure(note.text, note.typeface)));
    context.textAlign = note.textOffset == null ? "center" : "left";
    context.textBaseline = "middle";
    context.fillText(note.text, note.textOffset == null ? 0 : -note.width / 2 + note.textOffset, 2);
    context.restore();
  }
  return canvas;
}

export async function exportPoem(notes, theme) {
  const canvas = await renderPoem(notes, theme);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not create the image.")), "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cut-ups-poem.png";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
