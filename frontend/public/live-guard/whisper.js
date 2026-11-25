/* In-browser Whisper speech-to-text (no key, no server).
 *   CandidateSTT = transcribes the shared SYSTEM / meeting audio  (the candidate's voice)
 *   MicSTT       = transcribes the MICROPHONE                      (the interviewer's voice) - backup for Chrome's own engine
 * Both share ONE Whisper model. Audio is cut into spoken segments by voice-activity detection; every segment is transcribed
 * and returned with the time it was spoken, so late results are still placed in the right question.
 */
(function () {
  const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
  const MODELS = { base: "Xenova/whisper-base", small: "Xenova/whisper-small" };

  // v48: FASTER transcript. (1) WebGPU (graphics card) is tried first and falls back to the old WASM engine on any problem,
  // (2) the candidate's audio is transcribed BEFORE the interviewer-microphone backup (priority queue), (3) shorter speech pieces (see onAudio).
  const GPU_MODELS = { base: "onnx-community/whisper-base", small: "onnx-community/whisper-small" };
  const workerSource = (model, gpuModel) => `
    import { pipeline, env } from "${TRANSFORMERS}";
    env.allowLocalModels = false;
    try { env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)); } catch (e) {}
    let asr = null, loading = null, busy = false, queue = [];
    const post = (m) => self.postMessage(m);
    async function load() {
      if (asr) return;
      if (loading) return loading;
      loading = (async () => {
        const progress_callback = (p) => { if (p && p.status === "progress" && p.file) post({ type: "progress", file: p.file, progress: p.progress || 0 }); };
        let backend = "wasm";
        if (typeof navigator !== "undefined" && navigator.gpu) {
          try {
            const a = await navigator.gpu.requestAdapter();
            if (a) {
              const g = await pipeline("automatic-speech-recognition", "${gpuModel}", { device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback });
              await g(new Float32Array(16000), { task: "transcribe" }); // warm-up: proves the GPU path really works before it is used
              asr = g; backend = "webgpu";
            }
          } catch (err) { asr = null; }
        }
        if (!asr) asr = await pipeline("automatic-speech-recognition", "${model}", { dtype: "q8", device: "wasm", progress_callback });
        post({ type: "ready", backend });
      })();
      try { await loading; } finally { loading = null; }
    }
    async function pump() {
      if (busy) return; busy = true;
      try {
        while (queue.length) {
          queue.sort((x, y) => (y.pri - x.pri) || (x.id - y.id)); // candidate audio first, then oldest first
          const m = queue.shift();
          try {
            await load();
            const out = await asr(m.audio, { ...(m.language ? { language: m.language } : {}), task: "transcribe", chunk_length_s: 30, return_timestamps: false, no_repeat_ngram_size: 5 });
            post({ type: "text", id: m.id, text: (out && out.text) || "" });
          } catch (err) { post({ type: "text", id: m.id, text: "", error: String((err && err.message) || err) }); }
        }
      } finally { busy = false; }
    }
    self.onmessage = (e) => {
      const m = e.data;
      if (m.type === "load") { load().catch((err) => post({ type: "error", message: String((err && err.message) || err) })); }
      else if (m.type === "run") { queue.push({ ...m, pri: m.pri || 1 }); pump(); }
    };
  `;

  // ---- shared model/worker -----------------------------------------------------------------------------------------
  const W = { worker: null, ready: false, failed: false, loading: false, pending: 0, nextId: 1, cb: {}, listeners: [], model: "base", last: "" };
  const broadcast = (text, bad) => W.listeners.forEach((f) => { try { f(text, !!bad); } catch {} });
  const languageName = (code) => ({ en: "english", ta: "tamil", hi: "hindi" })[String(code || "").slice(0, 2).toLowerCase()] || null;

  function ensureWorker(model) {
    if (W.worker) return;
    W.model = MODELS[model] ? model : "base";
    try { W.worker = new Worker(URL.createObjectURL(new Blob([workerSource(MODELS[W.model], GPU_MODELS[W.model])], { type: "text/javascript" })), { type: "module" }); }
    catch (e) { W.failed = true; broadcast("Candidate voice engine could not start: " + (e.message || e), true); return; }
    W.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") broadcast(`Downloading speech model ${Math.round(m.progress || 0)}% (first time only)…`);
      else if (m.type === "ready") { W.ready = true; W.loading = false; W.backend = m.backend || "wasm"; broadcast("Speech model ready" + (W.backend === "webgpu" ? " (fast GPU mode)" : "")); }
      else if (m.type === "error") { W.failed = true; W.loading = false; broadcast("Speech model failed: " + m.message + " (check internet)", true); }
      else if (m.type === "text") {
        const f = W.cb[m.id]; delete W.cb[m.id]; W.pending = Math.max(0, W.pending - 1);
        if (f) f(m.text || "");
        broadcast(W.pending ? `Transcribing… (${W.pending} waiting)` : "Speech model ready" + (W.backend === "webgpu" ? " (fast GPU mode)" : ""));
      }
    };
    W.worker.onerror = (ev) => { W.failed = true; W.loading = false; broadcast("Speech model error: " + (ev.message || "could not load (check internet)"), true); };
  }
  function preload(model) {
    ensureWorker(model);
    if (W.worker && !W.ready && !W.loading && !W.failed) { W.loading = true; broadcast("Loading speech model…"); W.worker.postMessage({ type: "load" }); }
  }

  // Whisper invents text for silence / music / noise ("[MUSIC]", "Thank you.", "Blunt, Blunt, ..."). Clean or drop it.
  const JUNK = /^(thank you\.?|thanks\.?|thanks for watching[.!]?|thank you for watching[.!]?|you|bye\.?|i'?ll be back\.?|okay\.?|so\.?|uh|um|hmm+\.?|oh\.?|subtitles by.*|please subscribe.*|see you (next time|in the next video)\.?)$/i;
  function cleanText(raw) {
    let t = String(raw || "").replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪[^♪]*♪?/g, " ").replace(/\s+/g, " ").trim(); // [MUSIC] [INAUDIBLE] (applause)
    if (!t || !/[\p{L}\p{N}]/u.test(t)) return "";
    const w = t.split(" "), out = []; let run = 1, dropped = 0;
    for (let i = 0; i < w.length; i++) { // "Blunt, Blunt, Blunt ..." loops
      const a = w[i].toLowerCase().replace(/[^\p{L}\p{N}']/gu, ""), b = i ? w[i - 1].toLowerCase().replace(/[^\p{L}\p{N}']/gu, "") : "";
      run = i && a && a === b ? run + 1 : 1;
      if (run > 2) dropped++; else out.push(w[i]);
    }
    if (dropped > w.length * 0.5) return "";
    t = out.join(" ").trim();
    if (JUNK.test(t) || t.split(" ").length < 2 && t.length < 4) return "";
    if (t.toLowerCase() === W.last.toLowerCase()) return ""; // same text twice in a row = loop
    W.last = t; return t;
  }

  // Fundamental frequency (voice pitch, Hz) of one chunk by autocorrelation; 0 = unvoiced / unclear. Used to tell two different voices apart.
  function pitchOf(x) {
    const n = Math.min(2048, x.length - 240); if (n < 512) return 0;
    let mean = 0; for (let i = 0; i < n + 240; i++) mean += x[i]; mean /= n + 240;
    let e0 = 0; for (let i = 0; i < n; i++) { const v = x[i] - mean; e0 += v * v; }
    if (e0 < 1e-6) return 0;
    const r = new Float32Array(231); let best = 0;
    for (let lag = 40; lag <= 230; lag++) { // 70 - 400 Hz at 16 kHz
      let s = 0, e1 = 0; for (let i = 0; i < n; i++) { const a = x[i] - mean, b = x[i + lag] - mean; s += a * b; e1 += b * b; }
      r[lag] = e1 > 0 ? s / Math.sqrt(e0 * e1) : 0; if (r[lag] > best) best = r[lag];
    }
    if (best < 0.5) return 0;
    for (let lag = 41; lag < 230; lag++) if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) return 16000 / lag; // first strong peak = no octave errors
    return 0;
  }

  // ---- one audio capture (voice activity detection -> segments -> Whisper) -----------------------------------------
  function createCapture(label) {
    const S = { ctx: null, proc: null, src: null, active: false, opts: {}, seg: null, preroll: [], noise: 0, lang: null, units: [] };
    const status = (text, bad) => { try { S.opts.onStatus && S.opts.onStatus(text, !!bad); } catch {} };
    W.listeners.push((t, b) => { if (S.active || S.opts.always) status(t, b); });

    function transcribe(samples, startAt, endAt) {
      if (!W.worker || W.failed) return;
      const id = W.nextId++; W.pending++;
      W.cb[id] = (text) => { const t = cleanText(text); if (t) { try { S.opts.onText(t, endAt, startAt); } catch {} } };
      broadcast(`Transcribing… (${W.pending} waiting)`);
      W.worker.postMessage({ type: "run", id, pri: 2, /* v52: interviewer questions are as important as answers - oldest first, so no question waits until the end */ audio: samples, language: languageName(S.lang) }, [samples.buffer]);
    }
    function emit(seg, silenceMs) {
      // real speech only: enough speech, and not just continuous noise / music
      if (!seg || seg.speechMs < 600 || seg.speechMs < seg.totalMs * 0.2) return;
      let n = 0; for (const c of seg.chunks) n += c.length;
      const all = new Float32Array(n); let o = 0; for (const c of seg.chunks) { all.set(c, o); o += c.length; }
      const endAt = Date.now() - Math.max(0, silenceMs - 300);
      if (S.opts.skip && S.opts.skip(endAt - seg.totalMs, endAt)) return; // e.g. the microphone only hearing the candidate's echo
      if (seg.vseg && S.opts.onVoice) { try { S.opts.onVoice(window.VoiceGuard.summarise(seg.vseg), seg.startAt || endAt - seg.totalMs, endAt); } catch {} }
      transcribe(all, seg.startAt || endAt - seg.totalMs, endAt);
    }
    function onAudio(ev) {
      if (!S.active) return;
      const input = ev.inputBuffer.getChannelData(0);
      let chunk;
      if (S.ctx.sampleRate === 16000) chunk = new Float32Array(input);
      else { const r = S.ctx.sampleRate / 16000, n = Math.floor(input.length / r); chunk = new Float32Array(n); for (let i = 0; i < n; i++) chunk[i] = input[Math.floor(i * r)]; }
      let sum = 0; for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
      const rms = Math.sqrt(sum / chunk.length), ms = chunk.length / 16;
      const speech = rms > Math.max(0.01, S.noise * 3);
      if (!speech) S.noise = S.noise ? S.noise * 0.97 + rms * 0.03 : rms;
      // v31: voice print (second voice) + typing clicks, computed on the same 16 kHz chunk
      let va = null;
      if (S.opts.voice && window.VoiceGuard) { try { va = window.VoiceGuard.analyseChunk(chunk, speech); if (va.clicks && S.opts.onClicks) S.opts.onClicks(va.clicks, Date.now()); } catch {} }
      if (speech) { try { S.opts.onSpeech && S.opts.onSpeech(rms, va && va.f0 ? va.f0 : (S.opts.pitch ? pitchOf(chunk) : 0), Date.now()); } catch {} }
      if (!S.seg) {
        S.preroll.push(chunk); if (S.preroll.length > 2) S.preroll.shift();
        if (speech) { S.seg = { chunks: [...S.preroll], speechMs: ms, totalMs: ms * S.preroll.length, silenceMs: 0, startAt: Date.now() - ms, vseg: S.opts.voice && window.VoiceGuard ? window.VoiceGuard.newSegment() : null }; S.preroll = []; if (S.seg.vseg && va) window.VoiceGuard.addChunk(S.seg.vseg, va); } // startAt = when the voice really began (not the quiet pre-roll)
        return;
      }
      const seg = S.seg; seg.chunks.push(chunk); seg.totalMs += ms;
      if (speech) { seg.speechMs += ms; seg.silenceMs = 0; if (seg.vseg && va) window.VoiceGuard.addChunk(seg.vseg, va); } else seg.silenceMs += ms;
      if (seg.silenceMs >= 800 || seg.totalMs >= 14000) { S.seg = null; emit(seg, seg.silenceMs); } // v48: 0.8 s pause / 14 s (was 1.2 s / 25 s): text appears sooner, the parser joins the pieces of one answer by time
    }
    function flush() { if (S.seg) { const seg = S.seg; S.seg = null; emit(seg, seg.silenceMs); } }
    function stop() {
      flush(); S.active = false;
      try { S.proc && (S.proc.onaudioprocess = null); S.proc && S.proc.disconnect(); S.src && S.src.disconnect(); } catch {}
      try { S.ctx && S.ctx.close(); } catch {}
      S.proc = S.src = S.ctx = null; S.seg = null; S.preroll = [];
    }
    function start(track, opts) {
      stop();
      S.opts = opts || {}; S.lang = S.opts.lang || null;
      preload(S.opts.model);
      try {
        let ctx; try { ctx = new AudioContext({ sampleRate: 16000 }); } catch { ctx = new AudioContext(); }
        ctx.resume && ctx.resume(); S.ctx = ctx;
        S.src = ctx.createMediaStreamSource(new MediaStream([track]));
        S.proc = ctx.createScriptProcessor(4096, 1, 1);
        const mute = ctx.createGain(); mute.gain.value = 0;
        S.src.connect(S.proc); S.proc.connect(mute); mute.connect(ctx.destination);
        S.proc.onaudioprocess = onAudio; S.seg = null; S.preroll = []; S.active = true;
        status(W.ready ? "Speech model ready" : "Loading speech model…");
      } catch (e) { S.active = false; status(label + " audio could not be opened: " + (e.message || e), true); }
    }
    return { start, stop, flush, get active() { return S.active; } };
  }

  const drain = (timeoutMs) => new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => { if (!W.pending || W.failed || Date.now() - t0 > (timeoutMs || 90000)) return resolve(W.pending); setTimeout(tick, 400); };
    tick();
  });

  const cand = createCapture("Candidate"), mic = createCapture("Microphone");
  cand.pitchOf = pitchOf;
  Object.defineProperties(cand, {
    ready: { get: () => W.ready }, failed: { get: () => W.failed }, pending: { get: () => W.pending },
    preload: { value: (o) => { if (o && o.onStatus) W.listeners.push(o.onStatus); preload(o && o.model); } },
    drain: { value: drain }, cleanText: { value: cleanText }
  });
  window.CandidateSTT = cand;
  window.MicSTT = mic;
})();
