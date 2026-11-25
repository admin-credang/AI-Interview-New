/*
 * GAZE TRACKER (runs in the candidate's browser)
 *
 * Collects per-question numbers while the candidate is ANSWERING:
 *   answer_ms, on_screen_ms, side_ms, down_ms, phone_ms, glances, sweeps
 *
 * How "off screen" is decided
 * ---------------------------
 * The first few seconds of the interview are used to learn how THIS
 * candidate looks when they read the screen (head angle + eye angle).
 * After that, a frame counts as OFF SCREEN when any of these moved
 * away from that personal normal:
 *   - head turned left / right
 *   - head tilted down (looking at a phone or notes on the desk)
 *   - eyes pointing down
 *   - eyes pointing far to one side
 *   - face not visible
 *
 * It only measures. Risk scores are calculated on the server and shown
 * to the interviewer only. These are indicators, not proof.
 *
 * ALL THE NUMBERS TO TUNE ARE IN GAZE_CONFIG BELOW.
 */

export const GAZE_CONFIG = {
  // ---- learning where THIS candidate looks when reading the SCREEN ----
  // (the candidate is told to look at the screen, NOT at the camera)
  calibrationFrames: 40, // ~4 s at 10 fps

  // ---- how far from the screen range counts as "off screen" ----
  // MEDIUM values. Bigger number = more relaxed. Level multiplies them.
  yawDev: 0.09, // head turned left / right
  pitchDownDev: 0.06, // head tilted down (phone on the desk)
  pitchUpDev: 0.14, // head tilted up (thinking, so very relaxed)
  eyeDownDev: 0.22, // eyeballs pointing down (0..1 blendshape)
  irisDev: 0.2, // eyeballs pointing far left / right

  smooth: 0.35, // 0..1, higher = follows the face faster, more jitter
  adapt: 0.003, // how fast the "normal" follows slow posture changes

  // ---- glances and warnings ----
  offConfirmMs: 700, // must stay away this long before it counts at all
  noFaceConfirmMs: 1500, // face missing this long = not visible
  glanceMinMs: 600, // a look away this long = one glance
  warnAfterMs: 2500, // candidate sees "look at the screen" after this

  // ---- reading sweep: slow drift one way, then a quick snap back ----
  sweepMinRise: 0.1, // iris travel (0..1 of eye width)
  sweepMinMs: 350, // slow part, at least
  sweepMaxMs: 3000, // slow part, at most
  sweepReturnMs: 450, // the snap back must be this fast
  sweepReturnFraction: 0.7, // and come back this much of the way

  maxFrameGapMs: 500, // ignore gaps bigger than this (tab frozen etc.)
};

/*
 * DETECTION LEVEL (the interviewer chooses it per interview)
 *   low    : only very clear look-aways are counted
 *   medium : default, balanced
 *   high   : stricter, catches smaller look-aways (more false alarms)
 * "tolerance" multiplies the limits above, "confirm" multiplies the
 * time a look-away must last before it counts.
 */
export const GAZE_LEVELS = {
  low: { tolerance: 1.6, confirm: 1.5 },
  medium: { tolerance: 1.0, confirm: 1.0 },
  high: { tolerance: 0.7, confirm: 0.7 },
};

export const DEFAULT_GAZE_LEVEL = "medium";

export function normalizeGazeLevel(level) {
  const key = String(level || "").toLowerCase();
  return GAZE_LEVELS[key] ? key : DEFAULT_GAZE_LEVEL;
}

/*
 * Head angle from face landmarks (no extra model needed).
 *   yaw   : where the nose sits between the two cheeks (0..1)
 *   pitch : how far the nose is below the eyes compared with the chin
 *           (gets bigger when the head tilts down)
 * Only the CHANGE from the candidate's own normal is used.
 */
export function computeHeadPose(landmarks) {
  try {
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const eyeA = landmarks[33];
    const eyeB = landmarks[263];
    const chin = landmarks[152];

    if (!nose || !leftCheek || !rightCheek || !eyeA || !eyeB || !chin) {
      return null;
    }

    const width = rightCheek.x - leftCheek.x;
    const eyeY = (eyeA.y + eyeB.y) / 2;
    const height = chin.y - eyeY;

    if (Math.abs(width) < 1e-4 || Math.abs(height) < 1e-4) {
      return null;
    }

    return {
      yaw: (nose.x - leftCheek.x) / width,
      pitch: (nose.y - eyeY) / height,
    };
  } catch {
    return null;
  }
}

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/*
 * One detector looks for a rise in "x". Iris position can be mirrored
 * depending on the camera, so two detectors run (x and 1 - x) and the
 * larger count is used.
 */
