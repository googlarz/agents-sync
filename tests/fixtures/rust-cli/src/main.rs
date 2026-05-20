use clap::Parser;

mod pipeline;
mod output;

#[derive(Parser, Debug)]
#[command(name = "datapipe", about = "Stream and transform JSON data")]
struct Args {
    #[arg(short, long)]
    input: String,

    #[arg(short, long, default_value = "json")]
    format: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::init();
    let args = Args::parse();
    // HACK: format validation is duplicated in pipeline.rs — consolidate before v1.0
    pipeline::run(&args.input, &args.format).await
}
