/**
 * Runs once when the server starts (Next.js instrumentation hook). The Node-only checks live in
 * instrumentation.node.ts so the Edge bundle never tries to compile them.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  }
}
