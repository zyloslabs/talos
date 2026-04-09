/**
 * Talos Crawler Subsystem
 *
 * Web application crawling with accessibility-tree-based DOM distillation.
 */

export { WebCrawler, type WebCrawlerOptions, type BrowserLauncher, type PlaywrightBrowserLike, type PlaywrightPageLike, type PageSnapshot } from "./web-crawler.js";
export { DomDistiller, type DistillResult } from "./dom-distiller.js";
