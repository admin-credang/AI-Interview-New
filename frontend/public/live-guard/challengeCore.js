// RANDOM-NUMBER GAZE CHALLENGE - shared by the proctor page (app.html) and the candidate page (Candidate_Challenge.html).
// Both sides compute the SAME plan from a 6-digit code (4-digit seed + 2-digit UTC start minute), so nothing has to be sent
// between the two computers: the candidate page shows number k at position p(k) at T0 + lead + k*round, the proctor page knows
// where the candidate should be looking at that moment and compares it with the webcam gaze.
(function (root) {
  "use strict";
  const POS = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]; // [tx, ty] on the screen (same grid as the 1-9 calibration)
  const CSS = [[6, 9], [50, 9], [94, 9], [6, 50], [50, 50], [94, 50], [6, 91], [50, 91], [94, 91]]; // % position of the number on the candidate page
  const SCHED = { lead: 6000, round: 6000, settle: 1800, measure: 3400, rounds: 9, tail: 3000, maxShift: 3500, step: 250 };

  function rng(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function makePlan(seed) {
    const r = rng((Number(seed) * 2654435761) >>> 0), idx = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const used = new Set(), nums = [];
    while (nums.length < 9) { const n = 100 + Math.floor(r() * 900); if (!used.has(n) && !/(\d)\1\1/.test(String(n))) { used.add(n); nums.push(n); } }
    return idx.map((p, k) => ({ k, pos: p, tx: POS[p][0], ty: POS[p][1], css: CSS[p], num: String(nums[k]) }));
  }
  const makeCode = (seed, T0) => String(seed).padStart(4, "0") + String(new Date(T0).getUTCMinutes()).padStart(2, "0");
  function parseCode(code) { const c = String(code || "").replace(/\D/g, ""); if (c.length !== 6) return null; const seed = Number(c.slice(0, 4)), minute = Number(c.slice(4)); return minute > 59 ? null : { seed, minute }; }
  // the moment (UTC minute boundary) the challenge starts: the occurrence of `minute` closest to "now" (up to 20 s already running)
  function startTime(minute, now) { const d = new Date(now); let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), minute, 0, 0); if (t < now - 20000) t += 3600000; return t; }
  const endTime = (T0, S) => T0 + (S || SCHED).lead + (S || SCHED).rounds * (S || SCHED).round + (S || SCHED).tail;

  // ---- what did the candidate SAY? (speech-to-text writes "472", "four seven two" or "four hundred and seventy two") ----
  const U = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const TY = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  function spokenForms(text) {
    const toks = String(text || "").toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    const ints = new Set(), digitRuns = []; let digits = "", cur = null, hund = null;
    const flushNum = () => { if (cur !== null || hund !== null) ints.add(String((hund || 0) * 100 + (cur || 0))); cur = null; hund = null; };
    for (const w of toks) {
      if (/^\d+$/.test(w)) { flushNum(); ints.add(w); digits += w; continue; }
      if (w in U) { digits += String(U[w] % 10 === U[w] ? U[w] : ""); if (cur !== null && cur % 10 === 0 && cur >= 20 && U[w] < 10) cur += U[w]; else { if (cur !== null) flushNum(); cur = U[w]; } continue; }
      if (w in TY) { if (cur !== null && !(hund !== null && cur === null)) flushNum(); cur = TY[w]; continue; }
      if (w === "hundred") { hund = cur === null ? 1 : cur; cur = null; continue; }
      if (w === "and" && hund !== null) continue;
      flushNum(); if (digits) { digitRuns.push(digits); digits = ""; }
    }
    flushNum(); if (digits) digitRuns.push(digits);
    return { ints: [...ints], runs: digitRuns };
  }
  /** 1 = exact, 0.5 = two of three digits in the right place, 0 = not said */
  function spokenMatch(text, target) {
    const f = spokenForms(text), t = String(target); let best = 0;
    const cands = [...f.ints, ...f.runs];
    for (const c of cands) {
      if (c.includes(t)) return 1;
      for (let i = 0; i + 3 <= c.length; i++) { let m = 0; for (let j = 0; j < 3; j++) if (c[i + j] === t[j]) m++; if (m === 2) best = 0.5; }
    }
    return best;
  }
  const API = { POS, CSS, SCHED, makePlan, makeCode, parseCode, startTime, endTime, spokenForms, spokenMatch, rng };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Challenge = API;
})(typeof window !== "undefined" ? window : globalThis);
