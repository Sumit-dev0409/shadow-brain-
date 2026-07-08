"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Minus, Maximize } from "lucide-react";

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
  highlightColor: string; // actual platform color, overrides random category color
  pulsePhase: number;
  elevSeed: number; // vertical spread within the rotating disc, gives it real depth
  z: number;        // depth after projection — used for perspective + draw-order sorting
  scale: number;    // perspective scale factor (near = >1, far = <1)
}

/** Convert a hex color to rgba(...) string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const COLORS = [
  "#f97316", // Claude AI — orange
  "#8b5cf6", // Copilot — purple
  "#374151", // ChatGPT — dark grey
  "#3b82f6", // Gemini — blue
];


const NODE_COUNT = 1000;
const CENTER_NODES = 8;
// Tilt of the whole node "disc" around the X-axis — turns the flat orbit into
// a real 3D plane so rotation reveals genuine depth (like a tilted galaxy).
const TILT = 1.05;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const DRAG_THRESHOLD = 3; // px of movement before a press counts as a drag, not a click

interface ObsidianGraphProps {
  searchKeyword: string;
  /** Map from node ID → platform hex color for nodes that have matching chat history */
  highlightedNodes?: Map<number, string>;
  /** Map from node ID → short date label e.g. "Jun 18" */
  nodeDates?: Map<number, string>;
  onNodeClick?: (nodeId: number, keyword: string) => void;
}

