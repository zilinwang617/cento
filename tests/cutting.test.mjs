import test from "node:test";
import assert from "node:assert/strict";
import { wordRuns, paperLocalPoint, nearestCut, splitPaper } from "../src/cutting.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);
const note = { id: "test", text: "the moon remembers", x: 120, y: 230, width: 260, height: 43, angle: -5, fontSize: 18 };
const gap = { left: 100, right: 110, x: 105, textLeft: 40, leftEnd: 8, rightStart: 9 };

test("word boundaries retain punctuation and exclude blank/single-word cut points", () => {
  assert.deepEqual(wordRuns(" moon,   remembers. "), [
    { text: "moon,", start: 1, end: 6 }, { text: "remembers.", start: 9, end: 19 },
  ]);
  assert.equal(wordRuns("text").length - 1, 0);
  assert.equal(nearestCut([], { x: 5, y: 20 }, 43), null);
});

test("only the hovered gap is active, not text or empty space", () => {
  const gaps = [gap, { ...gap, x: 180, left: 175, right: 185 }];
  assert.equal(nearestCut(gaps, { x: 103, y: 20 }, 43), gap);
  assert.equal(nearestCut(gaps, { x: 180, y: 20 }, 43), gaps[1]);
  assert.equal(nearestCut(gaps, { x: 140, y: 20 }, 43), null);
  assert.equal(nearestCut(gaps, { x: 105, y: 60 }, 43), null);
});

test("cut targets accept a wider screen-pixel range at different desktop scales", () => {
  for (const scale of [0.5, 0.75, 1, 1.5]) {
    assert.equal(nearestCut([gap], { x: gap.x + 15 / scale, y: 20 }, 43, scale), gap);
    assert.equal(nearestCut([gap], { x: gap.x + 17 / scale, y: 20 }, 43, scale), null);
    assert.equal(nearestCut([gap], { x: gap.x, y: -7 / scale }, 43, scale), gap);
    assert.equal(nearestCut([gap], { x: gap.x, y: 43 + 7 / scale }, 43, scale), gap);
    assert.equal(nearestCut([gap], { x: gap.x, y: 43 + 9 / scale }, 43, scale), null);
  }
});

test("a selected gap tolerates slight drift but switches to a nearer gap immediately", () => {
  const next = { ...gap, x: 145, left: 140, right: 150, leftEnd: 13 };
  const gaps = [gap, next];
  assert.equal(nearestCut(gaps, { x: 85, y: 20 }, 43, 1, gap), gap);
  assert.equal(nearestCut(gaps, { x: 82, y: 20 }, 43, 1, gap), null);
  assert.equal(nearestCut(gaps, { x: 132, y: 20 }, 43, 1, gap), next);
});

test("cutting preserves physical widths, exact text offsets, font and rotation", () => {
  const [left, right] = splitPaper(note, gap);
  assert.equal(left.text, "the moon");
  assert.equal(right.text, "remembers");
  assert.equal(left.width + right.width, note.width);
  assert.equal(left.textOffset, 40);
  assert.equal(right.textOffset, 5);
  assert.equal(left.angle, note.angle);
  assert.equal(right.fontSize, note.fontSize);
  // Centers remain on the parent's baseline, separated along its rotated axis.
  const leftCenter = paperLocalPoint(note, { x: left.x + left.width / 2, y: left.y + left.height / 2 });
  const rightCenter = paperLocalPoint(note, { x: right.x + right.width / 2, y: right.y + right.height / 2 });
  close(leftCenter.y, note.height / 2);
  close(rightCenter.y, note.height / 2);
  close(rightCenter.x - right.width / 2 - (leftCenter.x + left.width / 2), 10);
});

test("a cut piece can be cut again without losing text or recentering it", () => {
  const [left] = splitPaper(note, gap);
  const halves = splitPaper(left, { x: 70, left: 65, right: 75, textLeft: left.textOffset, leftEnd: 3, rightStart: 4 });
  assert.deepEqual(halves.map((half) => half.text), ["the", "moon"]);
  assert.equal(halves[0].textOffset, 40);
  assert.equal(halves[1].textOffset, 5);
  assert.equal(splitPaper(note, { ...gap, x: 0 }), null);
});
