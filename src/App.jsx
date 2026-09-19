import { Fragment, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { WORLD, THEMES, INITIAL_NOTES, clamp, constrainNote, placeCuts, noteColors, isOnPage } from "./workspace.js";
import { CUT_HIT, wordRuns, paperLocalPoint, nearestCut, splitPaper } from "./cutting.js";
import { exportPoem } from "./export.js";
import { TRAY, packTray, insertAt, trayInsertionIndex, isInsideTray, trayScrollSpeed } from "./tray.js";
import { MAX_NOTES, beforeNoteIdAt, createNoteStore, makeNoteId, noteReducer, orderedNotes } from "./note-store.js";
import { MESSAGE, PROTOCOL_SOURCE, isBridgeMessage } from "./protocol.js";

function PaperStrip({ note, theme, sceneRef, cutting, onCut, onPickUp, onKeyMove, onRemove, inTray = false, drag, landingFrom }) {
  const elementRef = useRef(null);
  const textRef = useRef(null);
  const cutGuideRef = useRef(null);
  const cutTargetRef = useRef(null);
  const cutGapsRef = useRef([]);
  const colors = noteColors(note, theme);
  const words = useMemo(() => wordRuns(note.text), [note.text]);

  useLayoutEffect(() => {
    if (!landingFrom || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const element = elementRef.current;
    const rect = element.getBoundingClientRect();
    const scene = sceneRef.current.getBoundingClientRect();
    const scale = scene.width / WORLD.width;
    const dx = landingFrom.x + note.width / 2 - (rect.left + rect.width / 2 - scene.left) / scale;
    const dy = landingFrom.y + note.height / 2 - (rect.top + rect.height / 2 - scene.top) / scale;
    const animation = element.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(${landingFrom.angle}deg)` },
      { transform: `translate(0, 0) rotate(${note.angle}deg)` },
    ], { duration: 190, easing: "cubic-bezier(.2,.75,.25,1)" });
    return () => animation.cancel();
  }, [landingFrom]);

  const showCutTarget = (target) => {
    cutTargetRef.current = target;
    const guide = cutGuideRef.current;
    if (!guide) return;
    // This transient pointer feedback does not need a React render or animation frame.
    guide.hidden = !target;
    if (target) guide.style.left = `${target.x}px`;
  };

  useLayoutEffect(() => {
    showCutTarget(null);
    cutGapsRef.current = [];
    if (!cutting || words.length < 2) return;
    const measureGaps = () => {
      const textLeft = note.textOffset ?? (note.width - textRef.current.offsetWidth) / 2;
      const elements = textRef.current.querySelectorAll(".paper-word");
      cutGapsRef.current = words.slice(0, -1).map((word, index) => {
        const left = textLeft + elements[index].offsetLeft + elements[index].offsetWidth;
        const right = textLeft + elements[index + 1].offsetLeft;
        const naturalScale = 18 / Math.max(1, note.fontSize || 18);
        return {
          left, right, x: (left + right) / 2, textLeft,
          leftEnd: word.end, rightStart: words[index + 1].start,
          leftTextWidth: (left - textLeft) * naturalScale,
          rightTextWidth: (textLeft + textRef.current.offsetWidth - right) * naturalScale,
        };
      });
      if (cutTargetRef.current) showCutTarget(cutGapsRef.current.find((gap) => gap.leftEnd === cutTargetRef.current.leftEnd) ?? null);
    };
    measureGaps();
    // Font loading can change word metrics. Re-measure then, not on every pointer move.
    const observer = new ResizeObserver(measureGaps);
    observer.observe(textRef.current);
    return () => observer.disconnect();
  }, [cutting, words, note.width, note.textOffset, note.fontSize]);

  const cutAtPointer = (event) => {
    if (!cutting || words.length < 2) return null;
    const scale = sceneRef.current.getBoundingClientRect().width / WORLD.width;
    const rect = elementRef.current.getBoundingClientRect();
    const point = paperLocalPoint({ ...note, x: 0, y: 0 }, {
      x: (event.clientX - rect.left - rect.width / 2) / scale + note.width / 2,
      y: (event.clientY - rect.top - rect.height / 2) / scale + note.height / 2,
    });
    return nearestCut(cutGapsRef.current, point, note.height, scale, cutTargetRef.current);
  };

  const previewCut = (event) => {
    const target = cutAtPointer(event);
    if (cutTargetRef.current !== target) showCutTarget(target);
  };

  const pickUp = (event) => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    event.preventDefault();
    if (cutting) return;
    elementRef.current.focus({ preventScroll: true });
    onPickUp(note, event, elementRef.current.getBoundingClientRect());
  };

  return (
    <div ref={elementRef} className={`paper-strip${inTray ? " is-in-tray" : ""}${drag ? " is-lifted drag-overlay" : ""}${cutting && words.length > 1 ? " is-cuttable" : ""}`}
      role="button" tabIndex={drag ? -1 : 0} aria-hidden={drag ? true : undefined} aria-label={`${cutting ? "Cut" : "Move"} paper: ${note.text}`} aria-describedby="paper-instructions"
      data-note-id={note.id} data-location={inTray ? "tray" : "desk"}
      style={{
        left: note.x, top: note.y, width: note.width, height: note.height,
        transform: `rotate(${note.angle}deg)`, zIndex: drag ? 500 : note.z,
        "--strip-color": colors.paper, "--ink-color": colors.ink,
        "--grip": drag?.grip ?? "50% 50%", "--tilt": `${drag?.tilt ?? 0}deg`, "--type-size": `${note.fontSize || 18}px`,
      }}
      onPointerDown={pickUp} onPointerMove={cutting ? previewCut : undefined}
      onPointerEnter={cutting ? previewCut : undefined} onPointerLeave={() => showCutTarget(null)} onBlur={() => showCutTarget(null)}
      onClick={(event) => { if (cutting) { const gap = cutAtPointer(event); if (gap) onCut(note.id, gap); } }}
      onDoubleClick={(event) => event.stopPropagation()}>
      <div className="paper-face">
        <span className="paper-text" ref={textRef} style={note.textOffset == null ? undefined : { left: note.textOffset, transform: "translateY(-50%)" }}>
          {words.map((word, index) => <Fragment key={word.start}>
            {index === 0 ? note.text.slice(0, word.start) : null}
            <span className="paper-word">{word.text}</span>
            {note.text.slice(word.end, words[index + 1]?.start ?? note.text.length)}
          </Fragment>)}
        </span>
        {cutting && words.length > 1 && <span className="cut-guide" ref={cutGuideRef} hidden aria-hidden="true" />}
      </div>
    </div>
  );
}

export function App() {
  const viewportRef = useRef(null);
  const sceneRef = useRef(null);
  const trayRef = useRef(null);
  const measureRef = useRef(null);
  const scissorsRef = useRef(null);
  const styleRef = useRef(null);
  const stylePanelRef = useRef(null);
  const topLayer = useRef(INITIAL_NOTES.length + 9);
  const toastTimer = useRef(0);
  const dragRef = useRef(null);
  const viewRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [store, dispatch] = useReducer(noteReducer, import.meta.env.DEV ? INITIAL_NOTES : [], createNoteStore);
  const extensionRef = useRef(false);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const notes = store.notes;
  const [drag, setDrag] = useState(null);
  const [landing, setLanding] = useState(null);
  const [themeId, setThemeId] = useState("original");
  const [cutting, setCutting] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState("");
  const theme = THEMES.find((item) => item.id === themeId);
  const trayNotes = useMemo(() => orderedNotes(store, "tray"), [store]);
  const layout = useMemo(() => {
    if (!drag) return packTray(trayNotes);
    const others = trayNotes.filter((note) => note.id !== drag.note.id);
    return packTray(drag.inTray ? insertAt(others, drag.note, drag.index) : others);
  }, [trayNotes, drag?.note.id, drag?.inTray, drag?.index]);
  viewRef.current = { store, layout, trayNotes };

  useLayoutEffect(() => {
    const resize = () => {
      const viewport = viewportRef.current;
      setScale(Math.min(viewport.clientWidth / WORLD.width, viewport.clientHeight / WORLD.height));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const receive = (event) => {
      if (event.source !== window || event.origin !== window.location.origin || !isBridgeMessage(event.data, PROTOCOL_SOURCE.extension)) return;
      if (event.data.type === MESSAGE.snapshot) {
        dispatch({ type: "hydrate", document: event.data.document });
        extensionRef.current = true;
        setExtensionConnected(true);
        topLayer.current = Math.max(INITIAL_NOTES.length + 9, ...event.data.document.notes.map((note) => note.z || 0)) + 1;
      }
      if (event.data.type === MESSAGE.error) {
        setToast(event.data.message || "The Extension could not save that change.");
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(""), 3400);
        // A rejected optimistic move is repaired from the Worker's authoritative document.
        window.postMessage({ source: PROTOCOL_SOURCE.main, type: MESSAGE.hello }, window.location.origin);
      }
    };
    window.addEventListener("message", receive);
    window.postMessage({ source: PROTOCOL_SOURCE.main, type: MESSAGE.hello }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    const escape = (event) => {
      if (event.key === "Escape") setCutting(false);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

  useEffect(() => {
    if (!styleOpen) return;
    stylePanelRef.current?.querySelector('[aria-pressed="true"]')?.focus();
    const outside = (event) => {
      if (!stylePanelRef.current?.contains(event.target) && !styleRef.current?.contains(event.target)) setStyleOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        setStyleOpen(false);
        styleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [styleOpen]);

  const announce = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3400);
  };
  const commit = (action) => {
    if (!extensionRef.current) { dispatch(action); return; }
    // Pointer drops update immediately so the drag overlay is replaced at the same coordinates.
    // The next Worker snapshot remains authoritative and will reconcile any concurrent change.
    if (action.type === "drop") dispatch(action);
    window.postMessage({ source: PROTOCOL_SOURCE.main, type: MESSAGE.command, commandId: makeNoteId(), action }, window.location.origin);
  };
  const worldPoint = (clientX, clientY) => {
    const rect = sceneRef.current.getBoundingClientRect();
    const scale = rect.width / WORLD.width;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const updateDrag = (clientX, clientY) => {
    const current = dragRef.current;
    if (!current) return;
    const point = worldPoint(clientX, clientY);
    const inTray = isInsideTray(point);
    const view = viewRef.current;
    const others = view.trayNotes.filter((note) => note.id !== current.note.id);
    const preview = packTray(current.inTray ? insertAt(others, current.note, current.index) : others);
    const index = inTray ? trayInsertionIndex(preview, { x: point.x, y: point.y - TRAY.top + trayRef.current.scrollTop }, current.note.id, current.index) : current.index;
    const position = constrainNote({ ...current.note, x: point.x - current.offset.x, y: point.y - current.offset.y });
    const now = performance.now();
    const tilt = clamp((point.x - current.point.x) / Math.max(8, now - current.lastMove) * 1.4, -2, 2);
    const next = { ...current, point, clientX, clientY, inTray, index, position, tilt, lastMove: now };
    dragRef.current = next;
    setDrag(next);
  };

  const pickUpNote = (note, event, bounds) => {
    if (dragRef.current) return;
    const point = worldPoint(event.clientX, event.clientY);
    const center = worldPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    const position = { x: center.x - note.width / 2, y: center.y - note.height / 2 };
    const grip = paperLocalPoint({ ...note, ...position }, point);
    const index = Math.max(0, trayNotes.findIndex((item) => item.id === note.id));
    const next = { note: { ...note, ...position }, pointerId: event.pointerId, point, position,
      clientX: event.clientX, clientY: event.clientY, offset: { x: point.x - position.x, y: point.y - position.y },
      inTray: note.location === "tray", index, grip: `${grip.x}px ${grip.y}px`, tilt: 0, lastMove: performance.now() };
    // Capture on the stable workspace; the paper can move out of the scroll container.
    sceneRef.current.setPointerCapture(event.pointerId);
    sceneRef.current.focus({ preventScroll: true });
    setLanding(null);
    dragRef.current = next;
    setDrag(next);
  };

  const finishDrag = (cancel = false) => {
    const current = dragRef.current;
    if (!current) return;
    dragRef.current = null;
    if (!cancel) {
      commit({ type: "drop", id: current.note.id, location: current.inTray ? "tray" : "desk",
        beforeNoteId: current.inTray ? beforeNoteIdAt(viewRef.current.store, current.note.id, current.index) : null,
        patch: { ...current.position, angle: current.inTray ? 0 : current.note.angle, z: ++topLayer.current } });
    }
    // Canvas drops already end at their final coordinates. Only tray packing (or cancellation)
    // needs a positional landing animation from the pointer to a different resting slot.
    setLanding(cancel || current.inTray ? { id: current.note.id, ...current.position, angle: current.note.angle } : null);
    setDrag(null);
    if (sceneRef.current.hasPointerCapture(current.pointerId)) sceneRef.current.releasePointerCapture(current.pointerId);
    requestAnimationFrame(() => sceneRef.current?.querySelector(`[data-note-id="${current.note.id}"]`)?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!drag) return;
    let frame;
    let previousTime = performance.now();
    const tick = (time) => {
      const current = dragRef.current;
      if (!current) return;
      const scroll = trayRef.current;
      const speed = trayScrollSpeed(current.point);
      const before = scroll.scrollTop;
      scroll.scrollTop += speed * Math.min(time - previousTime, 32) / 1000;
      if (before !== scroll.scrollTop) updateDrag(current.clientX, current.clientY);
      else if (time - current.lastMove > 50 && Math.abs(current.tilt) > 0.01) {
        const next = { ...current, tilt: current.tilt * 0.76 };
        dragRef.current = next;
        setDrag(next);
      }
      previousTime = time;
      frame = requestAnimationFrame(tick);
    };
    const cancel = () => finishDrag(true);
    const escape = (event) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } };
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    window.addEventListener("keydown", escape);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, [Boolean(drag)]);

  const removeNote = (id) => {
    commit({ type: "remove", id });
    scissorsRef.current?.focus();
    announce("Piece removed.");
  };

  const cutNote = (id, gap) => {
    const original = notes.find((note) => note.id === id);
    if (!original) return;
    if (notes.length >= MAX_NOTES) { announce("The desk has 80 pieces. Remove a piece before cutting again."); return; }
    const halves = splitPaper(original.location === "tray" ? { ...original, angle: 0 } : original, gap);
    if (!halves) return;
    const colorSource = original.colorSource ?? (isOnPage(original) ? "page" : "tray");
    const replacements = halves.map((note) => ({ ...note, colorSource, parentFragmentId: id, id: makeNoteId(), z: ++topLayer.current }));
    commit({ type: "cut", id, children: replacements });
  };

  const savePoem = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportPoem(notes, theme);
      announce("Your poem is ready — exported as a PNG.");
    } catch {
      announce("That export didn’t quite work. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className={`workspace-viewport${cutting ? " is-cutting" : ""}`} ref={viewportRef} aria-label="Cut-ups poetry workspace">
      <div className={`workspace${drag ? " is-dragging" : ""}`} ref={sceneRef} tabIndex={-1}
        onPointerMove={(event) => { if (event.pointerId === dragRef.current?.pointerId) updateDrag(event.clientX, event.clientY); }}
        onPointerUp={(event) => { if (event.pointerId === dragRef.current?.pointerId) { updateDrag(event.clientX, event.clientY); finishDrag(); } }}
        onPointerCancel={() => finishDrag(true)} onLostPointerCapture={() => finishDrag(true)}
        style={{ transform: `translate(-50%, -50%) scale(${scale})`, "--page-color": theme.page, "--back-color": theme.back, "--cut-hit-padding": `${CUT_HIT.padding / scale}px` }}>
        <div className="word-tray"/>
        <section className="tray-scroll" ref={trayRef} aria-label="Collected paper strips" tabIndex={0}
          data-sequence-revision={store.revision}
          style={{ top: TRAY.top, height: TRAY.bottom - TRAY.top, width: TRAY.width }}
          onScroll={() => { if (dragRef.current) updateDrag(dragRef.current.clientX, dragRef.current.clientY); }}>
          <div className="tray-content" style={{ height: Math.max(TRAY.bottom - TRAY.top, layout.height + 24) }}>
            {layout.items.map((note) => note.id === drag?.note.id
              ? <div key={note.id} className="tray-placeholder" aria-hidden="true" style={{ left: note.x, top: note.y, width: note.width, height: note.height }} />
              : <PaperStrip key={note.id} note={note} inTray theme={theme} sceneRef={sceneRef}
                cutting={cutting} onCut={cutNote} onPickUp={pickUpNote} onRemove={removeNote}
                landingFrom={landing?.id === note.id ? landing : null} />)}
          </div>
        </section>
        <div className="back-sheet" aria-hidden="true" />
        <section className="poem-sheet" aria-label="Poem page" />
        {notes.filter((note) => note.location !== "tray" && note.id !== drag?.note.id).map((note) => <PaperStrip key={note.id} note={note} theme={theme} sceneRef={sceneRef}
          cutting={cutting} onCut={cutNote} onPickUp={pickUpNote} onRemove={removeNote}
          landingFrom={landing?.id === note.id ? landing : null} />)}
        {drag && <PaperStrip note={{ ...drag.note, ...drag.position, location: "desk", colorSource: undefined }} drag={drag} theme={theme} sceneRef={sceneRef} />}
        <button className="object-button scissors-button" ref={scissorsRef} aria-label={cutting ? "Exit cutting mode" : "Enter cutting mode"}
          aria-pressed={cutting} onClick={() => { setStyleOpen(false); setCutting((current) => !current); }}>
          <img src="/assets/scissors.png" alt="" draggable="false" />
          <span className="object-hint">{cutting ? "Put down scissors · Esc" : "Pick up scissors"}</span>
        </button>
        <button className="object-button style-button" ref={styleRef} aria-label="Change Style"
          aria-expanded={styleOpen} aria-controls="style-choices" onClick={() => setStyleOpen((current) => !current)}>
          <span className="style-art"><img src="/assets/style-papers.png" alt="" draggable="false" /></span>
          <span className="style-lettering">Change<br />Style</span>
        </button>
        {styleOpen && <div id="style-choices" className="style-panel" ref={stylePanelRef} role="group" aria-label="Paper palettes">
          <p>A change of paper.</p>
          <div className="palette-list">{THEMES.map((item) => <button key={item.id} aria-label={item.name} title={item.name} aria-pressed={themeId === item.id}
            onClick={() => { setThemeId(item.id); setStyleOpen(false); styleRef.current?.focus(); }}>
            <span className="palette-page" style={{ background: item.page }}><span style={{ background: item.strip, color: item.ink }}>Aa</span></span>
            <span className="palette-name">{item.name}</span>
          </button>)}</div>
        </div>}
        <button className="object-button export-button" aria-label={exporting ? "Exporting poem" : "Export poem as PNG"} disabled={exporting} onClick={savePoem}>
          <span className="export-art"><img src="/assets/export-container.png" alt="" draggable="false" /></span>
          <span className="object-hint">Just the page. Ready to keep.</span>
        </button>
        <span ref={measureRef} className="text-measure" aria-hidden="true" />
      </div>
      <p id="paper-instructions" className="visually-hidden">{cutting
        ? "Point between two words and click to cut. Or focus a strip, use left and right arrows to select a gap, then Enter to cut. Press Escape or click the scissors to return to dragging."
        : "Drag in the left tray to reorder, or onto the page to compose. Hold near the top or bottom of the tray to scroll while dragging. Escape cancels a drag. Arrow keys reorder tray pieces or move page pieces; Shift moves farther on the page. Delete removes a piece. Click the scissors to cut. Double-click empty tray space to add words."}</p>
      <div className={`toast${toast ? " is-visible" : ""}`} role="status">{toast}</div>
      {!import.meta.env.DEV && !extensionConnected && <div className="connection-banner" role="status">Open the Cento Extension to connect your collected words.</div>}
    </main>
  );
}
