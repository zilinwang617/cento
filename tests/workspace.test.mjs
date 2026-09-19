import test from "node:test";
import assert from "node:assert/strict";
import { ARTBOARD, WORLD, INITIAL_NOTES, THEMES, constrainNote, noteBounds, cutText, placeCuts, noteColors } from "../src/workspace.js";

test("cutting preserves punctuation, handles line endings, and ignores blank pieces", () => {
  assert.deepEqual(cutText("  the moon,\n remembers.  "), ["the", "moon,", "remembers."]);
  assert.deepEqual(cutText(" the moon,\r\n\r\n remembers.  ", "lines"), ["the moon,", "remembers."]);
  assert.deepEqual(cutText(" \n\t "), []);
});

test("resting reference positions remain unchanged by constraints", () => {
  for (const note of INITIAL_NOTES) assert.deepEqual(constrainNote(note), { x: note.x, y: note.y });
});

test("all rotated corners stay inside the desktop at every edge", () => {
  for (const angle of [-7, -2, 0, 5, 12]) {
    for (const [x, y] of [[-900, -900], [3000, 3000], [-100, 600], [700, 2000]]) {
      const note = { x, y, width: 382, height: 43, angle };
      const result = noteBounds({ ...note, ...constrainNote(note) });
      assert.ok(result.x >= 14 - 1e-8);
      assert.ok(result.y >= 14 - 1e-8);
      assert.ok(result.x + result.width <= WORLD.width - 14 + 1e-8);
      assert.ok(result.y + result.height <= WORLD.height - 14 + 1e-8);
    }
  }
});

test("new cuts fit the tray, stay visible, and keep their text", () => {
  const words = Array.from({ length: 70 }, (_, index) => `word-${index}`);
  const cuts = placeCuts(words, words.map((_, index) => index % 4 === 0 ? 720 : 86), 7);
  assert.equal(cuts.length, 70);
  cuts.forEach((note, index) => {
    const bounds = noteBounds(note);
    assert.equal(note.text, words[index]);
    assert.ok(bounds.x >= 14);
    assert.ok(bounds.x + bounds.width < ARTBOARD.x);
    assert.ok(bounds.y >= 14);
    assert.ok(bounds.y + bounds.height < WORLD.height);
    assert.ok(note.fontSize <= 18 && note.fontSize > 0);
  });
});

test("palette follows paper center; tray remains cobalt in the teal style", () => {
  const theme = THEMES.find((item) => item.id === "tidal");
  assert.deepEqual(noteColors(INITIAL_NOTES[0], theme), { paper: "#f5f1df", ink: "#48413d" });
  assert.deepEqual(noteColors(INITIAL_NOTES[2], theme), { paper: "#1a3b9e", ink: "#ffffff" });
  const crossing = { ...INITIAL_NOTES[0], x: ARTBOARD.x - INITIAL_NOTES[0].width / 2 };
  assert.equal(noteColors(crossing, theme).paper, theme.strip);
  assert.equal(noteColors({ ...crossing, x: crossing.x - 1 }, theme).paper, "#1a3b9e");
});
