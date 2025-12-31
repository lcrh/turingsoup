# Turing Soup

**[Live Demo](https://lcrh.github.io/turingsoup/)**

Interactive browser simulation of the "Turing Soup" primordial soup model. Reproduces the phase transition described in the paper as self-replicating programs spontaneously emerge from random initial conditions.

Based on: [Computational Life: How Well-formed, Self-replicating Programs Emerge from Simple Interaction](https://arxiv.org/abs/2406.19108)

## Quick Start

Pre-built WASM is included, so you can run immediately:

```bash
npx serve -l 8000 --config serve.json
```

Then open http://localhost:8000

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (for local server)
- [Rust](https://rustup.rs/) via rustup (for building WASM)
- wasm-pack: `cargo install wasm-pack`
- wasm32 target: `rustup target add wasm32-unknown-unknown`

### Commands

```bash
make build    # Build WASM module
make test     # Run Rust tests
make serve    # Start dev server
make dev      # Build and serve
make clean    # Clean build artifacts
```

## License

MIT
