// Meeting-platform helper for the AI Interview app (Zoom / Google Meet / Microsoft Teams).
// app.html?platform=zoom|meet|teams&meeting=<link>&name=&email=&role=
//  - fills the candidate details
//  - shows a banner with the right way to share the meeting for that platform
//  - "Open meeting" button (Zoom links open in the Zoom web client = a Chrome tab with tab audio)
(function () {
  "use strict";

  const PLATFORMS = {
    zoom: {
      name: "Zoom",
      color: "#2D8CFF",
      steps: [
        "Best: open the meeting in Chrome with <b>Open meeting (browser)</b> below, then press <b>Share meeting tab + audio</b> and pick that Zoom tab with <b>Share tab audio</b> ON.",
        "Using the Zoom desktop app instead? Share the <b>Zoom window</b> (button 1) and also <b>Entire screen + Also share system audio</b> (button 1b) so the candidate's voice is heard.",
        "In Zoom use <b>Speaker view</b> or <b>Pin</b> the candidate so their face is big. While anything is shared use <b>View → Side-by-side</b>.",
      ],
    },
    meet: {
      name: "Google Meet",
      color: "#00897B",
      steps: [
        "Google Meet runs in Chrome: press <b>Share meeting tab + audio</b>, pick the Meet tab and keep <b>Share tab audio</b> ON — that gives video and voice.",
        "<b>Pin</b> the candidate (⋮ on their tile → Pin) or use the <b>Spotlight</b> layout so their face is big.",
        "Keep the Meet tab open (not minimised) during the whole interview.",
      ],
    },
    teams: {
      name: "Microsoft Teams",
      color: "#5B5FC7",
      steps: [
        "Best: join in Chrome (<b>Continue on this browser</b>), then press <b>Share meeting tab + audio</b> and pick the Teams tab with <b>Share tab audio</b> ON.",
        "Using the Teams desktop app instead? Share the <b>Teams window</b> (button 1) and also <b>Entire screen + Also share system audio</b> (button 1b).",
        "<b>Pin</b> or <b>Spotlight</b> the candidate's video so their face is big; avoid Large gallery / Together mode.",
      ],
    },
  };

  // https://us05web.zoom.us/j/123?pwd=x  ->  https://us05web.zoom.us/wc/join/123?pwd=x
  function zoomWebLink(link) {
    try {
      const u = new URL(link);
      const m = u.pathname.match(/^\/j\/(\d+)/);
      if (/(^|\.)zoom\.us$/i.test(u.hostname) && m) return `${u.origin}/wc/join/${m[1]}${u.search}`;
    } catch (e) { /* not a URL */ }
    return link;
  }

  function safeLink(link) {
    try {
      const u = new URL(link);
      return u.protocol === "https:" ? u.href : "";
    } catch (e) {
      return "";
    }
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function run() {
    const q = new URLSearchParams(location.search);
    const fill = (id, v) => { const el = document.getElementById(id); if (el && v && !el.value) el.value = v.slice(0, 200); };
    fill("cname", q.get("name"));
    fill("cmail", q.get("email"));
    fill("crole", q.get("role"));

    const key = (q.get("platform") || "").toLowerCase();
    const p = PLATFORMS[key];
    if (!p) return;

    const meeting = safeLink(q.get("meeting") || "");
    const open = meeting ? (key === "zoom" ? zoomWebLink(meeting) : meeting) : "";

    const box = document.createElement("section");
    box.className = "box";
    box.id = "platformBox";
    box.style.borderLeft = "5px solid " + p.color;
    box.innerHTML =
      '<h2 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Meeting platform: <span class="pill" style="background:' + p.color + ';color:#fff">' + esc(p.name) + "</span></h2>" +
      '<ol class="steps">' + p.steps.map((s) => "<li>" + s + "</li>").join("") + "</ol>" +
      (open
        ? '<p style="margin-top:10px"><a target="_blank" rel="noopener" href="' + esc(open) + '" style="display:inline-block;background:' + p.color + ';color:#fff;font-weight:800;text-decoration:none;padding:10px 18px;border-radius:10px">Open meeting' + (key === "zoom" ? " (browser)" : "") + "</a>" +
          (key === "zoom" && open !== meeting ? ' <a target="_blank" rel="noopener" href="' + esc(meeting) + '" style="margin-left:10px">or open in the Zoom app</a>' : "") +
          "</p>"
        : "");

    const first = document.querySelector("section.box");
    if (first && first.parentNode) first.parentNode.insertBefore(box, first);
    else document.body.prepend(box);
  }

  // ------------------------------------------------------------------
  // Link to a scheduled interview in the AI Interview app:
  //   app.html?pi=<interview id>&api=<API base>#t=<access token>
  // - button 3 / 4: the candidate's companion page starts the check by itself
  // - the PDF + JSON report is saved to the dashboard automatically
  // - optional: gaze calibration starts by itself 20 s after Start
  // ------------------------------------------------------------------
  function linkScheduled() {
    const q = new URLSearchParams(location.search);
    const pi = (q.get("pi") || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(pi)) return;
    let api = (q.get("api") || "").replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(api)) api = location.origin;

    // access token: from the #fragment (never sent to a server), kept for this tab only
    const frag = new URLSearchParams(location.hash.slice(1));
    let token = frag.get("t") || "";
    try {
      if (token) sessionStorage.setItem("proctor_token", token);
      else token = sessionStorage.getItem("proctor_token") || localStorage.getItem("access_token") || sessionStorage.getItem("access_token") || "";
    } catch (e) { /* storage blocked */ }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);

    const base = api + "/live-guard/interviews/" + pi;
    const headers = () => ({ Authorization: "Bearer " + token });

    const box = document.createElement("section");
    box.className = "box";
    box.id = "linkBox";
    box.style.borderLeft = "5px solid #7c3aed";
    box.innerHTML =
      '<h2>Linked to the dashboard · Live Interview Guard</h2>' +
      '<div class="row" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<span class="pill" id="candPage">Candidate page: checking…</span>' +
      '<span class="pill" id="reportSync">Report: will be saved automatically</span>' +
      '<label style="display:inline-flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="autoCal" checked style="width:auto"> Start the gaze calibration automatically 20 s after Start</label>' +
      "</div>" +
      '<p class="muted" style="margin:8px 0 0;font-size:13px">Buttons 3 and 4 now start the checks on the candidate\'s page by themselves — no links to send.</p>';
    const anchor = document.getElementById("platformBox") || document.querySelector("section.box");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
    else document.body.prepend(box);

    const pill = (id, text, ok) => { const el = document.getElementById(id); if (el) { el.textContent = text; el.style.background = ok === true ? "#dcfce7" : ok === false ? "#fef3c7" : ""; el.style.color = ok === true ? "#166534" : ok === false ? "#92400e" : ""; } };
    const log = (m) => { try { typeof say === "function" ? say(m) : console.log(m); } catch (e) { console.log(m); } }; // say() comes from app.js

    async function refresh() {
      try {
        const r = await fetch(api + "/live-guard/interviews", { headers: headers() });
        if (r.status === 401) { pill("candPage", "Please log in to the dashboard again", false); return; }
        const list = (await r.json()).interviews || [];
        const me = list.find((x) => x.id === pi);
        if (!me) { pill("candPage", "Interview not found", false); return; }
        pill("candPage", me.candidate_online ? "Candidate page: open ✓" : "Candidate page: not open yet", !!me.candidate_online);
        const fill = (id, v) => { const el = document.getElementById(id); if (el && v && !el.value) el.value = v; };
        fill("cname", me.candidate_name); fill("cmail", me.candidate_email); fill("crole", me.role);
      } catch (e) { pill("candPage", "Dashboard not reachable", false); }
    }
    refresh();
    setInterval(refresh, 10000);

    async function command(body) {
      try {
        const r = await fetch(base + "/command", { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.detail || r.status);
        return d;
      } catch (e) { log("Could not reach the candidate page (" + (e.message || e) + "). Send the link from the dashboard instead."); return null; }
    }

    window.AIInterviewHook = {
      async calibrate() {
        const d = await command({ type: "calibrate" });
        if (d) log(d.candidate_online ? "Calibration started on the candidate's page automatically." : "Calibration sent — the candidate's page is not open yet; ask them to open the link from their invitation e-mail.");
      },
      async challenge(code) {
        const d = await command({ type: "challenge", code });
        const info = document.getElementById("chalInfo");
        if (d && info) info.innerHTML += '<br><b style="color:#166534">✓ Sent to the candidate\'s page automatically' + (d.candidate_online ? "" : " (their page is not open yet)") + ".</b>";
      },
      async report({ pdf, name, json }) {
        pill("reportSync", "Report: saving…");
        try {
          const fd = new FormData();
          fd.append("pdf", pdf, name || "Interview_Report.pdf");
          fd.append("report", JSON.stringify(json || {}));
          const r = await fetch(base + "/report", { method: "POST", headers: headers(), body: fd });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
          pill("reportSync", "Report: saved to the dashboard ✓", true);
          log("The PDF report was also saved to the AI Interview dashboard (Interview Proctor).");
        } catch (e) {
          pill("reportSync", "Report: not saved (" + (e.message || e) + ")", false);
        }
      },
    };

    // automatic gaze calibration after Start
    const start = document.getElementById("start");
    if (start) start.addEventListener("click", () => {
      setTimeout(() => {
        const auto = document.getElementById("autoCal");
        const b = document.getElementById("gazecal2");
        if (auto && auto.checked && b && !b.disabled) b.click();
      }, 20000);
    });
  }

  if (typeof window !== "undefined") {
    window.MeetingPlatforms = { PLATFORMS, zoomWebLink };
    const boot = () => { run(); linkScheduled(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
