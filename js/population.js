/**
 * Population - Manages the Turing Soup as a continuous 2D toroidal array
 *
 * The soup is a single 512x512 byte array where regions can be selected
 * with wrapping at edges.
 */

import { Tape } from './tape.js?v=8';
import { BFFInterpreter } from './bff.js?v=12';

export class Population {
  /**
   * Create a new population
   * @param {number} width - Width of soup in bytes
   * @param {number} height - Height of soup in bytes
   * @param {number} regionSize - Size of each selected region (must be square)
   */
  constructor(width = 512, height = 512, regionSize = 64) {
    this.width = width;
    this.height = height;
    this.regionSize = regionSize;
    this.regionSide = Math.sqrt(regionSize);  // 8 for 64-byte regions

    // Single continuous array
    this.soup = new Uint8Array(width * height);

    // Number of grid pairs to execute per step
    this.pairsPerStep = 10;

    // Current selections for visualization
    this.currentPairs = [];

    // Mutation settings
    this.mutationRate = 0.00024;  // 0.024% (paper default)
    this.mutationType = 'uniform';
    this.mutationStdDev = 16;

    this.generation = 0;
    this.pairCount = 0;  // Total pairs executed
    this.numTapes = Math.floor((width * height) / regionSize);  // For epoch calculation

    // Complexity tracking - stores {shannon, kolmogorov, highOrder} objects
    this.complexityHistory = [];
    this.maxHistoryLength = 100000;

    // Execution metrics tracking
    this.execHistory = [];  // stores {avgLoopJumps, avgSteps}
    this.loopJumpsEMA = 0;  // Smoothed loop jumps
    this.stepsEMA = 0;      // Smoothed steps
    this.emaAlpha = 0.05;   // Smoothing factor (lower = smoother)

    // Writeback neighbor comparison
    this.neighborsPerSide = 2;  // Number of neighbor rows on each side for swap decision

    // Initialize with random data
    this.initialize();
  }

