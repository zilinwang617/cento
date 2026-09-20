import { makeNoteId } from "./note-store.js";
import { pickTypeface, referenceSize, typefacePool } from "./typeface.js";

export const CAPTURE_LIMITS = { selectionGraphemes: 4000, pieceGraphemes: 60, textWidth: 348 };

export class CaptureError extends Error {
  constructor(code, message) { super(message); this.name = "CaptureError"; this.code = code; }
}

const graphemeSegmenter = typeof Intl?.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const sentenceSegmenter = typeof Intl?.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "sentence" }) : null;
const wordSegmenter = typeof Intl?.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;

export function graphemes(text) {
  return graphemeSegmenter ? [...graphemeSegmenter.segment(text)].map((item) => item.segment) : Array.from(text);
}

export function graphemeCount(text) {
  return graphemes(text).length;
}

export function normalizeSelection(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").replace(/[\t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function hashText(text) {
  let hash = 2166136261;
  for (const char of normalizeSelection(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:", "file:"].includes(url.protocol)) return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}

export function classifyFontFamily(value) {
  const family = String(value ?? "").toLowerCase();
  if (!family) return "unknown";
  if (/\b(monospace|ui-monospace|courier|consolas|menlo|monaco|source code|roboto mono)\b/.test(family)) return "mono";
  if (/\b(cursive|handwriting|handwritten|script|pacifico|comic sans|brush script|dancing script)\b/.test(family)) return "handwritten";
  if (/\b(fantasy|display|impact|bebas|blackletter|decorative)\b/.test(family)) return "display";
  if (/\b(sans-serif|ui-sans-serif|system-ui|arial|helvetica|inter|roboto|verdana|tahoma|segoe)\b/.test(family)) return "sans";
  if (/\b(serif|ui-serif|times|georgia|garamond|baskerville|didot|palatino)\b/.test(family)) return "serif";
  return "unknown";
}

export function combineTypography(runs = []) {
  const weights = new Map();
  const families = new Map();
  let total = 0;
  for (const run of runs) {
    const length = Math.max(0, Number(run.length) || 0);
    if (!length) continue;
    const fontFamily = String(run.fontFamily ?? "");
    const category = classifyFontFamily(fontFamily);
    weights.set(category, (weights.get(category) ?? 0) + length);
    families.set(fontFamily, (families.get(fontFamily) ?? 0) + length);
    total += length;
  }
  if (!total) return { sourceFontStack: "", category: "unknown", confidence: 0 };
  const [category, weight] = [...weights].sort((a, b) => b[1] - a[1])[0];
  const [sourceFontStack] = [...families].sort((a, b) => b[1] - a[1])[0];
  const confidence = weight / total;
  const knownCategories = [...weights].filter(([name]) => name !== "unknown" && name !== category && weights.get(name) > total * 0.2);
  return { sourceFontStack, category: knownCategories.length || (category === "unknown" && weights.size > 1) ? "mixed" : category,
    confidence: Math.round(confidence * 100) / 100 };
}

const fits = (text, measure, limits) => graphemeCount(text) <= limits.pieceGraphemes && measure(text) <= limits.textWidth;

function splitLongSegment(segment, measure, limits) {
  const pieces = [];
  let current = "";
  for (const glyph of graphemes(segment)) {
    const candidate = current + glyph;
    if (current && !fits(candidate, measure, limits)) { pieces.push(current); current = glyph; }
    else current = candidate;
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

function splitSentence(sentence, measure, limits) {
  const segments = wordSegmenter ? [...wordSegmenter.segment(sentence)].map((item) => item.segment) : sentence.split(/(\s+)/u);
  const pieces = [];
  let current = "";
  const flush = () => { const value = current.trim(); if (value) pieces.push(value); current = ""; };
  for (const segment of segments) {
    const candidate = (current + segment).trimStart();
    if (!candidate) continue;
    if (fits(candidate.trimEnd(), measure, limits)) { current = candidate; continue; }
    flush();
    const value = segment.trim();
    if (!value) continue;
    if (fits(value, measure, limits)) current = value;
    else pieces.push(...splitLongSegment(value, measure, limits));
  }
  flush();
  return pieces;
}

// A piece with no letter, digit or pictograph is punctuation the split stranded: the last word
// filled the strip and its full stop was flushed on alone. A strip holding just "." is nothing to
// arrange, so it is dropped rather than merged back — these are fragments anyway, and a cut-up
// never misses the period. Pictographs count as content so an emoji is never silently discarded.
const hasContent = (text) => /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(text);

export function splitSelection(text, measure, limits = CAPTURE_LIMITS) {
  const normalized = normalizeSelection(text);
  if (!normalized) throw new CaptureError("empty", "Select a little text first.");
  if (graphemeCount(normalized) > limits.selectionGraphemes) throw new CaptureError("selection-too-long", "Keep one capture under 4,000 characters.");
  const pieces = [];
  for (const paragraph of normalized.split(/\n+/u).filter(Boolean)) {
    const sentences = sentenceSegmenter ? [...sentenceSegmenter.segment(paragraph)].map((item) => item.segment) : paragraph.split(/(?<=[.!?。！？])\s*/u);
    for (const sentence of sentences) pieces.push(...splitSentence(sentence, measure, limits));
  }
  const kept = pieces.filter(hasContent);
  // A selection that was only punctuation leaves nothing to collect.
  if (!kept.length) throw new CaptureError("empty", "Select a little text first.");
  return kept;
}

export function createNotesFromCapture(candidate, measure, idFactory = makeNoteId, random = Math.random) {
  const source = { url: sanitizeUrl(candidate.source?.url), title: String(candidate.source?.title ?? "").slice(0, 300),
    capturedAt: candidate.source?.capturedAt ?? new Date().toISOString() };
  const typography = { sourceFontStack: String(candidate.typography?.sourceFontStack ?? "").slice(0, 500),
    category: candidate.typography?.category ?? "unknown", confidence: Number(candidate.typography?.confidence) || 0 };
  // Each piece draws its own face, so split against the widest one in the pool: whichever face a
  // piece lands on, it still fits the strip it was cut to.
  const pool = typefacePool(typography.category);
  const widest = (text) => pool.reduce((maximum, face) => Math.max(maximum, measure(text, face.id)), 0);
  const pieces = splitSelection(candidate.text, widest);
  return pieces.map((text) => {
    const typeface = pickTypeface(typography.category, random);
    const textWidth = measure(text, typeface);
    const width = Math.min(382, Math.max(78, textWidth + 34));
    const reference = referenceSize(typeface);
    return { id: idFactory(), text, location: "tray", x: 36, y: 68, width, textWidth, height: 43,
      fontSize: Math.min(reference, reference * (width - 34) / Math.max(1, textWidth)), typefaceSize: reference, angle: 0, z: 1, typeface, source, typography };
  });
}
