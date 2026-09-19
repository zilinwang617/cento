import test from "node:test";
import assert from "node:assert/strict";
import { TRAY, packTray, insertAt, trayInsertionIndex, trayScrollSpeed } from "../src/tray.js";
import { beforeNoteIdAt, createNoteStore, normalizeDocument, noteReducer, orderedNotes } from "../src/note-store.js";
import { splitPaper } from "../src/cutting.js";

const paper = (id, width = 100, location = "tray") => ({ id, text: "the moon", width, height: 43, angle: 0, x: 0, y: 0, location });

test("variable-width rows preserve sequence, use fixed gaps, and never backfill", () => {
  const { items, rows } = packTray([paper("a", 100), paper("b", 140), paper("c", 300), paper("d", 80)]);
  assert.deepEqual(rows.map((row) => row.items.map((item) => item.id)), [["a", "b"], ["c", "d"]]);
  assert.equal(items[1].x - (items[0].x + items[0].width), TRAY.gapX);
  assert.equal(items[2].y - (items[0].y + items[0].height), TRAY.gapY);
  const noBackfill = packTray([paper("a", 300), paper("b", 300), paper("c", 50)]);
  assert.deepEqual(noBackfill.rows.map((row) => row.items.map((item) => item.id)), [["a"], ["b", "c"]]);
});

test("80 mixed-width pieces never overlap or leave the sidebar, and extend into scrollable content", () => {
  const { items, height } = packTray(Array.from({ length: 80 }, (_, index) => paper(String(index), [78, 180, 382, 42, 300][index % 5])));
  assert.ok(height > TRAY.bottom - TRAY.top);
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    assert.ok(a.x >= TRAY.padding && a.x + a.width <= TRAY.width - TRAY.padding);
    for (const b of items.slice(i + 1)) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
});

test("pointer insertion follows rows and retains its own placeholder instead of oscillating", () => {
  const notes = [paper("a", 100), paper("b", 140), paper("c", 300), paper("d", 80)];
  const layout = packTray(notes);
  assert.equal(trayInsertionIndex(layout, { x: 50, y: 20 }, "b", 1), 0);
  assert.equal(trayInsertionIndex(layout, { x: 180, y: 20 }, "b", 1), 1);
  assert.equal(trayInsertionIndex(layout, { x: 445, y: 100 }, "b", 1), 3);
  assert.equal(trayInsertionIndex(packTray([]), { x: 50, y: 20 }, "new", 0), 0);
  const preview = packTray(insertAt(notes, notes[1], 3));
  assert.deepEqual(preview.items.map((note) => note.id), ["a", "c", "d", "b"]);
  const slot = preview.items.at(-1);
  assert.equal(trayInsertionIndex(preview, { x: slot.x + 10, y: slot.y + 20 }, "b", 3), 3);
});

test("scrolling activates only at the tray's top/bottom edges", () => {
  assert.ok(trayScrollSpeed({ x: 200, y: TRAY.top + 5 }) < 0);
  assert.ok(trayScrollSpeed({ x: 200, y: TRAY.bottom - 5 }) > 0);
  assert.equal(trayScrollSpeed({ x: 600, y: TRAY.bottom - 5 }), 0);
  assert.equal(trayScrollSpeed({ x: 200, y: 400 }), 0);
});

test("new batches prepend in reading order while identity and added order survive reordering", () => {
  let state = createNoteStore([paper("old")]);
  state = noteReducer(state, { type: "add", notes: [paper("first"), paper("second")] });
  assert.deepEqual(state.sequence, ["first", "second", "old"]);
  const addedOrder = state.notes.find((note) => note.id === "first").addedOrder;
  state = noteReducer(state, { type: "drop", id: "first", location: "tray", index: 2 });
  assert.deepEqual(state.sequence, ["second", "old", "first"]);
  assert.equal(state.notes.find((note) => note.id === "first").addedOrder, addedOrder);
  assert.equal(state.revision, 2);
  assert.deepEqual(normalizeDocument(JSON.parse(JSON.stringify(state))), state);
});

test("anchor-based reordering resolves against the latest sequence", () => {
  let state = createNoteStore([paper("d"), paper("c"), paper("b"), paper("a")]);
  const before = beforeNoteIdAt(state, "a", 2);
  state = noteReducer(state, { type: "drop", id: "d", location: "tray", beforeNoteId: "b" });
  state = noteReducer(state, { type: "drop", id: "a", location: "tray", beforeNoteId: before });
  assert.deepEqual(state.sequence, ["a", "d", "b", "c"]);
  assert.equal(state.revision, 2);
});

test("canvas transfer, return, cut and deletion keep one consistent ordered sequence", () => {
  let state = createNoteStore([paper("c"), paper("b"), paper("a")]);
  state = noteReducer(state, { type: "drop", id: "b", location: "desk", patch: { x: 650, y: 200 } });
  assert.deepEqual(orderedNotes(state, "tray").map((note) => note.id), ["a", "c"]);
  assert.deepEqual(state.sequence, ["a", "b", "c"]);
  state = noteReducer(state, { type: "drop", id: "b", location: "tray", index: 2 });
  assert.deepEqual(state.sequence, ["a", "c", "b"]);
  const parent = state.notes.find((note) => note.id === "c");
  const children = splitPaper(parent, { x: 40, textLeft: 10, leftEnd: 3, rightStart: 4, right: 45 }).map((note, index) => ({ ...note, id: `c${index}`, parentFragmentId: "c" }));
  state = noteReducer(state, { type: "cut", id: "c", children });
  assert.deepEqual(state.sequence, ["a", "c0", "c1", "b"]);
  state = noteReducer(state, { type: "remove", id: "c0" });
  assert.deepEqual(state.sequence, ["a", "c1", "b"]);
  assert.deepEqual(orderedNotes(state, "tray").map((note) => note.id), state.sequence);
});
