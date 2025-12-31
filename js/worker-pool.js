/**
 * Worker Pool for Turing Soup
 *
 * Manages a pool of Web Workers for parallel BFF execution.
 */

export class WorkerPool {
  /**
   * Create a worker pool
   * @param {number} numWorkers - Number of workers (default: navigator.hardwareConcurrency - 1)
   */
  constructor(numWorkers = null) {
    this.numWorkers = numWorkers || Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    this.workers = [];
    this.ready = false;
    this.pendingCallbacks = new Map();
  }

  /**
   * Initialize the worker pool
   * @param {SharedArrayBuffer} buffer - Shared buffer containing soup data
   * @param {number} regionSize - Region size
   * @returns {Promise<void>}
   */
  async init(buffer, regionSize) {
    const wasmUrl = new URL('../wasm/pkg/turing_soup_wasm.js', import.meta.url).href;

    const initPromises = [];

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

      const initPromise = new Promise((resolve, reject) => {
        const handler = (e) => {
          if (e.data.type === 'ready') {
            worker.removeEventListener('message', handler);
            resolve();
          } else if (e.data.type === 'error') {
            worker.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };
        worker.addEventListener('message', handler);
      });

      // Set up result handler
      worker.addEventListener('message', (e) => {
        if (e.data.type === 'results') {
          const callback = this.pendingCallbacks.get(worker);
          if (callback) {
            this.pendingCallbacks.delete(worker);
            callback(e.data.results);
          }
        }
      });

      worker.postMessage({
        type: 'init',
        data: {
          buffer,
          wasmUrl,
          regionSz: regionSize,
        },
      });

      this.workers.push(worker);
      initPromises.push(initPromise);
    }

    await Promise.all(initPromises);
    this.ready = true;
  }

  /**
   * Execute pairs across workers
   * @param {Array<{a: number, b: number}>} pairs - Pairs to execute
   * @param {number} head1Offset - Starting offset for head1
   * @param {number} maxSteps - Max execution steps
   * @returns {Promise<Array>} Results from all pairs
   */
  async executeBatch(pairs, head1Offset = 64, maxSteps = 8192) {
    if (!this.ready) {
      throw new Error('Worker pool not initialized');
    }

    // Split pairs among available workers
    const numWorkers = this.workers.length;
    const pairsPerWorker = Math.ceil(pairs.length / numWorkers);
    const batches = [];

    for (let i = 0; i < numWorkers; i++) {
      const start = i * pairsPerWorker;
      const end = Math.min(start + pairsPerWorker, pairs.length);
      if (start < pairs.length) {
        batches.push(pairs.slice(start, end));
      }
    }

    // Execute in parallel
    const resultPromises = batches.map((batch, i) => {
      return new Promise((resolve) => {
        const worker = this.workers[i];
        this.pendingCallbacks.set(worker, resolve);

        worker.postMessage({
          type: 'execute',
          data: { pairs: batch, head1Offset, maxSteps },
        });
      });
    });

    const allResults = await Promise.all(resultPromises);
    return allResults.flat();
  }

  /**
   * Terminate all workers
   */
  terminate() {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.ready = false;
  }
}

