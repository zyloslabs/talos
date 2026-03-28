/**
 * Code Validator
 *
 * Validates generated test code before execution.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ValidationResult = {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
};

export type ValidationError = {
  line?: number;
  column?: number;
  message: string;
  code: string;
};

export type ValidationWarning = {
  line?: number;
  column?: number;
  message: string;
  code: string;
};

export type ValidationOptions = {
  strictMode?: boolean;
  allowUnusedVariables?: boolean;
  checkPlaywrightAPIs?: boolean;
  maxCodeLength?: number;
};

// ── Validation Rules ──────────────────────────────────────────────────────────

const BANNED_PATTERNS = [
  { pattern: /eval\s*\(/g, message: "Use of eval() is not allowed", code: "no-eval" },
  {
    pattern: /Function\s*\(/g,
    message: "Dynamic Function constructor is not allowed",
    code: "no-function-constructor",
  },
  { pattern: /require\s*\(/g, message: "Use ES imports instead of require()", code: "no-require" },
  { pattern: /process\.exit/g, message: "process.exit() should not be used in tests", code: "no-process-exit" },
  { pattern: /child_process/g, message: "child_process module is not allowed", code: "no-child-process" },
  {
    pattern: /fs\.(unlink|rmdir|rm)\s*\(/g,
    message: "File deletion is not allowed in tests",
    code: "no-file-deletion",
  },
];

const REQUIRED_PATTERNS = [
  {
    pattern: /expect\s*\(|toBe|toEqual|toContain|toMatch/g,
    message: "Test should contain assertions",
    code: "require-assertions",
  },
];

const PLAYWRIGHT_APIS = [
  "page.goto",
  "page.click",
  "page.fill",
  "page.type",
  "page.waitForSelector",
  "page.waitForURL",
  "page.locator",
  "page.getByRole",
  "page.getByText",
  "page.getByTestId",
  "page.screenshot",
  "expect(",
];

const DEPRECATED_PATTERNS = [
  { pattern: /page\.\$\(/g, message: "Use page.locator() instead of page.$()", code: "deprecated-dollar-selector" },
  {
    pattern: /page\.\$\$\(/g,
    message: "Use page.locator() instead of page.$$()",
    code: "deprecated-dollar-double-selector",
  },
  {
    pattern: /page\.waitForTimeout\(/g,
    message: "Avoid hard waits, use waitForSelector or expect conditions",
    code: "no-hard-wait",
  },
];

// ── Code Validator ────────────────────────────────────────────────────────────

export class CodeValidator {
  private options: ValidationOptions;

  constructor(options: ValidationOptions = {}) {
    this.options = {
      strictMode: true,
      allowUnusedVariables: false,
      checkPlaywrightAPIs: true,
      maxCodeLength: 50000,
      ...options,
    };
  }

  /**
   * Validate test code.
   */
  validate(code: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Check code length
    if (this.options.maxCodeLength && code.length > this.options.maxCodeLength) {
      errors.push({
        message: `Code exceeds maximum length of ${this.options.maxCodeLength} characters`,
        code: "max-length-exceeded",
      });
    }

    // Check for syntax errors
    const syntaxResult = this.checkSyntax(code);
    if (syntaxResult.error) {
      errors.push(syntaxResult.error);
      // Return early on syntax errors
      return { isValid: false, errors, warnings, suggestions };
    }

    // Check banned patterns
    for (const { pattern, message, code: errorCode } of BANNED_PATTERNS) {
      const matches = code.match(pattern);
      if (matches) {
        const lineNumber = this.getLineNumber(code, code.indexOf(matches[0]));
        errors.push({ line: lineNumber, message, code: errorCode });
      }
    }

    // Check required patterns
    if (this.options.strictMode) {
      for (const { pattern, message, code: errorCode } of REQUIRED_PATTERNS) {
        if (!pattern.test(code)) {
          warnings.push({ message, code: errorCode });
        }
      }
    }

    // Check deprecated patterns
    for (const { pattern, message, code: warnCode } of DEPRECATED_PATTERNS) {
      const matches = code.match(pattern);
      if (matches) {
        const lineNumber = this.getLineNumber(code, code.indexOf(matches[0]));
        warnings.push({ line: lineNumber, message, code: warnCode });
      }
    }

    // Check Playwright API usage
    if (this.options.checkPlaywrightAPIs) {
      const apiUsage = this.checkPlaywrightAPIUsage(code);
      if (!apiUsage.usesPlaywright) {
        warnings.push({
          message: "Code does not appear to use Playwright APIs",
          code: "no-playwright-usage",
        });
      }
      suggestions.push(...apiUsage.suggestions);
    }

    // Check for common issues
    const commonIssues = this.checkCommonIssues(code);
    warnings.push(...commonIssues.warnings);
    suggestions.push(...commonIssues.suggestions);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Check for TypeScript/JavaScript syntax errors.
   */
  private checkSyntax(code: string): { error?: ValidationError } {
    try {
      // Try to parse as a function body
      new Function(code);
      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Try to extract line number from error
      const lineMatch = message.match(/<anonymous>:(\d+):(\d+)/);
      return {
        error: {
          line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
          column: lineMatch ? parseInt(lineMatch[2], 10) : undefined,
          message: `Syntax error: ${message}`,
          code: "syntax-error",
        },
      };
    }
  }

  /**
   * Check Playwright API usage.
   */
  private checkPlaywrightAPIUsage(code: string): {
    usesPlaywright: boolean;
    suggestions: string[];
  } {
    const suggestions: string[] = [];
    let usesPlaywright = false;

    for (const api of PLAYWRIGHT_APIS) {
      if (code.includes(api)) {
        usesPlaywright = true;
        break;
      }
    }

    // Check for common patterns and suggest improvements
    if (code.includes("querySelector") || code.includes("querySelectorAll")) {
      suggestions.push("Consider using Playwright locators (getByRole, getByTestId) instead of querySelector");
    }

    if (/page\.click\(['"]#[\w-]+['"]\)/g.test(code)) {
      suggestions.push("Consider using data-testid attributes instead of ID selectors");
    }

    if (/page\.click\(['"]\.[\w-]+['"]\)/g.test(code)) {
      suggestions.push("Consider using more stable selectors like getByRole or getByTestId instead of class selectors");
    }

    return { usesPlaywright, suggestions };
  }

  /**
   * Check for common testing issues.
   */
  private checkCommonIssues(code: string): {
    warnings: ValidationWarning[];
    suggestions: string[];
  } {
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Check for hardcoded credentials
    if (/password\s*[:=]\s*['"][^'"]+['"]/gi.test(code)) {
      warnings.push({
        message: "Possible hardcoded password detected. Use environment variables or vault references.",
        code: "hardcoded-credential",
      });
    }

    // Check for hardcoded URLs
    if (/https?:\/\/(?!localhost|127\.0\.0\.1)[a-zA-Z0-9.-]+(?::\d+)?/g.test(code)) {
      suggestions.push("Consider using environment variables for URLs to support different environments");
    }

    // Check for magic numbers in timeouts
    if (/timeout:\s*\d{4,}/g.test(code)) {
      suggestions.push("Consider using named constants for timeout values");
    }

    // Check for missing error handling in async operations
    if (/await\s+\w+\(/g.test(code) && !/try\s*{/.test(code)) {
      suggestions.push("Consider adding try-catch blocks for error handling in async operations");
    }

    // Check for very long selectors
    if (/['"][^'"]{100,}['"]/g.test(code)) {
      warnings.push({
        message: "Very long selector detected. Consider using data-testid attributes.",
        code: "long-selector",
      });
    }

    return { warnings, suggestions };
  }

  /**
   * Get line number for a character offset.
   */
  private getLineNumber(code: string, offset: number): number {
    return code.substring(0, offset).split("\n").length;
  }

  /**
   * Fix common issues in code.
   */
  autoFix(code: string): { code: string; fixes: string[] } {
    const fixes: string[] = [];
    let fixedCode = code;

    // Replace deprecated $() with locator()
    if (/page\.\$\(/g.test(fixedCode)) {
      fixedCode = fixedCode.replace(/page\.\$\((['"])/g, "page.locator($1");
      fixes.push("Replaced page.$() with page.locator()");
    }

    // Add 'use strict' if missing
    if (!fixedCode.includes("'use strict'") && !fixedCode.includes('"use strict"')) {
      // Only add if it's a standalone script, not a snippet
      if (fixedCode.includes("import ") || fixedCode.includes("export ")) {
        // ES modules are automatically strict
      } else {
        // Don't add use strict to code snippets
      }
    }

    return { code: fixedCode, fixes };
  }
}
