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
        {/* close() rather than hide(): the app turns it into a hide and pauses the page. */}
        <button className="close" onClick={() => win.close()} title="Hide to tray">
          ✕
        </button>
      </div>
    </div>
  );
}
