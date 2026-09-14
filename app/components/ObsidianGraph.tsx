"use client";

import { useRef, useMemo, useCallback, useEffect, useImperativeHandle, forwardRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { motion } from "framer-motion";
import { Plus, Minus, Maximize } from "lucide-react";
import { seededRandom } from "../lib/brainGeometry";

/* ============================================================
   CONFIG — ported 1:1 from knowledge_graph.html.
   Cluster member counts are scaled up from the mockup's
   [46,40,38,34,30,26] so the graph still exposes exactly 1000
   node IDs: the app's session→node mapping targets IDs 8–999.
   ============================================================ */
const SPHERE_RADIUS = 210;
const N_CLUSTERS = 6;
const MEMBERS_PER_CLUSTER = [149, 129, 123, 110, 97, 84];
const N_DUST = 294;
const CORE_NODES = 8;

const PALETTE = [
  0xff2e88, 0xff6a5c, 0xe63dc4, 0x9b4dff, 0x7b3fe4,
  0x33e6d8, 0x1fd1c1, 0xff8a3d, 0xffce54, 0xf3ecff,
];
const CORE_COLORS = [0xff4fb0, 0xe63dc4, 0x9b4dff, 0x7b3fe4, 0x33e6d8, 0xffce54, 0xff8a3d, 0xff2e88];
const CORE_CYCLE_SECONDS = 10;

const CAM_MIN_Z = 260;
const CAM_MAX_Z = 1100;
const CAM_DEFAULT_Z = 640;
const ZOOM_NEAR_Z = 380;
const ZOOM_FAR_Z = 820;

const HI_BASE_MULTIPLIER = 2.1;
const HI_HOVER_MULTIPLIER = 2.6;
const SEARCH_MATCH_SIZE_MULTIPLIER = 1.8;
const AUTO_ROTATION_SPEED = 0.06;

export type ZoomLevel = "near" | "mid" | "far";

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

interface GraphNode {
  id: number;
  pos: THREE.Vector3;
  colorHex: number;
  baseSize: number;
  phase: number;
}

interface GraphData {
  nodes: GraphNode[];
  adjacency: number[][];
  baseSizes: Float32Array;
  phases: Float32Array;
  positions: Float32Array;
  baseColors: Float32Array;
  edges: [number, number][];
  nodeGeo: THREE.BufferGeometry;
  lineGeo: THREE.BufferGeometry;
  hlGeo: THREE.BufferGeometry;
  particleGeo: THREE.BufferGeometry;
  glowTex: THREE.CanvasTexture;
  hazeTex: THREE.CanvasTexture;
  disposables: { dispose: () => void }[];
}

function fibonacciSphereCenters(n: number, radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const off = 2 / n;
  const inc = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = ((i * off) - 1) + off / 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * inc;
    pts.push(new THREE.Vector3(Math.cos(phi) * r * radius, y * radius, Math.sin(phi) * r * radius));
  }
  return pts;
}

function rawSrgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function hexStringToRawSrgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return rawSrgb(parseInt(m[1], 16));
}

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.9)");
  g.addColorStop(0.45, "rgba(255,255,255,0.28)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSoftDiscTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,180,230,0.9)");
  g.addColorStop(0.35, "rgba(220,120,255,0.35)");
  g.addColorStop(0.7, "rgba(140,80,220,0.10)");
  g.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildGraphData(): GraphData {
  const seed = seededRandom(1337);
  const rand = (a?: number, b?: number) =>
    a === undefined || b === undefined ? seed() : a + seed() * (b - a);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(seed() * arr.length)];

  const nodes: GraphNode[] = [];

  for (let i = 0; i < CORE_NODES; i++) {
    nodes.push({
      id: nodes.length,
      pos: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(SPHERE_RADIUS * rand(0.06, 0.12)),
      colorHex: pick(PALETTE),
      baseSize: rand(2.5, 4),
      phase: seed() * Math.PI * 2,
    });
  }

  const clusterCenters = fibonacciSphereCenters(N_CLUSTERS, SPHERE_RADIUS * 0.72);
  const clusterNodeIndices: number[][] = [];
  for (let ci = 0; ci < N_CLUSTERS; ci++) {
    const indices: number[] = [];
    const center = clusterCenters[ci];
    const clusterColor = PALETTE[ci % PALETTE.length];

    const hubIdx = nodes.length;
    nodes.push({
      id: hubIdx,
      pos: center.clone(),
      colorHex: clusterColor,
      baseSize: rand(13, 16),
      phase: seed() * Math.PI * 2,
    });
    indices.push(hubIdx);

    const count = MEMBERS_PER_CLUSTER[ci];
    for (let k = 0; k < count; k++) {
      const spread = rand(14, 78);
      const p = center.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(spread));
      p.setLength(SPHERE_RADIUS * rand(0.55, 1.0));
      nodes.push({
        id: nodes.length,
        pos: p,
        colorHex: seed() < 0.6 ? clusterColor : pick(PALETTE),
        baseSize: rand(3.5, 7.5),
        phase: seed() * Math.PI * 2,
      });
      indices.push(nodes.length - 1);
    }
    clusterNodeIndices.push(indices);
  }

  for (let i = 0; i < N_DUST; i++) {
    nodes.push({
      id: nodes.length,
      pos: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(SPHERE_RADIUS * rand(0.3, 1.05)),
      colorHex: pick(PALETTE),
      baseSize: rand(2.5, 5),
      phase: seed() * Math.PI * 2,
    });
  }

  const N = nodes.length;

  const rawEdges: [number, number][] = [];
  const nearestWithin = (indices: number[], idx: number, k: number): number[] => {
    const p = nodes[idx].pos;
    const dists = indices
      .filter((j) => j !== idx)
      .map((j) => ({ j, d: p.distanceToSquared(nodes[j].pos) }));
    dists.sort((a, b) => a.d - b.d);
    return dists.slice(0, k).map((o) => o.j);
  };

  clusterNodeIndices.forEach((indices) => {
    const hubIdx = indices[0];
    indices.slice(1).forEach((idx, k) => {
      if (k % 3 === 0) rawEdges.push([hubIdx, idx]);
      nearestWithin(indices, idx, 2).forEach((j) => {
        if (seed() < 0.55) rawEdges.push([idx, j]);
      });
    });
  });
  for (let ci = 0; ci < N_CLUSTERS; ci++) {
    rawEdges.push([clusterNodeIndices[ci][0], clusterNodeIndices[(ci + 1) % N_CLUSTERS][0]]);
  }
  for (let i = 0; i < 26; i++) {
    const a = Math.floor(seed() * N);
    const b = Math.floor(seed() * N);
    if (a !== b) rawEdges.push([a, b]);
  }

  const edgeSet = new Set<string>();
  const adjacency: number[][] = Array.from({ length: N }, () => []);
  const edges: [number, number][] = [];
  rawEdges.forEach(([a, b]) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([a, b]);
    adjacency[a].push(b);
    adjacency[b].push(a);
  });

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const baseSizes = new Float32Array(N);
  const phases = new Float32Array(N);
  const baseColors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const nd = nodes[i];
    positions[i * 3] = nd.pos.x;
    positions[i * 3 + 1] = nd.pos.y;
    positions[i * 3 + 2] = nd.pos.z;
    const [r, g, b] = rawSrgb(nd.colorHex);
    baseColors[i * 3] = r;
    baseColors[i * 3 + 1] = g;
    baseColors[i * 3 + 2] = b;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    baseSizes[i] = nd.baseSize;
    sizes[i] = nd.baseSize;
    phases[i] = nd.phase;
  }

  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  nodeGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  nodeGeo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  nodeGeo.setAttribute("aHi", new THREE.BufferAttribute(new Float32Array(N), 1));
  nodeGeo.setAttribute("aSearchMatch", new THREE.BufferAttribute(new Float32Array(N), 1));

  const linePositions = new Float32Array(edges.length * 2 * 3);
  const lineColors = new Float32Array(edges.length * 2 * 3);
  const lineTint = new THREE.Color(0xb9a6ff);
  edges.forEach(([a, b], i) => {
    linePositions[i * 6] = positions[a * 3];
    linePositions[i * 6 + 1] = positions[a * 3 + 1];
    linePositions[i * 6 + 2] = positions[a * 3 + 2];
    linePositions[i * 6 + 3] = positions[b * 3];
    linePositions[i * 6 + 4] = positions[b * 3 + 1];
    linePositions[i * 6 + 5] = positions[b * 3 + 2];
    for (let k = 0; k < 2; k++) {
      lineColors[i * 6 + k * 3] = lineTint.r;
      lineColors[i * 6 + k * 3 + 1] = lineTint.g;
      lineColors[i * 6 + k * 3 + 2] = lineTint.b;
    }
  });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  lineGeo.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));

  const MAX_DEGREE_GUESS = 24;
  const hlGeo = new THREE.BufferGeometry();
  hlGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_DEGREE_GUESS * 2 * 3), 3));
  hlGeo.setDrawRange(0, 0);

  const N_PARTICLES = 220;
  const pPositions = new Float32Array(N_PARTICLES * 3);
  const pColors = new Float32Array(N_PARTICLES * 3);
  const pSizes = new Float32Array(N_PARTICLES);
  const softWhite = rawSrgb(0xd9c9ff);
  for (let i = 0; i < N_PARTICLES; i++) {
    const p = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(SPHERE_RADIUS * rand(1.05, 1.9));
    pPositions[i * 3] = p.x;
    pPositions[i * 3 + 1] = p.y;
    pPositions[i * 3 + 2] = p.z;
    pColors[i * 3] = softWhite[0];
    pColors[i * 3 + 1] = softWhite[1];
    pColors[i * 3 + 2] = softWhite[2];
    pSizes[i] = rand(1.2, 3);
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(pPositions, 3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(pColors, 3));
  particleGeo.setAttribute("size", new THREE.BufferAttribute(pSizes, 1));

  const glowTex = makeGlowTexture();
  const hazeTex = makeSoftDiscTexture();

  const disposables: { dispose: () => void }[] = [
    nodeGeo, lineGeo, hlGeo, particleGeo, glowTex, hazeTex,
  ];

  return {
    nodes, adjacency, baseSizes, phases, positions, baseColors, edges,
    nodeGeo, lineGeo, hlGeo, particleGeo, glowTex, hazeTex, disposables,
  };
}

