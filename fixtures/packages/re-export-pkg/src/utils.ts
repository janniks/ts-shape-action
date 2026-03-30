/**
 * Utility functions (star exported)
 */

export function trim(s: string): string {
  return s.trim();
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type StringTransform = (s: string) => string;
