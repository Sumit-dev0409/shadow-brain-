"use client";

import { useRef, useMemo, useCallback, useEffect, Suspense } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { motion } from "framer-motion";
import { Plus, Minus, Maximize } from "lucide-react";
import { createBrainGeometry, sampleBrainSurfacePoint, seededRandom } from "../lib/brainGeometry";

const NODE_COUNT = 1000;
const CENTER_NODES = 8;
const BRAIN_RADIUS = 1.6;
const MIN_DIST = 2.3;
const MAX_DIST = 7.5;
const DEFAULT_DIST = 4.2;

const COLORS = [
  "#f97316", // Claude AI — orange
  "#8b5cf6", // Copilot — purple
  "#94a3b8", // ChatGPT — light grey (visible against the dark brain material)
  "#3b82f6", // Gemini — blue
];

interface ObsidianGraphProps {
  searchKeyword: string;
  /** Map from node ID → platform hex color for nodes that have matching chat history */
  highlightedNodes?: Map<number, string>;
  /** Map from node ID → short date label e.g. "Jun 18" */
  nodeDates?: Map<number, string>;
  onNodeClick?: (nodeId: number, keyword: string) => void;
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

  for (let i = 0; i < NODE_COUNT; i++) {
    const isCentral = i < CENTER_NODES;
    const category = Math.floor(rand() * 4);
    const position = isCentral
      ? new THREE.Vector3(
          (rand() - 0.5) * BRAIN_RADIUS * 0.28,
          (rand() - 0.5) * BRAIN_RADIUS * 0.28,
          (rand() - 0.5) * BRAIN_RADIUS * 0.28
        )
      : sampleBrainSurfacePoint(BRAIN_RADIUS, rand);

    nodes.push({
      id: i,
      position,
      color: COLORS[category],
      radius: isCentral ? 0.026 + rand() * 0.014 : 0.011 + rand() * 0.013,
      isCentral,
      connections: [],
    });
  }

  for (let i = 0; i < nodes.length; i++) {
    const count = 1 + Math.floor(rand() * 3);
    for (let j = 0; j < count; j++) {
      const target = Math.floor(rand() * nodes.length);
      if (target !== i && !nodes[i].connections.includes(target)) {
        nodes[i].connections.push(target);
      }
    }
    if (i >= CENTER_NODES && rand() < 0.15) {
      const centerTarget = Math.floor(rand() * CENTER_NODES);
      if (!nodes[i].connections.includes(centerTarget)) nodes[i].connections.push(centerTarget);
    }
  }

  return nodes;
}

// ── The brain surface itself ──────────────────────────────────────────────
function BrainMesh() {
  const geometry = useMemo(() => createBrainGeometry(BRAIN_RADIUS, seededRandom(42)), []);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#5b4a72"
        emissive="#1b1030"
        emissiveIntensity={0.35}
        roughness={0.55}
        metalness={0.08}
        transparent
        opacity={0.92}
        side={THREE.DoubleSide}
      />
    </mesh>
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

function AutoRotate({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || controls.__dragging) return;
    controls.setAzimuthalAngle(controls.getAzimuthalAngle() + delta * 0.12);
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
}: {
  nodes: NodeLayout[];
  highlightedNodes: Map<number, string>;
  nodeDates: Map<number, string>;
  searchActive: boolean;
  searchKeyword: string;
  onNodeClick?: (nodeId: number, keyword: string) => void;
  controlsRef: React.RefObject<any>;
}) {
  return (
    <>
      <ambientLight intensity={0.42} />
      <directionalLight position={[3, 4, 5]} intensity={1.25} color="#ffffff" />
      <directionalLight position={[-4, -2, -3]} intensity={0.5} color="#4f8aff" />
      <pointLight position={[0, 0.5, 2.5]} intensity={0.5} color="#8b5cf6" />

      <BrainMesh />
      <NodeMarkers
        nodes={nodes}
        highlightedNodes={highlightedNodes}
        searchActive={searchActive}
        searchKeyword={searchKeyword}
        onNodeClick={onNodeClick}
      />
      <HighlightEdges nodes={nodes} highlightedNodes={highlightedNodes} />
      <DateLabels nodes={nodes} highlightedNodes={highlightedNodes} nodeDates={nodeDates} />

      <AutoRotate controlsRef={controlsRef} />
      <TempDebugExpose nodes={nodes} highlightedNodes={highlightedNodes} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
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

export function ObsidianGraph({ searchKeyword, highlightedNodes, nodeDates, onNodeClick }: ObsidianGraphProps) {
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
}
