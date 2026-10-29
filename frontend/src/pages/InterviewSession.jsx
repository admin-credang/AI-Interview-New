import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";
import {
  canRecordAudio,
  createAnswerRecorder,
  transcribeAnswer,
} from "../services/answerRecorder";
import {
  createGazeTracker,
  computeHeadPose,
  GAZE_CONFIG,
} from "../services/gazeTracker";


/*
 * ============================================================
 * INTERVIEW SESSION
 * ============================================================
 *
 * MONITORING
 *
 * Camera
 *   -> Controls camera stream
 *
 * Face Detection
 *   -> Controls MediaPipe face detection
 *
 * Eye / Gaze Detection
 *   -> Controls eye/gaze processing
 *
 * Dependency:
 *
 * Camera OFF
 *   -> Face OFF
 *   -> Eye OFF
 *
 * Face OFF
 *   -> Eye OFF
 *
 * Eye ON
 *   -> Camera ON
 *   -> Face ON
 *
 * Interview flow is independent from monitoring.
 *
 * Q1 -> Answer -> Follow-up/Next
 * Q2 -> Answer -> Follow-up/Next
 * Q3 -> Answer -> Follow-up/Next
 * Q4 -> Answer -> Follow-up/Next
 * Q5 -> Complete
 *
 * ============================================================
 */

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isTrue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    return [
      "true",
      "1",
      "yes",
      "y",
    ].includes(value.trim().toLowerCase());
  }

  return false;
}

function normalizeAction(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getParameterSources(data) {
  return [
    data?.parameters,
    data?.sessionInfo?.parameters,
    data?.session_info?.parameters,
    data?.data?.parameters,
    data?.result?.parameters,
    data?.response?.parameters,
  ].filter(
    (value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function getMergedParameters(data) {
  const sources = getParameterSources(data);

  return Object.assign({}, ...sources);
}

function normalizeValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeValue(item))
      .filter(
        (item) =>
          item !== null &&
          item !== undefined &&
          item !== ""
      );
  }

  if (typeof value === "object") {
    return (
      normalizeValue(value.value) ??
      normalizeValue(value.text) ??
      normalizeValue(value.answer) ??
      normalizeValue(value.question) ??
      null
    );
  }

  return String(value);
}

function normalizeQuestion(
  rawQuestion,
  fallback = {}
) {
  if (!rawQuestion) {
    return null;
  }

  if (typeof rawQuestion === "string") {
    const questionText =
      rawQuestion.trim();

    if (!questionText) {
      return null;
    }

    return {
      id:
        fallback.id ||
        fallback.question_id ||
        fallback.questionId ||
        null,

      question: questionText,

      question_number:
        Number(
          fallback.question_number ??
            fallback.questionNumber ??
            1
        ) || 1,

      total_questions:
        Number(
          fallback.total_questions ??
            fallback.totalQuestions ??
            0
        ) || null,

      question_type:
        fallback.question_type ||
        fallback.questionType ||
        "technical",

      category:
        fallback.category ||
        "technical",

      difficulty:
        fallback.difficulty ||
        null,

      is_follow_up: isTrue(
        fallback.is_follow_up ??
          fallback.isFollowUp
      ),

      parent_question_id:
        fallback.parent_question_id ||
        fallback.parentQuestionId ||
        null,
    };
  }

  const questionText = String(
    rawQuestion.question ||
      rawQuestion.text ||
      rawQuestion.question_text ||
      rawQuestion.questionText ||
      ""
  ).trim();

  if (!questionText) {
    return null;
  }

  return {
    id:
      rawQuestion.id ||
      rawQuestion.question_id ||
      rawQuestion.questionId ||
      fallback.id ||
      fallback.question_id ||
      fallback.questionId ||
      null,

    question: questionText,

    question_number:
      Number(
        rawQuestion.question_number ??
          rawQuestion.questionNumber ??
          fallback.question_number ??
          fallback.questionNumber ??
          1
      ) || 1,

    total_questions:
      Number(
        rawQuestion.total_questions ??
          rawQuestion.totalQuestions ??
          fallback.total_questions ??
          fallback.totalQuestions ??
          0
      ) || null,

    question_type:
      rawQuestion.question_type ||
      rawQuestion.questionType ||
      fallback.question_type ||
      fallback.questionType ||
      "technical",

    category:
      rawQuestion.category ||
      fallback.category ||
      "technical",

    difficulty:
      rawQuestion.difficulty ||
      fallback.difficulty ||
      null,

    is_follow_up: isTrue(
      rawQuestion.is_follow_up ??
        rawQuestion.isFollowUp ??
        fallback.is_follow_up ??
        fallback.isFollowUp
    ),

    parent_question_id:
      rawQuestion.parent_question_id ||
      rawQuestion.parentQuestionId ||
      fallback.parent_question_id ||
      fallback.parentQuestionId ||
      null,
  };
}

/*
 * ============================================================
 * FACE / EYE HELPERS
 * ============================================================
 */

function distance(a, b) {
  if (!a || !b) {
    return 0;
  }

  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2)
  );
}

function calculateEyeAspectRatio(
  top,
  bottom,
  left,
  right
) {
  const vertical = distance(
    top,
    bottom
  );

  const horizontal = distance(
    left,
    right
  );

  if (!horizontal) {
    return 0;
  }

  return vertical / horizontal;
}

function calculateIrisPosition(
  irisPoints,
  leftCorner,
  rightCorner
) {
  if (
    !irisPoints ||
    irisPoints.length === 0 ||
    !leftCorner ||
    !rightCorner
  ) {
    return 0.5;
  }

  const center =
    irisPoints.reduce(
      (acc, point) => ({
        x: acc.x + point.x,
        y: acc.y + point.y,
      }),
      {
        x: 0,
        y: 0,
      }
    );

  center.x /=
    irisPoints.length;

  center.y /=
    irisPoints.length;

  const width =
    rightCorner.x -
    leftCorner.x;

  if (
    Math.abs(width) <
    0.0001
  ) {
    return 0.5;
  }

  return (
    (center.x -
      leftCorner.x) /
    width
  );
}

/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

/*
 * ============================================================
 * VOICE YES / NO PARSER (used for the follow-up offer)
 * ============================================================
 * Returns "yes", "no" or null (could not understand).
 */
/*
 * ============================================================
 * MONITORING THRESHOLDS  (tune these without touching the logic)
 * ============================================================
 */
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";

// Phone detection (MediaPipe object detector, COCO "cell phone")
const PHONE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";
const PHONE_SCORE_THRESHOLD = 0.4; // min confidence for a phone
const PHONE_CHECK_INTERVAL_MS = 600; // run detector ~1.5x per second
const PHONE_TERMINATE_MS = 3000; // phone must stay visible this long
const PHONE_GRACE_MS = 1500; // tolerate missed frames before resetting

// Looking down (eye-ball movement, via MediaPipe blendshapes)
const LOOK_DOWN_SCORE = 0.5; // 0..1, average of both eyes
const LOOK_DOWN_EPISODE_MS = 1000; // one "glance down" = at least this long
const LOOK_DOWN_TERMINATE_MS = 2500; // one long continuous look down
const LOOK_DOWN_REPEAT_COUNT = 4; // this many glances ...
const LOOK_DOWN_REPEAT_WINDOW_MS = 90000; // ... within this window

// Cheating / monitoring flags are NOT ending the interview any more.
// They are saved for the interviewer's report (backend event types).
const REASON_TO_EVENT = {
  no_face_detected: "face_not_found",
  multiple_faces_detected: "multiple_faces",
  eyes_closed: "eyes_closed",
  looking_away: "looking_away",
  looking_down: "looking_down",
  repeated_looking_down: "looking_down",
  phone_detected: "phone_detected",
  candidate_left_interview_page: "tab_left",
};

/*
 * ============================================================
 * AI INTERVIEWER VOICES
 * ============================================================
 * Three voices the candidate can choose from. The browser's
 * installed voices differ per device, so each profile lists
 * the best-sounding voices to look for (natural / online
 * voices first) and falls back to any English voice of the
 * right gender. Rate / pitch are tuned to sound clear and
 * confident.
 */
const VOICE_PROFILES = {
  aria: {
    label: "Aria - Young female",
    gender: "female",
    rate: 1.05,
    pitch: 1.2,
    names: [
      "Aria",
      "Jenny",
      "Neerja",
      "Zira",
      "Google UK English Female",
      "Samantha",
      "Heera",
    ],
  },
  ryan: {
    label: "Ryan - Male",
    gender: "male",
    rate: 1.0,
    pitch: 0.95,
    names: [
      "Ryan",
      "Guy",
      "Prabhat",
      "Google UK English Male",
      "David",
      "Mark",
      "Daniel",
      "Alex",
    ],
  },
  maya: {
    label: "Maya - Confident",
    gender: "female",
    rate: 1.0,
    pitch: 0.88,
    names: [
      "Sonia",
      "Libby",
      "Google US English",
      "Zira",
      "Neerja",
      "Samantha",
      "Karen",
    ],
  },
};

const DEFAULT_VOICE_ID = "aria";

const FEMALE_VOICE_RE =
  /female|woman|aria|jenny|zira|samantha|susan|hazel|heera|neerja|sonia|libby|karen|tessa|victoria|moira|fiona/i;

const MALE_VOICE_RE =
  /(^|[^a-z])male|man\b|david|mark|guy|ryan|daniel|alex|george|prabhat|james|ravi|fred|thomas/i;

function pickVoice(voiceId) {
  const synth = window.speechSynthesis;

  if (!synth) {
    return null;
  }

  const profile =
    VOICE_PROFILES[voiceId] ||
    VOICE_PROFILES[DEFAULT_VOICE_ID];

  const english = (
    synth.getVoices() || []
  ).filter((v) =>
    /^en/i.test(v.lang || "")
  );

  if (english.length === 0) {
    return null;
  }

  // natural / online voices sound far better than the old ones
  const quality = (v) =>
    /natural|online/i.test(v.name)
      ? 0
      : 1;

  const ranked = [...english].sort(
    (a, b) => quality(a) - quality(b)
  );

  for (const name of profile.names) {
    const hit = ranked.find((v) =>
      v.name
        .toLowerCase()
        .includes(name.toLowerCase())
    );

    if (hit) {
      return hit;
    }
  }

  const wantRe =
    profile.gender === "male"
      ? MALE_VOICE_RE
      : FEMALE_VOICE_RE;

  return (
    ranked.find((v) =>
      wantRe.test(v.name)
    ) ||
    ranked[0]
  );
}

function buildUtterance(text, voiceId) {
  const profile =
    VOICE_PROFILES[voiceId] ||
    VOICE_PROFILES[DEFAULT_VOICE_ID];

  const utterance =
    new SpeechSynthesisUtterance(text);

  const voice = pickVoice(voiceId);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }

  utterance.rate = profile.rate;
  utterance.pitch = profile.pitch;
  utterance.volume = 1;

  return utterance;
}

const VIOLATION_MESSAGES = {
  face_not_found: "Face not visible - please stay in front of the camera.",
  multiple_faces: "More than one person detected in the camera.",
  eyes_closed: "Eyes closed for a long time.",
  looking_away: "Please look at the screen.",
  looking_down: "Please avoid looking down.",
  phone_detected: "Phone detected - please keep it away.",
  tab_left: "Please stay on the interview page.",
};

const VIOLATION_REPEAT_MS = 30000; // same flag saved to the report at most every 30 s
const VIOLATION_NOTICE_REPEAT_MS = 8000; // warning on screen again after this long
const MONITOR_INTERVAL_MS = 100; // face/eye check ~10x per second (was every frame)
const LOOK_DOWN_CALIBRATION_MS = 3000; // learn the normal "reading the screen" eye angle
const LOOK_DOWN_MARGIN = 0.2; // must be this much below the learned normal

const WARMUP_PROMPTS = [
  "Hi, welcome to your interview! How has your day been so far?",
  "That's nice to hear! Before we begin, how are you feeling about the interview today?",
  "That's great! There's no need to feel nervous. Take your time, and just answer naturally. If you need a moment to think, that's completely fine. Are you ready to begin?",
];

const WARMUP_REPLIES = [
  WARMUP_PROMPTS[1],
  WARMUP_PROMPTS[2],
  "Wonderful! Let's get started. I'll ask you questions based on the role you're applying for, one at a time. Best of luck!",
];

const CLOSING_SPEECH =
  "Thank you. Your interview is complete. The interviewer will review your answers.";

const YES_WORDS =
  /\b(yes|yeah|yep|yup|yea|sure|ok|okay|please|definitely|absolutely|go ahead|of course|ask)\b/i;
