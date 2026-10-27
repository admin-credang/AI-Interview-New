/*
 * Records the candidate's whole spoken answer as audio so the server can
 * transcribe it word for word. The browser's live speech recognition is
 * only used for the on-screen preview; the saved answer comes from here.
 */
import api from "../api";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

export function canRecordAudio() {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMimeType() {
  for (const type of MIME_CANDIDATES) {
    try {
      if (window.MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function createAnswerRecorder() {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let mimeType = "";
  let starting = null;

  const releaseStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      stream = null;
    }
  };

  const isActive = () => !!recorder && recorder.state !== "inactive";

  const start = async () => {
    if (isActive()) {
      return true;
    }
    if (starting) {
      return starting;
    }

    starting = (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        mimeType = pickMimeType();
        chunks = [];

        recorder = new window.MediaRecorder(
          stream,
          mimeType
            ? { mimeType, audioBitsPerSecond: 64000 }
            : { audioBitsPerSecond: 64000 }
        );

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        // 1 s slices: nothing is lost if the tab closes mid-answer
        recorder.start(1000);
        return true;
      } catch (error) {
        console.warn("Answer recording could not start:", error);
        releaseStream();
        recorder = null;
        return false;
      } finally {
        starting = null;
      }
    })();

    return starting;
  };

  /** Stops recording and returns the audio Blob (or null). */
  const stop = () =>
    new Promise((resolve) => {
      if (!recorder) {
        releaseStream();
        resolve(null);
        return;
      }

      const current = recorder;

      const finish = () => {
        const type = mimeType || current.mimeType || "audio/webm";
        const blob = chunks.length ? new Blob(chunks, { type }) : null;
        chunks = [];
        recorder = null;
        releaseStream();
        resolve(blob);
      };

      if (current.state === "inactive") {
        finish();
        return;
      }

      current.onstop = finish;

      try {
        // flush the last partial slice so the final words are included
        current.requestData();
      } catch {
        /* ignore */
      }

      try {
        current.stop();
      } catch {
        finish();
      }
    });

  const cancel = () => {
    try {
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
    } catch {
      /* ignore */
    }
    chunks = [];
    recorder = null;
    releaseStream();
  };

  return { start, stop, cancel, isActive };
}

/** Sends one recorded answer to the server; returns the transcript. */
export async function transcribeAnswer(interviewId, blob) {
  if (!blob || blob.size < 1200) {
    return "";
  }

  const extension = blob.type.includes("ogg")
    ? "ogg"
    : blob.type.includes("mp4")
    ? "mp4"
    : "webm";

  const form = new FormData();
  form.append("audio", blob, `answer.${extension}`);

  const response = await api.post(
    `/interviews/${interviewId}/transcribe`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    }
  );

  return String(response?.data?.text || "").trim();
}
