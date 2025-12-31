.PHONY: build watch serve dev clean test

# Build WASM module (requires: rustup, wasm-pack)
build:
	cd wasm && wasm-pack build --target web --release

# Watch for changes and rebuild (requires: cargo-watch)
watch:
	cd wasm && cargo watch -s "wasm-pack build --target web --release"

# Start local dev server with Cross-Origin-Isolation (required for SharedArrayBuffer)
serve:
	npx serve -l 8000 --config serve.json

# Build and serve
dev: build serve

# Run tests
test:
	cd wasm && cargo test

# Clean build artifacts
clean:
	cd wasm && cargo clean
	rm -rf wasm/pkg
