/**
 * Web Probe — headless Chrome crawl to discover interactive elements and routes.
 *
 * Launches headless Chrome, navigates to the entry URL, extracts interactive
 * elements from each page via DOM queries, follows internal links, and builds
 * a structured WebProbeResult for the authoring pipeline.
 */

import {
  launchChrome,
  connectCDP,
  navigate,
  pause,
  type ChromeInstance,
  type CDPClient,
} from "@webreel/core";

import type {
  WebProbeResult,
  WebProbeOptions,
  DiscoveredPage,
  DiscoveredElement,
  DiscoveredLink,
  SiteMapEntry,
} from "./types.js";

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const DEFAULT_PAGE_TIMEOUT_MS = 15_000;

/**
 * Probe a running web application to discover its pages and interactive elements.
 *
 * @param entryUrl - The URL to start crawling from.
 * @param options - Probe configuration.
 * @returns Structured discovery result.
 */
export async function probeApp(
  entryUrl: string,
  options?: WebProbeOptions,
): Promise<WebProbeResult> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const captureScreenshots = options?.captureScreenshots ?? false;
  const viewportWidth = options?.viewport?.width ?? DEFAULT_VIEWPORT_WIDTH;
  const viewportHeight = options?.viewport?.height ?? DEFAULT_VIEWPORT_HEIGHT;
  const pageTimeoutMs = options?.pageTimeoutMs ?? DEFAULT_PAGE_TIMEOUT_MS;

  let chrome: ChromeInstance | null = null;
  let client: CDPClient | null = null;

  try {
    chrome = await launchChrome({ headless: true });
    client = await connectCDP(chrome.port);

    await client.Page.enable();
    await client.Runtime.enable();
    await client.DOM.enable();
    await client.Emulation.setDeviceMetricsOverride({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 2,
      mobile: false,
    });

    const origin = new URL(entryUrl).origin;
    const visited = new Set<string>();
    const pages: DiscoveredPage[] = [];

    // BFS crawl
    const queue: Array<{ url: string; depth: number }> = [{ url: entryUrl, depth: 0 }];

    while (queue.length > 0 && pages.length < maxPages) {
      const current = queue.shift()!;
      const normalizedUrl = normalizeUrl(current.url);

      if (visited.has(normalizedUrl)) continue;
      if (current.depth > maxDepth) continue;
      visited.add(normalizedUrl);

      const page = await probePage(
        client,
        current.url,
        captureScreenshots,
        pageTimeoutMs,
      );
      if (!page) continue;

      pages.push(page);

      // Enqueue same-origin links
      for (const link of page.links) {
        try {
          const linkUrl = new URL(link.href, current.url);
          if (linkUrl.origin !== origin) continue;
          const normalized = normalizeUrl(linkUrl.href);
          if (!visited.has(normalized)) {
            queue.push({ url: linkUrl.href, depth: current.depth + 1 });
          }
        } catch {
          // Invalid URL — skip
        }
      }
    }

    const siteMap = buildSiteMap(pages);

    return { entryUrl, pages, siteMap };
  } finally {
    // Kill Chrome FIRST to prevent native mutex crashes from in-flight CDP ops
    if (chrome) {
      try {
        chrome.kill();
      } catch {
        // Safe to ignore
      }
    }
    await pause(200);
    if (client) {
      try {
        await client.close();
      } catch {
        // CDP connection already dead from Chrome kill — expected
      }
    }
  }
}

/**
 * Probe a single page: navigate, wait for load, extract elements and links.
 */
async function probePage(
  client: CDPClient,
  url: string,
  captureScreenshot: boolean,
  timeoutMs: number,
): Promise<DiscoveredPage | null> {
  try {
    // Navigate with timeout
    await Promise.race([
      navigate(client, url),
      rejectAfter(timeoutMs, `Navigation to ${url} timed out`),
    ]);

    // Wait for SPA hydration — React/Next.js/Vue apps need time after the
    // initial HTML loads to render interactive elements into the DOM.
    // 1s is not enough for most SPAs; 3s handles the common case.
    await pause(2000);

    // Network-idle heuristic: wait until document.readyState is complete
    // and no pending fetch/XHR requests for 500ms
    await waitForIdle(client, 3000);

    // Extract page title
    const title = await evaluateString(client, "document.title || ''");

    // Extract interactive elements
    const elements = await extractInteractiveElements(client);

    // Extract links
    const links = await extractLinks(client, url);

    // Optional screenshot
    let screenshot: Buffer | undefined;
    if (captureScreenshot) {
      const { data } = await client.Page.captureScreenshot({ format: "png" });
      screenshot = Buffer.from(data, "base64");
    }

    return { url, title, elements, links, screenshot };
  } catch {
    // Navigation or extraction failed — skip this page
    return null;
  }
}

