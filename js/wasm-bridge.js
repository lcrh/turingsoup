/**
 * WASM Bridge for Turing Soup
 *
 * Loads and initializes the WASM module, providing a clean interface
 * for the Population class to use.
 */

let wasmModule = null;
let wasmReady = false;

/**
 * Initialize the WASM module
 * @returns {Promise<void>}
 */
export async function initWasm() {
  if (wasmReady) return;

  // Dynamic import of the WASM module
  const wasm = await import('../wasm/pkg/turing_soup_wasm.js');
  await wasm.default();

  wasmModule = wasm;
  wasmReady = true;
}

/**
 * Check if WASM is initialized
 * @returns {boolean}
 */
export function isWasmReady() {
  return wasmReady;
}

/**
 * Execute a pair of regions from the soup
 * @param {Uint8Array} soup - The soup data
 * @param {number} slotA - Start index of first region
 * @param {number} slotB - Start index of second region
 * @param {number} regionSize - Size of each region (default 64)
 * @returns {{steps: number, head0Count: number, head1Count: number, mathCount: number, copyCount: number, loopCount: number, haltReason: number, tape: Uint8Array}}
 */
export function executePair(soup, slotA, slotB, regionSize = 64) {
  if (!wasmReady) throw new Error('WASM not initialized');

  const result = wasmModule.execute_pair(soup, slotA, slotB, regionSize);

  // Parse result: first 28 bytes are stats (7 x u32), rest is tape
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);

  return {
    steps: view.getUint32(0, true),
    head0Count: view.getUint32(4, true),
    head1Count: view.getUint32(8, true),
    mathCount: view.getUint32(12, true),
    copyCount: view.getUint32(16, true),
    loopCount: view.getUint32(20, true),
    haltReason: view.getUint32(24, true),
    tape: result.slice(28),
  };
}

/**
 * Execute a batch of pairs
 * @param {Uint8Array} soup - The soup data
 * @param {Array<{a: number, b: number}>} pairs - Array of pair objects
 * @param {number} regionSize - Size of each region
 * @returns {Array<{steps: number, head0Count: number, head1Count: number, mathCount: number, copyCount: number, loopCount: number, haltReason: number, tape: Uint8Array}>}
 */
export function executeBatch(soup, pairs, regionSize = 64) {
  if (!wasmReady) throw new Error('WASM not initialized');

  // Pack pairs into byte array (8 bytes per pair: 2 x u32 little-endian)
  const pairsData = new Uint8Array(pairs.length * 8);
  const pairsView = new DataView(pairsData.buffer);

  for (let i = 0; i < pairs.length; i++) {
    pairsView.setUint32(i * 8, pairs[i].a, true);
    pairsView.setUint32(i * 8 + 4, pairs[i].b, true);
  }

  const result = wasmModule.execute_batch(soup, pairsData, regionSize);

  // Parse results: each result is 28 bytes stats + regionSize*2 bytes tape
  const resultSize = 28 + regionSize * 2;
  const results = [];

  for (let i = 0; i < pairs.length; i++) {
    const offset = i * resultSize;
    const view = new DataView(result.buffer, result.byteOffset + offset, resultSize);

    results.push({
      steps: view.getUint32(0, true),
      head0Count: view.getUint32(4, true),
      head1Count: view.getUint32(8, true),
      mathCount: view.getUint32(12, true),
      copyCount: view.getUint32(16, true),
      loopCount: view.getUint32(20, true),
      haltReason: view.getUint32(24, true),
      tape: result.slice(offset + 28, offset + resultSize),
    });
  }

  return results;
}

/**
 * Check if data contains BFF instructions
 * @param {Uint8Array} data
 * @returns {boolean}
 */
export function hasInstructions(data) {
  if (!wasmReady) throw new Error('WASM not initialized');
  return wasmModule.has_instructions(data);
}

/**
 * Calculate Shannon entropy (bits per byte)
 * @param {Uint8Array} data
 * @returns {number}
 */
export function shannonEntropy(data) {
  if (!wasmReady) throw new Error('WASM not initialized');
  return wasmModule.shannon_entropy(data);
}

/**
 * Estimate Kolmogorov complexity using deflate compression (bits per byte)
 * @param {Uint8Array} data
 * @returns {number}
 */
export function kolmogorovEstimate(data) {
  if (!wasmReady) throw new Error('WASM not initialized');
  return wasmModule.kolmogorov_estimate(data);
}
