import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createNoise3D } from "simplex-noise";

/** 4-octave fractal noise for organic, non-repeating surface detail. */
function fbm(
  noise3D: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  octaves = 4
): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.15;
  }
  return sum / norm;
}

/**
 * Procedural human-brain-like geometry: an icosahedron sphere deformed into
 * brain proportions (longer front-back than tall), with a smooth longitudinal
 * fissure carved along the top midline (splitting the two hemispheres,
 * merging again near the base like a real brain joined at the brainstem),
 * plus fractal-noise gyri/sulci wrinkles displaced along the surface normal.
 */
export function createBrainGeometry(radius = 1, seed?: () => number): THREE.BufferGeometry {
  // IcosahedronGeometry isn't indexed — each triangle gets its own vertex
  // copies even where they spatially coincide with neighbors, so
  // computeVertexNormals() can't average across face boundaries and every
  // facet renders flat-shaded. Merge coincident vertices into one indexed
  // vertex first so displacement + normals are shared and the surface
  // actually looks smooth.
  const geo: THREE.BufferGeometry = mergeVertices(new THREE.IcosahedronGeometry(radius, 6));
  const noise3D = createNoise3D(seed);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  const aX = radius * 0.62;
  const aY = radius * 0.62;
  const aZ = radius * 1.0;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const sx = v.x;
    const sy = v.y;
    const sz = v.z;

    let x0 = sx * aX;
    let y0 = sy * aY;
    const z0 = sz * aZ;

    // Longitudinal fissure: a smooth valley along the top midline. Using a
    // continuous falloff (not a hard split) keeps the mesh watertight —
    // neighboring vertices across the midline move together, so it reads as
    // a real crease/fold rather than tearing the surface.
    const midlineFactor = Math.exp(-((x0 / (radius * 0.16)) ** 2));
    const topFactor = Math.max(0, sy);
    const crease = midlineFactor * Math.pow(topFactor, 1.1);
    x0 *= 1 - crease * 0.42;
    y0 -= crease * radius * 0.34;

    // Flatten the underside (brain-stem / temporal-lobe area).
    if (sy < -0.25) y0 *= 0.82;

    // Gyri/sulci wrinkles — fractal noise displaced along the sphere normal.
    const n = fbm(noise3D, sx * 2.6, sy * 2.6, sz * 2.6, 4);
    const foldAmp = radius * 0.045;
    x0 += sx * n * foldAmp;
    y0 += sy * n * foldAmp;
    const z0Folded = z0 + sz * n * foldAmp;

    pos.setXYZ(i, x0, y0, z0Folded);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Deterministically sample a point near the brain's surface for a node
 * marker, using the same lobe/fissure shape as the mesh so markers sit
 * flush against it. `rand` must be a seeded 0..1 generator so node positions
 * stay stable across re-renders (same node id → same spot every time).
 */
export function sampleBrainSurfacePoint(radius: number, rand: () => number): THREE.Vector3 {
  const theta = rand() * Math.PI * 2;
  const phi = Math.acos(1 - 2 * rand());
  const shellR = 0.98 + rand() * 0.05;

  const sx = Math.sin(phi) * Math.cos(theta);
  const sy = Math.cos(phi);
  const sz = Math.sin(phi) * Math.sin(theta);

  const aX = radius * 0.62;
  const aY = radius * 0.62;
  const aZ = radius * 1.0;

  let x0 = sx * aX * shellR;
  let y0 = sy * aY * shellR;
  const z0 = sz * aZ * shellR;

  const midlineFactor = Math.exp(-((x0 / (radius * 0.16)) ** 2));
  const topFactor = Math.max(0, sy);
  const crease = midlineFactor * Math.pow(topFactor, 1.1);
  x0 *= 1 - crease * 0.42;
  y0 -= crease * radius * 0.34;

  if (sy < -0.25) y0 *= 0.82;

  return new THREE.Vector3(x0, y0, z0);
}

/** Small mulberry32 PRNG so node layout is stable across reloads without storing state. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
