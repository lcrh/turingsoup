//! BFF (Brainfuck Friends) Interpreter
//!
//! Implements the BFF instruction set from the Turing Soup paper.
//! Uses three heads on a single tape:
//! - IP (instruction pointer): current execution position
//! - head0 (read head): for reading data
//! - head1 (write head): for writing data

/// Maximum steps before halting (2^13, matching paper)
pub const MAX_STEPS: u32 = 8192;

/// BFF instruction byte values
pub mod instructions {
    pub const HEAD0_DEC: u8 = b'<';   // 0x3C - head0--
    pub const HEAD0_INC: u8 = b'>';   // 0x3E - head0++
    pub const HEAD1_DEC: u8 = b'{';   // 0x7B - head1--
    pub const HEAD1_INC: u8 = b'}';   // 0x7D - head1++
    pub const DECREMENT: u8 = b'-';   // 0x2D - tape[head0]--
    pub const INCREMENT: u8 = b'+';   // 0x2B - tape[head0]++
    pub const COPY_TO_H1: u8 = b'.';  // 0x2E - tape[head1] = tape[head0]
    pub const COPY_TO_H0: u8 = b',';  // 0x2C - tape[head0] = tape[head1]
    pub const LOOP_START: u8 = b'[';  // 0x5B - if tape[head0]==0, jump to ]
    pub const LOOP_END: u8 = b']';    // 0x5D - if tape[head0]!=0, jump to [
}

/// Halt reasons
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum HaltReason {
    EndOfTape = 0,
    MaxSteps = 1,
    UnmatchedBracket = 2,
    NoInstructions = 3,
}

/// Result of executing a tape
#[derive(Clone, Copy, Debug)]
pub struct ExecutionResult {
    pub steps: u32,
    pub head0_count: u32,  // < > (head0 movements)
    pub head1_count: u32,  // { } (head1 movements)
    pub math_count: u32,   // + - (increment/decrement)
    pub copy_count: u32,   // . , (copy operations)
    pub loop_count: u32,   // [ ] (loop operations)
    pub halt_reason: HaltReason,
}

/// Check if a byte is a BFF instruction
#[inline]
pub fn is_instruction(byte: u8) -> bool {
    matches!(
        byte,
        instructions::HEAD0_DEC
            | instructions::HEAD0_INC
            | instructions::HEAD1_DEC
            | instructions::HEAD1_INC
            | instructions::DECREMENT
            | instructions::INCREMENT
            | instructions::COPY_TO_H1
            | instructions::COPY_TO_H0
            | instructions::LOOP_START
            | instructions::LOOP_END
    )
}

/// Check if tape contains any BFF instructions
pub fn has_instructions(tape: &[u8]) -> bool {
    tape.iter().any(|&b| is_instruction(b))
}

/// Find matching bracket (does not cross tape boundaries)
/// Returns None if unmatched
#[inline]
fn find_matching_bracket(tape: &[u8], start: usize, direction: i32) -> Option<usize> {
    let mut depth = 1i32;
    let mut pos = start as i32;
    let size = tape.len() as i32;

    loop {
        pos += direction;

        // Stop at tape boundaries
        if pos < 0 || pos >= size {
            return None; // Unmatched - hit boundary
        }

        let byte = tape[pos as usize];

        if direction > 0 {
            // Looking for ]
            if byte == instructions::LOOP_START {
                depth += 1;
            } else if byte == instructions::LOOP_END {
                depth -= 1;
            }
        } else {
            // Looking for [
            if byte == instructions::LOOP_END {
                depth += 1;
            } else if byte == instructions::LOOP_START {
                depth -= 1;
            }
        }

        if depth == 0 {
            return Some(pos as usize);
        }
    }
}

/// Execute BFF program on tape
/// Modifies tape in place and returns execution statistics
/// head1_start: initial position of head1 (defaults to midpoint for paired execution)
pub fn execute(tape: &mut [u8]) -> ExecutionResult {
    execute_with_head1(tape, tape.len() / 2)
}

/// Execute BFF program - head0 starts at 0, head1 starts at specified position
/// Both heads can move freely across entire tape (toroidal wrapping)
pub fn execute_with_head1(tape: &mut [u8], head1_start: usize) -> ExecutionResult {
    execute_with_params(tape, head1_start, MAX_STEPS)
}

