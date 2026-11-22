import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { trackAnchor } from "../tour-anchor";
import { resolveTourSteps, tourStepsKey } from "../tour-steps";
import "./FeatureTour.css";

export interface TourStep {
  /** CSS selector of the element to point at; the step is skipped when it is missing. */
  target: string;
  title: string;
  body: string;
}

const KEY = "kosmos.tours";

type Seen = Record<string, number>;

function readSeen(): Seen {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/** True once this tour version was finished or dismissed. Storage failure counts as unseen. */
export function tourSeen(id: string, version: number): boolean {
  return (readSeen()[id] ?? 0) >= version;
}

function markSeen(id: string, version: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readSeen(), [id]: version }));
  } catch {
    /* tour stays optional */
  }
}

/**
 * Small non-blocking tour popover. Steps point at CSS selectors, missing
 * targets are skipped, and closing (Skip, Done, Esc) records the version so it
 * only reopens through the replay button or a bumped `version`.
 */
export default function FeatureTour({
  id,
  version,
  steps,
  open,
  onClose,
}: {
  id: string;
  version: number;
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState<TourStep[]>([]);
  const card = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  const exists = (target: string) => document.querySelector(target) !== null;

  // Resolve targets when opened; drop steps whose element isn't on screen.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const found = resolveTourSteps(steps, 0, exists);
    setReady(found.ready);
    setIndex(found.index);
    if (found.ready.length === 0) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The page behind an open tour can change (e.g. Apple Music disconnects and
  // the transport controls give way to an Open button): re-resolve against the
  // new steps so the card never describes or rings controls that are gone.
  const stepsKey = tourStepsKey(steps);
  const resolvedKey = useRef(stepsKey);
  useEffect(() => {
    if (!open) {
      resolvedKey.current = stepsKey;
      return;
    }
    if (resolvedKey.current === stepsKey) return;
    resolvedKey.current = stepsKey;
    const found = resolveTourSteps(steps, index, exists);
    setReady(found.ready);
    setIndex(found.index);
    if (found.ready.length === 0) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepsKey]);

  const close = useCallback(() => {
    markSeen(id, version);
    onClose();
    (opener.current as HTMLElement | null)?.focus?.();
  }, [id, version, onClose]);

  const step = ready[index];
  useLayoutEffect(() => {
    if (!open || !step) return;
    const place = () => setRect(document.querySelector(step.target)?.getBoundingClientRect() ?? null);
    place();
    // Follow the target through resizes and scrolling (the narrow layout scrolls `main`).
    return trackAnchor(window, document.querySelector(step.target), place);
  }, [open, step]);

  useEffect(() => {
    if (open && step) card.current?.focus();
  }, [open, step]);

  if (!open || !step) return null;
  const last = index === ready.length - 1;
  const width = Math.min(300, window.innerWidth - 24);
  // Sit under the target, clamped to the window; flip above when there's no room.
  const left = rect ? Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) : 12;
  const below = rect ? rect.bottom + 10 : 80;
  const top = rect && below + 170 > window.innerHeight ? Math.max(12, rect.top - 180) : below;

  return (
    <>
      {rect && (
        <div
          className="tour-ring"
          aria-hidden
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-label={`${step.title}, step ${index + 1} of ${ready.length}`}
        tabIndex={-1}
        style={{ left, top, width }}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          else if (e.key === "ArrowRight" && !last) setIndex(index + 1);
          else if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
        }}
      >
        <small aria-live="polite">
          Tour · {index + 1}/{ready.length}
        </small>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="btn small ghost" onClick={close}>
            Skip
          </button>
          <span />
          {index > 0 && (
            <button className="btn small" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button className="btn small primary" onClick={() => (last ? close() : setIndex(index + 1))}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
