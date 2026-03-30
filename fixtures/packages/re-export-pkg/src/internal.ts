/**
 * Internal module (namespace re-exported)
 */

export const DEBUG = false;

export function log(message: string): void {
  if (DEBUG) {
    console.log(`[internal] ${message}`);
  }
}

export interface InternalConfig {
  verbose: boolean;
}
