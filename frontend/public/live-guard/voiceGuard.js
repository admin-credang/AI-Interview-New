// VOICE GUARD - runs in the browser on the candidate's audio (16 kHz chunks), no server, no model download.
//   1. second voice   : the voiced speech is cut into windows of about 1.5 s; every window gets a small "voice print" (average spectrum shape
//                       + pitch). The first voice heard is the candidate (in microphone-only mode the first TWO voices are interviewer + candidate).
//                       A different voice that comes back again = "another voice" (someone prompting / a recording / a second person).
//                       Windows are used (not whole sentences) so a second person who speaks INSIDE the same answer is also seen.
//   2. typing sounds  : short, sharp, broadband clicks (keyboard / mouse) while nobody is voicing.
// NOT done (cannot be done reliably from ONE mixed channel without a speaker-separation AI model): telling two people who talk at the SAME
// moment apart. A second voice is reported when it is heard on its own at other moments.
// These are INDICATORS: noise suppression in Zoom / Meet, a bad microphone, a cold or a very emotional answer change a voice.
// The thresholds below adapt to the candidate's own natural variation (they only learn from windows that match their own voice) and every
// window's distance is saved in the JSON report so the numbers can be tuned on real calls.
(function (root) {
  "use strict";
  const VOICE_CONFIG = {
    bands: 24, fmin: 100, fmax: 6000, fft: 512,
    windowChunks: 6,           // one window = 6 voiced chunks of 256 ms = about 1.5 s of voiced speech
    enrollWindows: 6,          // windows needed before the first voice counts as "known" (about 9 s of speech)
    sameMin: 3.0, sameMax: 6.0,// dB (RMS over bands, gain removed): learned "same voice" limit is kept between these
    diffGap: 1.5,              // "clearly different" = same limit + this many dB
    f0Close: 0.18, f0Far: 0.30,// |ln(f0 ratio)|
    confirmWindows: 3,         // a different voice must be heard in this many windows before it is reported
    typingWindowMs: 2500, typingMinClicks: 4,
  };

  // ---------------------------------------------------------------- small DSP helpers
  const FFT_N = 512, HANN = new Float32Array(FFT_N); for (let i = 0; i < FFT_N; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1));
  const BITREV = new Uint16Array(FFT_N); { const b = Math.log2(FFT_N); for (let i = 0; i < FFT_N; i++) { let r = 0; for (let j = 0; j < b; j++) if (i & (1 << j)) r |= 1 << (b - 1 - j); BITREV[i] = r; } }
  const COS = new Float32Array(FFT_N / 2), SIN = new Float32Array(FFT_N / 2); for (let i = 0; i < FFT_N / 2; i++) { COS[i] = Math.cos((2 * Math.PI * i) / FFT_N); SIN[i] = -Math.sin((2 * Math.PI * i) / FFT_N); }
  const re = new Float32Array(FFT_N), im = new Float32Array(FFT_N);
  function powerSpectrum(x, off) { // returns power of bins 0..FFT_N/2 (shared buffer, use at once)
    for (let i = 0; i < FFT_N; i++) { re[BITREV[i]] = x[off + i] * HANN[i]; im[BITREV[i]] = 0; }
    for (let size = 2; size <= FFT_N; size <<= 1) {
      const half = size >> 1, step = FFT_N / size;
      for (let i = 0; i < FFT_N; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half, tr = re[b] * COS[k] - im[b] * SIN[k], ti = re[b] * SIN[k] + im[b] * COS[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
    const p = POW; for (let i = 0; i <= FFT_N / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i]; return p;
  }
  const POW = new Float32Array(FFT_N / 2 + 1);
  const mel = (f) => 2595 * Math.log10(1 + f / 700), imel = (m) => 700 * (Math.pow(10, m / 2595) - 1);
  const FB = (() => { // triangular mel filters
    const C = VOICE_CONFIG, n = C.bands, m0 = mel(C.fmin), m1 = mel(C.fmax), pts = []; for (let i = 0; i < n + 2; i++) pts.push(imel(m0 + ((m1 - m0) * i) / (n + 1)));
    const bin = (f) => (f / 8000) * (FFT_N / 2), fb = [];
    for (let i = 0; i < n; i++) { const a = bin(pts[i]), b = bin(pts[i + 1]), c = bin(pts[i + 2]), w = []; for (let k = Math.floor(a); k <= Math.ceil(c); k++) { const v = k < b ? (k - a) / (b - a) : (c - k) / (c - b); if (v > 0 && k <= FFT_N / 2) w.push([k, v]); } fb.push(w); }
    return fb;
  })();

  /** pitch of one chunk + a second, unrelated pitch when two voices are mixed.  returns { f0, r1, dbl } */
  function pitchInfo(x) {
    const n = Math.min(2048, x.length - 240); if (n < 512) return { f0: 0, r1: 0, dbl: false };
    let mean = 0; for (let i = 0; i < n + 240; i++) mean += x[i]; mean /= n + 240;
    let e0 = 0; for (let i = 0; i < n; i++) { const v = x[i] - mean; e0 += v * v; }
    if (e0 < 1e-6) return { f0: 0, r1: 0, dbl: false };
    const r = new Float32Array(232); let best = 0;
    for (let lag = 40; lag <= 230; lag++) { let s = 0, e1 = 0; for (let i = 0; i < n; i++) { const a = x[i] - mean, b = x[i + lag] - mean; s += a * b; e1 += b * b; } r[lag] = e1 > 0 ? s / Math.sqrt(e0 * e1) : 0; if (r[lag] > best) best = r[lag]; }
    if (best < 0.4) return { f0: 0, r1: best, dbl: false };
    let L1 = 0; for (let lag = 41; lag < 230; lag++) if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) { L1 = lag; break; }
    if (!L1) return { f0: 0, r1: best, dbl: false };
    // a second peak that is NOT a multiple / fraction of the first period = a second sound source with its own pitch
    const related = (lag) => { for (let k = 1; k <= 6; k++) { if (Math.abs(lag - k * L1) <= 0.07 * lag + 1) return true; if (Math.abs(lag * k - L1) <= 0.07 * L1 + 1) return true; } return false; };
    let r2 = 0; for (let lag = 42; lag < 230; lag++) if (!related(lag) && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > r2) r2 = r[lag];
    const dbl = best <= 0.88 && r2 >= 0.42 && r2 >= 0.6 * best;
    return { f0: 16000 / L1, r1: r[L1], dbl };
  }

  /** keyboard / mouse clicks in a chunk: a sudden sharp broadband burst that dies away within ~20 ms */
  function countClicks(x) {
    const SUB = 64, ns = Math.floor(x.length / SUB); if (ns < 8) return 0;
    const e = new Float32Array(ns), hf = new Float32Array(ns);
    for (let i = 0; i < ns; i++) { let s = 0, d = 0; for (let j = 0; j < SUB; j++) { const v = x[i * SUB + j]; s += v * v; if (j) { const dv = v - x[i * SUB + j - 1]; d += dv * dv; } } e[i] = s / SUB; hf[i] = s > 0 ? d / s : 0; }
    const sorted = [...e].sort((a, b) => a - b), base = Math.max(sorted[Math.floor(ns / 2)], 1e-8);
    let clicks = 0;
    for (let i = 1; i < ns - 4; i++) {
      if (e[i] < 12 * base || e[i] < 2.5e-5 || e[i] < 3 * e[i - 1]) continue;       // sudden and clearly above the background
      if (hf[i] < 0.9) continue;                                                      // broadband (voice energy sits in low frequencies)
      let pk = e[i]; for (let k = 1; k <= 2; k++) pk = Math.max(pk, e[i + k]);
      if (e[i + 4] > 0.25 * pk) continue;                                             // dies away within ~16 ms (speech does not)
      clicks++; i += 4;
    }
    return clicks;
  }

  /** everything one 16 kHz chunk (256 ms) tells us */
  function analyseChunk(chunk, isSpeech) {
    const out = { f0: 0, dbl: false, mel: null, clicks: 0 };
    const pi = pitchInfo(chunk); out.f0 = pi.f0; out.dbl = pi.dbl;
    if (!isSpeech || pi.f0 === 0) { out.clicks = countClicks(chunk); return out; }       // clicks are only searched where nobody is voicing
    const nf = Math.floor((chunk.length - FFT_N) / (FFT_N / 2)) + 1, acc = new Float32Array(VOICE_CONFIG.bands); let used = 0;
    for (let f = 0; f < nf; f++) {
      const p = powerSpectrum(chunk, f * (FFT_N / 2)); let tot = 0; for (let i = 2; i < 200; i++) tot += p[i]; if (tot < 1e-4) continue;
      for (let b = 0; b < FB.length; b++) { let s = 0; for (const [k, w] of FB[b]) s += p[k] * w; acc[b] += 10 * Math.log10(s + 1e-9); }
      used++;
    }
    if (used) { out.mel = acc.map((v) => v / used); }
    return out;
  }

  // ---------------------------------------------------------------- voiced chunks -> windows of ~1.5 s
  const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / a.length); };
  /** one per spoken segment (whisper.js): collects the voiced chunks */
  function newSegment() { return { chunks: [] }; }
  function addChunk(seg, a) { if (a.f0 > 0 && a.mel) seg.chunks.push({ mel: a.mel, f0: a.f0 }); }
  /** cuts the voiced chunks into windows; the last short piece (>= 4 chunks) is kept too */
  function summarise(seg, cfg) {
    const C = Object.assign({}, VOICE_CONFIG, cfg || {}), ch = seg && seg.chunks || [], out = [];
    for (let i = 0; i < ch.length; i += C.windowChunks) {
      const part = ch.slice(i, i + C.windowChunks); if (part.length < 4) continue;
      const m = new Array(C.bands).fill(0); part.forEach((c) => c.mel.forEach((v, k) => { m[k] += v / part.length; }));
      const avg = m.reduce((s, v) => s + v, 0) / m.length, f = part.map((c) => c.f0).sort((x, y) => x - y);
      out.push({ shape: m.map((v) => v - avg), f0: f[Math.floor(f.length / 2)], chunks: part.length });
    }
    return out.length ? { windows: out, voiced: ch.length } : null;
  }

  // ---------------------------------------------------------------- the guard: clusters voices, raises events
  function createGuard(opts) {
    const C = Object.assign({}, VOICE_CONFIG, (opts && opts.config) || {});
    const expected = (opts && opts.expected) || 1;
    let clusters = [], pending = [], log = [], events = [], within = [], nWin = 0;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const limits = () => { // learned from the candidate's own windows
      if (within.length < 8) return { same: 4.2, diff: 4.2 + C.diffGap };
      const mu = within.reduce((s, v) => s + v, 0) / within.length, sd = Math.sqrt(within.reduce((s, v) => s + (v - mu) ** 2, 0) / within.length);
      const same = clamp(mu + 3 * sd, C.sameMin, C.sameMax); return { same, diff: same + C.diffGap };
    };
    const cdist = (w, c) => ({ d: dist(w.shape, c.shape), df: Math.abs(Math.log(w.f0 / c.f0)) });
    const isSame = (x, L) => x.d <= L.same && x.df <= C.f0Close * 1.4;
    const isDiff = (x, L) => (x.d >= L.diff && x.df >= 0.08) || (x.d >= L.same && x.df >= C.f0Far) || (x.df >= 0.45 && x.d >= 0.7 * L.same);
    return {
      get clusters() { return clusters.length; }, get log() { return log; }, get events() { return events; }, get limits() { return limits(); },
      reset() { clusters = []; pending = []; log = []; events = []; within = []; nWin = 0; },
      /** sum = summarise(...), at = ms timestamp. returns an array of events { type, detail } */
      add(sum, at) {
        const out = []; if (!sum) return out;
        for (const w of sum.windows) {
          nWin++;
          const entry = { at, f0: Math.round(w.f0), cluster: -1, d: null, df: null }; log.push(entry); if (log.length > 600) log.shift();
          if (!clusters.length) { clusters.push({ shape: w.shape.slice(), f0: w.f0, n: 1 }); entry.cluster = 0; continue; }
          const L = limits();
          let bi = 0, bx = cdist(w, clusters[0]); clusters.forEach((c, i) => { const x = cdist(w, c); if (x.d + 8 * x.df < bx.d + 8 * bx.df) { bi = i; bx = x; } });
          entry.d = Math.round(bx.d * 10) / 10; entry.df = Math.round(bx.df * 100) / 100;
          const enrolled = clusters[0].n >= C.enrollWindows;
          if (isSame(bx, L)) {
            const c = clusters[bi]; c.n++; const k = Math.min(0.12, 1 / c.n);
            c.shape = c.shape.map((v, i) => v + (w.shape[i] - v) * k); c.f0 = Math.exp(Math.log(c.f0) + (Math.log(w.f0) - Math.log(c.f0)) * k); entry.cluster = bi;
            if (bi === 0) { within.push(bx.d); if (within.length > 300) within.shift(); }
          } else if (isDiff(bx, L)) {
            let pi = pending.findIndex((p) => isSame(cdist(w, p), L));
            if (pi < 0) { pending.push({ shape: w.shape.slice(), f0: w.f0, n: 0, raised: false, first: at }); pi = pending.length - 1; }
            const p = pending[pi]; p.n++; p.shape = p.shape.map((v, i) => v + (w.shape[i] - v) * 0.25); p.f0 = Math.exp(Math.log(p.f0) + (Math.log(w.f0) - Math.log(p.f0)) * 0.25);
            entry.cluster = clusters.length + pi;
            if (p.n >= C.confirmWindows && !p.raised) {
              p.raised = true;
              if (clusters.length < expected) { clusters.push({ shape: p.shape.slice(), f0: p.f0, n: p.n }); pending.splice(pi, 1); } // e.g. the interviewer in microphone-only mode
              else if (enrolled) out.push({ type: "second_voice", detail: `A different voice (pitch about ${Math.round(p.f0)} Hz, the candidate's is about ${Math.round(clusters[0].f0)} Hz; tone differs by ${entry.d} dB) was heard in ${p.n} short windows. Someone else may be speaking / prompting, or a recording is being played.` });
            }
          } else entry.cluster = bi; // in between: not sure, never a flag
        }
        events.push(...out); return out;
      }
    };
  }

  /** microphone-only mode or candidate audio: ready-made capture state used by whisper.js */
  const API = { VOICE_CONFIG, analyseChunk, newSegment, addChunk, summarise, createGuard, pitchInfo, countClicks, dist };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.VoiceGuard = API;
})(typeof window !== "undefined" ? window : globalThis);