function buildRingGroup(seed: () => number, ringMat: THREE.LineBasicMaterial): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const curve = new THREE.EllipseCurve(0, 0, SPHERE_RADIUS, SPHERE_RADIUS, 0, 2 * Math.PI, false, 0);
    const pts = curve.getPoints(96).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geos.push(geo);
    const line = new THREE.LineLoop(geo, ringMat);
    line.rotation.x = seed() * Math.PI;
    line.rotation.y = seed() * Math.PI;
    line.rotation.z = seed() * Math.PI;
    group.add(line);
  }
  return { group, dispose: () => geos.forEach((g) => g.dispose()) };
}

const NODE_VERT = `
  attribute float size;
  attribute vec3 color;
  attribute float aHi;
  attribute float aSearchMatch;
  uniform float uTime;
  varying vec3 vColor;
  varying float vHi;
  varying float vPulse;
  void main(){
    vColor = color;
    vHi = aHi;
    float basePulse = 0.5 - 0.5 * cos(uTime * 1.2);
    float hiPulse = aHi * (0.5 - 0.5 * cos(uTime * 4.5));
    vPulse = basePulse + hiPulse;
    float baseSize = size * (1.0 + aSearchMatch * 0.8);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float pulseScale = 1.0 + vPulse * (0.06 + aHi * 0.30);
    gl_PointSize = baseSize * pulseScale * (420.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const NODE_FRAG = `
  uniform sampler2D pointTexture;
  varying vec3 vColor;
  varying float vHi;
  varying float vPulse;
  void main(){
    vec4 tex = texture2D(pointTexture, gl_PointCoord);
    vec3 col = mix(vColor, vec3(1.0), vHi * (0.04 + 0.06 * vPulse));
    float amp = 1.0 + vHi * (0.10 + 0.15 * vPulse);
    gl_FragColor = vec4(col * amp, 1.0) * tex;
  }
