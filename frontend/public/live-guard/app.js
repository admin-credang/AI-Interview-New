const _c = {};
const $ = (id) => _c[id] || (_c[id] = document.getElementById(id));
[
  "cname", "cmail", "crole", "lang", "share", "start", "end", "status", "videoStatus",
  "tabAudioStatus", "micStatus", "modelStatus", "counts", "log", "prev", "wrap", "det", "qaLive", "transcript"
].forEach($);

const LABEL = {
  face_not_found: "No face", multiple_faces: "Multiple faces", eyes_closed: "Eyes closed",
  looking_down: "Looking down", looking_away: "Looking away", phone_detected: "Phone", phone_use: "Using phone?",
  voice_mismatch: "Voice but lips still", screen_change: "Shared-screen region changed", tracking_lost: "Video hidden by share", challenge_fail: "Number challenge FAILED", challenge_review: "Number challenge: review", second_voice: "Another voice heard", typing_sound: "Typing sounds",
  phone_beside_laptop: "Phone / notes beside laptop?", second_monitor: "Second monitor?", reading_pattern: "Reading-like pattern", ai_answer_text: "ChatGPT / AI-style answer wording", ai_style_jump: "Sudden polished answer (style jump)", id_not_shown: "ID proof NOT shown", id_captured: "ID proof captured"
};
const WHOLE_CALL = 1000000;
let busy = 0, lastBest = 0, snapRes, stream, micStream, meetingAudioTrack, crop = null, drag = null;
let ready = false, running = false, t0 = 0, last = {}, counts = {}, timeline = [], analysed = 0, lastTick = 0, worker;
let micRecognition = null, tabRecognition = null, qa = [], transcriptLines = [], currentItem = null;
let autoBox = null, autoTry = 0, autoStart = 0, autoAt = 0, autoNote = false;
let shareLost = false, hasTab = false, lastDims = "", interviewerUntil = 0, lastCandActivity = 0;
let procReader = null, latestVF = null, lastFrameAt = 0, wholeOk = false, lastExport = "", staleWarnAt = 0, lastVT = -1, lastVTAt = 0;
let abortHits = 0, mixedCtx = null, heard = { Mic: 0, Tab: 0 };
let lastResultAt = 0, lvCtx = null, lvTimer = null, sequence = 0, mainQuestionNo = 0, candidateSpeakingUntil = 0, recognitionErrors = [];
const video = document.createElement("video"); video.muted = true; video.playsInline = true;
const prev = $("prev"), pc = prev.getContext("2d"), det = $("det"), work = document.createElement("canvas"), pwork = document.createElement("canvas");
const say = (t) => { $("status").textContent = t; };
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const wordCount = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;


// ================= v28: events + evidence, lip-sync voice check, screen monitor, 9-number gaze calibration =================
const evidence = []; let evAt = {};
function snap(cv) { try { if (!cv || !cv.width) return null; const w = Math.min(360, cv.width), h = Math.max(2, Math.round(cv.height * w / cv.width)); const t = document.createElement("canvas"); t.width = w; t.height = h; t.getContext("2d").drawImage(cv, 0, 0, w, h); return { img: t.toDataURL("image/jpeg", 0.6), w, h }; } catch { return null; } }
function raiseEvent(type, detail, shot, gapMs = 3000, force = false) {
  const now = Date.now(); const gap = now - (last[type] || 0); last[type] = now;
  if (gap <= gapMs) return false;
  counts[type] = (counts[type] || 0) + 1;
  const s = Math.round((now - t0) / 1000);
  timeline.push({ s, type, detail }); Fz.note(type, now);
  $("log").insertAdjacentHTML("afterbegin", `<div>[${fmt(s)}] <b>${esc(LABEL[type] || type)}</b> – ${esc(detail)}</div>`);
  $("counts").innerHTML = Object.entries(counts).map(([k, v]) => `<span class="pill">${esc(LABEL[k] || k)}: ${v}</span>`).join("");
  if (shot && (force || (evidence.length < 20 && now - (evAt[type] || 0) > 15000))) { evAt[type] = now; const sn = snap(shot); if (sn) evidence.push({ s, clock: fmt(s), type, label: LABEL[type] || type, detail, ...sn }); }
  return true;
}
const clampBox = (b, W, H) => { const x = Math.max(0, Math.min(b.x, W - 2)), y = Math.max(0, Math.min(b.y, H - 2)); return { x, y, w: Math.max(2, Math.min(b.w, W - x)), h: Math.max(2, Math.min(b.h, H - y)) }; };

// ---- voice check: sound on the candidate audio while the lips do not move (lip-sync)
const mouthLog = [], candChunks = [], micLoudLog = [];
let voiceTimer = null, lastMismatchAt = 0, lipChecked = 0, lipStill = 0;
function noteCandChunk(rms, f0, t) {
  candChunks.push({ t: (t || Date.now()) - 128, rms, f0 }); if (candChunks.length > 800) candChunks.shift();
}
function setPill(id, text, cls) { const el = $(id); if (el) { el.textContent = text; el.className = "pill " + (cls || ""); } }

// ================= v31: second voice + typing sounds (voiceGuard.js) =================
let vg = null; const voiceEv = [], typingBursts = [], clickLog = [];
function voiceReset() { vg = window.VoiceGuard ? VoiceGuard.createGuard({ expected: hasTab ? 1 : 2 }) : null; voiceEv.length = 0; typingBursts.length = 0; clickLog.length = 0; setPill("vgStatus", window.VoiceGuard ? "Listening" : "Not loaded", ""); }
function voiceOnSegment(sum, startAt) {
  if (!vg || !sum || !running) return;
  if (ttsNow(startAt || Date.now())) return; // v47: the page's own spoken ID instruction is not "another voice"
  try { vg.add(sum, startAt).forEach((ev) => { voiceEv.push(Date.now()); raiseEvent(ev.type, ev.detail, work, 8000, true); }); } catch (e) { console.warn(e); }
  const n = counts.second_voice || 0; setPill("vgStatus", n ? `ALERT: another voice ×${n}` : `OK · ${vg.clusters} voice(s) heard`, n ? "bad" : "good");
}
function voiceOnClicks(n, t) {
  if (!running || !hasTab || !window.VoiceGuard) return; // typing is only judged on the candidate's own audio (the mic also hears the interviewer's keyboard)
  const W = VoiceGuard.VOICE_CONFIG; clickLog.push({ t, n }); while (clickLog.length && t - clickLog[0].t > W.typingWindowMs) clickLog.shift();
  const tot = clickLog.reduce((x, c) => x + c.n, 0);
  if (tot >= W.typingMinClicks && t - (typingBursts[typingBursts.length - 1] || 0) > 4000) {
    typingBursts.push(t);
    if (currentItem && t >= interviewerUntil) raiseEvent("typing_sound", `${tot} keyboard-like clicks in about 2 s on the candidate's audio while a question / answer was running.`, work, 10000);
  }
}

function voiceTick() {
  if (!running) return;
  try { updateQWarn(); } catch {}
  try { idWatch(Date.now()); } catch {}
  try { fusionTick(Date.now()); } catch (e) { console.warn(e); }
  if (!hasTab || !window.CandidateSTT?.active) { setPill("voiceStatus", "Lip-sync needs candidate audio (button 1b)", ""); return; }
  const now = Date.now();
  let known = 0, still = 0;
  for (const c of candChunks.filter((x) => now - x.t < 6000)) {
    if (micLoudLog.some((t) => Math.abs(t - c.t) < 1500)) continue; // the interviewer was talking: could be an echo, do not judge
    const fr = mouthLog.filter((f) => Math.abs(f.t - c.t) <= 700), withFace = fr.filter((f) => f.v !== null);
    if (fr.length < 2 || withFace.length < fr.length * 0.8) continue; // no face / no data = unknown, never a flag
    known++; const vs = withFace.map((f) => f.v), mx = Math.max(...vs), mn = Math.min(...vs);
    if (!(mx - mn >= 0.05 || mx >= 0.12)) still++;
  }
  if (known) { lipChecked += known; lipStill += still; }
  if (known >= 8 && still / known >= 0.85 && now - lastMismatchAt > 20000) { lastMismatchAt = now; raiseEvent("voice_mismatch", `Sound on the candidate's audio for about ${(still * 0.256).toFixed(1)} s while the candidate's lips were not moving (another person speaking, or audio being played).`, work, 0, true); }
  const nm = counts.voice_mismatch || 0;
  setPill("voiceStatus", nm ? `ALERT: ${nm} lip-mismatch` : `OK${known ? " · lip-sync checked" : " · listening"}`, nm ? "bad" : "good");
}

// ---- candidate screen monitor: flags large visual changes inside a box on the candidate's SHARED SCREEN
let screenBox = null, pickMode = "face";
const scr = { prev: null, ref: null, refAt: 0, at: 0, armedAt: 0, changes: 0 };
const scv = document.createElement("canvas"); scv.width = 64; scv.height = 36; const sctx = scv.getContext("2d", { willReadFrequently: true });
function screenWatch() {
  if (!screenBox) return;
  const now = Date.now(); if (now - scr.at < 600) return; scr.at = now;
  const vf = latestVF, W = vf ? vf.displayWidth : video.videoWidth, H = vf ? vf.displayHeight : video.videoHeight; if (!W || !H) return;
  const r = clampBox(screenBox, W, H), src = vf || video;
  sctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, 64, 36);
  const d = sctx.getImageData(0, 0, 64, 36).data, g = new Uint8Array(2304), hist = new Float32Array(16);
  for (let i = 0; i < 2304; i++) { g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) | 0; hist[g[i] >> 4] += 1 / 2304; }
  if (!scr.prev) { scr.prev = g; scr.ref = { g, hist, }; scr.refAt = now; scr.armedAt = now; return; }
  let diff = 0; for (let i = 0; i < 2304; i++) diff += Math.abs(g[i] - scr.prev[i]); diff /= 2304;
  let hd = 0; for (let i = 0; i < 16; i++) hd += Math.abs(hist[i] - scr.ref.hist[i]); hd /= 2;
  let refDiff = 0; for (let i = 0; i < 2304; i++) refDiff += Math.abs(g[i] - scr.ref.g[i]); refDiff /= 2304;
  scr.prev = g;
  if (now - scr.refAt > 3000) { scr.ref = { g, hist }; scr.refAt = now; }
  if (now - scr.armedAt > 3000 && (diff >= 20 || (hd >= 0.3 && refDiff >= 14))) {
    if (raiseEvent("screen_change", `Large visual change detected in the selected candidate-shared screen region (possible app/window switch or normal page update).`, shotRegion(src, r), 2000, true)) { scr.changes++; scr.ref = { g, hist }; scr.refAt = now; }
  }
  setPill("screenStatus", scr.changes ? `ALERT: ${scr.changes} change(s)` : "Watching (no change)", scr.changes ? "bad" : "good");
}
function shotRegion(src, r) { const c = document.createElement("canvas"), sc = Math.min(1, 480 / r.w); c.width = Math.max(2, Math.round(r.w * sc)); c.height = Math.max(2, Math.round(r.h * sc)); try { c.getContext("2d").drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height); } catch {} return c; }
$("pickScreen")?.addEventListener("click", () => {
  if (!stream?.active) return say("First click '1. Share meeting WINDOW / TAB'.");
  if (!running) return say("Start automatic analysis first, then enable screen monitoring.");
  pickMode = "screen";
  say("SCREEN MONITOR: in the preview, drag a box around the candidate's shared desktop area. The candidate must share their ENTIRE desktop in the meeting; a meeting-tab share cannot reveal their private tabs.");
});
$("clearScreen")?.addEventListener("click", () => {
  screenBox = null; pickMode = "face"; scr.prev = null; scr.ref = null; scr.changes = 0; scr.armedAt = 0;
  if ($("clearScreen")) $("clearScreen").style.display = "none";
  setPill("screenStatus", "Off", "");
});



// ================= v29: share-layout watcher (face hidden because a screen is being shared) =================
// When somebody shares a screen in Zoom / Meet / Teams the candidate's video shrinks to a thumbnail or the whole window turns black / shows
// the shared content. The face then "disappears" although the candidate did nothing. These frames must never count as looking away / reading.
const lcv = document.createElement("canvas"); lcv.width = 64; lcv.height = 36; const lctx = lcv.getContext("2d", { willReadFrequently: true });
let layoutPrev = null, layoutRef = null, layoutRefAt = 0, layoutAt = 0, layoutShiftAt = 0, layoutDark = false, lastFaceAt = 0, lastFaces = 1;
function layoutWatch(src, W, H) {
  const now = Date.now(); if (now - layoutAt < 500) return; layoutAt = now;
  try { lctx.drawImage(src, 0, 0, W, H, 0, 0, 64, 36); } catch { return; }
  const d = lctx.getImageData(0, 0, 64, 36).data, g = new Uint8Array(2304); let sum = 0;
  for (let i = 0; i < 2304; i++) { g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) | 0; sum += g[i]; }
  layoutDark = sum / 2304 < 28;
  if (layoutPrev) {
    let df = 0, rf = 0; for (let i = 0; i < 2304; i++) { df += Math.abs(g[i] - layoutPrev[i]); if (layoutRef) rf += Math.abs(g[i] - layoutRef[i]); } df /= 2304; rf /= 2304;
    if (df >= 14 || (layoutRef && rf >= 22)) layoutShiftAt = now;
  }
  layoutPrev = g; if (!layoutRef || now - layoutRefAt > 3000) { layoutRef = g; layoutRefAt = now; }
}
// true when the face is missing AND the shared picture changed (big layout change / black screen) after the face was last seen
const layoutLost = () => lastFaces !== 1 && ((layoutShiftAt > 0 && layoutShiftAt >= lastFaceAt - 1500) || layoutDark);
function fullShot() { const v = latestVF || video, W = latestVF ? latestVF.displayWidth : video.videoWidth, H = latestVF ? latestVF.displayHeight : video.videoHeight; if (!W) return work; const c = document.createElement("canvas"), sc = Math.min(1, 640 / W); c.width = Math.round(W * sc); c.height = Math.round(H * sc); try { c.getContext("2d").drawImage(v, 0, 0, W, H, 0, 0, c.width, c.height); } catch {} return c; }
const tileCv = document.createElement("canvas");
async function locateTiles(src, W, H) { // whole picture + 5 zoomed parts (a thumbnail face is only visible when zoomed in)
  const out = [], T = [[0, 0, 1, 1], [0, 0, 0.55, 0.55], [0.45, 0, 0.55, 0.55], [0, 0.45, 0.55, 0.55], [0.45, 0.45, 0.55, 0.55], [0.25, 0.25, 0.5, 0.5]];
  for (let i = 0; i < T.length; i++) {
    if (i && W < 800) break;
    const [x, y, w, h] = T[i], sx = Math.round(x * W), sy = Math.round(y * H), sw = Math.round(w * W), sh = Math.round(h * H), sc = Math.min(1, 960 / sw);
    tileCv.width = Math.max(2, Math.round(sw * sc)); tileCv.height = Math.max(2, Math.round(sh * sc));
    tileCv.getContext("2d").drawImage(src, sx, sy, sw, sh, 0, 0, tileCv.width, tileCv.height);
    out.push({ bitmap: await createImageBitmap(tileCv), x, y, w, h });
  }
  return out;
}

// ---- v29: gaze calibration WITHOUT sharing any window (candidate opens Candidate_Calibration.html on their own screen)
const SELF_SCHED = { lead: 3000, dwell: 4000, settle: 1400, measure: 2200, maxShift: 35000, step: 250 }, SELF_REC_MS = 90000;
const selfCal = { on: false, startAt: 0, series: [], timer: null };
function selfCalBegin() {
  if (!running) return say("Press Start first, then run the gaze calibration.");
  if (cal.active) calAbort();
  try { det.contentWindow.postMessage({ __aiProctor: true, type: "clearGazeMap" }, "*"); } catch {}
  clearInterval(selfCal.timer); Object.assign(selfCal, { on: true, startAt: Date.now(), series: [] });
  try { window.AIInterviewHook?.calibrate?.(); } catch {} // AI Interview app: the candidate page starts the calibration by itself
  say("CALIBRATION WITHOUT SHARING: send the candidate the file Candidate_Calibration.html (Zoom chat / file) or the link  <your-site>/Candidate_Calibration.html . The candidate opens it on THEIR screen, presses Start and looks at each glowing number (4 s each). You keep seeing their face in the meeting. Recording for 90 s…");
  selfCal.timer = setInterval(() => { const left = Math.round((selfCal.startAt + SELF_REC_MS - Date.now()) / 1000); if (!running || left <= 0) selfCalFinish(); else setPill("gazeStatus", `Recording ${left}s (candidate: open the page, press Start)`, ""); }, 500);
}
function selfCalFeed(m) { if (selfCal.on && m.g) selfCal.series.push({ t: Date.now() - selfCal.startAt, yaw: m.g.yaw, pitch: m.g.pitch, irisX: m.g.irisX, eyeV: m.g.eyeV }); }
function selfCalFinish() {
  clearInterval(selfCal.timer); if (!selfCal.on) return; selfCal.on = false;
  setPill("gazeStatus", "Calculating…", ""); say("Finding the 9 numbers inside the recording and learning the candidate's screen…");
  det.contentWindow.postMessage({ __aiProctor: true, type: "fitGazeSeries", series: selfCal.series, sched: SELF_SCHED }, "*");
}
$("gazecal2")?.addEventListener("click", () => { if (selfCal.on) selfCalFinish(); else selfCalBegin(); });


