// The two papers the strips are printed on, from Figma RNdrvPrcyNqPQ32ICmm4Pa `Group 7` (55:32):
// a creased sheet and a fibrous handmade one. Figma set them with two different recipes — creased
// at normal 66% over #cecece, fibre at multiply over #eaeaea — and compensated the difference by
// changing the base colour under each. We only have one base, the palette's `strip`, so both run
// through multiply instead: multiply preserves hue, so a cobalt strip stays cobalt and picks up
// the paper's shading, while Figma's 66% normal would have washed it toward grey.
//
// That works because scripts/prepare-strip-textures.py pulls each asset's MEDIAN luminance up to
// white. Multiply by 1.0 is a no-op, so a median-white paper leaves `--strip-color` exactly where
// the palette put it and contributes only the shading below the median.
//
// `opacity` is measured, not tuned. Figma's own two rendered strips carry a tonal spread of 23 and
// 8 on #cecece; these are the strengths that put the MEDIAN strip-sized window of each asset on
// those numbers. Measured against a window, not the whole sheet — a 43px strip never sees the
// sheet's full range, and calibrating against it lands every strip a fifth too flat.
//
// The ceiling is Midnight (#e8c77e paper, #253c59 ink), the only pairing multiply makes worse:
// at 0.95 its deepest 1% of crease is 4.60:1, just over AA, while cobalt-and-white actually gains
// contrast (7.47 -> 9.55:1). Raising creased any further trades away Midnight's legibility.
// Replacing an asset means re-deriving both numbers — see the script.
export const TEXTURES = [
  { id: "creased", asset: "/assets/strip-creased.jpg", opacity: 0.95 },
  { id: "fibre", asset: "/assets/strip-fibre.jpg", opacity: 1 },
];

export const DEFAULT_TEXTURE = "creased";

// The sheet is laid at a fixed size in workspace pixels, not fitted to each strip. `cover` ties the
// grain to the strip's width: a 78px scrap would squeeze the whole 1600px sheet into 78px while a
// 382px strip shows it 4.9x larger, and the two stop reading as the same stock. A fixed size also
// restores somewhere to move — cover is width-driven here, so it leaves no horizontal slack at all
// and a narrow strip barely any vertical.
//
// The size itself is only about how far a strip can roam: crumpled paper is near enough
// scale-invariant that the tonal spread inside a strip-sized window is the same at every size
// tried (18.7 on #cecece from 382 through 560). So take the largest that stays sharp — 560 leaves
// the widest strip 178px of travel instead of 78. Both assets are 1600x897, which is what makes
// 560 x 314 the sheet; prepare-strip-textures.py is what keeps that true.
export const TEXTURE = { width: 560, height: 314 };

const byId = new Map(TEXTURES.map((paper) => [paper.id, paper]));

export function texture(id) {
  return byId.get(id) ?? byId.get(DEFAULT_TEXTURE);
}

export function isTextureId(id) {
  return byId.has(id);
}

// Dealt from a deck, the way tilt is, rather than flipped per strip. Two cards would make a
// shuffle indistinguishable from a coin toss, so the deck holds three of each: any six
// consecutive strips then use both papers exactly three times, and no run can clump.
const DECK_PER_PAPER = 3;
let deck = [];
let lastTexture = null;

function shuffled(values, random) {
  const cards = [...values];
  for (let index = cards.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

export function nextTexture(random = Math.random) {
  if (!deck.length) {
    deck = shuffled(TEXTURES.flatMap((paper) => Array(DECK_PER_PAPER).fill(paper.id)), random);
    if (deck.at(-1) === lastTexture) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
  }
  lastTexture = deck.pop();
  return lastTexture;
}

// FNV-1a over the note id, the same hash seededTypeface() uses. Demo data and documents written
// before this feature carry no paper; deriving one from the id rather than defaulting keeps the
// mix varied and keeps it identical across reloads and exports.
function hash(seed) {
  let value = 2166136261;
  for (const char of String(seed)) {
    value ^= char.codePointAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function seededTexture(seed) {
  return TEXTURES[hash(seed) % TEXTURES.length].id;
}

// Twenty strips cut from the same spot of the same sheet read as printed wallpaper, not as twenty
// scraps. Each one takes its own patch, and taking it from the note id rather than rolling it keeps
// a strip on that patch through reloads, drags and the PNG export.
//
// Salted and taken from the high bits. FNV-1a's low bit is just the parity of the last character,
// so a second value drawn as `hash(id) % n` off the same hash would track the first.
export function textureOffset(seed) {
  const value = hash(`${seed}:patch`);
  return { x: ((value >>> 8) & 0xfff) / 0xfff, y: ((value >>> 20) & 0xfff) / 0xfff };
}

// Where the sheet's top-left sits relative to the strip's: negative, and clamped so the strip is
// always fully on the paper. Nothing repeats these numbers — CSS background-position and the
// export's drawImage both read them from here, in the same workspace pixels.
export function texturePlacement(seed, width, height = 43) {
  const { x, y } = textureOffset(seed);
  return {
    x: -Math.round(x * Math.max(0, TEXTURE.width - width)),
    y: -Math.round(y * Math.max(0, TEXTURE.height - height)),
  };
}

export function texturePlacementCss(seed, width, height) {
  const { x, y } = texturePlacement(seed, width, height);
  return `${x}px ${y}px`;
}

// The one piece of `object-fit: cover` arithmetic in the project. The page texture, the strips and
// the PNG export all size their paper through this, so the canvas can never drift out of step with
// what CSS draws. `offset` is clamped because CSS clamps background-position and canvas does not:
// an offset outside 0–1 slides drawImage's source rectangle off the sheet and prints a black band.
export function coverRect(area, image, offset = { x: 0.5, y: 0.5 }) {
  const fit = Math.max(area.width / image.naturalWidth, area.height / image.naturalHeight);
  const width = image.naturalWidth * fit;
  const height = image.naturalHeight * fit;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  return {
    x: area.x - (width - area.width) * clamp(offset.x),
    y: area.y - (height - area.height) * clamp(offset.y),
    width,
    height,
  };
}

// Decoded once per export rather than per strip: a page can hold eighty of them.
export async function loadTextures(ids) {
  const wanted = [...new Set(ids)].filter(isTextureId);
  const entries = await Promise.all(wanted.map(async (id) => {
    const image = new Image();
    image.src = texture(id).asset;
    await image.decode();
    return [id, image];
  }));
  return new Map(entries);
}
