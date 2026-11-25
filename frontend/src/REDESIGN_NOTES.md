# AI Interview – full SaaS redesign (Purple + Navy + White, 3D)

UI only. Supabase DB, auth / Google sign-in, Gmail OAuth, interview questions,
answer recording, transcription, face / eye monitoring and PDF report logic are
NOT changed. `services/*`, `api.js`, `authStorage.js`, `context/AuthContext.jsx`,
`meet-addon/*` are byte-for-byte identical to your originals.

## Pages
| Route | Page | What changed |
|---|---|---|
| `/` | Landing | NEW landing page (was a redirect to /login) |
| `/login`, `/register` | Auth | Split layout + navy brand panel |
| `/dashboard` | Dashboard | Hero, KPI cards, pipeline strip, 14-day chart, success rate, score distribution, review list, top candidates, activity, quick actions |
| `/dashboard/candidates` | REMOVED | Old links redirect to Reports. `Candidates.jsx` deleted; its review hook moved to `pages/dashboard/useReviewState.js` (used by Interview Controls) |
| `/dashboard/candidates/:id` | Candidate profile | Kept (Reports, Transcripts and backend e-mails link here); coloured Select / Hold / Reject buttons |
| `/dashboard/scheduling` | **NEW** Interview Scheduling | Calendar, send / resend / cancel invitations (same endpoints as Interview Controls) |
| `/dashboard/sessions` | REMOVED | Redirects to Reports |
| `/dashboard/monitoring` | REMOVED | Redirects to Reports (monitoring events still show on the candidate profile and PDF) |
| `/dashboard/transcripts` | **NEW** Answers & Transcripts | Q&A history per session, .txt download |
| `/dashboard/reports` | **NEW** Reports | Scored list + PDF download (existing report.pdf) |
| `/dashboard/controls` | Interview Controls | StatCards, underline tabs |
| `/dashboard/configuration` | Settings | Tabs: General, Interview settings, Email & Gmail, Account & security |
| `/dashboard/profile` | Profile | Cover card, stats, security |
| `/dashboard/help` | Help Center | Search, categories, quick links |
| `/create-interview`, `/interviews/:id/configuration`, `/interviews/:id/monitoring` | Wizard | Navy header, new step indicator |
| `/interviews/:id` | Lobby | Navy header, new background |
| `/interviews/:id/sessions/:sid` | Live interview | Class-only restyle (logic untouched) |
| `/invite/:code` | Invite | Branded card |

New pages only read data the backend already returns:
`/hiring/candidates`, `/hiring/candidates/{id}`, `/hiring/interviews`,
`/hiring/interviews/{id}/invite`, `/hiring/interviews/{id}/invitations`,
`/hiring/candidates/{id}/report.pdf`. No backend change needed.

## New shared files
- `index.css` – design system: fonts, navy + brand palette, `ui-*` utilities.
  Old violet/purple/indigo classes are re-mapped to teal/navy.
  The default teal button style is in `@layer base`, so any `bg-*` class on a
  button now wins (red Reject, white secondary buttons, etc.).
- `components/ui.jsx` – PageHeader, Card, EmptyState, SegTabs, LineTabs, Avatar, Table, LiveDot
- `components/BrandMark.jsx` – logo (change the name here if you want "VOLK Ai HR" everywhere)
- `components/AuthShowcase.jsx`, `components/WizardHeader.jsx`

## Install
Back up `frontend/src`, replace it with this `src` folder, run `npm run dev`.
No new npm packages. Line endings kept as CRLF like your repo.

## 3D layer
- `data-tilt` on a card = mouse-tracked 3D tilt + light glare (engine in `main.jsx`).
  `data-depth="1|2"` children float above the card.
- `ui-icon-3d` glossy icon tiles, `ui-orb` / `ui-ring` floating spheres (`<Orbs/>` in `components/ui.jsx`),
  tilted 3D product mockup on the landing page, raised buttons, glowing sidebar item.
- Settings -> General -> "Reduce card animations" switches all of it off
  (also off automatically for prefers-reduced-motion and touch screens).

## Purple theme (latest)
- Brand colour = purple (`--color-brand-*`, also used for old violet/purple classes). Accent = fuchsia.
- Green / red / amber are kept only for meaning: Selected, Rejected, Pending, "online" dots.
- Buttons: raised 3D keys (highlight + bottom edge + shadow), lift on hover,
  press down and turn DARK on click (index.css -> "3D buttons").
- 3D icon tiles on page titles, card titles and the sidebar (`TitleIcon` in components/ui.jsx).

## Sign-in flow (latest)
- Register: only **Interviewer** and **Admin** (candidates join through the invitation link).
- After sign-in: interviewer / admin -> `/welcome` (Supabase-style product page) -> Open dashboard.
  Candidates still go to their invitation / dashboard as before.
- Admin now gets the full interviewer app (frontend `isInterviewer` includes admin;
  backend `app/dashboard.py` returns the interviewer dashboard for admin with ALL interviews).
- Welcome page sections: hero + stat tiles, capability ticker, workspace cards, how it works,
  live proctoring, AI report preview (sample data, labelled "example"), candidate journey, quick answers, CTA.
- Welcome hero (latest): dark neon style - animated network mesh (canvas), original AI-robot SVG,
  job-role box that opens Create Interview with the title filled in (components/welcome/NeonHero.jsx).
- AI Interviewer persona (latest): detailed humanoid robot with headset mic, "Meet Your AI Interviewer" hero,
  "Your AI Interviewer" abilities card + example conversation (first lines = real warm-welcome wording).
- Welcome page (latest): fully white & purple - AI interviewer robot with orbit rings, hologram pedestal,
  sparkles and floating hologram cards (resume, live question, proctoring, score).
- Home page (latest): the Welcome page is now the public home at `/` (and `/welcome`).
  Signed out: Features / AI Interviewer / How it works / FAQ links + **Log in** and **Register** in the top bar;
  every app card and "Create interview" send visitors to Register. Signed in: Settings + Open dashboard.
  Old `pages/Home.jsx` removed.
- Start flow (latest): not signed in -> any app page or unknown URL opens the Welcome page first (`/`),
  then Log in. Sign out also returns to the Welcome page. Candidate interview links (/interviews/..., /invite/...) still go to Log in.
- Welcome page (latest):
  * Real-time 3D robot (components/welcome/Robot3D.jsx, three.js) - glossy shell, glass visor, purple eyes,
    headset + mic, waves hello, blinks, head follows the mouse, hologram platform + particles.
    Falls back to the SVG robot when WebGL is not available.
  * Sticky header with mobile menu and a full footer (components/welcome/SiteChrome.jsx).
- Robot3D now loads three.js from the jsDelivr CDN at runtime -> NO npm install needed.
  Offline / blocked / no WebGL -> the SVG robot is shown, no error.

## Welcome hero AI interviewer (latest)
- components/welcome/LiveAndroid.jsx: background-free android picture (assets/ai-interviewer-cutout.webp) rendered with plain WebGL.
- Eyes glow, pulse and blink; headphone LEDs twinkle; hologram scan line; gentle breathing float.
- The head does not rotate with the cursor. No npm package or CDN needed.
- Robot3D.jsx / robotScene.js / androidScene.js / LiveAndroid depth map were removed.
