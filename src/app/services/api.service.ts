import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
  async processImages(files: File[]): Promise<ProcessedImage[]> {
    const formData = new FormData();

    files.forEach(file => {
      formData.append('images', file);
    });

    const response = await firstValueFrom(
      this.http.post<{ images: ProcessedImage[] }>(
        `${this.baseUrl}/nesting/process`,
        formData
      )
    );

    return response.images;
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
    productionMode: boolean = false
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
}
