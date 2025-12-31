/**
 * PopulationWasm - WASM-accelerated Turing Soup with Parallel Execution
 *
 * Uses Web Workers + SharedArrayBuffer for parallel BFF execution.
 */

import * as wasm from './wasm-bridge.js';
import { WorkerPool } from './worker-pool.js';

export class PopulationWasm {
  /**
   * Create a new population
   * @param {number} width - Width of soup in bytes
   * @param {number} height - Height of soup in bytes
   * @param {number} regionSize - Size of each selected region
   */
  constructor(width = 64, height = 8192, regionSize = 64) {
    this.width = width;
    this.height = height;
    this.regionSize = regionSize;
    this.regionSide = Math.sqrt(regionSize);

    // Soup in SharedArrayBuffer for worker access
    this.soupBuffer = null;
    this.soup = null;

    // Number of pairs to execute per step
    this.pairsPerStep = 100;

    // Current selections for visualization
    this.currentPairs = [];

    // Mutation settings
    this.mutationRate = 0.00024;  // 0.024% (paper default)

    this.generation = 0;
    this.pairCount = 0;
    this.numTapes = Math.floor((width * height) / regionSize);

    // Selection mode settings
    this.alignment = 64;  // Byte alignment for selection (1, 2, 4, 8, 16, 32, 64)
    this.localityLimit = null;  // Max slot distance for second tape (null = any)
    this.head1Offset = 32;  // Starting offset for head1 in combined tape
    this.maxSteps = 8192;  // Max execution steps before halting

    // Complexity tracking (limited to prevent memory issues)
    this.complexityHistory = [];
    this.maxHistoryLength = 10000;

    // Execution metrics tracking (5 instruction categories)
    this.execHistory = [];
    this.head0EMA = 0;
    this.head1EMA = 0;
    this.mathEMA = 0;
    this.copyEMA = 0;
    this.loopEMA = 0;
    this.emaAlpha = 0.05;

    // Accumulator for consistent graph update rate regardless of speed
    this.execAccumPairs = 0;
    this.execAccumThreshold = 1000; // Push to history after this many pairs (matches max speed)

    // Worker pool
    this.workerPool = null;
    this.wasmReady = false;

    // Pending worker executions (allow queue to keep workers saturated)
    this.pendingExecutions = 0;
    this.maxPendingExecutions = 50;

    // Cached ImageData for rendering (avoid allocation per frame)
    this.cachedImageData = null;
    this.cachedImageDataHeight = 0;

  }

  /**
   * Initialize the population
   */
  async initialize() {
    const soupSize = this.width * this.height;

    // Create SharedArrayBuffer for soup
    this.soupBuffer = new SharedArrayBuffer(soupSize);
    this.soup = new Uint8Array(this.soupBuffer);

    // Initialize worker pool
    this.workerPool = new WorkerPool();
    await this.workerPool.init(this.soupBuffer, this.regionSize);
    console.log(`Parallel mode: ${this.workerPool.numWorkers} workers`);

    // Initialize WASM for main thread (compression cost, entropy)
    await wasm.initWasm();
    this.wasmReady = true;

    // Random initialization
    for (let i = 0; i < this.soup.length; i++) {
      this.soup[i] = Math.floor(Math.random() * 256);
    }

    this.generation = 0;
    this.pairCount = 0;
    this.complexityHistory = [];
    this.execHistory = [];
  }

  /**
   * Calculate Shannon entropy using WASM
   */
  calcShannonEntropy(data) {
    return wasm.shannonEntropy(data);
  }

  /**
   * Estimate Kolmogorov complexity using WASM deflate compression
   * Samples 64KB for speed
   */
  calcKolmogorovEstimate(data) {
    // Sample 64KB evenly distributed across the soup for speed
    const sampleSize = 65536;
    if (data.length <= sampleSize) {
      return wasm.kolmogorovEstimate(data);
    }
    const sample = new Uint8Array(sampleSize);
    const step = data.length / sampleSize;
    for (let i = 0; i < sampleSize; i++) {
      sample[i] = data[Math.floor(i * step)];
    }
    return wasm.kolmogorovEstimate(sample);
  }

  /**
   * Calculate all complexity metrics
   */
  calcComplexityMetrics() {
    const shannon = this.calcShannonEntropy(this.soup);
    const kolmogorov = this.calcKolmogorovEstimate(this.soup);
    const highOrder = Math.max(0, shannon - kolmogorov);
    return { shannon, kolmogorov, highOrder };
  }

  /**
   * Update complexity tracking
   */
  updateComplexity() {
    const metrics = this.calcComplexityMetrics();
    this.complexityHistory.push(metrics);
    if (this.complexityHistory.length > this.maxHistoryLength) {
      // Downsample: keep every other point
      this.complexityHistory = this.complexityHistory.filter((_, i) => i % 2 === 0);
    }
  }

