import { describe, it, expect } from "vitest";
import { detectTechStack } from "./tech-stack-detector.js";

describe("detectTechStack", () => {
  it("detects npm dependencies from package.json", () => {
    const files = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { react: "^18.2.0", next: "^14.0.0", express: "^4.18.2" },
          devDependencies: { typescript: "^5.3.0", vitest: "^1.0.0", eslint: "^8.0.0" },
        }),
      },
    ];

    const { techStack, configFiles } = detectTechStack(files);

    expect(techStack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "React", category: "framework" }),
        expect.objectContaining({ name: "Next.js", category: "framework" }),
        expect.objectContaining({ name: "Express", category: "framework" }),
        expect.objectContaining({ name: "TypeScript", category: "build" }),
        expect.objectContaining({ name: "Vitest", category: "test" }),
        expect.objectContaining({ name: "ESLint", category: "lint" }),
      ])
    );
    expect(configFiles).toEqual(expect.arrayContaining([{ filePath: "package.json", type: "npm" }]));
  });

  it("deduplicates entries (react + react-dom → single React)", () => {
    const files = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
        }),
      },
    ];
    const { techStack } = detectTechStack(files);
    const reactItems = techStack.filter((t) => t.name === "React");
    expect(reactItems).toHaveLength(1);
  });

  it("detects Python packages from requirements.txt", () => {
    const files = [
      {
        path: "requirements.txt",
        content: "django==4.2.0\nflask>=2.0\npytest\nsqlalchemy~=2.0\n# comment\n",
      },
    ];
    const { techStack } = detectTechStack(files);
    expect(techStack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Django", category: "framework" }),
        expect.objectContaining({ name: "Flask", category: "framework" }),
        expect.objectContaining({ name: "pytest", category: "test" }),
        expect.objectContaining({ name: "SQLAlchemy", category: "library" }),
      ])
    );
  });

  it("detects Java dependencies from pom.xml", () => {
    const files = [
      {
        path: "pom.xml",
        content: `<project>
          <dependencies>
            <dependency>
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-starter-web</artifactId>
              <version>3.2.0</version>
            </dependency>
            <dependency>
              <groupId>org.hibernate</groupId>
              <artifactId>hibernate-core</artifactId>
              <version>6.4.0</version>
            </dependency>
          </dependencies>
        </project>`,
      },
    ];
    const { techStack } = detectTechStack(files);
    expect(techStack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Spring Boot", category: "framework" }),
        expect.objectContaining({ name: "Hibernate", category: "library" }),
      ])
    );
  });

  it("detects Go modules from go.mod", () => {
    const files = [
      {
        path: "go.mod",
        content: `module example.com/myapp
go 1.21
require (
    github.com/gin-gonic/gin v1.9.1
    github.com/labstack/echo/v4 v4.11.0
)`,
      },
    ];
    const { techStack } = detectTechStack(files);
    expect(techStack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Go", category: "language" }),
        expect.objectContaining({ name: "Gin", category: "framework" }),
        expect.objectContaining({ name: "Echo", category: "framework" }),
      ])
    );
  });

  it("detects Rust crates from Cargo.toml", () => {
    const files = [
      {
        path: "Cargo.toml",
        content: `[package]
name = "myapp"
version = "0.1.0"

[dependencies]
actix-web = "4"
serde = "1"
tokio = { version = "1", features = ["full"] }`,
      },
    ];
    const { techStack } = detectTechStack(files);
    expect(techStack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Rust", category: "language" }),
        expect.objectContaining({ name: "Actix Web", category: "framework" }),
        expect.objectContaining({ name: "Serde", category: "library" }),
        expect.objectContaining({ name: "Tokio", category: "library" }),
      ])
    );
  });

  it("detects Ruby gems from Gemfile", () => {
    const files = [
      {
        path: "Gemfile",
        content: `source 'https://rubygems.org'
gem 'rails', '~> 7.0'
gem 'rspec', '~> 3.12'`,
      },
    ];
    const { techStack } = detectTechStack(files);
    expect(techStack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Ruby", category: "language" }),
        expect.objectContaining({ name: "Ruby on Rails", category: "framework" }),
        expect.objectContaining({ name: "RSpec", category: "test" }),
      ])
    );
  });

  it("detects Gradle dependencies", () => {
    const files = [
      {
        path: "build.gradle",
        content: `dependencies {
    implementation 'org.springframework.boot:spring-boot-starter:3.2.0'
    testImplementation 'junit:junit:4.13.2'
}`,
      },
    ];
    const { techStack } = detectTechStack(files);
    expect(techStack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Spring Boot", category: "framework" }),
        expect.objectContaining({ name: "JUnit", category: "test" }),
      ])
    );
  });

  it("identifies config files across multiple types", () => {
    const files = [
      { path: "tsconfig.json", content: "{}" },
      { path: "vitest.config.ts", content: "" },
      { path: "Dockerfile", content: "FROM node:20" },
      { path: ".env", content: "" },
      { path: "docker-compose.yml", content: "" },
    ];
    const { configFiles } = detectTechStack(files);
    expect(configFiles).toEqual(
      expect.arrayContaining([
        { filePath: "tsconfig.json", type: "typescript" },
        { filePath: "vitest.config.ts", type: "vitest" },
        { filePath: "Dockerfile", type: "docker" },
        { filePath: ".env", type: "dotenv" },
        { filePath: "docker-compose.yml", type: "docker-compose" },
      ])
    );
  });

  it("handles malformed package.json gracefully", () => {
    const files = [{ path: "package.json", content: "not json" }];
    const { techStack } = detectTechStack(files);
    expect(techStack).toEqual([]);
  });

  it("returns empty for files with no known manifests", () => {
    const files = [
      { path: "src/index.ts", content: "console.log('hello')" },
      { path: "README.md", content: "# Hello" },
    ];
    const { techStack, configFiles } = detectTechStack(files);
    expect(techStack).toEqual([]);
    expect(configFiles).toEqual([]);
  });
});
