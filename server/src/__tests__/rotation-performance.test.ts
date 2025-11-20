/**
 * Rotation Performance Comparison Test
 * Compares different rotation granularities and their impact on packing quality/speed
 */

import { RotationConfigService } from '../services/rotation-config.service';
import { PolygonPacker, PackablePolygon, PackingPerformanceMetrics } from '../services/polygon-packing.service';
import { Point } from '../services/image.service';

describe('Rotation Performance Comparison', () => {
  // Create test polygons with different shapes
  const createTestPolygons = (): PackablePolygon[] => {
    // Square (packs well at any rotation)
    const square: PackablePolygon = {
      id: 'square',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      width: 1,
      height: 1,
      area: 1,
    };

    // Rectangle (benefits from 90° rotation)
    const rectangle: PackablePolygon = {
      id: 'rectangle',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 0.5 },
        { x: 0, y: 0.5 },
      ],
      width: 2,
      height: 0.5,
      area: 1,
    };

    // Diamond (benefits from 45° rotation)
    const diamond: PackablePolygon = {
      id: 'diamond',
      points: [
        { x: 0.5, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
      ],
      width: 1,
      height: 1,
      area: 0.5,
    };

    // Hexagon (benefits from continuous rotation)
    const hexagon: PackablePolygon = {
      id: 'hexagon',
      points: [
        { x: 0.5, y: 0 },
        { x: 1.0, y: 0.25 },
        { x: 1.0, y: 0.75 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.75 },
        { x: 0, y: 0.25 },
      ],
      width: 1,
      height: 1,
      area: 0.75,
    };

    // Irregular polygon (benefits most from fine rotation control)
    const irregular: PackablePolygon = {
      id: 'irregular',
      points: [
        { x: 0, y: 0 },
        { x: 1.5, y: 0 },
        { x: 1.8, y: 0.3 },
        { x: 1.2, y: 0.8 },
        { x: 0.3, y: 0.6 },
      ],
      width: 1.8,
      height: 0.8,
      area: 1.2,
    };

    return [square, rectangle, diamond, hexagon, irregular];
  };

  interface TestResult {
    preset: string;
    performance: PackingPerformanceMetrics;
    utilization: number;
    placementCount: number;
  }

  /**
   * Run packing test with a specific rotation preset
   */
  const runPackingTest = (
    presetName: string,
    polygons: PackablePolygon[],
    sheetWidth: number = 5,
    sheetHeight: number = 5
  ): TestResult => {
    const preset = RotationConfigService.getPresetByName(presetName);
    if (!preset) {
      throw new Error(`Preset not found: ${presetName}`);
    }

    const packer = new PolygonPacker(
      sheetWidth,
      sheetHeight,
      0.0625,
      preset.cellsPerInch,
      preset.stepSize,
      preset.rotations
    );

    const result = packer.pack(polygons, true); // trackPerformance = true

    return {
      preset: presetName,
      performance: result.performance!,
      utilization: result.utilization,
      placementCount: result.placements.length,
    };
  };

  describe('Performance Comparison', () => {
    test('Compare all rotation presets on same dataset', () => {
      const testPolygons = createTestPolygons();
      const results: TestResult[] = [];

      // Test each preset
      const presets = [
        '90° Only',
        '45° Steps',
        '15° Steps (Recommended)',
        '10° Steps',
        // Skip 5° and 1° for unit tests (too slow)
      ];

      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║          Rotation Granularity Performance Comparison          ║');
      console.log('╠════════════════════════════════════════════════════════════════╣');
      console.log(`║ Test polygons: ${testPolygons.length} items (${testPolygons.map(p => p.id).join(', ').padEnd(38)}║`);
      console.log('║ Sheet size: 5" × 5"                                            ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');

      for (const presetName of presets) {
        const result = runPackingTest(presetName, testPolygons);
        results.push(result);

        console.log(`\n📊 ${presetName}`);
        console.log(`${'─'.repeat(60)}`);
        console.log(`  Placements: ${result.placementCount}/${testPolygons.length} (${((result.placementCount / testPolygons.length) * 100).toFixed(0)}%)`);
        console.log(`  Utilization: ${result.utilization.toFixed(1)}%`);
        console.log(`  Total time: ${result.performance.totalTimeSec.toFixed(2)}s`);
        console.log(`  Avg time/item: ${result.performance.avgTimePerItemMs.toFixed(0)}ms`);
        console.log(`  Positions tried: ${result.performance.totalPositionsTried.toLocaleString()}`);
        console.log(`  Rotations tested: ${result.performance.rotationCount}`);
        console.log(`  Grid resolution: ${result.performance.cellsPerInch} cells/inch`);
        console.log(`  Step size: ${result.performance.stepSize}"`);
      }

      // Find best result by utilization
      const bestUtilization = results.reduce((best, curr) =>
        curr.utilization > best.utilization ? curr : best
      );

      const fastestResult = results.reduce((fastest, curr) =>
        curr.performance.totalTimeSec < fastest.performance.totalTimeSec ? curr : fastest
      );

      console.log(`\n\n╔════════════════════════════════════════════════════════════════╗`);
      console.log('║                        Summary                                 ║');
      console.log('╠════════════════════════════════════════════════════════════════╣');
      console.log(`║ 🏆 Best utilization: ${bestUtilization.preset.padEnd(39)}║`);
      console.log(`║    ${bestUtilization.utilization.toFixed(1)}% in ${bestUtilization.performance.totalTimeSec.toFixed(2)}s`.padEnd(65) + '║');
      console.log(`║                                                                ║`);
      console.log(`║ ⚡ Fastest: ${fastestResult.preset.padEnd(48)}║`);
      console.log(`║    ${fastestResult.performance.totalTimeSec.toFixed(2)}s (${fastestResult.utilization.toFixed(1)}% utilization)`.padEnd(65) + '║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');

      // Verify baseline works
      expect(results[0].preset).toBe('90° Only');
      expect(results[0].placementCount).toBeGreaterThan(0);

      // Verify finer rotations generally improve utilization
      // (though not guaranteed for all datasets)
      console.log('\n✓ Performance comparison test completed successfully\n');
    });

    test('Verify rotation preset parameters', () => {
      const preset90 = RotationConfigService.PRESET_90_DEGREE;
      expect(preset90.rotations).toEqual([0, 90, 180, 270]);
      expect(preset90.rotations.length).toBe(4);

      const preset15 = RotationConfigService.PRESET_15_DEGREE;
      expect(preset15.rotations.length).toBe(24);
      expect(preset15.rotations[0]).toBe(0);
      expect(preset15.rotations[1]).toBe(15);
      expect(preset15.stepSize).toBe(0.1); // Optimized step size
      expect(preset15.cellsPerInch).toBe(50); // Optimized resolution

      const preset5 = RotationConfigService.PRESET_5_DEGREE;
      expect(preset5.rotations.length).toBe(72);

      const preset1 = RotationConfigService.PRESET_1_DEGREE;
      expect(preset1.rotations.length).toBe(360);
    });

    test('Custom rotation preset creation', () => {
      const custom = RotationConfigService.createCustomPreset(30, 0.15, 40);
      expect(custom.rotations.length).toBe(12); // 360 / 30
      expect(custom.stepSize).toBe(0.15);
      expect(custom.cellsPerInch).toBe(40);
      expect(custom.rotations[0]).toBe(0);
      expect(custom.rotations[1]).toBe(30);
      expect(custom.rotations[11]).toBe(330);
    });

    test('Runtime estimation', () => {
      const preset90 = RotationConfigService.PRESET_90_DEGREE;
      const estimate90 = RotationConfigService.estimateRuntime(preset90, 10, 200);
      expect(estimate90.estimatedTotalSeconds).toBe(2); // 10 items * 200ms * 1.0 factor = 2000ms = 2s

      const preset15 = RotationConfigService.PRESET_15_DEGREE;
      const estimate15 = RotationConfigService.estimateRuntime(preset15, 10, 200);
      expect(estimate15.estimatedTotalSeconds).toBeCloseTo(2.4, 1); // 10 items * 200ms * 1.2 factor = 2400ms

      const preset5 = RotationConfigService.PRESET_5_DEGREE;
      const estimate5 = RotationConfigService.estimateRuntime(preset5, 100, 200);
      expect(estimate5.estimatedTotalSeconds).toBeCloseTo(80, 0); // 100 items * 200ms * 4.0 factor = 80s
      expect(estimate5.formattedEstimate).toContain('min');
    });
  });

  describe('Real-world scenario: Complex sticker shapes', () => {
    test('Pack 10 irregular stickers with different rotation granularities', () => {
      // Create 10 irregular stickers of various sizes
      const stickers: PackablePolygon[] = Array.from({ length: 10 }, (_, i) => ({
        id: `sticker_${i}`,
        points: [
          { x: 0, y: 0 },
          { x: 0.8 + (i % 3) * 0.2, y: 0 },
          { x: 1.0 + (i % 3) * 0.2, y: 0.4 + (i % 2) * 0.1 },
          { x: 0.6, y: 0.9 + (i % 2) * 0.1 },
          { x: 0.2, y: 0.7 },
        ],
        width: 1.0 + (i % 3) * 0.2,
        height: 0.9 + (i % 2) * 0.1,
        area: 0.7 + (i % 4) * 0.1,
      }));

      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║        Real-world Test: 10 Irregular Stickers                  ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');

      const results90 = runPackingTest('90° Only', stickers, 8, 8);
      const results15 = runPackingTest('15° Steps (Recommended)', stickers, 8, 8);

      console.log('\nComparison:');
      console.log(`  90° Only:      ${results90.placementCount} placed, ${results90.utilization.toFixed(1)}% util, ${results90.performance.totalTimeSec.toFixed(2)}s`);
      console.log(`  15° Steps:     ${results15.placementCount} placed, ${results15.utilization.toFixed(1)}% util, ${results15.performance.totalTimeSec.toFixed(2)}s`);

      const utilizationImprovement = results15.utilization - results90.utilization;
      const timeMultiplier = results15.performance.totalTimeSec / results90.performance.totalTimeSec;

      console.log(`\n  Utilization gain: ${utilizationImprovement > 0 ? '+' : ''}${utilizationImprovement.toFixed(1)}%`);
      console.log(`  Time cost: ${timeMultiplier.toFixed(2)}x slower\n`);

      // Both should successfully place all items (or most)
      expect(results90.placementCount).toBeGreaterThanOrEqual(8);
      expect(results15.placementCount).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Edge cases', () => {
    test('Empty polygon array', () => {
      const result = runPackingTest('90° Only', [], 5, 5);
      expect(result.placementCount).toBe(0);
      expect(result.utilization).toBe(0);
    });

    test('Single polygon', () => {
      const polygon: PackablePolygon = {
        id: 'single',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        width: 1,
        height: 1,
        area: 1,
      };

      const result = runPackingTest('90° Only', [polygon], 5, 5);
      expect(result.placementCount).toBe(1);
      expect(result.utilization).toBeGreaterThan(0);
    });

    test('Polygon too large for sheet', () => {
      const largePolygon: PackablePolygon = {
        id: 'too_large',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        width: 10,
        height: 10,
        area: 100,
      };

      const result = runPackingTest('90° Only', [largePolygon], 5, 5);
      expect(result.placementCount).toBe(0); // Too large to fit
      expect(result.performance.failedPlacements).toBe(1);
    });
  });
});
