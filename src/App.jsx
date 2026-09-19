import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ARTBOARD, WORLD, THEMES, INITIAL_NOTES, clamp, constrainNote, cutText, placeCuts, noteColors, isOnPage } from "./workspace.js";
import { CUT_HIT, wordRuns, paperLocalPoint, nearestCut, splitPaper } from "./cutting.js";
import { exportPoem } from "./export.js";

function PaperStrip({ note, theme, sceneRef, cutting, onCut, onMove, onRaise, onRemove }) {
  const elementRef = useRef(null);
  const textRef = useRef(null);
  const cutGuideRef = useRef(null);
  const cutTargetRef = useRef(null);
  const cutGapsRef = useRef([]);
  const dragRef = useRef(null);
  const frameRef = useRef(0);
  const motionRef = useRef({ current: 0, target: 0, lastMove: 0 });
  const [lifted, setLifted] = useState(false);
  const [tilt, setTilt] = useState(0);
  const [grip, setGrip] = useState("50% 50%");
  const colors = noteColors(note, theme);
  const words = useMemo(() => wordRuns(note.text), [note.text]);

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
        return { left, right, x: (left + right) / 2, textLeft, leftEnd: word.end, rightStart: words[index + 1].start };
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
    const rect = sceneRef.current.getBoundingClientRect();
    const scale = rect.width / WORLD.width;
    const point = paperLocalPoint(note, {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    });
    return nearestCut(cutGapsRef.current, point, note.height, scale, cutTargetRef.current);
  };

  const previewCut = (event) => {
    const target = cutAtPointer(event);
    if (cutTargetRef.current !== target) showCutTarget(target);
  };

  const settle = () => {
    cancelAnimationFrame(frameRef.current);
    dragRef.current = null;
    motionRef.current = { current: 0, target: 0, lastMove: 0 };
    setLifted(false);
    setTilt(0);
  };

  useEffect(() => {
    const release = () => { if (dragRef.current) settle(); };
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const animateTilt = (time) => {
    if (!dragRef.current) return;
    const motion = motionRef.current;
    if (time - motion.lastMove > 50) motion.target *= 0.76;
    motion.current += (motion.target - motion.current) * 0.2;
    setTilt(Math.abs(motion.current) < 0.01 ? 0 : motion.current);
    frameRef.current = requestAnimationFrame(animateTilt);
  };

  const pickUp = (event) => {
    if (!event.isPrimary || event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    if (cutting) return;
    const rect = sceneRef.current.getBoundingClientRect();
    const scale = rect.width / WORLD.width;
    const px = (event.clientX - rect.left) / scale;
    const py = (event.clientY - rect.top) / scale;
    const angle = -note.angle * Math.PI / 180;
    const dx = px - note.x - note.width / 2;
    const dy = py - note.y - note.height / 2;
    // Invert the resting rotation so the lifted surface pivots at the real grip.
    setGrip(`${dx * Math.cos(angle) - dy * Math.sin(angle) + note.width / 2}px ${dx * Math.sin(angle) + dy * Math.cos(angle) + note.height / 2}px`);
    dragRef.current = {
      pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      x: note.x, y: note.y, scale, lastX: event.clientX, lastTime: event.timeStamp,
    };
    elementRef.current.setPointerCapture(event.pointerId);
    elementRef.current.focus({ preventScroll: true });
    onRaise(note.id);
    setLifted(true);
    frameRef.current = requestAnimationFrame(animateTilt);
  };

  const move = (event) => {
    if (cutting) { previewCut(event); return; }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Use pointer deltas, not the rotated bounding box: no jump on first movement.
    onMove(note.id, constrainNote({
      ...note,
      x: drag.x + (event.clientX - drag.clientX) / drag.scale,
      y: drag.y + (event.clientY - drag.clientY) / drag.scale,
    }));
    const velocity = (event.clientX - drag.lastX) / drag.scale / Math.max(8, event.timeStamp - drag.lastTime);
    motionRef.current.target = clamp(velocity * 1.4, -2, 2);
    motionRef.current.lastMove = performance.now();
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
  };

  const putDown = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    settle();
    if (elementRef.current.hasPointerCapture(event.pointerId)) elementRef.current.releasePointerCapture(event.pointerId);
  };

  const moveWithKeys = (event) => {
    if (cutting) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        if (words.length < 2) return;
        const currentIndex = words.findIndex((word) => word.end === cutTargetRef.current?.leftEnd);
        const index = clamp(currentIndex + (event.key === "ArrowRight" ? 1 : -1), 0, words.length - 2);
        showCutTarget(cutGapsRef.current[index] ?? null);
      }
      if ((event.key === "Enter" || event.key === " ") && cutTargetRef.current) {
        event.preventDefault();
        onCut(note.id, cutTargetRef.current);
      }
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (direction) {
      event.preventDefault();
      const step = event.shiftKey ? 24 : 8;
      onRaise(note.id);
      onMove(note.id, constrainNote({ ...note, x: note.x + direction[0] * step, y: note.y + direction[1] * step }));
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(note.id);
    }
  };

  return (
    <div ref={elementRef} className={`paper-strip${lifted ? " is-lifted" : ""}${cutting && words.length > 1 ? " is-cuttable" : ""}`}
      role="button" tabIndex={0} aria-label={`${cutting ? "Cut" : "Move"} paper: ${note.text}`} aria-describedby="paper-instructions"
      data-note-id={note.id}
      style={{
        left: note.x, top: note.y, width: note.width, height: note.height,
        transform: `rotate(${note.angle}deg)`, zIndex: lifted ? 500 : note.z,
        "--strip-color": colors.paper, "--ink-color": colors.ink,
        "--grip": grip, "--tilt": `${tilt}deg`, "--type-size": `${note.fontSize || 18}px`,
      }}
      onPointerDown={pickUp} onPointerMove={move} onPointerUp={putDown}
      onPointerEnter={cutting ? previewCut : undefined} onPointerLeave={() => showCutTarget(null)} onBlur={() => showCutTarget(null)}
      onClick={(event) => { if (cutting) { const gap = cutAtPointer(event); if (gap) onCut(note.id, gap); } }}
      onPointerCancel={putDown} onLostPointerCapture={putDown} onKeyDown={moveWithKeys}>
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

function TextDialog({ onClose, onCut }) {
  const dialogRef = useRef(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState("lines");
  const [error, setError] = useState("");
  const pieces = cutText(text, mode);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!pieces.length) return;
    const result = await onCut(pieces);
    if (result) setError(result);
    else onClose();
  };

  return (
    <dialog className="cut-dialog" ref={dialogRef} onCancel={onClose} onClick={(event) => {
      if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }
    }} aria-labelledby="cut-title">
      <form onSubmit={submit}>
        <button type="button" className="close-button" aria-label="Close text editor" onClick={onClose}>×</button>
        <p className="eyebrow">A LITTLE LANGUAGE, REARRANGED</p>
        <h1 id="cut-title">Bring a few words.</h1>
        <label htmlFor="source-text">Start with a sentence, a poem, anything.</label>
        <textarea id="source-text" value={text} autoFocus maxLength={4000}
          onChange={(event) => { setText(event.target.value); setError(""); }}
          placeholder={"the moon remembers\nwhat the morning forgets"} />
        <fieldset className="cut-options">
          <legend>Add as</legend>
          <label><input type="radio" name="cut-mode" value="words" checked={mode === "words"} onChange={() => setMode("words")} /> Words</label>
          <label><input type="radio" name="cut-mode" value="lines" checked={mode === "lines"} onChange={() => setMode("lines")} /> Lines</label>
        </fieldset>
        <div className="cut-footer">
          <span>{pieces.length} {pieces.length === 1 ? "piece" : "pieces"} of possibility</span>
          <button className="cut-submit" disabled={!pieces.length} type="submit">Add to desk</button>
        </div>
        <p className="form-error" role="alert">{error}</p>
      </form>
    </dialog>
  );
}

