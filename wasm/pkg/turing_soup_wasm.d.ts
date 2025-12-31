/* tslint:disable */
/* eslint-disable */

export class ExecutionResult {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  steps: number;
  head0_count: number;
  head1_count: number;
  math_count: number;
  copy_count: number;
  loop_count: number;
  halt_reason: number;
}

/**
 * Run a batch of pair executions
 *
 * Input format: pairs as [slot_a_lo, slot_a_hi, slot_a_extra1, slot_a_extra2, slot_b_lo, slot_b_hi, slot_b_extra1, slot_b_extra2, ...]
 * (8 bytes per pair: 4 for slot_a as u32, 4 for slot_b as u32)
 *
 * Returns concatenated results for each pair
 */
export function execute_batch(soup: Uint8Array, pairs: Uint8Array, region_size: number, head1_offset: number, max_steps: number): Uint8Array;

/**
 * Execute a pair of regions from the soup
 *
 * Extracts two regions, combines them, executes BFF, and returns results.
 * Does NOT write back - that's handled in JS with compression cost comparison.
 *
 * Returns: [steps, head0_count, head1_count, math_count, copy_count, loop_count, halt_reason, ...modified_tape_data]
 */
export function execute_pair(soup: Uint8Array, slot_a: number, slot_b: number, region_size: number, head1_offset: number, max_steps: number): Uint8Array;

/**
 * Execute BFF program on a tape
 *
 * Takes a mutable slice of the tape data and executes the BFF interpreter.
 * Returns execution statistics.
 */
export function execute_tape(tape: Uint8Array): ExecutionResult;

/**
 * Check if a region contains any BFF instructions
 */
export function has_instructions(data: Uint8Array): boolean;

/**
 * Estimate Kolmogorov complexity using deflate compression (bits per byte)
 */
export function kolmogorov_estimate(data: Uint8Array): number;

/**
 * Calculate Shannon entropy of data (bits per byte)
 */
export function shannon_entropy(data: Uint8Array): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_executionresult_free: (a: number, b: number) => void;
  readonly __wbg_get_executionresult_copy_count: (a: number) => number;
  readonly __wbg_get_executionresult_halt_reason: (a: number) => number;
  readonly __wbg_get_executionresult_head0_count: (a: number) => number;
  readonly __wbg_get_executionresult_head1_count: (a: number) => number;
  readonly __wbg_get_executionresult_loop_count: (a: number) => number;
  readonly __wbg_get_executionresult_math_count: (a: number) => number;
  readonly __wbg_get_executionresult_steps: (a: number) => number;
  readonly __wbg_set_executionresult_copy_count: (a: number, b: number) => void;
  readonly __wbg_set_executionresult_halt_reason: (a: number, b: number) => void;
  readonly __wbg_set_executionresult_head0_count: (a: number, b: number) => void;
  readonly __wbg_set_executionresult_head1_count: (a: number, b: number) => void;
  readonly __wbg_set_executionresult_loop_count: (a: number, b: number) => void;
  readonly __wbg_set_executionresult_math_count: (a: number, b: number) => void;
  readonly __wbg_set_executionresult_steps: (a: number, b: number) => void;
  readonly execute_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly execute_pair: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly execute_tape: (a: number, b: number, c: any) => number;
  readonly has_instructions: (a: number, b: number) => number;
  readonly kolmogorov_estimate: (a: number, b: number) => number;
  readonly shannon_entropy: (a: number, b: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
