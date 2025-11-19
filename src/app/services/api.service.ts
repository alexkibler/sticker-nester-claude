import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { Point } from '../models/geometry.types';
import { Placement } from '../models/nesting.interface';

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
}

export interface PdfGenerationRequest {
  placements: Placement[];
  sheetWidth: number;
  sheetHeight: number;
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
   */
  async nestStickers(request: NestingApiRequest): Promise<NestingApiResponse> {
    return await firstValueFrom(
      this.http.post<NestingApiResponse>(
        `${this.baseUrl}/nesting/nest`,
        request
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

  /**
   * Listen to PDF generation progress via SSE
   */
  listenToPdfProgress(jobId: string): Observable<{ current: number; total: number; progress: number }> {
    return new Observable(observer => {
      const eventSource = new EventSource(`${this.baseUrl}/pdf/progress/${jobId}`);

      eventSource.addEventListener('progress', (event: any) => {
        const data = JSON.parse(event.data);
        observer.next(data);
      });

      eventSource.addEventListener('complete', () => {
        eventSource.close();
        observer.complete();
      });

      eventSource.addEventListener('error', (error) => {
        eventSource.close();
        observer.error(error);
      });

      return () => {
        eventSource.close();
      };
    });
  }
}
