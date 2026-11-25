import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import api from "../services/api";
import WizardHeader from "../components/WizardHeader";
import { FlowSteps } from "../components/dashboard/hiring";

function CreateInterview() {
  const navigate = useNavigate();

  // Welcome page can pass a job role to start with.
  const location = useLocation();
  const [form, setForm] = useState({
    title: location.state?.title || "",
    description: "",
    duration: 30,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    /* -----------------------------------------
       Validation
    ----------------------------------------- */

    if (!form.title.trim()) {
      setError(
        "Interview title is required."
      );
      return;
    }

    if (
      !form.duration ||
      Number(form.duration) <= 0
    ) {
      setError(
        "Duration must be greater than 0."
      );
      return;
    }

    setLoading(true);

    try {
      /* -----------------------------------------
         Create real interview
      ----------------------------------------- */

      const response = await api.post(
        "/interviews",
        {
          title: form.title.trim(),

          description:
            form.description.trim() ||
            null,

          duration:
            Number(form.duration),
        }
      );

      const interview =
        response.data;

      /* -----------------------------------------
         Make sure backend returned ID
      ----------------------------------------- */

      if (!interview?.id) {
        setError(
          "Interview was created, but no interview ID was returned."
        );

        return;
      }

      /* -----------------------------------------
         Go directly to configuration
      ----------------------------------------- */

      navigate(
        `/interviews/${interview.id}/configuration`
      );

    } catch (err) {
      console.error(
        "Create interview failed:",
        err
      );

      setError(
        err.response?.data?.detail ||
          "Unable to create interview. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] text-navy-900">

      {/* -----------------------------------------
          Header
      ----------------------------------------- */}

      <WizardHeader step="Create Interview" backLabel="Back to Dashboard" />

      {/* -----------------------------------------
          Main
      ----------------------------------------- */}

      <main className="mx-auto max-w-3xl px-6 py-10">

        <FlowSteps current={0} />

        {/* Heading */}

        <div className="mb-8">

          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            INTERVIEWER
          </p>

          <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-navy-900">
            Create Interview
          </h2>

          <p className="mt-3 text-slate-500">
            Create a real interview that will
            be stored in your interview database.
          </p>

        </div>

        {/* -----------------------------------------
            Form Card
        ----------------------------------------- */}

        <div className="ui-card p-6 sm:p-8">

          <form
            onSubmit={handleSubmit}
            className="space-y-6"
          >

            {/* -----------------------------------------
                Title
            ----------------------------------------- */}

            <div>

              <label
                htmlFor="title"
                className="mb-2 block text-sm font-medium text-slate-600"
              >
                Interview Title
              </label>

              <input
                id="title"
                name="title"
                type="text"
                value={form.title}
                onChange={handleChange}
                placeholder="Example: Python Developer Interview"
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
              />

            </div>

            {/* -----------------------------------------
                Description
            ----------------------------------------- */}

            <div>

              <label
                htmlFor="description"
                className="mb-2 block text-sm font-medium text-slate-600"
              >
                Description
              </label>

              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={5}
                placeholder="Describe the purpose and expectations of this interview..."
                disabled={loading}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
              />

            </div>

            {/* -----------------------------------------
                Duration
            ----------------------------------------- */}

            <div>

              <label
                htmlFor="duration"
                className="mb-2 block text-sm font-medium text-slate-600"
              >
                Duration (minutes)
              </label>

              <input
                id="duration"
                name="duration"
                type="number"
                min="1"
                value={form.duration}
                onChange={handleChange}
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
              />

            </div>

            {/* -----------------------------------------
                Error
            ----------------------------------------- */}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">

                <p className="text-sm text-red-600">
                  {error}
                </p>

              </div>
            )}

            {/* -----------------------------------------
                Submit
            ----------------------------------------- */}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Creating Interview..."
                : "Create Interview"}
            </button>

          </form>

        </div>

      </main>

    </div>
  );
}

export default CreateInterview;