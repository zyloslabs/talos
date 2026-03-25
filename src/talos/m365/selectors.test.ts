import { describe, it, expect } from "vitest";
import { SELECTORS } from "./selectors.js";

describe("SELECTORS", () => {
  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(SELECTORS)).toBe(true);
  });

  it("has all expected keys", () => {
    const expectedKeys = [
      "SEARCH_INPUT",
      "SEARCH_BUTTON",
      "THINK_DEEPER_BUTTON",
      "MODEL_PICKER_BUTTON",
      "MODEL_OPTION_ITEM",
      "MODEL_PICKER_MENU",
      "RESULT_CONTAINER",
      "RESULT_ITEM",
      "RESULT_TITLE",
      "RESULT_SNIPPET",
      "RESULT_LINK",
      "FILE_DOWNLOAD_LINK",
      "LOADING_INDICATOR",
      "ERROR_MESSAGE",
      "LOGIN_FORM",
      "RESPONSE_CONTAINER",
    ];
    for (const key of expectedKeys) {
      expect(SELECTORS).toHaveProperty(key);
    }
  });

  it("all values are non-empty strings", () => {
    for (const [key, value] of Object.entries(SELECTORS)) {
      expect(typeof value).toBe("string");
      expect(value.length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it("prevents mutation", () => {
    expect(() => {
      // @ts-expect-error — testing runtime immutability
      SELECTORS.SEARCH_INPUT = "hacked";
    }).toThrow();
  });
});