// ================= v30: RANDOM-NUMBER GAZE CHALLENGE =================
// The candidate page (Candidate_Challenge.html) shows 9 random 3-digit numbers, one after the other, at 9 different places of THEIR screen.
// The candidate must look at each one and say it aloud. Both pages derive the same plan from a 6-digit code, so nothing is shared / sent.
// Checks: (1) gaze position vs. where the number was shown, (2) the spoken number (speech-to-text), (3) looks outside the screen (below = phone / chat).
const CH = window.Challenge, chal = { on: false, code: "", T0: 0, plan: null, series: [], heard: [], timer: null, frames: 0, faceFrames: 0, evalSent: false };
const chalRuns = [];
const chalEnd = () => CH.endTime(chal.T0);
const inChalWindow = (t) => chal.on && t >= chal.T0 - 1500 && t <= chalEnd() + 6000;
function chalBegin() {
  if (!running) return say("Press Start first, then start the number challenge.");
  if (chal.on) return say("A number challenge is already running.");
  const seed = 1000 + Math.floor(Math.random() * 9000), T0 = Math.floor((Date.now() + 150000) / 60000) * 60000; // starts at a full UTC minute, 90-150 s from now
  Object.assign(chal, { on: true, code: CH.makeCode(seed, T0), T0, plan: CH.makePlan(seed), series: [], heard: [], frames: 0, faceFrames: 0, evalSent: false });
  try { window.AIInterviewHook?.challenge?.(chal.code, T0); } catch {} // AI Interview app: the candidate page arms itself with this code
  const when = new Date(T0).toLocaleTimeString();
  $("chalInfo").style.display = "block";
  $("chalInfo").innerHTML = `Send the candidate: <b>Candidate_Challenge.html</b> (file or link) and the code <b style="font-size:20px;letter-spacing:3px">${chal.code}</b> — it starts at <b>${esc(when)}</b>.`;
  say(`NUMBER CHALLENGE armed. Tell the candidate (Zoom chat): open Candidate_Challenge.html, type the code ${chal.code}, press Arm. At ${when} they bring that window to the front, full screen, and look at each number and say it aloud (about 1 minute). Nothing is shared, so you keep seeing their face. Normal interview analysis pauses meanwhile.`);
  clearInterval(chal.timer); chal.timer = setInterval(chalTick, 500); chalTick();
}
function chalTick() {
  if (!chal.on) return; const now = Date.now();
  if (now < chal.T0) setPill("chalStatus", `Starts in ${Math.ceil((chal.T0 - now) / 1000)}s (code ${chal.code})`, "");
  else if (now <= chalEnd()) setPill("chalStatus", `Running: number ${Math.min(9, Math.floor((now - chal.T0 - CH.SCHED.lead) / CH.SCHED.round) + 1 || 1)} of 9`, "");
  else { setPill("chalStatus", "Checking…", ""); if (!chal.evalSent && now > chalEnd() + 7000 && (!(window.CandidateSTT?.pending) || now > chalEnd() + 20000)) chalSend(); }
  if (!running) chalCancel();
}
function chalCancel() { clearInterval(chal.timer); chal.on = false; setPill("chalStatus", "Not run", ""); }
function chalFeed(m, now) {
  if (!chal.on || now < chal.T0 - 4000 || now > chalEnd() + 1000) return;
  chal.frames++; if (m.faces === 1) chal.faceFrames++;
  if (m.g) chal.series.push({ t: now - chal.T0, yaw: m.g.yaw, pitch: m.g.pitch, irisX: m.g.irisX, eyeV: m.g.eyeV });
}
function chalSend() {
  chal.evalSent = true;
  det.contentWindow.postMessage({ __aiProctor: true, type: "evalChallenge", series: chal.series, sched: CH.SCHED, plan: chal.plan.map((p) => ({ tx: p.tx, ty: p.ty })) }, "*");
}
function chalResult(m) {
  if (!chal.on || !chal.evalSent) return;
  const audio = !!(window.CandidateSTT?.active && hasTab) || chal.heard.some((h) => h.src === "Mic"), S = CH.SCHED;
  const rounds = chal.plan.map((p, k) => {
    const a = chal.T0 + S.lead + k * S.round - 2500, b = chal.T0 + S.lead + (k + 1) * S.round + 3500; let best = 0;
    for (const h of chal.heard) if (h.at >= a - 2000 && h.at <= b + 2000) best = Math.max(best, CH.spokenMatch(h.text, p.num));
    const g = (m.perRound || [])[k] || {};
    return { k: k + 1, shown: p.num, tx: p.tx, ty: p.ty, said: audio ? best : null, gx: g.gx ?? null, gy: g.gy ?? null, hit: g.hit ?? null, frames: g.frames ?? 0 };
  });
  const spoken = audio ? rounds.reduce((s, r) => s + (r.said || 0), 0) : null, nR = rounds.length;
  const calib = m.mode === "calibrate", gazeBad = calib ? !m.ok : (m.hits != null && m.hits <= 3), gazeMid = !calib && m.hits != null && m.hits <= 6;
  const spkBad = audio && spoken <= 3, spkMid = audio && spoken <= 6, offFlag = (m.offShare || 0) >= 0.25, belowFlag = (m.belowShare || 0) >= 0.2;
  const trackedOk = (m.tracked ?? 0) >= 0.4 && !/too few|did not contain/i.test(m.note || "");
  const why = [];
  if (calib) why.push(m.ok ? `no earlier calibration, so the challenge was used to learn the screen (${m.quality}, error ${Math.round((m.rmse || 0) * 100)}%)` : "gaze did not follow the numbers");
  else why.push(`gaze matched the number position in ${m.hits}/${nR} rounds (average miss ${Math.round((m.meanErr || 0) * 100)}% of the screen)`);
  if (audio) why.push(`numbers said correctly: ${spoken}/${nR}`); else why.push("spoken numbers not checked (no candidate audio, button 1b)");
  if (offFlag) why.push(`${Math.round(m.offShare * 100)}% of the time the gaze was outside the screen`);
  if (belowFlag) why.push(`${Math.round(m.belowShare * 100)}% of the time the candidate looked BELOW the screen (phone / keyboard / chat)`);
  let level, text;
  if (!trackedOk) { level = "INCONCLUSIVE"; text = "Not enough face data during the challenge (face hidden / camera off). No judgement."; }
  else if (gazeBad && (spkBad || !audio)) { level = "FAIL"; text = "The candidate did not look at / read the numbers shown on their screen. Possible reasons: the page was not in front, attention on another device or chat."; }
  else if (gazeBad || spkBad || offFlag || belowFlag) { level = "REVIEW"; text = gazeBad ? "The gaze did not match the number positions, but the numbers were said correctly: the gaze map may be inaccurate, run calibration 3 again." : spkBad ? "The gaze followed the numbers but the numbers were not said / not heard: check the candidate audio." : "The candidate looked outside the screen a lot while the numbers were shown."; }
  else if (gazeMid || spkMid) { level = "MINOR"; text = "Mostly followed the numbers, some rounds missed."; }
  else { level = "PASS"; text = "The candidate looked at the numbers where they were shown and said them correctly."; }
  const run = { at: Math.round((chal.T0 - t0) / 1000), clock: fmt(Math.max(0, Math.round((chal.T0 - t0) / 1000))), code: chal.code, level, text, why, hits: m.hits ?? null, spoken, rounds, mode: m.mode, shiftS: m.shiftS ?? m.offsetS ?? null };
  chalRuns.push(run);
  if (level === "FAIL") raiseEvent("challenge_fail", text, fullShot(), 0, true);
  else if (level === "REVIEW") raiseEvent("challenge_review", text, fullShot(), 0, true);
  setPill("chalStatus", `${level}${m.hits != null ? " · gaze " + m.hits + "/" + nR : ""}${spoken != null ? " · said " + spoken + "/" + nR : ""}`, level === "PASS" ? "good" : level === "MINOR" || level === "INCONCLUSIVE" ? "" : "bad");
  $("chalInfo").style.display = "block";
  $("chalInfo").innerHTML = `<b>${esc(level)}</b>: ${esc(text)}<br><span class="muted">${esc(why.join("; "))}.</span> You can run it again (button 4).`;
  say("Number challenge finished: " + level + ". " + text);
  clearInterval(chal.timer); chal.on = false;
}
$("chalbtn")?.addEventListener("click", chalBegin);

// ---- 9-number gaze calibration: the candidate looks at numbers 1-9 shown at the corners / edges / centre of THEIR screen (calibration.html is shared in the meeting).
// From these 9 looks the detector learns the candidate's own screen "size" in gaze units; later any look LEFT / RIGHT / ABOVE / BELOW the screen is flagged with its direction.
const CAL_POS = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]; // number 1..9 -> [x, y] on the screen
const cal = { active: false, step: 0, phase: "", until: 0, buf: [], samples: [], retried: false, win: null, ch: null, fit: null };
try { cal.ch = new BroadcastChannel("proctor-gaze"); } catch {}
function calSend(m) { try { cal.ch?.postMessage(m); } catch {} }
function calAbort(why) { if (!cal.active) return; cal.active = false; calSend({ type: "idle" }); setPill("gazeStatus", "Not finished", "bad"); if (why) say(why); }
const calMedian = (arr) => { const v = arr.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : null; };
function calBegin() {
  if (!running) return say("Press Start first, then run the gaze calibration.");
  if (!cal.win || cal.win.closed) cal.win = window.open("calibration.html", "proctorCal", "width=900,height=620");
  det.contentWindow.postMessage({ __aiProctor: true, type: "clearGazeMap" }, "*");
  Object.assign(cal, { active: true, step: 0, samples: [], retried: false, fit: null });
  say("GAZE CALIBRATION: share the window \"Look at the number\" in the meeting (candidate views it FULL SCREEN). Then it runs by itself: the candidate looks at each glowing number and says it (about 3 s each, 9 numbers).");
  setPill("gazeStatus", "Running 1/9", "");
  setTimeout(() => calNext(), 2500);
}
function calNext() {
  if (!cal.active) return;
  cal.step++;
  if (cal.step > 9) return calFinish();
  cal.phase = "settle"; cal.buf = []; cal.until = Date.now() + 1300; // 1.3 s for the eyes to move, then 1.8 s of measuring
  calSend({ type: "step", n: cal.step });
  setPill("gazeStatus", `Number ${cal.step} of 9`, "");
}
function calFeed(m) {
  if (!cal.active || !cal.phase) return;
  const now = Date.now();
  if (cal.phase === "settle") { if (now >= cal.until) { cal.phase = "measure"; cal.until = now + 1800; cal.buf = []; } return; }
  if (m.g) cal.buf.push(m.g);
  if (now < cal.until) return;
  cal.phase = "";
  if (cal.buf.length < 5) { // face not seen: try this number once more, then give up
    if (!cal.retried) { cal.retried = true; cal.step--; return setTimeout(calNext, 600); }
    calSend({ type: "fail" }); cal.active = false; setPill("gazeStatus", "Failed: face not visible", "bad");
    return say("Gaze calibration stopped: the candidate's face was not visible while looking at the numbers. Ask them to sit straight and press the button again.");
  }
  cal.retried = false;
  const [tx, ty] = CAL_POS[cal.step - 1], med = (k) => calMedian(cal.buf.map((g) => g[k]));
  cal.samples.push({ n: cal.step, tx, ty, yaw: med("yaw"), pitch: med("pitch"), irisX: med("irisX"), eyeV: med("eyeV") });
  setTimeout(calNext, 250);
}
function calFinish() {
  cal.active = false; calSend({ type: "done" });
  det.contentWindow.postMessage({ __aiProctor: true, type: "fitGazeMap", samples: cal.samples }, "*");
  say("Calculating the candidate's screen from the 9 numbers…");
}
function calResult(m) {
  if (m.cleared) return;
  cal.fit = m.ok ? { self: m.offsetS != null, quality: m.quality, rmse: m.rmse, count: m.count, spanYaw: m.spanYaw, spanIris: m.spanIris, spanPitch: m.spanPitch, at: Math.round((Date.now() - t0) / 1000) } : null;
  if (m.ok) {
    setPill("gazeStatus", `Ready (${m.quality}, error ${Math.round(m.rmse * 100)}% of screen${m.offsetS != null ? ", no share" : ""})`, m.quality === "good" ? "good" : "");
    say(`Gaze calibration ${m.quality.toUpperCase()}. The candidate's screen is learned (head turn range ${m.spanYaw}, eye range ${m.spanIris}). From now on every look LEFT / RIGHT / ABOVE / BELOW the screen is flagged with its direction.` + (m.quality === "fair" ? " Accuracy is only fair: you can run it again if the candidate moved." : ""));
  } else {
    setPill("gazeStatus", "Poor: run again", "bad");
    say("Gaze calibration was not accurate enough: " + (m.note || "") + " Ask the candidate to sit straight, keep the whole face in view, look ONLY at the glowing number and press the button again. Until then the normal gaze rules are used.");
  }
}
$("gazecal")?.addEventListener("click", calBegin);
const Fz = window.Fusion.create(); let qualityN = 0, qualityBad = 0;
const sideTr = window.Insights.createSideTracker(); let lastPhoneAt = 0, sideHits = 0;
function fusionTick(now) {
  const r = Fz.tick(now), el = $("fusion"); if (!el) return;
  const col = { NORMAL: "#15965b", REVIEW: "#b7791f", PRIORITY: "#d63b53", INSUFFICIENT: "#6b6785" }[r.level];
  el.style.borderLeftColor = col;
  el.innerHTML = `<b style="color:${col}">Behaviour fusion: ${({ NORMAL: "Normal", REVIEW: "Review", PRIORITY: "Priority review", INSUFFICIENT: "Insufficient data (tracking unavailable)" })[r.level]}</b>${r.reasons.length ? " – " + esc(r.reasons.join("; ")) : ""}${r.level === "REVIEW" || r.level === "PRIORITY" ? ` <span class="muted">(heuristic signal score ${r.conf}/100, last 8 s)</span>` : ""}`;
}
function resetV27() {
  Fz.reset(Date.now()); qualityN = 0; qualityBad = 0; sideTr.reset(); lastPhoneAt = 0; sideHits = 0; if ($("insightLive")) $("insightLive").textContent = "Pattern watch (phone beside laptop): waiting…"; if ($("fusion")) { $("fusion").textContent = "Behaviour fusion: collecting data…"; $("fusion").style.borderLeftColor = ""; }
  screenBox = null; pickMode = "face"; scr.prev = null; scr.ref = null; scr.refAt = 0; scr.changes = 0; scr.armedAt = 0;
  if ($("clearScreen")) $("clearScreen").style.display = "none"; setPill("screenStatus", "Off", "");
  evidence.length = 0; evAt = {}; mouthLog.length = 0; candChunks.length = 0; micLoudLog.length = 0;;
  lastMismatchAt = lipChecked = lipStill = 0; layoutPrev = layoutRef = null; layoutShiftAt = 0; lastFaceAt = 0; lastFaces = 1; clearInterval(selfCal.timer); selfCal.on = false; clearInterval(chal.timer); chal.on = false; chalRuns.length = 0; setPill("chalStatus", "Not run", ""); scr.prev = null; scr.changes = 0; scr.armedAt = 0;
  setPill("voiceStatus", "Waiting for candidate audio", ""); voiceReset(); setPill("gazeStatus", "Not done", ""); cal.active = false; cal.fit = null; try { det.contentWindow.postMessage({ __aiProctor: true, type: "clearGazeMap" }, "*"); } catch {}
}


