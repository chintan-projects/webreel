/**
 * Error types for the Demo Markdown parser and director module.
 *
 * ParseError includes source location information (line number, snippet)
 * to produce actionable error messages for script authors.
 *
 * Note: Director package has no dependency on @webreel/core, so
 * errors extend from a local base. The orchestrator layer handles
 * mapping to the WebReelError hierarchy.
 */

/**
 * Base error for the director module.
 */
export class DirectorError extends Error {
  public readonly code: string;

  constructor(
    message: string,
    options: { code: string; cause?: Error } = { code: "DIRECTOR_ERROR" },
  ) {
    super(message, { cause: options.cause });
    this.name = "DirectorError";
    this.code = options.code;
  }
}

/**
 * Error thrown when Demo Markdown parsing fails.
 * Includes line number and source snippet for actionable diagnostics.
 */
export class ParseError extends DirectorError {
  public readonly line?: number;
  public readonly column?: number;
  public readonly sourceSnippet?: string;
  public readonly suggestion?: string;

  constructor(
    message: string,
    options: {
      line?: number;
      column?: number;
      sourceSnippet?: string;
      suggestion?: string;
      cause?: Error;
    } = {},
  ) {
    const locationPrefix = options.line ? `Line ${options.line}: ` : "";
    super(`${locationPrefix}${message}`, { code: "PARSE_ERROR", cause: options.cause });
    this.name = "ParseError";
    this.line = options.line;
    this.column = options.column;
    this.sourceSnippet = options.sourceSnippet;
    this.suggestion = options.suggestion;
  }

  /** Format a human-readable error with context. */
  toDetailedString(): string {
    const parts = [this.message];
    if (this.sourceSnippet) {
      parts.push(`  Source: ${this.sourceSnippet}`);
    }
    if (this.suggestion) {
      parts.push(`  Suggestion: ${this.suggestion}`);
    }
    return parts.join("\n");
  }
}

/**
 * Error thrown when script validation fails (e.g., scene without surface,
 * unresolved dynamic references, invalid surface type).
 */
export class ValidationError extends DirectorError {
  public readonly errors: readonly ValidationIssue[];

  constructor(errors: readonly ValidationIssue[]) {
    const summary =
      errors.length === 1
        ? errors[0].message
        : `${errors.length} validation errors found`;
    super(summary, { code: "VALIDATION_ERROR" });
    this.name = "ValidationError";
    this.errors = errors;
  }
}

/** A single validation issue with location and severity. */
export interface ValidationIssue {
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly line?: number;
  readonly path?: string;
}

/**
 * Error thrown when LLM generation fails in authoring features.
 */
export class LLMError extends DirectorError {
  public readonly provider: string;

  constructor(provider: string, message: string, cause?: Error) {
    super(`LLM provider "${provider}": ${message}`, {
      code: "LLM_ERROR",
      cause,
    });
    this.name = "LLMError";
    this.provider = provider;
  }
}
