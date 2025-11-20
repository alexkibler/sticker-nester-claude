/**
 * C++ Packer Service
 *
 * High-performance polygon packing using libnest2d via CLI wrapper.
 * Provides 5-25× performance improvement over JavaScript implementation.
 *
 * This service spawns the nest-packer C++ CLI and communicates via JSON over stdin/stdout.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { Sticker, Placement, NestingResult } from './nesting.service';

export interface CppPackerConfig {
  sheetWidth: number;
  sheetHeight: number;
  spacing: number;
  allowRotation: boolean;
  timeout?: number; // in milliseconds, default 30s
}

export interface CppPackerInput {
  stickers: Array<{
    id: string;
    points: Array<{ x: number; y: number }>;
    width: number;
    height: number;
  }>;
  sheetWidth: number;
  sheetHeight: number;
  spacing: number;
  allowRotation: boolean;
}

export interface CppPackerOutput {
  success: boolean;
  binCount?: number;
  placedCount?: number;
  totalCount?: number;
  utilization?: number;
  placements?: Array<{
    id: string;
    x: number;
    y: number;
    rotation: number;
    binId: number;
  }>;
  timing?: {
    packingMs: number;
    totalMs: number;
  };
  error?: string;
}

export class CppPackerService {
  private readonly binaryPath: string;
  private readonly enabled: boolean;

  constructor() {
    // Determine binary path (relative to this service file)
    // In development: server/src/services/cpp-packer.service.ts -> server/cpp-packer/bin/nest-packer
    // In production: dist/services/cpp-packer.service.js -> cpp-packer/bin/nest-packer
    const isDevelopment = __filename.endsWith('.ts');

    if (isDevelopment) {
      this.binaryPath = path.join(__dirname, '..', '..', 'cpp-packer', 'bin', 'nest-packer');
    } else {
      this.binaryPath = path.join(__dirname, '..', '..', 'cpp-packer', 'bin', 'nest-packer');
    }

    // Check if binary exists
    const fs = require('fs');
    this.enabled = fs.existsSync(this.binaryPath);

    if (this.enabled) {
      console.log(`[CppPacker] Enabled - binary found at: ${this.binaryPath}`);
    } else {
      console.warn(`[CppPacker] Disabled - binary not found at: ${this.binaryPath}`);
      console.warn(`[CppPacker] Run 'cd server/cpp-packer && ./build.sh' to enable C++ packing`);
    }
  }

  /**
   * Check if C++ packer is available
   */
  isAvailable(): boolean {
    return this.enabled;
  }

  /**
   * Get binary path (for debugging)
   */
  getBinaryPath(): string {
    return this.binaryPath;
  }

  /**
   * Pack stickers using C++ implementation
   *
   * @param stickers Array of stickers to pack
   * @param config Packing configuration
   * @returns Promise resolving to nesting result
   * @throws Error if packing fails or times out
   */
  async packStickers(
    stickers: Sticker[],
    config: CppPackerConfig
  ): Promise<NestingResult> {
    if (!this.enabled) {
      throw new Error('C++ packer not available - binary not found');
    }

    const startTime = Date.now();
    const timeout = config.timeout || 30000; // 30s default

    console.log(`[CppPacker] Packing ${stickers.length} stickers...`);

    // Prepare input JSON
    const input: CppPackerInput = {
      stickers: stickers.map(s => ({
        id: s.id,
        points: s.points,
        width: s.width,
        height: s.height,
      })),
      sheetWidth: config.sheetWidth,
      sheetHeight: config.sheetHeight,
      spacing: config.spacing,
      allowRotation: config.allowRotation,
    };

    try {
      const output = await this.executePacker(input, timeout);

      if (!output.success) {
        throw new Error(output.error || 'C++ packer returned failure');
      }

      // Convert to NestingResult format
      const placements: Placement[] = (output.placements || []).map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
      }));

      // Calculate fitness (total area placed)
      const fitness = placements.reduce((sum, p) => {
        const sticker = stickers.find(s => s.id === p.id);
        return sum + (sticker ? sticker.width * sticker.height : 0);
      }, 0);

      const duration = Date.now() - startTime;
      console.log(
        `[CppPacker] Completed in ${duration}ms (C++ time: ${output.timing?.totalMs}ms) - ` +
        `${output.placedCount}/${output.totalCount} placed, ${output.utilization?.toFixed(1)}% utilization`
      );

      return {
        placements,
        utilization: output.utilization || 0,
        fitness,
      };

    } catch (error: any) {
      console.error(`[CppPacker] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute the C++ packer binary
   *
   * @param input Input configuration
   * @param timeout Timeout in milliseconds
   * @returns Promise resolving to packer output
   * @private
   */
  private executePacker(input: CppPackerInput, timeout: number): Promise<CppPackerOutput> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdoutData = '';
      let stderrData = '';
      let timedOut = false;

      // Set timeout
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        reject(new Error(`C++ packer timed out after ${timeout}ms`));
      }, timeout);

      // Collect stdout (JSON result)
      child.stdout.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });

      // Collect stderr (logs)
      child.stderr.on('data', (data: Buffer) => {
        const msg = data.toString();
        stderrData += msg;
        // Log stderr in real-time for debugging
        process.stderr.write(msg);
      });

      // Handle process exit
      child.on('close', (code: number | null) => {
        clearTimeout(timer);

        if (timedOut) {
          return; // Already rejected
        }

        if (code !== 0) {
          reject(new Error(
            `C++ packer exited with code ${code}\n` +
            `stderr: ${stderrData}\n` +
            `stdout: ${stdoutData}`
          ));
          return;
        }

        try {
          const output: CppPackerOutput = JSON.parse(stdoutData);
          resolve(output);
        } catch (error: any) {
          reject(new Error(
            `Failed to parse C++ packer output: ${error.message}\n` +
            `stdout: ${stdoutData}`
          ));
        }
      });

      // Handle process errors
      child.on('error', (error: Error) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn C++ packer: ${error.message}`));
      });

      // Send input JSON to stdin
      try {
        const inputJson = JSON.stringify(input);
        child.stdin.write(inputJson);
        child.stdin.end();
      } catch (error: any) {
        clearTimeout(timer);
        child.kill('SIGTERM');
        reject(new Error(`Failed to write input to C++ packer: ${error.message}`));
      }
    });
  }

  /**
   * Benchmark: Compare C++ vs JS implementation
   *
   * @param stickers Stickers to pack
   * @param config Packing configuration
   * @param jsPackFunction JavaScript packing function for comparison
   * @returns Benchmark results
   */
  async benchmark(
    stickers: Sticker[],
    config: CppPackerConfig,
    jsPackFunction: (stickers: Sticker[], config: CppPackerConfig) => Promise<NestingResult>
  ): Promise<{
    cpp: { result: NestingResult; durationMs: number };
    js: { result: NestingResult; durationMs: number };
    speedup: number;
  }> {
    console.log('\n========================================');
    console.log('BENCHMARK: C++ vs JavaScript');
    console.log('========================================\n');

    // Run JS implementation
    const jsStart = Date.now();
    const jsResult = await jsPackFunction(stickers, config);
    const jsDuration = Date.now() - jsStart;

    console.log(`JS: ${jsDuration}ms - ${jsResult.placements.length} placed, ${jsResult.utilization.toFixed(1)}% util`);

    // Run C++ implementation
    const cppStart = Date.now();
    const cppResult = await this.packStickers(stickers, config);
    const cppDuration = Date.now() - cppStart;

    console.log(`C++: ${cppDuration}ms - ${cppResult.placements.length} placed, ${cppResult.utilization.toFixed(1)}% util`);

    const speedup = jsDuration / cppDuration;
    console.log(`\nSpeedup: ${speedup.toFixed(2)}× faster\n`);

    return {
      cpp: { result: cppResult, durationMs: cppDuration },
      js: { result: jsResult, durationMs: jsDuration },
      speedup,
    };
  }
}
