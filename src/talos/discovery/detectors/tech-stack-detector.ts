/**
 * Tech Stack Detector
 *
 * Scans package manifests (package.json, pom.xml, build.gradle, requirements.txt,
 * go.mod, Cargo.toml, Gemfile) and maps dependencies to known frameworks/libraries.
 */

import type { TechStackItem, TechStackCategory, DetectedConfigFile } from "../../types.js";

type FileEntry = { path: string; content: string };

// ── Known Framework Mappings ──────────────────────────────────────────────────

const NPM_FRAMEWORK_MAP: Record<string, { category: TechStackCategory; name?: string }> = {
  react: { category: "framework", name: "React" },
  "react-dom": { category: "framework", name: "React" },
  next: { category: "framework", name: "Next.js" },
  vue: { category: "framework", name: "Vue.js" },
  nuxt: { category: "framework", name: "Nuxt" },
  angular: { category: "framework", name: "Angular" },
  "@angular/core": { category: "framework", name: "Angular" },
  svelte: { category: "framework", name: "Svelte" },
  express: { category: "framework", name: "Express" },
  fastify: { category: "framework", name: "Fastify" },
  hapi: { category: "framework", name: "Hapi" },
  koa: { category: "framework", name: "Koa" },
  nestjs: { category: "framework", name: "NestJS" },
  "@nestjs/core": { category: "framework", name: "NestJS" },
  "solid-js": { category: "framework", name: "SolidJS" },
  remix: { category: "framework", name: "Remix" },
  "@remix-run/node": { category: "framework", name: "Remix" },
  gatsby: { category: "framework", name: "Gatsby" },
  electron: { category: "framework", name: "Electron" },
  // Libraries
  tailwindcss: { category: "library", name: "Tailwind CSS" },
  prisma: { category: "library", name: "Prisma" },
  "@prisma/client": { category: "library", name: "Prisma" },
  typeorm: { category: "library", name: "TypeORM" },
  sequelize: { category: "library", name: "Sequelize" },
  drizzle: { category: "library", name: "Drizzle" },
  "drizzle-orm": { category: "library", name: "Drizzle ORM" },
  mongoose: { category: "library", name: "Mongoose" },
  "better-sqlite3": { category: "library", name: "better-sqlite3" },
  zod: { category: "library" },
  axios: { category: "library" },
  lodash: { category: "library" },
  // Build tools
  typescript: { category: "build", name: "TypeScript" },
  vite: { category: "build", name: "Vite" },
  webpack: { category: "build", name: "webpack" },
  esbuild: { category: "build", name: "esbuild" },
  rollup: { category: "build", name: "Rollup" },
  tsup: { category: "build", name: "tsup" },
  parcel: { category: "build", name: "Parcel" },
  // Test frameworks
  vitest: { category: "test", name: "Vitest" },
  jest: { category: "test", name: "Jest" },
  mocha: { category: "test", name: "Mocha" },
  playwright: { category: "test", name: "Playwright" },
  "@playwright/test": { category: "test", name: "Playwright" },
  cypress: { category: "test", name: "Cypress" },
  // Lint
  eslint: { category: "lint", name: "ESLint" },
  prettier: { category: "lint", name: "Prettier" },
  biome: { category: "lint", name: "Biome" },
  "@biomejs/biome": { category: "lint", name: "Biome" },
};

const PYTHON_FRAMEWORK_MAP: Record<string, { category: TechStackCategory; name?: string }> = {
  django: { category: "framework", name: "Django" },
  flask: { category: "framework", name: "Flask" },
  fastapi: { category: "framework", name: "FastAPI" },
  tornado: { category: "framework", name: "Tornado" },
  pyramid: { category: "framework", name: "Pyramid" },
  pytest: { category: "test", name: "pytest" },
  sqlalchemy: { category: "library", name: "SQLAlchemy" },
  pandas: { category: "library", name: "pandas" },
  numpy: { category: "library", name: "NumPy" },
  celery: { category: "library", name: "Celery" },
};

const JAVA_FRAMEWORK_MAP: Record<string, { category: TechStackCategory; name?: string }> = {
  "spring-boot": { category: "framework", name: "Spring Boot" },
  "spring-web": { category: "framework", name: "Spring Web" },
  "spring-data": { category: "library", name: "Spring Data" },
  quarkus: { category: "framework", name: "Quarkus" },
  micronaut: { category: "framework", name: "Micronaut" },
  junit: { category: "test", name: "JUnit" },
  testng: { category: "test", name: "TestNG" },
  hibernate: { category: "library", name: "Hibernate" },
  lombok: { category: "library", name: "Lombok" },
};

