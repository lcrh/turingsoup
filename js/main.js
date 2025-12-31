/**
 * Turing Soup - Minimal Interface (WASM Accelerated)
 */

import { PopulationWasm as Population } from './population-wasm.js';
import { initTooltips, registerTooltip } from './tooltip.js';

const SOUP_WIDTH = 64;
const SOUP_HEIGHT = 32768;   // 2^15 tapes (2MB soup)
let regionSize = 64;         // 64 bytes per tape (paper default), configurable
const DISPLAY_HEIGHT = 4096; // Viewport height for rendering

// DOM Elements
const soupCanvas = document.getElementById('soup-canvas');
const soupCtx = soupCanvas.getContext('2d');
const soupGenerationSpan = document.getElementById('soup-generation');
const mutationRateSlider = document.getElementById('mutation-rate');
const complexityGraph = document.getElementById('complexity-graph');
const complexityCtx = complexityGraph.getContext('2d');
const shannonValueSpan = document.getElementById('shannon-value');
const kolmogorovValueSpan = document.getElementById('kolmogorov-value');
const complexityValueSpan = document.getElementById('complexity-value');
const execGraph = document.getElementById('exec-graph');
const execCtx = execGraph.getContext('2d');
const head0ValueSpan = document.getElementById('head0-value');
const head1ValueSpan = document.getElementById('head1-value');
const mathValueSpan = document.getElementById('math-value');
const copyValueSpan = document.getElementById('copy-value');
const loopValueSpan = document.getElementById('loop-value');
const epochsPerSecSpan = document.getElementById('epochs-per-sec');
const runStateSpan = document.getElementById('run-state');
const speedDisplaySpan = document.getElementById('speed-display');
const localitySlider = document.getElementById('locality-range');
const localityDisplay = document.getElementById('locality-display');
const alignmentSlider = document.getElementById('alignment-range');
const alignmentDisplay = document.getElementById('alignment-display');
const tapeLengthSlider = document.getElementById('tape-length-range');
const tapeLengthDisplay = document.getElementById('tape-length-display');
const head1OffsetSlider = document.getElementById('head1-offset-range');
const head1OffsetDisplay = document.getElementById('head1-offset-display');
const maxStepsSlider = document.getElementById('max-steps-range');
const maxStepsDisplay = document.getElementById('max-steps-display');

// Speed levels: 1x, 10x, 100x, 1000x
const SPEED_LEVELS = [1, 10, 100, 1000];
let speedIndex = 3;  // Default to 1000x

// State
let population = null;
let lastEpoch = 0;
let lastEpochTime = performance.now();
let running = false;
let animationId = null;

async function initializePopulation() {
  population = new Population(SOUP_WIDTH, SOUP_HEIGHT, regionSize);
  await population.initialize();  // Initialize WASM and random data
  updateMutationRate();
  updateLocality();
  updateAlignment();
  updateHead1Offset();
  updateMaxSteps();
  viewOffset = 0;
  updatePageIndicator();
  renderSoup();
  soupGenerationSpan.textContent = '0.00';
  // Compute and display initial complexity
  population.updateComplexity();
  renderComplexityGraph();
  renderExecGraph();
}

// View offset for scrolling through soup
let viewOffset = 0;
const pageIndicator = document.getElementById('page-indicator');
const totalPages = Math.ceil(SOUP_HEIGHT / DISPLAY_HEIGHT);

function updatePageIndicator() {
  const currentPage = Math.floor(viewOffset / DISPLAY_HEIGHT) + 1;
  pageIndicator.textContent = `${currentPage}/${totalPages}`;
}

function renderSoup() {
  if (population) {
    population.renderToCanvas(soupCtx, viewOffset, DISPLAY_HEIGHT);
  }
}

