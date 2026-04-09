/**
 * Tests for DomDistiller (#486)
 */

import { describe, it, expect } from "vitest";
import { DomDistiller } from "./dom-distiller.js";
import type { AccessibilityNode } from "../types.js";

describe("DomDistiller", () => {
  const distiller = new DomDistiller();

  describe("distill", () => {
    it("extracts headings from accessibility tree", () => {
      const snapshot: AccessibilityNode = {
        role: "WebArea",
        children: [
          { role: "heading", name: "Welcome", level: 1 },
          { role: "heading", name: "Features", level: 2 },
        ],
      };

      const result = distiller.distill(snapshot);
      expect(result.headings).toEqual(["Welcome", "Features"]);
    });

    it("extracts interactive elements (buttons, links, textboxes)", () => {
      const snapshot: AccessibilityNode = {
        role: "WebArea",
        children: [
          { role: "button", name: "Submit" },
          { role: "link", name: "Home" },
          { role: "textbox", name: "Email" },
        ],
      };

      const result = distiller.distill(snapshot);
      expect(result.interactiveElements).toHaveLength(3);
      expect(result.interactiveElements[0].role).toBe("button");
      expect(result.interactiveElements[0].name).toBe("Submit");
      expect(result.interactiveElements[1].role).toBe("link");
      expect(result.interactiveElements[2].role).toBe("textbox");
    });

    it("extracts links", () => {
      const snapshot: AccessibilityNode = {
        role: "WebArea",
        children: [
          { role: "link", name: "About Us" },
          { role: "link", name: "Contact" },
        ],
      };

      const result = distiller.distill(snapshot);
      expect(result.links).toHaveLength(2);
      expect(result.links[0].text).toBe("About Us");
    });

    it("extracts forms from form-field roles", () => {
      const snapshot: AccessibilityNode = {
        role: "WebArea",
        children: [
          { role: "textbox", name: "Username" },
          { role: "textbox", name: "Password" },
          { role: "button", name: "Sign In" },
        ],
      };

      const result = distiller.distill(snapshot);
      expect(result.forms).toHaveLength(1);
      expect(result.forms[0].fields).toHaveLength(2);
      expect(result.forms[0].submitButton).toBeDefined();
      expect(result.forms[0].submitButton?.name).toBe("Sign In");
    });

    it("generates locators for interactive elements", () => {
      const snapshot: AccessibilityNode = {
        role: "WebArea",
        children: [
          { role: "button", name: "Save" },
          { role: "textbox", name: "Email Address" },
        ],
      };

      const result = distiller.distill(snapshot);
      expect(result.locators.length).toBeGreaterThanOrEqual(2);
      expect(result.locators[0].strategy).toBe("getByRole");
      expect(result.locators[0].args).toContain("button");
    });

    it("handles empty tree", () => {
      const snapshot: AccessibilityNode = {
        role: "WebArea",
      };

      const result = distiller.distill(snapshot);
      expect(result.interactiveElements).toHaveLength(0);
      expect(result.forms).toHaveLength(0);
      expect(result.headings).toHaveLength(0);
      expect(result.links).toHaveLength(0);
    });

    it("handles deeply nested tree", () => {
      const snapshot: AccessibilityNode = {
        role: "WebArea",
        children: [
          {
            role: "navigation",
            children: [
              {
                role: "list",
                children: [
                  { role: "listitem", children: [{ role: "link", name: "Home" }] },
                  { role: "listitem", children: [{ role: "link", name: "About" }] },
                ],
              },
            ],
          },
        ],
      };

      const result = distiller.distill(snapshot);
      expect(result.links).toHaveLength(2);
      expect(result.interactiveElements).toHaveLength(2);
    });

    it("returns no forms when only buttons exist (no form fields)", () => {
      const snapshot: AccessibilityNode = {
        role: "WebArea",
        children: [{ role: "button", name: "Click Me" }],
      };

      const result = distiller.distill(snapshot);
      expect(result.forms).toHaveLength(0);
    });
  });

  describe("generateLocator", () => {
    it("generates getByRole for named buttons", () => {
      const locator = distiller.generateLocator({
        role: "button",
        name: "Submit",
      });
      expect(locator).not.toBeNull();
      expect(locator!.strategy).toBe("getByRole");
      expect(locator!.args).toEqual(["button", "Submit"]);
      expect(locator!.confidence).toBe(0.95);
    });

    it("generates getByLabel for form fields", () => {
      const locator = distiller.generateLocator({
        role: "textbox",
        name: "Email",
      });
      expect(locator).not.toBeNull();
      // Should be getByRole (priority 1) since textbox is interactive
      expect(locator!.strategy).toBe("getByRole");
    });

    it("generates getByRole without name for unnamed interactive elements", () => {
      const locator = distiller.generateLocator({ role: "button" });
      expect(locator).not.toBeNull();
      expect(locator!.strategy).toBe("getByRole");
      expect(locator!.args).toEqual(["button"]);
      expect(locator!.confidence).toBe(0.5);
    });

    it("returns null for non-interactive roles", () => {
      const locator = distiller.generateLocator({
        role: "paragraph",
        name: "Some text",
      });
      expect(locator).toBeNull();
    });
  });

  describe("locatorToCode", () => {
    it("generates getByRole code with name", () => {
      const code = distiller.locatorToCode({
        strategy: "getByRole",
        args: ["button", "Submit"],
        confidence: 0.95,
        element: { role: "button", name: "Submit" },
      });
      expect(code).toBe("page.getByRole('button', { name: 'Submit' })");
    });

    it("generates getByRole code without name", () => {
      const code = distiller.locatorToCode({
        strategy: "getByRole",
        args: ["button"],
        confidence: 0.5,
        element: { role: "button" },
      });
      expect(code).toBe("page.getByRole('button')");
    });

    it("generates getByLabel code", () => {
      const code = distiller.locatorToCode({
        strategy: "getByLabel",
        args: ["Email"],
        confidence: 0.9,
        element: { role: "textbox", name: "Email" },
      });
      expect(code).toBe("page.getByLabel('Email')");
    });

    it("generates getByText code", () => {
      const code = distiller.locatorToCode({
        strategy: "getByText",
        args: ["Click me"],
        confidence: 0.75,
        element: { role: "button", name: "Click me" },
      });
      expect(code).toBe("page.getByText('Click me')");
    });

    it("generates getByPlaceholder code", () => {
      const code = distiller.locatorToCode({
        strategy: "getByPlaceholder",
        args: ["Enter email"],
        confidence: 0.8,
        element: { role: "textbox", name: "Enter email" },
      });
      expect(code).toBe("page.getByPlaceholder('Enter email')");
    });

    it("escapes single quotes", () => {
      const code = distiller.locatorToCode({
        strategy: "getByText",
        args: ["Don't click"],
        confidence: 0.75,
        element: { role: "button", name: "Don't click" },
      });
      expect(code).toBe("page.getByText('Don\\'t click')");
    });
  });
});
