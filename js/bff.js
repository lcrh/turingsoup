/**
 * BFFInterpreter - Brainfuck Friends interpreter
 *
 * Implements the BFF instruction set from the Turing Soup paper.
 * Uses three heads on a single tape:
 * - IP (instruction pointer): current execution position
 * - head0 (read head): for reading data
 * - head1 (write head): for writing data
 *
 * This is a pure interpreter with no visualization logic.
 */

// BFF instruction byte values
export const BFF_INSTRUCTIONS = {
  '<': 0x3C,  // head0--
  '>': 0x3E,  // head0++
  '{': 0x7B,  // head1--
  '}': 0x7D,  // head1++
  '-': 0x2D,  // tape[head0]--
  '+': 0x2B,  // tape[head0]++
  '.': 0x2E,  // tape[head1] = tape[head0]
  ',': 0x2C,  // tape[head0] = tape[head1]
  '[': 0x5B,  // if tape[head0]==0, jump forward to matching ]
  ']': 0x5D,  // if tape[head0]!=0, jump back to matching [
};

// Reverse lookup: byte value to instruction character
export const BYTE_TO_INSTRUCTION = {};
for (const [char, byte] of Object.entries(BFF_INSTRUCTIONS)) {
  BYTE_TO_INSTRUCTION[byte] = char;
}

// Instruction categories for visualization
export const INSTRUCTION_CATEGORIES = {
  'head_movement': ['<', '>', '{', '}'],
  'arithmetic': ['+', '-'],
  'copy': ['.', ','],
  'control': ['[', ']'],
};

/**
 * Check if a byte value is a BFF instruction
 * @param {number} byte - Byte value 0-255
 * @returns {string|null} Instruction character or null if no-op
 */
export function byteToInstruction(byte) {
  return BYTE_TO_INSTRUCTION[byte] || null;
}

/**
 * Get the category of an instruction
 * @param {string} instruction - Single character instruction
 * @returns {string|null} Category name or null
 */
export function getInstructionCategory(instruction) {
  for (const [category, instructions] of Object.entries(INSTRUCTION_CATEGORIES)) {
    if (instructions.includes(instruction)) {
      return category;
    }
  }
  return null;
}

// v12 - MAX_STEPS = 8192 to match paper
export class BFFInterpreter {
  static MAX_STEPS = 8192; // 2^13 from paper

  /**
   * Create a new BFF interpreter
   * @param {Tape} tape - The tape to execute on
   */
  constructor(tape) {
    this.tape = tape;
    this.reset();
  }

  /**
   * Reset all heads to initial positions
   */
  reset() {
    this.ip = 0;      // Instruction pointer
    this.head0 = 0;   // Read head
    this.head1 = 0;   // Write head
    this.stepCount = 0;
    this.writeCount = 0;  // Track tape modifications
    this.loopJumps = 0;   // Track backward jumps from ]
    this.halted = false;
    this.haltReason = null;
  }

  /**
   * Get current interpreter state
   * @returns {Object} State object with all head positions and status
   */
  getState() {
    return {
      ip: this.ip,
      head0: this.head0,
      head1: this.head1,
      stepCount: this.stepCount,
      halted: this.halted,
      haltReason: this.haltReason,
      currentInstruction: byteToInstruction(this.tape.get(this.ip)),
      currentByte: this.tape.get(this.ip),
    };
  }

