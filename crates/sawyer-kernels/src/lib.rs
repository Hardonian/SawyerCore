//! CPU capability detection and deterministic kernels.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CpuFeatures {
    pub avx2: bool,
    pub avx512f: bool,
    pub neon: bool,
}

pub fn detect_cpu_features() -> CpuFeatures {
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        CpuFeatures {
            avx2: std::arch::is_x86_feature_detected!("avx2"),
            avx512f: std::arch::is_x86_feature_detected!("avx512f"),
            neon: false,
        }
    }
    #[cfg(target_arch = "aarch64")]
    {
        CpuFeatures {
            avx2: false,
            avx512f: false,
            neon: std::arch::is_aarch64_feature_detected!("neon"),
        }
    }
    #[cfg(not(any(target_arch = "x86", target_arch = "x86_64", target_arch = "aarch64")))]
    {
        CpuFeatures {
            avx2: false,
            avx512f: false,
            neon: false,
        }
    }
}

pub fn dot_product(lhs: &[f32], rhs: &[f32]) -> Result<f32, &'static str> {
    if lhs.len() != rhs.len() {
        return Err("input lengths mismatch");
    }

    // Placeholder dispatch strategy: choose scalar path explicitly until SIMD kernels are verified.
    Ok(dot_product_scalar(lhs, rhs))
}

pub fn dot_product_scalar(lhs: &[f32], rhs: &[f32]) -> f32 {
    lhs.iter().zip(rhs.iter()).map(|(a, b)| a * b).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_product_matches_expected() {
        let lhs = [1.0, 2.0, 3.0];
        let rhs = [4.0, 5.0, 6.0];
        let out = dot_product(&lhs, &rhs).expect("dot product should succeed");
        assert_eq!(out, 32.0);
    }
}
