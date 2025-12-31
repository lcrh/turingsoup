/**
 * Turing Soup - Minimal Interface (WASM Accelerated)
 */

import { PopulationWasm as Population } from './population-wasm.js';

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
let speedIndex = 0;

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
  if (population) {
    // 100 = no limit (any), 1-99 = percentage of total tapes as max distance
    population.localityLimit = sliderValue === 100 ? null : Math.floor(population.numTapes * sliderValue / 100);
  }
  // Update display
  if (sliderValue === 100) {
    localityDisplay.textContent = 'any';
  } else {
    localityDisplay.textContent = `${sliderValue}%`;
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
initializePopulation();
