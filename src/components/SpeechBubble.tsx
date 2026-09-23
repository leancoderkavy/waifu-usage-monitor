import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

interface Props {
  name: string;
  text: string;
  onTyping: (typing: boolean) => void;
}

/** Visual-novel style bubble that types the line out. */
export default function SpeechBubble({ name, text, onTyping }: Props) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    setShown("");
    onTyping(true);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        onTyping(false);
      }
    }, 24);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const done = shown.length >= text.length;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={text}
        className="bubble"
        initial={{ opacity: 0, y: 14, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
      >
        <div className="bubble-name">{name}</div>
        <p>
          {shown}
          {!done && <span className="caret">▍</span>}
        </p>
        {done && (
          <motion.span
            className="bubble-next"
            animate={{ y: [0, 3, 0] }}
            transition={{ repeat: Infinity, duration: 0.9 }}
          >
            ▼
          </motion.span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