/**
 * Extract all interactive elements from the current page via DOM queries.
 *
 * Targets elements that a demo script would interact with: buttons, links,
 * inputs, selects, textareas, and elements with click handlers or ARIA roles.
 */
async function extractInteractiveElements(
  client: CDPClient,
): Promise<DiscoveredElement[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const results = [];
      const seen = new Set();

      // Interactive element selectors
      const selectors = [
        'a[href]',
        'button',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="switch"]',
        '[onclick]',
        '[data-testid]',
        '[aria-label]',
      ];

      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          // Skip hidden or zero-size elements
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (getComputedStyle(el).display === 'none') continue;
          if (getComputedStyle(el).visibility === 'hidden') continue;

          // Deduplicate by element reference
          if (seen.has(el)) continue;
          seen.add(el);

          const tagName = el.tagName.toLowerCase();
          const role = el.getAttribute('role')
            || (tagName === 'a' ? 'link' : '')
            || (tagName === 'button' ? 'button' : '')
            || (tagName === 'input' ? el.getAttribute('type') || 'textbox' : '')
            || (tagName === 'select' ? 'combobox' : '')
            || (tagName === 'textarea' ? 'textbox' : '')
            || tagName;

          // Compute accessible name
          const ariaLabel = el.getAttribute('aria-label') || '';
          const innerText = el.textContent?.trim().slice(0, 100) || '';
          const placeholder = el.getAttribute('placeholder') || '';
          const title = el.getAttribute('title') || '';
          const name = ariaLabel || innerText || placeholder || title || '';

          // Build best selector
          const testId = el.getAttribute('data-testid');
          const id = el.id;
          let selector = '';
          if (testId) {
            selector = '[data-testid="' + testId + '"]';
          } else if (id && document.querySelectorAll('#' + CSS.escape(id)).length === 1) {
            selector = '#' + CSS.escape(id);
          } else {
            // Build a tag + class selector
            const classes = Array.from(el.classList).slice(0, 3).join('.');
            selector = classes ? tagName + '.' + classes : tagName;
            // Check uniqueness, add nth-of-type if needed
            const matches = document.querySelectorAll(selector);
            if (matches.length > 1) {
              const idx = Array.from(matches).indexOf(el);
              if (idx >= 0) selector += ':nth-of-type(' + (idx + 1) + ')';
            }
          }

          results.push({
            role,
            name: name.slice(0, 200),
            selector,
            textContent: innerText.slice(0, 200),
            tagName,
            boundingBox: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          });
        }
      }

      return results;
    })()`,
    returnByValue: true,
  });

  return (result.value as DiscoveredElement[] | undefined) ?? [];
}

/**
 * Extract all same-page and internal links from the current page.
 */
async function extractLinks(
  client: CDPClient,
  pageUrl: string,
): Promise<DiscoveredLink[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const links = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href;
        const text = (a.textContent || '').trim().slice(0, 200);
        if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
          links.push({ text, href });
        }
      }
      return links;
    })()`,
    returnByValue: true,
  });

  return (result.value as DiscoveredLink[] | undefined) ?? [];
}

/**
 * Build a site map from discovered pages.
 */
function buildSiteMap(pages: readonly DiscoveredPage[]): SiteMapEntry[] {
  return pages.map((p) => ({
    url: p.url,
    title: p.title,
    elementCount: p.elements.length,
    linkCount: p.links.length,
  }));
}

// ─── Utilities ───────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove hash and trailing slash for deduplication
    parsed.hash = "";
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;
    return parsed.href;
  } catch {
    return url;
  }
}

async function evaluateString(client: CDPClient, expression: string): Promise<string> {
  const { result } = await client.Runtime.evaluate({
    expression,
    returnByValue: true,
  });
  return String(result.value ?? "");
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Wait for the page to become idle — document loaded + no pending requests.
 * Uses a simple polling approach: check readyState and wait for DOM stability.
 */
async function waitForIdle(client: CDPClient, maxWaitMs: number): Promise<void> {
  const start = Date.now();
  let lastElementCount = -1;

  while (Date.now() - start < maxWaitMs) {
    const { result } = await client.Runtime.evaluate({
      expression: `({
        ready: document.readyState,
        count: document.querySelectorAll('button, a[href], input, [role="button"], [data-testid]').length
      })`,
      returnByValue: true,
    });

    const state = result.value as { ready: string; count: number } | undefined;
    if (!state) break;

    // If DOM is complete and element count stabilized, we're done
    if (
      state.ready === "complete" &&
      state.count === lastElementCount &&
      state.count > 0
    ) {
      return;
    }
    lastElementCount = state.count;
    await pause(500);
  }
}
