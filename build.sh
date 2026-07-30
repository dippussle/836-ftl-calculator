#!/bin/bash
set -e

# Install wasm-pack if not present
if ! command -v wasm-pack &>/dev/null; then
  echo "Installing wasm-pack..."
  cargo install wasm-pack
fi

echo "Building WASM..."
cd "$(dirname "$0")/rust"
wasm-pack build --target web --out-dir ../pkg
rm -f ../pkg/.gitignore

echo ""
echo "Done. Serve the root directory with any static file server, e.g.:"
echo "  python3 -m http.server 8080"
