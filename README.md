# 836 FTL v2 Calculator
The web version of the calculator for the 836 FTL v2.\
\
Disclaimer: This code was generated using claude code to follow the [python version](https://github.com/garlic-bred/836-FTL-V2-calculator-python) that I wrote by hand.\
\
The calculator uses rust compiled to webassembly since javascript doesn't support 32-bit floats.

### Instructions:
1. Install dependencies:
   - rust: [https://rust-lang.org/tools/install/](https://rust-lang.org/tools/install/)
   - wasm-pack: `cargo install wasm-pack`
2. Compile: `./build.sh`
3. Run a local http server: `python3 -m http.server 8080`
4. Visit the calculator at `http://localhost:8080`
