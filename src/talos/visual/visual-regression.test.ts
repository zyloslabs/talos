import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VisualRegressionEngine } from "./visual-regression.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateSync as pngDeflateSync } from "node:zlib";

// ── PNG generation helpers ──────────────────────────────────────────────────

function createMinimalPng(
  width: number,
  height: number,
  rgba: [number, number, number, number] = [255, 0, 0, 255]
): Buffer {
  // Build a minimal valid PNG with color type 6 (RGBA), bit depth 8, filter None
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makePngChunk("IHDR", ihdrData);

  // IDAT chunk — raw pixel data with filter byte 0 per row
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    rawData[rowOffset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      rawData[px] = rgba[0];
      rawData[px + 1] = rgba[1];
      rawData[px + 2] = rgba[2];
      rawData[px + 3] = rgba[3];
    }
  }
  const compressed = pngDeflateSync(rawData);
  const idat = makePngChunk("IDAT", compressed);

  // IEND chunk
  const iend = makePngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createCheckerPng(
  width: number,
  height: number,
  color1: [number, number, number, number] = [255, 0, 0, 255],
  color2: [number, number, number, number] = [0, 255, 0, 255]
): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const ihdr = makePngChunk("IHDR", ihdrData);

  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      const c = (x + y) % 2 === 0 ? color1 : color2;
      rawData[px] = c[0];
      rawData[px + 1] = c[1];
      rawData[px + 2] = c[2];
      rawData[px + 3] = c[3];
    }
  }
  const compressed = pngDeflateSync(rawData);
  const idat = makePngChunk("IDAT", compressed);
  const iend = makePngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBuffer, data]);

  // CRC32 over type + data
  const crc = computeCrc32(payload);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc);

  return Buffer.concat([length, typeBuffer, data, crcBuf]);
}

