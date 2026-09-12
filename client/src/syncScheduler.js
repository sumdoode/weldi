// Foreground retry works without Background Sync support (including iPhone).
export function createSyncScheduler({ run, pause, windowTarget = window, documentTarget = document, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let stopped = false;
  let running = false;
  let timer = null;
  let failures = 0;
  let rerun = false;
  let rerunForce = false;
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const schedule = delay => {
    clear();
    if (!stopped && documentTarget.visibilityState !== "hidden" && windowTarget.navigator.onLine !== false) timer = setTimer(() => attempt(), delay);
  };
  async function attempt(force = false) {
    if (stopped || documentTarget.visibilityState === "hidden" || windowTarget.navigator.onLine === false) return;
    if (running) { rerun = true; rerunForce ||= force; return; }
    clear();
    running = true;
    try {
      const result = await run({ force });
      failures = result?.pending && result?.code !== "ok" ? Math.min(failures + 1, 4) : 0;
      if (result?.pending && result?.retryable !== false) schedule([5000, 10000, 20000, 40000, 60000][failures]);
    } catch {
      failures = Math.min(failures + 1, 4);
      schedule([5000, 10000, 20000, 40000, 60000][failures]);
    } finally {
      running = false;
      if (rerun && !stopped) {
        const forceNext = rerunForce;
        rerun = false; rerunForce = false;
        clear();
        timer = setTimer(() => attempt(forceNext), 500);
      }
    }
  }
  const retry = () => { void attempt(); };
  const visible = () => {
    if (documentTarget.visibilityState === "hidden") { clear(); pause?.(); }
    else retry();
  };
  const offline = () => { pause?.(); clear(); };
  windowTarget.addEventListener("online", retry);
  windowTarget.addEventListener("offline", offline);
  windowTarget.addEventListener("focus", retry);
  windowTarget.addEventListener("pageshow", retry);
  windowTarget.addEventListener("weld-queue-added", retry);
  documentTarget.addEventListener("visibilitychange", visible);
  schedule(0);
  return {
    retry: () => attempt(true),
    stop() {
      stopped = true; clear(); pause?.();
      windowTarget.removeEventListener("online", retry);
      windowTarget.removeEventListener("offline", offline);
      windowTarget.removeEventListener("focus", retry);
      windowTarget.removeEventListener("pageshow", retry);
      windowTarget.removeEventListener("weld-queue-added", retry);
      documentTarget.removeEventListener("visibilitychange", visible);
    }
  };
}