function renderComplexityGraph() {
  if (!population) return;

  const history = population.complexityHistory;
  const w = complexityGraph.width;
  const h = complexityGraph.height;

  // Clear
  complexityCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  complexityCtx.fillRect(0, 0, w, h);

  // Update value display even with just 1 point
  if (history.length > 0) {
    const current = history[history.length - 1];
    shannonValueSpan.textContent = current.shannon.toFixed(2);
    kolmogorovValueSpan.textContent = current.kolmogorov.toFixed(2);
    complexityValueSpan.textContent = current.highOrder.toFixed(2);
  }

  if (history.length < 2) return;

  // Find max for scaling - max of 8 bits (theoretical max for entropy)
  const maxVal = 8;

  // Draw grid lines
  complexityCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  complexityCtx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = h * i / 4;
    complexityCtx.beginPath();
    complexityCtx.moveTo(0, y);
    complexityCtx.lineTo(w, y);
    complexityCtx.stroke();
  }

  // Downsample if needed
  const numPoints = Math.min(history.length, w);
  const step = history.length / numPoints;

  // Helper to draw a line for a specific metric
  function drawLine(metric, color, lineWidth = 1.5) {
    complexityCtx.strokeStyle = color;
    complexityCtx.lineWidth = lineWidth;
    complexityCtx.beginPath();

    for (let i = 0; i < numPoints; i++) {
      const startIdx = Math.floor(i * step);
      const endIdx = Math.floor((i + 1) * step);

      // Average in bucket for smoother lines
      let sum = 0, count = 0;
      for (let j = startIdx; j < endIdx && j < history.length; j++) {
        sum += history[j][metric];
        count++;
      }
      const val = count > 0 ? sum / count : 0;

      const x = (i / Math.max(1, numPoints - 1)) * w;
      const y = h - (val / maxVal) * (h - 4) - 2;

      if (i === 0) {
        complexityCtx.moveTo(x, y);
      } else {
        complexityCtx.lineTo(x, y);
      }
    }
    complexityCtx.stroke();
  }

  // Draw all three metrics
  drawLine('shannon', 'rgba(255, 255, 255, 0.6)', 1);    // White - Shannon entropy
  drawLine('kolmogorov', 'rgba(255, 160, 0, 0.6)', 1);   // Orange - Kolmogorov estimate
  drawLine('highOrder', '#0ff', 1.5);                     // Cyan - High-order entropy
}

// Execution graph colors (non-pastel, matching legend)
const EXEC_COLORS = {
  head0: 'hsl(180, 100%, 50%)',  // cyan - <>
  head1: 'hsl(320, 100%, 50%)',  // magenta - {}
  math: 'hsl(120, 100%, 50%)',   // green - +-
  copy: 'hsl(60, 100%, 50%)',    // yellow - .,
  loop: 'hsl(210, 100%, 50%)',   // blue - []
};

// Stable max for exec graph scaling (grows instantly, decays slowly)
let execGraphMax = 1;

