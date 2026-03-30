/**
 * Module B with cyclic re-export
 */

export function funcB(): string {
  return "B";
}

export type TypeB = {
  b: string;
};

// Cyclic re-export back to moduleA
// This creates a cycle: index -> moduleA -> moduleB -> moduleA
export * from "./moduleA.js";
