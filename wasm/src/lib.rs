//! Turing Soup WASM Core
//!
//! High-performance WebAssembly module for BFF execution and compression cost calculation.

mod bff;
mod compression;

use wasm_bindgen::prelude::*;

/// Execution result returned to JavaScript
#[wasm_bindgen]
pub struct ExecutionResult {
    pub steps: u32,
    pub head0_count: u32,
    pub head1_count: u32,
    pub math_count: u32,
    pub copy_count: u32,
    pub loop_count: u32,
    pub halt_reason: u8,
}

/// Execute BFF program on a tape
///
/// Takes a mutable slice of the tape data and executes the BFF interpreter.
/// Returns execution statistics.
#[wasm_bindgen]
pub fn execute_tape(tape: &mut [u8]) -> ExecutionResult {
    let result = bff::execute(tape);
    ExecutionResult {
        steps: result.steps,
        head0_count: result.head0_count,
        head1_count: result.head1_count,
        math_count: result.math_count,
        copy_count: result.copy_count,
        loop_count: result.loop_count,
        halt_reason: result.halt_reason as u8,
    }
}

/// Execute a pair of regions from the soup
///
/// Extracts two regions, combines them, executes BFF, and returns results.
/// Does NOT write back - that's handled in JS with compression cost comparison.
///
/// Returns: [steps, head0_count, head1_count, math_count, copy_count, loop_count, halt_reason, ...modified_tape_data]
#[wasm_bindgen]
pub fn execute_pair(
    soup: &[u8],
    slot_a: usize,
    slot_b: usize,
    region_size: usize,
    head1_offset: usize,
    max_steps: u32,
) -> Vec<u8> {
    // Create combined tape (region_a followed by region_b)
    let mut combined = Vec::with_capacity(region_size * 2);

    // Extract region A with wrapping
    for i in 0..region_size {
        let idx = (slot_a + i) % soup.len();
        combined.push(soup[idx]);
    }

    // Extract region B with wrapping
    for i in 0..region_size {
        let idx = (slot_b + i) % soup.len();
        combined.push(soup[idx]);
    }

    // Execute with configurable head1 offset and max steps
    let result = bff::execute_with_params(&mut combined, head1_offset, max_steps);

    // Pack result: 7 u32s (28 bytes) + tape data
    let mut output = Vec::with_capacity(28 + combined.len());

    // Pack statistics as little-endian u32s
    output.extend_from_slice(&result.steps.to_le_bytes());
    output.extend_from_slice(&result.head0_count.to_le_bytes());
    output.extend_from_slice(&result.head1_count.to_le_bytes());
    output.extend_from_slice(&result.math_count.to_le_bytes());
    output.extend_from_slice(&result.copy_count.to_le_bytes());
    output.extend_from_slice(&result.loop_count.to_le_bytes());
    output.extend_from_slice(&(result.halt_reason as u32).to_le_bytes());

    // Append modified tape
    output.extend_from_slice(&combined);

    output
}

/// Check if a region contains any BFF instructions
#[wasm_bindgen]
pub fn has_instructions(data: &[u8]) -> bool {
    bff::has_instructions(data)
}

/// Calculate Shannon entropy of data (bits per byte)
#[wasm_bindgen]
pub fn shannon_entropy(data: &[u8]) -> f64 {
    compression::shannon_entropy(data)
}

/// Estimate Kolmogorov complexity using deflate compression (bits per byte)
#[wasm_bindgen]
pub fn kolmogorov_estimate(data: &[u8]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    let compressed = miniz_oxide::deflate::compress_to_vec(data, 6);
    (compressed.len() as f64 * 8.0) / data.len() as f64
}

/// Run a batch of pair executions
///
/// Input format: pairs as [slot_a_lo, slot_a_hi, slot_a_extra1, slot_a_extra2, slot_b_lo, slot_b_hi, slot_b_extra1, slot_b_extra2, ...]
/// (8 bytes per pair: 4 for slot_a as u32, 4 for slot_b as u32)
///
/// Returns concatenated results for each pair
#[wasm_bindgen]
pub fn execute_batch(
    soup: &[u8],
    pairs: &[u8],
    region_size: usize,
    head1_offset: usize,
    max_steps: u32,
) -> Vec<u8> {
    let pair_size = 8; // 2 x u32
    let num_pairs = pairs.len() / pair_size;
    let result_size = 28 + region_size * 2; // 7 u32 stats + tape

    let mut output = Vec::with_capacity(num_pairs * result_size);

    for i in 0..num_pairs {
        let offset = i * pair_size;

        // Parse slot indices as little-endian u32
        let slot_a = u32::from_le_bytes([
            pairs[offset],
            pairs[offset + 1],
            pairs[offset + 2],
            pairs[offset + 3],
        ]) as usize;

        let slot_b = u32::from_le_bytes([
            pairs[offset + 4],
            pairs[offset + 5],
            pairs[offset + 6],
            pairs[offset + 7],
        ]) as usize;

        let result = execute_pair(soup, slot_a, slot_b, region_size, head1_offset, max_steps);
        output.extend_from_slice(&result);
    }

    output
}
