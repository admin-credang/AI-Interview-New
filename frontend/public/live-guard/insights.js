// insights.js (v32) - pattern analysis on top of the per-answer gaze / speech / phone measurements.
// Pure functions (no camera, no DOM) so they can be unit-tested.
//
//   1. phoneBesideLaptop()  repeated looks to the SAME side + phone visibility (+ lowered head / fluent speech)
//   2. secondMonitor()      same out-of-screen direction across answers + calibration quality + what the share can actually show
//   3. thinkingVsReading()  separates normal thinking from reading-like behaviour for every answer
//   4. createSideTracker()  live (during the interview) version of 1, feeds the Behaviour Fusion engine
//
// Honest limits (also written into the report): a webcam cannot see a phone / monitor outside its frame, and a repeated
// look to one side is a REVIEW signal (notes, a window, a second monitor, a habit) - never proof of misconduct.
(function (root) {
  "use strict";
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const LEVELS = ["NONE", "WEAK", "REVIEW", "STRONG"];
  const lvl = (score, weakAt, reviewAt, strongAt) => (score >= strongAt ? "STRONG" : score >= reviewAt ? "REVIEW" : score >= weakAt ? "WEAK" : "NONE");
  const maxLevel = (a, b) => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);

  // ------------------------------------------------------------------------------------------------ 1. phone beside laptop
  /**
   * r  = per-answer gaze snapshot { answer_ms, lost_ms, sideL, sideR, sideDown, phone_ms, left_ms, right_ms, down_ms, glances, mapped }
   * fl = speech flow { fluent 0..1, words }
   * Returns { level, score, side, sameSide, evidence[] }.
   * A phone seen by the camera AND a repeated look to one side is the strongest combination; either alone stays at WEAK / REVIEW.
   */
  function phoneBesideLaptop(r, fl) {
    r = r || {}; fl = fl || {};
    const ms = r.answer_ms || 0, lost = r.lost_ms || 0;
    const out = { level: "NONE", score: 0, side: null, sameSide: 0, evidence: [] };
    if (ms < 6000 || lost / Math.max(1, ms + lost) >= 0.5) return Object.assign(out, { level: "NONE", insufficient: true });
    const L = r.sideL || 0, R = r.sideR || 0, tot = L + R, same = Math.max(L, R);
    const concentrated = tot >= 2 && same / tot >= 0.7;
    const fluent = fl.fluent == null ? 0.5 : fl.fluent;
    const phoneSeen = (r.phone_ms || 0) >= 1500 || (fl.phoneEv || 0) >= 2, down = (r.sideDown || 0) >= 1; // v51: phone-use events logged during the answer count too
    let s = 0;
    if (concentrated && same >= 2) {
      out.side = L >= R ? "LEFT" : "RIGHT"; out.sameSide = same;
      s += 16 * Math.min(same, 5);                                       // 2 looks = 32 ... 5 looks = 80
      out.evidence.push(`Looked ${out.side} ${same} time(s) while answering (${Math.round(100 * same / tot)}% of the side-looks were to the same side)`);
      if (down) { s += 10; out.evidence.push("head / eyes were lowered during those looks (something lying on the desk?)"); }
      s *= 0.4 + 0.6 * cl((fluent - 0.3) / 0.4, 0, 1);                   // hesitant "thinking" speech weakens it, fluent speech strengthens it
      if (fluent >= 0.65) out.evidence.push("speech stayed fluent around the looks");
    }
    if (phoneSeen) {
      const ph = Math.round((r.phone_ms || 0) / 1000), phTxt = ph >= 2 ? `${ph}s` : `${fl.phoneEv} "looking at a phone" event(s)`;
      if (out.side) { s += 30; out.evidence.push(`a phone-like object was also seen by the camera (${phTxt})`); }
      else { s += 18; out.evidence.push(`a phone-like object was seen (${phTxt}) but there was no repeated same-side look`); }
    }
    out.score = Math.round(cl(s, 0, 100));
    // STRONG needs BOTH clues (phone visible + repeated same-side look); a single clue can only reach REVIEW.
    let level = lvl(out.score, 20, 40, 65);
    if (level === "STRONG" && !(phoneSeen && out.side)) level = "REVIEW";
    // v32: looking to one side (or down) is a very common THINKING habit. Without a phone seen by the camera it stays a weak note,
    // and only a long, fluent, head-lowered, many-times-repeated pattern may reach REVIEW.
    if (!phoneSeen) {
      const heavy = out.sameSide >= 5 && (r.sideDown || 0) >= 2 && fluent >= 0.7;
      if (!heavy && LEVELS.indexOf(level) > 1) level = "WEAK";       // REVIEW / STRONG are not allowed without a phone
      if (heavy && level === "STRONG") level = "REVIEW";
      if (!heavy) out.evidence.push("no phone was seen, so this is treated as normal thinking / a habit, not a phone");
    }
    out.level = level;
    return out;
  }

  /** the same-side pattern across the WHOLE interview: one answer can be a habit, a pattern in several answers is more telling */
  function sidePatternAcross(rows) {
    const per = (rows || []).filter((x) => x.p && x.p.side);
    const L = per.filter((x) => x.p.side === "LEFT").length, R = per.filter((x) => x.p.side === "RIGHT").length;
    const same = Math.max(L, R), side = L >= R ? "LEFT" : "RIGHT";
    return { side: same ? side : null, answers: same, ofAnswers: (rows || []).filter((x) => x.p && !x.p.insufficient).length };
  }

  // ------------------------------------------------------------------------------------------------ 2. second monitor
  /**
   * rows = [{ r, fl }] one per answer; ctx = {
   *   calibrated:boolean, calQuality:"good"|"fair"|null,
   *   share: "monitor" | "window" | "browser" | "none" | "unknown"   (what the candidate shared in the meeting),
   *   screenChanges:number  (large changes seen in the shared screen region) }
   * Returns { level, direction, answers, ofAnswers, share, confidence, evidence[], limits[] }
   */
  function secondMonitor(rows, ctx) {
    ctx = ctx || {};
    const usable = (rows || []).filter((x) => x.r && (x.r.answer_ms || 0) >= 8000 && (x.r.lost_ms || 0) / Math.max(1, (x.r.answer_ms || 0) + (x.r.lost_ms || 0)) < 0.5);
    const out = { level: "NONE", direction: null, answers: 0, ofAnswers: usable.length, share: ctx.share || "unknown", confidence: 0, evidence: [], limits: [] };
    const calibrated = !!ctx.calibrated && (ctx.calQuality === "good" || ctx.calQuality === "fair");
    if (usable.length < 2) { out.insufficient = true; out.limits.push("Fewer than 2 answers had enough tracked video, so a second-monitor pattern cannot be judged."); return out; }
    // direction per answer: calibrated = share of answer time outside the screen; uncalibrated = repeated left / right glances only
    const dirs = [];
    for (const { r, fl } of usable) {
      const ms = r.answer_ms, fluent = fl && fl.fluent != null ? fl.fluent : 0.5;
      let d = null, w = 0;
      if (r.mapped && calibrated) {
        const c = { LEFT: (r.left_ms || 0) / ms, RIGHT: (r.right_ms || 0) / ms, ABOVE: (r.up_ms || 0) / ms };
        const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
        if (top[1] >= 0.15) { d = top[0]; w = top[1]; }
      } else {
        const L = r.sideL || 0, R = r.sideR || 0, tot = L + R, same = Math.max(L, R);
        if (same >= 2 && same / tot >= 0.7) { d = L >= R ? "LEFT" : "RIGHT"; w = Math.min(0.4, same * 0.08); }
      }
      if (d) dirs.push({ d, w: w * (0.5 + 0.5 * cl((fluent - 0.3) / 0.4, 0, 1)) });
    }
    if (!dirs.length) return out;
    const tally = {}; dirs.forEach((x) => { tally[x.d] = (tally[x.d] || 0) + 1; });
    const [dir, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    const share = dirs.filter((x) => x.d === dir).reduce((a, x) => a + x.w, 0) / n;
    out.direction = dir; out.answers = n;
    let score = 25 * Math.min(n, 4) * (n / dirs.length) + 60 * share;
    if (!calibrated) score *= 0.6;
    if (ctx.share === "monitor" && !(ctx.screenChanges > 0)) score += 0; // entire screen shared and nothing changed on it: the content is probably elsewhere
    out.score = Math.round(cl(score, 0, 100));
    let level = lvl(out.score, 25, 45, 70);
    if (n < 2) level = level === "NONE" ? "NONE" : "WEAK";                 // one answer is never a pattern
    if (!calibrated && level === "STRONG") level = "REVIEW";               // without a calibrated screen the direction is only approximate
    out.level = level;
    out.confidence = Math.round(cl(0.35 + (calibrated ? (ctx.calQuality === "good" ? 0.35 : 0.2) : 0) + 0.1 * Math.min(n, 3), 0, 0.95) * 100);
    out.evidence.push(`Looked ${dir} of the screen in ${n} of ${usable.length} answers${calibrated ? ` (calibration ${ctx.calQuality})` : " (no calibration, direction approximate)"}`);
    if (ctx.share === "monitor") out.evidence.push(ctx.screenChanges > 0 ? `the shared screen changed ${ctx.screenChanges} time(s) (content may be on THIS screen)` : "the whole screen was shared and showed no large change, so the content being looked at may be on another screen");
    // what the evidence can and cannot show
    if (!calibrated) out.limits.push("Gaze calibration was not done, so left / right / above can only be estimated from repeated side glances.");
    if (ctx.share === "window" || ctx.share === "browser") out.limits.push("Only a window / tab was shared; a second monitor or other windows are not visible to the proctor.");
    else if (ctx.share === "none" || ctx.share === "unknown") out.limits.push("No candidate screen was shared; a monitor that is not shared can only be inferred from where the eyes go, never seen.");
    else if (ctx.share === "monitor") out.limits.push("Only the shared monitor can be seen; any other monitor stays invisible.");
    out.limits.push("A repeated look to one side can also be notes, a notepad, a window on the same screen or a habit.");
    return out;
  }

  // ------------------------------------------------------------------------------------------------ 3. thinking vs reading
  /**
   * r  = per-answer gaze snapshot, fl = speech flow { fluent, words, hes, pauseRatio, maxPauseMs, thinkMs, typing, voice2, bookish, f0sd }
   * Returns { label: "THINKING" | "READING" | "MIXED" | "INSUFFICIENT", readingScore, thinkingScore, readingClues[], thinkingClues[] }
   * READING needs at least TWO independent reading clues; looking away / down alone is never reading.
   */
  function thinkingVsReading(r, fl) {
    r = r || {}; fl = fl || {};
    const ms = r.answer_ms || 0, lost = r.lost_ms || 0;
    const out = { label: "INSUFFICIENT", readingScore: 0, thinkingScore: 0, readingClues: [], thinkingClues: [] };
    if (ms < 8000 || lost / Math.max(1, ms + lost) >= 0.5) { out.note = ms < 8000 ? "Answer too short to separate thinking from reading." : "Face hidden for too much of this answer."; return out; }
    const words = fl.words || 0, fluent = fl.fluent == null ? 0.5 : fl.fluent;
    if (words < 12) { out.note = "Too few spoken words to compare with the eye movement."; return out; }
    const off = 1 - (r.on_screen_ms || 0) / ms, down = (r.down_ms || 0) / ms, up = (r.up_ms || 0) / ms;
    const glances = r.glances || 0, sweeps = r.sweeps || 0, sameSide = Math.max(r.sideL || 0, r.sideR || 0);
    const hes = fl.hes || 0, pause = fl.pauseRatio == null ? null : fl.pauseRatio;
    const R = out.readingClues, T = out.thinkingClues; let rs = 0, ts = 0;

    // ---- reading-like clues (each is weak alone)
    if (sweeps >= 2) { rs += sweeps >= 3 ? 30 : 18; R.push(`${sweeps} slow side-to-side eye sweeps with a snap back (line-by-line reading pattern)`); }
    if (down >= 0.4 && fluent >= 0.6) { rs += 25; R.push(`eyes / head lowered ${Math.round(down * 100)}% of the time while speaking fluently`); }
    if (sameSide >= 3 && fluent >= 0.6) { rs += 20; R.push(`looked to the same side ${sameSide} times while speaking fluently`); }
    if (off >= 0.3 && glances >= 3 && fluent >= 0.7 && hes === 0) { rs += 18; R.push("repeated glances away with continuous, hesitation-free speech"); }
    if (ms >= 10000 && glances <= 1 && (r.on_screen_ms || 0) / ms >= 0.93 && fluent >= 0.75 && words >= 30) { rs += 10; R.push("eyes held almost perfectly steady on the screen with fluent speech (also normal when looking at the interviewer)"); }
    if (fl.thinkMs >= 7000 && fluent >= 0.7 && words >= 25) { rs += 10; R.push(`${Math.round(fl.thinkMs / 1000)}s silence, then a long fluent answer`); }
    if (fl.bookish >= 3 && hes === 0 && words >= 20) { rs += 10; R.push("textbook-style wording without any hesitation"); }
    if (fl.f0sd != null && fl.f0sd < 0.11 && fluent >= 0.7 && words >= 25) { rs += 8; R.push("flat, read-out pitch"); }
    if (fl.typing) { rs += 15; R.push(`keyboard-like clicks heard ${fl.typing} time(s)`); }
    if (fl.voice2) { rs += 20; R.push("another voice was heard during the answer"); }
    if ((r.phone_ms || 0) >= 2000) { rs += 20; R.push(`phone-like object visible for ${Math.round(r.phone_ms / 1000)}s`); }
    if (fl.phoneEv) { rs += Math.min(30, 10 * fl.phoneEv); R.push(`camera logged "looking at a phone-like object" ${fl.phoneEv} time(s) during the answer`); } // v51
    const aiT = fl.aiText; if (aiT && aiT.level !== "LOW" && aiT.delivery !== "hesitant") { rs += aiT.level === "HIGH" ? 20 : 12; R.push("textbook / ChatGPT-style wording spoken smoothly"); } // v51

    // ---- thinking-like clues
    if (hes >= 1) { ts += Math.min(30, 12 + 6 * hes); T.push(`${hes} hesitation / self-correction(s) ("um", "let me think", repeats)`); }
    if (pause != null && pause >= 0.3) { ts += 18; T.push(`pauses took ${Math.round(pause * 100)}% of the answer (searching memory)`); }
    if (fluent < 0.5) { ts += 20; T.push("speech was slow / broken, typical of recalling rather than reading"); }
    if (up >= 0.1 && sweeps < 2) { ts += 12; T.push("eyes drifted UP / aside (a common recall movement)"); }
    if (down >= 0.2 && fluent < 0.5) { ts += 15; T.push("looked down only while hesitating (normal thinking)"); }
    if (off >= 0.15 && off <= 0.6 && hes >= 1 && sweeps === 0) { ts += 10; T.push("looked away while hesitating, then returned to the screen"); }
    if (fl.thinkMs > 0 && fl.thinkMs < 6000 && fluent < 0.6) { ts += 6; T.push("started answering soon after the question"); }

    out.readingScore = Math.round(cl(rs, 0, 100)); out.thinkingScore = Math.round(cl(ts, 0, 100));
    const specific = sweeps >= 2 || (r.phone_ms || 0) >= 2000 || (fl.phoneEv || 0) >= 2 || !!(fl.aiText && fl.aiText.strong) || !!fl.typing || !!fl.voice2 || (fl.thinkMs >= 7000 && fluent >= 0.7 && words >= 25) || (fl.bookish >= 3 && hes === 0 && words >= 20) || (fl.f0sd != null && fl.f0sd < 0.11 && fluent >= 0.7 && words >= 25);
    // two clues are required AND at least one must be specific to reading (looking away / down / aside is also what thinking looks like)
    const strongReading = out.readingScore >= 40 && R.length >= 2 && specific;
    if (strongReading && out.thinkingScore < 30) out.label = "READING";
    else if (strongReading && out.thinkingScore >= 30) out.label = "MIXED";
    else if (out.thinkingScore >= 25 && out.readingScore < 40) out.label = "THINKING";
    else if (out.readingScore >= 25 || (out.readingScore >= 40 && !specific)) out.label = "MIXED";
    else out.label = "THINKING";                                                 // nothing reading-like was seen: no evidence of reading
    if (out.readingScore < 15 && out.thinkingScore < 15) { out.label = "THINKING"; out.note = "No reading-like clue was seen."; }
    return out;
  }

  // ------------------------------------------------------------------------------------------------ 4. live same-side tracker
  /**
   * Feed it ~4 times a second. It counts separate looks to the same side while the candidate is answering and says when the
   * pattern repeats (>= `need` same-side looks within `windowMs`). `phoneRecent` = a phone was seen in the last 60 s.
   */
  function createSideTracker(opts) {
    const C = Object.assign({ windowMs: 60000, need: 3, minLookMs: 700, gapMs: 1200, cooldownMs: 30000 }, opts || {});
    let cur = null, looks = [], lastFire = -Infinity, lastSeen = 0;
    const prune = (now) => { looks = looks.filter((l) => now - l.t <= C.windowMs); };
    return {
      /** dir: "left" | "right" | other / "" ; answering: candidate is speaking; returns null or { side, count, withPhone } when the pattern fires */
      push(dir, answering, phoneRecent, now) {
        const side = dir === "left" || dir === "right" ? dir : null;
        if (side && answering) {
          lastSeen = now;
          if (!cur || cur.side !== side) cur = { side, t0: now, counted: false };
          if (!cur.counted && now - cur.t0 >= C.minLookMs) { cur.counted = true; looks.push({ t: now, side, phone: !!phoneRecent }); }
        } else if (cur && now - lastSeen > C.gapMs) cur = null;
        prune(now);
        const n = { left: 0, right: 0 }; looks.forEach((l) => n[l.side]++);
        const side2 = n.left >= n.right ? "left" : "right", count = n[side2];
        if (count >= C.need && count / looks.length >= 0.7 && now - lastFire >= C.cooldownMs) {
          lastFire = now; return { side: side2.toUpperCase(), count, withPhone: looks.some((l) => l.side === side2 && l.phone) };
        }
        return null;
      },
      reset() { cur = null; looks = []; lastFire = -Infinity; lastSeen = 0; }
    };
  }

  // ------------------------------------------------------------------------------------------------ whole-interview summary
  const SHARE_TXT = { monitor: "entire screen / monitor shared", window: "one window shared", browser: "one browser tab shared", none: "no screen shared", unknown: "screen share unknown" };
  /** rows = [{ seq, label, startS, r, fl }]; returns { perAnswer[], phoneBeside, secondMonitor, thinkingReading, events[] } */
  function analyse(rows, ctx) {
    ctx = ctx || {};
    const per = (rows || []).map((x) => ({ seq: x.seq, label: x.label, startS: x.startS || 0, p: phoneBesideLaptop(x.r, x.fl), t: thinkingVsReading(x.r, x.fl) }));
    const phone = sidePatternAcross(per);
    const monitor = secondMonitor(rows, ctx);
    const events = [];
    per.forEach((x) => {
      if (x.p.level === "REVIEW" || x.p.level === "STRONG") events.push({ type: "phone_beside_laptop", s: x.startS, detail: `${x.label}: ${x.p.evidence.join("; ")}.` });
      if (x.t.label === "READING") events.push({ type: "reading_pattern", s: x.startS, detail: `${x.label}: ${x.t.readingClues.join("; ")}.` });
    });
    if (monitor.level === "REVIEW" || monitor.level === "STRONG") events.push({ type: "second_monitor", s: per[0] ? per[0].startS : 0, detail: monitor.evidence.join("; ") + "." });
    const count = (k) => per.filter((x) => x.t.label === k).length;
    const thinking = { THINKING: count("THINKING"), MIXED: count("MIXED"), READING: count("READING"), INSUFFICIENT: count("INSUFFICIENT") };
    return { perAnswer: per, phoneBeside: phone, secondMonitor: monitor, thinkingReading: thinking, shareText: SHARE_TXT[ctx.share || "unknown"], events };
  }

  root.Insights = { phoneBesideLaptop, sidePatternAcross, secondMonitor, thinkingVsReading, createSideTracker, analyse, SHARE_TXT };
  if (typeof module !== "undefined" && module.exports) module.exports = root.Insights;
})(typeof window !== "undefined" ? window : globalThis);
