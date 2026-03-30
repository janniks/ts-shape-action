/**
 * Type shape extraction using TypeScript compiler API
 */

import * as ts from "typescript";
import type { ExportKind } from "./analyzer.js";

/**
 * Type format flags for consistent output
 */
export const TYPE_FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.WriteClassExpressionAsTypeLiteral |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

/**
 * Get shape strings for a symbol
 * Returns multiple strings for overloaded functions
 */
export function getShapes(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  kind: ExportKind
): string[] {
  const declarations = symbol.getDeclarations();
  const decl = declarations?.[0];
  if (!decl) {
    return [normalizeWhitespace(symbol.getName())];
  }

  switch (kind) {
    case "function":
      return getFunctionShapes(checker, symbol, decl);
    case "class":
      return getClassShapes(checker, symbol, decl);
    case "interface":
      return getInterfaceShapes(checker, symbol, decl);
    case "type":
      return getTypeAliasShapes(checker, symbol, decl);
    case "enum":
      return getEnumShapes(symbol);
    case "namespace":
      return ["namespace"];
    case "value":
      return getValueShapes(checker, symbol, decl);
    default:
      return [
        normalizeWhitespace(
          checker.typeToString(checker.getTypeAtLocation(decl))
        ),
      ];
  }
}

/**
 * Get shapes for a function (handles overloads)
 */
export function getFunctionShapes(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  decl: ts.Declaration
): string[] {
  const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
  const signatures = type.getCallSignatures();

  if (signatures.length === 0) {
    // Fallback to type string
    return [normalizeWhitespace(checker.typeToString(type))];
  }

  return signatures.map((sig) => formatCallSignature(checker, sig, decl));
}

/**
 * Format a call signature as a string
 */
export function formatCallSignature(
  checker: ts.TypeChecker,
  sig: ts.Signature,
  contextDecl: ts.Declaration
): string {
  const params = sig.parameters
    .map((p) => formatParameter(checker, p, contextDecl))
    .join(", ");

  const returnType = checker.typeToString(
    sig.getReturnType(),
    contextDecl,
    TYPE_FORMAT_FLAGS
  );

  return normalizeWhitespace(`(${params}) => ${returnType}`);
}

/**
 * Format a parameter
 */
function formatParameter(
  checker: ts.TypeChecker,
  param: ts.Symbol,
  contextDecl: ts.Declaration
): string {
  const paramType = checker.getTypeOfSymbolAtLocation(param, contextDecl);
  const optional = isOptionalParameter(param);
  const paramStr = checker.typeToString(
    paramType,
    contextDecl,
    TYPE_FORMAT_FLAGS
  );
  return `${param.getName()}${optional ? "?" : ""}: ${paramStr}`;
}

/**
 * Check if a parameter is optional
 */
function isOptionalParameter(param: ts.Symbol): boolean {
  if (param.flags & ts.SymbolFlags.Optional) {
    return true;
  }

  const decl = param.valueDeclaration;
  if (decl && ts.isParameter(decl)) {
    return !!decl.questionToken || !!decl.initializer;
  }

  return false;
}

/**
 * Get shapes for a class
 */
export function getClassShapes(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  decl: ts.Declaration
): string[] {
  const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
  const shapes: string[] = [];
  const className = symbol.getName();

  // Get constructors
  const constructSignatures = type.getConstructSignatures();
  for (const sig of constructSignatures) {
    const params = sig.parameters
      .map((p) => formatParameter(checker, p, decl))
      .join(", ");
    shapes.push(normalizeWhitespace(`new (${params}) => ${className}`));
  }

  // If no explicit constructors, add default
  if (constructSignatures.length === 0) {
    shapes.push(normalizeWhitespace(`new () => ${className}`));
  }

  // Get instance members
  const instanceType = checker.getDeclaredTypeOfSymbol(symbol);
  const instanceMembers = getClassMembers(checker, instanceType, decl, false);
  shapes.push(...instanceMembers);

  // Get static members
  const staticMembers = getClassMembers(checker, type, decl, true);
  shapes.push(...staticMembers);

  return shapes.length > 0
    ? shapes
    : [normalizeWhitespace(`class ${className}`)];
}

/**
 * Get class members (instance or static)
 */
