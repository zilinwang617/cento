import test from "node:test";
import assert from "node:assert/strict";

function eventChannel() {
  const listeners = [];
  return {
    addListener(listener) { listeners.push(listener); },
    emit(...args) { return listeners.map((listener) => listener(...args)); },
  };
}

function storageArea() {
  const values = {};
  return {
    values,
    async get(key) {
      if (typeof key === "string") return { [key]: values[key] };
      return { ...values };
    },
    async set(patch) { Object.assign(values, patch); },
    async setAccessLevel() {},
  };
}

function mockPort(name, sender = {}) {
  const onMessage = eventChannel();
  const onDisconnect = eventChannel();
  return {
    name,
    sender,
    onMessage,
    onDisconnect,
    messages: [],
    disconnected: false,
    postMessage(message) { this.messages.push(message); },
    disconnect() { this.disconnected = true; onDisconnect.emit(); },
  };
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

test("service worker serializes commands, persists one document and broadcasts snapshots", async () => {
  const local = storageArea();
  const session = storageArea();
  const onConnect = eventChannel();
  const onMessage = eventChannel();
  const onInstalled = eventChannel();
  const onClicked = eventChannel();
  const openedPanels = [];

  globalThis.chrome = {
    storage: { local, session },
    runtime: { onConnect, onMessage, onInstalled },
    contextMenus: {
      onClicked,
      removeAll(callback) { callback(); },
      create() {},
    },
    sidePanel: {
      async setPanelBehavior() {},
      async open(options) { openedPanels.push(options); },
    },
    tabs: {
      async sendMessage() {
        return {
          source: { url: "https://example.com/article?tracking=1#part", title: "Article", capturedAt: "2026-09-19T00:00:00.000Z" },
          typography: { sourceFontStack: "Georgia, serif", category: "serif", confidence: 1 },
        };
      },
    },
  };

  try {
    const workerUrl = new URL(`../extension/src/service-worker.js?test=${Date.now()}`, import.meta.url);
    await import(workerUrl.href);

    const panel = mockPort("cento-sidepanel", { url: "chrome-extension://cento/sidepanel.html" });
    const main = mockPort("cento-main-site", { url: "http://127.0.0.1:5173/" });
    const rejected = mockPort("cento-main-site", { url: "https://untrusted.example/" });
    onConnect.emit(panel);
    onConnect.emit(main);
    onConnect.emit(rejected);

    assert.equal(rejected.disconnected, true);
    await waitFor(() => panel.messages.find((message) => message.type === "SNAPSHOT"), "initial snapshot");

    panel.onMessage.emit({
      type: "COMMAND",
      commandId: "add-1",
      action: {
        type: "add",
        notes: [
          { id: "note-a", text: "A" },
          { id: "note-b", text: "B" },
        ],
      },
    });
    panel.onMessage.emit({
      type: "COMMAND",
      commandId: "reorder-2",
      action: { type: "drop", id: "note-b", location: "tray", beforeNoteId: "note-a" },
    });

    await waitFor(() => panel.messages.find((message) => message.type === "ACK" && message.commandId === "reorder-2"), "queued reorder ACK");
    const stored = local.values.centoDocument;
    assert.equal(stored.revision, 2);
    assert.deepEqual(stored.sequence, ["note-b", "note-a"]);
    assert.equal(main.messages.at(-1).type, "SNAPSHOT");
    assert.equal(main.messages.at(-1).document.revision, 2);

    await onClicked.emit({
      menuItemId: "cento-save-selection",
      selectionText: "Captured text",
      pageUrl: "https://example.com/article?tracking=1#part",
      frameId: 0,
    }, { id: 7, url: "https://example.com/article", title: "Article" })[0];

    assert.deepEqual(openedPanels, [{ tabId: 7 }]);
    assert.equal(session.values.centoPendingCaptures.length, 1);
    assert.equal(session.values.centoPendingCaptures[0].typography.category, "serif");
    assert.equal(panel.messages.at(-1).type, "PENDING_CAPTURE");
  } finally {
    delete globalThis.chrome;
  }
});
