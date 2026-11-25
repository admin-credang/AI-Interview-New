import { useNavigate } from "react-router-dom";
import BrandMark from "./BrandMark";

// Top bar for the 3-step "create interview" flow
export default function WizardHeader({ step, backLabel = "Back to Dashboard" }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/90 text-navy-900 shadow-[0_10px_30px_-20px_rgba(76,29,149,0.45)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <button data-plain type="button" onClick={() => navigate("/dashboard")} aria-label="Dashboard">
            <BrandMark dark={false} />
          </button>
          {step && (
            <span className="hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 sm:inline">
              {step}
            </span>
          )}
        </div>
        <button
          data-plain
          type="button"
          onClick={() => navigate("/dashboard")}
          className="rounded-xl border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-[0_3px_0_#ede9fe] transition hover:bg-brand-50"
        >
          {backLabel}
        </button>
      </div>
    </header>
  );
}
