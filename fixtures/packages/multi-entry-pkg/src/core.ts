/**
 * Core functionality
 */

export interface CoreOptions {
  verbose: boolean;
  timeout: number;
}

export function doSomething(options: CoreOptions): void {
  console.log("Doing something with options:", options);
}
