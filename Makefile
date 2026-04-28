.PHONY: fmt lint test build build-release build-repro bench verify release local-vllm local-litellm local-llamacpp local-stack smoke-local

fmt:
	cargo fmt --all

lint:
	cargo clippy --workspace --all-targets -- -D warnings

test:
	cargo test --workspace

build:
	cargo build --workspace

build-release:
	cargo build --workspace --release --locked

build-repro:
	SOURCE_DATE_EPOCH=1704067200 CARGO_PROFILE_RELEASE_DEBUG=false RUSTFLAGS='-C debuginfo=0 -C strip=symbols -C link-arg=-Wl,--build-id=none' cargo build -p sawyer-cli --release --locked
	sha256sum target/release/sawyer > target/release/sawyer.sha256
	cp target/release/sawyer target/release/sawyer.repro.1
	SOURCE_DATE_EPOCH=1704067200 CARGO_PROFILE_RELEASE_DEBUG=false RUSTFLAGS='-C debuginfo=0 -C strip=symbols -C link-arg=-Wl,--build-id=none' cargo build -p sawyer-cli --release --locked
	cp target/release/sawyer target/release/sawyer.repro.2
	sha256sum target/release/sawyer.repro.1 target/release/sawyer.repro.2
	python -c "import json,subprocess,time; sha=subprocess.check_output(['sha256sum','target/release/sawyer'],text=True).split()[0]; commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(); meta=json.loads(subprocess.check_output(['cargo','metadata','--no-deps','--format-version=1'],text=True)); version=next(p['version'] for p in meta['packages'] if p['name']=='sawyer-cli'); open('target/release/sawyer.manifest.json','w').write(json.dumps({'binary_path':'target/release/sawyer','binary_sha256':sha,'version':version,'commit_hash':commit,'build_timestamp_unix':int(time.time())}, indent=2)+'\\n')"
	@if command -v gpg >/dev/null 2>&1; then gpg --armor --detach-sign --output target/release/sawyer.sha256.asc target/release/sawyer.sha256 || echo "gpg key unavailable; skipping detached signature"; else echo "gpg not installed; skipping detached signature"; fi

bench:
	cargo bench -p sawyer-core --bench microbench --no-run

verify: fmt lint test build bench

release: verify build-release build-repro

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
