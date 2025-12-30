/**
 * Tape - A reusable tape data structure for BFF execution
 *
 * Represents a circular tape of bytes where all operations wrap around.
 * This is a pure data structure with no execution logic.
 */
export class Tape {
  /**
   * Create a new tape
   * @param {number} size - Number of cells (default 64)
   */
  constructor(size = 64) {
    this.size = size;
    this.data = new Uint8Array(size);
  }

  /**
   * Get byte at index (wrapping)
   * @param {number} index - Position on tape
   * @returns {number} Byte value 0-255
   */
  get(index) {
    return this.data[this._wrap(index)];
  }

  /**
   * Set byte at index (both index and value wrap)
   * @param {number} index - Position on tape
   * @param {number} value - Value to set (wraps to 0-255)
   */
  set(index, value) {
    this.data[this._wrap(index)] = value & 0xFF;
  }

  /**
   * Increment value at index
   * @param {number} index - Position on tape
   */
  increment(index) {
    const i = this._wrap(index);
    this.data[i] = (this.data[i] + 1) & 0xFF;
  }

  /**
   * Decrement value at index
   * @param {number} index - Position on tape
   */
  decrement(index) {
    const i = this._wrap(index);
    this.data[i] = (this.data[i] - 1) & 0xFF;
  }

  /**
   * Fill tape with random bytes
   */
  randomize() {
    for (let i = 0; i < this.size; i++) {
      this.data[i] = Math.floor(Math.random() * 256);
    }
  }

  /**
   * Export tape as array for visualization
   * @returns {number[]} Copy of tape data
   */
  toArray() {
    return Array.from(this.data);
  }

  /**
   * Create a deep copy of this tape
   * @returns {Tape} New tape with same data
   */
  clone() {
    const copy = new Tape(this.size);
    copy.data.set(this.data);
    return copy;
  }

  /**
   * Clear all cells to zero
   */
  clear() {
    this.data.fill(0);
  }

  /**
   * Create tape from array
   * @param {number[]} arr - Array of byte values
   * @returns {Tape} New tape initialized from array
   */
  static fromArray(arr) {
    const tape = new Tape(arr.length);
    for (let i = 0; i < arr.length; i++) {
      tape.data[i] = arr[i] & 0xFF;
    }
    return tape;
  }

  /**
   * Wrap index to valid range
   * @private
   */
  _wrap(index) {
    return ((index % this.size) + this.size) % this.size;
  }
}