export function ObsidianGraph({ searchKeyword, highlightedNodes, nodeDates, onNodeClick }: ObsidianGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const searchRef = useRef<string>("");
  const highlightedNodesRef = useRef<Map<number, string>>(new Map());
  const nodeDatesRef = useRef<Map<number, string>>(new Map());
  const nodePositionsRef = useRef<Map<number, { x: number; y: number; radius: number }>>(new Map());
  const initSizeRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 });

  // Camera — plain refs (not state) so pan/zoom stay smooth at 60fps without re-renders
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const didDragRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const initNodes = useCallback((w: number, h: number) => {
    initSizeRef.current = { w, h };
    const cx = w / 2;
    const cy = h / 2;
    const nodes: Node[] = [];

    for (let i = 0; i < NODE_COUNT; i++) {
      const category = Math.floor(Math.random() * 4);
      const orbitRadius = 30 + Math.random() * Math.min(w, h) * 0.42;
      const orbitPhase = Math.random() * Math.PI * 2;
      const rotAngle = Math.random() * Math.PI * 2;
      const isCentral = i < CENTER_NODES;

      nodes.push({
        id: i,
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        radius: isCentral ? 4 + Math.random() * 3 : 1.5 + Math.random() * 2.5,
        color: COLORS[category],
        alpha: 0.5 + Math.random() * 0.5,
        category,
        connections: [],
        rotAngle,
        orbitRadius: isCentral ? 15 + Math.random() * 25 : orbitRadius,
        orbitSpeed: (0.04 + Math.random() * 0.12) * (Math.random() > 0.5 ? 1 : -1) * 0.001,
        orbitPhase,
        highlighted: false,
        highlightColor: "#4f8aff",
        pulsePhase: Math.random() * Math.PI * 2,
        elevSeed: Math.random() * 2 - 1,
        z: 0,
        scale: 1,
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
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      if (nodesRef.current.length === 0) {
        initNodes(w, h);
      }
    };

    resize();

    // ResizeObserver fires on ANY layout change (flex, panel open/close, window resize)
    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);
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
      const hNodes = highlightedNodesRef.current;

      // Update positions — real 3D: each node orbits in a disc (X/Z plane), the
      // disc is tilted toward the camera, then rotated over time and projected
      // with perspective so depth is genuine (near = bigger/brighter, far = smaller/dimmer).
      const globalRot = t * 0.04;
      const orbitScale = Math.min(W / initSizeRef.current.w, H / initSizeRef.current.h);
      const FOCAL = Math.min(W, H) * 0.9;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Set highlight state and the correct platform color
        const platformColor = hNodes.get(node.id);
        node.highlighted = hasSearch && platformColor !== undefined;
        if (node.highlighted) node.highlightColor = platformColor!;

        node.orbitPhase += node.orbitSpeed * dt;
        const wobble = Math.sin(t * 0.3 + node.pulsePhase) * 0.18;
        const effectiveRadius = node.orbitRadius * orbitScale * (1 + wobble * 0.1);
        const angle = node.orbitPhase + globalRot;

        // Local 3D position within the disc, before it's tilted toward the camera
        const localX = Math.cos(angle) * effectiveRadius;
        const localZ = Math.sin(angle) * effectiveRadius;
        const localY = node.elevSeed * effectiveRadius * 0.12 + Math.sin(t * 0.4 + node.pulsePhase) * 3;

        // Tilt around the X-axis so the disc's own rotation reveals real depth
        const rotY = localY * Math.cos(TILT) - localZ * Math.sin(TILT);
        const rotZ = localY * Math.sin(TILT) + localZ * Math.cos(TILT);

        const scale = FOCAL / (FOCAL + rotZ);
        node.z = rotZ;
        node.scale = scale;
        node.x = cx + localX * scale;
        node.y = cy + rotY * scale;
      }

      // Camera transform — user pan/zoom composes on top of the simulation's world
      // coordinates. Translate+scale (rather than setTransform) so it composes with
      // the devicePixelRatio scale already baked into the context by resize().
      const zoom = zoomRef.current;
      const pan = panRef.current;
      const camTx = cx * (1 - zoom) + pan.x;
      const camTy = cy * (1 - zoom) + pan.y;

      ctx.save();
      ctx.translate(camTx, camTy);
      ctx.scale(zoom, zoom);

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

          const depthFade = Math.max(0.3, Math.min(1.3, (node.scale + target.scale) / 2));
          const alpha = Math.max(0, 1 - dist / 300) * 0.15 * depthFade;
          const isHighlighted = node.highlighted && target.highlighted;

          if (isHighlighted) {
            ctx.strokeStyle = hexToRgba(node.highlightColor, 0.6 * depthFade);
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

      // Draw nodes — back-to-front (painter's algorithm) so nearer nodes correctly
      // overlap farther ones, completing the 3D illusion.
      const drawOrder = nodes.map((_, i) => i).sort((a, b) => nodes[b].z - nodes[a].z);
      for (const i of drawOrder) {
        const node = nodes[i];
        const pulse = Math.sin(t * 2 + node.pulsePhase) * 0.3 + 0.7;
        const depthAlpha = Math.max(0.35, Math.min(1.3, node.scale));
        const scaledRadius = node.radius * node.scale;

        ctx.save();

        if (node.highlighted) {
          const hc = node.highlightColor;
          // Glow ring using real platform color
          const glowRadius = scaledRadius * 3.5;
          const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
          glow.addColorStop(0, hexToRgba(hc, 0.9));
          glow.addColorStop(0.5, hexToRgba(hc, 0.3));
          glow.addColorStop(1, hexToRgba(hc, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();

          // Outer ring
          ctx.strokeStyle = hexToRgba(hc, 0.8);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(node.x, node.y, scaledRadius * 2 + 2, 0, Math.PI * 2);
          ctx.stroke();

          // Track for click detection (in screen space — mouse coords aren't
          // affected by the canvas transform, so convert world → screen here).
          nodePositionsRef.current.set(node.id, {
            x: node.x * zoom + camTx,
            y: node.y * zoom + camTy,
            radius: Math.max((glowRadius + 4) * zoom, 18),
          });
        }

        // Core dot — use platform color when highlighted
        const dotColor = node.highlighted ? node.highlightColor : node.color;
        const baseAlpha = (node.highlighted ? 1 : node.alpha * pulse) * depthAlpha;
        ctx.globalAlpha = Math.min(1, baseAlpha);
        ctx.fillStyle = dotColor;
        ctx.shadowBlur = (node.highlighted ? 12 : node.radius > 3 ? 6 : 3) * node.scale;
        ctx.shadowColor = dotColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, scaledRadius * (node.highlighted ? 1.4 : 1), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // Date labels for highlighted nodes
      if (hasSearch) {
        const dates = nodeDatesRef.current;
        ctx.save();
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (!node.highlighted) continue;
          const label = dates.get(node.id);
          if (!label) continue;

          const lx = node.x;
          const ly = node.y - node.radius * 2.2 - 4;

          // Pill background
          const tw = ctx.measureText(label).width;
          const pw = tw + 8;
          const ph = 13;
          ctx.save();
          ctx.globalAlpha = 0.82;
          ctx.fillStyle = node.highlightColor;
          ctx.beginPath();
          ctx.roundRect(lx - pw / 2, ly - ph, pw, ph, 4);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#07090f";
          ctx.fillText(label, lx, ly - 1);
          ctx.restore();
        }
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

      ctx.restore(); // end camera transform

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    // ── Pan (mouse drag) ────────────────────────────────────────────────────
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      didDragRef.current = false;
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
      canvas.style.cursor = "grabbing";
    };
    const onWindowMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) didDragRef.current = true;
      panRef.current = { x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy };
    };
    const onWindowMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      canvas.style.cursor = "default";
    };

    // ── Zoom (wheel, cursor-anchored) ───────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const ccx = w / 2;
      const ccy = h / 2;
      const oldZoom = zoomRef.current;
      const factor = Math.exp(-e.deltaY * 0.0012);
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));

      const oldTx = ccx * (1 - oldZoom) + panRef.current.x;
      const oldTy = ccy * (1 - oldZoom) + panRef.current.y;
      const worldX = (mx - oldTx) / oldZoom;
      const worldY = (my - oldTy) / oldZoom;

      panRef.current = {
        x: mx - worldX * newZoom - ccx * (1 - newZoom),
        y: my - worldY * newZoom - ccy * (1 - newZoom),
      };
      zoomRef.current = newZoom;
    };

    // ── Touch: one-finger pan, two-finger pinch zoom ────────────────────────
    const touchDist = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        didDragRef.current = false;
        const t0 = e.touches[0];
        dragStartRef.current = { x: t0.clientX, y: t0.clientY, panX: panRef.current.x, panY: panRef.current.y };
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false;
        pinchRef.current = { dist: touchDist(e.touches), zoom: zoomRef.current };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dist = touchDist(e.touches);
        const scaleFactor = dist / pinchRef.current.dist;
        zoomRef.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.zoom * scaleFactor));
      } else if (e.touches.length === 1 && isDraggingRef.current) {
        e.preventDefault();
        const t0 = e.touches[0];
        const dx = t0.clientX - dragStartRef.current.x;
        const dy = t0.clientY - dragStartRef.current.y;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) didDragRef.current = true;
        panRef.current = { x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy };
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      pinchRef.current = null;
      if (e.touches.length === 0) {
        isDraggingRef.current = false;
      } else if (e.touches.length === 1) {
        const t0 = e.touches[0];
        dragStartRef.current = { x: t0.clientX, y: t0.clientY, panX: panRef.current.x, panY: panRef.current.y };
      }
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [initNodes]);

  // Sync search keyword
  useEffect(() => {
    searchRef.current = searchKeyword;
  }, [searchKeyword]);

  // Sync highlighted nodes map
  useEffect(() => {
    highlightedNodesRef.current = highlightedNodes ?? new Map();
  }, [highlightedNodes]);

  // Sync node date labels map
  useEffect(() => {
    nodeDatesRef.current = nodeDates ?? new Map();
  }, [nodeDates]);

  // Returns the nodeId under the mouse, or null
  const hitTest = useCallback((e: React.MouseEvent<HTMLCanvasElement>): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (const [nodeId, nodePos] of nodePositionsRef.current.entries()) {
      const dx = nodePos.x - x;
      const dy = nodePos.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < nodePos.radius) return nodeId;
    }
    return null;
  }, []);

  // Pointer cursor only when hovering a highlighted node (skip while panning)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || isDraggingRef.current) return;
    canvas.style.cursor = hitTest(e) !== null ? "pointer" : "grab";
  }, [hitTest]);

  // Handle canvas click — ignored if the mouse/touch just panned the camera
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (!onNodeClick) return;
    if (searchRef.current.trim().length < 2) return;
    const nodeId = hitTest(e);
    if (nodeId !== null) onNodeClick(nodeId, searchRef.current);
  }, [onNodeClick, hitTest]);

  const zoomBy = useCallback((factor: number) => {
    zoomRef.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor));
  }, []);
  const resetView = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          cursor: "grab",
        }}
      />

      {/* Floating zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
        <motion.button
          onClick={() => zoomBy(1.25)}
          title="Zoom in"
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: "rgba(17, 24, 39, 0.7)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
          whileHover={{ borderColor: "var(--border-glow)", color: "var(--text-primary)", boxShadow: "var(--shadow-glow-blue)" }}
          whileTap={{ scale: 0.9 }}
        >
          <Plus size={14} />
        </motion.button>
        <motion.button
          onClick={() => zoomBy(1 / 1.25)}
          title="Zoom out"
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: "rgba(17, 24, 39, 0.7)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
          whileHover={{ borderColor: "var(--border-glow)", color: "var(--text-primary)", boxShadow: "var(--shadow-glow-blue)" }}
          whileTap={{ scale: 0.9 }}
        >
          <Minus size={14} />
        </motion.button>
        <motion.button
          onClick={resetView}
          title="Reset view"
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: "rgba(17, 24, 39, 0.7)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
          whileHover={{ borderColor: "var(--border-glow)", color: "var(--text-primary)", boxShadow: "var(--shadow-glow-blue)" }}
          whileTap={{ scale: 0.9 }}
        >
          <Maximize size={14} />
        </motion.button>
      </div>
    </div>
  );
}