function createSweepDetector() {
  const C = GAZE_CONFIG;

  let minX = null;
  let maxX = null;
  let tMin = 0;
  let tMax = 0;
  let sweeps = 0;

  const reset = (x, t) => {
    minX = x;
    maxX = x;
    tMin = t;
    tMax = t;
  };

  return {
    get count() {
      return sweeps;
    },

    reset() {
      minX = null;
      maxX = null;
    },

    push(x, t) {
      if (minX === null) {
        reset(x, t);
        return;
      }

      if (x > maxX) {
        maxX = x;
        tMax = t;
      }

      const rise = maxX - minX;

      if (x < minX && rise < C.sweepMinRise * 0.5) {
        reset(x, t);
        return;
      }

      if (rise >= C.sweepMinRise) {
        const slowMs = tMax - tMin;
        const sinceTop = t - tMax;
        const comeBack = maxX - x;

        if (
          comeBack >= rise * C.sweepReturnFraction &&
          sinceTop <= C.sweepReturnMs
        ) {
          if (slowMs >= C.sweepMinMs && slowMs <= C.sweepMaxMs) {
            sweeps += 1;
          }

          reset(x, t);
          return;
        }

        if (sinceTop > C.sweepReturnMs) {
          reset(x, t);
          return;
        }
      }

      if (t - tMin > C.sweepMaxMs + C.sweepReturnMs) {
        reset(x, t);
      }
    },
  };
}

function emptyQuestion(question) {
  return {
    question,
    answer_ms: 0,
    on_screen_ms: 0,
    side_ms: 0,
    down_ms: 0,
    phone_ms: 0,
    glances: 0,
    fwd: createSweepDetector(),
    rev: createSweepDetector(),
    offSince: null,
    glanceCounted: false,
    lastT: null,
  };
}

const percentile = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
};

