/**
 * Database Connection Scanner
 *
 * Detects database connections by scanning for JDBC URLs, connection strings,
 * Docker Compose DB services, and ORM configuration files.
 */

import type { DetectedDatabase } from "../../types.js";

type FileEntry = { path: string; content: string };

// ── Connection String Patterns ────────────────────────────────────────────────

const CONNECTION_PATTERNS: { type: string; pattern: RegExp }[] = [
  // JDBC URLs
  { type: "Oracle", pattern: /jdbc:oracle:thin:@[^\s'"`,;]+/gi },
  { type: "PostgreSQL", pattern: /jdbc:postgresql:\/\/[^\s'"`,;]+/gi },
  { type: "MySQL", pattern: /jdbc:mysql:\/\/[^\s'"`,;]+/gi },
  { type: "SQL Server", pattern: /jdbc:sqlserver:\/\/[^\s'"`,;]+/gi },
  { type: "SQLite", pattern: /jdbc:sqlite:[^\s'"`,;]+/gi },
  // Native connection strings
  { type: "PostgreSQL", pattern: /postgres(?:ql)?:\/\/[^\s'"`,;]+/gi },
  { type: "MySQL", pattern: /mysql:\/\/[^\s'"`,;]+/gi },
  { type: "MongoDB", pattern: /mongodb(?:\+srv)?:\/\/[^\s'"`,;]+/gi },
  { type: "Redis", pattern: /redis(?:s)?:\/\/[^\s'"`,;]+/gi },
  { type: "SQL Server", pattern: /Server=[^;]+;Database=[^\s'"`,;]+/gi },
];

// ── Docker Compose DB Image Patterns ──────────────────────────────────────────

const DOCKER_DB_IMAGES: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
  mongo: "MongoDB",
  redis: "Redis",
  "mcr.microsoft.com/mssql": "SQL Server",
  "oracle/database": "Oracle",
  cassandra: "Cassandra",
  elasticsearch: "Elasticsearch",
  neo4j: "Neo4j",
  cockroachdb: "CockroachDB",
};

// ── ORM Config Files ──────────────────────────────────────────────────────────

const ORM_CONFIG_FILES: Record<string, string> = {
  "schema.prisma": "Prisma",
  "ormconfig.ts": "TypeORM",
  "ormconfig.js": "TypeORM",
  "ormconfig.json": "TypeORM",
  "knexfile.ts": "Knex",
  "knexfile.js": "Knex",
  "drizzle.config.ts": "Drizzle",
  "drizzle.config.js": "Drizzle",
};

// ── Public API ────────────────────────────────────────────────────────────────

export function detectDatabases(files: FileEntry[]): DetectedDatabase[] {
  const results: DetectedDatabase[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const basename = file.path.split("/").pop() ?? "";

    // Check ORM config files
    const ormType = ORM_CONFIG_FILES[basename];
    if (ormType) {
      addResult(results, seen, {
        type: ormType,
        connectionPattern: `ORM config: ${basename}`,
        source: file.path,
      });
      // Also scan the ORM config for connection strings
      scanForConnectionStrings(file, results, seen);
    }

    // Prisma schema — extract provider
    if (basename === "schema.prisma") {
      parsePrismaSchema(file, results, seen);
    }

    // Scan Docker Compose files
    if (basename === "docker-compose.yml" || basename === "docker-compose.yaml") {
      scanDockerCompose(file, results, seen);
    }

    // Scan .env files and config files for connection strings
    if (
      basename.startsWith(".env") ||
      basename.endsWith(".env") ||
      basename === "application.properties" ||
      basename === "application.yml" ||
      basename === "application.yaml" ||
      basename === "settings.py" ||
      basename === "database.yml"
    ) {
      scanForConnectionStrings(file, results, seen);
    }

    // Django DATABASES pattern
    if (basename === "settings.py" && file.content.includes("DATABASES")) {
      parseDjangoDatabases(file, results, seen);
    }
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addResult(results: DetectedDatabase[], seen: Set<string>, item: DetectedDatabase): void {
  const key = `${item.type}:${item.connectionPattern}`.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  results.push(item);
}

function maskConnectionString(connStr: string): string {
  // Mask credentials in connection strings: user:pass@ → user:***@
  return connStr.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

function inferEnvironment(filePath: string): string | undefined {
  if (filePath.includes(".env.test") || filePath.includes(".env.testing")) return "test";
  if (filePath.includes(".env.production") || filePath.includes(".env.prod")) return "production";
  if (filePath.includes(".env.staging")) return "staging";
  if (filePath.includes(".env.development") || filePath.includes(".env.dev") || filePath.includes(".env.local"))
    return "development";
  return undefined;
}

function scanForConnectionStrings(file: FileEntry, results: DetectedDatabase[], seen: Set<string>): void {
  const env = inferEnvironment(file.path);
  for (const { type, pattern } of CONNECTION_PATTERNS) {
    const matches = file.content.matchAll(pattern);
    for (const match of matches) {
      addResult(results, seen, {
        type,
        connectionPattern: maskConnectionString(match[0]),
        source: file.path,
        environment: env,
      });
    }
  }
}

function scanDockerCompose(file: FileEntry, results: DetectedDatabase[], seen: Set<string>): void {
  // Look for `image:` lines and match against known DB images
  const imageRegex = /image:\s*['"]?([^\s'"#]+)/g;
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(file.content)) !== null) {
    const imageName = match[1].toLowerCase();
    for (const [imagePrefix, dbType] of Object.entries(DOCKER_DB_IMAGES)) {
      if (imageName.startsWith(imagePrefix)) {
        addResult(results, seen, {
          type: dbType,
          connectionPattern: `Docker service: ${match[1]}`,
          source: file.path,
        });
      }
    }
  }
}

function parseDjangoDatabases(file: FileEntry, results: DetectedDatabase[], seen: Set<string>): void {
  // Detect Django ENGINE settings
  const engineRegex = /'ENGINE':\s*'django\.db\.backends\.(\w+)'/g;
  let match: RegExpExecArray | null;
  while ((match = engineRegex.exec(file.content)) !== null) {
    const backend = match[1];
    const typeMap: Record<string, string> = {
      postgresql: "PostgreSQL",
      mysql: "MySQL",
      sqlite3: "SQLite",
      oracle: "Oracle",
    };
    const dbType = typeMap[backend] ?? backend;
    addResult(results, seen, {
      type: dbType,
      connectionPattern: `Django backend: ${backend}`,
      source: file.path,
    });
  }
}

function parsePrismaSchema(file: FileEntry, results: DetectedDatabase[], seen: Set<string>): void {
  // Detect provider in datasource block
  const providerRegex = /provider\s*=\s*"(\w+)"/;
  const match = providerRegex.exec(file.content);
  if (match) {
    const provider = match[1];
    const typeMap: Record<string, string> = {
      postgresql: "PostgreSQL",
      mysql: "MySQL",
      sqlite: "SQLite",
      sqlserver: "SQL Server",
      mongodb: "MongoDB",
      cockroachdb: "CockroachDB",
    };
    const dbType = typeMap[provider] ?? provider;
    addResult(results, seen, {
      type: dbType,
      connectionPattern: `Prisma provider: ${provider}`,
      source: file.path,
    });
  }
}
