// Runs INSIDE the extension's own page (iframe). Everything loads from the
// extension package (script-src 'self'), so no CDN and no CSP errors.
//
// Does the SAME analysis as the candidate-side monitor in the web app:
//   face count, eyes closed, iris gaze, looking down (blendshapes),
//   head turn, phone, and the per-question gaze numbers.
//
// v1.5.0 changes
//   - PHONE: more sensitive and more reliable (see the PHONE_* constants below).
//   - GAZE is now kept PER QUESTION: the page tells us which question the candidate is
//     answering ("q") and whether they are speaking ("answering") with every frame.
import { FilesetResolver, FaceLandmarker, ObjectDetector } from "./vendor/vision_bundle.mjs";
import { createGazeTracker, computeHeadPose, GAZE_CONFIG, fitGazeMap, fitGazeSeries, evalChallenge } from "./gazeTracker.js";
import { createPhoneVoter, createEpisodeTimer, PHONE_CONFIG } from "./phoneLogic.js";

const PARENT_ORIGIN = "*"; // Use source-window checks so local file:// pages also work.

const NO_FACE_MS = 3000;
const MULTI_FACE_MS = 2000;
const EYES_CLOSED_MS = 1800;
const LOOK_DOWN_EPISODE_MS = 1000;
const CALIBRATION_MS = 3000;
const LOOK_DOWN_SCORE = 0.5;
const LOOK_DOWN_MARGIN = 0.2;

// ---- PHONE DETECTION ------------------------------------------------------------------
// All decision numbers are in phoneLogic.js (PHONE_CONFIG). Here: WHERE the model looks.
// The model only sees 320x320 pixels, so a phone in a big picture is tiny. Every check we look at the
// whole wide area AND one zoomed tile (rotating through 6 tiles: left, right, bottom, bottom-left,
// bottom-right, centre), so every part of the picture is looked at closely a few times per second.
const PHONE_MODEL_MIN = 0.12; // the model reports anything above this, so the page can show near-misses (e.g. "Phone: no (18%)")
const PHONE_TILES = [
  { x: 0, y: 0, w: 0.55, h: 1 },
  { x: 0.45, y: 0, w: 0.55, h: 1 },
  { x: 0, y: 0.45, w: 1, h: 0.55 },
  { x: 0, y: 0.4, w: 0.55, h: 0.6 },
  { x: 0.45, y: 0.4, w: 0.55, h: 0.6 },
  { x: 0.2, y: 0.15, w: 0.6, h: 0.7 },
];
const phoneVoter = createPhoneVoter(PHONE_CONFIG);
const downTimer = createEpisodeTimer(PHONE_CONFIG.downEpisodeMs);
const useTimer = createEpisodeTimer(PHONE_CONFIG.useEpisodeMs);

const WHOLE_CALL = 1000000; // question id used when no questions are known yet

let face = null;
let phone = null;
let lastTs = 0;
const nextTs = (t) => (lastTs = Math.max(Number(t) || 0, lastTs + 1)); // VIDEO mode needs strictly increasing timestamps
let tracker = null;

const reply = (msg) => parent.postMessage({ __aiProctor: true, ...msg }, "*");
const local = (p) => new URL(p, location.href).href;

const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);
const ear = (top, bottom, left, right) => {
  const w = dist(left, right);
  return w ? dist(top, bottom) / w : 0;
};
function irisPosition(points, leftCorner, rightCorner) {
  if (!points?.length || !leftCorner || !rightCorner) return 0.5;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const width = rightCorner.x - leftCorner.x;
  return Math.abs(width) < 1e-4 ? 0.5 : (cx - leftCorner.x) / width;
}

// timers / state between frames
let noFaceSince = null, multiSince = null, closedSince = null, downSince = null;
let downCounted = false, frameNo = 0;
let phonePass = 0;
let currentQ = null, manualQ = null; // manualQ: web page (app.html) sets the question itself
const baseline = { startedAt: 0, samples: [], value: null };

