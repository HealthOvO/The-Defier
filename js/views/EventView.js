import { V6_EVENT_PRESENTATION_TEMPLATES } from "../data/narrative_templates.js";
import { canUpgradeCard, upgradeCard } from "../data/cards.js";
import { Utils } from "../core/utils.js";
export class EventView {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  getEventModalRefs() {
    return {
      modal: document.getElementById('event-modal'),
      titleEl: document.getElementById('event-title'),
      iconEl: document.getElementById('event-icon'),
      descEl: document.getElementById('event-desc'),
      atmosphereEl: document.getElementById('event-atmosphere'),
      summaryEl: document.getElementById('event-system-summary'),
      choicesEl: document.getElementById('event-choices')
    };
  }
  resetModalPresentation(modal) {
    if (!modal) return;
    modal.style.display = '';
    modal.style.visibility = '';
    modal.style.opacity = '';
    modal.style.pointerEvents = '';
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.display = '';
      content.style.visibility = '';
      content.style.opacity = '';
      content.style.pointerEvents = '';
    }
  }
  getEventNarrativePresentation(event, node = null) {
    const currentChapter = this.game.player && typeof this.game.getChapterDisplaySnapshot === 'function' ? this.game.getChapterDisplaySnapshot(this.game.player.realm || 1) : null;
    let presentationKey = 'generic';
    if (event?.presentationKey) {
      presentationKey = String(event.presentationKey);
    } else if (event?.type === 'vow' || event?.isVowSelection) {
      presentationKey = 'vow';
    } else if (node?.type === 'rest') {
      presentationKey = 'rest';
    } else if (node?.type === 'observatory') {
      presentationKey = 'observatory';
    } else if (node?.type === 'forbidden') {
      presentationKey = 'forbidden';
    } else if (node?.type === 'memory') {
      presentationKey = 'memory';
    } else if (node?.type === 'event') {
      presentationKey = 'event';
    }
    const template = typeof V6_EVENT_PRESENTATION_TEMPLATES !== 'undefined' && V6_EVENT_PRESENTATION_TEMPLATES ? V6_EVENT_PRESENTATION_TEMPLATES[presentationKey] || V6_EVENT_PRESENTATION_TEMPLATES.generic || null : null;
    const summaryItems = [];
    if (currentChapter) {
      summaryItems.push(`章节：${currentChapter.name} · ${currentChapter.stageLabel}`);
    }
    if (event?.engineeringEventMeta) {
      const meta = event.engineeringEventMeta;
      const tierLabel = meta.tierLabel || `T${Math.max(0, Math.floor(Number(meta.tier) || 0))}`;
      summaryItems.push(`工程：${meta.icon || '🧭'} ${meta.name || '工程联动'} ${tierLabel}${meta.selectedByEngineeringBias ? ' · 偏置命中' : ' · 同步强化'}`);
      if (meta.summary) {
        summaryItems.push(`联动：${meta.summary}`);
      }
    }
    if (event?.summary) {
      summaryItems.push(`抉择：${event.summary}`);
    } else if (event?.description) {
      summaryItems.push(`抉择：${String(event.description).replace(/\s+/g, ' ').slice(0, 42)}`);
    }
    if (event?.isComposedChapterEvent && event?.composerMeta?.themeName) {
      summaryItems.push(`事件簇：${event.composerMeta.themeName}`);
    }
    if (event?.composerMeta?.recallText) {
      summaryItems.push(`回响：${String(event.composerMeta.recallText).slice(0, 24)}`);
    }
    if (node?.type) {
      summaryItems.push(`节点：${this.game.getMapNodeTypeLabel ? this.game.getMapNodeTypeLabel(node.type) : node.type}`);
    }
    const firstChoice = Array.isArray(event?.choices) && event.choices[0] ? event.choices[0] : null;
    const effectSummary = this.game.buildEventChoiceEffectSummary(firstChoice);
    if (effectSummary.length > 0) {
      summaryItems.push(`效果：${effectSummary.join(' / ')}`);
    }
    return {
      tone: String(event?.presentationTone || template?.tone || 'chapter'),
      atmosphere: String(event?.atmosphere || template?.atmosphere || '命数回响正在逼近，抉择会直接改写接下来的路线。'),
      summaryLabel: String(event?.summaryLabel || template?.summaryLabel || '局内摘要'),
      summaryItems: summaryItems.slice(0, 4)
    };
  }
  applyEventModalPresentation(presentation = {}) {
    const refs = this.getEventModalRefs();
    const modal = refs.modal;
    if (!modal) return;
    const escape = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const tone = String(presentation.tone || 'chapter');
    modal.dataset.eventTone = tone;
    const atmosphereText = String(presentation.atmosphere || '').trim();
    if (refs.atmosphereEl) {
      refs.atmosphereEl.textContent = atmosphereText;
      refs.atmosphereEl.style.display = atmosphereText ? '' : 'none';
    }
    const summaryItems = Array.isArray(presentation.summaryItems) ? presentation.summaryItems.filter(Boolean) : [];
    if (refs.summaryEl) {
      refs.summaryEl.innerHTML = summaryItems.length > 0 ? `
                    <span class="event-summary-label">${escape(presentation.summaryLabel || '局内摘要')}</span>
                    <div class="event-summary-chip-list">
                        ${summaryItems.map(item => `<span class="event-summary-chip">${escape(item)}</span>`).join('')}
                    </div>
                ` : '';
      refs.summaryEl.style.display = summaryItems.length > 0 ? '' : 'none';
    }
  }
  showEventModal(event, node) {
    this.game.currentBattleNode = node;
    this.game.currentEvent = event;
    const chapterSnapshot = typeof this.game.getChapterDisplaySnapshot === 'function' ? this.game.getChapterDisplaySnapshot(this.game.player?.realm || 1) : null;
    this.game.currentEventRuntimeMeta = {
      eventRuntimeId: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      chapterIndex: Math.max(1, Math.floor(Number(chapterSnapshot?.chapterIndex) || 1)),
      chapterName: String(chapterSnapshot?.name || ''),
      eventId: String(event?.id || ''),
      isComposedChapterEvent: !!event?.isComposedChapterEvent
    };
    const refs = this.getEventModalRefs();
    const modal = refs.modal;
    if (!modal || !refs.iconEl || !refs.titleEl || !refs.descEl || !refs.choicesEl) return;
    refs.iconEl.textContent = event.icon || '❓';
    refs.titleEl.textContent = event.name || '神秘事件';

    // 显示描述或对话
    if (event.speaker) {
      refs.descEl.innerHTML = `<span style="color: var(--accent-gold)">${event.speaker.icon}</span> ${event.speaker.dialogue}`;
    } else {
      refs.descEl.textContent = event.description || '发生了一些事情...';
    }
    this.applyEventModalPresentation(this.getEventNarrativePresentation(event, node));

    // 生成选项
    refs.choicesEl.innerHTML = '';
    event.choices.forEach((choice, index) => {
      // 检查条件
      let canChoose = true;
      let conditionText = '';
      if (choice.condition) {
        switch (choice.condition.type) {
          case 'hp':
            canChoose = this.game.player.currentHp >= choice.condition.min;
            if (!canChoose) conditionText = `(需要 ${choice.condition.min} HP)`;
            break;
          case 'gold':
            canChoose = this.game.player.gold >= choice.condition.min;
            if (!canChoose) conditionText = `(需要 ${choice.condition.min} 灵石)`;
            break;
          case 'deckSize':
            canChoose = this.game.player.deck.length >= choice.condition.min;
            if (!canChoose) conditionText = `(需要 ${choice.condition.min} 张卡牌)`;
            break;
        }
      }
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      if (!canChoose) btn.classList.add('disabled');
      const choiceSummary = this.game.buildEventChoiceEffectSummary(choice);
      const escape = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      btn.innerHTML = `
                <div class="choice-title">${choice.icon || '▶'} ${choice.text} ${conditionText}</div>
                <div class="choice-effect">${choice.result || ''}</div>
                ${choiceSummary.length > 0 ? `<div class="choice-summary">${choiceSummary.map(item => `<span class="choice-summary-chip">${escape(item)}</span>`).join('')}</div>` : ''}
            `;
      if (canChoose) {
        btn.onclick = () => this.game.selectEventChoice(index);
      } else {
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
      refs.choicesEl.appendChild(btn);
    });
    modal.classList.add('active');
  }
  showTrialChallengeSelection(node) {
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.getEventModalRefs();
    const challenges = this.game.getTrialChallengeCatalog();
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl || challenges.length === 0) {
      const fallback = challenges[0] || this.game.armTrialChallenge({
        id: 'speedKill',
        name: '逐光试斩',
        conditions: {
          maxTurns: 4
        },
        rewardMultiplier: 1.4,
        reward: 'law'
      });
      if (this.game.map && typeof this.game.map.startTrialNode === 'function') {
        this.game.map.startTrialNode(node, fallback);
      }
      return;
    }
    titleEl.textContent = '试炼碑';
    iconEl.textContent = '⚖️';
    descEl.innerHTML = '主动刻下 1 组试炼词缀，换取更高稀有奖励与额外战利。';
    choicesEl.innerHTML = '';
    challenges.forEach(challenge => {
      const conditionParts = [];
      if (challenge.conditions?.maxTurns > 0) conditionParts.push(`${challenge.conditions.maxTurns} 回合内取胜`);
      if (challenge.conditions?.maxCardsPlayed > 0) conditionParts.push(`最多打出 ${challenge.conditions.maxCardsPlayed} 张牌`);
      if (challenge.conditions?.noDamage) conditionParts.push('本场不可失去生命');
      const enemyParts = [];
      if (challenge.enemyHpMul > 1) enemyParts.push(`敌方生命 x${challenge.enemyHpMul.toFixed(2)}`);
      if (challenge.enemyAtkMul > 1) enemyParts.push(`敌方伤害 x${challenge.enemyAtkMul.toFixed(2)}`);
      if (challenge.enemyOpeningBlock > 0) enemyParts.push(`开场护盾 +${challenge.enemyOpeningBlock}`);
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${challenge.icon || '⚖️'} ${challenge.name}</span>
                    <span class="choice-rarity">奖励 x${challenge.rewardMultiplier.toFixed(2)}</span>
                </div>
                <div class="choice-effect">${challenge.desc}</div>
                <div class="choice-effect" style="color:#b9d7ff;">条件：${conditionParts.join('｜') || '常规试炼'}</div>
                <div class="choice-effect" style="color:#f1c89d;">词缀：${enemyParts.join('｜') || '强化精英基线'}</div>
            `;
      btn.onclick = () => {
        const armed = this.game.armTrialChallenge(challenge);
        this.game.closeModal();
        if (this.game.map && typeof this.game.map.startTrialNode === 'function') {
          this.game.map.startTrialNode(node, armed);
        }
      };
      choicesEl.appendChild(btn);
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 暂离试炼碑</div>
            <div class="choice-effect">不刻词缀，保留当前路线与资源。</div>
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
  showForgeChoiceModal(node, costs = {}) {
    this.game.currentBattleNode = node;
    const forgeCost = costs.forgeCost || 55 + this.game.player.realm * 9;
    const premiumCost = costs.premiumCost || forgeCost + 50;
    const temperCost = costs.temperCost || Math.max(30, Math.floor(forgeCost * 0.6));
    const upgradableCount = Array.isArray(this.game.player.deck) ? this.game.player.deck.filter(c => typeof canUpgradeCard === 'function' && canUpgradeCard(c)).length : 0;
    const equippedTreasures = Array.isArray(this.game.player?.equippedTreasures) ? this.game.player.equippedTreasures : [];
    const setTreasureCount = equippedTreasures.filter(treasure => treasure && typeof treasure.setTag === 'string' && treasure.setTag.trim()).length;
    const infusionEligibleCount = this.game.player && typeof this.game.player.isTreasureSpiritInfusionEligible === 'function' ? equippedTreasures.filter(treasure => this.game.player.isTreasureSpiritInfusionEligible(treasure)).length : 0;
    const spiritMeta = this.game.player && typeof this.game.player.getSpiritCompanionMeta === 'function' ? this.game.player.getSpiritCompanionMeta() : null;
    const workshopTags = this.game.player && typeof this.game.player.getTreasureWorkshopSnapshot === 'function' ? this.game.player.getTreasureWorkshopSnapshot('equipped').flatMap(entry => {
      const labels = [];
      if (entry.reforge?.label) labels.push(entry.reforge.label);
      if (entry.spiritBond) labels.push(`器灵·${entry.spiritBond}`);
      if (entry.setEcho) labels.push('套装修正');
      return labels;
    }) : [];
    const modal = document.getElementById('event-modal');
    document.getElementById('event-icon').textContent = '⚒️';
    document.getElementById('event-title').textContent = '天工炼器坊';
    const descEl = document.getElementById('event-desc');
    descEl.innerHTML = `
            炉火正旺，你可以选择锻牌、重铸与器灵调谐。<br>
            当前可强化卡牌：<span style="color:var(--accent-gold)">${upgradableCount}</span> 张｜
            已装备法宝：<span style="color:var(--accent-gold)">${equippedTreasures.length}</span> 件｜
            当前灵契：<span style="color:var(--accent-gold)">${spiritMeta ? `${spiritMeta.icon || '✦'} ${spiritMeta.name}` : '未结契'}</span><br>
            ${workshopTags.length > 0 ? `已激活工坊铭刻：<span style="color:#b9d7ff;">${workshopTags.join(' / ')}</span>` : '尚未激活工坊铭刻。'}
        `;
    const options = [{
      icon: '🔧',
      text: '锻牌方案',
      result: `进入精锻 / 过载 / 淬灵拓印分支（当前可强化 ${upgradableCount} 张牌）。`,
      canChoose: true,
      handler: () => this.showForgeCardDraft(node, {
        forgeCost,
        premiumCost,
        temperCost
      })
    }, {
      icon: '🧿',
      text: '法宝重铸',
      result: '为 1 件已装备法宝重写锻纹，改变其战斗定位。',
      canChoose: equippedTreasures.length > 0,
      handler: () => this.showForgeTreasureDraft(node, 'reforge', {
        forgeCost,
        premiumCost,
        temperCost
      })
    }, {
      icon: '🪶',
      text: '器灵灌注',
      result: spiritMeta ? infusionEligibleCount > 0 ? `将当前同行灵契注入 1 件核心法宝，开场时额外获得灵契蓄能（当前可选 ${infusionEligibleCount} 件）。` : '当前已装备法宝里没有核心件，暂时无法进行器灵灌注。' : '需要当前已有同行灵契。',
      canChoose: !!spiritMeta && infusionEligibleCount > 0,
      handler: () => this.showForgeTreasureDraft(node, 'infusion', {
        forgeCost,
        premiumCost,
        temperCost
      })
    }, {
      icon: '🧩',
      text: '套装修正',
      result: setTreasureCount > 0 ? '让 1 件套装法宝额外视作 +1 件同套，补齐套装共鸣阈值。' : '需要已装备带套装归属的法宝。',
      canChoose: setTreasureCount > 0,
      handler: () => this.showForgeTreasureDraft(node, 'calibration', {
        forgeCost,
        premiumCost,
        temperCost
      })
    }, {
      icon: '🚶',
      text: '暂离炼器坊',
      result: '保留资源，继续前进。',
      canChoose: true,
      handler: () => {
        modal.classList.remove('active');
        if (this.game.map && typeof this.game.map.completeNode === 'function') {
          this.game.map.completeNode(node);
        }
        this.game.autoSave();
      }
    }];
    const choicesEl = document.getElementById('event-choices');
    if (!modal || !choicesEl) return;
    choicesEl.innerHTML = '';
    options.forEach(option => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      if (!option.canChoose) btn.classList.add('disabled');
      btn.innerHTML = `
                <div>${option.icon} ${option.text}</div>
                <div class="choice-effect">${option.result}</div>
            `;
      if (option.canChoose) {
        btn.onclick = () => {
          if (typeof option.handler === 'function') {
            option.handler();
          }
        };
      } else {
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
      choicesEl.appendChild(btn);
    });
    modal.classList.add('active');
  }
  showForgeCardDraft(node, costs = {}) {
    this.game.currentBattleNode = node;
    const forgeCost = costs.forgeCost || 55 + this.game.player.realm * 9;
    const premiumCost = costs.premiumCost || forgeCost + 50;
    const temperCost = costs.temperCost || Math.max(30, Math.floor(forgeCost * 0.6));
    const upgradableCount = Array.isArray(this.game.player.deck) ? this.game.player.deck.filter(c => typeof canUpgradeCard === 'function' && canUpgradeCard(c)).length : 0;
    const modal = document.getElementById('event-modal');
    const iconEl = document.getElementById('event-icon');
    const titleEl = document.getElementById('event-title');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    if (!modal || !iconEl || !titleEl || !descEl || !choicesEl) return;
    iconEl.textContent = '⚒️';
    titleEl.textContent = '炼器坊·锻牌';
    descEl.innerHTML = `
            炼器炉心已转向牌阵锻压。<br>
            当前可强化卡牌：<span style="color:var(--accent-gold)">${upgradableCount}</span> 张
        `;
    const options = [{
      id: 'steady',
      icon: '🔧',
      text: `精锻（-${forgeCost} 灵石）`,
      result: '稳定强化 1 张卡牌',
      canChoose: this.game.player.gold >= forgeCost
    }, {
      id: 'overload',
      icon: '🔥',
      text: `过载锻造（-${premiumCost} 灵石）`,
      result: '强化 2 张卡牌并获得命环经验',
      canChoose: this.game.player.gold >= premiumCost
    }, {
      id: 'temper',
      icon: '📜',
      text: `淬灵拓印（-${temperCost} 灵石）`,
      result: '获得 1 张非传说卡并获得命环经验',
      canChoose: this.game.player.gold >= temperCost
    }, {
      id: 'back',
      icon: '↩️',
      text: '返回炼器坊',
      result: '回到主选单，改做法宝重铸或器灵灌注。',
      canChoose: true
    }];
    choicesEl.innerHTML = '';
    options.forEach(option => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      if (!option.canChoose) btn.classList.add('disabled');
      btn.innerHTML = `
                <div>${option.icon} ${option.text}</div>
                <div class="choice-effect">${option.result}</div>
            `;
      if (option.canChoose) {
        btn.onclick = () => {
          if (option.id === 'back') {
            this.showForgeChoiceModal(node, {
              forgeCost,
              premiumCost,
              temperCost
            });
            return;
          }
          modal.classList.remove('active');
          if (this.game.map && typeof this.game.map.applyForgeChoice === 'function') {
            this.game.map.applyForgeChoice(node, option.id, {
              forgeCost,
              premiumCost,
              temperCost
            });
          }
          this.game.autoSave();
        };
      } else {
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
      choicesEl.appendChild(btn);
    });
    modal.classList.add('active');
  }
  describeTreasureWorkshopStatus(treasure) {
    if (!treasure || !treasure.data || typeof treasure.data !== 'object') return '';
    if (this.game.player && typeof this.game.player.describeTreasureWorkshopStatus === 'function') {
      return this.game.player.describeTreasureWorkshopStatus(treasure);
    }
    const tags = [];
    if (treasure.data.workshopReforge && this.game.player && typeof this.game.player.getTreasureWorkshopReforgeLabel === 'function') {
      tags.push(this.game.player.getTreasureWorkshopReforgeLabel(treasure.data.workshopReforge));
    }
    if (treasure.data.workshopSpiritBond) {
      const spiritMeta = this.game.getSpiritCompanionMetaById(treasure.data.workshopSpiritBond, 1);
      tags.push(`器灵·${spiritMeta?.name || treasure.data.workshopSpiritBond}`);
    }
    if (treasure.data.workshopSetEcho) {
      tags.push('套装修正');
    }
    return tags.join(' / ');
  }
  showForgeTreasureDraft(node, mode = 'reforge', costs = {}) {
    this.game.currentBattleNode = node;
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.getEventModalRefs();
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      this.showForgeChoiceModal(node, costs);
      return;
    }
    const spiritMeta = this.game.player && typeof this.game.player.getSpiritCompanionMeta === 'function' ? this.game.player.getSpiritCompanionMeta() : null;
    const equippedTreasures = Array.isArray(this.game.player?.equippedTreasures) ? this.game.player.equippedTreasures.slice() : [];
    let title = '炼器坊';
    let icon = '⚒️';
    let description = '从法宝中选择一件进行改造。';
    let candidates = equippedTreasures.slice();
    if (mode === 'reforge') {
      title = '炼器坊·法宝重铸';
      icon = '🧿';
      description = '改写一件法宝的锻纹，使其更偏向护势、裂脉或节奏收益。';
    } else if (mode === 'infusion') {
      title = '炼器坊·器灵灌注';
      icon = '🪶';
      description = spiritMeta ? `将 ${spiritMeta.icon || '✦'} ${spiritMeta.name} 的回响注入核心法宝，开场时额外获得灵契蓄能。` : '当前没有同行灵契，无法进行器灵灌注。';
      candidates = equippedTreasures.filter(treasure => this.game.player && typeof this.game.player.isTreasureSpiritInfusionEligible === 'function' && this.game.player.isTreasureSpiritInfusionEligible(treasure));
    } else if (mode === 'calibration') {
      title = '炼器坊·套装修正';
      icon = '🧩';
      description = '让一件套装法宝额外视作 +1 件同套，用于补齐套装共鸣阈值。';
      candidates = equippedTreasures.filter(treasure => treasure && typeof treasure.setTag === 'string' && treasure.setTag.trim());
    }
    if (mode === 'infusion' && !spiritMeta) {
      this.showForgeChoiceModal(node, costs);
      return;
    }
    if (!candidates.length) {
      this.showForgeChoiceModal(node, costs);
      return;
    }
    titleEl.textContent = title;
    iconEl.textContent = icon;
    descEl.innerHTML = description;
    choicesEl.innerHTML = '';
    candidates.forEach(treasure => {
      const setLabel = this.game.player && typeof this.game.player.getTreasureSetLabel === 'function' ? this.game.player.getTreasureSetLabel(treasure.setTag || '') : treasure.setTag || '散修';
      const statusText = this.describeTreasureWorkshopStatus(treasure);
      const research = this.game.player && typeof this.game.player.getTreasureResearchEntry === 'function' ? this.game.player.getTreasureResearchEntry(treasure) : null;
      let previewText = treasure.description || '保留原有法宝能力。';
      if (mode === 'reforge' && this.game.player && typeof this.game.player.getTreasureWorkshopReforgeMode === 'function') {
        const reforgeMode = this.game.player.getTreasureWorkshopReforgeMode(treasure);
        const reforgeLabel = this.game.player.getTreasureWorkshopReforgeLabel(reforgeMode);
        const reforgeSummary = this.game.player.getTreasureWorkshopReforgeSummary(reforgeMode);
        previewText = `将改铸为【${reforgeLabel}】。${reforgeSummary}`;
      } else if (mode === 'infusion') {
        previewText = `注入 ${spiritMeta?.name || '灵契'} 回响。战斗开始时，若当前同行灵契匹配，则灵契蓄能 +1。${research?.role?.label ? ` 当前定位：${research.role.label}。` : ''}`;
      } else if (mode === 'calibration') {
        const sameSetCount = equippedTreasures.filter(entry => entry && entry.setTag === treasure.setTag).length;
        previewText = `${setLabel} 套装将额外视作 +1 件，当前会提升到 ${sameSetCount + 1} 件共鸣。`;
      }
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${treasure.icon || '✦'} ${treasure.name}</span>
                    <span class="choice-rarity">${setLabel}</span>
                </div>
                <div class="choice-effect">${previewText}</div>
                ${research?.focusTags?.length ? `<div class="choice-effect" style="color:#d7e8ff;">适配：${research.focusTags.join(' / ')}</div>` : ''}
                ${statusText ? `<div class="choice-effect" style="color:#b9d7ff;">当前铭刻：${statusText}</div>` : ''}
            `;
      btn.onclick = () => {
        let result = null;
        let gainedInsight = 0;
        let gainedExp = 0;
        if (mode === 'reforge' && typeof this.game.player?.applyTreasureReforge === 'function') {
          result = this.game.player.applyTreasureReforge(treasure.id);
          gainedExp = this.game.grantFateRingExp(12, '重铸余烬');
        } else if (mode === 'infusion' && typeof this.game.player?.applyTreasureSpiritInfusion === 'function') {
          result = this.game.player.applyTreasureSpiritInfusion(treasure.id, spiritMeta?.id || '');
          gainedInsight = this.game.grantStrategicCurrencies({
            insight: 1
          }, '器灵灌注').insight || 0;
          gainedExp = this.game.grantFateRingExp(8, '器灵灌注');
        } else if (mode === 'calibration' && typeof this.game.player?.applyTreasureSetCalibration === 'function') {
          result = this.game.player.applyTreasureSetCalibration(treasure.id);
          gainedInsight = this.game.grantStrategicCurrencies({
            insight: 1
          }, '套装修正').insight || 0;
          gainedExp = this.game.grantFateRingExp(10, '套装修正');
        }
        if (!result) {
          this.showForgeChoiceModal(node, costs);
          return;
        }
        this.game.closeModal();
        if (mode === 'reforge') {
          this.game.finishStrategicNode(node, '法宝重铸完成', `${result.icon || '✦'} ${result.name} 已完成【${result.label}】。\n${result.summary}\n命环经验 +${gainedExp}。`, result.icon || '🧿');
          return;
        }
        if (mode === 'infusion') {
          this.game.finishStrategicNode(node, '器灵灌注完成', `${result.icon || '✦'} ${result.name} 已与 ${result.spiritIcon || '✦'} ${result.spiritName} 建立回响。\n${result.summary}\n命环经验 +${gainedExp}。${gainedInsight > 0 ? `\n天机 +${gainedInsight}。` : ''}`, result.icon || '🪶');
          return;
        }
        this.game.finishStrategicNode(node, '套装修正完成', `${result.icon || '✦'} ${result.name} 已校准为 ${result.setLabel} 共鸣锚点。\n${result.summary}\n当前 ${result.setLabel} 套装视作 ${result.pieces} 件。\n命环经验 +${gainedExp}。${gainedInsight > 0 ? `\n天机 +${gainedInsight}。` : ''}`, result.icon || '🧩');
      };
      choicesEl.appendChild(btn);
    });
    const backBtn = document.createElement('button');
    backBtn.className = 'event-choice';
    backBtn.innerHTML = `
            <div>↩️ 返回炼器坊</div>
            <div class="choice-effect">回到主选单，改做其他炼器方案。</div>
        `;
    backBtn.onclick = () => this.showForgeChoiceModal(node, costs);
    choicesEl.appendChild(backBtn);
    this.game.activateModal(modal);
  }
  showTemporaryEventShop(effect = {}) {
    const modal = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const iconEl = document.getElementById('event-icon');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) return;
    const offers = this.game.getTemporaryEventShopOffers(effect);
    const continueFromMarket = () => {
      modal.classList.remove('active');
      this.game.onEventComplete();
    };
    titleEl.textContent = effect.title || '裂隙行商';
    iconEl.textContent = effect.icon || '🛒';
    descEl.textContent = effect.desc || '行商从裂隙中取出几件短期军需，你只能带走其中一件。';
    choicesEl.innerHTML = '';
    offers.forEach(offer => {
      const canBuy = this.game.player.gold >= offer.price;
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      if (!canBuy) btn.classList.add('disabled');
      btn.innerHTML = `
                <div>${offer.icon} ${offer.name}（-${offer.price} 灵石）</div>
                <div class="choice-effect">${offer.desc}</div>
            `;
      if (canBuy) {
        btn.onclick = () => {
          this.game.player.gold -= offer.price;
          const resultText = this.game.applyTemporaryEventShopOffer(offer);
          this.game.updatePlayerDisplay();
          this.game.autoSave();
          descEl.innerHTML = `
                        <div style=\"color:var(--accent-gold);\">交易完成</div>
                        <div style=\"margin-top:8px;\">${resultText}</div>
                    `;
          choicesEl.innerHTML = '';
          const doneBtn = document.createElement('button');
          doneBtn.className = 'event-choice';
          doneBtn.innerHTML = '<div>▶ 继续前进</div>';
          doneBtn.onclick = continueFromMarket;
          choicesEl.appendChild(doneBtn);
        };
      } else {
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
      choicesEl.appendChild(btn);
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 不做交易</div>
            <div class="choice-effect">保持资源，继续前进</div>
        `;
    leaveBtn.onclick = continueFromMarket;
    choicesEl.appendChild(leaveBtn);
    modal.classList.add('active');
  }
  showEventUpgradeCard() {
    const modal = document.getElementById('deck-modal');
    const container = document.getElementById('deck-view-cards');
    // Clear previous content
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexDirection = 'row'; // Ensure row layout for split view

    // Create Split Layout
    const listContainer = document.createElement('div');
    listContainer.style.flex = '1';
    listContainer.style.display = 'flex';
    listContainer.style.flexWrap = 'wrap';
    listContainer.style.justifyContent = 'center';
    listContainer.style.alignContent = 'flex-start';
    listContainer.style.overflowY = 'auto';
    listContainer.style.maxHeight = '60vh';
    const previewContainer = document.createElement('div');
    previewContainer.style.width = '300px';
    previewContainer.style.borderLeft = '1px solid rgba(255,255,255,0.1)';
    previewContainer.style.padding = '10px';
    previewContainer.style.display = 'flex';
    previewContainer.style.flexDirection = 'column';
    previewContainer.style.alignItems = 'center';
    container.appendChild(listContainer);
    container.appendChild(previewContainer);

    // Preview UI Elements
    previewContainer.innerHTML = `
            <h3 style="color:var(--accent-gold);margin-top:0;">升级预览</h3>
            <div id="upgrade-preview-placeholder" style="color:#666;margin-top:50px;">
                鼠标悬浮或点击卡牌<br>查看升级效果
            </div>
            <div id="upgrade-preview-card" style="display:none; transform:scale(1.1); margin: 20px 0;"></div>
            <div id="upgrade-diff-text" style="width:100%; font-size:0.9rem; color:#ddd; margin: 10px 0; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; display:none;"></div>
            <button id="confirm-upgrade-btn" class="menu-btn" style="margin-top:auto; width:100%;" disabled>确认升级</button>
        `;
    const confirmBtn = previewContainer.querySelector('#confirm-upgrade-btn');
    const previewCardDiv = previewContainer.querySelector('#upgrade-preview-card');
    const previewTextDiv = previewContainer.querySelector('#upgrade-diff-text');
    const placeholder = previewContainer.querySelector('#upgrade-preview-placeholder');
    let selectedIndex = -1;
    const upgradableCards = this.game.player.deck.filter(c => canUpgradeCard(c));
    if (upgradableCards.length === 0) {
      listContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);width:100%;">没有可升级的卡牌</p>';
      setTimeout(() => {
        this.game.closeModal();
        this.game.onEventComplete();
      }, 1500);
      return;
    }

    // Render Cards
    this.game.player.deck.forEach((card, index) => {
      if (!canUpgradeCard(card)) return;
      const cardEl = Utils.createCardElement(card, index);
      cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
      cardEl.style.cursor = 'pointer';
      cardEl.dataset.index = index;

      // Interaction Logic
      const showPreview = () => {
        const upgraded = upgradeCard(card);
        placeholder.style.display = 'none';
        previewCardDiv.style.display = 'flex';
        previewTextDiv.style.display = 'block';

        // Clear and render upgraded card
        previewCardDiv.innerHTML = '';
        const upgradedEl = Utils.createCardElement(upgraded, 999); // Dummy index
        upgradedEl.classList.add(`rarity-${upgraded.rarity || 'common'}`);
        previewCardDiv.appendChild(upgradedEl);

        // Show basic info text
        previewTextDiv.innerHTML = `
                    <p style="margin:0;color:var(--accent-green);font-weight:bold;">${card.name} ➤ ${upgraded.name}</p>
                    <p style="margin:4px 0 0 0;font-size:0.8rem;">${upgraded.description}</p>
                `;
      };

      // Hover: Show preview (but don't select if not clicked)
      cardEl.addEventListener('mouseenter', () => {
        if (selectedIndex === -1) showPreview();
      });

      // Click: Select and Enable Confirm
      cardEl.addEventListener('click', () => {
        // Deselect others
        listContainer.querySelectorAll('.card').forEach(c => c.style.border = '');
        // Select this
        cardEl.style.border = '3px solid var(--accent-gold)';
        selectedIndex = index;
        showPreview(); // Force show this preview
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('disabled');
      });
      listContainer.appendChild(cardEl);
    });

    // Confirm Action
    confirmBtn.onclick = () => {
      if (selectedIndex === -1) return;
      const card = this.game.player.deck[selectedIndex];
      const upgraded = upgradeCard(card);
      this.game.player.deck[selectedIndex] = upgraded;
      Utils.showBattleLog(`${card.name} 升级为 ${upgraded.name}！`);

      // Clean up styles
      container.style.display = '';
      container.style.flexDirection = '';
      this.game.closeModal();
      this.game.onEventComplete();
    };
    modal.classList.add('active');
  }
}

// Temporary export mechanism for inline scripts (if needed)
if (typeof window !== 'undefined') {}
