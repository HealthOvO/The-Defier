const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

  const { exec } = require('child_process');
  const server = exec('npx http-server -p 4188');
  
  await page.waitForTimeout(3000); 

  try {
      await page.goto('http://127.0.0.1:4188/index.html');
      await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => typeof window.RewardView !== 'undefined', { timeout: 5000 }).catch(() => console.log('Timeout waiting for RewardView'));

      await page.evaluate(() => {
          window.game = window.game || {};
          window.game.currentScreen = 'main-menu';
          window.game.showScreen = (screenId) => {
              document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
              const s = document.getElementById(screenId);
              if (s) s.classList.add('active');
          };
          window.game.getRewardCardsForCurrentRun = () => [
              { id: 'strike', name: 'Strike', rarity: 'basic', type: 'attack' }
          ];
          window.game.getRarityLabel = (r) => r;
          window.game.player = {
              gold: 0,
              hasTreasure: () => false
          };
          
          if (!window.RewardView) {
              throw new Error("RewardView is not attached to window!");
          }
          
          const view = new window.RewardView(window.game);
          window.game.rewardView = view;
          
          // Test Show Reward Screen
          view.showRewardScreen(50, true, { name: 'Slime' });
          const rewardHtml = document.getElementById('reward-screen').innerHTML;
          if (!rewardHtml.includes('50 灵石')) throw new Error("Missing gold in reward");
          if (!rewardHtml.includes('Strike')) throw new Error("Missing card in reward");

          console.log("Mock tests passed in browser context");
      });

      console.log("✅ RewardView extraction test passed successfully!");
  } catch(e) {
      console.error("❌ Test failed: ", e);
      process.exit(1);
  } finally {
      await browser.close();
      server.kill();
  }
})();
