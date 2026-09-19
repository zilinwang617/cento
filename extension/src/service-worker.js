import { createNoteStore, MAX_NOTES, normalizeDocument, noteReducer, validateDocumentAction } from "../../src/note-store.js";
import { MESSAGE } from "../../src/protocol.js";

const DOCUMENT_KEY = "centoDocument";
const DRAG_KEY = "centoDragCandidate";
const PENDING_KEY = "centoPendingCaptures";
const ports = new Set();
let commandQueue = Promise.resolve();

const isMainOrigin = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch { return false; }
};

async function readDocument() {
  const stored = await chrome.storage.local.get(DOCUMENT_KEY);
  const normalized = normalizeDocument(stored[DOCUMENT_KEY]);
  const document = normalized ?? createNoteStore([]);
  if (!normalized) await chrome.storage.local.set({ [DOCUMENT_KEY]: document });
  return document;
}

async function writeDocument(document) {
  await chrome.storage.local.set({ [DOCUMENT_KEY]: document });
}

function post(port, message) {
  try { port.postMessage(message); } catch { ports.delete(port); }
}

function broadcast(message, name = null) {
  for (const port of ports) if (!name || port.name === name) post(port, message);
}

async function sendSnapshot(port = null) {
  const message = { type: MESSAGE.snapshot, document: await readDocument() };
  if (port) post(port, message); else broadcast(message);
}

function applyCommand(port, message) {
  commandQueue = commandQueue.then(async () => {
    const validation = validateDocumentAction(message.action);
    if (validation) { post(port, { type: MESSAGE.error, commandId: message.commandId, message: validation }); return; }
    const document = await readDocument();
    if (message.action.type === "add" && document.notes.length + message.action.notes.length > MAX_NOTES) {
      post(port, { type: MESSAGE.error, commandId: message.commandId, message: "The desk can hold up to 80 pieces." });
      return;
    }
    if (message.action.type === "cut" && document.notes.length >= MAX_NOTES) {
      post(port, { type: MESSAGE.error, commandId: message.commandId, message: "Remove a piece before cutting again." });
      return;
    }
    const next = noteReducer(document, message.action);
    if (next === document) { post(port, { type: MESSAGE.error, commandId: message.commandId, message: "That change could not be applied." }); return; }
    await writeDocument(next);
    broadcast({ type: MESSAGE.snapshot, document: next });
    post(port, { type: MESSAGE.ack, commandId: message.commandId, revision: next.revision });
  }).catch((error) => post(port, { type: MESSAGE.error, commandId: message.commandId, message: error?.message || "Could not save that change." }));
}

chrome.runtime.onConnect.addListener((port) => {
  if (!["cento-sidepanel", "cento-main-site"].includes(port.name)) return;
  if (port.name === "cento-main-site" && !isMainOrigin(port.sender?.url)) { port.disconnect(); return; }
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener((message) => {
    if (message?.type === MESSAGE.hello) sendSnapshot(port);
    if (message?.type === MESSAGE.command) applyCommand(port, message);
  });
  sendSnapshot(port);
});

const prunePending = (items) => items.filter((item) => item.expiresAt > Date.now());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE.candidate && sender.tab) {
    const candidate = { ...message.candidate, tabId: sender.tab.id, frameId: sender.frameId, expiresAt: Date.now() + 15000 };
    chrome.storage.session.set({ [DRAG_KEY]: candidate }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === MESSAGE.resolveDrag) {
    chrome.storage.session.get(DRAG_KEY).then((stored) => {
      const candidate = stored[DRAG_KEY];
      const matches = candidate && candidate.expiresAt > Date.now()
        && ((message.token && candidate.token === message.token) || (!message.token && candidate.textHash === message.textHash));
      sendResponse(matches ? candidate : null);
    });
    return true;
  }
  if (message?.type === MESSAGE.getPending) {
    chrome.storage.session.get(PENDING_KEY).then((stored) => sendResponse(prunePending(stored[PENDING_KEY] ?? [])));
    return true;
  }
  if (message?.type === MESSAGE.consumePending && typeof message.id === "string") {
    chrome.storage.session.get(PENDING_KEY).then((stored) => chrome.storage.session.set({
      [PENDING_KEY]: prunePending(stored[PENDING_KEY] ?? []).filter((item) => item.id !== message.id),
    })).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: "cento-save-selection", title: "Save to Cento", contexts: ["selection"] }));
  chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
  chrome.storage.session.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
  readDocument().catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "cento-save-selection" || !info.selectionText || !tab?.id) return;
  let metadata = null;
  try { metadata = await chrome.tabs.sendMessage(tab.id, { type: MESSAGE.getSelectionMeta, text: info.selectionText }, { frameId: info.frameId }); } catch { /* Protected pages keep unknown metadata. */ }
  const candidate = {
    id: crypto.randomUUID(),
    text: info.selectionText,
    source: metadata?.source ?? { url: info.pageUrl ?? tab.url ?? "", title: tab.title ?? "", capturedAt: new Date().toISOString() },
    typography: metadata?.typography ?? { sourceFontStack: "", category: "unknown", confidence: 0 },
    expiresAt: Date.now() + 300000,
  };
  const stored = await chrome.storage.session.get(PENDING_KEY);
  const pending = [...prunePending(stored[PENDING_KEY] ?? []), candidate];
  await chrome.storage.session.set({ [PENDING_KEY]: pending });
  broadcast({ type: MESSAGE.pending, candidate }, "cento-sidepanel");
  try { await chrome.sidePanel.open({ tabId: tab.id }); } catch { /* The queued capture remains for the next open. */ }
});
