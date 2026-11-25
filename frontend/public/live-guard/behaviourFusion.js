// Behaviour Fusion Engine: joins eye gaze, head pose, phone, reading sweeps, voice and screen signals
// over a sliding window (default 8 s) instead of judging single frames.
//   NORMAL        nothing worth a look
//   REVIEW        a repeated / sustained signal (interviewer should look at it)
//   PRIORITY      two or more different signals agree (e.g. phone + looking down + speaking)
//   INSUFFICIENT  tracking unavailable (face not visible / no frames), so NO judgement is made
// It never says "cheating": it says what happened, when, and how well the camera could actually see.
(function (root) {
  "use strict";
  function create(opts) {
    const C = Object.assign({ windowMs: 8000, minFrames: 4, closeAfterMs: 3000 }, opts || {});
    let samples = [], notes = [], segs = [], open = null, t0 = Date.now(), lastLevel = "NORMAL";
    const frac = (arr, f) => (arr.length ? arr.filter(f).length / arr.length : 0);
    function evaluate(now) {
      samples = samples.filter((s) => now - s.t <= C.windowMs); notes = notes.filter((n) => now - n.t <= C.windowMs);
      const n = samples.length, quality = frac(samples, (s) => s.faces === 1);
      const cnt = (type) => notes.filter((x) => x.type === type).length;
      const multi = frac(samples, (s) => s.faces > 1);
      if (n < C.minFrames || (quality < 0.4 && multi < 0.3)) return { level: "INSUFFICIENT", reasons: [n < C.minFrames ? "too few video frames" : "face not clearly visible"], conf: 0, quality };
      const ans = samples.filter((s) => s.answering), fSpeak = frac(samples, (s) => s.answering);
      const fOff = ans.length ? frac(ans, (s) => s.off) : 0, fDown = frac(samples, (s) => s.down);
      const phone = samples.some((s) => s.phone), sweep = Math.max(0, ...samples.map((s) => s.sweep || 0));
      const P = [], R = [];
      if (phone && fDown >= 0.3 && fSpeak >= 0.3) P.push("phone visible + looking down + candidate speaking");
      if (cnt("same_side_phone") && fSpeak >= 0.3) P.push("repeated looks to one side + phone seen + candidate speaking (phone beside the laptop?)");
      if (cnt("voice_mismatch") && (fOff >= 0.4 || phone)) P.push("voice heard without lip movement + looking away");
      if (cnt("screen_change") >= 2 && fSpeak >= 0.3) P.push("shared-screen region changed repeatedly while answering");
      // looking away / down ALONE is normal thinking and is never reported; it only counts together with another clue
      if (ans.length >= 3 && fOff >= 0.4 && (sweep >= 2 || cnt("typing_sound") || cnt("second_voice"))) P.push("looking away + reading-like sweeps / typing sounds / another voice");
      if (cnt("same_side_repeat")) R.push("repeated looks to the same side while answering");
      if (cnt("second_voice")) R.push("another voice heard");
      if (cnt("typing_sound") >= 2 && fSpeak >= 0.3) R.push("keyboard sounds while answering");
      if (sweep >= 2) R.push("repeated reading-like eye sweeps");
      if (multi >= 0.5) R.push("more than one face in frame");
      if (cnt("voice_mismatch")) R.push("voice without lip movement");
      if (cnt("screen_change")) R.push("candidate screen changed");
      if (phone && !P.length) R.push("phone visible");
      const reasons = P.length ? P.concat(R) : R, level = P.length ? "PRIORITY" : R.length ? "REVIEW" : "NORMAL";
      const conf = level === "NORMAL" ? 0 : Math.round(100 * (0.5 * quality + 0.5 * Math.min(1, reasons.length / 2)));
      return { level, reasons, conf, quality };
    }
    const rank = { NORMAL: 0, INSUFFICIENT: 0, REVIEW: 1, PRIORITY: 2 };
    return {
      push(s) { samples.push(s); },
      note(type, t) { notes.push({ type, t: t || Date.now() }); },
      reset(t) { samples = []; notes = []; segs = []; open = null; t0 = t || Date.now(); lastLevel = "NORMAL"; },
      /** call about once a second; returns the current verdict */
      tick(now) {
        const r = evaluate(now); lastLevel = r.level;
        if (r.level === "REVIEW" || r.level === "PRIORITY") {
          if (!open) open = { startS: Math.round((now - t0) / 1000), endS: 0, level: r.level, reasons: new Set(), conf: 0, lastBad: now };
          open.lastBad = now; if (rank[r.level] > rank[open.level]) open.level = r.level;
          r.reasons.forEach((x) => open.reasons.add(x)); open.conf = Math.max(open.conf, r.conf);
        } else if (open && now - open.lastBad >= C.closeAfterMs) this.closeOpen(now);
        return r;
      },
      closeOpen(now) { if (!open) return; open.endS = Math.max(open.startS + 1, Math.round(((open.lastBad || now) - t0) / 1000)); segs.push({ startS: open.startS, endS: open.endS, level: open.level, reasons: [...open.reasons], conf: open.conf }); open = null; },
      finish(now) { this.closeOpen(now); return segs.slice(); },
      get level() { return lastLevel; }
    };
  }
  root.Fusion = { create };
})(typeof window !== "undefined" ? window : globalThis);
