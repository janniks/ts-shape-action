#!/usr/bin/env node
/**
 * CLI for diffing public API surfaces
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { computeDiffFromFiles, hasChanges, groupByPackage } from "./diff.js";
import { formatDiffMarkdown, formatDiffJson } from "./reporter.js";

interface DiffCliOptions {
  baseDir: string;
  headDir: string;
  output: string;
  help: boolean;
}

function parseArgs(args: string[]): DiffCliOptions {
  const options: DiffCliOptions = {
    baseDir: "",
    headDir: "",
    output: "./diff",
    help: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--output" || arg === "-o") {
      const nextArg = args[++i];
      if (nextArg) {
        options.output = nextArg;
      }
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg && !arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const baseDir = positional[0];
  const headDir = positional[1];
  if (baseDir && headDir) {
    options.baseDir = path.resolve(baseDir);
    options.headDir = path.resolve(headDir);
  }

  options.output = path.resolve(options.output);

  return options;
}

function printUsage(): void {
  console.log(`
Usage: ts-shape-diff <base-dir> <head-dir> [options]

Compare public API surfaces between base and head.

Arguments:
  base-dir    Directory containing base public-api.jsonl
  head-dir    Directory containing head public-api.jsonl

Options:
  --output, -o <path>   Output directory for diff results (default: ./diff)
  --help, -h            Show this help message

Output:
  Creates diff.md and diff.json in the output directory.

Exit codes:
  0  No changes detected
  1  Fatal error
  2  Changes detected (for use in CI)
`);
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return 0;
  }

  if (!options.baseDir || !options.headDir) {
    console.error("Error: Both base and head directories are required");
    printUsage();
    return 1;
  }

  const baseFile = path.join(options.baseDir, "public-api.jsonl");
  const headFile = path.join(options.headDir, "public-api.jsonl");

  if (!fs.existsSync(baseFile)) {
    console.error(`Error: Base file not found: ${baseFile}`);
    return 1;
  }

  if (!fs.existsSync(headFile)) {
    console.error(`Error: Head file not found: ${headFile}`);
    return 1;
  }

  console.log(`Comparing:`);
  console.log(`  Base: ${baseFile}`);
  console.log(`  Head: ${headFile}`);

  // Compute diff
  const diff = computeDiffFromFiles(baseFile, headFile);

  // Create output directory
  if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
  }

  // Write markdown report
  const markdown = formatDiffMarkdown(diff);
  const mdPath = path.join(options.output, "diff.md");
  fs.writeFileSync(mdPath, markdown, "utf-8");

  // Write JSON report
  const json = formatDiffJson(diff);
  const jsonPath = path.join(options.output, "diff.json");
  fs.writeFileSync(jsonPath, json, "utf-8");

  console.log(`\nOutput written to: ${options.output}`);
  console.log(`  - diff.md`);
  console.log(`  - diff.json`);

  // Print summary
  console.log(`\nSummary:`);
  console.log(`  Packages affected: ${diff.summary.packagesAffected}`);
  console.log(`  Added: ${diff.summary.totalAdded}`);
  console.log(`  Removed: ${diff.summary.totalRemoved}`);
  console.log(`  Changed: ${diff.summary.totalChanged}`);

  // Return 2 if there are changes (for CI use)
  return hasChanges(diff) ? 2 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
