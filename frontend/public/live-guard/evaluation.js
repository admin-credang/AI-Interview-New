// Accuracy check for the proctor: compare the flags in a report .json with YOUR labels of what really happened.
// labels = [{ "s": 75, "type": "phone_use" }, ...]   (s = seconds from interview start, type = the flag name in the report)
// A flag is a correct hit (TP) when a label of the same type is within +-tolerance seconds. Unmatched flag = FP, unmatched label = FN.
// v32: evaluateMany() adds a multi-recording dashboard (per flag type, per scenario, false alerts per 10 min, readiness verdict).
(function (root) {
  const ratio = (a, b) => (b ? a / b : null);
  const f1of = (p, r) => (p != null && r != null && p + r > 0 ? 2 * p * r / (p + r) : null);

  function evaluate(flags, labels, tol) {
    tol = tol == null ? 6 : tol; const types = [...new Set([...flags.map((f) => f.type), ...labels.map((l) => l.type)])], out = {};
    for (const t of types) {
      const F = flags.filter((f) => f.type === t).map((f) => f.s), L = labels.filter((l) => l.type === t).map((l) => l.s), used = new Set(); let tp = 0;
      for (const f of F) { const i = L.findIndex((l, k) => !used.has(k) && Math.abs(l - f) <= tol); if (i >= 0) { used.add(i); tp++; } }
      const fp = F.length - tp, fn = L.length - tp, p = F.length ? tp / F.length : null, r = L.length ? tp / L.length : null;
      out[t] = { tp, fp, fn, precision: p, recall: r, f1: f1of(p, r) };
    }
    return out;
  }

  /** like evaluate(), but also says for every single flag whether it was a hit (TP) or a false alarm (FP), and which labels were missed */
  function matchDetail(flags, labels, tol) {
    tol = tol == null ? 6 : tol; const flagRes = flags.map((f) => ({ ...f, hit: false })), usedL = new Set();
    flagRes.forEach((f) => {
      const i = labels.findIndex((l, k) => !usedL.has(k) && l.type === f.type && Math.abs(l.s - f.s) <= tol);
      if (i >= 0) { usedL.add(i); f.hit = true; }
    });
    return { flags: flagRes, missed: labels.filter((_, k) => !usedL.has(k)) };
  }

  /**
   * recordings = [{ name, scenario, durationS, flags:[{s,type}], labels:[{s,type}] }]
   * Returns { overall, byType, byScenario, recordings, verdict }
   *  - byType     = TP/FP/FN summed over ALL recordings (micro) + precision / recall / F1
   *  - byScenario = per kind of test (normal_thinking, phone_beside_laptop, ...) with false alerts per 10 minutes
   */
  function evaluateMany(recordings, tol, opts) {
    tol = tol == null ? 6 : tol;
    const minRec = (opts && opts.minRecordings) || 5, tgtP = (opts && opts.targetPrecision) || 0.8, tgtR = (opts && opts.targetRecall) || 0.7;
    const byType = {}, byScn = {}, recs = [];
    let TP = 0, FP = 0, FN = 0, totalS = 0;
    for (const rec of recordings) {
      const md = matchDetail(rec.flags || [], rec.labels || [], tol);
      const tp = md.flags.filter((f) => f.hit).length, fp = md.flags.length - tp, fn = md.missed.length;
      TP += tp; FP += fp; FN += fn; totalS += rec.durationS || 0;
      const types = new Set([...md.flags.map((f) => f.type), ...md.missed.map((m) => m.type)]);
      types.forEach((t) => {
        const o = byType[t] || (byType[t] = { tp: 0, fp: 0, fn: 0 });
        o.tp += md.flags.filter((f) => f.type === t && f.hit).length; o.fp += md.flags.filter((f) => f.type === t && !f.hit).length; o.fn += md.missed.filter((m) => m.type === t).length;
      });
      const sc = rec.scenario || "other", S = byScn[sc] || (byScn[sc] = { recordings: 0, tp: 0, fp: 0, fn: 0, durationS: 0 });
      S.recordings++; S.tp += tp; S.fp += fp; S.fn += fn; S.durationS += rec.durationS || 0;
      recs.push({ name: rec.name, scenario: sc, durationS: rec.durationS || 0, tp, fp, fn, flags: md.flags, missed: md.missed });
    }
    const fin = (o) => { o.precision = ratio(o.tp, o.tp + o.fp); o.recall = ratio(o.tp, o.tp + o.fn); o.f1 = f1of(o.precision, o.recall); return o; };
    Object.values(byType).forEach(fin);
    Object.values(byScn).forEach((o) => { fin(o); o.falsePer10Min = o.durationS ? Math.round((o.fp / (o.durationS / 600)) * 10) / 10 : null; });
    const overall = fin({ tp: TP, fp: FP, fn: FN, recordings: recordings.length, durationS: totalS });
    overall.falsePer10Min = totalS ? Math.round((FP / (totalS / 600)) * 10) / 10 : null;
    const f1s = Object.values(byType).map((o) => o.f1).filter((x) => x != null);
    overall.macroF1 = f1s.length ? f1s.reduce((a, b) => a + b, 0) / f1s.length : null;
    // readiness: never "ready" on a handful of recordings, and normal-behaviour recordings must stay (almost) free of flags
    const normal = byScn.normal_thinking, reasons = [];
    let level = "OK";
    if (recordings.length < minRec) { level = "TOO_FEW"; reasons.push(`only ${recordings.length} recording(s); use at least ${minRec} (with normal thinking, phone, notes, second monitor, helper) before trusting any number`); }
    if (!normal) { if (level === "OK") level = "INCOMPLETE"; reasons.push("no normal_thinking recording: false alarms on honest candidates are not measured yet"); }
    else if (normal.fp > 0) { level = "TUNE"; reasons.push(`${normal.fp} false alarm(s) on normal thinking (${normal.falsePer10Min}/10 min); lower sensitivity before client use`); }
    if (overall.precision != null && overall.precision < tgtP) { level = "TUNE"; reasons.push(`precision ${Math.round(overall.precision * 100)}% is below the ${Math.round(tgtP * 100)}% target`); }
    if (overall.recall != null && overall.recall < tgtR) { if (level === "OK") level = "TUNE"; reasons.push(`recall ${Math.round(overall.recall * 100)}% is below the ${Math.round(tgtR * 100)}% target`); }
    if (level === "OK") reasons.push("targets met on these recordings; still validate with new recordings and real meeting audio");
    return { overall, byType, byScenario: byScn, recordings: recs, verdict: { level, reasons } };
  }

  /** labels typed as lines "01:15 phone_use" / "75 phone_use" / "1:15,phone_use", or as a JSON array */
  function parseLabels(text) {
    const t = String(text || "").trim(); if (!t) return [];
    if (t[0] === "[") return JSON.parse(t).map((x) => ({ s: Number(x.s), type: String(x.type) }));
    const out = [];
    for (const line of t.split(/\r?\n/)) {
      const m = line.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)\s*[,\s]\s*([a-z_]+)$/i); if (!m) { if (line.trim()) throw new Error("Cannot read label line: " + line); continue; }
      out.push({ s: (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]), type: m[3].toLowerCase() });
    }
    return out;
  }
  const toCSV = (res) => {
    const rows = [["section", "name", "recordings", "TP", "FP", "FN", "precision", "recall", "F1", "false_alerts_per_10min"]], q = (v) => (v == null ? "" : typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
    Object.entries(res.byType).forEach(([k, v]) => rows.push(["type", k, "", v.tp, v.fp, v.fn, q(v.precision), q(v.recall), q(v.f1), ""]));
    Object.entries(res.byScenario).forEach(([k, v]) => rows.push(["scenario", k, v.recordings, v.tp, v.fp, v.fn, q(v.precision), q(v.recall), q(v.f1), q(v.falsePer10Min)]));
    const o = res.overall; rows.push(["overall", "all", o.recordings, o.tp, o.fp, o.fn, q(o.precision), q(o.recall), q(o.f1), q(o.falsePer10Min)]);
    return rows.map((r) => r.join(",")).join("\n");
  };
  root.ProctorEval = { evaluate, matchDetail, evaluateMany, parseLabels, toCSV };
})(typeof window !== "undefined" ? window : globalThis);