// ── Manifest File Identifiers ─────────────────────────────────────────────────

const CONFIG_FILE_TYPES: Record<string, string> = {
  "package.json": "npm",
  "pom.xml": "maven",
  "build.gradle": "gradle",
  "build.gradle.kts": "gradle",
  "requirements.txt": "pip",
  Pipfile: "pipenv",
  "pyproject.toml": "python",
  "go.mod": "go",
  "Cargo.toml": "cargo",
  Gemfile: "bundler",
  "composer.json": "composer",
  "tsconfig.json": "typescript",
  "next.config.js": "nextjs",
  "next.config.mjs": "nextjs",
  "next.config.ts": "nextjs",
  "vite.config.ts": "vite",
  "vite.config.js": "vite",
  "vitest.config.ts": "vitest",
  "vitest.config.js": "vitest",
  "playwright.config.ts": "playwright",
  "playwright.config.js": "playwright",
  "webpack.config.js": "webpack",
  "webpack.config.ts": "webpack",
  "tailwind.config.ts": "tailwind",
  "tailwind.config.js": "tailwind",
  "eslint.config.js": "eslint",
  "eslint.config.mjs": "eslint",
  ".eslintrc.json": "eslint",
  ".eslintrc.js": "eslint",
  "docker-compose.yml": "docker-compose",
  "docker-compose.yaml": "docker-compose",
  Dockerfile: "docker",
  ".env": "dotenv",
  ".env.example": "dotenv",
  ".env.local": "dotenv",
  ".env.test": "dotenv",
};

// ── Public API ────────────────────────────────────────────────────────────────

export function detectTechStack(files: FileEntry[]): { techStack: TechStackItem[]; configFiles: DetectedConfigFile[] } {
  const techStack: TechStackItem[] = [];
  const configFiles: DetectedConfigFile[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const basename = file.path.split("/").pop() ?? "";

    // Record config files
    const cfgType = CONFIG_FILE_TYPES[basename];
    if (cfgType) {
      configFiles.push({ filePath: file.path, type: cfgType });
    }

    // Parse specific manifests
    if (basename === "package.json") {
      parsePackageJson(file, techStack, seen);
    } else if (basename === "requirements.txt") {
      parseRequirementsTxt(file, techStack, seen);
    } else if (basename === "pom.xml") {
      parsePomXml(file, techStack, seen);
    } else if (basename === "build.gradle" || basename === "build.gradle.kts") {
      parseBuildGradle(file, techStack, seen);
    } else if (basename === "go.mod") {
      parseGoMod(file, techStack, seen);
    } else if (basename === "Cargo.toml") {
      parseCargoToml(file, techStack, seen);
    } else if (basename === "Gemfile") {
      parseGemfile(file, techStack, seen);
    }
  }

  return { techStack, configFiles };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function addItem(items: TechStackItem[], seen: Set<string>, item: TechStackItem): void {
  const key = item.name.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  items.push(item);
}

function parsePackageJson(file: FileEntry, items: TechStackItem[], seen: Set<string>): void {
  try {
    const pkg = JSON.parse(file.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, version] of Object.entries(allDeps)) {
      const mapping = NPM_FRAMEWORK_MAP[dep];
      if (mapping) {
        addItem(items, seen, {
          name: mapping.name ?? dep,
          version: version.replace(/^[\^~>=<]/, ""),
          category: mapping.category,
          source: file.path,
        });
      }
    }
  } catch {
    // Malformed JSON — skip
  }
}

function parseRequirementsTxt(file: FileEntry, items: TechStackItem[], seen: Set<string>): void {
  for (const line of file.content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([a-zA-Z0-9_-]+)(?:[=<>!~]+(.+))?/.exec(trimmed);
    if (!match) continue;
    const [, pkg, version] = match;
    const key = pkg.toLowerCase();
    const mapping = PYTHON_FRAMEWORK_MAP[key];
    if (mapping) {
      addItem(items, seen, {
        name: mapping.name ?? pkg,
        version,
        category: mapping.category,
        source: file.path,
      });
    }
  }
}