const NO_WORDS =
  /\b(no|nope|nah|not|skip|next|don'?t|do not|no thanks|no thank you)\b/i;

const parseYesNo = (text) => {
  const spoken = String(text || "").trim();
  if (!spoken) return null;
  const yes = YES_WORDS.test(spoken);
  const no = NO_WORDS.test(spoken);
  if (yes && !no) return "yes";
  if (no && !yes) return "no";
  return null;
};

function getSessionFlag(sessionId, flag) {
  if (!sessionId) {
    return false;
  }

  try {
    return localStorage.getItem(
      `interview_${flag}_${sessionId}`
    ) === "1";
  } catch {
    return false;
  }
}

function setSessionFlag(sessionId, flag) {
  if (!sessionId) {
    return;
  }

  try {
    localStorage.setItem(
      `interview_${flag}_${sessionId}`,
      "1"
    );
  } catch {
    // The session can continue without persistence when storage is unavailable.
  }
}

export default function InterviewSession() {
  const {
    interviewId,
    sessionId,
  } = useParams();

  const navigate =
    useNavigate();

  /*
   * ============================================================
   * INTERVIEW STATE
   * ============================================================
   */

  const [phase, setPhase] =
    useState(() =>
      getSessionFlag(sessionId, "ready") ||
      getSessionFlag(sessionId, "warmup_complete")
        ? "loading"
        : "warmup"
    );

  // becomes true when the candidate says / clicks "Yes"
  const [ready, setReady] =
    useState(() =>
      getSessionFlag(sessionId, "ready") ||
      getSessionFlag(sessionId, "warmup_complete")
    );

  const [warmupDraft, setWarmupDraft] =
    useState("");

  const [warmupStep, setWarmupStep] =
    useState(0);

  const [warmupStarted, setWarmupStarted] =
    useState(false);

  const [warmupStarting, setWarmupStarting] =
    useState(false);

  const [warmupVoiceError, setWarmupVoiceError] =
    useState("");

  const [warmupResponse, setWarmupResponse] =
    useState("");

  const [warmupManualInput, setWarmupManualInput] =
    useState(false);

  const [warmupSubmitting, setWarmupSubmitting] =
    useState(false);

  const [warmupRecording, setWarmupRecording] =
    useState(false);

  const [warmupListening, setWarmupListening] =
    useState(false);

  const [warmupTranscribing, setWarmupTranscribing] =
    useState(false);

  const warmupRecognitionRef =
    useRef(null);

  const warmupStepRef = useRef(0);
  const warmupStartedRef = useRef(false);
  const warmupListeningRef = useRef(false);
  const startWarmupListeningRef = useRef(null);

  const warmupRecorderRef =
    useRef(null);

  if (warmupRecorderRef.current === null) {
    warmupRecorderRef.current = createAnswerRecorder();
  }

  const warmupHandledRef =
    useRef(
      getSessionFlag(sessionId, "warmup_complete")
    );

  const warmupRequestInFlightRef = useRef(false);

  // Company introduction: spoken once (voice only, never shown as
  // text) after "Yes, I'm ready" and before the first question.
  const [introDone, setIntroDone] =
    useState(() =>
      getSessionFlag(sessionId, "intro_played")
    );

  const introPromiseRef =
    useRef(null);

  // chat transcript shown on the right side ("Previous Questions")
  const [chatLog, setChatLog] =
    useState([]);

  const chatEndRef = useRef(null);

  // how many characters of the current question are shown so far
  // (the text appears gradually while the AI voice is speaking)
  const [typedLength, setTypedLength] =
    useState(0);

  // attaches the running camera stream as soon as <video> is mounted
  const attachVideo = useCallback((element) => {
    videoRef.current = element;

    if (
      element &&
      streamRef.current &&
      element.srcObject !== streamRef.current
    ) {
      element.srcObject = streamRef.current;
      element.play().catch(() => {});
    }
  }, []);

  const [
    currentQuestion,
    setCurrentQuestion,
  ] = useState(null);

  const [
    questionNumber,
    setQuestionNumber,
  ] = useState(1);

  // 5 without a resume, 7 with one (sent by the backend)
  const [
    totalQuestions,
    setTotalQuestions,
  ] = useState(5);

  const [answer, setAnswer] =
    useState("");

  const [
    lastAnswer,
    setLastAnswer,
  ] = useState("");

  const [error, setError] =
    useState("");

  const [
    processing,
    setProcessing,
  ] = useState(false);

  const [
    elapsedSeconds,
    setElapsedSeconds,
  ] = useState(0);

  const [
    followUpQuestion,
    setFollowUpQuestion,
  ] = useState(null);

  const [
    followUpConfirmation,
    setFollowUpConfirmation,
  ] = useState(false);

  /*
   * ============================================================
   * VOICE STATE
   * ============================================================
   */

  const [
    isListening,
    setIsListening,
  ] = useState(false);

  const [
    isSpeaking,
    setIsSpeaking,
  ] = useState(false);

  const [
    voiceSupported,
    setVoiceSupported,
  ] = useState(false);

  const [
    transcribing,
    setTranscribing,
  ] = useState(false);

  /*
   * ============================================================
   * MONITORING STATE
   * ============================================================
   */

  const [
    cameraEnabled,
    setCameraEnabled,
  ] = useState(false);

  const [
    faceDetectionEnabled,
    setFaceDetectionEnabled,
  ] = useState(false);

  const [
    eyeGazeEnabled,
    setEyeGazeEnabled,
  ] = useState(false);

  const [
    faceStatus,
    setFaceStatus,
  ] = useState(
    "Face detection OFF"
  );

  const [
    eyeStatus,
    setEyeStatus,
  ] = useState(
    "Eye/Gaze detection OFF"
  );

  const [
    monitoringReady,
    setMonitoringReady,
  ] = useState(false);

  /*
   * Monitoring policy chosen by the INTERVIEWER.
   *
   * enabled = false -> no camera, no face, no eye. The
   *                    interview works normally.
   * enabled = true  -> camera starts automatically and the
   *                    candidate cannot switch it off.
   */
  const [policy, setPolicy] =
    useState({
      loaded: false,
      enabled: false,
      face: false,
      eye: false,
      phone: false,
    });

  const [
    phoneStatus,
    setPhoneStatus,
  ] = useState(
    "Phone detection OFF"
  );

  const [
    cameraBlocked,
    setCameraBlocked,
  ] = useState(false);

  const autoStartedRef =
    useRef(false);

  /*
   * Monitoring events are saved for the interviewer.
   * Each type is sent at most once every 15 seconds.
   */
  const eventThrottleRef =
    useRef({});

  const logMonitoringEventRef =
    useRef(null);

  logMonitoringEventRef.current =
    (type) => {
      if (!sessionId) {
        return;
      }

      const now = Date.now();

      if (
        now -
          (eventThrottleRef
            .current[type] || 0) <
        15000
      ) {
        return;
      }

      eventThrottleRef.current[
        type
      ] = now;

      api
        .post(
          `/hiring/sessions/${sessionId}/monitoring-event`,
          { type }
        )
        .catch(() => {});
    };

  /*
   * ============================================================
   * FLAG VIOLATION (replaces auto-termination)
   * ============================================================
   * Face / eye / phone / tab problems are saved to the report
   * for the interviewer and a short warning is shown to the
   * candidate. The interview itself keeps running.
   */
  const [
    violationNotice,
    setViolationNotice,
  ] = useState("");

  const violationThrottleRef =
    useRef({});

  const noticeThrottleRef =
    useRef({});

  const [voiceId, setVoiceId] =
    useState(() => {
      try {
        const saved =
          localStorage.getItem(
            "interview_voice"
          );

        return VOICE_PROFILES[saved]
          ? saved
          : DEFAULT_VOICE_ID;
      } catch {
        return DEFAULT_VOICE_ID;
      }
    });

  const voiceIdRef =
    useRef(voiceId);

  voiceIdRef.current = voiceId;

  const changeVoice =
    (nextId) => {
      if (!VOICE_PROFILES[nextId]) {
        return;
      }

      setVoiceId(nextId);

      voiceIdRef.current = nextId;

      try {
        localStorage.setItem(
          "interview_voice",
          nextId
        );
      } catch {}

      // short preview so the candidate can hear the voice
      try {
        cancelSpeech();
        if (window.speechSynthesis) {
          window.speechSynthesis.speak(
            buildUtterance(
              "Hello, I will be your interviewer today.",
              nextId
            )
          );
        }
      } catch {}
    };

  const lastMonitorTickRef =
    useRef(0);

  const downBaselineRef =
    useRef({
      samples: [],
      startedAt: 0,
      value: null,
    });

  const violationTimerRef =
    useRef(null);

  const flagViolationRef =
    useRef(null);

  flagViolationRef.current =
    (reason, options = {}) => {
      if (
        !sessionId ||
        completedRef.current ||
        terminatedRef.current
      ) {
        return;
      }

      const type =
        REASON_TO_EVENT[reason] ||
        null;

      if (!type) {
        return;
      }

      const now = Date.now();

      // ---- report for the interviewer (throttled) ----
      // noticeOnly = warning for the candidate, already logged elsewhere
      if (
        !options.noticeOnly &&
        now -
          (violationThrottleRef
            .current[type] || 0) >=
        VIOLATION_REPEAT_MS
      ) {
        violationThrottleRef.current[
          type
        ] = now;

        api
          .post(
            `/hiring/sessions/${sessionId}/monitoring-event`,
            {
              type,
              detail: String(reason).slice(
                0,
                200
              ),
            }
          )
          .catch(() => {});
      }

      // ---- warning on screen (own, shorter throttle) ----
      if (
        now -
          (noticeThrottleRef
            .current[type] || 0) <
        VIOLATION_NOTICE_REPEAT_MS
      ) {
        return;
      }

      noticeThrottleRef.current[
        type
      ] = now;

      setViolationNotice(
        VIOLATION_MESSAGES[type] ||
          "Please follow the interview rules."
      );

      if (violationTimerRef.current) {
        clearTimeout(
          violationTimerRef.current
        );
      }

      violationTimerRef.current =
        setTimeout(() => {
          setViolationNotice("");
        }, 8000);
    };

  /*
   * ============================================================
   * REFS
   * ============================================================
   */

  const wantListeningRef =
    useRef(false);

  const speechBaseRef =
    useRef("");

  const latestSpeechRef =
    useRef("");

  const answerValueRef =
    useRef("");

  const mountedRef =
    useRef(true);

  const processingRef =
    useRef(false);

  const completedRef =
    useRef(false);

  const terminatedRef =
    useRef(false);

  const currentQuestionRef =
    useRef(null);

  /*
   * ============================================================
   * GAZE REPORT (interviewer only)
   * ============================================================
   * Measures eye movement per question while the candidate is
   * answering. Numbers go to the server; scores are calculated
   * there and are never shown to the candidate.
   */
  const gazeTrackerRef =
    useRef(null);

  if (gazeTrackerRef.current === null) {
    gazeTrackerRef.current =
      createGazeTracker();
  }

  const gazeAnsweringRef =
    useRef(false);

  // true while the phone detector can see a phone (read by the gaze report)
  const phoneVisibleRef =
    useRef(false);

  // live numbers box, only shown with  ?gazedebug=1  in the page address
  const gazeDebugRef =
    useRef(null);

  const gazeDebugOn =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("gazedebug") === "1";

  // answering = microphone on and the AI is not speaking
  gazeAnsweringRef.current =
    Boolean(isListening) &&
    !isSpeaking;

  const flushGazeRef =
    useRef(null);

  flushGazeRef.current =
    (question) => {
      const tracker =
        gazeTrackerRef.current;

      if (!tracker || !sessionId) {
        return;
      }

      const items = question
        ? [tracker.snapshot(question)]
        : tracker.snapshotAll();

      items
        .filter(Boolean)
        .forEach((item) => {
          api
            .post(
              `/hiring/sessions/${sessionId}/gaze-summary`,
              item
            )
            .catch(() => {});
        });
    };

  // new question -> save the previous one, start the next
  useEffect(() => {
    const tracker =
      gazeTrackerRef.current;

    const n = Number(questionNumber);

    if (!tracker || !currentQuestion || !n) {
      return;
    }

    const previous =
      tracker.currentQuestion;

    if (previous && previous !== n) {
      flushGazeRef.current?.(previous);
    }

    tracker.setQuestion(n);
  }, [currentQuestion?.question, questionNumber]);

  // safety net: save running totals every 20s and on leaving
  useEffect(() => {
    const timer = setInterval(() => {
      const tracker =
        gazeTrackerRef.current;

      if (tracker?.currentQuestion) {
        flushGazeRef.current?.(
          tracker.currentQuestion
        );
      }
    }, 20000);

    return () => {
      clearInterval(timer);
      flushGazeRef.current?.();
    };
  }, []);

  const recognitionRef =
    useRef(null);

  // records the whole spoken answer; the server transcribes it
  const recorderRef =
    useRef(null);

  if (!recorderRef.current) {
    recorderRef.current = createAnswerRecorder();
  }

  // true when the candidate typed / edited the answer by hand
  const userEditedRef =
    useRef(false);

  const streamRef =
    useRef(null);

  const videoRef =
    useRef(null);

  const speechGenerationRef =
    useRef(0);

  const speechAudioRef =
    useRef(null);

  const speechAudioUrlRef =
    useRef(null);

  const speechCancelRef =
    useRef(null);

  const submitAnswerRef =
    useRef(null);

  const mainSilenceTimerRef =
    useRef(null);

  // Voice follow-up confirmation helpers
  const phaseRef =
    useRef("");

  const followUpYesRef =
    useRef(null);

  const followUpNoRef =
    useRef(null);

  const startListeningRef =
    useRef(null);

  const confirmRetryRef =
    useRef(0);

  const speakThenRef =
    useRef(null);

  /*
   * ============================================================
   * MEDIAPIPE REFS
   * ============================================================
   */

  const faceLandmarkerRef =
    useRef(null);

  const monitoringFrameRef =
    useRef(null);

  const monitoringRunningRef =
    useRef(false);

  const noFaceSinceRef =
    useRef(null);

  const multipleFaceSinceRef =
    useRef(null);

  const eyesClosedSinceRef =
    useRef(null);

  const lookingAwaySinceRef =
    useRef(null);

  // Looking down (phone / notes below the camera)
  const lookDownSinceRef =
    useRef(null);

  const lookDownCountedRef =
    useRef(false);

  const downEpisodesRef =
    useRef([]);

  // Phone detection
  const objectDetectorRef =
    useRef(null);

  const phoneSinceRef =
    useRef(null);

  const phoneLastSeenRef =
    useRef(0);

  /*
   * ============================================================
   * TERMINATION REF
   * ============================================================
   */

  const terminateInterviewRef =
    useRef(null);

  const cancelSpeech =
    useCallback(() => {
      speechGenerationRef.current += 1;
      speechCancelRef.current?.();
      speechCancelRef.current = null;
      window.speechSynthesis?.cancel();

      if (speechAudioRef.current) {
        speechAudioRef.current.pause();
        speechAudioRef.current.onended = null;
        speechAudioRef.current.onerror = null;
        speechAudioRef.current.onplay = null;
        speechAudioRef.current = null;
      }

      if (speechAudioUrlRef.current) {
        URL.revokeObjectURL(speechAudioUrlRef.current);
        speechAudioUrlRef.current = null;
      }

      if (mountedRef.current) {
        setIsSpeaking(false);
      }
    }, []);

  /*
   * ============================================================
   * STOP MEDIA
   * ============================================================
   */

  const stopMedia =
    useCallback(() => {
      if (mainSilenceTimerRef.current) {
        clearTimeout(mainSilenceTimerRef.current);
        mainSilenceTimerRef.current = null;
      }

      /*
       * Stop speech recognition
       */
      if (
        recognitionRef.current
      ) {
        try {
          wantListeningRef.current = false;
recognitionRef.current.stop();
        } catch {}
      }

      /*
       * Stop answer audio recording
       */
      recorderRef.current?.cancel();

      /*
       * Stop camera
       */
      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => {
            try {
              track.stop();
            } catch {}
          });

        streamRef.current = null;
      }

      /*
       * Clear video
       */
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {}

        videoRef.current.srcObject =
          null;
      }

      /*
       * Stop TTS
       */
      cancelSpeech();

      /*
       * Stop monitoring loop
       */
      if (
        monitoringFrameRef.current
      ) {
        cancelAnimationFrame(
          monitoringFrameRef.current
        );

        monitoringFrameRef.current =
          null;
      }

      monitoringRunningRef.current =
        false;

      /*
       * Reset timers
       */
      noFaceSinceRef.current =
        null;

      multipleFaceSinceRef.current =
        null;

      eyesClosedSinceRef.current =
        null;

      lookingAwaySinceRef.current =
        null;

      lookDownSinceRef.current =
        null;

      lookDownCountedRef.current =
        false;

      downEpisodesRef.current =
        [];

      phoneSinceRef.current =
        null;

      phoneLastSeenRef.current =
        0;

      /*
       * Disable states
       */
      setCameraEnabled(false);

      setFaceDetectionEnabled(false);

      setEyeGazeEnabled(false);

      setFaceStatus(
        "Face detection OFF"
      );

      setEyeStatus(
        "Eye/Gaze detection OFF"
      );
    }, [cancelSpeech]);

  /*
   * ============================================================
   * TERMINATE INTERVIEW
   * ============================================================
   */

  const terminateInterview =
    useCallback(
      async (reason) => {
        if (
          completedRef.current ||
          terminatedRef.current
        ) {
          return;
        }

        terminatedRef.current =
          true;

        processingRef.current =
          false;

        stopMedia();

        if (
          mountedRef.current
        ) {
          setProcessing(false);
          setPhase("terminated");
        }

        console.warn(
          "INTERVIEW TERMINATED:",
          reason
        );

        try {
          await api.post(
            "/interview-monitoring/terminate",
            {
              session_id:
                sessionId,
              reason,
            }
          );

          console.log(
            "Termination saved successfully."
          );
        } catch (err) {
          console.error(
            "Termination API failed:",
            err
          );
        }
      },
      [
        sessionId,
        stopMedia,
      ]
    );

  terminateInterviewRef.current =
    terminateInterview;

  /*
   * ============================================================
   * TAB / PAGE LEAVE
   * ============================================================
   */

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const anyMonitoringEnabled =
      cameraEnabled ||
      faceDetectionEnabled ||
      eyeGazeEnabled;

    if (!anyMonitoringEnabled) {
      return;
    }

    const handleVisibilityChange =
      () => {
        if (!document.hidden) {
          return;
        }

        if (
          completedRef.current ||
          terminatedRef.current
        ) {
          return;
        }

        flagViolationRef.current?.(
          "candidate_left_interview_page"
        );
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [
    sessionId,
    cameraEnabled,
    faceDetectionEnabled,
    eyeGazeEnabled,
  ]);

  /*
   * ============================================================
   * TIMER
   * ============================================================
   */

  useEffect(() => {
    if (phase !== "question") {
      return;
    }

    const timer =
      setInterval(() => {
        setElapsedSeconds(
          (previous) =>
            previous + 1
        );
      }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [phase]);

  /*
   * ============================================================
   * MOUNT / UNMOUNT
   * ============================================================
   */

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      stopMedia();
      try {
        warmupRecognitionRef.current?.abort();
      } catch (error) {
        console.warn("Warm-up speech recognition cleanup failed:", error);
      }
      warmupRecognitionRef.current = null;
      warmupListeningRef.current = false;
      warmupRecorderRef.current?.cancel();

      if (
        faceLandmarkerRef.current
      ) {
        try {
          faceLandmarkerRef.current.close();
        } catch {}

        faceLandmarkerRef.current =
          null;
      }
    };
  }, [stopMedia]);

  /*
   * ============================================================
   * TEXT TO SPEECH
   * ============================================================
   */

  const speakText =
    useCallback(
      async (text) => {
        if (!text) {
          return;
        }

        cancelSpeech();
        const generation = speechGenerationRef.current;
        const pendingCancellation = () => undefined;
        speechCancelRef.current = pendingCancellation;

        const isCurrent = () =>
          mountedRef.current &&
          generation === speechGenerationRef.current;

        const browserFallback = () =>
          new Promise((resolve) => {
            if (!isCurrent() || !window.speechSynthesis) {
              resolve();
              return;
            }

            let settled = false;
            let utterance;
            const finish = () => {
              if (settled) {
                return;
              }
              settled = true;
              if (utterance) {
                utterance.onstart = null;
                utterance.onend = null;
                utterance.onerror = null;
              }
              if (speechCancelRef.current === finish) {
                speechCancelRef.current = null;
              }
              if (isCurrent()) {
                setIsSpeaking(false);
              }
              resolve();
            };

            speechCancelRef.current = finish;

            try {
              utterance = buildUtterance(text, voiceIdRef.current);
              utterance.onstart = () => {
                if (isCurrent()) {
                  setIsSpeaking(true);
                }
              };
              utterance.onend = finish;
              utterance.onerror = finish;
              window.speechSynthesis.speak(utterance);
            } catch (error) {
              console.warn("Browser speech fallback failed.", error);
              finish();
            }
          });

        try {
          const response = await api.post(
            `/interviews/${interviewId}/speech`,
            { text },
            { responseType: "blob" },
          );

          if (!isCurrent()) {
            return;
          }

          const audioUrl = URL.createObjectURL(response.data);
          speechAudioUrlRef.current = audioUrl;

          const audio = new Audio(audioUrl);
          speechAudioRef.current = audio;

          const releaseAudio = () => {
            audio.onplay = null;
            audio.onended = null;
            audio.onerror = null;
            if (speechAudioRef.current === audio) {
              speechAudioRef.current = null;
            }
            if (speechAudioUrlRef.current === audioUrl) {
              URL.revokeObjectURL(audioUrl);
              speechAudioUrlRef.current = null;
            }
          };

          await new Promise((resolve, reject) => {
            let settled = false;

            const finish = () => {
              if (settled) {
                return;
              }
              settled = true;
              audio.onended = null;
              audio.onerror = null;
              if (speechCancelRef.current === finish) {
                speechCancelRef.current = null;
              }
              resolve();
            };

            const fail = (error) => {
              if (settled) {
                return;
              }
              settled = true;
              audio.onended = null;
              audio.onerror = null;
              if (speechCancelRef.current === finish) {
                speechCancelRef.current = null;
              }
              releaseAudio();
              reject(error);
            };

            speechCancelRef.current = finish;
            audio.onplay = () => {
              if (isCurrent()) {
                setIsSpeaking(true);
              }
            };
            audio.onended = finish;
            audio.onerror = () =>
              fail(new Error("Google TTS audio playback failed."));
            audio.play().catch(fail);
          });
        } catch (error) {
          if (isCurrent()) {
            console.warn("Google TTS failed; using browser speech.", error);
            await browserFallback();
          }
        } finally {
          if (generation === speechGenerationRef.current) {
            setIsSpeaking(false);

            if (speechCancelRef.current === pendingCancellation) {
              speechCancelRef.current = null;
            }

            if (speechAudioRef.current) {
              speechAudioRef.current.pause();
              speechAudioRef.current.onended = null;
              speechAudioRef.current.onerror = null;
              speechAudioRef.current.onplay = null;
              speechAudioRef.current = null;
            }

            if (speechAudioUrlRef.current) {
              URL.revokeObjectURL(speechAudioUrlRef.current);
              speechAudioUrlRef.current = null;
            }
          }
        }
      },
      [cancelSpeech, interviewId],
    );

  const speakQuestion = useCallback(
    (text) => {
      void speakText(text)
        .then(() => {
          if (
            mountedRef.current &&
            phaseRef.current === "question" &&
            !processingRef.current &&
            !completedRef.current &&
            !terminatedRef.current
          ) {
            startListeningRef.current?.();
          }
        })
        .catch((error) => {
          console.error("Question speech failed:", error);
          if (mountedRef.current) {
            setError(
              "Question playback failed. You can retry listening or type your answer."
            );
          }
        });
    },
    [speakText],
  );

  const confirmReady = useCallback(() => {
    setSessionFlag(sessionId, "ready");
    setReady(true);
    setPhase("loading");
  }, [sessionId]);

  const finishWarmup = useCallback(
    async (reply) => {
      const cleanReply = String(reply || "").trim().slice(0, 400);

      if (
        !cleanReply ||
        warmupHandledRef.current ||
        warmupRequestInFlightRef.current
      ) {
        return;
      }

      const step = warmupStepRef.current;
      warmupRequestInFlightRef.current = true;
      warmupListeningRef.current = false;
      try {
        warmupRecognitionRef.current?.abort();
      } catch (error) {
        console.warn("Warm-up speech recognition cleanup failed:", error);
      }
      warmupRecognitionRef.current = null;
      warmupRecorderRef.current?.cancel();
      setWarmupListening(false);
      setWarmupRecording(false);
      setWarmupSubmitting(true);
      setWarmupVoiceError("");
      setWarmupDraft(cleanReply);
      let replyPlayed = false;

      try {
        const response = WARMUP_REPLIES[step];
        setWarmupResponse(response);
        await speakText(response);
        replyPlayed = true;

        if (step === WARMUP_REPLIES.length - 1) {
          warmupHandledRef.current = true;
          setSessionFlag(sessionId, "warmup_complete");
          confirmReady();
        } else {
          warmupStepRef.current = step + 1;
          setWarmupStep(step + 1);
          setWarmupDraft("");
        }
      } catch (error) {
        console.error("Warm-up response playback failed:", error);
        if (mountedRef.current) {
          setWarmupVoiceError(
            "The interviewer could not finish speaking. Retry the response or continue with text."
          );
        }
      } finally {
        warmupRequestInFlightRef.current = false;
        if (mountedRef.current) {
          setWarmupSubmitting(false);
        }

        if (
          mountedRef.current &&
          !warmupHandledRef.current &&
          replyPlayed
        ) {
          setTimeout(() => startWarmupListeningRef.current?.(), 0);
        }
      }
    },
    [confirmReady, sessionId, speakText],
  );

  const continueWithoutWarmup = useCallback(() => {
    try {
      warmupRecognitionRef.current?.abort();
    } catch (error) {
      console.warn("Warm-up speech recognition cleanup failed:", error);
    }
    warmupRecognitionRef.current = null;
    warmupListeningRef.current = false;
    setWarmupListening(false);
    warmupRecorderRef.current?.cancel();
    setWarmupRecording(false);
    warmupHandledRef.current = true;
    setSessionFlag(sessionId, "warmup_complete");
    confirmReady();
    setWarmupVoiceError("");
  }, [confirmReady, sessionId]);

  const startWarmupListening = useCallback(async () => {
    if (
      warmupHandledRef.current ||
      warmupListeningRef.current ||
      warmupRequestInFlightRef.current
    ) {
      return;
    }

    warmupListeningRef.current = true;
    const SpeechRecognitionApi =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;
    const recordingStarted = canRecordAudio()
      ? await warmupRecorderRef.current.start()
      : false;

    if (recordingStarted) {
      setWarmupRecording(true);
    }

    if (!SpeechRecognitionApi) {
      if (recordingStarted) {
        warmupListeningRef.current = true;
        setWarmupListening(true);
        setWarmupManualInput(true);
        setWarmupVoiceError(
          "Automatic speech recognition is unavailable. Stop the recording when you finish, or type your reply."
        );
        return;
      }

      warmupListeningRef.current = false;
      setWarmupManualInput(true);
      setWarmupVoiceError(
        "Voice input is unavailable. Type your reply below."
      );
      return;
    }

    const recognition = new SpeechRecognitionApi();
    let transcript = "";
    let failed = false;

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    warmupRecognitionRef.current = recognition;
    warmupListeningRef.current = true;
    setWarmupDraft("");
    setWarmupVoiceError("");

    recognition.onstart = () => {
      if (mountedRef.current) {
        setWarmupManualInput(false);
        setWarmupListening(true);
      }
    };

    recognition.onresult = (event) => {
      transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      setWarmupDraft(transcript);
    };

    recognition.onerror = (event) => {
      if (event?.error === "aborted") {
        return;
      }

      failed = true;
      warmupListeningRef.current = false;
      warmupRecorderRef.current?.cancel();
      setWarmupRecording(false);
      setWarmupListening(false);
      setWarmupManualInput(true);
      setWarmupVoiceError(
        event?.error === "not-allowed" || event?.error === "service-not-allowed"
          ? "Microphone permission was denied. Allow microphone access or type your reply."
          : event?.error === "audio-capture"
            ? "No microphone was found. Check your microphone or type your reply."
            : "Speech recognition failed. Try the microphone again or type your reply."
      );
    };

    recognition.onend = () => {
      if (warmupRecognitionRef.current === recognition) {
        warmupRecognitionRef.current = null;
      }
      warmupListeningRef.current = false;
      setWarmupListening(false);

      if (failed || warmupRequestInFlightRef.current) {
        return;
      }

      void (async () => {
        setWarmupTranscribing(true);
        setWarmupVoiceError("");
        let finalTranscript = transcript;

        try {
          if (warmupRecorderRef.current?.isActive()) {
            const audio = await warmupRecorderRef.current.stop();
            setWarmupRecording(false);

            if (audio) {
              try {
                finalTranscript =
                  (await transcribeAnswer(interviewId, audio)) ||
                  finalTranscript;
              } catch (error) {
                console.error("Warm-up audio transcription failed:", error);
                if (!finalTranscript) {
                  throw error;
                }
                setWarmupVoiceError(
                  "Audio transcription was unavailable; using the live speech transcript."
                );
              }
            }
          }

          if (!finalTranscript) {
            throw new Error("No speech was recognized. Try again or type your reply.");
          }

          setWarmupDraft(finalTranscript);
          setWarmupTranscribing(false);
          await finishWarmup(finalTranscript);
        } catch (error) {
          console.error("Warm-up response processing failed:", error);
          setWarmupManualInput(true);
          setWarmupVoiceError(
            error?.response?.data?.detail ||
              error?.message ||
              "Your response could not be processed. Try again or type your reply."
          );
        } finally {
          if (mountedRef.current) {
            setWarmupTranscribing(false);
          }
        }
      })();
    };

    try {
      recognition.start();
    } catch (error) {
      console.warn("Warm-up speech recognition could not start:", error);
      warmupListeningRef.current = false;
      warmupRecognitionRef.current = null;
      warmupRecorderRef.current?.cancel();
      setWarmupRecording(false);
      setWarmupListening(false);
      setWarmupManualInput(true);
      setWarmupVoiceError(
        "Microphone could not start. Check permission or type your reply."
      );
    }
  }, [finishWarmup, interviewId]);

  useEffect(() => {
    startWarmupListeningRef.current = startWarmupListening;
  }, [startWarmupListening]);

  const stopWarmupRecording = useCallback(async () => {
    if (!warmupRecording || warmupTranscribing) {
      return;
    }

    warmupListeningRef.current = false;
    setWarmupListening(false);
    setWarmupRecording(false);
    setWarmupTranscribing(true);
    setWarmupVoiceError("");

    try {
      const audio = await warmupRecorderRef.current.stop();
      const transcript = await transcribeAnswer(interviewId, audio);
      if (!transcript) {
        throw new Error(
          "No speech was transcribed. Try recording again or type your reply."
        );
      }

      setWarmupTranscribing(false);
      await finishWarmup(transcript);
    } catch (error) {
      console.error("Warm-up microphone transcription failed:", error);
      if (mountedRef.current) {
        setWarmupVoiceError(
          error?.response?.data?.detail ||
            error?.message ||
            "The recording could not be transcribed. Try again or type your reply."
        );
      }
    } finally {
      if (mountedRef.current) {
        setWarmupTranscribing(false);
      }
    }
  }, [finishWarmup, interviewId, warmupRecording, warmupTranscribing]);

  const toggleWarmupSpeechRecognition = useCallback(() => {
    if (warmupListeningRef.current) {
      if (warmupRecognitionRef.current) {
        warmupRecognitionRef.current.stop();
      } else {
        void stopWarmupRecording();
      }
      return;
    }

    void startWarmupListening();
  }, [startWarmupListening, stopWarmupRecording]);

  const beginWarmup = useCallback(async () => {
    if (warmupStartedRef.current || warmupStarting) {
      return;
    }

    warmupStartedRef.current = true;
    setWarmupStarting(true);
    setWarmupVoiceError("");
    let permissionGranted = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      stream.getTracks().forEach((track) => track.stop());
      permissionGranted = true;
    } catch (error) {
      console.warn("Warm-up microphone permission was not granted:", error);
      setWarmupManualInput(true);
      setWarmupVoiceError(
        error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError"
          ? "Microphone permission was denied. You can type your reply or retry microphone access."
          : "Microphone access is unavailable. You can type your reply or retry."
      );
    }

    setWarmupStarted(true);

    try {
      await speakText(WARMUP_PROMPTS[0]);
      if (permissionGranted) {
        await startWarmupListening();
      }
    } catch (error) {
      console.error("Warm-up greeting playback failed:", error);
      setWarmupVoiceError(
        "The greeting could not be played. Retry the greeting or enter your reply below."
      );
    } finally {
      if (mountedRef.current) {
        setWarmupStarting(false);
      }
    }
  }, [speakText, startWarmupListening, warmupStarting]);

  const replayWarmupPrompt = useCallback(async () => {
    if (warmupListeningRef.current || warmupRequestInFlightRef.current) {
      return;
    }

    setWarmupVoiceError("");
    try {
      await speakText(WARMUP_PROMPTS[warmupStepRef.current]);
      await startWarmupListening();
    } catch (error) {
      console.error("Warm-up prompt playback failed:", error);
      setWarmupVoiceError(
        "The prompt could not be played. You can retry or type your reply."
      );
    }
  }, [speakText, startWarmupListening]);

  /*
   * ============================================================
   * SHOW QUESTION
   * ============================================================
   */

  const showQuestion =
    useCallback(
      (rawQuestion) => {
        const question =
          normalizeQuestion(
            rawQuestion
          );

        if (
          !question ||
          !question.question
        ) {
          setError(
            "Invalid question received from server."
          );

          setProcessing(false);

          return;
        }

        console.log(
          "DISPLAYING QUESTION:",
          question
        );

        currentQuestionRef.current =
          question;

        setCurrentQuestion(
          question
        );

        setQuestionNumber(
          Number(
            question.question_number
          ) || 1
        );

        if (Number(question.total_questions) > 0) {
          setTotalQuestions(
            Number(question.total_questions)
          );
        }

        setAnswer("");

        setLastAnswer("");
        latestSpeechRef.current = "";
        if (mainSilenceTimerRef.current) {
          clearTimeout(mainSilenceTimerRef.current);
          mainSilenceTimerRef.current = null;
        }

        setFollowUpQuestion(null);

        setFollowUpConfirmation(
          false
        );

        setError("");

        setProcessing(false);

        setPhase("question");

        if (
          recognitionRef.current
        ) {
          try {
            wantListeningRef.current = false;
recognitionRef.current.stop();
          } catch {}
        }

        speakQuestion(
          question.question
        );
      },
      [speakQuestion]
    );

  /*
   * ============================================================
   * COMPLETE INTERVIEW
   * ============================================================
   */

  const completeInterview =
    useCallback(() => {
      if (
        completedRef.current ||
        terminatedRef.current
      ) {
        return;
      }

      completedRef.current =
        true;

      processingRef.current =
        false;

      flushGazeRef.current?.();

      stopMedia();

      setProcessing(false);

      setPhase("completed");

      // spoken thank-you
      void speakText(CLOSING_SPEECH).catch((error) => {
        console.error("Closing speech failed:", error);
      });

      // Thank-you email + "we will contact you if selected".
      // The candidate does not get a report or scores.
      api
        .post(
          `/hiring/sessions/${sessionId}/submitted`
        )
        .catch((err) => {
          console.warn(
            "Submit confirmation failed:",
            err
          );
        });
    }, [
      interviewId,
      sessionId,
      navigate,
      stopMedia,
      speakText,
    ]);

  /*
   * ============================================================
   * FOLLOW-UP EXTRACTION
   * ============================================================
   */

  const extractFollowUpQuestion =
    useCallback(
      (
        data,
        parameters
      ) => {
        const candidates = [
          parameters?.follow_up_question,
          parameters?.followUpQuestion,
          parameters?.follow_up_question_text,
          parameters?.followUpQuestionText,
          data?.follow_up_question,
          data?.followUpQuestion,
          data?.follow_up_question_text,
          data?.followUpQuestionText,
          data?.result?.follow_up_question,
          data?.data?.follow_up_question,
          data?.response?.follow_up_question,
        ];

        for (
          const candidate of candidates
        ) {
          const normalized =
            normalizeValue(candidate);

          if (
            typeof normalized ===
              "string" &&
            normalized.trim()
          ) {
            return normalized.trim();
          }
        }

        return null;
      },
      []
    );

  /*
   * ============================================================
   * NEXT QUESTION EXTRACTION
   * ============================================================
   */

  const extractNextQuestion =
    useCallback(
      (
        data,
        parameters
      ) => {
        const rawNextQuestion =
          parameters?.next_question ||
          parameters?.nextQuestion ||
          data?.next_question ||
          data?.nextQuestion ||
          data?.result?.next_question ||
          data?.result?.nextQuestion ||
          data?.data?.next_question ||
          data?.response?.next_question ||
          null;

        if (rawNextQuestion) {
          return normalizeQuestion(
            rawNextQuestion
          );
        }

        const directQuestion =
          parameters?.question ||
          data?.question;

        if (!directQuestion) {
          return null;
        }

        return normalizeQuestion({
          id:
            parameters?.question_id ||
            parameters?.questionId ||
            data?.question_id ||
            data?.questionId ||
            null,

          question:
            directQuestion,

          question_number:
            parameters?.question_number ??
            parameters?.questionNumber ??
            data?.question_number ??
            data?.questionNumber ??
            1,

          total_questions:
            parameters?.total_questions ??
            parameters?.totalQuestions ??
            data?.total_questions ??
            data?.totalQuestions ??
            null,

          category:
            parameters?.category ||
            data?.category ||
            "technical",

          difficulty:
            parameters?.difficulty ||
            data?.difficulty ||
            null,

          question_type:
            parameters?.question_type ||
            parameters?.questionType ||
            data?.question_type ||
            data?.questionType ||
            "technical",

          is_follow_up:
            parameters?.is_follow_up ??
            parameters?.isFollowUp ??
            data?.is_follow_up ??
            data?.isFollowUp ??
            false,

          parent_question_id:
            parameters?.parent_question_id ||
            parameters?.parentQuestionId ||
            data?.parent_question_id ||
            data?.parentQuestionId ||
            null,
        });
      },
      []
    );

  /*
   * ============================================================
   * HANDLE DIALOGFLOW RESPONSE
   * ============================================================
   */

  const handleDialogflowResponse =
    useCallback(
      (responseData) => {
        if (!responseData) {
          throw new Error(
            "Empty response from backend."
          );
        }

        const data =
          responseData?.data &&
          typeof responseData.data ===
            "object"
            ? responseData.data
            : responseData;

        const parameters =
          getMergedParameters(data);

        const nextAction =
          normalizeAction(
            parameters?.next_action ??
              parameters?.nextAction ??
              data?.next_action ??
              data?.nextAction
          );

        console.log(
          "NEXT ACTION:",
          nextAction
        );

        /*
         * COMPLETION
         */

        const completed =
          isTrue(
            parameters?.completed
          ) ||
          isTrue(
            parameters?.interview_completed
          ) ||
          isTrue(
            parameters?.interviewCompleted
          ) ||
          isTrue(
            data?.completed
          ) ||
          isTrue(
            data?.interview_completed
          ) ||
          isTrue(
            data?.interviewCompleted
          ) ||
          nextAction === "complete" ||
          nextAction === "completed";

        if (completed) {
          completeInterview();
          return;
        }

        /*
         * FOLLOW-UP REQUIRED
         */

        const followUpRequired =
          isTrue(
            parameters?.follow_up_required
          ) ||
          isTrue(
            parameters?.followUpRequired
          ) ||
          isTrue(
            parameters?.is_follow_up_required
          ) ||
          isTrue(
            parameters?.isFollowUpRequired
          ) ||
          isTrue(
            data?.follow_up_required
          ) ||
          isTrue(
            data?.followUpRequired
          );

        /*
         * The candidate is never asked "do you want a follow-up?".
         * The interviewer's settings decide; a follow-up simply
         * arrives as the next question (handled below).
         */

        /*
         * DIRECT FOLLOW-UP
         */

        if (
          nextAction ===
            "follow_up" ||
          nextAction ===
            "followup" ||
          nextAction ===
            "ask_follow_up_confirmation" ||
          nextAction ===
            "follow_up_confirmation"
        ) {
          const backendFollowUp =
            extractFollowUpQuestion(
              data,
              parameters
            );

          if (!backendFollowUp) {
            setError(
              "Follow-up question was not received from server."
            );

            setProcessing(false);

            return;
          }

          const current =
            currentQuestionRef.current;

          const followUp =
            normalizeQuestion({
              id:
                parameters?.follow_up_question_id ||
                parameters?.followUpQuestionId ||
                data?.follow_up_question_id ||
                data?.followUpQuestionId ||
                null,

              question:
                backendFollowUp,

              question_number:
                parameters?.question_number ??
                parameters?.questionNumber ??
                current?.question_number ??
                questionNumber,

              total_questions:
                parameters?.total_questions ??
                parameters?.totalQuestions ??
                current?.total_questions ??
                totalQuestions,

              question_type:
                parameters?.question_type ||
                parameters?.questionType ||
                "follow_up",

              category:
                parameters?.category ||
                current?.category ||
                "technical",

              difficulty:
                parameters?.difficulty ||
                current?.difficulty ||
                null,

              is_follow_up: true,

              parent_question_id:
                parameters?.parent_question_id ||
                parameters?.parentQuestionId ||
                current?.id ||
                null,
            });

          if (!followUp) {
            setError(
              "Invalid follow-up question received."
            );

            setProcessing(false);

            return;
          }

          currentQuestionRef.current =
            followUp;

          setCurrentQuestion(
            followUp
          );

          setQuestionNumber(
            Number(
              followUp.question_number
            ) || questionNumber
          );

          setAnswer("");

          setLastAnswer("");

          setFollowUpQuestion(null);

          setFollowUpConfirmation(
            false
          );

          setError("");

          setProcessing(false);

          setPhase("question");

          speakQuestion(
            followUp.question
          );

          return;
        }

        /*
         * NEXT MAIN QUESTION
         */

        const nextQuestion =
          extractNextQuestion(
            data,
            parameters
          );

        if (
          nextAction ===
          "next_question"
        ) {
          if (!nextQuestion) {
            setError(
              "Next question was not received from server."
            );

            setProcessing(false);

            return;
          }

          showQuestion(
            nextQuestion
          );

          return;
        }

        /*
         * FALLBACK
         */

        const fallbackText =
          normalizeValue(
            parameters?.text
          ) ||
          normalizeValue(
            data?.text
          ) ||
          normalizeValue(
            data?.fulfillment_text
          ) ||
          normalizeValue(
            data?.fulfillmentText
          );

        if (fallbackText) {
          console.log(
            "Backend message:",
            fallbackText
          );
        }

        setError(
          "Unexpected response received from interview server."
        );

        setProcessing(false);
      },
      [
        completeInterview,
        extractFollowUpQuestion,
        extractNextQuestion,
        questionNumber,
        showQuestion,
        speakQuestion,
      ]
    );

  /*
   * ============================================================
   * START INTERVIEW
   * ============================================================
   */

  /*
   * ============================================================
   * COMPANY INTRODUCTION (VOICE ONLY)
   * ============================================================
   * The interviewer-approved text is fetched while the warm welcome is
   * in progress, so there is no wait. It is only SPOKEN - it is never
   * put on the screen. If nothing is approved, or the request
   * fails, the interview starts exactly as before.
   */
  useEffect(() => {
    introPromiseRef.current = api
      .get(
        `/interviews/${interviewId}/company-intro/voice`
      )
      .then((res) => {
        const d = res?.data || {};

        if (!d.available || !d.text) {
          return "";
        }

        const role = String(d.role || "").trim();

        // the AI intro usually already describes the role; only add
        // the one-line mention when it does not
        let spoken =
          role &&
          !d.text.toLowerCase().includes(role.toLowerCase())
            ? `${d.text} Today's interview is for the ${role} role.`
            : d.text;

        // hand-over to the first question (not repeated if present)
        if (!/brief introduction/i.test(spoken)) {
          spoken +=
            " Let's continue to the interview. Let's start with your brief introduction.";
        }

        return spoken;
      })
      .catch(() => "");
  }, [interviewId]);

  useEffect(() => {
    if (!ready || introDone) {
      return undefined;
    }

    let cancelled = false;

    const finish = () => {
      if (cancelled) {
        return;
      }

      setSessionFlag(sessionId, "intro_played");
      setIntroDone(true);
    };

    // resumed interview: the candidate already heard it
    const alreadyPlayed =
      getSessionFlag(sessionId, "intro_played");

    if (alreadyPlayed) {
      return undefined;
    }

    (async () => {
      const text =
        (await introPromiseRef.current) || "";

      if (cancelled) {
        return;
      }

      if (!text) {
        finish();
        return;
      }

      setPhase("intro");

      // Let the greeting cleanup finish before starting another voice.
      setTimeout(() => {
        if (cancelled) {
          return;
        }

        void speakText(text)
          .then(finish)
          .catch((error) => {
            console.error("Company introduction speech failed:", error);
            finish();
          });
      }, 150);
    })();

    return () => {
      cancelled = true;
      cancelSpeech();
    };
  }, [ready, introDone, sessionId, speakText, cancelSpeech]);

  /*
   * ============================================================
   * QUESTION TEXT APPEARS WITH THE VOICE
   * ============================================================
   */
  useEffect(() => {
    const text = currentQuestion?.question || "";

    setTypedLength(0);

    if (!text) {
      return;
    }

    const words = text.trim().split(/\s+/).length;

    // speech runs at about 2.4 words / second
    const totalMs = window.speechSynthesis
      ? Math.max(1500, (words / 2.4) * 1000)
      : 800;

    const stepMs = 40;
    const perStep = Math.max(
      1,
      Math.ceil(text.length / (totalMs / stepMs))
    );

    let shown = 0;

    const timer = setInterval(() => {
      shown = Math.min(text.length, shown + perStep);
      setTypedLength(shown);

      if (shown >= text.length) {
        clearInterval(timer);
      }
    }, stepMs);

    return () => clearInterval(timer);
  }, [currentQuestion?.question]);

  /*
   * ============================================================
   * CHAT TRANSCRIPT
   * ============================================================
   */
  useEffect(() => {
    const text = currentQuestion?.question;

    if (!text) {
      return;
    }

    setChatLog((log) => {
      const last = log[log.length - 1];

      if (last && last.role === "ai" && last.text === text) {
        return log;
      }

      return [...log, { role: "ai", text }];
    });
  }, [currentQuestion]);

  useEffect(() => {
    if (!lastAnswer) {
      return;
    }

    setChatLog((log) => [
      ...log,
      { role: "you", text: lastAnswer },
    ]);
  }, [lastAnswer]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  useEffect(() => {
    // wait until the candidate says / clicks "Yes" AND the
    // company introduction (if any) has finished
    if (!ready || !introDone) {
      return;
    }

    let cancelled = false;

    async function initializeInterview() {
      try {
        setPhase("loading");
        setError("");

        const response =
          await api.post(
            "/dialogflow/chat",
            {
              session_id:
                sessionId,

              text: "start",

              parameters: {
                session_id:
                  sessionId,

                interview_id:
                  interviewId,

                action: "start",
              },
            }
          );

        if (
          cancelled ||
          !mountedRef.current
        ) {
          return;
        }

        const data =
          response?.data;

        const parameters =
          getMergedParameters(data);

        const rawQuestion =
          parameters?.next_question ||
          parameters?.nextQuestion ||
          data?.next_question ||
          data?.nextQuestion ||
          parameters?.question ||
          data?.question;

        if (rawQuestion) {
          const question =
            normalizeQuestion(
              rawQuestion,
              {
                id:
                  parameters?.question_id ||
                  parameters?.questionId ||
                  data?.question_id ||
                  data?.questionId ||
                  null,

                question_number:
                  parameters?.question_number ??
                  parameters?.questionNumber ??
                  data?.question_number ??
                  data?.questionNumber ??
                  1,

                total_questions:
                  parameters?.total_questions ??
                  parameters?.totalQuestions ??
                  data?.total_questions ??
                  data?.totalQuestions ??
                  null,

                category:
                  parameters?.category ||
                  data?.category ||
                  "technical",

                difficulty:
                  parameters?.difficulty ||
                  data?.difficulty ||
                  null,

                question_type:
                  parameters?.question_type ||
                  parameters?.questionType ||
                  data?.question_type ||
                  data?.questionType ||
                  "technical",

                is_follow_up:
                  parameters?.is_follow_up ??
                  parameters?.isFollowUp ??
                  data?.is_follow_up ??
                  data?.isFollowUp ??
                  false,

                parent_question_id:
                  parameters?.parent_question_id ||
                  parameters?.parentQuestionId ||
                  data?.parent_question_id ||
                  data?.parentQuestionId ||
                  null,
              }
            );

          if (question) {
            showQuestion(
              question
            );

            return;
          }
        }

        handleDialogflowResponse(
          data
        );
      } catch (err) {
        console.error(
          "Interview initialization error:",
          err
        );

        if (
          !mountedRef.current
        ) {
          return;
        }

        setError(
          err?.response?.data?.detail ||
            err?.message ||
            "Failed to start interview."
        );

        setPhase("error");
      }
    }

    initializeInterview();

    return () => {
      cancelled = true;
    };
  }, [
    ready,
    introDone,
    interviewId,
    sessionId,
    handleDialogflowResponse,
    showQuestion,
  ]);

  /*
   * ============================================================
   * SUBMIT ANSWER
   * ============================================================
   */

  const submitAnswerWithText =
    useCallback(
      async (answerText) => {
        if (
          processingRef.current ||
          completedRef.current ||
          terminatedRef.current
        ) {
          return;
        }

        if (mainSilenceTimerRef.current) {
          clearTimeout(mainSilenceTimerRef.current);
          mainSilenceTimerRef.current = null;
        }

        /*
         * Lock the screen while the recording is transcribed so
         * the answer cannot be sent twice.
         */
        processingRef.current =
          true;

        setProcessing(true);

        let finalText =
          String(
            answerText || ""
          );

        /*
         * ACCURATE TRANSCRIPT: the browser's live recognition
         * (preview only) misses words. If the answer was spoken,
         * transcribe the complete recording on the server and use
         * that text. If the candidate typed / edited the answer
         * by hand, the typed text is used as it is.
         */
        if (
          recorderRef.current?.isActive()
        ) {
          wantListeningRef.current = false;

          try {
            recognitionRef.current?.stop();
          } catch {}

          setTranscribing(true);

          const blob =
            await recorderRef.current.stop();

          if (
            blob &&
            !userEditedRef.current
          ) {
            try {
              const accurate =
                await transcribeAnswer(
                  interviewId,
                  blob
                );

              if (accurate) {
                finalText =
                  accurate;

                if (
                  mountedRef.current
                ) {
                  setAnswer(accurate);
                }
              }
            } catch (transcribeError) {
              // keep the live text so the answer is never lost
              console.error(
                "Server transcription failed, using live text:",
                transcribeError
              );
            }
          }

          if (mountedRef.current) {
            setTranscribing(false);
            setIsListening(false);
          }
        }

        const cleanAnswer =
          finalText.trim();

        if (!cleanAnswer) {
          processingRef.current =
            false;

          if (mountedRef.current) {
            setProcessing(false);

            setError(
              "Please provide an answer before submitting."
            );
          }

          return;
        }

        const question =
          currentQuestionRef.current;

        if (!question?.id) {
          processingRef.current =
            false;

          if (mountedRef.current) {
            setProcessing(false);

            setError(
              "Current question is missing."
            );
          }

          return;
        }

        setError("");

        setLastAnswer(
          cleanAnswer
        );

        if (
          recognitionRef.current
        ) {
          try {
            wantListeningRef.current = false;
recognitionRef.current.stop();
          } catch {}
        }

        cancelSpeech();

        try {
          const payload = {
            interview_id:
              interviewId,

            session_id:
              sessionId,

            question_id:
              question.id,

            current_question_id:
              question.id,

            candidate_answer:
              cleanAnswer,

            parent_question_id:
              question.parent_question_id ||
              null,

            is_follow_up:
              Boolean(
                question.is_follow_up
              ),

            question_number:
              question.question_number,

            question_type:
              question.question_type ||
              (
                question.is_follow_up
                  ? "follow_up"
                  : "main"
              ),
          };

          console.log(
            "SUBMIT ANSWER PAYLOAD:",
            payload
          );

          const response =
            await api.post(
              "/dialogflow/chat",
              {
                session_id:
                  sessionId,

                text:
                  cleanAnswer,

                parameters:
                  payload,
              }
            );

          if (
            !mountedRef.current ||
            terminatedRef.current
          ) {
            return;
          }

          handleDialogflowResponse(
            response?.data
          );
        } catch (err) {
          console.error(
            "Answer submission error:",
            err
          );

          if (
            !mountedRef.current ||
            terminatedRef.current
          ) {
            return;
          }

          setError(
            err?.response?.data?.detail ||
              err?.message ||
              "Failed to process answer."
          );

          setProcessing(false);
        } finally {
          processingRef.current =
            false;

          if (
            mountedRef.current &&
            !terminatedRef.current
          ) {
            setProcessing(false);
          }
        }
      },
      [
        cancelSpeech,
        interviewId,
        sessionId,
        handleDialogflowResponse,
      ]
    );

  submitAnswerRef.current =
    submitAnswerWithText;

  phaseRef.current = phase;

  answerValueRef.current = answer;

  /*
   * ============================================================
   * FOLLOW-UP YES
   * ============================================================
   */

  const handleFollowUpYes =
    async () => {
      if (
        processingRef.current ||
        completedRef.current ||
        terminatedRef.current
      ) {
        return;
      }

      const question =
        currentQuestionRef.current;

      if (!question?.id) {
        setError(
          "Current question is missing."
        );

        return;
      }

      processingRef.current =
        true;

      setProcessing(true);

      setError("");

      try {
        const response =
          await api.post(
            "/dialogflow/chat",
            {
              session_id:
                sessionId,

              text: "yes",

              parameters: {
                session_id:
                  sessionId,

                interview_id:
                  interviewId,

                question_id:
                  question.id,

                current_question_id:
                  question.id,

                candidate_answer:
                  "yes",

                follow_up_confirmation:
                  "yes",
                // FIX: tells the backend this is a YES/NO answer to the
                // follow-up offer, not an answer to the interview question.
                follow_up_confirmation_required:
                  true,

                is_follow_up:
                  false,

                question_number:
                  question.question_number,
              },
            }
          );

        if (
          !mountedRef.current ||
          terminatedRef.current
        ) {
          return;
        }

        handleDialogflowResponse(
          response?.data
        );
      } catch (err) {
        if (
          mountedRef.current
        ) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              "Unable to generate follow-up question."
          );
        }
      } finally {
        processingRef.current =
          false;

        if (
          mountedRef.current &&
          !terminatedRef.current
        ) {
          setProcessing(false);
        }
      }
    };

  /*
   * ============================================================
   * FOLLOW-UP NO
   * ============================================================
   */

  const handleFollowUpNo =
    async () => {
      if (
        processingRef.current ||
        completedRef.current ||
        terminatedRef.current
      ) {
        return;
      }

      const question =
        currentQuestionRef.current;

      if (!question?.id) {
        setError(
          "Current question is missing."
        );

        return;
      }

      processingRef.current =
        true;

      setProcessing(true);

      setError("");

      try {
        const response =
          await api.post(
            "/dialogflow/chat",
            {
              session_id:
                sessionId,

              text: "no",

              parameters: {
                session_id:
                  sessionId,

                interview_id:
                  interviewId,

                question_id:
                  question.id,

                current_question_id:
                  question.id,

                candidate_answer:
                  "no",

                follow_up_confirmation:
                  "no",
                // FIX: tells the backend this is a YES/NO answer to the
                // follow-up offer, not an answer to the interview question.
                follow_up_confirmation_required:
                  true,

                is_follow_up:
                  false,

                question_number:
                  question.question_number,
              },
            }
          );

        if (
          !mountedRef.current ||
          terminatedRef.current
        ) {
          return;
        }

        handleDialogflowResponse(
          response?.data
        );
      } catch (err) {
        if (
          mountedRef.current
        ) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              "Unable to move to next question."
          );
        }
      } finally {
        processingRef.current =
          false;

        if (
          mountedRef.current &&
          !terminatedRef.current
        ) {
          setProcessing(false);
        }
      }
    };

  followUpYesRef.current =
    handleFollowUpYes;

  followUpNoRef.current =
    handleFollowUpNo;

  /*
   * ============================================================
   * VOICE RECOGNITION
   * ============================================================
   */

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // no live preview in this browser, but audio recording + server
      // transcription still works
      setVoiceSupported(canRecordAudio());
      return;
    }

    setVoiceSupported(true);

    const recognition =
      new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      if (
        mountedRef.current
      ) {
        setIsListening(true);
      }
    };

    recognition.onresult = (
      event
    ) => {
      let transcript = "";

      for (
        let i =
          event.resultIndex;
        i <
        event.results.length;
        i++
      ) {
        transcript +=
          event.results[i][0]
            .transcript;
      }

      transcript =
        transcript.trim();

      /*
       * FOLLOW-UP OFFER: the candidate is answering YES / NO,
       * not answering an interview question.
       */
      if (
        phaseRef.current ===
        "followup-confirmation"
      ) {
        const lastChunk =
          event.results[
            event.results.length - 1
          ];

        if (
          lastChunk?.isFinal &&
          mountedRef.current &&
          !processingRef.current
        ) {
          const decision =
            parseYesNo(transcript);

          if (decision === "yes") {
            followUpYesRef.current?.();
          } else if (
            decision === "no"
          ) {
            followUpNoRef.current?.();
          } else {
            speakThenRef.current?.(
              "Sorry, I did not catch that. Please say yes or no.",
              () =>
                startListeningRef.current?.()
            );
          }
        }

        return;
      }

      /*
       * Keep a live preview and submit after a finalized result
       * has been followed by a short silence. Manual submission
       * remains available for typed or longer answers.
       */
      let spoken = "";

      for (
        let i = 0;
        i < event.results.length;
        i++
      ) {
        spoken +=
          event.results[i][0]
            .transcript;
      }

      spoken = spoken.trim();

      if (
        spoken &&
        mountedRef.current
      ) {
        const base =
          speechBaseRef.current;

        const full = (
          base
            ? base + " " + spoken
            : spoken
        ).trim();

        latestSpeechRef.current =
          full;

        setAnswer(full);

        const latestResult =
          event.results[event.results.length - 1];
        if (
          latestResult?.isFinal &&
          phaseRef.current === "question" &&
          !userEditedRef.current
        ) {
          if (mainSilenceTimerRef.current) {
            clearTimeout(mainSilenceTimerRef.current);
          }

          mainSilenceTimerRef.current = setTimeout(() => {
            mainSilenceTimerRef.current = null;
            if (
              mountedRef.current &&
              wantListeningRef.current &&
              !processingRef.current &&
              !completedRef.current &&
              !terminatedRef.current &&
              !userEditedRef.current &&
              latestSpeechRef.current.trim()
            ) {
              submitAnswerRef.current?.(latestSpeechRef.current);
            }
          }, 1800);
        }
      }
    };

    recognition.onerror = (
      event
    ) => {
      console.error(
        "Speech recognition error:",
        event
      );

      if (
        event?.error ===
          "not-allowed" ||
        event?.error ===
          "service-not-allowed"
      ) {
        wantListeningRef.current = false;
        recorderRef.current?.cancel();
        setError(
          "Microphone permission was denied. Allow microphone access or type your answer."
        );
      } else if (mountedRef.current) {
        setError(
          "Speech recognition stopped unexpectedly. Your recording can still be submitted, or you can type your answer."
        );
      }

      if (
        mountedRef.current
      ) {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (
        mountedRef.current
      ) {
        setIsListening(false);
      }

      /*
       * Browsers can stop recognition after a short silence.
       * Keep the same answer open until the finalized-result
       * silence timer submits it.
       */
      if (
        mountedRef.current &&
        wantListeningRef.current &&
        phaseRef.current ===
          "question" &&
        !processingRef.current &&
        !completedRef.current &&
        !terminatedRef.current &&
        !speechCancelRef.current &&
        !window.speechSynthesis?.speaking
      ) {
        speechBaseRef.current =
          answerValueRef.current ||
          latestSpeechRef.current ||
          "";

        setTimeout(() => {
          if (
            mountedRef.current &&
            wantListeningRef.current &&
            phaseRef.current ===
              "question" &&
            !processingRef.current &&
            !terminatedRef.current
          ) {
            try {
              recognition.start();
            } catch {}
          }
        }, 250);
      }

      // Candidate stayed silent during the follow-up offer:
      // listen again a few times.
      if (
        mountedRef.current &&
        phaseRef.current ===
          "followup-confirmation" &&
        !processingRef.current &&
        !terminatedRef.current &&
        !speechCancelRef.current &&
        !window.speechSynthesis?.speaking &&
        confirmRetryRef.current < 4
      ) {
        confirmRetryRef.current += 1;

        setTimeout(() => {
          if (
            mountedRef.current &&
            phaseRef.current ===
              "followup-confirmation" &&
            !processingRef.current
          ) {
            startListeningRef.current?.();
          }
        }, 600);
      }
    };

    recognitionRef.current =
      recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}

      recognitionRef.current =
        null;
    };
  }, []);

  /*
   * ============================================================
   * START LISTENING
   * ============================================================
   */

  const startListening =
    async () => {
      if (
        (!recognitionRef.current &&
          !canRecordAudio()) ||
        speechCancelRef.current ||
        window.speechSynthesis?.speaking ||
        processingRef.current ||
        completedRef.current ||
        terminatedRef.current
      ) {
        return;
      }

      wantListeningRef.current =
        phaseRef.current ===
        "question";

      // record the whole answer as audio (accurate transcript later)
      if (phaseRef.current === "question") {
        userEditedRef.current = false;

        if (canRecordAudio()) {
          const recordingStarted =
            await recorderRef.current.start();

          if (!recordingStarted && !recognitionRef.current) {
            setError(
              "Microphone recording could not start. Check microphone permission or type your answer instead."
            );
            return;
          }

          if (!recordingStarted) {
            setError(
              "Audio recording is unavailable. You can continue with the live transcript or type your answer."
            );
          } else if (!recognitionRef.current) {
            setError("");
            setIsListening(true);
          }
        }
      }

      if (!recognitionRef.current) {
        return;
      }

      speechBaseRef.current =
        answerValueRef.current ||
        "";

      latestSpeechRef.current =
        "";

      // yes/no follow-up offer needs a short single phrase
      recognitionRef.current.continuous =
        phaseRef.current !==
        "followup-confirmation";

      try {
        recognitionRef.current.start();
      } catch {
        console.warn(
          "Speech recognition already running."
        );
      }
    };

  /*
   * ============================================================
   * STOP LISTENING
   * ============================================================
   */

  const stopListening =
    () => {
      if (
        !recognitionRef.current
      ) {
        return;
      }

      try {
        wantListeningRef.current = false;
recognitionRef.current.stop();
      } catch {}
    };

  startListeningRef.current =
    startListening;

  /*
   * ============================================================
   * SPEAK + CALLBACK (voice follow-up offer)
   * ============================================================
   */
  const speakThen = (text, onDone) => {
    try {
      wantListeningRef.current = false;
      recognitionRef.current?.stop();
    } catch {}

    const speech = speakText(text);
    const generation = speechGenerationRef.current;

    void speech
      .then(() => {
        if (
          mountedRef.current &&
          generation === speechGenerationRef.current &&
          !completedRef.current &&
          !terminatedRef.current
        ) {
          onDone?.();
        }
      })
      .catch((error) => {
        console.error("Follow-up prompt speech failed:", error);
      });
  };

  speakThenRef.current =
    speakThen;

  /*
   * ============================================================
   * FOLLOW-UP OFFER BY VOICE
   * ============================================================
   * When the backend offers a follow-up, the AI asks out loud,
   * then the microphone starts by itself so the candidate can
   * just say "yes" or "no". Buttons still work.
   */
  useEffect(() => {
    if (
      phase !== "followup-confirmation"
    ) {
      return undefined;
    }

    confirmRetryRef.current = 0;

    let cancelled = false;

    const timer = setTimeout(() => {
      speakThenRef.current?.(
        "Would you like a follow-up question? Please say yes or no.",
        () => {
          if (
            !cancelled &&
            phaseRef.current ===
              "followup-confirmation"
          ) {
            startListeningRef.current?.();
          }
        }
      );
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);

      try {
        wantListeningRef.current = false;
recognitionRef.current?.stop();
      } catch {}
    };
  }, [phase]);

  /*
   * ============================================================
   * CAMERA START
   * ============================================================
   *
   * IMPORTANT FIX:
   *
   * Do NOT attach stream to videoRef here.
   *
   * The <video> element exists only after
   * cameraEnabled becomes true.
   *
   * A separate effect below attaches
   * stream -> video.
   * ============================================================
   */

  const startCamera =
    useCallback(
      async () => {
        if (
          completedRef.current ||
          terminatedRef.current
        ) {
          return false;
        }

        if (
          !navigator.mediaDevices ||
          !navigator.mediaDevices
            .getUserMedia
        ) {
          setError(
            "Camera is not supported by this browser."
          );

          return false;
        }

        /*
         * Already running
         */
        if (streamRef.current) {
          setCameraEnabled(true);

          return true;
        }

        try {
          console.log(
            "Starting camera..."
          );

          const stream =
            await navigator.mediaDevices.getUserMedia(
              {
                video: {
                  facingMode:
                    "user",

                  width: {
                    ideal: 640,
                  },

                  height: {
                    ideal: 480,
                  },

                  frameRate: {
                    ideal: 30,
                    max: 30,
                  },
                },

                audio: false,
              }
            );

          if (
            !mountedRef.current ||
            completedRef.current ||
            terminatedRef.current
          ) {
            stream
              .getTracks()
              .forEach(
                (track) => {
                  try {
                    track.stop();
                  } catch {}
                }
              );

            return false;
          }

          streamRef.current =
            stream;

          console.log(
            "Camera stream started:",
            stream
          );

          /*
           * IMPORTANT:
           *
           * Video element will be attached
           * by the useEffect below.
           */
          setCameraEnabled(true);

          return true;
        } catch (err) {
          console.error(
            "Camera error:",
            err
          );

          setError(
            err?.name ===
              "NotAllowedError"
              ? "Camera permission was denied. Please allow camera access in the browser."
              : err?.name ===
                "NotFoundError"
              ? "No camera was found on this device."
              : "Camera access could not be started."
          );

          setCameraEnabled(false);

          return false;
        }
      },
      []
    );

  /*
   * ============================================================
   * IMPORTANT CAMERA -> VIDEO ATTACHMENT
   * ============================================================
   *
   * THIS FIXES THE MAIN PROBLEM.
   *
   * React first renders <video> after
   * cameraEnabled becomes true.
   *
   * Then this effect gets the real videoRef
   * and attaches the already-running camera stream.
   */

  useEffect(() => {
    if (!cameraEnabled) {
      return;
    }

    const video =
      videoRef.current;

    const stream =
      streamRef.current;

    if (!video) {
      console.warn(
        "Video element not ready yet."
      );

      return;
    }

    if (!stream) {
      console.warn(
        "Camera stream not available."
      );

      return;
    }

    console.log(
      "Attaching camera stream to video element..."
    );

    if (
      video.srcObject !== stream
    ) {
      video.srcObject = stream;
    }

    const playVideo =
      async () => {
        try {
          await video.play();

          console.log(
            "Camera video playback started."
          );
        } catch (err) {
          console.warn(
            "Video playback failed:",
            err
          );
        }
      };

    /*
     * Sometimes metadata needs to load
     * before play().
     */
    if (
      video.readyState >=
      HTMLMediaElement.HAVE_METADATA
    ) {
      playVideo();
    } else {
      const handleLoadedMetadata =
        () => {
          playVideo();
        };

      video.addEventListener(
        "loadedmetadata",
        handleLoadedMetadata,
        {
          once: true,
        }
      );

      return () => {
        video.removeEventListener(
          "loadedmetadata",
          handleLoadedMetadata
        );
      };
    }
  }, [cameraEnabled, phase]);

  /*
   * ============================================================
   * CAMERA OFF
   * ============================================================
   */

  const disableCamera =
    useCallback(() => {
      console.log(
        "Disabling camera..."
      );

      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => {
            try {
              track.stop();
            } catch {}
          });

        streamRef.current =
          null;
      }

      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {}

        videoRef.current.srcObject =
          null;
      }

      /*
       * Camera OFF automatically
       * disables Face + Eye/Gaze.
       */

      setCameraEnabled(false);

      setFaceDetectionEnabled(
        false
      );

      setEyeGazeEnabled(false);

      setFaceStatus(
        "Face detection OFF"
      );

      setEyeStatus(
        "Eye/Gaze detection OFF"
      );

      /*
       * Stop monitoring loop
       */

      monitoringRunningRef.current =
        false;

      if (
        monitoringFrameRef.current
      ) {
        cancelAnimationFrame(
          monitoringFrameRef.current
        );

        monitoringFrameRef.current =
          null;
      }

      noFaceSinceRef.current =
        null;

      multipleFaceSinceRef.current =
        null;

      eyesClosedSinceRef.current =
        null;

      lookingAwaySinceRef.current =
        null;
    }, []);

  /*
   * ============================================================
   * CAMERA TOGGLE
   * ============================================================
   */

  const toggleCamera =
    async () => {
      if (cameraEnabled) {
        disableCamera();
        return;
      }

      await startCamera();
    };

  /*
   * ============================================================
   * FACE DETECTION ON
   * ============================================================
   */

  const enableFaceDetection =
    useCallback(
      async () => {
        /*
         * Camera required
         */
        if (!cameraEnabled) {
          const started =
            await startCamera();

          if (!started) {
            return;
          }
        }

        /*
         * MediaPipe will initialize
         * through the effect below.
         */

        setFaceDetectionEnabled(
          true
        );

        setFaceStatus(
          "Starting face detection..."
        );
      },
      [
        cameraEnabled,
        startCamera,
      ]
    );

  /*
   * ============================================================
   * FACE DETECTION OFF
   * ============================================================
   */

  const disableFaceDetection =
    useCallback(() => {
      setFaceDetectionEnabled(
        false
      );

      /*
       * Eye/Gaze requires face.
       */

      setEyeGazeEnabled(false);

      setFaceStatus(
        "Face detection OFF"
      );

      setEyeStatus(
        "Eye/Gaze detection OFF"
      );

      noFaceSinceRef.current =
        null;

      multipleFaceSinceRef.current =
        null;

      eyesClosedSinceRef.current =
        null;

      lookingAwaySinceRef.current =
        null;
    }, []);

  /*
   * ============================================================
   * FACE TOGGLE
   * ============================================================
   */

  const toggleFaceDetection =
    async () => {
      if (
        faceDetectionEnabled
      ) {
        disableFaceDetection();

        return;
      }

      await enableFaceDetection();
    };

  /*
   * ============================================================
   * EYE / GAZE ON
   * ============================================================
   */

  const enableEyeGaze =
    useCallback(
      async () => {
        /*
         * Camera required
         */

        if (!cameraEnabled) {
          const started =
            await startCamera();

          if (!started) {
            return;
          }
        }

        /*
         * Face required
         */

        if (!faceDetectionEnabled) {
          setFaceDetectionEnabled(
            true
          );

          setFaceStatus(
            "Starting face detection..."
          );
        }

        setEyeGazeEnabled(true);

        setEyeStatus(
          "Starting eye/gaze detection..."
        );
      },
      [
        cameraEnabled,
        faceDetectionEnabled,
        startCamera,
      ]
    );

  /*
   * ============================================================
   * EYE / GAZE OFF
   * ============================================================
   */

  const disableEyeGaze =
    useCallback(() => {
      setEyeGazeEnabled(false);

      setEyeStatus(
        "Eye/Gaze detection OFF"
      );

      eyesClosedSinceRef.current =
        null;

      lookingAwaySinceRef.current =
        null;
    }, []);

  /*
   * ============================================================
   * EYE / GAZE TOGGLE
   * ============================================================
   */

  const toggleEyeGaze =
    async () => {
      if (eyeGazeEnabled) {
        disableEyeGaze();

        return;
      }

      await enableEyeGaze();
    };

  /*
   * ============================================================
   * MONITORING POLICY (set by the interviewer)
   * ============================================================
   */

  useEffect(() => {
    let cancelled = false;

    async function loadPolicy() {
      try {
        // A temporary network/server error must not silently
        // switch OFF monitoring the interviewer turned ON, so
        // retry a few times. 401/403/404 are final answers
        // (404 = interviewer never enabled anything).
        const fetchPolicy = async () => {
          let lastError;

          for (
            let attempt = 0;
            attempt < 3;
            attempt += 1
          ) {
            try {
              return await api.get(
                `/interviews/${interviewId}/configuration`
              );
            } catch (err) {
              lastError = err;

              const code =
                err?.response?.status;

              if (
                code === 401 ||
                code === 403 ||
                code === 404
              ) {
                throw err;
              }

              await new Promise(
                (resolve) =>
                  setTimeout(
                    resolve,
                    700 * (attempt + 1)
                  )
              );

              if (cancelled) {
                throw err;
              }
            }
          }

          throw lastError;
        };

        const response =
          await fetchPolicy();

        if (cancelled) {
          return;
        }

        const raw =
          response.data
            ?.extra_config
            ?.proctoring || {};

        const enabled =
          Boolean(raw.enabled);

        const face =
          enabled &&
          Boolean(raw.face);

        const eye =
          face &&
          Boolean(raw.eye);

        const phone =
          enabled &&
          Boolean(raw.phone);

        setPolicy({
          loaded: true,
          enabled,
          face,
          eye,
          phone,
        });
      } catch (err) {
        console.warn(
          "Monitoring policy could not be loaded. " +
            "Continuing without monitoring.",
          err
        );

        if (!cancelled) {
          setPolicy({
            loaded: true,
            enabled: false,
            face: false,
            eye: false,
            phone: false,
          });
        }
      }
    }

    loadPolicy();

    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  const startMonitoring =
    useCallback(
      async () => {
        if (
          completedRef.current ||
          terminatedRef.current
        ) {
          return;
        }

        setCameraBlocked(false);

        const started =
          await startCamera();

        if (!started) {
          setCameraBlocked(true);

          api
            .post(
              `/hiring/sessions/${sessionId}/monitoring-event`,
              {
                type:
                  "camera_denied",
              }
            )
            .catch(() => {});

          return;
        }

        if (policy.face) {
          setFaceDetectionEnabled(
            true
          );

          setFaceStatus(
            "Starting face detection..."
          );
        }

        if (policy.eye) {
          setEyeGazeEnabled(true);

          setEyeStatus(
            "Starting eye/gaze detection..."
          );
        }
      },
      [
        policy,
        sessionId,
        startCamera,
      ]
    );

  useEffect(() => {
    if (
      !policy.loaded ||
      !policy.enabled ||
      autoStartedRef.current
    ) {
      return;
    }

    autoStartedRef.current = true;

    startMonitoring();
  }, [policy, startMonitoring]);

  /*
   * ============================================================
   * MEDIAPIPE INITIALIZATION
   * ============================================================
   */

  useEffect(() => {
    const needsFaceModel =
      faceDetectionEnabled ||
      eyeGazeEnabled;

    if (!needsFaceModel) {
      setMonitoringReady(false);

      /*
       * Stop existing loop
       */

      monitoringRunningRef.current =
        false;

      if (
        monitoringFrameRef.current
      ) {
        cancelAnimationFrame(
          monitoringFrameRef.current
        );

        monitoringFrameRef.current =
          null;
      }

      /*
       * Close existing model
       */

      if (
        faceLandmarkerRef.current
      ) {
        try {
          faceLandmarkerRef.current.close();
        } catch {}

        faceLandmarkerRef.current =
          null;
      }

      return;
    }

    let cancelled = false;

    async function initializeFaceMonitoring() {
      /*
       * Reuse model
       */

      if (
        faceLandmarkerRef.current
      ) {
        if (!cancelled) {
          setMonitoringReady(
            true
          );
        }

        return;
      }

      try {
        setFaceStatus(
          "Loading face detection..."
        );

        console.log(
          "Loading MediaPipe..."
        );

        // Loaded only now (and only when the interviewer turned
        // monitoring on) - it is a big library.
        const { FaceLandmarker, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );

        const vision =
          await FilesetResolver.forVisionTasks(
            MEDIAPIPE_WASM_URL
          );

        if (cancelled) {
          return;
        }

        console.log(
          "MediaPipe WASM loaded."
        );

        const faceLandmarker =
          await FaceLandmarker.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",

                /*
                 * GPU can fail on some systems.
                 * CPU is more compatible.
                 */
                delegate: "CPU",
              },

              runningMode: "VIDEO",

              numFaces: 2,

              minFaceDetectionConfidence:
                0.5,

              minFacePresenceConfidence:
                0.5,

              minTrackingConfidence:
                0.5,

              // needed for the "looking down" check
              outputFaceBlendshapes:
                true,

              outputFacialTransformationMatrixes:
                false,
            }
          );

        if (
          cancelled ||
          !mountedRef.current
        ) {
          try {
            faceLandmarker.close();
          } catch {}

          return;
        }

        faceLandmarkerRef.current =
          faceLandmarker;

        setMonitoringReady(true);

        logMonitoringEventRef.current?.(
          "monitoring_started"
        );

        setFaceStatus(
          "Face detection ready"
        );

        console.log(
          "MediaPipe FaceLandmarker ready."
        );

        /*
         * Camera should already exist,
         * but make sure it exists.
         */

        if (!streamRef.current) {
          await startCamera();
        }
      } catch (err) {
        console.error(
          "MediaPipe initialization failed:",
          err
        );

        if (
          cancelled ||
          !mountedRef.current
        ) {
          return;
        }

        setMonitoringReady(false);

        setFaceDetectionEnabled(
          false
        );

        setEyeGazeEnabled(false);

        setFaceStatus(
          "Face detection unavailable"
        );

        setEyeStatus(
          "Eye/Gaze detection OFF"
        );

        setError(
          "Face detection could not be started. Please check your camera and browser."
        );
      }
    }

    initializeFaceMonitoring();

    return () => {
      cancelled = true;
    };
  }, [
    faceDetectionEnabled,
    eyeGazeEnabled,
    startCamera,
  ]);

  /*
   * ============================================================
   * FACE / EYE PROCESSING LOOP
   * ============================================================
   */

  useEffect(() => {
    /*
     * Required conditions
     */

    if (
      !faceDetectionEnabled ||
      !monitoringReady ||
      !faceLandmarkerRef.current ||
      !cameraEnabled
    ) {
      monitoringRunningRef.current =
        false;

      if (
        monitoringFrameRef.current
      ) {
        cancelAnimationFrame(
          monitoringFrameRef.current
        );

        monitoringFrameRef.current =
          null;
      }

      return;
    }

    let cancelled = false;

    const monitor =
      () => {
        if (
          cancelled ||
          !mountedRef.current ||
          completedRef.current ||
          terminatedRef.current ||
          !faceDetectionEnabled ||
          !cameraEnabled
        ) {
          return;
        }

        // run the heavy detector ~10x/second, not on every frame
        const tickNow = performance.now();

        if (
          tickNow - lastMonitorTickRef.current <
          MONITOR_INTERVAL_MS
        ) {
          monitoringFrameRef.current =
            requestAnimationFrame(
              monitor
            );

          return;
        }

        lastMonitorTickRef.current =
          tickNow;

        const video =
          videoRef.current;

        const landmarker =
          faceLandmarkerRef.current;

        /*
         * Video must have actual data
         */

        if (
          !video ||
          !landmarker ||
          video.readyState <
            HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          monitoringFrameRef.current =
            requestAnimationFrame(
              monitor
            );

          return;
        }

        /*
         * Make sure video is actually playing
         */

        if (video.paused) {
          video.play().catch(
            () => {}
          );
        }

        try {
          const now =
            performance.now();

          const result =
            landmarker.detectForVideo(
              video,
              now
            );

          const faces =
            result?.faceLandmarks ||
            [];

          // filled below, then handed to the gaze report
          const pose =
            faces.length === 1
              ? computeHeadPose(faces[0])
              : null;

          const gazeFrame = {
            faces: faces.length,
            irisX: null,
            away: false,
            down: false,
            closed: false,
            yaw: pose ? pose.yaw : null,
            pitch: pose ? pose.pitch : null,
            eyeDown: null,
            phone: phoneVisibleRef.current,
          };

          /*
           * ==================================================
           * FACE DETECTION
           * ==================================================
           */

          if (faces.length === 0) {
            setFaceStatus(
              "No face detected"
            );

            if (
              eyeGazeEnabled
            ) {
              setEyeStatus(
                "Eyes unavailable"
              );
            }

            if (
              !noFaceSinceRef.current
            ) {
              noFaceSinceRef.current =
                Date.now();

              logMonitoringEventRef.current?.(
                "face_not_found"
              );
            }

            /*
             * Give detection some time
             * before terminating.
             */
            const duration =
              Date.now() -
              noFaceSinceRef.current;

            if (
              duration >= 3000 &&
              faceDetectionEnabled
            ) {
              flagViolationRef.current?.("no_face_detected");
            }
          } else {
            noFaceSinceRef.current =
              null;
          }

          /*
           * ==================================================
           * MULTIPLE FACE
           * ==================================================
           */

          if (faces.length > 1) {
            setFaceStatus(
              "Multiple faces detected"
            );

            if (
              !multipleFaceSinceRef.current
            ) {
              multipleFaceSinceRef.current =
                Date.now();

              logMonitoringEventRef.current?.(
                "multiple_faces"
              );
            }

            const duration =
              Date.now() -
              multipleFaceSinceRef.current;

            if (
              duration >= 2000 &&
              faceDetectionEnabled
            ) {
              flagViolationRef.current?.("multiple_faces_detected");
            }
          } else {
            multipleFaceSinceRef.current =
              null;

            if (
              faces.length === 1
            ) {
              setFaceStatus(
                "Face detected"
              );
            }
          }

          /*
           * ==================================================
           * EYE / GAZE DETECTION
           * ==================================================
           */

          if (
            eyeGazeEnabled &&
            faces.length === 1
          ) {
            const landmarks =
              faces[0];

            /*
             * LEFT EYE
             */

            const leftEAR =
              calculateEyeAspectRatio(
                landmarks[159],
                landmarks[145],
                landmarks[33],
                landmarks[133]
              );

            /*
             * RIGHT EYE
             */

            const rightEAR =
              calculateEyeAspectRatio(
                landmarks[386],
                landmarks[374],
                landmarks[362],
                landmarks[263]
              );

            const averageEAR =
              (leftEAR +
                rightEAR) /
              2;

            /*
             * EYE CLOSED
             */

            const eyesClosed =
              averageEAR < 0.16;

            gazeFrame.closed =
              eyesClosed;

            if (eyesClosed) {
              setEyeStatus(
                "Eyes closed"
              );

              if (
                !eyesClosedSinceRef.current
              ) {
                eyesClosedSinceRef.current =
                  Date.now();

              logMonitoringEventRef.current?.(
                "eyes_closed"
              );
              }

              const duration =
                Date.now() -
                eyesClosedSinceRef.current;

              if (
                duration >= 1800 &&
                eyeGazeEnabled
              ) {
                flagViolationRef.current?.("eyes_closed");
              }
            } else {
              eyesClosedSinceRef.current =
                null;

              setEyeStatus(
                "Eyes open"
              );
            }

            /*
             * IRIS
             */

            const leftIris =
              landmarks.slice(
                468,
                473
              );

            const rightIris =
              landmarks.slice(
                473,
                478
              );

            const leftGaze =
              calculateIrisPosition(
                leftIris,
                landmarks[33],
                landmarks[133]
              );

            const rightGaze =
              calculateIrisPosition(
                rightIris,
                landmarks[362],
                landmarks[263]
              );

            const averageGaze =
              (leftGaze +
                rightGaze) /
              2;

            gazeFrame.irisX =
              averageGaze;

            /*
             * Looking away threshold
             */

            const lookingAway =
              averageGaze < 0.20 ||
              averageGaze > 0.80;

            gazeFrame.away =
              lookingAway;

            if (lookingAway) {
              setEyeStatus(
                "Looking away"
              );

              if (
                !lookingAwaySinceRef.current
              ) {
                lookingAwaySinceRef.current =
                  Date.now();

              logMonitoringEventRef.current?.(
                "looking_away"
              );
              }

              const duration =
                Date.now() -
                lookingAwaySinceRef.current;

              if (
                duration >= 1800 &&
                eyeGazeEnabled
              ) {
                flagViolationRef.current?.("looking_away");
              }
            } else {
              lookingAwaySinceRef.current =
                null;

              if (!eyesClosed) {
                setEyeStatus(
                  "Eyes focused"
                );
              }
            }
          }

          /*
           * ==================================================
           * LOOKING DOWN (phone / notes below the camera)
           * One long look down, or several short glances
           * ==================================================
           */

          if (
            eyeGazeEnabled &&
            faces.length === 1
          ) {
            const shapes =
              result
                ?.faceBlendshapes?.[0]
                ?.categories || [];

            const shapeScore =
              (name) =>
                shapes.find(
                  (s) =>
                    s.categoryName ===
                    name
                )?.score || 0;

            const downScore =
              (shapeScore(
                "eyeLookDownLeft"
              ) +
                shapeScore(
                  "eyeLookDownRight"
                )) /
              2;

            const blinkScore =
              (shapeScore(
                "eyeBlinkLeft"
              ) +
                shapeScore(
                  "eyeBlinkRight"
                )) /
              2;

            gazeFrame.eyeDown =
              shapes.length > 0
                ? downScore
                : null;

            // Learn this candidate's normal eye angle while they read
            // the screen (laptop cameras sit above the screen, so the
            // eyes are always a little "down").
            const baseline =
              downBaselineRef.current;

            if (
              baseline.value === null &&
              shapes.length > 0 &&
              blinkScore < 0.6
            ) {
              const t = Date.now();

              if (!baseline.startedAt) {
                baseline.startedAt = t;
              }

              baseline.samples.push(
                downScore
              );

              if (
                t - baseline.startedAt >=
                  LOOK_DOWN_CALIBRATION_MS &&
                baseline.samples.length >= 10
              ) {
                baseline.value =
                  baseline.samples.reduce(
                    (a, b) => a + b,
                    0
                  ) /
                  baseline.samples.length;
              }
            }

            const downThreshold =
              Math.min(
                0.85,
                Math.max(
                  LOOK_DOWN_SCORE,
                  (baseline.value ?? 0) +
                    LOOK_DOWN_MARGIN
                )
              );

            // blinking also raises the "down" score, so ignore it
            const lookingDown =
              shapes.length > 0 &&
              baseline.value !== null &&
              downScore >=
                downThreshold &&
              blinkScore < 0.6;

            gazeFrame.down =
              lookingDown;

            if (lookingDown) {
              setEyeStatus(
                "Looking down"
              );

              const nowMs =
                Date.now();

              if (
                !lookDownSinceRef.current
              ) {
                lookDownSinceRef.current =
                  nowMs;
              }

              const downFor =
                nowMs -
                lookDownSinceRef.current;

              if (
                downFor >=
                  LOOK_DOWN_EPISODE_MS &&
                !lookDownCountedRef.current
              ) {
                lookDownCountedRef.current =
                  true;

                logMonitoringEventRef.current?.(
                  "looking_down"
                );

                // tell the candidate right away (warning only,
                // the event above is already saved for the interviewer)
                flagViolationRef.current?.(
                  "looking_down",
                  { noticeOnly: true }
                );

                const recent =
                  downEpisodesRef.current.filter(
                    (at) =>
                      nowMs - at <
                      LOOK_DOWN_REPEAT_WINDOW_MS
                  );

                recent.push(nowMs);

                downEpisodesRef.current =
                  recent;

                if (
                  recent.length >=
                  LOOK_DOWN_REPEAT_COUNT
                ) {
                  flagViolationRef.current?.("repeated_looking_down");
                }
              }

              if (
                downFor >=
                LOOK_DOWN_TERMINATE_MS
              ) {
                flagViolationRef.current?.("looking_down");
              }
            } else {
              lookDownSinceRef.current =
                null;

              lookDownCountedRef.current =
                false;
            }
          } else {
            lookDownSinceRef.current =
              null;

            lookDownCountedRef.current =
              false;
          }

          // per-question eye numbers for the interviewer report
          if (eyeGazeEnabled) {
            const gz =
              gazeTrackerRef.current?.sample(
                performance.now(),
                gazeAnsweringRef.current,
                gazeFrame
              );

            // tell the candidate when they keep looking away while answering
            if (gz && gz.off && gz.offFor >= GAZE_CONFIG.warnAfterMs) {
              logMonitoringEventRef.current?.(
                "looking_away"
              );

              flagViolationRef.current?.(
                "looking_away",
                { noticeOnly: true }
              );
            }

            if (gazeDebugOn && gazeDebugRef.current) {
              const d = gazeTrackerRef.current.debug;

              gazeDebugRef.current.textContent =
                (d.calibrated
                  ? "READY"
                  : `LEARNING YOUR NORMAL ${Math.round(d.calibrationProgress * 100)}% (look at the screen)`) +
                `\nanswering: ${d.answering}` +
                `\nOFF SCREEN: ${d.off ? "YES - " + d.reason : "no"}` +
                `\nhead turn : ${d.yawDev.toFixed(3)}  (limit ${GAZE_CONFIG.yawDev})` +
                `\nhead down : ${d.pitchDev.toFixed(3)}  (limit ${GAZE_CONFIG.pitchDownDev})` +
                `\neyes down : ${d.eyeDownDev.toFixed(3)}  (limit ${GAZE_CONFIG.eyeDownDev})` +
                `\neyes side : ${d.irisDev.toFixed(3)}  (limit ${GAZE_CONFIG.irisDev})` +
                `\nphone seen: ${d.phone}`;
            }
          }

          /*
           * Eye OFF
           */

          if (!eyeGazeEnabled) {
            eyesClosedSinceRef.current =
              null;

            lookingAwaySinceRef.current =
              null;

            setEyeStatus(
              "Eye/Gaze detection OFF"
            );
          }
        } catch (err) {
          console.error(
            "Face monitoring frame error:",
            err
          );
        }

        monitoringFrameRef.current =
          requestAnimationFrame(
            monitor
          );
      };

    monitoringRunningRef.current =
      true;

    monitoringFrameRef.current =
      requestAnimationFrame(
        monitor
      );

    return () => {
      cancelled = true;

      if (
        monitoringFrameRef.current
      ) {
        cancelAnimationFrame(
          monitoringFrameRef.current
        );

        monitoringFrameRef.current =
          null;
      }

      monitoringRunningRef.current =
        false;

      noFaceSinceRef.current =
        null;

      multipleFaceSinceRef.current =
        null;

      eyesClosedSinceRef.current =
        null;

      lookingAwaySinceRef.current =
        null;

      lookDownSinceRef.current =
        null;

      lookDownCountedRef.current =
        false;
    };
  }, [
    cameraEnabled,
    faceDetectionEnabled,
    eyeGazeEnabled,
    monitoringReady,
  ]);

  /*
   * ============================================================
   * PHONE DETECTION
   * ============================================================
   *
   * Runs only when the interviewer turned "Phone detection" on.
   * Independent of face detection: it only needs the camera.
   * The model is loaded lazily, so interviews without phone
   * detection never download it.
   */

  useEffect(() => {
    if (!policy.phone) {
      setPhoneStatus(
        "Phone detection OFF"
      );

      return;
    }

    if (!cameraEnabled) {
      setPhoneStatus(
        "Waiting for camera..."
      );

      return;
    }

    let cancelled = false;
    let timer = null;
    let detector = null;

    const check = () => {
      if (
        cancelled ||
        !mountedRef.current ||
        completedRef.current ||
        terminatedRef.current
      ) {
        return;
      }

      const video =
        videoRef.current;

      if (
        !detector ||
        !video ||
        video.readyState <
          HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return;
      }

      try {
        const result =
          detector.detectForVideo(
            video,
            performance.now()
          );

        const found = (
          result?.detections || []
        ).some((d) =>
          (d.categories || []).some(
            (cat) =>
              cat.categoryName ===
                "cell phone" &&
              cat.score >=
                PHONE_SCORE_THRESHOLD
          )
        );

        phoneVisibleRef.current =
          found;

        const nowMs = Date.now();

        if (found) {
          phoneLastSeenRef.current =
            nowMs;

          if (
            !phoneSinceRef.current
          ) {
            phoneSinceRef.current =
              nowMs;

            logMonitoringEventRef.current?.(
              "phone_detected"
            );
          }

          setPhoneStatus(
            "Phone detected"
          );

          if (
            nowMs -
              phoneSinceRef.current >=
            PHONE_TERMINATE_MS
          ) {
            flagViolationRef.current?.(
              "phone_detected"
            );
          }
        } else if (
          phoneSinceRef.current &&
          nowMs -
            phoneLastSeenRef.current >
            PHONE_GRACE_MS
        ) {
          phoneSinceRef.current =
            null;

          setPhoneStatus(
            "No phone detected"
          );
        } else if (
          !phoneSinceRef.current
        ) {
          setPhoneStatus(
            "No phone detected"
          );
        }
      } catch (err) {
        console.error(
          "Phone detection frame error:",
          err
        );
      }
    };

    async function startPhoneDetection() {
      try {
        setPhoneStatus(
          "Loading phone detection..."
        );

        const {
          ObjectDetector,
          FilesetResolver,
        } = await import(
          "@mediapipe/tasks-vision"
        );

        const vision =
          await FilesetResolver.forVisionTasks(
            MEDIAPIPE_WASM_URL
          );

        if (cancelled) {
          return;
        }

        detector =
          await ObjectDetector.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  PHONE_MODEL_URL,

                delegate: "CPU",
              },

              runningMode: "VIDEO",

              scoreThreshold:
                PHONE_SCORE_THRESHOLD,

              maxResults: 5,

              categoryAllowlist: [
                "cell phone",
              ],
            }
          );

        if (
          cancelled ||
          !mountedRef.current
        ) {
          try {
            detector.close();
          } catch {}

          detector = null;

          return;
        }

        objectDetectorRef.current =
          detector;

        setPhoneStatus(
          "No phone detected"
        );

        timer = setInterval(
          check,
          PHONE_CHECK_INTERVAL_MS
        );
      } catch (err) {
        console.error(
          "Phone detection could not start:",
          err
        );

        if (!cancelled) {
          setPhoneStatus(
            "Phone detection unavailable"
          );
        }
      }
    }

    startPhoneDetection();

    return () => {
      cancelled = true;

      if (timer) {
        clearInterval(timer);
      }

      if (detector) {
        try {
          detector.close();
        } catch {}
      }

      detector = null;

      objectDetectorRef.current =
        null;

      phoneSinceRef.current =
        null;

      phoneLastSeenRef.current =
        0;
    };
  }, [
    policy.phone,
    cameraEnabled,
  ]);

  /*
   * ============================================================
   * FORMAT TIME
   * ============================================================
   */

  const formatTime =
    (seconds) => {
      const minutes =
        Math.floor(
          seconds / 60
        );

      const secs =
        seconds % 60;

      return `${String(
        minutes
      ).padStart(
        2,
        "0"
      )}:${String(
        secs
      ).padStart(
        2,
        "0"
      )}`;
    };

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (phase === "warmup") {
    const warmupStatus = isSpeaking
      ? "AI SPEAKING"
      : warmupTranscribing
        ? "PROCESSING / TRANSCRIBING"
        : warmupSubmitting
          ? "PROCESSING RESPONSE"
          : warmupListening
            ? "LISTENING TO CANDIDATE"
            : warmupStarted
              ? "READY FOR YOUR RESPONSE"
              : "READY TO BEGIN";

    return (
      <div className="min-h-screen bg-white text-slate-800 flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="max-w-lg w-full bg-white border border-slate-200 backdrop-blur-2xl p-8 rounded-3xl text-center space-y-5 shadow-2xl relative z-10">
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome to your interview
          </h1>

          <div className="text-xs font-bold tracking-widest text-slate-500">
            WARM WELCOME · {warmupStep + 1} OF 3
          </div>

          {warmupListening && !isSpeaking ? (
            <div className="flex flex-col items-center gap-3 py-2" role="status" aria-live="polite">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-violet-300/40 animate-ping" />
                <span className="absolute inset-3 rounded-full bg-violet-300/25 shadow-[0_0_45px_16px_rgba(139,92,246,0.28)]" />
                <span className="relative h-24 w-24 rounded-full bg-gradient-to-br from-violet-400 via-violet-600 to-purple-700 shadow-[0_0_32px_12px_rgba(124,58,237,0.45)]" />
              </div>
              <span className="text-sm font-extrabold tracking-[0.35em] text-violet-600">
                SPEAKING
              </span>
            </div>
          ) : (
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border text-3xl ${
              isSpeaking
                ? "border-violet-300 bg-violet-50 animate-pulse"
                : "border-slate-200 bg-slate-50"
            }`} aria-hidden="true">
              {isSpeaking ? "🔊" : "🤖"}
            </div>
          )}

          <p className="text-sm font-bold text-slate-600" role="status" aria-live="polite">
            {warmupStatus}
          </p>
          <p className="text-slate-800 font-semibold leading-relaxed">
            {warmupStarted
              ? WARMUP_PROMPTS[warmupStep]
              : "We’ll start with a short conversation before your interview."}
          </p>
          <p className="text-slate-500 text-sm">
            {warmupManualInput
              ? "Voice input is unavailable right now. You can type a reply below."
              : "The interviewer will pause after each prompt and listen to your response."}
          </p>

          {warmupVoiceError && (
            <p className="text-amber-700 text-sm" role="alert">
              {warmupVoiceError}
            </p>
          )}

          {warmupResponse && (
            <p className="text-slate-600 text-sm leading-relaxed">
              {warmupResponse}
            </p>
          )}

          {!warmupStarted ? (
            <button
              type="button"
              onClick={() => void beginWarmup()}
              disabled={warmupStarting}
              className="w-full py-3 rounded-2xl font-bold text-white bg-violet-700 hover:bg-violet-600 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {warmupStarting ? "Starting..." : "Start Interview"}
            </button>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={toggleWarmupSpeechRecognition}
                disabled={isSpeaking || warmupTranscribing || warmupSubmitting}
                aria-pressed={warmupListening}
                className={`w-full py-3 rounded-2xl font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  warmupListening
                    ? "bg-rose-700 hover:bg-rose-600"
                    : "bg-violet-700 hover:bg-violet-600"
                }`}
              >
                {warmupListening
                  ? "Stop and process your response"
                  : "Retry microphone listening"}
              </button>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void finishWarmup(warmupDraft);
                }}
                className="space-y-3"
              >
                <textarea
                  value={warmupDraft}
                  onChange={(event) => setWarmupDraft(event.target.value)}
                  maxLength={400}
                  rows={3}
                  disabled={
                    isSpeaking ||
                    warmupListening ||
                    warmupTranscribing ||
                    warmupSubmitting
                  }
                  aria-label={`Your response for warm welcome question ${warmupStep + 1}`}
                  placeholder="Or type your reply here"
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={
                    !warmupDraft.trim() ||
                    isSpeaking ||
                    warmupListening ||
                    warmupTranscribing ||
                    warmupSubmitting
                  }
                  className="w-full py-3 rounded-2xl font-bold text-white bg-slate-800 hover:opacity-90 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {warmupTranscribing
                    ? "Transcribing..."
                    : warmupSubmitting
                      ? "Processing response..."
                      : "Send typed reply"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => void replayWarmupPrompt()}
                disabled={
                  isSpeaking ||
                  warmupListening ||
                  warmupTranscribing ||
                  warmupSubmitting
                }
                className="text-xs text-slate-500 underline underline-offset-4 hover:text-slate-900 transition disabled:opacity-50"
              >
                Replay prompt and listen
              </button>
            </div>
          )}

          {warmupVoiceError && !warmupSubmitting && (
            <button
              type="button"
              onClick={continueWithoutWarmup}
              className="text-xs text-slate-500 underline underline-offset-4 hover:text-slate-900 transition"
            >
              Continue to interview without the warm welcome
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-white text-slate-800 flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="max-w-lg w-full bg-white border border-slate-200 backdrop-blur-2xl p-8 rounded-3xl text-center space-y-6 shadow-2xl relative z-10">
          <div className="w-16 h-16 bg-slate-100 border border-slate-300 rounded-2xl flex items-center justify-center text-3xl mx-auto animate-pulse">
            🤖
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            A quick introduction
          </h1>

          <p className="text-slate-600 text-sm leading-relaxed">
            Please listen. Your interviewer is introducing the company.
            Your first question comes right after.
          </p>

          <div className="flex items-end justify-center gap-1.5 h-8" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-1.5 rounded-full bg-slate-800 animate-pulse"
                style={{
                  height: `${12 + ((i * 7) % 5) * 5}px`,
                  animationDelay: `${i * 120}ms`,
                }}
              />
            ))}
          </div>

          <button data-plain
            type="button"
            onClick={() => {
              cancelSpeech();
              setIntroDone(true);
            }}
            className="text-xs text-slate-500 underline underline-offset-4 hover:text-slate-900 transition"
          >
            Skip introduction
          </button>
        </div>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-white text-slate-800 flex items-center justify-center relative overflow-hidden font-sans">
        <div className="bg-white border border-slate-200 backdrop-blur-2xl p-10 rounded-3xl text-center max-w-sm shadow-2xl relative z-10">
          <div className="w-16 h-16 border-4 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-6" />

          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Preparing Session
          </h2>

          <p className="text-xs text-slate-500 font-mono">
            Starting interview...
          </p>

          <p className="text-[10px] text-slate-500 mt-3">
            Camera and monitoring can be enabled from the interview screen.
          </p>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * ERROR
   * ============================================================
   */

  if (phase === "error") {
    return (
      <div className="min-h-screen bg-white text-slate-800 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-rose-500/30 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl space-y-4">
          <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-600 rounded-2xl flex items-center justify-center font-bold text-xl">
            ⚠️
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            Interview Error
          </h2>

          <p className="text-slate-600 text-sm leading-relaxed">
            {error}
          </p>

          <button
            onClick={() =>
              window.location.reload()
            }
            className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all cursor-pointer border border-slate-200"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * TERMINATED
   * ============================================================
   */

  if (phase === "terminated") {
    return (
      <div className="min-h-screen bg-white text-slate-800 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-rose-500/30 backdrop-blur-2xl p-8 rounded-3xl text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 text-rose-600 rounded-2xl flex items-center justify-center text-3xl mx-auto">
            ⚠
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Interview Ended
          </h1>

          <p className="text-slate-500 text-sm leading-relaxed">
            The interview was ended because the interview monitoring condition was violated.
          </p>

          <p className="text-xs text-slate-500">
            Please contact the interviewer if you believe this happened by mistake.
          </p>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * COMPLETED
   * ============================================================
   */

  if (phase === "completed") {
    return (
      <div className="min-h-screen bg-white text-slate-800 flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="max-w-md w-full bg-white border border-emerald-500/30 backdrop-blur-2xl p-8 rounded-3xl text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl mx-auto">
            ✓
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Thank You for the Interview!
          </h1>

          <p className="text-slate-600 text-base font-semibold">
            Your interview is completed.
          </p>

          <p className="text-slate-500 text-sm leading-relaxed">
            Your answers were submitted successfully and will be reviewed by the interviewer.
          </p>

          <div className="text-left rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 space-y-2">
            <p>
              <b className="text-emerald-700">Selected?</b> Our team will contact you.
            </p>
            <p>
              <b className="text-slate-800">Not selected?</b> You will receive an email.
            </p>
            <p className="text-xs text-slate-500">
              A confirmation email is on its way to you now.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/dashboard")}
 className="w-full py-3 rounded-2xl font-bold text-white bg-slate-800 hover:opacity-90 transition"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * MAIN UI
   * ============================================================
   */

  /*
   * Stop Recording = answer finished -> submit automatically.
   * (small delay so the last spoken words are captured first)
   */
  const stopAndSubmit = () => {
    wantListeningRef.current = false;

    try {
      recognitionRef.current?.stop();
    } catch {}

    // small delay so the last live words settle, then the full
    // recording is transcribed on the server and submitted
    setTimeout(() => {
      if (
        mountedRef.current &&
        !processingRef.current &&
        !completedRef.current &&
        !terminatedRef.current
      ) {
        submitAnswerWithText(
          String(
            answerValueRef.current || ""
          )
        );
      }
    }, 400);
  };

  const lastAiIndex = chatLog.reduce(
    (found, m, i) => (m.role === "ai" ? i : found),
    -1
  );

  const previousMessages = chatLog.filter(
    (_m, i) => i !== lastAiIndex
  );

  const questionText = currentQuestion?.question || "";
  const typing = typedLength < questionText.length;

  const assistantStatus = transcribing
    ? "Processing / transcribing"
    : processing
    ? "Processing answer"
    : isSpeaking
    ? "AI speaking"
    : isListening
    ? "Listening to candidate"
    : phase === "question"
      ? "Ready for your answer"
      : "Ready for the next question";

  const TOTAL_QUESTIONS = Number(totalQuestions) > 0 ? Number(totalQuestions) : 5;

  const progress = Math.round(
    (Math.min(Number(questionNumber) || 1, TOTAL_QUESTIONS) /
      TOTAL_QUESTIONS) *
      100
  );

  const statusColor = (value, good, bad) =>
    bad
      ? "text-rose-600"
      : good
      ? "text-emerald-600"
      : "text-slate-500";

  const monitorRows = [
    {
      label: "Camera",
      value: cameraEnabled ? "On" : "Off",
      good: cameraEnabled,
    },
    {
      label: "Face detection",
      value: faceStatus,
      good: faceStatus === "Face detected",
      bad:
        faceStatus === "No face detected" ||
        faceStatus === "Multiple faces detected",
    },
    {
      label: "Eye / eyeball",
      value: eyeStatus,
      good:
        eyeStatus === "Eyes focused" || eyeStatus === "Eyes open",
      bad:
        eyeStatus === "Looking away" ||
        eyeStatus === "Looking down" ||
        eyeStatus === "Eyes closed",
    },
    ...(policy.phone
      ? [
          {
            label: "Phone",
            value: phoneStatus,
            good: phoneStatus === "No phone detected",
            bad: phoneStatus === "Phone detected",
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans lg:h-screen lg:overflow-hidden">
      {/* CAMERA REQUIRED (only when the interviewer turned monitoring on) */}
      {policy.loaded && policy.enabled && !cameraEnabled && (
        <div className="fixed inset-0 z-50 bg-slate-50/95 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-50 border border-slate-300 rounded-xl p-8 text-center space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              Camera required
            </h2>

            <p className="text-sm text-slate-500 leading-relaxed">
              {cameraBlocked
                ? "The interviewer requires camera monitoring for this interview. Please allow camera access in your browser, then try again."
                : "Starting your camera. Please allow access if your browser asks."}
            </p>

            {cameraBlocked && (
              <button
                type="button"
                onClick={startMonitoring}
                className="w-full py-3 rounded-lg font-semibold text-white bg-slate-300 hover:bg-slate-500"
              >
                Allow camera and continue
              </button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-screen lg:h-full grid grid-cols-1 lg:grid-cols-[60%_40%]">
        {/* ================= LEFT ================= */}
        <section className="min-h-0 flex flex-col gap-3 p-4 md:p-8 lg:h-full lg:overflow-y-auto">
          {/* LOGO */}
          <div className="h-[56px] shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center justify-center gap-2 text-xl font-black">
            <span className="text-slate-700">VOLK</span>
            <span>Ai</span>
            <span className="text-slate-700">HR</span>
          </div>

          {/* VIDEO */}
          <div className="relative flex-none lg:flex-1 min-h-[280px] lg:min-h-[220px] rounded-2xl border border-slate-200 bg-slate-900 shadow-sm overflow-hidden">
            {cameraEnabled ? (
              <video
                ref={attachVideo}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(event) => {
                  event.currentTarget.play().catch(() => {});
                }}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                Camera is off
              </div>
            )}

            {cameraEnabled && (
              <span className="absolute top-3 left-3 px-2 py-1 rounded bg-white/90 text-slate-800 text-[10px] font-semibold shadow">
                ● LIVE
              </span>
            )}

            {/* warning (interview keeps running) */}
            {violationNotice && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[92%] px-6 py-4 rounded-xl bg-amber-100 border-2 border-amber-500 text-amber-900 text-2xl md:text-3xl font-extrabold shadow-2xl text-center animate-pulse">
                ⚠ {violationNotice}
              </div>
            )}

            {gazeDebugOn && (
              <pre
                ref={gazeDebugRef}
                className="absolute top-2 left-2 z-30 max-w-[95%] p-2 rounded bg-white/95 border border-slate-200 text-[11px] leading-tight text-emerald-700 whitespace-pre-wrap"
              />
            )}

            {/* RECORDING BUTTONS ON TOP OF THE VIDEO */}
            {phase !== "followup-confirmation" && (
              <div className="absolute bottom-3 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-3 px-3">
                {isListening && (
                  <span className="px-2 py-1 rounded bg-rose-600/90 text-[10px] font-bold animate-pulse">
                    ● REC
                  </span>
                )}

                {voiceSupported && (
                  <button
                    type="button"
                    disabled={processing || transcribing || isSpeaking}
                    onClick={isListening ? stopAndSubmit : startListening}
                    className={`px-4 py-2 rounded-md text-sm font-semibold shadow-lg backdrop-blur disabled:opacity-50 ${
                      isListening
                        ? "bg-rose-600 hover:bg-rose-500 text-white"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                    }`}
                  >
                    🎤 {transcribing ? "Transcribing..." : processing ? "Submitting..." : isListening ? "Stop Recording" : "Start Recording"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* INTERVIEWER + MONITORING */}
          <div className="shrink-0 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col items-center justify-center gap-2">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl bg-slate-100 border-2 ${
                  isSpeaking
                    ? "border-violet-500 ring-2 ring-violet-200 animate-pulse"
                    : "border-slate-300"
                }`}
              >
                🤖
              </div>
              <div className="text-sm font-bold">AI Interviewer</div>
              <div className="text-[11px] text-slate-500">
                {assistantStatus}
              </div>
              <select
                value={voiceId}
                onChange={(e) =>
                  changeVoice(e.target.value)
                }
                aria-label="Interviewer voice"
                className="mt-1 w-full rounded-md bg-white border border-slate-300 text-[11px] text-slate-700 px-2 py-1 outline-none focus:border-slate-300"
              >
                {Object.entries(VOICE_PROFILES).map(
                  ([id, profile]) => (
                    <option key={id} value={id}>
                      {profile.label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Monitoring
              </div>

              <div className="space-y-1.5">
                {monitorRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-slate-500">{row.label}</span>
                    <span
                      className={`font-semibold ${statusColor(
                        row.value,
                        row.good,
                        row.bad
                      )}`}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {!policy.enabled && (
                <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
                  Face / eye detection is OFF because the interviewer has not
                  turned monitoring on for this interview.
                </p>
              )}
            </div>
          </div>

          {/* CONTROLS */}
          <div className="shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={policy.enabled}
              onClick={toggleCamera}
              className="px-4 py-2 rounded-md text-sm bg-slate-200 hover:bg-slate-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              📹{" "}
              {cameraEnabled
                ? policy.enabled
                  ? "Video On"
                  : "Stop Video"
                : "Start Video"}
            </button>

          </div>

          {policy.enabled && (
            <p className="shrink-0 text-[10px] text-slate-500 text-center leading-relaxed">
              Keep your face visible, keep phones and notes away, look at
              the screen and stay on this page. Anything unusual is noted
              in the interviewer's report; the interview keeps running.
            </p>
          )}
        </section>

        {/* ================= RIGHT ================= */}
        <section className="h-[80vh] min-h-[560px] lg:h-full lg:min-h-0 flex flex-col border-l border-slate-200">
          <div className="h-[64px] shrink-0 flex items-center justify-center">
            <h1 className="text-xl font-bold text-slate-900">
              AI Interview Assistant 🤖
            </h1>
          </div>

          <div className="flex-1 min-h-0 mx-5 mb-5 rounded-2xl border border-slate-200 bg-white shadow-md flex flex-col p-4 gap-3">
            {/* progress */}
            <div className="shrink-0 flex items-center gap-3 text-xs text-slate-500">
              <span>
                Question {Math.min(Number(questionNumber) || 1, TOTAL_QUESTIONS)} of{" "}
                {TOTAL_QUESTIONS}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-violet-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="font-mono">⏱ {formatTime(elapsedSeconds)}</span>
            </div>

            {/* current question (text appears with the voice) */}
            <div className="shrink-0 min-h-[96px] rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-center text-[15px] leading-relaxed text-slate-900">
              {currentQuestion?.is_follow_up && (
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">
                  Follow-up question
                </div>
              )}
              Interviewer: "{questionText.slice(0, typedLength)}
              {typing ? "▍" : ""}"
            </div>

            {/* status + repeat */}
            <div className="shrink-0 flex justify-end items-center gap-2">
              {isListening && !isSpeaking && (
                <div className="flex items-center gap-2" role="status" aria-live="polite">
                  <span className="relative flex h-9 w-9 items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-violet-300/50 animate-ping" />
                    <span className="relative h-6 w-6 rounded-full bg-gradient-to-br from-violet-400 to-purple-700 shadow-[0_0_18px_6px_rgba(124,58,237,0.45)]" />
                  </span>
                  <span className="text-[11px] font-extrabold tracking-[0.2em] text-violet-600">
                    SPEAKING
                  </span>
                </div>
              )}
              <span className={`px-4 py-2 rounded-xl border text-sm font-semibold ${
                isSpeaking
                  ? "bg-violet-50 border-violet-200 text-violet-700"
                  : isListening
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}>
                {assistantStatus}
              </span>
            </div>

            <h3 className="shrink-0 text-slate-700 font-bold text-sm">
              Previous Questions:
            </h3>

            {/* transcript */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {previousMessages.map((m, i) =>
                m.role === "you" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900">
                      <b>You:</b> {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-slate-900">
                      <b>Interviewer:</b> {m.text}
                    </div>
                  </div>
                )
              )}

              <div ref={chatEndRef} />
            </div>

            {error && (
              <div className="shrink-0 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 text-xs">
                {error}
              </div>
            )}

            {/* follow-up offer OR typed answer */}
            {phase === "followup-confirmation" ? (
              <div className="shrink-0 space-y-3">
                <p className="text-sm text-slate-600 text-center">
                  Would you like a follow-up question?{" "}
                  {isSpeaking
                    ? "(AI is asking...)"
                    : isListening
                    ? '(Listening... say "yes" or "no")'
                    : '(Say "yes" or "no", or use the buttons)'}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={processing}
                    onClick={handleFollowUpYes}
                    className="py-3 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50"
                  >
                    {processing ? "Processing..." : "YES — Ask Follow-up"}
                  </button>

                  <button
                    disabled={processing}
                    onClick={handleFollowUpNo}
                    className="py-3 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-sm disabled:opacity-50"
                  >
                    NO — Next Question
                  </button>
                </div>
              </div>
            ) : (
              <div className="shrink-0 flex gap-2">
                <input
                  value={answer}
                  onChange={(event) => {
                    userEditedRef.current = true;
                    setAnswer(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      answer.trim() &&
                      !processing
                    ) {
                      submitAnswerWithText(answer);
                    }
                  }}
                  disabled={processing}
                  placeholder="Speak, or type your answer here..."
                  className="flex-1 px-4 py-3 rounded-md bg-slate-50 border border-slate-200 focus:border-slate-400 outline-none text-sm placeholder-slate-500 disabled:opacity-50"
                />

                <button
                  disabled={processing || (!answer.trim() && !isListening)}
                  onClick={() => submitAnswerWithText(answer)}
                  className="px-5 rounded-md bg-slate-300 hover:bg-slate-500 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {processing ? "..." : "Send"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}