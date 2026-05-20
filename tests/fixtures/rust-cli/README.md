# datapipe

CLI tool for streaming and transforming JSON data pipelines.

## Usage
```bash
cargo run -- --input data.json --format csv
```

## Testing
```bash
cargo test
cargo test -- --nocapture  # with output
```

## Architecture
- `src/main.rs` — CLI argument parsing, entry point
- `src/pipeline.rs` — core transformation logic
- `src/output.rs` — output formatters (json, csv, ndjson)
