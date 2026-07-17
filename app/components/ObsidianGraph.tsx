"use client";

import { useRef, useMemo, useCallback, useEffect, useImperativeHandle, forwardRef, Suspense } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { motion } from "framer-motion";
import { Plus, Minus, Maximize } from "lucide-react";
import { seededRandom } from "../lib/brainGeometry";
import { buildGlobeWireframe, buildEquatorRing, fibonacciSpherePoints } from "../lib/wireframeGlobe";

const NODE_COUNT = 1000;
const CENTER_NODES = 8;
const CLUSTER_COUNT = 9;
const GLOBE_RADIUS = 1.6;
const HUB_SHELL = GLOBE_RADIUS * 0.96;
const MIN_DIST = 2.6;
const MAX_DIST = 8.5;
const DEFAULT_DIST = 4.6;
const ZOOM_NEAR = 3.4;
const ZOOM_FAR = 6.6;

export type ZoomLevel = "near" | "mid" | "far";

const COLORS = [
  "#f97316", // Claude AI — orange
  "#8b5cf6", // Copilot — purple
  "#94a3b8", // ChatGPT — light grey (visible against the dark void)
  "#3b82f6", // Gemini — blue
];

export interface ObsidianGraphHandle {
  focus: () => void;
}

interface ObsidianGraphProps {
  searchKeyword: string;
  /** Map from node ID → platform hex color for nodes that have matching chat history */
  highlightedNodes?: Map<number, string>;
  /** Map from node ID → short date label e.g. "Jun 18" */
  nodeDates?: Map<number, string>;
  onNodeClick?: (nodeId: number, keyword: string) => void;
  /** Freezes rotation, drag-orbit and zoom when true */
  locked?: boolean;
  onZoomLevelChange?: (level: ZoomLevel) => void;
}

interface NodeLayout {
  id: number;
  position: THREE.Vector3;
  color: string;
  radius: number;
  isCentral: boolean;
  connections: number[];
}

function buildNodeLayout(): NodeLayout[] {
  const rand = seededRandom(1337);
  const nodes: NodeLayout[] = [];

  // Core cluster — small nodes right at the center of the globe.
  for (let i = 0; i < CENTER_NODES; i++) {
    nodes.push({
      id: i,
      position: new THREE.Vector3(
        (rand() - 0.5) * GLOBE_RADIUS * 0.22,
        (rand() - 0.5) * GLOBE_RADIUS * 0.22,
        (rand() - 0.5) * GLOBE_RADIUS * 0.22
      ),
      color: "#bcd0ff",
      radius: 0.026 + rand() * 0.014,
      isCentral: true,
      connections: [],
    });
  }

  // Starburst cluster hubs, evenly spread across the globe surface.
  const hubPositions = fibonacciSpherePoints(CLUSTER_COUNT, HUB_SHELL);
  const hubIds: number[] = [];
  hubPositions.forEach((pos, i) => {
    const id = nodes.length;
    hubIds.push(id);
    nodes.push({
      id,
      position: pos,
      color: COLORS[i % COLORS.length],
      radius: 0.05 + rand() * 0.012,
      isCentral: false,
      connections: [],
    });
  });

  // Distribute the remaining budget across hubs with varied burst sizes.
  const remaining = NODE_COUNT - nodes.length;
  const weights = hubIds.map(() => 0.45 + rand());
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let assigned = 0;
  const rayCounts = weights.map((w, i) => {
    if (i === weights.length - 1) return Math.max(5, remaining - assigned);
    const c = Math.max(5, Math.round((w / totalWeight) * remaining));
    assigned += c;
    return c;
  });

  hubIds.forEach((hubId, hubIndex) => {
    const hubNode = nodes[hubId];
    const normal = hubNode.position.clone().normalize();
    const tangentSeed = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0));
    const tangentA = tangentSeed.lengthSq() < 0.001 ? new THREE.Vector3(1, 0, 0) : tangentSeed.normalize();
    const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();

    for (let r = 0; r < rayCounts[hubIndex]; r++) {
      // Cone-sample a direction biased toward the hub's outward normal, so
      // rays fan outward from the globe surface like a firework burst.
      const coneAngle = rand() * (Math.PI / 2.1);
      const spin = rand() * Math.PI * 2;
      const dir = normal
        .clone()
        .multiplyScalar(Math.cos(coneAngle))
        .add(tangentA.clone().multiplyScalar(Math.sin(coneAngle) * Math.cos(spin)))
        .add(tangentB.clone().multiplyScalar(Math.sin(coneAngle) * Math.sin(spin)))
        .normalize();
      const length = 0.12 + Math.pow(rand(), 1.6) * 0.85;
      const position = hubNode.position.clone().add(dir.multiplyScalar(length));

      nodes.push({
        id: nodes.length,
        position,
        color: hubNode.color,
        radius: 0.011 + rand() * 0.014,
        isCentral: false,
        connections: [hubId],
      });
    }
  });

  // Sparse long-range threads between hubs and the core, echoing the faint
  // cross-globe connections in a real memory network.
  hubIds.forEach((hubId) => {
    if (rand() < 0.55) {
      const other = rand() < 0.5 ? hubIds[Math.floor(rand() * hubIds.length)] : Math.floor(rand() * CENTER_NODES);
      if (other !== hubId && !nodes[hubId].connections.includes(other)) {
        nodes[hubId].connections.push(other);
      }
    }
  });

  return nodes;
}

