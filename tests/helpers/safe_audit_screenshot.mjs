import fs from 'node:fs';

function toPositiveSize(value) {
  const size = Math.ceil(Number(value) || 0);
  return Math.max(1, size);
}

async function withTimeout(promise, timeoutMs, label) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function captureScreenshotViaCdp(page, outPath, fullPage, timeoutMs) {
  const session = await page.context().newCDPSession(page);
  try {
    let screenshot;

    if (fullPage) {
      const metrics = await withTimeout(
        session.send('Page.getLayoutMetrics'),
        timeoutMs,
        'Page.getLayoutMetrics',
      );
      const size = metrics.cssContentSize || metrics.contentSize || { width: 1, height: 1 };
      screenshot = await withTimeout(
        session.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width: toPositiveSize(size.width),
            height: toPositiveSize(size.height),
            scale: 1,
          },
        }),
        timeoutMs,
        'Page.captureScreenshot',
      );
    } else {
      screenshot = await withTimeout(
        session.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
        }),
        timeoutMs,
        'Page.captureScreenshot',
      );
    }

    fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'));
    return true;
  } finally {
    await session.detach().catch(() => {});
  }
}

export async function safeAuditScreenshot(page, outPath, label, options = {}) {
  const fullPage = options.fullPage !== false;
  const timeout = Number.isFinite(options.timeout) ? options.timeout : 8000;
  const cdpTimeout = Number.isFinite(options.cdpTimeout) ? options.cdpTimeout : 0;
  const fallbackToPlaywright = options.fallbackToPlaywright !== false;

  if (options.preferCdp === true) {
    try {
      await captureScreenshotViaCdp(page, outPath, fullPage, cdpTimeout);
      return true;
    } catch (err) {
      if (!fallbackToPlaywright) {
        console.warn(`[${label}] screenshot skipped after CDP capture failed: ${err?.message || err}`);
        return false;
      }
      console.warn(`[${label}] screenshot CDP capture failed, falling back to Playwright: ${err?.message || err}`);
    }
  }

  try {
    await page.screenshot({
      path: outPath,
      fullPage,
      animations: 'disabled',
      timeout,
    });
    return true;
  } catch (err) {
    try {
      await captureScreenshotViaCdp(page, outPath, fullPage, cdpTimeout);
      console.warn(`[${label}] screenshot fallback captured after Playwright timeout: ${err?.message || err}`);
      return true;
    } catch (fallbackErr) {
      console.warn(`[${label}] screenshot skipped: ${fallbackErr?.message || fallbackErr}`);
      return false;
    }
  }
}
