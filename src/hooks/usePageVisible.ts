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

/** Focused but untouched this long: treat it like the background. */
const ATTENTION_MS = 20_000;

/**
 * Frame rate the dashboard's animations may use: 30 fps while focused and in
 * use, 12 while it sits unfocused or untouched for 20 s, 0 while it is
 * minimized or in the tray. Any mouse or key input brings it back to 30.
 */
export function useFrameBudget(): number {
  const visible = usePageVisible();
  const [focused, setFocused] = useState(() => document.hasFocus());
  const [attentive, setAttentive] = useState(true);
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
  useEffect(() => {
    let timer = window.setTimeout(() => setAttentive(false), ATTENTION_MS);
    const poke = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAttentive(false), ATTENTION_MS);
      setAttentive(true);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    for (const e of events) window.addEventListener(e, poke, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, poke);
    };
  }, []);
  if (!visible) return 0;
  return focused && attentive ? FOCUSED_FPS : BACKGROUND_FPS;
}
