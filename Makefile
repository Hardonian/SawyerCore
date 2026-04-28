.PHONY: fmt lint test build bench verify local-vllm local-litellm local-llamacpp local-stack smoke-local

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

local-vllm:
	./scripts/start-vllm.sh

local-litellm:
	./scripts/start-litellm.sh

local-llamacpp:
	./scripts/start-llamacpp.sh

local-stack:
	./scripts/start-local-stack.sh

smoke-local:
	./scripts/smoke-local-stack.sh
