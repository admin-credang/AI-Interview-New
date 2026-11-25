import { useEffect, useRef } from "react";

// three.js is loaded from a CDN at runtime, so the project needs NO extra
// npm package (no "npm install three"). If it cannot be loaded (offline,
// blocked network, no WebGL) the page shows the SVG robot instead.
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";
let threePromise = null;
const loadThree = () => {
  if (!threePromise) {
    threePromise = import(/* @vite-ignore */ THREE_URL).catch((err) => {
      threePromise = null;
      throw err;
    });
  }
  return threePromise;
};

// Small studio environment for reflections (replaces three's RoomEnvironment,
// which would need a second module import).
function makeEnvironment(THREE, renderer) {
  const envScene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(10, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xf1ecff, side: THREE.BackSide }),
  );
  envScene.add(room);
  const panel = (w, h, color, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    envScene.add(m);
    return m;
  };
  panel(6, 2, 0xffffff, [0, 4.9, 0], [Math.PI / 2, 0, 0]);
  panel(3, 3, 0xffffff, [-4.9, 1, 1], [0, Math.PI / 2, 0]);
  panel(2, 4, 0xd8b4fe, [4.9, 0.5, -1], [0, -Math.PI / 2, 0]);
  panel(4, 2, 0xf5d0fe, [0, 0, -4.9]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(envScene, 0.04).texture;
  envScene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return { tex, pmrem };
}

// ============================================================
// Real-time 3D AI interviewer (three.js), built from simple shapes
// so it needs no model files:
//  - glossy white shell, dark glass visor, purple glowing eyes/core
//  - headset with boom mic (it is an interviewer)
//  - waves "hi" with one hand, blinks, floats, head follows the mouse
//  - stands on a glowing hologram platform
// Falls back (onFail) when WebGL is not available.
// ============================================================