async function init() {
  const vision = await FilesetResolver.forVisionTasks(local("./wasm"));

  const faceOpts = (delegate) => ({
    baseOptions: { modelAssetPath: local("./models/face_landmarker.task"), delegate },
    runningMode: "VIDEO",
    numFaces: 3,
    minFaceDetectionConfidence: 0.4,
    minFacePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
    outputFaceBlendshapes: true,
  });
  // GPU gives 2-3x more analysed frames per second (better eye-sweep detection); fall back to CPU if it is not available
  try { face = await FaceLandmarker.createFromOptions(vision, faceOpts("GPU")); } catch { face = await FaceLandmarker.createFromOptions(vision, faceOpts("CPU")); }

  try {
    // IMAGE mode: we look at several crops of the same frame, which VIDEO mode would reject
    // (it needs strictly increasing timestamps).
    phone = await ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: local("./models/efficientdet_lite0.tflite"), delegate: "CPU" },
      runningMode: "IMAGE",
      scoreThreshold: PHONE_MODEL_MIN,
      maxResults: 5,
      categoryAllowlist: ["cell phone"],
    });
  } catch (e) {
    phone = null;
    reply({ type: "warn", message: "Phone model could not start (" + (e?.message || e) + ") - phone detection is OFF." });
  }

  tracker = createGazeTracker();
  currentQ = WHOLE_CALL;
  tracker.setQuestion(WHOLE_CALL);
  reply({ type: "ready", phone: !!phone });
}

// best "cell phone" confidence in the picture (0 = none). Looks at the whole picture first
// and, only when that finds nothing, at one zoomed-in part.
async function detectPhone(bitmap) {
  let best = 0;
  // a detection only counts when it LOOKS like a phone: a plausible shape (not a square blob, not a long strip) and a plausible size
  const run = (img, penalty) => {
    const area = (img.width || 1) * (img.height || 1);
    for (const x of phone.detect(img).detections || []) {
      const bb = x.boundingBox; if (!bb || !bb.width || !bb.height) continue;
      const ratio = Math.max(bb.width, bb.height) / Math.min(bb.width, bb.height), frac = (bb.width * bb.height) / area;
      if (ratio < 1.3 || ratio > 3.6 || frac > 0.4 || frac < 0.0006) continue;
      best = Math.max(best, (x.categories?.[0]?.score ?? 0) - penalty);
    }
  };
  run(bitmap, 0); // whole wide area
  const c = PHONE_TILES[phonePass++ % PHONE_TILES.length]; // + one zoomed tile every time (zoomed crops invent phones, so they must be surer)
  const w = bitmap.width, h = bitmap.height;
  const part = await createImageBitmap(bitmap, Math.round(c.x * w), Math.round(c.y * h), Math.max(8, Math.round(c.w * w)), Math.max(8, Math.round(c.h * h)));
  try { run(part, 0.1); } finally { part.close?.(); }
  return best;
}

