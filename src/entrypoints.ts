/**
 * Entrypoint resolution for package.json exports
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  WorkspacePackage,
  PackageExports,
  PackageExportsConditions,
  PackageExportsArray,
} from "./discovery.js";

export interface Entrypoint {
  /** Subpath like "." or "./utils" */
  subpath: string;
  /** Absolute path to the source file */
  sourceFile: string;
}

/** Condition priority for resolving exports objects */
const CONDITION_PRIORITY = ["types", "import", "default"];

/** File extensions to try when resolving */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const OUTPUT_EXTENSIONS = [".js", ".mjs", ".cjs", ".d.ts", ".d.mts", ".d.cts"];

/**
 * Resolve all entrypoints for a package
 */
export function resolveEntrypoints(pkg: WorkspacePackage): Entrypoint[] {
  const entrypoints: Entrypoint[] = [];

  if (pkg.exports) {
    // Has exports field - use it
    const resolved = resolveExportsField(pkg.exports, pkg.dir);
    for (const [subpath, target] of Object.entries(resolved)) {
      const sourceFile = mapToSourceFile(target, pkg.dir);
      if (sourceFile) {
        entrypoints.push({ subpath, sourceFile });
      }
    }
  } else {
    // Fallback to types/module/main
    const fallbackTarget = pkg.types ?? pkg.module ?? pkg.main;
    if (fallbackTarget) {
      const sourceFile = mapToSourceFile(fallbackTarget, pkg.dir);
      if (sourceFile) {
        entrypoints.push({ subpath: ".", sourceFile });
      }
    } else {
      // Last resort: try src/index.ts
      const sourceFile = findIndexFile(pkg.dir);
      if (sourceFile) {
        entrypoints.push({ subpath: ".", sourceFile });
      }
    }
  }

  // Sort by subpath for deterministic output
  entrypoints.sort((a, b) => a.subpath.localeCompare(b.subpath));

  return entrypoints;
}

/**
 * Resolve the exports field to a map of subpath -> target path
 */
function resolveExportsField(
  exports: WorkspacePackage["exports"],
  pkgDir: string
): Record<string, string> {
  const result: Record<string, string> = {};

  if (typeof exports === "string") {
    // Simple string export: "exports": "./src/index.ts"
    result["."] = exports;
  } else if (Array.isArray(exports)) {
    // Array export: pick first resolvable
    const resolved = resolveExportsArray(exports, pkgDir);
    if (resolved) {
      result["."] = resolved;
    }
  } else if (exports && typeof exports === "object") {
    // Object export - could be subpath map or conditions
    const keys = Object.keys(exports);
    const isSubpathMap = keys.some((k) => k === "." || k.startsWith("./"));

    if (isSubpathMap) {
      // Subpath exports: { ".": "...", "./utils": "..." }
      for (const [subpath, value] of Object.entries(exports)) {
        if (subpath === "." || subpath.startsWith("./")) {
          const resolved = resolveExportsValue(value, pkgDir);
          if (resolved) {
            result[subpath] = resolved;
          }
        }
      }
    } else {
      // Conditions object: { "types": "...", "import": "..." }
      const resolved = resolveExportsConditions(
        exports as PackageExportsConditions,
        pkgDir
      );
      if (resolved) {
        result["."] = resolved;
      }
    }
  }

  return result;
}

/**
 * Resolve a single exports value (string, array, or conditions object)
 */
function resolveExportsValue(
  value: string | PackageExportsConditions | PackageExportsArray | undefined,
  pkgDir: string
): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return resolveExportsArray(value, pkgDir);
  }

  return resolveExportsConditions(value, pkgDir);
}

/**
 * Resolve a conditions object using priority chain
 */
