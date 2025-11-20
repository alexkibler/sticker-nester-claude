import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { firstValueFrom, Observable, Subject } from 'rxjs';
import { Point } from '../models/geometry.types';
import { Placement } from '../models/nesting.interface';
import { io, Socket } from 'socket.io-client';

export interface ProcessedImage {
  id: string;
  path: Point[];
  width: number;
  height: number;
}

export interface NestingApiRequest {
  stickers: Array<{
    id: string;
    points: Point[];
    width: number;
    height: number;
  }>;
  sheetWidth: number;
  sheetHeight: number;
  spacing: number;
  productionMode?: boolean;
  sheetCount?: number;
  usePolygonPacking?: boolean;
  cellsPerInch?: number;
  stepSize?: number;
  packAllItems?: boolean;  // For polygon packing: true = pack all items (auto-expand pages)
}

export interface SheetPlacement {
  sheetIndex: number;
  placements: Placement[];
  utilization: number;
}

export interface NestingApiResponse {
  placements?: Placement[];
  utilization?: number;
  fitness?: number;
  sheets?: SheetPlacement[];
  totalUtilization?: number;
  quantities?: { [stickerId: string]: number };
  // For async polygon packing
  jobId?: string;
  message?: string;
  type?: 'single-sheet' | 'multi-sheet';
}

export interface PdfGenerationRequest {
  placements: Placement[];
  sheetWidth: number;
  sheetHeight: number;
}

export interface NestingProgress {
  jobId: string;
  message: string;
  currentSheet?: number;
  totalSheets?: number;
  itemsPlaced?: number;
  totalItems?: number;
  percentComplete?: number;
}