// ── Wireframe globe — lat/long grid + a bright equatorial ring ─────────────
function GlobeWireframe() {
  const gridGeometry = useMemo(() => buildGlobeWireframe(GLOBE_RADIUS), []);
  const equatorPoints = useMemo(() => buildEquatorRing(GLOBE_RADIUS), []);

  return (
    <group>
      <lineSegments geometry={gridGeometry}>
        <lineBasicMaterial color="#5b6a8f" transparent opacity={0.28} toneMapped={false} />
      </lineSegments>
      <Line points={equatorPoints} color="#cfe0ff" lineWidth={1.4} transparent opacity={0.75} toneMapped={false} />
    </group>
  );
}

// ── Glowing mark at the exact center of the globe ──────────────────────────
function CentralHub() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshBasicMaterial color="#f472b6" toneMapped={false} />
      </mesh>
      <mesh scale={2.4}>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshBasicMaterial color="#f472b6" transparent opacity={0.16} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight color="#f472b6" intensity={1.2} distance={2.2} />
    </group>
  );
}

// ── Memory-node markers (instanced for 1000 nodes in one draw call) ────────
function NodeMarkers({
  nodes,
  highlightedNodes,
  searchActive,
  searchKeyword,
  onNodeClick,
}: {
  nodes: NodeLayout[];
  highlightedNodes: Map<number, string>;
  searchActive: boolean;
  searchKeyword: string;
  onNodeClick?: (nodeId: number, keyword: string) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    nodes.forEach((node, i) => {
      const hiColor = highlightedNodes.get(node.id);
      const scale = hiColor ? node.radius * 2.1 : node.radius;
      dummy.position.copy(node.position);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpColor.set(hiColor ?? (node.isCentral ? "#bcd0ff" : node.color));
      mesh.setColorAt(i, tmpColor);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // The default bounding sphere only covers the base (unit) geometry at the
    // mesh's own origin — with instances scattered far from it, that stale
    // sphere silently rejects raycasts (clicks/hover) on most instances as a
    // broad-phase pretest failure. Recompute it now that matrices are set.
    mesh.computeBoundingSphere();
  }, [nodes, highlightedNodes, dummy, tmpColor]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (!searchActive || !onNodeClick) return;
      const id = e.instanceId;
      if (id == null) return;
      const node = nodes[id];
      if (!node || !highlightedNodes.has(node.id)) return;
      onNodeClick(node.id, searchKeyword);
    },
    [nodes, highlightedNodes, searchActive, searchKeyword, onNodeClick]
  );

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const id = e.instanceId;
      if (id == null) return;
      const node = nodes[id];
      if (searchActive && node && highlightedNodes.has(node.id)) {
        document.body.style.cursor = "pointer";
      }
    },
    [nodes, highlightedNodes, searchActive]
  );

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = "default";
  }, []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, nodes.length]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// ── Always-on faint threads from every ray node back to its cluster hub ────