function start(THREE, mount, onFail) {
  // ---------- renderer ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    onFail?.();
    return () => {};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  const { tex: envTex, pmrem } = makeEnvironment(THREE, renderer);
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 2.3, 9.6);
  camera.lookAt(0, 2.05, 0);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a6f5, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 6, 6);
  scene.add(key);
  const rimL = new THREE.PointLight(0xa855f7, 40, 12);
  rimL.position.set(-3.2, 3.4, -2);
  scene.add(rimL);
  const rimR = new THREE.PointLight(0xd946ef, 30, 12);
  rimR.position.set(3.2, 2.4, -2);
  scene.add(rimR);
  const front = new THREE.PointLight(0xc4b5fd, 10, 10);
  front.position.set(0, 2, 4);
  scene.add(front);

  // ---------- materials ----------
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf8f6ff, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06 });
  const lavender = new THREE.MeshPhysicalMaterial({ color: 0xd8ccff, roughness: 0.3, metalness: 0.15, clearcoat: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x12062b, roughness: 0.04, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 });
  const metal = new THREE.MeshPhysicalMaterial({ color: 0x6d28d9, roughness: 0.28, metalness: 0.75, clearcoat: 0.5 });
  const darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x2a1458, roughness: 0.35, metalness: 0.7 });
  const glowPurple = new THREE.MeshStandardMaterial({ color: 0xd8b4fe, emissive: 0xa855f7, emissiveIntensity: 2.6 });
  const glowPink = new THREE.MeshStandardMaterial({ color: 0xf5d0fe, emissive: 0xd946ef, emissiveIntensity: 2.2 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x9333ea, emissiveIntensity: 1.5 });
  const glowSoft = new THREE.MeshBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.35, depthWrite: false });

  const mats = [white, lavender, glass, metal, darkMetal, glowPurple, glowPink, glowSoft, eyeMat];
  const geos = [];
  const mesh = (geo, mat) => {
    geos.push(geo);
    return new THREE.Mesh(geo, mat);
  };

  const robot = new THREE.Group();
  scene.add(robot);

  // ---------- hologram platform ----------
  const platform = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(1.55, 1.7, 0.2, 64), white);
  base.position.y = 0.1;
  platform.add(base);
  const baseTop = mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.04, 64), lavender);
  baseTop.position.y = 0.22;
  platform.add(baseTop);
  const ring1 = mesh(new THREE.TorusGeometry(1.45, 0.03, 16, 96), glowPurple);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 0.21;
  platform.add(ring1);
  const ring2 = mesh(new THREE.TorusGeometry(1.95, 0.015, 8, 128), glowPink);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.12;
  platform.add(ring2);
  const halo = mesh(new THREE.CircleGeometry(2.4, 64), glowSoft);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.01;
  platform.add(halo);
  // light beam
  const beam = mesh(
    new THREE.CylinderGeometry(1.25, 1.35, 3.6, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
  );
  mats.push(beam.material);
  beam.position.y = 2;
  platform.add(beam);
  scene.add(platform);

  // ---------- body (hovering bust) ----------
  const body = new THREE.Group();
  body.position.y = 0.35;
  robot.add(body);

  const profile = [
    [0.0, 0.3], [0.34, 0.3], [0.44, 0.42], [0.5, 0.7], [0.62, 1.05], [0.86, 1.4], [1.0, 1.68],
    [1.04, 1.86], [0.96, 2.0], [0.66, 2.12], [0.3, 2.18], [0.0, 2.2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torso = mesh(new THREE.LatheGeometry(profile, 72), white);
  torso.scale.set(1, 1, 0.66);
  body.add(torso);

  // chest glass panel + core
  const chest = mesh(new THREE.SphereGeometry(0.34, 48, 32), glass);
  chest.scale.set(1, 0.9, 0.5);
  chest.position.set(0, 1.42, 0.5);
  body.add(chest);
  const core = mesh(new THREE.SphereGeometry(0.12, 32, 16), eyeMat);
  core.position.set(0, 1.42, 0.66);
  body.add(core);
  const coreRing = mesh(new THREE.TorusGeometry(0.19, 0.03, 16, 48), metal);
  coreRing.position.set(0, 1.42, 0.64);
  body.add(coreRing);
  // pec plates + abdominal segments (lavender panels)
  [-1, 1].forEach((sd) => {
    const pec = mesh(new THREE.SphereGeometry(0.36, 40, 24), lavender);
    pec.scale.set(1, 0.55, 0.32);
    pec.position.set(sd * 0.42, 1.68, 0.5);
    pec.rotation.y = sd * 0.35;
    body.add(pec);
  });
  [1.08, 0.86, 0.64].forEach((y, i) => {
    const ab = mesh(new THREE.CapsuleGeometry(0.07, 0.36 - i * 0.06, 6, 16), lavender);
    ab.rotation.z = Math.PI / 2;
    ab.position.set(0, y, 0.43 - i * 0.07);
    body.add(ab);
  });
  // side panels
  [-1, 1].forEach((sd) => {
    const side = mesh(new THREE.CapsuleGeometry(0.05, 0.6, 6, 16), metal);
    side.position.set(sd * 0.78, 1.25, 0.16);
    side.rotation.z = sd * 0.42;
    body.add(side);
  });

  // hover ring under the waist
  const waist = mesh(new THREE.TorusGeometry(0.4, 0.06, 16, 64), glowPurple);
  waist.rotation.x = Math.PI / 2;
  waist.position.y = 0.28;
  body.add(waist);

  // neck
  const neck = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 32), darkMetal);
  neck.position.y = 2.32;
  body.add(neck);
  [2.22, 2.34, 2.46].forEach((y) => {
    const r = mesh(new THREE.TorusGeometry(0.18, 0.022, 8, 32), metal);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    body.add(r);
  });

  // ---------- head ----------
  const head = new THREE.Group();
  head.position.y = 2.98;
  body.add(head);

  const skull = mesh(new THREE.SphereGeometry(0.6, 64, 48), white);
  skull.scale.set(0.93, 1.08, 0.98);
  head.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(0.42, 48, 32), white);
  jaw.scale.set(1, 0.7, 0.95);
  jaw.position.set(0, -0.33, 0.12);
  head.add(jaw);

  // visor band (dark glass across the eyes)
  const visor = mesh(new THREE.SphereGeometry(0.606, 64, 32, Math.PI / 2 - 1.0, 2.0, 1.05, 0.62), glass);
  visor.scale.set(0.94, 1.09, 0.99);
  head.add(visor);

  // eyes
  const eyes = new THREE.Group();
  eyes.position.set(0, 0.0, 0);
  head.add(eyes);
  [-0.19, 0.19].forEach((x) => {
    const eye = mesh(new THREE.CapsuleGeometry(0.045, 0.14, 8, 16), eyeMat);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(x, 0.07, 0.565);
    eye.rotation.y = x * 0.9;
    eyes.add(eye);
  });

  // voice bars (mouth)
  const bars = [];
  for (let i = 0; i < 5; i += 1) {
    const b = mesh(new THREE.BoxGeometry(0.025, 0.08, 0.02), glowPink);
    b.position.set(-0.08 + i * 0.04, -0.3, 0.5);
    head.add(b);
    bars.push(b);
  }

  // forehead light strip
  const strip = mesh(new THREE.CapsuleGeometry(0.018, 0.16, 6, 12), glowPink);
  strip.rotation.z = Math.PI / 2;
  strip.position.set(0, 0.42, 0.5);
  strip.rotation.x = -0.6;
  head.add(strip);

  // headset: band + ear cups + boom mic
  const band = mesh(new THREE.TorusGeometry(0.66, 0.04, 16, 64, Math.PI), darkMetal);
  band.position.y = 0.02;
  head.add(band);
  [-1, 1].forEach((s) => {
    const cup = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 40), metal);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(s * 0.6, 0.0, 0);
    head.add(cup);
    const glow = mesh(new THREE.TorusGeometry(0.11, 0.022, 12, 40), s < 0 ? glowPurple : glowPink);
    glow.rotation.y = Math.PI / 2;
    glow.position.set(s * 0.69, 0.0, 0);
    head.add(glow);
  });
  const micCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.62, -0.08, 0.08),
    new THREE.Vector3(-0.55, -0.34, 0.36),
    new THREE.Vector3(-0.3, -0.44, 0.55),
    new THREE.Vector3(-0.12, -0.4, 0.6),
  ]);
  head.add(mesh(new THREE.TubeGeometry(micCurve, 40, 0.018, 8, false), darkMetal));
  const micTip = mesh(new THREE.SphereGeometry(0.045, 20, 12), glowPurple);
  micTip.position.set(-0.11, -0.4, 0.61);
  head.add(micTip);

  // ---------- arms ----------
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 1.08, 1.8, 0);
    body.add(shoulder);

    const pad = mesh(new THREE.SphereGeometry(0.33, 40, 24), white);
    pad.scale.set(1, 0.9, 0.95);
    shoulder.add(pad);
    const joint = mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 40), metal);
    joint.rotation.y = Math.PI / 2;
    joint.position.x = side * 0.18;
    shoulder.add(joint);

    const upper = mesh(new THREE.CapsuleGeometry(0.16, 0.5, 8, 24), white);
    upper.position.y = -0.45;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.82;
    shoulder.add(elbow);
    elbow.add(mesh(new THREE.SphereGeometry(0.16, 24, 16), darkMetal));
    const elbowGlow = mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 32), side < 0 ? glowPurple : glowPink);
    elbowGlow.rotation.y = Math.PI / 2;
    elbow.add(elbowGlow);

    const fore = mesh(new THREE.CapsuleGeometry(0.14, 0.46, 8, 24), white);
    fore.position.y = -0.4;
    elbow.add(fore);
    const wrist = mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 32), glowPurple);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.y = -0.7;
    elbow.add(wrist);
    const hand = mesh(new THREE.SphereGeometry(0.15, 24, 16), lavender);
    hand.scale.set(0.85, 1.2, 0.7);
    hand.position.y = -0.86;
    elbow.add(hand);
    // fingers
    for (let i = 0; i < 4; i += 1) {
      const f = mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 8), white);
      f.position.set(-0.08 + i * 0.055, -1.03, 0.02);
      elbow.add(f);
    }
    return { shoulder, elbow };
  };
  const rightArm = makeArm(-1); // waving (viewer's left)
  const leftArm = makeArm(1);
  leftArm.shoulder.rotation.z = 0.22;
  leftArm.elbow.rotation.z = -0.25;
  leftArm.elbow.rotation.x = -0.35;

  // ---------- floating particles ----------
  const pCount = 140;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i += 1) {
    const r = 1.8 + Math.random() * 1.6;
    const a = Math.random() * Math.PI * 2;
    pPos[i * 3] = Math.cos(a) * r;
    pPos[i * 3 + 1] = 0.3 + Math.random() * 3.8;
    pPos[i * 3 + 2] = Math.sin(a) * r * 0.6;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  geos.push(pGeo);
  const pMat = new THREE.PointsMaterial({ color: 0xa855f7, size: 0.045, transparent: true, opacity: 0.8, depthWrite: false });
  mats.push(pMat);
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // ---------- interaction ----------
  const pointer = { x: 0, y: 0 };
  const onMove = (e) => {
    const r = mount.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, ((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2))));
    pointer.y = Math.max(-1, Math.min(1, ((e.clientY - (r.top + r.height * 0.3)) / (window.innerHeight / 2))));
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  const resize = () => {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  });
  io.observe(mount);

  const reduce =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("reduce-motion");

  const clock = new THREE.Clock();
  let raf = 0;

  const pose = (t) => {
    // float
    robot.position.y = Math.sin(t * 1.4) * 0.06;
    // waving arm (raised, forearm swings)
    rightArm.shoulder.rotation.z = -2.25 + Math.sin(t * 0.7) * 0.05;
    rightArm.shoulder.rotation.x = -0.15;
    rightArm.elbow.rotation.z = -0.55 + Math.sin(t * 5) * 0.35;
    // head follows the mouse
    head.rotation.y += (pointer.x * 0.55 - head.rotation.y) * 0.08;
    head.rotation.x += (pointer.y * 0.22 - head.rotation.x) * 0.08;
    body.rotation.y += (pointer.x * 0.18 - body.rotation.y) * 0.05;
    // blink every ~4s
    const blink = t % 4.2;
    eyes.scale.y = blink > 4.05 ? 0.15 : 1;
    // talking bars
    bars.forEach((b, i) => {
      b.scale.y = 0.6 + Math.abs(Math.sin(t * 9 + i * 1.3)) * 1.4;
    });
    // glows pulse
    glowPurple.emissiveIntensity = 2.3 + Math.sin(t * 2.2) * 0.5;
    eyeMat.emissiveIntensity = 1.4 + Math.sin(t * 2.2) * 0.4;
    ring2.rotation.z = t * 0.25;
    particles.rotation.y = t * 0.06;
  };

  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!visible) return;
    pose(clock.getElapsedTime());
    renderer.render(scene, camera);
  };

  if (reduce) {
    pose(1.2);
    renderer.render(scene, camera);
  } else {
    loop();
  }

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    ro.disconnect();
    io.disconnect();
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
  };
}

export default function Robot3D({ onFail }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let cleanup = null;
    let cancelled = false;

    loadThree()
      .then((THREE) => {
        if (cancelled) return;
        cleanup = start(THREE, mount, onFail);
      })
      .catch(() => {
        if (!cancelled) onFail?.();
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [onFail]);

  return <div ref={mountRef} className="h-full w-full" aria-label="3D AI interviewer robot" role="img" />;
}
