const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

    const { exec } = require('child_process');
    const server = exec('npx http-server -p 4198');
    
    await page.waitForTimeout(3000); 

    try {
        await page.goto('http://127.0.0.1:4198/index.html');
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => typeof window.SanctumAgendaManager !== 'undefined', { timeout: 5000 }).catch(() => console.log('Timeout waiting for SanctumAgendaManager'));

        await page.evaluate(() => {
            window.game = window.game || {};
            
            if (!window.SanctumAgendaManager) {
                throw new Error("SanctumAgendaManager is not attached to window!");
            }
            
            const manager = new window.SanctumAgendaManager(window.game);
            window.game.sanctumAgendaManager = manager;

            console.log("Mock tests passed in browser context");
        });

        console.log("✅ SanctumAgendaManager extraction test passed successfully!");
    } catch(e) {
        console.error("❌ Test failed: ", e);
        process.exit(1);
    } finally {
        await browser.close();
        server.kill();
    }
})();
