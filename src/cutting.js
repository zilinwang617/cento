export function wordRuns(text) {
  return [...text.matchAll(/\S+/gu)].map((match) => ({
    text: match[0], start: match.index, end: match.index + match[0].length,
  }));
}

export function paperLocalPoint(note, point) {
  const angle = -note.angle * Math.PI / 180;
  const dx = point.x - note.x - note.width / 2;
  const dy = point.y - note.y - note.height / 2;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle) + note.width / 2,
    y: dx * Math.sin(angle) + dy * Math.cos(angle) + note.height / 2,
  };
}

// Screen-pixel tolerances stay consistent at every desktop zoom level.
export const CUT_HIT = { radius: 16, releaseRadius: 22, padding: 8 };

export function nearestCut(gaps, point, height, scale = 1, previous = null) {
  const padding = CUT_HIT.padding / scale;
  if (point.y < -padding || point.y > height + padding) return null;
  const closest = gaps.reduce((best, gap) => !best || Math.abs(point.x - gap.x) < Math.abs(point.x - best.x) ? gap : best, null);
  if (!closest) return null;
  const radius = Math.max((closest.right - closest.left) / 2, CUT_HIT.radius / scale);
  if (Math.abs(point.x - closest.x) <= radius) return closest;
  // A wider release threshold prevents flicker, without delaying a switch to a nearer gap.
  const retained = previous && gaps.find((gap) => gap.leftEnd === previous.leftEnd);
  const releaseRadius = retained && Math.max((retained.right - retained.left) / 2, CUT_HIT.releaseRadius / scale);
  return retained && Math.abs(point.x - retained.x) <= releaseRadius ? retained : null;
}

export function splitPaper(note, gap, separation = 10) {
  if (!gap || gap.x <= 0 || gap.x >= note.width) return null;
  const leftText = note.text.slice(0, gap.leftEnd).trimEnd();
  const rightText = note.text.slice(gap.rightStart).trimStart();
  if (!leftText || !rightText) return null;
  const angle = note.angle * Math.PI / 180;
  const sourceTextWidth = Number.isFinite(note.textWidth) ? note.textWidth : null;
  const sourceFontSize = Math.max(1, Number(note.fontSize) || 18);
  const naturalWidth = (measured, text) => {
    if (Number.isFinite(measured) && measured > 0) return measured;
    if (sourceTextWidth) return sourceTextWidth * text.length / Math.max(1, leftText.length + rightText.length);
    return Math.max(1, text.length * sourceFontSize * 0.55);
  };
  const makeHalf = (text, width, centerOffset, textOffset, side, measuredTextWidth) => {
    // Rotate each new center about the old center; the original baseline stays intact.
    const displacement = centerOffset + side * separation / 2;
    return {
      ...note, text, width, textOffset, textWidth: naturalWidth(measuredTextWidth, text),
      x: note.x + note.width / 2 + Math.cos(angle) * displacement - width / 2,
      y: note.y + Math.sin(angle) * displacement,
      cutSide: side < 0 ? "right" : "left",
    };
  };
  return [
    makeHalf(leftText, gap.x, (gap.x - note.width) / 2, gap.textLeft, -1, gap.leftTextWidth),
    makeHalf(rightText, note.width - gap.x, gap.x / 2, gap.right - gap.x, 1, gap.rightTextWidth),
  ];
}
