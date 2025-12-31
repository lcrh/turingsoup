/**
 * Tooltip System - Nested tooltips with Paradox game-style behavior
 *
 * Features:
 * - Nested tooltips (hover links in tooltip to open child)
 * - Parent tooltips persist while hovering children
 * - Clickable external links
 * - Smooth show/hide transitions
 */

let tooltipLayer = null;
const activeTooltips = [];  // Stack of {element, trigger, depth}
const hideTimeouts = new Map();  // trigger -> timeoutId
const showTimeouts = new Map();  // trigger -> timeoutId

const SHOW_DELAY = 200;
const HIDE_DELAY = 100;

/**
 * Initialize the tooltip system. Call once after DOM is ready.
 */
export function initTooltips() {
  tooltipLayer = document.createElement('div');
  tooltipLayer.className = 'tooltip-layer';
  document.body.appendChild(tooltipLayer);
}

/**
 * Register a tooltip on a trigger element
 * @param {HTMLElement} trigger - Element that shows tooltip on hover
 * @param {Object} config - Tooltip configuration
 * @param {string} config.content - HTML content for the tooltip
 * @param {Object} config.nested - Map of data-tooltip values to nested tooltip configs
 * @param {string} config.position - Preferred position: 'bottom', 'right', 'left', 'top'
 */
export function registerTooltip(trigger, config) {
  if (!trigger) {
    console.warn('registerTooltip: trigger element not found');
    return;
  }
  trigger._tooltipConfig = config;

  trigger.addEventListener('mouseenter', handleTriggerEnter);
  trigger.addEventListener('mouseleave', handleTriggerLeave);
}

/**
 * Handle mouse entering a trigger
 */
function handleTriggerEnter(event) {
  const trigger = event.currentTarget;

  // Cancel any pending hide
  cancelHide(trigger);

  // Cancel any pending show (in case of rapid re-entry)
  cancelShow(trigger);

  // Schedule show with delay
  const timeout = setTimeout(() => {
    showTimeouts.delete(trigger);
    showTooltip(trigger);
  }, SHOW_DELAY);
  showTimeouts.set(trigger, timeout);
}

/**
 * Handle mouse leaving a trigger
 */
function handleTriggerLeave(event) {
  const trigger = event.currentTarget;

  // Cancel pending show
  cancelShow(trigger);

  // Schedule hide with delay
  scheduleHide(trigger);
}

/**
 * Show tooltip for a trigger
 */
function showTooltip(trigger) {
  const config = trigger._tooltipConfig;
  if (!config) return;

  // Already showing?
  if (trigger._activeTooltip) return;

  // Determine depth
  const parentTooltip = trigger.closest('.tooltip');
  const depth = parentTooltip ? parseInt(parentTooltip.dataset.depth || '0') + 1 : 0;

  // If showing a sibling tooltip (same depth), hide existing ones at this depth first
  const existingAtDepth = activeTooltips.filter(t => parseInt(t.element.dataset.depth) >= depth);
  existingAtDepth.forEach(({ trigger: t }) => hideTooltip(t, false));

  // Create tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.dataset.depth = depth;
  tooltip.innerHTML = config.content;

  // Add to layer
  tooltipLayer.appendChild(tooltip);

  // Position
  positionTooltip(tooltip, trigger, config.position || 'bottom');

  // Track
  activeTooltips.push({ element: tooltip, trigger, depth });
  trigger._activeTooltip = tooltip;

  // Setup nested tooltips within this tooltip
  if (config.nested) {
    tooltip.querySelectorAll('[data-tooltip]').forEach(nestedTrigger => {
      const nestedKey = nestedTrigger.dataset.tooltip;
      const nestedConfig = config.nested[nestedKey];
      if (nestedConfig) {
        registerTooltip(nestedTrigger, nestedConfig);
      }
    });
  }

  // Tooltip mouse events
  tooltip.addEventListener('mouseenter', () => {
    // Cancel hide for this tooltip's trigger
    cancelHide(trigger);

    // Cancel hide for all ancestor tooltips (lower depth) - they're siblings in DOM but parents logically
    const currentDepth = depth;
    activeTooltips.forEach(({ trigger: t, element: el }) => {
      const d = parseInt(el.dataset.depth || '0');
      if (d < currentDepth) {
        cancelHide(t);
      }
    });
  });

  tooltip.addEventListener('mouseleave', (e) => {
    const relatedTarget = e.relatedTarget;

    // Check if moving to another tooltip (could be child or sibling)
    const targetTooltip = relatedTarget?.closest?.('.tooltip');
    if (targetTooltip) {
      const targetDepth = parseInt(targetTooltip.dataset.depth || '0');
      // Only schedule hide if moving to same or lower depth (sibling/ancestor)
      // Don't hide if moving to higher depth (child tooltip)
      if (targetDepth <= depth) {
        scheduleHide(trigger);
      }
    } else if (!tooltip.contains(relatedTarget)) {
      // Moving outside all tooltips
      scheduleHide(trigger);
    }
  });

  // Show with animation
  requestAnimationFrame(() => {
    tooltip.classList.add('visible');
  });
}

