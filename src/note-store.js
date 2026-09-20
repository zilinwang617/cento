import { isTypefaceId, referenceSize, seededTypeface } from "./typeface.js";

export const DOCUMENT_SCHEMA_VERSION = 1;
export const MAX_NOTES = 80;

const EMPTY_TYPOGRAPHY = Object.freeze({ sourceFontStack: "", category: "unknown", confidence: 0 });

export function makeNoteId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createNoteStore(notes = []) {
  const normalized = notes.map((note, index) => normalizeNote(note, index + 1));
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    revision: 0,
    notes: normalized,
    // Initial demo data is authored oldest-to-newest. Runtime batches prepend directly.
    sequence: normalized.map((note) => note.id).reverse(),
  };
}

export function normalizeDocument(value) {
  if (!value || value.schemaVersion !== DOCUMENT_SCHEMA_VERSION || !Array.isArray(value.notes) || !Array.isArray(value.sequence)) return null;
  const seen = new Set();
  const notes = [];
  for (const note of value.notes) {
    if (!note || typeof note.id !== "string" || typeof note.text !== "string" || seen.has(note.id)) continue;
    seen.add(note.id);
    notes.push(normalizeNote(note, notes.length + 1));
  }
  const sequence = value.sequence.filter((id, index, array) => seen.has(id) && array.indexOf(id) === index);
  for (const note of notes) if (!sequence.includes(note.id)) sequence.push(note.id);
  return { schemaVersion: DOCUMENT_SCHEMA_VERSION, revision: Number.isInteger(value.revision) ? value.revision : 0, notes, sequence };
}

export function isCentoDocument(value) {
  return normalizeDocument(value) !== null;
}

export function orderedNotes(state, location) {
  const byId = new Map(state.notes.map((note) => [note.id, note]));
  return state.sequence.map((id) => byId.get(id)).filter((note) => note && (!location || note.location === location));
}

export function beforeNoteIdAt(state, movingId, visibleIndex, location = "tray") {
  return orderedNotes(state, location).filter((note) => note.id !== movingId)[visibleIndex]?.id ?? null;
}

export function applyPendingActions(document, actions = []) {
  let state = normalizeDocument(document);
  if (!state) return null;
  for (const action of actions) state = noteReducer(state, action);
  return state;
}

function normalizeNote(note, fallbackOrder) {
  const id = note.id || makeNoteId();
  const typography = { ...EMPTY_TYPOGRAPHY, ...(note.typography ?? {}) };
  // Cut halves inherit the parent's face; demo and pre-typeface notes get a stable seeded draw.
  const typeface = isTypefaceId(note.typeface) ? note.typeface : seededTypeface(typography.category, id);
  const reference = referenceSize(typeface);
  if (typeface === "charmonman" && note.typefaceSize !== reference) {
    // Update existing paper as well as newly captured text. Record the applied reference so
    // hydration, moves and cuts cannot enlarge the same note repeatedly.
    const previousSize = Math.max(1, Number(note.fontSize) || 18);
    const scale = reference / previousSize;
    const previousReference = Number(note.typefaceSize) || 18;
    note = {
      ...note,
      typefaceSize: reference,
      fontSize: reference,
      width: Number.isFinite(note.width) ? note.width * scale : note.width,
      textWidth: Number.isFinite(note.textWidth) ? note.textWidth * reference / previousReference : note.textWidth,
      ...(Number.isFinite(note.textOffset) ? { textOffset: note.textOffset * scale } : {}),
    };
  }
  const textWidth = Number.isFinite(note.textWidth)
    ? note.textWidth
    : Math.max(1, (Number(note.width) - 34) * reference / Math.max(1, Number(note.fontSize) || reference));
  return {
    ...note,
    id,
    text: String(note.text ?? ""),
    location: note.location === "desk" ? "desk" : "tray",
    addedOrder: Number.isFinite(note.addedOrder) ? note.addedOrder : fallbackOrder,
    textWidth,
    width: Number.isFinite(note.width) ? note.width : Math.min(382, Math.max(78, textWidth + 34)),
    height: Number.isFinite(note.height) ? note.height : 43,
    fontSize: Number.isFinite(note.fontSize) ? note.fontSize : reference,
    x: Number.isFinite(note.x) ? note.x : 36,
    y: Number.isFinite(note.y) ? note.y : 68,
    angle: Number.isFinite(note.angle) ? note.angle : 0,
    z: Number.isFinite(note.z) ? note.z : 1,
    typeface,
    source: note.source ?? null,
    typography,
  };
}

function nextAddedOrder(state) {
  return state.notes.reduce((maximum, note) => Math.max(maximum, note.addedOrder || 0), 0) + 1;
}

function mutated(state, patch) {
  return { ...state, ...patch, schemaVersion: DOCUMENT_SCHEMA_VERSION, revision: state.revision + 1 };
}