`;

const PARTICLE_VERT = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  void main(){
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAG = `
  uniform sampler2D pointTexture;
  varying vec3 vColor;
  void main(){
    vec4 tex = texture2D(pointTexture, gl_PointCoord);
    gl_FragColor = vec4(vColor, 0.5) * tex;
  }
`;

interface SceneApi {
  zoomBy: (factor: number) => void;
  resetView: () => void;
}

function GraphScene({
  searchKeyword,
  highlightedNodes,
  onNodeClick,
  locked,
  onZoomLevelChange,
  apiRef,
  wrapRef,
}: ObsidianGraphProps & {
  apiRef: RefObject<SceneApi | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
}) {
  const camRef = useRef<THREE.PerspectiveCamera>(null);

  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const coreOuterRef = useRef<THREE.Sprite>(null);
  const coreMidRef = useRef<THREE.Sprite>(null);
  const coreInnerRef = useRef<THREE.Sprite>(null);

  const data = useMemo(() => buildGraphData(), []);
  useEffect(() => () => data.disposables.forEach((d) => d.dispose()), [data]);

  const materials = useMemo(() => {
    const hazeMat = new THREE.SpriteMaterial({
      map: data.hazeTex, color: 0xffffff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ringMat = new THREE.LineBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0.14 });
    const eqMat = new THREE.LineBasicMaterial({ color: 0xff6fc0, transparent: true, opacity: 0.35 });
    const coreOuterMat = new THREE.SpriteMaterial({
      map: data.glowTex, color: 0xff4fb0, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const coreMidMat = new THREE.SpriteMaterial({
      map: data.glowTex, color: 0xffffff, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const coreInnerMat = new THREE.SpriteMaterial({
      map: data.glowTex, color: 0xffffff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const nodeMat = new THREE.ShaderMaterial({
      uniforms: { pointTexture: { value: data.glowTex }, uTime: { value: 0 } },
      vertexShader: NODE_VERT,
      fragmentShader: NODE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const hlMat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const particleMat = new THREE.ShaderMaterial({
      uniforms: { pointTexture: { value: data.glowTex } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const all = [hazeMat, ringMat, eqMat, coreOuterMat, coreMidMat, coreInnerMat, nodeMat, lineMat, hlMat, particleMat];
    return { hazeMat, ringMat, eqMat, coreOuterMat, coreMidMat, coreInnerMat, nodeMat, lineMat, hlMat, particleMat, all };
  }, [data]);
  useEffect(() => () => materials.all.forEach((m) => m.dispose()), [materials]);

  const rings = useMemo(() => buildRingGroup(seededRandom(4242), materials.ringMat), [materials]);
  useEffect(() => () => rings.dispose(), [rings]);

  const eqGeo = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, SPHERE_RADIUS * 0.98, SPHERE_RADIUS * 0.98, 0, 2 * Math.PI, false, 0);
    const pts = curve.getPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  useEffect(() => () => eqGeo.dispose(), [eqGeo]);

  const uTimeRef = useRef<THREE.IUniform | null>(null);
  useEffect(() => {
    uTimeRef.current = materials.nodeMat.uniforms.uTime ?? null;
  }, [materials]);


  // Latest-values ref so imperative handlers always see current search state
  // without re-binding event listeners.
  const liveRef = useRef({ searchKeyword, onNodeClick, locked });

  const kw = searchKeyword.toLowerCase().trim();
  const searchActive = kw.length > 1;
  const hNodes = useMemo(
    () => (searchActive ? (highlightedNodes ?? new Map<number, string>()) : new Map<number, string>()),
    [searchActive, highlightedNodes]
  );
  const hNodesRef = useRef(hNodes);

  useEffect(() => {
    liveRef.current = { searchKeyword, onNodeClick, locked };
    hNodesRef.current = hNodes;
  });

  const hoveredIdxRef = useRef<number | null>(null);

  const setHighlightEdgesFor = useCallback((idx: number | null) => {
    const geo = data.hlGeo;
    if (idx === null) {
      geo.setDrawRange(0, 0);
      return;
    }
    const neighbours = data.adjacency[idx] ?? [];
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const src = data.positions;
    const arr = posAttr.array as Float32Array;
    let n = 0;
    for (let k = 0; k < neighbours.length && n < 24; k++) {
      const j = neighbours[k];
      arr[n * 6] = src[idx * 3];
      arr[n * 6 + 1] = src[idx * 3 + 1];
      arr[n * 6 + 2] = src[idx * 3 + 2];
      arr[n * 6 + 3] = src[j * 3];
      arr[n * 6 + 4] = src[j * 3 + 1];
      arr[n * 6 + 5] = src[j * 3 + 2];
      n++;
    }
    posAttr.needsUpdate = true;
    geo.setDrawRange(0, n * 2);
  }, [data]);

  // Repaint the node color buffer whenever the highlighted set changes.
  useEffect(() => {
    const attr = data.nodeGeo.getAttribute("color") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const hiAttr = data.nodeGeo.getAttribute("aHi") as THREE.BufferAttribute;
    const hiArr = hiAttr.array as Float32Array;
    const smAttr = data.nodeGeo.getAttribute("aSearchMatch") as THREE.BufferAttribute;
    const smArr = smAttr.array as Float32Array;
    for (let i = 0; i < data.nodes.length; i++) {
      const hi = hNodes.get(data.nodes[i].id);
      const rgb = hi ? hexStringToRawSrgb(hi) : null;
      if (rgb) {
        arr[i * 3] = rgb[0];
        arr[i * 3 + 1] = rgb[1];
        arr[i * 3 + 2] = rgb[2];
      } else {
        arr[i * 3] = data.baseColors[i * 3];
        arr[i * 3 + 1] = data.baseColors[i * 3 + 1];
        arr[i * 3 + 2] = data.baseColors[i * 3 + 2];
      }
      hiArr[i] = hi ? 1 : 0;
      smArr[i] = hi ? 1 : 0;
    }
    attr.needsUpdate = true;
    hiAttr.needsUpdate = true;
    smAttr.needsUpdate = true;
    if (!hNodes.size && hoveredIdxRef.current !== null) {
      hoveredIdxRef.current = null;
      setHighlightEdgesFor(null);
    }
  }, [hNodes, data, setHighlightEdgesFor]);

  const manualTiltX = useRef(0);
  const rotYTarget = useRef(0);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    apiRef.current = {
      zoomBy: (factor: number) => {
        cam.position.z = THREE.MathUtils.clamp(cam.position.z / factor, CAM_MIN_Z, CAM_MAX_Z);
      },
      resetView: () => {
        cam.position.set(0, 30, CAM_DEFAULT_Z);
        manualTiltX.current = 0;
        rotYTarget.current = 0;
      },
    };
    return () => { apiRef.current = null; };
  }, [camRef, apiRef]);

  // Pointer/wheel interaction — ported from knowledge_graph.html.
  useEffect(() => {
    const el = wrapRef.current;
    const cam = camRef.current;
    if (!el || !cam) return;
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points!.threshold = 6;
    const mouse = new THREE.Vector2(2, 2);

    const activePointers = new Map<number, { x: number; y: number }>();
    let isDragging = false;
    let movedPx = 0;
    let lastX = 0, lastY = 0;
    let pinchStart: number | null = null;

    el.style.cursor = "grab";

    const getPointerNDC = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const isInteractive = (idx: number) => hNodesRef.current.has(idx);

    const pickNode = (): number | null => {
      raycaster.setFromCamera(mouse, cam);
      const pointsObj = pointsRef.current;
      if (!pointsObj) return null;
      const hits = raycaster.intersectObject(pointsObj);
      if (hits.length > 0 && hits[0].index != null) return hits[0].index;
      return null;
    };

    const applyHover = (idx: number | null) => {
      const effective = idx !== null && isInteractive(idx) ? idx : null;
      if (hoveredIdxRef.current === effective) return;
      hoveredIdxRef.current = effective;
      setHighlightEdgesFor(effective);
      el.style.cursor = effective !== null ? "pointer" : isDragging ? "grabbing" : "grab";
    };

    const onPointerDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 1) {
        isDragging = true;
        isDraggingRef.current = true;
        movedPx = 0;
        lastX = e.clientX;
        lastY = e.clientY;
        el.style.cursor = "grabbing";
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 2) {
        if (liveRef.current.locked) return;
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStart == null) pinchStart = dist;
        else {
          const delta = dist - pinchStart;
          cam.position.z = THREE.MathUtils.clamp(cam.position.z - delta * 0.8, CAM_MIN_Z, CAM_MAX_Z);
          pinchStart = dist;
        }
        return;
      }

      if (isDragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        movedPx += Math.abs(dx) + Math.abs(dy);
        if (!liveRef.current.locked) {
          rotYTarget.current += dx * 0.0045;
          manualTiltX.current += dy * 0.0045;
        }
        lastX = e.clientX;
        lastY = e.clientY;
      } else {
        getPointerNDC(e.clientX, e.clientY);
        applyHover(pickNode());
      }
    };

    const endDrag = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size === 0) {
        isDragging = false;
        isDraggingRef.current = false;
        pinchStart = null;
        el.style.cursor = hoveredIdxRef.current !== null ? "pointer" : "grab";
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasClick = !isDragging || movedPx < 6;
      endDrag(e);
      if (wasClick) {
        getPointerNDC(e.clientX, e.clientY);
        const idx = pickNode();
        const { searchKeyword: keyword, onNodeClick: click } = liveRef.current;
        if (
          idx !== null &&
          click &&
          keyword.trim().toLowerCase().length > 1 &&
          hNodesRef.current.has(idx)
        ) {
          click(idx, keyword);
        }
      }
    };

    const onPointerLeave = () => {
      if (activePointers.size <= 1) applyHover(null);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (liveRef.current.locked) return;
      cam.position.z = THREE.MathUtils.clamp(cam.position.z + e.deltaY * 0.55, CAM_MIN_Z, CAM_MAX_Z);
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", endDrag);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("wheel", onWheel);
    };
  }, [wrapRef, camRef, data, setHighlightEdgesFor]);

  const lastZoomLevel = useRef<ZoomLevel | null>(null);
  useFrame(() => {
    const cam = camRef.current;
    if (!cam) return;
    const z = cam.position.z;
    const level: ZoomLevel = z > ZOOM_FAR_Z ? "far" : z < ZOOM_NEAR_Z ? "near" : "mid";
    if (level !== lastZoomLevel.current) {
      lastZoomLevel.current = level;
      onZoomLevelChange?.(level);
    }
  });

  const tmpColorA = useMemo(() => new THREE.Color(), []);
  const tmpColorB = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.1);

    if (uTimeRef.current) uTimeRef.current.value = t;

    if (!liveRef.current.locked && !isDraggingRef.current) {
      rotYTarget.current += AUTO_ROTATION_SPEED * dt;
    }

    const ease = 1 - Math.exp(-dt * 12);
    group.rotation.y += (rotYTarget.current - group.rotation.y) * ease;
    group.rotation.x += ((0.18 + manualTiltX.current) - group.rotation.x) * ease;

    const hovered = hoveredIdxRef.current;
    const sizeAttr = data.nodeGeo.getAttribute("size") as THREE.BufferAttribute;
    const sizeArr = sizeAttr.array as Float32Array;
    for (let i = 0; i < data.nodes.length; i++) {
      let s = data.baseSizes[i];
      const isHi = hNodesRef.current.has(data.nodes[i].id);
      if (isHi) s *= i === hovered ? HI_HOVER_MULTIPLIER : HI_BASE_MULTIPLIER;
      else if (i === hovered) s *= HI_HOVER_MULTIPLIER;
      if (isHi && i !== hovered) s *= SEARCH_MATCH_SIZE_MULTIPLIER;
      if (i !== hovered) s *= 1 + Math.sin(t * 1.4 + data.phases[i]) * 0.12;
      sizeArr[i] = s;
    }
    sizeAttr.needsUpdate = true;

    const cyclePos = ((t % CORE_CYCLE_SECONDS) / CORE_CYCLE_SECONDS) * CORE_COLORS.length;
    const cIdxA = Math.floor(cyclePos) % CORE_COLORS.length;
    const cLerp = cyclePos - Math.floor(cyclePos);
    tmpColorA.setHex(CORE_COLORS[cIdxA]);
    tmpColorB.setHex(CORE_COLORS[(cIdxA + 1) % CORE_COLORS.length]);
    tmpColorA.lerp(tmpColorB, cLerp);
    if (coreOuterRef.current) {
      coreOuterRef.current.material.color.copy(tmpColorA);
      coreOuterRef.current.scale.setScalar(70 * (1 + Math.sin(t * 1.8) * 0.12));
    }
    if (coreMidRef.current) {
      coreMidRef.current.material.color.copy(tmpColorA).lerp(tmpColorB.set(0xffffff), 0.35);
      const midPulse = 38 * (1 + Math.sin(t * 1.5) * 0.16);
      coreMidRef.current.scale.set(midPulse, midPulse, 1);
    }
    if (coreInnerRef.current) {
      const innerPulse = 22 * (1 + Math.sin(t * 2.4) * 0.18);
      coreInnerRef.current.scale.set(innerPulse, innerPulse, 1);
    }

    if (particlesRef.current) {
      particlesRef.current.rotation.y -= 0.036 * dt;
      particlesRef.current.rotation.x = Math.sin(t * 0.05) * 0.05;
    }
  });

  return (
    <>
      <PerspectiveCamera
        ref={camRef}
        makeDefault
        position={[0, 30, CAM_DEFAULT_Z]}
        fov={50}
        near={1}
        far={4000}
      />
      <group ref={groupRef} rotation={[0.18, 0, -0.04]}>
      <sprite material={materials.hazeMat} scale={[SPHERE_RADIUS * 3.2, SPHERE_RADIUS * 3.2, 1]} />

      <primitive object={rings.group} />

      <lineLoop geometry={eqGeo} material={materials.eqMat} rotation={[Math.PI / 2 + 0.12, 0, 0.08]} />

      <sprite ref={coreOuterRef} material={materials.coreOuterMat} scale={[70, 70, 1]} />
      <sprite ref={coreMidRef} material={materials.coreMidMat} scale={[38, 38, 1]} />
      <sprite ref={coreInnerRef} material={materials.coreInnerMat} scale={[22, 22, 1]} />

      <points geometry={data.nodeGeo} material={materials.nodeMat} ref={pointsRef} />

      <lineSegments geometry={data.lineGeo} material={materials.lineMat} />

      <lineSegments geometry={data.hlGeo} material={materials.hlMat} />

      <points geometry={data.particleGeo} material={materials.particleMat} ref={particlesRef} />

      </group>
    </>
  );
}

export const ObsidianGraph = forwardRef<ObsidianGraphHandle, ObsidianGraphProps>(function ObsidianGraph(
  { searchKeyword, highlightedNodes, onNodeClick, locked, onZoomLevelChange },
  ref
) {
  const sceneApiRef = useRef<SceneApi | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const zoomBy = useCallback((factor: number) => sceneApiRef.current?.zoomBy(factor), []);
  const resetView = useCallback(() => sceneApiRef.current?.resetView(), []);

  useImperativeHandle(ref, () => ({ focus: resetView }), [resetView]);

  return (
    <div className="relative w-full h-full">
      <div ref={wrapRef} className="w-full h-full">
        <Canvas
          flat
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
          style={{ width: "100%", height: "100%", display: "block", background: "transparent" }}
        >
          <GraphScene
            searchKeyword={searchKeyword}
            highlightedNodes={highlightedNodes}
            onNodeClick={onNodeClick}
            locked={locked}
            onZoomLevelChange={onZoomLevelChange}
            apiRef={sceneApiRef}
            wrapRef={wrapRef}
          />
        </Canvas>
      </div>

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