function ClusterEdges({ nodes }: { nodes: NodeLayout[] }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();
    for (const node of nodes) {
      for (const j of node.connections) {
        const target = nodes[j];
        if (!target) continue;
        points.push(node.position.x, node.position.y, node.position.z);
        points.push(target.position.x, target.position.y, target.position.z);
        color.set(node.color);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [nodes]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.16} toneMapped={false} />
    </lineSegments>
  );
}

// ── Faint edges between currently-highlighted (search-matched) nodes ───────
function HighlightEdges({ nodes, highlightedNodes }: { nodes: NodeLayout[]; highlightedNodes: Map<number, string> }) {
  const geometry = useMemo(() => {
    if (highlightedNodes.size === 0) return null;
    const points: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();
    for (const node of nodes) {
      if (!highlightedNodes.has(node.id)) continue;
      for (const j of node.connections) {
        const target = nodes[j];
        if (!target || !highlightedNodes.has(target.id)) continue;
        points.push(node.position.x, node.position.y, node.position.z);
        points.push(target.position.x, target.position.y, target.position.z);
        color.set(highlightedNodes.get(node.id)!);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
    if (points.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [nodes, highlightedNodes]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.55} toneMapped={false} />
    </lineSegments>
  );
}

// ── Date-label pills above highlighted nodes ────────────────────────────────
function DateLabels({
  nodes,
  highlightedNodes,
  nodeDates,
}: {
  nodes: NodeLayout[];
  highlightedNodes: Map<number, string>;
  nodeDates: Map<number, string>;
}) {
  if (highlightedNodes.size === 0 || nodeDates.size === 0) return null;
  return (
    <>
      {nodes.map((node) => {
        if (!highlightedNodes.has(node.id)) return null;
        const label = nodeDates.get(node.id);
        if (!label) return null;
        const color = highlightedNodes.get(node.id)!;
        return (
          <Html key={node.id} position={node.position} center distanceFactor={6} style={{ pointerEvents: "none" }}>
            <div
              style={{
                background: color,
                color: "#07090f",
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 4,
                transform: "translateY(-14px)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
          </Html>
        );
      })}
    </>
  );
}

// TEMP-DEBUG: remove before shipping — exposes camera+nodes for automated click testing
function TempDebugExpose({ nodes, highlightedNodes }: { nodes: NodeLayout[]; highlightedNodes: Map<number, string> }) {
  useFrame(({ camera, size }) => {
    (window as any).__brainDebug = { camera, nodes, highlightedNodes, size };
  });
  return null;
}

function AutoRotate({ controlsRef, paused }: { controlsRef: React.RefObject<any>; paused?: boolean }) {
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || controls.__dragging || paused) return;
    controls.setAzimuthalAngle(controls.getAzimuthalAngle() + delta * 0.12);
  });
  return null;
}

// Reports the current camera-to-target distance as a coarse zoom category,
// only firing the callback when the category actually changes.
function ZoomReporter({ controlsRef, onChange }: { controlsRef: React.RefObject<any>; onChange?: (level: ZoomLevel) => void }) {
  const lastLevel = useRef<ZoomLevel | null>(null);
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !onChange) return;
    const dist = controls.object.position.distanceTo(controls.target);
    const level: ZoomLevel = dist > ZOOM_FAR ? "far" : dist < ZOOM_NEAR ? "near" : "mid";
    if (level !== lastLevel.current) {
      lastLevel.current = level;
      onChange(level);
    }
  });
  return null;
}