  /**
   * Select a random slice start position with given alignment
   */
  selectRandomSlice() {
    const maxStart = this.soup.length - this.regionSize;
    const numPositions = Math.floor(maxStart / this.alignment) + 1;
    const pos = Math.floor(Math.random() * numPositions);
    return pos * this.alignment;
  }

  /**
   * Select two random slices (non-overlapping)
   */
  selectRandomPair() {
    const a = this.selectRandomSlice();
    let b;

    const maxStart = this.soup.length - this.regionSize;
    const numPositions = Math.floor(maxStart / this.alignment) + 1;

    if (this.localityLimit !== null && this.localityLimit > 0) {
      // Limited locality: select within range (in terms of aligned positions)
      const posA = Math.floor(a / this.alignment);
      const localityInPositions = Math.floor(this.localityLimit * this.numTapes * this.regionSize / this.alignment / 100);
      const minPos = Math.max(0, posA - localityInPositions);
      const maxPos = Math.min(numPositions - 1, posA + localityInPositions);
      let posB;
      do {
        posB = minPos + Math.floor(Math.random() * (maxPos - minPos + 1));
      } while (Math.abs(posB * this.alignment - a) < this.regionSize);
      b = posB * this.alignment;
    } else {
      // Any position, ensure non-overlapping
      do {
        const pos = Math.floor(Math.random() * numPositions);
        b = pos * this.alignment;
      } while (Math.abs(b - a) < this.regionSize);
    }

    return { a, b };
  }

  /**
   * Set mutation parameters
   */
  setMutationParams(rate, type = 'uniform', stdDev = 16) {
    this.mutationRate = rate;
    this.mutationType = type;
    this.mutationStdDev = stdDev;
  }

  /**
   * Apply mutation to selected slices
   */
  mutateSelected() {
    if (this.mutationRate <= 0) return;

    for (const pair of this.currentPairs) {
      for (let i = 0; i < this.regionSize; i++) {
        if (Math.random() < this.mutationRate) {
          const idx = (pair.a + i) % this.soup.length;
          this.soup[idx] = Math.floor(Math.random() * 256);
        }
      }
      for (let i = 0; i < this.regionSize; i++) {
        if (Math.random() < this.mutationRate) {
          const idx = (pair.b + i) % this.soup.length;
          this.soup[idx] = Math.floor(Math.random() * 256);
        }
      }
    }
  }

  /**
   * Execute one soup step with parallel workers
   */
  soupStep() {
    // Skip if too many executions pending (prevents unbounded promise accumulation)
    if (this.pendingExecutions >= this.maxPendingExecutions) {
      return [];
    }

    this.currentPairs = [];

    // Generate pairs
    for (let i = 0; i < this.pairsPerStep; i++) {
      this.currentPairs.push(this.selectRandomPair());
    }

    // Track pairs and compute epoch
    this.pairCount += this.pairsPerStep;
    const prevEpoch = Math.floor(this.generation);
    this.generation = this.pairCount / this.numTapes;
    const newEpoch = Math.floor(this.generation);

    // Dispatch to workers (workers write directly to shared soup)
    this.pendingExecutions++;
    this.workerPool.executeBatch(this.currentPairs, this.head1Offset, this.maxSteps)
      .then(aggregatedResults => {
        this.pendingExecutions--;
        // Update exec metrics with aggregated results
        this.updateExecMetricsAggregated(aggregatedResults);
      })
      .catch(() => {
        this.pendingExecutions--;
      });

    this.mutateSelected();

    return [];
  }

  /**
   * Update execution metrics from aggregated worker results
   */
  updateExecMetricsAggregated(results) {
    // Results is array of {totalHead0, totalHead1, totalMath, totalCopy, totalLoop, count} from each worker
    let totalHead0 = 0, totalHead1 = 0, totalMath = 0, totalCopy = 0, totalLoop = 0, totalCount = 0;
    for (const r of results) {
      totalHead0 += r.totalHead0 || 0;
      totalHead1 += r.totalHead1 || 0;
      totalMath += r.totalMath || 0;
      totalCopy += r.totalCopy || 0;
      totalLoop += r.totalLoop || 0;
      totalCount += r.count || 0;
    }
    const n = totalCount || 1;

    // Update EMAs
    this.head0EMA = this.emaAlpha * (totalHead0 / n) + (1 - this.emaAlpha) * this.head0EMA;
    this.head1EMA = this.emaAlpha * (totalHead1 / n) + (1 - this.emaAlpha) * this.head1EMA;
    this.mathEMA = this.emaAlpha * (totalMath / n) + (1 - this.emaAlpha) * this.mathEMA;
    this.copyEMA = this.emaAlpha * (totalCopy / n) + (1 - this.emaAlpha) * this.copyEMA;
    this.loopEMA = this.emaAlpha * (totalLoop / n) + (1 - this.emaAlpha) * this.loopEMA;

    // Accumulate pairs and only push to history at consistent intervals
    this.execAccumPairs += totalCount;
    if (this.execAccumPairs >= this.execAccumThreshold) {
      this.execHistory.push({
        head0: this.head0EMA,
        head1: this.head1EMA,
        math: this.mathEMA,
        copy: this.copyEMA,
        loop: this.loopEMA,
      });
      this.execAccumPairs = 0;

      // Update complexity at same interval as exec metrics
      this.updateComplexity();

      if (this.execHistory.length > this.maxHistoryLength) {
        // Downsample: keep every other point
        this.execHistory = this.execHistory.filter((_, i) => i % 2 === 0);
      }
    }
  }

