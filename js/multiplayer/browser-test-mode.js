export function isBrowserTestMode() {
  return globalThis.__SAVORIA_BROWSER_TESTS__ === true;
}