export function App() {
  const viewportRef = useRef(null);
  const sceneRef = useRef(null);
  const measureRef = useRef(null);
  const scissorsRef = useRef(null);
  const styleRef = useRef(null);
  const stylePanelRef = useRef(null);
  const nextId = useRef(4);
  const topLayer = useRef(12);
  const toastTimer = useRef(0);
  const [scale, setScale] = useState(1);
  const [notes, setNotes] = useState(INITIAL_NOTES);
  const [themeId, setThemeId] = useState("original");
  const [textOpen, setTextOpen] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState("");
  const theme = THEMES.find((item) => item.id === themeId);

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
  const moveNote = (id, position) => setNotes((current) => current.map((note) => note.id === id ? { ...note, colorSource: undefined, x: position.x, y: position.y } : note));
  const raiseNote = (id) => {
    const z = ++topLayer.current;
    setNotes((current) => current.map((note) => note.id === id ? { ...note, z } : note));
  };

  const cutNote = (id, gap) => {
    const original = notes.find((note) => note.id === id);
    if (!original) return;
    const halves = splitPaper(original, gap);
    if (!halves) return;
    const colorSource = original.colorSource ?? (isOnPage(original) ? "page" : "tray");
    const replacements = halves.map((note) => ({ ...note, colorSource, id: `note-${nextId.current++}`, z: ++topLayer.current }));
    setNotes((current) => current.flatMap((note) => note.id === id ? replacements : [note]));
  };

  const addCuts = async (pieces) => {
    if (notes.length + pieces.length > 80) return "A little room to play: keep the desk to 80 pieces. Focus a strip and press Delete to remove it.";
    if (pieces.some((piece) => piece.length > 60)) return "Keep each piece under 60 characters, or try cutting into words.";
    await document.fonts.load('18px "Special Elite"');
    const sizes = pieces.map((text) => {
      measureRef.current.textContent = text;
      return measureRef.current.offsetWidth;
    });
    const cuts = placeCuts(pieces, sizes, notes.filter((note) => note.x < ARTBOARD.x).length).map((note) => ({
      ...note, id: `note-${nextId.current++}`, z: ++topLayer.current,
    }));
    setNotes((current) => [...current, ...cuts]);
    announce(`${cuts.length} new ${cuts.length === 1 ? "piece" : "pieces"}. Drag a little poetry onto the page.`);
    return null;
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
      <div className="workspace" ref={sceneRef} style={{ transform: `translate(-50%, -50%) scale(${scale})`, "--page-color": theme.page, "--back-color": theme.back, "--cut-hit-padding": `${CUT_HIT.padding / scale}px` }}>
        <div className="word-tray" title="Double-click empty space to add text" onDoubleClick={() => {
          if (!cutting) { setStyleOpen(false); setTextOpen(true); }
        }} />
        <div className="back-sheet" aria-hidden="true" />
        <section className="poem-sheet" aria-label="Poem page" />
        {notes.map((note) => <PaperStrip key={note.id} note={note} theme={theme} sceneRef={sceneRef}
          cutting={cutting} onCut={cutNote} onMove={moveNote} onRaise={raiseNote} onRemove={(id) => {
            setNotes((current) => current.filter((item) => item.id !== id));
            scissorsRef.current?.focus();
            announce("Piece removed.");
          }} />)}
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
        : "Drag to arrange. Use arrow keys to move, Shift for bigger steps, and Delete to remove a piece. Click the scissors to cut existing paper. Double-click empty space in the left tray to add words."}</p>
      <div className={`toast${toast ? " is-visible" : ""}`} role="status">{toast}</div>
      {textOpen && <TextDialog onCut={addCuts} onClose={() => { setTextOpen(false); scissorsRef.current?.focus(); }} />}
    </main>
  );
}
