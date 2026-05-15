const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    let errors = 0;
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error(`BROWSER ERROR: ${msg.text()} at ${msg.location().url}:${msg.location().lineNumber}`);
        }
    });
    page.on('pageerror', err => {
        console.error(`PAGE ERROR: ${err.message}\n${err.stack}`);
        errors++;
    });

    const { exec } = require('child_process');
    const server = exec('npx http-server -p 4196');
    
    await page.waitForTimeout(6000); 

    try {
        await page.goto('http://127.0.0.1:4196/index.html');
        await page.waitForLoadState('networkidle');
        
        await page.evaluate(() => {
            if (!window.game) throw new Error("game is not initialized!");
            
            // Just instantiate them to make sure they load
            if (typeof window.PVPResultView !== 'undefined') new window.PVPResultView(window.game);
            if (typeof window.CampfireView !== 'undefined') new window.CampfireView(window.game);
            if (typeof window.StrategicView !== 'undefined') new window.StrategicView(window.game);
            if (typeof window.SystemView !== 'undefined') new window.SystemView(window.game);
            if (typeof window.FateRingView !== 'undefined') new window.FateRingView(window.game);
            if (typeof window.HUDView !== 'undefined') new window.HUDView(window.game);
            if (typeof window.CharacterSelectView !== 'undefined') new window.CharacterSelectView(window.game);
            
            console.log("All views successfully initialized.");
        });

        if (errors > 0) {
            throw new Error(`Found ${errors} console errors during load.`);
        }
        console.log("✅ Comprehensive Views test passed successfully!");
    } catch(e) {
        console.error("❌ Test failed: ", e);
        process.exit(1);
    } finally {
        await browser.close();
        server.kill();
    }
})();
