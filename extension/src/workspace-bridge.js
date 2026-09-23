import { MESSAGE, PROTOCOL_SOURCE, isBridgeMessage } from "../../src/protocol.js";

let port = null;
let reconnectTimer = 0;
const outstandingCommands = new Map();

function postToPage(message) {
  window.postMessage({ ...message, source: PROTOCOL_SOURCE.extension }, window.location.origin);
}

function connect() {
  clearTimeout(reconnectTimer);
  if (!chrome.runtime?.id) {
    postToPage({ type: MESSAGE.error, code: "bridge-disconnected", message: "Reload this page to reconnect the Cento Extension." });
    return;
  }
  try { port = chrome.runtime.connect({ name: "cento-workspace" }); }
  catch {
    port = null;
    postToPage({ type: MESSAGE.error, code: "bridge-disconnected", message: "Reload this page to reconnect the Cento Extension." });
    return;
  }
  port.onMessage.addListener((message) => {
    if ([MESSAGE.ack, MESSAGE.error].includes(message?.type) && typeof message.commandId === "string") {
      outstandingCommands.delete(message.commandId);
    }
    if ([MESSAGE.snapshot, MESSAGE.ack, MESSAGE.error].includes(message?.type)) postToPage(message);
  });
  port.onDisconnect.addListener(() => {
    port = null;
    for (const commandId of outstandingCommands.keys()) {
      postToPage({ type: MESSAGE.error, code: "bridge-disconnected", commandId,
        message: "The Extension disconnected before saving that move." });
    }
    outstandingCommands.clear();
    postToPage({ type: MESSAGE.error, code: "bridge-disconnected", message: "Cento is reconnecting." });
    if (chrome.runtime?.id) reconnectTimer = setTimeout(connect, 1000);
  });
  port.postMessage({ type: MESSAGE.hello });
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin || !isBridgeMessage(event.data, PROTOCOL_SOURCE.main)) return;
  if (event.data.type === MESSAGE.hello) port?.postMessage({ type: MESSAGE.hello });
  if (event.data.type === MESSAGE.command && event.data.commandId && event.data.action) {
    if (!port) {
      postToPage({ type: MESSAGE.error, code: "bridge-disconnected", commandId: event.data.commandId,
        message: "The Extension is reconnecting. Try that move again." });
      return;
    }
    outstandingCommands.set(event.data.commandId, event.data);
    try { port.postMessage({ type: MESSAGE.command, commandId: event.data.commandId, action: event.data.action }); }
    catch {
      outstandingCommands.delete(event.data.commandId);
      postToPage({ type: MESSAGE.error, code: "bridge-disconnected", commandId: event.data.commandId,
        message: "The Extension disconnected before saving that move." });
    }
  }
});

connect();
