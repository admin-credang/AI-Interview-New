// Per-answer reading / cheating risk model (pure functions, no DOM, unit-tested).  Points are 0-100 per answer.
// Extracted from app.js in v38 so it can be tested and tuned in ONE place.
(function (root) {
  "use strict";
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const RISK = { medium: 30, high: 55 }; // v38: was 35 / 60 (a phone held below the camera was never reaching MEDIUM)
  const riskOf = (p) => (p >= RISK.high ? "HIGH" : p >= RISK.medium ? "MEDIUM" : "LOW");

  function analyseQ(r, flow) {
    const ms = r.answer_ms || 0, lostMs = r.lost_ms || 0, lostShare = lostMs / Math.max(1, ms + lostMs);
    if (ms < 3000) return { ...r, assessed: false, risk: "LOW", points: 0, obs: lostMs >= 3000 ? `Tracking unavailable: the candidate's face was not visible for ${Math.round(lostMs / 1000)}s of this answer (screen-share layout / camera), so no reading check was possible.` : "Answer too short to assess (" + Math.round(ms / 1000) + "s of video)." };
    const fl = flow || { words: 0, hes: 0, fluent: 0.5 }, fluent = fl.fluent;
    const gaze = r.on_screen_ms / ms, off = 1 - gaze, side = r.side_ms / ms, down = r.down_ms / ms;
    // WHERE the eyes go cannot tell reading from thinking on its own: a phone beside the camera keeps the eyes "on screen" (steady),
    // while someone searching their memory stares aside. So the eyes are judged TOGETHER with how the answer sounds:
    //   * eyes DOWN / a visible phone / reading sweeps                    -> strong evidence on their own
    //   * eyes away repeatedly + FLUENT continuous speech                 -> reading from beside the screen
    //   * eyes unnaturally STEADY on the screen the whole answer + FLUENT -> reading from a phone at the camera
    //   * eyes away + hesitant / short / repeating speech ("I'm stuck")    -> normal thinking, NOT suspicious
    const sweepReading = r.sweeps >= 3, phoneSeen = r.phone_ms >= 2000;
    const dl = (r.left_ms || 0) / ms, dr = (r.right_ms || 0) / ms, du = (r.up_ms || 0) / ms, dd = r.mapped ? down : 0;
    const topDir = Math.max(dl, dr, du, dd), dirName = topDir === dl ? "LEFT" : topDir === dr ? "RIGHT" : topDir === du ? "ABOVE" : "BELOW";
    // v31: looking DOWN while thinking is normal (hesitant, stuck). Down only counts as evidence when the speech is fluent (reading) or a phone is seen.
    const downW = 0.2 + 0.8 * cl((fluent - 0.4) / 0.4, 0, 1);
    const readingDown = (down >= 0.5 && fluent >= 0.6) || (down >= 0.3 && r.glances >= 2 && fluent >= 0.6);
    const strong = 60 * cl(down / 0.5, 0, 1) * downW + (phoneSeen ? 33 + 17 * cl((r.phone_ms - 2000) / 6000, 0, 1) : 15 * cl(r.phone_ms / 2000, 0, 1)) + 15 * cl((r.sweeps - 1) / 3, 0, 1) + (sweepReading || readingDown || (phoneSeen && down + side >= 0.2) ? 25 : 0);
    const awayRaw = 40 * cl((off - 0.15) / 0.5, 0, 1) + 30 * cl((r.glances - 1) / 4, 0, 1) + (r.glances >= 3 && off >= 0.25 ? 25 : 0);
    const away = awayRaw * fluent + (off >= 0.35 && fluent >= 0.65 ? 15 : 0);
    const longEnough = ms >= 8000 && fl.words >= 12;
    const steadyBase = longEnough && r.glances <= 1 ? 20 * cl((gaze - 0.9) / 0.1, 0, 1) * fluent : 0;
    const steady = (strong + away) >= 15 ? steadyBase * 0.75 : steadyBase * 0.9;
    const sideBonus = r.mapped ? 30 * cl((topDir - 0.12) / 0.3, 0, 1) : 0;
    // v31: the SAME side again and again (phone / notes lying beside the screen), mostly while speaking fluently
    const sL = r.sideL || 0, sR = r.sideR || 0, sameSide = Math.max(sL, sR), sideTot = sL + sR;
    const sidePhone = sameSide >= 2 && sameSide >= 0.7 * sideTot ? (14 * Math.min(sameSide, 5) + ((r.sideDown || 0) >= 2 ? 10 : 0)) * (0.35 + 0.65 * cl((fluent - 0.3) / 0.4, 0, 1)) : 0;
    // ---- v38: reading from a MOBILE that the camera cannot see (held below / beside the frame) ----
  // Thinking looks away too, but a thinking person goes quiet / hesitant. Someone READING keeps talking fluently while the eyes go to the phone.
  // So every clue below only counts when the speech is continuous and fluent (that is what separates reading from thinking).
  const downGl = r.downGl || 0, longOff = r.longOff || 0, maxOffMs = r.maxOffMs || 0, msw = r.msweeps || 0;
  const talking = fluent >= 0.6 && fl.words >= 15;
  const downRepeat = talking && downGl >= 3 ? 12 * Math.min(downGl, 6) + (down >= 0.15 ? 8 : 0) : 0;                       // glance at the phone, say a sentence, glance again
  const longStare = talking && longOff >= 1 && maxOffMs >= 3000 ? 24 + 8 * Math.min(longOff - 1, 3) + (down >= 0.2 ? 8 : 0) : 0; // long look away / down while still talking fluently
  const miniRead = msw >= 2 ? (talking ? 14 : 7) * Math.min(msw, 4) : 0;                                                        // small phone-size reading sweeps while the eyes were off the screen
  const mobileRead = Math.round(Math.min(75, downRepeat + 0.7 * longStare + miniRead));
  const mobileClue = talking && (downRepeat >= 36 || longStare >= 24 || miniRead >= 28);                                         // specific enough to lift the "just thinking" cap
  let gazePart = strong + away + steady + sideBonus + sidePhone + mobileRead;
    // when half of the answer could not be tracked (face hidden), the gaze part is not reliable
    const weakTrack = lostShare >= 0.5 && !phoneSeen; if (weakTrack) gazePart = Math.min(gazePart, RISK.medium - 1);
    // v31: clues that do not need the camera: keyboard sounds, another voice, a delay then a fluent textbook answer
    const typingPts = fl.typing ? Math.min(30, 14 + 5 * Math.min(4, fl.typing - 1)) : 0;
    const voicePts = fl.voice2 ? 35 : 0;
    const latePts = (fl.thinkMs >= 7000 && fluent >= 0.7 && fl.words >= 25) ? 10 : 0;
    const bookPts = (fl.bookish >= 3 && fl.hes === 0 && fl.words >= 20) ? 8 : 0;
    const flatPts = (fl.f0sd != null && fl.f0sd < 0.11 && fluent >= 0.7 && fl.words >= 25) ? 8 : 0;
    // v51: "looked at a phone-like object" events that the camera logged WHILE this answer ran (timeline events, matched by time).
    // The per-answer phone_ms above only counts a phone that was seen steadily; these events also catch a phone seen briefly before each look down.
    const phEv = fl.phoneEv || 0, phonePts = phEv >= 3 ? Math.min(45, 30 + 5 * (phEv - 3)) : phEv ? 12 * phEv : 0;
    const phoneEvHard = phEv >= 2 || (phEv >= 1 && (r.phone_ms || 0) >= 800);
    const strongOther = gazePart + typingPts + voicePts + phonePts;
    const weakAdd = strongOther >= 10 ? Math.min(20, latePts + bookPts + flatPts) : Math.min(30, latePts + bookPts + flatPts); // weak clues alone never reach MEDIUM
    let p = Math.min(100, Math.round(gazePart + typingPts + voicePts + phonePts + weakAdd));
    // v32: looking down / aside / away is how people THINK. Without a clue that is specific to cheating (phone seen, reading sweeps, keyboard sounds,
    // another voice, or the same side + head lowered many times in a row) it cannot reach MEDIUM; only a long, fluent, repeated look-down can (never HIGH).
    const hardClue = phoneSeen || phoneEvHard || sweepReading || typingPts > 0 || voicePts > 0 || mobileClue;                       // specific to cheating
    const sustainedDown = down >= 0.5 && fluent >= 0.7 && fl.words >= 25 && r.glances >= 2;            // long, fluent, repeated look-down
    const heavySide = sameSide >= 5 && (r.sideDown || 0) >= 2 && fluent >= 0.7;                       // same side, head lowered, 5+ times
    let thinkingCap = false;
    if (!hardClue) { const soft = p >= 50 && fluent >= 0.7 && fl.words >= 20; /* v40: looks away a lot while fluent = MEDIUM (review), still never HIGH */ const cap = (sustainedDown || heavySide) ? RISK.high - 1 : soft ? RISK.medium + 14 : RISK.medium - 1; if (p > cap) { p = cap; thinkingCap = true; } }
    // v38: mobile-reading clues WITHOUT a phone seen / reading sweeps / typing / another voice are circumstantial: they can reach MEDIUM (review),
  // and only reach HIGH when all three kinds agree (repeated look-downs + long fluent stare + small reading sweeps).
  const mobileKinds = (downRepeat >= 36 ? 1 : 0) + (longStare >= 24 ? 1 : 0) + (miniRead >= 28 ? 1 : 0);
  const external = phoneSeen || phoneEvHard || sweepReading || typingPts > 0 || voicePts > 0;
  let mobileCap = false;
  if (!external && mobileClue && mobileKinds < 3 && p > RISK.high - 1) { p = RISK.high - 1; mobileCap = true; }
  if (!external && mobileClue && p < RISK.medium) p = RISK.medium; // a speech-gated mobile clue is always worth a review
  // v50: wording clue (ChatGPT / textbook style read aloud, see aiAnswer.js). Wording alone can reach MEDIUM (review) but never HIGH: only together with eyes / phone / voice clues.
  const aiT = fl.aiText || null, textPts = aiT && aiT.level !== "LOW" ? (aiT.strong ? aiT.points : Math.min(aiT.points, 24)) : 0; // v51: LOW wording (e.g. textbook words spoken hesitantly = recalled) adds nothing
  let agree = false;
  if (textPts) {
    const eyesClue = mobileClue || readingDown || sweepReading || sidePhone >= 25 || (away >= 20 && fluent >= 0.65);
    p = Math.min(100, p + textPts);
    if (!external) {
      // v51: wording alone = MEDIUM at most. Strong AI wording AND an eye clue (long fluent look-down, reading sweeps, same side) are two
      // independent kinds of evidence that agree, so HIGH is allowed (kept below 80 because no phone / typing / voice was seen).
      if (eyesClue && aiT.level === "HIGH") { agree = p >= RISK.high; p = Math.min(p, 79); }
      else p = Math.min(p, RISK.high - 1);
    }
    if (aiT.strong && p < RISK.medium) p = RISK.medium;
  }
  if (agree) mobileCap = false; // the "kept at MEDIUM" note would contradict the HIGH result
  const risk = riskOf(p), reading = risk !== "LOW";
    const notes = [];
    if (thinkingCap && !phEv) notes.push("Looked down / aside / away, but no phone, reading sweeps, keyboard sounds or another voice were seen, so this is treated as normal thinking and kept below the review level");
    if (mobileCap) notes.push("No phone was seen by the camera, so these mobile-reading clues are kept at MEDIUM (review) and not HIGH");
  if (downRepeat >= 36) notes.push(`Looked DOWN ${downGl} separate times while speaking fluently (glance at a phone / notes, speak, glance again)`);
  if (longStare >= 24) notes.push(`Looked away / down for ${Math.round(maxOffMs / 1000)}s at a stretch while the speech stayed fluent (${longOff} such stretch${longOff > 1 ? "es" : ""}); thinking is usually quiet, reading is not`);
  if (miniRead >= 14) notes.push(`Small left-to-right eye movements with a quick return were seen while the eyes were off the screen (${msw}x): a reading pattern, such as a phone`);
  if (sidePhone >= 25) notes.push(`Looked to the SAME side ${sameSide} time(s) while answering${(r.sideDown || 0) >= 2 ? ", with the head / eyes lowered" : ""} (a phone or notes lying beside the screen?)`);
    if (fl.typing) notes.push(`Keyboard-like clicks were heard ${fl.typing} time(s) on the candidate's audio while the question / answer ran (searching or chatting?)`);
    if (fl.voice2) notes.push("A different voice was heard during this answer (someone prompting / a recording?)");
    if (latePts) notes.push(`Silent for ${Math.round(fl.thinkMs / 1000)}s after the question, then a long fluent answer`);
    if (bookPts) notes.push("Wording is formal / textbook-like (" + fl.bookish + " bookish words) without any hesitation");
    if (flatPts) notes.push("Flat, read-out pitch (little variation in the voice)");
    if (textPts && aiT) notes.push("AI / ChatGPT-style wording: " + aiT.notes.join("; "));
    else if (aiT && aiT.recalled) notes.push("Textbook wording, but spoken hesitantly: looks recalled from memory, not read (not counted)");
    if (agree) notes.push("The eyes (reading-like looks while speaking fluently) AND the textbook / AI wording point the same way, so this answer is rated HIGH even though no phone was seen");
    if (phEv) notes.push(`The camera logged "looking at a phone-like object" ${phEv} time(s) during this answer${fl.phoneEvAt && fl.phoneEvAt.length ? " (at " + fl.phoneEvAt.slice(0, 6).join(", ") + ")" : ""}; check the snapshots`);
    if (down >= 0.3 && fluent < 0.5 && phEv < 2) notes.push("Looked down while hesitating: normal thinking, not counted");
    if (phoneSeen) notes.push("A phone-like object was detected for " + Math.round(r.phone_ms / 1000) + "s (can be a false detection, check the photo evidence)");
    if (sweepReading) notes.push("Repeated slow side-to-side eye sweeps with a quick snap back (" + r.sweeps + "x in a row), a reading-line pattern");
    if (down >= 0.3 && fluent >= 0.5) notes.push("Eyes / head pointed down for " + Math.round(down * 100) + "% of the answer (phone or notes)");
    if (r.glances) { const w = []; if (side >= .1) w.push("sideways " + Math.round(side * 100) + "% of the time"); if (down >= .1) w.push("downwards " + Math.round(down * 100) + "% of the time"); notes.push("Looked off-screen " + r.glances + " time(s)" + (w.length ? " (" + w.join(", ") + ")" : "")); }
    if (r.mapped && (dl + dr + du + dd) >= 0.05) notes.push(`Outside the calibrated screen: left ${Math.round(dl * 100)}%, right ${Math.round(dr * 100)}%, above ${Math.round(du * 100)}%, below ${Math.round(dd * 100)}% of the answer` + (sideBonus >= 8 ? `; mostly ${dirName}, something may be on that side (second screen / mobile)` : ""));
    if (steady >= 5) notes.push("Eyes stayed on the screen for the whole answer with fluent speech (also normal when looking at the interviewer); weak signal only");
    if (away >= 20 && !weakTrack) notes.push("Looked away repeatedly while speaking continuously; may be reading, may be thinking");
    if (!reading && off >= 0.35 && fluent < 0.6) notes.push("Looked away while hesitating or repeating, which looks like thinking, not reading");
    if (lostMs >= 3000) notes.push(`Face not visible for ${Math.round(lostMs / 1000)}s (${Math.round(lostShare * 100)}% of this answer: screen-share layout / camera); that time is NOT scored${weakTrack ? ", so the reading check is unreliable for this answer" : ""}`);
    if (!notes.length || (!reading && !phoneSeen && off < 0.35)) notes.unshift("No reading pattern seen");
    if (reading) notes.push("Score " + p + "/100, so please verify manually");
    const speech = fl.words ? ` (speech: ${fl.words} words, fluency ${Math.round(fluent * 100)}%${fl.hes ? ", " + fl.hes + " hesitation(s)" : ""})` : "";
    return { ...r, aiText: aiT, phoneEv: phEv, agree, assessed: true, mobileClue: !!mobileClue, external: !!external, gaze: Math.round(gaze * 100), reading, points: p, risk, obs: notes.join(". ") + "." + speech };
  }

  // v39: SESSION-level pattern. One odd answer can be thinking; the SAME suspicious pattern again and again across answers is much less likely to be.
  // rows = analysed answers (the objects returned by analyseQ). Returns { risk, why[] }.
  function sessionRisk(rows) {
    const u = (rows || []).filter((x) => x && x.assessed), n = u.length;
    if (!n) return { risk: "N/A", why: [] };
    const high = u.filter((x) => x.risk === "HIGH").length, flagged = u.filter((x) => x.risk !== "LOW").length;
    const mob = u.filter((x) => x.mobileClue && x.risk !== "LOW").length, ext = u.filter((x) => x.external).length;
    const why = []; let risk = high / n >= 0.4 ? "HIGH" : flagged ? "MEDIUM" : "LOW";
    // v40: LOW / MEDIUM / HIGH stay balanced. HIGH needs real repetition or an outside clue, one odd answer is only MEDIUM.
    if (n >= 3 && flagged >= 2 && flagged / n >= 0.5) {
      why.push(flagged + " of " + n + " answers were flagged: a repeated pattern, not a one-off");
      if (risk === "MEDIUM" && ((ext >= 1 && flagged >= 2) || (mob >= 3 && flagged / n >= 0.75))) risk = "HIGH";
    }
    if (mob >= 2) why.push("the same mobile-reading clues (fluent speech + repeated look-down / long stare) appeared in " + mob + " answers");
    if (high >= 1 && risk === "LOW") risk = "MEDIUM";
    return { risk, why };
  }
  root.RiskModel = { RISK, riskOf, analyseQ, sessionRisk };
  if (typeof module !== "undefined" && module.exports) module.exports = root.RiskModel;
})(typeof window !== "undefined" ? window : globalThis);