function renderExecGraph() {
  if (!population) return;

  const history = population.execHistory;
  const w = execGraph.width;
  const h = execGraph.height;

  // Clear
  execCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  execCtx.fillRect(0, 0, w, h);

  // Update value display from live EMA values (not just history)
  head0ValueSpan.textContent = population.head0EMA.toFixed(0);
  head1ValueSpan.textContent = population.head1EMA.toFixed(0);
  mathValueSpan.textContent = population.mathEMA.toFixed(0);
  copyValueSpan.textContent = population.copyEMA.toFixed(0);
  loopValueSpan.textContent = population.loopEMA.toFixed(0);

  if (history.length < 2) return;

  // Find current max across all metrics
  let currentMax = 1;
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    currentMax = Math.max(currentMax, entry.head0, entry.head1, entry.math, entry.copy, entry.loop);
  }

  // Stable scaling: grow instantly, decay slowly (0.5% per frame)
  if (currentMax > execGraphMax) {
    execGraphMax = currentMax;
  } else {
    execGraphMax = Math.max(currentMax, execGraphMax * 0.995);
  }
  const maxVal = execGraphMax;

  // Draw grid lines
  execCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  execCtx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = h * i / 4;
    execCtx.beginPath();
    execCtx.moveTo(0, y);
    execCtx.lineTo(w, y);
    execCtx.stroke();
  }

  // Downsample if needed
  const numPoints = Math.min(history.length, w);
  const step = history.length / numPoints;

  // Helper to draw a line for a specific metric
  function drawLine(metric, color, lineWidth = 1.5) {
    execCtx.strokeStyle = color;
    execCtx.lineWidth = lineWidth;
    execCtx.beginPath();

    for (let i = 0; i < numPoints; i++) {
      const startIdx = Math.floor(i * step);
      const endIdx = Math.floor((i + 1) * step);

      let sum = 0, count = 0;
      for (let j = startIdx; j < endIdx && j < history.length; j++) {
        sum += history[j][metric];
        count++;
      }
      const val = count > 0 ? sum / count : 0;

      const x = (i / Math.max(1, numPoints - 1)) * w;
      const yPos = h - (val / maxVal) * (h - 4) - 2;

      if (i === 0) {
        execCtx.moveTo(x, yPos);
      } else {
        execCtx.lineTo(x, yPos);
      }
    }
    execCtx.stroke();
  }

  // Draw all 5 instruction category metrics
  drawLine('head0', EXEC_COLORS.head0, 1.5);
  drawLine('head1', EXEC_COLORS.head1, 1.5);
  drawLine('math', EXEC_COLORS.math, 1.5);
  drawLine('copy', EXEC_COLORS.copy, 1.5);
  drawLine('loop', EXEC_COLORS.loop, 1.5);
}

function updatePairsPerStep() {
  if (!population) return;
  // Speed level maps to pairs per step (1x = 10 pairs, 100x = 1000 pairs)
  population.pairsPerStep = SPEED_LEVELS[speedIndex] * 10;
}

function updateSpeedDisplay() {
  speedDisplaySpan.textContent = `${SPEED_LEVELS[speedIndex]}x`;
}

function speedUp() {
  if (speedIndex < SPEED_LEVELS.length - 1) {
    speedIndex++;
    updateSpeedDisplay();
  }
}

function speedDown() {
  if (speedIndex > 0) {
    speedIndex--;
    updateSpeedDisplay();
  }
}

function startRunning() {
  if (running) return;
  running = true;
  runStateSpan.textContent = 'running';

  const runLoop = (timestamp) => {
    if (!running) return;

    // Update pairs per step from slider
    updatePairsPerStep();

    // Queue up work until we hit the pending limit
    for (let i = 0; i < population.maxPendingExecutions; i++) {
      population.soupStep();
    }

    renderSoup();
    renderComplexityGraph();
    renderExecGraph();
    soupGenerationSpan.textContent = population.generation.toFixed(2);

    // Calculate epochs per second
    const now = performance.now();
    const elapsed = (now - lastEpochTime) / 1000;
    if (elapsed >= 0.5) {
      const epochsDelta = population.generation - lastEpoch;
      const eps = epochsDelta / elapsed;
      epochsPerSecSpan.textContent = `(${eps.toFixed(1)} e/s)`;
      lastEpoch = population.generation;
      lastEpochTime = now;
    }

    animationId = requestAnimationFrame(runLoop);
  };

  animationId = requestAnimationFrame(runLoop);
}

