import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Development uses Vite's live server rather than a previously installed worker.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      if (registration.active?.scriptURL === new URL("/sw.js", location.href).href) {
        registration.unregister();
      }
    });
  }).catch((error) => console.warn("Could not disable the production worker for development.", error));
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
