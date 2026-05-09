//! Adaptive retry strategy for task execution.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum RetryStrategy {
    Immediate,
    Linear { delay_ms: u64 },
    Exponential { base_ms: u64, max_ms: u64 },
    Adaptive { min_ms: u64, max_ms: u64, multiplier: f64 },
}

impl Default for RetryStrategy {
    fn default() -> Self {
        RetryStrategy::Exponential {
            base_ms: 100,
            max_ms: 5000,
        }
    }
}

impl RetryStrategy {
    pub fn delay_for_attempt(&self, attempt: u32, error_rate: f64) -> Duration {
        match self {
            RetryStrategy::Immediate => Duration::ZERO,
            RetryStrategy::Linear { delay_ms } => Duration::from_millis(*delay_ms * attempt as u64),
            RetryStrategy::Exponential { base_ms, max_ms } => {
                let delay = (*base_ms as u64) * 2u64.pow(attempt - 1);
                Duration::from_millis(delay.min(*max_ms))
            }
            RetryStrategy::Adaptive { min_ms, max_ms, multiplier } => {
                let base = (*min_ms as f64) * multiplier.powi(attempt as i32);
                let adjusted = base * (1.0 + error_rate);
                Duration::from_millis(adjusted.clamp(*min_ms as f64, *max_ms as f64) as u64)
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct RetryOutcome {
    pub success: bool,
    pub attempts: u32,
    pub total_delay_ms: u64,
    pub final_error: Option<String>,
}

impl RetryOutcome {
    pub fn success(attempts: u32) -> Self {
        Self {
            success: true,
            attempts,
            total_delay_ms: 0,
            final_error: None,
        }
    }

    pub fn failure(attempts: u32, total_delay_ms: u64, error: &str) -> Self {
        Self {
            success: false,
            attempts,
            total_delay_ms,
            final_error: Some(error.to_string()),
        }
    }
}

pub struct AdaptiveRetryStrategy {
    strategy: RetryStrategy,
    max_attempts: u32,
    historical_error_rate: f64,
}

impl AdaptiveRetryStrategy {
    pub fn new(strategy: RetryStrategy, max_attempts: u32) -> Self {
        Self {
            strategy,
            max_attempts,
            historical_error_rate: 0.0,
        }
    }

    pub fn update_error_rate(&mut self, error_rate: f64) {
        self.historical_error_rate = error_rate.clamp(0.0, 1.0);
    }

    pub fn should_retry(&self, attempt: u32) -> bool {
        attempt < self.max_attempts
    }

    pub fn next_delay(&self, attempt: u32) -> Duration {
        self.strategy.delay_for_attempt(attempt.max(1), self.historical_error_rate)
    }

    pub fn max_attempts(&self) -> u32 {
        self.max_attempts
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exponential_backoff_increases_with_attempt() {
        let strategy = RetryStrategy::Exponential {
            base_ms: 100,
            max_ms: 5000,
        };

        let d1 = strategy.delay_for_attempt(1, 0.0);
        let d2 = strategy.delay_for_attempt(2, 0.0);
        let d3 = strategy.delay_for_attempt(3, 0.0);

        assert!(d1 < d2);
        assert!(d2 < d3);
    }

    #[test]
    fn adaptive_strategy_accounts_for_error_rate() {
        let strategy = RetryStrategy::Adaptive {
            min_ms: 100,
            max_ms: 5000,
            multiplier: 1.5,
        };

        let low_error = strategy.delay_for_attempt(1, 0.1);
        let high_error = strategy.delay_for_attempt(1, 0.8);

        assert!(high_error > low_error);
    }

    #[test]
    fn retry_respects_max_attempts() {
        let retry = AdaptiveRetryStrategy::new(RetryStrategy::default(), 3);

        assert!(retry.should_retry(0));
        assert!(retry.should_retry(1));
        assert!(retry.should_retry(2));
        assert!(!retry.should_retry(3));
    }
}
