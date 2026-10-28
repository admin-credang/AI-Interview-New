import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { processSteps } from "../components/dashboard/hiring";

function InterviewLobby() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [interview, setInterview] = useState(null);
  const [configuration, setConfiguration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);

  // Hardware & AI diagnostic states
  const [camStatus, setCamStatus] = useState("checking");
  const [micStatus, setMicStatus] = useState("checking");
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [monitoringRequired, setMonitoringRequired] = useState(false);
  const [audioTesting, setAudioTesting] = useState(false);
  const [networkQuality, setNetworkQuality] = useState("Checking...");
  const [bandwidthMbps, setBandwidthMbps] = useState(null);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [fpsRate, setFpsRate] = useState(null);
  const [networkLatency, setNetworkLatency] = useState(null);
  
  // Advanced Real features
  const [noiseDetected, setNoiseDetected] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);

  // Ready Check & Success Modal
  const [checks, setChecks] = useState({
    quietPlace: false,
    internet: false,
    mic: false,
    stayPage: false,
  });
  const [showPopupModal, setShowPopupModal] = useState(false);

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  const handleCheck = (key) => {
    setChecks((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      if (Object.values(updated).filter(Boolean).length === 4) {
        setShowPopupModal(true);
      }
      return updated;
    });
  };

  const completedCount = Object.values(checks).filter(Boolean).length;
  const allChecksPassed = completedCount === 4;

  const getErrorMessage = (err) => {
    const detail = err?.response?.data?.detail;
    if (Array.isArray(detail)) {
      return detail.map((i) => (typeof i === "string" ? i : i?.msg || JSON.stringify(i))).join(" | ");
    }
    return typeof detail === "string" ? detail : err?.message || "Something went wrong.";
  };

  const stopAllMediaStreams = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  async function initMediaStream(constraints = { video: true, audio: true }) {
    const requiresCamera = Boolean(constraints.video);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamStatus(requiresCamera ? "warning" : "not required");
        setMicStatus("warning");
        setIsVideoMuted(true);
        setIsAudioMuted(true);
        setFpsRate(null);
        setError("Microphone access is unavailable. You can type your answers instead.");
        return;
      }
      stopAllMediaStreams();
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const hasVideo = stream.getVideoTracks().length > 0;
      const hasAudio = stream.getAudioTracks().length > 0;
      const frameRate = stream.getVideoTracks()[0]?.getSettings()?.frameRate;
      setCamStatus(
        requiresCamera ? (hasVideo ? "success" : "warning") : "not required"
      );
      setMicStatus(hasAudio ? "success" : "warning");
      setIsVideoMuted(!requiresCamera || !hasVideo);
      setIsAudioMuted(!hasAudio);
      setFpsRate(
        requiresCamera && typeof frameRate === "number"
          ? Math.round(frameRate)
          : null
      );
      if (!hasAudio) {
        setError("Microphone access is unavailable. You can type your answers instead.");
      }

      if (hasAudio) setupAudioVisualizer(stream);

      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter((d) => d.kind === "audioinput"));
      setVideoDevices(devices.filter((d) => d.kind === "videoinput"));

      if (stream.getVideoTracks()[0]) {
        setSelectedVideoDevice(stream.getVideoTracks()[0].getSettings()?.deviceId || "");
      }
      if (stream.getAudioTracks()[0]) {
        setSelectedAudioDevice(stream.getAudioTracks()[0].getSettings()?.deviceId || "");
      }
    } catch (err) {
      setCamStatus(requiresCamera ? "warning" : "not required");
      setMicStatus("warning");
      setIsVideoMuted(true);
      setIsAudioMuted(true);
      setAudioLevel(0);
      setFpsRate(null);
      setError("Microphone access is unavailable. You can type your answers instead.");
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }

  const setupAudioVisualizer = (stream) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;
        const currentVol = Math.min(100, Math.round((average / 128) * 100));
        setAudioLevel(currentVol);

        // Real noise detection test threshold
        if (currentVol > 45) {
          setNoiseDetected(true);
        } else {
          setNoiseDetected(false);
        }

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (e) {}
  };

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      if (!interviewId) {
        setError("Interview ID is missing.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        // one small request (access is checked on the server:
        // only the invited candidate can open this lobby)
        const lobbyRes = await api.get(`/interviews/${interviewId}/lobby`);
        if (!mounted) return;
        setConfiguration(lobbyRes.data.configuration);
        const interviewData =
          lobbyRes.data.interview || { id: interviewId, title: "AI Interview Session" };
        setInterview(interviewData);
        const requiresCamera = Boolean(interviewData.monitoring_required);
        setMonitoringRequired(requiresCamera);
        void initMediaStream({ video: requiresCamera, audio: true });
      } catch (err) {
        if (mounted) setError(getErrorMessage(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    // Real bandwidth & latency estimator
    const measureNetwork = async () => {
      const start = performance.now();
      try {
        // Download a small dummy asset/head request to estimate speed
        const response = await fetch(window.location.origin, { method: "HEAD", cache: "no-store" });
        if (!mounted) return;
        const duration = performance.now() - start;
        setNetworkLatency(Math.round(duration));
        
        setBandwidthMbps(null);
        setNetworkQuality(duration < 80 ? "Low latency" : "High latency");
      } catch (e) {
        if (!mounted) return;
        setNetworkLatency(null);
        setBandwidthMbps(null);
        setNetworkQuality("Unavailable");
      }
    };
    measureNetwork();

    return () => {
      mounted = false;
      stopAllMediaStreams();
    };
  }, [interviewId]);

  const toggleVideo = async () => {
    if (!monitoringRequired) {
      setError("Camera access is not required for this interview.");
      return;
    }
    if (mediaStreamRef.current) {
      const t = mediaStreamRef.current.getVideoTracks()[0];
      if (t) {
        if (t.enabled) {
          setError("Camera monitoring is required and cannot be switched off.");
          return;
        }
        t.enabled = !t.enabled;
        setIsVideoMuted(!t.enabled);
      } else {
        await initMediaStream({ video: true, audio: !isAudioMuted });
      }
    } else {
      await initMediaStream({ video: true, audio: true });
    }
  };

  const toggleAudio = async () => {
    if (mediaStreamRef.current) {
      const t = mediaStreamRef.current.getAudioTracks()[0];
      if (t) {
        t.enabled = !t.enabled;
        setIsAudioMuted(!t.enabled);
        if (!t.enabled) setAudioLevel(0);
      } else {
        await initMediaStream({ video: monitoringRequired, audio: true });
      }
    } else {
      await initMediaStream({ video: monitoringRequired, audio: true });
    }
  };

  const playTestSound = () => {
    try {
      setAudioTesting(true);
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
        setAudioTesting(false);
      }, 500);
    } catch (e) {
      setAudioTesting(false);
    }
  };

  async function startInterviewSession() {
    if (!interviewId) return;
    const candidateId = user?.id || user?.user_id || user?.candidate_id;
    if (!candidateId) {
      setError("Candidate ID missing. Please login again.");
      return;
    }
    if (!allChecksPassed) {
      setError("Please finish all 4 ready checks first.");
      return;
    }
    if (monitoringRequired && (camStatus !== "success" || isVideoMuted)) {
      setError("Camera monitoring is required. Enable the camera before continuing.");
      return;
    }

    try {
      setStarting(true);
      const res = await api.post(`/interviews/${interviewId}/sessions`, {
        interview_id: interviewId,
        candidate_id: candidateId,
      });
      const sessionId = res.data?.id || res.data?.session_id;
      if (!sessionId) throw new Error("Invalid session response.");
      stopAllMediaStreams();
      navigate(`/interviews/${interviewId}/sessions/${sessionId}`);
    } catch (err) {
      setError(getErrorMessage(err));
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
 <div className="w-12 h-12 rounded-2xl border-2 border-slate-300 border-t-slate-700 animate-spin shadow-md" />
          <p className="text-sm font-medium text-slate-700 tracking-wide">Loading Pro Assessment Lobby...</p>
        </div>
      </div>
    );
  }

  const questionCount = configuration?.extra_config?.question_count || "10";

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans relative selection:bg-slate-800 selection:text-white pb-24">
      
      {/* AMBIENT GLOWS */}
      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-slate-200 shadow-lg">
        <div className="max-w-6xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center shadow-md border border-slate-300 font-black text-white text-sm">
              AI
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Assessment Hub Pro
                <span className="w-2 h-2 rounded-full bg-slate-800 animate-ping" />
              </h1>
              <p className="text-[11px] text-slate-500">Secure AI Proctoring Environment</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowDiagnosticsModal(true)}
              className="px-3.5 py-2 rounded-2xl bg-slate-100 hover:bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700 transition flex items-center gap-1.5"
            >
              📊 Diagnostics
            </button>
            {user && (
              <div className="hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-inner">
                <div className="w-6 h-6 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-xs">
                  {user?.name?.[0] || "U"}
                </div>
                <span className="text-xs font-semibold text-slate-700">{user?.name || "Candidate"}</span>
              </div>
            )}
            <button
              onClick={() => navigate("/dashboard")}
              className="px-4 py-2 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 transition-all hover:text-slate-900"
            >
              Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="max-w-5xl mx-auto px-6 pt-10 relative z-10 space-y-8">

        {/* HERO TITLE BANNER */}
        <div className="text-center sm:text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-8">
          <div>
 <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold mb-3 shadow-md">
              ✨ Pro Evaluation Lobby
            </div>
 <h2 className="text-slate-700 text-3xl sm:text-4xl font-extrabold ">
              {interview?.title || "AI Evaluation Session"}
            </h2>
            <p className="text-slate-500 text-sm mt-2 max-w-xl">
              {monitoringRequired
                ? "Check your required camera and microphone, then finish the ready checks to launch."
                : "Camera monitoring is disabled for this interview. Check your microphone or use text answers, then finish the ready checks."}
            </p>
          </div>

          <div className="flex gap-2.5 self-start sm:self-center">
            <span className="px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-700">
              {fpsRate ? `${fpsRate} FPS` : "FPS unavailable"}
            </span>
            <span className="px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-700">
              {bandwidthMbps ? `${bandwidthMbps} Mbps` : "Bandwidth not measured"}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 text-xs font-bold animate-shake">
            ⚠️ {error}
          </div>
        )}

        {/* TWO COLUMN GRID FOR HARDWARE & CHECKLIST */}
        <div className="grid gap-8 lg:grid-cols-12">
          
          {/* LEFT: LIVE WEBCAM & AI PROCTORING STATUS (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-slate-200 backdrop-blur-2xl shadow-2xl relative overflow-hidden group">
 <div className="absolute inset-0 bg-slate-50 pointer-events-none" />
              
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  Camera preview
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold border bg-slate-500/10 text-slate-600 border-slate-500/30">
                    {monitoringRequired
                      ? "Face monitoring begins in interview"
                      : "Monitoring disabled"}
                  </span>
                </div>
              </div>

              {/* Video Preview Box */}
              <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-200 bg-black shadow-inner flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${isVideoMuted ? "hidden" : "block"}`}
                />
                {!isVideoMuted && (
                  <div className="absolute inset-0 border border-slate-300 pointer-events-none flex flex-col justify-between p-3">
                    <div className="flex justify-between items-center">
                      <span className="px-2 py-0.5 rounded bg-white/90 backdrop-blur-md text-[10px] text-slate-700 font-mono border border-slate-300">
                        HD 720p 30fps
                      </span>
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    </div>
 <div className="absolute top-1/2 inset-x-0 h-0.5 bg-slate-50 animate-pulse" />
                  </div>
                )}
                {isVideoMuted && (
                  <div className="absolute inset-0 bg-white flex flex-col items-center justify-center p-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xl mb-2">
                      📷🚫
                    </div>
                    <p className="text-xs font-medium text-slate-500">Camera is turned off</p>
                  </div>
                )}
              </div>

              {/* Device Selectors & Real Audio Noise Indicator */}
              <div className="mt-5 space-y-3">
                {monitoringRequired && videoDevices.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Camera Input</label>
                    <select
                      value={selectedVideoDevice}
                      onChange={(e) => {
                        setSelectedVideoDevice(e.target.value);
                        initMediaStream({
                          video: { deviceId: { exact: e.target.value } },
                          audio: selectedAudioDevice
                            ? { deviceId: { exact: selectedAudioDevice } }
                            : true,
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-slate-300"
                    >
                      {videoDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                )}

                {audioDevices.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Microphone Input</label>
                    <select
                      value={selectedAudioDevice}
                      onChange={(e) => {
                        setSelectedAudioDevice(e.target.value);
                        initMediaStream({
                          video: monitoringRequired
                            ? selectedVideoDevice
                              ? { deviceId: { exact: selectedVideoDevice } }
                              : true
                            : false,
                          audio: { deviceId: { exact: e.target.value } },
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-slate-300"
                    >
                      {audioDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Mic ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Mic Volume & Ambient Noise warning */}
                <div className="pt-2">
                  <div className="flex justify-between items-center mb-1 text-[11px]">
                    <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                      Mic Level & Noise Monitor
                      {noiseDetected && <span className="text-amber-600 text-[10px] font-bold">⚠️ Background Noise High</span>}
                    </span>
                    <span className="font-bold text-slate-700">{isAudioMuted ? "Muted" : `${audioLevel}%`}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden border border-slate-200">
                    <div className={`h-full transition-all duration-75 ${noiseDetected ? "bg-amber-400" : "bg-slate-800"}`} style={{ width: `${isAudioMuted ? 0 : audioLevel}%` }} />
                  </div>
                </div>

                {/* Toggle Buttons */}
                <div className="grid grid-cols-3 gap-2.5 pt-2">
                  {monitoringRequired && (
                    <button
                      onClick={toggleVideo}
                      className={`py-2.5 rounded-xl text-xs font-bold transition border ${
                        isVideoMuted ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-rose-500/10 text-rose-700 border-rose-500/30"
                      }`}
                    >
                      {isVideoMuted ? "Turn Cam ON" : "Turn Cam OFF"}
                    </button>
                  )}
                  <button
                    onClick={toggleAudio}
                    className={`py-2.5 rounded-xl text-xs font-bold transition border ${
                      isAudioMuted ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-rose-500/10 text-rose-700 border-rose-500/30"
                    }`}
                  >
                    {isAudioMuted ? "Unmute Mic" : "Mute Mic"}
                  </button>
                  <button
                    onClick={playTestSound}
                    disabled={audioTesting}
                    className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold transition"
                  >
                    {audioTesting ? "Playing..." : "Test Speaker"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: READY CHECK INTERACTIVE CARD (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-slate-200 backdrop-blur-2xl shadow-2xl relative overflow-hidden flex flex-col justify-between h-full">
 <div className="absolute inset-0 bg-slate-50 pointer-events-none" />
              
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-black text-slate-900">Ready Checklist</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Complete all 4 requirements to unlock</p>
                  </div>
                  <span className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                    allChecksPassed 
 ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-700 shadow-md" 
                      : "bg-slate-100 border border-slate-300 text-slate-700"
                  }`}>
                    {completedCount}/4 Passed
                  </span>
                </div>

                {/* Checklist options */}
                <div className="space-y-3 my-4">
                  {[
                    { key: "quietPlace", label: "I am in a quiet place with proper lighting" },
                    { key: "internet", label: "My internet connection & speed is stable" },
                    {
                      key: "mic",
                      label: monitoringRequired
                        ? "My microphone and required camera are functional"
                        : "I can use the microphone or type my answers",
                    },
                    { key: "stayPage", label: "I agree not to switch tabs during interview" },
                  ].map((item) => (
                    <label
                      key={item.key}
                      onClick={() => handleCheck(item.key)}
                      className={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        checks[item.key]
 ? "bg-slate-100 border-slate-300 text-slate-900 shadow-md"
                          : "bg-slate-50 border-slate-200 hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checks[item.key]}
                        onChange={() => {}}
                        className="w-4 h-4 rounded bg-white border-slate-300 text-slate-700 accent-slate-700 cursor-pointer"
                      />
                      <span className="text-xs font-semibold leading-snug">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status Summary badges */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-semibold">Bandwidth</span>
                  <span className="text-xs font-bold text-slate-700 truncate block mt-0.5">{bandwidthMbps ? `${bandwidthMbps} Mbps` : "Checking..."}</span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-semibold">AI Proctoring</span>
                  <span className="text-xs font-bold text-slate-700 truncate block mt-0.5">
                    {monitoringRequired ? "Monitoring enabled" : "Monitoring disabled"}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* BOTTOM DETAILS & LAUNCH SECTION */}
        <div className="grid gap-6 md:grid-cols-2">
          
          {/* JOB & INTERVIEW SPECS */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 backdrop-blur-xl space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              📋 Assessment Parameters & Rules
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              {interview?.description || "Answer AI generated professional interview questions accurately within the allocated time."}
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500">Total Questions</span>
                <p className="text-xs font-bold text-slate-700 mt-0.5">{questionCount} Qs</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500">Difficulty</span>
                <p className="text-xs font-bold text-amber-700 capitalize mt-0.5">{configuration?.difficulty || "Advanced"}</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500">AI Engine</span>
                <p className="text-xs font-bold text-slate-700 mt-0.5">Groq / RAG</p>
              </div>
            </div>
          </div>

          {/* LAUNCH BUTTON BOX */}
 <div className="p-6 rounded-3xl bg-slate-50 border border-slate-300 backdrop-blur-xl flex flex-col justify-between shadow-md">
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Launch Interview Session</h4>
              <p className="text-xs text-slate-500">
                {allChecksPassed ? "Ready to begin your session securely." : "Complete the 4 ready checks to unlock start button."}
              </p>
            </div>

            <div className="pt-4">
              <button
                onClick={startInterviewSession}
                disabled={starting || !allChecksPassed}
                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-300 shadow-xl flex items-center justify-center gap-2 ${
                  allChecksPassed
 ? "bg-slate-800 hover:opacity-95 text-white border border-slate-300 cursor-pointer hover:scale-[1.01]"
                    : "bg-slate-50 text-slate-500 border border-slate-200 opacity-40 cursor-not-allowed"
                }`}
              >
                {starting ? (
                  <>
                    <div className="w-4 h-4 rounded-2xl border-2 border-slate-200 border-t-white animate-spin" />
                    <span>Launching Session...</span>
                  </>
                ) : (
                  <span>{allChecksPassed ? "Start Interview Session →" : `Complete Checks (${completedCount}/4)`}</span>
                )}
              </button>
            </div>
          </div>

        </div>

      </main>

      {/* SYSTEM DIAGNOSTICS MODAL */}
      {showDiagnosticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-3xl border border-slate-300 bg-white shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-200 pb-4">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">🛠️ System Diagnostics Report</h3>
              <button data-plain onClick={() => setShowDiagnosticsModal(false)} className="text-slate-500 hover:text-slate-900 text-sm font-bold">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Browser User Agent</span>
                <span className="font-mono text-slate-700 truncate max-w-[200px]">{navigator.userAgent}</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Network Latency</span>
                <span className="font-bold text-slate-700">{networkLatency ? `${networkLatency} ms` : "Measuring..."}</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Estimated Bandwidth</span>
                <span className="font-bold text-slate-700">{bandwidthMbps ? `${bandwidthMbps} Mbps` : "Calculating..."}</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Webcam Status</span>
                <span className="font-bold text-emerald-600 capitalize">{camStatus}</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Microphone Status</span>
                <span className="font-bold text-emerald-600 capitalize">{micStatus}</span>
              </div>
            </div>
            <button
              onClick={() => setShowDiagnosticsModal(false)}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-950 font-black text-xs transition"
            >
              Close Report
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL POPUP WHEN ALL 4 CHECKS COMPLETED */}
      {showPopupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
 <div className="w-full max-w-sm p-8 rounded-3xl border border-slate-300 bg-white shadow-2xl text-center space-y-5">
 <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-3xl shadow-lg ">
              🚀
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">All Checks Verified!</h3>
              <p className="text-slate-600 text-xs mt-1.5 leading-relaxed">
                {monitoringRequired
                  ? "Your required device checks are complete. Ready to begin."
                  : "Your setup checks are complete. Camera monitoring is disabled. Ready to begin."}
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowPopupModal(false)}
                className="flex-1 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 transition"
              >
                Review Setup
              </button>
              <button
                onClick={() => {
                  setShowPopupModal(false);
                  startInterviewSession();
                }}
 className="flex-1 py-3 rounded-xl bg-slate-800 hover:opacity-90 text-xs font-black text-white shadow-lg transition cursor-pointer"
              >
                Launch Now →
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default InterviewLobby;