/**
 * Rotation Configuration Service
 * Defines preset rotation strategies with performance/quality tradeoffs
 */

export interface RotationPreset {
  name: string;
  description: string;
  rotations: number[];
  stepSize: number;        // Position search step in inches
  cellsPerInch: number;    // Grid resolution
  estimatedSpeedFactor: number; // Relative to baseline (1.0 = same as 90° only)
  expectedQuality: 'basic' | 'good' | 'excellent' | 'optimal';
}

export class RotationConfigService {
  /**
   * BASELINE: Only right angles (current default)
   * Fast but limited packing quality
   */
  static readonly PRESET_90_DEGREE: RotationPreset = {
    name: '90° Only',
    description: 'Only 0°, 90°, 180°, 270° rotations (fastest)',
    rotations: [0, 90, 180, 270],
    stepSize: 0.05,
    cellsPerInch: 100,
    estimatedSpeedFactor: 1.0,
    expectedQuality: 'basic',
  };

  /**
   * BALANCED: 45° increments
   * 2x slower but much better packing for diagonal shapes
   */
  static readonly PRESET_45_DEGREE: RotationPreset = {
    name: '45° Steps',
    description: '8 rotation angles (0°, 45°, 90°, 135°, etc.)',
    rotations: [0, 45, 90, 135, 180, 225, 270, 315],
    stepSize: 0.075,        // Slightly coarser positions (offset slowdown)
    cellsPerInch: 75,       // Lower resolution (offset slowdown)
    estimatedSpeedFactor: 1.5,
    expectedQuality: 'good',
  };

  /**
   * RECOMMENDED: 15° increments with optimizations
   * ~Same speed as baseline but MUCH better packing quality
   */
  static readonly PRESET_15_DEGREE: RotationPreset = {
    name: '15° Steps (Recommended)',
    description: '24 rotation angles with optimized settings',
    rotations: [
      0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165,
      180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345,
    ],
    stepSize: 0.1,          // Coarser positions (4x speedup)
    cellsPerInch: 50,       // Lower resolution (4x speedup)
    estimatedSpeedFactor: 1.2, // Net: slightly slower than baseline
    expectedQuality: 'excellent',
  };

  /**
   * HIGH QUALITY: 10° increments
   * 3-4x slower but excellent for complex shapes
   */
  static readonly PRESET_10_DEGREE: RotationPreset = {
    name: '10° Steps',
    description: '36 rotation angles (high quality)',
    rotations: Array.from({ length: 36 }, (_, i) => i * 10),
    stepSize: 0.1,
    cellsPerInch: 50,
    estimatedSpeedFactor: 2.5,
    expectedQuality: 'excellent',
  };

  /**
   * MAXIMUM QUALITY: 5° increments
   * 6-8x slower but near-optimal packing
   */
  static readonly PRESET_5_DEGREE: RotationPreset = {
    name: '5° Steps',
    description: '72 rotation angles (maximum quality, slow)',
    rotations: Array.from({ length: 72 }, (_, i) => i * 5),
    stepSize: 0.15,         // Coarser to compensate
    cellsPerInch: 40,       // Lower resolution to compensate
    estimatedSpeedFactor: 4.0,
    expectedQuality: 'optimal',
  };

  /**
   * EXPERIMENTAL: 1° increments (for research/testing only)
   * 20-30x slower - not recommended for production
   */
  static readonly PRESET_1_DEGREE: RotationPreset = {
    name: '1° Steps (Experimental)',
    description: '360 rotation angles (extremely slow, research only)',
    rotations: Array.from({ length: 360 }, (_, i) => i),
    stepSize: 0.2,
    cellsPerInch: 25,
    estimatedSpeedFactor: 15.0,
    expectedQuality: 'optimal',
  };

  /**
   * Get all available presets
   */
  static getAllPresets(): RotationPreset[] {
    return [
      this.PRESET_90_DEGREE,
      this.PRESET_45_DEGREE,
      this.PRESET_15_DEGREE,
      this.PRESET_10_DEGREE,
      this.PRESET_5_DEGREE,
      this.PRESET_1_DEGREE,
    ];
  }

  /**
   * Get preset by name
   */
  static getPresetByName(name: string): RotationPreset | undefined {
    return this.getAllPresets().find(p => p.name === name);
  }

  /**
   * Get default/recommended preset
   */
  static getDefaultPreset(): RotationPreset {
    return this.PRESET_15_DEGREE;
  }

  /**
   * Create custom rotation preset
   */
  static createCustomPreset(
    rotationStep: number,
    stepSize: number = 0.1,
    cellsPerInch: number = 50
  ): RotationPreset {
    const rotationCount = Math.floor(360 / rotationStep);
    const rotations = Array.from({ length: rotationCount }, (_, i) => i * rotationStep);

    return {
      name: `${rotationStep}° Custom`,
      description: `${rotationCount} rotation angles (custom configuration)`,
      rotations,
      stepSize,
      cellsPerInch,
      estimatedSpeedFactor: rotationCount / 4, // Rough estimate based on 4 rotations baseline
      expectedQuality: rotationCount >= 72 ? 'optimal' : rotationCount >= 24 ? 'excellent' : rotationCount >= 8 ? 'good' : 'basic',
    };
  }

  /**
   * Estimate runtime for a packing operation
   */
  static estimateRuntime(
    preset: RotationPreset,
    itemCount: number,
    baselineTimePerItemMs: number = 200
  ): {
    estimatedTotalSeconds: number;
    estimatedTimePerItem: number;
    formattedEstimate: string;
  } {
    const estimatedTimePerItem = baselineTimePerItemMs * preset.estimatedSpeedFactor;
    const estimatedTotalMs = estimatedTimePerItem * itemCount;
    const estimatedTotalSeconds = estimatedTotalMs / 1000;

    let formattedEstimate: string;
    if (estimatedTotalSeconds < 60) {
      formattedEstimate = `~${Math.ceil(estimatedTotalSeconds)}s`;
    } else if (estimatedTotalSeconds < 3600) {
      formattedEstimate = `~${Math.ceil(estimatedTotalSeconds / 60)}min`;
    } else {
      const hours = Math.floor(estimatedTotalSeconds / 3600);
      const minutes = Math.ceil((estimatedTotalSeconds % 3600) / 60);
      formattedEstimate = `~${hours}h ${minutes}min`;
    }

    return {
      estimatedTotalSeconds,
      estimatedTimePerItem,
      formattedEstimate,
    };
  }
}