function parsePomXml(file: FileEntry, items: TechStackItem[], seen: Set<string>): void {
  // Simple regex extraction of <artifactId> and <version> within <dependency>
  const depRegex =
    /<dependency>\s*<groupId>[^<]*<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>(?:\s*<version>([^<]+)<\/version>)?/g;
  let match: RegExpExecArray | null;
  while ((match = depRegex.exec(file.content)) !== null) {
    const [, artifactId, version] = match;
    for (const [key, mapping] of Object.entries(JAVA_FRAMEWORK_MAP)) {
      if (artifactId.includes(key)) {
        addItem(items, seen, {
          name: mapping.name ?? artifactId,
          version,
          category: mapping.category,
          source: file.path,
        });
      }
    }
  }
}

function parseBuildGradle(file: FileEntry, items: TechStackItem[], seen: Set<string>): void {
  // Match implementation/compile/testImplementation 'group:artifact:version' or ("...")
  const depRegex = /(?:implementation|compile|testImplementation|api)\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = depRegex.exec(file.content)) !== null) {
    const parts = match[1].split(":");
    if (parts.length >= 2) {
      const artifactId = parts[1];
      const version = parts[2];
      for (const [key, mapping] of Object.entries(JAVA_FRAMEWORK_MAP)) {
        if (artifactId.includes(key)) {
          addItem(items, seen, {
            name: mapping.name ?? artifactId,
            version,
            category: mapping.category,
            source: file.path,
          });
        }
      }
    }
  }
}

function parseGoMod(file: FileEntry, items: TechStackItem[], seen: Set<string>): void {
  addItem(items, seen, { name: "Go", category: "language", source: file.path });
  // Match both `require path v1.2.3` (single) and indented `path v1.2.3` (inside require block)
  const singleRequireRegex = /^require\s+(\S+)\s+v(\S+)/gm;
  const blockRequireRegex = /^\s+(\S+)\s+v(\S+)/gm;
  const allMatches: [string, string][] = [];

  let match: RegExpExecArray | null;
  while ((match = singleRequireRegex.exec(file.content)) !== null) {
    allMatches.push([match[1], match[2]]);
  }
  while ((match = blockRequireRegex.exec(file.content)) !== null) {
    allMatches.push([match[1], match[2]]);
  }

  for (const [mod, version] of allMatches) {
    const shortName = mod.split("/").pop() ?? mod;
    if (shortName === "gin" || mod.includes("gin-gonic")) {
      addItem(items, seen, { name: "Gin", version, category: "framework", source: file.path });
    } else if (shortName === "echo" || mod.includes("labstack/echo")) {
      addItem(items, seen, { name: "Echo", version, category: "framework", source: file.path });
    } else if (shortName === "fiber" || mod.includes("gofiber")) {
      addItem(items, seen, { name: "Fiber", version, category: "framework", source: file.path });
    }
  }
}

function parseCargoToml(file: FileEntry, items: TechStackItem[], seen: Set<string>): void {
  addItem(items, seen, { name: "Rust", category: "language", source: file.path });
  let inDeps = false;
  for (const line of file.content.split("\n")) {
    if (/^\[dependencies\]/.test(line) || /^\[dev-dependencies\]/.test(line)) {
      inDeps = true;
      continue;
    }
    if (/^\[/.test(line)) {
      inDeps = false;
      continue;
    }
    if (inDeps) {
      const m = /^\s*(\w[\w-]*)\s*=/.exec(line);
      if (m) {
        const crate = m[1];
        if (crate === "actix-web")
          addItem(items, seen, { name: "Actix Web", category: "framework", source: file.path });
        if (crate === "rocket") addItem(items, seen, { name: "Rocket", category: "framework", source: file.path });
        if (crate === "tokio") addItem(items, seen, { name: "Tokio", category: "library", source: file.path });
        if (crate === "serde") addItem(items, seen, { name: "Serde", category: "library", source: file.path });
      }
    }
  }
}

function parseGemfile(file: FileEntry, items: TechStackItem[], seen: Set<string>): void {
  addItem(items, seen, { name: "Ruby", category: "language", source: file.path });
  const gemRegex = /gem\s+['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?/g;
  let match: RegExpExecArray | null;
  while ((match = gemRegex.exec(file.content)) !== null) {
    const [, gem, version] = match;
    if (gem === "rails")
      addItem(items, seen, { name: "Ruby on Rails", version, category: "framework", source: file.path });
    if (gem === "sinatra") addItem(items, seen, { name: "Sinatra", version, category: "framework", source: file.path });
    if (gem === "rspec") addItem(items, seen, { name: "RSpec", version, category: "test", source: file.path });
  }
}
