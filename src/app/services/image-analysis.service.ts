import { Injectable } from '@angular/core';

/**
 * ImageAnalysisService handles image loading for preview
 *
 * Image processing is now handled by the backend API.
 * This service only loads images for display purposes.
 */
@Injectable({
  providedIn: 'root'
})
export class ImageAnalysisService {
  constructor() {}

  /**
   * Load an image file and create an ImageBitmap for efficient canvas rendering
   */
  async loadImageBitmap(file: File): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const blob = new Blob([e.target!.result as ArrayBuffer], {
            type: file.type
          });
          const bitmap = await createImageBitmap(blob);
          resolve(bitmap);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}
