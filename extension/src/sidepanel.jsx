import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CaptureError, createNotesFromCapture, hashText } from "../../src/capture.js";
import { MAX_NOTES, beforeNoteIdAt, createNoteStore, makeNoteId, orderedNotes } from "../../src/note-store.js";
import { MESSAGE } from "../../src/protocol.js";
import { displayFontSize, insertAt, packTray, trayInsertionIndex } from "../../src/tray.js";
import { createTextMeasure, fontStack, fontWeight, libraryCategory, loadNoteFonts, typeface } from "../../src/typeface.js";
import "./sidepanel.css";
import { FortuneEnds } from "../../src/FortuneEnds.jsx";
import "../../src/fortune.css";

const UNKNOWN_META = { source: { url: "", title: "", capturedAt: "" }, typography: { sourceFontStack: "", category: "unknown", confidence: 0 } };
const layoutSettings = (width) => ({ width, top: 0, bottom: 0, padding: 20, gapX: 14, gapY: 18, startY: 18, edge: 58, speed: 520 });

let textMeasure;
const measureText = (text, typefaceId) => (textMeasure ??= createTextMeasure())(text, typefaceId);

function Paper({ note, measuredTextWidth, dragging, onPointerDown, onRemove, onNudge }) {
  const source = note.source?.title || note.source?.url || "Collected text";
  const assigned = `${libraryCategory(note.typography?.category)} → ${typeface(note.typeface).family}`;
  return <button type="button" className={`side-paper${note.kind === "fortune" ? " fortune-strip" : ""}${dragging ? " is-dragging" : ""}`}
    aria-label={`Move paper: ${note.text}`} title={`${source} · ${assigned}`} data-note-id={note.id}
    onPointerDown={onPointerDown} onKeyDown={(event) => {
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); onRemove(note.id); }
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) { event.preventDefault(); onNudge(note.id, -1); }
      if (["ArrowRight", "ArrowDown"].includes(event.key)) { event.preventDefault(); onNudge(note.id, 1); }
    }}
    style={{
      left: note.x, top: note.y, width: note.width, height: note.height,
      "--type-size": `${displayFontSize(note, measuredTextWidth)}px`, "--type-face": fontStack(note.typeface),
      "--type-weight": fontWeight(note.typeface)
    }}>
    <FortuneEnds note={note} />
    <span>{note.text}</span>
  </button>;
}