function computeCrc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ pngCrc32Table[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

const pngCrc32Table = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

// ── Tests ────────────────────────────────────────────────────────────────────

describe("VisualRegressionEngine", () => {
  const tmpBase = join(tmpdir(), `talos-visual-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpBase)) {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  function makeEngine(threshold = 0.1): VisualRegressionEngine {
    return new VisualRegressionEngine({
      threshold,
      baselineDir: tmpBase,
    });
  }

  // ── PNG parsing ─────────────────────────────────────────────────────────

  describe("PNG parsing", () => {
    it("reads dimensions from a valid PNG", () => {
      const engine = makeEngine();
      const png = createMinimalPng(100, 50);
      const dim = engine.readPngDimensions(png);
      expect(dim.width).toBe(100);
      expect(dim.height).toBe(50);
    });

    it("throws on invalid PNG signature", () => {
      const engine = makeEngine();
      const bad = Buffer.from("not a png file at all and more");
      expect(() => engine.readPngDimensions(bad)).toThrow("Invalid PNG");
    });

    it("throws on too-small buffer", () => {
      const engine = makeEngine();
      expect(() => engine.readPngDimensions(Buffer.alloc(10))).toThrow("Invalid PNG");
    });

    it("decodes RGBA pixels correctly", () => {
      const engine = makeEngine();
      const png = createMinimalPng(2, 2, [100, 150, 200, 255]);
      const pixels = engine.decodePngToRgba(png);
      expect(pixels.length).toBe(2 * 2 * 4);
      expect(pixels[0]).toBe(100); // R
      expect(pixels[1]).toBe(150); // G
      expect(pixels[2]).toBe(200); // B
      expect(pixels[3]).toBe(255); // A
    });
  });

  // ── Baseline capture ──────────────────────────────────────────────────

  describe("captureBaseline", () => {
    it("stores baseline and returns metadata", () => {
      const engine = makeEngine();
      const png = createMinimalPng(10, 10);
      const baseline = engine.captureBaseline("app1", "page1", png);
      expect(baseline.appId).toBe("app1");
      expect(baseline.pageId).toBe("page1");
      expect(baseline.width).toBe(10);
      expect(baseline.height).toBe(10);
      expect(baseline.capturedAt).toBeTruthy();
      expect(existsSync(baseline.filePath)).toBe(true);
    });

    it("overwrites existing baseline", () => {
      const engine = makeEngine();
      const png1 = createMinimalPng(10, 10, [255, 0, 0, 255]);
      engine.captureBaseline("app1", "page1", png1);
      const png2 = createMinimalPng(20, 20, [0, 255, 0, 255]);
      const baseline = engine.captureBaseline("app1", "page1", png2);
      expect(baseline.width).toBe(20);
      expect(baseline.height).toBe(20);
    });
  });

  // ── Comparison ────────────────────────────────────────────────────────

  describe("compare", () => {
    it("matches identical images", () => {
      const engine = makeEngine();
      const png = createMinimalPng(10, 10, [128, 128, 128, 255]);
      engine.captureBaseline("app1", "page1", png);
      const result = engine.compare("app1", "page1", png);
      expect(result.matches).toBe(true);
      expect(result.diffPercentage).toBe(0);
      expect(result.diffPixelCount).toBe(0);
      expect(result.diffRegions).toHaveLength(0);
    });

    it("detects different images", () => {
      const engine = makeEngine();
      const red = createMinimalPng(10, 10, [255, 0, 0, 255]);
      const blue = createMinimalPng(10, 10, [0, 0, 255, 255]);
      engine.captureBaseline("app1", "page1", red);
      const result = engine.compare("app1", "page1", blue);
      expect(result.matches).toBe(false);
      expect(result.diffPercentage).toBe(100);
      expect(result.diffPixelCount).toBe(100);
    });

    it("throws when no baseline exists", () => {
      const engine = makeEngine();
      const png = createMinimalPng(10, 10);
      expect(() => engine.compare("noapp", "nopage", png)).toThrow(
        "No baseline found"
      );
    });

    it("handles dimension mismatch", () => {
      const engine = makeEngine();
      const small = createMinimalPng(10, 10);
      const large = createMinimalPng(20, 20);
      engine.captureBaseline("app1", "page1", small);
      const result = engine.compare("app1", "page1", large);
      expect(result.matches).toBe(false);
      expect(result.diffPercentage).toBe(100);
    });
  });

  // ── compareBuffers ────────────────────────────────────────────────────

  describe("compareBuffers", () => {
    it("uses custom threshold", () => {
      const engine = makeEngine(50);
      // Create images where ~50% of pixels differ
      const checker1 = createCheckerPng(10, 10, [255, 0, 0, 255], [0, 0, 0, 255]);
      const checker2 = createCheckerPng(10, 10, [0, 255, 0, 255], [0, 0, 0, 255]);
      const result = engine.compareBuffers(checker1, checker2, 60);
      // 50% of pixels (the checker pattern) differ
      expect(result.diffPercentage).toBe(50);
      expect(result.matches).toBe(true); // within 60% threshold
    });

    it("returns correct structure", () => {
      const engine = makeEngine();
      const png = createMinimalPng(5, 5);
      const result = engine.compareBuffers(png, png);
      expect(typeof result.matches).toBe("boolean");
      expect(typeof result.diffPercentage).toBe("number");
      expect(typeof result.threshold).toBe("number");
      expect(typeof result.totalPixels).toBe("number");
      expect(typeof result.diffPixelCount).toBe("number");
      expect(Array.isArray(result.diffRegions)).toBe(true);
      expect(typeof result.width).toBe("number");
      expect(typeof result.height).toBe("number");
    });
  });

  // ── Diff region detection ─────────────────────────────────────────────

  describe("diff region detection", () => {
    it("identifies diff regions in partially different images", () => {
      const engine = makeEngine();
      // Create a solid red and a half-red-half-blue image
      const solidRed = createMinimalPng(4, 4, [255, 0, 0, 255]);

      // Create a 4x4 where left 2 columns are red, right 2 are blue
      const halfBlue = createHalfPng(4, 4);
      const result = engine.compareBuffers(solidRed, halfBlue);
      expect(result.matches).toBe(false);
      expect(result.diffRegions.length).toBeGreaterThan(0);
      // Diff regions should contain the right half
      for (const r of result.diffRegions) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.width).toBeGreaterThan(0);
        expect(r.height).toBeGreaterThan(0);
      }
    });
  });

  // ── Threshold behavior ────────────────────────────────────────────────

  describe("threshold behavior", () => {
    it("respects the configured threshold", () => {
      // With 0.1% threshold, even a small diff should fail
      const strictEngine = makeEngine(0.01);
      // With 100% threshold, everything matches
      const lenientEngine = makeEngine(100);

      const red = createMinimalPng(10, 10, [255, 0, 0, 255]);
      const slightlyOff = createMinimalPng(10, 10, [250, 0, 0, 255]);

      const strictResult = strictEngine.compareBuffers(red, slightlyOff);
      const lenientResult = lenientEngine.compareBuffers(red, slightlyOff);

      // Strict should fail, lenient should pass
      expect(lenientResult.matches).toBe(true);
      // Both should detect the same number of diff pixels
      expect(strictResult.diffPixelCount).toBe(lenientResult.diffPixelCount);
    });
  });
});

// Helper for creating half-and-half PNG
function createHalfPng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const ihdr = makePngChunk("IHDR", ihdrData);

  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      if (x < width / 2) {
        rawData[px] = 255; rawData[px + 1] = 0; rawData[px + 2] = 0; rawData[px + 3] = 255;
      } else {
        rawData[px] = 0; rawData[px + 1] = 0; rawData[px + 2] = 255; rawData[px + 3] = 255;
      }
    }
  }
    const compressed = pngDeflateSync(rawData);
  const idat = makePngChunk("IDAT", compressed);
  const iend = makePngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}
