import { Utils } from "../core/utils.js";
import { cloneCardTemplate } from "../data/cards.js";
export class StrategicView {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  showStrategicCardDraftModal(config = {}) {
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.game.getEventModalRefs();
    const cards = Array.isArray(config.cards) ? config.cards.filter(Boolean).slice(0, 3) : [];
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl || cards.length === 0) return false;
    titleEl.textContent = config.title || '残响抉择';
    iconEl.textContent = config.icon || '🃏';
    descEl.innerHTML = config.description || '从这些残章中选择一项回应。';
    choicesEl.innerHTML = '';
    cards.forEach(card => {
      const rarityKey = String(card.rarity || 'common').toLowerCase();
      const rarityLabel = this.game.getCardRarityLabel(rarityKey);
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${card.icon || '🃏'} ${card.name}</span>
                    <span class="choice-rarity rarity-${rarityKey}">【${rarityLabel}】</span>
                </div>
                <div class="choice-effect">${card.description || '获得这张卡牌。'}</div>
            `;
      btn.onclick = () => {
        if (typeof config.onSelect === 'function') {
          config.onSelect(card);
        }
      };
      choicesEl.appendChild(btn);
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>${config.leaveText || '🚶 暂且作罢'}</div>
            <div class="choice-effect">${config.leaveDesc || '保持当前命途，返回上一层抉择。'}</div>
        `;
    leaveBtn.onclick = () => {
      if (typeof config.onCancel === 'function') {
        config.onCancel();
        return;
      }
      this.game.closeModal();
    };
    choicesEl.appendChild(leaveBtn);
    this.game.activateModal(modal);
    return true;
  }
  showObservatoryNode(node) {
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.game.getEventModalRefs();
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      const forecast = this.game.applyStrategicRouteForecast('utility');
      const routeForecast = typeof this.game.buildObservatoryRouteForecast === 'function' ? this.game.buildObservatoryRouteForecast(node) : null;
      if (typeof this.game.rememberObservatoryRouteForecast === 'function') {
        this.game.rememberObservatoryRouteForecast(routeForecast, 'utility');
      }
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '观星推演');
      this.game.finishStrategicNode(node, '星轨已锁定', `第 ${this.game.player.realm + 1} 重将偏向 ${forecast?.label || '机缘补给线'}。\n天机 +${gained.insight || 0}。`, forecast?.icon || '🔭');
      return;
    }
    const nextRealm = Math.min(18, Math.max(1, (this.game.player?.realm || 1) + 1));
    const nextRealmName = typeof this.game.getDisplayRealmName === 'function' ? this.game.getDisplayRealmName(nextRealm) : this.game.map && typeof this.game.map.getRealmName === 'function' ? this.game.map.getRealmName(nextRealm) : `第 ${nextRealm} 重`;
    const env = this.game.map && typeof this.game.map.getRealmEnvironment === 'function' ? this.game.map.getRealmEnvironment(nextRealm) : {
      name: '未知天象',
      desc: '天机仍被迷雾遮蔽。'
    };
    const bossInfo = typeof this.game.getRealmBossInfo === 'function' ? this.game.getRealmBossInfo(nextRealm) : null;
    const pending = this.game.getPendingRouteRumorProfile(nextRealm);
    const pendingText = pending && pending.label ? `<br><span style="color:#8ecbff;">当前已锁定：${pending.label}</span>` : '';
    const routeForecast = typeof this.game.buildObservatoryRouteForecast === 'function' ? this.game.buildObservatoryRouteForecast(node) : null;
    const escapeForecast = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch] || ch);
    const routeForecastHtml = routeForecast && routeForecast.summaryLine ? `
            <div class="observatory-route-forecast" data-observatory-route-forecast="true">
                <strong>${escapeForecast(routeForecast.summaryLine)}</strong>
                <span>${escapeForecast(routeForecast.routeLine || '')}</span>
                <span>${escapeForecast(routeForecast.riskLine || '')}</span>
            </div>
        ` : '';
    titleEl.textContent = '观星台';
    iconEl.textContent = '🔭';
    descEl.innerHTML = `
            <strong>${nextRealmName}</strong><br>
            天象：${env.name} · ${env.desc}<br>
            ${bossInfo && bossInfo.bossName ? `Boss 倾向：${bossInfo.bossName}${bossInfo.mechDesc ? ` · ${bossInfo.mechDesc}` : ''}` : 'Boss 倾向仍未完全显形。'}
            ${pendingText}
            ${routeForecastHtml}
        `;
    choicesEl.innerHTML = '';
    const appendChoice = (icon, text, result, handler) => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
                <div>${icon} ${text}</div>
                <div class="choice-effect">${result}</div>
            `;
      btn.onclick = handler;
      choicesEl.appendChild(btn);
    };
    appendChoice('🗺️', '锁定福缘星轨', '偏向商路、观星、营地与平稳事件。', () => {
      const forecast = this.game.applyStrategicRouteForecast('utility');
      if (typeof this.game.rememberObservatoryRouteForecast === 'function') {
        this.game.rememberObservatoryRouteForecast(routeForecast, 'utility');
      }
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '观星推演');
      this.game.closeModal();
      this.game.finishStrategicNode(node, '福缘星轨已定', `第 ${this.game.player.realm + 1} 重路线趋向：${forecast.label}。\n${forecast.desc}\n天机 +${gained.insight || 0}。`, forecast.icon || '🗺️');
    });
    appendChoice('⚔️', '锁定锋芒星轨', '偏向试炼、精英、锻炉与禁术节点。', () => {
      const forecast = this.game.applyStrategicRouteForecast('assault');
      if (typeof this.game.rememberObservatoryRouteForecast === 'function') {
        this.game.rememberObservatoryRouteForecast(routeForecast, 'assault');
      }
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '观星推演');
      this.game.closeModal();
      this.game.finishStrategicNode(node, '锋芒星轨已定', `第 ${this.game.player.realm + 1} 重路线趋向：${forecast.label}。\n${forecast.desc}\n天机 +${gained.insight || 0}。`, forecast.icon || '⚔️');
    });
    appendChoice('✨', '校准星图战利', '锁定 1 次高稀有奖励，并获取 1 点天机。', () => {
      const rumors = this.game.ensureShopRumors();
      if (typeof this.game.rememberObservatoryRouteForecast === 'function') {
        this.game.rememberObservatoryRouteForecast(routeForecast, 'reward');
      }
      rumors.rewardRareCharges += 1;
      rumors.rewardRareBonus = Math.max(Number(rumors.rewardRareBonus) || 0, 0.25);
      if (nextRealm >= 5) {
        rumors.treasureCharges += 1;
        rumors.treasureChanceBonus = Math.max(Number(rumors.treasureChanceBonus) || 0, 0.16);
      }
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '星图校准');
      this.game.closeModal();
      this.game.finishStrategicNode(node, '星图校准完成', `天机 +${gained.insight || 0}。\n未来 1 次战后卡牌奖励将更偏向稀有/史诗。${nextRealm >= 5 ? '\n并额外锁定 1 次宝踪风声。' : ''}`, '🔭');
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 收拢星图</div>
            <div class="choice-effect">不再改写星轨，直接离开观星台。</div>
        `;
    leaveBtn.onclick = () => {
      this.game.closeModal();
      if (this.game.map && typeof this.game.map.completeNode === 'function') {
        this.game.map.completeNode(node);
      }
      this.game.autoSave();
    };
    choicesEl.appendChild(leaveBtn);
    this.game.activateModal(modal);
  }
  showForbiddenAltarNode(node) {
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.game.getEventModalRefs();
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      const gained = this.game.grantStrategicCurrencies({
        karma: 1
      }, '禁坛残响');
      this.game.finishStrategicNode(node, '禁坛回响', `业果 +${gained.karma || 0}。`, '🩸');
      return;
    }
    const player = this.game.player;
    const bloodCost = 6;
    const vowHpCost = Math.max(8, Math.floor((player.maxHp || 1) * 0.14));
    const vowDraft = this.game.draftRunVowChoices(this.game.player.realm);
    const activeVows = this.game.player && typeof this.game.player.getRunVowMetas === 'function' ? this.game.player.getRunVowMetas() : [];
    const vowSummary = activeVows.length > 0 ? activeVows.map(item => `${item.icon || '✧'} ${item.name} ${item.tierLabel}`).join(' / ') : '尚未立誓';
    titleEl.textContent = '禁术坛';
    iconEl.textContent = '🩸';
    descEl.innerHTML = `
            祭坛下的血纹正在回应你。<br>
            当前生命：${player.currentHp}/${player.maxHp} ｜ 业果：${this.game.getStrategicCurrencyAmount('karma')}<br>
            <span style="color:rgba(255,235,198,0.82)">当前誓约：${vowSummary}</span>
        `;
    choicesEl.innerHTML = '';
    const appendChoice = (icon, text, result, handler, disabled = false) => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      if (disabled) {
        btn.classList.add('disabled');
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
      btn.innerHTML = `
                <div>${icon} ${text}</div>
                <div class="choice-effect">${result}</div>
            `;
      if (!disabled) btn.onclick = handler;
      choicesEl.appendChild(btn);
    };
    appendChoice('📜', `血契夺卷（最大生命 -${bloodCost}）`, '从 3 张稀有/史诗卡中选择 1 张，并获得 1 点业果。', () => {
      const cards = this.game.draftStrategicCards({
        count: 3,
        rarityPool: ['rare', 'rare', 'epic'],
        preferArchetype: true
      });
      if (cards.length === 0) {
        Utils.showBattleLog('禁术卷轴暂未显化，祭仪中断。');
        return;
      }
      this.showStrategicCardDraftModal({
        title: '血契夺卷',
        icon: '📜',
        description: `祭出 ${bloodCost} 点生命上限，从以下残卷中选取一张。`,
        cards,
        leaveText: '🚶 返回祭坛',
        leaveDesc: '保留血量，回到禁术坛主选单。',
        onCancel: () => this.showForbiddenAltarNode(node),
        onSelect: card => {
          this.game.closeModal();
          player.maxHp = Math.max(16, player.maxHp - bloodCost);
          player.currentHp = Math.min(player.currentHp, player.maxHp);
          player.addCardToDeck(card);
          const gained = this.game.grantStrategicCurrencies({
            karma: 1
          }, '禁术血契');
          this.game.finishStrategicNode(node, '禁术血契完成', `获得卡牌：${card.name}\n最大生命降至 ${player.maxHp}。${gained.karma > 0 ? `\n业果 +${gained.karma}。` : ''}`, '🩸');
        }
      });
    }, player.maxHp <= 18);
    appendChoice('⛓️', `裂誓献祭（失去 ${vowHpCost} 生命）`, '立下或升阶一条誓约，并获得 1 点业果。', () => this.showForbiddenAltarVowDraft(node, vowHpCost, vowDraft), player.currentHp <= vowHpCost + 1 || !Array.isArray(vowDraft) || vowDraft.length === 0);
    appendChoice('🗿', '灾像供契', '向牌组加入【心魔·疑心】，换取一件法宝与 1 点业果。', () => {
      const curseCard = typeof cloneCardTemplate === 'function' ? cloneCardTemplate('demonDoubt') : null;
      if (curseCard) {
        player.addCardToDeck(curseCard);
      }
      const treasure = typeof this.game.getWeightedRandomTreasure === 'function' ? this.game.getWeightedRandomTreasure() : null;
      if (treasure) {
        player.addTreasure(treasure.id);
      }
      const gained = this.game.grantStrategicCurrencies({
        karma: 1
      }, '灾像供契');
      this.game.closeModal();
      this.game.finishStrategicNode(node, '灾像供契完成', `${curseCard ? '牌组加入【心魔·疑心】。' : '祭坛记录了你的灾像。'}${treasure ? `\n获得法宝：${treasure.name}。` : ''}${gained.karma > 0 ? `\n业果 +${gained.karma}。` : ''}`, '🗿');
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 压下邪念</div>
            <div class="choice-effect">不与祭坛继续交易，直接离开。</div>
        `;
    leaveBtn.onclick = () => {
      this.game.closeModal();
      if (this.game.map && typeof this.game.map.completeNode === 'function') {
        this.game.map.completeNode(node);
      }
      this.game.autoSave();
    };
    choicesEl.appendChild(leaveBtn);
    this.game.activateModal(modal);
  }
  showForbiddenAltarVowDraft(node, hpCost, draftIds = null) {
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.game.getEventModalRefs();
    const picks = Array.isArray(draftIds) && draftIds.length > 0 ? draftIds.slice(0, 3) : this.game.draftRunVowChoices(this.game.player.realm);
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl || picks.length === 0) {
      this.showForbiddenAltarNode(node);
      return;
    }
    const activeMetas = this.game.player && typeof this.game.player.getRunVowMetas === 'function' ? this.game.player.getRunVowMetas() : [];
    const buildEffectTags = (effects = {}) => {
      const tags = [];
      if (Number(effects.firstTurnDraw) > 0) tags.push(`首回合抽牌 +${Math.floor(Number(effects.firstTurnDraw) || 0)}`);
      if (Number(effects.firstTurnEnergy) > 0) tags.push(`首回合灵力 +${Math.floor(Number(effects.firstTurnEnergy) || 0)}`);
      if (Number(effects.openingBlock) > 0) tags.push(`开场护盾 +${Math.floor(Number(effects.openingBlock) || 0)}`);
      if (Number(effects.firstAttackBonusPerBattle) > 0) tags.push(`首击增伤 +${Math.floor(Number(effects.firstAttackBonusPerBattle) || 0)}`);
      if (Number(effects.onKillHeal) > 0) tags.push(`击杀回复 ${Math.floor(Number(effects.onKillHeal) || 0)}`);
      if (Number(effects.blockGainMultiplier) > 0) tags.push(`护盾效率 +${Math.round(Number(effects.blockGainMultiplier) * 100)}%`);
      if (Number(effects.rewardRareChance) > 0) tags.push('高稀有奖励倾向提升');
      if (Number(effects.commandCostDiscount) > 0) tags.push(`指令消耗 -${Math.floor(Number(effects.commandCostDiscount) || 0)}`);
      if (Number(effects.maxHpPenalty) > 0) tags.push(`生命上限 -${Math.floor(Number(effects.maxHpPenalty) || 0)}`);
      if (Number(effects.battleStartHpLoss) > 0) tags.push(`每战开场失血 ${Math.floor(Number(effects.battleStartHpLoss) || 0)}`);
      if (Number(effects.maxHandSizeOffset) < 0) tags.push(`手牌上限 ${Math.floor(Number(effects.maxHandSizeOffset) || 0)}`);
      if (Number(effects.shopPriceMul) > 1) tags.push(`商店涨价 ${Math.round((Number(effects.shopPriceMul) - 1) * 100)}%`);
      return tags.slice(0, 4);
    };
    titleEl.textContent = '禁坛裂誓';
    iconEl.textContent = '⛓️';
    descEl.innerHTML = `以 ${hpCost} 点生命为代价，撕开一条誓纹。`;
    choicesEl.innerHTML = '';
    picks.forEach(vowId => {
      const currentMeta = activeMetas.find(meta => meta.id === vowId) || null;
      const nextTier = currentMeta ? Math.min(currentMeta.maxTier, currentMeta.tier + 1) : 1;
      const meta = this.game.getRunVowMetaById(vowId, nextTier);
      if (!meta) return;
      const modeLabel = currentMeta ? `升阶 · ${currentMeta.tierLabel} → ${meta.tierLabel}` : `立誓 · ${meta.tierLabel}`;
      const tags = buildEffectTags(meta.effects || {});
      const btn = document.createElement('button');
      btn.className = 'event-choice run-vow-choice';
      btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${meta.icon || '✧'} ${meta.name}</span>
                    <span class="choice-rarity">${modeLabel}</span>
                </div>
                <div class="choice-effect">${meta.summary || meta.description}</div>
                <div class="choice-effect" style="color:#f1c89d;">赌注：${meta.risk || '誓约会改变后续资源与战斗节奏。'}</div>
                <div class="choice-effect" style="color:#b9d7ff;">路线：${meta.routeHint || '偏向高风险收益节点。'}</div>
                <div class="choice-effect">${tags.map(tag => `· ${tag}`).join('<br>')}</div>
            `;
      btn.onclick = () => {
        this.game.player.currentHp = Math.max(1, this.game.player.currentHp - hpCost);
        const gained = this.game.grantStrategicCurrencies({
          karma: 1
        }, '血祭立誓');
        const applied = this.game.applyRunVowSelection(vowId);
        this.game.closeModal();
        if (applied && applied.meta) {
          this.game.finishStrategicNode(node, '禁坛立誓完成', `${applied.meta.icon || '✧'} ${applied.meta.name}\n${applied.meta.summary}\n失去 ${hpCost} 生命。${gained.karma > 0 ? `\n业果 +${gained.karma}。` : ''}`, applied.meta.icon || '⛓️');
          return;
        }
        this.game.finishStrategicNode(node, '血祭回响', `失去 ${hpCost} 生命，却只留下残缺誓纹。${gained.karma > 0 ? `\n业果 +${gained.karma}。` : ''}`, '🩸');
      };
      choicesEl.appendChild(btn);
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 暂缓血祭</div>
            <div class="choice-effect">回到禁术坛主选单。</div>
        `;
    leaveBtn.onclick = () => this.showForbiddenAltarNode(node);
    choicesEl.appendChild(leaveBtn);
    this.game.activateModal(modal);
  }
  showMemoryRiftNode(node) {
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.game.getEventModalRefs();
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '裂隙回响');
      this.game.finishStrategicNode(node, '裂隙回响', `天机 +${gained.insight || 0}。`, '🪞');
      return;
    }
    const destinyMeta = this.game.player && typeof this.game.player.getRunDestinyMeta === 'function' ? this.game.player.getRunDestinyMeta() : null;
    const destinyText = destinyMeta ? `${destinyMeta.icon || '✦'} ${destinyMeta.name} ${destinyMeta.tierLabel}` : '暂无命格响应';
    const realmText = this.game.map && typeof this.game.map.getRealmName === 'function' ? this.game.map.getRealmName(this.game.player.realm) : `第 ${this.game.player.realm} 重`;
    titleEl.textContent = '记忆裂隙';
    iconEl.textContent = '🪞';
    descEl.innerHTML = `
            裂隙映出 <strong>${realmText}</strong> 的旧影。<br>
            当前命格：${destinyText}
        `;
    choicesEl.innerHTML = '';
    const appendChoice = (icon, text, result, handler) => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
                <div>${icon} ${text}</div>
                <div class="choice-effect">${result}</div>
            `;
      btn.onclick = handler;
      choicesEl.appendChild(btn);
    };
    appendChoice('✦', '追忆命格', '优先提升当前命格阶位；若已满阶，则转化为天机与感悟。', () => {
      this.game.closeModal();
      const advanced = this.game.advanceRunDestinyTier('记忆回响');
      if (advanced && advanced.upgraded && advanced.meta) {
        const exp = this.game.grantFateRingExp(24, '裂隙参悟');
        this.game.finishStrategicNode(node, '命格回响', `${advanced.meta.icon || '✦'} ${advanced.meta.name} 提升至 ${advanced.meta.tierLabel}。\n命环经验 +${exp}。`, advanced.meta.icon || '🪞');
        return;
      }
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '裂隙残响');
      const exp = this.game.grantFateRingExp(30, '裂隙残响');
      this.game.finishStrategicNode(node, '残响回收', `当前命格已抵达上限，转化为天机与感悟。\n天机 +${gained.insight || 0}。\n命环经验 +${exp}。`, '🪞');
    });
    appendChoice('📚', '撕取残章', '从 3 张构筑相关卡中选择 1 张，并获得 1 点天机。', () => {
      const cards = this.game.draftStrategicCards({
        count: 3,
        rarityPool: ['uncommon', 'rare', 'rare'],
        preferArchetype: true
      });
      if (cards.length === 0) {
        Utils.showBattleLog('裂隙残章尚未显化。');
        return;
      }
      this.showStrategicCardDraftModal({
        title: '撕取残章',
        icon: '📚',
        description: '从这些残章中抽取一页，写入当前构筑。',
        cards,
        leaveText: '🚶 返回裂隙',
        leaveDesc: '放弃这轮残章，回到裂隙主选单。',
        onCancel: () => this.showMemoryRiftNode(node),
        onSelect: card => {
          this.game.closeModal();
          this.game.player.addCardToDeck(card);
          const gained = this.game.grantStrategicCurrencies({
            insight: 1
          }, '残章采撷');
          const exp = this.game.grantFateRingExp(12, '残章采撷');
          this.game.finishStrategicNode(node, '残章融入构筑', `获得卡牌：${card.name}\n天机 +${gained.insight || 0}。\n命环经验 +${exp}。`, '📚');
        }
      });
    });
    appendChoice('🧭', '逆写路标', '锁定“裂隙回响线”，并让下一场战斗的命环收益更高。', () => {
      const forecast = this.game.applyStrategicRouteForecast('rift');
      if (this.game.player && typeof this.game.player.grantAdventureBuff === 'function') {
        this.game.player.grantAdventureBuff('ringExpBoostBattles', 1);
      }
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '裂隙定标');
      this.game.closeModal();
      this.game.finishStrategicNode(node, '裂隙路标已改写', `第 ${this.game.player.realm + 1} 重路线趋向：${forecast.label}。\n${forecast.desc}\n天机 +${gained.insight || 0}。\n接下来 1 场战斗命环经验收益提升。`, forecast.icon || '🪞');
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 合拢裂隙</div>
            <div class="choice-effect">不再追问旧影，直接离开。</div>
        `;
    leaveBtn.onclick = () => {
      this.game.closeModal();
      if (this.game.map && typeof this.game.map.completeNode === 'function') {
        this.game.map.completeNode(node);
      }
      this.game.autoSave();
    };
    choicesEl.appendChild(leaveBtn);
    this.game.activateModal(modal);
  }
  showSpiritGrottoDraft(node, draftIds = null) {
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.game.getEventModalRefs();
    const picks = Array.isArray(draftIds) && draftIds.length > 0 ? draftIds.slice(0, 3) : this.game.draftSpiritCompanionsForCharacter(this.game.player?.characterId || 'linFeng');
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl || picks.length === 0) {
      this.showSpiritGrottoNode(node);
      return;
    }
    const currentMeta = this.game.player && typeof this.game.player.getSpiritCompanionMeta === 'function' ? this.game.player.getSpiritCompanionMeta() : null;
    titleEl.textContent = '灵契换契';
    iconEl.textContent = '🪷';
    descEl.innerHTML = '从显化的灵契中重新立契，或借旧契回响直接升阶。';
    choicesEl.innerHTML = '';
    picks.forEach(spiritId => {
      const meta = this.game.getSpiritCompanionMetaById(spiritId, 1);
      if (!meta) return;
      const isCurrent = currentMeta && currentMeta.id === meta.id;
      const canUpgradeCurrent = !!(isCurrent && Number(currentMeta.tier) < Number(currentMeta.maxTier || currentMeta.tier || 1));
      const modeLabel = canUpgradeCurrent ? `维持契约 · 升至 ${this.game.getSpiritCompanionMetaById(meta.id, Math.min(meta.maxTier, 2))?.tierLabel || '下一阶'}` : isCurrent ? '当前同行灵契' : '改契同行';
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${meta.icon || '✦'} ${meta.name}</span>
                    <span class="choice-rarity">${modeLabel}</span>
                </div>
                <div class="choice-effect">${meta.summary || meta.description}</div>
                <div class="choice-effect" style="color:#b9d7ff;">被动：${meta.passiveDesc}</div>
                <div class="choice-effect" style="color:#f1c89d;">主动：${meta.activeDesc}</div>
            `;
      btn.onclick = () => {
        const gained = this.game.grantStrategicCurrencies({
          insight: 1
        }, '灵契换契');
        let resultMeta = null;
        if (canUpgradeCurrent) {
          const advanced = this.game.advanceSpiritCompanionTier('灵契回响');
          resultMeta = advanced && advanced.meta ? advanced.meta : null;
        } else if (typeof this.game.player?.setSpiritCompanion === 'function') {
          resultMeta = this.game.player.setSpiritCompanion(meta.id, 1);
        }
        this.game.closeModal();
        this.game.finishStrategicNode(node, '灵契回响成形', `${resultMeta ? `${resultMeta.icon || '✦'} ${resultMeta.name} · ${resultMeta.tierLabel}` : '灵契回响短暂闪烁。'}\n${resultMeta?.summary || resultMeta?.description || '同行灵契已重整。'}${gained.insight > 0 ? `\n天机 +${gained.insight}。` : ''}`, resultMeta?.icon || '🪷');
      };
      choicesEl.appendChild(btn);
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 返回灵契窟</div>
            <div class="choice-effect">先不换契，回到主选单。</div>
        `;
    leaveBtn.onclick = () => this.showSpiritGrottoNode(node);
    choicesEl.appendChild(leaveBtn);
    this.game.activateModal(modal);
  }
  showSpiritGrottoNode(node) {
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.game.getEventModalRefs();
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '灵契残响');
      this.game.finishStrategicNode(node, '灵契残响', `天机 +${gained.insight || 0}。`, '🪷');
      return;
    }
    const spiritMeta = this.game.player && typeof this.game.player.getSpiritCompanionMeta === 'function' ? this.game.player.getSpiritCompanionMeta() : null;
    const spiritText = spiritMeta ? `${spiritMeta.icon || '✦'} ${spiritMeta.name} ${spiritMeta.tierLabel}` : '尚未结契';
    const draftIds = this.game.draftSpiritCompanionsForCharacter(this.game.player?.characterId || 'linFeng');
    titleEl.textContent = '灵契窟';
    iconEl.textContent = '🪷';
    descEl.innerHTML = `
            灵窟中的气脉正回应你的同行之灵。<br>
            当前灵契：${spiritText}
        `;
    choicesEl.innerHTML = '';
    const appendChoice = (icon, text, result, handler, disabled = false) => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      if (disabled) {
        btn.classList.add('disabled');
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
      btn.innerHTML = `
                <div>${icon} ${text}</div>
                <div class="choice-effect">${result}</div>
            `;
      if (!disabled) btn.onclick = handler;
      choicesEl.appendChild(btn);
    };
    appendChoice('🫧', '契引新灵', '从 3 个灵契回响中选择 1 个同行；若维持旧契，则可直接升阶。', () => this.showSpiritGrottoDraft(node, draftIds), !Array.isArray(draftIds) || draftIds.length === 0);
    const canAdvance = !!(spiritMeta && Number(spiritMeta.tier) < Number(spiritMeta.maxTier || spiritMeta.tier || 1));
    appendChoice('⬆️', '灵契升阶', canAdvance ? '提升当前灵契阶位，并获得命环经验。' : '当前灵契已满阶，将转化为天机与灵脉感悟。', () => {
      const advanced = this.game.advanceSpiritCompanionTier('灵契共鸣');
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '灵契共鸣');
      const exp = this.game.grantFateRingExp(canAdvance ? 16 : 24, '灵契参悟');
      this.game.closeModal();
      if (advanced && advanced.upgraded && advanced.meta) {
        this.game.finishStrategicNode(node, '灵契升阶完成', `${advanced.meta.icon || '✦'} ${advanced.meta.name} 提升至 ${advanced.meta.tierLabel}。\n命环经验 +${exp}。${gained.insight > 0 ? `\n天机 +${gained.insight}。` : ''}`, advanced.meta.icon || '🪷');
        return;
      }
      this.game.finishStrategicNode(node, '灵契感悟回流', `当前灵契已满阶，感悟转化为命环经验与天机。\n命环经验 +${exp}。${gained.insight > 0 ? `\n天机 +${gained.insight}。` : ''}`, '🪷');
    }, !spiritMeta);
    appendChoice('📖', '追索灵痕', '获得 1 点天机，并让接下来 1 场战斗的命环经验额外提升。', () => {
      if (this.game.player && typeof this.game.player.grantAdventureBuff === 'function') {
        this.game.player.grantAdventureBuff('ringExpBoostBattles', 1);
      }
      const gained = this.game.grantStrategicCurrencies({
        insight: 1
      }, '灵痕追索');
      const exp = this.game.grantFateRingExp(12, '灵痕追索');
      this.game.closeModal();
      this.game.finishStrategicNode(node, '灵痕已铭刻', `天机 +${gained.insight || 0}。\n命环经验 +${exp}。\n接下来 1 场战斗命环经验收益提升。`, '📖');
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 收束灵潮</div>
            <div class="choice-effect">保持当前同行灵契，直接离开灵契窟。</div>
        `;
    leaveBtn.onclick = () => {
      this.game.closeModal();
      if (this.game.map && typeof this.game.map.completeNode === 'function') {
        this.game.map.completeNode(node);
      }
      this.game.autoSave();
    };
    choicesEl.appendChild(leaveBtn);
    this.game.activateModal(modal);
  }
  showEndlessParanoiaSelection(cycleOverride = null, onDone = null) {
    const choices = this.game.getEndlessParanoiaChoices();
    if (!choices || choices.length === 0) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    const modal = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const iconEl = document.getElementById('event-icon');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      this.game.applyEndlessParanoiaChoice(choices[0], cycleOverride);
      if (typeof onDone === 'function') onDone();
      return;
    }
    titleEl.textContent = '轮回偏执';
    iconEl.textContent = '🜂';
    descEl.innerHTML = '大轮回正在重写规则。你必须接纳一条负面法则，并领取一份超规格补偿。';
    choicesEl.innerHTML = '';
    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'event-choice endless-paranoia-choice';
      btn.innerHTML = `
                <div><span style="color:#ff9d7a;">【负】${choice.burden.name}</span> + <span style="color:#9de7ff;">【偿】${choice.boon.name}</span></div>
                <div class="choice-effect">${choice.burden.desc}<br>${choice.boon.desc}</div>
            `;
      btn.onclick = () => {
        const applied = this.game.applyEndlessParanoiaChoice(choice, cycleOverride);
        modal.classList.remove('active');
        if (applied) {
          Utils.showBattleLog(`轮回偏执：接纳【${applied.burden.name}】并获得【${applied.boon.name}】`);
          if (applied.immediate && applied.immediate.detail) {
            Utils.showBattleLog(`轮回补偿：${applied.immediate.detail}`);
          }
        }
        if (typeof onDone === 'function') onDone(applied);
      };
      choicesEl.appendChild(btn);
    });
    modal.classList.add('active');
  }
  showEndlessBoonSelection(onDone = null) {
    const choices = this.game.getEndlessBoonChoices();
    if (!choices || choices.length === 0) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    const modal = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const iconEl = document.getElementById('event-icon');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      this.game.applyEndlessBoon(choices[0].id);
      if (typeof onDone === 'function') onDone();
      return;
    }
    titleEl.textContent = '无尽赐福';
    iconEl.textContent = '♾️';
    descEl.innerHTML = '你突破了本轮天劫，命环共鸣为你显化三道赐福。<br>请选择其一并继续前进。';
    choicesEl.innerHTML = '';
    choices.forEach(boon => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      const rarityTag = boon.rarity === 'rare' ? '<span style="color:#ffb866;">【稀有】</span> ' : '';
      btn.innerHTML = `
                <div>${rarityTag}${boon.name}</div>
                <div class="choice-effect">${boon.desc}</div>
            `;
      btn.onclick = () => {
        const applied = this.game.applyEndlessBoon(boon.id);
        modal.classList.remove('active');
        if (applied) {
          Utils.showBattleLog(`无尽赐福已生效：${applied.name}`);
        }
        if (typeof onDone === 'function') onDone();
      };
      choicesEl.appendChild(btn);
    });
    modal.classList.add('active');
  }
}
if (typeof window !== 'undefined') {}
