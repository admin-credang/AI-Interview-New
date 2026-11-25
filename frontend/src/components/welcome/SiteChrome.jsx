import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";

import BrandMark from "../BrandMark";
import { IconArrowRight, IconMenu, IconSettings, IconX } from "../dashboard/icons";

// ============================================================
// Header + footer for the Welcome / home page
// ============================================================

const PUBLIC_LINKS = [
  ["Features", "#features"],
  ["AI Interviewer", "#ai"],
  ["Live Guard", "#live-guard"],
  ["How it works", "#how"],
  ["FAQ", "#faq"],
];

const APP_LINKS = [
  ["Dashboard", "/dashboard"],
  ["Scheduling", "/dashboard/scheduling"],
  ["Reports", "/dashboard/reports"],
  ["Analytics", "/dashboard/analytics"],
  ["Help", "/dashboard/help"],
];

function NavItem({ href, children, onClick, className = "" }) {
  return href.startsWith("#") ? (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ) : (
    <Link to={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}

export function WelcomeHeader({ signedIn, name }) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const links = signedIn ? APP_LINKS : PUBLIC_LINKS;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-brand-100/80 bg-white/80 shadow-[0_10px_30px_-20px_rgba(76,29,149,0.45)] backdrop-blur-xl"
          : "border-b border-transparent bg-white/30 backdrop-blur-sm"
      }`}
    >
      <div className={`mx-auto flex max-w-7xl items-center gap-8 px-5 transition-all sm:px-8 ${scrolled ? "h-16" : "h-20"}`}>
        <Link to="/" aria-label="Home">
          <BrandMark dark={false} />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map(([label, href]) => (
            <NavItem
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-[15px] font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
            >
              {label}
            </NavItem>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <>
              <span className="hidden items-center gap-2 rounded-full bg-brand-50 py-1 pl-1 pr-3 text-sm font-semibold text-brand-800 ring-1 ring-brand-100 xl:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xs text-white">
                  {String(name || "?").charAt(0).toUpperCase()}
                </span>
                {name}
              </span>
              <button data-plain onClick={() => navigate("/dashboard/configuration")} className="ui-btn-ghost hidden px-3 py-2 sm:inline-flex" aria-label="Settings">
                <IconSettings />
              </button>
              <button onClick={() => navigate("/dashboard")} className="hidden items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold sm:inline-flex">
                Open dashboard <IconArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button data-plain onClick={() => navigate("/login")} className="ui-btn-ghost hidden px-4 py-2 sm:inline-flex">
                Log in
              </button>
              <button onClick={() => navigate("/register")} className="hidden items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold sm:inline-flex">
                Register <IconArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            data-plain
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="rounded-xl border border-brand-100 bg-white p-2 text-brand-700 shadow-sm lg:hidden"
          >
            <IconMenu />
          </button>
        </div>
      </div>

      {/* mobile menu (portal: the blurred header would trap a fixed panel) */}
      {createPortal(
      <div className={`fixed inset-0 z-[60] lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-navy-950/30 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute inset-y-0 right-0 flex w-80 max-w-[85%] flex-col bg-white p-6 shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex items-center justify-between">
            <BrandMark dark={false} />
            <button data-plain aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <IconX />
            </button>
          </div>
          <nav className="mt-8 flex flex-col gap-1">
            {links.map(([label, href]) => (
              <NavItem
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-semibold text-navy-900 hover:bg-brand-50 hover:text-brand-700"
              >
                {label}
              </NavItem>
            ))}
          </nav>
          <div className="mt-auto grid gap-2">
            {signedIn ? (
              <button onClick={() => navigate("/dashboard")} className="rounded-xl px-4 py-3 text-sm font-semibold">
                Open dashboard
              </button>
            ) : (
              <>
                <button onClick={() => navigate("/register")} className="rounded-xl px-4 py-3 text-sm font-semibold">
                  Register
                </button>
                <button data-plain onClick={() => navigate("/login")} className="ui-btn-ghost py-3">
                  Log in
                </button>
              </>
            )}
          </div>
        </div>
      </div>,
      document.body,
      )}
    </header>
  );
}

export function WelcomeFooter({ signedIn, name, roleLabel, onSignOut }) {
  const year = new Date().getFullYear();
  const cols = signedIn
    ? [
        ["Workspace", [["Dashboard", "/dashboard"], ["Interview Scheduling", "/dashboard/scheduling"], ["Interview Controls", "/dashboard/controls"], ["Assessments", "/dashboard/assessments"]]],
        ["Insights", [["Answers & Transcripts", "/dashboard/transcripts"], ["Reports", "/dashboard/reports"], ["Analytics", "/dashboard/analytics"]]],
        ["Account", [["Settings", "/dashboard/configuration"], ["Profile", "/dashboard/profile"], ["FAQ", "/dashboard/help"]]],
      ]
    : [
        ["Product", [["Features", "#features"], ["AI Interviewer", "#ai"], ["Live Interview Guard", "#live-guard"], ["How it works", "#how"]]],
        ["Get started", [["Register", "/register"], ["Log in", "/login"], ["FAQ", "#faq"]]],
        ["Candidates", [["Join with your Interview ID", "/login"]]],
      ];

  return (
    <footer className="relative overflow-hidden border-t border-brand-100 bg-gradient-to-b from-white to-brand-50/70">
      <div className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-brand-300/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <BrandMark dark={false} />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
            An AI interviewer for your hiring team — resume-aware questions, live proctoring, automatic transcripts
            and scored PDF reports.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {["Resume AI", "Proctoring", "Transcripts", "PDF reports"].map((t) => (
              <span key={t} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100">
                {t}
              </span>
            ))}
          </div>
        </div>

        {cols.map(([title, items]) => (
          <div key={title}>
            <p className="text-sm font-bold text-navy-900">{title}</p>
            <ul className="mt-4 space-y-2.5">
              {items.map(([label, href]) => (
                <li key={label}>
                  <NavItem href={href} className="text-sm text-slate-500 transition hover:text-brand-700">
                    {label}
                  </NavItem>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="relative border-t border-brand-100/80">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-5 text-sm text-slate-500 sm:flex-row sm:px-8">
          <p>&copy; {year} AI Interview &amp; Assessment Platform. All rights reserved.</p>
          {signedIn ? (
            <p className="flex items-center gap-3">
              <span>
                Signed in as <span className="font-semibold text-navy-900">{name}</span> · {roleLabel}
              </span>
              <button data-plain onClick={onSignOut} className="font-semibold text-rose-600 hover:text-rose-700">
                Sign out
              </button>
            </p>
          ) : (
            <p>
              <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800">Log in</Link>
              {" · "}
              <Link to="/register" className="font-semibold text-brand-700 hover:text-brand-800">Register</Link>
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
