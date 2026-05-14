const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    let errors = 0;
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error('BROWSER ERROR:', msg.text());
            errors++;
        }
    });
    page.on('pageerror', err => {
        console.error('PAGE ERROR:', err.message);
        errors++;
    });

    const { exec } = require('child_process');
    const server = exec('npx http-server -p 4202');
    
    await page.waitForTimeout(3000); 

    try {
        await page.goto('http://127.0.0.1:4202/index.html');
        await page.waitForLoadState('networkidle');
        
        await page.evaluate(() => {
            if (!window.game) throw new Error("game is not initialized!");
            
            if (typeof window.SeasonBoardManager !== 'undefined') new window.SeasonBoardManager(window.game);
            if (typeof window.SanctumAgendaManager !== 'undefined') new window.SanctumAgendaManager(window.game);
            if (typeof window.EndlessManager !== 'undefined') new window.EndlessManager(window.game);
            if (typeof window.RunManager !== 'undefined') new window.RunManager(window.game);
            if (typeof window.EventManager !== 'undefined') new window.EventManager(window.game);
            if (typeof window.ShopManager !== 'undefined') new window.ShopManager(window.game);
            
            console.log("All managers successfully initialized.");
        });

        if (errors > 0) {
            throw new Error(`Found ${errors} console errors during load.`);
        }
        console.log("✅ Comprehensive Managers test passed successfully!");
    } catch(e) {
        console.error("❌ Test failed: ", e);
        process.exit(1);
    } finally {
        await browser.close();
        server.kill();
    }
})();
