const ATTEMPT_KEY = "able_iassess_attempts_v1";

function loadAttempts() {
  try { return JSON.parse(localStorage.getItem(ATTEMPT_KEY)) || []; }
  catch { return []; }
}

function saveAttempt(attempt) {
  const items = loadAttempts();

  const key = attempt.slug || attempt.assessmentId || attempt.title;

  const existingIndex = items.findIndex(x =>
    (x.slug || x.assessmentId || x.title) === key
  );

  if (existingIndex >= 0) {
    const existing = items[existingIndex];

    const updated = {
      ...existing,
      ...attempt,

      attemptCount: (existing.attemptCount || 1) + 1,

      firstAttemptAt: existing.firstAttemptAt || existing.at || attempt.at,
      lastAttemptAt: attempt.at,

      bestScore: attempt.type === "quiz"
        ? Math.max(existing.bestScore ?? existing.score ?? 0, attempt.score ?? 0)
        : existing.bestScore,

      bestPercentage: attempt.type === "quiz"
        ? Math.max(existing.bestPercentage ?? existing.percentage ?? 0, attempt.percentage ?? 0)
        : existing.bestPercentage,

      latestScore: attempt.score,
      latestTotal: attempt.total,
      latestPercentage: attempt.percentage
    };

    items[existingIndex] = updated;
  } else {
    items.unshift({
      ...attempt,
      attemptCount: 1,
      firstAttemptAt: attempt.at,
      lastAttemptAt: attempt.at,
      bestScore: attempt.score,
      bestPercentage: attempt.percentage,
      latestScore: attempt.score,
      latestTotal: attempt.total,
      latestPercentage: attempt.percentage
    });
  }

  localStorage.setItem(ATTEMPT_KEY, JSON.stringify(items.slice(0, 100)));
}
