import { EndlessManager } from "./EndlessManager.js";
import { TREASURES } from "../data/treasures.js";
import { Utils } from "../core/utils.js";
import { getRandomEnemy } from "../data/enemies.js";
import { CARDS, ENEMIES } from "../data/index.js";
import { getRandomCard, inferDeckArchetype, getRandomArchetypeCard } from "../data/cards.js";
import { LAWS } from "../data/laws.js";
import { FATE_RING } from "../data/fate_ring.js";
export class EventManager {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  getEventManagerHooks() {
    const getHooks = this.game && typeof this.game.getEventManagerHooks === 'function' ? this.game.getEventManagerHooks.bind(this.game) : typeof Game !== 'undefined' && Game?.prototype && typeof Game.prototype.getEventManagerHooks === 'function' ? Game.prototype.getEventManagerHooks.bind(this.game) : null;
    if (!getHooks) return null;
    const hooks = getHooks();
    return hooks && typeof hooks === 'object' ? hooks : null;
  }
  getEventManagerHook(name, fallback = null) {
    const hooks = this.getEventManagerHooks();
    if (hooks && typeof hooks[name] === 'function') {
      return hooks[name];
    }
    return typeof fallback === 'function' ? fallback : null;
  }
  getEventModalRefs() {
    return this.game.eventView.getEventModalRefs();
  }
  resetModalPresentation(modal) {
    return this.game.eventView.resetModalPresentation(modal);
  }
  createDefaultChapterEventLedger() {
    return {
      version: 1,
      updatedAt: 0,
      entries: [],
      counters: {
        short_gain_long_loss: 0,
        short_loss_long_gain: 0,
        defer: 0,
        other: 0
      },
      tagFrequency: {}
    };
  }
  normalizeChapterEventLedger(rawLedger = null) {
    const fallback = this.createDefaultChapterEventLedger();
    const source = rawLedger && typeof rawLedger === 'object' ? rawLedger : {};
    const entries = Array.isArray(source.entries) ? source.entries : [];
    const normalizedEntries = entries.filter(entry => entry && typeof entry === 'object').map(entry => ({
      id: String(entry.id || `ledger_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
      runtimeId: String(entry.runtimeId || ''),
      eventId: String(entry.eventId || ''),
      eventName: String(entry.eventName || ''),
      choiceIndex: Math.max(0, Math.floor(Number(entry.choiceIndex) || 0)),
      choiceText: String(entry.choiceText || ''),
      chapterIndex: Math.max(1, Math.floor(Number(entry.chapterIndex) || 1)),
      chapterName: String(entry.chapterName || ''),
      arcType: String(entry.arcType || 'other'),
      immediateText: String(entry.immediateText || ''),
      longTermText: String(entry.longTermText || ''),
      echoText: String(entry.echoText || entry.longTermText || ''),
      tags: Array.isArray(entry.tags) ? Array.from(new Set(entry.tags.map(tag => String(tag || '').trim()).filter(Boolean))).slice(0, 8) : [],
      nodeType: String(entry.nodeType || ''),
      createdAt: Math.max(0, Math.floor(Number(entry.createdAt) || Date.now()))
    })).slice(-80);
    const counters = {
      short_gain_long_loss: 0,
      short_loss_long_gain: 0,
      defer: 0,
      other: 0
    };
    const tagFrequency = {};
    normalizedEntries.forEach(entry => {
      const arcType = entry.arcType;
      if (Object.prototype.hasOwnProperty.call(counters, arcType)) {
        counters[arcType] += 1;
      } else {
        counters.other += 1;
      }
      entry.tags.forEach(tag => {
        tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
      });
    });
    return {
      ...fallback,
      version: Math.max(1, Math.floor(Number(source.version) || 1)),
      updatedAt: Math.max(0, Math.floor(Number(source.updatedAt) || normalizedEntries[normalizedEntries.length - 1]?.createdAt || 0)),
      entries: normalizedEntries,
      counters,
      tagFrequency
    };
  }
  ensureChapterEventLedger() {
    this.game.chapterEventLedger = this.normalizeChapterEventLedger(this.game.chapterEventLedger);
    return this.game.chapterEventLedger;
  }
  getChapterEventLedgerSaveState() {
    return this.normalizeChapterEventLedger(this.ensureChapterEventLedger());
  }
  applyChapterEventLedgerSaveState(rawLedger = null) {
    this.game.chapterEventLedger = this.normalizeChapterEventLedger(rawLedger);
    return this.game.chapterEventLedger;
  }
  getChapterEventLedgerSnapshot(options = {}) {
    const ledger = this.ensureChapterEventLedger();
    const includeEntries = !!options.includeEntries;
    const limit = Math.max(1, Math.min(20, Math.floor(Number(options.limit) || 6)));
    const recentEntries = includeEntries ? ledger.entries.slice(-limit).map(entry => ({
      id: entry.id,
      chapterIndex: entry.chapterIndex,
      chapterName: entry.chapterName,
      eventId: entry.eventId,
      eventName: entry.eventName,
      choiceText: entry.choiceText,
      arcType: entry.arcType,
      immediateText: entry.immediateText,
      longTermText: entry.longTermText,
      echoText: entry.echoText,
      tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
      createdAt: entry.createdAt
    })) : [];
    const topTags = Object.entries(ledger.tagFrequency || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(item => item[0]);
    return {
      version: ledger.version,
      totalEntries: ledger.entries.length,
      counters: {
        ...(ledger.counters || {})
      },
      topTags,
      entries: recentEntries
    };
  }
  getChapterEventComposerContext() {
    const realm = Math.max(1, Math.floor(Number(this.game.player?.realm) || 1));
    const chapterSnapshot = typeof this.game.getChapterDisplaySnapshot === 'function' ? this.game.getChapterDisplaySnapshot(realm) : null;
    const chapterIndex = Math.max(1, Math.min(6, Math.floor(Number(chapterSnapshot?.chapterIndex) || Math.floor((realm - 1) / 3) + 1)));
    const chapterName = String(chapterSnapshot?.name || `第${chapterIndex}章`);
    const ledger = this.ensureChapterEventLedger();
    const priorEntries = ledger.entries.filter(entry => entry.chapterIndex < chapterIndex).slice(-12).map(entry => ({
      id: entry.id,
      chapterIndex: entry.chapterIndex,
      chapterName: entry.chapterName,
      choiceText: entry.choiceText,
      arcType: entry.arcType,
      echoText: entry.echoText,
      longTermText: entry.longTermText,
      tags: Array.isArray(entry.tags) ? entry.tags.slice() : []
    }));
    const recentTags = Object.entries(ledger.tagFrequency || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(item => item[0]);
    const gainCount = Math.max(0, Math.floor(Number(ledger.counters?.short_gain_long_loss) || 0));
    const lossCount = Math.max(0, Math.floor(Number(ledger.counters?.short_loss_long_gain) || 0));
    const imbalance = gainCount - lossCount;
    const composeChance = Math.max(0.22, Math.min(0.66, 0.3 + chapterIndex * 0.025 + (Math.abs(imbalance) > 1 ? 0.04 : 0)));
    return {
      chapterIndex,
      chapterName,
      recentTags,
      priorEntries,
      composeChance
    };
  }
  recordChapterEventConsequence(payload = {}) {
    const event = payload.event && typeof payload.event === 'object' ? payload.event : this.game.currentEvent && typeof this.game.currentEvent === 'object' ? this.game.currentEvent : null;
    const choice = payload.choice && typeof payload.choice === 'object' ? payload.choice : null;
    if (!event || !choice) return null;
    const fateLedger = choice.fateLedger && typeof choice.fateLedger === 'object' ? choice.fateLedger : null;
    if (!fateLedger) return null;
    const ledger = this.ensureChapterEventLedger();
    const choiceIndex = Math.max(0, Math.floor(Number(payload.choiceIndex) || 0));
    const runtimeId = String(payload.runtimeId || this.game.currentEventRuntimeMeta?.eventRuntimeId || '');
    if (runtimeId) {
      const existing = ledger.entries.find(entry => entry.runtimeId === runtimeId && entry.choiceIndex === choiceIndex);
      if (existing) return existing;
    }
    const realm = Math.max(1, Math.floor(Number(this.game.player?.realm) || 1));
    const chapterSnapshot = typeof this.game.getChapterDisplaySnapshot === 'function' ? this.game.getChapterDisplaySnapshot(realm) : null;
    const chapterIndex = Math.max(1, Math.min(6, Math.floor(Number(payload.chapterIndex || chapterSnapshot?.chapterIndex) || Math.floor((realm - 1) / 3) + 1)));
    const chapterName = String(payload.chapterName || chapterSnapshot?.name || `第${chapterIndex}章`);
    const arcTypeRaw = String(fateLedger.arcType || 'other').trim();
    const arcType = arcTypeRaw || 'other';
    const immediateText = String(fateLedger.immediateText || choice.result || '').trim();
    const longTermText = String(fateLedger.longTermText || '').trim();
    const echoText = String(fateLedger.echoText || longTermText || immediateText || '').trim();
    const tags = Array.from(new Set((Array.isArray(fateLedger.tags) ? fateLedger.tags : []).map(tag => String(tag || '').trim()).filter(Boolean))).slice(0, 8);
    const createdAt = Date.now();
    const entry = {
      id: `ledger_${chapterIndex}_${createdAt.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      runtimeId,
      eventId: String(event.id || ''),
      eventName: String(event.name || '章节事件'),
      choiceIndex,
      choiceText: String(choice.text || ''),
      chapterIndex,
      chapterName,
      arcType,
      immediateText,
      longTermText,
      echoText,
      tags,
      nodeType: String(this.game.currentBattleNode?.type || ''),
      createdAt
    };
    ledger.entries.push(entry);
    if (ledger.entries.length > 80) {
      ledger.entries = ledger.entries.slice(ledger.entries.length - 80);
    }
    if (Object.prototype.hasOwnProperty.call(ledger.counters, arcType)) {
      ledger.counters[arcType] += 1;
    } else {
      ledger.counters.other = (ledger.counters.other || 0) + 1;
    }
    tags.forEach(tag => {
      ledger.tagFrequency[tag] = (ledger.tagFrequency[tag] || 0) + 1;
    });
    ledger.updatedAt = createdAt;
    this.game.chapterEventLedger = this.normalizeChapterEventLedger(ledger);
    return entry;
  }
  buildEventChoiceEffectSummary(choice = {}) {
    const summary = [];
    const effects = Array.isArray(choice.effects) ? choice.effects : [];
    effects.forEach(effect => {
      if (!effect || typeof effect !== 'object') return;
      switch (effect.type) {
        case 'awakenRing':
          summary.push('觉醒命环');
          break;
        case 'gold':
          summary.push(`${Number(effect.value) >= 0 ? '灵石' : '支付灵石'} ${Math.abs(Math.floor(Number(effect.value) || 0))}`);
          break;
        case 'heal':
          summary.push(`恢复 ${Math.floor(Number(effect.value) || 0)} 生命`);
          break;
        case 'damage':
          summary.push(`失去 ${Math.floor(Number(effect.value) || 0)} 生命`);
          break;
        case 'ringExp':
          summary.push(`命环经验 +${Math.floor(Number(effect.value) || 0)}`);
          break;
        case 'heavenlyInsight':
          summary.push(`天机 +${Math.floor(Number(effect.value) || 0)}`);
          break;
        case 'maxHp':
          summary.push(`最大生命 ${Number(effect.value) >= 0 ? '+' : ''}${Math.floor(Number(effect.value) || 0)}`);
          break;
        case 'permaBuff':
          {
            const statMap = {
              strength: '力量',
              defense: '防御',
              energy: '灵力',
              maxHp: '生命',
              draw: '抽牌'
            };
            summary.push(`永久${statMap[effect.stat] || '属性'} ${Number(effect.value) >= 0 ? '+' : ''}${Math.floor(Number(effect.value) || 0)}`);
            break;
          }
        case 'adventureBuff':
          {
            const buffTextMap = {
              firstTurnDrawBoostBattles: '首回合抽牌',
              openingBlockBoostBattles: '开场护盾',
              victoryGoldBoostBattles: '胜利悬赏',
              firstTurnEnergyBoostBattles: '首回合灵力',
              ringExpBoostBattles: '命环经验增益',
              victoryHealBoostBattles: '战后医护'
            };
            summary.push(`${buffTextMap[effect.buffId || ''] || '行旅增益'} +${Math.max(1, Math.floor(Number(effect.charges) || 1))}`);
            break;
          }
        case 'runPathProgress':
          summary.push(`推进命途 ${Math.max(1, Math.floor(Number(effect.amount) || 1))}`);
          break;
        case 'law':
          summary.push(effect.random ? '随机获得法则' : `获得法则 ${effect.lawId || ''}`.trim());
          break;
        case 'card':
          summary.push(effect.cardId ? `获得卡牌 ${effect.cardId}` : '获得卡牌');
          break;
        case 'battle':
          summary.push('立即进入战斗');
          break;
        case 'trial':
          summary.push(`开启试炼${effect.name || effect.trialName ? `：${effect.name || effect.trialName}` : ''}`);
          break;
        case 'upgradeCard':
          summary.push('强化 1 张卡牌');
          break;
        case 'treasure':
          summary.push(effect.random ? '获得随机法宝' : `获得法宝 ${effect.treasureId || ''}`.trim());
          break;
        case 'randomGold':
          summary.push(`获得 ${Math.floor(Number(effect.min) || 0)}-${Math.floor(Number(effect.max) || 0)} 灵石`);
          break;
        case 'random':
          summary.push('随机结算 1 项命运结果');
          break;
        case 'nothing':
          summary.push('保持现状');
          break;
        case 'removeCard':
          summary.push('移除 1 张卡牌');
          break;
        case 'removeCardType':
          {
            const count = Math.max(1, Math.floor(Number(effect.count) || 1));
            const cardTypeMap = {
              attack: '攻击',
              skill: '技能',
              power: '功法',
              strike: '攻击'
            };
            const typeLabel = cardTypeMap[String(effect.cardType || '').trim()] || '指定';
            summary.push(`移除 ${count} 张${typeLabel}牌`);
            break;
          }
        case 'openTemporaryShop':
          {
            const offerCount = Math.max(0, Math.floor(Number(effect.offerCount) || 0));
            const priceMultiplier = Number(effect.priceMultiplier);
            const parts = [effect.title ? `开启${effect.title}` : '开启临时商会'];
            if (offerCount > 0) {
              parts.push(`货位 ${offerCount}`);
            }
            if (Number.isFinite(priceMultiplier) && priceMultiplier > 0 && priceMultiplier < 1) {
              parts.push(`折价 ${Math.round((1 - priceMultiplier) * 100)}%`);
            }
            summary.push(parts.join(' · '));
            break;
          }
        case 'openCampfire':
          summary.push('进入营地整备');
          break;
        case 'endlessPressure':
          summary.push(`轮回压力 ${Number(effect.value) > 0 ? '+' : ''}${Math.floor(Number(effect.value) || 0)}`);
          break;
        case 'vow':
          summary.push('获得誓约相关收益');
          break;
        case 'spirit':
          summary.push('推进灵契线索');
          break;
        default:
          summary.push(String(effect.label || effect.title || effect.name || '特殊效果'));
          break;
      }
    });
    return summary.slice(0, 4);
  }
  getEventNarrativePresentation(event, node = null) {
    return this.game.eventView.getEventNarrativePresentation(event, node);
  }
  applyEventModalPresentation(presentation = {}) {
    return this.game.eventView.applyEventModalPresentation(presentation);
  }
  getEndlessEventTuning() {
    if (!this.game.endlessManager) this.game.endlessManager = new EndlessManager(this.game);
    return this.game.endlessManager.getEndlessEventTuning();
  }
  showEventModal(event, node) {
    return this.game.eventView.showEventModal(event, node);
  }
  showTrialChallengeSelection(node) {
    return this.game.eventView.showTrialChallengeSelection(node);
  }
  showForgeChoiceModal(node, costs = {}) {
    return this.game.eventView.showForgeChoiceModal(node, costs);
  }
  showForgeCardDraft(node, costs = {}) {
    return this.game.eventView.showForgeCardDraft(node, costs);
  }
  describeTreasureWorkshopStatus(treasure) {
    return this.game.eventView.describeTreasureWorkshopStatus(treasure);
  }
  showForgeTreasureDraft(node, mode = 'reforge', costs = {}) {
    return this.game.eventView.showForgeTreasureDraft(node, mode, costs);
  }
  executeEventEffect(effect) {
    const endlessActive = typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive();
    const getEventTuning = () => {
      if (!endlessActive || typeof this.getEndlessEventTuning !== 'function') return null;
      return this.getEndlessEventTuning();
    };
    const getEventHealMultiplier = () => {
      if (typeof this.game.getEndlessHealingMultiplier === 'function') {
        return this.game.getEndlessHealingMultiplier();
      }
      return 1;
    };
    switch (effect.type) {
      case 'gold':
        {
          const endlessTuning = getEventTuning();
          const scalePositiveGold = value => {
            const base = Math.max(0, Math.floor(Number(value) || 0));
            if (!endlessTuning || base <= 0) return base;
            return Math.max(base, Math.floor(base * (Number(endlessTuning.goldGainMul) || 1)));
          };
          if (effect.percent) {
            const amount = Math.floor(this.game.player.gold * (Math.abs(effect.percent) / 100));
            if (effect.percent < 0) {
              this.game.player.gold -= amount;
              this.game.eventResults.push(`💰 灵石 -${amount} (${Math.abs(effect.percent)}%)`);
            } else {
              const scaled = scalePositiveGold(amount);
              this.game.player.gold += scaled;
              this.game.eventResults.push(`💰 灵石 +${scaled} (${effect.percent}%)`);
              if (scaled > amount) {
                this.game.eventResults.push(`♾️ 无尽词缀联动：额外获得 ${scaled - amount} 灵石`);
              }
            }
          } else {
            const raw = Math.floor(Number(effect.value) || 0);
            if (raw > 0) {
              const scaled = scalePositiveGold(raw);
              this.game.player.gold += scaled;
              this.game.eventResults.push(`💰 灵石 +${scaled}`);
              if (scaled > raw) {
                this.game.eventResults.push(`♾️ 无尽词缀联动：额外获得 ${scaled - raw} 灵石`);
              }
            } else {
              this.game.player.gold += raw;
              this.game.eventResults.push(`💰 灵石 ${raw}`);
            }
          }
          break;
        }
      case 'randomGold':
        const goldAmount = Math.floor(Math.random() * (effect.max - effect.min + 1)) + effect.min;
        this.game.player.gold += goldAmount;
        this.game.eventResults.push(`💰 获得 ${goldAmount} 灵石`);
        break;
      case 'heal':
        {
          const baseHeal = Math.max(1, Math.floor(Number(effect.value) || 0));
          const healMultiplier = getEventHealMultiplier();
          const finalHeal = Math.max(1, Math.floor(baseHeal * healMultiplier));
          this.game.player.heal(finalHeal);
          if (endlessActive && finalHeal !== baseHeal) {
            this.game.eventResults.push(`💚 恢复 ${finalHeal} HP（无尽修正 x${healMultiplier.toFixed(2)}）`);
          } else {
            this.game.eventResults.push(`💚 恢复 ${finalHeal} HP`);
          }
        }
        break;
      case 'maxHp':
        this.game.player.maxHp += effect.value;
        this.game.player.currentHp = Math.min(this.game.player.currentHp, this.game.player.maxHp);
        if (effect.value > 0) {
          this.game.player.heal(effect.value); // Usually MaxHP+ also heals that amount?
        }
        this.game.eventResults.push(`❤️ 最大HP ${effect.value > 0 ? '+' : ''}${effect.value}`);
        break;
      case 'permaBuff':
        if (this.game.player.addPermaBuff) {
          this.game.player.addPermaBuff(effect.stat, effect.value);
        } else if (this.game.player.addPermBuff) {
          this.game.player.addPermBuff(effect.stat, effect.value);
        } else {
          this.game.player.permaBuffs = this.game.player.permaBuffs || {};
          this.game.player.permaBuffs[effect.stat] = (this.game.player.permaBuffs[effect.stat] || 0) + effect.value;
          if (this.game.player.recalculateStats) this.game.player.recalculateStats();
        }
        {
          const statMap = {
            strength: '力量',
            defense: '防御',
            energy: '灵力',
            maxHp: '生命',
            draw: '抽牌'
          };
          this.game.eventResults.push(`💪 永久${statMap[effect.stat] || effect.stat} ${effect.value > 0 ? '+' : ''}${effect.value}`);
        }
        break;
      case 'adventureBuff':
        {
          const buffId = effect.buffId || '';
          const baseCharges = Math.max(1, Math.floor(Number(effect.charges) || 1));
          const endlessTuning = getEventTuning();
          const extraCharges = endlessTuning ? Math.max(0, Math.floor(Number(endlessTuning.bonusAdventureBuffCharges) || 0)) : 0;
          const charges = Math.max(1, Math.min(5, baseCharges + extraCharges));
          let applied = false;
          if (this.game.player && typeof this.game.player.grantAdventureBuff === 'function') {
            applied = this.game.player.grantAdventureBuff(buffId, charges);
          }
          const buffTextMap = {
            firstTurnDrawBoostBattles: '首回合额外抽牌',
            openingBlockBoostBattles: '开场护盾强化',
            victoryGoldBoostBattles: '胜利额外灵石',
            firstTurnEnergyBoostBattles: '首回合灵力强化',
            ringExpBoostBattles: '命环经验倍率',
            victoryHealBoostBattles: '战后恢复生命'
          };
          if (applied) {
            this.game.eventResults.push(`🧭 获得行旅增益：${buffTextMap[buffId] || '未知增益'} (${charges} 场)`);
            if (charges > baseCharges) {
              this.game.eventResults.push(`♾️ 无尽词缀联动：额外层数 +${charges - baseCharges}`);
            }
          } else {
            this.game.eventResults.push('⚠️ 未能获得行旅增益');
          }
          break;
        }
      case 'openTemporaryShop':
        {
          const tunedEffect = {
            ...(effect || {})
          };
          if (endlessActive) {
            const endlessTuning = getEventTuning() || {
              forceRelief: false,
              tempShopPriceMul: 1
            };
            tunedEffect.forceRelief = !!tunedEffect.forceRelief || !!endlessTuning.forceRelief;
          }
          this.game.closeModal();
          setTimeout(() => {
            this.showTemporaryEventShop(tunedEffect);
          }, 120);
          return true;
        }
      case 'openCampfire':
        this.game.closeModal();
        setTimeout(() => {
          const node = this.game.currentBattleNode || {
            id: `event-camp-${Date.now()}`,
            row: 0,
            type: 'event'
          };
          this.game.showCampfire(node);
        }, 120);
        return true;
      case 'damage':
        this.game.player.takeDamage(effect.value);
        this.game.eventResults.push(`💔 失去 ${effect.value} HP`);
        break;
      case 'removeCardType':
        let removedCount = 0;
        const toRemove = [];
        // Find cards matching criteria
        this.game.player.deck.forEach((card, index) => {
          // Check if card matches criteria (e.g. cardId or cardType)
          // If cardType is 'strike', remove any card with id/name containing strike? 
          // Or check type property.
          let match = false;
          if (effect.cardId && card.id === effect.cardId) match = true;
          if (effect.cardType && card.type === effect.cardType) match = true;
          // Special case for 'strike' in data sometimes maps to 'attack' type, detailed check needed?
          // Let's assume strict type match first.

          if (match && removedCount < (effect.count || 1)) {
            toRemove.push(index);
            removedCount++;
          }
        });

        // Remove from back to front to avoid index shift
        toRemove.sort((a, b) => b - a).forEach(idx => {
          const removed = this.game.player.deck.splice(idx, 1)[0];
          if (removed) this.game.eventResults.push(`🗑️ 移除: ${removed.name}`);
        });
        if (removedCount === 0) {
          this.game.eventResults.push(`⚠️ 没有符合条件的卡牌可移除`);
        }
        break;
      case 'upgradeCard':
        // 进入专用升级选择界面，切换流程
        this.game.closeModal();
        setTimeout(() => {
          this.showEventUpgradeCard();
        }, 100);
        return true;
      case 'treasure':
        if (effect.treasureId) {
          if (this.game.player.addTreasure && this.game.player.addTreasure(effect.treasureId)) {
            this.game.eventResults.push(`🏺 获得法宝: ${TREASURES[effect.treasureId].name}`);
          } else {
            this.game.eventResults.push(`已拥有该法宝，获得替代奖励`);
          }
        } else if (effect.random && typeof TREASURES !== 'undefined') {
          const tKeys = Object.keys(TREASURES);
          const unowned = tKeys.filter(k => !this.game.player.hasTreasure || !this.game.player.hasTreasure(k));
          if (unowned.length > 0) {
            const tid = unowned[Math.floor(Math.random() * unowned.length)];
            if (this.game.player.addTreasure) this.game.player.addTreasure(tid);
            this.game.eventResults.push(`🏺 获得随机法宝: ${TREASURES[tid].name}`);
          } else {
            this.game.player.gold += 100;
            this.game.eventResults.push(`法宝已收集齐，获得 100 灵石`);
          }
        }
        break;
      case 'trial':
        // 试炼模式 - 设置特殊战斗规则并立即进入战斗
        {
          let rewardMultiplier = Number(effect.rewardMultiplier) || 1;
          if (endlessActive) {
            const endlessTuning = getEventTuning() || {
              trialRewardMul: 1
            };
            rewardMultiplier *= Math.max(1, Number(endlessTuning.trialRewardMul) || 1);
            if (rewardMultiplier > (Number(effect.rewardMultiplier) || 1)) {
              Utils.showBattleLog(`无尽词缀联动：试炼奖励倍率提升至 x${rewardMultiplier.toFixed(2)}`);
            }
          }
          const armTrialChallenge = this.getEventManagerHook('armTrialChallenge', typeof this.game?.armTrialChallenge === 'function' ? this.game.armTrialChallenge.bind(this.game) : null);
          if (!armTrialChallenge) {
            return false;
          }
          const trialConfig = armTrialChallenge({
            id: effect.trialType,
            name: effect.name || effect.trialName || effect.trialType || '事件试炼',
            rounds: effect.rounds,
            rewardMultiplier,
            reward: effect.reward,
            desc: effect.description || '事件开启了一场额外试炼。'
          });
          Utils.showBattleLog(`进入试炼模式: ${trialConfig?.name || effect.trialType}`);
          const trialEnemy = getRandomEnemy(this.game.player.realm);
          if (trialEnemy) {
            this.game.closeModal();
            setTimeout(() => {
              this.game.startBattle([trialEnemy], this.game.currentBattleNode);
            }, 300);
            return true;
          }
          this.game.eventResults.push('⚠️ 试炼开启失败：未找到试炼目标');
          break;
        }
      case 'ringExp':
        {
          const baseExp = Math.max(0, Math.floor(Number(effect.value) || 0));
          let finalExp = baseExp;
          if (baseExp > 0 && endlessActive) {
            const endlessTuning = getEventTuning() || {
              ringExpFlat: 0
            };
            finalExp += Math.max(0, Math.floor(Number(endlessTuning.ringExpFlat) || 0));
          }
          this.game.player.fateRing.exp += finalExp;
          this.game.player.checkFateRingLevelUp();
          this.game.eventResults.push(`🔮 命环经验 +${finalExp}`);
          if (finalExp > baseExp) {
            this.game.eventResults.push(`♾️ 无尽词缀联动：额外命环经验 +${finalExp - baseExp}`);
          }
          // 如果导致升级，checkFateRingLevelUp 内部会处理并可能弹窗，但这里我们主要关注数值
          break;
        }
      case 'heavenlyInsight':
        {
          const amount = Math.max(0, Math.floor(Number(effect.value) || 0));
          if (amount > 0) {
            this.game.player.heavenlyInsight = Math.max(0, Math.floor(Number(this.game.player.heavenlyInsight) || 0)) + amount;
            this.game.eventResults.push(`🔭 天机 +${amount}`);
          } else {
            this.game.eventResults.push('⚠️ 天机未变化');
          }
          break;
        }
      case 'runPathProgress':
        {
          const runPathMeta = this.game.player && typeof this.game.player.getRunPathMeta === 'function' ? this.game.player.getRunPathMeta() : null;
          const amount = Math.max(1, Math.floor(Number(effect.amount) || 1));
          const eventType = String(effect.eventType || runPathMeta?.currentPhase?.eventType || '');
          const applied = !!(runPathMeta && typeof this.game.handleRunPathProgress === 'function' && this.game.handleRunPathProgress(eventType, amount, {
            ...(effect.context && typeof effect.context === 'object' ? effect.context : {}),
            force: true,
            source: 'event',
            surface: this.game.currentScreen || 'map-screen'
          }));
          if (applied) {
            this.game.eventResults.push(`🧭 命途推进 +${amount}（${runPathMeta?.name || '当前命途'}）`);
          } else {
            this.game.eventResults.push('🧭 当前命途未获得推进');
          }
          break;
        }
      case 'endlessPressure':
        {
          if (typeof this.game.ensureEndlessState !== 'function') {
            this.game.eventResults.push('⚠️ 轮回压力系统不可用');
            break;
          }
          const state = this.game.ensureEndlessState();
          const before = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
          const delta = Math.floor(Number(effect.value) || 0);
          state.pressure = Math.max(0, Math.min(9, before + delta));
          const prefix = delta >= 0 ? '+' : '';
          this.game.eventResults.push(`♨️ 轮回压力 ${before} → ${state.pressure}（${prefix}${delta}）`);
          break;
        }
      case 'card':
        let card = null;
        if (effect.cardId && CARDS[effect.cardId]) {
          card = {
            ...CARDS[effect.cardId]
          };
        } else if (effect.rarity) {
          card = getRandomCard(effect.rarity);
        } else {
          card = getRandomCard();
        }
        if (card) {
          this.game.player.addCardToDeck(card);
          this.game.eventResults.push(`🃏 获得卡牌: ${card.name}`);
        }
        break;
      case 'law':
        if (effect.random) {
          const lawKeys = Object.keys(LAWS);
          const randomLaw = LAWS[lawKeys[Math.floor(Math.random() * lawKeys.length)]];
          if (randomLaw && this.game.player.collectLaw({
            ...randomLaw
          })) {
            this.game.eventResults.push(`✨ 获得法则: ${randomLaw.name}`);
            this.game.achievementSystem.updateStat('lawsCollected', 1);
          }
        }
        break;
      case 'random':
        if (effect.options) {
          const roll = Math.random();
          let cumulative = 0;
          for (const option of effect.options) {
            cumulative += option.chance;
            if (roll < cumulative) {
              if (option.type !== 'nothing') {
                return this.executeEventEffect(option);
              }
              break;
            }
          }
        }
        break;
      case 'battle':
        // 触发战斗
        if (effect.enemyId && ENEMIES[effect.enemyId]) {
          const enemy = JSON.parse(JSON.stringify(ENEMIES[effect.enemyId]));
          this.game.closeModal();
          setTimeout(() => {
            this.game.startBattle(enemy, this.game.currentBattleNode);
          }, 300);
          return true;
        }
        this.game.eventResults.push('⚠️ 战斗触发失败：目标敌人不存在');
        break;
      case 'awakenRing':
        // 觉醒命环
        if (this.game.player.fateRing.level === 0) {
          const ring = this.game.player.fateRing;
          ring.level = 1;
          ring.name = '一阶·觉醒';
          ring.path = 'awakened';

          // 同步槽位结构（避免 slots 变成数字）
          const levelData = typeof FATE_RING !== 'undefined' && FATE_RING.levels ? FATE_RING.levels[1] : null;
          if (levelData && ring.type !== 'sealed') {
            ring.maxSlots = levelData.slots;
            ring.exp = Math.max(ring.exp || 0, levelData.exp || 0);
          }
          if (ring.initSlots) ring.initSlots();
          Utils.showBattleLog('命环觉醒！逆命之路开启！');
        }
        break;
      default:
        // 未处理的效果类型
        console.log('未处理的事件效果:', effect.type);
    }
    return false;
  }
  getTemporaryEventShopOffers(effect = {}) {
    const realm = this.game.player?.realm || 1;
    const endlessTuning = this.game.isEndlessActive() ? this.getEndlessEventTuning() : null;
    const runPathMeta = this.game.player && typeof this.game.player.getRunPathMeta === 'function' ? this.game.player.getRunPathMeta() : null;
    const pathDoctrineProfile = this.game.player && typeof this.game.player.getPathDoctrineProfile === 'function' ? this.game.player.getPathDoctrineProfile() : null;
    const wisdomTier = pathDoctrineProfile && pathDoctrineProfile.path === 'wisdom' ? Math.max(0, Math.floor(Number(pathDoctrineProfile.tier) || 0)) : 0;
    const wisdomPriceMultiplier = wisdomTier > 0 ? Math.max(0.78, Number(pathDoctrineProfile.shopPriceMultiplier) || 1) : 1;
    const injectedPriceMultiplier = Number(effect.priceMultiplier);
    const combinedPriceMultiplier = (1 + (realm - 1) * 0.08) * (Number.isFinite(injectedPriceMultiplier) ? injectedPriceMultiplier : 1) * (endlessTuning ? Number(endlessTuning.tempShopPriceMul) || 1 : 1) * wisdomPriceMultiplier;
    const priceMul = Math.max(0.65, combinedPriceMultiplier);
    const baseOffers = [{
      id: 'temp_draw',
      icon: '📘',
      name: '战术补给',
      price: Math.floor(60 * priceMul),
      desc: '接下来 2 场战斗：首回合额外抽 1 张牌'
    }, {
      id: 'temp_block',
      icon: '🧿',
      name: '护阵折符',
      price: Math.floor(75 * priceMul),
      desc: '接下来 2 场战斗：开场获得 10 护盾'
    }, {
      id: 'temp_bounty',
      icon: '📜',
      name: '悬赏短契',
      price: Math.floor(85 * priceMul),
      desc: '接下来 2 场战斗：胜利额外获得灵石'
    }, {
      id: 'temp_energy',
      icon: '⚡',
      name: '灵息导体',
      price: Math.floor(92 * priceMul),
      desc: '接下来 2 场战斗：首回合灵力 +1'
    }, {
      id: 'temp_expboost',
      icon: '🕯️',
      name: '悟境熏香',
      price: Math.floor(98 * priceMul),
      desc: '接下来 2 场战斗：命环经验额外 +30%'
    }, {
      id: 'temp_medic',
      icon: '🩹',
      name: '野战医包',
      price: Math.floor(96 * priceMul),
      desc: '接下来 2 场战斗：胜利后恢复生命'
    }, {
      id: 'temp_card',
      icon: '🃏',
      name: '秘法现货',
      price: Math.floor(95 * priceMul),
      desc: '获得 1 张随机稀有卡牌'
    }];
    const endlessExclusiveOffers = this.game.isEndlessActive() ? [{
      id: 'temp_refit',
      icon: '🧬',
      name: '轮回重配包',
      price: Math.floor(122 * priceMul),
      desc: '重配 1 个无尽词缀，并返还少量灵石'
    }, {
      id: 'temp_boon',
      icon: '🕯️',
      name: '轮回祷札',
      price: Math.floor(138 * priceMul),
      desc: '从 2 个无尽赐福中随机获得其一'
    }] : [];
    const reliefOffer = {
      id: 'temp_relief',
      icon: '🧰',
      name: '应急补给券',
      price: Math.max(18, Math.floor(24 * priceMul)),
      desc: '立即恢复生命，并获得 1 层战后医护增益'
    };
    const preferredArchetype = (() => {
      try {
        if (typeof inferDeckArchetype === 'function') {
          return inferDeckArchetype(this.game.player?.deck || []);
        }
      } catch (e) {
        return null;
      }
      return null;
    })();
    const archetypeExtras = {
      precision: {
        id: 'temp_precision',
        icon: '🎯',
        name: '镜针校准包',
        price: Math.floor(108 * priceMul),
        desc: '获得 1 张稀有/史诗攻击牌，并获得 1 层首回合灵力增益'
      },
      entropy: {
        id: 'temp_entropy',
        icon: '🌀',
        name: '湮流应急包',
        price: Math.floor(106 * priceMul),
        desc: '获得 1 层首回合抽牌增益 + 1 层胜利悬赏增益'
      },
      bulwark: {
        id: 'temp_bulwark',
        icon: '🛡️',
        name: '玄甲防线包',
        price: Math.floor(104 * priceMul),
        desc: '获得 2 层开场护盾增益并恢复少量生命'
      },
      stormcraft: {
        id: 'temp_stormcraft',
        icon: '⚡',
        name: '霆策脉冲包',
        price: Math.floor(109 * priceMul),
        desc: '获得 1 张连锁攻势卡，并获得 1 层首回合灵力与抽牌增益'
      },
      vitalweave: {
        id: 'temp_vitalweave',
        icon: '💚',
        name: '回脉救援包',
        price: Math.floor(107 * priceMul),
        desc: '立即恢复生命，并获得开场护盾与战后医护增益'
      },
      hemorrhage: {
        id: 'temp_hemorrhage',
        icon: '🩸',
        name: '血炉突击包',
        price: Math.floor(102 * priceMul),
        desc: '获得 1 张进攻牌，并获得 1 层胜利悬赏增益'
      },
      mirrorweave: {
        id: 'temp_mirrorweave',
        icon: '🪞',
        name: '镜渊回路包',
        price: Math.floor(110 * priceMul),
        desc: '获得 1 张镜渊卡，并获得 1 层首回合抽牌与开场护盾增益'
      },
      oathbound: {
        id: 'temp_oathbound',
        icon: '📜',
        name: '誓罚清算包',
        price: Math.floor(111 * priceMul),
        desc: '获得 1 张誓罚卡，并获得 1 层首回合灵力与胜利悬赏增益'
      }
    };
    const offers = baseOffers.slice();
    if (preferredArchetype && archetypeExtras[preferredArchetype]) {
      offers.push(archetypeExtras[preferredArchetype]);
    }
    const runPathOffer = Array.isArray(runPathMeta?.shopBias?.tempOffers) && runPathMeta.shopBias.tempOffers.length > 0 ? {
      ...(runPathMeta.shopBias.tempOffers[0] || {}),
      pathId: runPathMeta.id,
      pathName: runPathMeta.name,
      pathIcon: runPathMeta.icon || '🧭',
      price: Math.floor(Math.max(1, Number(runPathMeta.shopBias.tempOffers[0]?.price) || 0) * priceMul)
    } : null;
    if (runPathOffer && runPathOffer.id) {
      offers.push(runPathOffer);
    }
    if (endlessExclusiveOffers.length > 0) {
      offers.push(...endlessExclusiveOffers);
    }
    const playerGold = Math.max(0, Math.floor(Number(this.game.player?.gold) || 0));
    const lowGoldThreshold = Math.floor(90 * priceMul);
    const shouldForceRelief = !!effect.forceRelief || !!endlessTuning?.forceRelief || playerGold < lowGoldThreshold;
    if (shouldForceRelief) {
      offers.push(reliefOffer);
    }
    const baseCount = Math.max(2, Math.min(4, Math.floor(Number(effect.offerCount) || 3)));
    const wisdomOfferBonus = wisdomTier > 0 ? Math.max(0, Math.floor(Number(pathDoctrineProfile?.shopOfferBonus) || 0)) : 0;
    const count = Math.max(2, Math.min(5, baseCount + (endlessTuning ? Math.max(0, Math.floor(Number(endlessTuning.tempShopOfferBonus) || 0)) : 0) + wisdomOfferBonus));
    const shuffled = typeof Utils !== 'undefined' && Utils.shuffle ? Utils.shuffle(offers.slice()) : offers.slice().sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, count);
    if (endlessExclusiveOffers.length > 0 && !picked.some(offer => offer && (offer.id === 'temp_refit' || offer.id === 'temp_boon'))) {
      const endlessOffer = endlessExclusiveOffers[Math.floor(Math.random() * endlessExclusiveOffers.length)];
      if (endlessOffer) {
        let replaceIndex = picked.length - 1;
        if (shouldForceRelief && picked.length > 1 && picked[replaceIndex]?.id === 'temp_relief') {
          replaceIndex = picked[0]?.id === 'temp_relief' ? 1 : 0;
        }
        if (picked.length === 0) {
          picked.push(endlessOffer);
        } else {
          picked[replaceIndex] = endlessOffer;
        }
      }
    }
    if (shouldForceRelief && !picked.some(offer => offer && offer.id === 'temp_relief')) {
      let replaceIndex = picked.length - 1;
      if (picked.length > 1) {
        const nonEndlessIndex = picked.findIndex(offer => !(offer && (offer.id === 'temp_refit' || offer.id === 'temp_boon')));
        if (nonEndlessIndex >= 0) replaceIndex = nonEndlessIndex;
      }
      picked[replaceIndex] = reliefOffer;
    }
    const resolveReplaceIndex = () => {
      if (picked.length <= 1) return Math.max(0, picked.length - 1);
      const index = picked.findIndex(offer => {
        if (!offer) return true;
        if (offer.id === 'temp_refit' || offer.id === 'temp_boon') return false;
        if (shouldForceRelief && offer.id === 'temp_relief') return false;
        return true;
      });
      return index >= 0 ? index : Math.max(0, picked.length - 1);
    };
    if (wisdomTier >= 1 && !picked.some(offer => offer && offer.id === 'temp_card')) {
      const cardOffer = baseOffers.find(offer => offer && offer.id === 'temp_card');
      if (cardOffer) {
        if (picked.length === 0) picked.push(cardOffer);else picked[resolveReplaceIndex()] = cardOffer;
      }
    }
    if (wisdomTier >= 2 && preferredArchetype && archetypeExtras[preferredArchetype] && !picked.some(offer => offer && offer.id === archetypeExtras[preferredArchetype].id)) {
      const biasOffer = archetypeExtras[preferredArchetype];
      if (picked.length === 0) picked.push(biasOffer);else picked[resolveReplaceIndex()] = biasOffer;
    }
    if (runPathOffer && !picked.some(offer => offer && offer.id === runPathOffer.id)) {
      if (picked.length === 0) picked.push(runPathOffer);else picked[resolveReplaceIndex()] = runPathOffer;
    }
    return picked;
  }
  applyTemporaryEventShopOffer(offer) {
    if (!offer || typeof offer !== 'object') return '交易失败';
    switch (offer.id) {
      case 'temp_draw':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', 2);
        }
        return '获得行旅增益：首回合额外抽牌（2 场）';
      case 'temp_block':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('openingBlockBoostBattles', 2);
        }
        return '获得行旅增益：开场护盾强化（2 场）';
      case 'temp_bounty':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
        }
        return '获得行旅增益：胜利悬赏（2 场）';
      case 'temp_energy':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2);
        }
        return '获得行旅增益：首回合灵力强化（2 场）';
      case 'temp_expboost':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('ringExpBoostBattles', 2);
        }
        return '获得行旅增益：命环经验倍率（2 场）';
      case 'temp_medic':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('victoryHealBoostBattles', 2);
        }
        return '获得行旅增益：战后恢复生命（2 场）';
      case 'temp_card':
        {
          const rarity = Math.random() < 0.7 ? 'rare' : 'epic';
          const card = getRandomCard(rarity, this.game.player?.characterId || null);
          if (!card) return '货品短缺，交易作废';
          this.game.player.addCardToDeck(card);
          return `获得卡牌：${card.name}`;
        }
      case 'temp_relief':
        {
          const healAmount = Math.max(10, Math.floor((this.game.player?.maxHp || 80) * 0.12));
          this.game.player.heal(healAmount);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('victoryHealBoostBattles', 1);
          }
          return `补给完成：恢复 ${healAmount} 生命，并获得 1 层战后医护增益`;
        }
      case 'temp_precision':
        {
          const rarity = Math.random() < 0.6 ? 'rare' : 'epic';
          const card = getRandomCard(rarity, this.game.player?.characterId || null);
          if (card) this.game.player.addCardToDeck(card);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 1);
          }
          return `获得战术卡${card ? `：${card.name}` : ''}，并获得 1 层首回合灵力增益`;
        }
      case 'temp_entropy':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', 1);
          this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 1);
        }
        return '获得湮流增益：首回合抽牌 +1 与胜利悬赏（各 1 场）';
      case 'temp_bulwark':
        if (typeof this.game.player.grantAdventureBuff === 'function') {
          this.game.player.grantAdventureBuff('openingBlockBoostBattles', 2);
        }
        this.game.player.heal(8);
        return '获得玄甲增益：开场护盾强化（2 场）并恢复 8 生命';
      case 'temp_stormcraft':
        {
          const rarity = Math.random() < 0.6 ? 'rare' : 'epic';
          const card = getRandomCard(rarity, this.game.player?.characterId || null);
          if (card) this.game.player.addCardToDeck(card);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 1);
            this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', 1);
          }
          return `获得霆策卡${card ? `：${card.name}` : ''}，并获得 1 层首回合灵力与抽牌增益`;
        }
      case 'temp_vitalweave':
        {
          const healAmount = Math.max(9, Math.floor((this.game.player?.maxHp || 80) * 0.1));
          this.game.player.heal(healAmount);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('openingBlockBoostBattles', 1);
            this.game.player.grantAdventureBuff('victoryHealBoostBattles', 1);
          }
          return `获得回脉补给：恢复 ${healAmount} 生命，并获得开场护盾与战后医护增益`;
        }
      case 'temp_hemorrhage':
        {
          const rarity = Math.random() < 0.7 ? 'uncommon' : 'rare';
          const card = getRandomCard(rarity, this.game.player?.characterId || null);
          if (card) this.game.player.addCardToDeck(card);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 1);
          }
          return `获得突击卡${card ? `：${card.name}` : ''}，并获得 1 层胜利悬赏增益`;
        }
      case 'temp_mirrorweave':
        {
          const rarity = Math.random() < 0.7 ? 'uncommon' : 'rare';
          let card = null;
          if (typeof getRandomArchetypeCard === 'function') {
            card = getRandomArchetypeCard('mirrorweave', rarity, this.game.player?.characterId || null);
          }
          if (!card) card = getRandomCard(rarity, this.game.player?.characterId || null);
          if (card) this.game.player.addCardToDeck(card);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', 1);
            this.game.player.grantAdventureBuff('openingBlockBoostBattles', 1);
          }
          return `获得镜渊卡${card ? `：${card.name}` : ''}，并获得 1 层首回合抽牌与开场护盾增益`;
        }
      case 'temp_oathbound':
        {
          const rarity = Math.random() < 0.65 ? 'uncommon' : 'rare';
          let card = null;
          if (typeof getRandomArchetypeCard === 'function') {
            card = getRandomArchetypeCard('oathbound', rarity, this.game.player?.characterId || null);
          }
          if (!card) card = getRandomCard(rarity, this.game.player?.characterId || null);
          if (card) this.game.player.addCardToDeck(card);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 1);
            this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 1);
          }
          return `获得誓罚卡${card ? `：${card.name}` : ''}，并获得 1 层首回合灵力与胜利悬赏增益`;
        }
      case 'temp_refit':
        {
          if (!this.game.isEndlessActive()) return '当前并非无尽轮回，重配失败';
          const state = this.game.ensureEndlessState();
          if (!Array.isArray(state.activeMutators)) state.activeMutators = [];
          if (state.activeMutators.length > 0) state.activeMutators.pop();
          const rolled = this.game.rollNextEndlessMutator();
          if (!rolled) return '重配失败：未找到可接入的词缀';
          const goldRefund = Math.max(8, Math.floor((this.game.player?.realm || 1) * 4));
          this.game.player.gold += goldRefund;
          return `重配完成：接入【${rolled.name}】，返还 ${goldRefund} 灵石`;
        }
      case 'temp_boon':
        {
          if (!this.game.isEndlessActive()) return '当前并非无尽轮回，无法祷告';
          const choices = this.game.getEndlessBoonChoices();
          const picks = Array.isArray(choices) ? choices.slice(0, 2) : [];
          if (picks.length === 0) return '祷告失败：暂无可用赐福';
          const fallbackPool = this.game.getEndlessBoonPool().filter(boon => boon && boon.id);
          const candidateIds = [...picks.map(boon => boon && boon.id).filter(id => typeof id === 'string'), ...fallbackPool.map(boon => boon.id).filter(id => typeof id === 'string')];
          let applied = null;
          while (candidateIds.length > 0 && !applied) {
            const idx = Math.floor(Math.random() * candidateIds.length);
            const [boonId] = candidateIds.splice(idx, 1);
            applied = boonId ? this.game.applyEndlessBoon(boonId) : null;
          }
          if (!applied) return '祷告失败：赐福未生效';
          const rarityText = applied.rarity === 'rare' ? '【稀有】' : '';
          return `获得无尽赐福：${rarityText}${applied.name}`;
        }
      case 'temp_runPathShatter':
        {
          const rarity = Math.random() < 0.6 ? 'rare' : 'epic';
          const card = getRandomCard(rarity, this.game.player?.characterId || null);
          if (card) this.game.player.addCardToDeck(card);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2);
            this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 1);
          }
          return `获得裂锋补给${card ? `：${card.name}` : ''}，并获得 2 层首回合灵力与 1 层悬赏增益`;
        }
      case 'temp_runPathBulwark':
        {
          const healAmount = Math.max(12, Math.floor((this.game.player?.maxHp || 80) * 0.14));
          this.game.player.heal(healAmount);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('openingBlockBoostBattles', 2);
            this.game.player.grantAdventureBuff('victoryHealBoostBattles', 2);
          }
          return `获得镇御整备：恢复 ${healAmount} 生命，并获得 2 层开场护盾与 2 层战后医护增益`;
        }
      case 'temp_runPathInsight':
        {
          const card = getRandomCard('rare', this.game.player?.characterId || null);
          if (card) this.game.player.addCardToDeck(card);
          if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('ringExpBoostBattles', 2);
            this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', 1);
          }
          this.game.player.heavenlyInsight = Math.max(0, Math.floor(Number(this.game.player.heavenlyInsight) || 0)) + 1;
          return `获得观测补给${card ? `：${card.name}` : ''}，并获得 2 层命环经验增益、1 层首回合抽牌与 1 点天机`;
        }
      default:
        return '交易完成';
    }
  }
  showTemporaryEventShop(effect = {}) {
    return this.game.eventView.showTemporaryEventShop(effect);
  }
  showEventUpgradeCard() {
    return this.game.eventView.showEventUpgradeCard();
  }
  onEventComplete() {
    this.game.achievementSystem.updateStat('eventsCompleted', 1);
    this.game.currentEvent = null;
    this.game.currentEventRuntimeMeta = null;
    this.game.eventResults = [];
    if (this.game.currentBattleNode) {
      this.game.map.completeNode(this.game.currentBattleNode);
      this.game.currentBattleNode = null;
    }
    const autoSave = this.getEventManagerHook('autoSave', typeof this.game?.autoSave === 'function' ? this.game.autoSave.bind(this.game) : null);
    if (autoSave) {
      autoSave();
    }
    const showScreen = this.getEventManagerHook('showScreen', typeof this.game?.showScreen === 'function' ? this.game.showScreen.bind(this.game) : null);
    if (showScreen) {
      showScreen('map-screen');
    }
  }
  bindLibraryEvents() {
    // Selector matches new structure
    const items = document.querySelectorAll('.law-item-row');
    items.forEach(item => {
      // Remove 'equipped' check to allow selecting equipped items if we want to show info, 
      // but for equipping logic, we check inside.

      item.onclick = () => {
        const lawId = item.dataset.id;
        const ring = this.game.player.fateRing;
        // Safe lookup
        const equippedSlotIndex = ring.slots.findIndex(slot => slot.law === lawId);

        // 1. If already equipped -> Unequip
        if (equippedSlotIndex !== -1) {
          ring.socketLaw(equippedSlotIndex, null);
          Utils.showBattleLog('法则已卸载');
          this.game.updateUIState(ring);
          this.game.autoSave();
          return;
        }

        // 2. Equip Logic
        if (item.classList.contains('equipped')) return; // Should be redundant now but safe

        let targetSlot = this.game.selectedRingSlot;
        if (targetSlot === undefined) {
          // Find first empty
          for (let i = 0; i < ring.slots.length; i++) {
            if (ring.slots[i].unlocked && !ring.slots[i].law) {
              targetSlot = i;
              break;
            }
          }
        }
        if (targetSlot !== undefined && targetSlot >= 0) {
          if (ring.socketLaw(targetSlot, lawId)) {
            Utils.showBattleLog(`已装填法则`);
            this.game.selectedRingSlot = undefined;
            this.game.updateUIState(ring); // Optimized update
            this.game.autoSave();
          } else {
            Utils.showBattleLog('装填失败');
          }
        } else {
          Utils.showBattleLog('请先选择一个空槽位');
        }
      };
    });
  }
  bindRingEvents() {
    const modal = document.getElementById('ring-modal');

    // 绑定槽位点击
    modal.querySelectorAll('.law-slot-node').forEach(slot => {
      slot.addEventListener('click', e => {
        const index = parseInt(slot.dataset.index);
        const ring = this.game.player.fateRing;
        const slotData = ring.slots[index];
        if (!slotData.unlocked) {
          // Check for SealedRing unseal interaction
          if (ring.type === 'sealed' && ring.canUnseal && ring.canUnseal(index)) {
            this.game.showConfirmModal(`该槽位被【逆生咒】封印。\n强制解除将永久损耗生命上限。\n是否解除？`, () => {
              ring.unseal(index);
              this.game.showFateRing();
              this.game.autoSave();
            });
          } else {
            Utils.showBattleLog('该槽位尚未解锁');
          }
          return;
        }

        // 如果该槽位有法则，点击卸载
        if (slotData.law) {
          ring.socketLaw(index, null); // Unload
          Utils.showBattleLog('法则已卸载');
          this.game.showFateRing(); // 刷新
          this.game.autoSave();
        } else {
          // 如果是空槽位，选中它
          if (this.game.selectedRingSlot === index) {
            this.game.selectedRingSlot = undefined; // 取消选中
          } else {
            this.game.selectedRingSlot = index;
          }
          this.game.showFateRing();
        }
      });
    });

    // 绑定法则库点击
    modal.querySelectorAll('.library-item').forEach(item => {
      if (item.classList.contains('equipped')) return;
      item.addEventListener('click', () => {
        const lawId = item.dataset.id;
        let targetSlot = this.game.selectedRingSlot;

        // 如果没选中槽位，找第一个空的
        if (targetSlot === undefined) {
          for (let i = 0; i < this.game.player.fateRing.slots.length; i++) {
            if (this.game.player.fateRing.slots[i].unlocked && !this.game.player.fateRing.slots[i].law) {
              targetSlot = i;
              break;
            }
          }
        }
        if (targetSlot !== undefined && targetSlot >= 0) {
          if (this.game.player.fateRing.socketLaw(targetSlot, lawId)) {
            const lawName = LAWS[lawId]?.name || '法则';
            Utils.showBattleLog(`已装填法则【${lawName}】`);
            this.game.selectedRingSlot = undefined; // 重置选中
            this.game.showFateRing();
            this.game.autoSave();
          } else {
            Utils.showBattleLog('装填失败：槽位未解锁或无效');
          }
        } else {
          Utils.showBattleLog('请先选择一个空槽位');
        }
      });
    });
  }
  getStrategicEngineeringEventBiasProfile() {
    const snapshot = this.game.getStrategicEngineeringSnapshot();
    const focusTrack = snapshot && snapshot.focusTrack ? snapshot.focusTrack : null;
    if (!focusTrack || focusTrack.tier <= 0) return null;
    const profileCatalog = {
      observatory: {
        eventIdsByTier: [[], ['artifactConfluxBazaar', 'convergenceRelay', 'harmonicAnvil', 'starObservation'], ['artifactConfluxBazaar', 'convergenceRelay', 'harmonicAnvil', 'starObservation', 'astralSupplyDepot'], ['artifactConfluxBazaar', 'convergenceRelay', 'harmonicAnvil', 'starObservation', 'astralSupplyDepot', 'floatingMarketRift']],
        biasChanceByTier: [0, 0.24, 0.34, 0.44],
        signalByTier: ['', '观测回路刚接入这处异象，天机与命环校准收益开始抬升。', '观测网已经锁定此地灵流，观测、校准与货单筛选都会更稳。', '跨章观测网压住了灵流波动，本次事件会稳定吐出高价值观测结果。'],
        bonusPreviewByTier: ['', '额外货位 +1 / 小幅折价 / 天机 +1 / 命环经验补正', '额外货位 +1 / 折价 8% / 天机 +1 / 命环经验 +10~16', '额外货位 +1 / 折价 12% / 天机 +2 / 命环经验 +14~24']
      },
      memory_rift: {
        eventIdsByTier: [[], ['floatingMarketRift', 'astralSupplyDepot', 'voidRift', 'voidBookkeeper', 'ashLedgerTrial', 'convergenceRitual', 'frontierContractBoard'], ['floatingMarketRift', 'astralSupplyDepot', 'voidRift', 'voidBookkeeper', 'ashLedgerTrial', 'convergenceRitual', 'frontierContractBoard', 'artifactConfluxBazaar', 'convergenceRelay'], ['floatingMarketRift', 'astralSupplyDepot', 'voidRift', 'voidBookkeeper', 'ashLedgerTrial', 'convergenceRitual', 'frontierContractBoard', 'artifactConfluxBazaar', 'convergenceRelay', 'harmonicAnvil']],
        biasChanceByTier: [0, 0.22, 0.32, 0.42],
        signalByTier: ['', '裂隙回响开始渗入此地，构筑改写与裂隙补给窗口正在放大。', '裂隙工程已经与当前路线并轨，改写构筑与裂隙补给收益进一步抬升。', '深层裂隙回响已成网，本次事件会更偏向高压改写与重配收益。'],
        bonusPreviewByTier: ['', '额外货位 +1 / 小幅折价 / 灵石补贴 / 命环经验补正', '额外货位 +1 / 折价 10% / 灵石 +16 / 命环经验 +12~18', '额外货位 +1 / 折价 14% / 灵石 +24 / 命环经验 +18~26']
      }
    };
    const config = profileCatalog[focusTrack.trackId];
    if (!config) return null;
    const tierIndex = Math.max(0, Math.min(focusTrack.tier, (Array.isArray(config.biasChanceByTier) ? config.biasChanceByTier.length : 1) - 1, (Array.isArray(config.bonusPreviewByTier) ? config.bonusPreviewByTier.length : 1) - 1));
    const eventIds = Array.isArray(config.eventIdsByTier) ? (config.eventIdsByTier[tierIndex] || config.eventIdsByTier[0] || []).filter(id => typeof id === 'string' && id.trim()) : [];
    const signal = Array.isArray(config.signalByTier) ? config.signalByTier[tierIndex] || config.signalByTier[0] || '' : '';
    const biasChance = Math.max(0, Math.min(0.75, Number(config.biasChanceByTier[tierIndex]) || 0));
    const bonusPreview = Array.isArray(config.bonusPreviewByTier) ? String(config.bonusPreviewByTier[tierIndex] || config.bonusPreviewByTier[0] || '') : '';
    return {
      trackId: focusTrack.trackId,
      name: focusTrack.name,
      icon: focusTrack.icon,
      tier: focusTrack.tier,
      tierLabel: focusTrack.tierLabel,
      eventIds,
      biasChance,
      signal,
      bonusPreview,
      summary: `${focusTrack.icon} ${focusTrack.name} ${focusTrack.tierLabel} 正在改写章节事件池${bonusPreview ? `，并为命中的工程事件追加 ${bonusPreview}` : ''}。`
    };
  }
}
if (typeof window !== 'undefined') {}
