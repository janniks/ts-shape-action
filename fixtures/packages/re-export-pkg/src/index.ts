/**
 * Package demonstrating re-export patterns
 */

// Star re-export
export * from "./utils.js";

// Named re-export with rename
export { parse as parseInput, format } from "./parser.js";

// Re-export default as named
export { default as Helper } from "./helper.js";

// Namespace re-export
export * as internal from "./internal.js";

// Local export
export const PACKAGE_NAME = "@fixtures/re-export-pkg";
