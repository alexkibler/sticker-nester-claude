/// <reference lib="webworker" />

import { NestingRequest, NestingResponse, Placement, Point } from '../models';

/**
 * Nesting Worker - Runs genetic algorithm for polygon packing
 *
 * This worker implements a simplified version of the SVGNest algorithm
 * using a genetic algorithm approach with gravity-based placement.
 *
 * As specified in section 5 of the architectural specification
 */

interface Individual {
  order: number[]; // Order of shape placement
  rotations: number[]; // Rotation for each shape (in degrees)
  placements: Placement[];
  fitness: number;
}

let isRunning = false;
let currentBest: Individual | null = null;
let generation = 0;

// Listen for messages from the main thread
addEventListener('message', ({ data }) => {
  const message = data;

  switch (message.type) {
    case 'start':
      startNesting(message.payload as NestingRequest);
      break;
    case 'stop':
      isRunning = false;
      break;
  }
});

/**
 * Main nesting algorithm entry point
 */
function startNesting(request: NestingRequest): void {
  isRunning = true;
  generation = 0;
  currentBest = null;

  const { bin, shapes, config } = request;

  if (shapes.length === 0) {
    postMessage({
      type: 'error',
      payload: 'No shapes to nest'
    });
    return;
  }

  // Initialize population
  const population = initializePopulation(shapes, config);

  // Run genetic algorithm
  runGeneticAlgorithm(population, bin, shapes, config);
}

/**
 * Initialize population with random orderings and rotations
 */
function initializePopulation(
  shapes: any[],
  config: any
): Individual[] {
  const population: Individual[] = [];
  const n = shapes.length;

  for (let i = 0; i < config.populationSize; i++) {
    // Random order
    const order = Array.from({ length: n }, (_, i) => i);
    shuffleArray(order);

    // Random rotations
    const rotations = Array.from({ length: n }, () => {
      const step = 360 / config.rotations;
      const rotIndex = Math.floor(Math.random() * config.rotations);
      return rotIndex * step;
    });

    population.push({
      order,
      rotations,
      placements: [],
      fitness: Infinity
    });
  }

  return population;
}

/**
 * Run the genetic algorithm
 */
function runGeneticAlgorithm(
  population: Individual[],
  bin: any,
  shapes: any[],
  config: any
): void {
  const maxGenerations = 1000; // Limit to prevent infinite loop

  const evolve = () => {
    if (!isRunning || generation >= maxGenerations) {
      // Send final result
      if (currentBest) {
        postMessage({
          type: 'complete',
          payload: {
            generation,
            fitness: currentBest.fitness,
            placements: currentBest.placements,
            binUtilization: calculateUtilization(currentBest, bin)
          } as NestingResponse
        });
      }
      return;
    }

    // Evaluate fitness for all individuals
    population.forEach(individual => {
      if (individual.fitness === Infinity) {
        evaluateFitness(individual, bin, shapes, config.spacing);
      }
    });

    // Sort by fitness (lower is better)
    population.sort((a, b) => a.fitness - b.fitness);

    // Update best solution
    if (!currentBest || population[0].fitness < currentBest.fitness) {
      currentBest = { ...population[0] };

      // Post progress update
      postMessage({
        type: 'progress',
        payload: {
          generation,
          fitness: currentBest.fitness,
          placements: currentBest.placements,
          binUtilization: calculateUtilization(currentBest, bin)
        } as NestingResponse
      });
    }

    // Selection and reproduction
    const newPopulation: Individual[] = [];

    // Keep the best individuals (elitism)
    const eliteCount = Math.floor(config.populationSize * 0.1);
    for (let i = 0; i < eliteCount; i++) {
      newPopulation.push({ ...population[i] });
    }

    // Create offspring
    while (newPopulation.length < config.populationSize) {
      const parent1 = tournamentSelection(population);
      const parent2 = tournamentSelection(population);

      const offspring = crossover(parent1, parent2);
      mutate(offspring, config.mutationRate, config.rotations);

      newPopulation.push(offspring);
    }

    population.splice(0, population.length, ...newPopulation);
    generation++;

    // Continue evolution
    setTimeout(evolve, 0);
  };

  evolve();
}