function moveBefore(state, id, beforeNoteId) {
  const sequence = state.sequence.filter((entry) => entry !== id);
  const visibleIds = orderedNotes(state, "tray").map((note) => note.id).filter((entry) => entry !== id);
  if (beforeNoteId && visibleIds.includes(beforeNoteId)) {
    sequence.splice(sequence.indexOf(beforeNoteId), 0, id);
    return sequence;
  }
  const lastVisible = visibleIds.at(-1);
  sequence.splice(lastVisible ? sequence.indexOf(lastVisible) + 1 : 0, 0, id);
  return sequence;
}

export function noteReducer(state, action) {
  if (action.type === "hydrate") return normalizeDocument(action.document) ?? state;
  switch (action.type) {
    case "draw-fortune": {
      if (!action.note || action.note.kind !== "fortune" || typeof action.note.text !== "string") return state;
      const retained = state.notes.filter((note) => note.kind !== "fortune");
      if (retained.length >= MAX_NOTES) return state;
      const id = action.note.id && !retained.some((note) => note.id === action.note.id) ? action.note.id : makeNoteId();
      const note = normalizeNote({ ...action.note, id, fortuneDrawId: id, location: "desk", addedOrder: nextAddedOrder(state) }, nextAddedOrder(state));
      const ids = new Set(retained.map((item) => item.id));
      return mutated(state, { notes: [...retained, note], sequence: [id, ...state.sequence.filter((entry) => ids.has(entry))] });
    }
    case "add": {
      if (!Array.isArray(action.notes) || !action.notes.length || state.notes.length + action.notes.length > MAX_NOTES) return state;
      const existing = new Set(state.notes.map((note) => note.id));
      const start = nextAddedOrder(state);
      const notes = action.notes.map((note, index) => {
        let id = note.id;
        if (!id || existing.has(id)) id = makeNoteId();
        existing.add(id);
        return normalizeNote({ ...note, id, location: "tray", addedOrder: start + index }, start + index);
      });
      return mutated(state, { notes: [...state.notes, ...notes], sequence: [...notes.map((note) => note.id), ...state.sequence] });
    }
    case "remove": {
      if (!state.notes.some((note) => note.id === action.id)) return state;
      return mutated(state, { notes: state.notes.filter((note) => note.id !== action.id), sequence: state.sequence.filter((id) => id !== action.id) });
    }
    case "cut": {
      const parent = state.notes.find((note) => note.id === action.id);
      if (!parent || !Array.isArray(action.children) || action.children.length !== 2 || state.notes.length >= MAX_NOTES) return state;
      const existing = new Set(state.notes.map((note) => note.id));
      existing.delete(parent.id);
      const children = action.children.map((note, index) => {
        let id = note.id;
        if (!id || existing.has(id)) id = makeNoteId();
        existing.add(id);
        return normalizeNote({ ...parent, ...note, id, parentFragmentId: parent.id,
          addedOrder: parent.addedOrder + index / 10 }, parent.addedOrder);
      });
      return mutated(state, {
        notes: state.notes.flatMap((note) => note.id === action.id ? children : [note]),
        sequence: state.sequence.flatMap((id) => id === action.id ? children.map((note) => note.id) : [id]),
      });
    }
    case "move": {
      if (!state.notes.some((note) => note.id === action.id)) return state;
      return mutated(state, { notes: state.notes.map((note) => note.id === action.id ? normalizeNote({ ...note, ...action.patch }, note.addedOrder) : note) });
    }
    case "drop": {
      const current = state.notes.find((note) => note.id === action.id);
      if (!current || !["tray", "desk"].includes(action.location)) return state;
      const sequence = action.location === "tray" ? moveBefore(state, action.id,
        action.beforeNoteId ?? beforeNoteIdAt(state, action.id, action.index ?? Number.MAX_SAFE_INTEGER)) : state.sequence;
      return mutated(state, {
        sequence,
        notes: state.notes.map((note) => note.id === action.id ? normalizeNote({ ...note, ...action.patch,
          location: action.location, colorSource: null }, note.addedOrder) : note),
      });
    }
    default: return state;
  }
}

export function validateDocumentAction(action) {
  if (!action || typeof action.type !== "string") return "Missing action type.";
  if (!["add", "remove", "cut", "move", "drop", "draw-fortune"].includes(action.type)) return "Unsupported document action.";
  if (action.type === "draw-fortune") return action.note?.kind === "fortune" && typeof action.note.text === "string" && action.note.text.trim() ? null : "A fortune note is required.";
  if (action.type === "add") return Array.isArray(action.notes) && action.notes.length ? null : "A note batch is required.";
  if (typeof action.id !== "string") return "A note ID is required.";
  if (action.type === "cut" && (!Array.isArray(action.children) || action.children.length !== 2)) return "A cut must create two pieces.";
  if (action.type === "drop" && !["tray", "desk"].includes(action.location)) return "Invalid note location.";
  return null;
}
