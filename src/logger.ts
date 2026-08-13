export function logStep(step: string, message: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`[${step}] ${message}`);
    return;
  }
  try {
    console.log(`[${step}] ${message} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[${step}] ${message}`);
  }
}
