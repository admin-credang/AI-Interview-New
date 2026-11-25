// v47: LEVEL-BASED EVALUATION (Junior / Intermediate / Senior).
// The interviewer picks the level in "Candidate details". The same answer is then marked against what that level should know:
//   - Junior       : basics matter most (relevance + accuracy). A short, correct definition is a good answer.
//   - Intermediate : the original balanced weighting (unchanged behaviour of v46).
//   - Senior       : depth matters most (technical knowledge + completeness). A correct but shallow answer (no example, no reason,
//                    no trade-off / limitation) is marked down.
// The five skill scores (relevance, accuracy, technical, completeness, communication) stay on ONE absolute scale for every level;
// only the weighting of the total and a "depth" rule change, so the marks stay explainable.
(function (root) {
  "use strict";
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const LEVELS = {
    junior: {
      id: "junior", name: "Junior", years: "0-2 years",
      weights: { relevance: 0.30, accuracy: 0.30, technical: 0.15, completeness: 0.15, communication: 0.10 },
      depthNeeded: 0,   // depth signals (example / reason / trade-off ...) expected in an answer
      passMark: 50,     // overall level-adjusted score that "meets" the level
      expect: "clear basics: correct definition, simple example"
    },
    intermediate: {
      id: "intermediate", name: "Intermediate", years: "2-5 years",
      weights: { relevance: 0.25, accuracy: 0.25, technical: 0.20, completeness: 0.20, communication: 0.10 },
      depthNeeded: 1,
      passMark: 60,
      expect: "correct definition plus a practical example or reason"
    },
    senior: {
      id: "senior", name: "Senior", years: "5+ years",
      weights: { relevance: 0.15, accuracy: 0.25, technical: 0.30, completeness: 0.25, communication: 0.05 },
      depthNeeded: 2,
      passMark: 70,
      expect: "depth: why / when to use it, trade-offs, limitations, real-world example"
    }
  };
  const ORDER = ["junior", "intermediate", "senior"];
  const norm = (lv) => { const k = String(lv || "").toLowerCase().trim(); return LEVELS[k] ? k : k.startsWith("jun") ? "junior" : k.startsWith("sen") ? "senior" : "intermediate"; };
  const get = (lv) => LEVELS[norm(lv)];

  // ---- depth signals: what separates a senior answer from a textbook definition (works on the speech transcript, offline)
  const DEPTH = [
    ["example", /\b(for example|for instance|e\.?g\.?|such as|in my (project|experience|work)|in a project|i (used|have used|worked|built))\b/i],
    ["reason", /\b(because|the reason|that is why|that's why|so that|in order to|helps? to|which means)\b/i],
    ["trade-off", /\b(trade[- ]?off|advantage|disadvantage|pros?|cons?|drawback|downside|versus|vs\.?|compared (to|with)|instead of|better than|slower|faster)\b/i],
    ["limitation / edge case", /\b(limitation|edge case|corner case|except|only if|unless|however|but if|problem (is|with)|issue (is|with)|fails?|error)\b/i],
    ["when to use", /\b(when (to )?(use|we use|you use|should)|use case|used (when|for|in)|best (for|when)|suitable|real[- ]world|production)\b/i],
    ["performance / scale", /\b(performance|complexity|time complexity|o\(|memory|scalab\w*|optimi[sz]\w*|efficient\w*|latency|throughput)\b/i]
  ];
  function depthSignals(answer) {
    const t = String(answer || ""); const found = [];
    for (const [name, re] of DEPTH) if (re.test(t)) found.push(name);
    return found;
  }

  /**
   * score = one answer's absolute score from Analysis.scoreAnswer / the AI ({relevance, accuracy, technical, completeness, communication, total, verdict, dontKnow, wordCount}).
   * Returns a NEW object: same skills, level-weighted `total`, `rawTotal` (what v46 would have given) and a short `levelNote`.
   */
  function adjust(score, level, answerText) {
    const L = get(level), s = score || {};
    const raw = typeof s.total === "number" ? s.total : 0;
    const out = { ...s, rawTotal: raw, level: L.id };
    const answered = (s.wordCount == null ? String(answerText || "").trim().split(/\s+/).filter(Boolean).length : s.wordCount) > 0;
    if (!answered) { out.total = 0; out.levelNote = ""; out.depth = []; return out; }
    const W = L.weights;
    let t = W.relevance * (s.relevance || 0) + W.accuracy * (s.accuracy || 0) + W.technical * (s.technical || 0) + W.completeness * (s.completeness || 0) + W.communication * (s.communication || 0);
    const depth = depthSignals(answerText);
    const notes = [];
    if (s.dontKnow) { t = Math.min(t, 15); notes.push("The candidate said they did not know."); }
    else if (L.id === "senior") {
      // a senior answer must show depth. Fewer depth signals than expected -> proportional reduction (max -20%); correct-but-basic is capped.
      const gap = Math.max(0, L.depthNeeded - depth.length);
      if (gap > 0) { t *= 1 - 0.10 * gap; notes.push(`Senior level expects ${L.expect}; found ${depth.length ? depth.join(", ") : "no depth (no example / reason / trade-off)"}.`); }
      if (s.verdict === "Correct" && depth.length < 2) t = Math.min(t, 68);
    } else if (L.id === "intermediate") {
      if (depth.length === 0 && s.verdict === "Correct") notes.push("Correct, but add a practical example or reason to show hands-on experience.");
    } else { // junior: a correct basic answer is a good answer
      if (s.verdict === "Correct") t = Math.max(t, 70);
      else if (s.verdict === "Partially correct") t = Math.max(t, 50);
      if (depth.length >= 1 && t >= 60) notes.push("Good: gave an example / reason, which is above junior expectation.");
    }
    out.total = cl(Math.round(t), 0, 100);
    out.depth = depth;
    out.levelNote = notes.join(" ");
    return out;
  }

  /** Apply adjust() to every row {item, score} and return new rows (input untouched). */
  function applyToRows(rows, level) {
    return rows.map((r) => ({ ...r, score: adjust(r.score, level, r.item && r.item.answer) }));
  }

  /**
   * Overall verdict for the report.
   *   expected   : the level the interviewer selected
   *   overall    : level-adjusted overall score (0-100, from buildSummary)
   *   fit        : MEETS / CLOSE / BELOW / ABOVE  (against that level's pass mark)
   *   demonstrated: which level the answers actually looked like (independent of the selection)
   */
  function evaluate(rows, level, overall) {
    const L = get(level), answered = rows.filter((r) => r.score && (r.score.wordCount || 0) > 0 && !r.score.dontKnow);
    const rawAvg = rows.length ? rows.reduce((s, r) => s + (typeof r.score.rawTotal === "number" ? r.score.rawTotal : r.score.total || 0), 0) / rows.length : 0;
    const depthAvg = answered.length ? answered.reduce((s, r) => s + ((r.score.depth || depthSignals(r.item && r.item.answer)).length), 0) / answered.length : 0;
    // demonstrated level uses the level-independent (intermediate-weighted) score + depth
    const base = rows.length ? rows.reduce((s, r) => s + intermediateTotal(r.score), 0) / rows.length : 0;
    let demonstrated = "junior";
    if (base >= 72 && depthAvg >= 1.5) demonstrated = "senior"; else if (base >= 52 && depthAvg >= 0.5) demonstrated = "intermediate"; else if (base >= 62) demonstrated = "intermediate";
    const ov = typeof overall === "number" ? overall : rawAvg;
    let fit;
    if (ov >= L.passMark + 15 && ORDER.indexOf(demonstrated) > ORDER.indexOf(L.id)) fit = "ABOVE";
    else if (ov >= L.passMark) fit = "MEETS";
    else if (ov >= L.passMark - 10) fit = "CLOSE";
    else fit = "BELOW";
    const dn = LEVELS[demonstrated].name;
    const text = fit === "ABOVE" ? `Answers are stronger than the ${L.name} level (look like ${dn} level).`
      : fit === "MEETS" ? `Meets the ${L.name} level (needs ${L.passMark}+, scored ${ov.toFixed(1)}).`
      : fit === "CLOSE" ? `Close to the ${L.name} level (needs ${L.passMark}+, scored ${ov.toFixed(1)}); small gaps remain.`
      : `Below the ${L.name} level (needs ${L.passMark}+, scored ${ov.toFixed(1)}); the answers look like ${dn} level.`;
    return { level: L.id, levelName: L.name, years: L.years, expect: L.expect, passMark: L.passMark, weights: L.weights, overall: ov, fit, demonstrated, demonstratedName: dn, depthAvg: Math.round(depthAvg * 10) / 10, text };
  }
  function intermediateTotal(s) { const W = LEVELS.intermediate.weights; return (W.relevance * (s.relevance || 0) + W.accuracy * (s.accuracy || 0) + W.technical * (s.technical || 0) + W.completeness * (s.completeness || 0) + W.communication * (s.communication || 0)); }

  /** extra text for the AI evaluator so it also judges against the level (scores stay absolute; the level weighting is applied here) */
  function promptNote(level) {
    const L = get(level);
    return `Target level of this candidate: ${L.name} (${L.years}). Expected: ${L.expect}. Score every skill on an ABSOLUTE scale (do not inflate or deflate for the level); the level weighting is applied afterwards. In the feedback say briefly whether the answer is enough for a ${L.name}.`;
  }

  const API = { LEVELS, ORDER, norm, get, depthSignals, adjust, applyToRows, evaluate, promptNote };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.CandidateLevel = API;
})(typeof window !== "undefined" ? window : globalThis);
