/*
 * GAZE TRACKER (runs in the candidate's browser)
 *
 * Collects per-question numbers while the candidate is ANSWERING:
 *   answer_ms, on_screen_ms, side_ms, down_ms, phone_ms, glances, sweeps
 *
 * How "off screen" is decided
 * ---------------------------
 * The first few seconds of the interview are used to learn how THIS
 * candidate looks when they read the screen (head angle + eye angle).
 * After that, a frame counts as OFF SCREEN when any of these moved
 * away from that personal normal:
 *   - head turned left / right
 *   - head tilted down (looking at a phone or notes on the desk)
 *   - eyes pointing down
 *   - eyes pointing far to one side
 *   - face not visible
 *
 * It only measures. Risk scores are calculated on the server and shown
 * to the interviewer only. These are indicators, not proof.
 *
 * ALL THE NUMBERS TO TUNE ARE IN GAZE_CONFIG BELOW.
 */

export const GAZE_CONFIG = {
  // ---- learning the candidate's normal ----
  calibrationFrames: 30, // ~3 s of looking at the screen at 10 fps

  // ---- how far from normal counts as "off screen" ----
  // (ratios from face landmarks; make the number SMALLER = more sensitive)
  yawDev: 0.08, // head turned left / right (a clear turn, not a small nod or shift)
  pitchDownDev: 0.06, // head tilted down (phone on the desk)
  pitchUpDev: 0.14, // head tilted up (thinking, so less strict)
  eyeDownDev: 0.2, // eyeballs pointing down (0..1 blendshape)
  irisDev: 0.15, // eyeballs pointing far left / right

  smooth: 0.5, // 0..1, higher = follows the face faster, more jitter

  // ---- glances and warnings ----
  glanceMinMs: 500,
  sideGlanceMinMs: 300, // v31: a look to the side (phone / notes beside the screen) is kept with its direction when it lasted this long (after offConfirmMs) // a look away this long = one glance
  listenMinFrames: 15, // frames of 'listening to the interviewer' needed to learn the real looking-at-the-screen pose
  listenMaxFrames: 150, // ... and how many recent ones are remembered
  yawAbs: 0.07, // the learned head turn can never be further than this from straight ahead (0.5)
  irisAbs: 0.1, // ... and the learned eye position never further than this from the middle (0.5)
  offConfirmMs: 450, // a look away must last this long before it counts as OFF screen (ignores quick movements / jitter)
  warnAfterMs: 2000, // candidate sees "look at the screen" after this

  // ---- reading sweep: slow drift one way, then a quick snap back ----
  downGlanceMinMs: 400, // v38: a look DOWN this long = one down-glance (a glance at a phone in the lap / below the camera)
  longOffMs: 2500, // v38: one look away / down this long while answering = a long stare (reading, or thinking; the speech decides which)
  sweepMinRise: 0.028, // iris travel of the slow part (0..1 of eye width)
  sweepZigzag: 0.018, // a turning point needs a move this big (ignores camera jitter)
  sweepSmooth: 0.6, // 0..1 smoothing of the iris signal before analysis
  sweepMinMs: 400, // slow part, at least
  sweepMaxMs: 4500, // slow part, at most
  sweepMinLinear: 0.6, // slow part must be this straight (R^2): reading is a steady drift, not wandering
  sweepMaxJump: 0.4, // no single frame-to-frame jump may be more than this share of the slow part (a step is not a ramp)
  sweepReturnMs: 500, // the snap back must be this fast (or 2.2 frames at slow frame rates)
  sweepReturnFraction: 0.6, // and come back this much of the way
  sweepRunGapMs: 9000, // teeth closer than this belong to one reading run (lines follow each other)
  sweepWindowMs: 30000, // memory of recent teeth

  // ---- 9-number gaze map (screen-edge calibration) ----
  // The screen is 0..1 in both directions (0 = left / top edge, 1 = right / bottom edge, as the candidate sees it).
  // Looking further than this OUTSIDE the screen edge counts as 'off screen' in that direction.
  mapMarginX: 0.30, // left / right: 0.30 = one third of a screen width beyond the edge
  mapMarginUp: 0.35, // above the screen
  mapMarginDown: 0.30, // below the screen (lap / desk / phone)

  // ---- v29: face-not-visible handling ----
  // A face that is missing for a SHORT time right after it was visible = head turned far away (counts as looking away).
  // A face that stays missing longer (screen-share layout, camera off, candidate left) is NOT gaze data: it is reported as
  // 'tracking lost' and is never scored as reading / off-screen.
  lostCountMs: 2500,

  maxFrameGapMs: 1500, // ignore gaps bigger than this (tab frozen etc.). Meet/Zoom tabs on CPU analyse ~2-5 fps, so 500 ms dropped most of the time
};

/*
 * Head angle from face landmarks (no extra model needed).
 *   yaw   : where the nose sits between the two cheeks (0..1)
 *   pitch : how far the nose is below the eyes compared with the chin
 *           (gets bigger when the head tilts down)
 * Only the CHANGE from the candidate's own normal is used.
 */
