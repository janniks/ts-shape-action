#!/usr/bin/env node
/**
 * CLI entry point for public API surface analysis
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { discoverWorkspacePackages, filterPackages } from "./discovery.js";
import { resolveEntrypoints } from "./entrypoints.js";
import { analyzePackage, type ExportFact } from "./analyzer.js";
import { writeFactsToFile } from "./serializer.js";

interface CliOptions {
  root: string;
  output: string;
  debug: boolean;
  packages?: string;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    root: process.cwd(),
    output: "./public-api-output",
    debug: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--root":
      case "-r":
        options.root = args[++i] || options.root;
        break;
      case "--output":
      case "-o":
        options.output = args[++i] || options.output;
        break;
      case "--debug":
      case "-d":
        options.debug = true;
        break;
      case "--packages":
      case "-p":
        options.packages = args[++i];
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  // Resolve paths
  options.root = path.resolve(options.root);
  options.output = path.resolve(options.output);

  return options;
}

function printUsage(): void {
  console.log(`
Usage: ts-shape [options]

Analyze the public API surface of TypeScript packages in an npm workspace.

Options:
  --root, -r <path>       Repo root directory (default: current directory)
  --output, -o <path>     Output directory (default: ./public-api-output)
  --debug, -d             Also emit public-api.debug.jsonl
  --packages, -p <glob>   Filter to specific packages (e.g., "@acme/*")
  --help, -h              Show this help message

Output:
  Creates public-api.jsonl with one JSON array per line:
  [pkg, subpath, exportType, exportName, kind, shape]

Exit codes:
  0  Success
  1  Fatal error
`);
}

/**
 * Find tsconfig.json for a package
 */
function findTsConfig(pkgDir: string, rootDir: string): string | undefined {
  // First try package-local tsconfig
  const localTsConfig = path.join(pkgDir, "tsconfig.json");
  if (fs.existsSync(localTsConfig)) {
    return localTsConfig;
  }

  // Fall back to root tsconfig
  const rootTsConfig = path.join(rootDir, "tsconfig.json");
  if (fs.existsSync(rootTsConfig)) {
    return rootTsConfig;
  }

  return undefined;
}

/**
 * Create a TypeScript program for a package
 */
function createProgram(
  sourceFiles: string[],
  tsConfigPath: string | undefined
): ts.Program {
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    declaration: true,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    allowJs: true,
    resolveJsonModule: true,
  };

  if (tsConfigPath) {
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    if (!configFile.error) {
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsConfigPath)
      );
      compilerOptions = { ...compilerOptions, ...parsed.options };
    }
  }

  return ts.createProgram(sourceFiles, compilerOptions);
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return 0;
  }

  console.log(`Analyzing packages in: ${options.root}`);

  // Discover workspace packages
  let packages;
  try {
    packages = await discoverWorkspacePackages(options.root);
  } catch (error) {
    console.error(`Error discovering packages: ${error}`);
    return 1;
  }

  if (packages.length === 0) {
    console.warn("No packages found in workspace");
    return 0;
  }

  // Filter packages if specified
  if (options.packages) {
    packages = filterPackages(packages, options.packages);
    if (packages.length === 0) {
      console.warn(`No packages match filter: ${options.packages}`);
      return 0;
    }
  }

  console.log(`Found ${packages.length} package(s)`);

  const allFacts: ExportFact[] = [];
  let warnings = 0;

  for (const pkg of packages) {
    console.log(`  Analyzing: ${pkg.name}`);

    // Resolve entrypoints
    const entrypoints = resolveEntrypoints(pkg);

    if (entrypoints.length === 0) {
      console.warn(`    Warning: No entrypoints found for ${pkg.name}`);
      warnings++;
      continue;
    }

    // Find tsconfig
    const tsConfigPath = findTsConfig(pkg.dir, options.root);

    // Collect all source files
    const sourceFiles = entrypoints.map((e) => e.sourceFile);

    // Create TypeScript program
    let program: ts.Program;
    try {
      program = createProgram(sourceFiles, tsConfigPath);
    } catch (error) {
      console.warn(`    Warning: Failed to create program for ${pkg.name}: ${error}`);
      warnings++;
      continue;
    }

    // Analyze package
    const facts = analyzePackage(program, pkg.name, entrypoints);
    console.log(`    Found ${facts.length} export(s)`);
    allFacts.push(...facts);
  }

  // Write output
  const outputDir = options.output;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "public-api.jsonl");
  writeFactsToFile(allFacts, outputPath);
  console.log(`\nWritten ${allFacts.length} export facts to: ${outputPath}`);

  if (warnings > 0) {
    console.log(`\n${warnings} warning(s) occurred`);
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
