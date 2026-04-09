/**
 * POM Generator (#479)
 *
 * Auto-generates Page Object Model files from crawled web pages.
 * Each discovered page produces a POM class with navigation, locators,
 * form-fill methods, and action methods.
 */

import type {
  CrawledPage,
  PageObjectModel,
  PageObjectMethod,
  PomGenerationResult,
} from "../types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PomGeneratorOptions = {
  /** Base output directory for POM files */
  outputDir?: string;
  /** Whether to include JSDoc comments */
  includeJSDoc?: boolean;
};

// ── POM Generator ─────────────────────────────────────────────────────────────

export class PomGenerator {
  private outputDir: string;
  private includeJSDoc: boolean;

  constructor(options?: PomGeneratorOptions) {
    this.outputDir = options?.outputDir ?? "tests/pages";
    this.includeJSDoc = options?.includeJSDoc ?? true;
  }

  /**
   * Generate POM files from crawled pages.
   */
  generate(applicationId: string, pages: CrawledPage[]): PomGenerationResult {
    const pageObjects = pages.map((page) => this.generatePageObject(page));

    return {
      applicationId,
      pageObjects,
      totalPages: pages.length,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate a single Page Object Model from a crawled page.
   */
  generatePageObject(page: CrawledPage): PageObjectModel {
    const className = this.urlToClassName(page.url);
    const filePath = `${this.outputDir}/${this.urlToFileName(page.url)}.ts`;

    const locators = this.extractLocators(page);
    const methods = this.generateMethods(page, className);
    const imports = [`import { type Page, type Locator } from '@playwright/test';`];

    const code = this.generateCode(className, imports, locators, methods, page.url);

    return {
      className,
      filePath,
      url: page.url,
      imports,
      locators,
      methods,
      code,
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private extractLocators(page: CrawledPage): Array<{
    name: string;
    strategy: string;
    value: string;
  }> {
    const locators: Array<{ name: string; strategy: string; value: string }> = [];
    const seenNames = new Set<string>();

    for (const element of page.interactiveElements) {
      const baseName = this.elementToPropertyName(element);
      let name = baseName;
      let counter = 1;
      while (seenNames.has(name)) {
        name = `${baseName}${counter++}`;
      }
      seenNames.add(name);

      locators.push({
        name,
        strategy: element.locatorStrategy,
        value: element.name ?? element.role ?? "unknown",
      });
    }

    return locators;
  }

  private generateMethods(page: CrawledPage, _className: string): PageObjectMethod[] {
    const methods: PageObjectMethod[] = [];

    // goto method
    methods.push({
      name: "goto",
      description: `Navigate to ${page.title || page.url}`,
      code: `async goto() {\n    await this.page.goto('${this.escapeString(page.url)}');\n  }`,
      returnType: "Promise<void>",
    });

    // Form fill methods
    for (let i = 0; i < page.forms.length; i++) {
      const form = page.forms[i];
      const methodName = i === 0 ? "fillForm" : `fillForm${i + 1}`;

      const fillLines = form.fields.map((field) => {
        const varName = this.toCamelCase(field.name);
        return `    await ${field.locatorStrategy}.fill(${varName});`;
      });

      const params = form.fields.map((f) => `${this.toCamelCase(f.name)}: string`).join(", ");

      methods.push({
        name: methodName,
        description: `Fill form fields`,
        code: `async ${methodName}(${params}) {\n${fillLines.join("\n")}\n  }`,
        returnType: "Promise<void>",
      });

      // Submit method
      if (form.submitButton) {
        methods.push({
          name: i === 0 ? "submitForm" : `submitForm${i + 1}`,
          description: `Submit the form`,
          code: `async ${i === 0 ? "submitForm" : `submitForm${i + 1}`}() {\n    await ${form.submitButton.locatorStrategy}.click();\n  }`,
          returnType: "Promise<void>",
        });
      }
    }

    // Click methods for buttons
    const buttons = page.interactiveElements.filter((el) => el.role === "button");
    for (const button of buttons) {
      const methodName = `click${this.toPascalCase(button.name ?? "Button")}`;
      methods.push({
        name: methodName,
        description: `Click ${button.name ?? "button"}`,
        code: `async ${methodName}() {\n    await ${button.locatorStrategy}.click();\n  }`,
        returnType: "Promise<void>",
      });
    }

    // Navigation methods for links
    const navLinks = page.interactiveElements.filter((el) => el.role === "link");
    for (const link of navLinks.slice(0, 10)) {
      // Limit to first 10 links
      const methodName = `navigateTo${this.toPascalCase(link.name ?? "Link")}`;
      methods.push({
        name: methodName,
        description: `Navigate to ${link.name ?? "link"}`,
        code: `async ${methodName}() {\n    await ${link.locatorStrategy}.click();\n  }`,
        returnType: "Promise<void>",
      });
    }

    return methods;
  }

  private generateCode(
    className: string,
    imports: string[],
    locators: Array<{ name: string; strategy: string; value: string }>,
    methods: PageObjectMethod[],
    url: string
  ): string {
    const lines: string[] = [];

    // Imports
    lines.push(...imports);
    lines.push("");

    // Class JSDoc
    if (this.includeJSDoc) {
      lines.push(`/**`);
      lines.push(` * Page Object Model for ${url}`);
      lines.push(` * Auto-generated by Talos POM Generator`);
      lines.push(` */`);
    }

    // Class declaration
    lines.push(`export class ${className} {`);
    lines.push(`  readonly page: Page;`);
    lines.push("");

    // Locator properties
    for (const locator of locators) {
      lines.push(`  readonly ${locator.name}: Locator;`);
    }
    lines.push("");

    // Constructor
    lines.push(`  constructor(page: Page) {`);
    lines.push(`    this.page = page;`);
    for (const locator of locators) {
      lines.push(`    this.${locator.name} = ${locator.strategy};`);
    }
    lines.push(`  }`);
    lines.push("");

    // Methods
    for (const method of methods) {
      if (this.includeJSDoc) {
        lines.push(`  /** ${method.description} */`);
      }
      lines.push(`  ${method.code}`);
      lines.push("");
    }

    lines.push(`}`);

    return lines.join("\n");
  }

  // ── Naming Helpers ──────────────────────────────────────────────────────────

  urlToClassName(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname === "/" ? "Home" : parsed.pathname;
      const parts = pathname.split("/").filter(Boolean);
      return parts.map((p) => this.toPascalCase(p)).join("") + "Page";
    } catch {
      return "UnknownPage";
    }
  }

  urlToFileName(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname === "/" ? "home" : parsed.pathname;
      const parts = pathname.split("/").filter(Boolean);
      return parts.map((p) => this.toKebabCase(p)).join("-") + ".page";
    } catch {
      return "unknown.page";
    }
  }

  private elementToPropertyName(element: { role?: string; name?: string; label?: string }): string {
    const base = element.name ?? element.label ?? element.role ?? "element";
    return this.toCamelCase(base) + this.roleSuffix(element.role ?? "");
  }

  private roleSuffix(role: string): string {
    const map: Record<string, string> = {
      button: "Button",
      link: "Link",
      textbox: "Input",
      checkbox: "Checkbox",
      radio: "Radio",
      combobox: "Select",
      slider: "Slider",
      tab: "Tab",
    };
    return map[role] ?? "";
  }

  private toPascalCase(s: string): string {
    return s
      .replace(/[^a-zA-Z0-9]/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  }

  private toCamelCase(s: string): string {
    const pascal = this.toPascalCase(s);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  private toKebabCase(s: string): string {
    return s
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/-+/g, "-");
  }

  private escapeString(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }
}