export function computeHeadPose(landmarks) {
  try {
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const eyeA = landmarks[33];
    const eyeB = landmarks[263];
    const chin = landmarks[152];

    if (!nose || !leftCheek || !rightCheek || !eyeA || !eyeB || !chin) {
      return null;
    }

    const width = rightCheek.x - leftCheek.x;
    const eyeY = (eyeA.y + eyeB.y) / 2;
    const height = chin.y - eyeY;

    if (Math.abs(width) < 1e-4 || Math.abs(height) < 1e-4) {
      return null;
    }

    return {
      yaw: (nose.x - leftCheek.x) / width,
      pitch: (nose.y - eyeY) / height,
    };
  } catch {
    return null;
  }
}

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/*
 * READING-PATTERN DETECTOR (v2)
 *
 * Reading a line of text makes the iris drift SLOWLY and almost linearly in one direction
 * (the eye following the words), then SNAP back to the start of the next line. Over several
 * lines that draws a "saw-tooth" in the horizontal iris position:  /|/|/|/|
 *
 * Normal looking around, talking, or glancing at the interviewer is made of jumps (steps), not
 * slow ramps, so it does not look like this.
 *
 * How it works (works at any frame rate, 2-30 fps):
 *   1. the iris signal is smoothed a little;
 *   2. it is cut into zig-zag segments (turning points need a move of sweepZigzag);
 *   3. a "tooth" = a slow, straight, long-enough ramp followed at once by a fast opposite return;
 *   4. teeth in the SAME direction that follow each other within sweepRunGapMs form a "run";
 *      only teeth that belong to a run of 2+ count as reading sweeps. A single tooth is
 *      reported separately (it is normal to see one by chance).
 * Direction is not assumed (a mirrored camera simply flips it).
 */
function createSweepDetector(opts) {
  const C = GAZE_CONFIG;
  const minRise = (opts && opts.minRise) || C.sweepMinRise, zig = (opts && opts.zigzag) || C.sweepZigzag; // v38: a phone's text lines are short, so a second, more sensitive detector watches while the eyes are off the screen
  let buf = [];            // recent smoothed samples [t, x]
  let lastExt = null, cand = null, dir = 0;
  let prevSeg = null;      // last finished segment
  let teeth = [];          // { t, dir }
  let sm = null, gaps = [], raw = [];

  const fit = (pts) => { // R^2 of x against t
    const n = pts.length; if (n < 3) return 0;
    let st = 0, sx = 0; for (const p of pts) { st += p[0]; sx += p[1]; }
    const mt = st / n, mx = sx / n; let sxx = 0, sxy = 0, syy = 0;
    for (const p of pts) { sxx += (p[0] - mt) ** 2; sxy += (p[0] - mt) * (p[1] - mx); syy += (p[1] - mx) ** 2; }
    return sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
  };
  // a reading drift covers about 1/3 of its distance in the first third of the time and 2/3 by the second third
  const steadiness = (sp, from, to) => {
    const dx = to.x - from.x, dt = to.t - from.t; if (!dx || dt <= 0 || sp.length < 4) return false;
    const at = (tt) => { let b = sp[0]; for (const p of sp) if (Math.abs(p[0] - tt) < Math.abs(b[0] - tt)) b = p; return (b[1] - from.x) / dx; };
    const f1 = at(from.t + dt / 3), f2 = at(from.t + (2 * dt) / 3);
    return f1 >= 0.12 && f1 <= 0.6 && f2 >= 0.4 && f2 <= 0.88 && f2 > f1;
  };
  const medGap = () => { if (!gaps.length) return 200; const g = [...gaps].sort((a, b) => a - b); return g[Math.floor(g.length / 2)]; };

  const finish = (from, to) => {
    const sp = buf.filter((p) => p[0] >= from.t && p[0] <= to.t);
    let jump = 0; for (let i = 1; i < sp.length; i++) jump = Math.max(jump, Math.abs(sp[i][1] - sp[i - 1][1]));
    // duration of the actual drop: last sample still near the start level -> first sample near the end level
    let core = to.t - from.t;
    if (sp.length >= 2) {
      const rise = Math.abs(to.x - from.x), tol = 0.2 * rise; let i0 = 0, j0 = sp.length - 1;
      for (let i = 0; i < sp.length; i++) if (Math.abs(sp[i][1] - from.x) <= tol) i0 = i; else break;
      for (let j = i0 + 1; j < sp.length; j++) if (Math.abs(sp[j][1] - to.x) <= tol) { j0 = j; break; }
      core = Math.max(1, sp[j0][0] - sp[i0][0]);
    }
    const seg = { core, t0: from.t, x0: from.x, t1: to.t, x1: to.x, dx: to.x - from.x, dt: to.t - from.t,
      r2: fit(sp), steady: steadiness(sp, from, to), jumpShare: jump / Math.max(Math.abs(to.x - from.x), 1e-6), n: sp.length };
    const p = prevSeg;
    if (p && Math.sign(p.dx) === -Math.sign(seg.dx) && Math.abs(p.dx) >= minRise) {
      const slowOk = p.dt >= C.sweepMinMs && p.dt <= C.sweepMaxMs && p.r2 >= C.sweepMinLinear && p.jumpShare <= C.sweepMaxJump && p.n >= 4 && p.steady;
      const retOk = seg.core <= Math.max(C.sweepReturnMs, 2.2 * medGap()) && Math.abs(seg.dx) >= C.sweepReturnFraction * Math.abs(p.dx)
        && (Math.abs(seg.dx) / Math.max(seg.core, 1)) >= 2.5 * (Math.abs(p.dx) / Math.max(p.dt, 1));
      if (slowOk && retOk) teeth.push({ t: seg.t1, dir: Math.sign(p.dx) });
    }
    prevSeg = seg;
    const cutoff = to.t - 2 * C.sweepWindowMs; buf = buf.filter((q) => q[0] >= from.t - 1); teeth = teeth.filter((q) => q.t >= cutoff);
  };

  // teeth that belong to runs of >= 2 (same direction, each within sweepRunGapMs of the previous one)
  const runs = () => {
    let best = 0, inRuns = 0;
    for (const d of [1, -1]) {
      const ts = teeth.filter((q) => q.dir === d).map((q) => q.t);
      let run = 1, total = 0, bestRun = 0;
      for (let i = 1; i <= ts.length; i++) {
        if (i < ts.length && ts[i] - ts[i - 1] <= C.sweepRunGapMs) run++;
        else { if (run >= 2) { total += run; bestRun = Math.max(bestRun, run); } run = 1; }
      }
      inRuns += total; best = Math.max(best, bestRun);
    }
    return { inRuns, best };
  };

  const detector = {
    teethTotal: 0,
    get count() { return runs().inRuns; },
    get single() { const r = runs().inRuns; return teeth.length > r ? teeth.length - r : 0; },
    get live() { return runs().best; },
    reset() { buf = []; lastExt = cand = prevSeg = null; dir = 0; sm = null; raw = []; },
    push(x, t) {
      if (typeof x !== "number" || Number.isNaN(x)) return;
      if (buf.length) { const g = t - buf[buf.length - 1][0]; if (g > 0 && g < 2000) { gaps.push(g); if (gaps.length > 30) gaps.shift(); } if (g > C.maxFrameGapMs) { this.reset(); } }
      // 3-point median: removes single-frame jitter but keeps the sharp "snap back" edge intact
      raw.push(x); if (raw.length > 3) raw.shift();
      sm = raw.length < 3 ? x : [...raw].sort((a, b) => a - b)[1];
      buf.push([t, sm]); if (buf.length > 400) buf.shift();
      const pt = { t, x: sm };
      if (!lastExt) { lastExt = cand = pt; return; }
      const th = zig;
      if (dir === 0) {
        if (Math.abs(pt.x - lastExt.x) >= th) { dir = Math.sign(pt.x - lastExt.x); cand = pt; }
        else if (t - lastExt.t > 1500) { lastExt = pt; cand = pt; } // idle: keep the anchor fresh
        return;
      }
      if (dir * (pt.x - cand.x) > 0) { cand = pt; return; }
      if (dir * (cand.x - pt.x) >= th) { // turning point confirmed
        finish(lastExt, cand); lastExt = cand; cand = pt; dir = -dir;
      }
    },
  };
  return detector;
}