/// Execute BFF program with configurable head1 start and max steps
pub fn execute_with_params(tape: &mut [u8], head1_start: usize, max_steps: u32) -> ExecutionResult {
    let size = tape.len();

    // Early abort if no instructions
    if !has_instructions(tape) {
        return ExecutionResult {
            steps: 0,
            head0_count: 0,
            head1_count: 0,
            math_count: 0,
            copy_count: 0,
            loop_count: 0,
            halt_reason: HaltReason::NoInstructions,
        };
    }

    let mut ip: usize = 0;
    let mut head0: i32 = 0;  // Starts at beginning (left tape)
    let mut head1: i32 = head1_start as i32;  // Starts at specified position
    let mut steps: u32 = 0;
    let mut head0_count: u32 = 0;
    let mut head1_count: u32 = 0;
    let mut math_count: u32 = 0;
    let mut copy_count: u32 = 0;
    let mut loop_count: u32 = 0;

    // Wrap any head position to valid tape range
    let wrap = |h: i32| -> usize {
        ((h % size as i32) + size as i32) as usize % size
    };

    while steps < max_steps && ip < size {
        steps += 1;
        let byte = tape[ip];

        match byte {
            instructions::HEAD0_DEC => {
                head0 -= 1;
                head0 = wrap(head0) as i32;
                head0_count += 1;
            }
            instructions::HEAD0_INC => {
                head0 += 1;
                head0 = wrap(head0) as i32;
                head0_count += 1;
            }
            instructions::HEAD1_DEC => {
                head1 -= 1;
                head1 = wrap(head1) as i32;
                head1_count += 1;
            }
            instructions::HEAD1_INC => {
                head1 += 1;
                head1 = wrap(head1) as i32;
                head1_count += 1;
            }
            instructions::DECREMENT => {
                let idx = wrap(head0);
                tape[idx] = tape[idx].wrapping_sub(1);
                math_count += 1;
            }
            instructions::INCREMENT => {
                let idx = wrap(head0);
                tape[idx] = tape[idx].wrapping_add(1);
                math_count += 1;
            }
            instructions::COPY_TO_H1 => {
                let src = wrap(head0);
                let dst = wrap(head1);
                tape[dst] = tape[src];
                copy_count += 1;
            }
            instructions::COPY_TO_H0 => {
                let src = wrap(head1);
                let dst = wrap(head0);
                tape[dst] = tape[src];
                copy_count += 1;
            }
            instructions::LOOP_START => {
                let idx = wrap(head0);
                if tape[idx] == 0 {
                    match find_matching_bracket(tape, ip, 1) {
                        Some(target) => ip = target,
                        None => {
                            return ExecutionResult {
                                steps,
                                head0_count,
                                head1_count,
                                math_count,
                                copy_count,
                                loop_count,
                                halt_reason: HaltReason::UnmatchedBracket,
                            };
                        }
                    }
                }
            }
            instructions::LOOP_END => {
                let idx = wrap(head0);
                loop_count += 1;
                if tape[idx] != 0 {
                    match find_matching_bracket(tape, ip, -1) {
                        Some(target) => {
                            ip = target;
                        }
                        None => {
                            return ExecutionResult {
                                steps,
                                head0_count,
                                head1_count,
                                math_count,
                                copy_count,
                                loop_count,
                                halt_reason: HaltReason::UnmatchedBracket,
                            };
                        }
                    }
                }
            }
            _ => {
                // No-op: just advance IP
            }
        }

        ip += 1;
    }

    let halt_reason = if steps >= max_steps {
        HaltReason::MaxSteps
    } else {
        HaltReason::EndOfTape
    };

    ExecutionResult {
        steps,
        head0_count,
        head1_count,
        math_count,
        copy_count,
        loop_count,
        halt_reason,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_has_instructions() {
        assert!(has_instructions(b"abc+def"));
        assert!(has_instructions(b"["));
        assert!(!has_instructions(b"abcdef"));
        assert!(!has_instructions(b""));
    }

    #[test]
    fn test_simple_increment() {
        // head0 starts at 0, so '+' increments tape[0] from 0x2B to 0x2C
        let mut tape = vec![b'+', 0, 0, 0];
        let result = execute(&mut tape);
        assert_eq!(tape[0], 0x2C); // '+' (0x2B) becomes ',' (0x2C)
        assert_eq!(result.math_count, 1);
    }

    #[test]
    fn test_no_instructions() {
        let mut tape = vec![0, 1, 2, 3];
        let result = execute(&mut tape);
        assert_eq!(result.halt_reason, HaltReason::NoInstructions);
        assert_eq!(result.steps, 0);
    }
}
