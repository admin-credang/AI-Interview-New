// Evidence-aware final status policy. This labels evidence quality, never whether someone cheated.
(function (root) {
  "use strict";
  function determineReviewStatus({
    strongFlag = false,
    weakFlag = false,
    usableAnswers = 0,
    analysedFrames = 0,
    singleFaceRatio = 0,
    minFrames = 12,
    minFaceRatio = 0.25,
  } = {}) {
    if (strongFlag) return { level: "REVIEW", text: "Multiple indicators require interviewer review" };
    if (weakFlag) return { level: "MINOR", text: "Some indicators were recorded; review the evidence" };
    if (usableAnswers <= 0 || analysedFrames < minFrames || singleFaceRatio < minFaceRatio) {
      return { level: "INSUFFICIENT", text: "Insufficient reliable monitoring data; no conclusion can be made" };
    }
    return { level: "CLEAR", text: "No review indicators were observed in the available data" };
  }
  root.ReviewPolicy = { determineReviewStatus };
  if (typeof module !== "undefined" && module.exports) module.exports = root.ReviewPolicy;
})(typeof window !== "undefined" ? window : globalThis);