function stopRunning() {
  running = false;
  runStateSpan.textContent = 'paused';
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function toggle() {
  if (running) {
    stopRunning();
  } else {
    startRunning();
  }
}

const mutationDisplay = document.getElementById('mutation-display');

function updateMutationRate() {
  const sliderValue = parseInt(mutationRateSlider.value, 10);
  let rate = 0;
  if (sliderValue > 0) {
    rate = Math.pow(10, (sliderValue - 100) / 20);
  }
  if (population) {
    population.setMutationParams(rate, 'uniform', 16);
  }
  // Update display
  const pct = rate * 100;
  if (pct === 0) {
    mutationDisplay.textContent = '0%';
  } else if (pct >= 1) {
    mutationDisplay.textContent = `${pct.toFixed(1)}%`;
  } else if (pct >= 0.01) {
    mutationDisplay.textContent = `${pct.toFixed(3)}%`;
  } else {
    mutationDisplay.textContent = `${pct.toFixed(4)}%`;
  }
}

function updateLocality() {
  const sliderValue = parseInt(localitySlider.value, 10);
  // 0 = any, 1-5 = powers of 2: 1, 2, 4, 8, 16
  const locality = sliderValue === 0 ? null : Math.pow(2, sliderValue - 1);
  if (population) {
    population.localityLimit = locality;
  }
  // Update display
  if (sliderValue === 0) {
    localityDisplay.textContent = 'any';
  } else {
    localityDisplay.textContent = locality.toString();
  }
}

function updateAlignment() {
  const sliderValue = parseInt(alignmentSlider.value, 10);
  // Powers of 2: 0=1, 1=2, 2=4, 3=8, 4=16, 5=32, 6=64
  const alignment = Math.pow(2, sliderValue);
  if (population) {
    population.alignment = alignment;
  }
  alignmentDisplay.textContent = alignment;
}

async function updateTapeLength() {
  const sliderValue = parseInt(tapeLengthSlider.value, 10);
  // Powers of 2: 4=16, 5=32, 6=64, 7=128, 8=256
  const newLength = Math.pow(2, sliderValue);
  tapeLengthDisplay.textContent = newLength;

  // Update alignment slider max to match tape length
  alignmentSlider.max = sliderValue;
  if (parseInt(alignmentSlider.value, 10) > sliderValue) {
    alignmentSlider.value = sliderValue;
    updateAlignment();
  }

  // Update head1 offset slider max to match combined tape length (2x)
  const combinedLength = newLength * 2;
  head1OffsetSlider.max = combinedLength;
  if (parseInt(head1OffsetSlider.value, 10) > combinedLength) {
    head1OffsetSlider.value = newLength; // Default to midpoint
    updateHead1Offset();
  }

  if (regionSize !== newLength) {
    regionSize = newLength;
    // Reinitialize with new tape length
    stopRunning();
    await initializePopulation();
  }
}

function updateHead1Offset() {
  const offset = parseInt(head1OffsetSlider.value, 10);
  head1OffsetDisplay.textContent = offset;
  if (population) {
    population.head1Offset = offset;
  }
}

function updateMaxSteps() {
  const sliderValue = parseInt(maxStepsSlider.value, 10);
  // Powers of 2: 6=64, 7=128, ..., 13=8192, ..., 16=65536
  const maxSteps = Math.pow(2, sliderValue);
  maxStepsDisplay.textContent = maxSteps;
  if (population) {
    population.maxSteps = maxSteps;
  }
}

// Event listeners
soupCanvas.addEventListener('click', toggle);

mutationRateSlider.addEventListener('input', updateMutationRate);
localitySlider.addEventListener('input', updateLocality);
alignmentSlider.addEventListener('input', updateAlignment);
tapeLengthSlider.addEventListener('input', updateTapeLength);
head1OffsetSlider.addEventListener('input', updateHead1Offset);
maxStepsSlider.addEventListener('input', updateMaxSteps);

// Click handlers for control keys
document.getElementById('toggle-run').addEventListener('click', toggle);
document.getElementById('speed-up').addEventListener('click', speedUp);
document.getElementById('speed-down').addEventListener('click', speedDown);
document.getElementById('page-left').addEventListener('click', () => {
  const newOffset = Math.max(0, viewOffset - DISPLAY_HEIGHT);
  if (newOffset !== viewOffset) {
    viewOffset = newOffset;
    updatePageIndicator();
    renderSoup();
  }
});
document.getElementById('page-right').addEventListener('click', () => {
  const newOffset = Math.min(SOUP_HEIGHT - DISPLAY_HEIGHT, viewOffset + DISPLAY_HEIGHT);
  if (newOffset !== viewOffset) {
    viewOffset = newOffset;
    updatePageIndicator();
    renderSoup();
  }
});

document.addEventListener('keydown', async (e) => {
  if (e.key === ' ') {
    e.preventDefault();
    toggle();
  } else if (e.key === 'r' || e.key === 'R') {
    stopRunning();
    await initializePopulation();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    const newOffset = Math.max(0, viewOffset - DISPLAY_HEIGHT);
    if (newOffset !== viewOffset) {
      viewOffset = newOffset;
      updatePageIndicator();
      renderSoup();
    }
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    const newOffset = Math.min(SOUP_HEIGHT - DISPLAY_HEIGHT, viewOffset + DISPLAY_HEIGHT);
    if (newOffset !== viewOffset) {
      viewOffset = newOffset;
      updatePageIndicator();
      renderSoup();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    speedUp();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    speedDown();
  }
});

// Initialize
initializePopulation().catch(e => {
  console.error('Failed to initialize:', e);
  document.body.innerHTML = `<div style="color: #f66; padding: 40px; font-family: monospace;">
    <h2>Failed to initialize</h2>
    <p>${e.message}</p>
    <p style="color: #888; margin-top: 20px;">This may happen if cross-origin isolation is not active.<br>
    Try a hard refresh (Ctrl+Shift+R) or clear the site data.</p>
  </div>`;
});

// Initialize tooltip system (wrapped in try-catch to prevent mobile crashes)
try {
  initTooltips();
  setupTooltips();
} catch (e) {
  console.warn('Tooltip initialization failed:', e);
}

function setupTooltips() {
  // Shared tooltip content for BFF operations (used by both BFF legend and execution legend)
  const opTooltips = {
    head0: {
      content: `
        <div class="tooltip-title"><code>&lt; &gt;</code> Head0 Movement</div>
        <div><code>&lt;</code> decrements head0 position (moves left)</div>
        <div><code>&gt;</code> increments head0 position (moves right)</div>
        <div style="margin-top: 8px; color: #888; font-size: 11px;">
          Head0 is the primary read head. It determines what byte is read
          for conditionals and what location is modified by <code>+</code>/<code>-</code> operations.
          <strong>Initialized at position 0</strong> (start of tape).
          Wraps around at tape boundaries.
        </div>
      `,
      position: 'left',
    },
    head1: {
      content: `
        <div class="tooltip-title"><code>{ }</code> Head1 Movement</div>
        <div><code>{</code> decrements head1 position (moves left)</div>
        <div><code>}</code> increments head1 position (moves right)</div>
        <div style="margin-top: 8px; color: #888; font-size: 11px;">
          Head1 is the secondary write head. It's used as source/destination
          for copy operations. <strong>Initialized at the configured offset</strong>
          (default 32). Wraps around at tape boundaries.
        </div>
      `,
      position: 'left',
    },
    math: {
      content: `
        <div class="tooltip-title"><code>+ -</code> Arithmetic</div>
        <div><code>+</code> increments byte at head0 (wrapping 255→0)</div>
        <div><code>-</code> decrements byte at head0 (wrapping 0→255)</div>
        <div style="margin-top: 8px; color: #888; font-size: 11px;">
          These operations modify the tape content at the current head0 position.
          Essential for creating and modifying program code.
        </div>
      `,
      position: 'left',
    },
    copy: {
      content: `
        <div class="tooltip-title"><code>. ,</code> Copy Operations</div>
        <div><code>.</code> copies byte from head0 to head1</div>
        <div><code>,</code> copies byte from head1 to head0</div>
        <div style="margin-top: 8px; color: #888; font-size: 11px;">
          Copy operations are key to self-replication. A replicator uses these
          to duplicate its own code to another location in the soup.
        </div>
      `,
      position: 'left',
    },
    loop: {
      content: `
        <div class="tooltip-title"><code>[ ]</code> Conditional Loops</div>
        <div><code>[</code> if byte at head0 is 0, jump to matching <code>]</code></div>
        <div><code>]</code> if byte at head0 is not 0, jump back to matching <code>[</code></div>
        <div style="margin-top: 8px; color: #888; font-size: 11px;">
          Loops enable conditional execution. Unmatched brackets cause the
          program to halt immediately. The loop counter tracks <code>]</code> executions only.
        </div>
      `,
      position: 'left',
    },
  };

  // Title tooltip
  registerTooltip(document.querySelector('.title'), {
    content: `
      <div class="tooltip-title">Turing Soup</div>
      <div>A 2 MB array of random bytes—a primordial soup where
      <span class="tooltip-link" data-tooltip="bff">self-replicating programs</span>
      spontaneously emerge.</div>
      <div style="margin-top: 10px; color: #888; font-size: 11px;">
        Each step, two random 64-byte regions are selected, concatenated into a
        128-byte tape, and executed as a BFF program. The modified tape is then
        written back, allowing successful replicators to spread through the soup.
      </div>
      <div style="margin-top: 10px; color: #fff; font-size: 11px;">
        ✦ With default settings, replicators typically emerge within ~1000 epochs.
      </div>
      <div style="margin-top: 10px;">
        <a class="tooltip-link" href="https://arxiv.org/abs/2406.19108" target="_blank" rel="noopener">Read the paper</a>
      </div>
    `,
    position: 'bottom',
    nested: {
      bff: {
        content: `
          <div class="tooltip-title">BFF Programs</div>
          <div>BFF is a variant of <a class="tooltip-link" href="https://en.wikipedia.org/wiki/Brainfuck" target="_blank" rel="noopener">Brainfuck</a> with two read/write heads
          operating on a shared tape.</div>
          <div style="margin-top: 8px; font-family: monospace; font-size: 11px; color: #888;">
            &lt; &gt; move head0<br>
            { } move head1<br>
            + - increment/decrement<br>
            . , copy between heads<br>
            [ ] conditional loops
          </div>
        `,
        position: 'right',
      },
    },
  });

  // Epochs tooltip
  registerTooltip(document.getElementById('epochs-label'), {
    content: `
      <div class="tooltip-title">Epochs</div>
      <div>One epoch = N pair executions, where N is the number of tapes in the soup.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Since each pair involves 2 tapes, after one epoch each tape has been
        selected twice on average. This normalizes progress across different soup sizes.
      </div>
    `,
    position: 'right',
  });

  // Epochs per second tooltip
  registerTooltip(document.getElementById('epochs-per-sec'), {
    content: `
      <div class="tooltip-title">Simulation Speed</div>
      <div>Current throughput in epochs per second.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Depends on speed setting, hardware, and soup activity.
        Higher execution counts (after replicators emerge) may slow this down.
      </div>
    `,
    position: 'right',
  });

  // Page indicator tooltip
  registerTooltip(document.getElementById('page-indicator'), {
    content: `
      <div class="tooltip-title">Soup Pages</div>
      <div>The soup contains 32,768 tapes (2 MB total), displayed in pages of 4,096 tapes.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Use ← → arrow keys or click the controls to navigate between pages.
        Replicators may emerge on any page.
      </div>
    `,
    position: 'right',
  });

  // Complexity graph title
  registerTooltip(document.getElementById('complexity-title'), {
    content: `
      <div class="tooltip-title">Complexity Metrics</div>
      <div>Tracks information-theoretic properties of the soup over time.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        When replicators emerge, you'll see K (compressibility) drop while
        H-K (higher-order complexity) rises—indicating structured, non-random patterns.
      </div>
    `,
    position: 'right',
  });

  // H (Shannon entropy) tooltip
  const shannonTooltip = {
    content: `
      <div class="tooltip-title">H – Shannon Entropy</div>
      <div>Measures the randomness of byte distribution (0-8 bits).</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        H = 8 means all 256 byte values appear equally (maximum randomness).
        H &lt; 8 means some bytes appear more often than others.
        Random initialization starts near 8.
      </div>
    `,
    position: 'right',
  };
  registerTooltip(document.getElementById('legend-h'), shannonTooltip);
  registerTooltip(document.getElementById('stat-h'), shannonTooltip);

  // K (Kolmogorov estimate) tooltip
  const kolmogorovTooltip = {
    content: `
      <div class="tooltip-title">K – Kolmogorov Complexity</div>
      <div>Estimates algorithmic complexity via compression (bits per byte).</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Approximated using DEFLATE compression (miniz_oxide library).
        Lower K means the data is more compressible (has repeating patterns).
        When replicators emerge, K drops as copies spread through the soup.
      </div>
    `,
    position: 'right',
  };
  registerTooltip(document.getElementById('legend-k'), kolmogorovTooltip);
  registerTooltip(document.getElementById('stat-k'), kolmogorovTooltip);

  // H-K (Higher-order complexity) tooltip
  const complexityTooltip = {
    content: `
      <div class="tooltip-title">H-K – Higher-Order Complexity</div>
      <div>The difference between entropy and compressibility.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        H-K ≈ 0 for random data (high H, high K).<br>
        H-K > 0 indicates structured complexity: diverse bytes arranged
        in compressible patterns—the signature of emergent replicators.
      </div>
    `,
    position: 'right',
  };
  registerTooltip(document.getElementById('legend-hk'), complexityTooltip);
  registerTooltip(document.getElementById('stat-hk'), complexityTooltip);

  // Execution graph title
  registerTooltip(document.getElementById('exec-title'), {
    content: `
      <div class="tooltip-title">Execution Metrics</div>
      <div>Tracks which BFF operations are being executed (EMA smoothed).</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Before replicators: mostly flat, low activity.<br>
        After replicators emerge: copy operations spike as programs
        actively replicate themselves through the soup.
      </div>
    `,
    position: 'right',
  });

  // Execution legend items (use 'right' position since they're on the left side of screen)
  registerTooltip(document.getElementById('exec-legend-head0'), { ...opTooltips.head0, position: 'right' });
  registerTooltip(document.getElementById('exec-legend-head1'), { ...opTooltips.head1, position: 'right' });
  registerTooltip(document.getElementById('exec-legend-math'), { ...opTooltips.math, position: 'right' });
  registerTooltip(document.getElementById('exec-legend-copy'), { ...opTooltips.copy, position: 'right' });
  registerTooltip(document.getElementById('exec-legend-loop'), { ...opTooltips.loop, position: 'right' });

  // Execution stat items (the numbers below the graph)
  registerTooltip(document.getElementById('exec-stat-head0'), { ...opTooltips.head0, position: 'right' });
  registerTooltip(document.getElementById('exec-stat-head1'), { ...opTooltips.head1, position: 'right' });
  registerTooltip(document.getElementById('exec-stat-math'), { ...opTooltips.math, position: 'right' });
  registerTooltip(document.getElementById('exec-stat-copy'), { ...opTooltips.copy, position: 'right' });
  registerTooltip(document.getElementById('exec-stat-loop'), { ...opTooltips.loop, position: 'right' });

  // BFF legend title
  registerTooltip(document.getElementById('bff-instructions-title'), {
    content: `
      <div class="tooltip-title">BFF Instructions</div>
      <div>BFF is a variant of <a class="tooltip-link" href="https://en.wikipedia.org/wiki/Brainfuck" target="_blank" rel="noopener">Brainfuck</a> with two read/write heads
      operating on a shared tape.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        10 instructions: <code>&lt; &gt; { } + - . , [ ]</code><br>
        All other byte values are no-ops (data).
      </div>
    `,
    position: 'left',
  });

  // BFF legend items
  registerTooltip(document.getElementById('bff-head0'), opTooltips.head0);
  registerTooltip(document.getElementById('bff-head1'), opTooltips.head1);
  registerTooltip(document.getElementById('bff-math'), opTooltips.math);
  registerTooltip(document.getElementById('bff-copy'), opTooltips.copy);
  registerTooltip(document.getElementById('bff-loop'), opTooltips.loop);

  // Slider tooltips
  registerTooltip(document.getElementById('mutation-label'), {
    content: `
      <div class="tooltip-title">Mutation Rate</div>
      <div>Probability of random byte mutation per position after each execution.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Default 0.024% (paper value). Higher rates introduce more variation
        but can disrupt established replicators. Set to 0 to observe pure
        selection dynamics.
      </div>
    `,
    position: 'left',
  });

  registerTooltip(document.getElementById('locality-label'), {
    content: `
      <div class="tooltip-title">Locality</div>
      <div>Maximum distance (in aligned positions) between selected tape pairs.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        "any" = no restriction (global mixing).<br>
        Lower values create spatial structure where nearby regions
        interact more often, enabling local "ecosystems" to form.
      </div>
    `,
    position: 'left',
  });

  registerTooltip(document.getElementById('alignment-label'), {
    content: `
      <div class="tooltip-title">Alignment</div>
      <div>Byte boundary at which tape selections can start.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        When alignment equals tape length (default), each tape occupies a distinct,
        non-overlapping region. Replicators can rely on consistent positioning.
      </div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        When alignment is smaller than tape length, selections may overlap—the same
        bytes can appear at different offsets across iterations. This selects for
        replicators that work regardless of where execution begins within their code.
      </div>
    `,
    position: 'left',
  });

  registerTooltip(document.getElementById('tape-length-label'), {
    content: `
      <div class="tooltip-title">Tape Length</div>
      <div>Size of each selected region in bytes.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Two regions of this size are concatenated to form the execution tape.
        Larger tapes allow more complex programs but take longer to fill
        with functional code. Default 64 (paper value).
      </div>
    `,
    position: 'left',
  });

  registerTooltip(document.getElementById('head1-offset-label'), {
    content: `
      <div class="tooltip-title">Head1 Offset</div>
      <div>Initial position of head1 when execution begins.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Head0 starts at 0 (beginning of tape). Head1 starts at this offset.
        Default 32 places head1 at the midpoint of the first region.
      </div>
      <div style="margin-top: 8px; color: #fff; font-size: 11px;">
        ✦ The paper authors note that offset must be &gt;16 for replicators
        to reliably emerge.
      </div>
    `,
    position: 'left',
  });

  registerTooltip(document.getElementById('max-steps-label'), {
    content: `
      <div class="tooltip-title">Max Steps</div>
      <div>Maximum BFF instructions executed before halting.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Prevents infinite loops. Default 8192 (2^13, paper value).
        Higher values allow more complex programs to complete but
        slow down simulation if many programs hit the limit.
      </div>
    `,
    position: 'left',
  });

  // Data legend tooltip
  registerTooltip(document.getElementById('data-legend'), {
    content: `
      <div class="tooltip-title">Data Bytes</div>
      <div>All byte values that don't encode BFF instructions are treated as data.</div>
      <div style="margin-top: 8px; color: #888; font-size: 11px;">
        Only 10 byte values are instructions: <code>&lt; &gt; { } + - . , [ ]</code><br>
        The other 246 values (0-255) are no-ops—the instruction pointer simply
        advances past them. They serve as data storage for programs.
      </div>
    `,
    position: 'left',
  });
}
