import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Edge } from "./desktop-agents";
import "./base.css";

// Each window loads only its own bundle: the island never pulls in the dashboard.
const App = lazy(() => import("./App"));
const Island = lazy(() => import("./Island"));
const DesktopAgents = lazy(() => import("./DesktopAgents"));
const windowLabel = getCurrentWindow().label;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={null}>{windowLabel.startsWith("desktop-agents-") ? <DesktopAgents edge={windowLabel.slice("desktop-agents-".length) as Edge} /> : windowLabel === "island" ? <Island /> : <App />}</Suspense>
  </React.StrictMode>,
);
