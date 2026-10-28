import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import api from "../../../services/api";

/* ------------------------------------------------------------------
 * Connect an interviewer's own Gmail account. Candidate mails
 * (invitation, selected / rejected) are then sent FROM that Gmail.
 * ------------------------------------------------------------------ */
export default function GmailConnectCard({ onChange }) {
  const [params, setParams] = useSearchParams();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/google-oauth/status");
      setInfo(res.data);
    } catch (err) {
      setInfo({
        configured: true,
        connected: false,
        loadError: `Could not read /google-oauth/status (HTTP ${err?.response?.status || "no response"}). Restart the backend with the new code.`,
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Google sends the interviewer back here with ?gmail=connected|error
  useEffect(() => {
    const result = params.get("gmail");
    if (!result) return;

    if (result === "connected") {
      setMessage(`Gmail connected: ${params.get("email") || ""}`);
      setError("");
      load();
      onChange?.();
    } else {
      setError(params.get("reason") || "Could not connect Gmail.");
      setMessage("");
    }

    const next = new URLSearchParams(params);
    ["gmail", "email", "reason"].forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  }, [params, setParams, load, onChange]);

  const connect = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await api.get("/google-oauth/connect-url");
      window.location.href = res.data.url;
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not start Gmail connect.");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError("");
    try {
      await api.delete("/google-oauth/disconnect");
      setMessage("Gmail disconnected. Mails go from the system address again.");
      await load();
      onChange?.();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  };

  const connected = Boolean(info?.connected);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white backdrop-blur-xl shadow-lg p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-slate-800">Send candidate mails from my Gmail</p>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Invitation, selected and rejected mails are sent FROM the Google account you connect here.
        </p>

        <p className={`text-[11px] font-bold mt-2 ${connected ? "text-emerald-600" : "text-amber-700"}`}>
          {connected ? `Connected: ${info.email}` : "Not connected - mails go from the system address"}
        </p>

        {info?.loadError && <p className="text-[11px] text-rose-700 mt-1">{info.loadError}</p>}
        {info && !info.configured && (
          <p className="text-[11px] text-rose-700 mt-1">
            Server Gmail connection settings are incomplete. Configure the OAuth client keys, redirect URI, and FRONTEND_URL.
          </p>
        )}
        {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
        {message && <p className="text-xs text-emerald-600 mt-2">{message}</p>}
      </div>

      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={connect}
          disabled={busy || !info?.configured}
 className="px-5 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold shadow-md disabled:opacity-50"
        >
          {connected ? "Reconnect Gmail" : "Connect Gmail"}
        </button>

        {connected && (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-500/40 text-xs font-bold transition disabled:opacity-50"
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
