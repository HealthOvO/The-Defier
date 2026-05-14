const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

    const { exec } = require('child_process');
    const server = exec('npx http-server -p 4189');
    
    await page.waitForTimeout(3000); 

    try {
        await page.goto('http://127.0.0.1:4189/index.html');
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => typeof window.EventView !== 'undefined', { timeout: 5000 }).catch(() => console.log('Timeout waiting for EventView'));

        await page.evaluate(() => {
            window.game = window.game || {};
            window.game.currentScreen = 'battle-screen';
            
            if (!window.EventView) {
                throw new Error("EventView is not attached to window!");
            }
            
            const view = new window.EventView(window.game);
            window.game.eventView = view;

            // Check refs
            const refs = view.getEventModalRefs();
            if (!refs.modal || !refs.titleEl) {
                throw new Error("EventView could not get refs");
            }

            console.log("Mock tests passed in browser context");
        });

        console.log("✅ EventView extraction test passed successfully!");
    } catch(e) {
        console.error("❌ Test failed: ", e);
        process.exit(1);
    } finally {
        await browser.close();
        server.kill();
    }
})();
