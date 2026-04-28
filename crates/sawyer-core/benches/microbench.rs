use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use sawyer_kernels::{dot_product, dot_product_scalar};
use sawyer_memory::Arena;
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};

fn bench_event_queue(c: &mut Criterion) {
    c.bench_function("event_queue_throughput", |b| {
        b.iter(|| {
            let mut runner = ScenarioRunner::new(42);
            for i in 0..500 {
                runner.push_event(SimEvent {
                    tick: i,
                    agent_id: 1,
                    payload: "evt".into(),
                });
            }
            let mut agents = vec![Agent::new(1)];
            let _ = runner.run(&mut agents);
        });
    });
}

fn bench_arena(c: &mut Criterion) {
    c.bench_function("arena_allocation", |b| {
        b.iter(|| {
            let mut arena = Arena::with_capacity(1024 * 1024);
            for _ in 0..512 {
                let _ = arena.alloc(64, 8);
            }
            arena.reset();
        })
    });
}

fn bench_dot(c: &mut Criterion) {
    let lhs = vec![1.0_f32; 1024];
    let rhs = vec![2.0_f32; 1024];
    let mut group = c.benchmark_group("dot_product");
    group.bench_with_input(
        BenchmarkId::new("scalar", lhs.len()),
        &(&lhs, &rhs),
        |b, (l, r)| b.iter(|| dot_product_scalar(l, r)),
    );
    group.bench_with_input(
        BenchmarkId::new("dispatch", lhs.len()),
        &(&lhs, &rhs),
        |b, (l, r)| b.iter(|| dot_product(l, r).expect("same length")),
    );
    group.finish();
}

fn bench_replay(c: &mut Criterion) {
    c.bench_function("deterministic_replay", |b| {
        b.iter(|| {
            let mut runner = ScenarioRunner::new(7);
            for i in 0..200 {
                runner.push_event(SimEvent {
                    tick: i,
                    agent_id: 1,
                    payload: "replay".into(),
                });
            }
            let mut agents = vec![Agent::new(1)];
            let (replay, _) = runner.run(&mut agents);
            let mut replay_agents = vec![Agent::new(1)];
            let _ok = ScenarioRunner::replay(7, &replay, &mut replay_agents);
        })
    });
}

criterion_group!(
    benches,
    bench_event_queue,
    bench_arena,
    bench_dot,
    bench_replay
);
criterion_main!(benches);
