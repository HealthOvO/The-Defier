const { chromium } = require('playwright');
const assert = require('assert');
const http = require('http');

function waitForServer(url, timeoutMs = 10000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(attempt, 200);
      });
      req.setTimeout(1000, () => {
        req.destroy();
      });
    };
    attempt();
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

  const { exec } = require('child_process');
  const server = exec('npx http-server . -p 4188 -a 127.0.0.1');
  await waitForServer('http://127.0.0.1:4188/index.html');

  try {
      await page.goto('http://127.0.0.1:4188/index.html');
      await page.waitForLoadState('networkidle');

      await page.evaluate(async () => {
          const { RewardView } = await import('/js/views/RewardView.js');
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
          window.game.consumeTreasureRumorBoost = () => 0;
          window.game.getWeightedRandomTreasure = () => null;
          window.game.currentBattleNode = { type: 'enemy' };
          window.game.achievementSystem = { updateStat: () => {} };
          window.game.player = {
              gold: 0,
              hasTreasure: () => false,
              addCardToDeck: (card) => {
                  window.game.lastAddedRewardCard = card;
              }
          };
          
          if (!RewardView) {
              throw new Error("RewardView module export missing!");
          }
          
          const view = new RewardView(window.game);
          window.game.rewardView = view;
          
          // Test Show Reward Screen
          view.showRewardScreen(50, true, { name: 'Slime' });
          const rewardHtml = document.getElementById('reward-screen').innerHTML;
          if (!rewardHtml.includes('50 灵石')) throw new Error("Missing gold in reward");
          if (!rewardHtml.includes('Strike')) throw new Error("Missing card in reward");
          const nextStep = document.getElementById('reward-next-step-card');
          if (!nextStep) throw new Error("Missing reward next-step card");
          if (!/先选牌或付费跳过/.test(nextStep.textContent)) throw new Error("Reward next-step card should start pending");

          view.selectRewardCard({ id: 'strike', name: 'Strike', rarity: 'basic', type: 'attack' });
          if (!/已选定奖励，可继续回章节地图/.test(nextStep.textContent)) throw new Error("Reward next-step card should become ready after card selection");

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
