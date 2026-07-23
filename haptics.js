// PASTE TARGET: where2hang-hero-lab/haptics.js
// Where2Hang — haptics LEAF (Spec v2 §2.2). No dependencies. British spelling, no emojis.
//
// Taps, never buzzes. 8-12ms is felt as a click; anything past ~20ms is felt as a phone
// vibrating, which reads as a notification, not as an interface. Multi-sensory is the
// cheapest premium signal available and Android gives it away.
//
// Rules enforced here so call sites cannot get them wrong:
//   · Never twice within 120ms — no machine-gun feedback on a fast swipe.
//   · Never on scroll, never on section entry. Only on a state that COMMITTED.
//   · Silent under prefers-reduced-motion and on anything without the API (all iOS browsers).
//
// API:  import { tap } from './haptics.js';
//       tap('snap') | tap('commit') | tap('lock') | tap('confirm')

const PATTERNS = {
  snap: 8,        // a rail settling on a card
  commit: 12,     // lens switch, after the change is applied
  lock: [10, 40, 10],  // locked content — a refusal should feel different from a success
  confirm: [12, 30, 18], // save-a-plan
};

const MIN_GAP = 120;
let lastAt = 0;

const OK = typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

export function tap(kind = "snap") {
  if (!OK) return false;
  const now = performance.now();
  if (now - lastAt < MIN_GAP) return false;
  lastAt = now;
  try { return navigator.vibrate(PATTERNS[kind] ?? PATTERNS.snap); }
  catch (e) { return false; }
}

export const hapticsAvailable = OK;
