const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const { exec } = require('child_process');
  const server = exec('npx http-server -p 4181');
  
  await page.waitForTimeout(3000); 

  try {
      await page.goto('http://127.0.0.1:4181/index.html');
      await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => typeof window.InventoryView !== 'undefined', { timeout: 5000 }).catch(() => console.log('Timeout waiting for InventoryView'));

      await page.evaluate(() => {
          // Setup mock game instance
          window.game = window.game || {};
          window.game.currentScreen = 'map-screen';
          window.game.updateMapUI = () => {};
          window.game.getRarityLabel = (r) => r;
          
          window.game.player = { 
              getMaxTreasureSlots: () => 2,
              equippedTreasures: [ { id: 't1', name: 'Magic Sword', rarity: 'legendary' } ],
              collectedTreasures: [ { id: 't2', name: 'Shield', rarity: 'common' } ],
              isTreasureEquipped: (id) => id === 't1',
              deck: [ { id: 'c1', name: 'Strike', type: 'attack', rarity: 'basic' } ],
              drawPile: [],
              discardPile: []
          };

          window.Utils = window.Utils || {
              createCardElement: (card) => {
                  const el = document.createElement('div');
                  el.className = 'mock-card';
                  el.textContent = card.name;
                  return el;
              }
          };

          if (!window.InventoryView) {
              throw new Error("InventoryView is not attached to window!");
          }
          
          const view = new window.InventoryView(window.game);
          
          // Test Bag
          view.showTreasureBag();
          const bagHtml = document.getElementById('treasure-bag-modal').innerHTML;
          if (!bagHtml.includes('Magic Sword')) throw new Error("Missing equipped treasure");
          if (!bagHtml.includes('Shield')) throw new Error("Missing inventory treasure");

          // Test Deck
          view.showDeck();
          const deckHtml = document.getElementById('deck-modal').innerHTML;
          if (!deckHtml.includes('Strike')) throw new Error("Missing card in deck");

          console.log("Mock tests passed in browser context");
      });

      console.log("✅ InventoryView extraction test passed successfully!");
  } catch(e) {
      console.error("❌ Test failed: ", e);
      process.exit(1);
  } finally {
      await browser.close();
      server.kill();
  }
})();
