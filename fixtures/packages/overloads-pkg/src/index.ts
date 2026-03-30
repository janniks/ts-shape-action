/**
 * Package with function overloads
 */

// Overloaded function
export function parse(input: string): object;
export function parse(input: string, reviver: (key: string, value: unknown) => unknown): object;
export function parse(input: string, reviver?: (key: string, value: unknown) => unknown): object {
  return reviver ? JSON.parse(input, reviver) : JSON.parse(input);
}

// Another overloaded function
export function format(value: number): string;
export function format(value: number, decimals: number): string;
export function format(value: Date): string;
export function format(value: Date, locale: string): string;
export function format(value: number | Date, arg2?: number | string): string {
  if (typeof value === "number") {
    if (typeof arg2 === "number") {
      return value.toFixed(arg2);
    }
    return value.toString();
  }
  if (typeof arg2 === "string") {
    return value.toLocaleDateString(arg2);
  }
  return value.toISOString();
}

// Non-overloaded function for comparison
export function identity<T>(value: T): T {
  return value;
}
