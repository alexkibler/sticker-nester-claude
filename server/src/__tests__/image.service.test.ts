import { ImageService } from '../services/image.service';
import sharp from 'sharp';

describe('ImageService', () => {
  let service: ImageService;

  beforeEach(() => {
    service = new ImageService();
  });

  describe('processImage', () => {
    it('should process a simple test image', async () => {
      // Create a simple 100x100 red square PNG
      const testImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const result = await service.processImage(testImage);

      // Should extract a path
      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(0);

      // Should have dimensions in inches (assuming 72 DPI default)
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);

      // For a square, width should approximately equal height
      expect(Math.abs(result.width - result.height)).toBeLessThan(0.1);
    });

    it('should handle images with transparency', async () => {
      // Create a 50x50 image with semi-transparent background
      const testImage = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 0, g: 0, b: 255, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(0);
    });

    it('should maintain aspect ratio', async () => {
      // Create a 200x100 rectangle
      const testImage = await sharp({
        create: {
          width: 200,
          height: 100,
          channels: 4,
          background: { r: 0, g: 255, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const result = await service.processImage(testImage);

      // Aspect ratio should be approximately 2:1
      const aspectRatio = result.width / result.height;
      expect(aspectRatio).toBeCloseTo(2, 0);
    });
  });
});