  /**
   * Initialize soup with random data
   */
  initialize() {
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
   * Calculate Shannon entropy of a byte array (bits per byte)
   */
  calcShannonEntropy(data) {
    const counts = new Uint32Array(256);
    for (let i = 0; i < data.length; i++) {
      counts[data[i]]++;
    }
    let entropy = 0;
    const n = data.length;
    for (let i = 0; i < 256; i++) {
      if (counts[i] > 0) {
        const p = counts[i] / n;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  /**
   * Estimate Kolmogorov complexity using deflate compression
   * Returns estimated bits per byte after compression
   */
  async calcCompressionEstimate(data) {
    if (data.length < 2) return 8;

    try {
      const stream = new Blob([data]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('deflate'));
      const compressedBlob = await new Response(compressedStream).blob();
      const compressedSize = compressedBlob.size;

      // Convert to bits per byte
      return (compressedSize * 8) / data.length;
    } catch (e) {
      // Fallback to simple estimate if compression fails
      return 8;
    }
  }

  /**
   * Calculate all complexity metrics for entire soup
   * Returns {shannon, kolmogorov, highOrder}
   */
  async calcComplexityMetrics() {
    const shannon = this.calcShannonEntropy(this.soup);
    const kolmogorov = await this.calcCompressionEstimate(this.soup);
    const highOrder = Math.max(0, shannon - kolmogorov);

    return { shannon, kolmogorov, highOrder };
  }

  /**
   * Update complexity tracking
   */
  async updateComplexity() {
    const metrics = await this.calcComplexityMetrics();

    // Add to history
    this.complexityHistory.push(metrics);
    if (this.complexityHistory.length > this.maxHistoryLength) {
      this.complexityHistory.shift();
    }
  }

  /**
   * Get byte at (x, y) with toroidal wrapping
   */
  get(x, y) {
    const wx = ((x % this.width) + this.width) % this.width;
    const wy = ((y % this.height) + this.height) % this.height;
    return this.soup[wy * this.width + wx];
  }

  /**
   * Set byte at (x, y) with toroidal wrapping
   */
  set(x, y, value) {
    const wx = ((x % this.width) + this.width) % this.width;
    const wy = ((y % this.height) + this.height) % this.height;
    this.soup[wy * this.width + wx] = value & 0xFF;
  }

  /**
   * Get neighbor rows for a slot (rows above and below with toroidal wrapping)
   * @param {number} slot - Start index of the slot (aligned to regionSize = one row)
   * @returns {{above: Uint8Array[], below: Uint8Array[]}} Arrays of neighbor rows
   */
  getNeighborRows(slot) {
    const row = Math.floor(slot / this.width);
    const above = [];
    const below = [];

    for (let i = 1; i <= this.neighborsPerSide; i++) {
      const rowAbove = ((row - i) + this.height) % this.height;
      const rowBelow = (row + i) % this.height;
      above.push(this.soup.slice(rowAbove * this.width, (rowAbove + 1) * this.width));
      below.push(this.soup.slice(rowBelow * this.width, (rowBelow + 1) * this.width));
    }

    return { above, below };
  }

  /**
   * Compute compression cost (bigram uniqueness) for concatenated arrays
   * Lower = more compressible = more similar to neighbors
   * @param {Array<Uint8Array>} arrays - Arrays to concatenate and measure
   * @returns {number} Number of unique bigrams (lower = better)
   */
  compressionCost(arrays) {
    const bigrams = new Set();

    for (let a = 0; a < arrays.length; a++) {
      const data = arrays[a];
      for (let i = 0; i < data.length - 1; i++) {
        bigrams.add((data[i] << 8) | data[i + 1]);
      }
      // Add bigram spanning to next array
      if (a < arrays.length - 1) {
        const nextData = arrays[a + 1];
        bigrams.add((data[data.length - 1] << 8) | nextData[0]);
      }
    }

    return bigrams.size;
  }

  /**
   * Extract linear slice as Tape starting at index with wrapping
   * @param {number} start - Starting index in soup array
   * @returns {Tape} Tape containing the slice data
   */
  getSlice(start) {
    const tape = new Tape(this.regionSize);
    for (let i = 0; i < this.regionSize; i++) {
      const idx = (start + i) % this.soup.length;
      tape.set(i, this.soup[idx]);
    }
    return tape;
  }

  /**
   * Write linear slice back to soup
   * @param {number} start - Starting index in soup array
   * @param {Tape} tape - Tape containing the new data
   */
  setSlice(start, tape) {
    const data = tape.toArray();
    for (let i = 0; i < this.regionSize; i++) {
      const idx = (start + i) % this.soup.length;
      this.soup[idx] = data[i];
    }
  }


  /**
   * Select a uniform random linear slice start position (aligned to regionSize)
   */
  selectRandomSlice() {
    const numSlots = Math.floor(this.soup.length / this.regionSize);
    const slot = Math.floor(Math.random() * numSlots);
    return slot * this.regionSize;
  }

  /**
   * Select two random linear slices
   * @returns {{a: number, b: number}}
   */
  selectRandomPair() {
    const a = this.selectRandomSlice();
    let b;
    do {
      b = this.selectRandomSlice();
    } while (a === b);
    return { a, b };
  }

  /**
   * Check if tape contains any BFF instructions
   */
  hasInstructions(tape) {
    const instructions = new Set([0x3C, 0x3E, 0x7B, 0x7D, 0x2B, 0x2D, 0x2E, 0x2C, 0x5B, 0x5D]);
    const data = tape.toArray();
    for (let i = 0; i < data.length; i++) {
      if (instructions.has(data[i])) return true;
    }
    return false;
  }

  /**
   * Set mutation parameters
   * @param {number} rate - Mutation rate (0-1)
   * @param {string} type - 'uniform' or 'normal'
   * @param {number} stdDev - Standard deviation for normal distribution
   */
  setMutationParams(rate, type = 'uniform', stdDev = 16) {
    this.mutationRate = rate;
    this.mutationType = type;
    this.mutationStdDev = stdDev;
  }

  /**
   * Apply uniform random mutation to selected slices only
   */
  mutateSelected() {
    if (this.mutationRate <= 0) return;

    for (const pair of this.currentPairs) {
      // Mutate slice A
      for (let i = 0; i < this.regionSize; i++) {
        if (Math.random() < this.mutationRate) {
          const idx = (pair.a + i) % this.soup.length;
          // Uniform random across full byte range
          this.soup[idx] = Math.floor(Math.random() * 256);
        }
      }
      // Mutate slice B
      for (let i = 0; i < this.regionSize; i++) {
        if (Math.random() < this.mutationRate) {
          const idx = (pair.b + i) % this.soup.length;
          this.soup[idx] = Math.floor(Math.random() * 256);
        }
      }
    }
  }

  /**
   * Combine two tapes based on mode
   * @param {Tape} tapeA - First tape
   * @param {Tape} tapeB - Second tape
   * @param {string} mode - 'concat' or 'interleaved'
   * @returns {Tape} Combined tape
   */
  combineTapes(tapeA, tapeB, mode) {
    const combined = new Tape(this.regionSize * 2);
    const dataA = tapeA.toArray();
    const dataB = tapeB.toArray();

    if (mode === 'concat') {
      for (let i = 0; i < this.regionSize; i++) {
        combined.set(i, dataA[i]);
        combined.set(i + this.regionSize, dataB[i]);
      }
    } else {
      // Row-interleaved
      const ROW_SIZE = this.regionSide;
      let idx = 0;
      for (let row = 0; row < this.regionSide; row++) {
        for (let col = 0; col < ROW_SIZE; col++) {
          combined.set(idx++, dataA[row * ROW_SIZE + col]);
        }
        for (let col = 0; col < ROW_SIZE; col++) {
          combined.set(idx++, dataB[row * ROW_SIZE + col]);
        }
      }
    }

    return combined;
  }

  /**
   * Split combined tape back into two
   * @param {Tape} combined - Combined tape
   * @param {string} mode - 'concat' or 'interleaved'
   * @returns {{left: Tape, right: Tape}} Split tapes
   */
  splitTape(combined, mode) {
    const left = new Tape(this.regionSize);
    const right = new Tape(this.regionSize);
    const data = combined.toArray();

    if (mode === 'concat') {
      for (let i = 0; i < this.regionSize; i++) {
        left.set(i, data[i]);
        right.set(i, data[i + this.regionSize]);
      }
    } else {
      // Row-interleaved
      const ROW_SIZE = this.regionSide;
      let idx = 0;
      for (let row = 0; row < this.regionSide; row++) {
        for (let col = 0; col < ROW_SIZE; col++) {
          left.set(row * ROW_SIZE + col, data[idx++]);
        }
        for (let col = 0; col < ROW_SIZE; col++) {
          right.set(row * ROW_SIZE + col, data[idx++]);
        }
      }
    }

    return { left, right };
  }

  /**
   * Execute one pair of slices
   * @param {{a: number, b: number}} pair
   */
  runPair(pair) {
    const { a, b } = pair;

    // Extract slices as tapes
    const tapeA = this.getSlice(a);
    const tapeB = this.getSlice(b);

    // Combine tapes (concat mode)
    const combined = this.combineTapes(tapeA, tapeB, 'concat');

    // Early abort if no BFF instructions in combined tape
    if (!this.hasInstructions(combined)) {
      return { steps: 0, haltReason: 'no_instructions' };
    }

    // Execute from start of combined tape
    const interpreter = new BFFInterpreter(combined);
    while (!interpreter.halted) {
      interpreter.step();
    }

    // Only write back if any modifications were made to the tape
    if (interpreter.writeCount > 0) {
      // Split back
      const { left, right } = this.splitTape(combined, 'concat');

      // Get neighbor rows for each slot
      const neighborsA = this.getNeighborRows(a);
      const neighborsB = this.getNeighborRows(b);

      const leftData = left.toArray();
      const rightData = right.toArray();

      // Cost of no swap: left→A, right→B
      // Concatenate: [...above, target, ...below]
      const costNoSwap =
        this.compressionCost([...neighborsA.above, leftData, ...neighborsA.below]) +
        this.compressionCost([...neighborsB.above, rightData, ...neighborsB.below]);

      // Cost of swap: right→A, left→B
      const costSwap =
        this.compressionCost([...neighborsA.above, rightData, ...neighborsA.below]) +
        this.compressionCost([...neighborsB.above, leftData, ...neighborsB.below]);

      // Choose option with lower cost (minimizes bits = maximizes similarity)
      if (costSwap < costNoSwap) {
        this.setSlice(a, right);
        this.setSlice(b, left);
      } else {
        this.setSlice(a, left);
        this.setSlice(b, right);
      }
    }

    return {
      steps: interpreter.stepCount,
      haltReason: interpreter.haltReason,
      writes: interpreter.writeCount,
      loopJumps: interpreter.loopJumps,
    };
  }

  /**
   * Execute one soup step: pick random pairs, execute them, then mutate
   * @returns {Array} Results from all pairs
   */
  soupStep() {
    // Pick and execute random pairs
    this.currentPairs = [];
    const results = [];
    for (let i = 0; i < this.pairsPerStep; i++) {
      const pair = this.selectRandomPair();
      this.currentPairs.push(pair);
      results.push(this.runPair(pair));
    }

    // Apply mutation to selected regions
    this.mutateSelected();

    // Track pairs and compute epoch (generation)
    this.pairCount += this.pairsPerStep;
    const prevEpoch = Math.floor(this.generation);
    this.generation = this.pairCount / this.numTapes;
    const newEpoch = Math.floor(this.generation);

    // Update tracking when we cross an epoch boundary
    if (newEpoch !== prevEpoch) {
      this.updateComplexity();
      this.updateExecMetrics(results);
    }

    return results;
  }

  /**
   * Update execution metrics from results
   */
  updateExecMetrics(results) {
    let totalLoops = 0, totalSteps = 0;
    for (const r of results) {
      totalLoops += r.loopJumps || 0;
      totalSteps += r.steps || 0;
    }
    const n = results.length || 1;

    // Apply EMA smoothing
    this.loopJumpsEMA = this.emaAlpha * (totalLoops / n) + (1 - this.emaAlpha) * this.loopJumpsEMA;
    this.stepsEMA = this.emaAlpha * (totalSteps / n) + (1 - this.emaAlpha) * this.stepsEMA;

    this.execHistory.push({
      avgLoopJumps: this.loopJumpsEMA,
      avgSteps: this.stepsEMA,
    });

    if (this.execHistory.length > this.maxHistoryLength) {
      this.execHistory.shift();
    }
  }

  /**
   * Instruction byte values - bright, saturated colors to stand out
   */
  static INSTRUCTION_COLORS = {
    0x3C: { h: 180, s: 100, l: 70 },  // < (head0--)  bright cyan
    0x3E: { h: 160, s: 100, l: 75 },  // > (head0++)  bright teal
    0x7B: { h: 320, s: 100, l: 75 },  // { (head1--)  bright pink
    0x7D: { h: 340, s: 100, l: 80 },  // } (head1++)  bright rose
    0x2B: { h: 120, s: 100, l: 70 },  // + bright green
    0x2D: { h: 90, s: 100, l: 75 },   // - bright lime
    0x2E: { h: 60, s: 100, l: 70 },   // . bright yellow
    0x2C: { h: 45, s: 100, l: 75 },   // , bright gold
    0x5B: { h: 210, s: 100, l: 75 },  // [ bright blue
    0x5D: { h: 240, s: 100, l: 80 },  // ] bright indigo
  };

  /**
   * Get color for a single byte value
   * @param {number} byte - Byte value 0-255
   * @returns {{r, g, b}} RGB color
   */
  getByteColor(byte) {
    // Check if it's an instruction - bright colors
    const instrColor = Population.INSTRUCTION_COLORS[byte];
    if (instrColor) {
      return this.hslToRgb(instrColor.h, instrColor.s, instrColor.l);
    }

    // Data byte - plasma colormap (black -> purple -> orange)
    if (byte === 0) {
      return { r: 0, g: 0, b: 0 };
    }

    const t = byte / 255;
    // Plasma-like gradient: black -> deep purple -> magenta -> orange
    let r, g, b;
    if (t < 0.33) {
      // Black to deep purple
      const s = t / 0.33;
      r = Math.round(30 * s);
      g = 0;
      b = Math.round(80 * s);
    } else if (t < 0.66) {
      // Deep purple to magenta/pink
      const s = (t - 0.33) / 0.33;
      r = Math.round(30 + 150 * s);
      g = Math.round(20 * s);
      b = Math.round(80 + 40 * s);
    } else {
      // Magenta to orange
      const s = (t - 0.66) / 0.34;
      r = Math.round(180 + 75 * s);
      g = Math.round(20 + 100 * s);
      b = Math.round(120 - 120 * s);
    }
    return { r, g, b };
  }

  /**
   * Convert HSL to RGB
   */
  hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return {
      r: Math.round(255 * f(0)),
      g: Math.round(255 * f(8)),
      b: Math.round(255 * f(4)),
    };
  }

  /**
   * Check if (x, y) is within a scaled region starting at sel
   * @param {number} px - X coordinate to check
   * @param {number} py - Y coordinate to check
   * @param {{x, y}} sel - Selection start position
   * @param {number} scale - Scale factor
   * @returns {boolean} True if in region
   */
  isInRegion(px, py, sel, scale = 1) {
    if (!sel) return false;
    const scaledSide = this.regionSide * scale;

    // Calculate wrapped distance from selection start
    const dx = ((px - sel.x) % this.width + this.width) % this.width;
    const dy = ((py - sel.y) % this.height + this.height) % this.height;

    return dx < scaledSide && dy < scaledSide;
  }

  /**
   * Render soup to canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  renderToCanvas(ctx) {
    const imageData = ctx.createImageData(this.width, this.height);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const byte = this.soup[y * this.width + x];
        const color = this.getByteColor(byte);
        const idx = (y * this.width + x) * 4;

        imageData.data[idx] = color.r;
        imageData.data[idx + 1] = color.g;
        imageData.data[idx + 2] = color.b;
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }
}
