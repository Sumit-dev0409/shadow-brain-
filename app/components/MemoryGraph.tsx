"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { MemoryGraphData, MemoryNode, MemoryCategory } from "@/app/types";

interface MemoryGraphProps {
  data: MemoryGraphData;
  onExplore?: (label: string) => void;
}

const COLORS: Record<MemoryCategory, string> = {
  core: "#eaf2ff",
  task: "#f5a623",
  idea: "#4f8aff",
  note: "#8b5cf6",
  reminder: "#fb7185",
};

const LABELS: Record<MemoryCategory, string> = {
  core: "Topic",
  task: "Task",
  idea: "Idea",
  note: "Note",
  reminder: "Reminder",
};

interface LaidOutNode extends MemoryNode {
  x: number;
  y: number;
  phase: number;
}

/** Deterministic 0..1 pseudo-random from a string, so the ambient field is stable across renders. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Runs a tiny force simulation in normalized (-1..1) space and caches the result per dataset. */
function computeLayout(data: MemoryGraphData): { nodes: LaidOutNode[]; edgeKey: Set<string> } {
  const categories: MemoryCategory[] = ["task", "idea", "note", "reminder"];
  const sim = data.nodes.map((n) => {
    if (n.id === data.coreId) return { ...n, x: 0, y: 0, vx: 0, vy: 0 };
    const idx = categories.indexOf(n.category);
    const angle = (idx / categories.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
    const radius = 80 + Math.random() * 70;
    return { ...n, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0, angle };
  });

  const byId = new Map(sim.map((n) => [n.id, n]));
  const edges = data.edges;

  for (let iter = 0; iter < 140; iter++) {
    // Repulsion between every pair (cheap at this node count).
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i];
        const b = sim[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 0.01;
        if (distSq > 220 * 220) continue;
        const dist = Math.sqrt(distSq);
        const force = 420 / distSq;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        if (a.id !== data.coreId) {
          a.vx -= dx;
          a.vy -= dy;
        }
        if (b.id !== data.coreId) {
          b.vx += dx;
          b.vy += dy;
        }
      }
    }

    // Spring attraction along edges.
    edges.forEach((e) => {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) return;
      const isCoreEdge = e.source === data.coreId || e.target === data.coreId;
      const desired = isCoreEdge ? 100 : 55;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const force = (dist - desired) * 0.02;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (a.id !== data.coreId) {
        a.vx += fx;
        a.vy += fy;
      }
      if (b.id !== data.coreId) {
        b.vx -= fx;
        b.vy -= fy;
      }
    });

    sim.forEach((n) => {
      if (n.id === data.coreId) return;
      // Weak angular keep — keeps each category in its own sector, spoke-like.
      const targetX = Math.cos((n as { angle?: number }).angle ?? 0) * 130;
      const targetY = Math.sin((n as { angle?: number }).angle ?? 0) * 130;
      n.vx += (targetX - n.x) * 0.0009;
      n.vy += (targetY - n.y) * 0.0009;

      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
    });
  }

  let maxDist = 1;
  sim.forEach((n) => {
    const d = Math.sqrt(n.x * n.x + n.y * n.y);
    if (d > maxDist) maxDist = d;
  });

  const nodes: LaidOutNode[] = sim.map((n) => ({
    ...n,
    x: n.x / maxDist,
    y: n.y / maxDist,
    phase: Math.random() * Math.PI * 2,
  }));

  const edgeKey = new Set(edges.map((e) => `${e.source}|${e.target}`));
  return { nodes, edgeKey };
}

