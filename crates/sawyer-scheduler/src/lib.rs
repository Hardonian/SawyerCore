//! Deterministic fixed-step scheduler.

use std::collections::VecDeque;

pub trait Task {
    fn run(&mut self, tick: u64);
}

pub struct Scheduler {
    queue: VecDeque<Box<dyn Task + Send>>,
    tick: u64,
    step_ns: u64,
}

impl Scheduler {
    pub fn new(step_ns: u64) -> Self {
        Self {
            queue: VecDeque::new(),
            tick: 0,
            step_ns,
        }
    }

    pub fn enqueue<T: Task + Send + 'static>(&mut self, task: T) {
        self.queue.push_back(Box::new(task));
    }

    pub fn step(&mut self) {
        self.tick += 1;
        let len = self.queue.len();
        for _ in 0..len {
            if let Some(mut task) = self.queue.pop_front() {
                task.run(self.tick);
                self.queue.push_back(task);
            }
        }
    }

    pub fn run_steps(&mut self, steps: u64) {
        for _ in 0..steps {
            self.step();
        }
    }

    pub fn tick(&self) -> u64 {
        self.tick
    }

    pub fn step_ns(&self) -> u64 {
        self.step_ns
    }
}
