/**
 * Test helper for generating random polygon shapes
 * Based on tools/shape-generator/generate_shapes.js
 */

interface Point {
  x: number;
  y: number;
}

interface RandomShape {
  id: string;
  points: Point[];
  width: number;
  height: number;
  shapeType: 'concave' | 'triangle' | 'pentagon' | 'rectangle';
}

/**
 * Generates a random concave polygon
 */
export function generateConcavePolygon(
  centerX: number,
  centerY: number,
  avgRadius: number,
  irregularity: number,
  spikeyness: number,
  numVertices: number
): Point[] {
  if (numVertices < 3) {
    numVertices = 3;
  }

  // Generate random angles
  const angles: number[] = [];
  for (let i = 0; i < numVertices; i++) {
    angles.push(Math.random() * 2 * Math.PI);
  }
  angles.sort();

  // Generate random radii with irregularity
  const radii: number[] = [];
  for (let i = 0; i < numVertices; i++) {
    radii.push(avgRadius * (1 - irregularity) + Math.random() * 2 * irregularity * avgRadius);
  }

  // Create vertices
  const vertices: Point[] = [];
  for (let i = 0; i < numVertices; i++) {
    const x = centerX + radii[i] * Math.cos(angles[i]);
    const y = centerY + radii[i] * Math.sin(angles[i]);
    vertices.push({ x, y });
  }

  // Add spikeyness by randomly pulling vertices inward
  for (let i = 0; i < numVertices; i++) {
    if (Math.random() < spikeyness) {
      const angle = angles[i];
      const newRadius = radii[i] * (1 - (0.5 + Math.random() * 0.5) * spikeyness);
      const x = centerX + newRadius * Math.cos(angle);
      const y = centerY + newRadius * Math.sin(angle);
      vertices[i] = { x, y };
    }
  }

  return vertices;
}

/**
 * Generates a random triangle
 */
export function generateTriangle(centerX: number, centerY: number, avgRadius: number): Point[] {
  return generateConcavePolygon(centerX, centerY, avgRadius, 0.5, 0, 3);
}

/**
 * Generates a random pentagon
 */
export function generatePentagon(centerX: number, centerY: number, avgRadius: number): Point[] {
  return generateConcavePolygon(centerX, centerY, avgRadius, 0.5, 0, 5);
}

/**
 * Generates a random rectangle
 */
export function generateRectangle(width: number, height: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

/**
 * Normalize polygon to start at origin (0,0)
 */
export function normalizePolygon(points: Point[]): Point[] {
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));

  return points.map((p) => ({
    x: p.x - minX,
    y: p.y - minY,
  }));
}

/**
 * Calculate bounding box dimensions
 */
export function getBoundingBox(points: Point[]): { width: number; height: number } {
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxX = Math.max(...points.map((p) => p.x));
  const maxY = Math.max(...points.map((p) => p.y));

  return {
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Generates a random shape suitable for testing
 */
export function generateRandomShape(
  id: string,
  shapeType?: 'concave' | 'triangle' | 'pentagon' | 'rectangle'
): RandomShape {
  const type = shapeType || (['concave', 'triangle', 'pentagon', 'rectangle'] as const)[Math.floor(Math.random() * 4)];

  let points: Point[];

  switch (type) {
    case 'concave':
      const numVertices = Math.floor(Math.random() * 7) + 6; // 6-12 vertices
      const avgRadius = Math.random() * 2 + 0.5; // 0.5-2.5 inches
      points = generateConcavePolygon(0, 0, avgRadius, 0.5, 0.7, numVertices);
      break;

    case 'triangle':
      const triRadius = Math.random() * 2 + 0.5;
      points = generateTriangle(0, 0, triRadius);
      break;

    case 'pentagon':
      const pentRadius = Math.random() * 2 + 0.5;
      points = generatePentagon(0, 0, pentRadius);
      break;

    case 'rectangle':
      const rectWidth = Math.random() * 3 + 0.5; // 0.5-3.5 inches
      const rectHeight = Math.random() * 3 + 0.5;
      points = generateRectangle(rectWidth, rectHeight);
      break;
  }

  // Normalize to start at origin
  const normalized = normalizePolygon(points);
  const { width, height } = getBoundingBox(normalized);

  return {
    id,
    points: normalized,
    width,
    height,
    shapeType: type,
  };
}

/**
 * Generates multiple random shapes
 */
export function generateRandomShapes(count: number, shapeType?: 'concave' | 'triangle' | 'pentagon' | 'rectangle'): RandomShape[] {
  return Array.from({ length: count }, (_, i) => generateRandomShape(`shape-${i}`, shapeType));
}

/**
 * Generates a balanced mix of shapes (like the original shape generator)
 */
export function generateBalancedShapes(totalCount: number): RandomShape[] {
  const numConcave = Math.floor(totalCount * 0.5);
  const numTriangles = Math.floor((totalCount - numConcave) / 2);
  const numPentagons = totalCount - numConcave - numTriangles;

  const shapes: RandomShape[] = [];

  for (let i = 0; i < numConcave; i++) {
    shapes.push(generateRandomShape(`concave-${i}`, 'concave'));
  }

  for (let i = 0; i < numTriangles; i++) {
    shapes.push(generateRandomShape(`triangle-${i}`, 'triangle'));
  }

  for (let i = 0; i < numPentagons; i++) {
    shapes.push(generateRandomShape(`pentagon-${i}`, 'pentagon'));
  }

  return shapes;
}
