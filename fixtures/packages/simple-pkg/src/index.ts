/**
 * Simple package with basic exports
 */

// Function export
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

// Const export
export const VERSION = "1.0.0";

// Type export
export type Config = {
  debug: boolean;
  timeout: number;
};

// Interface export
export interface User {
  id: string;
  name: string;
  email?: string;
}

// Enum export
export enum Status {
  Pending = "pending",
  Active = "active",
  Inactive = "inactive",
}

// Internal (not exported)
function internalHelper(): void {
  // This should NOT appear in the output
}

const internalConfig = {
  secret: "hidden",
};
