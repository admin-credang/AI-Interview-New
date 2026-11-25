import { useEffect, useRef, useState } from "react";
import faceImg from "../../assets/ai-interviewer-cutout.webp";

// ============================================================
// Live AI interviewer (plain WebGL, no npm package, no CDN):
//  - background-free android, gently floating / breathing
//  - glowing eyes that pulse and blink (robot shutter)
//  - headphone LED lights that twinkle
//  - soft hologram scan line
// The head does NOT rotate. Falls back to the still image with
// CSS eye glows if WebGL is not available.
// ============================================================

// Feature positions in image UV (0..1), measured on the 952x1078 image.
const EYES = [
  { c: [465 / 952, 450 / 1078], r: [62 / 952, 34 / 1078] },
  { c: [680 / 952, 456 / 1078], r: [40 / 952, 34 / 1078] },
];
const LEDS = [
  [232, 262], [256, 276], [276, 296], [291, 322], [301, 352], [306, 386],
  [309, 420], [306, 454], [304, 488], [299, 520], [289, 550],
].map(([x, y]) => [x / 952, y / 1078]);

const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main(){ vUv = p * 0.5 + 0.5; vUv.y = 1.0 - vUv.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImg;
uniform float uTime;
uniform float uBlink;
uniform vec4 uEye0; // cx, cy, rx, ry
uniform vec4 uEye1;
uniform vec2 uLed[${LEDS.length}];

vec3 lidded(vec2 uv, vec4 e, vec3 col, float blink){
  // robotic shutter: the lit eye closes to a thin line, then reopens
  vec2 d = (uv - e.xy) / (e.zw * vec2(1.15, 1.35));
  float r = length(d);
  float socket = 1.0 - smoothstep(0.85, 1.05, r);
  float openY = max(0.0, 1.0 - blink) * 1.2;
  float shut = smoothstep(openY - 0.12, openY + 0.04, abs(d.y));
  vec3 lid = mix(vec3(0.10, 0.11, 0.26), vec3(0.62, 0.62, 0.78), smoothstep(0.1, 1.0, abs(d.y)));
  return mix(col, lid, socket * shut * smoothstep(0.0, 0.15, blink));
}

void main(){
  vec2 uv = (vUv - 0.5) / 1.02 + 0.5;
  uv.y += sin(uTime * 1.3) * 0.003; // breathing

  vec4 tex = texture2D(uImg, uv);
  vec3 col = tex.rgb;
  float alpha = tex.a;

  col = lidded(uv, uEye0, col, uBlink);
  col = lidded(uv, uEye1, col, uBlink);

  // glowing eyes
  float open = 1.0 - uBlink;
  float pulse = 0.55 + 0.45 * sin(uTime * 2.4);
  vec3 cyan = vec3(0.35, 0.95, 1.0);
  float glowA = 0.0;
  for (int k = 0; k < 2; k++) {
    vec4 e = k == 0 ? uEye0 : uEye1;
    vec2 q = (uv - e.xy) / e.zw;
    float r = length(q);
    float core = exp(-r * r * 5.0);
    float halo = exp(-r * r * 0.55);
    col += cyan * (core * (0.35 + 0.35 * pulse) + halo * (0.10 + 0.14 * pulse)) * open;
    vec2 sp = q - vec2(-0.28 + 0.06 * sin(uTime * 0.7), -0.22);
    col += vec3(1.0) * exp(-dot(sp, sp) * 140.0) * 0.6 * open;
    glowA = max(glowA, halo * 0.35 * open);
  }

  // headphone LED twinkle
  for (int i = 0; i < ${LEDS.length}; i++) {
    vec2 q = (uv - uLed[i]) * vec2(952.0, 1078.0);
    float tw = pow(0.5 + 0.5 * sin(uTime * 3.2 - float(i) * 0.75), 3.0);
    float g = exp(-dot(q, q) / 90.0) * (0.25 + 0.9 * tw);
    col += vec3(0.45, 0.85, 1.0) * g;
    glowA = max(glowA, g * 0.6);
  }

  // hologram scan line over the android
  float scanY = fract(uTime * 0.12) * 1.3 - 0.15;
  float scan = exp(-pow((uv.y - scanY) * 38.0, 2.0));
  col += vec3(0.55, 0.45, 1.0) * scan * alpha * 0.25;

  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  alpha = max(alpha, glowA) * inside.x * inside.y;
  alpha *= smoothstep(0.99, 0.8, uv.y); // soft fade under the shoulders
  gl_FragColor = vec4(col * alpha, alpha);
}`;

const loadImage = (src) =>
  new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

function startGL(canvas, img) {
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true, alpha: true });
  if (!gl) throw new Error("no webgl");
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const U = (n) => gl.getUniformLocation(prog, n);
  gl.uniform1i(U("uImg"), 0);
  gl.uniform4f(U("uEye0"), ...EYES[0].c, ...EYES[0].r);
  gl.uniform4f(U("uEye1"), ...EYES[1].c, ...EYES[1].r);
  gl.uniform2fv(U("uLed"), new Float32Array(LEDS.flat()));
  const uTime = U("uTime");
  const uBlink = U("uBlink");

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };

  const draw = (t, blink) => {
    resize();
    gl.uniform1f(uTime, t);
    gl.uniform1f(uBlink, blink);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const dispose = () => {
    gl.deleteTexture(tex);
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
  };
  return { draw, dispose };
}

// blink: closes and opens in ~0.22s, every ~4.2s (sometimes a double blink)
const blinkAt = (t) => {
  const cycle = t % 4.2;
  const one = (x) => (x > 0 && x < 0.22 ? Math.sin((x / 0.22) * Math.PI) : 0);
  return Math.max(one(cycle - 3.9), Math.floor(t / 4.2) % 3 === 2 ? one(cycle - 3.55) : 0);
};

export default function LiveAndroid({ className = "" }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    let raf = 0;
    let gl = null;
    let cancelled = false;
    const t0 = performance.now();

    let visible = true;
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
    });
    io.observe(wrap);

    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("reduce-motion");

    loadImage(faceImg)
      .then((img) => {
        if (cancelled) return;
        gl = startGL(canvas, img);
        const frame = () => {
          raf = requestAnimationFrame(frame);
          if (!visible) return;
          const t = (performance.now() - t0) / 1000;
          gl.draw(t, blinkAt(t));
        };
        if (reduce) gl.draw(1, 0);
        else frame();
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      gl?.dispose();
    };
  }, []);

  return (
    <div ref={wrapRef} className={`relative h-full w-full ${className}`}>
      {fallback ? (
        <div className="relative h-full w-full">
          <img
            src={faceImg}
            alt="AI interviewer"
            className="h-full w-full object-contain [mask-image:linear-gradient(to_bottom,#000_80%,transparent_99%)]"
            draggable="false"
          />
          {EYES.map((e, i) => (
            <span
              key={i}
              className="android-eye pointer-events-none absolute rounded-full bg-cyan-300 mix-blend-screen blur-md"
              style={{
                left: `${(e.c[0] - e.r[0] * 1.4) * 100}%`,
                top: `${(e.c[1] - e.r[1] * 1.6) * 100}%`,
                width: `${e.r[0] * 280}%`,
                height: `${e.r[1] * 320}%`,
              }}
            />
          ))}
        </div>
      ) : (
        <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label="Live AI interviewer" />
      )}
    </div>
  );
}
