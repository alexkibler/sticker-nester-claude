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

  describe('createAlphaMask', () => {
    it('should create binary mask from alpha channel', () => {
      // Create test image data with some transparent pixels
      const imageData = new ImageData(2, 2);
      const data = imageData.data;

      // First pixel: opaque
      data[0] = 255; // R
      data[1] = 0;   // G
      data[2] = 0;   // B
      data[3] = 255; // A

      // Second pixel: transparent
      data[4] = 255;
      data[5] = 0;
      data[6] = 0;
      data[7] = 0; // Transparent

      const mask = service.createAlphaMask(imageData);

      // First pixel should be black
      expect(mask.data[0]).toBe(0);
      expect(mask.data[1]).toBe(0);
      expect(mask.data[2]).toBe(0);
      expect(mask.data[3]).toBe(255);

      // Second pixel should be white
      expect(mask.data[4]).toBe(255);
      expect(mask.data[5]).toBe(255);
      expect(mask.data[6]).toBe(255);
      expect(mask.data[7]).toBe(255);
    });
  });

  describe('parseSvgPath', () => {
    it('should parse simple MoveTo and LineTo commands', () => {
      const pathData = 'M 10 20 L 30 40 L 50 60';
      const points = service.parseSvgPath(pathData);

      expect(points.length).toBe(3);
      expect(points[0]).toEqual({ x: 10, y: 20 });
      expect(points[1]).toEqual({ x: 30, y: 40 });
      expect(points[2]).toEqual({ x: 50, y: 60 });
    });

    it('should handle relative commands', () => {
      const pathData = 'M 10 10 l 10 10';
      const points = service.parseSvgPath(pathData);

      expect(points.length).toBe(2);
      expect(points[0]).toEqual({ x: 10, y: 10 });
      expect(points[1]).toEqual({ x: 20, y: 20 });
    });

    it('should handle horizontal and vertical lines', () => {
      const pathData = 'M 0 0 H 10 V 10';
      const points = service.parseSvgPath(pathData);

      expect(points.length).toBe(3);
      expect(points[0]).toEqual({ x: 0, y: 0 });
      expect(points[1]).toEqual({ x: 10, y: 0 });
      expect(points[2]).toEqual({ x: 10, y: 10 });
    });
  });

  describe('getLargestPath', () => {
    it('should return the largest path by area', () => {
      const paths = [
        // Small square (area = 4)
        [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 2 },
          { x: 0, y: 2 }
        ],
        // Large square (area = 100)
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 }
        ]
      ];

      const largest = service.getLargestPath(paths);
      expect(largest.length).toBe(4);
      expect(largest[1].x).toBe(10); // Should be the larger square
    });

    it('should return empty array for no paths', () => {
      const largest = service.getLargestPath([]);
      expect(largest).toEqual([]);
    });
  });
});
