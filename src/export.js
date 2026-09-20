import { ARTBOARD, LETTER, noteColors } from "./workspace.js";
import { displayFontSize } from "./tray.js";
import { TEXTURE, calibrate, coverRect, loadTextures, texture, texturePlacement } from "./texture.js";
import { createTextMeasure, fontShorthand, loadNoteFonts } from "./typeface.js";
import { FORTUNE } from "./fortune.js";

// The page is Letter, so the PNG is a whole 8.5 × 11 inches at print resolution — 2550 × 3300 —
// instead of an arbitrary multiple of the artboard. Deriving the scale from one edge and applying
// it to both is what keeps the export from ever drifting out of proportion with the page.
export const EXPORT_DPI = 300;

export async function renderPoem(notes, theme) {
  await loadNoteFonts();
  const measure = createTextMeasure();
  const printed = notes.filter((note) => note.location !== "tray");
  // One decode per paper for the whole page, not one per strip: a page can hold eighty.
  const papers = await loadTextures(printed.filter((note) => note.kind !== "fortune").map((note) => note.texture));
  // A PNG gets no second pass, so the strips' per-patch lift has to be measured before this one.
  await calibrate([...papers.keys()]);
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
    const sheet = new Image();
    sheet.src = theme.texture;
    await sheet.decode();
    // Match the page and swatch's centered object-fit: cover, including Figma's fill opacity.
    const area = coverRect({ x: 0, y: 0, width: ARTBOARD.width, height: ARTBOARD.height }, sheet);
    context.save();
    context.globalAlpha = theme.textureOpacity;
    context.drawImage(sheet, area.x, area.y, area.width, area.height);
    context.restore();
  }
  context.translate(-ARTBOARD.x, -ARTBOARD.y);
  // Clip to the page: tray, tools and off-page parts are never exported.
  for (const note of printed.sort((a, b) => a.z - b.z)) {
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
    // The paper, multiplied onto the fill exactly as .paper-face::after does. Clipping to the
    // strip keeps multiply off the page underneath — inside the clip there is only the opaque
    // fill drawn a moment ago. Shadow is already off, or the paper would cast a second one.
    const paper = note.kind === "fortune" ? null : papers.get(note.texture);
    if (paper) {
      const patch = texturePlacement(note.id, note.width, note.height);
      context.save();
      context.beginPath();
      context.rect(-note.width / 2, -note.height / 2, note.width, note.height);
      context.clip();
      context.globalCompositeOperation = "multiply";
      context.globalAlpha = texture(note.texture).opacity;
      // Same workspace pixels CSS uses: the sheet at TEXTURE size, its corner at the same patch.
      context.drawImage(paper, -note.width / 2 + patch.x, -note.height / 2 + patch.y, TEXTURE.width, TEXTURE.height);
      // restore() puts back globalCompositeOperation too — without it the multiply would leak onto
      // the ink, and onto every strip drawn after this one.
      context.restore();
    }
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
