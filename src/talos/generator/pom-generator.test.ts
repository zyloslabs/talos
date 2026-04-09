/**
 * Tests for PomGenerator (#479)
 */

import { describe, it, expect } from "vitest";
import { PomGenerator } from "./pom-generator.js";
import type { CrawledPage } from "../types.js";

function createCrawledPage(overrides?: Partial<CrawledPage>): CrawledPage {
  return {
    url: "https://app.example.com/dashboard",
    title: "Dashboard",
    headings: ["Dashboard", "Recent Activity"],
    forms: [],
    interactiveElements: [
      {
        tag: "button",
        role: "button",
        name: "Save",
        locatorStrategy: "page.getByRole('button', { name: 'Save' })",
      },
      {
        tag: "a",
        role: "link",
        name: "Settings",
        locatorStrategy: "page.getByRole('link', { name: 'Settings' })",
      },
    ],
    links: [{ href: "/settings", text: "Settings" }],
    depth: 0,
    crawledAt: new Date(),
    ...overrides,
  };
}

describe("PomGenerator", () => {
  const generator = new PomGenerator();

  describe("generate", () => {
    it("generates POMs for multiple crawled pages", () => {
      const pages = [
        createCrawledPage({ url: "https://app.example.com/", title: "Home" }),
        createCrawledPage({ url: "https://app.example.com/dashboard", title: "Dashboard" }),
      ];

      const result = generator.generate("app-1", pages);

      expect(result.pageObjects).toHaveLength(2);
      expect(result.totalPages).toBe(2);
      expect(result.applicationId).toBe("app-1");
    });

    it("returns empty array for no pages", () => {
      const result = generator.generate("app-1", []);

      expect(result.pageObjects).toHaveLength(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe("generatePageObject", () => {
    it("generates class with correct name from URL", () => {
      const page = createCrawledPage({
        url: "https://app.example.com/user/profile",
      });

      const pom = generator.generatePageObject(page);

      expect(pom.className).toBe("UserProfilePage");
      expect(pom.filePath).toContain("user-profile.page.ts");
    });

    it("generates goto method", () => {
      const page = createCrawledPage();
      const pom = generator.generatePageObject(page);

      const gotoMethod = pom.methods.find((m) => m.name === "goto");
      expect(gotoMethod).toBeDefined();
      expect(gotoMethod!.code).toContain("page.goto");
    });

    it("generates locators from interactive elements", () => {
      const page = createCrawledPage({
        interactiveElements: [
          {
            tag: "button",
            role: "button",
            name: "Submit",
            locatorStrategy: "page.getByRole('button', { name: 'Submit' })",
          },
          {
            tag: "input",
            role: "textbox",
            name: "Email",
            type: "text",
            locatorStrategy: "page.getByRole('textbox', { name: 'Email' })",
          },
        ],
      });

      const pom = generator.generatePageObject(page);

      expect(pom.locators.length).toBeGreaterThanOrEqual(2);
    });

    it("generates click methods for buttons", () => {
      const page = createCrawledPage({
        interactiveElements: [
          {
            tag: "button",
            role: "button",
            name: "Delete",
            locatorStrategy: "page.getByRole('button', { name: 'Delete' })",
          },
        ],
      });

      const pom = generator.generatePageObject(page);

      const clickMethod = pom.methods.find((m) => m.name === "clickDelete");
      expect(clickMethod).toBeDefined();
      expect(clickMethod!.code).toContain("click()");
    });

    it("generates form fill methods", () => {
      const page = createCrawledPage({
        forms: [
          {
            fields: [
              {
                name: "username",
                type: "text",
                label: "Username",
                required: true,
                locatorStrategy: "page.getByLabel('Username')",
              },
              {
                name: "password",
                type: "password",
                label: "Password",
                required: true,
                locatorStrategy: "page.getByLabel('Password')",
              },
            ],
            submitButton: {
              tag: "button",
              role: "button",
              name: "Login",
              locatorStrategy: "page.getByRole('button', { name: 'Login' })",
            },
          },
        ],
      });

      const pom = generator.generatePageObject(page);

      const fillMethod = pom.methods.find((m) => m.name === "fillForm");
      expect(fillMethod).toBeDefined();
      expect(fillMethod!.code).toContain("fill(");

      const submitMethod = pom.methods.find((m) => m.name === "submitForm");
      expect(submitMethod).toBeDefined();
      expect(submitMethod!.code).toContain("click()");
    });

    it("generates navigation methods for links", () => {
      const page = createCrawledPage({
        interactiveElements: [
          {
            tag: "a",
            role: "link",
            name: "About",
            locatorStrategy: "page.getByRole('link', { name: 'About' })",
          },
        ],
      });

      const pom = generator.generatePageObject(page);

      const navMethod = pom.methods.find((m) => m.name === "navigateToAbout");
      expect(navMethod).toBeDefined();
    });

    it("generates complete code with imports and class", () => {
      const page = createCrawledPage();
      const pom = generator.generatePageObject(page);

      expect(pom.code).toContain("import { type Page");
      expect(pom.code).toContain("export class");
      expect(pom.code).toContain("constructor(page: Page)");
      expect(pom.code).toContain("this.page = page");
    });

    it("handles duplicate element names with suffixes", () => {
      const page = createCrawledPage({
        interactiveElements: [
          {
            tag: "button",
            role: "button",
            name: "Submit",
            locatorStrategy: "page.getByRole('button', { name: 'Submit' })",
          },
          {
            tag: "button",
            role: "button",
            name: "Submit",
            locatorStrategy: "page.getByRole('button', { name: 'Submit' }).nth(1)",
          },
        ],
      });

      const pom = generator.generatePageObject(page);

      // Should not have duplicate locator names
      const names = pom.locators.map((l) => l.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe("urlToClassName", () => {
    it("converts root URL to HomPage", () => {
      expect(generator.urlToClassName("https://app.example.com/")).toBe("HomePage");
    });

    it("converts path to PascalCase class name", () => {
      expect(generator.urlToClassName("https://app.example.com/user-profile")).toBe("UserProfilePage");
    });

    it("handles multi-segment paths", () => {
      expect(generator.urlToClassName("https://app.example.com/admin/settings")).toBe("AdminSettingsPage");
    });
  });

  describe("urlToFileName", () => {
    it("converts root URL to home.page", () => {
      expect(generator.urlToFileName("https://app.example.com/")).toBe("home.page");
    });

    it("converts path to kebab-case file name", () => {
      expect(generator.urlToFileName("https://app.example.com/user-profile")).toBe("user-profile.page");
    });
  });
});
