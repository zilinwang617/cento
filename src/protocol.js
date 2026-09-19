export const PROTOCOL_SOURCE = Object.freeze({ main: "cento-main", extension: "cento-extension" });
export const MESSAGE = Object.freeze({
  hello: "HELLO", snapshot: "SNAPSHOT", command: "COMMAND", ack: "ACK", error: "ERROR",
  candidate: "CAPTURE_CANDIDATE", resolveDrag: "RESOLVE_DRAG", getPending: "GET_PENDING", consumePending: "CONSUME_PENDING",
  getSelectionMeta: "GET_SELECTION_META", pending: "PENDING_CAPTURE",
});

export function isBridgeMessage(value, source) {
  return Boolean(value && value.source === source && [MESSAGE.hello, MESSAGE.command, MESSAGE.snapshot, MESSAGE.ack, MESSAGE.error].includes(value.type));
}
