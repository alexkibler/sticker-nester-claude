/**
 * Sheet size configuration with support for metric and imperial units
 */

export type UnitSystem = 'metric' | 'imperial';

/**
 * Dimensions in millimeters (internal representation)
 */
export interface SheetDimensionsMM {
  widthMM: number;
  heightMM: number;
}

/**
 * Standard sheet size definition
 */
export interface StandardSheetSize {
  id: string;
  name: string;
  widthMM: number;
  heightMM: number;
  category?: 'square' | 'standard' | 'legal' | 'panorama';
}

/**
 * Predefined standard sheet sizes
 * All dimensions stored in millimeters internally
 */
export const STANDARD_SHEET_SIZES: StandardSheetSize[] = [
  {
    id: '3.5x3.5',
    name: '3.5" × 3.5" (Square)',
    widthMM: 88.9,
    heightMM: 88.9,
    category: 'square'
  },
  {
    id: '3.5x5',
    name: '3.5" × 5"',
    widthMM: 88.9,
    heightMM: 127.0
  },
  {
    id: '4x6',
    name: '4" × 6"',
    widthMM: 101.6,
    heightMM: 152.4
  },
  {
    id: '5x5',
    name: '5" × 5" (Square)',
    widthMM: 127.0,
    heightMM: 127.0,
    category: 'square'
  },
  {
    id: '5x7',
    name: '5" × 7"',
    widthMM: 127.0,
    heightMM: 177.8
  },
  {
    id: '7x10',
    name: '7" × 10"',
    widthMM: 177.8,
    heightMM: 254.0
  },
  {
    id: '8x10',
    name: '8" × 10"',
    widthMM: 203.2,
    heightMM: 254.0
  },
  {
    id: 'letter',
    name: 'Letter (8.5" × 11")',
    widthMM: 215.9,
    heightMM: 279.4,
    category: 'standard'
  },
  {
    id: 'legal',
    name: 'Legal (8.5" × 14")',
    widthMM: 215.9,
    heightMM: 355.6,
    category: 'legal'
  },
  {
    id: '10x12',
    name: '10" × 12"',
    widthMM: 254.0,
    heightMM: 304.8
  },
  {
    id: 'ledger',
    name: 'Ledger (11" × 17")',
    widthMM: 279.4,
    heightMM: 431.8,
    category: 'standard'
  },
  {
    id: '12x12',
    name: '12" × 12" (Square)',
    widthMM: 304.8,
    heightMM: 304.8,
    category: 'square'
  },
  {
    id: 'a3plus',
    name: 'A3+ (13" × 19")',
    widthMM: 330.2,
    heightMM: 482.6,
    category: 'standard'
  },
  {
    id: 'panorama',
    name: 'Panorama (210 × 594mm)',
    widthMM: 210.0,
    heightMM: 594.0,
    category: 'panorama'
  },
  {
    id: 'custom',
    name: 'Custom (up to 12" × 24")',
    widthMM: 304.8,
    heightMM: 304.8
  }
];

/**
 * Unit conversion utilities
 */
export class UnitConverter {
  private static readonly MM_PER_INCH = 25.4;

  /**
   * Convert inches to millimeters
   */
  static inchesToMM(inches: number): number {
    return inches * this.MM_PER_INCH;
  }

  /**
   * Convert millimeters to inches
   */
  static mmToInches(mm: number): number {
    return mm / this.MM_PER_INCH;
  }

  /**
   * Format dimension for display based on unit system
   */
  static formatDimension(mm: number, unitSystem: UnitSystem, decimals: number = 1): string {
    if (unitSystem === 'metric') {
      return `${mm.toFixed(decimals)}mm`;
    } else {
      const inches = this.mmToInches(mm);
      return `${inches.toFixed(decimals)}"`;
    }
  }

  /**
   * Format sheet size name for display based on unit system
   */
  static formatSheetSizeName(size: StandardSheetSize, unitSystem: UnitSystem): string {
    if (size.id === 'custom') {
      return size.name; // Custom size keeps its original name
    }

    // For panorama size, show in the preferred unit
    if (size.id === 'panorama') {
      if (unitSystem === 'metric') {
        return 'Panorama (210 × 594mm)';
      } else {
        const widthIn = this.mmToInches(size.widthMM);
        const heightIn = this.mmToInches(size.heightMM);
        return `Panorama (${widthIn.toFixed(1)}" × ${heightIn.toFixed(1)}")`;
      }
    }

    // Extract dimensions and reformat based on unit system
    const widthDisplay = unitSystem === 'metric'
      ? `${size.widthMM.toFixed(0)}mm`
      : `${this.mmToInches(size.widthMM).toFixed(1)}"`;

    const heightDisplay = unitSystem === 'metric'
      ? `${size.heightMM.toFixed(0)}mm`
      : `${this.mmToInches(size.heightMM).toFixed(1)}"`;

    // Extract common name if present (e.g., "Letter", "Square", etc.)
    const commonNameMatch = size.name.match(/\(([^)]+)\)$/);
    const commonName = commonNameMatch ? ` (${commonNameMatch[1]})` : '';

    return `${widthDisplay} × ${heightDisplay}${commonName}`;
  }

  /**
   * Parse user input dimension string (handles both inches and mm)
   */
  static parseInputDimension(input: string, unitSystem: UnitSystem): number | null {
    const cleaned = input.trim().replace(/[^0-9.]/g, '');
    const value = parseFloat(cleaned);

    if (isNaN(value) || value <= 0) {
      return null;
    }

    // Convert to mm if input is in inches
    return unitSystem === 'imperial' ? this.inchesToMM(value) : value;
  }

  /**
   * Validate custom dimensions (max 12" x 24")
   */
  static validateCustomDimensions(widthMM: number, heightMM: number): { valid: boolean; error?: string } {
    const MAX_WIDTH_MM = this.inchesToMM(24); // 609.6mm
    const MAX_HEIGHT_MM = this.inchesToMM(24); // 609.6mm
    const MIN_MM = this.inchesToMM(1); // 25.4mm

    if (widthMM < MIN_MM || heightMM < MIN_MM) {
      return { valid: false, error: 'Dimensions must be at least 1" (25.4mm)' };
    }

    if (widthMM > MAX_WIDTH_MM || heightMM > MAX_HEIGHT_MM) {
      return { valid: false, error: 'Dimensions cannot exceed 24" (609.6mm)' };
    }

    return { valid: true };
  }
}

/**
 * Sheet size configuration state
 */
export interface SheetSizeConfig {
  selectedSizeId: string;
  customWidthMM: number;
  customHeightMM: number;
  unitSystem: UnitSystem;
}

/**
 * Get current dimensions based on configuration
 */
export function getCurrentDimensions(config: SheetSizeConfig): SheetDimensionsMM {
  if (config.selectedSizeId === 'custom') {
    return {
      widthMM: config.customWidthMM,
      heightMM: config.customHeightMM
    };
  }

  const standardSize = STANDARD_SHEET_SIZES.find(s => s.id === config.selectedSizeId);
  if (!standardSize) {
    throw new Error(`Unknown sheet size: ${config.selectedSizeId}`);
  }

  return {
    widthMM: standardSize.widthMM,
    heightMM: standardSize.heightMM
  };
}
