# Talos UI Test Fixtures

Reusable typed fixtures, factories, and helpers for Playwright e2e specs
(epic #537 — sub-issues #540, #541).

## Layout

```
ui/tests/fixtures/
├── README.md            # this file
├── factories.ts         # typed make*() factories for every domain entity
├── socket.ts            # stubSocket(page) + emitSocketEvent(page, ev, data)
├── route.ts             # mockApi(page, [{ url, method, status, body }])
├── artifacts/           # small (<50KB) sample artifact files for #545
├── docs/                # small markdown files for #553 RAG ingestion
└── exports/             # small valid ZIP fixture for #551
```

## Factories — `factories.ts`

Every backend type used in the UI has a `make*()` factory. Each factory
accepts a `Partial<T>` override and returns a fully-populated, type-checked
object that mirrors the wire format.

```ts
import { makeApplication, makeTest, makeVaultRole } from "./fixtures/factories";

const app = makeApplication({ name: "Acme E2E" });
const tests = [
  makeTest({ name: "Login flow", type: "smoke" }),
  makeTest({ name: "Checkout", type: "e2e" }),
];
const role = makeVaultRole({ applicationId: app.id, roleType: "admin" });
```

Available factories:

| Factory | Returns |
|---|---|
| `makeApplication` | `TalosApplication` |
| `makeVaultRole` | `TalosVaultRole` |
| `makeTest` | `TalosTest` |
| `makeTestRun` | `TalosTestRun` |
| `makeArtifact` | `TalosTestArtifact` |
| `makeGeneratedTest` | `GeneratedTestWithPath` (incl. `generationPath` + `chunkCount`) |
| `makeKnowledgeStats` | `KnowledgeStats` |
| `makeKnowledgeDocument` | `KnowledgeDocument` |
| `makeChunk` | RAG chunk shape (`{ filePath, score, snippet, ... }`) |
| `makeChatSession` | `ChatSession` |
| `makeAgent` | structural agent shape |
| `makeSkill` | structural skill shape |
| `makePrompt` | structural prompt shape |
| `makeSchedule` | structural schedule shape |
| `makeTask` | structural task shape |
| `makeApiKey` | `{ id, name, maskedKey, createdAt, lastUsedAt }` |

## API mocking — `route.ts`

```ts
import { mockApi } from "./fixtures/route";
import { makeApplication } from "./fixtures/factories";

await mockApi(page, [
  { url: "**/api/talos/applications", method: "GET", body: [makeApplication()] },
  { url: "**/api/talos/applications", method: "POST", status: 201, body: makeApplication({ id: "new-app" }) },
  {
    url: /\/api\/talos\/tests\/.+\/run/,
    method: "POST",
    handler: async (route) => {
      await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ runId: "abc" }) });
    },
  },
]);
```

`jsonResponse(body, status?)` is a one-liner for ad-hoc per-test routes.

## Socket.IO mocking — `socket.ts`

```ts
import { stubSocket, emitSocketEvent, emitSocketSequence } from "./fixtures/socket";

test.beforeEach(async ({ page }) => {
  await stubSocket(page);
});

test("workbench pipeline", async ({ page }) => {
  // ...navigate, trigger flow...
  await emitSocketSequence(page, [
    { event: "discovery:start", data: { jobId: "j1" }, delayMs: 50 },
    { event: "discovery:progress", data: { jobId: "j1", progress: 50 }, delayMs: 50 },
    { event: "discovery:complete", data: { jobId: "j1" } },
  ]);
});
```

The stub:

- Intercepts only `WebSocket` connections whose URL contains `/socket.io/`
- Replays the EIO4 handshake (`0{...}` then `40{...}`) so `socket.io-client`
  thinks it has connected
- Records every client `send()` to `window.__sentSocketMessages` for
  optional assertion of outbound events

## Conventions

- Every `test()` carries an `// AC: <issue#> <criterion>` comment for
  traceability
- Use accessible locators only (`getByRole`, `getByLabel`, `getByText`)
- Each spec mocks the APIs it needs in `beforeEach` — never seed real DBs
- Artifact / doc / zip fixtures must stay small (target <50KB each, total
  fixture footprint <500KB)