function emptyQuestion(question) {
  return {
    question,
    answer_ms: 0,
    lost_ms: 0,
    tracked_ms: 0,
    on_screen_ms: 0,
    side_ms: 0,
    down_ms: 0,
    left_ms: 0,
    right_ms: 0,
    up_ms: 0,
    mapped: false,
    phone_ms: 0,
    glances: 0,
    sweep: createSweepDetector(),
    msweep: createSweepDetector({ minRise: 0.016, zigzag: 0.01 }), // v38: small (phone-size) reading sweeps, fed only while off-screen / down
    downGl: 0, dcur: null, longOff: 0, longCounted: false, maxOffMs: 0,
    offSince: null,
    glanceCounted: false,
    lastT: null,
    lostSince: null,
    gcur: null,
    sideL: 0,
    sideR: 0,
    sideDownGl: 0,
  };
}


/* ---------- 9-number gaze map ----------
 * The candidate looks at 9 numbers placed at the corners / edges / centre of THEIR screen.
 * From those 9 samples we learn how head turn + eye position translate to a position on the screen
 * (separately for left-right and up-down), i.e. the candidate's own "screen size" in gaze units.
 * Afterwards every frame gives an (x, y) screen position: x < 0 = left of the screen, x > 1 = right,
 * y < 0 = above, y > 1 = below.
 */
const H_KEYS = ["yaw", "irisX"], V_KEYS = ["pitch", "eyeV"];

function solveLinear(A, b) { // Gaussian elimination, small systems only
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k]; x[i] = s / M[i][i]; }
  return x;
}

function fitAxis(rows, keys, target, lambda = 0.3) {
  const use = keys.filter((k) => rows.every((r) => typeof r[k] === "number" && !Number.isNaN(r[k])));
  if (!use.length || rows.length < 4) return null;
  const mean = use.map((k) => rows.reduce((s, r) => s + r[k], 0) / rows.length);
  const sd = use.map((k, j) => Math.max(1e-3, Math.sqrt(rows.reduce((s, r) => s + (r[k] - mean[j]) ** 2, 0) / rows.length)));
  const tmean = target.reduce((s, v) => s + v, 0) / target.length;
  const Z = rows.map((r) => use.map((k, j) => (r[k] - mean[j]) / sd[j]));
  const n = use.length;
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Z.reduce((s, z) => s + z[i] * z[j], 0) + (i === j ? lambda : 0)));
  const b = Array.from({ length: n }, (_, i) => Z.reduce((s, z, r) => s + z[i] * (target[r] - tmean), 0));
  const w = solveLinear(A, b);
  return w ? { keys: use, mean, sd, w, tmean } : null;
}

