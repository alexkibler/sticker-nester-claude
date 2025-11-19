import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  NestingRequest,
  NestingResponse,
  WorkerProgressMessage
} from '../models';

/**
 * WorkerService manages communication with the nesting Web Worker
 *
 * Provides a clean interface for starting, stopping, and receiving
 * updates from the background nesting computation.
 *
 * As specified in section 3.2 of the architectural specification
 */
@Injectable({
  providedIn: 'root'
})
export class WorkerService {
  private worker: Worker | null = null;
  private progressSubject = new Subject<NestingResponse>();
  private errorSubject = new Subject<string>();

  constructor() {}

  /**
   * Initialize the worker
   */
  private initializeWorker(): void {
    if (this.worker) {
      return;
    }

    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(
        new URL('../workers/nesting.worker', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = ({ data }) => {
        this.handleWorkerMessage(data);
      };

      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.errorSubject.next(error.message);
      };
    } else {
      console.error('Web Workers are not supported in this environment.');
      this.errorSubject.next('Web Workers not supported');
    }
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(message: WorkerProgressMessage): void {
    switch (message.type) {
      case 'progress':
      case 'complete':
        this.progressSubject.next(message.payload as NestingResponse);
        break;

      case 'error':
        this.errorSubject.next(message.payload as string);
        break;
    }
  }

  /**
   * Start the nesting algorithm
   */
  startNesting(request: NestingRequest): void {
    this.initializeWorker();

    if (this.worker) {
      this.worker.postMessage({
        type: 'start',
        payload: request
      });
    }
  }

  /**
   * Stop the nesting algorithm
   */
  stopNesting(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
    }
  }

  /**
   * Get progress updates as an Observable
   */
  getProgress(): Observable<NestingResponse> {
    return this.progressSubject.asObservable();
  }

  /**
   * Get errors as an Observable
   */
  getErrors(): Observable<string> {
    return this.errorSubject.asObservable();
  }

  /**
   * Terminate the worker and clean up resources
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.progressSubject.complete();
    this.errorSubject.complete();
  }

  /**
   * Check if worker is supported
   */
  isWorkerSupported(): boolean {
    return typeof Worker !== 'undefined';
  }
}
