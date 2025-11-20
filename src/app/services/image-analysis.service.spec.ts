import { TestBed } from '@angular/core/testing';
import { ImageAnalysisService } from './image-analysis.service';

describe('ImageAnalysisService', () => {
  let service: ImageAnalysisService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImageAnalysisService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadImageBitmap', () => {
    it('should load a valid image file and create an ImageBitmap', async () => {
      // Create a minimal 1x1 PNG file
      const pngData = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, // PNG signature
        0, 0, 0, 13, 73, 72, 68, 82,     // IHDR chunk
        0, 0, 0, 1, 0, 0, 0, 1, 8, 6,    // 1x1 RGBA
        0, 0, 0, 31, 21, 196, 137,       // CRC
        0, 0, 0, 13, 73, 68, 65, 84,     // IDAT chunk
        8, 215, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 24, 221, 141, 82, // Image data
        0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130 // IEND chunk
      ]);
      const blob = new Blob([pngData], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });

      const bitmap = await service.loadImageBitmap(file);

      expect(bitmap).toBeInstanceOf(ImageBitmap);
      expect(bitmap.width).toBe(1);
      expect(bitmap.height).toBe(1);
    });

    it('should reject for invalid file data', async () => {
      const invalidData = new Blob(['not an image'], { type: 'image/png' });
      const file = new File([invalidData], 'invalid.png', { type: 'image/png' });

      await expectAsync(service.loadImageBitmap(file)).toBeRejected();
    });
  });
});
