import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

if ("serviceWorker" in navigator) {
  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  window.addEventListener("load", () => {
    if (isLocalHost) {
      // Never let an old PWA cache interfere with local production testing.
      navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()));
      return;
    }
    if (import.meta.env.PROD) navigator.serviceWorker.register("/sw.js");
  });
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
