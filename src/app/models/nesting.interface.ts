import { Point } from './geometry.types';

/**
 * Nesting configuration and result types
 * As defined in the architectural specification sections 7.2 and 7.3
 */

export interface NestingRequest {
  bin: {
    width: number; // In normalized calculation units
    height: number;
  };
  shapes: NestingShape[];
  config: NestingConfig;
}

export interface NestingShape {
  id: string;
  points: Point[]; // The Simplified Path
}

export interface NestingConfig {
  rotations: number; // e.g., 4 (0, 90, 180, 270)
  populationSize: number;
  mutationRate: number;
  spacing: number; // Spacing between parts in normalized units
}

export interface NestingResponse {
  generation: number;
  fitness: number; // 0.0 to 1.0 (Utilization)
  placements: Placement[];
  binUtilization: number; // Percentage of bin used
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  rotation: number; // degrees
}

/**
 * Worker message types for communication between main thread and worker
 */
export interface WorkerMessage {
  type: 'start' | 'stop' | 'config';
  payload?: any;
}

export interface WorkerProgressMessage {
  type: 'progress' | 'complete' | 'error';
  payload: NestingResponse | string;
}
