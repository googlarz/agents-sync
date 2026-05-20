const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export async function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const isTTY = process.stderr.isTTY;

  if (!isTTY) {
    process.stderr.write(`agents-sync: ${label}\n`);
    return fn();
  }

  let i = 0;
  process.stderr.write(`agents-sync: ${FRAMES[0]} ${label}`);
  const interval = setInterval(() => {
    i++;
    process.stderr.write(`\ragents-sync: ${FRAMES[i % FRAMES.length]} ${label}`);
  }, 80);

  try {
    const result = await fn();
    clearInterval(interval);
    process.stderr.write(`\ragents-sync: ✓ ${label}\n`);
    return result;
  } catch (e) {
    clearInterval(interval);
    process.stderr.write(`\ragents-sync: ✗ ${label}\n`);
    throw e;
  }
}
