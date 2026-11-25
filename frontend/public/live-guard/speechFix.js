// speechFix.js (v33) - fixes technical words that speech recognition hears wrongly
// (Indian-accent English: "tuples" -> "peoples", "dictionary" -> "business", "comprehension" -> "compression" ...).
// Runs in the browser and in Node tests. Everything you may want to edit is in the 3 tables below.
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- 1. EDIT HERE: words you want recognised
  // canonical word  ->  list of wrong spellings / mis-hearings that should become that word.
  // Plain words (people, business, couple ...) are only replaced when the sentence is clearly about programming.
  const SAFE = {            // never a normal English word -> always replaced
    "Python": ["pyton", "pythan", "pithon", "piton", "paithon", "paython", "by thon", "pie thon", "py thon", "bython"],
    "tuple": ["tupple", "tupel", "tuppel", "toople", "touple", "twople", "two ple", "too ple", "tu ple", "tuble"],
    "tuples": ["tupples", "tupels", "tuppels", "tooples", "touples", "twoples", "two ples", "too ples", "tu ples", "tubles"],
    "dictionary": ["addictionary", "dictnory", "dictionery", "dictonary", "dictionnary", "dicionary", "dicsionary", "dixonary", "dict nary", "diction ary", "dick tionary", "dictionari", "dixionary", "dictinary", "dishonoury", "dishonary", "dishonery", "dishnary", "dishonori"],
    "comprehension": ["comprehention", "comprehansion", "comprihension", "comprehenson", "comprehantion"],
    "comprehensions": ["comprehentions", "comprehansions", "comprihensions"],
    "immutable": ["unutable", "inmutable", "immutible", "imutable", "unmutable", "immutabel", "in mutable", "immewtable", "immudable", "imudable", "imewtable", "immutuble", "emutable", "immuteable", "immooable", "immootable"],
    "mutable": ["mewdable", "mewtable", "mudable", "muteable", "mutabel", "mutible", "mewtible", "mewdible", "mutuble", "moodable", "mootable", "mewtabel", "mewdabal", "mutabal"],
    "mutables": ["mewdables", "mewtables", "mudables"],
    "list and": ["listar and", "lister and", "listar", "lister", "listand"],
    "machine learning": ["emission learning", "missionary learning", "machine laning", "mission learning", "machine running", "mission running", "machin learning", "machine learnin", "mission learnin", "machine learned"],
    "lambda": ["lamda", "lamba", "lambada"],
    "lambda function": ["lab function", "lamp function", "land function", "lamb function", "lambdha function"],
    "ordered collection": ["audit collection", "auditor collection", "order collection", "odd it collection", "or did collection", "ordered collections"],
    "data science": ["that sense", "data sense", "date a science", "data signs", "that science"],
    "overfitting": ["overfeeding", "over feeding", "over fitting", "more fitting", "overfiting", "over fiting"], "underfitting": ["underfeeding", "under feeding", "under fitting", "underfiting", "under fiting"],
    "imbalanced data": ["imbalance data", "involved data", "in balanced data", "unbalanced data", "imbalanced date"],
    "difference between": ["defense between", "defence between", "defense data between", "difference in between"],
    "logistic regression": ["large shen regression", "large-shen regression", "large shin regression", "largest regression", "lodistic regression", "lojistic regression", "logistics regression", "logistic recreation", "logistic regretion", "large ship regression"],
    "linear regression": ["liner regression", "linear recreation", "lineal regression"],
    "regression": ["regresion", "regration", "regreshion", "regretion"],
    "supervised": ["super vised", "supervized", "super wise"],
    "unsupervised": ["un supervised", "unsupervized"],
    "hypothesis": ["hypothesys", "hypotesis", "hypothasis", "hypothesise"],
    "null hypothesis": ["nail hypothesis", "not hypothesis", "null hypothesys"],
    "statistically significant": ["statistically signified", "statistical significant", "statistically significance"],
    "decision tree": ["decision three", "decision tri", "decision tray", "decision tre"],
    "random forest": ["random forced", "random forrest", "random for rest"],
    "cross-validation": ["cross validation", "crossed validation", "cross validations"],
    "decorator": ["decorater"], "decorators": ["decoraters"],
    "generator": ["generater"], "generators": ["generaters"],
    "iterator": ["itterator", "iterater"], "iterators": ["itterators", "iteraters"],
    "NumPy": ["num pie", "numb pie", "numpie", "numpai"],
    "pandas": ["pandaas"],
    "inheritance": ["inheritence", "inheritanse"],
    "polymorphism": ["polymorphisum", "polymorphizm", "poly morphism"],
    "encapsulation": ["incapsulation", "encapsulashan", "in capsulation"],
    "recursion": ["recurssion", "recursan"],
    "exception": ["exeption"], "exceptions": ["exeptions"]
  };
  const CONTEXTUAL = {      // real English words that speech engines often produce instead -> replaced ONLY in programming sentences
    "tuple": ["people", "pupil", "couple"],
    "tuples": ["peoples", "pupils", "couples"],
    "dictionary": ["dictation", "business", "dictionaries'"],
    "comprehension": ["compression", "compensation"],
    "comprehensions": ["compressions", "compensations"],
    "immutable": ["a mutable"],
    "regression": ["recreation", "recreations"]       // only in data-science / machine-learning sentences (see CONTEXT_DS)
  };
  // data-science sentences: lets "recreation" become "regression" next to classification / supervised / logistic ...
  const CONTEXT_DS = /\b(classification|classifier|supervised|unsupervised|machine learning|logistic|linear|model|models|training|hypothesis|null|p.?value|significan\w*|overfitting|underfitting|algorithm|prediction|predicts|probability)\b/i;
  // sentence counts as "programming" when it contains one of these (so "the people in the meeting" stays untouched)
  const CONTEXT = /\b(python|list|lists|tuple|tuples|dict|dicts|dictionary|dictionaries|set|sets|string|strings|array|arrays|data ?types?|mutable|immutable|comprehension|comprehensions|compression|compressions|loop|loops|function|functions|class|classes|object|objects|index|slicing|lambda|decorator|generator|iterator|variable|module|exception|pandas|numpy)\b/i;
  // "list, business and ..." : a collection name + wrong word + and/or is a certain mis-hearing even for words with no other context
  const ENUM_WORDS = "list|lists|set|sets|tuple|tuples|dict|dictionary|array|arrays|string|strings";
  const ENUM_FIX = { business: "dictionary", dictation: "dictionary", people: "tuple", pupil: "tuple", couple: "tuple", peoples: "tuples", temporary: "tuple" };

  // ---------------------------------------------------------------- 2. glossary for fuzzy matching (long words only)
  const GLOSSARY = ("dictionary comprehension comprehensions immutable mutable iterator generator decorator inheritance polymorphism encapsulation abstraction " +
    "exception recursion parameter argument constructor namespace interpreter compiler boolean integer function variable operator tuple lambda " +
    "dataframe numpy pandas matplotlib module package library framework django flask serialization deserialization concatenation").split(" ");
  const NEVER_FUZZY = new Set(("augment augments argued arguments variables variance operators operator compilers interpreters functions modules packages libraries frameworks parameters " +
    "constructors dictionaries exceptions integers booleans iterators generators decorators abstraction").split(" "));
  const HINTS = ["Python", "tuple", "tuples", "dictionary", "list", "set", "comprehension", "list comprehension", "dictionary comprehension", "mutable", "immutable",
    "lambda", "decorator", "generator", "iterator", "inheritance", "polymorphism", "encapsulation", "recursion", "exception handling", "NumPy", "pandas", "slicing", "append", "extend"];

  // ---------------------------------------------------------------- engine
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lev = (a, b) => {
    const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  };
  const matchCase = (rep, orig) => (/^[A-Z][a-z]/.test(orig) && rep[0] === rep[0].toLowerCase() && !/^(NumPy|Python)$/.test(rep) ? rep[0].toUpperCase() + rep.slice(1) : rep);
  const build = (table) => Object.entries(table).flatMap(([rep, list]) => list.map((w) => ({ rep, re: new RegExp("(?<![\\p{L}'])" + esc(w).replace(/ /g, "\\s+") + "(?![\\p{L}])", "giu") })));
  let safeRules = build(SAFE), ctxRules = build(CONTEXTUAL);

  function fix(text) {
    let s = String(text || ""); if (!s.trim()) return s;
    const programming = CONTEXT.test(s) || CONTEXT_DS.test(s);
    // v48: numbers broken by speech recognition: "0. 05" -> "0.05", "3. 5" -> "3.5" (the dot must not end the sentence)
    s = s.replace(/(\d)\s*\.\s+(\d)/g, "$1.$2");
    // v48: "P value" is heard as "B value", "V value", "pee value", "be value" ...
    s = s.replace(/\b(?:p|b|v|pee|bee|pea|be|the p)[\s-]+(values?)\b/gi, (m, v) => "p-" + v.toLowerCase());
    // enumerations: "list, business and temporary compressions"
    s = s.replace(new RegExp("\\b(" + ENUM_WORDS + ")(\\s*,\\s*|\\s+)(" + Object.keys(ENUM_FIX).join("|") + ")(?=\\s*,?\\s+(?:and|or|&|vs|versus)\\b)", "gi"), (m, a, sep, w) => a + sep + ENUM_FIX[w.toLowerCase()]);
    s = s.replace(new RegExp("\\b(and|or|&|vs|versus)\\s+(" + Object.keys(ENUM_FIX).join("|") + ")(?=\\s+(?:comprehension|comprehensions|compression|compressions)\\b)", "gi"), (m, a, w) => a + " " + ENUM_FIX[w.toLowerCase()]);
    // v46: "difference between our least and set", "least and tuple", "list of audit collection": a collection name next to and/or/vs is a certain mis-hearing of "list"
    s = s.replace(/\b(?:(?:our|are|r|a)\s+)?(least|lease|lest|lyst|lis)(?=\s+(?:and|or|vs|versus|&)\s+(?:a\s+|the\s+)?(?:set|sets|tuple|tuples|dict|dictionary|string|array)\b)/gi, "list");
    s = s.replace(/\b(between|vs|versus|and|or)\s+(?:(?:our|are|r|a)\s+)?(least|lease|lest|lyst)(?=\s*[?.!,]|\s*$)/gi, (m, a) => (/\b(difference|between|compare|versus|vs)\b/i.test(s) ? a + " list" : m));
    for (const r of safeRules) s = s.replace(r.re, (m) => matchCase(r.rep, m));
    s = s.replace(/\b(between|vs|versus)\s+(list|tuple|set|dictionary|dict|string)\s+and\s+(list|tuple|set|dictionary|dict|string)\s+(?:them|then|dem|den)\b/gi, "$1 $2 and $3"); // "list and set them" -> "list and set"
    if (programming) for (const r of ctxRules) s = s.replace(r.re, (m) => matchCase(r.rep, m));
    if (programming || CONTEXT.test(s)) { // fuzzy: close spellings of long programming words ("dicsionary", "polymorfism")
      s = s.replace(/[\p{L}]{7,}/gu, (w) => {
        const lw = w.toLowerCase(); if (NEVER_FUZZY.has(lw) || GLOSSARY.includes(lw) || /(ed|ing|ly)$/.test(lw)) return w; // v34: real words like "interpreted" must not become "interpreter"
        const base = lw.replace(/s$/, ""); if (GLOSSARY.includes(base)) return w;
        const budget = lw.length >= 10 ? 2 : 1; let best = null, bd = 9;
        for (const g of GLOSSARY) { if (g[0] !== lw[0] || g.length < 7) continue; const d = lev(base, g); if (d < bd) { bd = d; best = g; } }
        return best && bd <= budget ? matchCase(best + (lw.endsWith("s") && !best.endsWith("s") ? "s" : ""), w) : w;
      });
    }
    return s.replace(/\s{2,}/g, " ").trim();
  }
  // add your own: SpeechFix.add("dictionary", ["dicshionary", "business"], true)  (3rd argument true = only in programming sentences)
  function add(rep, wrong, contextual) { const t = contextual ? ctxRules : safeRules; build({ [rep]: wrong }).forEach((r) => t.push(r)); }

  const API = { fix, add, hints: HINTS };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.SpeechFix = API;
})(typeof window !== "undefined" ? window : globalThis);
