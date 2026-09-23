import { getCurrentWindow } from "@tauri-apps/api/window";

export default function TitleBar({ name }: { name: string }) {
  const win = getCurrentWindow();
  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>
        ◇ {name} // Usage Monitor
      </span>
      <div className="titlebar-buttons">
        <button onClick={() => win.minimize()} title="Minimize">
          ─
        </button>
        <button onClick={() => win.toggleMaximize()} title="Maximize">
          ▢
        </button>
        <button className="close" onClick={() => win.hide()} title="Hide to tray">
          ✕
        </button>
      </div>
    </div>
  );
}
