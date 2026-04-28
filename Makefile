.PHONY: fmt lint test build bench verify

fmt:
	cargo fmt --all

lint:
	cargo clippy --workspace --all-targets -- -D warnings

test:
	cargo test --workspace

build:
	cargo build --workspace

bench:
	cargo bench -p sawyer-core --bench microbench --no-run

verify: fmt lint test build bench
