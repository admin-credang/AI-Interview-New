// Phone-detection decision logic (kept separate so it can be tested without a camera).
export const PHONE_CONFIG = {
  score: 0.5,        // v52: one sighting needs 50%+ (39% detections were false 'phone' flags in report Janani 26)
  strong: 0.65,      // a sighting this sure counts as 2 votes
  window: 8,         // look at the last 8 checks ...
  need: 4,           // ... "phone present" when they add up to 4 votes (several clear sightings, not one blurry frame)
  holdMs: 4000,      // keep "phone" on this long after the last sighting
  useLinkMs: 4000,   // looking down / away within this long after a phone sighting = "using the phone"
  downEpisodeMs: 1500, // looking down this long (eyes OR head) = one "looking down" event
  useEpisodeMs: 1500,  // looking down/away while a phone was seen = one "phone use" event
};

export function createPhoneVoter(C = PHONE_CONFIG) {
  const win = [];
  let seenAt = 0, bestLast = 0, on = false;
  return {
    /** best = highest phone score of this check, or null when the phone model was not run */
    push(best, now) {
      if (best !== null) {
        const hit = best >= C.score;
        win.push(best >= C.strong ? 2 : hit ? 1 : 0);
        if (win.length > C.window) win.shift();
        if (hit) { seenAt = now; bestLast = best; }
      }
      const active = win.reduce((a, b) => a + b, 0) >= C.need;
      const appeared = active && !on;
      on = active;
      if (on && now - seenAt >= C.holdMs) { on = false; win.length = 0; }
      return { on, appeared, best: bestLast, seenAt };
    },
    recentlySeen(now) { return seenAt > 0 && now - seenAt <= C.useLinkMs; },
    reset() { win.length = 0; seenAt = 0; bestLast = 0; on = false; },
  };
}

/** fires ONCE when `active` has been true for `ms` in a row; re-arms when it turns false */
export function createEpisodeTimer(ms) {
  let since = null, counted = false;
  return {
    update(active, now) {
      if (!active) { since = null; counted = false; return false; }
      since = since || now;
      if (now - since >= ms && !counted) { counted = true; return true; }
      return false;
    },
    reset() { since = null; counted = false; },
  };
}
