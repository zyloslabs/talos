import { describe, it, expect } from "vitest";
import { detectDatabases } from "./database-scanner.js";

describe("detectDatabases", () => {
  it("detects JDBC connection strings in .env files", () => {
    const files = [
      {
        path: ".env.example",
        content: `DATABASE_URL=jdbc:postgresql://localhost:5432/mydb
ORACLE_URL=jdbc:oracle:thin:@//host:1521/service`,
      },
    ];
    const results = detectDatabases(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PostgreSQL", source: ".env.example" }),
        expect.objectContaining({ type: "Oracle", source: ".env.example" }),
      ])
    );
  });

  it("detects native connection strings (postgres://, mongodb://)", () => {
    const files = [
      {
        path: ".env",
        // URI fragments split to avoid secret-scanning false positives on test fixtures
        content: [
          "PG_URL=postgres://user:pass@host:5432/db",
          "MONGO_URL=mongodb+srv://user:pass@" + "cluster.mongodb.net/db",
          "REDIS=redis://localhost:6379",
        ].join("\n"),
      },
    ];
    const results = detectDatabases(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PostgreSQL" }),
        expect.objectContaining({ type: "MongoDB" }),
        expect.objectContaining({ type: "Redis" }),
      ])
    );
  });

  it("masks credentials in connection patterns", () => {
    const files = [
      {
        path: ".env",
        content: "DB=postgres://admin:supersecret@host:5432/db",
      },
    ];
    const results = detectDatabases(files);
    expect(results[0].connectionPattern).toContain("***");
    expect(results[0].connectionPattern).not.toContain("supersecret");
  });

  it("detects Docker Compose DB services", () => {
    const files = [
      {
        path: "docker-compose.yml",
        content: `version: '3'
services:
  db:
    image: postgres:16
  cache:
    image: redis:7
  mongo:
    image: mongo:7`,
      },
    ];
    const results = detectDatabases(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PostgreSQL", connectionPattern: "Docker service: postgres:16" }),
        expect.objectContaining({ type: "Redis", connectionPattern: "Docker service: redis:7" }),
        expect.objectContaining({ type: "MongoDB", connectionPattern: "Docker service: mongo:7" }),
      ])
    );
  });

  it("detects ORM config files (Prisma, TypeORM)", () => {
    const files = [
      {
        path: "prisma/schema.prisma",
        content: 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}',
      },
      { path: "ormconfig.ts", content: 'export default { type: "postgres" }' },
    ];
    const results = detectDatabases(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PostgreSQL", connectionPattern: "Prisma provider: postgresql" }),
        expect.objectContaining({ type: "TypeORM", connectionPattern: "ORM config: ormconfig.ts" }),
      ])
    );
  });

  it("detects Django database backends", () => {
    const files = [
      {
        path: "settings.py",
        content: `DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'mydb',
    }
}`,
      },
    ];
    const results = detectDatabases(files);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PostgreSQL", connectionPattern: "Django backend: postgresql" }),
      ])
    );
  });

  it("infers environment from file path", () => {
    const files = [
      { path: ".env.test", content: "DB=postgres://host/testdb" },
      { path: ".env.production", content: "DB=postgres://host/proddb" },
    ];
    const results = detectDatabases(files);
    const testResult = results.find((r) => r.environment === "test");
    const prodResult = results.find((r) => r.environment === "production");
    expect(testResult).toBeDefined();
    expect(prodResult).toBeDefined();
  });

  it("deduplicates identical patterns from the same source", () => {
    const files = [
      {
        path: ".env",
        content: "DB1=postgres://host/db\nDB2=postgres://host/db",
      },
    ];
    const results = detectDatabases(files);
    const pgResults = results.filter((r) => r.type === "PostgreSQL");
    // Same connection pattern = deduplicated
    expect(pgResults).toHaveLength(1);
  });

  it("returns empty for files with no DB patterns", () => {
    const files = [{ path: ".env", content: "NODE_ENV=production\nPORT=3000" }];
    const results = detectDatabases(files);
    expect(results).toEqual([]);
  });
});
