import test from "node:test";
import assert from "node:assert/strict";
import { FORTUNE, FORTUNE_PROMPTS, FORTUNE_TEXT_BUDGET, createFortuneNote, pickFortune } from "../src/fortune.js";
import { createNoteStore, noteReducer, normalizeDocument, validateDocumentAction, MAX_NOTES } from "../src/note-store.js";
import { splitPaper } from "../src/cutting.js";
import { fontStack, referenceSize, typefacePool } from "../src/typeface.js";
import { noteColors, THEMES } from "../src/workspace.js";
import { displayFontSize } from "../src/tray.js";

const measure = (text) => text.length * 10;
const make = (id = "draw-1", prompt = FORTUNE_PROMPTS[0]) => createFortuneNote(prompt, id, measure, 10);
const cut = (state, id, childrenIds) => {
  const parent = state.notes.find((note) => note.id === id);
  const at = parent.text.indexOf(" ");
  const left = parent.textOffset ?? FORTUNE.padding;
  const gap = { x: left + at * 10 + 5, textLeft: left, right: left + (at + 1) * 10,
    leftEnd: at, rightStart: at + 1, leftTextWidth: at * 10, rightTextWidth: (parent.text.length - at - 1) * 10 };
  const children = splitPaper(parent, gap).map((note, index) => ({ ...note, id: childrenIds[index] }));
  return noteReducer(state, { type: "cut", id, children });
};

test("20 stable prompt IDs; random draw excludes immediate repeat", () => {
  assert.equal(FORTUNE_PROMPTS.length, 20);
  assert.equal(new Set(FORTUNE_PROMPTS.map((p) => p.id)).size, 20);
  for (let index = 0; index < 20; index++) {
    const prompt = pickFortune(null, measure, () => index / 20);
    assert.equal(prompt.id, FORTUNE_PROMPTS[index].id);
    assert.notEqual(pickFortune(prompt.id, measure, () => index / 20).id, prompt.id);
  }
});

test("width is measured, grows right from a fixed anchor, and rejects overflow", () => {
  const short = make("a", { id: "a", text: "Hi" });
  const long = make("b");
  assert.equal(short.x, long.x);
  assert.equal(short.y, 85);
  assert.equal(long.width, measure(long.text) + 81);
  assert.equal(FORTUNE_TEXT_BUDGET, 497);
  assert.throws(() => createFortuneNote({ id: "long", text: "wide" }, "c", () => 498, 1));
  assert.equal(pickFortune(null, () => 498), null);
});

test("repeated cuts inherit provenance, font, outer ornaments and original type size", () => {
  let state = noteReducer(createNoteStore(), { type: "draw-fortune", note: make() });
  state = cut(state, "draw-1", ["left", "right"]);
  state = cut(state, "right", ["middle", "end"]);
  assert.deepEqual(state.notes.map((n) => [Boolean(n.fortuneLeft), Boolean(n.fortuneRight)]), [[true, false], [false, false], [false, true]]);
  for (const note of state.notes) {
    assert.equal(note.fortuneDrawId, "draw-1");
    assert.equal(note.typeface, "abeezee");
    assert.equal(displayFontSize(note), 20);
  }
  assert.equal(normalizeDocument(JSON.parse(JSON.stringify(state))).notes[1].typeface, "abeezee");
});

test("drawing atomically removes all descendants in desk and tray; ordinary notes stay ordered", () => {
  let state = createNoteStore([{ id: "ordinary-a", text: "keep me" }, { id: "ordinary-b", text: "also keep" }]);
  const ordinarySequence = [...state.sequence];
  state = noteReducer(state, { type: "draw-fortune", note: make() });
  state = cut(state, "draw-1", ["left", "right"]);
  state = cut(state, "right", ["middle", "end"]);
  state = noteReducer(state, { type: "drop", id: "middle", location: "tray", patch: {} });
  state = noteReducer(state, { type: "draw-fortune", note: make("draw-2") });
  assert.deepEqual(state.sequence, ["draw-2", ...ordinarySequence]);
  assert.deepEqual(state.notes.map((note) => note.id), ["ordinary-a", "ordinary-b", "draw-2"]);
});

test("full desk permits replacement but does not remove ordinary notes to make space", () => {
  const notes = Array.from({ length: MAX_NOTES - 1 }, (_, i) => ({ id: `ordinary-${i}`, text: "keep" }));
  let state = noteReducer(createNoteStore(notes), { type: "draw-fortune", note: make() });
  state = noteReducer(state, { type: "draw-fortune", note: make("draw-2") });
  assert.equal(state.notes.length, MAX_NOTES);
  assert.equal(state.notes.at(-1).id, "draw-2");
  const full = createNoteStore([...notes, { id: "last", text: "keep" }]);
  assert.equal(noteReducer(full, { type: "draw-fortune", note: make() }), full);
});

test("fortune styling is independent of theme and excluded from captured-font lottery", () => {
  for (const theme of THEMES) assert.deepEqual(noteColors(make(), theme), { paper: "#ffffff", ink: "#364891" });
  assert.match(fontStack("abeezee"), /ABeeZee/);
  assert.equal(referenceSize("abeezee"), 20);
  assert.ok(!typefacePool("sans").some((face) => face.id === "abeezee"));
  assert.equal(validateDocumentAction({ type: "draw-fortune", note: make() }), null);
  assert.ok(validateDocumentAction({ type: "draw-fortune", note: {} }));
});