function analyse(result, phoneBest, answering, listening, unavail) {
  const faces = result?.faceLandmarks || [];
  const now = Date.now();
  const events = [];
  let eyeStatus = "Eyes unavailable";

  // ---- phone (an object in view) ----
  const pv = phoneVoter.push(phoneBest, now);
  if (pv.appeared) events.push({ type: "phone_detected", detail: `Phone-like object (${Math.round(pv.best * 100)}%)` });
  const phoneNow = pv.on;

  // ---- face count ----
  if (faces.length === 0) {
    noFaceSince = noFaceSince || now;
    if (now - noFaceSince >= NO_FACE_MS) {
      // v29: when the shared picture itself changed (screen-share layout, black "sharing" screen, tiny thumbnail) this is a
      // SHARE problem, not the candidate's behaviour: reported as 'tracking lost' and never scored as looking away / reading.
      if (unavail) events.push({ type: "tracking_lost", detail: "Candidate video is not visible in the shared window (screen-share layout changed). Not counted against the candidate." });
      else events.push({ type: "face_not_found", detail: "Candidate's face is not visible." });
    }
  } else noFaceSince = null;

  if (faces.length > 1) {
    multiSince = multiSince || now;
    if (now - multiSince >= MULTI_FACE_MS) events.push({ type: "multiple_faces", detail: `${faces.length} faces in the frame.` });
  } else multiSince = null;

  const frame = {
    faces: faces.length, irisX: null, away: false, down: false, closed: false,
    yaw: null, pitch: null, eyeDown: null, eyeV: null, phone: phoneNow, listening: !!listening, unavailable: !!unavail && faces.length === 0,
  };

  // ---- eyes / gaze ----
  if (faces.length === 1) {
    const lm = faces[0];
    const pose = computeHeadPose(lm);
    if (pose) { frame.yaw = pose.yaw; frame.pitch = pose.pitch; }

    const ratio = (ear(lm[159], lm[145], lm[33], lm[133]) + ear(lm[386], lm[374], lm[362], lm[263])) / 2;
    // Looking down / glasses also shrink the eye-opening ratio, so when blendshapes are
    // available the blink score must agree before we call the eyes "closed".
    const shapes0 = result?.faceBlendshapes?.[0]?.categories || [];
    const blink0 = shapes0.length
      ? ((shapes0.find((x) => x.categoryName === "eyeBlinkLeft")?.score || 0) + (shapes0.find((x) => x.categoryName === "eyeBlinkRight")?.score || 0)) / 2
      : 1;
    frame.closed = ratio < 0.16 && blink0 >= 0.5;
    if (frame.closed) {
      closedSince = closedSince || now;
      if (now - closedSince >= EYES_CLOSED_MS) events.push({ type: "eyes_closed", detail: "Eyes closed for a long time." });
    } else closedSince = null;

    const gaze = (irisPosition(lm.slice(468, 473), lm[33], lm[133]) + irisPosition(lm.slice(473, 478), lm[362], lm[263])) / 2;
    frame.irisX = gaze;
    frame.away = gaze < 0.2 || gaze > 0.8;

    const shapes = result?.faceBlendshapes?.[0]?.categories || [];
    const score = (n) => shapes.find((x) => x.categoryName === n)?.score || 0;
    const downScore = (score("eyeLookDownLeft") + score("eyeLookDownRight")) / 2;
    const blink = (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2;
    frame.eyeDown = shapes.length ? downScore : null;
    const upScore = (score("eyeLookUpLeft") + score("eyeLookUpRight")) / 2;
    frame.eyeV = shapes.length ? downScore - upScore : null; // + = eyes down, - = eyes up

    if (baseline.value === null && shapes.length && blink < 0.6) {
      baseline.startedAt = baseline.startedAt || now;
      baseline.samples.push(downScore);
      if (now - baseline.startedAt >= CALIBRATION_MS && baseline.samples.length >= 8) {
        baseline.value = baseline.samples.reduce((a, b) => a + b, 0) / baseline.samples.length;
      }
    }
    const threshold = Math.min(0.85, Math.max(LOOK_DOWN_SCORE, (baseline.value ?? 0) + LOOK_DOWN_MARGIN));
    const lookingDown = shapes.length > 0 && baseline.value !== null && downScore >= threshold && blink < 0.6;
    frame.down = lookingDown;

    eyeStatus = frame.closed ? "Eyes closed" : frame.down ? "Looking down" : frame.away ? "Looking away" : "Eyes focused";
  } else {
    downSince = null; downCounted = false; closedSince = null;
  }

  const gz = tracker.sample(performance.now(), answering, frame);
  // LOOKING DOWN = eyes pointing down OR head tilted down (a phone in the lap / on the desk is often below the camera)
  const headDown = faces.length === 1 && tracker.debug?.reason === "head down";
  const mapOn = tracker.hasMap, dirNow = tracker.debug?.dir || "";
  const downNow = faces.length === 1 && !frame.closed && (mapOn ? dirNow === "down" : (frame.down || headDown));
  if (downTimer.update(downNow, now)) events.push({ type: "looking_down", detail: mapOn ? "Looking BELOW the screen (phone / notes / lap?)." : headDown ? "Head tilted down (phone / notes?)." : "Eyes looking down (phone / notes?)." });
  // looking down or away shortly after a phone was seen (or while it is in view) = using the phone
  const awayNow = downNow || (gz && gz.off && faces.length === 1);
  if (useTimer.update(awayNow && (phoneNow || phoneVoter.recentlySeen(now)), now)) events.push({ type: "phone_use", detail: "Looking at a phone-like object (phone seen, and the candidate looked down / away)." });
  if (gz && gz.off && gz.offFor >= GAZE_CONFIG.warnAfterMs && faces.length === 1) {
    events.push({ type: "looking_away", detail: mapOn && dirNow ? `Looked ${dirNow.toUpperCase()} of the screen (${tracker.debug.gx != null ? "x " + tracker.debug.gx.toFixed(2) + ", y " + tracker.debug.gy.toFixed(2) : ""}) for ${Math.round(gz.offFor / 1000)}s.` : "Not looking at the screen." });
  }

  const jaw = faces.length === 1 ? ((result?.faceBlendshapes?.[0]?.categories || []).find((x) => x.categoryName === "jawOpen")?.score ?? null) : null;
  return {
    off: !!(gz && gz.off && faces.length === 1), downNow, sweep: tracker.liveSweep || 0, mouth: jaw, yawDev: faces.length === 1 ? (tracker.debug?.yawDev ?? null) : null, calibrated: !!tracker.debug?.calibrated,
    faces: faces.length,
    // v48: face box (0..1 of the frame that was analysed) + eyes closed, so the app can cut a sharp, centred face picture
    fbox: faces.length === 1 ? (() => { let x0 = 1, y0 = 1, x1 = 0, y1 = 0; for (const q of faces[0]) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; })() : null,
    fclosed: faces.length === 1 ? !!frame.closed : false,
    unavail: !!unavail && faces.length === 0,
    faceStatus: faces.length === 0 ? (unavail ? "Share layout: face hidden" : "No face") : faces.length > 1 ? "Multiple faces" : "Face OK",
    eyeStatus,
    phone: phoneNow,
    phoneScore: phoneBest === null ? null : Math.round(phoneBest * 100),
    calibration: Math.round((tracker.debug?.calibrationProgress || 0) * 100),
    g: faces.length === 1 && !frame.closed && typeof frame.yaw === "number" ? { yaw: frame.yaw, pitch: frame.pitch, irisX: frame.irisX, eyeV: frame.eyeV } : null,
    mapped: mapOn, gdir: dirNow, gdirS: gz && faces.length === 1 && gz.off ? (gz.dirS || 0) : 0, gx: tracker.debug?.gx ?? null, gy: tracker.debug?.gy ?? null,
    events,
  };
}

window.addEventListener("message", async (event) => {
  if (event.source !== parent || !event.data?.__aiProctor) return;
  const { type, bitmap, ts } = event.data;

  if (type === "recalibrate") {
    // new tile / candidate settled: forget timers and the old "normal"
    noFaceSince = multiSince = closedSince = downSince = null;
    downCounted = false; phoneVoter.reset(); downTimer.reset(); useTimer.reset();
    baseline.startedAt = 0; baseline.samples = []; baseline.value = null;
    tracker?.restartCalibration();
    return;
  }

  if (type === "fitGazeMap") { // 9-number calibration: learn the candidate's screen from the samples
    const fit = fitGazeMap(event.data.samples || []);
    if (fit.ok) tracker?.setGazeMap(fit.map);
    const { map, ...info } = fit;
    reply({ type: "gazeMapFit", ...info });
    return;
  }
  if (type === "fitGazeSeries") { // v29: calibration without sharing: find the numbers inside one continuous recording
    const fit = fitGazeSeries(event.data.series || [], event.data.sched);
    if (fit.ok) tracker?.setGazeMap(fit.map);
    const { map, ...info } = fit;
    reply({ type: "gazeMapFit", ...info });
    return;
  }
  if (type === "evalChallenge") { // random-number challenge: compare where the number was shown with where the candidate looked
    const r = evalChallenge(event.data.series || [], event.data.sched, event.data.plan || [], tracker?.map || null);
    if (r.calibrated && r.map) tracker?.setGazeMap(r.map);
    const { map, ...info } = r;
    reply({ type: "challengeResult", ...info });
    return;
  }
  if (type === "clearGazeMap") { tracker?.setGazeMap(null); reply({ type: "gazeMapFit", ok: false, cleared: true }); return; }

  if (type === "setQuestion") { // used by app.html ("Next question" button)
    const n = Number(event.data.n);
    if (n > 0) { manualQ = n; currentQ = n; tracker?.setQuestion(n); }
    return;
  }

  if (type === "snapshotAll") { // used by app.html
    reply({ type: "snapshotAll", gaze: tracker ? tracker.snapshotAll() : [] });
    return;
  }

  if (type === "snapshot") {
    // every question that has gaze data
    reply({ type: "snapshot", gaze: tracker ? tracker.snapshotAll() : [] });
    return;
  }

  if (type === "locate") { // find the candidate's face anywhere in the shared picture (largest face = candidate)
    // v29: the whole picture is searched first; if nothing is found, zoomed tiles are searched too
    // (a candidate shown only as a small thumbnail while somebody shares a screen is ~1/8 of the picture).
    try {
      if (!face) throw new Error("model not ready");
      const list = event.data.tiles && event.data.tiles.length ? event.data.tiles : [{ bitmap, x: 0, y: 0, w: 1, h: 1 }];
      let best = null;
      for (const tile of list) {
        const f = face.detectForVideo(tile.bitmap, nextTs(ts));
        for (const l of f?.faceLandmarks || []) {
          let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
          for (const p of l) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
          const bx = tile.x + x0 * tile.w, by = tile.y + y0 * tile.h, bw = (x1 - x0) * tile.w, bh = (y1 - y0) * tile.h;
          const a = bw * bh;
          if (!best || a > best.a) best = { x: bx, y: by, w: bw, h: bh, a };
        }
        if (best && best.w > 0.015 && tile.x === 0 && tile.w === 1) break; // found in the whole picture: no need for tiles
      }
      reply({ type: "located", box: best && best.w > 0.012 ? { x: best.x, y: best.y, w: best.w, h: best.h } : null });
    } catch (e) { reply({ type: "located", box: null }); }
    finally { bitmap?.close?.(); (event.data.tiles || []).forEach((t) => t.bitmap?.close?.()); }
    return;
  }

  if (type === "frame" && face) {
    try {
      // which question is being answered, and is the candidate speaking right now?
      const q = Number(event.data.q) > 0 ? Number(event.data.q) : (manualQ || WHOLE_CALL);
      if (q !== currentQ) { currentQ = q; tracker.setQuestion(q); }
      const answering = event.data.answering !== false;

      const f = face.detectForVideo(bitmap, nextTs(ts));
      frameNo += 1;
      const wide = event.data.pbitmap || null;
      const p = phone ? await detectPhone(wide || bitmap) : null;
      reply({ type: "result", ...analyse(f, p, answering, event.data.listening === true, event.data.unavail === true) });
    } catch (e) {
      reply({ type: "error", message: String(e?.message || e) });
    } finally {
      bitmap?.close?.(); event.data.pbitmap?.close?.();
    }
  }
});

init().catch((e) => reply({ type: "error", message: "Init failed: " + (e?.message || e) }));