function getClassMembers(
  checker: ts.TypeChecker,
  type: ts.Type,
  decl: ts.Declaration,
  isStatic: boolean
): string[] {
  const members: string[] = [];
  const prefix = isStatic ? "static " : "";

  const properties = type.getProperties();
  const memberInfos: Array<{ name: string; shape: string }> = [];

  for (const prop of properties) {
    // Skip private/protected members
    const propDecl = prop.getDeclarations()?.[0];
    if (propDecl) {
      const modifiers = ts.getCombinedModifierFlags(propDecl);
      if (
        modifiers & ts.ModifierFlags.Private ||
        modifiers & ts.ModifierFlags.Protected
      ) {
        continue;
      }
    }

    const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
    const name = prop.getName();

    // Skip internal properties
    if (name.startsWith("_") || name.startsWith("#")) {
      continue;
    }

    // Check if it's a method
    const callSigs = propType.getCallSignatures();
    if (callSigs.length > 0) {
      for (const sig of callSigs) {
        const params = sig.parameters
          .map((p) => formatParameter(checker, p, decl))
          .join(", ");

        const returnType = checker.typeToString(
          sig.getReturnType(),
          decl,
          TYPE_FORMAT_FLAGS
        );

        memberInfos.push({
          name,
          shape: normalizeWhitespace(
            `${prefix}${name}(${params}): ${returnType}`
          ),
        });
      }
    } else {
      // Property
      const typeStr = checker.typeToString(propType, decl, TYPE_FORMAT_FLAGS);
      memberInfos.push({
        name,
        shape: normalizeWhitespace(`${prefix}${name}: ${typeStr}`),
      });
    }
  }

  // Sort members by name
  memberInfos.sort((a, b) => a.name.localeCompare(b.name));
  members.push(...memberInfos.map((m) => m.shape));

  return members;
}

/**
 * Get shapes for an interface
 */
export function getInterfaceShapes(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  decl: ts.Declaration
): string[] {
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const typeStr = checker.typeToString(type, decl, TYPE_FORMAT_FLAGS);
  return [normalizeWhitespace(typeStr)];
}

/**
 * Get shapes for a type alias
 */
export function getTypeAliasShapes(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  decl: ts.Declaration
): string[] {
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const typeStr = checker.typeToString(type, decl, TYPE_FORMAT_FLAGS);
  return [normalizeWhitespace(typeStr)];
}

/**
 * Get shapes for an enum
 */
export function getEnumShapes(symbol: ts.Symbol): string[] {
  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) {
    return [symbol.getName()];
  }

  const members: string[] = [];
  for (const decl of declarations) {
    if (ts.isEnumDeclaration(decl)) {
      for (const member of decl.members) {
        const name = member.name.getText();
        if (member.initializer && ts.isNumericLiteral(member.initializer)) {
          members.push(`${name} = ${member.initializer.text}`);
        } else if (
          member.initializer &&
          ts.isStringLiteral(member.initializer)
        ) {
          members.push(`${name} = "${member.initializer.text}"`);
        } else {
          members.push(name);
        }
      }
    }
  }

  if (members.length === 0) {
    return [symbol.getName()];
  }

  return [normalizeWhitespace(`{ ${members.join(", ")} }`)];
}

/**
 * Get shapes for a value (const/let/var)
 */
export function getValueShapes(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  decl: ts.Declaration
): string[] {
  const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
  const typeStr = checker.typeToString(type, decl, TYPE_FORMAT_FLAGS);
  return [normalizeWhitespace(typeStr)];
}

/**
 * Normalize whitespace in a string
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

/**
 * Determine the kind of a symbol
 */
export function getSymbolKind(
  symbol: ts.Symbol,
  checker?: ts.TypeChecker
): ExportKind {
  const flags = symbol.flags;

  if (flags & ts.SymbolFlags.Function) {
    return "function";
  }
  if (flags & ts.SymbolFlags.Class) {
    return "class";
  }
  if (flags & ts.SymbolFlags.Interface) {
    return "interface";
  }
  if (flags & ts.SymbolFlags.TypeAlias) {
    return "type";
  }
  if (flags & ts.SymbolFlags.Enum) {
    return "enum";
  }
  if (flags & ts.SymbolFlags.Module) {
    return "namespace";
  }
  if (
    flags & ts.SymbolFlags.Variable ||
    flags & ts.SymbolFlags.BlockScopedVariable
  ) {
    // Check if variable is a function type
    if (checker) {
      const decl = symbol.getDeclarations()?.[0];
      if (decl) {
        const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
        if (
          type.getCallSignatures().length > 0 &&
          !type.getConstructSignatures().length
        ) {
          return "function";
        }
      }
    }
    return "value";
  }

  return "value";
}