// ================= v47: AUTOMATIC IDENTITY CHECK (idCheck.js) =================
// Start pressed -> snapshot of the candidate at once -> the page speaks "hold your ID in front of the camera" -> when something is held steady in front of the camera
// the sharpest frame is kept as the ID snapshot -> "Thank you" -> interview starts. Nobody presses anything. The page does not read / verify the ID (see idCheck.js).
const idc = { late: false, sfFirst: 0, idClose: null, on: false, enabled: false, cap: null, t0: 0, spokeAt: 0, repeats: 0, status: "off", reason: "", idType: "", heard: [], startFull: null, startFace: null, idSnap: null, guardUntil: 0, spans: [] };
const icv = document.createElement("canvas"); icv.width = 128; icv.height = 72; const ictx = icv.getContext("2d", { willReadFrequently: true });
const idActive = () => idc.on || Date.now() < idc.guardUntil;
const ttsNow = (t) => idc.spans.some((x) => t >= x.from - 500 && t <= x.to + 1500); // the page's own voice is on the audio: never judge it as "another voice" / "lips still"
function snapHi(cv) { try { if (!cv || !cv.width) return null; const w = Math.min(960, cv.width), h = Math.max(2, Math.round(cv.height * w / cv.width)); const t = document.createElement("canvas"); t.width = w; t.height = h; t.getContext("2d").drawImage(cv, 0, 0, w, h); return { img: t.toDataURL("image/jpeg", 0.88), w, h }; } catch { return null; } }
// v48: HIGH-RESOLUTION, CLEAR pictures for the report. The old snapshots were the whole shared window scaled down to 960 px (black bars, tiny tile, other participants).
// Now the picture is cut from the ORIGINAL video frame at full quality, only around the candidate's own video tile.
let sentRect = null, faceSrc = null; // sentRect = source rectangle behind `work` for the latest analysed frame; faceSrc = the candidate's face box in source pixels
const srcInfo = () => ({ v: latestVF || video, W: latestVF ? latestVF.displayWidth : video.videoWidth, H: latestVF ? latestVF.displayHeight : video.videoHeight });
function hiCrop(r, maxW) {
  try {
    const { v, W, H } = srcInfo(); if (!W || !r) return null;
    const x = Math.max(0, Math.min(W - 2, r.x)), y = Math.max(0, Math.min(H - 2, r.y)), w = Math.max(2, Math.min(W - x, r.w)), h = Math.max(2, Math.min(H - y, r.h));
    const sc = w > maxW ? maxW / w : Math.min(2, 720 / w), c = document.createElement("canvas"); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
    const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(v, x, y, w, h, 0, 0, c.width, c.height);
    return { img: c.toDataURL("image/jpeg", 0.93), w: c.width, h: c.height };
  } catch { return null; }
}
/** the candidate's own video tile around (cx, cy): grow until the (near) black border of the meeting layout is reached. Never smaller than 3x the face. */
function findTile(cx, cy, fw, fh) {
  const { v, W, H } = srcInfo(); if (!W) return null;
  const fallback = () => { const w = Math.min(W, Math.max(fw * 3.4, fh * 3.4 * 4 / 3)), h = Math.min(H, w * 0.75); return { x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h / 2)), w, h }; };
  try {
    const sc = Math.min(1, 240 / W), w = Math.max(8, Math.round(W * sc)), h = Math.max(8, Math.round(H * sc)), c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(v, 0, 0, W, H, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data;
    const dark = (xx, yy) => { const i = (yy * w + xx) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3 < 24; };
    const row = (yy, a, b) => { let n = 0; for (let xx = a; xx < b; xx++) if (dark(xx, yy)) n++; return n / Math.max(1, b - a); };
    const col = (xx, a, b) => { let n = 0; for (let yy = a; yy < b; yy++) if (dark(xx, yy)) n++; return n / Math.max(1, b - a); };
    const px = Math.max(0, Math.min(w - 1, Math.round(cx * sc))), py = Math.max(0, Math.min(h - 1, Math.round(cy * sc))), hx = Math.max(3, Math.round(fw * sc * 0.8)), hy = Math.max(3, Math.round(fh * sc * 0.8));
    let y0 = py, y1 = py, x0 = px, x1 = px;
    const sa = Math.max(0, px - hx), sb = Math.min(w, px + hx + 1), ta = Math.max(0, py - hy), tb = Math.min(h, py + hy + 1);
    while (y0 > 0 && row(y0 - 1, sa, sb) < 0.9) y0--; while (y1 < h - 1 && row(y1 + 1, sa, sb) < 0.9) y1++;
    while (x0 > 0 && col(x0 - 1, ta, tb) < 0.9) x0--; while (x1 < w - 1 && col(x1 + 1, ta, tb) < 0.9) x1++;
    const t = { x: x0 / sc, y: y0 / sc, w: (x1 - x0 + 1) / sc, h: (y1 - y0 + 1) / sc };
    return t.w >= fw * 3 && t.h >= fh * 2.2 ? t : fallback();
  } catch { return fallback(); }
}
function idSpeak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-IN"; u.rate = 0.95;
    const span = { from: Date.now(), to: Date.now() + 1000 * (3 + text.split(/\s+/).length / 2.2) }; idc.spans.push(span); // estimate first, exact times when the browser reports them
    u.onstart = () => { span.from = Date.now(); }; u.onend = () => { span.to = Date.now(); };
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch {}
}
const idPill = (t, cls) => setPill("idPill", t, cls);
function idPreviewRender() {
  const el = $("idPreview"); if (!el) return;
  const cell = (o, cap) => o ? `<figure style="margin:0"><img alt="" src="${o.img}" style="height:110px;border-radius:8px;border:1px solid #ddd"><figcaption class="muted" style="font-size:11px">${esc(cap)}</figcaption></figure>` : "";
  const a = idc.startFace || idc.startFull;
  el.innerHTML = cell(a, "Candidate at start " + (a ? fmt(a.s || 0) : "")) + cell(idc.idSnap, "ID snapshot " + (idc.idSnap ? fmt(idc.idSnap.s || 0) : ""));
}
function idReset() {
  try { speechSynthesis.cancel(); } catch {}
  Object.assign(idc, { on: false, enabled: false, cap: null, t0: 0, spokeAt: 0, repeats: 0, status: "off", reason: "", idType: "", heard: [], startFull: null, startFace: null, idSnap: null, idClose: null, sfFirst: 0, guardUntil: 0, spans: [], late: false });
  idPill("Waiting for Start", ""); idPreviewRender();
}
function idBegin() {
  idReset();
  idc.enabled = !!$("idAuto")?.checked && !!window.IdCheck;
  if (!idc.enabled) { idc.status = "off"; idPill("OFF (ID proof check switched off: nothing is captured)", ""); idPreviewRender(); return; } // v50: OFF = no snapshot, no voice, no section in the report
  if (latestVF || video.videoWidth) { const fs = snapHi(fullShot()); if (fs) idc.startFull = { ...fs, s: 0 }; } // snapshot the moment Start is pressed
  idc.on = true; idc.t0 = Date.now(); idc.status = "running"; idc.cap = IdCheck.createCapture(); idc.cap.begin(idc.t0);
  idPill("Learning the scene… (candidate: look at the screen normally)", ""); idPreviewRender();
  say("IDENTITY CHECK running automatically: the candidate will hear the instruction to show an ID. Wait for \"Thank you, your ID has been captured\" before the first question.");
}
function idFinish(kind) { // kind: captured | timeout | interrupted | ended
  if (!idc.on) return;
  const nowT = Date.now(), res = idc.cap.finish(nowT), o = res.ok && res.best && res.best.img && res.best.img.img ? res.best : null;
  idc.on = false; idc.guardUntil = nowT + 6000;
  const s = Math.round((nowT - t0) / 1000);
  if (o) {
    idc.idSnap = { img: o.img.img, w: o.img.w, h: o.img.h, s: o.img.s != null ? o.img.s : s, cardLike: !!o.cardLike };
    idc.idClose = o.img.close || null;
    idc.status = "captured"; idc.reason = "";
    timeline.push({ s, type: "id_captured", detail: "Something was held steady in front of the camera; the sharpest frame was saved as the ID snapshot." });
    idPill(`ID snapshot captured ✔ (${fmt(idc.idSnap.s)})`, "good"); idSpeak(IdCheck.PROMPT_DONE);
  } else if (kind === "interrupted" || kind === "ended") {
    idc.status = "interrupted"; idc.reason = kind === "ended" ? "The interview was ended before an ID could be captured." : "The first question started before an ID was captured.";
    idPill("ID not captured (interview started early)", "bad");
  } else {
    idc.status = "not_shown"; idc.reason = res.reason || "Nothing was held in front of the camera.";
    raiseEvent("id_not_shown", "No ID proof was captured in the first " + Math.round(IdCheck.CFG.maxMs / 1000) + " s. " + idc.reason, fullShot(), 0, true);
    idPill("ID NOT shown", "bad"); idSpeak(IdCheck.PROMPT_FAIL);
  }
  idPreviewRender();
}
function idTick(now) { // called with the candidate crop in `work` for every analysed frame
  if (!idc.on || !idc.cap) return;
  ictx.drawImage(work, 0, 0, 128, 72);
  const g = IdCheck.toGray(ictx.getImageData(0, 0, 128, 72).data, 128, 72), r = idc.cap.feed(now, g);
  if (r.newBest) { // keep the HIGH-RESOLUTION picture of the sharpest steady frame: candidate's own tile cut from the original video frame (v48) + a zoomed close-up of the card
    const rc = sentRect, fc = faceSrc && now - faceSrc.at < 4000 ? faceSrc : null;
    const cx = fc ? fc.x + fc.w / 2 : rc ? rc.x + rc.w / 2 : 0, cy = fc ? fc.y + fc.h / 2 : rc ? rc.y + rc.h / 2 : 0;
    const tile = rc ? findTile(cx, cy, fc ? fc.w : rc.w / 3, fc ? fc.h : rc.h / 3) : null;
    const big = (tile && hiCrop(tile, 1600)) || snapHi(work);
    if (big) {
      let close = null; const b = idc.cap.st.best && idc.cap.st.best.bbox;
      if (b && rc && idc.cap.st.best.cardLike) { const px = (b.x1 - b.x0 + 1) / 128 * rc.w * 0.1, py = (b.y1 - b.y0 + 1) / 72 * rc.h * 0.1; close = hiCrop({ x: rc.x + b.x0 / 128 * rc.w - px, y: rc.y + b.y0 / 72 * rc.h - py, w: (b.x1 - b.x0 + 1) / 128 * rc.w + 2 * px, h: (b.y1 - b.y0 + 1) / 72 * rc.h + 2 * py }, 1100); }
      idc.cap.setImage({ ...big, close, s: Math.round((now - t0) / 1000) });
    }
  }
  if (!idc.spokeAt && (idc.cap.st.state !== "learning" || now - idc.t0 > 6000)) { idc.spokeAt = now; idSpeak(IdCheck.PROMPT_START); idPill("Asked for ID: hold it in front of the camera and keep it steady", ""); }
  else if (idc.spokeAt && !idc.cap.st.best && now - idc.spokeAt > 22000 * (idc.repeats + 1) && idc.repeats < 2) { idc.repeats++; idSpeak(IdCheck.PROMPT_AGAIN); }
  if (r.state === "holding" && idc.status === "running") idPill("Something held in front of the camera… keep it steady", "");
  if (r.state === "captured") idFinish("captured"); else if (r.state === "not_shown") idFinish("timeout");
}
// v50: the ID proof check is a switch the interviewer can use at any time.
//  OFF (also during the interview): speech stops, pictures are discarded, the report has no identity section.
//  ON during the interview: the check starts right now (it is never cut off by the next question; it ends when the ID is captured or after the normal time limit).
function idSwitchUi() { const el = $("idAuto"), t = $("idAutoTxt"); if (t && el) t.textContent = el.checked ? "ON" : "OFF"; }
function idSwitchLive() {
  idSwitchUi();
  const on = !!$("idAuto")?.checked;
  if (!running) return; // before Start the switch is simply read when Start is pressed
  if (!on) {
    try { speechSynthesis.cancel(); } catch {}
    Object.assign(idc, { on: false, enabled: false, cap: null, status: "off", reason: "", idType: "", heard: [], startFull: null, startFace: null, idSnap: null, idClose: null, sfFirst: 0, guardUntil: 0, spans: [], late: false });
    idPill("OFF (ID proof check switched off: nothing is captured)", ""); idPreviewRender(); say("ID proof check switched OFF."); return;
  }
  if (idc.on || !window.IdCheck) return;
  idc.enabled = true; idc.late = true; idc.on = true; idc.t0 = Date.now(); idc.status = "running"; idc.reason = ""; idc.spokeAt = 0; idc.repeats = 0; idc.idSnap = null; idc.idClose = null;
  idc.cap = IdCheck.createCapture(); idc.cap.begin(idc.t0);
  if (!idc.startFull && (latestVF || video.videoWidth)) { const fs = snapHi(fullShot()); if (fs) idc.startFull = { ...fs, s: Math.round((idc.t0 - t0) / 1000) }; }
  idPill("Learning the scene… (candidate: look at the screen normally)", ""); idPreviewRender(); say("ID proof check switched ON: the candidate will be asked to show the ID now.");
}
$("idAuto")?.addEventListener?.("change", idSwitchLive); idSwitchUi();
function idWatch(now) { if (idc.on && now - idc.t0 > IdCheck.CFG.maxMs + 4000) idFinish("timeout"); }
function idFinalize() { // the identity object for the report
  if (idc.on) idFinish("ended");
  try { speechSynthesis.cancel(); } catch {}
  if (!idc.enabled) return { enabled: false, status: "off", reason: "", idType: "", said: "", startSnap: null, startClock: "", idSnap: null, idClose: null, idClock: "" };
  const a = idc.startFace || idc.startFull;
  return { enabled: idc.enabled, status: idc.status, reason: idc.reason, idType: idc.idType, said: idc.heard.map((h) => h.text).join(" ").slice(0, 240), startSnap: a, startClock: a ? fmt(a.s || 0) : "", idSnap: idc.idSnap, idClose: idc.idClose, idClock: idc.idSnap ? fmt(idc.idSnap.s || 0) : "" };
}

// ---------- Face / gaze / phone detector iframe bridge ----------
window.addEventListener("message", (e) => {
  if (e.source !== det.contentWindow || !e.data?.__aiProctor) return;
  const m = e.data;
  if (m.type === "result" || m.type === "error" || m.type === "located") busy = 0;
  if (m.type === "located") {
    const W = latestVF ? latestVF.displayWidth : video.videoWidth, H = latestVF ? latestVF.displayHeight : video.videoHeight;
    if (m.box && W) {
      const fw = m.box.w * W, fh = m.box.h * H, cx = (m.box.x + m.box.w / 2) * W, cy = (m.box.y + m.box.h / 2) * H;
      let w = Math.max(fw * 3.0, fh * 3.0 * 4 / 3), h = w * 0.75; w = Math.min(w, W); h = Math.min(h, H);
      const nb = { x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h * 0.5)), w, h };
      const first = !autoBox || autoBox.whole;
      const moved = !first && Math.hypot(nb.x + nb.w / 2 - (autoBox.x + autoBox.w / 2), nb.y + nb.h / 2 - (autoBox.y + autoBox.h / 2)) > 0.12 * W;
      if (first || moved) { autoBox = nb; autoAt = Date.now(); if (first) det.contentWindow.postMessage({ __aiProctor: true, type: "recalibrate" }, "*"); say("Candidate face found automatically (green box). You can still draw your own box to override."); }
      else autoAt = Date.now();
    }
    return;
  }
  if (m.type === "ready") {
    ready = true;
    $("modelStatus").textContent = m.phone ? "Loaded · face / eyes / phone" : "Loaded · phone model off";
    $("modelStatus").className = "pill good";
    $("start").disabled = !stream?.active || running;
    $("videoStatus").textContent = "Webcam models ready. Press Start - the candidate's face is found automatically.";
  } else if (m.type === "gazeMapFit") {
    calResult(m);
  } else if (m.type === "challengeResult") {
    chalResult(m);
  } else if (m.type === "snapshotAll") {
    if (snapRes) { const r = snapRes; snapRes = null; r(m.gaze || []); }
  } else if (m.type === "warn" || m.type === "error") {
    $("videoStatus").textContent = "Webcam detector: " + m.message;
  } else if (m.type === "result" && running) {
    if (m.phoneScore != null) lastBest = m.phoneScore;
    const now = Date.now();
    if (lastTick && now - lastTick < 1500) analysed += now - lastTick;
    lastTick = now;
    $("videoStatus").innerHTML = `<span class="pill ${m.faces !== 1 ? "bad" : "good"}">${esc(m.faceStatus)}</span><span class="pill">${esc(m.eyeStatus)}</span><span class="pill ${m.phone ? "bad" : "good"}">Phone: ${m.phone ? "YES" : "no"} (${lastBest}%)</span><span class="pill">Calibration ${m.calibration}%</span>${m.unavail ? '<span class="pill bad">Candidate video hidden by share layout: searching for the face…</span>' : ''}`;
    mouthLog.push({ t: now, v: m.faces === 1 && typeof m.mouth === "number" ? m.mouth : null }); while (mouthLog.length > 160) mouthLog.shift();
    calFeed(m); selfCalFeed(m); chalFeed(m, now);
    const inCh = chal.on && now >= chal.T0 - 1500 && now <= chalEnd() + 1500;
    lastFaces = m.faces; if (m.faces === 1) lastFaceAt = now;
    qualityN++; if (m.faces !== 1) qualityBad++;
    const ansNow = !inCh && (now < candidateSpeakingUntil || (!!currentItem && now - lastCandActivity < 6000));
    Fz.push({ t: now, faces: m.faces, off: inCh ? false : !!m.off, down: inCh ? false : !!m.downNow, phone: !!m.phone && !idActive(), sweep: inCh ? 0 : (m.sweep || 0), answering: ansNow });
    // v32: live "phone / notes beside the laptop" watch = repeated separate looks to the SAME side while answering (+ phone seen in the last minute)
    if (m.phone && !idActive()) lastPhoneAt = now; // an ID card held up is often seen as a "phone-like object": not judged while the ID check runs
    if (m.faces === 1 && m.fbox && sentRect) faceSrc = { x: sentRect.x + m.fbox.x * sentRect.w, y: sentRect.y + m.fbox.y * sentRect.h, w: m.fbox.w * sentRect.w, h: m.fbox.h * sentRect.h, at: now };
    if (idc.startFace === null && m.faces === 1 && !m.fclosed) { // candidate snapshot (v48): the first CLEAR frame - looking at the screen, eyes open - cut as a close, full-quality face picture (waits at most 7 s)
      idc.sfFirst = idc.sfFirst || now;
      if ((!m.off && !m.downNow) || now - idc.sfFirst > 7000) {
        let sh = null;
        if (faceSrc && now - faceSrc.at < 1000) { const pw = faceSrc.w * 2.7, ph = pw * 1.1, cx = faceSrc.x + faceSrc.w / 2, cy = faceSrc.y + faceSrc.h / 2 + faceSrc.h * 0.05; sh = hiCrop({ x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph }, 900); }
        sh = sh || snapHi(work);
        if (sh) { idc.startFace = { ...sh, s: Math.round((now - t0) / 1000) }; idPreviewRender(); }
      }
    }
    if (!inCh && m.faces === 1) {
      const sd = m.off ? (m.mapped ? (m.gdir === "left" || m.gdir === "right" ? m.gdir : "") : (m.gdirS < 0 ? "left" : m.gdirS > 0 ? "right" : "")) : "";
      const hit = sideTr.push(sd, ansNow, now - lastPhoneAt < 60000, now);
      if (hit) {
        sideHits++; if (hit.withPhone) Fz.note("same_side_phone", now); // v32: looks to one side WITHOUT a phone seen are only shown here, never counted (people look aside while thinking)
        if ($("insightLive")) $("insightLive").innerHTML = `<b style="color:${hit.withPhone ? "#d63b53" : "#b7791f"}">Pattern watch:</b> looked ${hit.side} ${hit.count}x while answering${hit.withPhone ? " and a phone was seen (phone beside the laptop?)" : " (no phone seen: probably just thinking, NOT counted)"} · ${sideHits} time(s) so far`;
      }
    }
    for (const ev of (m.events || [])) if (!/^(looking_away|looking_down)$/.test(ev.type) && !(idActive() && /^phone/.test(ev.type))) raiseEvent(ev.type, ev.detail, ev.type === "tracking_lost" ? fullShot() : /^phone/.test(ev.type) ? pwork : work, ev.type === "tracking_lost" ? 15000 : 3000);
  }
});

