// v50: "is this answer worded like ChatGPT / an AI / a web page?"  Pure functions, no DOM, unit-tested.
// The page cannot see a ChatGPT window; it can only hear HOW the answer is worded and how it is delivered.
// Real speech is messy (fillers, restarts, "I think", short sentences). AI text read aloud is polished: stock phrases ("plays a crucial role",
// "in summary", "key features include"), numbered structure (firstly / secondly / thirdly), even sentence lengths, no hesitation, no personal experience.
// These are INDICATORS for the interviewer, never proof.
(function (root) {
  "use strict";
  // stock phrases that AI answers use and people almost never say in a spoken interview
  const STOCK = [
    ["in summary|to summari[sz]e|in conclusion|in essence|overall,? (python|it|this)", "closing summary phrase"],
    ["key (features?|points?|differences?|advantages?|benefits?|characteristics|aspects|components|concepts?)( include| are)?", "\"key features / points\" wording"],
    ["plays? an? (crucial|vital|important|key|significant|pivotal) role", "\"plays a crucial role\""],
    ["a wide (range|variety|array) of", "\"a wide range of\""],
    ["(it|this) is (important|worth|essential|crucial) to (note|mention|understand|remember)", "\"it is important to note\""],
    ["(is|are) (widely|commonly|extensively|broadly) (used|adopted|utili[sz]ed|regarded|known)", "\"widely used\" style"],
    ["(making|makes|make) it (an? )?(ideal|ideally|highly|particularly|well|easy|easier|suitable|powerful|popular|versatile|efficient|flexible)", "\"making it ideal / easy\""],
    ["(enabling|allowing|ensuring|facilitating|empowering) (developers|users|data scientists|analysts|organi[sz]ations|businesses|teams)", "\"enabling developers\" style"],
    ["let'?s break (it|this) down|here'?s? (a|an|the) (breakdown|overview|summary)|here are (some|the|a few)", "chat-assistant opening"],
    ["on the other hand|in contrast,|conversely|as a result,|in addition,|additionally|furthermore|moreover|consequently", "formal connector"],
    ["(powerful|robust|versatile|comprehensive|seamless|scalable|efficient) (and|,) (powerful|robust|versatile|comprehensive|seamless|scalable|efficient|flexible|easy|readable|simple)", "paired adjectives (\"powerful and versatile\")"],
    ["(rich|vast|extensive|robust) (ecosystem|set|suite|collection|library|libraries) of", "\"vast ecosystem of\""],
    ["(a )?(variety|multitude|plethora|myriad) of", "\"plethora / myriad of\""],
    ["(real[- ]world) (applications?|scenarios?|use cases?)", "\"real-world applications\""]
  ].map(([re, label]) => [new RegExp("\\b(?:" + re + ")", "i"), label]);
  // v51: TEXTBOOK / ChatGPT definition phrases. People who learned the topic also say some of these, so each one weighs less than a stock AI phrase,
  // and the whole wording score is scaled by HOW it was spoken (fluent and smooth = read out; hesitant = recalled from memory).
  // Patterns are loose on purpose: speech recognition writes "interpreted" as "interpret", "explicitly programmed" as "explicit", etc.
  const TEXTBOOK = [
    ["high[- ]level,? (and )?(interpret|general[- ]purpose|object[- ]oriented|programming)|interpret(ed)?,? (and )?(object[- ]oriented|high[- ]level|dynamically)|general[- ]purpose,? (and )?(high|interpret|programming)", "language definition (high-level / interpreted / object-oriented)"],
    ["easy to (learn|read|use|understand)|(simple|clean|readable|easy) (and (readable|clean|simple) )?syntax", "\"easy to learn, simple syntax\""],
    ["without (being )?explicit(ly)?( programmed)?", "\"without being explicitly programmed\""],
    ["(branch|subset|field) of (ai|a i|artificial intelligence|computer science)", "\"a branch of AI\""],
    ["learns? from (the )?(data|experience)|(make|makes|making) predictions", "\"learn from data, make predictions\""],
    ["(useful|valuable|actionable|meaningful|hidden|key) (insights?|patterns?)", "\"useful insights\""],
    ["(better|informed|data[- ]driven|smarter|business) decisions?", "\"make better decisions\""],
    ["structured (and|or) (semi[- ]structured |un)?structured|unstructured data", "\"structured and unstructured data\""],
    ["unseen data|new,? unseen|training data too well|performs? well on (the )?training", "overfitting textbook definition"],
    ["relation(al)? database|(store|manage|retrieve|manipulate|query)[a-z]*,? (and )?(manage|retrieve|manipulate|query|update|store)[a-z]* (data|the data)", "\"store, manage and manipulate data\""],
    ["(collect|clean|process|analy[sz]|interpret|visuali[sz]|transform)[a-z]*,? (and )?(collect|clean|process|analy[sz]|interpret|visuali[sz]|transform)[a-z]*,? (and )?(collect|clean|process|analy[sz]|interpret|visuali[sz]|transform)", "process list (collecting, cleaning, analysing, interpreting)"],
    ["(is|are) (a|an|the) (process|technique|method|practice|set|collection) of|refers to|is defined as|stands for", "dictionary-style \"is the process of / refers to\""],
    ["(statistics|mathematics|maths),? (programming|computer science)|(programming|computer science),? (and )?(statistics|domain knowledge)", "\"statistics, programming and domain knowledge\""]
  ].map(([re, label]) => [new RegExp("\\b(?:" + re + ")", "i"), label]);
  const ORD = /\b(first(ly)?|second(ly)?|third(ly)?|fourth(ly)?|finally|lastly|next|then)\b[,:]?/gi;
  const PERSONAL = /\b(i|my|me|we|our|i'm|i've|i'll|in my (project|experience|work)|i used|i have|i worked|i did)\b/i;
  const sentences = (t) => (String(t || "").match(/[^.?!]+[.?!]*/g) || []).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
  // 3+ items in one breath: "data science, machine learning, web development" / "Excel, SQL, Power BI and Tableau"
  const listCount = (t) => (t.match(/\b[a-z][\w-]*( [\w-]+){0,3}, [\w-]+( [\w-]+){0,3},? (and|or|,) [\w-]+/gi) || []).length;

  const verdictOf = (level, eyes) => level === "HIGH" ? (eyes ? "LIKELY READING FROM AI (wording + eyes)" : "LIKELY READ FROM AI / WRITTEN TEXT") : level === "MEDIUM" ? (eyes ? "POSSIBLE AI TEXT (wording + eyes): review" : "POSSIBLE AI / PREPARED TEXT: review") : "Natural speech";
  /** one report line for the structure of an answer (what the interviewer can check by ear) */
  function structureLine(a) {
    const st = a && a.structure; if (!st) return "Too short (under 20 words) to judge the wording.";
    return `${st.sentences} sentence(s), about ${st.avgLen} words each${st.even ? " (very even)" : ""}; ${st.ordinals ? st.ordinals + " numbered marker(s) (first / second / finally)" : "no numbered structure"}; ${st.lists ? st.lists + " list(s) of 3+ items in one breath; " : ""}${st.hesitations} hesitation(s); delivery ${st.delivery}; ${st.personal ? "personal wording present" : "no personal wording (I / my project)"}${st.defThenList ? "; definition followed by a \"key features\" list" : ""}.`;
  }
  /** text = the candidate's answer (speech recognised); fl = { words, hes, fluent, thinkMs, f0sd } (all optional) */
  function analyse(text, fl) {
    fl = fl || {}; const t = String(text || "").replace(/\s+/g, " ").trim(), words = t ? t.split(/\s+/).length : 0;
    const out = { points: 0, level: "LOW", strong: false, stock: [], textbook: [], notes: [], words, raw: 0, delivery: "n/a", recalled: false };
    if (words < 20) return out;
    const hes = fl.hes == null ? (t.match(/\b(um+|uh+|er+|hmm+|you know|i mean)\b/gi) || []).length : fl.hes;
    const stock = STOCK.filter(([re]) => re.test(t)).map(([, l]) => l); out.stock = stock;
    const book = TEXTBOOK.filter(([re]) => re.test(t)).map(([, l]) => l); out.textbook = book;
    const S = sentences(t), lens = S.map((s) => s.split(/\s+/).length), mean = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, lens.length)), cv = mean ? sd / mean : 1;
    const ord = new Set((t.match(ORD) || []).map((x) => x.toLowerCase().replace(/[^a-z]/g, "").replace(/ly$/, ""))).size;
    const lists = listCount(t);
    // v51: delivery = HOW it was spoken. Hesitations per 100 words (speech recognition drops many "um"s, so 0 is not required any more).
    const hesRate = hes / words * 100, fluentV = fl.fluent == null ? 0.7 : fl.fluent;
    const delivery = fluentV >= 0.6 && hesRate <= 2.5 ? "smooth" : (fluentV < 0.45 || hesRate >= 5) ? "hesitant" : "mixed";
    const polished = delivery === "smooth" && words >= 40;
    const even = S.length >= 3 && mean >= 13 && mean <= 34 && cv < 0.38;
    let p = 0;
    if (stock.length) { p += Math.min(45, 15 * stock.length); out.notes.push(`${stock.length} stock AI phrase(s): ${stock.slice(0, 3).join("; ")}`); }
    if (book.length) { p += Math.min(36, 9 * book.length); out.notes.push(`${book.length} textbook / ChatGPT definition phrase(s): ${book.slice(0, 4).join("; ")}`); }
    if (lists && (stock.length + book.length) >= 2) { p += Math.min(10, 5 * lists); out.notes.push(`${lists} list(s) of 3+ items said in one breath`); }
    if (ord >= 3 && words >= 30) { p += 12; out.notes.push("numbered structure (first / second / third / finally) like a prepared list"); }
    if (even && polished) { p += 10; out.notes.push(`${S.length} sentences of almost the same length (${Math.round(mean)} words each) with no hesitation: written text read aloud?`); }
    if (polished && words >= 50 && !PERSONAL.test(t) && (stock.length + book.length)) { p += 6; out.notes.push("no personal wording (I / my / we / my project) in a long answer: generic definition"); }
    if (polished && (stock.length || book.length >= 2) && fl.thinkMs >= 5000) { p += 8; out.notes.push(`silent ${Math.round(fl.thinkMs / 1000)}s after the question, then a polished answer (typed / searched first?)`); }
    if (delivery !== "hesitant" && (stock.length || book.length >= 2) && fl.f0sd != null && fl.f0sd < 0.11) { p += 5; out.notes.push("flat, read-out voice"); }
    out.raw = Math.round(p);
    // the same textbook words spoken smoothly = read out; spoken with many pauses / restarts = recalled from memory (learned by heart)
    const mult = delivery === "smooth" ? 1 : delivery === "mixed" ? 0.7 : 0.4;
    if (delivery === "hesitant" && out.raw >= 20) { out.recalled = true; out.notes.push(`but it was spoken hesitantly (${hes} hesitation(s), fluency ${Math.round(fluentV * 100)}%): looks like a definition recalled from memory, not read`); }
    out.points = Math.min(90, Math.round(p * mult));
    const hits = stock.length + 0.6 * book.length;
    out.strong = delivery !== "hesitant" && (stock.length >= 3 || (stock.length >= 2 && polished) || (stock.length >= 1 && ord >= 3 && polished) || (delivery === "smooth" && hits >= 3.4));
    out.level = out.points >= 45 || out.strong ? "HIGH" : out.points >= 25 ? "MEDIUM" : "LOW";
    out.delivery = delivery;
    out.structure = { sentences: S.length, avgLen: Math.round(mean), even, ordinals: ord, lists, hesitations: hes, personal: PERSONAL.test(t), polished, delivery: delivery + (fl.fluent != null ? " (fluency " + Math.round(fluentV * 100) + "%)" : ""), defThenList: /^[^.]{3,80}\b(is|are)\b[^.]{5,}\.\s*(key|the main|some of the|here)\b/i.test(t) };
    out.verdict = verdictOf(out.level);
    return out;
  }

  /** answers[] = [{ label, words, hes, fluent, ai }]. A candidate who hesitates everywhere and then speaks ONE polished answer changed style: good reason to review. */
  function styleJump(rows) {
    const r = (rows || []).filter((x) => x && x.words >= 20), out = [];
    if (r.length < 3) return out;
    const messy = (x) => (x.hes || 0) >= 1 || (x.fluent != null && x.fluent < 0.6);
    r.forEach((x, i) => {
      const others = r.filter((_, j) => j !== i); if (!others.length) return;
      const messyShare = others.filter(messy).length / others.length;
      if (!messy(x) && x.words >= 40 && messyShare >= 0.7 && x.ai && x.ai.points >= 15) out.push({ label: x.label, why: `${x.label}: smooth, polished wording while ${Math.round(messyShare * 100)}% of the other answers were hesitant (style jump)` });
    });
    return out;
  }
  root.AiAnswer = { analyse, styleJump, verdictOf, structureLine, STOCK, TEXTBOOK };
  if (typeof module !== "undefined" && module.exports) module.exports = root.AiAnswer;
})(typeof window !== "undefined" ? window : globalThis);