/**
 * Evaluate fitness of an individual by placing shapes
 */
function evaluateFitness(
  individual: Individual,
  bin: any,
  shapes: any[],
  spacing: number
): void {
  individual.placements = [];
  const placedShapes: Array<{
    points: Point[];
    x: number;
    y: number;
  }> = [];

  // Place shapes in the order specified by the individual
  for (let i = 0; i < individual.order.length; i++) {
    const shapeIndex = individual.order[i];
    const shape = shapes[shapeIndex];
    const rotation = individual.rotations[shapeIndex];

    // Rotate shape
    const rotatedPoints = rotatePoints(shape.points, rotation);

    // Find best placement using gravity-based approach
    const placement = findBestPlacement(
      rotatedPoints,
      placedShapes,
      bin,
      spacing
    );

    if (placement) {
      individual.placements.push({
        id: shape.id,
        x: placement.x,
        y: placement.y,
        rotation
      });

      placedShapes.push({
        points: rotatedPoints,
        x: placement.x,
        y: placement.y
      });
    }
  }

  // Calculate fitness as bounding box area
  if (individual.placements.length > 0) {
    const bbox = getBoundingBoxOfPlacements(individual.placements, shapes);
    individual.fitness = bbox.width * bbox.height;
  } else {
    individual.fitness = Infinity;
  }
}

/**
 * Find best placement for a shape using a grid-based approach
 */
function findBestPlacement(
  shapePoints: Point[],
  placedShapes: Array<{ points: Point[]; x: number; y: number }>,
  bin: any,
  spacing: number
): { x: number; y: number } | null {
  const stepSize = 5; // Grid resolution
  const shapeBBox = getBoundingBox(shapePoints);

  let bestPlacement: { x: number; y: number } | null = null;
  let bestY = Infinity;

  // Try placements from bottom-left (gravity simulation)
  for (let y = 0; y <= bin.height - shapeBBox.height; y += stepSize) {
    for (let x = 0; x <= bin.width - shapeBBox.width; x += stepSize) {
      // Check if placement is valid
      if (isValidPlacement(shapePoints, x, y, placedShapes, bin, spacing)) {
        // Prefer lower Y positions (gravity)
        if (y < bestY || (y === bestY && x < (bestPlacement?.x || Infinity))) {
          bestPlacement = { x, y };
          bestY = y;
        }
      }
    }
  }

  return bestPlacement;
}

/**
 * Check if a placement is valid (no overlaps, within bin)
 */
