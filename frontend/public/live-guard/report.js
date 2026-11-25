// Builds the interview report as a real PDF (A4) in the same layout as the "Interview report - Saran" sample:
// title, details table, weighted score, skill scores, strengths / areas / how to improve,
// monitoring summary, eye-movement section, question-by-question feedback.
(function (root) {
  "use strict";
  const INK = [28, 27, 58], PURPLE = [109, 63, 224], GREY = [107, 111, 133], LINE = [226, 228, 238];
  const PINK = [216, 27, 122], RED = [220, 38, 38], AMBER = [217, 119, 6], GREEN = [21, 150, 91], BLUE = [37, 99, 235];
  const NONLATIN = /[^\u0000-ɏ‐-•…₹]/g;

  function generate(d) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    const M = 48, W = PW - 2 * M, BOTTOM = PH - 50;
    let y = 52, nonLatin = false;

    const safe = (t) => String(t ?? "").replace(NONLATIN, () => { nonLatin = true; return "?"; });
    const setC = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const font = (size, style = "normal", color = INK) => { doc.setFont("helvetica", style); doc.setFontSize(size); setC(color); };
    const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = 52; } };
    const lines = (t, w, size, style = "normal") => { font(size, style); return doc.splitTextToSize(safe(t), w); };

    function heading(t) { ensure(40); y += 8; font(13, "bold", PURPLE); doc.text(safe(t), M, y); y += 17; }
    function bullets(list, opts = {}) {
      const size = opts.size || 9.5, color = opts.color || INK, lh = size * 1.45;
      for (const b of list) {
        const ls = lines(b, W - 18, size);
        ensure(ls.length * lh + 3);
        font(size, "normal", color);
        doc.setFillColor(...color); doc.circle(M + 6, y - size * 0.32, 1.2, "F");
        ls.forEach((l, i) => doc.text(l, M + 16, y + i * lh));
        y += ls.length * lh + 3;
      }
    }
    function afterTable() { y = doc.lastAutoTable.finalY + 10; }

    // ---- title block
    font(21, "bold", INK); doc.text("Candidate Interview Report", M, y); y += 15;
    font(9, "normal", GREY); doc.text(safe(`${d.role || "Interview"}  |  generated ${d.generated}`), M, y); y += 10;

    doc.autoTable({
      startY: y, margin: { left: M, right: M }, theme: "plain", tableWidth: W,
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.6 } },
      columnStyles: { 0: { cellWidth: 110, textColor: GREY }, 1: { cellWidth: "auto" } },
      body: [
        ["Candidate", safe(d.candidate || "-")],
        ["Email", safe(d.email || "-")],
        ["Level", safe(d.levelEval ? `${d.levelEval.levelName} (${d.levelEval.years})` : "-")],
        ["Started", safe(d.started)],
        ["Duration", safe(d.duration)],
        ["Status", "Completed"],
        ["Overall score", { content: `${d.summary.overall.toFixed(1)} / 100`, styles: { fontStyle: "bold" } }]
      ]
    });
    afterTable();
    font(9.5, "normal", INK);
    y += 4; doc.text(`Weighted interview score: ${d.summary.overall.toFixed(2)}/100 across ${d.summary.mainCount} main question${d.summary.mainCount === 1 ? "" : "s"}.`, M, y); y += 10;

    // ---- final review status (integrity)
    if (d.finalStatus) {
      const fs = d.finalStatus, col = fs.level === "REVIEW" ? RED : fs.level === "MINOR" ? AMBER : fs.level === "INSUFFICIENT" ? GREY : GREEN;
      const why = d.finalReasons && d.finalReasons.length ? "Why: " + d.finalReasons.join("; ") + "." : "";
      const wl = why ? doc.splitTextToSize(safe(why), W - 20) : [];
      const bh = 34 + wl.length * 11; ensure(bh + 8);
      doc.setFillColor(...col); doc.rect(M, y, W, bh, "F");
      font(8, "normal", [255, 255, 255]); doc.text("FINAL REVIEW STATUS (integrity)", M + 10, y + 12);
      font(12, "bold", [255, 255, 255]); doc.text(safe(fs.text), M + 10, y + 27);
      font(8.5, "normal", [255, 255, 255]); wl.forEach((l, i) => doc.text(l, M + 10, y + 40 + i * 11));
      y += bh + 6;
      font(8, "normal", GREY); doc.text(safe(`Face tracking: ${d.trackQ}  |  Video analysed: ${d.analysedSec}s  |  Webcam signals are indicators, not proof.`), M, y + 6); y += 14;
    }


    // ---- v47: identity verification (candidate snapshot at Start + ID snapshot, captured automatically)
    if (d.identity && d.identity.enabled) { // v50: switch OFF = no identity section
      const I = d.identity;
      heading("Identity verification (captured automatically)");
      const pics = [
        ["Candidate face at start" + (I.startClock ? " (" + I.startClock + ")" : ""), I.startSnap],
        ["ID proof with candidate" + (I.idClock ? " (" + I.idClock + ")" : "") + (I.idSnap ? (I.idSnap.cardLike ? " - card-shaped" : " - shape unclear, check by eye") : ""), I.idSnap]
      ];
      if (I.idClose) pics.push(["ID close-up (zoomed)" + (I.idClock ? " (" + I.idClock + ")" : ""), I.idClose]);
      const gap = 10, cw = (W - gap * (pics.length - 1)) / pics.length, maxH = pics.length > 2 ? 190 : 230;
      const fit = pics.map(([, p]) => { if (!p) return { iw: cw, ih: 70 }; const sc = Math.min(cw / p.w, maxH / p.h); return { iw: p.w * sc, ih: p.h * sc }; });
      const rowH = Math.max(...fit.map((f) => f.ih)); ensure(rowH + 40);
      pics.forEach(([cap, p], i) => {
        const x = M + i * (cw + gap), f = fit[i];
        if (p) { try { doc.addImage(p.img, "JPEG", x, y, f.iw, f.ih); } catch {} doc.setDrawColor(...LINE); doc.rect(x, y, f.iw, f.ih); }
        else { doc.setFillColor(238, 238, 244); doc.rect(x, y, cw, 70, "F"); font(9, "normal", GREY); doc.text(safe(i ? (I.enabled ? "ID not captured" : "ID check switched off") : "Not captured"), x + 10, y + 38); }
        font(8, "bold", INK); doc.text(doc.splitTextToSize(safe(cap), cw), x, y + (p ? f.ih : 70) + 11);
      });
      const capLines = Math.max(...pics.map(([cap]) => doc.splitTextToSize(safe(cap), cw).length));
      y += rowH + 14 + capLines * 10;
      const stCol = I.status === "captured" ? GREEN : I.status === "not_shown" ? RED : I.status === "interrupted" ? AMBER : GREY;
      const stTxt = I.status === "captured" ? "ID snapshot captured automatically when it was held steady in front of the camera." : I.status === "not_shown" ? "NO ID was shown to the camera. " + (I.reason || "") : I.status === "interrupted" ? "ID not captured. " + (I.reason || "") : "Automatic ID check was switched off.";
      bullets([stTxt], { color: stCol });
      const said = [I.idType ? "ID type said by the candidate: " + I.idType + "." : "", I.said ? "Candidate said: \"" + I.said + "\"" : ""].filter(Boolean);
      if (said.length) bullets(said);
      bullets(["Interviewer: compare the face on the ID with the candidate, and the name on the ID with the candidate name. This report does NOT read or verify the ID and does NOT match faces; it only keeps the pictures.", "Privacy: this page contains the image of an identity document. Store / share it only as your data-protection rules allow (for Aadhaar prefer a masked copy)."], { color: GREY, size: 8.5 });
    }

    // ---- skill scores (kept together on one page)
    ensure(200); heading("Skill scores");
    const tw = 300, tl = M + (W - tw) / 2;
    doc.autoTable({
      startY: y, margin: { left: tl, right: PW - tl - tw }, tableWidth: tw, theme: "plain",
      head: [["Skill", "Score"]],
      body: d.summary.skills.map((s) => [s.name, `${s.score} / 100`]),
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 6, textColor: INK, lineColor: LINE, lineWidth: 0.6 },
      headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 180 } }
    });
    afterTable();

    // ---- v48: question-wise marks by category + category-wise performance
    if (d.rows.length) {
      const catOf = (r) => r.score.category || (root.Analysis ? root.Analysis.categorize(r.item.question, r.item.answer) : "General");
      heading("Marks by question and category");
      doc.autoTable({
        startY: y, margin: { left: M, right: M }, tableWidth: W, theme: "grid",
        head: [["Q", "Category", "Relevance", "Accuracy", "Technical", "Complete", "Comm.", "Marks /100"]],
        body: d.rows.map((r) => [safe(r.item.follow ? "Follow-up" : r.item.label), safe(catOf(r)), r.score.relevance, r.score.accuracy, r.score.technical, r.score.completeness, r.score.communication, { content: String(r.score.total), styles: { fontStyle: "bold" } }]),
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.5, halign: "center" },
        headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 44, halign: "left" }, 1: { cellWidth: "auto", halign: "left" } }
      });
      afterTable();
      const cats = d.summary.categories || [];
      if (cats.length) {
        heading("Category-wise performance");
        doc.autoTable({
          startY: y, margin: { left: M, right: M }, tableWidth: W, theme: "grid",
          head: [["Category", "Questions", "Avg marks /100", "Result"]],
          body: cats.map((c) => [safe(c.name), safe(c.questions.join(", ")), c.avg, c.level]),
          styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
          headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold" },
          columnStyles: { 2: { halign: "center" }, 3: { halign: "center", fontStyle: "bold" } },
          didParseCell: (h) => { if (h.section === "body" && h.column.index === 3) h.cell.styles.textColor = h.cell.raw === "Strong" ? GREEN : h.cell.raw === "Weak" ? RED : AMBER; }
        });
        afterTable();
      }
    }

    // ---- v47: level-based evaluation
    if (d.levelEval) {
      const L = d.levelEval, col = L.fit === "MEETS" || L.fit === "ABOVE" ? GREEN : L.fit === "CLOSE" ? AMBER : RED;
      heading("Level-based evaluation");
      bullets([`Selected level: ${L.levelName} (${L.years}). What is expected: ${L.expect}.`]);
      bullets([`Result: ${L.fit}. ${L.text}`], { color: col });
      bullets([`The answers look like ${L.demonstratedName} level (average depth signals per answer: ${L.depthAvg}; signals = example, reason, trade-off, limitation, when to use, performance).`, `Marks for this level weigh: ${Object.entries(L.weights).map(([k, v]) => k + " " + Math.round(v * 100) + "%").join(", ")}. The five skill scores above are on one common scale for every level.`], { color: GREY, size: 9 });
    }

    heading("Strengths"); bullets(d.summary.strengths.length ? d.summary.strengths : ["Not enough answers to identify a strength."]);
    heading("Areas to improve"); bullets(d.summary.areas.length ? d.summary.areas : ["No skill scored below 60/100."]);
    heading("How to improve"); bullets(d.summary.how.length ? d.summary.how : ["Keep practising with structured, example-based answers."]);

    // ---- monitoring
    doc.addPage(); y = 52;
    heading("Monitoring summary (face / eye detection)");
    bullets(d.monitoring.length ? d.monitoring : ["No face / eye / phone flags were recorded."]);
    if (d.monitoringQuality) bullets([`Monitoring coverage: exactly one face in ${d.monitoringQuality.exactlyOneFaceFrames}/${d.monitoringQuality.analysedFrames} analysed frames (${d.monitoringQuality.exactlyOneFacePercent}%). Usable answer windows: ${d.monitoringQuality.usableAnswerWindows}.`], { color: GREY });
    bullets(["Review score is a heuristic indicator, not a calibrated probability. Camera-based signals can be wrong; review the timestamps and evidence before making any decision."], { color: GREY });
    y += 4;

    // ---- eye movement block
    const eye = d.eye;
    ensure(130);
    doc.setFillColor(...PINK); doc.rect(M, y, W, 22, "F");
    font(11, "bold", [255, 255, 255]); doc.text("Eye Movement Detection (AI-Assisted Answer Check)", M + 10, y + 15); y += 22;
    const cw = W / 5, cells = [
      ["Gaze on screen", eye.gazePct == null ? "n/a" : eye.gazePct + "%", eye.gazePct == null ? GREY : eye.gazePct >= 70 ? GREEN : RED, "Of answer time"],
      ["Off-screen glances", String(eye.glances), BLUE, "Total, all questions"],
      ["Reading pattern", `${eye.reading} / ${eye.assessed}`, eye.reading ? RED : GREEN, eye.reading ? `${eye.reading} answer(s) flagged` : "No answer flagged"],
      ["Heuristic review score", eye.secondScreen == null ? "n/a" : eye.secondScreen + "/100", eye.secondScreen == null ? GREY : eye.secondScreen >= 50 ? RED : eye.secondScreen >= 25 ? AMBER : GREEN, "Not a probability; gaze / speech signals"],
      ["AI-answer risk", eye.aiRisk + (eye.aiScore != null ? " (" + eye.aiScore + "/100)" : ""), eye.aiRisk === "HIGH" ? RED : eye.aiRisk === "MEDIUM" ? AMBER : eye.aiRisk === "LOW" ? GREEN : GREY, eye.flagged.length ? "Review " + eye.flagged.join(", ") : "No review needed"]
    ];
    doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.rect(M, y, W, 62);
    cells.forEach((c, i) => {
      const x = M + i * cw; if (i) doc.line(x, y, x, y + 62);
      font(7.5, "normal", GREY); doc.text(safe(c[0]), x + 7, y + 13);
      font(16, "bold", c[2]); doc.text(safe(c[1]), x + 7, y + 36);
      font(7, "normal", GREY); doc.text(doc.splitTextToSize(safe(c[3]), cw - 12), x + 7, y + 50);
    });
    y += 68;

    doc.autoTable({
      startY: y, margin: { left: M, right: M }, tableWidth: W, theme: "plain",
      head: [["#", "Gaze on\nscreen", "Off-screen\nglances", "Reading\npattern", "Observation", "AI risk"]],
      body: d.eyeRows.length ? d.eyeRows : [["-", "-", "-", "-", "No answer-time gaze measurements were available.", "-"]],
      styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.5, valign: "middle" },
      headStyles: { fillColor: PINK, textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 34, fontStyle: "bold" }, 1: { cellWidth: 48 }, 2: { cellWidth: 56 }, 3: { cellWidth: 50 }, 5: { cellWidth: 52, halign: "center", fontStyle: "bold" } },
      didParseCell: (h) => {
        if (h.section === "body" && h.column.index === 5) {
          const v = String(h.cell.raw);
          const col = v.startsWith("HIGH") ? RED : v.startsWith("MEDIUM") ? AMBER : v.startsWith("LOW") ? GREEN : null;
          if (col) { h.cell.styles.fillColor = col; h.cell.styles.textColor = 255; }
        }
      }
    });
    afterTable();
    font(8, "normal", GREY);
    const note = doc.splitTextToSize("Indicators from the webcam, not proof. Lighting, glasses and camera position affect them. Review the answers before deciding. For the interviewer only.", W);
    ensure(note.length * 11); doc.text(note, M, y); y += note.length * 11 + 6;


    // ---- v51: is the candidate reading an AI / ChatGPT answer? ONE row per question: combined verdict + wording + the full eye / voice / phone observation
    if (d.aiRows && d.aiRows.length) {
      ensure(120);
      heading("AI answer check (is the candidate reading ChatGPT / an AI answer?)");
      const nHi = d.aiRows.filter((r) => /^HIGH/.test(r[4])).length, nMid = d.aiRows.filter((r) => /^MEDIUM/.test(r[4])).length;
      const head = nHi ? `${nHi} answer(s) rated HIGH (likely reading an AI / written answer)${nMid ? `, ${nMid} more need a review` : ""}.` : nMid ? `${nMid} answer(s) need a review for AI / prepared wording or reading.` : "No answer looked like a read-out AI / written answer.";
      bullets([head], { color: nHi ? RED : nMid ? AMBER : GREEN, size: 9.5 });
      if (d.aiFlagLines && d.aiFlagLines.length) bullets(d.aiFlagLines, { color: nHi ? RED : AMBER, size: 9 });
      if (d.aiJumps && d.aiJumps.length) bullets(d.aiJumps, { color: AMBER, size: 9 });
      doc.autoTable({
        startY: y, margin: { left: M, right: M }, tableWidth: W, theme: "plain",
        head: [["#", "Verdict", "Wording & structure", "Observation (eyes, voice, phone)", "AI risk"]],
        body: d.aiRows.map((r) => r.map((c) => safe(c))),
        styles: { font: "helvetica", fontSize: 7.5, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.5, valign: "middle", overflow: "linebreak" },
        headStyles: { fillColor: PINK, textColor: 255, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 32, fontStyle: "bold" }, 1: { cellWidth: 78, fontStyle: "bold" }, 2: { cellWidth: 150 }, 4: { cellWidth: 48, halign: "center", fontStyle: "bold" } },
        didParseCell: (h) => {
          if (h.section !== "body") return; const v = String(h.cell.raw);
          if (h.column.index === 1) { const col = /^LIKELY/.test(v) ? RED : /^POSSIBLE/.test(v) ? AMBER : /^Natural/.test(v) ? GREEN : null; if (col) { h.cell.styles.fillColor = col; h.cell.styles.textColor = 255; } }
          if (h.column.index === 4) { const col = v.startsWith("HIGH") ? RED : v.startsWith("MEDIUM") ? AMBER : v.startsWith("LOW") ? GREEN : null; if (col) { h.cell.styles.fillColor = col; h.cell.styles.textColor = 255; } }
        }
      });
      afterTable();
      font(8, "normal", GREY);
      const n2 = doc.splitTextToSize("One verdict per question, built from BOTH the wording (stock ChatGPT phrases, textbook definitions, lists, even sentences, no personal experience) AND how it was delivered (fluent vs hesitant speech, flat voice, silence before the answer, eyes looking down / away while still talking, phone-use events, typing, another voice). The AI-risk score is the same as in the eye-movement table. Textbook words spoken hesitantly look like a definition learned by heart, not read. An indicator, not proof: ask a follow-up (\"give an example from your own project\") to confirm.", W);
      ensure(n2.length * 11); doc.text(n2, M, y); y += n2.length * 11 + 6;
    }

    // ---- v32 pattern analysis: phone beside laptop / second monitor / thinking vs reading
    if (d.insights) {
      const I = d.insights, SM = I.secondMonitor, PB = I.phoneBeside, TR = I.thinkingReading;
      heading("Pattern analysis (review signals, not proof)");
      bullets([
        `Phone / notes beside the laptop: ${PB.answers ? `repeated looks to the ${PB.side} side in ${PB.answers} of ${PB.ofAnswers} assessable answer(s)` : "no repeated same-side pattern"}. A phone seen by the camera together with the same-side looks is the strongest combination.`,
        `Second monitor: ${SM.insufficient ? "not enough tracked answers to judge" : SM.level + (SM.direction ? `, looks ${SM.direction} in ${SM.answers} of ${SM.ofAnswers} answers (confidence ${SM.confidence}%)` : ", no repeated out-of-screen direction")}. Screen share: ${I.shareText}.`,
        `Thinking vs reading: ${TR.THINKING} answer(s) look like thinking, ${TR.MIXED} mixed, ${TR.READING} reading-like, ${TR.INSUFFICIENT} could not be assessed (too short / face hidden).`
      ]);
      (SM.limits || []).forEach((l) => bullets(["Limit: " + l], { color: GREY }));
      doc.autoTable({
        startY: y, margin: { left: M, right: M }, tableWidth: W, theme: "plain",
        head: [["#", "Thinking vs reading", "Phone beside laptop", "Evidence"]],
        body: I.perAnswer.length ? I.perAnswer.map((x) => [x.label, x.t.label + (x.t.label === "INSUFFICIENT" ? "" : ` (R${x.t.readingScore}/T${x.t.thinkingScore})`), x.p.insufficient ? "n/a" : x.p.level + (x.p.side ? " " + x.p.side : ""), (x.t.readingClues.length ? "Reading clues: " + x.t.readingClues.join("; ") + ". " : "") + (x.t.thinkingClues.length ? "Thinking clues: " + x.t.thinkingClues.join("; ") + ". " : "") + (x.p.evidence.length ? "Side/phone: " + x.p.evidence.join("; ") + "." : "") || x.t.note || "-"]) : [["-", "-", "-", "No answer-time measurements were available."]],
        styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.5, valign: "middle" },
        headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 34, fontStyle: "bold" }, 1: { cellWidth: 82 }, 2: { cellWidth: 72 } },
        didParseCell: (h) => {
          if (h.section !== "body") return; const v = String(h.cell.raw);
          if (h.column.index === 1 && v.startsWith("READING")) { h.cell.styles.fillColor = RED; h.cell.styles.textColor = 255; }
          else if (h.column.index === 1 && v.startsWith("MIXED")) { h.cell.styles.fillColor = AMBER; h.cell.styles.textColor = 255; }
          else if (h.column.index === 2 && (v.startsWith("STRONG") || v.startsWith("REVIEW"))) { h.cell.styles.fillColor = v.startsWith("STRONG") ? RED : AMBER; h.cell.styles.textColor = 255; }
        }
      });
      afterTable();
    }

    // ---- random-number challenge
    if (d.challenge && d.challenge.length) {
      heading("Random-number gaze challenge");
      d.challenge.forEach((c, i) => {
        bullets([`Run ${i + 1} (at ${c.clock}): ${c.level}. ${c.text}`, c.why.join("; ") + "."], { color: c.level === "FAIL" ? RED : c.level === "REVIEW" ? AMBER : INK });
        doc.autoTable({
          startY: y, margin: { left: M, right: M }, tableWidth: W, theme: "plain",
          head: [["#", "Number shown", "Screen position", "Candidate said it", "Gaze matched"]],
          body: c.rounds.map((r) => [String(r.k), r.shown, (r.ty === 0 ? "top" : r.ty === 1 ? "bottom" : "middle") + " " + (r.tx === 0 ? "left" : r.tx === 1 ? "right" : "centre"), r.said == null ? "n/a" : r.said === 1 ? "Yes" : r.said === 0.5 ? "Partly" : "No", r.hit == null ? "n/a" : r.hit ? "Yes" : "No"]),
          styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
          headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold" }
        });
        afterTable();
      });
    }

    // ---- evidence timeline (every flag with the time it happened, so the interviewer can jump to it in the recording)
    heading("Event timeline (evidence timestamps)");
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, tableWidth: W, theme: "plain",
      head: [["Time", "Event", "Detail"]],
      body: (d.timeline && d.timeline.length) ? d.timeline.map((t) => [t.clock, t.label, t.detail]) : [["-", "No flags recorded", "-"]],
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
      headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 48, fontStyle: "bold" }, 1: { cellWidth: 140 } }
    });
    afterTable();

    // ---- behaviour fusion alerts (several signals judged together over 8 s windows)
    heading("Behaviour fusion alerts (signals combined over time)");
    bullets(["*Signal score is a rule-based display value, not a statistically calibrated confidence or probability."], { color: GREY });
    const fmtT = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, tableWidth: W, theme: "plain",
      head: [["From - to", "Level", "Signal score*", "What agreed"]],
      body: (d.fusion && d.fusion.length) ? d.fusion.map((f) => [`${fmtT(f.startS)} - ${fmtT(f.endS)}`, f.level === "PRIORITY" ? "Priority review" : "Review", f.conf + "%", f.reasons.join("; ")]) : [["-", "None", "-", "No sustained or combined signal was seen. Tracking: " + (d.trackQ || "-")]],
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
      headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 70, fontStyle: "bold" }, 2: { cellWidth: 60 } },
      didParseCell: (h) => { if (h.section === "body" && h.column.index === 1) { const v = String(h.cell.raw); if (v === "Priority review") { h.cell.styles.fillColor = RED; h.cell.styles.textColor = 255; } else if (v === "Review") { h.cell.styles.fillColor = AMBER; h.cell.styles.textColor = 255; } } }
    });
    afterTable();

    // ---- evidence snapshots (pictures taken at the moment of each flag, plus the ear check)
    if (d.evidence && d.evidence.length) {
      ensure(170); heading("Evidence snapshots");
      const cols = 3, gap = 8, cw = (W - gap * (cols - 1)) / cols; let col = 0, rowH = 0, rowTop = y;
      for (const e of d.evidence) {
        const ih = Math.min(cw * 0.85, cw * (e.h || 3) / (e.w || 4)), cell = ih + 34;
        if (col === 0) { ensure(cell); rowTop = y; rowH = 0; }
        const x = M + col * (cw + gap);
        try { doc.addImage(e.img, "JPEG", x, rowTop, cw, ih); } catch {}
        font(8, "bold", INK); doc.text(safe(`${e.clock}  ${e.label}`), x, rowTop + ih + 11);
        font(7, "normal", GREY); doc.text(doc.splitTextToSize(safe(e.detail || ""), cw).slice(0, 2), x, rowTop + ih + 21);
        rowH = Math.max(rowH, cell); col++;
        if (col === cols) { y = rowTop + rowH; col = 0; }
      }
      if (col !== 0) y = rowTop + rowH;
      y += 6;
    }

    // ---- question-by-question
    heading("Question-by-question feedback");
    if (!d.rows.length) bullets(["No interviewer questions were detected. Check that the meeting tab audio and the microphone were both shared and recognised."]);
    for (const r of d.rows) {
      const it = r.item, sc = r.score;
      const lvTag = d.levelEval && typeof sc.rawTotal === "number" && sc.rawTotal !== sc.total ? ` ${d.levelEval.levelName} | general ${sc.rawTotal}` : "";
      const catTag = sc.category || (root.Analysis ? root.Analysis.categorize(it.question, it.answer) : "");
      const title = `${it.follow ? "Follow-up" : it.label}: ${it.question}${it.qNote ? " (" + it.qNote + ")" : ""}  [${sc.total}/100${lvTag}]${catTag ? "  - Category: " + catTag : ""}`;
      const tl2 = lines(title, W, 10, "bold");
      const ans = lines("Answer: " + (it.answer.trim() || (it.clarifyTexts && it.clarifyTexts.length ? "(no answer - the candidate only said: \"" + it.clarifyTexts.join(" / ") + "\")" : "(no answer captured)")), W - 18, 9);
      const fb = lines("Feedback: " + sc.feedback, W - 18, 9);
      const chk = [];
      if (sc.verdict && sc.verdict !== "Not checked") chk.push("Answer check: " + sc.verdict + (sc.knowledgeTopic ? " (" + sc.knowledgeTopic + ")" : "") + (sc.wrongClaims ? " - wrong: " + sc.wrongClaims : "") + (sc.missing ? " - missing: " + sc.missing : ""));
      if (sc.correctAnswer && sc.verdict !== "Correct") chk.push("Expected answer: " + sc.correctAnswer);
      if (sc.levelNote) chk.push("Level check (" + (d.levelEval ? d.levelEval.levelName : "") + "): " + sc.levelNote);
      ensure(tl2.length * 13 + 40);
      y += it.follow ? 3 : 8;
      font(10, "bold", INK); tl2.forEach((l, i) => doc.text(l, M, y + i * 13)); y += tl2.length * 13;
      bullets([ans.join(" ")], { size: 9, color: GREY });
      bullets([`Marks by skill: Relevance ${sc.relevance}, Accuracy ${sc.accuracy}, Technical ${sc.technical}, Completeness ${sc.completeness}, Communication ${sc.communication}  =  ${sc.total}/100`], { size: 9, color: INK });
      bullets([fb.join(" ")], { size: 9, color: GREY });
      if (chk.length) bullets([lines(chk.join("  "), W - 18, 9).join(" ")], { size: 9, color: sc.verdict === "Incorrect" ? RED : sc.verdict === "Partially correct" ? AMBER : GREEN });
    }

    // page numbers
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); font(8, "normal", GREY); doc.text(`Page ${i} of ${n}`, PW - M, PH - 24, { align: "right" }); doc.text("For interviewer review only", M, PH - 24); }
    doc.setProperties({ title: "Interview report - " + safe(d.candidate || "Candidate"), creator: "AI Interview Proctor" });
    return { doc, nonLatin };
  }
  root.ReportPDF = { generate };
})(typeof window !== "undefined" ? window : globalThis);