function predictAxis(ax, f) {
  if (!ax) return null;
  let v = ax.tmean, used = 0;
  ax.keys.forEach((k, j) => { const x = f[k]; if (typeof x === "number" && !Number.isNaN(x)) { v += ax.w[j] * (x - ax.mean[j]) / ax.sd[j]; used++; } });
  return used ? v : null;
}

/** samples: [{ tx, ty, yaw, pitch, irisX, eyeV }]  (tx, ty in {0, 0.5, 1}) */
export function fitGazeMap(samples) {
  const ok = samples.filter((s) => typeof s.yaw === "number" && typeof s.pitch === "number" && typeof s.irisX === "number");
  if (ok.length < 7) return { ok: false, quality: "poor", note: "Too few numbers were captured (" + ok.length + " of 9). Face was not visible enough." };
  const hx = fitAxis(ok, H_KEYS, ok.map((s) => s.tx)), vy = fitAxis(ok, V_KEYS, ok.map((s) => s.ty));
  if (!hx || !vy) return { ok: false, quality: "poor", note: "Could not learn the screen from these samples." };
  // leave-one-out error: how well does the map predict a number it has NOT seen
  let eh = 0, ev = 0, n = 0;
  for (let i = 0; i < ok.length; i++) {
    const rest = ok.filter((_, j) => j !== i), ah = fitAxis(rest, H_KEYS, rest.map((s) => s.tx)), av = fitAxis(rest, V_KEYS, rest.map((s) => s.ty));
    const px = predictAxis(ah, ok[i]), py = predictAxis(av, ok[i]);
    if (px === null || py === null) continue;
    eh += (px - ok[i].tx) ** 2; ev += (py - ok[i].ty) ** 2; n++;
  }
  const rmseH = n ? Math.sqrt(eh / n) : 1, rmseV = n ? Math.sqrt(ev / n) : 1, rmse = Math.max(rmseH, rmseV);
  const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const sepH = avg(ok.filter((s) => s.tx === 1).map((s) => predictAxis(hx, s))) - avg(ok.filter((s) => s.tx === 0).map((s) => predictAxis(hx, s)));
  const sepV = avg(ok.filter((s) => s.ty === 1).map((s) => predictAxis(vy, s))) - avg(ok.filter((s) => s.ty === 0).map((s) => predictAxis(vy, s)));
  const range = (k) => { const v = ok.map((s) => s[k]).filter((x) => typeof x === "number"); return v.length ? Math.max(...v) - Math.min(...v) : 0; };
  const quality = rmse <= 0.18 && sepH >= 0.7 && sepV >= 0.7 ? "good" : rmse <= 0.3 && sepH >= 0.5 && sepV >= 0.5 ? "fair" : "poor";
  return {
    ok: quality !== "poor", quality, rmse: Math.round(rmse * 100) / 100, rmseH: Math.round(rmseH * 100) / 100, rmseV: Math.round(rmseV * 100) / 100,
    spanYaw: Math.round(range("yaw") * 1000) / 1000, spanIris: Math.round(range("irisX") * 1000) / 1000, spanPitch: Math.round(range("pitch") * 1000) / 1000,
    count: ok.length, map: { hx, vy },
    note: quality === "poor" ? "The numbers did not give a clear screen (candidate moved, looked at the wrong number, or sits too far from the camera)." : ""
  };
}


/**
 * v29: gaze calibration WITHOUT sharing a window.
 * The candidate opens Candidate_Calibration.html on their own screen and presses Start; the page shows the numbers 1..9 on a
 * FIXED schedule (lead-in, then `dwell` ms per number). The proctor records the face features continuously, but the two clocks are
 * not synchronised (button reaction time), so the start shift is SEARCHED: for every possible shift the 9 numbers are cut out of
 * the recording and the shift that gives the best, most consistent screen map wins. A wrong shift cannot give a good map
 * (leave-one-out error + separation checks in fitGazeMap), so a poor recording is simply rejected.
 * series: [{ t (ms since the proctor started recording), yaw, pitch, irisX, eyeV }]
 */
export function fitGazeSeries(series, sched) {
  const S = Object.assign({ lead: 3000, dwell: 4000, settle: 1400, measure: 2200, minShift: 0, maxShift: 22000, step: 250 }, sched || {});
  const POS = (sched && sched.pos) || [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];
  const good = (series || []).filter((f) => typeof f.yaw === "number" && typeof f.pitch === "number" && typeof f.irisX === "number");
  if (good.length < 40) return { ok: false, quality: "poor", note: "Too few face frames were recorded (" + good.length + "). The candidate's face must stay visible while looking at the numbers." };
  const med = (a) => { const v = a.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : null; };
  let best = null;
  for (let sh = S.minShift; sh <= S.maxShift; sh += S.step) {
    const samples = [];
    for (let k = 0; k < POS.length; k++) {
      const a = sh + S.lead + k * S.dwell + S.settle, b = a + S.measure;
      const fr = good.filter((f) => f.t >= a && f.t < b);
      if (fr.length < 4) continue;
      samples.push({ n: k + 1, tx: POS[k][0], ty: POS[k][1], yaw: med(fr.map((f) => f.yaw)), pitch: med(fr.map((f) => f.pitch)), irisX: med(fr.map((f) => f.irisX)), eyeV: med(fr.map((f) => f.eyeV)) });
    }
    if (samples.length < 7) continue;
    const fit = fitGazeMap(samples);
    if (!fit.map) continue;
    const cost = fit.rmse + 0.04 * (POS.length - samples.length) + (fit.quality === "poor" ? 1 : 0);
    if (!best || cost < best.cost) best = { cost, fit, sh };
  }
  if (!best) return { ok: false, quality: "poor", note: "The recording did not contain the 9 numbers (the candidate may not have pressed Start, or the face was lost)." };
  return { ...best.fit, offsetS: Math.round(best.sh / 100) / 10 };
}


