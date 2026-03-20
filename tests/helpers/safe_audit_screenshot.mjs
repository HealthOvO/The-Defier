import fs from 'node:fs';

function toPositiveSize(value) {
  const size = Math.ceil(Number(value) || 0);
  return Math.max(1, size);
}

export async function safeAuditScreenshot(page, outPath, label, options = {}) {
  const fullPage = options.fullPage !== false;
  const timeout = Number.isFinite(options.timeout) ? options.timeout : 8000;

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
      const session = await page.context().newCDPSession(page);
      let screenshot;

      if (fullPage) {
        const metrics = await session.send('Page.getLayoutMetrics');
        const size = metrics.cssContentSize || metrics.contentSize || { width: 1, height: 1 };
        screenshot = await session.send('Page.captureScreenshot', {
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
        });
      } else {
        screenshot = await session.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
        });
      }

      fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'));
      console.warn(`[${label}] screenshot fallback captured after Playwright timeout: ${err?.message || err}`);
      return true;
    } catch (fallbackErr) {
      console.warn(`[${label}] screenshot skipped: ${fallbackErr?.message || fallbackErr}`);
      return false;
    }
  }
}
