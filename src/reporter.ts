/**
 * Report generation for API surface diffs
 */

import type { DiffResult, ChangedExport, PackageDiff } from "./diff.js";
import { groupByPackage, hasChanges, recommendedSemver } from "./diff.js";
import type { ExportFact } from "./analyzer.js";

/**
 * Format a diff result as a GitHub PR comment (markdown with HTML details)
 */
export function formatDiffMarkdown(diff: DiffResult): string {
  const lines: string[] = [];

  lines.push("## Public API Surface Changes");
  lines.push("");

  // Summary line
  const { summary } = diff;
  if (!hasChanges(diff)) {
    lines.push("No changes detected in the public API surface.");
    return lines.join("\n");
  }

  const parts: string[] = [];
  parts.push(
    `**${summary.packagesAffected}** package${
      summary.packagesAffected !== 1 ? "s" : ""
    } affected`
  );
  if (summary.totalAdded > 0) {
    parts.push(`**+${summary.totalAdded}** added`);
  }
  if (summary.totalRemoved > 0) {
    parts.push(`**-${summary.totalRemoved}** removed`);
  }
  if (summary.totalChanged > 0) {
    parts.push(`**~${summary.totalChanged}** changed`);
  }

  lines.push(parts.join(" · "));
  lines.push("");

  // Per-package details in collapsible sections
  const packageDiffs = groupByPackage(diff);

  for (const pkgDiff of packageDiffs) {
    const pkgStats = getPackageStats(pkgDiff);

    lines.push(`<details>`);
    lines.push(
      `<summary><strong>${pkgDiff.pkg}</strong> ${pkgStats}</summary>`
    );
    lines.push("");

    if (pkgDiff.added.length > 0) {
      lines.push("#### Added");
      lines.push("");
      lines.push("```diff");
      for (const fact of pkgDiff.added) {
        lines.push(formatExportDiff(fact, "+"));
      }
      lines.push("```");
      lines.push("");
    }

    if (pkgDiff.removed.length > 0) {
      lines.push("#### Removed");
      lines.push("");
      lines.push("```diff");
      for (const fact of pkgDiff.removed) {
        lines.push(formatExportDiff(fact, "-"));
      }
      lines.push("```");
      lines.push("");
    }

    if (pkgDiff.changed.length > 0) {
      lines.push("#### Changed");
      lines.push("");
      for (const change of pkgDiff.changed) {
        lines.push(formatChangedExport(change));
      }
      lines.push("");
    }

    lines.push("</details>");
    lines.push("");
  }

  // Full diff in a nested collapsible
  lines.push("<details>");
  lines.push("<summary>View full JSONL diff</summary>");
  lines.push("");
  lines.push("```diff");

  for (const fact of diff.removed) {
    const tuple = JSON.stringify([
      fact.pkg,
      fact.subpath,
      fact.exportType,
      fact.exportName,
      fact.kind,
      fact.shape,
    ]);
    lines.push(`- ${tuple}`);
  }
  for (const fact of diff.added) {
    const tuple = JSON.stringify([
      fact.pkg,
      fact.subpath,
      fact.exportType,
      fact.exportName,
      fact.kind,
      fact.shape,
    ]);
    lines.push(`+ ${tuple}`);
  }
  for (const change of diff.changed) {
    const baseKey = JSON.stringify(change.identity);
    // Show removed shapes
    for (const shape of change.baseShapes) {
      if (!change.headShapes.includes(shape)) {
        const tuple = JSON.stringify([...change.identity, shape]);
        lines.push(`- ${tuple}`);
      }
    }
    // Show added shapes
    for (const shape of change.headShapes) {
      if (!change.baseShapes.includes(shape)) {
        const tuple = JSON.stringify([...change.identity, shape]);
        lines.push(`+ ${tuple}`);
      }
    }
  }

  lines.push("```");
  lines.push("");
  lines.push("</details>");

  return lines.join("\n");
}

