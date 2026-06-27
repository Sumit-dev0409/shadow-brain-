"use client";

import { useEffect, useRef, useCallback } from "react";

interface Node {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  category: number;
  connections: number[];
  rotAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  highlighted: boolean;
  pulsePhase: number;
}

const COLORS = [
  "#f97316", // Claude AI — orange
  "#8b5cf6", // Copilot — purple
  "#ffffff", // ChatGPT — white
  "#3b82f6", // Gemini — blue
  "#facc15", // Grok — yellow
  "#3ddc97", // DeepSeek — mint green
  "#fb7185", // Perplexity — rose pink
  "#b87333", // BackBox — copper
];

const GLOW_COLORS = [
  "rgba(249,115,22,",   // Claude AI — orange
  "rgba(139,92,246,",   // Copilot — purple
  "rgba(255,255,255,",  // ChatGPT — white
  "rgba(59,130,246,",   // Gemini — blue
  "rgba(250,204,21,",   // Grok — yellow
  "rgba(61,220,151,",   // DeepSeek — mint green
  "rgba(251,113,133,",  // Perplexity — rose pink
  "rgba(184,115,51,",   // BackBox — copper
];

const NODE_COUNT = 1000;
const CENTER_NODES = 8;

interface ObsidianGraphProps {
  searchKeyword: string;
  /** Set of node IDs that should be highlighted (have actual chat history) */
  highlightedNodeIds?: Set<number>;
  onNodeClick?: (nodeId: number, keyword: string) => void;
}