/**
 * API Service for communicating with the backend
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  // Use relative URL - the proxy will handle this in development
  private baseUrl = '/api';

  // Socket.IO connection
  private socket: Socket | null = null;
  private nestingProgress$ = new Subject<NestingProgress>();
  private nestingComplete$ = new Subject<{ jobId: string; result: any }>();
  private nestingError$ = new Subject<{ jobId: string; error: string }>();

  /**
   * Connect to Socket.IO server
   */
  connectSocket(): void {
    if (this.socket?.connected) {
      console.log('[API] Socket already connected');
      return;
    }

    // Determine Socket.IO URL based on environment
    const socketUrl = window.location.origin.includes('localhost:4200')
      ? 'http://localhost:3001' // Development: connect to backend server
      : window.location.origin; // Production: same origin

    console.log(`[API] Connecting to Socket.IO at ${socketUrl}`);

    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log(`[API] Socket connected: ${this.socket?.id}`);
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log(`[API] Socket disconnected: ${reason}`);
    });

    this.socket.on('nesting:progress', (data: NestingProgress) => {
      console.log(`[API] Nesting progress:`, data);
      this.nestingProgress$.next(data);
    });

    this.socket.on('nesting:complete', (data: { jobId: string; result: any }) => {
      console.log(`[API] Nesting complete:`, data);
      this.nestingComplete$.next(data);
    });

    this.socket.on('nesting:error', (data: { jobId: string; error: string }) => {
      console.error(`[API] Nesting error:`, data);
      this.nestingError$.next(data);
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('[API] Socket connection error:', error);
    });
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnectSocket(): void {
    if (this.socket) {
      console.log('[API] Disconnecting socket');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Get Socket ID (null if not connected)
   */
  getSocketId(): string | null {
    return this.socket?.id || null;
  }

  /**
   * Get observables for nesting events
   */
  onNestingProgress(): Observable<NestingProgress> {
    return this.nestingProgress$.asObservable();
  }

  onNestingComplete(): Observable<{ jobId: string; result: any }> {
    return this.nestingComplete$.asObservable();
  }

  onNestingError(): Observable<{ jobId: string; error: string }> {
    return this.nestingError$.asObservable();
  }

  /**
   * Process uploaded images and extract vector paths
   */
  async processImages(
    files: File[],
    maxDimension: number,
    unit: 'inches' | 'mm',
    onProgress?: (progress: number) => void
  ): Promise<ProcessedImage[]> {
    const formData = new FormData();

    files.forEach(file => {
      formData.append('images', file);
    });

    // Add max dimension and unit parameters
    formData.append('maxDimension', maxDimension.toString());
    formData.append('unit', unit);

    return new Promise((resolve, reject) => {
      this.http.post<{ images: ProcessedImage[] }>(
        `${this.baseUrl}/nesting/process`,
        formData,
        {
          reportProgress: true,
          observe: 'events'
        }
      ).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            if (event.total) {
              const progress = Math.round((event.loaded / event.total) * 100);
              onProgress?.(progress);
            }
          } else if (event.type === HttpEventType.Response) {
            resolve(event.body!.images);
          }
        },
        error: (error) => reject(error)
      });
    });
  }

  /**
   * Run nesting algorithm
   * For polygon packing, this returns a job ID and progress is sent via Socket.IO
   * For rectangle packing, this returns the result directly
   */
  async nestStickers(request: NestingApiRequest): Promise<NestingApiResponse> {
    // Include socket ID if connected and using polygon packing
    const socketId = this.socket?.connected ? this.socket.id : null;

    // Warn if using polygon packing without socket connection
    if (request.usePolygonPacking && !socketId) {
      console.warn('[API] Polygon packing requested but socket not connected. Progress updates will not be available.');
      console.warn('[API] Socket status:', {
        exists: !!this.socket,
        connected: this.socket?.connected,
        id: this.socket?.id
      });
    }

    const requestWithSocket = {
      ...request,
      socketId: request.usePolygonPacking ? socketId : null
    };

    return await firstValueFrom(
      this.http.post<NestingApiResponse>(
        `${this.baseUrl}/nesting/nest`,
        requestWithSocket
      )
    );
  }

  /**
   * Generate PDF with sticker layout
   */
  async generatePdf(
    files: Map<string, File>,
    placementsOrSheets: Placement[] | SheetPlacement[],
    stickers: any[],
    sheetWidth: number,
    sheetHeight: number,
    productionMode: boolean = false,
    onProgress?: (progress: number, current: number, total: number) => void
  ): Promise<Blob> {
    const formData = new FormData();

    // Add image files
    files.forEach((file, id) => {
      formData.append('images', file, id);
    });

    // Add placement/sheet data based on mode
    if (productionMode) {
      formData.append('sheets', JSON.stringify(placementsOrSheets));
    } else {
      formData.append('placements', JSON.stringify(placementsOrSheets));
    }

    formData.append('stickers', JSON.stringify(stickers));
    formData.append('sheetWidth', sheetWidth.toString());
    formData.append('sheetHeight', sheetHeight.toString());
    formData.append('productionMode', productionMode.toString());

    // If progress callback provided and in production mode, use SSE for progress
    if (onProgress && productionMode && Array.isArray(placementsOrSheets)) {
      return this.generatePdfWithProgress(formData, placementsOrSheets.length, onProgress);
    }

    const response = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/pdf/generate`,
        formData,
        {
          responseType: 'blob'
        }
      )
    );

    return response;
  }

  /**
   * Generate PDF with progress tracking via SSE
   */
  private async generatePdfWithProgress(
    formData: FormData,
    totalPages: number,
    onProgress: (progress: number, current: number, total: number) => void
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      // First, initiate the PDF generation
      this.http.post(
        `${this.baseUrl}/pdf/generate`,
        formData,
        {
          responseType: 'blob',
          reportProgress: true,
          observe: 'events'
        }
      ).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.DownloadProgress) {
            // Estimate progress based on download progress
            // This is a fallback if SSE isn't working
            if (event.total) {
              const progress = Math.round((event.loaded / event.total) * 100);
              const currentPage = Math.floor((progress / 100) * totalPages);
              onProgress(progress, currentPage, totalPages);
            }
          } else if (event.type === HttpEventType.Response) {
            onProgress(100, totalPages, totalPages);
            resolve(event.body!);
          }
        },
        error: (error) => reject(error)
      });
    });
  }
}
