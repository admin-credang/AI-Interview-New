import { useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";
import { FlowSteps } from "../components/dashboard/hiring";

function InterviewConfiguration() {
  const { interviewId } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    difficulty: "medium",
    knowledge_expectation: "deep",
    categories: [
      "technical",
      "problem_solving",
      "communication",
    ],
    question_count: 5,

  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [configuration, setConfiguration] = useState(null);

  // ============================================================
  // HANDLE NORMAL INPUTS
  // ============================================================

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]:
        name === "question_count"
          ? Number(value)
          : value,
    }));
  };

  // ============================================================
  // HANDLE CATEGORIES
  // ============================================================

  const handleCategoryChange = (category) => {
    setForm((previous) => {
      const exists =
        previous.categories.includes(category);

      return {
        ...previous,
        categories: exists
          ? previous.categories.filter(
              (item) => item !== category
            )
          : [
              ...previous.categories,
              category,
            ],
      };
    });
  };

  // ============================================================
  // SUBMIT CONFIGURATION
  // ============================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!interviewId) {
      setError("Interview ID is missing.");
      return;
    }

    if (form.categories.length === 0) {
      setError(
        "Select at least one question category."
      );
      return;
    }

    if (
      !form.question_count ||
      Number(form.question_count) < 1
    ) {
      setError(
        "Question count must be at least 1."
      );
      return;
    }

    if (Number(form.question_count) > 50) {
      setError(
        "Question count cannot be more than 50."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await api.post(
        `/interviews/${interviewId}/configuration`,
        {
          difficulty: form.difficulty,

          knowledge_expectation:
            form.knowledge_expectation,

          extra_config: {
            categories: form.categories,

            question_count:
              Number(form.question_count),

          },
        }
      );

      setConfiguration(response.data);

      setSuccess(
        "Configuration saved. Next: monitoring setup."
      );

      setTimeout(() => {
        navigate(
          `/interviews/${interviewId}/monitoring`
        );
      }, 500);
    } catch (err) {
      console.error(
        "Interview configuration failed:",
        err
      );

      // ========================================================
      // 409 = Configuration already exists
      // ========================================================

      if (err.response?.status === 409) {
        try {
          // A default configuration is created together with the
          // interview, so saving must UPDATE it - otherwise the
          // question count / categories chosen here are lost.
          const existingResponse =
            await api.put(
              `/interviews/${interviewId}/configuration`,
              {
                difficulty: form.difficulty,
                knowledge_expectation:
                  form.knowledge_expectation,
                extra_config: {
                  categories: form.categories,
                  question_count:
                    Number(form.question_count),
                },
              }
            );

          setConfiguration(
            existingResponse.data
          );

          setSuccess(
            "Configuration saved. Next: monitoring setup."
          );

          setTimeout(() => {
            navigate(
              `/interviews/${interviewId}/monitoring`
            );
          }, 500);
        } catch (fetchError) {
          console.error(
            "Existing configuration loading failed:",
            fetchError
          );

          setError(
            fetchError.response?.data?.detail ||
              "Configuration already exists, but it could not be loaded."
          );
        }
      } else {
        setError(
          err.response?.data?.detail ||
            "Unable to create interview configuration."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

          <div>
            <h1 className="text-xl font-bold">
              AI Interview Agent
            </h1>

            <p className="text-sm text-slate-400">
              Interview Configuration
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              navigate("/dashboard")
            }
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm transition hover:bg-slate-800"
          >
            Dashboard
          </button>

        </div>
      </header>

      {/* ======================================================
          MAIN
      ====================================================== */}

      <main className="mx-auto max-w-4xl px-6 py-10">

        <FlowSteps current={1} />

        {/* ====================================================
            TITLE
        ==================================================== */}

        <div className="mb-8">

          <p className="text-sm font-medium text-indigo-400">
            INTERVIEW CONFIGURATION
          </p>

          <h2 className="mt-2 text-4xl font-bold">
            Configure AI Interview
          </h2>

          <p className="mt-3 text-slate-400">
            Configure how the AI should generate
            questions for this interview.
          </p>

          <p className="mt-3 break-all text-xs text-slate-500">
            Interview ID: {interviewId}
          </p>

        </div>

        {/* ====================================================
            FORM CARD
        ==================================================== */}

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">

          <form
            onSubmit={handleSubmit}
            className="space-y-8"
          >

            {/* ==================================================
                DIFFICULTY
            ================================================== */}

            <div>

              <label
                htmlFor="difficulty"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Difficulty
              </label>

              <select
                id="difficulty"
                name="difficulty"
                value={form.difficulty}
                onChange={handleChange}
                disabled={loading}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500"
              >
                <option value="easy">
                  Easy
                </option>

                <option value="medium">
                  Medium
                </option>

                <option value="hard">
                  Hard
                </option>
              </select>

            </div>

            {/* ==================================================
                KNOWLEDGE EXPECTATION
            ================================================== */}

            <div>

              <label
                htmlFor="knowledge_expectation"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Knowledge Expectation
              </label>

              <select
                id="knowledge_expectation"
                name="knowledge_expectation"
                value={
                  form.knowledge_expectation
                }
                onChange={handleChange}
                disabled={loading}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500"
              >
                <option value="basic">
                  Basic
                </option>

                <option value="intermediate">
                  Intermediate
                </option>

                <option value="deep">
                  Deep
                </option>
              </select>

            </div>

            {/* ==================================================
                CATEGORIES
            ================================================== */}

            <div>

              <p className="mb-3 text-sm font-medium text-slate-300">
                Question Categories
              </p>

              <div className="grid gap-3 md:grid-cols-3">

                {[
                  {
                    value: "technical",
                    label: "Technical",
                  },
                  {
                    value: "problem_solving",
                    label: "Problem Solving",
                  },
                  {
                    value: "communication",
                    label: "Communication",
                  },
                ].map((category) => (
                  <label
                    key={category.value}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 transition hover:border-indigo-500"
                  >

                    <input
                      type="checkbox"
                      checked={form.categories.includes(
                        category.value
                      )}
                      onChange={() =>
                        handleCategoryChange(
                          category.value
                        )
                      }
                      disabled={loading}
                      className="h-4 w-4 accent-indigo-600"
                    />

                    <span className="text-sm">
                      {category.label}
                    </span>

                  </label>
                ))}

              </div>

            </div>

            {/* ==================================================
                QUESTION COUNT
            ================================================== */}

            <div>

              <label
                htmlFor="question_count"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Number of Questions
              </label>

              <input
                id="question_count"
                name="question_count"
                type="number"
                min="1"
                max="50"
                value={
                  form.question_count
                }
                onChange={handleChange}
                disabled={loading}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500"
              />

              <p className="mt-2 text-xs text-slate-500">
                Choose between 1 and 50 questions.
              </p>

            </div>

            {/* ==================================================
                ERROR
            ================================================== */}

            {error && (
              <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3">

                <p className="text-sm text-red-400">
                  {error}
                </p>

              </div>
            )}

            {/* ==================================================
                SUCCESS
            ================================================== */}

            {success && (
              <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3">

                <p className="text-sm text-emerald-400">
                  {success}
                </p>

                {configuration?.id && (
                  <p className="mt-2 break-all text-xs text-emerald-500">
                    Configuration ID:{" "}
                    {configuration.id}
                  </p>
                )}

              </div>
            )}

            {/* ==================================================
                SUBMIT
            ================================================== */}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Saving Configuration..."
                : "Save Configuration"}
            </button>

          </form>

        </div>

      </main>

    </div>
  );
}

export default InterviewConfiguration;