export function MemoryGraph({ data, onExplore }: MemoryGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 640, height: 360 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const { nodes, edgeKey } = useMemo(() => computeLayout(data), [data]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // A handful of faint, static background motes — pure atmosphere, not data.
  const ambientDots = useMemo(() => {
    const palette = ["#4f8aff", "#f5a623", "#8b5cf6", "#fb7185"];
    return Array.from({ length: 26 }, (_, i) => ({
      x: hash(`amb-x-${i}`) * 2 - 1,
      y: hash(`amb-y-${i}`) * 2 - 1,
      r: 0.6 + hash(`amb-r-${i}`) * 1.1,
      color: palette[Math.floor(hash(`amb-c-${i}`) * palette.length)],
      o: 0.05 + hash(`amb-o-${i}`) * 0.1,
    }));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setBox({ width, height: Math.max(280, Math.min(380, width * 0.52)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toScreen = useCallback(
    (n: { x: number; y: number }, t: number, phase: number) => {
      const pad = 36;
      const w = box.width - pad * 2;
      const h = box.height - pad * 2;
      const driftX = Math.cos(t * 0.0006 + phase) * 0.01;
      const driftY = Math.sin(t * 0.0007 + phase) * 0.01;
      return {
        sx: pad + ((n.x + driftX + 1) / 2) * w,
        sy: pad + ((n.y + driftY + 1) / 2) * h,
      };
    },
    [box]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = box.width * dpr;
    canvas.height = box.height * dpr;
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const render = (t: number) => {
      ctx.clearRect(0, 0, box.width, box.height);
      const tEff = reducedMotion ? 0 : t;

      const screenOf = (n: LaidOutNode) => toScreen(n, tEff, n.phase);

      // Ambient motes — pure atmosphere, drawn first so everything else sits on top.
      const pad = 36;
      const w = box.width - pad * 2;
      const h = box.height - pad * 2;
      ambientDots.forEach((d) => {
        const sx = pad + ((d.x + 1) / 2) * w;
        const sy = pad + ((d.y + 1) / 2) * h;
        ctx.beginPath();
        ctx.arc(sx, sy, d.r, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.globalAlpha = d.o;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // Faint mesh edges first.
      data.edges.forEach((e) => {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) return;
        const isCoreEdge = e.source === data.coreId || e.target === data.coreId;
        if (isCoreEdge) return;
        const isHoveredEdge = hoveredId && (e.source === hoveredId || e.target === hoveredId);
        const pa = screenOf(a);
        const pb = screenOf(b);
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.strokeStyle = isHoveredEdge ? "rgba(180,200,255,0.35)" : "rgba(110,135,255,0.08)";
        ctx.lineWidth = isHoveredEdge ? 1.4 : 0.8;
        ctx.stroke();
      });

      // Bright spokes from the core.
      data.edges.forEach((e) => {
        const isCoreEdge = e.source === data.coreId || e.target === data.coreId;
        if (!isCoreEdge) return;
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) return;
        const other = a.id === data.coreId ? b : a;
        const isHoveredEdge = hoveredId && (e.source === hoveredId || e.target === hoveredId);
        const pa = screenOf(a);
        const pb = screenOf(b);
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        const grad = ctx.createLinearGradient(pa.sx, pa.sy, pb.sx, pb.sy);
        grad.addColorStop(0, "rgba(125,170,255,0.55)");
        grad.addColorStop(1, `${COLORS[other.category]}66`);
        ctx.strokeStyle = isHoveredEdge ? "rgba(200,215,255,0.9)" : grad;
        ctx.lineWidth = isHoveredEdge ? 2 : 1.1;
        ctx.stroke();
      });

      // Nodes on top.
      nodes.forEach((n) => {
        const { sx, sy } = screenOf(n);
        const isCore = n.id === data.coreId;
        const isHovered = n.id === hoveredId;
        const isNeighbor =
          hoveredId &&
          (edgeKey.has(`${hoveredId}|${n.id}`) || edgeKey.has(`${n.id}|${hoveredId}`));
        const r = isCore ? 9 : 3.2 + n.weight * 3.4;

        if (isCore) {
          const pulse = 0.5 + Math.sin(tEff * 0.0022) * 0.18;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 10, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(125,180,255,${0.12 * pulse})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[n.category];
        ctx.globalAlpha = hoveredId && !isHovered && !isNeighbor && !isCore ? 0.35 : 1;
        ctx.shadowColor = COLORS[n.category];
        ctx.shadowBlur = isHovered || isCore ? 10 : 3;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (isHovered) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      });

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [box, nodes, nodeById, data, hoveredId, edgeKey, toScreen, reducedMotion, ambientDots]);

  const pickNodeAt = useCallback(
    (mx: number, my: number): LaidOutNode | null => {
      let closest: LaidOutNode | null = null;
      let closestDist = Infinity;
      nodes.forEach((n) => {
        const { sx, sy } = toScreen(n, performance.now(), n.phase);
        const d = Math.hypot(sx - mx, sy - my);
        const hitR = (n.id === data.coreId ? 9 : 3.2 + n.weight * 3.4) + 6;
        if (d < hitR && d < closestDist) {
          closest = n;
          closestDist = d;
        }
      });
      return closest;
    },
    [nodes, toScreen, data.coreId]
  );

  const eventPoint = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const point = "touches" in e ? e.touches[0] ?? e.changedTouches[0] : e;
    if (!point) return null;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = eventPoint(e);
    if (!p) return;
    const hit = pickNodeAt(p.x, p.y);
    if (hit) {
      setHoveredId(hit.id);
      setTooltipPos({ x: p.x, y: p.y });
    } else {
      setHoveredId(null);
      setTooltipPos(null);
    }
  };

  const handleTap = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const p = eventPoint(e);
    if (!p) return;
    const hit = pickNodeAt(p.x, p.y);
    if (hit && hit.id !== data.coreId) {
      onExplore?.(hit.label);
    }
    // Touch devices get tap feedback (tooltip) without a lingering hover state.
    if ("touches" in e) {
      setHoveredId(hit ? hit.id : null);
      setTooltipPos(hit ? p : null);
    }
  };

  const hoveredNode = hoveredId ? nodeById.get(hoveredId) : null;
  const coreLabel = nodeById.get(data.coreId)?.label ?? "Memory";
  const connectionCount = data.nodes.length - 1;

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden"
        role="img"
        aria-label={`Memory map for "${coreLabel}" with ${connectionCount} connected memories. Visual only — ask me about any of them directly.`}
        style={{ background: "radial-gradient(circle at 50% 45%, #0d1424 0%, #07090f 75%)", border: "1px solid var(--border-subtle)" }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMove}
          onMouseLeave={() => {
            setHoveredId(null);
            setTooltipPos(null);
          }}
          onClick={handleTap}
          onTouchStart={handleTap}
          style={{ display: "block", cursor: hoveredNode && hoveredNode.id !== data.coreId ? "pointer" : "default" }}
        />

        {hoveredNode && tooltipPos && (
          <div
            className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg text-[11px] leading-tight whitespace-nowrap"
            style={{
              left: Math.min(Math.max(tooltipPos.x, 70), box.width - 70),
              top: Math.max(tooltipPos.y - 16, 10),
              transform: "translate(-50%, -100%)",
              background: "rgba(12,16,24,0.95)",
              border: `1px solid ${COLORS[hoveredNode.category]}55`,
              color: "var(--text-primary)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
              maxWidth: 220,
              whiteSpace: "normal",
            }}
          >
            <span style={{ color: COLORS[hoveredNode.category], fontWeight: 600 }}>
              {LABELS[hoveredNode.category]}
            </span>
            {" — "}
            {hoveredNode.label}
          </div>
        )}
      </div>

      {/* Legend + caption */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 px-0.5">
        {(["task", "idea", "note", "reminder"] as MemoryCategory[]).map((c) => (
          <div key={c} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[c] }} />
            <span className="text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
              {LABELS[c]}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <Sparkles size={11} style={{ color: "var(--text-muted)" }} />
          <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
            Click a memory to explore it
          </span>
        </div>
      </div>
    </div>
  );
}
