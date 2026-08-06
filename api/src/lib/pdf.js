/**
 * Server-side PDF generation via Puppeteer (headless Chromium).
 *
 * Browser is launched once and reused across requests.
 * Renders a UI print route and returns a PDF buffer that looks identical
 * across Windows / Mac / Linux because rendering happens on the server.
 */
const puppeteer = require('puppeteer');

let browserPromise = null;

function getUiBaseUrl(req) {
  const configured = process.env.UI_URL || process.env.PDF_UI_URL;
  if (configured) return configured.replace(/\/$/, '');

  const origin = req?.headers?.origin || req?.get?.('origin');
  if (origin) return origin.replace(/\/$/, '');

  const referer = req?.headers?.referer || req?.get?.('referer');
  if (referer) {
    try {
      return new URL(referer).origin.replace(/\/$/, '');
    } catch {
      // ignore malformed referer
    }
  }

  return 'http://localhost:3000';
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    }).catch(err => {
      browserPromise = null; // allow retry
      throw err;
    });
  }
  return browserPromise;
}

/**
 * Render a URL to PDF.
 * @param {string} url - Absolute URL to navigate to (UI print route)
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=45000] - Navigation/wait timeout
 * @param {string} [opts.format='A4']
 * @param {object} [opts.margin] - { top, right, bottom, left } e.g. '6mm'
 * @returns {Promise<Buffer>}
 */
async function renderUrlToPdf(url, opts = {}) {
  const {
    timeoutMs = 45000,
    format = 'A4',
    margin = { top: '6mm', right: '6mm', bottom: '10mm', left: '6mm' },
  } = opts;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.emulateMediaType('print');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // Wait for the print page to signal it has finished rendering & loading fonts.
    await page.waitForFunction('window.__printReady === true', { timeout: timeoutMs })
      .catch(() => { /* fall through with whatever is rendered */ });

    // Multi-page React print views can flip from a hidden measurement layer to
    // the real page set just before signaling ready. Wait for those page nodes
    // to exist and survive a couple of paint cycles so Puppeteer captures the
    // final rendered content instead of blank white pages.
    await page.waitForFunction(
      () => {
        const selectors = ['.workorder-page', '.quotation-page', '.handover-page', '.pr-page'];
        const pageNodes = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
        if (pageNodes.length === 0) return document.body?.innerText?.trim()?.length > 0;
        return pageNodes.some((node) => {
          const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
          const rect = node.getBoundingClientRect();
          return text.length > 0 && rect.height > 0;
        });
      },
      { timeout: Math.min(timeoutMs, 10000) },
    ).catch(() => { /* continue with best-effort render */ });

    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // Ignore font readiness failures and keep the current render.
        }
      }

      await new Promise((resolve) => {
        if (typeof requestAnimationFrame !== 'function') {
          setTimeout(resolve, 0);
          return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });

    const pdf = await page.pdf({
      format,
      printBackground: true,
      preferCSSPageSize: true,
      margin,
    });
    // Puppeteer returns Uint8Array on recent versions; convert to Buffer so
    // Express sends raw bytes (not JSON-serialized typed array object).
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

async function closeBrowser() {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch { /* ignore */ }
  browserPromise = null;
}

module.exports = { renderUrlToPdf, closeBrowser, getUiBaseUrl };
