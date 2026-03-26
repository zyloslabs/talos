/**
 * Tests for Atlassian MCP Tools
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAtlassianTools } from "./atlassian-tools.js";
import type { TalosRepository } from "../repository.js";
import type { DockerMcpManager } from "./docker-mcp-manager.js";
import type { TalosAtlassianConfig } from "../types.js";

const mockConfig: TalosAtlassianConfig = {
  id: "atl-001",
  applicationId: "app-001",
  deploymentType: "cloud",
  jiraUrl: "https://test.atlassian.net",
  jiraProject: "TEST",
  jiraUsernameVaultRef: "vault:jira-user",
  jiraApiTokenVaultRef: "vault:jira-token",
  jiraPersonalTokenVaultRef: "",
  jiraSslVerify: true,
  confluenceUrl: "https://test.atlassian.net/wiki",
  confluenceSpaces: ["DEV", "QA"],
  confluenceUsernameVaultRef: "vault:conf-user",
  confluenceApiTokenVaultRef: "vault:conf-token",
  confluencePersonalTokenVaultRef: "",
  confluenceSslVerify: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepo = {
  getAtlassianConfigByApp: vi.fn().mockReturnValue(mockConfig),
} as unknown as TalosRepository;

const mockDockerManager = {
  startAtlassianServer: vi.fn().mockResolvedValue({
    containerId: "atl123",
    applicationId: "app-001",
    sourceId: "atl-001",
    type: "atlassian",
    startedAt: new Date(),
  }),
} as unknown as DockerMcpManager;

const mockResolveSecret = vi.fn().mockResolvedValue("resolved-value");

describe("Atlassian MCP Tools", () => {
  let tools: ReturnType<typeof createAtlassianTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createAtlassianTools({
      repository: mockRepo,
      dockerManager: mockDockerManager,
      resolveSecret: mockResolveSecret,
    });
  });

  it("should create two tools", () => {
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual([
      "talos_jira_search",
      "talos_confluence_search",
    ]);
  });

  describe("talos_jira_search", () => {
    it("should search Jira with JQL and scope to project", async () => {
      const tool = tools.find((t) => t.name === "talos_jira_search")!;
      const result = await tool.handler({
        applicationId: "app-001",
        jql: "status = Open",
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.text);
      expect(parsed.jiraUrl).toBe("https://test.atlassian.net");
      expect(parsed.project).toBe("TEST");
      expect(parsed.jql).toContain('project = "TEST"');
      expect(parsed.jql).toContain("status = Open");
    });

    it("should not double-scope when JQL includes project", async () => {
      const tool = tools.find((t) => t.name === "talos_jira_search")!;
      const result = await tool.handler({
        applicationId: "app-001",
        jql: 'project = "OTHER" AND status = Open',
      });

      const parsed = JSON.parse(result.text);
      expect(parsed.jql).toBe('project = "OTHER" AND status = Open');
    });

    it("should handle missing Atlassian config", async () => {
      (mockRepo.getAtlassianConfigByApp as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
      const tool = tools.find((t) => t.name === "talos_jira_search")!;
      const result = await tool.handler({
        applicationId: "app-001",
        jql: "status = Open",
      });

      expect(result.isError).toBe(true);
      expect(result.text).toContain("No Atlassian configuration found");
    });

    it("should handle inactive Atlassian config", async () => {
      (mockRepo.getAtlassianConfigByApp as ReturnType<typeof vi.fn>).mockReturnValueOnce({ ...mockConfig, isActive: false });
      const tool = tools.find((t) => t.name === "talos_jira_search")!;
      const result = await tool.handler({
        applicationId: "app-001",
        jql: "status = Open",
      });

      expect(result.isError).toBe(true);
      expect(result.text).toContain("inactive");
    });
  });

  describe("talos_confluence_search", () => {
    it("should search Confluence with CQL and scope to spaces", async () => {
      const tool = tools.find((t) => t.name === "talos_confluence_search")!;
      const result = await tool.handler({
        applicationId: "app-001",
        cql: 'type=page AND text~"test plan"',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.text);
      expect(parsed.confluenceUrl).toBe("https://test.atlassian.net/wiki");
      expect(parsed.spaces).toEqual(["DEV", "QA"]);
      expect(parsed.cql).toContain('space IN ("DEV","QA")');
    });

    it("should not double-scope when CQL includes space", async () => {
      const tool = tools.find((t) => t.name === "talos_confluence_search")!;
      const result = await tool.handler({
        applicationId: "app-001",
        cql: 'space = "CUSTOM" AND text~"test"',
      });

      const parsed = JSON.parse(result.text);
      expect(parsed.cql).toBe('space = "CUSTOM" AND text~"test"');
    });
  });
});