function stopFrameReader() { try { procReader?.cancel(); } catch {} procReader = null; try { latestVF?.close(); } catch {} latestVF = null; }
function startFrameReader(track) {
  stopFrameReader();
  if (!track || typeof MediaStreamTrackProcessor === "undefined") return;
  try {
    const rd = new MediaStreamTrackProcessor({ track }).readable.getReader(); procReader = rd;
    (async () => { for (;;) { const { value, done } = await rd.read(); if (done) break; try { latestVF?.close(); } catch {} latestVF = value; lastFrameAt = Date.now(); } })().catch(() => {});
  } catch { procReader = null; }
}
let drawing = false;
function draw() {
  if (!stream?.active) { drawing = false; return; }
  if (drawing && arguments[0] !== "loop") return;
  drawing = true;
  if (video.videoWidth) {
    const dims = video.videoWidth + "x" + video.videoHeight;
    if (lastDims && dims !== lastDims) { if (crop) { crop = null; say("Shared window size changed - draw the box again, or leave it to auto-detect."); } autoBox = null; autoAt = 0; autoTry = 0; autoStart = Date.now(); }
    lastDims = dims;
    prev.width = video.videoWidth; prev.height = video.videoHeight; pc.drawImage(video, 0, 0);
    const r = drag || crop || (running && !wholeOk && autoBox && !autoBox.whole ? autoBox : null);
    if (screenBox) { pc.lineWidth = 4; pc.strokeStyle = "#f59e0b"; pc.strokeRect(screenBox.x, screenBox.y, screenBox.w, screenBox.h); }
    if (r) { pc.lineWidth = 4; pc.strokeStyle = (!drag && !crop) ? "#22c55e" : "#22d3ee"; pc.strokeRect(r.x, r.y, r.w, r.h); }
  }
  requestAnimationFrame(() => draw("loop"));
}

// Share screen / window / tab. AUDIO IS OPTIONAL: video-only share still gives cheating detection.
// You can click this again at any time (even during the interview) to re-share - nothing is lost.
$("share").onclick = async () => {
  let ns;
  try {
    ns = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: true, systemAudio: "include" });
  } catch (e) {
    say("Screen sharing was cancelled or blocked. Click 'Share' again and pick a Tab / Window / Entire screen.");
    return;
  }
  const old = stream; stream = ns;
  video.srcObject = stream;
  try { await video.play(); } catch {}
  try { old?.getTracks().forEach((t) => { t.onended = null; t.stop(); }); } catch {}
  $("wrap").style.display = "block"; shareLost = false;
  meetingAudioTrack = stream.getAudioTracks()[0] || (sysShare && sysAudioLive() ? sysShare.getAudioTracks()[0] : null);
  if (meetingAudioTrack) {
    $("tabAudioStatus").textContent = "Audio track found"; $("tabAudioStatus").className = "pill good";
    say("Shared with audio. " + (running ? "Candidate voice capture re-connected." : "Now press Start - the candidate's face is found automatically."));
  } else {
    $("tabAudioStatus").textContent = "No tab audio (mic-only mode)"; $("tabAudioStatus").className = "pill";
    say("WARNING: shared WITHOUT audio. The candidate's voice will be heard ONLY through your microphone, so speakers must be ON (NO headphones) and the candidate loud enough. Best fix: click button '1b. Share SYSTEM AUDIO' and choose Entire screen + 'Also share system audio'.");
  }
  stream.getVideoTracks()[0].onended = () => {
    if (stream !== ns) return;
    shareLost = true; stopFrameReader();
    say("Share stopped (window closed / changed). Interview is NOT ended. Click 'Share' again to continue.");
    if (running) { stopOne(tabRecognition); tabRecognition = null; meetingAudioTrack = null; }
    $("start").disabled = true;
  };
  connectMeetingAudio();
  lastDims = ""; crop = null; wholeOk = false; startFrameReader(stream.getVideoTracks()[0]);
  $("start").disabled = !ready || running;
  draw();
};

// VIDEO and AUDIO are shared separately: share the meeting WINDOW / TAB for the candidate's face (button 1), and share
// "Entire screen + system audio" only for the candidate's VOICE (button 1b). Face detection stays accurate and the voice is captured.
let sysShare = null;
const sysAudioLive = () => !!(sysShare && sysShare.getAudioTracks()[0] && sysShare.getAudioTracks()[0].readyState === "live");
function connectMeetingAudio() { // (re)connect candidate voice while the interview is running; the mic recognizer is never touched
  if (!running || !meetingAudioTrack) return;
  startCandidateSTT(); refreshRoles();
  if (recorder == null) startRecording();
}
// One-line live diagnostics: shows exactly which engine hears something.
let diagTimer = null, lastEngineError = "";
function startDiag() {
  clearInterval(diagTimer); const el = $("diag"); if (!el) return;
  diagTimer = setInterval(() => {
    const cs = window.CandidateSTT, chrome = micRecognition?.__isActive?.() ? "listening" : "NOT running";
    el.textContent = `Chrome speech (mic): ${chrome}, ${heard.Mic} heard | Whisper: ${cs?.failed ? "FAILED" : cs?.ready ? "ready" : "loading"}, ${cs?.pending || 0} waiting, candidate lines ${heard.Tab}${lastEngineError ? " | last error: " + lastEngineError : ""}`;
  }, 1000);
}
function stopDiag() { clearInterval(diagTimer); diagTimer = null; }

// Backup for the interviewer's microphone: if Chrome's own engine misses a question, Whisper still catches it.
function startMicSTT() {
  const track = micStream?.getAudioTracks()[0];
  if (!track || !window.MicSTT) return;
  MicSTT.start(track, {
    lang: $("lang").value, model: $("sttModel")?.value || "base", voice: !hasTab, onVoice: voiceOnSegment,
    // v36: NO audio-level "skip" any more. The interviewer's own voice also leaks onto the candidate audio, so dropping the mic
    // segment by timing deleted the real questions. Echo is now recognised by its WORDS (see isEchoOfCandidate in handleSpeech).
    onText: (t, at) => { handleSpeech("Mic", t, undefined, at); },
    onStatus: () => {}
  });
}

// Candidate voice = Whisper running in the browser on the shared system / meeting audio.
function startCandidateSTT() {
  if (!meetingAudioTrack || meetingAudioTrack.readyState !== "live" || !window.CandidateSTT) return false;
  stopOne(tabRecognition); tabRecognition = null; hasTab = true;
  const pill = $("tabAudioStatus");
  CandidateSTT.start(meetingAudioTrack, {
    lang: $("lang").value, model: $("sttModel")?.value || "base",
    pitch: true, voice: true, onVoice: voiceOnSegment, onClicks: voiceOnClicks,
    onSpeech: (rms, f0, tt) => { if (ttsNow(Date.now())) return; noteCandChunk(rms, f0, tt); sysSpeechAt = Date.now(); sysSpeechLog.push(sysSpeechAt); if (sysSpeechLog.length > 600) sysSpeechLog.shift(); candidateSpeakingUntil = Math.max(candidateSpeakingUntil, Date.now() + 1500); },
    onText: (t, endAt, startAt) => { heard.Tab += 1; handleSpeech("Tab", t, undefined, startAt || endAt, false, endAt); },
    onStatus: (s, bad) => { pill.textContent = s; pill.className = "pill " + (bad ? "bad" : /ready/i.test(s) ? "good" : ""); if (bad) { recognitionErrors.push(s); say(s); } }
  });
  return true;
}

// Download / load the Whisper speech model right away (cached after the first time), so it is READY before the interview starts.
(function () {
  const show = (s, bad) => { const el = $("sttStatus"); if (!el) return; el.textContent = "Speech model: " + String(s).replace(/^Speech model /i, "").replace(/^Candidate voice /i, ""); el.className = "pill " + (bad ? "bad" : /ready/i.test(s) ? "good" : ""); };
  window.CandidateSTT?.preload({ onStatus: show });
})();

$("shareAudio")?.addEventListener("click", async () => {
  let ns;
  try { ns = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: true, systemAudio: "include" }); }
  catch { return say("System-audio share was cancelled. Click '1b' again, choose 'Entire screen' and tick 'Also share system audio'."); }
  const at = ns.getAudioTracks()[0];
  if (!at) { ns.getTracks().forEach((t) => t.stop()); $("tabAudioStatus").textContent = "No system audio"; $("tabAudioStatus").className = "pill bad"; return say("No audio was shared. In the Chrome window choose 'Entire screen' (not Window) and tick 'Also share system audio' at the bottom-left, then click Share."); }
  try { sysShare?.getTracks().forEach((t) => { t.onended = null; t.stop(); }); } catch {}
  sysShare = ns; meetingAudioTrack = at;
  at.onended = () => { if (meetingAudioTrack === at) { meetingAudioTrack = null; $("tabAudioStatus").textContent = "System audio stopped"; $("tabAudioStatus").className = "pill bad"; say("System audio sharing stopped. Click '1b' again."); } };
  $("tabAudioStatus").textContent = "System audio connected"; $("tabAudioStatus").className = "pill good";
  window.CandidateSTT?.preload({ onStatus: (s, bad) => { $("tabAudioStatus").textContent = s; $("tabAudioStatus").className = "pill " + (bad ? "bad" : /ready/i.test(s) ? "good" : ""); } });
  say(running ? "System audio connected: candidate voice is now captured." : "System audio connected. The speech model is loading (first time ~1 minute); wait until it says 'Candidate voice ready', then press Start.");
  connectMeetingAudio();
});

$("fullframe")?.addEventListener("click", () => { crop = null; autoBox = null; wholeOk = true; say("Using the whole shared area."); });
$("recal")?.addEventListener("click", () => { if (!crop && !wholeOk) { autoBox = null; autoAt = 0; autoTry = 0; autoStart = Date.now(); } det.contentWindow?.postMessage({ __aiProctor: true, type: "recalibrate" }, "*"); say("Recalibrating on the candidate (look at the screen normally for 3 seconds)."); });
$("mAdd")?.addEventListener("click", () => {
  const t = ($("mText").value || "").trim();
  if (!t) return;
  if (!running) return say("Press Start first, then add a missed / corrected line.");
  handleSpeech("Mic", t, $("mRole").value); $("mText").value = "";
});
const pos = (e) => { const b = prev.getBoundingClientRect(); return { x: (e.clientX - b.left) * prev.width / b.width, y: (e.clientY - b.top) * prev.height / b.height }; };
prev.onmousedown = (e) => { const p = pos(e); drag = { x: p.x, y: p.y, w: 0, h: 0 }; };
prev.onmousemove = (e) => { if (!drag) return; const p = pos(e); drag.w = p.x - drag.x; drag.h = p.y - drag.y; };
window.onmouseup = () => {
  if (drag && Math.abs(drag.w) > 40 && Math.abs(drag.h) > 40)
  {
    const b = { x: Math.min(drag.x, drag.x + drag.w), y: Math.min(drag.y, drag.y + drag.h), w: Math.abs(drag.w), h: Math.abs(drag.h) };
    if (pickMode === "screen") { screenBox = b; pickMode = "face"; scr.prev = null; scr.ref = null; scr.refAt = 0; scr.changes = 0; scr.armedAt = 0; $("clearScreen").style.display = ""; setPill("screenStatus", "Watching selected region", "good"); say("Screen-region monitoring ON. Large changes in the selected region will be flagged; this may also include normal content changes, so check the snapshot."); }
    else crop = b;
  }
  drag = null;
};

// ---------- Automatic speech capture. Who is the interviewer / candidate is DETECTED, not assumed ----------
// Two audio sources: "Mic" (this computer's microphone) and "Tab" (the shared meeting-tab audio).
// Auto mode learns which source is the interviewer from the speech itself: the interviewer is the one who
// asks questions. If both voices arrive on a single source, each sentence is classified by its wording.
let silent = false, utts = [], roleMap = { Mic: "Interviewer", Tab: "Candidate" }, roleWhy = "waiting for speech", singleStream = false, wakeLock = null;
const srcStats = { Mic: { n: 0, q: 0 }, Tab: { n: 0, q: 0 } };
const parser = Analysis.createParser({
  onNew: (it) => { currentItem = it; if (!silent) det.contentWindow?.postMessage({ __aiProctor: true, type: "setQuestion", n: it.seq }, "*"); },
  onChange: () => { if (!silent) renderQA(); }
});
const looksLikeAsk = (t) => Analysis.classifyLine(t) === "question";
// Interviewer can fix a cut-off question or add / correct the candidate's full answer (speech recognition can miss words).
const qEdits = {}, aEdits = {};
function applyEdits() { for (const x of parser.qa) { if (qEdits[x.seq] !== undefined) x.question = qEdits[x.seq]; if (aEdits[x.seq] !== undefined) x.answer = aEdits[x.seq]; } }
$("qaLive")?.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-qa]"); if (!b) return;
  const x = parser.qa.find((i) => String(i.seq) === b.dataset.seq); if (!x) return;
  if (b.dataset.qa === "ans") { const t = prompt("Candidate's FULL answer (add the missing words / correct it):", x.answer || ""); if (t === null) return; aEdits[x.seq] = t.trim(); x.answer = t.trim(); }
  else { const t = prompt("Interviewer's question (fix it if it was cut off):", x.question || ""); if (t === null || !t.trim()) return; qEdits[x.seq] = t.trim(); x.question = t.trim(); }
  renderQA();
});