export function applyGazeMap(map, f) {
  if (!map) return null;
  const x = predictAxis(map.hx, f), y = predictAxis(map.vy, f);
  return x === null || y === null ? null : { x, y };
}


/**
 * RANDOM-NUMBER CHALLENGE evaluation (see challengeCore.js).
 * series : [{ t (ms relative to the challenge start T0), yaw, pitch, irisX, eyeV }]   plan : [{ tx, ty }] one per round
 * map    : the candidate's 9-number gaze map, or null.
 *   map present -> VERIFY: every round the gaze is turned into a screen position and compared with where the number was shown.
 *                  Only a small clock shift (+- maxShift, two PCs never agree exactly) is searched; it is chosen by the number of hits.
 *   map absent  -> CALIBRATE: the challenge itself is used to learn the screen (fitGazeSeries) and reports how consistent it was.
 */
export function evalChallenge(series, S, plan, map) {
  const good = (series || []).filter((f) => typeof f.yaw === "number" && typeof f.pitch === "number" && typeof f.irisX === "number");
  const rounds = plan.length;
  if (good.length < 25) return { ok: false, mode: map ? "verify" : "calibrate", note: "Too few face frames (" + good.length + ") were recorded during the challenge.", tracked: 0 };
  const dur = rounds * S.round, tracked = Math.min(1, good.filter((f) => f.t >= S.lead && f.t < S.lead + dur).length / Math.max(1, (dur / 1000) * 3)); // ~3 analysed frames per second expected
  if (!map) {
    const fit = fitGazeSeries(good, { lead: S.lead, dwell: S.round, settle: S.settle, measure: S.measure, minShift: -S.maxShift, maxShift: S.maxShift, step: S.step, pos: plan.map((p) => [p.tx, p.ty]) });
    return { ...fit, mode: "calibrate", calibrated: !!fit.ok, tracked: Math.round(tracked * 100) / 100, rounds, hits: null };
  }
  const C = GAZE_CONFIG, med = (a) => { const v = a.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : null; };
  let best = null;
  for (let sh = -S.maxShift; sh <= S.maxShift; sh += S.step) {
    const per = []; let hits = 0, errSum = 0, n = 0;
    for (let k = 0; k < rounds; k++) {
      const a = sh + S.lead + k * S.round + S.settle, b = a + S.measure, fr = good.filter((f) => f.t >= a && f.t < b);
      if (fr.length < 3) { per.push({ k, frames: fr.length }); continue; }
      const g = applyGazeMap(map, { yaw: med(fr.map((f) => f.yaw)), pitch: med(fr.map((f) => f.pitch)), irisX: med(fr.map((f) => f.irisX)), eyeV: med(fr.map((f) => f.eyeV)) });
      if (!g) { per.push({ k, frames: fr.length }); continue; }
      // share of this round's frames that were clearly outside the screen (calibrated margins)
      let out = 0, below = 0;
      for (const f of fr) { const q = applyGazeMap(map, f); if (!q) continue; const o = [-q.x - C.mapMarginX, q.x - 1 - C.mapMarginX, -q.y - C.mapMarginUp, q.y - 1 - C.mapMarginDown]; if (o.some((v) => v > 0)) out++; if (o[3] > 0) below++; }
      const err = Math.hypot(g.x - plan[k].tx, g.y - plan[k].ty), hit = err <= 0.4;
      if (hit) hits++; errSum += err; n++;
      per.push({ k, frames: fr.length, gx: Math.round(g.x * 100) / 100, gy: Math.round(g.y * 100) / 100, err: Math.round(err * 100) / 100, hit, out: out / fr.length, below: below / fr.length });
    }
    const mean = n ? errSum / n : 9, cost = -hits + mean * 0.5 + (rounds - n) * 0.5;
    if (!best || cost < best.cost) best = { cost, sh, per, hits, mean, n };
  }
  const withData = best.per.filter((p) => p.frames >= 3 && p.err != null);
  const offShare = withData.length ? withData.reduce((s, p) => s + p.out, 0) / withData.length : 0, belowShare = withData.length ? withData.reduce((s, p) => s + p.below, 0) / withData.length : 0;
  return { ok: best.n >= Math.ceil(rounds * 0.6), mode: "verify", calibrated: false, rounds, hits: best.hits, answered: best.n, meanErr: Math.round(best.mean * 100) / 100, shiftS: Math.round(best.sh / 100) / 10, perRound: best.per, offShare: Math.round(offShare * 100) / 100, belowShare: Math.round(belowShare * 100) / 100, tracked: Math.round(tracked * 100) / 100, note: best.n < Math.ceil(rounds * 0.6) ? "Face was visible in too few rounds." : "" };
}

