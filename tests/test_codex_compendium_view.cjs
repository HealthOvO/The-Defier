const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const { exec } = require('child_process');
  const server = exec('npx http-server -p 4186');
  
  await page.waitForTimeout(3000); 

  try {
      await page.goto('http://127.0.0.1:4186/index.html');
      await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => typeof window.InventoryView !== 'undefined', { timeout: 5000 }).catch(() => console.log('Timeout waiting for InventoryView'));

      await page.evaluate(() => {
          // Setup mock game instance
          window.game = window.game || {};
          window.game.currentScreen = 'main-menu';
          window.game.showScreen = (screenId) => {
              document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
              const s = document.getElementById(screenId);
              if (s) s.classList.add('active');
          };
          window.game.getLawElementLabel = (r) => r;
          window.game.getLawRelatedResonances = () => [];
          window.game.getLawResonanceAvailability = () => [];
          window.game.getRarityLabel = (r) => r;
          window.game.getTreasureSource = () => 'Source';
          window.game.formattingResonanceEffect = (e) => e;
          
          window.game.player = { 
              collectedLaws: [],
              hasTreasure: () => false,
              fateRing: { getSocketedLaws: () => [] }
          };

          if (!window.InventoryView) {
              throw new Error("InventoryView is not attached to window!");
          }
          
          const view = new window.InventoryView(window.game);
          window.game.inventoryView = view;
          
          // Test Codex
          view.showCollection();
          const codexHtml = document.getElementById('collection').innerHTML;
          if (!codexHtml.includes('法则收藏进度')) throw new Error("Missing codex content");

          // Test Compendium
          view.showTreasureCompendium();
          const compendiumHtml = document.getElementById('treasure-compendium').innerHTML;
          if (!compendiumHtml.includes('法宝收藏进度')) throw new Error("Missing compendium content");

          console.log("Mock tests passed in browser context");
      });

      console.log("✅ Codex and Compendium extraction test passed successfully!");
  } catch(e) {
      console.error("❌ Test failed: ", e);
      process.exit(1);
  } finally {
      await browser.close();
      server.kill();
  }
})();
