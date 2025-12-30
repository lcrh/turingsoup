/**
 * Turing Soup - Minimal Interface
 */

import { Population } from './population.js?v=63';

const SOUP_WIDTH = 64;
const SOUP_HEIGHT = 8192;
const REGION_SIZE = 64;  // One row = one tape (matching paper)

// DOM Elements
const soupCanvas = document.getElementById('soup-canvas');
const soupCtx = soupCanvas.getContext('2d');
const soupGenerationSpan = document.getElementById('soup-generation');
const stepsPerFrameSlider = document.getElementById('steps-per-frame');
const mutationRateSlider = document.getElementById('mutation-rate');
const complexityGraph = document.getElementById('complexity-graph');
const complexityCtx = complexityGraph.getContext('2d');
const shannonValueSpan = document.getElementById('shannon-value');
const kolmogorovValueSpan = document.getElementById('kolmogorov-value');
const complexityValueSpan = document.getElementById('complexity-value');
const execGraph = document.getElementById('exec-graph');
const execCtx = execGraph.getContext('2d');
const stepsValueSpan = document.getElementById('steps-value');
const execValueSpan = document.getElementById('exec-value');

// State
let population = null;
let running = false;
let animationId = null;

async function initializePopulation() {
  population = new Population(SOUP_WIDTH, SOUP_HEIGHT, REGION_SIZE);
  updateMutationRate();
  renderSoup();
  soupGenerationSpan.textContent = '0.00';
  // Compute and display initial complexity
  await population.updateComplexity();
  renderComplexityGraph();
  renderExecGraph();
}

function renderSoup() {
  if (population) {
    population.renderToCanvas(soupCtx);
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

function renderExecGraph() {
  if (!population) return;

  const history = population.execHistory;
  const w = execGraph.width;
  const h = execGraph.height;

  // Clear
  execCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  execCtx.fillRect(0, 0, w, h);

  // Update value display even with just 1 point
  if (history.length > 0) {
    const current = history[history.length - 1];
    stepsValueSpan.textContent = current.avgSteps.toFixed(0);
    execValueSpan.textContent = current.avgLoopJumps.toFixed(1);
  }

  if (history.length < 2) return;

  // Find max for scaling
  let maxLoops = 0, maxSteps = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].avgLoopJumps > maxLoops) maxLoops = history[i].avgLoopJumps;
    if (history[i].avgSteps > maxSteps) maxSteps = history[i].avgSteps;
  }
  const maxVal = Math.max(1, maxLoops, maxSteps);

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
      const y = h - (val / maxVal) * (h - 4) - 2;

      if (i === 0) {
        execCtx.moveTo(x, y);
      } else {
        execCtx.lineTo(x, y);
      }
    }
    execCtx.stroke();
  }

  // Draw metrics
  drawLine('avgSteps', 'rgba(255, 255, 255, 0.5)', 1);  // White - steps
  drawLine('avgLoopJumps', '#f0f', 1.5);  // Magenta - loop jumps
}

function startRunning() {
  if (running) return;
  running = true;

  const runLoop = (timestamp) => {
    if (!running) return;

    const stepsPerFrame = parseInt(stepsPerFrameSlider.value, 10);
    for (let i = 0; i < stepsPerFrame; i++) {
      population.soupStep();
    }

    renderSoup();
    renderComplexityGraph();
    renderExecGraph();
    soupGenerationSpan.textContent = population.generation.toFixed(2);

    animationId = requestAnimationFrame(runLoop);
  };

  animationId = requestAnimationFrame(runLoop);
}

function stopRunning() {
  running = false;
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

// Event listeners
soupCanvas.addEventListener('click', toggle);

mutationRateSlider.addEventListener('input', updateMutationRate);

document.addEventListener('keydown', async (e) => {
  if (e.key === ' ') {
    e.preventDefault();
    toggle();
  } else if (e.key === 'r' || e.key === 'R') {
    stopRunning();
    await initializePopulation();
  }
});

// Initialize
initializePopulation();