  /**
   * Instruction colors
   */
  static INSTRUCTION_COLORS = {
    0x3C: { h: 180, s: 100, l: 70 },
    0x3E: { h: 160, s: 100, l: 75 },
    0x7B: { h: 320, s: 100, l: 75 },
    0x7D: { h: 340, s: 100, l: 80 },
    0x2B: { h: 120, s: 100, l: 70 },
    0x2D: { h: 90, s: 100, l: 75 },
    0x2E: { h: 60, s: 100, l: 70 },
    0x2C: { h: 45, s: 100, l: 75 },
    0x5B: { h: 210, s: 100, l: 75 },
    0x5D: { h: 240, s: 100, l: 80 },
  };

  /**
   * Pre-computed color lookup table (256 entries, 3 bytes each)
   * Initialized lazily on first use
   */
  static colorLUT = null;

  /**
   * Build color lookup table (called once)
   */
  static buildColorLUT() {
    if (PopulationWasm.colorLUT) return;

    // Flat array: [r0, g0, b0, r1, g1, b1, ...]
    PopulationWasm.colorLUT = new Uint8Array(256 * 3);

    const hslToRgb = (h, s, l) => {
      s /= 100;
      l /= 100;
      const k = n => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
    };

    for (let byte = 0; byte < 256; byte++) {
      let r, g, b;

      const instrColor = PopulationWasm.INSTRUCTION_COLORS[byte];
      if (instrColor) {
        [r, g, b] = hslToRgb(instrColor.h, instrColor.s, instrColor.l);
      } else if (byte === 0) {
        r = g = b = 0;
      } else {
        const t = byte / 255;
        if (t < 0.33) {
          const s = t / 0.33;
          r = Math.round(30 * s);
          g = 0;
          b = Math.round(80 * s);
        } else if (t < 0.66) {
          const s = (t - 0.33) / 0.33;
          r = Math.round(30 + 150 * s);
          g = Math.round(20 * s);
          b = Math.round(80 + 40 * s);
        } else {
          const s = (t - 0.66) / 0.34;
          r = Math.round(180 + 75 * s);
          g = Math.round(20 + 100 * s);
          b = Math.round(120 - 120 * s);
        }
      }

      const idx = byte * 3;
      PopulationWasm.colorLUT[idx] = r;
      PopulationWasm.colorLUT[idx + 1] = g;
      PopulationWasm.colorLUT[idx + 2] = b;
    }
  }

  /**
   * Render a viewport of the soup to canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} startY - Starting row in soup
   * @param {number} viewHeight - Number of rows to render
   */
  renderToCanvas(ctx, startY = 0, viewHeight = this.height) {
    const endY = Math.min(startY + viewHeight, this.height);
    const actualHeight = endY - startY;

    // Ensure color LUT is built
    if (!PopulationWasm.colorLUT) {
      PopulationWasm.buildColorLUT();
    }

    // Reuse cached ImageData if dimensions match
    if (!this.cachedImageData || this.cachedImageDataHeight !== actualHeight) {
      this.cachedImageData = ctx.createImageData(this.width, actualHeight);
      this.cachedImageDataHeight = actualHeight;
    }

    const data = this.cachedImageData.data;
    const lut = PopulationWasm.colorLUT;
    const soup = this.soup;
    const width = this.width;

    for (let y = 0; y < actualHeight; y++) {
      const soupRowOffset = (startY + y) * width;
      const dataRowOffset = y * width * 4;

      for (let x = 0; x < width; x++) {
        const byte = soup[soupRowOffset + x];
        const lutIdx = byte * 3;
        const dataIdx = dataRowOffset + x * 4;

        data[dataIdx] = lut[lutIdx];
        data[dataIdx + 1] = lut[lutIdx + 1];
        data[dataIdx + 2] = lut[lutIdx + 2];
        data[dataIdx + 3] = 255;
      }
    }

    ctx.putImageData(this.cachedImageData, 0, 0);
  }
}
