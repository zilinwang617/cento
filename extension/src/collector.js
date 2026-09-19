import { combineTypography, graphemeCount, hashText, normalizeSelection, sanitizeUrl } from "../../src/capture.js";
import { MESSAGE } from "../../src/protocol.js";

let lastContextTarget = null;
document.addEventListener("contextmenu", (event) => { lastContextTarget = event.target; }, true);

function selectedTextFromControl(target) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return "";
  return target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
}

function selectionRuns(selection) {
  const runs = [];
  if (!selection || selection.isCollapsed) return runs;
  for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex++) {
    const range = selection.getRangeAt(rangeIndex);
    const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!range.intersectsNode(node)) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.data.length;
      const text = node.data.slice(start, end);
      if (!text.trim()) continue;
      const element = node.parentElement;
      if (!element) continue;
      runs.push({ fontFamily: getComputedStyle(element).fontFamily, length: graphemeCount(text) });
    }
  }
  return runs;
}

function captureMetadata(explicitText = "") {
  const selection = window.getSelection();
  const controlText = selectedTextFromControl(lastContextTarget);
  const text = normalizeSelection(explicitText || selection?.toString() || controlText);
  if (!text) return null;
  const runs = selectionRuns(selection);
  if (!runs.length && lastContextTarget instanceof Element) runs.push({ fontFamily: getComputedStyle(lastContextTarget).fontFamily, length: graphemeCount(text) });
  return {
    text,
    textHash: hashText(text),
    source: { url: sanitizeUrl(location.href), title: document.title, capturedAt: new Date().toISOString() },
    typography: combineTypography(runs),
  };
}

document.addEventListener("dragstart", (event) => {
  const candidate = captureMetadata();
  if (!candidate) return;
  candidate.token = crypto.randomUUID();
  try { event.dataTransfer?.setData("application/x-cento-token", candidate.token); } catch { /* Native selections may reject custom MIME data. */ }
  chrome.runtime.sendMessage({ type: MESSAGE.candidate, candidate }).catch(() => {});
}, true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MESSAGE.getSelectionMeta) return false;
  sendResponse(captureMetadata(message.text));
  return false;
});
