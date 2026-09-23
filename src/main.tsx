import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Island from "./Island";
import { getCurrentWindow } from "@tauri-apps/api/window";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {getCurrentWindow().label === "island" ? <Island /> : <App />}
  </React.StrictMode>,
);
