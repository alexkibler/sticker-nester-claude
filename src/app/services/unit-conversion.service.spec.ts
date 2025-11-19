import { TestBed } from '@angular/core/testing';
import { UnitConversionService } from './unit-conversion.service';

describe('UnitConversionService', () => {
  let service: UnitConversionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UnitConversionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('toInches', () => {
    it('should convert inches to inches', () => {
      expect(service.toInches(2, 'in')).toBe(2);
    });

    it('should convert centimeters to inches', () => {
      const result = service.toInches(2.54, 'cm');
      expect(result).toBeCloseTo(1, 2);
    });

    it('should convert millimeters to inches', () => {
      const result = service.toInches(25.4, 'mm');
      expect(result).toBeCloseTo(1, 2);
    });
  });

  describe('fromInches', () => {
    it('should convert inches to centimeters', () => {
      const result = service.fromInches(1, 'cm');
      expect(result).toBeCloseTo(2.54, 2);
    });

    it('should convert inches to millimeters', () => {
      const result = service.fromInches(1, 'mm');
      expect(result).toBeCloseTo(25.4, 2);
    });
  });

  describe('toPdfPoints', () => {
    it('should convert inches to PDF points', () => {
      // 2 inches × 72 points/inch = 144 points
      expect(service.toPdfPoints(2, 'in')).toBe(144);
    });

    it('should convert centimeters to PDF points', () => {
      // 2.54 cm = 1 inch = 72 points
      const result = service.toPdfPoints(2.54, 'cm');
      expect(result).toBeCloseTo(72, 1);
    });
  });

  describe('toPrintDots', () => {
    it('should convert inches to print dots at 300 DPI', () => {
      // 1 inch × 300 DPI = 300 dots
      expect(service.toPrintDots(1, 'in')).toBe(300);
    });

    it('should convert 2 inches to 600 dots', () => {
      expect(service.toPrintDots(2, 'in')).toBe(600);
    });
  });

  describe('toCanvasPixels', () => {
    it('should convert inches to canvas pixels at 96 DPI', () => {
      // 1 inch × 96 DPI = 96 pixels
      expect(service.toCanvasPixels(1, 'in')).toBe(96);
    });
  });

  describe('getImageScaleFactor', () => {
    it('should calculate correct scale factor for PDF embedding', () => {
      // 600px image needs to fit in 2 inches
      // 2 inches × 72 points/inch = 144 points
      // Scale = 144 / 600 = 0.24
      const scale = service.getImageScaleFactor(600, 2);
      expect(scale).toBeCloseTo(0.24, 2);
    });
  });

  describe('calculateDPI', () => {
    it('should calculate DPI correctly', () => {
      // 600 pixels in 2 inches = 300 DPI
      const dpi = service.calculateDPI(600, 2, 'in');
      expect(dpi).toBe(300);
    });

    it('should handle centimeter input', () => {
      // 600 pixels in 5.08 cm (2 inches) = 300 DPI
      const dpi = service.calculateDPI(600, 5.08, 'cm');
      expect(dpi).toBeCloseTo(300, 0);
    });
  });

  describe('toClipperUnits and fromClipperUnits', () => {
    it('should convert to clipper units and back', () => {
      const original = 2.5;
      const clipper = service.toClipperUnits(original, 'in');
      const back = service.fromClipperUnits(clipper, 'in');
      expect(back).toBeCloseTo(original, 5);
    });

    it('should produce integer values for clipper', () => {
      const clipper = service.toClipperUnits(1.5, 'in');
      expect(Number.isInteger(clipper)).toBe(true);
    });
  });

  describe('scaleCoordinates', () => {
    it('should scale from inches to centimeters', () => {
      const result = service.scaleCoordinates(1, 'in', 'cm');
      expect(result).toBeCloseTo(2.54, 2);
    });

    it('should scale from millimeters to inches', () => {
      const result = service.scaleCoordinates(25.4, 'mm', 'in');
      expect(result).toBeCloseTo(1, 2);
    });
  });

  describe('constants', () => {
    it('should provide correct PDF DPI', () => {
      expect(service.getPdfDpi()).toBe(72);
    });

    it('should provide correct Print DPI', () => {
      expect(service.getPrintDpi()).toBe(300);
    });

    it('should provide clipper scale', () => {
      expect(service.getClipperScale()).toBe(1000);
    });
  });
});
