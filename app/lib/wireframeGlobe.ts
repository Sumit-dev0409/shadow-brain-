import * as THREE from "three";

/**
 * Lat/long wireframe grid for a sphere — deliberately built from great-circle
 * rings rather than THREE.WireframeGeometry(SphereGeometry) so it reads as a
 * clean globe grid instead of a busy triangulated mesh.
 */
export function buildGlobeWireframe(
  radius: number,
  latCount = 7,
  lonCount = 12,
  segments = 96
): THREE.BufferGeometry {
  const positions: number[] = [];

  for (let i = 1; i < latCount; i++) {
    const phi = (i / latCount) * Math.PI;
    const y = Math.cos(phi) * radius;
    const ringR = Math.sin(phi) * radius;
    for (let s = 0; s < segments; s++) {
      const t0 = (s / segments) * Math.PI * 2;
      const t1 = ((s + 1) / segments) * Math.PI * 2;
      positions.push(Math.cos(t0) * ringR, y, Math.sin(t0) * ringR);
      positions.push(Math.cos(t1) * ringR, y, Math.sin(t1) * ringR);
    }
  }

  for (let j = 0; j < lonCount; j++) {
    const theta = (j / lonCount) * Math.PI * 2;
    for (let s = 0; s < segments; s++) {
      const p0 = (s / segments) * Math.PI;
      const p1 = ((s + 1) / segments) * Math.PI;
      const y0 = Math.cos(p0) * radius;
      const r0 = Math.sin(p0) * radius;
      const y1 = Math.cos(p1) * radius;
      const r1 = Math.sin(p1) * radius;
      positions.push(Math.cos(theta) * r0, y0, Math.sin(theta) * r0);
      positions.push(Math.cos(theta) * r1, y1, Math.sin(theta) * r1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

/** Points for the bright equatorial ring drawn on top of the grid. */
export function buildEquatorRing(radius: number, segments = 128): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
  }
  return points;
}

/**
 * Evenly-spread points across a sphere surface (Fibonacci lattice), used to
 * seed the starburst cluster hubs so they don't clump together.
 */
export function fibonacciSpherePoints(count: number, radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    points.push(new THREE.Vector3(x * radius, y * radius, z * radius));
  }
  return points;
}
