/**
 * Credential Sanitizer
 *
 * Removes sensitive credentials from test code for export.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SanitizationResult = {
  sanitizedCode: string;
  replacements: Replacement[];
  warnings: string[];
};

export type Replacement = {
  original: string;
  replacement: string;
  type: ReplacementType;
  line?: number;
};

export type ReplacementType = "password" | "api-key" | "token" | "secret" | "credential" | "url" | "email" | "phone";

export type SanitizationOptions = {
  replaceUrls?: boolean;
  replaceEmails?: boolean;
  customPatterns?: Array<{ pattern: RegExp; type: ReplacementType; replacement: string }>;
  envVarPrefix?: string;
};

// ── Patterns ──────────────────────────────────────────────────────────────────

const SENSITIVE_PATTERNS: Array<{
  pattern: RegExp;
  type: ReplacementType;
  replacementTemplate: (match: string, index: number) => string;
}> = [
  // Passwords
  {
    pattern: /password\s*[:=]\s*['"]([^'"]+)['"]/gi,
    type: "password",
    replacementTemplate: (_, i) => `password: process.env.TEST_PASSWORD_${i}`,
  },
  {
    pattern: /\.fill\([^,]+,\s*['"](?=.*[A-Z])(?=.*[a-z])(?=.*\d)[^'"]{8,}['"]\)/gi,
    type: "password",
    replacementTemplate: (match, i) => {
      const selectorMatch = match.match(/\.fill\(([^,]+),/);
      return `.fill(${selectorMatch?.[1] ?? "selector"}, process.env.TEST_PASSWORD_${i})`;
    },
  },

  // API Keys
  {
    pattern: /api[_-]?key\s*[:=]\s*['"]([^'"]+)['"]/gi,
    type: "api-key",
    replacementTemplate: (_, i) => `apiKey: process.env.TEST_API_KEY_${i}`,
  },
  {
    pattern: /['"](?:sk|pk|api)[_-][a-zA-Z0-9]{20,}['"]/gi,
    type: "api-key",
    replacementTemplate: (_, i) => `process.env.TEST_API_KEY_${i}`,
  },

  // Tokens
  {
    pattern: /token\s*[:=]\s*['"]([^'"]+)['"]/gi,
    type: "token",
    replacementTemplate: (_, i) => `token: process.env.TEST_TOKEN_${i}`,
  },
  {
    pattern: /bearer\s+[a-zA-Z0-9._-]{20,}/gi,
    type: "token",
    replacementTemplate: (_, i) => `Bearer \${process.env.TEST_BEARER_TOKEN_${i}}`,
  },
  {
    pattern: /['"]eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*['"]/gi,
    type: "token",
    replacementTemplate: (_, i) => `process.env.TEST_JWT_${i}`,
  },

  // Secrets
  {
    pattern: /secret\s*[:=]\s*['"]([^'"]+)['"]/gi,
    type: "secret",
    replacementTemplate: (_, i) => `secret: process.env.TEST_SECRET_${i}`,
  },

  // Generic credentials
  {
    pattern: /credential[s]?\s*[:=]\s*['"]([^'"]+)['"]/gi,
    type: "credential",
    replacementTemplate: (_, i) => `credentials: process.env.TEST_CREDENTIAL_${i}`,
  },
];

const URL_PATTERN = /https?:\/\/(?!localhost|127\.0\.0\.1)[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s'"]*)?/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// ── Credential Sanitizer ──────────────────────────────────────────────────────

export class CredentialSanitizer {
  private options: SanitizationOptions;

  constructor(options: SanitizationOptions = {}) {
    this.options = {
      replaceUrls: false,
      replaceEmails: true,
      envVarPrefix: "TEST",
      ...options,
    };
  }

  /**
   * Sanitize code by replacing sensitive values with environment variables.
   */
  sanitize(code: string): SanitizationResult {
    const replacements: Replacement[] = [];
    const warnings: string[] = [];
    let sanitizedCode = code;
    let replacementIndex = 1;

    // Process sensitive patterns
    for (const { pattern, type, replacementTemplate } of SENSITIVE_PATTERNS) {
      const globalPattern = new RegExp(pattern.source, pattern.flags);

      const matches = sanitizedCode.matchAll(globalPattern);
      for (const match of matches) {
        const original = match[0];
        const replacement = replacementTemplate(original, replacementIndex);

        replacements.push({
          original,
          replacement,
          type,
          line: this.getLineNumber(sanitizedCode, match.index ?? 0),
        });

        sanitizedCode = sanitizedCode.replace(original, replacement);
        replacementIndex++;
      }
    }

    // Process custom patterns
    if (this.options.customPatterns) {
      for (const { pattern, type, replacement } of this.options.customPatterns) {
        const globalPattern = new RegExp(pattern.source, pattern.flags);

        const matches = sanitizedCode.matchAll(globalPattern);
        for (const match of matches) {
          const original = match[0];

          replacements.push({
            original,
            replacement,
            type,
            line: this.getLineNumber(sanitizedCode, match.index ?? 0),
          });

          sanitizedCode = sanitizedCode.replace(original, replacement);
        }
      }
    }

    // Process URLs if enabled
    if (this.options.replaceUrls) {
      const urlMatches = sanitizedCode.matchAll(URL_PATTERN);
      for (const match of urlMatches) {
        const original = match[0];
        const replacement = `\${process.env.${this.options.envVarPrefix}_BASE_URL}`;

        replacements.push({
          original,
          replacement,
          type: "url",
          line: this.getLineNumber(sanitizedCode, match.index ?? 0),
        });

        sanitizedCode = sanitizedCode.replace(original, replacement);
      }
    }

    // Process emails if enabled
    if (this.options.replaceEmails) {
      const emailMatches = sanitizedCode.matchAll(EMAIL_PATTERN);
      let emailIndex = 1;
      for (const match of emailMatches) {
        const original = match[0];
        const replacement = `\${process.env.${this.options.envVarPrefix}_EMAIL_${emailIndex}}`;

        replacements.push({
          original,
          replacement,
          type: "email",
          line: this.getLineNumber(sanitizedCode, match.index ?? 0),
        });

        sanitizedCode = sanitizedCode.replace(original, replacement);
        emailIndex++;
      }
    }

    // Check for potential unsanitized secrets
    const potentialSecrets = this.detectPotentialSecrets(sanitizedCode);
    for (const secret of potentialSecrets) {
      warnings.push(`Potential unsanitized secret at line ${secret.line}: ${secret.hint}`);
    }

    return {
      sanitizedCode,
      replacements,
      warnings,
    };
  }

  /**
   * Generate environment variable documentation.
   */
  generateEnvTemplate(replacements: Replacement[]): string {
    const lines: string[] = [
      "# Environment variables for Talos exported tests",
      "# Replace placeholder values with actual credentials",
      "",
    ];

    const seen = new Set<string>();

    for (const replacement of replacements) {
      // Extract env var name from replacement
      const envVarMatch = replacement.replacement.match(/process\.env\.(\w+)/);
      if (envVarMatch && !seen.has(envVarMatch[1])) {
        const envVar = envVarMatch[1];
        seen.add(envVar);

        lines.push(`# ${replacement.type}`);
        lines.push(`${envVar}=your_${replacement.type}_here`);
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Detect potential secrets that weren't caught by patterns.
   */
  private detectPotentialSecrets(code: string): Array<{ line: number; hint: string }> {
    const results: Array<{ line: number; hint: string }> = [];
    const lines = code.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for high-entropy strings (potential secrets)
      const stringMatches = line.matchAll(/['"]([^'"]{16,})['"]/g);
      for (const match of stringMatches) {
        const str = match[1];
        if (this.hasHighEntropy(str) && !str.includes("process.env")) {
          results.push({
            line: lineNumber,
            hint: `High-entropy string detected: "${str.slice(0, 10)}..."`,
          });
        }
      }

      // Check for common secret variable names
      const secretVarPatterns = [
        /\b(pwd|passwd|pass)\b/i,
        /\b(apikey|api_key)\b/i,
        /\b(auth_token|authtoken)\b/i,
        /\b(client_secret|clientsecret)\b/i,
        /\b(private_key|privatekey)\b/i,
      ];

      for (const pattern of secretVarPatterns) {
        if (pattern.test(line) && !line.includes("process.env")) {
          results.push({
            line: lineNumber,
            hint: `Potential credential variable name detected`,
          });
          break;
        }
      }
    }

    return results;
  }

  /**
   * Check if a string has high entropy (potential secret).
   */
  private hasHighEntropy(str: string): boolean {
    if (str.length < 16) return false;

    // Count character types
    const hasUpper = /[A-Z]/.test(str);
    const hasLower = /[a-z]/.test(str);
    const hasDigit = /\d/.test(str);
    const hasSpecial = /[^A-Za-z0-9]/.test(str);

    const typeCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

    // High entropy if >= 3 char types and no common patterns
    if (typeCount >= 3) {
      // Exclude common non-secret patterns
      if (/^[a-zA-Z0-9-_]+$/.test(str) && str.includes("-")) {
        // Likely a slug or ID, not a secret
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Get line number for a character offset.
   */
  private getLineNumber(code: string, offset: number): number {
    return code.substring(0, offset).split("\n").length;
  }
}
