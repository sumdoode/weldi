import { useRegisterSW } from "virtual:pwa-register/react";

export default function PwaUpdatePrompt({ busy }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => {
      console.warn("Offline app loading could not be enabled. Pending inspections remain in IndexedDB.", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="alert success pwa-update" role="status">
      <span>An app update is ready. Save your current inspection before updating.</span>
      <button onClick={() => updateServiceWorker(true)} disabled={busy}>Update now</button>
      <button onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  );
}
