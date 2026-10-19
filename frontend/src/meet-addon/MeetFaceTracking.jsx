
import { useEffect, useRef, useState } from "react";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";

const MODEL_URL = "/models/face_landmarker.task";
function distance(a, b) {
  if (!a || !b) return 0;

  return Math.sqrt(
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2
  );
}

function calculateEyeAspectRatio(top, bottom, left, right) {
  const horizontal = distance(left, right);

  if (!horizontal) return 0;

  return distance(top, bottom) / horizontal;
}

function calculateIrisPosition(irisPoints, leftCorner, rightCorner) {
  if (!irisPoints?.length || !leftCorner || !rightCorner) {
    return 0.5;
  }

  const center = irisPoints.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  center.x /= irisPoints.length;
  center.y /= irisPoints.length;

  const width = rightCorner.x - leftCorner.x;

  if (Math.abs(width) < 0.0001) return 0.5;

  return (center.x - leftCorner.x) / width;
}

export default function MeetFaceTracking() {
  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const frameRef = useRef(null);
  const lastDetectionRef = useRef(0);

  const [status, setStatus] = useState("Starting camera...");
  const [eyeStatus, setEyeStatus] = useState("Waiting for face");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let stream = null;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API unavailable. Use localhost or HTTPS.");
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;

        if (!video) throw new Error("Video element not found.");

        video.srcObject = stream;
        await video.play();

        setStatus("Loading face detection model...");

        const { FaceLandmarker, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);

        if (cancelled) return;

        const landmarker = await FaceLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numFaces: 2,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputFaceBlendshapes: true,
          }
        );

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setStatus("Model ready — looking for a face");

        function monitor() {
          if (cancelled) return;

          const currentVideo = videoRef.current;
          const currentLandmarker = landmarkerRef.current;
          const now = performance.now();

          if (
            currentVideo &&
            currentLandmarker &&
            currentVideo.readyState >= 2 &&
            !currentVideo.paused &&
            now - lastDetectionRef.current >= 100
          ) {
            lastDetectionRef.current = now;

            try {
              const result = currentLandmarker.detectForVideo(
                currentVideo,
                now
              );

              const faces = result.faceLandmarks || [];

              if (faces.length === 0) {
                setStatus("No face detected");
                setEyeStatus("Eyes unavailable");
              } else if (faces.length > 1) {
                setStatus("Multiple faces detected");
                setEyeStatus("Please keep one face in view");
              } else {
                const landmarks = faces[0];

                setStatus("Face detected");

                const leftEAR = calculateEyeAspectRatio(
                  landmarks[159],
                  landmarks[145],
                  landmarks[33],
                  landmarks[133]
                );

                const rightEAR = calculateEyeAspectRatio(
                  landmarks[386],
                  landmarks[374],
                  landmarks[362],
                  landmarks[263]
                );

                const averageEAR = (leftEAR + rightEAR) / 2;
                const eyesClosed = averageEAR < 0.16;

                const leftIris = landmarks.slice(468, 473);
                const rightIris = landmarks.slice(473, 478);

                if (leftIris.length && rightIris.length) {
                  const leftGaze = calculateIrisPosition(
                    leftIris,
                    landmarks[33],
                    landmarks[133]
                  );

                  const rightGaze = calculateIrisPosition(
                    rightIris,
                    landmarks[362],
                    landmarks[263]
                  );

                  const gaze = (leftGaze + rightGaze) / 2;

                  if (eyesClosed) {
                    setEyeStatus("Eyes closed");
                  } else if (gaze < 0.2 || gaze > 0.8) {
                    setEyeStatus("Looking away");
                  } else {
                    setEyeStatus("Eyes open — looking at screen");
                  }
                } else {
                  setEyeStatus(
                    eyesClosed ? "Eyes closed" : "Face detected; iris landmarks unavailable"
                  );
                }
              }
            } catch (err) {
              console.error("Face detection frame error:", err);
              setError(`Detection error: ${err.message || "Unknown error"}`);
            }
          }

          frameRef.current = requestAnimationFrame(monitor);
        }

        frameRef.current = requestAnimationFrame(monitor);
      } catch (err) {
        console.error("Face tracking initialization error:", err);

        if (!cancelled) {
          setStatus("Face tracking unavailable");
          setError(
            `${err.name || "Error"}: ${err.message || "Could not initialize face tracking."}`
          );
        }
      }
    }

    start();

    return () => {
      cancelled = true;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      landmarkerRef.current?.close();
      landmarkerRef.current = null;

      stream?.getTracks().forEach((track) => track.stop());

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "30px auto",
        padding: 20,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>AI Interview — Face & Eye Tracking</h1>

      <p><strong>Face status:</strong> {status}</p>
      <p><strong>Eye status:</strong> {eyeStatus}</p>

      {error && (
        <p
          role="alert"
          style={{
            color: "#b91c1c",
            background: "#fee2e2",
            padding: 12,
            borderRadius: 8,
            overflowWrap: "anywhere",
          }}
        >
          {error}
        </p>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          display: "block",
          width: "100%",
          maxWidth: 640,
          minHeight: 200,
          background: "#222",
          borderRadius: 12,
        }}
      />

      <p>
        This page tests your local camera. Google Meet add-on setup is a separate
        step; this page does not yet analyze other Meet participants.
      </p>
    </main>
  );
}
