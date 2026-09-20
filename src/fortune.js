import { ARTBOARD } from "./workspace.js";

// Figma Desktop - 5, 53:4. Reserve 24px before the page's right edge.
export const FORTUNE = Object.freeze({
  x: 634, y: 85, height: 51, padding: 40.5, fontSize: 20,
  maxWidth: Math.floor(ARTBOARD.x + ARTBOARD.width - 24 - 634),
  typeface: "abeezee", endsAsset: "/assets/fortune-ends.svg", endWidth: 28.5,
});
export const FORTUNE_TEXT_BUDGET = FORTUNE.maxWidth - FORTUNE.padding * 2;

// Draft copy: stable IDs let the wording change without changing prompt identity.
// Keep each prompt on one line, within FORTUNE_TEXT_BUDGET measured at ABeeZee 20px.
export const FORTUNE_PROMPTS = [
  { id: "fortune-01", text: "Write a postcard to your friend" },
  { id: "fortune-02", text: "Give the rain a new name" },
  { id: "fortune-03", text: "Leave a message for the moon" },
  { id: "fortune-04", text: "Describe a place you miss" },
  { id: "fortune-05", text: "Make a small promise to yourself" },
  { id: "fortune-06", text: "Tell the sea a secret" },
  { id: "fortune-07", text: "Write from the other side of a door" },
  { id: "fortune-08", text: "Find a home for a lost word" },
  { id: "fortune-09", text: "Let an ordinary thing speak" },
  { id: "fortune-10", text: "Send a wish into the wind" },
  { id: "fortune-11", text: "Describe the color of waiting" },
  { id: "fortune-12", text: "Write a goodbye without goodbye" },
  { id: "fortune-13", text: "Build a tiny world out of memories" },
  { id: "fortune-14", text: "Tell tomorrow what you need" },
  { id: "fortune-15", text: "Make a map of a feeling" },
  { id: "fortune-16", text: "Write a love letter to a season" },
  { id: "fortune-17", text: "Turn a quiet moment into a story" },
  { id: "fortune-18", text: "Imagine what the window remembers" },
  { id: "fortune-19", text: "Collect the sounds of home" },
  { id: "fortune-20", text: "Begin with something you almost forgot" },
];

export function pickFortune(previousId, measure, random = Math.random) {
  const fitting = FORTUNE_PROMPTS.filter((prompt) => measure(prompt.text, FORTUNE.typeface) <= FORTUNE_TEXT_BUDGET);
  const fresh = fitting.filter((prompt) => prompt.id !== previousId);
  const pool = fresh.length ? fresh : fitting;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null;
}

export function createFortuneNote(prompt, id, measure, z) {
  const textWidth = measure(prompt.text, FORTUNE.typeface);
  if (!prompt.text.trim() || /[\r\n]/u.test(prompt.text) || textWidth > FORTUNE_TEXT_BUDGET) throw new Error("Fortune prompt exceeds its single-line space.");
  return {
    id, kind: "fortune", fortuneDrawId: id, promptId: prompt.id,
    text: prompt.text, typeface: FORTUNE.typeface, fontSize: FORTUNE.fontSize,
    typefaceSize: FORTUNE.fontSize, textWidth, width: textWidth + FORTUNE.padding * 2,
    height: FORTUNE.height, x: FORTUNE.x, y: FORTUNE.y, angle: 0, z, location: "desk",
    fortuneLeft: true, fortuneRight: true,
  };
}