// ── Scene root ───────────────────────────────────────────────────────────
function Scene({
  nodes,
  highlightedNodes,
  nodeDates,
  searchActive,
  searchKeyword,
  onNodeClick,
  controlsRef,
  locked,
  onZoomLevelChange,
}: {
  nodes: NodeLayout[];
  highlightedNodes: Map<number, string>;
  nodeDates: Map<number, string>;
  searchActive: boolean;
  searchKeyword: string;
  onNodeClick?: (nodeId: number, keyword: string) => void;
  controlsRef: React.RefObject<any>;
  locked?: boolean;
  onZoomLevelChange?: (level: ZoomLevel) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.42} />
      <directionalLight position={[3, 4, 5]} intensity={1.25} color="#ffffff" />
      <directionalLight position={[-4, -2, -3]} intensity={0.5} color="#4f8aff" />
      <pointLight position={[0, 0.5, 2.5]} intensity={0.5} color="#8b5cf6" />

      <GlobeWireframe />
      <CentralHub />
      <ClusterEdges nodes={nodes} />
      <NodeMarkers
        nodes={nodes}
        highlightedNodes={highlightedNodes}
        searchActive={searchActive}
        searchKeyword={searchKeyword}
        onNodeClick={onNodeClick}
      />
      <HighlightEdges nodes={nodes} highlightedNodes={highlightedNodes} />
      <DateLabels nodes={nodes} highlightedNodes={highlightedNodes} nodeDates={nodeDates} />

      <AutoRotate controlsRef={controlsRef} paused={locked} />
      <ZoomReporter controlsRef={controlsRef} onChange={onZoomLevelChange} />
      <TempDebugExpose nodes={nodes} highlightedNodes={highlightedNodes} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableRotate={!locked}
        enableZoom={!locked}
        enableDamping
        dampingFactor={0.08}
        minDistance={MIN_DIST}
        maxDistance={MAX_DIST}
        onStart={() => {
          if (controlsRef.current) controlsRef.current.__dragging = true;
        }}
        onEnd={() => {
          if (controlsRef.current) controlsRef.current.__dragging = false;
        }}
      />
    </>
  );
}

export const ObsidianGraph = forwardRef<ObsidianGraphHandle, ObsidianGraphProps>(function ObsidianGraph(
  { searchKeyword, highlightedNodes, nodeDates, onNodeClick, locked, onZoomLevelChange },
  ref
) {
  const nodes = useMemo(() => buildNodeLayout(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  const kw = searchKeyword.toLowerCase().trim();
  const searchActive = kw.length > 1;
  const hNodes = useMemo(
    () => (searchActive ? (highlightedNodes ?? new Map()) : new Map<number, string>()),
    [searchActive, highlightedNodes]
  );

  const zoomBy = useCallback((factor: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object as THREE.PerspectiveCamera;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    const newLen = THREE.MathUtils.clamp(dir.length() / factor, MIN_DIST, MAX_DIST);
    dir.setLength(newLen);
    camera.position.copy(controls.target).add(dir);
    controls.update();
  }, []);

  const resetView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.object.position.set(0, 0, DEFAULT_DIST);
    controls.target.set(0, 0, 0);
    controls.update();
  }, []);

  useImperativeHandle(ref, () => ({ focus: resetView }), [resetView]);

  return (
    <div className="relative w-full h-full">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, DEFAULT_DIST], fov: 45, near: 0.1, far: 50 }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <Suspense fallback={null}>
          <Scene
            nodes={nodes}
            highlightedNodes={hNodes}
            nodeDates={nodeDates ?? new Map()}
            searchActive={searchActive}
            searchKeyword={searchKeyword}
            onNodeClick={onNodeClick}
            controlsRef={controlsRef}
            locked={locked}
            onZoomLevelChange={onZoomLevelChange}
          />
        </Suspense>
      </Canvas>

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
});
