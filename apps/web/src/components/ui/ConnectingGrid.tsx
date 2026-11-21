'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface GridNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  colorIndex: number;
  pulsePhase: number;
}

interface GridPacket {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  color: string;
  life: number;
  maxLife: number;
  trail: Array<{ x: number; y: number }>;
}

interface PulseWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

const NODE_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f472b6'];

export interface ConnectingGridProps {
  children?: ReactNode;
  className?: string;
}

export function ConnectingGrid({ children, className = '' }: ConnectingGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!container || !canvas || !ctx) return undefined;

    const reduceMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const GRID_SIZE = 48;
    const NODE_COUNT = 44;
    const CONNECT_DIST = 175;
    const CURSOR_DIST = 210;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let isVisible = true;

    const pointer = {
      x: -9999,
      y: -9999,
      targetX: -9999,
      targetY: -9999,
      active: false,
    };

    const nodes: GridNode[] = [];
    const packets: GridPacket[] = [];
    const waves: PulseWave[] = [];

    const spawnPacket = (forcedColor?: string) => {
      if (packets.length > 18) return;
      const horizontal = Math.random() > 0.45;
      const cols = Math.max(2, Math.floor(width / GRID_SIZE));
      const rows = Math.max(2, Math.floor(height / GRID_SIZE));
      const snapX = Math.floor(Math.random() * cols) * GRID_SIZE;
      const snapY = Math.floor(Math.random() * rows) * GRID_SIZE;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const color =
        forcedColor ??
        NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)];

      packets.push({
        x: snapX,
        y: snapY,
        dx: horizontal ? dir : 0,
        dy: horizontal ? 0 : dir,
        speed: 2.2 + Math.random() * 1.8,
        color,
        life: 0,
        maxLife: 95 + Math.floor(Math.random() * 70),
        trail: [],
      });
    };

    const initNodes = () => {
      nodes.length = 0;
      for (let i = 0; i < NODE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.25 + Math.random() * 0.45;
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1.8 + Math.random() * 1.6,
          colorIndex: i % NODE_COLORS.length,
          pulsePhase: Math.random() * Math.PI * 2,
        });
      }
    };

    const resize = () => {
      const nextW = Math.max(1, container.clientWidth);
      const nextH = Math.max(1, container.clientHeight);
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (
        nextW === width &&
        nextH === height &&
        nextDpr === dpr &&
        nodes.length > 0
      ) {
        return;
      }
      width = nextW;
      height = nextH;
      dpr = nextDpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (nodes.length === 0) {
        initNodes();
        for (let i = 0; i < 6; i++) spawnPacket();
      }
      drawFrame(performance.now());
    };

    const drawFrame = (now: number) => {
      ctx.clearRect(0, 0, width, height);

      const time = now * 0.001;
      const highlightRgb = '56, 189, 248';

      // Smooth cursor interpolation
      if (pointer.active) {
        pointer.x += (pointer.targetX - pointer.x) * 0.18;
        pointer.y += (pointer.targetY - pointer.y) * 0.18;
      }

      // 1. Orthogonal Grid Lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.13)';
      ctx.beginPath();
      for (let x = 0; x <= width; x += GRID_SIZE) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += GRID_SIZE) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // 2. Glowing Grid Intersections (+) near cursor or shockwaves
      for (let x = GRID_SIZE; x < width; x += GRID_SIZE) {
        for (let y = GRID_SIZE; y < height; y += GRID_SIZE) {
          let boost = 0;
          if (pointer.active) {
            const d = Math.hypot(x - pointer.x, y - pointer.y);
            if (d < CURSOR_DIST) {
              boost = Math.max(boost, (1 - d / CURSOR_DIST) * 0.9);
            }
          }
          for (const w of waves) {
            const distToRing = Math.abs(Math.hypot(x - w.x, y - w.y) - w.radius);
            if (distToRing < 48) {
              boost = Math.max(boost, (1 - distToRing / 48) * w.alpha);
            }
          }

          if (boost > 0.04) {
            const arm = 4 + boost * 3.5;
            ctx.strokeStyle = `rgba(${highlightRgb}, ${0.28 + boost * 0.7})`;
            ctx.beginPath();
            ctx.moveTo(x - arm, y);
            ctx.lineTo(x + arm, y);
            ctx.moveTo(x, y - arm);
            ctx.lineTo(x, y + arm);
            ctx.stroke();
          } else {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.32)';
            ctx.fillRect(x - 1, y - 1, 2.2, 2.2);
          }
        }
      }

      // 3. Grid Circuit Packets (traveling along grid lines)
      if (!reduceMotion && Math.random() < 0.14) {
        spawnPacket();
      }
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        if (!reduceMotion) {
          p.trail.unshift({ x: p.x, y: p.y });
          if (p.trail.length > 14) p.trail.pop();
          p.x += p.dx * p.speed;
          p.y += p.dy * p.speed;
          p.life += 1;

          // Occasional 90-degree turn at grid intersection
          if (
            Math.abs(p.x % GRID_SIZE) < p.speed &&
            Math.abs(p.y % GRID_SIZE) < p.speed &&
            Math.random() < 0.18
          ) {
            p.x = Math.round(p.x / GRID_SIZE) * GRID_SIZE;
            p.y = Math.round(p.y / GRID_SIZE) * GRID_SIZE;
            if (p.dx !== 0) {
              p.dx = 0;
              p.dy = Math.random() > 0.5 ? 1 : -1;
            } else {
              p.dy = 0;
              p.dx = Math.random() > 0.5 ? 1 : -1;
            }
          }
        }

        const fade = Math.sin((p.life / p.maxLife) * Math.PI);
        if (
          p.life >= p.maxLife ||
          p.x < -20 ||
          p.x > width + 20 ||
          p.y < -20 ||
          p.y > height + 20
        ) {
          packets.splice(i, 1);
          continue;
        }

        if (p.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          for (const t of p.trail) ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = Math.max(0.05, fade * 0.55);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = Math.max(0.1, fade);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 4. Update & Connect Floating Nodes
      for (const n of nodes) {
        if (!reduceMotion) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 12 || n.x > width - 12) n.vx *= -1;
          if (n.y < 12 || n.y > height - 12) n.vy *= -1;

          if (pointer.active) {
            const dx = pointer.x - n.x;
            const dy = pointer.y - n.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 24 && dist < CURSOR_DIST) {
              n.x += (dx / dist) * 0.35;
              n.y += (dy / dist) * 0.35;
            }
          }
        }
      }

      // Node-to-node connections
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < CONNECT_DIST) {
            const alpha = (1 - d / CONNECT_DIST) * 0.68;
            ctx.strokeStyle = `rgba(${highlightRgb}, ${alpha})`;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }

        // Node-to-cursor connections
        if (pointer.active) {
          const dc = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (dc < CURSOR_DIST) {
            const alpha = (1 - dc / CURSOR_DIST) * 0.9;
            ctx.strokeStyle = `rgba(${highlightRgb}, ${alpha})`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }
      }

      // Draw Nodes
      for (const n of nodes) {
        const pulse = 0.65 + 0.35 * Math.sin(time * 2.4 + n.pulsePhase);
        const nodeColor = NODE_COLORS[n.colorIndex];

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.globalAlpha = 0.26 * pulse;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 1.15, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.globalAlpha = 0.95;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 5. Click / Hub Shockwaves
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.radius += 5.5;
        w.alpha = Math.max(0, 1 - w.radius / w.maxRadius);
        if (w.alpha <= 0.02) {
          waves.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
        ctx.strokeStyle = w.color;
        ctx.globalAlpha = w.alpha * 0.45;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (!reduceMotion && isVisible) {
        raf = window.requestAnimationFrame(drawFrame);
      }
    };

    resize();
    raf = window.requestAnimationFrame(drawFrame);

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.targetX = e.clientX - rect.left;
      pointer.targetY = e.clientY - rect.top;
      if (!pointer.active) {
        pointer.x = pointer.targetX;
        pointer.y = pointer.targetY;
      }
      pointer.active = true;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const color = '#38bdf8';
      waves.push({
        x,
        y,
        radius: 8,
        maxRadius: Math.max(width, height) * 0.65,
        color,
        alpha: 0.85,
      });
      for (let i = 0; i < 4; i++) spawnPacket(color);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry?.isIntersecting ?? true;
        if (isVisible && !reduceMotion) {
          window.cancelAnimationFrame(raf);
          raf = window.requestAnimationFrame(drawFrame);
        }
      },
      { threshold: 0.05 },
    );
    intersectionObserver.observe(container);

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('click', onClick);

    return () => {
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-3xl border border-white/15 bg-slate-950/65 shadow-2xl shadow-sky-950/40 backdrop-blur-md ${className}`}
    >
      {/* Interactive Connecting Grid Canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Subtle Radial Vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,0.12),transparent_68%)]"
      />

      {/* Corner Grid Crosshair Accents */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-4 left-4 font-mono text-xs text-sky-400/50"
      >
        + GRID::NODE_01
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-4 right-4 font-mono text-xs text-sky-400/50"
      >
        SYNC::ONLINE +
      </span>

      {/* Foreground Content */}
      <div className="relative z-10 px-6 py-12 sm:px-12 sm:py-16">
        {children}
      </div>
    </div>
  );
}
