const { chromium } = require('playwright');

(async () => {
    console.log('启动无头浏览器进行截图验证...');
    const browser = await chromium.launch();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const targetUrl = process.env.SCREENSHOT_URL || 'http://127.0.0.1:4173';
    
    try {
        console.log(`访问 ${targetUrl} ...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        
        // 等待几秒钟让可能存在的动画/加载完成
        await page.waitForTimeout(2000);
        
        await page.screenshot({ path: 'output/verify_online_screenshot.png', fullPage: true });
        console.log('截图成功！保存在 output/verify_online_screenshot.png');
    } catch (e) {
        console.error('访问或截图失败:', e);
    } finally {
        await browser.close();
    }
})();
