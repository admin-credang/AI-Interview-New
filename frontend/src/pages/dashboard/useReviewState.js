import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import api from "../../services/api";
import { loadCandidateDetailPage } from "../../services/prefetch";
import { downloadCsv } from "../../components/dashboard/hiring";

// Review state (candidates + decisions) for ONE interview.
// Moved out of the old Candidates page, which was removed.
// Used by Interview Controls.
export function useReviewState(embeddedInterviewId = "", enabled = true) {
  const embedded = Boolean(embeddedInterviewId);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Interview Controls passes the interview id
  // -> only the candidates of THAT interview are loaded and shown.
  const scopeId = embeddedInterviewId || searchParams.get("interview") || "";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tab, setTab] = useState("all");
  const [interviewId, setInterviewId] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [openId, setOpenId] = useState("");
  const [nonce, setNonce] = useState(0);
  const reload = () => setNonce((n) => n + 1);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    setLoading(true);
    setError("");
    setInterviewId("all");

    api
      .get("/hiring/candidates", {
        params: scopeId ? { interview_id: scopeId } : undefined,
      })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.detail || "Could not load candidates.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scopeId, enabled, nonce]);

  // download the candidate page code in the background, so the
  // first click on a candidate does not wait for it
  useEffect(() => {
    const id = window.setTimeout(() => {
      loadCandidateDetailPage().catch(() => {});
    }, 300);

    return () => window.clearTimeout(id);
  }, []);

  const candidates = data?.candidates || [];
  const summary = data?.summary || {};
  const scope = data?.interview || null;

  const openCandidate = (sessionId) =>
    navigate(`/dashboard/candidates/${sessionId}`, {
      state: {
        back: embedded
          ? `/dashboard/controls?interview=${embeddedInterviewId}`
          : `${location.pathname}${location.search}`,
      },
    });

  const interviewOptions = useMemo(() => {
    const map = new Map();
    candidates.forEach((c) => map.set(c.interview_id, c.interview_title));
    return [...map.entries()];
  }, [candidates]);

  // rank among everyone with a score (1 = best)
  const rankMap = useMemo(() => {
    const scored = candidates
      .filter((c) => c.score !== null)
      .sort((a, b) => b.score - a.score);

    const map = {};
    scored.forEach((c, i) => {
      map[c.session_id] = i + 1;
    });
    return map;
  }, [candidates]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = candidates.filter((c) => {
      if (tab !== "all" && c.decision !== tab) return false;
      if (interviewId !== "all" && c.interview_id !== interviewId) return false;
      if (!q) return true;

      return (
        c.candidate.name?.toLowerCase().includes(q) ||
        c.candidate.email?.toLowerCase().includes(q) ||
        c.interview_title?.toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered];

    if (sort === "score_desc") {
      sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    } else if (sort === "score_asc") {
      sorted.sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
    } else if (sort === "name") {
      sorted.sort((a, b) => a.candidate.name.localeCompare(b.candidate.name));
    }

    return sorted;
  }, [candidates, tab, interviewId, query, sort]);

  const exportCsv = () => {
    downloadCsv("candidates.csv", [
      ["Name", "Email", "Interview", "Status", "Score", "Rank", "Decision", "Monitoring", "Date", "Duration (s)"],
      ...list.map((c) => [
        c.candidate.name,
        c.candidate.email,
        c.interview_title,
        c.session_status,
        c.score === null ? "" : Math.round(c.score),
        rankMap[c.session_id] || "",
        c.decision,
        !c.proctoring.required ? "not required" : c.proctoring.flagged ? "flagged" : "clean",
        c.ended_at || c.started_at || "",
        c.duration_seconds ?? "",
      ]),
    ]);
  };

  return {
    openId,
    setOpenId,
    reload,
    embedded,
    scopeId,
    scope,
    loading,
    error,
    candidates,
    summary,
    tab,
    setTab,
    interviewId,
    setInterviewId,
    query,
    setQuery,
    sort,
    setSort,
    list,
    rankMap,
    interviewOptions,
    exportCsv,
    openCandidate,
    navigate,
    setSearchParams,
  };
}

