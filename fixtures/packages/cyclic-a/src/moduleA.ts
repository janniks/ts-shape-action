/**
 * Module A with cyclic re-export
 */

export function funcA(): string {
  return "A";
}

export type TypeA = {
  a: string;
};

// Cyclic re-export (back to self through moduleB)
export * from "./moduleB.js";
