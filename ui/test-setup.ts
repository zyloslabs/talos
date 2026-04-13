import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrollIntoView — stub it globally
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
