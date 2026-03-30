/**
 * Parser functions (named re-exports)
 */

export function parse(input: string): Record<string, unknown> {
  return JSON.parse(input);
}

export function format(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}

// Not re-exported
export function validate(input: string): boolean {
  try {
    JSON.parse(input);
    return true;
  } catch {
    return false;
  }
}