export function createGazeTracker(options = {}) {
  let level = normalizeGazeLevel(options.level);
  let C = { ...GAZE_CONFIG };

  const applyLevel = () => {
    const L = GAZE_LEVELS[level];
    C = {
      ...GAZE_CONFIG,
      yawDev: GAZE_CONFIG.yawDev * L.tolerance,
      pitchDownDev: GAZE_CONFIG.pitchDownDev * L.tolerance,
      pitchUpDev: GAZE_CONFIG.pitchUpDev * L.tolerance,
      eyeDownDev: GAZE_CONFIG.eyeDownDev * L.tolerance,
      irisDev: GAZE_CONFIG.irisDev * L.tolerance,
      offConfirmMs: GAZE_CONFIG.offConfirmMs * L.confirm,
      noFaceConfirmMs: GAZE_CONFIG.noFaceConfirmMs * L.confirm,
      glanceMinMs: GAZE_CONFIG.glanceMinMs * L.confirm,
      warnAfterMs: GAZE_CONFIG.warnAfterMs * L.confirm,
    };
  };
  applyLevel();

  const questions = new Map();
  let current = null;

  // ---- where the candidate looks when reading the screen ----
  const calib = { yaw: [], pitch: [], eyeDown: [], iris: [] };
  let base = null; // centre of the screen range
  let spread = { yaw: 0, pitch: 0, eyeDown: 0, iris: 0 }; // natural movement

  // smoothed live values
  const live = { yaw: null, pitch: null, eyeDown: null, iris: null };

  // how long the current "away" has lasted (raw, before confirmation)
  let rawOffSince = null;
  let rawNoFaceSince = null;

  const debug = {
    level,
    calibrated: false,
    calibrationProgress: 0,
    off: false,
    reason: "-",
    yawDev: 0,
    pitchDev: 0,
    eyeDownDev: 0,
    irisDev: 0,
    phone: false,
    answering: false,
    limits: {},
  };

  const get = (question) => {
    if (!questions.has(question)) {
      questions.set(question, emptyQuestion(question));
    }
    return questions.get(question);
  };

  const smooth = (key, value) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return null;
    }

    live[key] =
      live[key] === null
        ? value
        : live[key] + (value - live[key]) * C.smooth;

    return live[key];
  };

  /** learn the candidate's SCREEN range from the first frames */
  const calibrate = (frame) => {
    if (base || frame.faces !== 1 || frame.closed) {
      return;
    }

    if (typeof frame.yaw !== "number" || typeof frame.pitch !== "number") {
      return;
    }

    calib.yaw.push(frame.yaw);
    calib.pitch.push(frame.pitch);

    if (typeof frame.eyeDown === "number") calib.eyeDown.push(frame.eyeDown);
    if (typeof frame.irisX === "number") calib.iris.push(frame.irisX);

    debug.calibrationProgress = Math.min(
      1,
      calib.yaw.length / C.calibrationFrames
    );

    if (calib.yaw.length >= C.calibrationFrames) {
      const half = (list) =>
        list.length ? (percentile(list, 0.9) - percentile(list, 0.1)) / 2 : 0;

      base = {
        yaw: median(calib.yaw),
        pitch: median(calib.pitch),
        eyeDown: calib.eyeDown.length ? median(calib.eyeDown) : null,
        iris: calib.iris.length ? median(calib.iris) : null,
      };

      // people who naturally move more get a wider "on screen" range
      spread = {
        yaw: half(calib.yaw),
        pitch: half(calib.pitch),
        eyeDown: half(calib.eyeDown),
        iris: half(calib.iris),
      };

      debug.calibrated = true;
    }
  };

  /** raw (unconfirmed) decision: is this frame away from the screen */
  const classifyRaw = (frame) => {
    if (frame.faces !== 1) {
      return { noFace: true, off: false, side: false, down: false, reason: "face not visible" };
    }

    if (frame.closed) {
      // a blink / thinking with closed eyes is NOT looking away
      return { noFace: false, off: false, side: false, down: false, reason: "eyes closed" };
    }

    // Until the screen range is learned nothing is flagged.
    if (!base) {
      return { noFace: false, off: false, side: false, down: false, reason: "learning" };
    }

    let side = false;
    let down = false;
    let reason = "";

    const yaw = smooth("yaw", frame.yaw);
    const pitch = smooth("pitch", frame.pitch);
    const eyeDown = smooth("eyeDown", frame.eyeDown);
    const iris = smooth("iris", frame.irisX);

    debug.yawDev = yaw === null ? 0 : yaw - base.yaw;
    debug.pitchDev = pitch === null ? 0 : pitch - base.pitch;
    debug.eyeDownDev =
      eyeDown === null || base.eyeDown === null ? 0 : eyeDown - base.eyeDown;
    debug.irisDev = iris === null || base.iris === null ? 0 : iris - base.iris;

    const lim = {
      yaw: C.yawDev + spread.yaw,
      pitchDown: C.pitchDownDev + spread.pitch,
      pitchUp: C.pitchUpDev + spread.pitch,
      eyeDown: C.eyeDownDev + spread.eyeDown,
      iris: C.irisDev + spread.iris,
    };
    debug.limits = lim;

    if (Math.abs(debug.yawDev) > lim.yaw) {
      side = true;
      reason = "head turned";
    }

    if (debug.pitchDev > lim.pitchDown) {
      down = true;
      reason = "head down";
    } else if (-debug.pitchDev > lim.pitchUp) {
      side = true;
      reason = "head up";
    }

    if (debug.eyeDownDev > lim.eyeDown) {
      down = true;
      reason = reason || "eyes down";
    }

    if (Math.abs(debug.irisDev) > lim.iris) {
      side = true;
      reason = reason || "eyes to the side";
    }

    // slowly follow posture changes while the candidate IS on screen
    if (!side && !down) {
      const a = C.adapt;
      base.yaw += (yaw - base.yaw) * a;
      base.pitch += (pitch - base.pitch) * a;
      if (base.eyeDown !== null && eyeDown !== null) {
        base.eyeDown += (eyeDown - base.eyeDown) * a;
      }
      if (base.iris !== null && iris !== null) {
        base.iris += (iris - base.iris) * a;
      }
    }

    return {
      noFace: false,
      off: side || down,
      side,
      down,
      reason: reason || "on screen",
    };
  };

  /** confirmed decision: a look-away must last before it counts */
  const classify = (frame, t) => {
    const raw = classifyRaw(frame);

    if (raw.noFace) {
      rawOffSince = null;
      if (rawNoFaceSince === null) rawNoFaceSince = t;
      const confirmed = t - rawNoFaceSince >= C.noFaceConfirmMs;
      return { ...raw, off: confirmed, rawOff: true, confirmed };
    }

    rawNoFaceSince = null;

    if (!raw.off) {
      rawOffSince = null;
      return { ...raw, rawOff: false, confirmed: false };
    }

    if (rawOffSince === null) rawOffSince = t;
    const confirmed = t - rawOffSince >= C.offConfirmMs;

    return {
      ...raw,
      off: confirmed,
      side: confirmed && raw.side,
      down: confirmed && raw.down,
      rawOff: true,
      confirmed,
    };
  };

  return {
    /** call when a new question is shown */
    setQuestion(question) {
      const n = Number(question);

      if (!n || n < 1) {
        return;
      }

      current = get(n);
      current.lastT = null;
      current.offSince = null;
      current.glanceCounted = false;
    },

    /**
     * call for every monitored frame
     *   answering : candidate is answering (mic on, AI not speaking)
     *   frame     : { faces, irisX, away, down, closed,
     *                 yaw, pitch, eyeDown, phone }
     * returns { off, offFor } while answering, otherwise null
     */
    sample(t, answering, frame) {
      calibrate(frame);

      debug.answering = Boolean(answering);
      debug.phone = Boolean(frame.phone);

      const decision = classify(frame, t);

      debug.off = decision.off;
      debug.reason = decision.reason;

      if (!current) {
        return null;
      }

      const q = current;

      if (!answering) {
        q.lastT = null;
        q.offSince = null;
        q.glanceCounted = false;
        q.fwd.reset();
        q.rev.reset();
        return null;
      }

      if (q.lastT === null) {
        q.lastT = t;
        return null;
      }

      const dt = t - q.lastT;
      q.lastT = t;

      if (dt <= 0 || dt > C.maxFrameGapMs) {
        return null;
      }

      const noFace = frame.faces !== 1;

      q.answer_ms += dt;

      if (!decision.off) {
        q.on_screen_ms += dt;
      }

      if (!noFace && decision.side) {
        q.side_ms += dt;
      }

      if (!noFace && decision.down) {
        q.down_ms += dt;
      }

      if (frame.phone) {
        q.phone_ms += dt;
      }

      // ---- glances ----
      let offFor = 0;

      if (decision.off) {
        if (q.offSince === null) {
          q.offSince = t;
          q.glanceCounted = false;
        }

        offFor = t - q.offSince;

        if (!q.glanceCounted && offFor >= C.glanceMinMs) {
          q.glances += 1;
          q.glanceCounted = true;
        }
      } else {
        q.offSince = null;
        q.glanceCounted = false;
      }

      // ---- reading sweeps (eye moving along a line of text) ----
      // reading sweeps only count while the eyes are away from the
      // screen (reading the on-screen question is normal)
      if (
        decision.rawOff &&
        !noFace &&
        !frame.closed &&
        typeof frame.irisX === "number"
      ) {
        q.fwd.push(frame.irisX, t);
        q.rev.push(1 - frame.irisX, t);
      }

      return { off: decision.off, offFor };
    },

    /** payload for one question, or null when there is nothing yet */
    snapshot(question) {
      const q = questions.get(Number(question));

      if (!q || q.answer_ms < 1000) {
        return null;
      }

      return {
        question: q.question,
        answer_ms: Math.round(q.answer_ms),
        on_screen_ms: Math.round(q.on_screen_ms),
        side_ms: Math.round(q.side_ms),
        down_ms: Math.round(q.down_ms),
        phone_ms: Math.round(q.phone_ms),
        glances: q.glances,
        sweeps: Math.max(q.fwd.count, q.rev.count),
      };
    },

    /** every question that has data */
    snapshotAll() {
      return [...questions.keys()]
        .map((n) => this.snapshot(n))
        .filter(Boolean);
    },

    /** change the detection level (low / medium / high) */
    setLevel(next) {
      level = normalizeGazeLevel(next);
      debug.level = level;
      applyLevel();
    },

    get level() {
      return level;
    },

    get currentQuestion() {
      return current ? current.question : null;
    },

    get debug() {
      return debug;
    },
  };
}
