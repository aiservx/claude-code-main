# Open Claude Code Desktop

Desktop GUI wrapper for Open Claude Code with Ollama support.

## Prerequisites

- [Bun](https://bun.sh) installed
- [Ollama](https://ollama.com) installed and running
- [Rust](https://rustup.rs) for building Tauri

## Quick Start

### Option 1: Use CLI Only (Recommended for now)

```bash
# Install dependencies
bun install

# Run with Ollama
set CLAUDE_CODE_USE_OLLAMA=1
set OLLAMA_MODEL=qwen2.5:latest
bun run ./src/entrypoints/cli.tsx
```

### Option 2: Build Desktop App

```bash
# Install Tauri CLI
cargo install tauri-cli

# Build the desktop app
cd desktop
cargo tauri build
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_CODE_USE_OLLAMA` | Enable Ollama provider | - |
| `OLLAMA_BASE_URL` | Ollama server URL | http://localhost:11434 |
| `OLLAMA_MODEL` | Default Ollama model | llama3.3 |

## Running with Ollama

1. Make sure Ollama is running: `ollama serve`
2. Start Claude Code with:
   ```bash
   set CLAUDE_CODE_USE_OLLAMA=1
   bun run ./src/entrypoints/cli.tsx
   ```

## Project Structure

```
desktop/
  src/
    main.rs        - Tauri application entry
    commands.rs    - Rust commands for frontend
  src-tauri/
    tauri.conf.json - Tauri configuration
    index.html     - Desktop UI
  Cargo.toml       - Rust dependencies
```
