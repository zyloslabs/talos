/**
 * VisualRegressionEngine — Pure-TypeScript pixel comparison.
 *
 * Compares PNG screenshots as raw pixel buffers without native dependencies.
 * Parses minimal PNG structure to extract raw RGBA pixels.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { inflateSync } from "node:zlib";
import type { VisualComparisonResult, VisualBaseline, DiffRegion } from "./types.js";

export type VisualRegressionOptions = {
  /** Diff threshold percentage (0-100). Default 0.1 */
  threshold?: number;
  /** Base directory for baselines. Default ~/.talos/baselines */
  baselineDir?: string;
};

export class VisualRegressionEngine {
  private threshold: number;
  private baselineDir: string;

  constructor(options: VisualRegressionOptions = {}) {
    this.threshold = options.threshold ?? 0.1;
    this.baselineDir =
      options.baselineDir ?? join(homedir(), ".talos", "baselines");
  }

  /**
   * Store a PNG buffer as the baseline for a given app/page.
   */
  captureBaseline(appId: string, pageId: string, screenshotBuffer: Buffer): VisualBaseline {
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safePageId = pageId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dir = join(this.baselineDir, safeAppId);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${safePageId}.png`);
    writeFileSync(filePath, screenshotBuffer);

    const { width, height } = this.readPngDimensions(screenshotBuffer);

    return {
      appId,
      pageId,
      filePath,
      capturedAt: new Date().toISOString(),
      width,
      height,
    };
  }

  /**
   * Compare a current screenshot buffer against the stored baseline.
   */
  compare(
    appId: string,
    pageId: string,
    currentBuffer: Buffer,
    options?: { threshold?: number }
  ): VisualComparisonResult {
    const baselinePath = join(this.baselineDir, appId.replace(/[^a-zA-Z0-9_-]/g, "_"), `${pageId.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`);
    if (!existsSync(baselinePath)) {
      throw new Error(
        `No baseline found for app=${appId}, page=${pageId}. Capture a baseline first.`
      );
    }

    const baselineBuffer = readFileSync(baselinePath);
    return this.compareBuffers(baselineBuffer, currentBuffer, options?.threshold ?? this.threshold);
  }

  /**
   * Compare two PNG buffers directly (no file system).
   */
  compareBuffers(
    baselineBuffer: Buffer,
    currentBuffer: Buffer,
    threshold?: number
  ): VisualComparisonResult {
    const effectiveThreshold = threshold ?? this.threshold;

    const baselinePixels = this.decodePngToRgba(baselineBuffer);
    const currentPixels = this.decodePngToRgba(currentBuffer);

    const baselineDim = this.readPngDimensions(baselineBuffer);
    const currentDim = this.readPngDimensions(currentBuffer);

    if (
      baselineDim.width !== currentDim.width ||
      baselineDim.height !== currentDim.height
    ) {
      // Dimension mismatch — 100% different
      const totalPixels = Math.max(
        baselineDim.width * baselineDim.height,
        currentDim.width * currentDim.height
      );
      return {
        matches: false,
        diffPercentage: 100,
        threshold: effectiveThreshold,
        totalPixels,
        diffPixelCount: totalPixels,
        diffRegions: [
          {
            x: 0,
            y: 0,
            width: Math.max(baselineDim.width, currentDim.width),
            height: Math.max(baselineDim.height, currentDim.height),
          },
        ],
        width: currentDim.width,
        height: currentDim.height,
      };
    }

    const { width, height } = baselineDim;
    const totalPixels = width * height;
    let diffPixelCount = 0;

    // Track diff coordinates for region detection
    const diffGrid: boolean[] = new Array(totalPixels).fill(false);

    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      const dr = Math.abs(baselinePixels[offset] - currentPixels[offset]);
      const dg = Math.abs(baselinePixels[offset + 1] - currentPixels[offset + 1]);
      const db = Math.abs(baselinePixels[offset + 2] - currentPixels[offset + 2]);
      const da = Math.abs(baselinePixels[offset + 3] - currentPixels[offset + 3]);

      // A pixel is "different" if any channel differs by more than a small tolerance
      if (dr > 3 || dg > 3 || db > 3 || da > 3) {
        diffPixelCount++;
        diffGrid[i] = true;
      }
    }

    const diffPercentage = totalPixels > 0 ? (diffPixelCount / totalPixels) * 100 : 0;
    const diffRegions = this.findDiffRegions(diffGrid, width, height);

    return {
      matches: diffPercentage <= effectiveThreshold,
      diffPercentage: Math.round(diffPercentage * 10000) / 10000,
      threshold: effectiveThreshold,
      totalPixels,
      diffPixelCount,
      diffRegions,
      width,
      height,
    };
  }

  // ── PNG Parsing ─────────────────────────────────────────────────────────

  /**
   * Read PNG width and height from the IHDR chunk.
   */
  readPngDimensions(buffer: Buffer): { width: number; height: number } {
    // PNG signature: 8 bytes, then IHDR chunk
    // IHDR offset: 8 (sig) + 4 (length) + 4 (type) = 16
    if (buffer.length < 24) {
      throw new Error("Invalid PNG: too small");
    }
    // Verify PNG signature
    const sig = buffer.subarray(0, 8);
    if (
      sig[0] !== 0x89 ||
      sig[1] !== 0x50 ||
      sig[2] !== 0x4e ||
      sig[3] !== 0x47
    ) {
      throw new Error("Invalid PNG signature");
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  /**
   * Decode PNG to raw RGBA pixel data.
   * Supports 8-bit RGBA (color type 6) and 8-bit RGB (color type 2).
   */
  decodePngToRgba(buffer: Buffer): Uint8Array {
    const { width, height } = this.readPngDimensions(buffer);
    const colorType = buffer[25];
    const bitDepth = buffer[24];

    if (bitDepth !== 8) {
      throw new Error(`Unsupported PNG bit depth: ${bitDepth}. Only 8-bit PNGs are supported.`);
    }

    // Collect all IDAT chunk data
    const idatChunks: Buffer[] = [];
    let offset = 8; // Skip signature
    while (offset < buffer.length) {
      const chunkLength = buffer.readUInt32BE(offset);
      const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");
      if (chunkType === "IDAT") {
        idatChunks.push(buffer.subarray(offset + 8, offset + 8 + chunkLength));
      }
      offset += 12 + chunkLength; // length + type + data + CRC
    }

    const compressed = Buffer.concat(idatChunks);
    const inflated = inflateSync(compressed);

    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 4;
    const rowBytes = width * channels + 1; // +1 for filter byte

    const pixels = new Uint8Array(width * height * 4);

    // Previous row for reconstruction filters
    const prevRow = new Uint8Array(width * channels);
    const currentRow = new Uint8Array(width * channels);

    for (let y = 0; y < height; y++) {
      const rowStart = y * rowBytes;
      const filterType = inflated[rowStart];

      // Extract raw scanline (without filter byte)
      for (let x = 0; x < width * channels; x++) {
        currentRow[x] = inflated[rowStart + 1 + x];
      }

      // Apply reconstruction filter
      this.applyFilter(filterType, currentRow, prevRow, channels);

      // Convert to RGBA
      for (let x = 0; x < width; x++) {
        const srcOffset = x * channels;
        const dstOffset = (y * width + x) * 4;
        pixels[dstOffset] = currentRow[srcOffset]; // R
        pixels[dstOffset + 1] = currentRow[srcOffset + 1]; // G
        pixels[dstOffset + 2] = currentRow[srcOffset + 2]; // B
        pixels[dstOffset + 3] = channels === 4 ? currentRow[srcOffset + 3] : 255; // A
      }

      // Copy current to previous
      prevRow.set(currentRow);
    }

    return pixels;
  }

  private applyFilter(
    filterType: number,
    row: Uint8Array,
    prevRow: Uint8Array,
    bpp: number
  ): void {
    switch (filterType) {
      case 0: // None
        break;
      case 1: // Sub
        for (let i = bpp; i < row.length; i++) {
          row[i] = (row[i] + row[i - bpp]) & 0xff;
        }
        break;
      case 2: // Up
        for (let i = 0; i < row.length; i++) {
          row[i] = (row[i] + prevRow[i]) & 0xff;
        }
        break;
      case 3: // Average
        for (let i = 0; i < row.length; i++) {
          const a = i >= bpp ? row[i - bpp] : 0;
          const b = prevRow[i];
          row[i] = (row[i] + Math.floor((a + b) / 2)) & 0xff;
        }
        break;
      case 4: // Paeth
        for (let i = 0; i < row.length; i++) {
          const a = i >= bpp ? row[i - bpp] : 0;
          const b = prevRow[i];
          const c = i >= bpp ? prevRow[i - bpp] : 0;
          row[i] = (row[i] + this.paethPredictor(a, b, c)) & 0xff;
        }
        break;
      default:
        throw new Error(`Unknown PNG filter type: ${filterType}`);
    }
  }

  private paethPredictor(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  // ── Diff Region Detection ─────────────────────────────────────────────

  private findDiffRegions(
    diffGrid: boolean[],
    width: number,
    height: number
  ): DiffRegion[] {
    if (width === 0 || height === 0) return [];

    // Simple approach: find bounding boxes of contiguous diff areas
    // using connected component labeling with a grid scan
    const visited = new Uint8Array(diffGrid.length);
    const regions: DiffRegion[] = [];

    for (let i = 0; i < diffGrid.length; i++) {
      if (!diffGrid[i] || visited[i]) continue;

      // BFS to find connected region
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      const queue = [i];
      visited[i] = 1;

      while (queue.length > 0) {
        const idx = queue.pop()!;
        const x = idx % width;
        const y = Math.floor(idx / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        // Check 4-connected neighbors
        const neighbors = [
          y > 0 ? idx - width : -1,
          y < height - 1 ? idx + width : -1,
          x > 0 ? idx - 1 : -1,
          x < width - 1 ? idx + 1 : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && diffGrid[n] && !visited[n]) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }

      regions.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
    }

    return regions;
  }
}
