//! SawyerCore multi-agent system.
//!
//! A self-orchestrating multi-agent system with:
//! - Task graph execution (not linear chains)
//! - Priority and cost-aware scheduling
//! - Structured memory (short-term and long-term)
//! - Self-improvement via performance metrics and decision traces
//! - Graceful fallback with degradation tiers

pub mod core;
pub mod fallback;
pub mod memory;
pub mod roles;
pub mod scheduler;

pub use core::Orchestrator;
pub use fallback::FallbackChain;
pub use memory::StateStore;
pub use roles::{AgentId, AgentRole, PlannerAgent, ExecutorAgent, VerifierAgent, OptimizerAgent};
pub use scheduler::CostAwareScheduler;
