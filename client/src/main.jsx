import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.DEV) {
      // Production builds (including localhost) enable offline app loading.
      navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => {
        if (registration.active?.scriptURL === new URL("/sw.js", location.href).href) registration.unregister();
      }));
      return;
    }
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(error => {
      console.warn("Offline app loading could not be enabled. Pending inspections remain in IndexedDB.", error);
    });
  });
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
