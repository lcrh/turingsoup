/**
 * Turing Soup Worker
 *
 * Executes BFF pairs in parallel using WASM.
 * Communicates with main thread via postMessage.
 */

let wasmModule = null;
let soup = null;  // Uint8Array view into SharedArrayBuffer
let regionSize = 64;

/**
 * Initialize WASM module
 */
async function initWasm(wasmUrl) {
  const wasm = await import(wasmUrl);
  await wasm.default();
  wasmModule = wasm;
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'init': {
      // Initialize with SharedArrayBuffer and WASM URL
      const { buffer, wasmUrl, regionSz } = data;
      soup = new Uint8Array(buffer);
      regionSize = regionSz;

      try {
        await initWasm(wasmUrl);
        self.postMessage({ type: 'ready' });
      } catch (err) {
        self.postMessage({ type: 'error', error: err.message });
      }
      break;
    }

    case 'execute': {
      // Execute a batch of pairs using WASM batch function (fewer boundary crossings)
      const { pairs, head1Offset, maxSteps } = data;

      // Pack pairs into byte array (8 bytes per pair: 2 x u32 little-endian)
      const pairsData = new Uint8Array(pairs.length * 8);
      const pairsView = new DataView(pairsData.buffer);
      for (let i = 0; i < pairs.length; i++) {
        pairsView.setUint32(i * 8, pairs[i].a, true);
        pairsView.setUint32(i * 8 + 4, pairs[i].b, true);
      }

      // Single WASM call for all pairs
      const result = wasmModule.execute_batch(soup, pairsData, regionSize, head1Offset, maxSteps);

      // Parse results: each result is 28 bytes stats + regionSize*2 bytes tape
      const resultSize = 28 + regionSize * 2;
      let totalHead0 = 0;
      let totalHead1 = 0;
      let totalMath = 0;
      let totalCopy = 0;
      let totalLoop = 0;

      for (let i = 0; i < pairs.length; i++) {
        const offset = i * resultSize;
        const view = new DataView(result.buffer, result.byteOffset + offset, 28);

        const head0Count = view.getUint32(4, true);
        const head1Count = view.getUint32(8, true);
        const mathCount = view.getUint32(12, true);
        const copyCount = view.getUint32(16, true);
        const loopCount = view.getUint32(20, true);

        // Write results back to shared soup if any modifications occurred
        if (mathCount > 0 || copyCount > 0) {
          const tapeOffset = offset + 28;
          const { a, b } = pairs[i];
          for (let j = 0; j < regionSize; j++) {
            soup[a + j] = result[tapeOffset + j];
            soup[b + j] = result[tapeOffset + regionSize + j];
          }
        }

        totalHead0 += head0Count;
        totalHead1 += head1Count;
        totalMath += mathCount;
        totalCopy += copyCount;
        totalLoop += loopCount;
      }

      // Only send back aggregated metrics, not the data
      self.postMessage({
        type: 'results',
        results: { totalHead0, totalHead1, totalMath, totalCopy, totalLoop, count: pairs.length }
      });
      break;
    }
  }
};