function isValidPlacement(
  shapePoints: Point[],
  x: number,
  y: number,
  placedShapes: Array<{ points: Point[]; x: number; y: number }>,
  bin: any,
  spacing: number
): boolean {
  // Translate shape to position
  const translatedPoints = shapePoints.map(p => ({
    x: p.x + x,
    y: p.y + y
  }));

  // Check bin boundaries
  const bbox = getBoundingBox(translatedPoints);
  if (
    bbox.minX < 0 ||
    bbox.minY < 0 ||
    bbox.maxX > bin.width ||
    bbox.maxY > bin.height
  ) {
    return false;
  }

  // Check for overlaps with placed shapes
  for (const placed of placedShapes) {
    const placedTranslated = placed.points.map(p => ({
      x: p.x + placed.x,
      y: p.y + placed.y
    }));

    if (
      polygonsIntersect(translatedPoints, placedTranslated, spacing)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Check if two polygons intersect (using bounding box approximation)
 */
function polygonsIntersect(
  poly1: Point[],
  poly2: Point[],
  spacing: number
): boolean {
  const bbox1 = getBoundingBox(poly1);
  const bbox2 = getBoundingBox(poly2);

  // Add spacing to bounding boxes
  bbox1.minX -= spacing;
  bbox1.minY -= spacing;
  bbox1.maxX += spacing;
  bbox1.maxY += spacing;

  // Check bounding box overlap
  if (
    bbox1.maxX < bbox2.minX ||
    bbox2.maxX < bbox1.minX ||
    bbox1.maxY < bbox2.minY ||
    bbox2.maxY < bbox1.minY
  ) {
    return false;
  }

  return true;
}

/**
 * Tournament selection
 */
function tournamentSelection(population: Individual[]): Individual {
  const tournamentSize = 3;
  let best = population[Math.floor(Math.random() * population.length)];

  for (let i = 1; i < tournamentSize; i++) {
    const competitor =
      population[Math.floor(Math.random() * population.length)];
    if (competitor.fitness < best.fitness) {
      best = competitor;
    }
  }

  return best;
}

/**
 * Crossover two individuals
 */
function crossover(parent1: Individual, parent2: Individual): Individual {
  const n = parent1.order.length;
  const offspring: Individual = {
    order: new Array(n),
    rotations: new Array(n),
    placements: [],
    fitness: Infinity
  };

  // Order crossover (OX)
  const start = Math.floor(Math.random() * n);
  const end = Math.floor(Math.random() * (n - start)) + start;

  // Copy segment from parent1
  for (let i = start; i <= end; i++) {
    offspring.order[i] = parent1.order[i];
  }

  // Fill remaining from parent2
  let p2Index = 0;
  for (let i = 0; i < n; i++) {
    if (offspring.order[i] === undefined) {
      while (offspring.order.includes(parent2.order[p2Index])) {
        p2Index++;
      }
      offspring.order[i] = parent2.order[p2Index];
      p2Index++;
    }
  }

  // Inherit rotations from parents randomly
  for (let i = 0; i < n; i++) {
    offspring.rotations[i] =
      Math.random() < 0.5 ? parent1.rotations[i] : parent2.rotations[i];
  }

  return offspring;
}

/**
 * Mutate an individual
 */
function mutate(
  individual: Individual,
  mutationRate: number,
  numRotations: number
): void {
  const n = individual.order.length;

  // Swap mutation for order
  if (Math.random() < mutationRate) {
    const i = Math.floor(Math.random() * n);
    const j = Math.floor(Math.random() * n);
    [individual.order[i], individual.order[j]] = [
      individual.order[j],
      individual.order[i]
    ];
  }

  // Rotation mutation
  for (let i = 0; i < n; i++) {
    if (Math.random() < mutationRate) {
      const step = 360 / numRotations;
      const rotIndex = Math.floor(Math.random() * numRotations);
      individual.rotations[i] = rotIndex * step;
    }
  }
}

/**
 * Utility functions
 */

function rotatePoints(points: Point[], degrees: number): Point[] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const centroid = calculateCentroid(points);

  return points.map(p => {
    const translatedX = p.x - centroid.x;
    const translatedY = p.y - centroid.y;

    return {
      x: translatedX * cos - translatedY * sin + centroid.x,
      y: translatedX * sin + translatedY * cos + centroid.y
    };
  });
}

function getBoundingBox(points: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function getBoundingBoxOfPlacements(
  placements: Placement[],
  shapes: any[]
): { width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  placements.forEach(placement => {
    const shape = shapes.find(s => s.id === placement.id);
    if (!shape) return;

    const rotated = rotatePoints(shape.points, placement.rotation);
    const translated = rotated.map(p => ({
      x: p.x + placement.x,
      y: p.y + placement.y
    }));

    const bbox = getBoundingBox(translated);
    minX = Math.min(minX, bbox.minX);
    minY = Math.min(minY, bbox.minY);
    maxX = Math.max(maxX, bbox.maxX);
    maxY = Math.max(maxY, bbox.maxY);
  });

  return {
    width: maxX - minX,
    height: maxY - minY
  };
}

function calculateCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };

  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length
  };
}

function calculateUtilization(individual: Individual, bin: any): number {
  if (individual.placements.length === 0) return 0;

  const bbox = getBoundingBoxOfPlacements(
    individual.placements,
    [] // We don't have shapes here, simplified
  );
  const usedArea = bbox.width * bbox.height;
  const binArea = bin.width * bin.height;

  return (usedArea / binArea) * 100;
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
