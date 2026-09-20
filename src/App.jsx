import { Fragment, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { WORLD, ARTBOARD, THEMES, INITIAL_NOTES, TRASH, clamp, constrainNote, placeCuts, noteColors, isOnPage, isOverTrash, nextTilt } from "./workspace.js";
import { CUT_HIT, wordRuns, paperLocalPoint, nearestCut, splitPaper } from "./cutting.js";
import { exportPoem } from "./export.js";
import { TRAY, displayFontSize, packTray, insertAt, trayInsertionIndex, isInsideTray, trayScrollSpeed } from "./tray.js";
import { TEXTURE, texture, texturePlacementCss } from "./texture.js";
import { createTextMeasure, fontStack, fontWeight, loadNoteFonts, referenceSize } from "./typeface.js";
import { MAX_NOTES, applyPendingActions, beforeNoteIdAt, createNoteStore, makeNoteId, noteReducer, orderedNotes } from "./note-store.js";
import { MESSAGE, PROTOCOL_SOURCE, isBridgeMessage } from "./protocol.js";
import { FORTUNE, createFortuneNote, pickFortune } from "./fortune.js";
import { FortuneEnds } from "./FortuneEnds.jsx";
import "./fortune.css";

let textMeasure;
const measureText = (text, typefaceId) => (textMeasure ??= createTextMeasure())(text, typefaceId);

function PaperTexture({ theme }) {
  return theme.texture ? <img className="paper-texture" src={theme.texture} alt="" draggable="false" style={{ opacity: theme.textureOpacity }} /> : null;
}

function PaperStrip({ note, theme, sceneRef, cutting, onCut, onPickUp, onKeyMove, onRemove, inTray = false, drag, landingFrom, measuredTextWidth, unfolding = false }) {
  const elementRef = useRef(null);
  const textRef = useRef(null);
  const cutGuideRef = useRef(null);
  const cutTargetRef = useRef(null);
  const cutGapsRef = useRef([]);
  const colors = noteColors(note, theme);
  const words = useMemo(() => wordRuns(note.text), [note.text]);
  // The stored fontSize was measured in this note's own face; shrink further only if it overflows.
  const typeSize = displayFontSize(note, measuredTextWidth);

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
        const naturalScale = referenceSize(note.typeface) / Math.max(1, typeSize);
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
  }, [cutting, words, note.width, note.textOffset, typeSize]);

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

  const discardOnDelete = (event) => {
    if (cutting || drag || (event.key !== "Delete" && event.key !== "Backspace")) return;
    event.preventDefault();
    onRemove?.(note.id);
  };

  const pickUp = (event) => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    event.preventDefault();
    if (cutting) return;
    elementRef.current.focus({ preventScroll: true });
    onPickUp(note, event, elementRef.current.getBoundingClientRect());
  };

  return (
    <div ref={elementRef} className={`paper-strip${note.kind === "fortune" ? " fortune-strip" : ""}${unfolding ? " is-unfolding" : ""}${inTray ? " is-in-tray" : ""}${drag ? " is-lifted drag-overlay" : ""}${drag?.overTrash ? " is-over-trash" : ""}${cutting && words.length > 1 ? " is-cuttable" : ""}`}
      role="button" tabIndex={drag ? -1 : 0} aria-hidden={drag ? true : undefined} aria-label={`${cutting ? "Cut" : "Move"} paper: ${note.text}`} aria-describedby="paper-instructions"
      data-note-id={note.id} data-location={inTray ? "tray" : "desk"}
      style={{
        left: note.x, top: note.y, width: note.width, height: note.height,
        transform: `rotate(${note.angle}deg)`, zIndex: drag ? 500 : note.z,
        "--strip-color": colors.paper, "--ink-color": colors.ink,
        "--grip": drag?.grip ?? "50% 50%", "--tilt": `${drag?.tilt ?? 0}deg`,
        "--type-size": `${typeSize}px`, "--type-face": fontStack(note.typeface), "--type-weight": fontWeight(note.typeface),
        "--paper-texture": `url(${texture(note.texture).asset})`,
        "--paper-texture-offset": texturePlacementCss(note.id, note.width, note.height),
        // Fortune keeps its plain white slip, independent of the palette and of the paper library.
        "--paper-texture-opacity": note.kind === "fortune" ? 0 : texture(note.texture).opacity,
      }}
      onPointerDown={pickUp} onKeyDown={discardOnDelete} onPointerMove={cutting ? previewCut : undefined}
      onPointerEnter={cutting ? previewCut : undefined} onPointerLeave={() => showCutTarget(null)} onBlur={() => showCutTarget(null)}
      onClick={(event) => { if (cutting) { const gap = cutAtPointer(event); if (gap) onCut(note.id, gap); } }}
      onDoubleClick={(event) => event.stopPropagation()}>
      <div className="paper-face">
        <FortuneEnds note={note} />
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
  const dragListenersRef = useRef(null);
  const viewRef = useRef(null);
  const pendingCommandsRef = useRef(new Map());
  const authoritativeRevisionRef = useRef(-1);
  const authoritativeDocumentRef = useRef(null);
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
  const [fontsReady, setFontsReady] = useState(false);
  const [drawingFortune, setDrawingFortune] = useState(false);
  const drawingFortuneRef = useRef(false);
  const previousFortuneRef = useRef(null);
  const [unfoldingId, setUnfoldingId] = useState(null);
  const theme = THEMES.find((item) => item.id === themeId);
  const trayNotes = useMemo(() => orderedNotes(store, "tray"), [store]);
  // Remeasuring once the faces land keeps demo widths and any CDN swap-in from overflowing a strip.
  const measuredTextWidths = useMemo(() => new Map(notes.map((note) => [note.id, measureText(note.text, note.typeface)])), [notes, fontsReady]);
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

  useEffect(() => {
    let active = true;
    loadNoteFonts().then(() => { if (active) setFontsReady(true); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => () => { clearTimeout(toastTimer.current); detachDrag(); }, []);

  useEffect(() => {
    if (!unfoldingId) return;
    const timer = setTimeout(() => setUnfoldingId(null), 300);
    return () => clearTimeout(timer);
  }, [unfoldingId]);

  useEffect(() => {
    const receive = (event) => {
      if (event.source !== window || event.origin !== window.location.origin || !isBridgeMessage(event.data, PROTOCOL_SOURCE.extension)) return;
      if (event.data.type === MESSAGE.snapshot) {
        if (event.data.document.revision < authoritativeRevisionRef.current) return;
        authoritativeRevisionRef.current = event.data.document.revision;
        authoritativeDocumentRef.current = event.data.document;
        const pendingDrops = [...pendingCommandsRef.current.values()]
          .filter((entry) => entry.optimistic)
          .map((entry) => entry.action);
        const visibleDocument = applyPendingActions(event.data.document, pendingDrops) ?? event.data.document;
        dispatch({ type: "hydrate", document: visibleDocument });
        extensionRef.current = true;
        setExtensionConnected(true);
        topLayer.current = Math.max(INITIAL_NOTES.length + 9, ...event.data.document.notes.map((note) => note.z || 0)) + 1;
      }
      if (event.data.type === MESSAGE.ack && typeof event.data.commandId === "string") {
        pendingCommandsRef.current.delete(event.data.commandId);
      }
      if (event.data.type === MESSAGE.error) {
        if (typeof event.data.commandId === "string") pendingCommandsRef.current.delete(event.data.commandId);
        if (event.data.code === "bridge-disconnected") setExtensionConnected(false);
        if (authoritativeDocumentRef.current) {
          const remainingDrops = [...pendingCommandsRef.current.values()]
            .filter((entry) => entry.optimistic)
            .map((entry) => entry.action);
          const restored = applyPendingActions(authoritativeDocumentRef.current, remainingDrops);
          if (restored) dispatch({ type: "hydrate", document: restored });
        }
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
    const commandId = makeNoteId();
    const optimistic = action.type === "drop" || action.type === "remove" || action.type === "draw-fortune";
    // Pointer drops update immediately so the drag overlay is replaced at the same coordinates.
    // A throw-away does the same: the strip is gone, and there is no undo to wait for.
    // The next Worker snapshot remains authoritative and will reconcile any concurrent change.
    if (optimistic) dispatch(action);
    pendingCommandsRef.current.set(commandId, { action, optimistic });
    window.postMessage({ source: PROTOCOL_SOURCE.main, type: MESSAGE.command, commandId, action }, window.location.origin);
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
    const overTrash = !inTray && isOverTrash(point);
    const view = viewRef.current;
    const others = view.trayNotes.filter((note) => note.id !== current.note.id);
    const preview = packTray(current.inTray ? insertAt(others, current.note, current.index) : others);
    const index = inTray ? trayInsertionIndex(preview, { x: point.x, y: point.y - TRAY.top + trayRef.current.scrollTop }, current.note.id, current.index) : current.index;
    const position = constrainNote({ ...current.note, x: point.x - current.offset.x, y: point.y - current.offset.y });
    const now = performance.now();
    const tilt = clamp((point.x - current.point.x) / Math.max(8, now - current.lastMove) * 1.4, -2, 2);
    const next = { ...current, point, clientX, clientY, inTray, overTrash, index, position, tilt, lastMove: now };
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
    sceneRef.current.focus({ preventScroll: true });
    setLanding(null);
    dragRef.current = next;
    setDrag(next);
    trackDrag(event.pointerId);
    // Capture on the stable workspace; the paper can move out of the scroll container. It is a
    // convenience, not the contract: a flick can lose it before it is even granted, so the drag
    // is driven by the window listeners above and never depends on capture surviving.
    try { sceneRef.current.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
  };

  // The pointer is followed on the window, not on the strip or the workspace, so re-rendering the
  // paper out from under the cursor, losing pointer capture, or leaving the scene cannot strand a
  // drag half way. Nothing here abandons the gesture: an interruption puts the paper down where it
  // is, and only Escape flies it back.
  const trackDrag = (pointerId) => {
    detachDrag();
    const mine = (event) => event.pointerId === pointerId && dragRef.current?.pointerId === pointerId;
    const move = (event) => {
      if (!mine(event)) return;
      // The button came up somewhere we never saw the pointerup. Put the paper down here.
      if (event.buttons === 0) finishDrag();
      else updateDrag(event.clientX, event.clientY);
    };
    const up = (event) => {
      if (!mine(event)) return;
      updateDrag(event.clientX, event.clientY);
      finishDrag();
    };
    const interrupt = (event) => { if (mine(event)) finishDrag(); };
    // Capture phase: nothing in between can swallow the gesture with stopPropagation.
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", interrupt, true);
    dragListenersRef.current = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", interrupt, true);
    };
  };

  const detachDrag = () => {
    dragListenersRef.current?.();
    dragListenersRef.current = null;
  };

  const finishDrag = (cancel = false) => {
    const current = dragRef.current;
    if (!current) return;
    dragRef.current = null;
    detachDrag();
    // Escape still cancels over the bin: only a deliberate release throws the piece away.
    const discarding = !cancel && current.overTrash;
    if (discarding) discardNote(current.note.id);
    else if (!cancel) {
      // Coming off the tray is the throw: that is where a strip picks up its tilt. Nudging one
      // already on the desk keeps the angle it landed at, and the tray packs everything straight.
      const angle = current.inTray ? 0 : current.note.location === "tray" ? nextTilt() : current.note.angle;
      // A tilted strip claims more room than the flat one the drag was constrained against.
      const position = current.inTray ? current.position : constrainNote({ ...current.note, ...current.position, angle });
      commit({ type: "drop", id: current.note.id, location: current.inTray ? "tray" : "desk",
        beforeNoteId: current.inTray ? beforeNoteIdAt(viewRef.current.store, current.note.id, current.index) : null,
        patch: { ...position, angle, z: ++topLayer.current } });
    }
    // Canvas drops already end at their final coordinates. Only tray packing (or cancellation)
    // needs a positional landing animation from the pointer to a different resting slot. A
    // discarded strip lands nowhere and leaves no element behind to focus.
    setLanding(!discarding && (cancel || current.inTray) ? { id: current.note.id, ...current.position, angle: current.note.angle } : null);
    setDrag(null);
    if (sceneRef.current.hasPointerCapture(current.pointerId)) sceneRef.current.releasePointerCapture(current.pointerId);
    if (discarding) sceneRef.current?.focus({ preventScroll: true });
    else requestAnimationFrame(() => sceneRef.current?.querySelector(`[data-note-id="${current.note.id}"]`)?.focus({ preventScroll: true }));
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
    // Losing the window or resizing the scene ends the gesture but is not a change of mind, so the
    // paper is released where it stands. Escape is the one deliberate cancel that returns it.
    const release = () => finishDrag();
    const escape = (event) => { if (event.key === "Escape") { event.preventDefault(); finishDrag(true); } };
    window.addEventListener("blur", release);
    window.addEventListener("resize", release);
    window.addEventListener("keydown", escape);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", release);
      window.removeEventListener("resize", release);
      window.removeEventListener("keydown", escape);
    };
  }, [Boolean(drag)]);

  // Throwing a piece away is final: there is no undo, and nothing is kept to restore.
  // The bin and the strip leaving the desk are the whole confirmation; no toast follows.
  const discardNote = (id) => commit({ type: "remove", id });

  const removeNote = (id) => {
    discardNote(id);
    scissorsRef.current?.focus();
  };

  const drawFortune = async () => {
    if (drawingFortuneRef.current || dragRef.current) return;
    drawingFortuneRef.current = true;
    setDrawingFortune(true);
    try {
      await document.fonts.load(`${FORTUNE.fontSize}px "ABeeZee"`);
      const current = viewRef.current.store.notes;
      if (current.filter((note) => note.kind !== "fortune").length >= MAX_NOTES) {
        announce("The desk has 80 pieces. Remove a piece before opening a fortune.");
        return;
      }
      const previous = previousFortuneRef.current ?? current.find((note) => note.kind === "fortune")?.promptId;
      const prompt = pickFortune(previous, measureText);
      if (!prompt) throw new Error("No prompt fits");
      const note = createFortuneNote(prompt, makeNoteId(), measureText, ++topLayer.current);
      previousFortuneRef.current = prompt.id;
      setStyleOpen(false);
      setCutting(false);
      setUnfoldingId(note.id);
      commit({ type: "draw-fortune", note });
    } catch {
      announce("That fortune couldn’t open. Please try again.");
    } finally {
      drawingFortuneRef.current = false;
      setDrawingFortune(false);
    }
  };

  const cutNote = (id, gap) => {
    let original = notes.find((note) => note.id === id);
    if (!original) return;
    if (original.kind === "fortune" && original.location === "tray") {
      const packed = layout.items.find((note) => note.id === id);
      original = { ...packed, fontSize: displayFontSize(packed, measuredTextWidths.get(id)) };
      delete original.intrinsicWidth;
    }
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
        style={{ transform: `translate(-50%, -50%) scale(${scale})`, "--page-color": theme.page, "--back-color": theme.back,
          "--page-x": `${ARTBOARD.x}px`, "--page-y": `${ARTBOARD.y}px`, "--page-width": `${ARTBOARD.width}px`, "--page-height": `${ARTBOARD.height}px`,
          // The sheet is the same size under every strip, so it is declared once here.
          "--paper-texture-size": `${TEXTURE.width}px ${TEXTURE.height}px`,
          "--cut-hit-padding": `${CUT_HIT.padding / scale}px` }}>
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
                measuredTextWidth={measuredTextWidths.get(note.id)}
                landingFrom={landing?.id === note.id ? landing : null} />)}
          </div>
        </section>
        <div className="back-sheet" aria-hidden="true" />
        <section className="poem-sheet" aria-label="Poem page"><PaperTexture theme={theme} /></section>
        {notes.filter((note) => note.location !== "tray" && note.id !== drag?.note.id).map((note) => <PaperStrip key={note.id} note={note} theme={theme} sceneRef={sceneRef}
          unfolding={note.id === unfoldingId}
          cutting={cutting} onCut={cutNote} onPickUp={pickUpNote} onRemove={removeNote}
          measuredTextWidth={measuredTextWidths.get(note.id)}
          landingFrom={landing?.id === note.id ? landing : null} />)}
        {drag && <PaperStrip note={{ ...drag.note, ...drag.position, location: "desk", colorSource: undefined }} drag={drag} theme={theme} sceneRef={sceneRef}
          measuredTextWidth={measuredTextWidths.get(drag.note.id)} />}
        <button className="object-button fortune-button" aria-label="Open a fortune cookie" disabled={drawingFortune} onClick={drawFortune}>
          <span className="fortune-art"><img src="/assets/fortune-cookie.png" alt="" draggable="false" /></span>
          <span className="object-hint">A little inspiration</span>
        </button>
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
            <span className="palette-page" style={{ background: item.page }}><PaperTexture theme={item} /><span style={{ background: item.strip, color: item.ink }}>Aa</span></span>
            <span className="palette-name">{item.name}</span>
          </button>)}</div>
        </div>}
        <button className="object-button export-button" aria-label={exporting ? "Exporting poem" : "Export poem as PNG"} disabled={exporting} onClick={savePoem}>
          <span className="export-art"><img src="/assets/export-container.png" alt="" draggable="false" /></span>
          <span className="object-hint">Just the page. Ready to keep.</span>
        </button>
        <div className={`trash-can${drag?.overTrash ? " is-armed" : ""}`} style={{ left: TRASH.x, top: TRASH.y, width: TRASH.width, height: TRASH.height }} aria-hidden="true">
          <img src="/assets/trash-can.png" alt="" draggable="false" />
          <span className="trash-note">Let go to throw it away</span>
        </div>
        <span ref={measureRef} className="text-measure" aria-hidden="true" />
      </div>
      <p id="paper-instructions" className="visually-hidden">{cutting
        ? "Point between two words and click to cut. Or focus a strip, use left and right arrows to select a gap, then Enter to cut. Press Escape or click the scissors to return to dragging."
        : "Drag in the left tray to reorder, or onto the page to compose. Hold near the top or bottom of the tray to scroll while dragging. Escape cancels a drag. Arrow keys reorder tray pieces or move page pieces; Shift moves farther on the page. Drop a piece on the bin at the right, or press Delete, to throw it away for good — this cannot be undone. Click the scissors to cut. Double-click empty tray space to add words."}</p>
      <div className={`toast${toast ? " is-visible" : ""}`} role="status">{toast}</div>
      {!import.meta.env.DEV && !extensionConnected && <div className="connection-banner" role="status">Open the Cento Extension to connect your collected words.</div>}
    </main>
  );
}
