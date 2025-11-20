/**
 * Worker Manager Service
 * Manages worker threads for CPU-intensive operations
 */
import { Worker } from 'worker_threads';
import path from 'path';
import {
  PackingWorkerData,
  PackingWorkerMessage,
  PackingWorkerProgress,
  PackingWorkerResult,
  PackingWorkerError
} from '../workers/packing.worker';

export interface WorkerJobOptions {
  onProgress?: (progress: PackingWorkerProgress) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export class WorkerManagerService {
  private activeWorkers: Map<string, Worker> = new Map();

  /**
   * Execute a packing job in a worker thread
   * Returns a promise that resolves with the result
   */
  async executePackingJob(
    jobId: string,
    data: PackingWorkerData,
    options: WorkerJobOptions = {}
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // Determine worker script path
      // In development: use TypeScript file with ts-node
      // In production: use compiled JavaScript file
      const workerPath = process.env.NODE_ENV === 'production'
        ? path.join(__dirname, '../workers/packing.worker.js')
        : path.join(__dirname, '../workers/packing.worker.ts');

      console.log(`[WorkerManager] Starting worker for job ${jobId}`);
      console.log(`[WorkerManager] Worker path: ${workerPath}`);

      // Spawn worker
      const worker = new Worker(workerPath, {
        workerData: data,
        // Use ts-node for TypeScript workers in development
        execArgv: process.env.NODE_ENV === 'production' ? [] : ['-r', 'ts-node/register']
      });

      this.activeWorkers.set(jobId, worker);

      // Handle messages from worker
      worker.on('message', (message: PackingWorkerMessage) => {
        if (message.type === 'progress') {
          console.log(`[WorkerManager] Progress (${jobId}): ${message.message}`);
          options.onProgress?.(message);
        } else if (message.type === 'result') {
          console.log(`[WorkerManager] Job ${jobId} completed successfully`);
          options.onComplete?.(message.result);
          this.terminateWorker(jobId);
          resolve(message.result);
        } else if (message.type === 'error') {
          console.error(`[WorkerManager] Job ${jobId} error: ${message.error}`);
          options.onError?.(message.error);
          this.terminateWorker(jobId);
          reject(new Error(message.error));
        }
      });

      // Handle worker errors
      worker.on('error', (error) => {
        console.error(`[WorkerManager] Worker error for job ${jobId}:`, error);
        options.onError?.(error.message);
        this.terminateWorker(jobId);
        reject(error);
      });

      // Handle worker exit
      worker.on('exit', (code) => {
        if (code !== 0) {
          const error = `Worker stopped with exit code ${code}`;
          console.error(`[WorkerManager] ${error}`);
          options.onError?.(error);
          this.terminateWorker(jobId);
          reject(new Error(error));
        }
      });
    });
  }

  /**
   * Terminate a specific worker
   */
  terminateWorker(jobId: string): void {
    const worker = this.activeWorkers.get(jobId);
    if (worker) {
      worker.terminate();
      this.activeWorkers.delete(jobId);
      console.log(`[WorkerManager] Worker ${jobId} terminated`);
    }
  }

  /**
   * Terminate all active workers
   */
  terminateAll(): void {
    console.log(`[WorkerManager] Terminating ${this.activeWorkers.size} active workers`);
    this.activeWorkers.forEach((worker, jobId) => {
      worker.terminate();
      console.log(`[WorkerManager] Terminated worker ${jobId}`);
    });
    this.activeWorkers.clear();
  }

  /**
   * Get count of active workers
   */
  getActiveWorkerCount(): number {
    return this.activeWorkers.size;
  }
}
