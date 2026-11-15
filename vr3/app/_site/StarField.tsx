'use client';

import { useEffect, useRef } from 'react';

/**
 * Deep space behind How to Play (2026-11-15: "a simple space feeling background with floating particles, like the
 * background in superspace when playing the level"). Super Space's air in the game (play/src/showcase.ts, SHOWS.space):
 * square pixel stars in white, cyan, pink and lilac, drifting left, some twinkling; here in three depths so the near ones
 * pass quicker, and now and then a shooting star. It only runs while on screen; with reduced motion it is a still sky.
 */
const COLOURS = ['#ffffff', '#ffffff', '#7df3ff', '#ff8ae6', '#cfc4ff'];
const LAYERS = [
  { share: 0.55, size: 1, speed: 6, alpha: 0.5 },      // far: small, slow, dim
  { share: 0.33, size: 2, speed: 16, alpha: 0.75 },
  { share: 0.12, size: 3, speed: 34, alpha: 1 },       // near
];

interface Star { x: number; y: number; layer: number; colour: string; phase: number; twinkle: number }
interface Streak { x: number; y: number; life: number }

export function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current, g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, stars: Star[] = [], streak: Streak | null = null, frame = 0, last = 0, onScreen = false, nextStreak = 3;

    const scatter = () => {
      const box = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio, 2);
      w = box.width; h = box.height;
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.round(Math.min(260, (w * h) / 5200));
      stars = Array.from({ length: count }, () => {
        const pick = Math.random();
        const layer = pick < LAYERS[0].share ? 0 : pick < LAYERS[0].share + LAYERS[1].share ? 1 : 2;
        return { x: Math.random() * w, y: Math.random() * h, layer, colour: COLOURS[(Math.random() * COLOURS.length) | 0], phase: Math.random() * Math.PI * 2, twinkle: Math.random() < 0.4 ? 1.5 + Math.random() * 2.5 : 0 };
      });
    };

    const draw = (t: number, dt: number) => {
      g.clearRect(0, 0, w, h);
      for (const star of stars) {
        const layer = LAYERS[star.layer];
        star.x -= layer.speed * dt;
        if (star.x < -4) { star.x = w + 4; star.y = Math.random() * h; }
        const glint = star.twinkle ? 0.55 + 0.45 * Math.sin(t * star.twinkle + star.phase) : 1;
        g.globalAlpha = layer.alpha * glint;
        g.fillStyle = star.colour;
        g.fillRect(Math.round(star.x), Math.round(star.y), layer.size, layer.size);
        if (star.layer === 2 && glint > 0.85) {      // (the near ones catch the light: a small plus)
          g.globalAlpha = 0.35 * glint;
          g.fillRect(Math.round(star.x) - 2, Math.round(star.y) + 1, layer.size + 4, 1);
          g.fillRect(Math.round(star.x) + 1, Math.round(star.y) - 2, 1, layer.size + 4);
        }
      }
      // now and then, a shooting star across the top half
      nextStreak -= dt;
      if (!streak && nextStreak <= 0) { streak = { x: w * (0.4 + Math.random() * 0.6), y: h * Math.random() * 0.5, life: 0 }; nextStreak = 5 + Math.random() * 6; }
      if (streak) {
        streak.life += dt;
        const p = streak.life / 0.9, x = streak.x - p * w * 0.35, y = streak.y + p * h * 0.12;
        const trail = g.createLinearGradient(x, y, x + 90, y - 30);
        trail.addColorStop(0, '#ffffff'); trail.addColorStop(1, '#7df3ff00');
        g.globalAlpha = Math.sin(Math.min(1, p) * Math.PI);
        g.strokeStyle = trail; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 90, y - 30); g.stroke();
        if (p >= 1) streak = null;
      }
      g.globalAlpha = 1;
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      draw(now / 1000, dt);
    };
    const run = (on: boolean) => {
      onScreen = on;
      if (on && !still && !frame) { last = 0; frame = requestAnimationFrame(tick); }
      if (!on && frame) { cancelAnimationFrame(frame); frame = 0; }
    };

    scatter(); draw(0, 0);
    const resized = new ResizeObserver(() => { scatter(); if (!onScreen || still) draw(0, 0); });
    resized.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => run(entry.isIntersecting));
    seen.observe(canvas);
    return () => { cancelAnimationFrame(frame); resized.disconnect(); seen.disconnect(); };
  }, []);

  return <canvas ref={ref} className="star-field" aria-hidden />;
}
