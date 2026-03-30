/**
 * Diff engine for comparing public API surfaces
 */

import type { ExportFact } from "./analyzer.js";
import type { Tuple } from "./serializer.js";
import { tupleToFact, readTuplesFromFile } from "./serializer.js";

/**
 * Identity key: first 5 fields (pkg, subpath, exportType, exportName, kind)
 */
export type IdentityKey = [string, string, string, string, string];

/**
 * Changed export with base and head shapes
 */
export interface ChangedExport {
  identity: IdentityKey;
  baseShapes: string[];
  headShapes: string[];
}

/**
 * Diff result between base and head
 */
export interface DiffResult {
  /** Exports present in head but not in base */
  added: ExportFact[];
  /** Exports present in base but not in head */
  removed: ExportFact[];
  /** Exports present in both but with different shapes */
  changed: ChangedExport[];
  /** Summary statistics */
  summary: {
    packagesAffected: number;
    totalAdded: number;
    totalRemoved: number;
    totalChanged: number;
  };
}

/**
 * Create an identity key from a tuple
 */
export function getIdentityKey(tuple: Tuple): IdentityKey {
  return [tuple[0], tuple[1], tuple[2], tuple[3], tuple[4]];
}

/**
 * Create an identity key string for use in maps
 */
export function identityKeyString(key: IdentityKey): string {
  return JSON.stringify(key);
}

/**
 * Parse an identity key string back to array
 */
export function parseIdentityKeyString(str: string): IdentityKey {
  return JSON.parse(str) as IdentityKey;
}

/**
 * Group tuples by identity key
 */
function groupByIdentity(tuples: Tuple[]): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();

  for (const tuple of tuples) {
    const key = identityKeyString(getIdentityKey(tuple));
    const shape = tuple[5];

    if (!groups.has(key)) {
      groups.set(key, new Set());
    }
    groups.get(key)!.add(shape);
  }

  return groups;
}

/**
 * Compute diff between base and head tuples
 */
export function computeDiff(
  baseTuples: Tuple[],
  headTuples: Tuple[]
): DiffResult {
  const baseGroups = groupByIdentity(baseTuples);
  const headGroups = groupByIdentity(headTuples);

  const added: ExportFact[] = [];
  const removed: ExportFact[] = [];
  const changed: ChangedExport[] = [];
  const affectedPackages = new Set<string>();

  // Find removed and changed
  for (const [keyStr, baseShapes] of baseGroups) {
    const key = parseIdentityKeyString(keyStr);
    const headShapes = headGroups.get(keyStr);

    if (!headShapes) {
      // Identity removed entirely
      for (const shape of baseShapes) {
        removed.push({
          pkg: key[0],
          subpath: key[1],
          exportType: key[2] as "named" | "default",
          exportName: key[3],
          kind: key[4] as ExportFact["kind"],
          shape,
        });
      }
      affectedPackages.add(key[0]);
    } else {
      // Check if shapes differ
      const baseSorted = [...baseShapes].sort();
      const headSorted = [...headShapes].sort();

      if (JSON.stringify(baseSorted) !== JSON.stringify(headSorted)) {
        changed.push({
          identity: key,
          baseShapes: baseSorted,
          headShapes: headSorted,
        });
        affectedPackages.add(key[0]);
      }
    }
  }

  // Find added
  for (const [keyStr, headShapes] of headGroups) {
    if (!baseGroups.has(keyStr)) {
      const key = parseIdentityKeyString(keyStr);
      for (const shape of headShapes) {
        added.push({
          pkg: key[0],
          subpath: key[1],
          exportType: key[2] as "named" | "default",
          exportName: key[3],
          kind: key[4] as ExportFact["kind"],
          shape,
        });
      }
      affectedPackages.add(key[0]);
    }
  }

  // Sort results for deterministic output
  added.sort((a, b) => {
    const cmp = a.pkg.localeCompare(b.pkg);
    if (cmp !== 0) return cmp;
    const cmp2 = a.subpath.localeCompare(b.subpath);
    if (cmp2 !== 0) return cmp2;
    const cmp3 = a.exportName.localeCompare(b.exportName);
    if (cmp3 !== 0) return cmp3;
    return a.shape.localeCompare(b.shape);
  });

  removed.sort((a, b) => {
    const cmp = a.pkg.localeCompare(b.pkg);
    if (cmp !== 0) return cmp;
    const cmp2 = a.subpath.localeCompare(b.subpath);
    if (cmp2 !== 0) return cmp2;
    const cmp3 = a.exportName.localeCompare(b.exportName);
    if (cmp3 !== 0) return cmp3;
    return a.shape.localeCompare(b.shape);
  });

  changed.sort((a, b) => {
    for (let i = 0; i < 5; i++) {
      const aVal = a.identity[i] ?? "";
      const bVal = b.identity[i] ?? "";
      const cmp = aVal.localeCompare(bVal);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  return {
    added,
    removed,
    changed,
    summary: {
      packagesAffected: affectedPackages.size,
      totalAdded: added.length,
      totalRemoved: removed.length,
      totalChanged: changed.length,
    },
  };
}

/**
 * Compute diff between two JSONL files
 */
export function computeDiffFromFiles(
  baseFile: string,
  headFile: string
): DiffResult {
  const baseTuples = readTuplesFromFile(baseFile);
  const headTuples = readTuplesFromFile(headFile);
  return computeDiff(baseTuples, headTuples);
}

/**
 * Check if there are any changes
 */
export function hasChanges(diff: DiffResult): boolean {
  return (
    diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0
  );
}

/**
 * Group diff results by package
 */
export interface PackageDiff {
  pkg: string;
  added: ExportFact[];
  removed: ExportFact[];
  changed: ChangedExport[];
}

export function groupByPackage(diff: DiffResult): PackageDiff[] {
  const packages = new Map<string, PackageDiff>();

  const getOrCreate = (pkg: string): PackageDiff => {
    if (!packages.has(pkg)) {
      packages.set(pkg, { pkg, added: [], removed: [], changed: [] });
    }
    return packages.get(pkg)!;
  };

  for (const fact of diff.added) {
    getOrCreate(fact.pkg).added.push(fact);
  }

  for (const fact of diff.removed) {
    getOrCreate(fact.pkg).removed.push(fact);
  }

  for (const change of diff.changed) {
    getOrCreate(change.identity[0]).changed.push(change);
  }

  return [...packages.values()].sort((a, b) => a.pkg.localeCompare(b.pkg));
}
