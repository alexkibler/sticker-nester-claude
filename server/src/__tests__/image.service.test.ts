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

  describe('Non-rectangular shape processing', () => {
    it('should process a circular image', async () => {
      // Create a circle by drawing on a transparent canvas
      const size = 100;
      const radius = 40;

      // Create a circular mask using SVG
      const circle = Buffer.from(
        `<svg width="${size}" height="${size}">
          <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="red"/>
        </svg>`
      );

      const testImage = await sharp(circle).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);

      // Circle should have approximately equal width and height
      expect(Math.abs(result.width - result.height)).toBeLessThan(0.2);
    });

    it('should process a triangular image', async () => {
      const size = 100;

      // Create a triangle using SVG
      const triangle = Buffer.from(
        `<svg width="${size}" height="${size}">
          <polygon points="${size / 2},10 10,${size - 10} ${size - 10},${size - 10}" fill="blue"/>
        </svg>`
      );

      const testImage = await sharp(triangle).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(2); // At least 3 points for a triangle
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should process a star-shaped image', async () => {
      const size = 100;

      // Create a 5-pointed star using SVG
      const star = Buffer.from(
        `<svg width="${size}" height="${size}">
          <polygon points="50,10 61,35 85,35 66,50 73,75 50,60 27,75 34,50 15,35 39,35" fill="yellow"/>
        </svg>`
      );

      const testImage = await sharp(star).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(5); // Should have multiple points for star
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should process a hexagonal image', async () => {
      const size = 100;

      // Create a hexagon using SVG
      const hexagon = Buffer.from(
        `<svg width="${size}" height="${size}">
          <polygon points="50,10 80,30 80,70 50,90 20,70 20,30" fill="green"/>
        </svg>`
      );

      const testImage = await sharp(hexagon).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(3); // Should have at least some points
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should process an L-shaped image', async () => {
      const size = 100;

      // Create an L-shape using SVG
      const lShape = Buffer.from(
        `<svg width="${size}" height="${size}">
          <path d="M10,10 L40,10 L40,40 L70,40 L70,90 L10,90 Z" fill="purple"/>
        </svg>`
      );

      const testImage = await sharp(lShape).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(4); // L-shape has at least 6 corners
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should process an irregular polygon image', async () => {
      const size = 100;

      // Create an irregular polygon using SVG
      const irregular = Buffer.from(
        `<svg width="${size}" height="${size}">
          <polygon points="20,20 80,30 90,70 40,90 10,60" fill="orange"/>
        </svg>`
      );

      const testImage = await sharp(irregular).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(3);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should process a heart-shaped image', async () => {
      const size = 100;

      // Create a heart shape using SVG path
      const heart = Buffer.from(
        `<svg width="${size}" height="${size}">
          <path d="M50,85 C50,85 15,60 15,40 C15,25 25,15 35,15 C45,15 50,25 50,25 C50,25 55,15 65,15 C75,15 85,25 85,40 C85,60 50,85 50,85 Z" fill="pink"/>
        </svg>`
      );

      const testImage = await sharp(heart).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(5);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should process an oval image', async () => {
      const width = 120;
      const height = 80;

      // Create an ellipse/oval using SVG
      const oval = Buffer.from(
        `<svg width="${width}" height="${height}">
          <ellipse cx="${width / 2}" cy="${height / 2}" rx="50" ry="30" fill="cyan"/>
        </svg>`
      );

      const testImage = await sharp(oval).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);

      // Aspect ratio should reflect the oval shape (wider than tall)
      const aspectRatio = result.width / result.height;
      expect(aspectRatio).toBeGreaterThan(1);
    });

    it('should process a crescent moon shape', async () => {
      const size = 100;

      // Create a crescent by overlapping two circles
      const crescent = Buffer.from(
        `<svg width="${size}" height="${size}">
          <defs>
            <mask id="crescent">
              <circle cx="40" cy="50" r="35" fill="white"/>
              <circle cx="55" cy="50" r="30" fill="black"/>
            </mask>
          </defs>
          <circle cx="40" cy="50" r="35" fill="yellow" mask="url(#crescent)"/>
        </svg>`
      );

      const testImage = await sharp(crescent).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should process a complex multi-sided polygon', async () => {
      const size = 100;

      // Create an octagon using SVG
      const octagon = Buffer.from(
        `<svg width="${size}" height="${size}">
          <polygon points="30,10 70,10 90,30 90,70 70,90 30,90 10,70 10,30" fill="brown"/>
        </svg>`
      );

      const testImage = await sharp(octagon).png().toBuffer();

      const result = await service.processImage(testImage);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);

      // Octagon should be approximately square
      const aspectRatio = result.width / result.height;
      expect(aspectRatio).toBeCloseTo(1, 0);
    });
  });
});
