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
          window.game.rewardCardsFixture = [
              { id: 'strike', name: 'Strike', rarity: 'basic', type: 'attack', description: 'Attack once.' },
              { id: 'guard', name: 'Guard', rarity: 'common', type: 'defense', description: 'Defend once.' }
          ];
          window.game.getRewardCardsForCurrentRun = () => window.game.rewardCardsFixture;
          window.game.getRarityLabel = (r) => r;
          window.game.consumeTreasureRumorBoost = () => 0;
          window.game.getWeightedRandomTreasure = () => null;
          window.game.currentBattleNode = { type: 'enemy' };
          window.game.achievementSystem = { updateStat: () => {} };
          window.game.rewardSelections = [];
          window.game.player = {
              gold: 0,
              hasTreasure: () => false,
              addCardToDeck: (card) => {
                  window.game.lastAddedRewardCard = card;
                  window.game.rewardSelections.push(card.id);
              }
          };
          
          if (!RewardView) {
              throw new Error("RewardView module export missing!");
          }
          
          const view = new RewardView(window.game);
          window.game.rewardView = view;
          
          view.showRewardScreen(50, true, { name: 'Slime' });
          const rewardHtml = document.getElementById('reward-screen').innerHTML;
          if (!rewardHtml.includes('50 灵石')) throw new Error("Missing gold in reward");
          if (!rewardHtml.includes('Strike')) throw new Error("Missing first card in reward");
          if (!rewardHtml.includes('Guard')) throw new Error("Missing second card in reward");
          const nextStep = document.getElementById('reward-next-step-card');
          if (!nextStep) throw new Error("Missing reward next-step card");
          if (!/先选牌或付费跳过/.test(nextStep.textContent)) throw new Error("Reward next-step card should start pending");
          view.continueAfterReward();
          if (!/请先选择一张卡牌奖励/.test(nextStep.textContent)) throw new Error("Blocked continue should update inline reward feedback");
          if (nextStep.dataset.rewardNextState !== 'required') throw new Error("Blocked continue should expose required state");
          if (nextStep.getAttribute('role') !== 'status') throw new Error("Blocked continue feedback should expose status role");
          if (nextStep.getAttribute('aria-live') !== 'polite') throw new Error("Blocked continue feedback should use a polite live region");
          view.showRewardScreen(50, true, { name: 'Slime' });
      });

      const rewardCards = page.locator('#reward-cards .reward-card');
      await assert.strictEqual(await rewardCards.count(), 2, 'expected two reward cards');

      const firstCard = rewardCards.first();
      const secondCard = rewardCards.nth(1);
      await assert.strictEqual(await firstCard.getAttribute('role'), 'button', 'reward card should expose button role');
      await assert.strictEqual(await firstCard.getAttribute('tabindex'), '0', 'reward card should be tabbable before selection');
      await assert.strictEqual(await firstCard.getAttribute('aria-pressed'), 'false', 'reward card should start unselected');
      await assert.strictEqual(await firstCard.getAttribute('aria-disabled'), 'false', 'reward card should start enabled');
      assert.match(await firstCard.getAttribute('aria-label') || '', /选择奖励卡牌.*Strike/, 'reward card should expose aria-label');

      await firstCard.focus();
      await page.keyboard.press('Enter');
      let keyboardProbe = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('#reward-cards .reward-card'));
          const continueBtn = document.getElementById('continue-reward-btn');
          const nextStep = document.getElementById('reward-next-step-card');
          return {
              rewardSelections: window.game.rewardSelections.slice(),
              rewardCardSelected: !!window.game.rewardCardSelected,
              continueDisabled: !!continueBtn?.disabled,
              continueText: continueBtn?.textContent || '',
              nextStepText: nextStep?.textContent || '',
              ariaPressed: cards.map((card) => card.getAttribute('aria-pressed')),
              ariaDisabled: cards.map((card) => card.getAttribute('aria-disabled')),
              tabIndexes: cards.map((card) => card.getAttribute('tabindex'))
          };
      });
      await assert.deepStrictEqual(keyboardProbe.rewardSelections, ['strike'], 'Enter should select the focused reward card once');
      await assert.strictEqual(keyboardProbe.rewardCardSelected, true, 'reward selection state should be set after Enter');
      await assert.strictEqual(keyboardProbe.continueDisabled, false, 'continue button should enable after Enter selection');
      assert.match(keyboardProbe.continueText, /继续前进/, 'continue button text should update after Enter selection');
      assert.match(keyboardProbe.nextStepText, /已选定奖励，可继续回章节地图/, 'next-step card should become ready after Enter selection');
      await assert.deepStrictEqual(keyboardProbe.ariaPressed, ['true', 'false'], 'Enter selection should sync aria-pressed');
      await assert.deepStrictEqual(keyboardProbe.ariaDisabled, ['true', 'true'], 'completed reward choice should disable every option');
      await assert.deepStrictEqual(keyboardProbe.tabIndexes, ['0', '-1'], 'only the selected reward card should stay tabbable after Enter selection');

      await page.keyboard.press('Enter');
      keyboardProbe = await page.evaluate(() => ({
          rewardSelections: window.game.rewardSelections.slice()
      }));
      await assert.deepStrictEqual(keyboardProbe.rewardSelections, ['strike'], 'repeat Enter should not select twice');

      await page.evaluate(() => {
          window.game.rewardView.showRewardScreen(50, false, null);
      });
      await assert.strictEqual(await rewardCards.count(), 2, 'reward cards should re-render after reopening');

      const spaceCard = rewardCards.first();
      await assert.strictEqual(await spaceCard.getAttribute('aria-pressed'), 'false', 'reopened reward card should reset aria-pressed');
      await assert.strictEqual(await spaceCard.getAttribute('aria-disabled'), 'false', 'reopened reward card should reset aria-disabled');
      await spaceCard.focus();
      await page.keyboard.press('Space');

      keyboardProbe = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('#reward-cards .reward-card'));
          const continueBtn = document.getElementById('continue-reward-btn');
          return {
              rewardSelections: window.game.rewardSelections.slice(),
              rewardCardSelected: !!window.game.rewardCardSelected,
              continueDisabled: !!continueBtn?.disabled,
              ariaPressed: cards.map((card) => card.getAttribute('aria-pressed'))
          };
      });
      await assert.deepStrictEqual(keyboardProbe.rewardSelections, ['strike', 'strike'], 'Space should use the same selection path as click');
      await assert.strictEqual(keyboardProbe.rewardCardSelected, true, 'reward selection state should be set after Space');
      await assert.strictEqual(keyboardProbe.continueDisabled, false, 'continue button should enable after Space selection');
      await assert.deepStrictEqual(keyboardProbe.ariaPressed, ['true', 'false'], 'Space selection should sync aria-pressed');

      await page.keyboard.press('Space');
      keyboardProbe = await page.evaluate(() => ({
          rewardSelections: window.game.rewardSelections.slice()
      }));
      await assert.deepStrictEqual(keyboardProbe.rewardSelections, ['strike', 'strike'], 'repeat Space should not select twice');

      console.log("✅ RewardView extraction test passed successfully!");
  } catch(e) {
      console.error("❌ Test failed: ", e);
      process.exit(1);
  } finally {
      await browser.close();
      server.kill();
  }
})();
