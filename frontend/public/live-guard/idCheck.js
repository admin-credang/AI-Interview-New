// v47: AUTOMATIC IDENTITY CHECK (before the first question).
//   1. The moment Start is pressed the page takes a snapshot of the candidate (see app.js, startSnap).
//   2. The page then SPEAKS an instruction ("hold your Aadhaar / Voter ID / any government ID in front of the camera") and watches the video.
//   3. When something is held in front of the camera and kept STEADY for ~1.2 s, the SHARPEST frame of that moment is kept as the ID snapshot.
//   4. Nobody presses anything. The report shows: candidate photo at start + ID snapshot + what the candidate said (name / ID type).
// HONEST LIMIT: this does NOT read or verify the ID and does NOT match the face on the ID with the face on the camera. It only captures the picture
// so the interviewer can compare them. "Something held steady" is detected from pixels, so the interviewer must look at the picture in the report.
(function (root) {
  "use strict";
  const CFG = {
    w: 128, h: 72,                 // gray analysis size (the app scales the candidate crop down to this)
    region: { x0: 0.15, x1: 0.85, y0: 0.38, y1: 1.0 }, // where a held ID appears in the candidate crop: chest / lower middle
    baselineFrames: 5,             // frames used to learn "candidate without ID"
    changeLevel: 28,               // gray-level difference that counts as "changed"
    presentFrac: 0.10,             // share of the region that must differ from the baseline
    steadyDiff: 4.5,               // frame-to-frame mean difference (gray levels) below which the picture is "steady"
    steadyMs: 1200,                // how long it must stay steady
    maxMs: 60000,                  // give up after this (ID not shown)
    afterMs: 1000                  // keep looking for a sharper frame this long after the steady time is reached
  };

  // ---- the spoken instruction (must not look like an interview question: it is also heard by the microphone)
  const PROMPT_START = "Welcome. Before we begin the interview, please look straight at the camera and hold your Aadhaar card, voter ID, driving licence, PAN card or any government photo ID right beside your face, flat and facing the camera. Keep your fingers off the photo and the text, keep all four corners visible, and keep it steady for three seconds. Also say your full name and which ID you are showing.";
  const PROMPT_AGAIN = "Please hold your photo ID beside your face, flat to the camera, fingers away from the photo, and keep it steady. Say your name and the type of ID.";
  const PROMPT_DONE = "Thank you, your ID has been captured. We can start the interview now.";
  const PROMPT_FAIL = "We could not capture your ID. We will continue with the interview.";

  const ID_TYPES = [
    ["Aadhaar", /\b(aa?dha?a?r|adhar|adhaar|uidai|aadhar)\b/i],
    ["Voter ID", /\b(voter|election commission|epic)\b/i],
    ["Driving licence", /\b(driving|driver'?s?|licen[cs]e|dl)\b/i],
    ["PAN card", /\b(pan|permanent account)\b/i],
    ["Passport", /\bpassport\b/i],
    ["College / company ID", /\b(college|company|office|employee|student|university)\b.{0,12}\b(id|card)\b/i]
  ];
  function idTypeFromSpeech(text) { const t = String(text || ""); for (const [name, re] of ID_TYPES) if (re.test(t)) return name; return ""; }

  const IDWORDS = /\b(id|i\.d\.?|aadhaar|aadhar|adhar|voter|licen[cs]e|passport|pan card|identity|proof|camera|hold|steady|photo)\b/i;
  const wordSet = (s) => new Set(String(s || "").toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((x) => x.length > 2));
  const PROMPT_WORDS = () => new Set([PROMPT_START, PROMPT_AGAIN, PROMPT_DONE, PROMPT_FAIL].flatMap((p) => [...wordSet(p)]));
  /** share of the line's content words that are words of the page's own spoken instruction */
  function promptShare(text) { const A = wordSet(text), P = PROMPT_WORDS(); if (!A.size) return { n: 0, share: 0 }; let i = 0; A.forEach((v) => { if (P.has(v)) i++; }); return { n: A.size, share: i / A.size }; }
  /**
   * While the ID check runs, the microphone hears the page's own spoken instruction and the candidate saying "my name is Janani, Aadhaar card".
   * None of that is an interview question or answer. Returns "drop" (the page's own voice, ignore), "idspeech" (candidate told name / ID type: keep for the report)
   * or "keep" (a real interview question: the interviewer started early).
   */
  function classifyDuringPhase(text, isQuestionShaped) {
    const t = String(text || "").trim(); if (!t) return "drop";
    const { n, share } = promptShare(t);
    if (isQuestionShaped && share < 0.6) return "keep";
    if (n >= 5 && share >= 0.75) return "drop";   // a long line made (almost) only of words of our own instruction = echo of the speaker
    return "idspeech";
  }

  // v48: the page's own voice (the instruction and "Thank you, your ID has been captured") is heard by the microphones - often LATE (speech engines need a few seconds)
  // and glued to the first real question ("... we can start the interview. What is variable?"). Sentences made of the instruction's words are removed ANYWHERE in the
  // first minutes; what is left (the real question / answer) is kept, so Q1 is no longer lost and no instruction text lands in an answer.
  const GENERIC = new Set("the and your you please this that with for are can will now also here then from have has been".split(" "));
  const distinct = (s) => [...wordSet(s)].filter((w) => !GENERIC.has(w));
  function stripOwnPrompt(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim(); if (!t) return t;
    const P = PROMPT_WORDS(), sents = t.match(/[^.?!]+(?:[.?!]+|$)/g) || [t];
    const keep = sents.filter((sn) => {
      const w = distinct(sn); if (w.length < 2) return true;
      let i = 0; w.forEach((x) => { if (P.has(x)) i++; }); const share = i / w.length;
      return !((w.length >= 3 && share >= 0.5) || (w.length >= 2 && share >= 0.99));
    });
    return keep.length === sents.length ? t : keep.join(" ").trim();
  }

  // ---- pixel helpers (gray = Uint8Array w*h)
  function toGray(rgba, w, h) { const g = new Uint8Array(w * h); for (let i = 0, n = w * h; i < n; i++) g[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0; return g; }
  const box = (w, h, r) => ({ x0: Math.floor(r.x0 * w), x1: Math.ceil(r.x1 * w), y0: Math.floor(r.y0 * h), y1: Math.ceil(r.y1 * h) });
  /** variance of the Laplacian inside the region: higher = sharper (motion blur / out of focus lowers it) */
  function sharpness(g, w, h, r) {
    const b = box(w, h, r || CFG.region); let n = 0, s = 0, s2 = 0;
    for (let y = Math.max(1, b.y0); y < Math.min(h - 1, b.y1); y++) for (let x = Math.max(1, b.x0); x < Math.min(w - 1, b.x1); x++) {
      const i = y * w + x, v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]; n++; s += v; s2 += v * v;
    }
    if (!n) return 0; const m = s / n; return s2 / n - m * m;
  }
  /** how much of the region differs from `base` (Float32Array/Uint8Array) + the bounding box of the difference */
  function changed(g, base, w, h, r, level) {
    const b = box(w, h, r || CFG.region), L = level == null ? CFG.changeLevel : level; let n = 0, c = 0; const xs = [], ys = [];
    for (let y = b.y0; y < Math.min(h, b.y1); y++) for (let x = b.x0; x < Math.min(w, b.x1); x++) { n++; if (Math.abs(g[y * w + x] - base[y * w + x]) > L) { c++; xs.push(x); ys.push(y); } }
    if (!n) return { frac: 0, bbox: null, fill: 0, aspect: 0, cardLike: false };
    let bbox = null, fill = 0, aspect = 0, cardLike = false;
    if (c >= 12) {
      xs.sort((p, q) => p - q); ys.sort((p, q) => p - q);
      const lo = (a) => a[Math.floor(a.length * 0.03)], hi = (a) => a[Math.min(a.length - 1, Math.floor(a.length * 0.97))];
      bbox = { x0: lo(xs), x1: hi(xs), y0: lo(ys), y1: hi(ys) };
      const bw = bbox.x1 - bbox.x0 + 1, bh = bbox.y1 - bbox.y0 + 1; fill = c / (bw * bh); aspect = bw / bh;
      cardLike = fill >= 0.6 && ((aspect >= 1.2 && aspect <= 2.1) || (aspect >= 0.48 && aspect <= 0.85)) && bw >= 0.12 * w;
    }
    return { frac: c / n, bbox, fill, aspect, cardLike };
  }
  function meanDiff(a, b, w, h, r) { const bx = box(w, h, r || CFG.region); let n = 0, s = 0; for (let y = bx.y0; y < Math.min(h, bx.y1); y++) for (let x = bx.x0; x < Math.min(w, bx.x1); x++) { n++; s += Math.abs(a[y * w + x] - b[y * w + x]); } return n ? s / n : 0; }

  /**
   * The capture state machine. Call feed(t, gray) for every analysed video frame (t in ms, any clock).
   * feed() returns { state, newBest, ... }:
   *   state "learning" | "watching" | "holding" | "captured" | "not_shown"
   *   newBest true  -> this frame is the sharpest steady frame so far: the app should store a HIGH-RESOLUTION picture of it now and call setImage().
   */
  function createCapture(opts) {
    const C = { ...CFG, ...(opts || {}) };
    const st = { state: "idle", t0: 0, baseN: 0, base: null, prev: null, steadyFrom: 0, best: null, doneAt: 0, presentSeen: false, everSteady: false, reason: "", frames: 0 };
    function begin(t) { Object.assign(st, { state: "learning", t0: t, baseN: 0, base: null, prev: null, steadyFrom: 0, best: null, doneAt: 0, presentSeen: false, everSteady: false, reason: "", frames: 0 }); }
    function feed(t, g) {
      const out = { state: st.state, newBest: false };
      if (st.state === "idle" || st.state === "captured" || st.state === "not_shown") return out;
      st.frames++;
      const w = C.w, h = C.h;
      if (st.state === "learning") {
        if (!st.base) st.base = new Float32Array(w * h);
        for (let i = 0; i < g.length; i++) st.base[i] += g[i] / C.baselineFrames;
        if (++st.baseN >= C.baselineFrames) { st.state = "watching"; st.prev = g; }
        out.state = st.state; return out;
      }
      const ch = changed(g, st.base, w, h, C.region, C.changeLevel), present = ch.frac >= C.presentFrac;
      const d = st.prev ? meanDiff(g, st.prev, w, h, C.region) : 99; st.prev = g;
      if (present) st.presentSeen = true;
      const steady = present && d <= C.steadyDiff;
      if (steady) { if (!st.steadyFrom) st.steadyFrom = t; st.everSteady = true; } else if (!present || d > C.steadyDiff * 1.8) st.steadyFrom = 0;
      const held = st.steadyFrom ? t - st.steadyFrom : 0;
      if (held > 0) st.state = "holding"; else if (st.state === "holding") st.state = "watching";
      if (steady && held >= 300) { // from 0.3 s of steadiness on, remember the sharpest frame
        const sp = sharpness(g, w, h, C.region);
        if (!st.best || sp > st.best.sharp * 1.04) { st.best = { t, sharp: sp, frac: ch.frac, cardLike: ch.cardLike, fill: ch.fill, aspect: ch.aspect, bbox: ch.bbox, img: null }; out.newBest = true; }
        else if (ch.cardLike && !st.best.cardLike && sp > st.best.sharp * 0.8) { st.best = { t, sharp: sp, frac: ch.frac, cardLike: true, fill: ch.fill, aspect: ch.aspect, bbox: ch.bbox, img: null }; out.newBest = true; }
      }
      if (st.best && held >= C.steadyMs && !st.doneAt) st.doneAt = t;
      if (st.doneAt && (t - st.doneAt >= C.afterMs || !steady)) st.state = "captured";
      else if (!st.best && t - st.t0 >= C.maxMs) { st.state = "not_shown"; st.reason = st.presentSeen ? "Something appeared in front of the camera but it was never held steady long enough." : "Nothing was held in front of the camera."; }
      else if (st.best && !st.doneAt && !steady && !present && t - st.t0 >= C.maxMs) { st.state = "not_shown"; st.reason = "The ID was only shown for a moment."; }
      out.state = st.state; out.best = st.best; out.held = held; out.cardLike = ch.cardLike;
      return out;
    }
    /** end of the time window: returns the final decision */
    function finish(t) {
      if (st.state === "captured") return { ok: true, best: st.best };
      if (st.best && st.best.img) { st.state = "captured"; return { ok: true, best: st.best, partial: true }; } // a steady frame was seen but the window ended first: still use it
      st.state = "not_shown"; if (!st.reason) st.reason = st.presentSeen ? "Something appeared in front of the camera but it was never held steady long enough." : "Nothing was held in front of the camera.";
      return { ok: false, reason: st.reason };
    }
    const setImage = (img) => { if (st.best) st.best.img = img; };
    return { begin, feed, finish, setImage, st, CFG: C };
  }

  const API = { CFG, PROMPT_START, PROMPT_AGAIN, PROMPT_DONE, PROMPT_FAIL, idTypeFromSpeech, classifyDuringPhase, stripOwnPrompt, toGray, sharpness, changed, meanDiff, createCapture };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.IdCheck = API;
})(typeof window !== "undefined" ? window : globalThis);
