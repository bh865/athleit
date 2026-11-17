// Runs once when the server starts: validate env vars immediately instead of on first request.
export async function register() {
  await import('./env');
}