function resetSession() {
  for (const k of Object.keys(qEdits)) delete qEdits[k]; for (const k of Object.keys(aEdits)) delete aEdits[k];
  parser.reset(); currentItem = null; utts = []; srcStats.Mic = { n: 0, q: 0 }; srcStats.Tab = { n: 0, q: 0 };
  roleMap = { Mic: "Interviewer", Tab: "Candidate" }; roleWhy = "waiting for speech"; singleStream = false;
  candidateSpeakingUntil = 0; recognitionErrors = [];
}
function decideRoles() {
  const mode = $("roleMode").value, m = srcStats.Mic, t = srcStats.Tab;
  if (!hasTab) return { map: { Mic: "Interviewer", Tab: "Candidate" }, single: true, why: "no separate meeting audio, so every sentence from the microphone is classified by wording (questions = interviewer, answers = candidate)" };
  if (window.CandidateSTT?.failed && mode === "auto") return { map: { Mic: "Interviewer", Tab: "Candidate" }, single: true, why: "the speech model for the meeting audio failed to load, so only the microphone is used and every sentence is classified by wording" };
  if (mode === "headset") return { map: { Mic: "Interviewer", Tab: "Candidate" }, single: false, why: "headphones: microphone = interviewer (you), shared meeting audio = candidate" };
  if (window.CandidateSTT?.active && mode === "auto") return { map: { Mic: "Interviewer", Tab: "Candidate" }, single: false, why: "microphone = interviewer (you), shared meeting audio = candidate" };
  if (mode === "mic-int") return { map: { Mic: "Interviewer", Tab: "Candidate" }, single: false, why: "you selected: microphone = interviewer, meeting tab = candidate" };
  if (mode === "mic-cand") return { map: { Mic: "Candidate", Tab: "Interviewer" }, single: false, why: "you selected: microphone = candidate, meeting tab = interviewer" };
  if (m.n === 0 && t.n >= 3) return { map: { Mic: "Interviewer", Tab: "Candidate" }, single: true, why: "all speech came through the meeting tab, so each sentence is classified by its wording (questions = interviewer, answers = candidate)" };
  if (m.n + t.n >= 3 && m.q + t.q >= 1) {
    const rm = m.q / Math.max(1, m.n), rt = t.q / Math.max(1, t.n);
    if (rt > rm + 0.2 && t.q >= 1) return { map: { Mic: "Candidate", Tab: "Interviewer" }, single: false, why: "the meeting tab voice asks the questions, so it was detected as the interviewer" };
    if (rm > rt + 0.2) return { map: { Mic: "Interviewer", Tab: "Candidate" }, single: false, why: "the microphone voice asks the questions, so it was detected as the interviewer" };
  }
  return { map: { Mic: "Interviewer", Tab: "Candidate" }, single: false, why: "default (microphone = interviewer) until enough speech is heard to confirm" };
}
const refreshRoles = () => { const d = decideRoles(); roleMap = d.map; singleStream = d.single; roleWhy = d.why; renderRoles(); };
const roleOfUtt = (u) => u.forced ? u.forced : singleStream ? (looksLikeAsk(u.text) ? "Interviewer" : "Candidate") : roleMap[u.src];
// v44: the interviewer's microphone ALSO hears the candidate (speakers, no headphones). A microphone line that is not question-shaped is the candidate's voice:
// it is never a question and never part of one. If the candidate audio produced text for the same moment it is only an echo (dropped); if not, it is the answer.
function micCandidateRole(u) {
  if (u.forced || u.src !== "Mic" || singleStream || !hasTab || roleMap.Mic !== "Interviewer") return "";
  if ($("roleMode")?.value === "headset") return ""; // v52: with headphones the microphone hears ONLY the interviewer: every mic line is the interviewer
  const tabTexts = utts.filter((p) => p.src === "Tab" && !p.forced && Math.abs(p.at - u.at) < 12000).map((p) => p.text);
  return Analysis.micRole(u.text, tabTexts, sysSpeechBetween(u.at - 3000, (u.endAt || u.at) + 3000));
}
function applyUtt(u) {
  const mr = micCandidateRole(u);
  if (mr === "Echo") { u.role = "Candidate"; u.echo = true; u.q = parser.current ? (parser.current.groupSeq || parser.current.seq) : 0; return; }
  u.echo = false;
  u.role = mr || roleOfUtt(u);
  parser.feed(u.role, u.text, u.at, !singleStream || !!u.forced, u.forced === "Interviewer");
  currentItem = parser.current;
  u.q = currentItem ? (currentItem.groupSeq || currentItem.seq) : 0; // v35: pieces cut from one "question not captured" answer share the webcam window of the first piece // which question this line belongs to (used by the full-conversation part of the report)
  // v45: the parser may have taken an "interviewer" line for the candidate's answer (heard on the interviewer microphone): then it counts as ANSWER TIME for the
  // eye / reading check. Before, every such line pushed interviewerUntil forward, so the answer was never "answering" and the report said "no gaze measurements".
  const parsedAsAnswer = !!currentItem && currentItem.lastAnswerAt === u.at && u.forced !== "Interviewer";
  if (u.role === "Candidate" || parsedAsAnswer) { candidateSpeakingUntil = Math.max(candidateSpeakingUntil, u.at + 1600); lastCandActivity = u.at; }
  else if (u.forced === "Interviewer" || Analysis.isQuestion(u.text)) interviewerUntil = Math.max(interviewerUntil, Math.max(u.at, u.seenAt || 0) + 2500);
}
function renderRoles() {
  const el = $("roleInfo"); if (!el) return;
  const who = (s) => (singleStream ? "Both" : roleMap[s]);
  if (singleStream && !hasTab) { el.innerHTML = `<span class="pill">Microphone → Interviewer + Candidate</span><div class="muted" style="margin-top:4px">Roles: ${esc(roleWhy)}.</div>`; return; }
  el.innerHTML = `<span class="pill">Microphone → ${esc(singleStream ? "(silent)" : roleMap.Mic)}</span><span class="pill">Meeting tab → ${esc(singleStream ? "Interviewer + Candidate" : roleMap.Tab)}</span><div class="muted" style="margin-top:4px">Roles: ${esc(roleWhy)}.</div>`;
}
let sysSpeechAt = 0; // last moment the shared (candidate) audio carried a voice
const sysSpeechLog = []; // timestamps of candidate-voice activity (used to recognise echo on the microphone)
const wordSet = (s) => new Set(String(s || "").toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((x) => x.length > 2));
function similarText(x, y) { const A = wordSet(x), B = wordSet(y); if (!A.size || !B.size) return false; let i = 0; A.forEach((v) => { if (B.has(v)) i++; }); return i / Math.max(A.size, B.size) >= 0.55; } // overlap measured against the LONGER text, so a short question never "matches" its long answer
const sysSpeechBetween = (from, to) => sysSpeechLog.some((t) => t >= from && t <= to);
// v36: the microphone line is an echo of the candidate only if the candidate audio transcript has (nearly) the same words around that time.
function isEchoOfCandidate(text, at) {
  if (looksLikeAsk(text)) return false;
  return utts.slice(-8).some((p) => p.src === "Tab" && !p.forced && Math.abs(at - p.at) < 20000 && similarText(p.text, text));
}
function handleSpeech(src, text, forced, atOverride, joinOk, endAt, noSplit) {
  const rawClean = String(text || "").replace(/\s+/g, " ").trim();
  if (!rawClean) return;
  let clean = (window.SpeechFix ? SpeechFix.fix(rawClean) : rawClean); // v33: technical words fixed (tuple, dictionary, comprehension ...)
  // v48: the page's own spoken ID instruction is removed (also when it arrives late or glued to the first question)
  if (!forced && window.IdCheck && (atOverride || Date.now()) - t0 < 150000) {
    const st = IdCheck.stripOwnPrompt(clean);
    if (st !== clean) { if (!st || st.split(/\s+/).length < 2) return; clean = st; }
  }
  // v30: while the random-number challenge runs, what is said belongs to the challenge, NOT to the interview answer
  if (!forced && chal.on && inChalWindow(atOverride || Date.now())) { chal.heard.push({ at: atOverride || Date.now(), src, text: clean }); return; }
  // v47: during the automatic ID check the page's own spoken instruction and the candidate's "my name is ..., Aadhaar card" are NOT interview questions / answers
  if (!forced && window.IdCheck && idActive() && (atOverride || Date.now()) >= idc.t0 - 800) {
    const kind = IdCheck.classifyDuringPhase(clean, looksLikeAsk(clean));
    if (kind === "drop") return;
    if (kind === "idspeech" && !currentItem) { idc.heard.push({ at: atOverride || Date.now(), src, text: clean }); const ty = IdCheck.idTypeFromSpeech(clean); if (ty && !idc.idType) idc.idType = ty; return; }
    if (kind === "keep" && idc.on && !idc.late) idFinish("interrupted"); // a real interview question: the interviewer started early
  }
  // v34: one chunk with BOTH voices (interviewer question + candidate answer in the same audio) is split sentence by sentence,
  // so every question the interviewer asks becomes its own Q and is not swallowed into the previous answer.
  if (!forced && !noSplit && (src === "Tab" || singleStream) && Analysis.splitMixed) {
    const segs = Analysis.splitMixed(clean, parser.current && parser.current.question);
    if (segs) { const base = atOverride || Date.now(); segs.forEach((sg, i) => handleSpeech(src, sg.text, sg.role === "Interviewer" ? "Interviewer" : "", base + i, joinOk, endAt, true)); return; }
  }
  // the microphone also hears the candidate coming out of the speakers: that echo is not an interviewer line
  // v36: only a line whose WORDS match what the candidate audio just produced is an echo. Before, ANY non-question line heard while the
  // candidate audio had sound was thrown away - and the interviewer's own voice leaks onto that audio, so real questions were lost.
  if (src === "Mic" && !forced && window.CandidateSTT?.active && !window.CandidateSTT.failed && isEchoOfCandidate(clean, atOverride || Date.now())) return;
  // v36: the interviewer's voice leaks onto the candidate audio, so the candidate transcript can contain the SAME question again (or a cut-off
  // piece like "What is?"). That copy is not part of the answer: drop it when the microphone already captured this question.
  if (!forced && src === "Tab") {
    const nowAt = atOverride || Date.now(), recentIv = utts.slice(-6).filter((p) => p.role === "Interviewer" && Math.abs(nowAt - p.at) < 15000);
    if (recentIv.some((p) => similarText(p.text, clean)) || (recentIv.length && /\?\s*$/.test(clean) && clean.split(/\s+/).length <= 3)) return;
  }
  // the same words heard by BOTH speech engines (Chrome + Whisper) are kept only once
  if (!forced && src === "Mic") {
    const dup = utts.slice(-4).find((p) => p.src === "Mic" && !p.forced && Math.abs((atOverride || Date.now()) - p.at) < 25000 && similarText(p.text, clean));
    if (dup) { // v36: two engines heard the same sentence: keep the MORE COMPLETE version (the other one is often cut off or garbled)
      if (clean.split(/\s+/).length > dup.text.split(/\s+/).length) { dup.text = clean; reparse(); }
      return;
    }
  }
  const prevU = utts[utts.length - 1];
  if (!forced && (!atOverride || joinOk) && prevU && prevU.src === src && prevU.text.toLowerCase() === clean.toLowerCase() && Date.now() - prevU.at < 7000) return;
  // a question start cut in two by a pause ("what is" ... "data science") is joined back together
  if (!forced && (!atOverride || joinOk) && prevU && prevU.src === src && !prevU.forced && Date.now() - (prevU.seenAt || prevU.at) < 5000 && prevU.text.split(" ").length <= 3 &&
      (prevU.text.split(" ").length <= 2 || /\b(the|a|an|of|is|are|to|in|on|for|and|or|between|about|your|you|me|what|how|why|difference|explain|tell|define|describe)$/i.test(prevU.text.trim())) && // only when the first part was really CUT OFF ("what is the"), never for a complete question ("what is python")
      /^(okay |ok |so )?(what is|what are|what's|explain|tell me|how does|how do|why does|why do|define|describe|difference between|can you|could you)\b/i.test(prevU.text)) {
    prevU.text = prevU.text + " " + clean; prevU.at = Date.now();
    silent = true; parser.reset(); currentItem = null; utts.forEach(applyUtt); silent = false;
    if (currentItem) det.contentWindow?.postMessage({ __aiProctor: true, type: "setQuestion", n: currentItem.seq }, "*");
    renderRoles(); renderTranscript(); renderQA(); return;
  }
  const atU = atOverride || (src === "Mic" && !forced ? Date.now() - 900 : Date.now());
  const u = { src, text: clean, raw: rawClean !== clean ? rawClean : undefined, at: atU, endAt: endAt || 0, seenAt: Date.now(), clock: fmt(Math.round((atU - t0) / 1000)), role: "", forced: forced || "" };
  utts.push(u);
  const outOfOrder = utts.length > 1 && utts[utts.length - 2].at > u.at;
  if (outOfOrder) utts.sort((x, y) => x.at - y.at);
  if (!forced) { srcStats[src].n += 1; if (looksLikeAsk(clean)) srcStats[src].q += 1; }
  const d = decideRoles();
  const changed = outOfOrder || JSON.stringify(d.map) !== JSON.stringify(roleMap) || d.single !== singleStream || (src === "Tab" && !forced && utts.some((p) => p.src === "Mic" && !p.forced && Math.abs(p.at - u.at) < 12000));
  roleMap = d.map; singleStream = d.single; roleWhy = d.why;
  if (changed) { // roles were just learned / corrected: rebuild every question and answer with the right speakers
    silent = true; parser.reset(); currentItem = null; utts.forEach(applyUtt); silent = false;
    if (currentItem) det.contentWindow?.postMessage({ __aiProctor: true, type: "setQuestion", n: currentItem.seq }, "*");
  } else applyUtt(u);
  renderRoles(); renderTranscript(); renderQA();
}
$("roleMode")?.addEventListener("change", () => { if (utts.length) { const d = decideRoles(); roleMap = d.map; singleStream = d.single; roleWhy = d.why; silent = true; parser.reset(); currentItem = null; utts.forEach(applyUtt); silent = false; renderRoles(); renderTranscript(); renderQA(); } });

function reparse() {
  silent = true; parser.reset(); currentItem = null; utts.forEach(applyUtt); silent = false;
  if (currentItem) det.contentWindow?.postMessage({ __aiProctor: true, type: "setQuestion", n: currentItem.seq }, "*");
  renderRoles(); renderTranscript(); renderQA();
}
// fix a line: swap Interviewer <-> Candidate, or correct the wording
$("transcript")?.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const u = utts[Number(b.dataset.i)]; if (!u) return;
  if (b.dataset.act === "swap") u.forced = u.role === "Interviewer" ? "Candidate" : "Interviewer";
  else { const t = prompt("Correct the text of this line:", u.text); if (t === null || !t.trim()) return; u.text = t.trim(); }
  reparse();
});
function renderTranscript() {
  const list = utts.slice(-80), off = utts.length - list.length;
  $("transcript").innerHTML = list.length ? list.map((l, k) =>
    `<div class="transcript-line"><span class="who ${l.role === "Interviewer" ? "iv" : "cd"}">${esc(l.role)} · ${esc(l.clock)}</span>${esc(l.text)} <button type="button" data-act="swap" data-i="${off + k}" title="Wrong speaker? swap" style="padding:0 6px;margin:0 2px;font-size:11px">⇄</button><button type="button" data-act="edit" data-i="${off + k}" title="Fix the words" style="padding:0 6px;margin:0;font-size:11px">✎</button></div>`
  ).join("") : `<div class="empty">Speech will appear here with speaker labels.</div>`;
  $("transcript").scrollTop = $("transcript").scrollHeight;
}
function renderQA() {
  applyEdits();
  const qa = parser.qa;
  $("qaLive").innerHTML = qa.length ? qa.slice().reverse().map((x) => {
    const sc = x.answer.trim() ? Analysis.scoreAnswer(x) : null;
    const live = x === parser.current;
    return `<div class="qa-card"><div class="qhead">${esc(x.label)} · ${x.follow ? "Follow-up" : "Main question"}${sc ? ` <span class="pill">${live ? "so far " : ""}${sc.total}/100</span>` : ""}</div><b>Interviewer question</b> <button type="button" data-qa="q" data-seq="${x.seq}" style="padding:0 6px;margin:0;font-size:11px">✎ fix question</button><div>${esc(x.question)}</div><div class="answer"><b>Candidate answer</b> <button type="button" data-qa="ans" data-seq="${x.seq}" style="padding:0 6px;margin:0;font-size:11px">✎ add / edit full answer</button><div>${x.answer ? esc(x.answer) : '<span class="muted">Listening for the candidate answer…</span>'}</div>${sc ? `<div class="muted" style="margin-top:6px">Relevance ${sc.relevance} · Accuracy ${sc.accuracy} · Technical ${sc.technical} · Completeness ${sc.completeness} · Communication ${sc.communication}</div>` : ""}</div></div>`;
  }).join("") : `<div class="empty">Questions will appear automatically after the interviewer speaks.</div>`;
}

function makeRecognizer(track, src, useTrack = src === "Tab") {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error("Speech Recognition API is unavailable. Use current Chrome or Edge.");
  if (!track || track.kind !== "audio" || track.readyState !== "live") throw new Error(`${src === "Mic" ? "Microphone" : "Meeting tab"} audio track is not available.`);
  const rec = new SR();
  rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  rec.lang = $("lang").value || "en-IN";
  try { if (window.SpeechRecognitionPhrase && "phrases" in rec && window.SpeechFix) rec.phrases = SpeechFix.hints.map((t) => new SpeechRecognitionPhrase(t, 6)); } catch {} // v33: newest Chrome: bias recognition toward Python words
  rec.__stopping = false; rec.__self = false;
  const pill = () => (src === "Mic" ? $("micStatus") : $("tabAudioStatus"));
  const candHere = () => (singleStream ? (hasTab && src === "Tab") : roleMap[src] === "Candidate");
  let interim = "", flushTimer = null, startedAt = Date.now(), netErr = false;
  const hear = (t) => { const el = $("hearing"); if (el) el.textContent = t ? `Hearing (${src === "Mic" ? "microphone" : "meeting audio"}): ${t}` : ""; };
  const selfAbort = () => { rec.__self = true; try { rec.abort(); } catch {} };
  let utterStart = 0; // when this spoken sentence began (first partial result); a question is stamped with its START so the answer that follows can never be placed before it
  const flush = () => { flushTimer = null; if (!interim) return; const t = interim; interim = ""; hear(""); const st = utterStart || undefined; utterStart = 0; handleSpeech(src, t, undefined, st, true); selfAbort(); }; // Chrome sometimes never sends the final result
  rec.onstart = () => { active = true; startedAt = Date.now(); pill().textContent = `Listening · ${heard[src]} heard`; pill().className = "pill good"; };
  rec.onspeechstart = () => { if (candHere()) candidateSpeakingUntil = Date.now() + 2500; };
  rec.onspeechend = () => { if (candHere()) candidateSpeakingUntil = Date.now() + 900; };
  rec.onresult = (event) => {
    netErr = false; lastResultAt = Date.now();
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result?.[0]?.transcript?.trim();
      if (!text) continue;
      if (result.isFinal) {
        clearTimeout(flushTimer); flushTimer = null; interim = ""; hear("");
        heard[src] += 1; pill().textContent = `Listening · ${heard[src]} heard`;
        const st = utterStart || undefined; utterStart = 0;
        handleSpeech(src, text, undefined, st, true);
      } else {
        if (!interim && !utterStart) utterStart = Date.now();
        interim = text; hear(text); clearTimeout(flushTimer); flushTimer = setTimeout(flush, 4000);
        if (candHere()) candidateSpeakingUntil = Date.now() + 1800;
        else if (singleStream && !hasTab && !looksLikeAsk(text)) candidateSpeakingUntil = Date.now() + 1800;
      }
    }
  };
  rec.onerror = (event) => {
    if (event.error && event.error !== "no-speech" && event.error !== "aborted") lastEngineError = src + ": " + event.error;
    if (event.error === "no-speech") return;
    if (event.error === "aborted") { if (rec.__self) { rec.__self = false; return; } if (++abortHits >= 6 && hasTab && tabRecognition) { stopOne(tabRecognition); tabRecognition = null; hasTab = false; refreshRoles(); $("tabAudioStatus").textContent = "Candidate engine blocked"; $("tabAudioStatus").className = "pill bad"; say("Chrome would not run two speech sessions at once, so ONLY the microphone is transcribed. Questions are captured; type the candidate answer with the ✎ button, or use the audio file."); } return; }
    if (event.error === "network") netErr = true;
    const msg = `${src === "Mic" ? "Microphone" : "Meeting audio"}: ${event.error || "speech recognition error"}`;
    if (!recognitionErrors.includes(msg)) recognitionErrors.push(msg);
    pill().textContent = "Recognition error"; pill().className = "pill bad";
    say(`${msg}. ${event.error === "network" ? "Speech needs internet (Chrome speech service). Retrying…" : event.error === "not-allowed" || event.error === "service-not-allowed" ? "Allow the microphone (lock icon in the address bar)." : "Check browser permissions."}`);
  };
  let active = false, lastTry = 0;
  // Mic uses the browser's default microphone (most reliable); meeting-tab audio / mixed audio must be given as a track.
  const begin = () => {
    if (!running || rec.__stopping || track.readyState !== "live") return;
    lastTry = Date.now();
    try { if (useTrack) rec.start(track); else rec.start(); }
    catch (e1) {
      if (e1 && e1.name === "InvalidStateError") return; // already started
      try { if (useTrack) rec.start(); else rec.start(track); } catch (e2) { if (!(e2 && e2.name === "InvalidStateError")) recognitionErrors.push(`${src} start failed: ${e2.message || e2}`); }
    }
  };
  rec.__isActive = () => active;
  rec.onaudiostart = () => { active = true; };
  rec.onend = () => {
    active = false;
    clearTimeout(flushTimer); flushTimer = null;
    if (interim) { const t = interim; interim = ""; handleSpeech(src, t); }
    if (running && !rec.__stopping && track.readyState === "live") {
      setTimeout(() => { if (running && !rec.__stopping && track.readyState === "live") begin(); }, netErr ? 2000 : 150);
    }
  };
  // Chrome's continuous recognition silently stalls after a while: restart it every ~50 s while nobody is mid-sentence.
  // supervisor: if the speech engine is not running (failed start, silent stall) start it again, so capture never stays dead
  rec.__wd = setInterval(() => {
    if (!running || rec.__stopping) return;
    if (!active && Date.now() - lastTry > 2500) begin();
    else if (active && !interim && Date.now() - startedAt > 50000) selfAbort();
  }, 2000);
  begin();
  return rec;
}


