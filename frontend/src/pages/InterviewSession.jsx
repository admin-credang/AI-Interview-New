import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";


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
    useState("loading");

  const [
    currentQuestion,
    setCurrentQuestion,
  ] = useState(null);

  const [
    questionNumber,
    setQuestionNumber,
  ] = useState(1);

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
    autoSubmitVoice,
    setAutoSubmitVoice,
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
    });

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
   * REFS
   * ============================================================
   */

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

  const recognitionRef =
    useRef(null);

  const streamRef =
    useRef(null);

  const videoRef =
    useRef(null);

  const speechGenerationRef =
    useRef(0);

  const submitAnswerRef =
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

  /*
   * ============================================================
   * TERMINATION REF
   * ============================================================
   */

  const terminateInterviewRef =
    useRef(null);

  /*
   * ============================================================
   * STOP MEDIA
   * ============================================================
   */

  const stopMedia =
    useCallback(() => {
      /*
       * Stop speech recognition
       */
      if (
        recognitionRef.current
      ) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

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
      window.speechSynthesis?.cancel();

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
    }, []);

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

        terminateInterviewRef.current?.(
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

  const speakQuestion =
    useCallback(
      (text) => {
        if (
          !text ||
          !window.speechSynthesis
        ) {
          return;
        }

        speechGenerationRef.current +=
          1;

        const generation =
          speechGenerationRef.current;

        window.speechSynthesis.cancel();

        const utterance =
          new SpeechSynthesisUtterance(
            text
          );

        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onstart = () => {
          if (
            mountedRef.current &&
            generation ===
              speechGenerationRef.current
          ) {
            setIsSpeaking(true);
          }
        };

        utterance.onend = () => {
          if (
            mountedRef.current &&
            generation ===
              speechGenerationRef.current
          ) {
            setIsSpeaking(false);
          }
        };

        utterance.onerror = () => {
          if (
            mountedRef.current &&
            generation ===
              speechGenerationRef.current
          ) {
            setIsSpeaking(false);
          }
        };

        window.speechSynthesis.speak(
          utterance
        );
      },
      []
    );

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

        setAnswer("");

        setLastAnswer("");

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

      stopMedia();

      setProcessing(false);

      setPhase("completed");

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
         * FOLLOW-UP CONFIRMATION
         */

        if (
          followUpRequired &&
          (
            nextAction ===
              "ask_follow_up_confirmation" ||
            nextAction ===
              "follow_up_confirmation"
          )
        ) {
          const generatedFollowUp =
            extractFollowUpQuestion(
              data,
              parameters
            );

          if (!generatedFollowUp) {
            setError(
              "Follow-up question was not received from server."
            );

            setProcessing(false);

            return;
          }

          setFollowUpQuestion(
            generatedFollowUp
          );

          setFollowUpConfirmation(
            true
          );

          setProcessing(false);

          setPhase(
            "followup-confirmation"
          );

          return;
        }

        /*
         * DIRECT FOLLOW-UP
         */

        if (
          nextAction ===
            "follow_up" ||
          nextAction ===
            "followup"
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

  useEffect(() => {
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

        const cleanAnswer =
          String(
            answerText || ""
          ).trim();

        if (!cleanAnswer) {
          setError(
            "Please provide an answer before submitting."
          );

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

        setLastAnswer(
          cleanAnswer
        );

        if (
          recognitionRef.current
        ) {
          try {
            recognitionRef.current.stop();
          } catch {}
        }

        window.speechSynthesis?.cancel();

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
        interviewId,
        sessionId,
        handleDialogflowResponse,
      ]
    );

  submitAnswerRef.current =
    submitAnswerWithText;

  phaseRef.current = phase;

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
      setVoiceSupported(false);
      return;
    }

    setVoiceSupported(true);

    const recognition =
      new SpeechRecognition();

    recognition.continuous = false;
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

      if (
        transcript &&
        mountedRef.current
      ) {
        setAnswer(transcript);
      }

      const lastResult =
        event.results[
          event.results.length - 1
        ];

      if (
        lastResult?.isFinal &&
        autoSubmitVoice &&
        transcript
      ) {
        setTimeout(() => {
          if (
            mountedRef.current &&
            !processingRef.current &&
            !completedRef.current &&
            !terminatedRef.current
          ) {
            submitAnswerRef.current?.(
              transcript
            );
          }
        }, 300);
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

      // Candidate stayed silent during the follow-up offer:
      // listen again a few times.
      if (
        mountedRef.current &&
        phaseRef.current ===
          "followup-confirmation" &&
        !processingRef.current &&
        !terminatedRef.current &&
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
  }, [autoSubmitVoice]);

  /*
   * ============================================================
   * START LISTENING
   * ============================================================
   */

  const startListening =
    () => {
      if (
        !recognitionRef.current ||
        processingRef.current ||
        completedRef.current ||
        terminatedRef.current
      ) {
        return;
      }

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
  const speakThen =
    (text, onDone) => {
      if (
        !window.speechSynthesis
      ) {
        onDone?.();
        return;
      }

      speechGenerationRef.current += 1;
      const generation =
        speechGenerationRef.current;

      try {
        recognitionRef.current?.stop();
      } catch {}

      window.speechSynthesis.cancel();

      const utterance =
        new SpeechSynthesisUtterance(
          text
        );

      utterance.rate = 0.95;

      utterance.onstart = () => {
        if (mountedRef.current) {
          setIsSpeaking(true);
        }
      };

      const finish = () => {
        if (!mountedRef.current) {
          return;
        }

        setIsSpeaking(false);

        if (
          generation ===
          speechGenerationRef.current
        ) {
          onDone?.();
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      window.speechSynthesis.speak(
        utterance
      );
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
  }, [cameraEnabled]);

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

        setPolicy({
          loaded: true,
          enabled,
          face,
          eye,
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
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
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

              outputFaceBlendshapes:
                false,

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
              terminateInterviewRef.current?.(
                "no_face_detected"
              );

              return;
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
              terminateInterviewRef.current?.(
                "multiple_faces_detected"
              );

              return;
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
                terminateInterviewRef.current?.(
                  "eyes_closed"
                );

                return;
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

            /*
             * Looking away threshold
             */

            const lookingAway =
              averageGaze < 0.20 ||
              averageGaze > 0.80;

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
                terminateInterviewRef.current?.(
                  "looking_away"
                );

                return;
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
    };
  }, [
    cameraEnabled,
    faceDetectionEnabled,
    eyeGazeEnabled,
    monitoringReady,
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

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center relative overflow-hidden font-sans">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-2xl p-10 rounded-3xl text-center max-w-sm shadow-2xl relative z-10">
          <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-6" />

          <h2 className="text-xl font-bold text-white mb-2">
            Preparing Session
          </h2>

          <p className="text-xs text-slate-400 font-mono">
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-900/80 border border-rose-500/30 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl space-y-4">
          <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center font-bold text-xl">
            ⚠️
          </div>

          <h2 className="text-xl font-bold text-white">
            Interview Error
          </h2>

          <p className="text-slate-300 text-sm leading-relaxed">
            {error}
          </p>

          <button
            onClick={() =>
              window.location.reload()
            }
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-all cursor-pointer border border-slate-700"
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/80 border border-rose-500/30 backdrop-blur-2xl p-8 rounded-3xl text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-2xl flex items-center justify-center text-3xl mx-auto">
            ⚠
          </div>

          <h1 className="text-2xl font-bold text-white">
            Interview Ended
          </h1>

          <p className="text-slate-400 text-sm leading-relaxed">
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="max-w-md w-full bg-slate-900/80 border border-emerald-500/30 backdrop-blur-2xl p-8 rounded-3xl text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center text-3xl mx-auto">
            ✓
          </div>

          <h1 className="text-2xl font-bold text-white">
            Thank You for the Interview!
          </h1>

          <p className="text-slate-300 text-base font-semibold">
            Your interview is completed.
          </p>

          <p className="text-slate-400 text-sm leading-relaxed">
            Your answers were submitted successfully and will be reviewed by the interviewer.
          </p>

          <div className="text-left rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300 space-y-2">
            <p>
              <b className="text-emerald-300">Selected?</b> Our team will contact you.
            </p>
            <p>
              <b className="text-slate-100">Not selected?</b> You will receive an email.
            </p>
            <p className="text-xs text-slate-500">
              A confirmation email is on its way to you now.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="w-full py-3 rounded-2xl font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition"
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-between p-3 md:p-6 relative overflow-hidden">

      {/* BACKGROUND */}

      <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-600/20 blur-[130px] rounded-full pointer-events-none" />

      <div className="absolute top-1/3 right-0 w-96 h-96 bg-fuchsia-600/15 blur-[140px] rounded-full pointer-events-none" />

      <div className="absolute bottom-0 left-1/3 w-[500px] h-[500px] bg-cyan-600/15 blur-[150px] rounded-full pointer-events-none" />

      {/* CAMERA REQUIRED (only when the interviewer turned monitoring on) */}

      {policy.loaded &&
        policy.enabled &&
        !cameraEnabled && (
          <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
              <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-2xl flex items-center justify-center text-3xl mx-auto">
                📷
              </div>

              <h2 className="text-xl font-bold text-white">
                Camera required
              </h2>

              <p className="text-sm text-slate-400 leading-relaxed">
                {cameraBlocked
                  ? "The interviewer requires camera monitoring for this interview. Please allow camera access in your browser, then try again."
                  : "Starting your camera. Please allow access if your browser asks."}
              </p>

              {cameraBlocked && (
                <button
                  type="button"
                  onClick={startMonitoring}
                  className="w-full py-3 rounded-2xl font-bold text-white bg-gradient-to-r from-rose-600 to-fuchsia-600 hover:opacity-90 transition"
                >
                  Allow camera and continue
                </button>
              )}
            </div>
          </div>
        )}

      {/* SHELL */}

      <div className="w-full max-w-7xl mx-auto flex-1 bg-slate-900/60 backdrop-blur-3xl border border-slate-800/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative z-10">

        {/* HEADER */}

        <header className="h-20 px-6 md:px-8 border-b border-slate-800/70 bg-slate-950/40 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-fuchsia-500 flex items-center justify-center font-black text-white text-xl">
              AI
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-bold text-base md:text-lg text-white">
                  Interview Session
                </h1>

                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-wider">
                  Live
                </span>
              </div>

              <p className="text-xs text-slate-400 hidden sm:block font-mono mt-0.5">
                Session ID:{" "}
                {sessionId ||
                  "ACTIVE"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-mono text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />

              <span>
                ⏱{" "}
                {formatTime(
                  elapsedSeconds
                )}
              </span>
            </div>
          </div>
        </header>

        {/* PROGRESS */}

        <div className="px-6 md:px-8 py-3 bg-slate-950/40 border-b border-slate-800/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <span className="text-fuchsia-400 font-bold">
              Progress
            </span>

            <span>•</span>

            <span>
              Question{" "}
              {questionNumber}
            </span>
          </div>

          <div className="flex-1 max-w-md h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800/60">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 transition-all duration-500 rounded-full"
              style={{
                width: `${
                  (Math.min(
                    Number(
                      questionNumber
                    ) || 1,
                    5
                  ) /
                    5) *
                  100
                }%`,
              }}
            />
          </div>

          <span className="text-xs font-mono font-bold text-slate-300">
            {Math.round(
              (Math.min(
                Number(
                  questionNumber
                ) || 1,
                5
              ) /
                5) *
                100
            )}
            %
          </span>
        </div>

        {/* MAIN */}

        <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">

          {/* LEFT */}

          <section className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-slate-950/20 p-6 flex flex-col justify-between gap-6">

            {/* AI */}

            <div className="flex-1 flex flex-col items-center justify-center text-center relative py-6">
              <div
                className={`absolute w-56 h-56 rounded-full blur-3xl pointer-events-none ${
                  isSpeaking
                    ? "bg-fuchsia-500/25 scale-125"
                    : isListening
                    ? "bg-cyan-500/25 scale-110"
                    : "bg-indigo-500/10 scale-95"
                }`}
              />

              <div className="relative w-36 h-36 md:w-44 md:h-44 mb-4">
                <div
                  className={`absolute inset-0 rounded-3xl border-2 ${
                    isSpeaking
                      ? "border-fuchsia-500 animate-pulse"
                      : isListening
                      ? "border-cyan-400 animate-pulse"
                      : "border-slate-800"
                  }`}
                />

                <div className="absolute inset-2 rounded-2xl bg-gradient-to-b from-slate-800 to-slate-950 border border-slate-700/70 flex items-center justify-center text-5xl md:text-6xl">
                  🤖
                </div>

                <div className="absolute -bottom-2 -right-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isSpeaking
                        ? "bg-fuchsia-400 animate-pulse"
                        : isListening
                        ? "bg-cyan-400 animate-pulse"
                        : "bg-emerald-400"
                    }`}
                  />

                  <span>
                    {isSpeaking
                      ? "Speaking"
                      : isListening
                      ? "Listening"
                      : "Active"}
                  </span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-white">
                AI Evaluator
              </h3>

              <p className="text-xs text-slate-400 mt-0.5">
                Technical Interview Console
              </p>
            </div>

            {/* MONITORING (required by the interviewer, cannot be switched off) */}

            {policy.enabled && (
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 relative overflow-hidden backdrop-blur-xl">

              {/* TITLE */}

              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Interview Monitoring
                  </span>

                  <p className="text-[10px] text-slate-600 mt-1">
                    Required by the interviewer for this interview.
                  </p>
                </div>

                <div
                  className={`px-2.5 py-1 rounded-lg border text-[9px] font-bold ${
                    cameraEnabled ||
                    faceDetectionEnabled ||
                    eyeGazeEnabled
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-slate-800 text-slate-500 border-slate-700"
                  }`}
                >
                  {cameraEnabled ||
                  faceDetectionEnabled ||
                  eyeGazeEnabled
                    ? "ACTIVE"
                    : "OFF"}
                </div>
              </div>

              {/* CAMERA PREVIEW */}

              {cameraEnabled && (
                <div className="mt-3">
                  <div className="w-full h-32 md:h-36 bg-black rounded-xl border border-slate-800 overflow-hidden relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={(
                        event
                      ) => {
                        event.currentTarget
                          .play()
                          .catch(
                            () => {}
                          );
                      }}
                      className="w-full h-full object-cover"
                    />

                    <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/60 text-[8px] text-white">
                      CAMERA ON
                    </div>

                    {monitoringReady && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-emerald-500/80 text-[8px] text-white font-bold">
                        AI READY
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STATUS */}

              <div className="grid grid-cols-2 gap-2 mt-3">

                <div className="px-2.5 py-2 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-[8px] text-slate-500 uppercase">
                    Face
                  </div>

                  <div
                    className={`text-[9px] font-semibold mt-1 ${
                      faceStatus ===
                      "Face detected"
                        ? "text-emerald-400"
                        : faceDetectionEnabled
                        ? "text-amber-400"
                        : "text-slate-500"
                    }`}
                  >
                    {faceStatus}
                  </div>
                </div>

                <div className="px-2.5 py-2 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-[8px] text-slate-500 uppercase">
                    Eye / Gaze
                  </div>

                  <div
                    className={`text-[9px] font-semibold mt-1 ${
                      eyeStatus ===
                        "Eyes focused" ||
                      eyeStatus ===
                        "Eyes open"
                        ? "text-emerald-400"
                        : eyeGazeEnabled
                        ? "text-amber-400"
                        : "text-slate-500"
                    }`}
                  >
                    {eyeStatus}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[8px] text-slate-600 leading-relaxed">
                Keep your face visible and stay on this page. Leaving the page ends the interview.
              </div>
            </div>
            )}
          </section>

          {/* RIGHT */}

          <section className="lg:col-span-7 p-6 md:p-8 flex flex-col justify-between bg-slate-900/20">

            {phase ===
            "followup-confirmation" ? (
              <div className="space-y-6 my-auto">

                <div className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Follow-up Opportunity
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-white">
                    Would you like a follow-up question?
                  </h2>

                  <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
                    The AI evaluation system identified that your response can be explored further.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-300 text-sm flex items-center gap-3">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isListening
                        ? "bg-emerald-400 animate-ping"
                        : isSpeaking
                        ? "bg-indigo-400 animate-pulse"
                        : "bg-slate-600"
                    }`}
                  />
                  {isSpeaking
                    ? "AI is asking..."
                    : isListening
                    ? "Listening... say \"yes\" or \"no\""
                    : "Say \"yes\" or \"no\", or use the buttons below."}
                </div>
                {error && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <button
                    disabled={
                      processing
                    }
                    onClick={
                      handleFollowUpYes
                    }
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs md:text-sm disabled:opacity-50"
                  >
                    {processing
                      ? "Processing..."
                      : "YES — Ask Follow-up"}
                  </button>

                  <button
                    disabled={
                      processing
                    }
                    onClick={
                      handleFollowUpNo
                    }
                    className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs md:text-sm border border-slate-700 disabled:opacity-50"
                  >
                    NO — Next Question
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* QUESTION */}

                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <span
                      className={`text-[11px] font-bold tracking-wider uppercase px-3 py-1 rounded-md border ${
                        currentQuestion?.is_follow_up
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                      }`}
                    >
                      {currentQuestion?.is_follow_up
                        ? "Follow-up Question"
                        : "Main Question"}
                    </span>

                    {currentQuestion?.category && (
                      <span className="text-xs font-mono text-slate-400">
                        {
                          currentQuestion.category
                        }
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl md:text-2xl font-semibold text-white leading-relaxed">
                    {
                      currentQuestion?.question
                    }
                  </h2>
                </div>

                {/* ANSWER */}

                <div className="mt-6 pt-6 border-t border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Your Answer
                    </label>

                    <span className="text-[11px] text-slate-500 font-mono">
                      Characters:{" "}
                      {answer.length}
                    </span>
                  </div>

                  <textarea
                    value={answer}
                    onChange={(
                      event
                    ) =>
                      setAnswer(
                        event.target
                          .value
                      )
                    }
                    disabled={
                      processing
                    }
                    placeholder="Type your answer here..."
                    rows={6}
                    className="w-full p-4 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 text-sm md:text-base leading-relaxed outline-none resize-none disabled:opacity-50"
                  />

                  {error && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                      {error}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">

                    <div className="flex items-center gap-2">
                      {voiceSupported && (
                        <>
                          {!isListening ? (
                            <button
                              disabled={
                                processing
                              }
                              onClick={
                                startListening
                              }
                              className="px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-cyan-300 border border-slate-700/80 text-xs font-semibold disabled:opacity-50"
                            >
                              🎤 Speak
                            </button>
                          ) : (
                            <button
                              onClick={
                                stopListening
                              }
                              className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold animate-pulse"
                            >
                              ⏹ Stop
                            </button>
                          )}

                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none ml-1">
                            <input
                              type="checkbox"
                              checked={
                                autoSubmitVoice
                              }
                              onChange={(
                                event
                              ) =>
                                setAutoSubmitVoice(
                                  event
                                    .target
                                    .checked
                                )
                              }
                              className="w-3.5 h-3.5"
                            />

                            Auto submit voice
                          </label>
                        </>
                      )}
                    </div>

                    <button
                      disabled={
                        processing ||
                        !answer.trim()
                      }
                      onClick={() =>
                        submitAnswerWithText(
                          answer
                        )
                      }
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 text-white font-semibold text-xs md:text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {processing
                        ? "AI is evaluating..."
                        : currentQuestion?.is_follow_up
                        ? "Submit Follow-up Answer →"
                        : "Submit Answer →"}
                    </button>
                  </div>

                  {lastAnswer &&
                    processing && (
                      <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 text-[11px] text-slate-400">
                        <span className="font-semibold text-fuchsia-400">
                          Submitted:
                        </span>{" "}
                        {lastAnswer}
                      </div>
                    )}
                </div>
              </>
            )}
          </section>
        </main>

        {/* FOOTER */}

        <footer className="h-12 px-6 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            🔒
            <span>
              Secure Evaluation Session
            </span>
          </div>

          <div>
            {formatTime(
              elapsedSeconds
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}