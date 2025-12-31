//! Compression/entropy utilities for Turing Soup

/// Calculate Shannon entropy of a byte array (bits per byte)
pub fn shannon_entropy(data: &[u8]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }

    let mut counts = [0u32; 256];
    for &byte in data {
        counts[byte as usize] += 1;
    }

    let n = data.len() as f64;
    let mut entropy = 0.0;

    for &count in &counts {
        if count > 0 {
            let p = count as f64 / n;
            entropy -= p * p.log2();
        }
    }

    entropy
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shannon_entropy_uniform() {
        // All zeros = 0 entropy
        let data = vec![0u8; 256];
        assert_eq!(shannon_entropy(&data), 0.0);
    }

    #[test]
    fn test_shannon_entropy_max() {
        // Each byte appears once = max entropy (8 bits)
        let data: Vec<u8> = (0..=255).collect();
        let entropy = shannon_entropy(&data);
        assert!((entropy - 8.0).abs() < 0.001);
    }
}
