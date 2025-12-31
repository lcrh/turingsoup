.PHONY: build watch serve dev clean test

SHELL := /bin/bash

# Build WASM module
build:
	source "$$HOME/.cargo/env" && cd wasm && wasm-pack build --target web --release

# Watch for changes and rebuild (requires cargo-watch: cargo install cargo-watch)
watch:
	source "$$HOME/.cargo/env" && cd wasm && cargo watch -s "wasm-pack build --target web --release"

# Start local dev server with Cross-Origin-Isolation (required for SharedArrayBuffer)
serve:
	npx serve -l 8000 --config serve.json

# Build and serve
dev: build serve

# Run tests
test:
	source "$$HOME/.cargo/env" && cd wasm && cargo test

# Clean build artifacts
clean:
	source "$$HOME/.cargo/env" && cd wasm && cargo clean
	rm -rf wasm/pkg