export function createGazeTracker() {
  const C = GAZE_CONFIG;

  const questions = new Map();
  let current = null;

  // ---- the candidate's own "normal" ----
  const calib = { yaw: [], pitch: [], eyeDown: [], iris: [] };
  let base = null, base0 = null;

  let rawOffSince = null;
  const listen = { yaw: [], pitch: [], eyeDown: [], iris: [] };
  let listenCount = 0, fromListening = false;
  const clampAround = (v, mid, lim) => Math.max(mid - lim, Math.min(mid + lim, v));
  // smoothed live values
  const live = { yaw: null, pitch: null, eyeDown: null, iris: null, eyeV: null };
  let gmap = null;

  // last decision, handy for the on-screen debug box
  const debug = {
    calibrated: false,
    calibrationProgress: 0,
    off: false,
    reason: "-",
    yawDev: 0,
    pitchDev: 0,
    dir: "",
    gx: null,
    gy: null,
    eyeDownDev: 0,
    irisDev: 0,
    phone: false,
    answering: false,
  };

  const get = (question) => {
    if (!questions.has(question)) {
      questions.set(question, emptyQuestion(question));
    }
    return questions.get(question);
  };

  const smooth = (key, value) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return null;
    }

    live[key] =
      live[key] === null
        ? value
        : live[key] + (value - live[key]) * C.smooth;

    return live[key];
  };

  /** learn the candidate's normal from the first frames */
  const calibrate = (frame) => {
    if (base || frame.faces !== 1 || frame.closed) {
      return;
    }

    if (
      typeof frame.yaw !== "number" ||
      typeof frame.pitch !== "number"
    ) {
      return;
    }

    calib.yaw.push(frame.yaw);
    calib.pitch.push(frame.pitch);

    if (typeof frame.eyeDown === "number") {
      calib.eyeDown.push(frame.eyeDown);
    }

    if (typeof frame.irisX === "number") {
      calib.iris.push(frame.irisX);
    }

    debug.calibrationProgress = Math.min(
      1,
      calib.yaw.length / C.calibrationFrames
    );

    if (calib.yaw.length >= C.calibrationFrames) {
      base = {
        yaw: clampAround(median(calib.yaw), 0.5, C.yawAbs),
        pitch: median(calib.pitch),
        eyeDown: calib.eyeDown.length ? median(calib.eyeDown) : null,
        iris: calib.iris.length ? clampAround(median(calib.iris), 0.5, C.irisAbs) : null,
      };

      base0 = { ...base };
      debug.calibrated = true;
    }
  };


  /**
   * The first seconds are only a PROVISIONAL normal (the candidate may already be looking at a phone / second monitor then).
   * The real normal is learned while the candidate LISTENS to the interviewer: that is when they look at the interview screen.
   * Everything is measured against that, and the learned pose is never allowed far from "facing the camera".
   */
  const learnFromListening = (frame) => {
    if (!frame.listening || frame.faces !== 1 || frame.closed || typeof frame.yaw !== "number" || typeof frame.pitch !== "number") return;
    const cap = (arr, v) => { if (typeof v === "number" && !Number.isNaN(v)) { arr.push(v); if (arr.length > C.listenMaxFrames) arr.shift(); } };
    cap(listen.yaw, frame.yaw); cap(listen.pitch, frame.pitch); cap(listen.eyeDown, frame.eyeDown); cap(listen.iris, frame.irisX);
    listenCount += 1;
    if (listen.yaw.length >= C.listenMinFrames && (!fromListening || listenCount % 15 === 0)) {
      base = {
        yaw: clampAround(median(listen.yaw), 0.5, C.yawAbs * 2.2),
        pitch: median(listen.pitch),
        eyeDown: listen.eyeDown.length ? median(listen.eyeDown) : null,
        iris: listen.iris.length ? clampAround(median(listen.iris), 0.5, C.irisAbs * 2) : null,
      };
      base0 = { ...base }; fromListening = true;
      debug.calibrated = true; debug.calibrationProgress = 1;
    }
  };

  /** posture drifts (leaning, chair): follow it slowly, but never further than half of each limit from the first calibration */
  const adapt = () => {
    if (!base || !base0) return;
    const lim = { yaw: C.yawDev, pitch: C.pitchDownDev, eyeDown: C.eyeDownDev, iris: C.irisDev };
    for (const k of Object.keys(lim)) {
      if (base[k] === null || live[k] === null || base0[k] === null) continue;
      const next = base[k] + (live[k] - base[k]) * 0.01;
      base[k] = Math.max(base0[k] - 0.5 * lim[k], Math.min(base0[k] + 0.5 * lim[k], next));
    }
  };

  /** is this frame off screen, and why */
  const classify = (frame) => {
    if (frame.faces !== 1) {
      return { off: true, side: false, down: false, reason: "face not visible" };
    }

    if (frame.closed) {
      // a blink still counts as looking at the screen
      return { off: false, side: false, down: false, reason: "eyes closed" };
    }

    // ---- with the 9-number map the position on the candidate's own screen decides ----
    if (gmap) {
      const g = applyGazeMap(gmap, { yaw: smooth("yaw", frame.yaw), pitch: smooth("pitch", frame.pitch), irisX: smooth("iris", frame.irisX), eyeV: smooth("eyeV", frame.eyeV) });
      if (g) {
        debug.gx = g.x; debug.gy = g.y;
        const over = [
          ["left", -g.x - C.mapMarginX], ["right", g.x - 1 - C.mapMarginX],
          ["up", -g.y - C.mapMarginUp], ["down", g.y - 1 - C.mapMarginDown]
        ].filter((o) => o[1] > 0).sort((p, q) => q[1] - p[1]);
        const dir = over.length ? over[0][0] : "";
        return { off: !!dir, side: !!dir && dir !== "down", down: dir === "down", dir, dirS: dir === "left" ? -1 : dir === "right" ? 1 : 0, mapped: true, reason: dir ? "looking " + dir : "on screen" };
      }
    }

    let side = Boolean(frame.away);
    let down = Boolean(frame.down);
    let reason = side ? "eyes far to the side" : down ? "eyes down" : "";

    if (base) {
      const yaw = smooth("yaw", frame.yaw);
      const pitch = smooth("pitch", frame.pitch);
      const eyeDown = smooth("eyeDown", frame.eyeDown);
      const iris = smooth("iris", frame.irisX);

      debug.yawDev = yaw === null ? 0 : yaw - base.yaw;
      debug.pitchDev = pitch === null ? 0 : pitch - base.pitch;
      debug.eyeDownDev =
        eyeDown === null || base.eyeDown === null
          ? 0
          : eyeDown - base.eyeDown;
      debug.irisDev =
        iris === null || base.iris === null ? 0 : iris - base.iris;

      if (Math.abs(debug.yawDev) > C.yawDev) {
        side = true;
        reason = "head turned";
      }

      if (debug.pitchDev > C.pitchDownDev) {
        down = true;
        reason = "head down";
      } else if (-debug.pitchDev > C.pitchUpDev) {
        side = true;
        reason = "head up";
      }

      if (debug.eyeDownDev > C.eyeDownDev) {
        down = true;
        reason = reason || "eyes down";
      }

      if (Math.abs(debug.irisDev) > C.irisDev) {
        side = true;
        reason = reason || "eyes to the side";
      }
    }

    // v31: which SIDE (same side again and again = a phone / notes lying there). Sign only; left / right depends on the camera mirror.
    let dirS = 0;
    if (side && base) {
      const a = Math.abs(debug.yawDev) / C.yawDev, b = Math.abs(debug.irisDev) / C.irisDev;
      dirS = a >= b && a > 1 ? Math.sign(debug.yawDev) : b > 1 ? Math.sign(debug.irisDev) : 0;
      if (!dirS && Math.abs(debug.yawDev) > 0) dirS = Math.sign(debug.yawDev);
    }
    return {
      off: side || down,
      side,
      down,
      dirS,
      reason: reason || "on screen",
    };
  };

  return {
    /** call when a new question is shown */
    setQuestion(question) {
      const n = Number(question);

      if (!n || n < 1) {
        return;
      }

      current = get(n);
      current.lastT = null;
      current.offSince = null;
      current.glanceCounted = false;
    },

    /**
     * call for every monitored frame
     *   answering : candidate is answering (mic on, AI not speaking)
     *   frame     : { faces, irisX, away, down, closed,
     *                 yaw, pitch, eyeDown, phone }
     * returns { off, offFor } while answering, otherwise null
     */
    sample(t, answering, frame) {
      calibrate(frame);
      learnFromListening(frame);

      debug.answering = Boolean(answering);
      debug.phone = Boolean(frame.phone);

      const rawDecision = classify(frame);
      // a look away only counts once it lasted offConfirmMs (a missing face counts at once)
      let decision = rawDecision;
      if (rawDecision.off && rawDecision.reason !== "face not visible") {
        if (rawOffSince === null) rawOffSince = t;
        if (t - rawOffSince < C.offConfirmMs) decision = { off: false, side: false, down: false, dir: "", dirS: 0, mapped: rawDecision.mapped, reason: "on screen" };
      } else rawOffSince = null;

      debug.off = decision.off;
      debug.reason = decision.reason;
      debug.dir = decision.dir || "";
      if (!decision.off && frame.faces === 1 && !frame.closed) adapt();

      if (!current) {
        return null;
      }

      const q = current;

      if (!answering) {
        q.gcur = null;
        q.lastT = null;
        q.offSince = null;
        q.glanceCounted = false;
        q.sweep.reset(); q.msweep.reset(); q.dcur = null; q.longCounted = false;
        return null;
      }

      if (q.lastT === null) {
        q.lastT = t;
        return null;
      }

      const dt = t - q.lastT;
      q.lastT = t;

      if (dt <= 0 || dt > C.maxFrameGapMs) {
        return null;
      }

      const noFace = frame.faces !== 1;

      // ---- v29: a face that is not visible is NOT gaze data when it stays missing / the share layout changed ----
      if (noFace) {
        if (q.lostSince === null) q.lostSince = t;
        const lostFor = t - q.lostSince;
        if (frame.unavailable || lostFor > C.lostCountMs) {
          q.lost_ms += dt;                 // tracking unavailable: not scored
          q.offSince = null; q.glanceCounted = false; q.sweep.reset();
          return null;
        }
      } else q.lostSince = null;

      q.answer_ms += dt;
      if (!noFace) q.tracked_ms += dt;

      if (!decision.off) {
        q.on_screen_ms += dt;
      }

      if (!noFace && decision.side) {
        q.side_ms += dt;
      }

      if (!noFace && decision.down) {
        q.down_ms += dt;
      }

      if (decision.mapped) q.mapped = true;
      if (!noFace && decision.dir === "left") q.left_ms += dt;
      if (!noFace && decision.dir === "right") q.right_ms += dt;
      if (!noFace && decision.dir === "up") q.up_ms += dt;

      if (frame.phone) {
        q.phone_ms += dt;
      }

      // ---- v31: side looks with their direction (a phone beside the screen shows as the SAME side again and again) ----
      if (!noFace && decision.off) {
        if (!q.gcur) q.gcur = { t0: t, t1: t, dir: 0, side: false, down: false };
        const gc = q.gcur; gc.t1 = t; gc.dir = gc.dir || decision.dirS || 0; gc.side = gc.side || !!decision.side; gc.down = gc.down || !!decision.down || (typeof debug.pitchDev === "number" && debug.pitchDev > 0.03);
      } else if (q.gcur) {
        const gc = q.gcur; q.gcur = null;
        if (gc.side && gc.dir !== 0 && gc.t1 - gc.t0 >= C.sideGlanceMinMs) { if (gc.dir < 0) q.sideL++; else q.sideR++; if (gc.down) q.sideDownGl++; }
      }

      // ---- glances ----
      let offFor = 0;

      if (decision.off) {
        if (q.offSince === null) {
          q.offSince = t;
          q.glanceCounted = false;
        }

        offFor = t - q.offSince;

        if (!q.glanceCounted && offFor >= C.glanceMinMs) {
          q.glances += 1;
          q.glanceCounted = true;
        }
      } else {
        q.offSince = null;
        q.glanceCounted = false;
      }

      // ---- v38: mobile-reading clues: separate look-DOWN glances, and one long look away / down while the candidate keeps talking ----
      if (!noFace && decision.down) { if (!q.dcur) q.dcur = { t0: t, t1: t }; q.dcur.t1 = t; }
      else if (q.dcur) { if (q.dcur.t1 - q.dcur.t0 >= C.downGlanceMinMs) q.downGl += 1; q.dcur = null; }
      if (decision.off && !noFace) {
        if (offFor > q.maxOffMs) q.maxOffMs = offFor;
        if (!q.longCounted && offFor >= C.longOffMs) { q.longOff += 1; q.longCounted = true; }
      } else q.longCounted = false;
      if (!noFace && !frame.closed && typeof frame.irisX === "number") { if (decision.off || decision.down) q.msweep.push(frame.irisX, t); else q.msweep.reset(); }

      // ---- reading sweeps (eye moving along a line of text) ----
      if (
        !noFace &&
        !frame.closed &&
        typeof frame.irisX === "number"
      ) {
        q.sweep.push(frame.irisX, t);
      }

      return { off: decision.off, offFor };
    },

    /** learn the candidate's normal again (wrong tile / candidate was not ready) */
    restartCalibration() {
      calib.yaw.length = 0;
      calib.pitch.length = 0;
      calib.eyeDown.length = 0;
      calib.iris.length = 0;
      base = null; base0 = null; fromListening = false; listenCount = 0;
      listen.yaw.length = listen.pitch.length = listen.eyeDown.length = listen.iris.length = 0;
      live.yaw = live.pitch = live.eyeDown = live.iris = live.eyeV = null;
      debug.calibrated = false;
      debug.calibrationProgress = 0;
    },

    /** payload for one question, or null when there is nothing yet */
    snapshot(question) {
      const q = questions.get(Number(question));

      if (!q || q.answer_ms + q.lost_ms < 1000) {
        return null;
      }

      return {
        question: q.question,
        answer_ms: Math.round(q.answer_ms),
        lost_ms: Math.round(q.lost_ms),
        tracked_ms: Math.round(q.tracked_ms),
        on_screen_ms: Math.round(q.on_screen_ms),
        side_ms: Math.round(q.side_ms),
        down_ms: Math.round(q.down_ms),
        left_ms: Math.round(q.left_ms),
        right_ms: Math.round(q.right_ms),
        up_ms: Math.round(q.up_ms),
        mapped: q.mapped,
        phone_ms: Math.round(q.phone_ms),
        glances: q.glances,
        sweeps: q.sweep.count,
        sweeps_single: q.sweep.single,
        sideL: q.sideL,
        sideR: q.sideR,
        sideDown: q.sideDownGl,
        downGl: q.downGl + (q.dcur && q.dcur.t1 - q.dcur.t0 >= C.downGlanceMinMs ? 1 : 0),
        longOff: q.longOff,
        maxOffMs: Math.round(q.maxOffMs),
        msweeps: q.msweep.count,
      };
    },

    /** every question that has data */
    snapshotAll() {
      return [...questions.keys()]
        .map((n) => this.snapshot(n))
        .filter(Boolean);
    },

    setGazeMap(m) { gmap = m || null; live.yaw = live.pitch = live.iris = live.eyeV = null; rawOffSince = null; },
    get hasMap() { return !!gmap; },
    get map() { return gmap; },

    get liveSweep() { return current ? current.sweep.live : 0; },

    get currentQuestion() {
      return current ? current.question : null;
    },

    get debug() {
      return debug;
    },
  };
}
