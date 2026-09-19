import { ARTBOARD, noteColors } from "./workspace.js";

export async function renderPoem(notes, theme) {
  await document.fonts.load('18px "Special Elite"');
  const canvas = document.createElement("canvas");
  const resolution = 2;
  canvas.width = ARTBOARD.width * resolution;
  canvas.height = ARTBOARD.height * resolution;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is unavailable.");
  context.scale(resolution, resolution);
  context.fillStyle = theme.page;
  context.fillRect(0, 0, ARTBOARD.width, ARTBOARD.height);
  context.translate(-ARTBOARD.x, -ARTBOARD.y);
  // Clip to the page: tray, tools and off-page parts are never exported.
  for (const note of notes.filter((item) => item.location !== "tray").sort((a, b) => a.z - b.z)) {
    const colors = noteColors(note, theme);
    context.save();
    context.translate(note.x + note.width / 2, note.y + note.height / 2);
    context.rotate(note.angle * Math.PI / 180);
    context.shadowColor = "rgba(0, 0, 0, 0.15)";
    context.shadowOffsetY = 2 * resolution;
    context.shadowBlur = 2 * resolution;
    context.fillStyle = colors.paper;
    context.fillRect(-note.width / 2, -note.height / 2, note.width, note.height);
    context.shadowColor = "transparent";
    context.fillStyle = "rgba(255,255,255,0.09)";
    context.fillRect(-note.width / 2, -note.height / 2, note.width, 0.5);
    context.fillStyle = colors.ink;
    context.font = `${note.fontSize || 18}px "Special Elite"`;
    context.textAlign = note.textOffset == null ? "center" : "left";
    context.textBaseline = "middle";
    context.fillText(note.text, note.textOffset == null ? 0 : -note.width / 2 + note.textOffset, 1);
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
