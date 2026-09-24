import { useEffect, useState } from "react";

/** True while the document is visible; false when the window is minimized or hidden to the tray. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

/** Idle animations don't need the display's full refresh rate. */
export const FOCUSED_FPS = 30;
const BACKGROUND_FPS = 12;

/**
 * Frame rate the dashboard's animations may use: 30 fps while focused, 12 while
 * the window sits unfocused on screen, 0 while it is minimized or in the tray.
 */
export function useFrameBudget(): number {
  const visible = usePageVisible();
  const [focused, setFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);
  if (!visible) return 0;
  return focused ? FOCUSED_FPS : BACKGROUND_FPS;
}
