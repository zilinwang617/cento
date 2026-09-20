import { FORTUNE } from "./fortune.js";

export function FortuneEnds({ note }) {
  if (note.kind !== "fortune") return null;
  return <>{["Left", "Right"].map((side) => note[`fortune${side}`] &&
    <i key={side} className={`fortune-end fortune-end-${side.toLowerCase()}`} aria-hidden="true"
      style={{ backgroundImage: `url(${FORTUNE.endsAsset})` }} />)}</>;
}
