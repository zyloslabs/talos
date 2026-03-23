import type { Page, Locator } from "@playwright/test";

export class ChatPage {
  readonly page: Page;
  readonly heading: Locator;

  // Sidebar
  readonly newChatButton: Locator;
  readonly sessionSearchInput: Locator;
  readonly sessionList: Locator;

  // Chat area
  readonly emptyStateHeading: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly clearChatButton: Locator;

  // Model picker in header
  readonly modelPicker: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Talos AI Chat" });

    // Session sidebar
    this.newChatButton = page.getByRole("button", { name: "New Chat" });
    this.sessionSearchInput = page.getByPlaceholder("Search sessions...");
    this.sessionList = page.locator("[class*='overflow-y-auto']");

    // Chat
    this.emptyStateHeading = page.getByText("Talos AI Chat");
    this.messageInput = page.getByPlaceholder(/Type a message|Connecting/);
    this.sendButton = page.locator("button").filter({ has: page.locator("svg") }).last();
    this.clearChatButton = page.getByRole("button", { name: "Clear chat" });

    // Model picker (inline component in header)
    this.modelPicker = page.locator("[class*='chat-header']").first();
  }

  async goto() {
    await this.page.goto("/chat");
  }

  async sendMessage(text: string) {
    await this.messageInput.fill(text);
    await this.messageInput.press("Enter");
  }

  getMessageBubble(text: string): Locator {
    return this.page.getByText(text);
  }

  getRagIndicator(): Locator {
    return this.page.getByText(/context source/);
  }

  getSessionItem(preview: string): Locator {
    return this.page.getByText(preview);
  }

  getDeleteSessionButton(preview: string): Locator {
    return this.getSessionItem(preview).locator("..").locator("button");
  }
}
