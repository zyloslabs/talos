/**
 * Centralized DOM selectors for Copilot 365 web UI.
 * When the UI changes, update ONLY this file.
 */
export const SELECTORS = Object.freeze({
  SEARCH_INPUT: '#m365-chat-editor-target-element, [aria-label="Message Copilot"][contenteditable="true"], [data-lexical-editor="true"]',
  SEARCH_BUTTON: 'button[aria-label="Send"], button[data-testid="send-button"], button[data-testid="bizchat-submit"]',
  THINK_DEEPER_BUTTON: 'button[aria-label="Think deeper"], button[data-testid="think-deeper"], [aria-label*="Think deeper"]',
  MODEL_PICKER_BUTTON: '[data-testid*="model-picker"], button[aria-label*="model" i], button[aria-haspopup][data-testid*="model"], button[class*="modelPicker"], button[aria-label*="GPT" i]',
  MODEL_OPTION_ITEM: '[data-testid*="model-option"], [role="option"][class*="model" i], [role="menuitem"][class*="model" i], [role="option"], [role="menuitem"]',
  MODEL_PICKER_MENU: '[data-testid*="model-menu"], [role="listbox"], [role="menu"][class*="model" i]',
  RESULT_CONTAINER: '#llm-web-ui-messageList-scrollable-container, [role="feed"], [data-testid="biz-chat-native-persistent-container"]',
  RESULT_ITEM: '[data-testid="m365-chat-llm-web-ui-chat-message"]',
  RESULT_TITLE: "h1, h2, h3, strong",
  RESULT_SNIPPET: 'p, [data-testid="copilot-message-div"]',
  RESULT_LINK: "a[href]",
  FILE_DOWNLOAD_LINK: 'a[href*="download"], a[href*=".docx"], a[href*=".pdf"], a[href*=".xlsx"]',
  LOADING_INDICATOR: '[aria-busy="true"], [data-testid="loading"]',
  ERROR_MESSAGE: '[role="alert"], [data-testid="error-message"]',
  LOGIN_FORM: 'form[action*="login"], input[name="loginfmt"]',
  RESPONSE_CONTAINER: '[data-testid="lastChatMessage"], [data-testid="copilot-message-reply-div"], [data-testid="copilot-message-div"]',
});

export type SelectorsConfig = typeof SELECTORS;
