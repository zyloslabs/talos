/**
 * Tests for Docker MCP Manager
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockerMcpManager } from "./docker-mcp-manager.js";
import type { TalosDataSource, TalosAtlassianConfig } from "../types.js";

// Mock child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
    callback(null, { stdout: "abc123def456\n", stderr: "" });
  }),
  execFileSync: vi.fn(),
}));

vi.mock("node:util", async () => {
  const actual = await vi.importActual<typeof import("node:util")>("node:util");
  return {
    ...actual,
    promisify: (fn: unknown) => {
      return async (...args: unknown[]) => {
        return new Promise((resolve, reject) => {
          (fn as (...a: unknown[]) => void)(...args, (err: Error | null, result: unknown) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      };
    },
  };
});

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

const mockAtlassianConfig: TalosAtlassianConfig = {
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

describe("DockerMcpManager", () => {
  let manager: DockerMcpManager;

  beforeEach(() => {
    manager = new DockerMcpManager();
  });

  describe("startJdbcServer", () => {
    it("should start a JDBC server and return a handle", async () => {
      const handle = await manager.startJdbcServer(mockDataSource, {
        username: "testuser",
        password: "testpass",
      });

      expect(handle.containerId).toBe("abc123def456");
      expect(handle.applicationId).toBe("app-001");
      expect(handle.sourceId).toBe("ds-001");
      expect(handle.type).toBe("jdbc");
      expect(handle.startedAt).toBeInstanceOf(Date);
    });

    it("should return existing handle if already running", async () => {
      const handle1 = await manager.startJdbcServer(mockDataSource, {
        username: "testuser",
        password: "testpass",
      });
      const handle2 = await manager.startJdbcServer(mockDataSource, {
        username: "testuser",
        password: "testpass",
      });

      expect(handle1).toBe(handle2);
    });
  });

  describe("startAtlassianServer", () => {
    it("should start an Atlassian server and return a handle", async () => {
      const handle = await manager.startAtlassianServer(mockAtlassianConfig, {
        jiraUsername: "user@test.com",
        jiraApiToken: "token123",
        confluenceUsername: "user@test.com",
        confluenceApiToken: "token456",
      });

      expect(handle.containerId).toBe("abc123def456");
      expect(handle.applicationId).toBe("app-001");
      expect(handle.type).toBe("atlassian");
    });
  });

  describe("stopServer", () => {
    it("should stop a running container and remove from tracking", async () => {
      const handle = await manager.startJdbcServer(mockDataSource, {
        username: "testuser",
        password: "testpass",
      });

      expect(manager.isRunning(handle.containerId)).toBe(true);

      await manager.stopServer(handle.containerId);
      expect(manager.isRunning(handle.containerId)).toBe(false);
    });
  });

  describe("stopAllForApp", () => {
    it("should stop all containers for an application", async () => {
      await manager.startJdbcServer(mockDataSource, {
        username: "testuser",
        password: "testpass",
      });
      await manager.startAtlassianServer(mockAtlassianConfig, {
        jiraUsername: "user",
        jiraApiToken: "token",
      });

      expect(manager.listRunning()).toHaveLength(2);

      await manager.stopAllForApp("app-001");
      expect(manager.listRunning()).toHaveLength(0);
    });
  });

  describe("listRunning", () => {
    it("should return empty array when no containers running", () => {
      expect(manager.listRunning()).toEqual([]);
    });

    it("should list all running containers", async () => {
      await manager.startJdbcServer(mockDataSource, {
        username: "testuser",
        password: "testpass",
      });

      const running = manager.listRunning();
      expect(running).toHaveLength(1);
      expect(running[0].type).toBe("jdbc");
    });
  });

  describe("isRunning", () => {
    it("should return false for unknown container", () => {
      expect(manager.isRunning("unknown-id")).toBe(false);
    });
  });
});
