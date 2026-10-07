import api from "./api";

/**
 * Warm-up for the candidate page.
 *
 * When the interviewer hovers a row (or the list finishes loading) we
 * already ask the server for that candidate and download the page code,
 * so the click opens the page immediately instead of waiting.
 */

const TTL = 60 * 1000;
const cache = new Map();

export const loadCandidateDetailPage = () =>
  import("../pages/dashboard/CandidateDetail");

export function prefetchCandidate(sessionId) {
  if (!sessionId) return;

  const hit = cache.get(sessionId);
  if (hit && Date.now() - hit.at < TTL) return;

  loadCandidateDetailPage().catch(() => {});

  const promise = api.get(`/hiring/candidates/${sessionId}`);
  promise.catch(() => cache.delete(sessionId));

  cache.set(sessionId, { promise, at: Date.now() });
}

/** One-time use: returns the prefetched request, or null. */
export function takePrefetchedCandidate(sessionId) {
  const hit = cache.get(sessionId);
  cache.delete(sessionId);

  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  return null;
}
