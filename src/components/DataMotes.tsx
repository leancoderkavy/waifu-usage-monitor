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

/** Rising data shards on a canvas behind everything, tinted by her HUD colour. */
export default function DataMotes({ density = 36, color = "#35c7e8" }: { density?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
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
    const petals = Array.from({ length: density }, () => spawn(true));

    const draw = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = 0.35 + Math.abs(Math.sin(p.phase)) * 0.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = color;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      const s = p.size * 0.6;
      ctx.beginPath();
      if (p.size > 10) {
        // hexagon
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        }
        ctx.closePath();
        ctx.stroke();
      } else {
        // diamond shard
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.5, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];
        p.phase += 0.02;
        p.angle += p.spin;
        p.y -= p.speed * 0.6;
        p.x += Math.sin(p.phase) * p.drift * 0.4;
        if (p.y < -20) petals[i] = spawn(false);
        draw(p);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density, color]);

  return <canvas ref={ref} className="motes" />;
}
