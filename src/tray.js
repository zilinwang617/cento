import { clamp } from "./workspace.js";
import { referenceSize } from "./typeface.js";

export const TRAY = { width: 488, top: 52, bottom: 972, padding: 36, gapX: 18, gapY: 22, startY: 16, edge: 70, speed: 650 };
export const TRAY_CONTENT_WIDTH = TRAY.width - TRAY.padding * 2;

const settings = (options = {}) => ({ ...TRAY, ...options });

// Sequential packing deliberately leaves unused row space: filling it later would change reading order.
export function packTray(notes, options = {}) {
  const config = settings(options);
  const contentWidth = Math.max(1, config.width - config.padding * 2);
  let x = config.padding;
  let y = config.startY;
  let rowHeight = 0;
  const rows = [];
  const items = notes.map((note, index) => {
    const width = Math.min(note.width, contentWidth);
    if (x > config.padding && x + width > config.width - config.padding + 0.01) {
      y += rowHeight + config.gapY;
      x = config.padding;
      rowHeight = 0;
    }
    if (x === config.padding) rows.push({ y, height: 0, items: [] });
    const item = { ...note, intrinsicWidth: note.width, x, y, width, angle: 0, index };
    rows.at(-1).items.push(item);
    rowHeight = Math.max(rowHeight, note.height);
    rows.at(-1).height = rowHeight;
    x += width + config.gapX;
    return item;
  });
  return { items, rows, height: notes.length ? y + rowHeight : 0, config };
}

export const STRIP_PADDING = 34;

// Shrink a strip's type only far enough that its text still fits the strip.
export function displayFontSize(note, measuredTextWidth = note.textWidth) {
  const reference = referenceSize(note.typeface);
  const size = Math.min(note.fontSize || reference, reference);
  const intrinsic = Number.isFinite(note.intrinsicWidth) ? note.intrinsicWidth : note.width;
  // Scissors are not a resize. A cut half keeps the type its parent was printed in, and its text
  // already fits — the cut lands in a word gap. Only a strip the tray packs narrower than it was
  // built gives any of that back, and then it is the packing that asks, not the cut. The one cap
  // left is the strip's own edge: geometry measured under a face the library no longer carries can
  // outgrow it, and spilling ink past the paper is worse than a hair of shrink.
  if (note.textOffset != null && note.width >= intrinsic) {
    return Math.min(size, reference * note.width / Math.max(1, measuredTextWidth || note.width));
  }
  const budget = Number.isFinite(note.textWidth) ? note.textWidth : Math.max(1, intrinsic - STRIP_PADDING);
  const padding = Math.min(STRIP_PADDING, Math.max(0, intrinsic - budget));
  const available = Math.max(1, note.width - padding);
  return Math.min(size, reference * available / Math.max(1, measuredTextWidth || available));
}

export function insertAt(items, item, index) {
  const result = items.filter((entry) => entry.id !== item.id);
  result.splice(clamp(index, 0, result.length), 0, item);
  return result;
}

export function trayInsertionIndex(layout, point, draggingId, previousIndex, options = layout.config ?? {}) {
  const config = settings(options);
  const placeholder = layout.items.find((item) => item.id === draggingId);
  if (placeholder && point.x >= placeholder.x - config.gapX / 2 && point.x <= placeholder.x + placeholder.width + config.gapX / 2
    && point.y >= placeholder.y - config.gapY / 2 && point.y <= placeholder.y + placeholder.height + config.gapY / 2) return previousIndex;
  const others = layout.items.filter((item) => item.id !== draggingId);
  if (!others.length) return 0;
  const row = layout.rows.find((item, index) => {
    const next = layout.rows[index + 1];
    return !next || point.y < (item.y + item.height + next.y) / 2;
  });
  if (!row) return others.length;
  const rowItems = row.items.filter((item) => item.id !== draggingId);
  if (!rowItems.length) return previousIndex;
  const nextItem = rowItems.find((item) => point.x < item.x + item.width / 2);
  return nextItem ? others.findIndex((item) => item.id === nextItem.id) : others.findIndex((item) => item.id === rowItems.at(-1).id) + 1;
}

export function isInsideTray(point, options = {}) {
  const config = settings(options);
  return point.x >= 0 && point.x < config.width && point.y >= config.top && point.y <= config.bottom;
}

export function trayScrollSpeed(point, options = {}) {
  const config = settings(options);
  if (!isInsideTray(point, config)) return 0;
  if (point.y < config.top + config.edge) return -config.speed * clamp((config.top + config.edge - point.y) / config.edge, 0, 1);
  if (point.y > config.bottom - config.edge) return config.speed * clamp((point.y - config.bottom + config.edge) / config.edge, 0, 1);
  return 0;
}