/**
 * Hide tooltip for a trigger
 */
function hideTooltip(trigger, animate = true) {
  const tooltip = trigger._activeTooltip;
  if (!tooltip) return;

  const depth = parseInt(tooltip.dataset.depth || '0');

  // Hide this and all deeper tooltips
  const toRemove = activeTooltips.filter(t => parseInt(t.element.dataset.depth) >= depth);

  toRemove.reverse().forEach(({ element, trigger: t }) => {
    if (animate) {
      element.classList.remove('visible');
      setTimeout(() => {
        if (element.parentNode) element.remove();
      }, 150);
    } else {
      element.remove();
    }
    t._activeTooltip = null;
    cancelHide(t);
    cancelShow(t);
  });

  // Update active array
  for (let i = activeTooltips.length - 1; i >= 0; i--) {
    if (parseInt(activeTooltips[i].element.dataset.depth) >= depth) {
      activeTooltips.splice(i, 1);
    }
  }
}

/**
 * Schedule a hide with delay
 */
function scheduleHide(trigger) {
  cancelHide(trigger);
  const timeout = setTimeout(() => {
    hideTimeouts.delete(trigger);
    hideTooltip(trigger);
  }, HIDE_DELAY);
  hideTimeouts.set(trigger, timeout);
}

/**
 * Cancel pending hide
 */
function cancelHide(trigger) {
  const timeout = hideTimeouts.get(trigger);
  if (timeout) {
    clearTimeout(timeout);
    hideTimeouts.delete(trigger);
  }
}

/**
 * Cancel pending show
 */
function cancelShow(trigger) {
  const timeout = showTimeouts.get(trigger);
  if (timeout) {
    clearTimeout(timeout);
    showTimeouts.delete(trigger);
  }
}

/**
 * Position tooltip relative to trigger
 */
function positionTooltip(tooltip, trigger, preferred) {
  const triggerRect = trigger.getBoundingClientRect();
  const margin = 8;

  // Temporarily make visible to measure
  tooltip.style.visibility = 'hidden';
  tooltip.style.display = 'block';
  const tooltipRect = tooltip.getBoundingClientRect();
  tooltip.style.visibility = '';

  const positions = {
    bottom: {
      x: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
      y: triggerRect.bottom + margin,
      fits: triggerRect.bottom + margin + tooltipRect.height < window.innerHeight,
    },
    top: {
      x: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
      y: triggerRect.top - tooltipRect.height - margin,
      fits: triggerRect.top - margin - tooltipRect.height > 0,
    },
    right: {
      x: triggerRect.right + margin,
      y: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
      fits: triggerRect.right + margin + tooltipRect.width < window.innerWidth,
    },
    left: {
      x: triggerRect.left - tooltipRect.width - margin,
      y: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
      fits: triggerRect.left - margin - tooltipRect.width > 0,
    },
  };

  // Try preferred, then fallbacks
  const order = [preferred, 'bottom', 'right', 'top', 'left'];
  let x, y;

  for (const pos of order) {
    if (positions[pos]?.fits) {
      x = positions[pos].x;
      y = positions[pos].y;
      break;
    }
  }

  // Fallback if nothing fits
  if (x === undefined) {
    x = positions.bottom.x;
    y = positions.bottom.y;
  }

  // Clamp to viewport
  x = Math.max(8, Math.min(x, window.innerWidth - tooltipRect.width - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - tooltipRect.height - 8));

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}
