/**
 * Tests for JDBC MCP Tools
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJdbcTools } from "./jdbc-tools.js";
import type { TalosRepository } from "../repository.js";
import type { DockerMcpManager } from "./docker-mcp-manager.js";
import type { TalosDataSource } from "../types.js";

const mockDataSource: TalosDataSource = {
  id: "ds-001",
  applicationId: "app-001",
  label: "Test DB",
  driverType: "postgresql",
  jdbcUrl: "jdbc:postgresql://localhost:5432/testdb",
  usernameVaultRef: "vault:db-user",
  passwordVaultRef: "vault:db-pass",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepo = {
  getDataSource: vi.fn().mockReturnValue(mockDataSource),
} as unknown as TalosRepository;

const mockDockerManager = {
  startJdbcServer: vi.fn().mockResolvedValue({
    containerId: "abc123",
    applicationId: "app-001",
    sourceId: "ds-001",
    type: "jdbc",
    startedAt: new Date(),
  }),
} as unknown as DockerMcpManager;

const mockResolveSecret = vi.fn().mockResolvedValue("resolved-value");

describe("JDBC MCP Tools", () => {
  let tools: ReturnType<typeof createJdbcTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createJdbcTools({
      repository: mockRepo,
      dockerManager: mockDockerManager,
      resolveSecret: mockResolveSecret,
    });
  });

  it("should create three tools", () => {
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toEqual([
      "talos_db_query",
      "talos_db_describe",
      "talos_db_list_tables",
    ]);
  });

  describe("talos_db_query", () => {
    it("should execute a SELECT query", async () => {
      const tool = tools.find((t) => t.name === "talos_db_query")!;
      const result = await tool.handler({ dataSourceId: "ds-001", query: "SELECT * FROM users" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.text);
      expect(parsed.dataSource).toBe("Test DB");
      expect(parsed.status).toBe("executed");
    });

    it("should reject non-SELECT queries", async () => {
      const tool = tools.find((t) => t.name === "talos_db_query")!;
      const result = await tool.handler({ dataSourceId: "ds-001", query: "DELETE FROM users" });

      expect(result.isError).toBe(true);
      expect(result.text).toContain("Only SELECT queries are allowed");
    });

    it("should reject INSERT queries", async () => {
      const tool = tools.find((t) => t.name === "talos_db_query")!;
      const result = await tool.handler({ dataSourceId: "ds-001", query: "INSERT INTO users VALUES (1)" });

      expect(result.isError).toBe(true);
    });

    it("should reject DROP queries", async () => {
      const tool = tools.find((t) => t.name === "talos_db_query")!;
      const result = await tool.handler({ dataSourceId: "ds-001", query: "DROP TABLE users" });

      expect(result.isError).toBe(true);
    });

    it("should reject UPDATE queries", async () => {
      const tool = tools.find((t) => t.name === "talos_db_query")!;
      const result = await tool.handler({ dataSourceId: "ds-001", query: "UPDATE users SET name='test'" });

      expect(result.isError).toBe(true);
    });

    it("should handle non-existent data source", async () => {
      (mockRepo.getDataSource as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
      const tool = tools.find((t) => t.name === "talos_db_query")!;
      const result = await tool.handler({ dataSourceId: "nonexistent", query: "SELECT 1" });

      expect(result.isError).toBe(true);
      expect(result.text).toContain("Data source not found");
    });

    it("should handle inactive data source", async () => {
      (mockRepo.getDataSource as ReturnType<typeof vi.fn>).mockReturnValueOnce({ ...mockDataSource, isActive: false });
      const tool = tools.find((t) => t.name === "talos_db_query")!;
      const result = await tool.handler({ dataSourceId: "ds-001", query: "SELECT 1" });

      expect(result.isError).toBe(true);
      expect(result.text).toContain("inactive");
    });
  });

  describe("talos_db_describe", () => {
    it("should describe a table", async () => {
      const tool = tools.find((t) => t.name === "talos_db_describe")!;
      const result = await tool.handler({ dataSourceId: "ds-001", tableName: "users" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.text);
      expect(parsed.tableName).toBe("users");
      expect(parsed.status).toBe("described");
    });
  });

  describe("talos_db_list_tables", () => {
    it("should list tables", async () => {
      const tool = tools.find((t) => t.name === "talos_db_list_tables")!;
      const result = await tool.handler({ dataSourceId: "ds-001" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.text);
      expect(parsed.status).toBe("listed");
    });
  });
});
