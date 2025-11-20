/**
 * Genetic Algorithm optimizer for polygon packing
 *
 * Uses evolutionary principles: population, selection, crossover, mutation
 * Slower than simulated annealing but can find better global optima
 */

import { Point } from './image.service';
import { GeometryService } from './geometry.service';
import { NFPNester, NestablePolygon, NestedPlacement } from './nfp-nesting.service';

const geometryService = new GeometryService();

interface Gene {
  itemId: string;
  x: number;
  y: number;
  rotation: number;
}

type Genome = Gene[];

interface GAConfig {
  populationSize: number;
  generations: number;
  mutationRate: number;
  eliteCount: number;
  tournamentSize: number;
}

export class GeneticAlgorithmOptimizer {
  constructor(
    private items: NestablePolygon[],
    private sheetWidth: number,
    private sheetHeight: number,
    private spacing: number,
    private rotations: number[] = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]
  ) {}

  /**
   * Optimize packing using genetic algorithm
   */
  async optimize(config?: Partial<GAConfig>): Promise<{
    placements: NestedPlacement[];
    utilization: number;
    generations: number;
    improvements: number;
  }> {
    const fullConfig: GAConfig = {
      populationSize: config?.populationSize || 30,
      generations: config?.generations || 100,
      mutationRate: config?.mutationRate || 0.15,
      eliteCount: config?.eliteCount || 3,
      tournamentSize: config?.tournamentSize || 5
    };

    console.log('\n=== Genetic Algorithm Optimization ===');
    console.log(`Config: pop=${fullConfig.populationSize}, gen=${fullConfig.generations}, mutation=${fullConfig.mutationRate}`);

    // 1. Initialize population
    console.log('Phase 1: Initializing population...');
    let population = await this.initializePopulation(fullConfig.populationSize);

    let bestGenome = population[0];
    let bestFitness = this.calculateFitness(bestGenome);
    let bestUtilization = this.calculateUtilization(bestGenome);
    let improvements = 0;

    console.log(`Initial best: ${bestUtilization.toFixed(1)}% utilization`);

    // 2. Evolution loop
    console.log('\nPhase 2: Evolution...');

    for (let gen = 0; gen < fullConfig.generations; gen++) {
      // Evaluate fitness
      const fitnessScores = population.map(genome => this.calculateFitness(genome));

      // Track best
      const maxFitness = Math.max(...fitnessScores);
      const bestIdx = fitnessScores.indexOf(maxFitness);

      if (maxFitness > bestFitness) {
        bestFitness = maxFitness;
        bestGenome = population[bestIdx];
        bestUtilization = this.calculateUtilization(bestGenome);
        improvements++;
        console.log(`  Gen ${gen}: New best ${bestUtilization.toFixed(1)}% (fitness=${bestFitness.toFixed(1)})`);
      }

      // Early stopping
      if (bestUtilization > 95) {
        console.log('  Excellent solution found, stopping early');
        break;
      }

      // Create next generation
      const nextPopulation: Genome[] = [];

      // Elitism: keep best solutions
      const elites = this.selectElites(population, fitnessScores, fullConfig.eliteCount);
      nextPopulation.push(...elites);

      // Fill rest with offspring
      while (nextPopulation.length < fullConfig.populationSize) {
        // Selection
        const parent1 = this.tournamentSelect(population, fitnessScores, fullConfig.tournamentSize);
        const parent2 = this.tournamentSelect(population, fitnessScores, fullConfig.tournamentSize);

        // Crossover
        const [child1, child2] = this.crossover(parent1, parent2);

        // Mutation
        const mutated1 = this.mutate(child1, fullConfig.mutationRate);
        const mutated2 = this.mutate(child2, fullConfig.mutationRate);

        nextPopulation.push(mutated1, mutated2);
      }

      population = nextPopulation.slice(0, fullConfig.populationSize);

      // Progress
      if ((gen + 1) % 10 === 0) {
        const avgFitness = fitnessScores.reduce((a, b) => a + b, 0) / fitnessScores.length;
        console.log(`  Gen ${gen + 1}/${fullConfig.generations}: Best=${bestUtilization.toFixed(1)}%, Avg=${avgFitness.toFixed(1)}`);
      }
    }

    console.log(`\n✓ Evolution complete: ${bestUtilization.toFixed(1)}% utilization (${improvements} improvements)`);

    return {
      placements: this.decodeGenome(bestGenome),
      utilization: bestUtilization,
      generations: fullConfig.generations,
      improvements
    };
  }

  /**
   * Initialize population with mix of strategies
   */
  private async initializePopulation(size: number): Promise<Genome[]> {
    const population: Genome[] = [];

    // 20% greedy solutions (high quality starting points)
    const greedyCount = Math.max(1, Math.floor(size * 0.2));
    for (let i = 0; i < greedyCount; i++) {
      const nester = new NFPNester(this.sheetWidth, this.sheetHeight, this.spacing, this.rotations);
      const result = await nester.nest(this.items);
      population.push(this.encodeGenome(result.placements));
    }

    // 80% random solutions (diversity)
    while (population.length < size) {
      population.push(this.createRandomGenome());
    }

    return population;
  }

  /**
   * Create random genome
   */
  private createRandomGenome(): Genome {
    const itemCount = Math.min(this.items.length, Math.floor(Math.random() * this.items.length) + 1);
    const selectedItems = this.shuffleArray([...this.items]).slice(0, itemCount);

    return selectedItems.map(item => ({
      itemId: item.id,
      x: Math.random() * (this.sheetWidth - 2),
      y: Math.random() * (this.sheetHeight - 2),
      rotation: this.rotations[Math.floor(Math.random() * this.rotations.length)]
    }));
  }

  /**
   * Calculate fitness (higher is better)
   */
  private calculateFitness(genome: Genome): number {
    const utilization = this.calculateUtilization(genome);
    const overlapPenalty = this.countOverlaps(genome) * 50;
    const outOfBoundsPenalty = this.countOutOfBounds(genome) * 100;

    return utilization - overlapPenalty - outOfBoundsPenalty;
  }

  /**
   * Calculate utilization
   */
  private calculateUtilization(genome: Genome): number {
    const placements = this.decodeGenome(genome);
    const totalArea = placements.reduce((sum, p) => {
      const item = this.items.find(i => p.id === i.id);
      return sum + (item?.area || 0);
    }, 0);

    const sheetArea = this.sheetWidth * this.sheetHeight;
    return (totalArea / sheetArea) * 100;
  }

  /**
   * Count overlapping items
   */
  private countOverlaps(genome: Genome): number {
    const placements = this.decodeGenome(genome);
    let count = 0;

    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        if (this.hasOverlap(placements[i].points, placements[j].points)) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Count out of bounds items
   */
  private countOutOfBounds(genome: Genome): number {
    const placements = this.decodeGenome(genome);
    return placements.filter(p =>
      p.points.some(pt => pt.x < 0 || pt.x > this.sheetWidth || pt.y < 0 || pt.y > this.sheetHeight)
    ).length;
  }

  /**
   * Check if two polygons overlap
   */
  private hasOverlap(poly1: Point[], poly2: Point[]): boolean {
    // Simplified overlap check using bounding boxes
    const bbox1 = this.getBounds(poly1);
    const bbox2 = this.getBounds(poly2);

    return !(bbox1.maxX < bbox2.minX || bbox2.maxX < bbox1.minX ||
             bbox1.maxY < bbox2.minY || bbox2.maxY < bbox1.minY);
  }

  /**
   * Get bounding box
   */
  private getBounds(points: Point[]) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  }

  /**
   * Tournament selection
   */
  private tournamentSelect(population: Genome[], fitnessScores: number[], tournamentSize: number): Genome {
    const tournament: number[] = [];
    for (let i = 0; i < tournamentSize; i++) {
      tournament.push(Math.floor(Math.random() * population.length));
    }

    let bestIdx = tournament[0];
    let bestFitness = fitnessScores[bestIdx];

    for (const idx of tournament) {
      if (fitnessScores[idx] > bestFitness) {
        bestFitness = fitnessScores[idx];
        bestIdx = idx;
      }
    }

    return population[bestIdx];
  }

  /**
   * Select elite solutions
   */
  private selectElites(population: Genome[], fitnessScores: number[], count: number): Genome[] {
    const indexed = population.map((genome, idx) => ({ genome, fitness: fitnessScores[idx] }));
    indexed.sort((a, b) => b.fitness - a.fitness);
    return indexed.slice(0, count).map(x => x.genome);
  }

  /**
   * Crossover: Order crossover
   */
  private crossover(parent1: Genome, parent2: Genome): [Genome, Genome] {
    const cutPoint = Math.floor(Math.min(parent1.length, parent2.length) / 2);

    const child1 = [
      ...parent1.slice(0, cutPoint),
      ...parent2.slice(cutPoint)
    ];

    const child2 = [
      ...parent2.slice(0, cutPoint),
      ...parent1.slice(cutPoint)
    ];

    return [child1, child2];
  }

  /**
   * Mutation
   */
  private mutate(genome: Genome, mutationRate: number): Genome {
    return genome.map(gene => {
      if (Math.random() < mutationRate) {
        const mutationType = Math.random();

        if (mutationType < 0.4) {
          // Position shift
          return {
            ...gene,
            x: Math.max(0, Math.min(this.sheetWidth, gene.x + (Math.random() - 0.5) * 0.5)),
            y: Math.max(0, Math.min(this.sheetHeight, gene.y + (Math.random() - 0.5) * 0.5))
          };
        } else if (mutationType < 0.7) {
          // Rotation
          const rotationDelta = Math.random() < 0.5 ? 15 : -15;
          return {
            ...gene,
            rotation: (gene.rotation + rotationDelta + 360) % 360
          };
        } else {
          // Large jump
          return {
            ...gene,
            x: Math.random() * (this.sheetWidth - 2),
            y: Math.random() * (this.sheetHeight - 2),
            rotation: this.rotations[Math.floor(Math.random() * this.rotations.length)]
          };
        }
      }
      return gene;
    });
  }

  /**
   * Encode placements as genome
   */
  private encodeGenome(placements: NestedPlacement[]): Genome {
    return placements.map(p => ({
      itemId: p.id,
      x: p.x,
      y: p.y,
      rotation: p.rotation
    }));
  }

  /**
   * Decode genome to placements
   */
  private decodeGenome(genome: Genome): NestedPlacement[] {
    return genome.map(gene => {
      const item = this.items.find(i => i.id === gene.itemId);
      if (!item) return null;

      const rotated = geometryService.rotatePoints(item.points, gene.rotation);
      const translated = rotated.map(p => ({ x: p.x + gene.x, y: p.y + gene.y }));

      return {
        id: gene.itemId,
        x: gene.x,
        y: gene.y,
        rotation: gene.rotation,
        points: translated
      };
    }).filter(p => p !== null) as NestedPlacement[];
  }

  /**
   * Shuffle array
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
