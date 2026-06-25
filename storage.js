const ATTEMPT_KEY = "able_iassess_attempts_v1";

function loadAttempts() {
  try { return JSON.parse(localStorage.getItem(ATTEMPT_KEY)) || []; }
  catch { return []; }
}

function saveAttempt(attempt) {
  const items = loadAttempts();
  items.unshift(attempt);
  localStorage.setItem(ATTEMPT_KEY, JSON.stringify(items.slice(0, 100)));
}
