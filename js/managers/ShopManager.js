import { getLawPassiveDescription, LAWS } from "../data/laws.js";
import { audioManager } from "../core/audio.js";
import { Utils } from "../core/utils.js";
import { cloneCardTemplate, getRandomCard } from "../data/cards.js";
import { CARDS } from "../data/index.js";
import { TREASURES } from "../data/treasures.js";
export class ShopManager {
  getStrategicRouteForecasts() {
    return {
      utility: {
        id: 'utility',
        icon: '🗺️',
        label: '机缘补给线',
        desc: '下一重天更容易遇见商路、观星与修整节点，适合稳定转向。',
        shift: {
          event: 0.05,
          shop: 0.04,
          rest: 0.02,
          observatory: 0.03,
          memory_rift: 0.02,
          enemy: -0.08,
          elite: -0.03,
          forbidden_altar: -0.01
        }
      },
      assault: {
        id: 'assault',
        icon: '⚔️',
        label: '试炼锋路',
        desc: '下一重天更偏向试炼、精英、锻炉与禁术节点，适合冒险爆发。',
        shift: {
          trial: 0.06,
          elite: 0.03,
          forge: 0.025,
          forbidden_altar: 0.025,
          enemy: -0.05,
          rest: -0.02,
          shop: -0.02,
          observatory: -0.01
        }
      },
      rift: {
        id: 'rift',
        icon: '🪞',
        label: '裂隙回响线',
        desc: '下一重天更容易出现记忆裂隙、观星台与事件节点，适合改写构筑。',
        shift: {
          memory_rift: 0.06,
          observatory: 0.04,
          event: 0.04,
          enemy: -0.06,
          elite: -0.03,
          shop: -0.02,
          rest: -0.01
        }
      },
      runPathShatter: {
        id: 'runPathShatter',
        icon: '⚔️',
        label: '裂锋推进线',
        desc: '下一重天更偏向精英、试炼、锻炉与禁术节点，适合继续抢节奏。',
        shift: {
          elite: 0.05,
          trial: 0.055,
          forge: 0.03,
          forbidden_altar: 0.025,
          enemy: -0.05,
          rest: -0.025,
          shop: -0.02
        }
      },
      runPathBulwark: {
        id: 'runPathBulwark',
        icon: '🛡️',
        label: '镇御修整线',
        desc: '下一重天更偏向营地、锻炉、商店与精英节点，适合稳步补强。',
        shift: {
          rest: 0.05,
          forge: 0.04,
          shop: 0.03,
          elite: 0.02,
          event: -0.03,
          enemy: -0.04,
          forbidden_altar: -0.01
        }
      },
      runPathInsight: {
        id: 'runPathInsight',
        icon: '🔮',
        label: '窥盘裂隙线',
        desc: '下一重天更偏向事件、观星台、记忆裂隙与灵契节点，适合继续扩信息。',
        shift: {
          event: 0.05,
          observatory: 0.05,
          memory_rift: 0.045,
          spirit_grotto: 0.03,
          enemy: -0.05,
          elite: -0.03,
          shop: -0.01
        }
      }
    };
  }
  showLawDetail(law, isCollected = false) {
    const modal = document.getElementById('law-detail-modal');
    if (!modal || !law) return;
    const iconEl = document.getElementById('law-detail-icon');
    const captionEl = document.getElementById('law-detail-caption');
    const nameEl = document.getElementById('law-detail-name');
    const rarityEl = document.getElementById('law-detail-rarity');
    const descEl = document.getElementById('law-detail-desc');
    const passiveEl = document.getElementById('law-detail-passive');
    const linksEl = document.getElementById('law-detail-links');
    const sourceEl = document.getElementById('law-detail-source');
    const chipsEl = document.getElementById('law-detail-chips');
    const noteEl = document.getElementById('law-detail-note');
    const headerEl = document.getElementById('law-detail-header');
    const stageEl = document.getElementById('law-detail-stage');
    const readinessEl = document.getElementById('law-detail-readiness');
    if (!iconEl || !nameEl || !headerEl || !chipsEl) return;
    const rarity = law.rarity || 'rare';
    const passiveText = typeof getLawPassiveDescription === 'function' ? getLawPassiveDescription(law) : law.description || '未知效果';
    const relatedResonances = this.game.getLawRelatedResonances(law);
    const readinessList = this.game.getLawResonanceAvailability(law);
    const unlockCards = Array.isArray(law.unlockCards) ? law.unlockCards.filter(Boolean) : [];
    const activeResonanceCount = readinessList.filter(entry => entry.state === 'active').length;
    const readyResonanceCount = readinessList.filter(entry => entry.state === 'ready').length;
    headerEl.className = 'detail-header';
    headerEl.classList.add(`rarity-${rarity}`);
    stageEl.classList.toggle('locked', !isCollected);
    iconEl.textContent = isCollected ? law.icon || '📜' : '❔';
    nameEl.textContent = isCollected ? law.name : '未解法则';
    rarityEl.textContent = this.game.getLawRarityText(rarity);
    captionEl.textContent = isCollected ? `${this.game.getLawElementLabel(law.element)}属性残响已被识别` : '法则仍被迷雾遮蔽，需要先在战斗中盗取';
    descEl.innerHTML = isCollected ? law.description : '你只能感知到一缕残响。完成战斗并触发法则盗取，才能彻底辨识它的结构。';
    passiveEl.textContent = isCollected ? passiveText : '尚未掌握，无法完整解析其被动结构。';
    sourceEl.textContent = this.game.getLawSource(law);
    chipsEl.innerHTML = [`<span class="detail-status-chip ${isCollected ? 'owned' : 'locked'}">${isCollected ? '已掌握' : '未掌握'}</span>`, `<span class="detail-status-chip">${this.game.getLawElementLabel(law.element)}属性</span>`, `<span class="detail-status-chip rarity-chip rarity-${rarity}">${this.game.getLawRarityText(rarity)}</span>`].join('');
    if (activeResonanceCount > 0) {
      noteEl.textContent = '当前命环已点亮相关共鸣，可直接围绕主区被动与解锁内容继续构筑。';
    } else if (readyResonanceCount > 0) {
      noteEl.textContent = '你已收齐相关组件，只差把法则装入命环；可优先调整命环再看牌组联动。';
    } else {
      noteEl.textContent = isCollected ? '先看右侧状态与元素，再回到主区确认被动和可解锁内容。' : '当前更重要的是获取路径，掌握后再决定是否围绕它补共鸣。';
    }
    const relatedText = [];
    if (relatedResonances.length > 0) {
      relatedText.push(`关联共鸣：${relatedResonances.map(res => res.name).join(' ｜ ')}`);
    }
    if (unlockCards.length > 0) {
      relatedText.push(`解锁卡牌：${unlockCards.join(' ｜ ')}`);
    }
    if (relatedText.length === 0) {
      relatedText.push(isCollected ? '当前未记录到额外共鸣或解锁卡牌。' : '掌握后可查看它能点亮的共鸣与卡牌。');
    }
    linksEl.innerHTML = relatedText.map(line => `<p>${line}</p>`).join('');
    if (readinessEl) {
      readinessEl.innerHTML = readinessList.length > 0 ? readinessList.map(entry => {
        const actions = this.game.getLawReadinessActions(entry);
        return `
                    <div class="law-readiness-item ${entry.state}">
                        <div class="law-readiness-title-row">
                            <strong>${entry.resonance.name}</strong>
                            <span class="law-readiness-chip ${entry.state}">${entry.label}</span>
                        </div>
                        <div class="law-readiness-desc">${entry.detail}</div>
                        ${actions.length > 0 ? `<div class="law-readiness-actions">${actions.map(action => `<button type="button" class="law-readiness-btn" data-law-readiness-action="true" data-law-readiness-type="${action.type}" data-law-readiness-resonance-id="${action.resonanceId || ''}" data-law-readiness-law-id="${action.lawId || ''}">${action.label}</button>`).join('')}</div>` : ''}
                    </div>
                `;
      }).join('') : '<div class="law-readiness-empty">暂无登记在册的关联共鸣，可先关注其被动与解锁卡牌。</div>';
    }
    if (!modal.__lawReadinessDelegatesBound) {
      modal.addEventListener('click', event => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const actionBtn = target.closest('[data-law-readiness-action="true"]');
        if (!actionBtn || actionBtn.disabled || !modal.contains(actionBtn)) return;
        const type = String(actionBtn.dataset.lawReadinessType || '');
        const resonanceId = String(actionBtn.dataset.lawReadinessResonanceId || '');
        const lawId = String(actionBtn.dataset.lawReadinessLawId || '');
        if (type) {
          this.game.handleLawReadinessAction(type, resonanceId, lawId);
        }
      });
      modal.__lawReadinessDelegatesBound = true;
    }
    modal.classList.add('active');
    if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
  }
  applyServiceEffect(service) {
    // 法宝购买逻辑
    if (service.type === 'treasure') {
      if (this.game.player.addTreasure(service.id)) {
        Utils.showBattleLog(`获得法宝：${service.name} `);
        return true;
      }
      return false;
    }
    if (service && service.runPathExclusive) {
      const handled = this.game.applyRunPathShopServiceEffect(service);
      if (handled !== null) return handled;
    }
    switch (service.id) {
      case 'heal':
        if (this.game.player.currentHp >= this.game.player.maxHp) {
          Utils.showBattleLog('生命值已满！');
          this.game.showRewardModal('状态完美', '你的生命值已满，无需治疗。\n保持最佳状态去战斗吧！', '💪');
          return false;
        }
        const healAmount = Math.max(1, Math.floor(this.game.player.maxHp * 0.3 * this.game.getEndlessHealingMultiplier()));
        this.game.player.heal(healAmount);
        Utils.showBattleLog(`恢复了 ${healAmount} 点生命`);

        // 增强反馈
        this.game.showRewardModal('治疗成功', `生命值恢复了 ${healAmount} 点！\n当前状态极佳。`, '💖');
        return true;
      case 'remove':
        this.game.showRemoveCard(service);
        return 'deferred';
      case 'exp':
        this.game.player.fateRing.exp += 50;
        this.game.player.checkFateRingLevelUp();
        Utils.showBattleLog('命环经验 +50');
        this.game.showRewardModal('命环充能', `命环经验 + 50！\n距离下一级更近了。`, '⬆️');
        return true;
      case 'tacticalPlan':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', 2);
        }
        Utils.showBattleLog('获得行旅增益：接下来 2 场战斗首回合额外抽牌');
        this.game.showRewardModal('战术推演完成', '接下来 2 场战斗：\n首回合额外抽 1 张牌。', '📘');
        return true;
      case 'wardSigil':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('openingBlockBoostBattles', 2);
        }
        Utils.showBattleLog('获得行旅增益：接下来 2 场战斗开场护盾 +10');
        this.game.showRewardModal('护阵符生效', '接下来 2 场战斗：\n开场获得 10 护盾。', '🧿');
        return true;
      case 'bountyContract':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
        }
        Utils.showBattleLog('获得行旅增益：接下来 2 场战斗胜利额外灵石');
        this.game.showRewardModal('悬赏契约签订', '接下来 2 场战斗：\n胜利额外获得灵石。', '📜');
        return true;
      case 'scoutPack':
        this.game.showShopCardDraft(service);
        return 'deferred';
      case 'campRation':
        {
          const healAmount = Math.max(8, Math.floor(this.game.player.maxHp * 0.18 * this.game.getEndlessHealingMultiplier()));
          this.game.player.heal(healAmount);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('openingBlockBoostBattles', 1);
          }
          Utils.showBattleLog(`行军口粮：恢复 ${healAmount} 生命，并获得 1 层开场护盾增益`);
          this.game.showRewardModal('补给完成', `恢复 ${healAmount} 生命。\n接下来 1 场战斗开场获得护盾。`, '🥣');
          return true;
        }
      case 'fateLedger':
        this.game.player.fateRing.exp += 45;
        this.game.player.checkFateRingLevelUp();
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 1);
        }
        Utils.showBattleLog('命轨账簿：命环经验 +45，并获得 1 层悬赏增益');
        this.game.showRewardModal('账簿校准', '命环经验 +45。\n接下来 1 场战斗胜利额外获得灵石。', '📚');
        return true;
      case 'pulseCatalyst':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2);
        }
        Utils.showBattleLog('灵息催化剂：接下来 2 场战斗首回合灵力 +1');
        this.game.showRewardModal('灵息回路稳定', '接下来 2 场战斗：\n首回合灵力 +1。', '⚡');
        return true;
      case 'insightIncense':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('ringExpBoostBattles', 2);
        }
        Utils.showBattleLog('悟境香：接下来 2 场战斗命环经验额外提升');
        this.game.showRewardModal('悟境加持', '接下来 2 场战斗：\n命环经验额外 +30%。', '🕯️');
        return true;
      case 'fieldMedic':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('victoryHealBoostBattles', 2);
        }
        Utils.showBattleLog('战地医师签约完成：接下来 2 场战斗胜利后恢复生命');
        this.game.showRewardModal('医护协议生效', '接下来 2 场战斗：\n胜利后恢复生命。', '🩹');
        return true;
      case 'forbiddenDraft':
        if (this.game.player.maxHp <= 18) {
          Utils.showBattleLog('根基过于虚弱，无法继续签订血契。');
          return false;
        }
        this.game.showShopForbiddenDraft(service);
        return 'deferred';
      case 'soulMortgage':
        {
          const beforeHp = this.game.player.currentHp;
          const hpCap = Math.max(1, Math.floor(this.game.player.maxHp * 0.7));
          this.game.player.currentHp = Math.max(1, Math.min(this.game.player.currentHp, hpCap));
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 3);
            this.game.player.grantAdventureBuff('ringExpBoostBattles', 3);
            this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
          }
          const payout = 90 + Math.max(0, this.game.player.realm || 1) * 12;
          this.game.player.gold += payout;
          Utils.showBattleLog(`蚀寿抵押：生命 ${beforeHp}→${this.game.player.currentHp}，灵石 +${payout}`);
          this.game.showRewardModal('蚀寿抵押完成', `当前生命压至 ${this.game.player.currentHp}。
接下来 3 场战斗：首回合灵力 +1、命环经验提升。
额外获得 ${payout} 灵石。`, '⛓️');
          return true;
        }
      case 'doomIdol':
        {
          const curseCard = typeof cloneCardTemplate === 'function' ? cloneCardTemplate('demonDoubt') : typeof CARDS !== 'undefined' && CARDS.demonDoubt ? JSON.parse(JSON.stringify(CARDS.demonDoubt)) : null;
          if (curseCard) {
            this.game.player.addCardToDeck(curseCard);
          }
          const treasure = this.game.getWeightedRandomTreasure ? this.game.getWeightedRandomTreasure() : null;
          if (treasure && treasure.id) {
            this.game.player.addTreasure(treasure.id);
          }
          this.game.player.gold += 80;
          Utils.showBattleLog(`灾像供契：牌组混入【心魔·疑心】${treasure ? `，并获得法宝【${treasure.name}】` : ''}`);
          this.game.showRewardModal('灾像供契完成', `牌组加入【心魔·疑心】。
${treasure ? `获得法宝：${treasure.name}
` : ''}额外获得 80 灵石。`, '🗿');
          return true;
        }
      case 'rumorRareDraft':
        {
          const rumors = this.game.ensureShopRumors();
          rumors.rewardRareCharges += 2;
          rumors.rewardRareBonus = Math.max(Number(rumors.rewardRareBonus) || 0, 0.3);
          this.game.pushShopRumorHistory('稀曜签：未来两次卡牌奖励稀有化');
          Utils.showBattleLog('传闻锁定：接下来 2 次战后奖励更偏向稀有/史诗');
          this.game.showRewardModal('稀曜签锁定', '未来 2 次战后卡牌奖励将显著偏向稀有/史诗。', '📎');
          return true;
        }
      case 'rumorTreasureTrail':
        {
          const rumors = this.game.ensureShopRumors();
          rumors.treasureCharges += 2;
          rumors.treasureChanceBonus = Math.max(Number(rumors.treasureChanceBonus) || 0, 0.22);
          this.game.pushShopRumorHistory('宝踪风声：精英/Boss 战利强化');
          Utils.showBattleLog('传闻锁定：接下来 2 次精英/Boss 战更易掉落法宝');
          this.game.showRewardModal('宝踪风声锁定', '接下来 2 次精英/Boss 结算将提升法宝掉落率。', '🏺');
          return true;
        }
      case 'rumorUtilityRoute':
        {
          const forecast = this.game.applyStrategicRouteForecast('utility');
          Utils.showBattleLog(`传闻锁定：第 ${this.game.player.realm + 1} 重更偏向${forecast.label}。`);
          this.game.showRewardModal('商路星引生效', `第 ${this.game.player.realm + 1} 重地图将更偏向${forecast.label}。`, forecast.icon || '🗺️');
          return true;
        }
      case 'rumorTrialRoute':
        {
          const forecast = this.game.applyStrategicRouteForecast('assault');
          Utils.showBattleLog(`传闻锁定：第 ${this.game.player.realm + 1} 重更偏向${forecast.label}。`);
          this.game.showRewardModal('锋路谶语生效', `第 ${this.game.player.realm + 1} 重地图将更偏向${forecast.label}。`, forecast.icon || '⚔️');
          return true;
        }
      case 'endlessStabilizer':
        {
          if (!this.game.isEndlessActive()) {
            Utils.showBattleLog('当前并非无尽轮回，无法执行轮回稳压。');
            return false;
          }
          const state = this.game.ensureEndlessState();
          const before = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
          state.pressure = Math.max(0, before - 2);
          const healAmount = Math.max(8, Math.floor(this.game.player.maxHp * 0.14));
          this.game.player.heal(healAmount);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('openingBlockBoostBattles', 1);
          }
          Utils.showBattleLog(`轮回稳压完成：压力 ${before}→${state.pressure}，恢复 ${healAmount} 生命`);
          this.game.showRewardModal('轮回稳压完成', `轮回压力：${before} → ${state.pressure}\n恢复 ${healAmount} 生命，并获得 1 层开场护盾增益。`, '🧯');
          return true;
        }
      case 'endlessOverclock':
        {
          if (!this.game.isEndlessActive()) {
            Utils.showBattleLog('当前并非无尽轮回，无法执行轮回过载。');
            return false;
          }
          const state = this.game.ensureEndlessState();
          const beforePressure = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
          state.pressure = Math.max(0, Math.min(9, beforePressure + 2));
          const rarePool = this.game.getEndlessBoonPool().filter(boon => boon && boon.rarity === 'rare');
          let applied = null;
          if (rarePool.length > 0) {
            const pick = rarePool[Math.floor(Math.random() * rarePool.length)];
            applied = pick ? this.game.applyEndlessBoon(pick.id) : null;
          }
          if (!applied) {
            const fallback = this.game.getEndlessBoonChoices();
            const pick = Array.isArray(fallback) ? fallback[0] : null;
            applied = pick ? this.game.applyEndlessBoon(pick.id) : null;
          }
          const overclockGold = Math.max(60, 80 + beforePressure * 12);
          this.game.player.gold += overclockGold;
          Utils.showBattleLog(`轮回过载启动：压力 ${beforePressure}→${state.pressure}，额外灵石 +${overclockGold}` + `${applied ? `，获得赐福【${applied.name}】` : ''}`);
          this.game.showRewardModal('轮回过载完成', `轮回压力：${beforePressure} → ${state.pressure}\n` + `额外获得灵石：${overclockGold}\n` + `${applied ? `赐福：${applied.name}\n${applied.desc}` : '赐福接入失败（已记录）。'}`, '🔥');
          return true;
        }
      case 'endlessRefit':
        {
          if (!this.game.isEndlessActive()) {
            Utils.showBattleLog('当前并非无尽轮回，无法执行相位校准。');
            return false;
          }
          const state = this.game.ensureEndlessState();
          if (!Array.isArray(state.activeMutators)) state.activeMutators = [];
          const beforeIds = state.activeMutators.slice();
          if (state.activeMutators.length > 0) state.activeMutators.pop();
          const mutator = this.game.rollNextEndlessMutator();
          if (mutator) {
            const mutatorMap = new Map(this.game.getEndlessMutatorPool().map(item => [item.id, item]));
            const beforeNames = beforeIds.map(id => mutatorMap.get(id)).filter(item => !!item).map(item => item.name);
            const afterNames = (state.activeMutators || []).map(id => mutatorMap.get(id)).filter(item => !!item).map(item => item.name);
            Utils.showBattleLog(`相位校准完成：新词缀【${mutator.name}】已接入。`);
            this.game.showRewardModal('相位校准完成', `重配前：${beforeNames.length > 0 ? beforeNames.join('、') : '无'}\n` + `重配后：${afterNames.length > 0 ? afterNames.join('、') : '无'}\n` + `新接入词缀：${mutator.name}\n${mutator.desc}`, '🧬');
            return true;
          }
          Utils.showBattleLog('相位校准失败：未生成新词缀。');
          return false;
        }
      case 'endlessBlessing':
        {
          if (!this.game.isEndlessActive()) {
            Utils.showBattleLog('当前并非无尽轮回，无法执行轮回祷告。');
            return false;
          }
          this.game.showShopEndlessBlessingSelection(service);
          return 'deferred';
        }
      case 'law':
        if (service.data) {
          this.game.player.collectLaw(service.data);
          Utils.showBattleLog(`习得法则：${service.data.name} `);
          this.game.showRewardModal('习得法则', `你领悟了新的法则：\n【${service.data.name}】`, '📜');
          return true;
        }
        return false;
      case 'maxHp':
        this.game.player.addPermaBuff('maxHp', 5);
        this.game.player.currentHp += 5;
        Utils.showBattleLog('最大生命 +5');
        this.game.showRewardModal('体质增强', `最大生命值上限 + 5！`, '💊');
        return true;
      case 'strength':
        this.game.player.addPermBuff('strength', 1);
        Utils.showBattleLog('永久力量 +1');
        this.game.showRewardModal('力量觉醒', `永久力量 + 1！\n你的攻击将更加致命。`, '💪');
        return true;
      case 'refresh':
        // 刷新卡牌
        this.game.shopItems = this.game.generateShopCards(5);
        Utils.showBattleLog('商店货物已刷新');
        this.game.showRewardModal('进货完成', `商店货物已刷新！\n快来看看有什么新宝贝。`, '🔄');
        return 'repeatable';
      case 'gamble':
        const roll = Math.random();
        let rewardText = '';
        let rewardIcon = '🎁';
        let rewardTitle = '盲盒开启';
        if (roll < 0.5) {
          // 50% 亏本/保本
          const goldBack = Utils.random(10, 30);
          this.game.player.gold += goldBack;
          Utils.showBattleLog(`盲盒：获得 ${goldBack} 灵石（亏了...）`);
          rewardIcon = '💸';
          rewardTitle = '运气平平';
          rewardText = `你打开盲盒，里面只有一些碎银子...\n获得 ${goldBack} 灵石。`;
        } else if (roll < 0.85) {
          // 35% 获得随机卡牌
          const randCard = getRandomCard(this.game.player.realm > 2 ? 'uncommon' : 'common');
          this.game.player.addCardToDeck(randCard);
          Utils.showBattleLog(`盲盒：获得卡牌【${randCard.name}】！`);
          rewardIcon = '🎴';
          rewardTitle = '获得卡牌';
          rewardText = `你获得了一张卡牌：\n【${randCard.name}】`;
        } else if (roll < 0.98) {
          // 13% 小奖 (稀有卡或大量金币)
          if (Math.random() < 0.5) {
            const rareCard = getRandomCard('rare');
            this.game.player.addCardToDeck(rareCard);
            Utils.showBattleLog(`盲盒：大奖！获得稀有卡牌【${rareCard.name}】！`);
            rewardIcon = '🌟';
            rewardTitle = '稀有大奖！';
            rewardText = `运气爆棚！你获得了一张稀有卡牌：\n【${rareCard.name}】`;
          } else {
            const bigGold = Utils.random(80, 150);
            this.game.player.gold += bigGold;
            Utils.showBattleLog(`盲盒：手气不错！获得 ${bigGold} 灵石！`);
            rewardIcon = '💰';
            rewardTitle = '发财了！';
            rewardText = `盒子底部铺满了闪闪发光的灵石！\n获得 ${bigGold} 灵石！`;
          }
        } else {
          // 2% 传说/法宝奖
          const jackpot = Math.random();
          if (jackpot < 0.5) {
            const legCard = getRandomCard('legendary');
            this.game.player.addCardToDeck(legCard);
            Utils.showBattleLog(`盲盒：传说大奖！！获得【${legCard.name}】！`);
            rewardIcon = '👑';
            rewardTitle = '传说降世！';
            rewardText = `金光乍现！你获得了传说卡牌：\n【${legCard.name}】`;
          } else {
            // 尝试给法宝
            const treasureKeys = Object.keys(TREASURES);
            const unowned = treasureKeys.filter(k => !this.game.player.hasTreasure(k));
            if (unowned.length > 0) {
              const tid = unowned[Math.floor(Math.random() * unowned.length)];
              this.game.player.addTreasure(tid);
              Utils.showBattleLog(`盲盒：鸿运当头！获得法宝【${TREASURES[tid].name}】！`);
              rewardIcon = '🏺';
              rewardTitle = '法宝现世！';
              rewardText = `极其罕见！你获得了法宝：\n【${TREASURES[tid].name}】`;
            } else {
              this.game.player.gold += 300;
              Utils.showBattleLog(`盲盒：传说大奖！获得 300 灵石！`);
              rewardIcon = '💎';
              rewardTitle = '巨额财富';
              rewardText = `虽然没有法宝，但这里有一大笔钱！\n获得 300 灵石！`;
            }
          }
        }
        this.game.showRewardModal(rewardTitle, rewardText, rewardIcon);

        // 盲盒涨价逻辑
        service.price = Math.floor(service.price * 1.5);
        service.name = '神秘盲盒 (涨价了)';
        return 'repeatable';
      default:
        return false;
    }
  }
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  evaluateShopCardDeckFit(card) {
    const profile = this.game.buildPlayerDeckProfile();
    const reasons = [];
    let score = 0;
    if (!card) return {
      label: '适配未知',
      reason: '无法解析当前卡牌。',
      summaryRows: [],
      score: 0
    };
    if (card.type === 'attack') {
      const ratio = profile.ratio('attack');
      if (ratio >= 0.34) {
        score += 2.2;
        reasons.push('当前牌组攻击占比高，新增攻击牌更容易形成连段。');
      } else if (ratio >= 0.2) {
        score += 1.1;
        reasons.push('攻击轴已有基础，可作为补强。');
      }
    } else if (card.type === 'defense') {
      const ratio = profile.ratio('defense');
      if (ratio >= 0.28) {
        score += 2;
        reasons.push('防御牌占比稳定，这张牌容易融入护盾节奏。');
      } else {
        score += 0.8;
        reasons.push('当前防御牌偏少，可作为补位工具。');
      }
    } else if (card.type === 'law') {
      const ratio = profile.ratio('law');
      if (ratio >= 0.2) {
        score += 2.2;
        reasons.push('法则牌比重较高，继续叠法则轴收益明显。');
      }
      if (card.lawType && profile.lawTypeCounts[card.lawType]) {
        score += 1.4;
        reasons.push(`牌组已存在 ${card.lawType} 法则链，可直接衔接。`);
      }
    } else if (card.type === 'energy') {
      if (profile.avgCost >= 1.7) {
        score += 2.1;
        reasons.push('当前牌组平均费用偏高，灵力牌更能稳节奏。');
      } else {
        score += 1.2;
        reasons.push('即使平均费用不高，灵力牌也能提升转场稳定性。');
      }
    } else if (card.type === 'chance') {
      score += 1.0;
      reasons.push('机缘牌更依赖局面，适合作为弹性补件。');
    }
    if ((Number(card.cost) || 0) <= 1) {
      score += 0.5;
      reasons.push('低费用意味着更容易塞入现有曲线。');
    }
    if ((Number(card.cost) || 0) >= 3 && profile.avgCost >= 1.8) {
      score += 0.6;
      reasons.push('当前曲线允许更高费用的爆发牌。');
    }
    if (profile.size <= 12) {
      score += 0.4;
      reasons.push('牌组规模还不大，新牌更容易被尽快抽到。');
    }
    const label = score >= 3.2 ? '高适配' : score >= 1.7 ? '中适配' : '低适配';
    const reason = reasons[0] || '这张牌更偏通用补件，需结合当前流派自行判断。';
    return {
      label,
      reason,
      score,
      summaryRows: [{
        label: '适配度',
        value: label
      }, {
        label: '牌组重心',
        value: `${profile.dominantType}轴 · 均费 ${profile.avgCost.toFixed(1)}`
      }, {
        label: '牌组规模',
        value: `${profile.size} 张`
      }]
    };
  }
  evaluateShopServiceFit(service) {
    const profile = this.game.buildPlayerDeckProfile();
    const hpRatio = this.game.player?.maxHp > 0 ? this.game.player.currentHp / this.game.player.maxHp : 1;
    const currency = service?.currency || 'gold';
    const currentBudget = typeof this.game.getStrategicCurrencyAmount === 'function' ? this.game.getStrategicCurrencyAmount(currency) : Number(this.game.player?.gold) || 0;
    const price = Math.max(0, Number(service?.price) || 0);
    const reasons = [];
    let score = 0;
    if (!service) return {
      label: '适配未知',
      reason: '无法解析当前服务。',
      summaryRows: [],
      score: 0
    };
    switch (service.id) {
      case 'heal':
      case 'campRation':
      case 'fieldMedic':
      case 'endlessStabilizer':
      case 'runPathBulwarkRation':
        if (hpRatio <= 0.45) {
          score += 4.0;
          reasons.push('当前血线偏低，先补生存比继续扩牌更稳。');
        } else if (hpRatio <= 0.7) {
          score += 1.8;
          reasons.push('生命有明显折损，补给类服务能提升容错。');
        } else {
          score += 0.6;
          reasons.push('当前血线健康，补给收益偏向稳态。');
        }
        break;
      case 'remove':
        if (profile.size >= 14) {
          score += 3.1;
          reasons.push('当前牌组偏厚，净化能直接提高抽到核心牌的频率。');
        } else if (profile.size >= 11) {
          score += 2.0;
          reasons.push('移除冗余牌能继续收束曲线。');
        } else {
          score += 0.7;
          reasons.push('当前牌组较薄，净化收益更偏长期优化。');
        }
        break;
      case 'exp':
      case 'fateLedger':
      case 'insightIncense':
      case 'runPathInsightAtlas':
        score += 1.8;
        reasons.push('命环成长服务偏向中长期增益，适合提前投资后续强度。');
        break;
      case 'tacticalPlan':
      case 'pulseCatalyst':
      case 'wardSigil':
      case 'runPathShatterOrder':
        score += profile.dominantType === 'attack' || profile.avgCost >= 1.8 ? 2.2 : 1.2;
        reasons.push('战前增益服务能放大现有节奏轴，尤其适合已经成型的牌组。');
        break;
      case 'bountyContract':
      case 'scoutPack':
      case 'rumorRareDraft':
      case 'rumorTreasureTrail':
      case 'rumorUtilityRoute':
      case 'rumorTrialRoute':
      case 'runPathShatterRumor':
      case 'runPathBulwarkRumor':
      case 'runPathInsightRumor':
        score += 1.4;
        reasons.push('这类交易更偏投资未来收益，适合资源宽裕时滚雪球。');
        break;
      case 'endlessRefit':
      case 'endlessOverclock':
      case 'endlessBlessing':
        score += this.game.isEndlessActive && this.game.isEndlessActive() ? 2.4 : 0.2;
        reasons.push(this.game.isEndlessActive && this.game.isEndlessActive() ? '当前处于无尽轮回，轮回服务会直接影响压力与赐福。' : '轮回类服务仅在无尽模式下有较高收益。');
        break;
      default:
        score += 1.0;
        reasons.push('这是泛用型服务，价值取决于你当前缺口。');
        break;
    }
    if (price > currentBudget) {
      score -= 1.8;
      reasons.push('当前资源不足，先保留余钱更稳。');
    } else if (currency === 'gold' && currentBudget - price < 45) {
      score -= 0.5;
      reasons.push('买完后灵石结余偏低，要注意下一次商店与事件缓冲。');
    }
    const label = score >= 3.0 ? '高适配' : score >= 1.7 ? '中适配' : '低适配';
    return {
      label,
      reason: reasons[0] || '当前局势下属于通用型服务。',
      score,
      summaryRows: [{
        label: '服务适配',
        value: label
      }, {
        label: '结余预估',
        value: `${Math.max(0, currentBudget - price)} ${this.game.getStrategicCurrencyLabel ? this.game.getStrategicCurrencyLabel(currency) : currency}`
      }, {
        label: '当前血线',
        value: `${Math.round(hpRatio * 100)}%`
      }]
    };
  }
  buildShopServiceDetailMeta(service, activeTab = null) {
    const fit = this.evaluateShopServiceFit(service);
    const economy = this.getShopEconomyOutlook();
    const currency = service?.currency || 'gold';
    const currentBudget = typeof this.game.getStrategicCurrencyAmount === 'function'
      ? this.game.getStrategicCurrencyAmount(currency)
      : Number(this.game.player?.gold) || 0;
    const price = Math.max(0, Number(service?.price) || 0);
    const currencyLabel = this.game.getStrategicCurrencyLabel ? this.game.getStrategicCurrencyLabel(currency) : currency;
    const hpPercent = Number.isFinite(Number(economy?.hpRatio)) ? Math.round(economy.hpRatio * 100) : 100;
    const extraSummaryRows = [{
      label: '适配度',
      value: fit.label || '适配未知'
    }, {
      label: '买后剩余',
      value: `${Math.max(0, currentBudget - price)} ${currencyLabel}`
    }, {
      label: '储备线',
      value: `${economy?.reserveTarget ?? 0} 灵石`
    }, {
      label: '建议单次',
      value: `≤ ${economy?.spendCeiling ?? 0} 灵石`
    }, {
      label: '当前血线',
      value: `${hpPercent}%`
    }];
    return {
      sectionLabel: '服务详情',
      sourceLabel: activeTab?.label || '商店服务',
      priceText: service?.sold ? '已售出' : this.game.formatShopPrice(service),
      availabilityText: service?.sold ? '已售出' : this.canAffordShopItem(service) ? '可购买' : '资源不足',
      usageHint: fit.reason,
      fitLabel: fit.label,
      economyNote: economy?.note || '',
      forecastText: economy?.forecast?.summary || '',
      extraSummaryRows,
      closeLabel: '返回商店'
    };
  }
  getShopNextNodeForecast() {
    if (!this.game.map || typeof this.game.map.getAccessibleNodes !== 'function') return null;
    const accessible = this.game.map.getAccessibleNodes().filter(node => node && node.id !== this.game.shopNode?.id);
    if (accessible.length === 0) return null;
    const shopRow = Number(this.game.shopNode?.row);
    const futureNodes = Number.isFinite(shopRow) ? accessible.filter(node => Number(node?.row) > shopRow) : accessible;
    const pool = futureNodes.length > 0 ? futureNodes : accessible;
    const minRow = Math.min(...pool.map(node => Number(node?.row) || 0));
    const frontier = pool.filter(node => (Number(node?.row) || 0) === minRow);
    const rank = {
      boss: 6,
      elite: 5,
      ghost_duel: 4,
      trial: 4,
      enemy: 3,
      forge: 2,
      event: 2,
      rest: 1,
      shop: 1
    };
    const sortedTypes = [...new Set(frontier.map(node => node.type))].sort((a, b) => (rank[b] || 0) - (rank[a] || 0));
    const primaryType = sortedTypes[0] || frontier[0]?.type || 'enemy';
    const labels = sortedTypes.map(type => this.game.getMapNodeTypeLabel(type));
    const danger = ['boss', 'elite', 'ghost_duel', 'trial'].includes(primaryType) ? 'high' : primaryType === 'enemy' ? 'medium' : 'low';
    return {
      row: minRow,
      nodes: frontier,
      primaryType,
      primaryLabel: this.game.getMapNodeTypeLabel(primaryType),
      labels,
      summary: labels.length > 0 ? `下一批节点：${labels.join(' / ')}` : '下一批节点未明',
      danger
    };
  }
  getShopEconomyOutlook() {
    const budget = typeof this.game.getStrategicCurrencyAmount === 'function' ? this.game.getStrategicCurrencyAmount('gold') : Number(this.game.player?.gold) || 0;
    const hpRatio = this.game.player?.maxHp > 0 ? this.game.player.currentHp / this.game.player.maxHp : 1;
    const forecast = this.getShopNextNodeForecast();
    const services = Array.isArray(this.game.shopServices) ? this.game.shopServices.filter(item => item && !item.sold) : [];
    const recoveryServiceIds = new Set(['heal', 'campRation', 'fieldMedic', 'endlessStabilizer']);
    const availableRecoveryServices = services.filter(item => recoveryServiceIds.has(item.id));
    const affordableRecoveryService = availableRecoveryServices.some(item => this.canAffordShopItem(item));
    let reserveTarget = this.game.isEndlessActive && this.game.isEndlessActive() ? 48 : 36;
    if (hpRatio <= 0.4) reserveTarget += 24;else if (hpRatio <= 0.6) reserveTarget += 16;else if (hpRatio <= 0.8) reserveTarget += 8;
    if (forecast?.danger === 'high') reserveTarget += hpRatio <= 0.6 ? 22 : 14;else if (forecast?.danger === 'medium') reserveTarget += 7;else if (forecast?.primaryType === 'rest') reserveTarget -= 12;else if (forecast?.primaryType === 'event' || forecast?.primaryType === 'shop' || forecast?.primaryType === 'forge') reserveTarget -= 5;
    if (availableRecoveryServices.length > 0 && !affordableRecoveryService && hpRatio <= 0.72) {
      reserveTarget += 8;
    }
    reserveTarget = Math.max(18, Math.min(120, Math.round(reserveTarget)));
    const spendCeiling = Math.max(0, budget - reserveTarget);
    const status = spendCeiling <= 0 ? 'critical' : spendCeiling < 35 ? 'tight' : 'stable';
    const statusLabelMap = {
      critical: '必须囤钱',
      tight: '谨慎消费',
      stable: '可灵活投入'
    };
    const note = status === 'critical' ? `建议至少保留 ${reserveTarget} 灵石，用于${forecast?.primaryLabel || '后续节点'}前的恢复与应急。` : status === 'tight' ? `本次更适合把单次消费控制在 ${spendCeiling} 灵石以内，避免下一批节点前失去回转空间。` : `当前可支配约 ${spendCeiling} 灵石，可优先买下真正高适配的卡牌或关键服务。`;
    return {
      budget,
      reserveTarget,
      spendCeiling,
      status,
      statusLabel: statusLabelMap[status] || '谨慎消费',
      note,
      forecast,
      hpRatio,
      affordableRecoveryService
    };
  }
  buildShopSpendRecommendation() {
    const availableCards = Array.isArray(this.game.shopItems) ? this.game.shopItems.filter(item => item && !item.sold) : [];
    const availableServices = Array.isArray(this.game.shopServices) ? this.game.shopServices.filter(item => item && !item.sold) : [];
    const affordableCards = availableCards.filter(item => this.canAffordShopItem(item)).map(item => ({
      item,
      fit: this.evaluateShopCardDeckFit(item.card)
    })).sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));
    const affordableServices = availableServices.filter(item => this.canAffordShopItem(item)).map(item => ({
      item,
      fit: this.evaluateShopServiceFit(item)
    })).sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));
    const bestCard = affordableCards[0] || null;
    const bestService = affordableServices[0] || null;
    const economy = this.getShopEconomyOutlook();
    const goldBudget = economy.budget;
    const hpRatio = economy.hpRatio;
    const forecast = economy.forecast;
    let bestCardScore = bestCard?.fit?.score || 0;
    let bestServiceScore = bestService?.fit?.score || 0;
    const serviceRecoveryIds = new Set(['heal', 'campRation', 'fieldMedic', 'endlessStabilizer']);
    if (bestCard) {
      const cardPrice = Math.max(0, Number(bestCard.item?.price) || 0);
      if (cardPrice > economy.spendCeiling) {
        bestCardScore -= 0.9 + (cardPrice - economy.spendCeiling) / 20;
      } else if (economy.status === 'stable') {
        bestCardScore += 0.35;
      }
      if (economy.status === 'critical') bestCardScore -= 0.85;else if (economy.status === 'tight') bestCardScore -= 0.25;
    }
    if (bestService) {
      const servicePrice = Math.max(0, Number(bestService.item?.price) || 0);
      const isRecoveryService = serviceRecoveryIds.has(bestService.item?.id);
      if (servicePrice > economy.spendCeiling) {
        bestServiceScore -= (isRecoveryService ? 0.25 : 0.65) + (servicePrice - economy.spendCeiling) / (isRecoveryService ? 42 : 26);
      } else if (isRecoveryService && economy.status !== 'stable' && hpRatio <= 0.65) {
        bestServiceScore += 0.55;
      }
      if (!isRecoveryService && economy.status === 'critical') {
        bestServiceScore -= 0.35;
      }
    }
    if (forecast?.danger === 'high') {
      bestServiceScore += hpRatio <= 0.7 ? 1.2 : 0.55;
      bestCardScore -= hpRatio <= 0.55 ? 0.55 : 0.15;
    } else if (forecast?.primaryType === 'rest') {
      bestCardScore += 0.45;
    } else if (forecast?.primaryType === 'event' || forecast?.primaryType === 'shop') {
      bestCardScore += 0.25;
      bestServiceScore -= 0.1;
    }
    const forecastHint = forecast?.summary ? ` ${forecast.summary}。` : '';
    if (!bestCard && !bestService) {
      return {
        action: '建议留钱',
        tone: 'save',
        reason: (goldBudget <= 40 ? '当前资源太紧，先留钱应对后续恢复与关键节点。' : '本页暂无高适配且可负担的选项，先观察下一次货架更稳。') + forecastHint,
        bestCard: null,
        bestService: null,
        forecast,
        economy
      };
    }
    if (forecast?.danger === 'high' && hpRatio <= 0.55 && bestService) {
      return {
        action: '更适合买服务',
        tone: 'service',
        reason: `${bestService.item.name}：${bestService.fit.reason}${forecastHint}`,
        bestCard,
        bestService,
        forecast,
        economy
      };
    }
    if (forecast?.danger === 'high' && goldBudget < 65) {
      return {
        action: '建议留钱',
        tone: 'save',
        reason: `下一批更接近${forecast.primaryLabel}，当前灵石偏紧，先保留恢复或应急资金更稳。`,
        bestCard,
        bestService,
        forecast,
        economy
      };
    }
    if (bestService && (!bestCard || bestServiceScore >= bestCardScore + 0.45)) {
      return {
        action: '更适合买服务',
        tone: 'service',
        reason: `${bestService.item.name}：${bestService.fit.reason}${forecastHint}`,
        bestCard,
        bestService,
        forecast,
        economy
      };
    }
    if (bestCard && (!bestService || bestCardScore >= bestServiceScore - 0.25)) {
      return {
        action: '更适合买卡',
        tone: 'card',
        reason: `${bestCard.item.card.name}：${bestCard.fit.reason}${forecastHint}`,
        bestCard,
        bestService,
        forecast,
        economy
      };
    }
    return {
      action: '建议留钱',
      tone: 'save',
      reason: `当前买卡与买服务的收益接近，若资源吃紧可先保留弹性。${forecastHint}`,
      bestCard,
      bestService,
      forecast,
      economy
    };
  }
  generateShopData() {
    const items = [];
    const services = [];
    const priceMult = this.getShopPriceMultiplier(0.15);

    // 1. 生成卡牌 (使用新方法)
    const newCards = this.generateShopCards(5);
    items.push(...newCards);

    // 2. 固定服务
    // 治疗
    services.push({
      id: 'heal',
      type: 'service',
      name: '灵丹妙药',
      icon: '💖',
      desc: `恢复 ${Math.floor(this.game.player.maxHp * 0.5)} 点生命`,
      // 30% -> 50%
      price: Math.floor(30 * priceMult),
      // 30
      sold: false
    });

    // 移除卡牌 - base price increased
    services.push({
      id: 'remove',
      type: 'service',
      name: '净化仪式',
      icon: '🗑️',
      desc: '移除一张牌',
      price: Math.floor(75 * (1 + (this.game.player.removeCount || 0) * 0.5) * priceMult),
      // 50 -> 75
      sold: false
    });

    // 命环经验 - base price increased
    services.push({
      id: 'exp',
      type: 'service',
      name: '命环充能',
      icon: '⬆️',
      desc: '命环经验 +100',
      // 100
      price: Math.floor(80 * priceMult),
      // 50 -> 80
      sold: false
    });
    services.push({
      id: 'tacticalPlan',
      type: 'service',
      name: '战术推演',
      icon: '📘',
      desc: '接下来 2 场战斗：首回合额外抽 1 张牌',
      price: Math.floor(95 * priceMult),
      sold: false
    });
    services.push({
      id: 'wardSigil',
      type: 'service',
      name: '护阵符',
      icon: '🧿',
      desc: '接下来 2 场战斗：开场获得 10 护盾',
      price: Math.floor(110 * priceMult),
      sold: false
    });
    services.push({
      id: 'bountyContract',
      type: 'service',
      name: '悬赏契约',
      icon: '📜',
      desc: '接下来 2 场战斗：胜利时额外获得灵石',
      price: Math.floor(125 * priceMult),
      sold: false
    });
    services.push({
      id: 'scoutPack',
      type: 'service',
      name: '侦巡补给包',
      icon: '🎒',
      desc: '支付灵石后，从 3 张随机卡牌中选择 1 张',
      price: Math.floor(105 * priceMult),
      sold: false
    });
    services.push({
      id: 'campRation',
      type: 'service',
      name: '行军口粮',
      icon: '🥣',
      desc: '恢复生命并获得 1 层开场护盾增益',
      price: Math.floor(85 * priceMult),
      sold: false
    });
    services.push({
      id: 'fateLedger',
      type: 'service',
      name: '命轨账簿',
      icon: '📚',
      desc: '命环经验 +45，并获得 1 层胜利悬赏增益',
      price: Math.floor(115 * priceMult),
      sold: false
    });
    services.push({
      id: 'pulseCatalyst',
      type: 'service',
      name: '灵息催化剂',
      icon: '⚡',
      desc: '接下来 2 场战斗：首回合灵力 +1',
      price: Math.floor(118 * priceMult),
      sold: false
    });
    services.push({
      id: 'insightIncense',
      type: 'service',
      name: '悟境香',
      icon: '🕯️',
      desc: '接下来 2 场战斗：命环经验额外 +30%',
      price: Math.floor(128 * priceMult),
      sold: false
    });
    services.push({
      id: 'fieldMedic',
      type: 'service',
      name: '战地医师签约',
      icon: '🩹',
      desc: '接下来 2 场战斗：胜利后恢复生命',
      price: Math.floor(112 * priceMult),
      sold: false
    });
    if (this.game.isEndlessActive()) {
      services.push({
        id: 'endlessRefit',
        type: 'service',
        name: '相位校准',
        icon: '🧬',
        desc: '替换一个当前无尽词缀',
        price: Math.floor(170 * priceMult),
        sold: false
      });
      services.push({
        id: 'endlessStabilizer',
        type: 'service',
        name: '轮回稳压',
        icon: '🧯',
        desc: '轮回压力 -2，并恢复生命',
        price: Math.floor(160 * priceMult),
        sold: false
      });
      services.push({
        id: 'endlessOverclock',
        type: 'service',
        name: '轮回过载',
        icon: '🔥',
        desc: '轮回压力 +2，立即获得稀有赐福与额外灵石',
        price: Math.floor(188 * priceMult),
        sold: false
      });
      services.push({
        id: 'endlessBlessing',
        type: 'service',
        name: '轮回祷告',
        icon: '🕯️',
        desc: '从 2 项无尽赐福中选择 1 项',
        price: Math.floor(210 * priceMult),
        sold: false
      });
    }

    // 3. 随机商品 (由原来的随机服务改为固定商品位 + 概率位)

    // --- 有概率刷出一个法宝 (如果有未拥有的) ---
    // 使用加权随机逻辑
    const treasure = this.game.getWeightedRandomTreasure();
    if (treasure && Math.random() < 0.5) {
      // 计算价格：基础价格 * (1 + 0.1 * (层数-1))
      let finalPrice = Math.floor((treasure.price || 150) * priceMult);
      services.push({
        id: treasure.id,
        type: 'treasure',
        name: treasure.name,
        icon: treasure.icon || '🏺',
        desc: treasure.description,
        price: finalPrice,
        sold: false,
        rarity: treasure.rarity
      });
    }

    // 4. 概率商品 (法则/药水/额外法宝)
    // 降低概率，因为已经必出法宝了
    if (Math.random() < 0.25) {
      const lawKeys = Object.keys(LAWS);
      const collectedLaws = Array.isArray(this.game?.player?.collectedLaws) ? this.game.player.collectedLaws : [];
      const uncollected = lawKeys.filter(k => !collectedLaws.some(l => l && l.id === k));
      if (uncollected.length > 0) {
        const randomLawId = uncollected[Math.floor(Math.random() * uncollected.length)];
        const law = LAWS[randomLawId];
        services.push({
          id: 'law',
          type: 'item',
          name: '法则残卷',
          icon: '📜',
          desc: `获得: ${law.name} `,
          price: Math.floor(250 * priceMult),
          sold: false,
          data: law
        });
      }
    }
    if (Math.random() < 0.2) {
      services.push({
        id: 'maxHp',
        type: 'item',
        name: '淬体金丹',
        icon: '💊',
        desc: '最大生命上限 +5',
        price: Math.floor(120 * priceMult),
        sold: false
      });
    }

    // 极小概率刷出永久力量
    if (Math.random() < 0.05) {
      services.push({
        id: 'strength',
        type: 'item',
        name: '龙血草',
        icon: '💪',
        desc: '永久力量 +1',
        price: Math.floor(300 * priceMult),
        sold: false
      });
    }

    // 5. 更多服务
    // 刷新商店
    services.push({
      id: 'refresh',
      type: 'service',
      name: '重新进货',
      icon: '🔄',
      desc: '刷新所有卡牌商品',
      price: Math.floor(50 * priceMult),
      sold: false
    });

    // 赌博：神秘盒子
    services.push({
      id: 'gamble',
      type: 'service',
      name: '神秘盲盒',
      icon: '🎁',
      desc: '可能获得灵石、卡牌或...空气？',
      price: Math.floor(30 * priceMult),
      sold: false
    });
    return {
      items,
      services
    };
  }
  generateShopCards(count = 5) {
    const items = [];
    const realm = this.game.player.realm || 1;
    const priceMult = this.getShopPriceMultiplier(0.05);
    for (let i = 0; i < count; i++) {
      // 随层数提升稀有度
      let rarity = 'common';
      const roll = Math.random();
      if (realm >= 3) {
        // Hardcore: 2% legendary, 6% epic, 18% rare, 34% uncommon, 40% common
        if (roll < 0.02) rarity = 'legendary';else if (roll < 0.08) rarity = 'epic';else if (roll < 0.26) rarity = 'rare';else if (roll < 0.60) rarity = 'uncommon';else rarity = 'common';
      } else {
        if (roll < 0.05) rarity = 'legendary';else if (roll < 0.2) rarity = 'rare';else if (roll < 0.5) rarity = 'uncommon';
      }
      const card = getRandomCard(rarity, this.game.player.characterId);
      if (!card) continue;

      // Hardcore: 移除折扣，仅按难度系数
      const basePrice = this.game.getCardPrice(card);
      const price = Math.floor(basePrice * 1.0 * priceMult);
      items.push({
        type: 'card',
        card: card,
        price: price,
        sold: false
      });
    }
    return items;
  }
  normalizeShopRumors(rumors = null) {
    const source = rumors && typeof rumors === 'object' ? rumors : {};
    const history = Array.isArray(source.history) ? source.history.filter(entry => typeof entry === 'string').slice(-6) : [];
    const shift = source.nextRealmMapShift && typeof source.nextRealmMapShift === 'object' ? {
      ...source.nextRealmMapShift
    } : null;
    return {
      rewardRareCharges: Math.max(0, Math.floor(Number(source.rewardRareCharges) || 0)),
      rewardRareBonus: Math.max(0, Number(source.rewardRareBonus) || 0),
      treasureCharges: Math.max(0, Math.floor(Number(source.treasureCharges) || 0)),
      treasureChanceBonus: Math.max(0, Number(source.treasureChanceBonus) || 0),
      nextRealmMapShift: shift,
      nextRealmLabel: typeof source.nextRealmLabel === 'string' ? source.nextRealmLabel : '',
      nextRealmTarget: Number.isFinite(Number(source.nextRealmTarget)) ? Math.max(1, Math.floor(Number(source.nextRealmTarget))) : null,
      history
    };
  }
  ensureShopRumors() {
    if (!this.game.player) {
      return this.normalizeShopRumors();
    }
    this.game.player.shopRumors = this.normalizeShopRumors(this.game.player.shopRumors);
    return this.game.player.shopRumors;
  }
  pushShopRumorHistory(entry) {
    if (typeof entry !== 'string' || !entry.trim()) return;
    const rumors = this.ensureShopRumors();
    rumors.history.push(entry.trim());
    rumors.history = rumors.history.slice(-6);
  }
  formatShopPrice(item = null) {
    if (!item) return '';
    const currency = item.currency || 'gold';
    const icon = this.game.getStrategicCurrencyIcon(currency);
    const label = this.game.getStrategicCurrencyLabel(currency);
    return `${icon} ${Math.max(0, Math.floor(Number(item.price) || 0))} ${label}`;
  }
  canAffordShopItem(item = null) {
    if (!item) return false;
    const price = Math.max(0, Math.floor(Number(item.price) || 0));
    return this.game.getStrategicCurrencyAmount(item.currency || 'gold') >= price;
  }
  spendShopPrice(item = null) {
    if (!item) return false;
    const price = Math.max(0, Math.floor(Number(item.price) || 0));
    const currency = item.currency || 'gold';
    if (this.game.getStrategicCurrencyAmount(currency) < price) return false;
    if (currency === 'insight') {
      this.game.player.heavenlyInsight -= price;
    } else if (currency === 'karma') {
      this.game.player.karma -= price;
    } else {
      this.game.player.gold -= price;
    }
    return true;
  }
  updateShopCurrencyDisplays() {
    const goldEl = document.getElementById('shop-gold-display');
    if (goldEl) goldEl.textContent = this.game.getStrategicCurrencyAmount('gold');
    const insightEl = document.getElementById('shop-insight-display');
    if (insightEl) insightEl.textContent = this.game.getStrategicCurrencyAmount('insight');
    const karmaEl = document.getElementById('shop-karma-display');
    if (karmaEl) karmaEl.textContent = this.game.getStrategicCurrencyAmount('karma');
    const subtitleEl = document.getElementById('shop-header-subtitle');
    if (subtitleEl) {
      const activeRumorText = this.getShopRumorSummaryText();
      subtitleEl.textContent = activeRumorText || '商贩会根据你的命途，拿出不同层级的交易。';
    }
  }
  getShopPriceMultiplier(scalePerRealm = 0.15) {
    const realm = this.game.player?.realm || 1;
    const endlessMods = this.game.isEndlessActive() ? this.game.getEndlessModifiers() : null;
    const vowEffects = this.game.player && typeof this.game.player.getRunVowEffects === 'function' ? this.game.player.getRunVowEffects() : {};
    let priceMult = 1 + Math.max(0, realm - 1) * scalePerRealm;
    if (endlessMods) {
      priceMult *= Math.max(0.75, Number(endlessMods.shopPriceMul) || 1);
    }
    priceMult *= Math.max(0.6, Number(vowEffects.shopPriceMul) || 1);
    return priceMult;
  }
  generateContractShopServices() {
    const priceMult = this.getShopPriceMultiplier(0.04);
    return [{
      id: 'forbiddenDraft',
      type: 'service',
      name: '逆命血契',
      icon: '🩸',
      desc: '失去 6 点生命上限，从 3 张稀有/史诗禁术卡中选择 1 张。',
      price: Math.max(1, Math.floor(1 * priceMult)),
      currency: 'karma',
      sold: false,
      riskLabel: '伤根基',
      tagLabel: '爆发成型'
    }, {
      id: 'soulMortgage',
      type: 'service',
      name: '蚀寿抵押',
      icon: '⛓️',
      desc: '当前生命降至至多 70%，换取 3 场首回合灵力 +1、命环经验提升与灵石补给。',
      price: Math.max(1, Math.floor(1 * priceMult)),
      currency: 'karma',
      sold: false,
      riskLabel: '搏命加速',
      tagLabel: '滚雪球'
    }, {
      id: 'doomIdol',
      type: 'service',
      name: '灾像供契',
      icon: '🗿',
      desc: '向牌组加入【心魔·疑心】，立即获得一件随机法宝与 80 灵石。',
      price: Math.max(1, Math.floor(2 * priceMult)),
      currency: 'karma',
      sold: false,
      riskLabel: '牌组污染',
      tagLabel: '法宝跃迁'
    }];
  }
  generateRumorShopServices() {
    const priceMult = this.getShopPriceMultiplier(0.02);
    return [{
      id: 'rumorRareDraft',
      type: 'service',
      name: '稀曜签',
      icon: '📎',
      desc: '接下来 2 次战后卡牌奖励显著偏向稀有/史诗。',
      price: Math.max(1, Math.floor(1 * priceMult)),
      currency: 'insight',
      sold: false,
      tagLabel: '未来奖励'
    }, {
      id: 'rumorTreasureTrail',
      type: 'service',
      name: '宝踪风声',
      icon: '🏺',
      desc: '接下来 2 次精英/Boss 结算提升法宝掉落概率。',
      price: Math.max(1, Math.floor(2 * priceMult)),
      currency: 'insight',
      sold: false,
      tagLabel: '战利强化'
    }, {
      id: 'rumorUtilityRoute',
      type: 'service',
      name: '商路星引',
      icon: '🗺️',
      desc: '下一重天地图更偏向事件、商店、营地与观星节点，适合稳定修整。',
      price: Math.max(1, Math.floor(2 * priceMult)),
      currency: 'insight',
      sold: false,
      tagLabel: '路线倾向'
    }, {
      id: 'rumorTrialRoute',
      type: 'service',
      name: '锋路谶语',
      icon: '⚔️',
      desc: '下一重天地图更偏向试炼、精英、锻炉与禁术节点，适合冒险爆发。',
      price: Math.max(1, Math.floor(2 * priceMult)),
      currency: 'insight',
      sold: false,
      tagLabel: '高压路线'
    }];
  }
  generateShopCatalog() {
    const base = this.generateShopData();
    const rumors = this.ensureShopRumors();
    const runPathProfile = typeof this.game.getRunPathShopProfile === 'function' ? this.game.getRunPathShopProfile() : null;
    const baseSummary = runPathProfile ? `常规补给，当前命途「${runPathProfile.name}」还额外备了专供交易。` : '常规补给，使用灵石进行构筑修整。';
    const rumorSummary = rumors.nextRealmLabel ? `已锁定下一重天路线：${rumors.nextRealmLabel}` : runPathProfile ? `花费天机锁定未来奖励与下一重天路线倾向。当前命途「${runPathProfile.name}」提供专属情报。` : '花费天机锁定未来奖励与下一重天路线倾向。';
    return {
      base: {
        id: 'base',
        icon: '🪙',
        label: '基础页',
        summary: baseSummary,
        cardTitle: '📜 卡牌出售',
        serviceTitle: '✨ 特殊服务',
        items: Array.isArray(base.items) ? base.items : [],
        services: this.game.injectRunPathShopServices(Array.isArray(base.services) ? base.services : [], 'base')
      },
      contract: {
        id: 'contract',
        icon: '🩸',
        label: '契约页',
        summary: `以业果换取高波动收益。当前业果：${this.game.getStrategicCurrencyAmount('karma')}。`,
        cardTitle: '🕯️ 禁术契据',
        serviceTitle: '🩸 高风险交易',
        items: [],
        services: this.generateContractShopServices()
      },
      rumor: {
        id: 'rumor',
        icon: '🔮',
        label: '传闻页',
        summary: rumorSummary,
        cardTitle: '🔍 情报锁定',
        serviceTitle: '📡 未来倾向',
        items: [],
        services: this.game.injectRunPathShopServices(this.generateRumorShopServices(), 'rumor')
      }
    };
  }
  syncActiveShopTab() {
    const catalog = this.game.shopCatalog && typeof this.game.shopCatalog === 'object' ? this.game.shopCatalog : this.generateShopCatalog();
    this.game.shopCatalog = catalog;
    const tabId = catalog[this.game.shopActiveTab] ? this.game.shopActiveTab : 'base';
    this.game.shopActiveTab = tabId;
    const tab = catalog[tabId];
    this.game.shopItems = Array.isArray(tab.items) ? tab.items : [];
    this.game.shopServices = Array.isArray(tab.services) ? tab.services : [];
    return tab;
  }
  switchShopTab(tabId = 'base') {
    if (!this.game.shopCatalog || !this.game.shopCatalog[tabId]) return;
    this.game.shopActiveTab = tabId;
    this.syncActiveShopTab();
    this.game.renderShop();
  }
  getShopRumorSummaryText() {
    const rumors = this.ensureShopRumors();
    const parts = [];
    if (rumors.rewardRareCharges > 0) {
      parts.push(`稀曜签剩余 ${rumors.rewardRareCharges} 次`);
    }
    if (rumors.treasureCharges > 0) {
      parts.push(`宝踪风声剩余 ${rumors.treasureCharges} 次`);
    }
    if (rumors.nextRealmLabel && rumors.nextRealmTarget) {
      parts.push(`第 ${rumors.nextRealmTarget} 重：${rumors.nextRealmLabel}`);
    }
    return parts.join(' ｜ ');
  }
  applyRunPathShopServiceEffect(service) {
    if (!service || typeof service !== 'object') return null;
    switch (service.id) {
      case 'runPathShatterOrder':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2);
          this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
        }
        Utils.showBattleLog('破命流军需：接下来 2 场战斗首回合灵力 +1，并提高胜利悬赏');
        this.game.showRewardModal('裂锋悬赏令生效', '接下来 2 场战斗：\n首回合灵力 +1，并获得胜利悬赏增益。', '🗡️');
        return true;
      case 'runPathBulwarkRation':
        {
          const healAmount = Math.max(12, Math.floor(this.game.player.maxHp * 0.2 * this.game.getEndlessHealingMultiplier()));
          this.game.player.heal(healAmount);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('openingBlockBoostBattles', 2);
            this.game.player.grantAdventureBuff('victoryHealBoostBattles', 1);
          }
          Utils.showBattleLog(`镇命流军需：恢复 ${healAmount} 生命，并补强护盾与医护`);
          this.game.showRewardModal('镇脉军需到位', `恢复 ${healAmount} 生命。\n接下来 2 场战斗开场护盾强化，并获得 1 层战后医护增益。`, '🛡️');
          return true;
        }
      case 'runPathInsightAtlas':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('ringExpBoostBattles', 2);
          this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', 1);
        }
        this.game.player.heavenlyInsight = this.game.getStrategicCurrencyAmount('insight') + 1;
        Utils.showBattleLog('窥命流校谱：命环经验增益生效，并额外获得 1 点天机');
        this.game.showRewardModal('窥盘校谱完成', '接下来 2 场战斗：命环经验额外提升。\n并获得 1 层首回合抽牌增益与 1 点天机。', '🔮');
        return true;
      case 'runPathShatterRumor':
        {
          const forecast = this.game.applyStrategicRouteForecast('runPathShatter');
          Utils.showBattleLog(`命途传闻锁定：第 ${this.game.player.realm + 1} 重更偏向${forecast.label}。`);
          this.game.showRewardModal('锋路断脉谶生效', `第 ${this.game.player.realm + 1} 重地图将更偏向${forecast.label}。`, forecast.icon || '⚔️');
          return true;
        }
      case 'runPathBulwarkRumor':
        {
          const forecast = this.game.applyStrategicRouteForecast('runPathBulwark');
          Utils.showBattleLog(`命途传闻锁定：第 ${this.game.player.realm + 1} 重更偏向${forecast.label}。`);
          this.game.showRewardModal('守脉安营录生效', `第 ${this.game.player.realm + 1} 重地图将更偏向${forecast.label}。`, forecast.icon || '🏕️');
          return true;
        }
      case 'runPathInsightRumor':
        {
          const forecast = this.game.applyStrategicRouteForecast('runPathInsight');
          Utils.showBattleLog(`命途传闻锁定：第 ${this.game.player.realm + 1} 重更偏向${forecast.label}。`);
          this.game.showRewardModal('裂隙观测志生效', `第 ${this.game.player.realm + 1} 重地图将更偏向${forecast.label}。`, forecast.icon || '🪞');
          return true;
        }
      default:
        return null;
    }
  }
  closeShop() {
    if (this.game.shopNode) {
      this.game.map.completeNode(this.game.shopNode);
      this.game.shopNode = null;
    }
    this.game.autoSave();
    this.game.showScreen('map-screen');
  }
}
if (typeof window !== 'undefined') {}