function SidePanel() {
  const portRef = useRef(null);
  const documentRef = useRef(createNoteStore([]));
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const processedRef = useRef(new Set());
  const pendingCommandsRef = useRef(new Map());
  const toastTimerRef = useRef(0);
  const [documentState, setDocumentState] = useState(documentRef.current);
  const [width, setWidth] = useState(360);
  const [drag, setDrag] = useState(null);
  const [externalDrag, setExternalDrag] = useState(false);
  const [connected, setConnected] = useState(false);
  const [fontReady, setFontReady] = useState(false);
  const [toast, setToast] = useState("");
  const settings = useMemo(() => layoutSettings(width), [width]);
  const trayNotes = useMemo(() => orderedNotes(documentState, "tray"), [documentState]);
  const measuredTextWidths = useMemo(() => new Map(trayNotes.map((note) => [note.id, measureText(note.text, note.typeface)])), [trayNotes, fontReady]);
  const layout = useMemo(() => {
    const notes = drag ? insertAt(trayNotes.filter((note) => note.id !== drag.note.id), drag.note, drag.index) : trayNotes;
    return packTray(notes, settings);
  }, [trayNotes, drag?.note.id, drag?.index, settings]);

  const announce = (message) => {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3200);
  };

  const command = (action) => new Promise((resolve, reject) => {
    const port = portRef.current;
    if (!port) { reject(new Error("Cento is reconnecting. Try again in a moment.")); return; }
    const commandId = makeNoteId();
    pendingCommandsRef.current.set(commandId, { resolve, reject });
    try { port.postMessage({ type: MESSAGE.command, commandId, action }); }
    catch (error) { pendingCommandsRef.current.delete(commandId); reject(error); }
  });

  const submit = (action) => { command(action).catch((error) => announce(error?.message || "That change could not be saved.")); };

  const collect = async (candidate, pendingId = null) => {
    let readyToSend = false;
    try {
      await loadNoteFonts();
      const notes = createNotesFromCapture(candidate, measureText);
      if (documentRef.current.notes.length + notes.length > MAX_NOTES) throw new CaptureError("desk-full", "The desk can hold up to 80 pieces.");
      readyToSend = true;
      await command({ type: "add", notes });
      scrollRef.current.scrollTop = 0;
      announce(`${notes.length} new ${notes.length === 1 ? "piece" : "pieces"}.`);
      if (pendingId) await chrome.runtime.sendMessage({ type: MESSAGE.consumePending, id: pendingId });
    } catch (error) {
      announce(error instanceof CaptureError ? error.message : "That text could not be collected.");
      // Invalid captures can never succeed unchanged. Worker/connection failures stay queued for a retry.
      if (pendingId && !readyToSend) await chrome.runtime.sendMessage({ type: MESSAGE.consumePending, id: pendingId });
    }
  };

  const handlePending = (candidate) => {
    if (!candidate?.id || processedRef.current.has(candidate.id)) return;
    processedRef.current.add(candidate.id);
    collect(candidate, candidate.id);
  };

  useEffect(() => {
    let reconnectTimer;
    const connect = () => {
      const port = chrome.runtime.connect({ name: "cento-sidepanel" });
      portRef.current = port;
      port.onMessage.addListener((message) => {
        if (message?.type === MESSAGE.snapshot) {
          documentRef.current = message.document;
          setDocumentState(message.document);
          setConnected(true);
        }
        if (message?.type === MESSAGE.ack) {
          pendingCommandsRef.current.get(message.commandId)?.resolve(message);
          pendingCommandsRef.current.delete(message.commandId);
        }
        if (message?.type === MESSAGE.error) {
          const pending = pendingCommandsRef.current.get(message.commandId);
          if (pending) { pending.reject(new Error(message.message || "That change could not be saved.")); pendingCommandsRef.current.delete(message.commandId); }
          else announce(message.message || "That change could not be saved.");
        }
        if (message?.type === MESSAGE.pending) handlePending(message.candidate);
      });
      port.onDisconnect.addListener(() => {
        if (portRef.current === port) portRef.current = null;
        for (const pending of pendingCommandsRef.current.values()) pending.reject(new Error("Cento disconnected before saving. The capture is still queued."));
        pendingCommandsRef.current.clear();
        setConnected(false);
        reconnectTimer = setTimeout(connect, 800);
      });
      port.postMessage({ type: MESSAGE.hello });
    };
    connect();
    chrome.runtime.sendMessage({ type: MESSAGE.getPending }).then((items) => items.forEach(handlePending)).catch(() => { });
    return () => { clearTimeout(reconnectTimer); clearTimeout(toastTimerRef.current); portRef.current?.disconnect(); };
  }, []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const resize = () => setWidth(element.clientWidth);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    loadNoteFonts().then(() => { if (active) setFontReady(true); }).catch(() => { });
    return () => { active = false; };
  }, []);

  const updateDrag = (clientX, clientY) => {
    const current = dragRef.current;
    if (!current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const point = { x: clientX - rect.left, y: clientY - rect.top + scrollRef.current.scrollTop };
    const others = orderedNotes(documentRef.current, "tray").filter((note) => note.id !== current.note.id);
    const preview = packTray(insertAt(others, current.note, current.index), settings);
    const index = trayInsertionIndex(preview, point, current.note.id, current.index, settings);
    const next = { ...current, clientX, clientY, point, index, position: { x: point.x - current.offset.x, y: point.y - current.offset.y } };
    dragRef.current = next;
    setDrag(next);
  };

  const startDrag = (note, event) => {
    if (event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    const rect = scrollRef.current.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top + scrollRef.current.scrollTop };
    const next = {
      note, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      point, position: { x: note.x, y: note.y }, index: trayNotes.findIndex((item) => item.id === note.id),
      offset: { x: point.x - note.x, y: point.y - note.y }
    };
    scrollRef.current.setPointerCapture(event.pointerId);
    dragRef.current = next;
    setDrag(next);
  };

  const finishDrag = (cancel = false) => {
    const current = dragRef.current;
    if (!current) return;
    dragRef.current = null;
    setDrag(null);
    if (!cancel) submit({
      type: "drop", id: current.note.id, location: "tray",
      beforeNoteId: beforeNoteIdAt(documentRef.current, current.note.id, current.index)
    });
    if (scrollRef.current.hasPointerCapture(current.pointerId)) scrollRef.current.releasePointerCapture(current.pointerId);
    requestAnimationFrame(() => scrollRef.current.querySelector(`[data-note-id="${current.note.id}"]`)?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!drag) return;
    let frame;
    let previous = performance.now();
    const tick = (time) => {
      const current = dragRef.current;
      if (!current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const edge = 58;
      let speed = 0;
      if (current.clientY < rect.top + edge) speed = -520 * (rect.top + edge - current.clientY) / edge;
      if (current.clientY > rect.bottom - edge) speed = 520 * (current.clientY - rect.bottom + edge) / edge;
      const before = scrollRef.current.scrollTop;
      scrollRef.current.scrollTop += speed * Math.min(32, time - previous) / 1000;
      if (before !== scrollRef.current.scrollTop) updateDrag(current.clientX, current.clientY);
      previous = time;
      frame = requestAnimationFrame(tick);
    };
    const cancel = () => finishDrag(true);
    const escape = (event) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", escape); };
  }, [Boolean(drag)]);

  const dropExternal = async (event) => {
    event.preventDefault();
    setExternalDrag(false);
    const text = event.dataTransfer.getData("text/plain");
    if (!text.trim()) { announce("Drag selected text into Cento."); return; }
    const token = event.dataTransfer.getData("application/x-cento-token");
    const metadata = await chrome.runtime.sendMessage({ type: MESSAGE.resolveDrag, token, textHash: hashText(text) }).catch(() => null);
    collect({ ...(metadata ?? UNKNOWN_META), text });
  };

  const nudge = (id, direction) => {
    const index = trayNotes.findIndex((note) => note.id === id);
    const next = Math.max(0, Math.min(trayNotes.length - 1, index + direction));
    submit({ type: "drop", id, location: "tray", beforeNoteId: beforeNoteIdAt(documentRef.current, id, next) });
  };

  const openCanvas = async () => {
    const result = await chrome.runtime.sendMessage({ type: MESSAGE.openWorkspace }).catch(() => null);
    if (!result?.ok) announce(result?.message || "The workspace could not be opened.");
  };

  return <main className={`side-panel${externalDrag ? " is-receiving" : ""}`}
    onDragEnter={(event) => { if (event.dataTransfer.types.includes("text/plain")) setExternalDrag(true); }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes("text/plain")) event.preventDefault(); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setExternalDrag(false); }}
    onDrop={dropExternal}>
    <header>
      <div><h1>Cento</h1><span className={`connection-dot${connected ? " is-connected" : ""}`} aria-label={connected ? "Saved locally" : "Reconnecting"} /></div>
      <p>Select some text: drag it here, or right-click it and choose "Save to Cento".</p>
    </header>
    <section className="side-list" ref={scrollRef} aria-label="Collected paper strips"
      data-revision={documentState.revision}
      onPointerMove={(event) => { if (event.pointerId === dragRef.current?.pointerId) updateDrag(event.clientX, event.clientY); }}
      onPointerUp={(event) => { if (event.pointerId === dragRef.current?.pointerId) { updateDrag(event.clientX, event.clientY); finishDrag(); } }}
      onPointerCancel={() => finishDrag(true)} onLostPointerCapture={() => finishDrag(true)}>
      <div className="side-list-content" style={{ height: Math.max(scrollRef.current?.clientHeight ?? 0, layout.height + 30) }}>
        {!trayNotes.length && !drag && <div className="empty-state"><span>A few words can become a place.</span></div>}
        {layout.items.map((note) => note.id === drag?.note.id
          ? <div className="side-placeholder" key={note.id} style={{ left: note.x, top: note.y, width: note.width, height: note.height }} />
          : <Paper key={note.id} note={note} measuredTextWidth={measuredTextWidths.get(note.id)} onPointerDown={(event) => startDrag(note, event)}
            onRemove={(id) => submit({ type: "remove", id })} onNudge={nudge} />)}
        {drag && <Paper note={{ ...drag.note, ...drag.position }} measuredTextWidth={measureText(drag.note.text, drag.note.typeface)} dragging onPointerDown={() => { }} onRemove={() => { }} onNudge={() => { }} />}
      </div>
    </section>
    <footer className="assemble-bar">
      <span className="assemble-count">
        {trayNotes.length > 0
          ? <><strong>{trayNotes.length}</strong> {trayNotes.length === 1 ? "piece" : "pieces"} collected</>
          : "Collect text to begin"}
      </span>
      <button
        type="button"
        className="assemble-button"
        disabled={trayNotes.length === 0}
        onClick={openCanvas}
      >
        Assemble into a poem
      </button>
    </footer>
    <div className="drop-overlay" aria-hidden={!externalDrag}><span>Drop to collect</span></div>
    <div className={`side-toast${toast ? " is-visible" : ""}`} role="status">{toast}</div>
  </main>;
}

createRoot(document.getElementById("root")).render(<SidePanel />);
