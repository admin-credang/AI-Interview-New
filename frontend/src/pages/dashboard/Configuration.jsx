import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useDashboard } from "../../context/DashboardContext";

const PREF_KEY = "dashboard_preferences";

const loadPrefs = () => {
  try {
    return { reduceMotion: false, ...(JSON.parse(localStorage.getItem(PREF_KEY)) || {}) };
  } catch {
    return { reduceMotion: false };
  }
};

export default function Configuration() {
  const navigate = useNavigate();
  const { t, isInterviewer, interviews } = useDashboard();

  const [prefs, setPrefs] = useState(loadPrefs);

  const toggle = (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-10 max-w-4xl">
      <header className="px-1">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Configuration</h1>
        <p className="opacity-70 mt-2 text-sm">Platform preferences. Saved on this device.</p>
      </header>

      <section className={`rounded-[2rem] border ${t.card} p-8`}>
        <h2 className="font-bold text-lg mb-5">Preferences</h2>
        <label className="flex items-center justify-between gap-6 cursor-pointer">
          <span>
            <span className="block font-semibold text-sm">Reduce card animations</span>
            <span className="block text-xs opacity-60">Turns off the 3D tilt effect on assessment cards.</span>
          </span>
          <input
            type="checkbox"
            checked={prefs.reduceMotion}
            onChange={() => toggle("reduceMotion")}
            className="w-5 h-5 accent-slate-700"
          />
        </label>
      </section>

      {isInterviewer && (
        <section className={`rounded-[2rem] border ${t.card} p-8`}>
          <h2 className="font-bold text-lg mb-5">Assessment configuration</h2>
          {interviews.length === 0 ? (
            <p className="text-sm opacity-70">Create an assessment first, then configure it here.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {interviews.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-4 py-4">
                  <span className="font-semibold truncate">{i.title || i.name}</span>
                  <button
                    onClick={() => navigate(`/interviews/${i.id}/configuration`)}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-100"
                  >
                    Configure
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
