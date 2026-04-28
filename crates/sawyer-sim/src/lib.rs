//! Deterministic agent simulation engine.

use std::collections::VecDeque;
use std::time::Instant;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimEvent {
    pub tick: u64,
    pub agent_id: u64,
    pub payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentState {
    Idle,
    Active,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: u64,
    pub state: AgentState,
    pub processed_events: u64,
}

impl Agent {
    pub fn new(id: u64) -> Self {
        Self {
            id,
            state: AgentState::Idle,
            processed_events: 0,
        }
    }

    pub fn apply(&mut self, _event: &SimEvent) {
        self.state = AgentState::Active;
        self.processed_events += 1;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Replay {
    pub seed: u64,
    pub events: Vec<SimEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metrics {
    pub latency_ms: u128,
    pub events_per_sec: f64,
    pub events_processed: usize,
}

pub struct ScenarioRunner {
    seed: u64,
    queue: VecDeque<SimEvent>,
}

impl ScenarioRunner {
    pub fn new(seed: u64) -> Self {
        Self {
            seed,
            queue: VecDeque::new(),
        }
    }

    pub fn push_event(&mut self, event: SimEvent) {
        self.queue.push_back(event);
    }

    pub fn run(&mut self, agents: &mut [Agent]) -> (Replay, Metrics) {
        let start = Instant::now();
        let mut events = Vec::with_capacity(self.queue.len());

        while let Some(event) = self.queue.pop_front() {
            if let Some(agent) = agents.iter_mut().find(|a| a.id == event.agent_id) {
                agent.apply(&event);
            }
            events.push(event);
        }

        let elapsed = start.elapsed();
        let eps = if elapsed.as_secs_f64() > 0.0 {
            events.len() as f64 / elapsed.as_secs_f64()
        } else {
            events.len() as f64
        };

        (
            Replay {
                seed: self.seed,
                events,
            },
            Metrics {
                latency_ms: elapsed.as_millis(),
                events_per_sec: eps,
                events_processed: agents.iter().map(|a| a.processed_events as usize).sum(),
            },
        )
    }

    pub fn replay(seed: u64, replay: &Replay, agents: &mut [Agent]) -> bool {
        if seed != replay.seed {
            return false;
        }

        for event in &replay.events {
            if let Some(agent) = agents.iter_mut().find(|a| a.id == event.agent_id) {
                agent.apply(event);
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replay_is_deterministic() {
        let seed = 7;
        let mut r1 = ScenarioRunner::new(seed);
        r1.push_event(SimEvent {
            tick: 1,
            agent_id: 1,
            payload: "a".into(),
        });
        let mut agents1 = vec![Agent::new(1)];
        let (replay, _) = r1.run(&mut agents1);

        let mut agents2 = vec![Agent::new(1)];
        assert!(ScenarioRunner::replay(seed, &replay, &mut agents2));
        assert_eq!(agents1[0].processed_events, agents2[0].processed_events);
    }
}
