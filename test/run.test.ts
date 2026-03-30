/**
 * Integration tests for ts-shape-action
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(ROOT, "fixtures");
const TEST_OUTPUT = path.join(ROOT, ".test-output");

function run(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8" });
}

function runDiff(baseDir: string, headDir: string, outputDir: string): { exitCode: number; stdout: string } {
  try {
    const stdout = execSync(
      `node dist/diff-cli.js "${baseDir}" "${headDir}" --output "${outputDir}"`,
      { cwd: ROOT, encoding: "utf-8" }
    );
    return { exitCode: 0, stdout };
  } catch (e: any) {
    return { exitCode: e.status, stdout: e.stdout || "" };
  }
}

beforeAll(() => {
  // Build the project
  run("npm run build");
  
  // Clean and create test output directory
  if (fs.existsSync(TEST_OUTPUT)) {
    fs.rmSync(TEST_OUTPUT, { recursive: true });
  }
  fs.mkdirSync(TEST_OUTPUT, { recursive: true });
  
  // Run analyzer on fixtures once
  run(`node dist/index.js --root "${FIXTURES}" --output "${TEST_OUTPUT}/api"`);
});

afterAll(() => {
  // Cleanup
  if (fs.existsSync(TEST_OUTPUT)) {
    fs.rmSync(TEST_OUTPUT, { recursive: true });
  }
});

describe("Analyzer", () => {
  it("creates public-api.jsonl file", () => {
    const jsonlPath = path.join(TEST_OUTPUT, "api", "public-api.jsonl");
    expect(fs.existsSync(jsonlPath)).toBe(true);
  });

  it("outputs valid JSONL with 6-element tuples", () => {
    const jsonlPath = path.join(TEST_OUTPUT, "api", "public-api.jsonl");
    const content = fs.readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(6);
    }
  });

  it("outputs lines sorted lexicographically", () => {
    const jsonlPath = path.join(TEST_OUTPUT, "api", "public-api.jsonl");
    const content = fs.readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n");
    const sorted = [...lines].sort();
    
    expect(lines).toEqual(sorted);
  });

  describe("@fixtures/simple-pkg", () => {
    it("captures exported function", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"@fixtures/simple-pkg"');
      expect(content).toContain('"greet"');
      expect(content).toContain('"function"');
    });

    it("captures exported const", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"VERSION"');
      expect(content).toContain('"value"');
    });

    it("captures exported type", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"Config"');
      expect(content).toContain('"type"');
    });

    it("captures exported interface", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"User"');
      expect(content).toContain('"interface"');
    });

    it("captures exported enum", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"Status"');
      expect(content).toContain('"enum"');
    });

    it("does NOT capture internal symbols", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).not.toContain('"internalHelper"');
      expect(content).not.toContain('"internalConfig"');
    });
  });

  describe("@fixtures/re-export-pkg", () => {
    it("captures star re-exports from utils.ts", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"@fixtures/re-export-pkg"');
      expect(content).toContain('"trim"');
      expect(content).toContain('"capitalize"');
    });

    it("captures renamed re-export", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"parseInput"');
    });

    it("captures namespace re-export", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"internal"');
      expect(content).toContain('"namespace"');
    });
  });

  describe("@fixtures/multi-entry-pkg", () => {
    it("captures main entrypoint exports", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('["@fixtures/multi-entry-pkg",".","named","doSomething"');
    });

    it("captures ./utils entrypoint exports", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('["@fixtures/multi-entry-pkg","./utils","named","delay"');
      expect(content).toContain('["@fixtures/multi-entry-pkg","./utils","named","retry"');
    });

    it("captures ./types entrypoint exports", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('["@fixtures/multi-entry-pkg","./types","named","Result"');
      expect(content).toContain('["@fixtures/multi-entry-pkg","./types","named","Identifiable"');
    });
  });

  describe("@fixtures/overloads-pkg", () => {
    it("captures multiple overloads as separate lines", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      const lines = content.split("\n");
      
      const formatLines = lines.filter(
        (l) => l.includes('"@fixtures/overloads-pkg"') && l.includes('"format"')
      );
      
      // format has 4 overloads: (number), (number, decimals), (Date), (Date, locale)
      expect(formatLines.length).toBeGreaterThanOrEqual(4);
    });

    it("captures parse overloads", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      const lines = content.split("\n");
      
      const parseLines = lines.filter(
        (l) => l.includes('"@fixtures/overloads-pkg"') && l.includes('"parse"')
      );
      
      expect(parseLines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("@fixtures/cyclic-a", () => {
    it("handles cyclic re-exports without infinite loop", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"@fixtures/cyclic-a"');
      expect(content).toContain('"funcA"');
      expect(content).toContain('"funcB"');
      expect(content).toContain('"TypeA"');
      expect(content).toContain('"TypeB"');
    });
  });

  describe("@fixtures/class-pkg", () => {
    it("captures class constructor", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"BaseEntity"');
      expect(content).toContain('"class"');
      expect(content).toContain('new (');
    });

    it("captures class public methods", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"getId()');
      expect(content).toContain('"getData(');
    });

    it("captures static members", () => {
      const content = fs.readFileSync(path.join(TEST_OUTPUT, "api", "public-api.jsonl"), "utf-8");
      expect(content).toContain('"static ADMIN_ROLE');
      expect(content).toContain('"static createAdmin');
    });
  });
});

describe("Diff", () => {
  it("shows no changes for identical files", () => {
    fs.cpSync(
      path.join(TEST_OUTPUT, "api"),
      path.join(TEST_OUTPUT, "api-copy"),
      { recursive: true }
    );

    const result = runDiff(
      path.join(TEST_OUTPUT, "api"),
      path.join(TEST_OUTPUT, "api-copy"),
      path.join(TEST_OUTPUT, "diff-same")
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Packages affected: 0");
  });

  it("detects added exports (exit code 2)", () => {
    const apiPath = path.join(TEST_OUTPUT, "api", "public-api.jsonl");
    const content = fs.readFileSync(apiPath, "utf-8");

    const modifiedContent =
      content + '["@fixtures/simple-pkg",".","named","newExport","function","() => void"]\n';

    fs.mkdirSync(path.join(TEST_OUTPUT, "api-added"), { recursive: true });
    fs.writeFileSync(
      path.join(TEST_OUTPUT, "api-added", "public-api.jsonl"),
      modifiedContent
    );

    const result = runDiff(
      path.join(TEST_OUTPUT, "api"),
      path.join(TEST_OUTPUT, "api-added"),
      path.join(TEST_OUTPUT, "diff-added")
    );

    expect(result.exitCode).toBe(2);

    const diffJson = JSON.parse(
      fs.readFileSync(path.join(TEST_OUTPUT, "diff-added", "diff.json"), "utf-8")
    );
    expect(diffJson.summary.totalAdded).toBe(1);
  });

  it("detects removed exports (exit code 2)", () => {
    const apiPath = path.join(TEST_OUTPUT, "api", "public-api.jsonl");
    const content = fs.readFileSync(apiPath, "utf-8");
    const lines = content.trim().split("\n");

    // Remove all 'greet' function lines
    const filteredLines = lines.filter((line) => !line.includes('"greet"'));
    const modifiedContent = filteredLines.join("\n") + "\n";

    fs.mkdirSync(path.join(TEST_OUTPUT, "api-removed"), { recursive: true });
    fs.writeFileSync(
      path.join(TEST_OUTPUT, "api-removed", "public-api.jsonl"),
      modifiedContent
    );

    const result = runDiff(
      path.join(TEST_OUTPUT, "api"),
      path.join(TEST_OUTPUT, "api-removed"),
      path.join(TEST_OUTPUT, "diff-removed")
    );

    expect(result.exitCode).toBe(2);

    const diffJson = JSON.parse(
      fs.readFileSync(path.join(TEST_OUTPUT, "diff-removed", "diff.json"), "utf-8")
    );
    expect(diffJson.summary.totalRemoved).toBeGreaterThanOrEqual(1);
  });

  it("detects changed exports (exit code 2)", () => {
    const apiPath = path.join(TEST_OUTPUT, "api", "public-api.jsonl");
    const content = fs.readFileSync(apiPath, "utf-8");

    // Modify the greet function signature
    const modifiedContent = content.replace(
      '(name: string) => string',
      '(name: string, greeting?: string) => string'
    );

    fs.mkdirSync(path.join(TEST_OUTPUT, "api-changed"), { recursive: true });
    fs.writeFileSync(
      path.join(TEST_OUTPUT, "api-changed", "public-api.jsonl"),
      modifiedContent
    );

    const result = runDiff(
      path.join(TEST_OUTPUT, "api"),
      path.join(TEST_OUTPUT, "api-changed"),
      path.join(TEST_OUTPUT, "diff-changed")
    );

    expect(result.exitCode).toBe(2);

    const diffJson = JSON.parse(
      fs.readFileSync(path.join(TEST_OUTPUT, "diff-changed", "diff.json"), "utf-8")
    );
    expect(diffJson.summary.totalChanged).toBeGreaterThanOrEqual(1);
  });

  it("generates markdown report with collapsible sections", () => {
    const mdPath = path.join(TEST_OUTPUT, "diff-added", "diff.md");
    expect(fs.existsSync(mdPath)).toBe(true);

    const content = fs.readFileSync(mdPath, "utf-8");
    expect(content).toContain("## Public API Surface Changes");
    expect(content).toContain("<details>");
    expect(content).toContain("<summary>");
  });

  it("generates valid JSON report", () => {
    const jsonPath = path.join(TEST_OUTPUT, "diff-added", "diff.json");
    expect(fs.existsSync(jsonPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    expect(data).toHaveProperty("summary");
    expect(data).toHaveProperty("added");
    expect(data).toHaveProperty("removed");
    expect(data).toHaveProperty("changed");
    expect(Array.isArray(data.added)).toBe(true);
  });
});

describe("CLI", () => {
  it("analyzer --help shows usage", () => {
    const output = run("node dist/index.js --help");
    expect(output).toContain("Usage:");
    expect(output).toContain("--root");
    expect(output).toContain("--output");
    expect(output).toContain("--packages");
  });

  it("diff --help shows usage", () => {
    const output = run("node dist/diff-cli.js --help");
    expect(output).toContain("Usage:");
    expect(output).toContain("base-dir");
    expect(output).toContain("head-dir");
  });

  it("analyzer accepts --packages filter", () => {
    const output = run(
      `node dist/index.js --root "${FIXTURES}" --output "${TEST_OUTPUT}/filtered" --packages "@fixtures/simple-*"`
    );
    expect(output).toContain("Found 1 package");
    expect(output).toContain("@fixtures/simple-pkg");
  });
});
