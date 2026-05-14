const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

    const { exec } = require('child_process');
    const server = exec('npx http-server -p 4201');
    
    await page.waitForTimeout(3000); 

    try {
        await page.goto('http://127.0.0.1:4201/index.html');
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => typeof window.EventManager !== 'undefined', { timeout: 5000 }).catch(() => console.log('Timeout waiting for EventManager'));

        await page.evaluate(() => {
            window.game = window.game || {};
            
            if (!window.EventManager) {
                throw new Error("EventManager is not attached to window!");
            }
            
            const manager = new window.EventManager(window.game);
            window.game.eventManager = manager;

            console.log("Mock tests passed in browser context");
        });

        console.log("✅ EventManager extraction test passed successfully!");
    } catch(e) {
        console.error("❌ Test failed: ", e);
        process.exit(1);
    } finally {
        await browser.close();
        server.kill();
    }
})();
