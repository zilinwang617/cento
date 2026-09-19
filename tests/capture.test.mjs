import test from "node:test";
import assert from "node:assert/strict";
import { CaptureError, classifyFontFamily, combineTypography, createNotesFromCapture, graphemeCount, hashText, sanitizeUrl, splitSelection } from "../src/capture.js";

const measure = (text) => graphemeCount(text) * 10;

test("captures respect sentence, word, grapheme and width limits", () => {
  const pieces = splitSelection("A short sentence. This sentence contains enough ordinary words to require several separate pieces.\n你好世界，这是另一段文字。", measure,
    { selectionGraphemes: 4000, pieceGraphemes: 18, textWidth: 120 });
  assert.ok(pieces.length > 4);
  assert.ok(pieces.every((piece) => graphemeCount(piece) <= 18 && measure(piece) <= 120));
  assert.equal(pieces.join(" ").replace(/\s+/g, " ").includes("A short sentence."), true);
});

test("emoji clusters and long unbroken words are never split inside a grapheme", () => {
  const pieces = splitSelection("👨‍👩‍👧‍👦👨‍👩‍👧‍👦 supercalifragilisticexpialidocious", measure,
    { selectionGraphemes: 100, pieceGraphemes: 5, textWidth: 50 });
  assert.equal(pieces[0], "👨‍👩‍👧‍👦👨‍👩‍👧‍👦");
  assert.ok(pieces.slice(1).every((piece) => graphemeCount(piece) <= 5));
});

test("overlong and empty captures fail atomically", () => {
  assert.throws(() => splitSelection("", measure), (error) => error instanceof CaptureError && error.code === "empty");
  assert.throws(() => splitSelection("x".repeat(4001), measure), (error) => error instanceof CaptureError && error.code === "selection-too-long");
});

test("font classification is weighted and retains the dominant source stack", () => {
  assert.equal(classifyFontFamily("Inter, Arial, sans-serif"), "sans");
  assert.equal(classifyFontFamily("Georgia, serif"), "serif");
  assert.equal(classifyFontFamily("Menlo, monospace"), "mono");
  assert.deepEqual(combineTypography([{ fontFamily: "Georgia, serif", length: 80 }, { fontFamily: "Arial, sans-serif", length: 20 }]),
    { sourceFontStack: "Georgia, serif", category: "serif", confidence: 0.8 });
  assert.equal(combineTypography([{ fontFamily: "Georgia, serif", length: 50 }, { fontFamily: "Arial, sans-serif", length: 50 }]).category, "mixed");
});

test("capture notes contain UUID-like unique IDs, source metadata and deterministic sizes", () => {
  let id = 0;
  const notes = createNotesFromCapture({ text: "the moon remembers", source: { url: "https://example.com/story?token=secret#quote", title: "Story" },
    typography: { sourceFontStack: "Georgia, serif", category: "serif", confidence: 1 } }, measure, () => `uuid-${++id}`);
  assert.deepEqual(notes.map((note) => note.id), ["uuid-1"]);
  assert.equal(notes[0].source.url, "https://example.com/story");
  assert.equal(notes[0].textWidth, 180);
  assert.equal(notes[0].width, 214);
  assert.equal(notes[0].typography.category, "serif");
  assert.equal(hashText("  hello  "), hashText("hello"));
  assert.equal(sanitizeUrl("chrome://extensions"), "");
});