// Live microphone level + diagnosis, so it is obvious WHY nothing is captured.
function startMeter(track, track2) {
  stopMeter();
  const el = document.getElementById("micLevel"); if (!el || !track) return;
  try {
    lvCtx = new AudioContext(); lvCtx.resume?.(); const an = lvCtx.createAnalyser(); an.fftSize = 512;
    lvCtx.createMediaStreamSource(new MediaStream([track])).connect(an);
    let an2 = null; if (track2) { an2 = lvCtx.createAnalyser(); an2.fftSize = 512; lvCtx.createMediaStreamSource(new MediaStream([track2])).connect(an2); }
    const buf2 = new Uint8Array(512); let loud2 = 0;
    const buf = new Uint8Array(an.fftSize); let loudSince = 0, t1 = Date.now();
    lvTimer = setInterval(() => {
      an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128));
      const lvl = Math.min(100, Math.round(m / 128 * 220)), now = Date.now();
      if (lvl > 12) { if (!loudSince) loudSince = now; micLoudLog.push(now); if (micLoudLog.length > 400) micLoudLog.shift(); } else loudSince = 0;
      const bars = "█".repeat(Math.round(lvl / 10)) + "░".repeat(10 - Math.round(lvl / 10));
      let msg = `Mic level ${bars} ${lvl}%`, bad = false;
      if (now - t1 > 15000 && !lastResultAt && !utts.length && !loudSince) { msg += " - mic is silent: pick the right microphone (lock icon in the address bar) and speak close to it"; bad = true; }
      else if (loudSince && now - loudSince > 6000 && now - lastResultAt > 12000) { msg += " - mic hears sound but the speech engine returned NO text: check internet, language dropdown and that no other tab/app uses the mic"; bad = true; }
      else if (recognitionErrors.length) { msg += " - " + recognitionErrors[recognitionErrors.length - 1]; bad = true; }
      if (an2) { an2.getByteTimeDomainData(buf2); let m2 = 0; for (const v of buf2) m2 = Math.max(m2, Math.abs(v - 128)); const l2 = Math.min(100, Math.round(m2 / 128 * 220)); if (l2 > 4) loud2 = now;
        msg += `   |   Candidate voice (system audio) ${"█".repeat(Math.round(l2 / 10))}${"░".repeat(10 - Math.round(l2 / 10))} ${l2}%`;
        if (now - t1 > 20000 && !loud2) { msg += " - no candidate sound yet: unmute the meeting, raise its volume, and make sure the candidate is speaking"; bad = true; } }
      el.textContent = msg; el.style.color = bad ? "#d63b53" : "";
    }, 300);
  } catch {}
}
function stopMeter() { clearInterval(lvTimer); lvTimer = null; try { lvCtx?.close(); } catch {} lvCtx = null; const el = document.getElementById("micLevel"); if (el) el.textContent = ""; }

// If the two speech sessions keep aborting each other (Chrome allows one at a time on some versions),
// mix microphone + meeting audio into ONE track and run a single recognizer; roles are then decided by wording.
function switchToMixed() {
  try {
    const micTrack = micStream?.getAudioTracks()[0];
    if (!micTrack || !meetingAudioTrack) return;
    stopOne(micRecognition); stopOne(tabRecognition); micRecognition = tabRecognition = null;
    mixedCtx = new AudioContext();
    const dest = mixedCtx.createMediaStreamDestination();
    mixedCtx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
    mixedCtx.createMediaStreamSource(new MediaStream([meetingAudioTrack])).connect(dest);
    hasTab = false; refreshRoles();
    micRecognition = makeRecognizer(dest.stream.getAudioTracks()[0], "Mic", true);
    $("tabAudioStatus").textContent = "Mixed with mic"; $("tabAudioStatus").className = "pill good";
    say("Mic + meeting audio are now mixed into one stream (roles are decided from the wording).");
  } catch (e) { say("Could not mix audio: " + (e.message || e)); }
}

// Safety net: the interview audio is recorded too, so the interviewer can listen to the FULL answer if speech recognition misses words.
let recCtx = null, recorder = null, recChunks = [];
function startRecording() {
  try {
    recCtx = new AudioContext(); recCtx.resume?.(); const dest = recCtx.createMediaStreamDestination();
    const mt = micStream?.getAudioTracks()[0]; if (mt) recCtx.createMediaStreamSource(new MediaStream([mt])).connect(dest);
    if (meetingAudioTrack && meetingAudioTrack.readyState === "live") recCtx.createMediaStreamSource(new MediaStream([meetingAudioTrack])).connect(dest);
    recChunks = []; recorder = new MediaRecorder(dest.stream);
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.start(5000);
  } catch { recorder = null; }
}
function stopRecording() {
  return new Promise((res) => {
    if (!recorder || recorder.state === "inactive") return res(null);
    recorder.onstop = () => { const b = new Blob(recChunks, { type: recorder.mimeType || "audio/webm" }); try { recCtx.close(); } catch {} recorder = null; res(b.size ? b : null); };
    try { recorder.stop(); } catch { res(null); }
  });
}
function stopOne(rec) { if (!rec) return; rec.__stopping = true; clearInterval(rec.__wd); try { rec.stop(); } catch {} }
function stopAudioCapture() {
  stopMeter(); stopDiag(); try { CandidateSTT.stop(); MicSTT.stop(); } catch {}
  stopOne(micRecognition); stopOne(tabRecognition);
  micRecognition = null; tabRecognition = null;
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  micStream = null;
  try { mixedCtx?.close(); } catch {} mixedCtx = null;
}

async function tick() {
  if (running) { try { screenWatch(); } catch {} }
  if (!running || !ready || (busy && Date.now() - busy < 3000)) return;
  const vf = latestVF, now = Date.now();
  const W = vf ? vf.displayWidth : video.videoWidth, H = vf ? vf.displayHeight : video.videoHeight;
  if (!W || !H) return;
  try { layoutWatch(vf || video, W, H); } catch {}
  if (!vf && video.currentTime !== lastVT) { lastVT = video.currentTime; lastVTAt = now; }
  const freshAt = vf ? lastFrameAt : lastVTAt;
  if (freshAt && now - freshAt > 8000 && now - staleWarnAt > 15000) { staleWarnAt = now; $("videoStatus").textContent = "No new video frames for " + Math.round((now - freshAt) / 1000) + "s - is the shared window minimized, hidden, or the candidate camera off?"; }
  // v29: a box the interviewer drew (or an old auto box) is useless once the share layout changed and the face is gone: go back to automatic search
  if (crop && lastFaces !== 1 && layoutLost() && now - lastFaceAt > 4000) { crop = null; autoBox = null; autoAt = 0; autoTry = 0; autoStart = now; say("The meeting layout changed (screen share) and the candidate's face moved. Searching for the face automatically again…"); }
  const auto = !crop && !wholeOk;
  const faceGone = auto && !!autoBox && lastFaces !== 1 && lastFaceAt > 0 && now - lastFaceAt > 1500;
  if (auto && ((!autoBox || now - autoAt > 10000) || faceGone) && now - autoTry > (faceGone ? 2000 : autoBox ? 10000 : 900)) { // (re)find the candidate's face in the full picture
    autoTry = now; busy = now;
    const ls = Math.min(1, 960 / W); work.width = Math.max(2, Math.round(W * ls)); work.height = Math.max(2, Math.round(H * ls));
    work.getContext("2d").drawImage(vf || video, 0, 0, W, H, 0, 0, work.width, work.height);
    const lb = await createImageBitmap(work);
    let tiles = null; if (faceGone || now - autoStart > 2500) { try { tiles = await locateTiles(vf || video, W, H); } catch { tiles = null; } }
    det.contentWindow.postMessage({ __aiProctor: true, type: "locate", bitmap: lb, tiles, ts: performance.now() }, "*", [lb, ...(tiles ? tiles.map((t) => t.bitmap) : [])]);
    return;
  }
  if (auto && !autoBox) { // nothing found yet: wait, but give up after 12 s and use the whole picture
    if (now - autoStart < 12000) return;
    autoBox = { x: 0, y: 0, w: W, h: H, whole: true }; autoAt = now;
    say("Could not find a face automatically, using the whole shared area. If the candidate's camera is off, ask them to turn it on, or draw a box on their tile.");
  }
  busy = now;
  let r = crop || (auto && autoBox) || { x: 0, y: 0, w: W, h: H };
  r = { x: Math.max(0, Math.min(r.x, W - 2)), y: Math.max(0, Math.min(r.y, H - 2)), w: r.w, h: r.h };
  r.w = Math.min(r.w, W - r.x); r.h = Math.min(r.h, H - r.y);
  // small candidate tiles are scaled UP (face model needs a reasonably large face); big ones are scaled down
  const scale = r.w < 640 ? Math.min(5, 640 / r.w) : Math.min(1, 960 / r.w);
  work.width = Math.max(2, Math.round(r.w * scale)); work.height = Math.max(2, Math.round(r.h * scale));
  work.getContext("2d").drawImage(vf || video, r.x, r.y, r.w, r.h, 0, 0, work.width, work.height);
  sentRect = { x: r.x, y: r.y, w: r.w, h: r.h };
  try { idTick(now); } catch (e) { console.warn("idTick", e); }
  const bmp = await createImageBitmap(work);
  const qid = currentItem?.seq || WHOLE_CALL;
  // candidate's turn = after the interviewer finished asking, until the next question
  const answering = !(chal.on && now >= chal.T0 - 1500 && now <= chalEnd() + 1500) && !!currentItem && now >= interviewerUntil && (now < candidateSpeakingUntil || now - lastCandActivity < 12000 || (!currentItem.answer && now - currentItem.startedAt < 25000));
  // wide picture for the PHONE model: 3x wider than the face box, from just above it down to the bottom (hands / lap / desk)
  let pb = null;
  try {
    const pw = Math.min(W, Math.max(r.w * 3, 320)), px = Math.max(0, Math.min(W - pw, r.x + r.w / 2 - pw / 2));
    const py = Math.max(0, r.y - r.h * 0.2), ph = Math.max(8, H - py), ps = Math.min(1, 960 / pw);
    pwork.width = Math.max(2, Math.round(pw * ps)); pwork.height = Math.max(2, Math.round(ph * ps));
    pwork.getContext("2d").drawImage(vf || video, px, py, pw, ph, 0, 0, pwork.width, pwork.height);
    pb = await createImageBitmap(pwork);
  } catch { pb = null; }
  det.contentWindow.postMessage({ __aiProctor: true, type: "frame", bitmap: bmp, pbitmap: pb, ts: performance.now(), q: qid, answering, unavail: layoutLost(), listening: !currentItem || now < interviewerUntil }, "*", pb ? [bmp, pb] : [bmp]);
}

$("start").onclick = async () => {
  if (!ready) return say("Webcam models are still loading. Wait until the model status says Loaded.");
  if (!stream?.active) return say("Click 'Share' first and pick the Teams window / tab / screen.");
  if (!$("consentConfirmed")?.checked) return say("Please confirm that the candidate has been informed and has agreed to camera/audio analysis before starting.");
  if (running) return;
  autoBox = null; autoTry = 0; autoAt = 0; autoStart = Date.now();
  hasTab = !!meetingAudioTrack && meetingAudioTrack.readyState === "live";
  if (!hasTab && !confirm("NO MEETING AUDIO is shared.\n\nThe candidate's voice (coming from your speakers / Teams / Zoom) will NOT be captured, so every candidate answer will be empty.\n\nClick Cancel, then click button '1b. Share SYSTEM AUDIO', choose 'Entire screen' and tick 'Also share system audio'.\n\nClick OK only if the candidate is sitting next to you and speaking into this microphone.")) return say("Cancelled. Click '1b. Share SYSTEM AUDIO' (Entire screen + 'Also share system audio'), then press Start.");
  if (window.CandidateSTT && !CandidateSTT.ready && !CandidateSTT.failed) return say("The speech model is still loading (see 'Speech model' status). Wait until it says READY, then press Start. Until then nothing can be written down.");
  abortHits = 0; heard = { Mic: 0, Tab: 0 }; interviewerUntil = 0; lastCandActivity = 0;
  resetSession(); resetV27();
  counts = {}; timeline = []; last = {}; analysed = 0; lastTick = 0; t0 = Date.now();
  $("log").innerHTML = ""; $("counts").innerHTML = ""; renderQA(); renderTranscript(); refreshRoles();
  try { navigator.wakeLock?.request("screen").then((w) => { wakeLock = w; }).catch(() => {}); } catch {}
  det.contentWindow.postMessage({ __aiProctor: true, type: "recalibrate" }, "*");
  // 1) VIDEO DETECTION STARTS FIRST - it never depends on audio / speech permissions.
  running = true;
  $("start").disabled = true; $("end").disabled = false;
  worker = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(1),250)"])));
  worker.onmessage = tick;
  try { idBegin(); } catch (e) { console.warn("idBegin", e); } // v47: snapshot now + automatic ID check
  clearInterval(voiceTimer); voiceTimer = setInterval(voiceTick, 1000);
  if ($("pickScreen")) $("pickScreen").disabled = false;
  if ($("clearScreen")) $("clearScreen").disabled = false;
  if ($("gazecal")) $("gazecal").disabled = false;
  if ($("gazecal2")) $("gazecal2").disabled = false;
  if ($("chalbtn")) $("chalbtn").disabled = false;
  say(crop ? "Detection started on your selected box." : wholeOk ? "Detection started on the WHOLE shared area." : "Started. Finding the candidate's face automatically… (is the candidate's camera ON and visible in the shared window?)");
  // 2) AI notetaker (speech). If it fails, detection keeps running.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $("micStatus").textContent = "Speech not supported"; $("micStatus").className = "pill bad"; return say("Detection is running, but this browser has no speech recognition. Use Chrome / Edge for the AI notes."); }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: hasTab, noiseSuppression: true, autoGainControl: true } });
    micRecognition = makeRecognizer(micStream.getAudioTracks()[0], "Mic");
    startRecording(); startMicSTT(); startDiag(); lastResultAt = 0; startMeter(micStream.getAudioTracks()[0], hasTab ? meetingAudioTrack : null);
  } catch (e) {
    $("micStatus").textContent = "Mic blocked"; $("micStatus").className = "pill bad";
    return say("Detection is running, but microphone / speech failed: " + (e.message || e) + ". Allow the microphone (lock icon in address bar) and press Share again.");
  }
  if (hasTab && !startCandidateSTT()) { hasTab = false; refreshRoles(); say("Candidate voice engine could not start. Continuing with the microphone only."); }
  say(hasTab ? "Running: detection + notes (microphone = you / interviewer, system audio = candidate)." : "Running: detection + notes in MIC-ONLY mode (speakers ON so the mic hears the candidate).");
};

const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// ONE place to tune the risk levels (points are 0-100 per answer):  LOW < medium <= MEDIUM < high <= HIGH
// v38: the risk model lives in riskModel.js (tested, tuned in one place)
const { RISK, riskOf, analyseQ } = window.RiskModel;

// v38.1: speechFlow(seq) - how the candidate's answer to question `seq` SOUNDED (fluent / hesitant). It was lost in the v38 refactor, which made
// every PDF build crash with "speechFlow is not defined". It can never throw: any problem returns a neutral default so the PDF is always built.
const FLOW_DEFAULT = () => ({ words: 0, hes: 0, fluent: 0.5, pauseRatio: null, maxPauseMs: 0, thinkMs: 0, typing: 0, voice2: 0, bookish: 0, f0sd: null, aiText: null, phoneEv: 0, phoneEvAt: [] });
const BOOKISH = /\b(furthermore|moreover|additionally|consequently|utili[sz]e[sd]?|utili[sz]ation|comprehensive|facilitat\w*|robust|versatile|leverag\w*|paradigm|encapsulat\w*|polymorphi\w*|abstraction|primarily|predominantly|extensively|seamless\w*|scalab\w*|interoperab\w*|dynamically[- ]typed|general[- ]purpose|high[- ]level)\b/gi;
const HESITATE = /\b(um+|uh+|er+|erm|hmm+|let me think|you know|i mean|sorry|can you repeat|repeat the question|i don'?t know)\b/gi;
function speechFlow(seq) { // v51: seq can also be an ARRAY (a question that was merged from several speech pieces)
  try {
    const WPS = 0.38; // seconds one spoken word takes
    const SEQS = [].concat(seq);
    const cand = utts.filter((u) => SEQS.includes(u.q) && u.role === "Candidate" && !u.forced).sort((a, b) => a.at - b.at);
    if (!cand.length) return FLOW_DEFAULT();
    const nW = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).length;
    const text = cand.map((u) => u.text).join(" "), words = nW(text);
    if (!words) return FLOW_DEFAULT();
    const endOf = (u) => (u.endAt && u.endAt > u.at ? u.endAt : u.at + nW(u.text) * WPS * 1000);
    const ansStart = cand[0].at, ansEnd = Math.max(...cand.map(endOf));
    // hesitations: fillers + immediate word repeats ("I said, I said")
    let hes = (text.match(HESITATE) || []).length;
    const toks = text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 1; i < toks.length; i++) if (toks[i].length > 1 && toks[i] === toks[i - 1]) hes++;
    // pauses between the pieces of the answer
    let pauseMs = 0, maxPauseMs = 0;
    for (let i = 1; i < cand.length; i++) { const gap = cand[i].at - endOf(cand[i - 1]); if (gap > 1200) { pauseMs += gap; maxPauseMs = Math.max(maxPauseMs, gap); } }
    const spanS = Math.max(1, (ansEnd - ansStart) / 1000);
    const pauseRatio = Math.max(0, Math.min(0.9, pauseMs / 1000 / spanS));
    const wps = words / Math.max(1, spanS - pauseMs / 1000);
    let fluent = 0.55 * (1 - pauseRatio / 0.6) + 0.45 * Math.min(1, wps / 2.2) - 0.08 * Math.min(hes, 5);
    if (words < 6) fluent = Math.min(fluent, 0.45);
    fluent = Math.max(0, Math.min(1, fluent));
    // silence between the end of the question and the start of the answer
    const iv = utts.filter((u) => SEQS.includes(u.q) && u.role === "Interviewer" && !u.forced && u.at <= ansStart).sort((a, b) => a.at - b.at);
    const qEnd = iv.length ? Math.max(...iv.map(endOf)) : 0;
    const thinkMs = qEnd && ansStart > qEnd ? ansStart - qEnd : 0;
    // keyboard clicks / a second voice while the answer ran
    const w0 = (qEnd || ansStart) - 500, w1 = ansEnd + 1500;
    const typing = typingBursts.filter((t) => t >= w0 && t <= w1).length;
    const voice2 = timeline.filter((e) => e.type === "second_voice" && t0 + e.s * 1000 >= w0 && t0 + e.s * 1000 <= w1).length;
    // v51: "looking at a phone-like object" events logged by the camera while this answer ran (the per-answer gaze numbers missed brief phone sightings)
    const inWin = (e) => t0 + e.s * 1000 >= ansStart - 1000 && t0 + e.s * 1000 <= ansEnd + 1500;
    let phEvs = timeline.filter((e) => e.type === "phone_use" && inWin(e));
    if (!phEvs.length) phEvs = timeline.filter((e) => e.type === "phone_detected" && inWin(e));
    const phoneEv = phEvs.length, phoneEvAt = phEvs.map((e) => fmt(e.s));
    const bookish = (text.match(BOOKISH) || []).length;
    // flat pitch: spread of the voiced pitch while the candidate spoke
    const f0s = candChunks.filter((c) => c.f0 > 60 && c.f0 < 400 && c.t >= ansStart - 500 && c.t <= ansEnd + 500).map((c) => Math.log(c.f0));
    let f0sd = null;
    if (f0s.length >= 20) { const m = f0s.reduce((a, b) => a + b, 0) / f0s.length; f0sd = Math.sqrt(f0s.reduce((a, b) => a + (b - m) * (b - m), 0) / f0s.length); }
    const aiText = window.AiAnswer ? AiAnswer.analyse(text, { words, hes, fluent, thinkMs, f0sd }) : null; // v50: ChatGPT-style wording
    return { words, hes, fluent, pauseRatio, maxPauseMs, thinkMs, typing, voice2, bookish, f0sd, aiText, phoneEv, phoneEvAt, ansStartS: Math.round((ansStart - t0) / 1000) };
  } catch (e) { console.warn("speechFlow", e); return FLOW_DEFAULT(); }
}
const fmtDT = (d) => { const p = (n) => String(n).padStart(2, "0"); const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return `${p(d.getDate())} ${M[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`; };
const MON_LABEL = { looking_away: "Looking away from the screen", face_not_found: "Face not visible", looking_down: "Looking down (eyes or head, phone / notes?)", eyes_closed: "Eyes closed for a long time", multiple_faces: "More than one face in the frame", phone_detected: "Phone-like object seen", phone_use: "Looked at a phone-like object (phone seen, then looked down / away)", voice_mismatch: "Sound on the candidate's audio while the lips were not moving", screen_change: "Selected shared-screen region changed (review snapshot; may be normal content)", tracking_lost: "Candidate video hidden by the screen-share layout (tracking unavailable, NOT counted against the candidate)", challenge_fail: "Random-number challenge failed (not looking at / not saying the numbers)", challenge_review: "Random-number challenge: partly failed, review", second_voice: "A different voice was heard on the candidate audio (someone prompting / a recording?)", typing_sound: "Keyboard-like clicks heard on the candidate audio while a question / answer was running (searching / chatting?)", phone_beside_laptop: "Repeated looks to the SAME side while answering (phone / notes beside the laptop?), stronger when a phone was also seen", second_monitor: "Repeated looks in the same direction outside the screen across several answers (second monitor?)", reading_pattern: "Eye movement + speech together look like reading rather than thinking (needs 2+ independent clues)" };
const shortLabel = (l) => l.replace(" follow-up", "+");
function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }

// v38: the report must ALWAYS reach the interviewer. (1) a failed attempt can be repeated (End used to do nothing the 2nd time because running was already false),
// (2) if the PDF cannot be built, the complete Q&A + conversation is saved as an .html file instead, (3) download buttons stay on the page after the report.
let reportFailed = false;
function showDownloadButtons(files) { // files: [{ label, blob|doc, name }]  - a click is a user gesture, so the browser can never block it
  let box = document.getElementById("dlBox");
  if (!box) { box = document.createElement("div"); box.id = "dlBox"; box.style.cssText = "margin:10px 0;display:flex;gap:8px;flex-wrap:wrap"; $("status").insertAdjacentElement("afterend", box); }
  box.innerHTML = "";
  for (const f of files) {
    const b = document.createElement("button"); b.textContent = "Download " + f.label; b.style.cssText = "padding:8px 14px;border-radius:8px;border:1px solid #6d3fe0;background:#6d3fe0;color:#fff;cursor:pointer;font-weight:600";
    b.onclick = () => { try { f.doc ? f.doc.save(f.name) : download(f.blob, f.name); } catch (e) { say("Download failed: " + (e.message || e)); } };
    box.appendChild(b);
  }
}
function emergencyTextReport(why) { // no scoring, no PDF: just everything that was captured
  const E = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const qa = parser.qa.map((i) => `<h2>${E(i.label)}</h2><div><b>Question:</b> ${E(i.question)}${i.qNote ? ` <i>[${E(i.qNote)}]</i>` : ""}</div><div><b>Answer:</b> ${E(i.answer || "(no answer captured)")}</div>`).join("");
  const tr = utts.filter((u) => !u.echo).map((u) => `<div>[${E(u.clock)}] <b>${E(u.role)}:</b> ${E(u.text)}</div>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>Interview text report</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}h2{border-bottom:1px solid #ddd;margin-top:24px}</style><h1>Interview text report</h1><p>The full PDF could not be built (${E(why)}). Everything that was captured is below.</p>${qa}<h2>Full conversation</h2>${tr}`;
  return new Blob([html], { type: "text/html;charset=utf-8" });
}
async function finish() {
  try { await finishInner(); }
  catch (e) {
    console.error(e); reportFailed = true; $("end").disabled = false;
    say("The PDF report could not be finished (" + (e.message || e) + "). Click 'End & generate report' again to retry.");
  }
}
async function finishInner() {
  if (!running && !reportFailed) return;
  reportFailed = false;
  running = false; clearInterval(voiceTimer); voiceTimer = null;
  screenBox = null; pickMode = "face"; scr.prev = null; scr.ref = null; scr.changes = 0; setPill("screenStatus", "Off", "");
  if ($("pickScreen")) $("pickScreen").disabled = true;
  if ($("clearScreen")) { $("clearScreen").disabled = true; $("clearScreen").style.display = "none"; }
  if ($("gazecal")) $("gazecal").disabled = true; if ($("gazecal2")) $("gazecal2").disabled = true; if ($("chalbtn")) $("chalbtn").disabled = true; if (chal.on && !chal.evalSent) chalCancel(); clearInterval(selfCal.timer); selfCal.on = false; try { calAbort("Interview ended."); } catch {}
  worker?.terminate(); worker = null;
  try { wakeLock?.release(); } catch {} wakeLock = null;
  stopOne(micRecognition); stopOne(tabRecognition);
  { const w1 = Date.now(); while (Date.now() - w1 < 3500 && [micRecognition, tabRecognition].some((r) => r && r.__isActive && r.__isActive())) await new Promise((r) => setTimeout(r, 200)); } // v44: let Chrome deliver the LAST words (final result / onend) before the report is built
  $("end").disabled = true; $("start").disabled = true;
  if (window.CandidateSTT?.active || window.MicSTT?.active) { // let Whisper finish the last spoken pieces (max 30 s, can be skipped)
    CandidateSTT.flush(); MicSTT.flush();
    let skip = false; const endBtn = $("end"); endBtn.disabled = false; endBtn.textContent = "End now (skip waiting)"; endBtn.onclick = () => { skip = true; };
    const w0 = Date.now();
    while (CandidateSTT.pending && !CandidateSTT.failed && !skip && Date.now() - w0 < 30000) {
      say(`Interview stopped. Writing down the last answers: ${CandidateSTT.pending} speech piece(s) left (${Math.max(0, 30 - Math.round((Date.now() - w0) / 1000))}s). Click "End now" to skip.`);
      await new Promise((r) => setTimeout(r, 500));
    }
    endBtn.disabled = true; endBtn.textContent = "End & generate report"; endBtn.onclick = finish;
    CandidateSTT.stop(); MicSTT.stop();
  }
  say("Analysing every question and building the PDF report…");
  const raw = await new Promise((resolve) => {
    snapRes = resolve;
    det.contentWindow.postMessage({ __aiProctor: true, type: "snapshotAll" }, "*");
    setTimeout(() => { if (snapRes) { const r = snapRes; snapRes = null; r([]); } }, 1800);
  });
  reparse(); // v44: every line is placed again now that ALL the speech (also the late Whisper text) is in
  parser.recover(); // v44: nothing the candidate said may be lost
  parser.finalize(); // v46: questions cleaned (no candidate words / garble), repeated questions skipped, every answer under its own question
  applyEdits();
  const items = parser.qa.slice();
  const lvKey = window.CandidateLevel ? CandidateLevel.norm($("clevel")?.value) : "intermediate"; // v47: Junior / Intermediate / Senior
  const identity = idFinalize(); // v47: candidate snapshot + ID snapshot + status
  let rows = items.map((item) => ({ item, score: Analysis.scoreAnswer(item) }));
  let scoringNote = "Scores are an offline estimate (keyword relevance, structure, technical vocabulary, fluency). Accuracy and Technical knowledge are approximations; add an AI key on the start page for semantic scoring. Webcam indicators are not proof of misconduct.";
  const key = ($("apiKey")?.value || "").trim();
  if (items.some((i) => i.answer.trim())) {
    try {
      say("Scoring answers with the AI model…");
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
      const ai = await Analysis.llmAnalyse(items.filter((i) => i.answer.trim()), { apiKey: key, proxyUrl: "/.netlify/functions/evaluate", model: ($("apiModel").value || "claude-haiku-5-5").trim(), role: $("crole").value, signal: ctl.signal, levelNote: window.CandidateLevel ? CandidateLevel.promptNote(lvKey) : "" });
      clearTimeout(to);
      rows = rows.map((r) => (ai[r.item.seq] ? { ...r, score: { ...r.score, ...ai[r.item.seq] } } : r));
      scoringNote = "Answers were scored by an AI model from the speech transcript (relevance, accuracy, technical knowledge, completeness, communication). Speech recognition errors can lower scores. Webcam indicators are not proof of misconduct.";
    } catch (e) {
      const m = String(e.message || e);
      scoringNote = (/HTTP 501|HTTP 404/.test(m) ? "AI CORRECTNESS CHECK IS OFF: no AI key is configured (set ANTHROPIC_API_KEY in Netlify, or type a key on the start page), so these scores are only an offline estimate and do NOT verify whether answers are factually correct. "
        : "AI scoring failed (" + m.slice(0, 120) + "), so the offline estimate was used. ") + scoringNote;
    }
  }
  // v47: level-based marks (Intermediate = the old weighting, Junior = basics, Senior = depth). Skill scores stay on one common scale.
  if (window.CandidateLevel) { rows = CandidateLevel.applyToRows(rows, lvKey); scoringNote += ` Marks per question are for the selected level (${CandidateLevel.get(lvKey).name}).`; }
  const summary = Analysis.buildSummary(rows);
  const levelEval = window.CandidateLevel ? CandidateLevel.evaluate(rows, lvKey, summary.overall) : null;

  // v51: ONE row per question. The camera keeps a separate gaze window for every speech piece the parser started; when pieces were merged into one
  // question (a repeated / garbled question), the report used to show the same label twice ("Q2", "Q2") or a bare "Q". Windows of the same question are added up.
  const ownerOf = (seq) => items.find((i) => i.seq === seq) || items.find((i) => (i.mergedSeqs || []).includes(seq)) || null;
  const firstSeq = items.length ? Math.min(...items.map((i) => i.seq)) : Infinity;
  const SUMK = ["answer_ms", "lost_ms", "tracked_ms", "on_screen_ms", "side_ms", "down_ms", "left_ms", "right_ms", "up_ms", "phone_ms", "glances", "sweeps", "sweeps_single", "sideL", "sideR", "sideDown", "downGl", "longOff", "msweeps"];
  const gGroups = new Map();
  for (const r of (raw || []).filter((x) => x.question !== WHOLE_CALL)) {
    const o = ownerOf(r.question), key = o ? "q" + o.seq : "x" + r.question, g = gGroups.get(key);
    if (!g) gGroups.set(key, { ...r, question: o ? o.seq : r.question, seqs: [r.question], unassigned: !o });
    else { SUMK.forEach((k) => { g[k] = (g[k] || 0) + (r[k] || 0); }); g.maxOffMs = Math.max(g.maxOffMs || 0, r.maxOffMs || 0); g.mapped = g.mapped || r.mapped; g.seqs.push(r.question); }
  }
  const flowSeqs = (g) => g.unassigned ? g.seqs : [...new Set([g.question, ...((ownerOf(g.question) || {}).mergedSeqs || []), ...g.seqs])];
  const gazeRows = [...gGroups.values()].sort((a, b) => a.question - b.question).map((r) => { const fl = speechFlow(flowSeqs(r)); return { ...r, fl, a: analyseQ(r, fl) }; });
  const usable = gazeRows.filter((r) => r.a.assessed), sum = (k) => usable.reduce((s, r) => s + (r[k] || 0), 0);
  const ansMs = sum("answer_ms");
  const labelOf = (seq) => { const o = ownerOf(seq); return o ? shortLabel(o.label) : seq < firstSeq ? "Intro" : "Extra"; }; // v46: a repeated / merged question keeps its owner's label; v51: speech outside any question = "Intro" / "Extra", never a bare "Q"
  const high = usable.filter((r) => r.a.risk === "HIGH").length, flaggedRows = usable.filter((r) => r.a.risk !== "LOW");
  const secondScreen = usable.length ? Math.round(usable.reduce((s, r) => s + r.a.points, 0) / usable.length) : null;
  // ---- v32: pattern analysis (phone beside laptop / second monitor / thinking vs reading)
  const insRows = gazeRows.map((g) => ({ seq: g.question, label: labelOf(g.question), startS: Math.max(0, g.fl.ansStartS || 0), r: g, fl: g.fl }));
  const ins = Insights.analyse(insRows, { calibrated: !!cal.fit, calQuality: cal.fit?.quality || null, share: $("shareKind")?.value || "unknown", screenChanges: counts.screen_change || 0 });
  ins.events.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; timeline.push({ s: e.s, type: e.type, detail: e.detail }); });
  // v50: ChatGPT / AI-style answers: one event per flagged answer (so it shows on the timeline, in the monitoring summary and in the review status)
  const aiFlagRows = insRows.filter((x) => x.fl.aiText && x.fl.aiText.level !== "LOW");
  aiFlagRows.forEach((x) => { counts.ai_answer_text = (counts.ai_answer_text || 0) + 1; timeline.push({ s: x.startS, type: "ai_answer_text", detail: `${x.label}: ${x.fl.aiText.level} - ${x.fl.aiText.notes.join("; ")}. (An indicator only: the candidate may have read it from ChatGPT / a website, or simply learned it by heart.)` }); });
  const styleJumps = window.AiAnswer ? AiAnswer.styleJump(insRows.map((x) => ({ label: x.label, words: x.fl.words, hes: x.fl.hes, fluent: x.fl.fluent, ai: x.fl.aiText }))) : [];
  styleJumps.forEach((j) => { const row = insRows.find((x) => x.label === j.label); counts.ai_style_jump = (counts.ai_style_jump || 0) + 1; timeline.push({ s: row ? row.startS : 0, type: "ai_style_jump", detail: j.why + ". Possible prepared / AI text." }); });
  timeline.sort((a, b) => a.s - b.s);
  // v51: per-answer "is the candidate reading an AI answer?" table. ONE verdict per question that combines the wording (aiAnswer.js) with the
  // eye / voice / phone observations (riskModel.js), so this section and the eye-movement table can never disagree. The full observation is shown.
  // every question gets a row, also one without usable video (then only the wording can be judged)
  const aiBase = [...insRows.filter((x) => x.label === "Intro"), ...items.map((i) => insRows.find((x) => x.seq === i.seq) || { seq: i.seq, label: shortLabel(i.label), r: { a: {} }, fl: speechFlow([i.seq, ...(i.mergedSeqs || [])]) }), ...insRows.filter((x) => x.label === "Extra")];
  const aiCombined = aiBase.map((x) => {
    const a = x.fl.aiText, ra = x.r.a || {}, assessed = !!ra.assessed, wl = a ? a.level : "LOW";
    const short = !a || a.words < 20;
    const level = assessed ? ra.risk : (wl === "HIGH" ? "MEDIUM" : wl); // without video the wording alone is never HIGH
    const pts = assessed ? ra.points : a ? Math.min(a.points, 54) : 0;
    const tp = a ? (a.strong ? a.points : Math.min(a.points, 24)) : 0; // the part of the answer score that came from the wording
    const eyeClue = assessed && (ra.mobileClue || ra.agree || ra.external || (ra.reading && ra.points - tp >= 30));
    const wordClue = !!a && wl !== "LOW";
    let verdict;
    if (level === "HIGH") verdict = wordClue && (eyeClue || ra.agree || ra.phoneEv) ? "LIKELY READING AN AI ANSWER (wording + eyes)" : wordClue ? "LIKELY READ FROM AI / WRITTEN TEXT" : "LIKELY READING (phone / notes): review";
    else if (level === "MEDIUM") verdict = wordClue ? (eyeClue ? "POSSIBLE AI TEXT (wording + eyes): review" : "POSSIBLE AI / PREPARED TEXT: review") : "POSSIBLE READING (eyes / phone): review";
    else verdict = short && !assessed ? "Too short to judge" : a && a.recalled ? "Natural speech (textbook words, recalled)" : short ? "Natural speech (short answer)" : "Natural speech";
    const wording = short ? (a ? `Only ${a.words} word(s): too short to judge the wording.` : "No answer speech captured.") : AiAnswer.structureLine(a) + " " + (a.stock.length || a.textbook.length ? "Evidence: " + a.notes.join("; ") + "." : "No stock AI / textbook phrases.");
    const obs = assessed ? ra.obs : (ra.obs || "No usable video for this answer.");
    const why = [wordClue ? `wording ${wl}` : "", (ra.agree ? "eyes + wording agree" : ""), ra.phoneEv ? `${ra.phoneEv} phone-use event(s)` : "", ra.mobileClue ? "long fluent look-down" : ""].filter(Boolean).join(", ");
    return { label: x.label, level, pts, verdict, wording, obs, why, assessed };
  });
  const aiRows = window.AiAnswer ? aiCombined.map((c) => [c.label, c.verdict, c.wording, c.obs, c.level === "LOW" && !c.assessed && /Too short/.test(c.verdict) ? "-" : `${c.level} ${c.pts}/100`]) : [];
  const aiFlagLines = aiCombined.filter((c) => c.level !== "LOW").map((c) => `${c.label}: ${c.level} (${c.pts}/100)${c.why ? " - " + c.why : ""}. Ask a follow-up on ${c.label} ("give an example from your own project").`);
  const sessionRiskRes = window.RiskModel.sessionRisk(usable.map((r) => r.a));
  const eye = {
    gazePct: ansMs ? Math.round(sum("on_screen_ms") / ansMs * 100) : null, glances: gazeRows.reduce((s, r) => s + (r.glances || 0), 0),
    reading: usable.filter((r) => r.a.reading).length, assessed: usable.length, secondScreen,
    secondLabel: secondScreen == null ? "Not measured" : secondScreen >= 50 ? "High" : secondScreen >= 30 ? "Medium" : "Low",
    aiScore: usable.length ? Math.max(...usable.map((r) => r.a.points)) : null,
    aiRisk: sessionRiskRes.risk, sessionWhy: sessionRiskRes.why, flagged: flaggedRows.map((r) => labelOf(r.question))
  };
  const eyeRows = gazeRows.map((r) => [labelOf(r.question), r.a.assessed ? r.a.gaze + "%" : "-", String(r.glances || 0), r.a.assessed ? (r.a.reading ? "Yes" : "No") : "-", r.a.obs, r.a.assessed ? r.a.risk + " " + r.a.points + "/100" : "-"]);
  MON_LABEL.id_not_shown = "No ID proof was shown to the camera at the start"; MON_LABEL.ai_answer_text = "Answer worded like ChatGPT / an AI (answers)"; MON_LABEL.ai_style_jump = "Answer much more polished than the candidate's other answers";
  const order = ["ai_answer_text", "ai_style_jump", "id_not_shown", "face_not_found", "eyes_closed", "multiple_faces", "phone_detected", "phone_use", "voice_mismatch", "screen_change", "tracking_lost", "challenge_fail", "challenge_review", "second_voice", "typing_sound", "phone_beside_laptop", "second_monitor", "reading_pattern"];
  const monitoring = order.filter((k) => counts[k]).map((k) => `${MON_LABEL[k]}: ${counts[k]} time(s)`);
  if (counts.tracking_lost) monitoring.push(`NOTE: the candidate's video was hidden by the screen-share layout ${counts.tracking_lost} time(s). That time was NOT scored as looking away or reading. Tip: in Zoom use View > Side-by-side mode (or Gallery view) while a screen is shared, so the face stays big.`);
  monitoring.push(`Pattern analysis: phone / notes beside the laptop - ${ins.phoneBeside.answers ? `same-side looks (${ins.phoneBeside.side}) in ${ins.phoneBeside.answers} of ${ins.phoneBeside.ofAnswers} answers` : "no repeated same-side pattern"}; second monitor - ${ins.secondMonitor.insufficient ? "not enough tracked answers to judge" : ins.secondMonitor.level + (ins.secondMonitor.direction ? " (" + ins.secondMonitor.direction + ")" : "")}; thinking vs reading - ${ins.thinkingReading.THINKING} thinking, ${ins.thinkingReading.MIXED} mixed, ${ins.thinkingReading.READING} reading-like, ${ins.thinkingReading.INSUFFICIENT} not assessable. Screen share: ${ins.shareText}.`);
  chalRuns.forEach((c, i) => monitoring.push(`Random-number challenge ${i + 1} (${c.clock}): ${c.level}. ${c.text} (${c.why.join('; ')}).`));
  monitoring.push(vg ? `Voice check: ${vg.log.length} voice window(s) of about 1.5 s analysed; ${vg.clusters} distinct voice(s) heard (${hasTab ? "1 expected on the candidate audio" : "2 expected in microphone-only mode: interviewer + candidate"}); another voice reported ${counts.second_voice || 0} time(s). A different voice is reported when it is heard on its own; two people talking at exactly the same moment cannot be separated reliably.` : "Voice check did not run.");
  monitoring.push(hasTab ? `Typing sounds: keyboard-like clicks on the candidate's audio during a question / answer ${counts.typing_sound || 0} time(s) (${typingBursts.length} burst(s) in total). Zoom / Meet noise suppression can hide typing, so no clicks does not prove no typing.` : "Typing-sound check did NOT run (needs the candidate's own audio, button 1b).");
  { // v50: the interviewer's question was not heard clearly: an audio / network / microphone problem on the interviewer's side, never counted against the candidate
    const nQInf = items.filter((i) => /inferred|corrected/i.test(i.qNote || "")).length, nQBad = items.filter((i) => i.uncaptured || /^\(Question (not captured|heard unclearly)/.test(i.question || "")).length;
    if (nQInf + nQBad) monitoring.push(`Interviewer's question not captured clearly in ${nQInf + nQBad} question(s): probably an audio / network / microphone problem on the interviewer's side (NOT the candidate). ${nQInf} question(s) were worked out from the candidate's answer and are marked "inferred"; ${nQBad} could not be recovered.`);
  }
  monitoring.push(identity.enabled ? `Identity check (automatic): ${identity.status === "captured" ? "candidate snapshot and ID snapshot captured (see the Identity verification section)" : identity.status === "not_shown" ? "NO ID was shown: " + identity.reason : "ID not captured: " + identity.reason}${identity.idType ? " Candidate said the ID is: " + identity.idType + "." : ""}` : "Identity check: switched off.");
  monitoring.push(window.CandidateSTT && hasTab ? `Voice check ran on the candidate's audio: lip-sync compared on ${lipChecked} audio moments.` : "Voice check did NOT run (no separate candidate audio was shared; use button 1b).");

  const nMain = parser.mainCount, nFollow = items.length - items.filter((i) => !i.follow).length;
  const micOnly = !hasTab && !mixedCtx;
  const speakerNotes = [
    micOnly ? "Only the microphone was used (no separate meeting audio); every sentence was classified as Interviewer (asks) or Candidate (answers) from its wording." : singleStream ? "Both voices arrived on the meeting tab; each sentence was classified as Interviewer (asks) or Candidate (answers) from its wording." : `Interviewer = ${roleMap.Mic === "Interviewer" ? "this computer's microphone" : "meeting-tab audio"}; Candidate = ${roleMap.Mic === "Candidate" ? "this computer's microphone" : "meeting-tab audio"}.`,
    "How roles were decided: " + roleWhy + ".",
    `Questions were detected automatically from interviewer speech (no Next Question button): ${nMain} main question(s) and ${nFollow} follow-up(s).`
  ];
  if (recognitionErrors.length) speakerNotes.push("Speech recognition notices: " + recognitionErrors.join("; "));

  const dur = Math.round((Date.now() - t0) / 1000);
  // ---- final review status (combines every signal; a pointer for the interviewer, never proof)
  const nPhone = (counts.phone_detected || 0) + (counts.phone_use || 0), nMulti = counts.multiple_faces || 0;
  const reasons = [];
  if (high) reasons.push(`${high} answer(s) rated HIGH reading risk`);
  sessionRiskRes.why.forEach((w) => reasons.push(w));
  if (counts.phone_use) reasons.push(`phone use suspected ${counts.phone_use} time(s)`);
  else if (counts.phone_detected) reasons.push(`phone-like object seen ${counts.phone_detected} time(s)`);
  if (nMulti) reasons.push(`more than one face in frame ${nMulti} time(s)`);
  if (usable.some((r) => r.a.reading)) reasons.push(`reading pattern in ${usable.filter((r) => r.a.reading).length} answer(s)`);
  if (ins.events.some((e) => e.type === "phone_beside_laptop")) reasons.push(`phone / notes beside the laptop pattern: looked ${ins.phoneBeside.side} in ${ins.phoneBeside.answers} answer(s)`);
  if (ins.secondMonitor.level === "REVIEW" || ins.secondMonitor.level === "STRONG") reasons.push(`second-monitor pattern: repeated looks ${ins.secondMonitor.direction} in ${ins.secondMonitor.answers} of ${ins.secondMonitor.ofAnswers} answers`);
  if (ins.thinkingReading.READING) reasons.push(`reading-like (not thinking) pattern in ${ins.thinkingReading.READING} answer(s)`);
  const fusionSegs = Fz.finish(Date.now()), nPrio = fusionSegs.filter((s) => s.level === "PRIORITY").length;
  if (nPrio) reasons.push(`${nPrio} priority fusion alert(s): several signals agreed at the same time`);
  if (identity.status === "not_shown") reasons.push("no ID proof was shown to the camera at the start");
  const nVoice = counts.voice_mismatch || 0, nScr = counts.screen_change || 0;
  if (nVoice) reasons.push(`sound without lip movement ${nVoice} time(s)`);
  if (nScr) reasons.push(`candidate screen changed ${nScr} time(s)`);
  const nV2 = counts.second_voice || 0, nTyp = counts.typing_sound || 0, sideRows = usable.filter((r) => Math.max(r.sideL || 0, r.sideR || 0) >= 3).length;
  if (nV2) reasons.push(`another voice heard ${nV2} time(s)`);
  if (nTyp) reasons.push(`keyboard sounds during answers ${nTyp} time(s)`);
  const nAiT = counts.ai_answer_text || 0, nAiJ = counts.ai_style_jump || 0;
  if (nAiT) reasons.push(`ChatGPT / AI-style wording in ${nAiT} answer(s)`);
  if (nAiJ) reasons.push(`a suddenly polished answer after hesitant ones (${nAiJ})`);
  if (sideRows) reasons.push(`repeated looks to the same side in ${sideRows} answer(s) (phone beside the screen, or just thinking: review only)`);
  const nChalFail = chalRuns.filter((c) => c.level === "FAIL").length, nChalRev = chalRuns.filter((c) => c.level === "REVIEW").length;
  if (nChalFail) reasons.push(`random-number challenge failed ${nChalFail} time(s)`); else if (nChalRev) reasons.push(`random-number challenge needs review (${nChalRev})`);
  const strongFlag = nAiT >= 2 || nChalFail > 0 || nV2 > 1 || (sideRows > 1 && nPhone > 0) || high > 0 || !!counts.phone_use || nMulti > 0 || nPhone > 1 || nVoice > 1 || nScr >= 3 || nPrio > 0 || ins.perAnswer.some((x) => x.p.level === "STRONG") || ins.secondMonitor.level === "STRONG";
  // A missing face is a tracking-quality problem, not a candidate-integrity signal.
  const weakFlag = nAiT > 0 || nAiJ > 0 || identity.status === "not_shown" || nChalRev > 0 || nV2 > 0 || nTyp > 1 || sideRows > 0 || flaggedRows.length > 0 || nPhone > 0 || nVoice > 0 || nScr > 0 || fusionSegs.length > 0 || ins.events.length > 0;
  const singleFaceRatio = qualityN ? Math.max(0, (qualityN - qualityBad) / qualityN) : 0;
  const finalStatus = window.ReviewPolicy?.determineReviewStatus
    ? ReviewPolicy.determineReviewStatus({ strongFlag, weakFlag, usableAnswers: usable.length, analysedFrames: qualityN, singleFaceRatio })
    : (strongFlag ? { level: "REVIEW", text: "Multiple indicators require interviewer review" } : weakFlag ? { level: "MINOR", text: "Some indicators were recorded; review the evidence" } : usable.length ? { level: "CLEAR", text: "No review indicators were observed in the available data" } : { level: "INSUFFICIENT", text: "Insufficient reliable monitoring data; no conclusion can be made" });
  const badPct = qualityN ? Math.round(100 * qualityBad / qualityN) : 0;
  const trackQ = !analysed ? "No video was analysed" : badPct > 40 ? `Poor (exactly one face in only ${100 - badPct}% of frames)` : badPct > 15 ? `Fair (exactly one face in ${100 - badPct}% of frames)` : "Stable";
  const data = {
    challenge: chalRuns.map((c) => ({ ...c })), insights: ins, fusion: fusionSegs, evidence: evidence.map((e) => ({ ...e })), finalStatus, finalReasons: reasons, trackQ, analysedSec: Math.round(analysed / 1000),
    monitoringQuality: { analysedFrames: qualityN, exactlyOneFaceFrames: qualityN - qualityBad, exactlyOneFacePercent: Math.round(singleFaceRatio * 100), usableAnswerWindows: usable.length },
    timeline: timeline.map((t) => ({ clock: fmt(t.s), s: t.s, label: LABEL[t.type] || t.type, type: t.type, detail: t.detail })),
    level: lvKey, levelEval, identity,
    candidate: $("cname").value, email: $("cmail").value, role: $("crole").value, started: fmtDT(new Date(t0)), generated: fmtDT(new Date()),
    duration: `${Math.floor(dur / 60)} min ${dur % 60} sec`, summary, rows, eye, eyeRows, aiRows, aiFlagLines, aiJumps: styleJumps.map((j) => j.why), monitoring, speakerNotes, scoringNote
  };
  const base = `Interview_Report_${($("cname").value || "Candidate").replace(/[^a-z0-9_-]+/gi, "_")}`;
  const audioBlob = await Promise.race([stopRecording(), new Promise((r) => setTimeout(() => r(null), 6000))]); // v38: a stuck recorder must never block the PDF
  try {
    const { doc, nonLatin } = ReportPDF.generate(data);
    doc.save(base + ".pdf");
    showDownloadButtons([{ label: "PDF report again", doc, name: base + ".pdf" }]);
    try {
      const json = { candidate: data.candidate, email: data.email, role: data.role, level: lvKey, levelEval, identity: { enabled: identity.enabled, status: identity.status, reason: identity.reason, idType: identity.idType, said: identity.said, startClock: identity.startClock, idClock: identity.idClock, idCardShaped: !!identity.idSnap?.cardLike }, started: data.started, generated: data.generated, duration: data.duration,
        finalStatus: data.finalStatus, reasons: data.finalReasons, monitoringQuality: data.monitoringQuality, challenge: chalRuns, voice: vg ? { clusters: vg.clusters, windows: vg.log.slice(-300), secondVoiceAlerts: counts.second_voice || 0, typingBursts: typingBursts.length } : null, trackingQuality: data.trackQ, flagCounts: counts, timeline: data.timeline, fusion: fusionSegs, insights: ins, screenChanges: scr.changes, durationSec: dur, evidence: evidence.map(({ img, w, h, ...e }) => e),
        perQuestion: items.map((i, k) => ({ label: i.label, question: i.question, answer: i.answer, score: rows[k]?.score?.total ?? null, category: rows[k]?.score?.category || Analysis.categorize(i.question, i.answer), skills: rows[k] ? { relevance: rows[k].score.relevance, accuracy: rows[k].score.accuracy, technical: rows[k].score.technical, completeness: rows[k].score.completeness, communication: rows[k].score.communication } : null, gaze: gazeRows.find((g) => g.question === i.seq) ? (({ a, ...g }) => ({ ...g, risk: a.risk, riskPoints: a.points, observation: a.obs }))(gazeRows.find((g) => g.question === i.seq)) : null })),
        note: "Webcam indicators are not proof of misconduct; interviewer review is required." };
      try { window.AIInterviewHook?.report?.({ pdf: doc.output("blob"), name: base + ".pdf", json }); } catch {} // AI Interview app: save the report to the dashboard
    } catch {}
    if (nonLatin) { // the PDF font cannot draw Tamil etc.: save the complete Q&A + conversation as a page that shows every script correctly
      const E = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      const html = `<!doctype html><meta charset="utf-8"><title>${E(base)}</title><style>body{font:15px/1.5 system-ui,"Noto Sans Tamil",sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px}h2{font-size:17px;margin-top:26px;border-bottom:1px solid #ddd;padding-bottom:4px}.q{font-weight:700}.a{background:#f6f6fb;padding:8px 10px;border-radius:6px;margin:6px 0}.l{margin:3px 0}.iv{color:#6d28d9;font-weight:700}.cd{color:#0f766e;font-weight:700}</style><h1>${E($("cname").value || "Candidate")} - complete interview text</h1>`
        + items.map((i) => `<h2>${E(i.label)}</h2><div class="q">${E(i.question)}${i.qNote ? ` <i>[${E(i.qNote)}]</i>` : ""}</div><div class="a">${E(i.answer || "(no answer captured)")}</div>`).join("");
      download(new Blob([html], { type: "text/html;charset=utf-8" }), base + "_full_text.html");
    }
    say(`PDF report downloaded (${base}.pdf). ${items.length} question(s) analysed${nonLatin ? "; non-English text can't be drawn in the PDF, so the full text was saved as an .html file as well" : ""}.`);
  } catch (e) { // v38.1: no text report any more; the End button stays clickable so the PDF can be retried
    console.error(e); reportFailed = true;
    say("Could not build the PDF (" + (e.message || e) + "). Click 'End & generate report' again to retry.");
  }
  stopAudioCapture(); stopFrameReader();
  try { stream?.getTracks().forEach((track) => track.stop()); } catch {}
  stream = null; meetingAudioTrack = null; hasTab = false;
  $("start").disabled = true; $("end").disabled = reportFailed ? false : true; // v38: keep End clickable after a failed PDF so it can be retried
  $("tabAudioStatus").textContent = "Not connected"; $("tabAudioStatus").className = "pill";
  $("micStatus").textContent = "Not connected"; $("micStatus").className = "pill";
}
$("end").onclick = finish;


window.addEventListener("beforeunload", () => {
  stopAudioCapture();
  try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
});

// ---------- v36: Enter key adds a typed line + "no interviewer question heard" warning ----------
$("mText")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("mAdd").click(); } });
// Candidate spoke but no interviewer line was ever captured (mic blocked / muted / filtered): tell the interviewer NOW, not in the PDF.
function updateQWarn() {
  const el = $("qWarn"); if (!el) return;
  const cand = utts.filter((u) => u.role === "Candidate" && !u.echo).length, iv = utts.filter((u) => u.role === "Interviewer").length;
  const unc = parser.qa.filter((x) => x.uncaptured).length;
  if (running && cand >= 2 && (iv === 0 || unc > 0)) {
    el.style.display = "";
    el.textContent = iv === 0
      ? `Your questions are NOT being captured (${cand} candidate answers heard, 0 interviewer lines). Check: Mic level bar moves when YOU speak? Zoom/Meet not muting the mic? Right microphone allowed in Chrome? Until it is fixed, type each question in the box above ("Add line", role Interviewer) and press Enter.`
      : `${unc} answer(s) have no captured question. Type the missing question in the box above ("Add line", role Interviewer), or use the ✎ fix question button.`;
  } else el.style.display = "none";
}