  /**
   * Execute one instruction
   * @returns {Object} State after execution, including what changed
   */
  step() {
    if (this.halted) {
      return { ...this.getState(), changed: null };
    }

    // Check step limit
    if (this.stepCount >= BFFInterpreter.MAX_STEPS) {
      this.halted = true;
      this.haltReason = 'max_steps';
      return { ...this.getState(), changed: null };
    }

    const byte = this.tape.get(this.ip);
    const instruction = byteToInstruction(byte);
    const changed = { type: null, index: null, oldValue: null, newValue: null };

    this.stepCount++;

    if (instruction === null) {
      // No-op: just advance IP
      this.ip++;
      if (this.ip >= this.tape.size) {
        this.halted = true;
        this.haltReason = 'end_of_tape';
      }
      return { ...this.getState(), changed };
    }

    switch (instruction) {
      case '<': // head0--
        this.head0 = this._wrapHead(this.head0 - 1);
        break;

      case '>': // head0++
        this.head0 = this._wrapHead(this.head0 + 1);
        break;

      case '{': // head1--
        this.head1 = this._wrapHead(this.head1 - 1);
        break;

      case '}': // head1++
        this.head1 = this._wrapHead(this.head1 + 1);
        break;

      case '-': // tape[head0]--
        changed.type = 'decrement';
        changed.index = this.head0;
        changed.oldValue = this.tape.get(this.head0);
        this.tape.decrement(this.head0);
        changed.newValue = this.tape.get(this.head0);
        this.writeCount++;
        break;

      case '+': // tape[head0]++
        changed.type = 'increment';
        changed.index = this.head0;
        changed.oldValue = this.tape.get(this.head0);
        this.tape.increment(this.head0);
        changed.newValue = this.tape.get(this.head0);
        this.writeCount++;
        break;

      case '.': // tape[head1] = tape[head0]
        changed.type = 'copy_to_head1';
        changed.index = this.head1;
        changed.oldValue = this.tape.get(this.head1);
        this.tape.set(this.head1, this.tape.get(this.head0));
        changed.newValue = this.tape.get(this.head1);
        this.writeCount++;
        break;

      case ',': // tape[head0] = tape[head1]
        changed.type = 'copy_to_head0';
        changed.index = this.head0;
        changed.oldValue = this.tape.get(this.head0);
        this.tape.set(this.head0, this.tape.get(this.head1));
        changed.newValue = this.tape.get(this.head0);
        this.writeCount++;
        break;

      case '[': // if tape[head0]==0, jump forward to matching ]
        if (this.tape.get(this.head0) === 0) {
          const target = this._findMatchingBracket(this.ip, 1);
          if (target === -1) {
            this.halted = true;
            this.haltReason = 'unmatched_bracket';
            return { ...this.getState(), changed };
          }
          this.ip = target;
        }
        break;

      case ']': // if tape[head0]!=0, jump back to matching [
        if (this.tape.get(this.head0) !== 0) {
          const target = this._findMatchingBracket(this.ip, -1);
          if (target === -1) {
            this.halted = true;
            this.haltReason = 'unmatched_bracket';
            return { ...this.getState(), changed };
          }
          this.ip = target;
          this.loopJumps++;
        }
        break;
    }

    // Advance IP (unless halted)
    if (!this.halted) {
      this.ip++;
      if (this.ip >= this.tape.size) {
        this.halted = true;
        this.haltReason = 'end_of_tape';
      }
    }

    return { ...this.getState(), changed };
  }

  /**
   * Find matching bracket (does not cross tape boundaries)
   * @param {number} start - Starting position
   * @param {number} direction - 1 for forward, -1 for backward
   * @returns {number} Position of matching bracket, or -1 if not found
   * @private
   */
  _findMatchingBracket(start, direction) {
    let depth = 1;
    let pos = start;
    const openBracket = BFF_INSTRUCTIONS['['];
    const closeBracket = BFF_INSTRUCTIONS[']'];

    // Search without wrapping - stop at tape boundaries
    while (true) {
      pos += direction;

      // Stop at tape boundaries
      if (pos < 0 || pos >= this.tape.size) {
        return -1; // Unmatched - hit boundary
      }

      const byte = this.tape.get(pos);

      if (direction === 1) {
        // Looking for ]
        if (byte === openBracket) depth++;
        else if (byte === closeBracket) depth--;
      } else {
        // Looking for [
        if (byte === closeBracket) depth++;
        else if (byte === openBracket) depth--;
      }

      if (depth === 0) {
        return pos;
      }
    }
  }

  /**
   * Wrap IP to valid range
   * @private
   */
  _wrapIP(index) {
    return ((index % this.tape.size) + this.tape.size) % this.tape.size;
  }

  /**
   * Wrap head position to valid range
   * @private
   */
  _wrapHead(index) {
    return ((index % this.tape.size) + this.tape.size) % this.tape.size;
  }

  /**
   * Run until halted or max steps
   * @param {function} onStep - Optional callback after each step
   * @returns {Object} Final state
   */
  run(onStep = null) {
    while (!this.halted) {
      const state = this.step();
      if (onStep) onStep(state);
    }
    return this.getState();
  }
}
