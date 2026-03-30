/**
 * JSONL serialization for export facts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExportFact, ExportFactDebug } from "./analyzer.js";

export type Tuple = [
  pkg: string,
  subpath: string,
  exportType: string,
  exportName: string,
  kind: string,
  shape: string
];

export type TupleWithDebug = [
  pkg: string,
  subpath: string,
  exportType: string,
  exportName: string,
  kind: string,
  shape: string,
  debug?: { declFile?: string; viaEntrypoint?: string }
];

/**
 * Convert an ExportFact to a tuple
 */
export function factToTuple(fact: ExportFact): Tuple {
  return [
    fact.pkg,
    fact.subpath,
    fact.exportType,
    fact.exportName,
    fact.kind,
    fact.shape,
  ];
}

/**
 * Convert a tuple back to an ExportFact
 */
export function tupleToFact(tuple: Tuple): ExportFact {
  return {
    pkg: tuple[0],
    subpath: tuple[1],
    exportType: tuple[2] as "named" | "default",
    exportName: tuple[3],
    kind: tuple[4] as ExportFact["kind"],
    shape: tuple[5],
  };
}

/**
 * Compare two tuples for sorting
 */
export function compareTuples(a: Tuple, b: Tuple): number {
  for (let i = 0; i < 6; i++) {
    const aVal = a[i] ?? "";
    const bVal = b[i] ?? "";
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

/**
 * Sort tuples lexicographically on all 6 fields
 */
export function sortTuples(tuples: Tuple[]): Tuple[] {
  return [...tuples].sort(compareTuples);
}

/**
 * Serialize export facts to JSONL format
 */
export function serialize(facts: ExportFact[]): string {
  const tuples = facts.map(factToTuple);
  const sorted = sortTuples(tuples);
  return sorted.map((t) => JSON.stringify(t)).join("\n");
}

/**
 * Serialize export facts with debug info to JSONL format
 */
export function serializeWithDebug(facts: ExportFactDebug[]): string {
  const tuples: TupleWithDebug[] = facts.map((f) => {
    const base: Tuple = [
      f.pkg,
      f.subpath,
      f.exportType,
      f.exportName,
      f.kind,
      f.shape,
    ];
    if (f.debug) {
      return [...base, f.debug] as TupleWithDebug;
    }
    return base as TupleWithDebug;
  });

  // Sort by first 6 fields
  tuples.sort((a, b) => {
    for (let i = 0; i < 6; i++) {
      const aVal = a[i] as string;
      const bVal = b[i] as string;
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    return 0;
  });

  return tuples.map((t) => JSON.stringify(t)).join("\n");
}

/**
 * Parse JSONL content back to tuples
 */
export function parseTuples(content: string): Tuple[] {
  const lines = content.trim().split("\n");
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const parsed = JSON.parse(line);
      // Handle both tuple arrays and the debug format
      if (Array.isArray(parsed) && parsed.length >= 6) {
        return [
          parsed[0],
          parsed[1],
          parsed[2],
          parsed[3],
          parsed[4],
          parsed[5],
        ] as Tuple;
      }
      throw new Error(`Invalid tuple format: ${line}`);
    });
}

/**
 * Parse JSONL content back to ExportFacts
 */
export function parseFacts(content: string): ExportFact[] {
  return parseTuples(content).map(tupleToFact);
}

/**
 * Write facts to a JSONL file
 */
export function writeFactsToFile(
  facts: ExportFact[],
  outputPath: string
): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = serialize(facts);
  fs.writeFileSync(outputPath, content + "\n", "utf-8");
}

/**
 * Write facts with debug info to a JSONL file
 */
export function writeDebugFactsToFile(
  facts: ExportFactDebug[],
  outputPath: string
): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = serializeWithDebug(facts);
  fs.writeFileSync(outputPath, content + "\n", "utf-8");
}

/**
 * Read facts from a JSONL file
 */
export function readFactsFromFile(filePath: string): ExportFact[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return parseFacts(content);
}

/**
 * Read tuples from a JSONL file
 */
export function readTuplesFromFile(filePath: string): Tuple[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return parseTuples(content);
}
