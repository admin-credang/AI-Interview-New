// Zoom / Google Meet / Microsoft Teams: link checks and setup guidance
// used by the Interview Proctor page (and passed to /proctor/app.html).

export const PLATFORMS = {
  zoom: {
    id: "zoom",
    name: "Zoom",
    color: "#2D8CFF",
    tint: "from-sky-400 to-blue-600",
    example: "https://us05web.zoom.us/j/81234567890?pwd=…",
    // zoom.us, us05web.zoom.us, company.zoom.us … /j/<id> or /wc/join/<id> or /my/<name>
    test: (u) => /(^|\.)zoom\.us$/i.test(u.hostname) && /^\/(j|wc\/join|wc|my|s)\//i.test(u.pathname),
    interviewer: [
      ["Join from Chrome", "Use “Open meeting (browser)” — Zoom opens as a Chrome tab, so its audio can be shared with one click."],
      ["Share the Zoom tab", "In the proctor: button 1 “Share meeting tab + audio” → pick the Zoom tab → keep “Share tab audio” ON."],
      ["Desktop Zoom app instead?", "Button 1 → the Zoom window, and button 1b → Entire screen + “Also share system audio”."],
      ["Make the face big", "Speaker view or Pin the candidate. If anything is shared use View → Side-by-side."],
    ],
    candidate: [
      "Join from a laptop / desktop with the camera ON (not a phone).",
      "Please don't use a virtual background or blur.",
    ],
  },
  meet: {
    id: "meet",
    name: "Google Meet",
    color: "#00897B",
    tint: "from-emerald-400 to-teal-600",
    example: "https://meet.google.com/abc-defg-hij",
    test: (u) => /^meet\.google\.com$/i.test(u.hostname) && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/i.test(u.pathname),
    interviewer: [
      ["Open Meet in Chrome", "Google Meet already runs in the browser — use “Open meeting”."],
      ["Share the Meet tab", "In the proctor: button 1 “Share meeting tab + audio” → pick the Meet tab → keep “Share tab audio” ON. That gives video and voice."],
      ["Make the face big", "⋮ on the candidate's tile → Pin, or use the Spotlight layout."],
      ["Keep the tab visible", "Don't minimise the Meet tab during the interview."],
    ],
    candidate: [
      "Join from a laptop / desktop in Google Chrome with the camera ON.",
      "Please turn off background blur / effects.",
    ],
  },
  teams: {
    id: "teams",
    name: "Microsoft Teams",
    color: "#5B5FC7",
    tint: "from-indigo-400 to-violet-600",
    example: "https://teams.microsoft.com/l/meetup-join/…",
    test: (u) =>
      (/^teams\.microsoft\.com$/i.test(u.hostname) && /^\/(l\/meetup-join|meet)\//i.test(u.pathname)) ||
      (/^teams\.live\.com$/i.test(u.hostname) && /^\/meet\//i.test(u.pathname)),
    interviewer: [
      ["Join from Chrome", "Open the link and choose “Continue on this browser” so Teams runs as a Chrome tab."],
      ["Share the Teams tab", "In the proctor: button 1 “Share meeting tab + audio” → pick the Teams tab → keep “Share tab audio” ON."],
      ["Desktop Teams app instead?", "Button 1 → the Teams window, and button 1b → Entire screen + “Also share system audio”."],
      ["Make the face big", "Pin or Spotlight the candidate; avoid Large gallery / Together mode."],
    ],
    candidate: [
      "Join from a laptop / desktop with the camera ON (browser or Teams app).",
      "Please turn off background effects.",
    ],
  },
};

export const PLATFORM_LIST = [PLATFORMS.zoom, PLATFORMS.meet, PLATFORMS.teams];

/** "ok" | "empty" | "invalid" | "other" (valid https link of another platform) */
export function checkMeetingLink(platformId, link) {
  const value = (link || "").trim();
  if (!value) return { state: "empty" };
  let u;
  try {
    u = new URL(value);
  } catch {
    return { state: "invalid" };
  }
  if (u.protocol !== "https:") return { state: "invalid" };
  if (PLATFORMS[platformId]?.test(u)) return { state: "ok", url: u.href };
  const other = PLATFORM_LIST.find((p) => p.test(u));
  return other ? { state: "other", other } : { state: "invalid" };
}

/** Zoom meeting links open in the Zoom web client (a Chrome tab = tab audio can be shared). */
export function zoomWebLink(link) {
  try {
    const u = new URL(link);
    const m = u.pathname.match(/^\/j\/(\d+)/);
    if (/(^|\.)zoom\.us$/i.test(u.hostname) && m) return `${u.origin}/wc/join/${m[1]}${u.search}`;
  } catch {
    /* not a URL */
  }
  return link;
}

export function detectPlatform(link) {
  try {
    const u = new URL((link || "").trim());
    return PLATFORM_LIST.find((p) => p.test(u))?.id || null;
  } catch {
    return null;
  }
}
