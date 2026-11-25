// MediaPipe prints harmless startup notices (OpenGL / XNNPACK / "feedback manager") through
// console.warn / console.error. Chrome lists those under chrome://extensions -> Errors.
// This file loads BEFORE detector.js and drops only those known notices; real errors still show.
(() => {
  const NOISE = /gl_context|inference_feedback|face_landmarker_graph|FaceBlendshapesGraph|XNNPACK|TensorFlow Lite|OpenGL error checking|Feedback manager|xnnpack|vision_wasm|Created TensorFlow|delegate for CPU|^\s*(INFO|WARNING):|^\s*W\d{4} |^\s*I\d{4} /i;
  for (const level of ["warn", "error", "info", "log"]) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try {
        const first = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
        if (NOISE.test(first)) return;
      } catch {}
      orig(...args);
    };
  }
})();
