import { useEffect, useRef } from "react";

interface Petal {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  spin: number;
  angle: number;
  phase: number;
}

/**
 * Rising data shards on a canvas behind everything, tinted by her HUD colour.
 * `fps` caps the redraw rate; 0 stops drawing (window hidden).
 */
export default function DataMotes({ density = 36, color = "#35c7e8", fps = 30 }: { density?: number; color?: string; fps?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motes = useRef<Petal[]>([]);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;

    const resize = () => {
      // Soft motes gain nothing from HiDPI; 1x keeps the fill cost low.
      const dpr = 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const spawn = (anywhere: boolean): Petal => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 20,
      size: 6 + Math.random() * 8,
      speed: 0.4 + Math.random() * 0.9,
      drift: 0.3 + Math.random() * 0.8,
      spin: (Math.random() - 0.5) * 0.04,
      angle: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
    });
    // Kept across re-runs so a frame-rate change (focus, blur) doesn't reshuffle them.
    if (motes.current.length !== density) motes.current = Array.from({ length: density }, () => spawn(true));
    const petals = motes.current;

    const draw = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      const alpha = 0.35 + Math.abs(Math.sin(p.phase)) * 0.5;
      ctx.strokeStyle = color;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      const s = p.size * 0.6;
      ctx.beginPath();
      if (p.size > 10) {
        // hexagon
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        }
        ctx.closePath();
      } else {
        // diamond shard
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.5, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.5, 0);
        ctx.closePath();
        ctx.globalAlpha = alpha;
        ctx.fill();
      }
      // Cheap glow: a wide faint stroke under the crisp one, instead of shadowBlur.
      ctx.globalAlpha = alpha * 0.25;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    };

    // A timer at `fps` instead of requestAnimationFrame, which would redraw at
    // the display's full rate. Movement scales with elapsed time so the motes
    // keep the same speed at any frame rate.
    let timer = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const k = Math.min((now - last) / (1000 / 60), 6);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];
        p.phase += 0.02 * k;
        p.angle += p.spin * k;
        p.y -= p.speed * 0.6 * k;
        p.x += Math.sin(p.phase) * p.drift * 0.4 * k;
        if (p.y < -20) petals[i] = spawn(false);
        draw(p);
      }
    };
    if (fps > 0) {
      tick();
      timer = window.setInterval(tick, 1000 / fps);
    }

    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", resize);
    };
  }, [density, color, fps]);

  return <canvas ref={ref} className="motes" />;
}
