/**
 * Export graph traversal and analysis
 */

import * as ts from "typescript";
import { getShapes, getSymbolKind } from "./shapes.js";

export type ExportKind =
  | "function"
  | "class"
  | "value"
  | "type"
  | "interface"
  | "enum"
  | "namespace";

export type ExportType = "named" | "default";

export interface ExportFact {
  /** Package name */
  pkg: string;
  /** Subpath like "." or "./utils" */
  subpath: string;
  /** Whether this is a named or default export */
  exportType: ExportType;
  /** Export name (or "default" for default exports) */
  exportName: string;
  /** Kind of the exported symbol */
  kind: ExportKind;
  /** Type shape string */
  shape: string;
}

export interface ExportFactDebug extends ExportFact {
  /** Debug info */
  debug?: {
    declFile?: string;
    viaEntrypoint?: string;
  };
}

interface ResolvedExport {
  name: string;
  exportType: ExportType;
  symbol: ts.Symbol;
  kind: ExportKind;
}

/**
 * Analyze a TypeScript program and extract export facts for a package
 */
export function analyzePackage(
  program: ts.Program,
  pkgName: string,
  entrypoints: Array<{ subpath: string; sourceFile: string }>
): ExportFact[] {
  const checker = program.getTypeChecker();
  const facts: ExportFact[] = [];

  for (const { subpath, sourceFile } of entrypoints) {
    const sourceFileNode = program.getSourceFile(sourceFile);
    if (!sourceFileNode) {
      console.warn(`Warning: Could not find source file ${sourceFile}`);
      continue;
    }

    const exports = collectExports(program, checker, sourceFileNode, new Set());

    for (const exp of exports) {
      const shapes = getShapes(checker, exp.symbol, exp.kind);
      for (const shape of shapes) {
        facts.push({
          pkg: pkgName,
          subpath,
          exportType: exp.exportType,
          exportName: exp.name,
          kind: exp.kind,
          shape,
        });
      }
    }
  }

  return facts;
}

/**
 * Collect all exports from a source file, following re-exports
 */
function collectExports(
  program: ts.Program,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  visited: Set<string>
): ResolvedExport[] {
  const filePath = sourceFile.fileName;

  // Prevent cycles
  if (visited.has(filePath)) {
    return [];
  }
  visited.add(filePath);

  const exports: ResolvedExport[] = [];
  const seenNames = new Set<string>();

  // Get module symbol and its exports
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    return exports;
  }

  // Process all exports from the module
  const exportedSymbols = checker.getExportsOfModule(moduleSymbol);

  for (const symbol of exportedSymbols) {
    const name = symbol.getName();

    // Skip duplicates (can happen with re-exports)
    if (seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);

    // Resolve aliased symbols
    const resolvedSymbol = resolveAlias(checker, symbol);
    if (!resolvedSymbol) {
      continue;
    }

    const kind = getSymbolKind(resolvedSymbol, checker);
    const exportType: ExportType = name === "default" ? "default" : "named";

    exports.push({
      name,
      exportType,
      symbol: resolvedSymbol,
      kind,
    });
  }

  return exports;
}

/**
 * Resolve an alias symbol to its target
 */
function resolveAlias(
  checker: ts.TypeChecker,
  symbol: ts.Symbol
): ts.Symbol | null {
  try {
    // Follow alias chain
    if (symbol.flags & ts.SymbolFlags.Alias) {
      const aliased = checker.getAliasedSymbol(symbol);
      if (aliased && aliased !== symbol) {
        return aliased;
      }
    }
    return symbol;
  } catch {
    return symbol;
  }
}
