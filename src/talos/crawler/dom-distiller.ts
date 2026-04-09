/**
 * DOM Distiller — Accessibility Tree Extraction (#486)
 *
 * Uses Playwright's accessibility snapshot to extract meaningful
 * locators (getByRole, getByLabel, getByText, getByPlaceholder)
 * instead of raw CSS selectors.
 */

import type {
  AccessibilityNode,
  CrawledPageElement,
  CrawledForm,
  CrawledFormField,
  DistilledLocator,
} from "../types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DistillResult = {
  interactiveElements: CrawledPageElement[];
  forms: CrawledForm[];
  headings: string[];
  links: Array<{ href: string; text: string }>;
  locators: DistilledLocator[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "menuitem",
  "option",
  "searchbox",
]);

const FORM_FIELD_ROLES = new Set([
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "slider",
  "spinbutton",
  "switch",
  "searchbox",
]);

// ── DOM Distiller ─────────────────────────────────────────────────────────────

export class DomDistiller {
  /**
   * Distill an accessibility tree snapshot into structured page data.
   */
  distill(snapshot: AccessibilityNode): DistillResult {
    const interactiveElements: CrawledPageElement[] = [];
    const locators: DistilledLocator[] = [];
    const headings: string[] = [];
    const links: Array<{ href: string; text: string }> = [];

    this.walkTree(snapshot, interactiveElements, locators, headings, links);

    const forms = this.extractForms(interactiveElements);

    return { interactiveElements, forms, headings, links, locators };
  }

  /**
   * Generate a Playwright locator strategy for a given accessible node.
   */
  generateLocator(node: AccessibilityNode): DistilledLocator | null {
    if (!node.role) return null;

    // Priority 1: getByRole with name (highest confidence)
    if (node.name && INTERACTIVE_ROLES.has(node.role)) {
      return {
        strategy: "getByRole",
        args: [node.role, node.name],
        confidence: 0.95,
        element: node,
      };
    }

    // Priority 2: getByLabel (for form fields)
    if (node.name && FORM_FIELD_ROLES.has(node.role)) {
      return {
        strategy: "getByLabel",
        args: [node.name],
        confidence: 0.9,
        element: node,
      };
    }

    // Priority 3: getByPlaceholder (for textboxes with placeholder-like names)
    if (node.role === "textbox" && node.value === undefined && node.name) {
      return {
        strategy: "getByPlaceholder",
        args: [node.name],
        confidence: 0.8,
        element: node,
      };
    }

    // Priority 4: getByText (for button/link text)
    if (node.name && (node.role === "button" || node.role === "link")) {
      return {
        strategy: "getByText",
        args: [node.name],
        confidence: 0.75,
        element: node,
      };
    }

    // Priority 5: getByRole without name (lower confidence)
    if (INTERACTIVE_ROLES.has(node.role)) {
      return {
        strategy: "getByRole",
        args: [node.role],
        confidence: 0.5,
        element: node,
      };
    }

    return null;
  }

  /**
   * Convert a DistilledLocator to Playwright code string.
   */
  locatorToCode(locator: DistilledLocator): string {
    switch (locator.strategy) {
      case "getByRole":
        if (locator.args.length > 1) {
          return `page.getByRole('${locator.args[0]}', { name: '${this.escapeString(locator.args[1])}' })`;
        }
        return `page.getByRole('${locator.args[0]}')`;
      case "getByLabel":
        return `page.getByLabel('${this.escapeString(locator.args[0])}')`;
      case "getByText":
        return `page.getByText('${this.escapeString(locator.args[0])}')`;
      case "getByPlaceholder":
        return `page.getByPlaceholder('${this.escapeString(locator.args[0])}')`;
      case "getByTestId":
        return `page.getByTestId('${this.escapeString(locator.args[0])}')`;
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private walkTree(
    node: AccessibilityNode,
    elements: CrawledPageElement[],
    locators: DistilledLocator[],
    headings: string[],
    links: Array<{ href: string; text: string }>
  ): void {
    // Extract headings
    if (node.role === "heading" && node.name) {
      headings.push(node.name);
    }

    // Extract links
    if (node.role === "link" && node.name) {
      links.push({ href: "", text: node.name });
    }

    // Extract interactive elements
    if (INTERACTIVE_ROLES.has(node.role)) {
      const locator = this.generateLocator(node);
      const locatorStrategy = locator ? this.locatorToCode(locator) : `page.getByRole('${node.role}')`;

      elements.push({
        tag: this.roleToTag(node.role),
        role: node.role,
        name: node.name,
        type: FORM_FIELD_ROLES.has(node.role) ? this.roleToInputType(node.role) : undefined,
        label: node.name,
        locatorStrategy,
      });

      if (locator) {
        locators.push(locator);
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        this.walkTree(child, elements, locators, headings, links);
      }
    }
  }

  private extractForms(elements: CrawledPageElement[]): CrawledForm[] {
    const formFields = elements.filter((el) => FORM_FIELD_ROLES.has(el.role ?? ""));
    const submitButtons = elements.filter(
      (el) => el.role === "button" && /submit|save|ok|confirm|sign|log/i.test(el.name ?? "")
    );

    if (formFields.length === 0) return [];

    const fields: CrawledFormField[] = formFields.map((el) => ({
      name: el.name ?? el.label ?? "unknown",
      type: el.type ?? "text",
      label: el.label,
      placeholder: el.placeholder,
      required: false,
      locatorStrategy: el.locatorStrategy,
    }));

    return [
      {
        fields,
        submitButton: submitButtons[0],
      },
    ];
  }

  private roleToTag(role: string): string {
    const map: Record<string, string> = {
      button: "button",
      link: "a",
      textbox: "input",
      checkbox: "input",
      radio: "input",
      combobox: "select",
      slider: "input",
      spinbutton: "input",
      switch: "input",
      tab: "button",
      menuitem: "li",
      option: "option",
      searchbox: "input",
    };
    return map[role] ?? "div";
  }

  private roleToInputType(role: string): string {
    const map: Record<string, string> = {
      textbox: "text",
      checkbox: "checkbox",
      radio: "radio",
      combobox: "select",
      slider: "range",
      spinbutton: "number",
      switch: "checkbox",
      searchbox: "search",
    };
    return map[role] ?? "text";
  }

  private escapeString(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }
}