function resolveExportsConditions(
  conditions: PackageExportsConditions,
  pkgDir: string
): string | null {
  // Try priority conditions first
  for (const condition of CONDITION_PRIORITY) {
    if (condition in conditions) {
      const resolved = resolveExportsValue(conditions[condition], pkgDir);
      if (resolved) {
        return resolved;
      }
    }
  }

  // Fall back to first string value found by DFS
  for (const value of Object.values(conditions)) {
    const resolved = resolveExportsValue(value, pkgDir);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

/**
 * Resolve an exports array - pick first resolvable entry
 */
function resolveExportsArray(
  arr: PackageExportsArray,
  pkgDir: string
): string | null {
  for (const entry of arr) {
    const resolved = resolveExportsValue(entry, pkgDir);
    if (resolved) {
      // Check if it actually exists
      const fullPath = path.resolve(pkgDir, resolved);
      if (fs.existsSync(fullPath)) {
        return resolved;
      }
      // Also try mapping to source
      const sourceFile = mapToSourceFile(resolved, pkgDir);
      if (sourceFile) {
        return resolved;
      }
    }
  }
  return null;
}

/**
 * Map a target path to a source file
 * Handles dist -> src mapping for build outputs
 */
function mapToSourceFile(target: string, pkgDir: string): string | null {
  const fullPath = path.resolve(pkgDir, target);

  // If the target is already a TypeScript source file and exists, use it
  if (SOURCE_EXTENSIONS.some((ext) => target.endsWith(ext))) {
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // If the target exists as-is and is a source file type, use it
  if (fs.existsSync(fullPath)) {
    const ext = path.extname(fullPath);
    if (SOURCE_EXTENSIONS.includes(ext)) {
      return fullPath;
    }
  }

  // Try mapping dist/build output to src
  const mappedPath = mapDistToSrc(target, pkgDir);
  if (mappedPath && fs.existsSync(mappedPath)) {
    return mappedPath;
  }

  // Try swapping extension to TypeScript
  for (const outExt of OUTPUT_EXTENSIONS) {
    if (target.endsWith(outExt)) {
      for (const srcExt of SOURCE_EXTENSIONS) {
        const tsPath = path.resolve(
          pkgDir,
          target.slice(0, -outExt.length) + srcExt
        );
        if (fs.existsSync(tsPath)) {
          return tsPath;
        }
      }
    }
  }

  // Fallback: try src/index.ts in package root
  const fallback = findIndexFile(pkgDir);
  if (fallback) {
    return fallback;
  }

  return null;
}

/**
 * Map a dist path to a src path
 * e.g., dist/foo.js -> src/foo.ts
 */
function mapDistToSrc(target: string, pkgDir: string): string | null {
  const distPrefixes = ["dist/", "build/", "lib/", "out/"];
  const srcPrefixes = ["src/", "source/", "lib/"];

  for (const distPrefix of distPrefixes) {
    if (target.startsWith(`./${distPrefix}`) || target.startsWith(distPrefix)) {
      const relativePath = target.replace(/^\.?\//, "").replace(distPrefix, "");

      for (const srcPrefix of srcPrefixes) {
        // Try with each source extension
        for (const outExt of OUTPUT_EXTENSIONS) {
          if (relativePath.endsWith(outExt)) {
            for (const srcExt of SOURCE_EXTENSIONS) {
              const srcPath = path.resolve(
                pkgDir,
                srcPrefix,
                relativePath.slice(0, -outExt.length) + srcExt
              );
              if (fs.existsSync(srcPath)) {
                return srcPath;
              }
            }
          }
        }

        // Try exact path with extension swap
        for (const srcExt of SOURCE_EXTENSIONS) {
          const baseName = path.basename(relativePath, path.extname(relativePath));
          const dirName = path.dirname(relativePath);
          const srcPath = path.resolve(
            pkgDir,
            srcPrefix,
            dirName === "." ? "" : dirName,
            baseName + srcExt
          );
          if (fs.existsSync(srcPath)) {
            return srcPath;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Find an index file in the package directory
 */
function findIndexFile(pkgDir: string): string | null {
  const srcDirs = ["src", "source", "lib", ""];

  for (const srcDir of srcDirs) {
    for (const ext of SOURCE_EXTENSIONS) {
      const indexPath = path.resolve(pkgDir, srcDir, `index${ext}`);
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
    }
  }

  return null;
}

/**
 * Check if a path looks like a build output (not source)
 */
export function isBuildOutput(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.includes("/dist/") ||
    normalized.includes("/build/") ||
    normalized.includes("/out/") ||
    normalized.endsWith(".d.ts") ||
    normalized.endsWith(".d.mts") ||
    normalized.endsWith(".d.cts")
  );
}