export function ObsidianGraph({ searchKeyword, highlightedNodeIds, onNodeClick }: ObsidianGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const searchRef = useRef<string>("");
  const highlightedIdsRef = useRef<Set<number>>(new Set());
  const nodePositionsRef = useRef<Map<number, { x: number; y: number; radius: number }>>(new Map());

  const initNodes = useCallback((w: number, h: number) => {
    const cx = w / 2;
    const cy = h / 2;
    const nodes: Node[] = [];

    for (let i = 0; i < NODE_COUNT; i++) {
      const category = Math.floor(Math.random() * COLORS.length);
      const orbitRadius = 30 + Math.random() * Math.min(w, h) * 0.42;
      const orbitPhase = Math.random() * Math.PI * 2;
      const rotAngle = Math.random() * Math.PI * 2;
      const isCentral = i < CENTER_NODES;

      nodes.push({
        id: i,
        x: isCentral ? cx + (Math.random() - 0.5) * 60 : cx + Math.cos(orbitPhase) * orbitRadius,
        y: isCentral ? cy + (Math.random() - 0.5) * 60 : cy + Math.sin(orbitPhase) * orbitRadius,
        vx: 0,
        vy: 0,
        radius: isCentral ? 4 + Math.random() * 3 : 1.5 + Math.random() * 2.5,
        color: COLORS[category],
        alpha: 0.5 + Math.random() * 0.5,
        category,
        connections: [],
        rotAngle,
        orbitRadius: isCentral ? 0 : orbitRadius,
        orbitSpeed: (0.04 + Math.random() * 0.12) * (Math.random() > 0.5 ? 1 : -1) * 0.001,
        orbitPhase,
        highlighted: false,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // Build connections
    for (let i = 0; i < nodes.length; i++) {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < count; j++) {
        const target = Math.floor(Math.random() * nodes.length);
        if (target !== i && !nodes[i].connections.includes(target)) {
          nodes[i].connections.push(target);
        }
      }
      if (i >= CENTER_NODES && Math.random() < 0.15) {
        const centerTarget = Math.floor(Math.random() * CENTER_NODES);
        if (!nodes[i].connections.includes(centerTarget)) {
          nodes[i].connections.push(centerTarget);
        }
      }
    }

    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      initNodes(canvas.offsetWidth, canvas.offsetHeight);
    };

    resize();
    window.addEventListener("resize", resize);

    let lastTime = performance.now();

    const draw = (timestamp: number) => {
      const dt = Math.min(timestamp - lastTime, 32);
      lastTime = timestamp;
      timeRef.current += dt;
      const t = timeRef.current * 0.001;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      const cx = W / 2;
      const cy = H / 2;

      ctx.clearRect(0, 0, W, H);

      const nodes = nodesRef.current;
      const kw = searchRef.current.toLowerCase().trim();
      const hasSearch = kw.length > 1;
      const hIds = highlightedIdsRef.current;

      // Update positions
      const globalRot = t * 0.04;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Highlight only nodes that actually have matching chat history
        node.highlighted = hasSearch && hIds.has(node.id);

        if (node.orbitRadius > 0) {
          node.orbitPhase += node.orbitSpeed * dt;
          const wobble = Math.sin(t * 0.3 + node.pulsePhase) * 0.18;
          const effectiveRadius = node.orbitRadius * (1 + wobble * 0.1);
          node.x = cx + Math.cos(node.orbitPhase + globalRot) * effectiveRadius;
          node.y = cy + Math.sin(node.orbitPhase + globalRot) * effectiveRadius * (0.55 + Math.abs(Math.sin(t * 0.15 + node.pulsePhase)) * 0.15);
        } else {
          node.x += Math.sin(t * 0.5 + node.pulsePhase) * 0.3;
          node.y += Math.cos(t * 0.4 + node.pulsePhase) * 0.3;
        }
      }

      // Draw edges
      ctx.save();
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        for (const j of node.connections) {
          const target = nodes[j];
          const dx = target.x - node.x;
          const dy = target.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 300) continue;

          const alpha = Math.max(0, 1 - dist / 300) * 0.15;
          const isHighlighted = node.highlighted && target.highlighted;

          if (isHighlighted) {
            ctx.strokeStyle = GLOW_COLORS[node.category] + "0.6)";
            ctx.lineWidth = 1.2;
          } else {
            ctx.strokeStyle = `rgba(99,130,255,${alpha})`;
            ctx.lineWidth = 0.5;
          }

          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Clear tracked positions each frame — only track highlighted nodes
      nodePositionsRef.current.clear();

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const pulse = Math.sin(t * 2 + node.pulsePhase) * 0.3 + 0.7;

        ctx.save();

        if (node.highlighted) {
          // Glow ring
          const glowRadius = node.radius * 3.5;
          const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
          glow.addColorStop(0, GLOW_COLORS[node.category] + "0.9)");
          glow.addColorStop(0.5, GLOW_COLORS[node.category] + "0.3)");
          glow.addColorStop(1, GLOW_COLORS[node.category] + "0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();

          // Outer ring
          ctx.strokeStyle = GLOW_COLORS[node.category] + "0.8)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * 2 + 2, 0, Math.PI * 2);
          ctx.stroke();

          // Track for click detection
          nodePositionsRef.current.set(node.id, {
            x: node.x,
            y: node.y,
            radius: node.radius * 1.4 + 4, // generous hit area
          });
        }

        // Core dot
        const baseAlpha = node.highlighted ? 1 : node.alpha * pulse;
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = node.color;
        ctx.shadowBlur = node.highlighted ? 12 : node.radius > 3 ? 6 : 3;
        ctx.shadowColor = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * (node.highlighted ? 1.4 : 1), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // Center glow orb
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
      centerGlow.addColorStop(0, "rgba(79,138,255,0.18)");
      centerGlow.addColorStop(0.5, "rgba(139,92,246,0.06)");
      centerGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = centerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, 80, 0, Math.PI * 2);
      ctx.fill();

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [initNodes]);

  // Sync search keyword
  useEffect(() => {
    searchRef.current = searchKeyword;
  }, [searchKeyword]);

  // Sync highlighted IDs
  useEffect(() => {
    highlightedIdsRef.current = highlightedNodeIds ?? new Set();
  }, [highlightedNodeIds]);

  // Handle canvas click — only fires for highlighted nodes
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onNodeClick) return;
    if (searchRef.current.trim().length < 2) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const [nodeId, nodePos] of nodePositionsRef.current.entries()) {
      const dx = nodePos.x - x;
      const dy = nodePos.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nodePos.radius) {
        onNodeClick(nodeId, searchRef.current);
        return;
      }
    }
  }, [onNodeClick]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        cursor: "pointer",
      }}
    />
  );
}
