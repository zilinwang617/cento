import { MESSAGE, PROTOCOL_SOURCE, isBridgeMessage } from "../../src/protocol.js";

let port = null;
let reconnectTimer = 0;

function postToPage(message) {
  window.postMessage({ ...message, source: PROTOCOL_SOURCE.extension }, window.location.origin);
}

function connect() {
  clearTimeout(reconnectTimer);
  port = chrome.runtime.connect({ name: "cento-main-site" });
  port.onMessage.addListener((message) => {
    if ([MESSAGE.snapshot, MESSAGE.ack, MESSAGE.error].includes(message?.type)) postToPage(message);
  });
  port.onDisconnect.addListener(() => { port = null; reconnectTimer = setTimeout(connect, 1000); });
  port.postMessage({ type: MESSAGE.hello });
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin || !isBridgeMessage(event.data, PROTOCOL_SOURCE.main)) return;
  if (event.data.type === MESSAGE.hello) port?.postMessage({ type: MESSAGE.hello });
  if (event.data.type === MESSAGE.command && event.data.commandId && event.data.action) {
    port?.postMessage({ type: MESSAGE.command, commandId: event.data.commandId, action: event.data.action });
  }
});

connect();