/**
 * Get stats string for a package
 */
function getPackageStats(pkgDiff: PackageDiff): string {
  const parts: string[] = [];
  if (pkgDiff.added.length > 0) {
    parts.push(`+${pkgDiff.added.length}`);
  }
  if (pkgDiff.removed.length > 0) {
    parts.push(`-${pkgDiff.removed.length}`);
  }
  if (pkgDiff.changed.length > 0) {
    parts.push(`~${pkgDiff.changed.length}`);
  }
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

/**
 * Format a single export fact for diff display
 */
function formatExportDiff(fact: ExportFact, prefix: string): string {
  const subpathPart = fact.subpath === "." ? "" : ` [${fact.subpath}]`;
  return `${prefix} ${fact.exportName}${subpathPart}: ${fact.kind} = ${fact.shape}`;
}

/**
 * Format a changed export showing old and new shapes
 */
function formatChangedExport(change: ChangedExport): string {
  const lines: string[] = [];
  const [pkg, subpath, exportType, name, kind] = change.identity;
  const subpathPart = subpath === "." ? "" : ` [${subpath}]`;

  // Find removed shapes (in base but not in head)
  const removedShapes = change.baseShapes.filter(
    (s) => !change.headShapes.includes(s)
  );
  // Find added shapes (in head but not in base)
  const addedShapes = change.headShapes.filter(
    (s) => !change.baseShapes.includes(s)
  );

  lines.push(`**\`${name}\`**${subpathPart} (${kind})`);
  lines.push("");
  lines.push("```diff");
  for (const shape of removedShapes) {
    lines.push(`- ${shape}`);
  }
  for (const shape of addedShapes) {
    lines.push(`+ ${shape}`);
  }
  lines.push("```");

  return lines.join("\n");
}

/**
 * Format a diff result as JSON
 */
export function formatDiffJson(diff: DiffResult): string {
  const output = {
    summary: diff.summary,
    added: diff.added.map((f) => ({
      pkg: f.pkg,
      subpath: f.subpath,
      exportType: f.exportType,
      name: f.exportName,
      kind: f.kind,
      shape: f.shape,
    })),
    removed: diff.removed.map((f) => ({
      pkg: f.pkg,
      subpath: f.subpath,
      exportType: f.exportType,
      name: f.exportName,
      kind: f.kind,
      shape: f.shape,
    })),
    changed: diff.changed.map((c) => ({
      pkg: c.identity[0],
      subpath: c.identity[1],
      exportType: c.identity[2],
      name: c.identity[3],
      kind: c.identity[4],
      baseShapes: c.baseShapes,
      headShapes: c.headShapes,
    })),
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Generate a compact summary for GitHub Actions output
 */
export function formatSummaryLine(diff: DiffResult): string {
  if (!hasChanges(diff)) {
    return "No API changes detected";
  }

  const parts: string[] = [];
  if (diff.summary.totalAdded > 0) {
    parts.push(`+${diff.summary.totalAdded}`);
  }
  if (diff.summary.totalRemoved > 0) {
    parts.push(`-${diff.summary.totalRemoved}`);
  }
  if (diff.summary.totalChanged > 0) {
    parts.push(`~${diff.summary.totalChanged}`);
  }

  return `API changes: ${parts.join(", ")} in ${
    diff.summary.packagesAffected
  } package(s)`;
}

/**
 * Generate GitHub Actions step outputs
 */
export function generateActionOutputs(
  diff: DiffResult
): Record<string, string> {
  return {
    "has-changes": hasChanges(diff) ? "true" : "false",
    "packages-affected": String(diff.summary.packagesAffected),
    "exports-added": String(diff.summary.totalAdded),
    "exports-removed": String(diff.summary.totalRemoved),
    "exports-changed": String(diff.summary.totalChanged),
    semver: recommendedSemver(diff),
    summary: formatSummaryLine(diff),
  };
}
