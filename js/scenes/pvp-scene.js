import { PVPService } from "../services/pvp-service.js";
import { createPvpLiveSession } from "../services/pvp-live-session.js";
import { PVP_SHOP_ITEMS } from "../data/shop-items.js";
import { Utils } from "../core/utils.js";
import { GhostEnemy } from "../entities/ghost-enemy.js";
import { escapeHtml as renderEscapeHtml } from "../ui/render-safe.js";
/**
 * The Defier - PVP Scene Controller (Ink & Gold Edition)
 * 天道榜界面逻辑 - 适配新UI
 */

export const PVPScene = {
  context: {
    game: null
  },
  activeTab: 'live',
  activeShopCategory: 'all',
  // Shop Category state
  selectedPersonality: 'balanced',
  // Default
  isMatching: false,
  // 匹配锁，防止重复请求导致状态竞争
  matchingTimeoutMs: 8000,
  liveSession: null,
  livePollTimer: null,
  liveQueueCooldownTimer: null,
  liveQueueCooldownTickMs: 1000,
  liveHeartbeatTimer: null,
  liveHeartbeatIntervalMs: 0,
  liveLifecycleBound: false,
  liveForegroundResumeQueued: false,
  liveForegroundResumeTimer: null,
  liveForegroundResumeDebounceMs: 250,
  liveLongWaitPollUntil: 0,
  liveRealtimeRenderQueued: false,
  liveIntentSeq: 0,
  liveIntentInFlight: { action: null, social: null },
  liveOpeningActionConfirm: null,
  liveOpeningActionConfirmMs: 6000,
  liveSurrenderConfirmUntil: 0,
  liveSurrenderConfirmMs: 6000,
  liveMulliganSelection: new Set(),
  liveSelectedLoadoutPreset: 'balanced',
  liveDrillScenario: null,
  liveSocialMuted: false,
  liveSocialPreferencesLoaded: false,
  liveInlineHint: '',
  liveReplayShareViewer: null,
  liveReviewFocus: '',
  liveLoadoutReviewFocused: false,
  liveLoadoutReviewFocusReason: 'loadout',
  rankingFocusId: null,
  rankingFocusData: null,
  lastLoadedRankings: [],
  PERSONA_RULES: {
    balanced: {
      damageMul: 1.0,
      takenMul: 1.0,
      regenEnergyPerTurn: 1,
      hpMul: 1.0
    },
    slaughter: {
      damageMul: 1.2,
      takenMul: 1.1,
      regenEnergyPerTurn: 0,
      hpMul: 1.0
    },
    longevity: {
      damageMul: 0.85,
      takenMul: 0.95,
      regenEnergyPerTurn: 0,
      hpMul: 1.3
    }
  },
  onShow() {
    this.setMatchingState(false);
    this.updateMyRankInfo();
    this.switchTab('live');
  },
  init(context = {}) {
    this.context = {
      ...this.context,
      ...context
    };
    this.loadLiveSocialPreferences();
    return this;
  },
  getGameRef() {
    if (this.context && this.context.game) return this.context.game;
    if (typeof window !== 'undefined' && window.game) return window.game;
    if (typeof globalThis !== 'undefined' && globalThis.game) return globalThis.game;
    return null;
  },
  setMatchingState(isBusy) {
    this.isMatching = !!isBusy;
    const btn = document.querySelector('#tab-ranking .challenge-btn');
    const text = btn ? btn.querySelector('.text') : null;
    if (!btn) return;
    btn.disabled = !!isBusy;
    btn.classList.toggle('is-matching', !!isBusy);
    if (isBusy) {
      if (text) {
        text.textContent = '⏳ 镜像演武匹配中...';
      }
      const hint = document.getElementById('pvp-challenge-intent');
      if (hint) {
        hint.textContent = '正在锁定焦点目标与残影；这不是实时真人排位。';
      }
      return;
    }
    this.renderChallengeIntent();
  },
  getPersonalityRuleSet(type) {
    return this.PERSONA_RULES[type] || this.PERSONA_RULES.balanced;
  },
  escapeHtml(value) {
    return renderEscapeHtml(value);
  },
  getCurrentRankBaseline() {
    const fallback = {
      myRank: null,
      myScore: 1000,
      myRealm: 1
    };
    if (typeof PVPService === 'undefined' || !PVPService) return fallback;
    const rank = PVPService.currentRankData || (typeof PVPService.loadLocalRank === 'function' ? PVPService.loadLocalRank() : null);
    if (!rank) return fallback;
    return {
      myRank: rank,
      myScore: Math.max(0, Number(rank.score) || 1000),
      myRealm: Math.max(1, Math.floor(Number(rank.realm) || 1))
    };
  },
  getRankingFocusSnapshot() {
    if (!this.rankingFocusData) return null;
    const focus = this.rankingFocusData;
    return {
      rank: focus.rank ? {
        objectId: focus.rank.objectId || '',
        user: focus.rank.user ? {
          objectId: focus.rank.user.objectId || '',
          username: focus.rank.user.username || ''
        } : null,
        score: Math.max(0, Math.floor(Number(focus.rank.score) || 0)),
        realm: Math.max(1, Math.floor(Number(focus.rank.realm) || 1)),
        division: focus.rank.division || ''
      } : null,
      duelBrief: focus.duelBrief && typeof focus.duelBrief === 'object' ? {
        targetName: String(focus.duelBrief.targetName || ''),
        targetRankId: String(focus.duelBrief.targetRankId || ''),
        engagementId: String(focus.duelBrief.engagementId || ''),
        engagementLabel: String(focus.duelBrief.engagementLabel || ''),
        engagementLine: String(focus.duelBrief.engagementLine || ''),
        modeId: String(focus.duelBrief.modeId || ''),
        modeLabel: String(focus.duelBrief.modeLabel || ''),
        modeLine: String(focus.duelBrief.modeLine || ''),
        winRewardText: String(focus.duelBrief.winRewardText || ''),
        lossRewardText: String(focus.duelBrief.lossRewardText || ''),
        reserveText: String(focus.duelBrief.reserveText || ''),
        counterplayText: String(focus.duelBrief.counterplayText || ''),
        chipText: String(focus.duelBrief.chipText || ''),
        tags: Array.isArray(focus.duelBrief.tags) ? focus.duelBrief.tags.slice(0, 3) : [],
        rewardPreview: focus.duelBrief.rewardPreview && typeof focus.duelBrief.rewardPreview === 'object' ? {
          winCoins: Math.max(0, Math.floor(Number(focus.duelBrief.rewardPreview.winCoins) || 0)),
          lossCoins: Math.max(0, Math.floor(Number(focus.duelBrief.rewardPreview.lossCoins) || 0)),
          winRatingDelta: Math.trunc(Number(focus.duelBrief.rewardPreview.winRatingDelta) || 0),
          lossRatingDelta: Math.trunc(Number(focus.duelBrief.rewardPreview.lossRatingDelta) || 0)
        } : null
      } : null,
      dossier: focus.dossier && typeof focus.dossier === 'object' ? {
        targetName: String(focus.dossier.targetName || ''),
        targetRankId: String(focus.dossier.targetRankId || ''),
        targetDivision: String(focus.dossier.targetDivision || ''),
        targetRealm: Math.max(1, Math.floor(Number(focus.dossier.targetRealm) || 1)),
        confidence: String(focus.dossier.confidence || ''),
        confidenceLabel: String(focus.dossier.confidenceLabel || ''),
        title: String(focus.dossier.title || ''),
        summary: String(focus.dossier.summary || ''),
        riskLine: String(focus.dossier.riskLine || ''),
        scoreLine: String(focus.dossier.scoreLine || ''),
        seasonLine: String(focus.dossier.seasonLine || ''),
        seasonName: String(focus.dossier.seasonName || ''),
        seasonDetail: String(focus.dossier.seasonDetail || ''),
        segmentLabel: String(focus.dossier.segmentLabel || ''),
        segmentLine: String(focus.dossier.segmentLine || ''),
        sourceLabel: String(focus.dossier.sourceLabel || ''),
        sourceLine: String(focus.dossier.sourceLine || ''),
        formationLabel: String(focus.dossier.formationLabel || ''),
        formationLine: String(focus.dossier.formationLine || ''),
        routeValue: String(focus.dossier.routeValue || ''),
        routeLine: String(focus.dossier.routeLine || ''),
        comparisonValue: String(focus.dossier.comparisonValue || ''),
        comparisonLine: String(focus.dossier.comparisonLine || ''),
        historyValue: String(focus.dossier.historyValue || ''),
        historyLine: String(focus.dossier.historyLine || ''),
        historyTag: String(focus.dossier.historyTag || ''),
        historyCount: Math.max(0, Math.floor(Number(focus.dossier.historyCount) || 0)),
        trendValue: String(focus.dossier.trendValue || ''),
        trendLine: String(focus.dossier.trendLine || ''),
        trendTag: String(focus.dossier.trendTag || ''),
        trendSampleCount: Math.max(0, Math.floor(Number(focus.dossier.trendSampleCount) || 0)),
        ledgerValue: String(focus.dossier.ledgerValue || ''),
        ledgerLine: String(focus.dossier.ledgerLine || ''),
        ledgerTag: String(focus.dossier.ledgerTag || ''),
        ledgerSampleCount: Math.max(0, Math.floor(Number(focus.dossier.ledgerSampleCount) || 0)),
        ledgerChips: Array.isArray(focus.dossier.ledgerChips) ? focus.dossier.ledgerChips.slice(0, 4) : [],
        archetypeLabel: String(focus.dossier.archetypeLabel || ''),
        counterplayText: String(focus.dossier.counterplayText || ''),
        reserveText: String(focus.dossier.reserveText || ''),
        tags: Array.isArray(focus.dossier.tags) ? focus.dossier.tags.slice(0, 6) : [],
        clueCards: Array.isArray(focus.dossier.clueCards) ? focus.dossier.clueCards.slice(0, 6).map(item => ({
          label: String(item && item.label || ''),
          value: String(item && item.value || ''),
          detail: String(item && item.detail || '')
        })) : []
      } : null,
      dangerProfile: typeof PVPService !== 'undefined' && PVPService && typeof PVPService.normalizePVPDangerProfile === 'function' ? PVPService.normalizePVPDangerProfile(focus.dangerProfile || null) : focus.dangerProfile || null
    };
  },
  syncFocusedRowSelection() {
    document.querySelectorAll('#ranking-list .jade-slip-row').forEach(row => {
      row.classList.toggle('is-focused', !!(this.rankingFocusId && row.dataset.rankId === this.rankingFocusId));
    });
  },
  renderChallengeIntent() {
    const btn = document.querySelector('#tab-ranking .challenge-btn');
    const text = btn ? btn.querySelector('.text') : null;
    const hint = document.getElementById('pvp-challenge-intent');
    const duelBrief = this.rankingFocusData && this.rankingFocusData.duelBrief ? this.rankingFocusData.duelBrief : null;
    if (text) {
      text.textContent = duelBrief ? '🧪 锁定镜像' : '🧪 镜像演武';
    }
    if (btn) {
      btn.title = duelBrief ? `${duelBrief.targetName}｜${duelBrief.engagementLabel}｜${duelBrief.modeLabel}｜不是真人排位` : '镜像演武，不是真人排位';
    }
    if (hint) {
      hint.textContent = duelBrief ? `已锁定镜像：${duelBrief.targetName} ｜ ${duelBrief.engagementLabel} ｜ ${duelBrief.modeLabel} ｜ 不是真人排位` : '镜像演武不是真人排位；未锁定焦点目标时，将自动按榜位推演对手。';
    }
  },
  setRankingFocus(rank, dangerProfile = null) {
    if (!rank || typeof rank !== 'object') return;
    const safeRank = {
      objectId: rank.objectId || rank.user && rank.user.objectId || `rank-${Date.now()}`,
      user: rank.user && typeof rank.user === 'object' ? {
        objectId: rank.user.objectId || 'unknown-user',
        username: rank.user.username || '未知修士'
      } : {
        objectId: 'unknown-user',
        username: '未知修士'
      },
      score: Math.max(0, Math.floor(Number(rank.score) || 1000)),
      realm: Math.max(1, Math.floor(Number(rank.realm) || 1)),
      division: rank.division || (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getDivisionByScore === 'function' ? PVPService.getDivisionByScore(Number(rank.score) || 1000) : '潜龙榜')
    };
    const baseline = this.getCurrentRankBaseline();
    const profile = typeof PVPService !== 'undefined' && PVPService ? dangerProfile && typeof PVPService.normalizePVPDangerProfile === 'function' ? PVPService.normalizePVPDangerProfile(dangerProfile) : typeof PVPService.getPVPDangerProfile === 'function' ? PVPService.getPVPDangerProfile({
      rank: safeRank
    }, baseline) : dangerProfile : dangerProfile;
    const duelBrief = typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getFocusDuelSlip === 'function' ? PVPService.getFocusDuelSlip({
      rank: safeRank,
      dangerProfile: profile
    }, baseline) : null;
    const dossier = typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getFocusOpponentDossier === 'function' ? PVPService.getFocusOpponentDossier({
      rank: safeRank,
      dangerProfile: profile,
      duelBrief
    }, {
      ...baseline,
      listContext: this.lastLoadedRankings
    }) : null;
    this.rankingFocusId = safeRank.objectId;
    this.rankingFocusData = {
      rank: safeRank,
      dangerProfile: profile,
      duelBrief,
      dossier
    };
    this.syncFocusedRowSelection();
    this.renderRankingFocusCard();
    this.renderChallengeIntent();
  },
  renderRankingFocusCard(state = null) {
    const panel = document.getElementById('pvp-ranking-brief');
    if (!panel) return;
    if (state === 'loading') {
      panel.dataset.riskTier = 'none';
      panel.innerHTML = `
                <div class="pvp-risk-kicker">榜单推演</div>
                <div class="pvp-risk-title">正在推演本轮对手画像…</div>
                <div class="pvp-risk-footnote">读取榜位、境界、赛季账本与套路结构，稍候即可查看 PVP DRI、对手档案、分段标签、历史交手留痕、多场趋势、样本筛面摘要与焦点约战单。</div>
            `;
      this.renderChallengeIntent();
      return;
    }
    if (!this.rankingFocusData || !this.rankingFocusData.rank || !this.rankingFocusData.dangerProfile) {
      panel.dataset.riskTier = 'none';
      panel.innerHTML = `
                <div class="pvp-risk-kicker">榜单推演</div>
                <div class="pvp-risk-title">选择一名对手，查看本场读题建议</div>
                <div class="pvp-risk-footnote">这里会显示 PVP DRI、对手档案、赛季题面、分段标签、跨场对照、历史交手留痕、多场趋势、赛季账本筛面、样本筛面摘要、主导风险轴、对策、资源预留与焦点约战单。</div>
            `;
      this.renderChallengeIntent();
      return;
    }
    const focus = this.rankingFocusData;
    const rank = focus.rank;
    const duelBrief = focus.duelBrief && typeof focus.duelBrief === 'object' ? focus.duelBrief : null;
    const dossier = focus.dossier && typeof focus.dossier === 'object' ? focus.dossier : null;
    const profile = typeof PVPService !== 'undefined' && PVPService && typeof PVPService.normalizePVPDangerProfile === 'function' ? PVPService.normalizePVPDangerProfile(focus.dangerProfile) : focus.dangerProfile;
    const dossierHistoryCards = dossier ? [{
      key: 'history',
      label: '历史交手',
      value: dossier.historyValue || '暂无直接交手',
      detail: dossier.historyLine || '本赛季还没有与这名对手的真实留痕，先把这一把打成首条样本。',
      tag: dossier.historyTag || (Number(dossier.historyCount) > 0 ? `本季 ${Math.max(0, Number(dossier.historyCount) || 0)} 场` : '待补样本')
    }, {
      key: 'trend',
      label: '多场趋势',
      value: dossier.trendValue || '趋势待形成',
      detail: dossier.trendLine || '至少再完成 1 场真实样本，才会把节拍回暖或承压下滑写成趋势。',
      tag: dossier.trendTag || (Number(dossier.trendSampleCount) > 0 ? `样本 ${Math.max(0, Number(dossier.trendSampleCount) || 0)} 场` : '样本待扩')
    }, {
      key: 'ledger',
      label: '赛季账本',
      value: dossier.ledgerValue || '本季账本 0 场',
      detail: dossier.ledgerLine || '筛面会按当前卷面收束；当前还没有可比样本，先用这一把建立首条赛季账本记录。',
      tag: dossier.ledgerTag || (Number(dossier.ledgerSampleCount) > 0 ? `账本 ${Math.max(0, Number(dossier.ledgerSampleCount) || 0)} 场` : '样本筛面'),
      chips: Array.isArray(dossier.ledgerChips) ? dossier.ledgerChips.slice(0, 4) : [],
      wide: true
    }] : [];
    panel.dataset.riskTier = profile.tierId || 'none';
    panel.innerHTML = `
            <div class="pvp-risk-kicker">${this.escapeHtml(profile.confidenceLabel || '榜单推演')} · 匹配前读题</div>
            <div class="pvp-risk-header">
                <div class="pvp-risk-heading">
                    <div class="pvp-risk-title">焦点对手 · ${this.escapeHtml(rank.user?.username || '未知修士')}</div>
                    <div class="pvp-risk-subtitle">${this.escapeHtml(rank.division || '潜龙榜')} · 第${this.escapeHtml(rank.realm || 1)}层 · ${this.escapeHtml(profile.opponent?.archetypeLabel || '均衡试探')}</div>
                </div>
                <div class="pvp-risk-dri tier-${this.escapeHtml(profile.tierId || 'none')}">DRI ${this.escapeHtml(profile.index || 0)}</div>
            </div>
            <div class="pvp-risk-chip-row">
                <span class="pvp-risk-chip tier-${this.escapeHtml(profile.tierId || 'none')}">${this.escapeHtml(profile.tierLabel || '可控')}</span>
                <span class="pvp-risk-chip accent">${this.escapeHtml(profile.dominantAxisLabel || '先手爆发')}</span>
                ${(profile.tags || []).map(tag => `<span class="pvp-risk-chip">${this.escapeHtml(tag)}</span>`).join('')}
            </div>
            <div class="pvp-risk-summary">${this.escapeHtml(profile.summary || '推演完成后会在这里展示风险摘要。')}</div>
            ${dossier ? `
                <div class="pvp-dossier">
                    <div class="pvp-dossier-kicker">对手档案</div>
                    <div class="pvp-dossier-grid">
                        ${(dossier.clueCards || []).map(item => `
                            <div class="pvp-dossier-card">
                                <div class="pvp-dossier-label">${this.escapeHtml(item.label || '档案')}</div>
                                <div class="pvp-dossier-value">${this.escapeHtml(item.value || '待推演')}</div>
                                <div class="pvp-dossier-detail">${this.escapeHtml(item.detail || '')}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="pvp-dossier-history-grid">
                        ${dossierHistoryCards.map(item => `
                            <div class="pvp-dossier-card pvp-dossier-card-emphasis ${item.wide ? 'pvp-dossier-card-wide' : ''}" data-dossier-card="${this.escapeHtml(item.key)}">
                                <div class="pvp-dossier-card-head">
                                    <div class="pvp-dossier-label">${this.escapeHtml(item.label)}</div>
                                    <div class="pvp-dossier-mini-tag">${this.escapeHtml(item.tag || '')}</div>
                                </div>
                                <div class="pvp-dossier-value">${this.escapeHtml(item.value || '待推演')}</div>
                                <div class="pvp-dossier-detail">${this.escapeHtml(item.detail || '')}</div>
                                ${Array.isArray(item.chips) && item.chips.length > 0 ? `
                                    <div class="pvp-dossier-card-tags">
                                        ${item.chips.map(chip => `<span class="pvp-dossier-inline-chip">${this.escapeHtml(chip)}</span>`).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <div class="pvp-dossier-line">${this.escapeHtml(dossier.riskLine || '')}${dossier.scoreLine ? ` ｜ ${this.escapeHtml(dossier.scoreLine)}` : ''}</div>
                    <div class="pvp-risk-chip-row pvp-dossier-tags">
                        ${(dossier.tags || []).map(tag => `<span class="pvp-risk-chip">${this.escapeHtml(tag)}</span>`).join('')}
                    </div>
                </div>
            ` : ''}
            <div class="pvp-risk-axis-grid">
                ${(profile.axes || []).map(axis => `
                    <div class="pvp-risk-axis-item">
                        <div class="pvp-risk-axis-label-row">
                            <span>${this.escapeHtml(axis.label || '风险轴')}</span>
                            <span>${this.escapeHtml(axis.value || 0)}</span>
                        </div>
                        <div class="pvp-risk-axis-track">
                            <div class="pvp-risk-axis-fill tone-${this.escapeHtml(axis.id || 'burst')}" style="width:${Math.max(0, Math.min(100, Number(axis.value) || 0))}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="pvp-risk-line">
                <span class="label">对策</span>
                <span class="value">${this.escapeHtml(profile.counterplay || '优先稳住首拍与净化链。')}</span>
            </div>
            <div class="pvp-risk-line">
                <span class="label">预留</span>
                <span class="value">${this.escapeHtml(profile.reserveGuidance || '保留至少一次稳态回合与止损手段。')}</span>
            </div>
            ${duelBrief ? `
                <div class="pvp-duel-slip">
                    <div class="pvp-duel-slip-kicker">焦点约战单</div>
                    <div class="pvp-duel-slip-head">
                        <div class="pvp-duel-slip-title">${this.escapeHtml(duelBrief.engagementLabel || '练手')} · ${this.escapeHtml(duelBrief.modeLabel || '镜像演武')}</div>
                        <div class="pvp-duel-slip-chip">${this.escapeHtml(duelBrief.chipText || `DRI ${profile.index || 0} · ${profile.tierLabel || '可控'}`)}</div>
                    </div>
                    <div class="pvp-duel-slip-tags">
                        ${(duelBrief.tags || []).map(tag => `<span class="pvp-duel-slip-tag">${this.escapeHtml(tag)}</span>`).join('')}
                    </div>
                    <div class="pvp-risk-line pvp-duel-line">
                        <span class="label">胜场</span>
                        <span class="value">${this.escapeHtml(duelBrief.winRewardText || '')}</span>
                    </div>
                    <div class="pvp-risk-line pvp-duel-line">
                        <span class="label">败场</span>
                        <span class="value">${this.escapeHtml(duelBrief.lossRewardText || '')}</span>
                    </div>
                    <div class="pvp-risk-line pvp-duel-line">
                        <span class="label">模式</span>
                        <span class="value">${this.escapeHtml(duelBrief.modeLine || '')}</span>
                    </div>
                    <div class="pvp-risk-line pvp-duel-line">
                        <span class="label">建议</span>
                        <span class="value">${this.escapeHtml(duelBrief.engagementLine || duelBrief.counterplayText || '')}</span>
                    </div>
                </div>
            ` : ''}
            <div class="pvp-risk-footnote">${this.escapeHtml(profile.note || '')}</div>
        `;
    this.renderChallengeIntent();
  },
  switchTab(tabName, options = {}) {
    const shouldSkipLoad = !!(options && typeof options === 'object' && options.skipLoad);
    if (this.activeTab === 'live' && tabName !== 'live') {
      this.stopLivePolling();
      this.stopLiveQueueCooldownTicker();
      this.stopLiveHeartbeat();
    }
    this.activeTab = tabName;

    // Update Runes
    document.querySelectorAll('.rune-tab').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.rune-tab[onclick*="'${tabName}'"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update Content Panes
    document.querySelectorAll('.pvp-tab-pane').forEach(el => {
      el.classList.remove('active');
      el.style.display = ''; // Clear inline style if present
    });
    const activePane = document.getElementById(`tab-${tabName}`);
    if (activePane) {
      activePane.classList.add('active');
    }

    // Load Data
    if (!shouldSkipLoad && tabName === 'ranking') this.loadRankings();
    if (!shouldSkipLoad && tabName === 'live') this.loadLivePanel();
    if (!shouldSkipLoad && tabName === 'defense') this.loadDefenseInfo();
    if (!shouldSkipLoad && tabName === 'shop') this.loadShop();
  },
  getLiveSession() {
    this.ensureLiveLifecycleBindings();
    if (!this.liveSession) {
      this.liveSession = createPvpLiveSession({
        liveService: PVPService && PVPService.live ? PVPService.live : null,
        onChange: () => this.queueLiveRealtimeRender()
      });
    }
    return this.liveSession;
  },
  ensureLiveLifecycleBindings() {
    if (this.liveLifecycleBound) return;
    const doc = typeof document !== 'undefined' ? document : null;
    const win = typeof window !== 'undefined' ? window : null;
    const onForegroundSignal = () => this.queueLiveForegroundResume();
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', onForegroundSignal);
    }
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('pageshow', onForegroundSignal);
      win.addEventListener('focus', onForegroundSignal);
    }
    this.liveLifecycleBound = true;
  },
  queueLiveForegroundResume() {
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc && doc.hidden === true) return;
    if (this.liveForegroundResumeQueued || this.liveForegroundResumeTimer) return;
    this.liveForegroundResumeQueued = true;
    const win = typeof window !== 'undefined' ? window : null;
    const setTimer = win && typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : setTimeout;
    const clearResumeWindow = () => {
      this.liveForegroundResumeTimer = null;
    };
    this.liveForegroundResumeTimer = setTimer(clearResumeWindow, this.liveForegroundResumeDebounceMs);
    Promise.resolve()
      .then(async () => {
        await this.handleLiveForegroundResume();
      })
      .catch(error => {
        console.warn('[PVP Live] foreground resume failed', error);
      })
      .finally(() => {
        this.liveForegroundResumeQueued = false;
      });
  },
  async handleLiveForegroundResume() {
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc && doc.hidden === true) return;
    if (this.activeTab && this.activeTab !== 'live') return;
    const session = this.getLiveSession();
    const state = session && typeof session.getState === 'function' ? session.getState() : null;
    if (!state || !state.matchId || !this.shouldLiveHeartbeat(state.phase)) return;
    const heartbeatResult = await this.sendLiveHeartbeat({ resumeRealtime: true });
    if (heartbeatResult && heartbeatResult.transport !== 'http' && typeof session.heartbeat === 'function') {
      try {
        await session.heartbeat();
      } catch (error) {
        console.warn('[PVP Live] foreground recovery heartbeat failed', error);
      }
    }
    if (typeof session.refreshMatch === 'function') {
      try {
        await session.refreshMatch();
      } catch (error) {
        console.warn('[PVP Live] foreground recovery refresh failed', error);
      }
    }
    const win = typeof window !== 'undefined' ? window : null;
    const schedule = win && typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : setTimeout;
    schedule(() => {
      this.liveRealtimeRenderQueued = false;
      this.renderLivePanel();
    }, 0);
  },
  queueLiveRealtimeRender() {
    if (this.liveRealtimeRenderQueued) return;
    this.liveRealtimeRenderQueued = true;
    const schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(callback, 0);
    schedule(() => {
      this.liveRealtimeRenderQueued = false;
      this.renderLivePanel();
    });
  },
  startLiveQueueCooldownTicker() {
    if (typeof window === 'undefined') return;
    if (this.liveQueueCooldownTimer) return;
    this.liveQueueCooldownTimer = window.setInterval(() => {
      const state = this.getLiveSession().getState();
      const countdown = this.getLiveQueueCooldownCountdown(state);
      if (!state || state.phase !== 'idle' || !countdown || countdown.remainingMs <= 0) {
        this.stopLiveQueueCooldownTicker();
        this.renderLivePanel();
        return;
      }
      this.renderLivePanel();
    }, this.liveQueueCooldownTickMs);
  },
  stopLiveQueueCooldownTicker() {
    if (this.liveQueueCooldownTimer && typeof window !== 'undefined') {
      window.clearInterval(this.liveQueueCooldownTimer);
    }
    this.liveQueueCooldownTimer = null;
  },
  syncLiveQueueCooldownTicker(phase = '', state = null) {
    const sourceState = state || this.getLiveSession().getState();
    const countdown = this.getLiveQueueCooldownCountdown(sourceState);
    if (this.activeTab === 'live' && phase === 'idle' && countdown && countdown.remainingMs > 0) {
      this.startLiveQueueCooldownTicker();
    } else {
      this.stopLiveQueueCooldownTicker();
    }
  },
  getLiveLoadoutPresets() {
    return [
      {
        id: 'balanced',
        identitySlot: 'balanced',
        label: '默认斗法谱',
        summary: '攻防均衡，适合首战',
        pattern: ['pvp_strike', 'pvp_guard', 'pvp_strike', 'pvp_burst']
      },
      {
        id: 'sword',
        identitySlot: 'sword',
        label: '破阵斗法谱',
        summary: '压制起手，保留护身',
        pattern: ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']
      },
      {
        id: 'shield',
        identitySlot: 'shield',
        label: '守势斗法谱',
        summary: '稳住前两手，反击破局',
        pattern: ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']
      }
    ];
  },
  getLiveSelectedLoadoutPreset() {
    const presets = this.getLiveLoadoutPresets();
    return presets.find(preset => preset.id === this.liveSelectedLoadoutPreset) || presets[0];
  },
  canEditLiveLoadout(phase = 'idle') {
    return phase === 'idle' || phase === 'finished' || phase === 'invalidated';
  },
  setLiveLoadoutPreset(presetId) {
    const session = this.getLiveSession();
    const state = session && typeof session.getState === 'function' ? session.getState() : null;
    const phase = state && state.phase ? state.phase : 'idle';
    if (!this.canEditLiveLoadout(phase)) {
      this.renderLiveLoadoutPresets(phase);
      return;
    }
    const presets = this.getLiveLoadoutPresets();
    const next = presets.find(preset => preset.id === presetId) || presets[0];
    this.liveSelectedLoadoutPreset = next.id;
    this.renderLiveLoadoutPresets(phase);
  },
  buildLiveLoadoutDeck(pattern) {
    const source = Array.isArray(pattern) && pattern.length > 0 ? pattern : ['pvp_strike', 'pvp_guard', 'pvp_burst'];
    const deck = [];
    for (let index = 0; deck.length < 20; index += 1) {
      deck.push(source[index % source.length]);
    }
    return deck.map(id => ({ id, upgraded: false }));
  },
  getLiveQueueLoadoutCandidate(presetId = this.getLiveSelectedLoadoutPreset().id) {
    const presets = this.getLiveLoadoutPresets();
    const preset = presets.find(item => item.id === presetId) || presets[0];
    return {
      identitySlot: preset.identitySlot,
      label: preset.label,
      deck: this.buildLiveLoadoutDeck(preset.pattern)
    };
  },
  resolveLivePostReviewLoadoutPreset(actionId = 'queue_again', state = null) {
    const id = String(actionId || 'queue_again');
    const session = state && typeof state === 'object' ? null : this.getLiveSession();
    const sourceState = state && typeof state === 'object'
      ? state
      : session && typeof session.getState === 'function' ? session.getState() : null;
    const view = sourceState && sourceState.stateView ? sourceState.stateView : null;
    const review = this.getLivePostMatchReview(view);
    const recommendation = review && review.loadoutRecommendation
      ? this.getLiveLoadoutRecommendation(review.loadoutRecommendation)
      : null;
    const presets = this.getLiveLoadoutPresets();
    const selectedPreset = this.getLiveSelectedLoadoutPreset();
    const recommendationPreset = recommendation
      ? presets.find(item => item.id === recommendation.recommendedPresetId) || null
      : null;
    const usesPracticeRecommendation = id === 'practice' && !!recommendationPreset;
    const preset = usesPracticeRecommendation ? recommendationPreset : selectedPreset;
    const candidateMatchesRecommendation = !!recommendationPreset && preset.id === recommendationPreset.id;
    const source = usesPracticeRecommendation
      ? 'public_recommendation_practice'
      : candidateMatchesRecommendation
        ? 'applied_public_recommendation'
        : recommendationPreset ? 'manual_candidate_override' : 'current_candidate';
    const rankedImpact = id === 'practice' ? 'none' : 'candidate_only';
    const boundaryLine = id === 'practice'
      ? '问道练习只读取公开复盘建议生成无积分训练，不写正式积分。'
      : candidateMatchesRecommendation
        ? '本次入口将使用已套用的公开推荐谱；仍需玩家主动发起，不自动排队。'
        : '本次入口使用当前候选斗法谱；公开推荐可被手动改谱覆盖。';
    return {
      reportVersion: 'pvp-live-post-review-loadout-resolution-v1',
      actionId: id,
      presetId: preset.id,
      presetLabel: preset.label,
      identitySlot: preset.identitySlot,
      source,
      sourceVisibility: usesPracticeRecommendation || candidateMatchesRecommendation ? 'public_events_and_public_content' : 'local_candidate',
      recommendationVisibility: recommendationPreset ? 'public_events_and_public_content' : '',
      usesHiddenInformation: false,
      rankedImpact,
      recommendationPresetId: recommendationPreset ? recommendationPreset.id : '',
      recommendationPresetLabel: recommendationPreset ? recommendationPreset.label : '',
      candidateMatchesRecommendation,
      boundaryLine
    };
  },
  formatLivePostReviewLoadoutResolution(actionId = 'queue_again', resolution = null) {
    if (!resolution || resolution.reportVersion !== 'pvp-live-post-review-loadout-resolution-v1') {
      return '';
    }
    const label = resolution.presetLabel || '当前斗法谱';
    const sourceLabel = resolution.source === 'applied_public_recommendation'
      ? '已套用的公开推荐谱'
      : resolution.source === 'public_recommendation_practice'
        ? '公开推荐谱'
        : resolution.source === 'manual_candidate_override'
          ? '手动候选谱'
          : '当前候选谱';
    const id = String(actionId || resolution.actionId || '');
    if (id === 'practice') {
      return `已使用${sourceLabel}${label}生成真人 PVP 练习课题；练习不写正式积分。`;
    }
    if (id === 'friendly_rematch') {
      return `已使用${sourceLabel}${label}发起低压力再战；不写正式积分。`;
    }
    if (id === 'queue_again') {
      return `已使用${sourceLabel}${label}回到真人排队；仍需真人匹配，不自动切残影。`;
    }
    return `下一步将使用${sourceLabel}${label}；${resolution.boundaryLine || '不自动写正式积分。'}`;
  },
  async buildLiveQueueConnectionHealthProbe() {
    try {
      const report = PVPService && PVPService.live && typeof PVPService.live.measureConnectionHealth === 'function'
        ? await PVPService.live.measureConnectionHealth()
        : null;
      if (report && report.reportVersion === 'pvp-live-queue-connection-health-v1') {
        return {
          sampleWindowMs: Math.max(0, Math.floor(Number(report.sampleWindowMs) || 0)),
          missedHeartbeatCount: Math.max(0, Math.floor(Number(report.missedHeartbeatCount) || 0)),
          reconnectCount: Math.max(0, Math.floor(Number(report.reconnectCount) || 0)),
          rttP95Ms: Math.max(0, Math.floor(Number(report.rttP95Ms) || 0)),
          sampleTag: String(report.sampleTag || 'client_preflight'),
          status: String(report.status || 'pass')
        };
      }
    } catch (error) {
      // Fall through to a conservative blocked probe so formal queue entry can be refused by authority.
    }
    return {
      sampleWindowMs: 0,
      missedHeartbeatCount: 2,
      reconnectCount: 1,
      rttP95Ms: 3000,
      sampleTag: 'client_preflight',
      status: 'blocked'
    };
  },
  getLiveMatchQuality(view) {
    const report = view && view.matchQuality && typeof view.matchQuality === 'object' ? view.matchQuality : null;
    if (!report) return null;
    const waitMs = report.waitMs && typeof report.waitMs === 'object' ? report.waitMs : {};
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-match-quality-v1'),
      tag: String(report.tag || 'good'),
      expansionStage: String(report.expansionStage || 'mvp_open_pool'),
      ratingDeltaBucket: String(report.ratingDeltaBucket || 'unrated_mvp'),
      candidatePoolSize: Math.max(1, Math.floor(Number(report.candidatePoolSize) || 1)),
      waitMs: {
        A: Math.max(0, Math.floor(Number(waitMs.A) || 0)),
        B: Math.max(0, Math.floor(Number(waitMs.B) || 0))
      },
      connectionHealth: String(report.connectionHealth || 'not_measured'),
      connectionHealthSummary: report.connectionHealthSummary && typeof report.connectionHealthSummary === 'object' ? {
        status: String(report.connectionHealthSummary.status || report.connectionHealth || 'not_measured'),
        sampleTag: String(report.connectionHealthSummary.sampleTag || '')
      } : null,
      safeguards: Array.isArray(report.safeguards) ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8) : []
    };
  },
  formatLiveMatchConnectionHealth(report) {
    const status = String(report && report.connectionHealth || report && report.connectionHealthSummary && report.connectionHealthSummary.status || 'not_measured');
    const labels = {
      pass: '连接健康通过',
      risky: '连接需重试',
      blocked: '连接已阻断',
      not_measured: '连接未测'
    };
    return labels[status] || '连接状态待确认';
  },
  formatLiveMatchStageLabel(stage = '') {
    const key = String(stage || '').trim();
    const labels = {
      mvp_open_pool: '新手公开池',
      strict_rating: '近分匹配',
      expanded_100_199: '长等待扩圈',
      accepted_200_399: '双方确认宽分差',
      friend_invite: '好友约战'
    };
    return labels[key] || '规则匹配';
  },
  formatLiveRatingDeltaBucketLabel(bucket = '') {
    const key = String(bucket || '').trim();
    const labels = {
      unrated_mvp: '定级样本',
      near_0_99: '近分 0-99',
      fair_100_199: '扩圈 100-199',
      expanded_100_199: '扩圈 100-199',
      expanded_200_399: '宽分差 200-399',
      friend_invite: '不计排位'
    };
    return labels[key] || '评分差已脱敏';
  },
  formatLiveMatchQuality(view) {
    const report = this.getLiveMatchQuality(view);
    if (!report) return '匹配质量：等待真人';
    const labels = {
      good: '良好',
      expanded: '扩圈匹配',
      wide_but_accepted: '宽分差匹配',
      rejected: '拒绝'
    };
    const tag = labels[report.tag] || '匹配完成';
    const stageLabel = this.formatLiveMatchStageLabel(report.expansionStage);
    const bucketLabel = this.formatLiveRatingDeltaBucketLabel(report.ratingDeltaBucket);
    const maxWaitSec = Math.ceil(Math.max(report.waitMs.A, report.waitMs.B) / 1000);
    const connectionHealth = this.formatLiveMatchConnectionHealth(report);
    return `匹配质量：${tag} · ${stageLabel} · ${bucketLabel} · ${connectionHealth} · 候选池 ${report.candidatePoolSize} · 等待 ${maxWaitSec}s`;
  },
  formatLiveWaitingReleaseModeLabel(mode = '') {
    const key = String(mode || '').trim();
    const labels = {
      need_third_player: '等待更多真人',
      long_wait_release: '长等待保护放行',
      wide_match_consent: '宽分差确认放行'
    };
    return labels[key] || '规则保护中';
  },
  formatLiveWaitingEligibleActionLabel(actionId = '') {
    const key = String(actionId || '').trim();
    const labels = {
      continue_waiting: '继续等待',
      accept_wide_match: '接受宽分差',
      practice: '问道练习',
      cancel_queue: '取消匹配'
    };
    return labels[key] || '其他操作';
  },
  formatLiveWaitingEligibleActions(actions = []) {
    if (!Array.isArray(actions)) return '';
    const labels = actions
      .map(actionId => this.formatLiveWaitingEligibleActionLabel(actionId))
      .filter(Boolean);
    return labels.length ? labels.join(' / ') : '';
  },
  getLiveTurnTimer(view) {
    const timer = view && view.turnTimer && typeof view.turnTimer === 'object' ? view.turnTimer : null;
    if (!timer) return null;
    const deadlineAt = Math.max(0, Math.floor(Number(timer.deadlineAt) || 0));
    const fallbackRemaining = Math.max(0, Math.floor(Number(timer.remainingMs) || 0));
    const remainingMs = deadlineAt > 0 ? Math.max(0, deadlineAt - Date.now()) : fallbackRemaining;
    return {
      reportVersion: String(timer.reportVersion || 'pvp-live-turn-timer-v1'),
      phase: timer.phase === 'setup' ? 'setup' : timer.phase === 'active' ? 'active' : '',
      currentSeat: String(timer.currentSeat || ''),
      viewerSeat: String(timer.viewerSeat || ''),
      isViewerTurn: timer.isViewerTurn === true,
      viewerCanAct: timer.viewerCanAct === true,
      startedAt: Math.max(0, Math.floor(Number(timer.startedAt) || 0)),
      deadlineAt,
      timeoutMs: Math.max(0, Math.floor(Number(timer.timeoutMs) || 0)),
      remainingMs
    };
  },
  getLiveTurnTimerUrgency(view) {
    const timer = this.getLiveTurnTimer(view);
    if (!timer || timer.phase !== 'active') return 'normal';
    if (timer.remainingMs <= 0) return 'expired';
    return timer.remainingMs <= 10000 ? 'low' : 'normal';
  },
  formatLiveTurnTimer(view) {
    const timer = this.getLiveTurnTimer(view);
    if (!timer || !timer.phase) return '倒计时：等待权威状态';
    const remainingSec = Math.max(0, Math.ceil(timer.remainingMs / 1000));
    if (timer.phase === 'setup') {
      return `准备倒计时：${remainingSec}s · 双方确认后开战`;
    }
    const turnLabel = timer.isViewerTurn ? '我的行动窗口' : `等待 ${timer.currentSeat || '--'} 行动`;
    const baseText = `行动倒计时：${remainingSec}s · 当前 ${timer.currentSeat || '--'} · ${turnLabel}`;
    if (timer.remainingMs <= 0) return `${baseText} · 行动超时，等待服务端处理`;
    if (timer.remainingMs <= 10000) {
      const lowTimeText = timer.isViewerTurn ? '最后 10 秒，请确认行动' : '对手思考中，剩余时间不多';
      return `${baseText} · ${lowTimeText}`;
    }
    return baseText;
  },
  getLiveTimeoutAutomationForecast(view, phase = '') {
    const livePhase = String(phase || '');
    const viewStatus = String(view && view.status || '');
    if (livePhase && livePhase !== 'active') return null;
    if (!livePhase && viewStatus && viewStatus !== 'active') return null;
    const timer = this.getLiveTurnTimer(view);
    if (!timer || timer.phase !== 'active' || timer.remainingMs <= 0) return null;
    if (this.getLiveTurnTimerUrgency(view) !== 'low') return null;
    const currentSeat = String(timer.currentSeat || view && view.currentSeat || '').trim();
    if (!currentSeat) return null;
    const actionPreview = this.getLiveActionPreviewReport(view);
    if (actionPreview && (actionPreview.usesHiddenInformation || actionPreview.rankedImpact !== 'none')) return null;
    if (actionPreview && actionPreview.currentSeat && actionPreview.currentSeat !== currentSeat) return null;
    const timeoutAutomationReport = view && view.timeoutAutomationReport && typeof view.timeoutAutomationReport === 'object'
      ? view.timeoutAutomationReport
      : null;
    if (timeoutAutomationReport && (
      timeoutAutomationReport.usesHiddenInformation === true
      || String(timeoutAutomationReport.rankedImpact || 'none') !== 'none'
    )) return null;
    const getReportAutomationCount = (seatId) => {
      if (!timeoutAutomationReport || !seatId) return null;
      const countsBySeat = timeoutAutomationReport.countsBySeat && typeof timeoutAutomationReport.countsBySeat === 'object'
        ? timeoutAutomationReport.countsBySeat
        : {};
      if (Object.prototype.hasOwnProperty.call(countsBySeat, seatId)) {
        return Math.max(0, Math.floor(Number(countsBySeat[seatId]) || 0));
      }
      if (String(timeoutAutomationReport.currentSeat || '') === seatId) {
        return Math.max(0, Math.floor(Number(timeoutAutomationReport.currentSeatAutomationCount) || 0));
      }
      if (String(timeoutAutomationReport.viewerSeat || '') === seatId) {
        return Math.max(0, Math.floor(Number(timeoutAutomationReport.viewerSeatAutomationCount) || 0));
      }
      return null;
    };
    const reportAutomationCount = getReportAutomationCount(currentSeat);
    const sourceVisibility = reportAutomationCount !== null
      ? String(timeoutAutomationReport.sourceVisibility || 'server_authoritative_public_timeout_state')
      : 'public_timer_and_public_events';
    const advisoryOnly = true;
    const firstSoftTimeoutState = 'first_soft_timeout';
    const repeatTimeoutRiskState = 'repeat_timeout_risk';
    const eventSources = reportAutomationCount !== null ? [] : [
      Array.isArray(view && view.recentEvents) ? view.recentEvents : [],
      Array.isArray(view && view.events) ? view.events : [],
      Array.isArray(view && view.lastEvents) ? view.lastEvents : []
    ].flat();
    const automationCount = reportAutomationCount !== null ? reportAutomationCount : eventSources.reduce((max, event) => {
      const eventType = String(event && event.eventType || '');
      if (eventType !== 'automation_action') return max;
      const payload = event && event.publicData && typeof event.publicData === 'object'
        ? event.publicData
        : event && event.payload && typeof event.payload === 'object' ? event.payload : {};
      if (String(payload.reason || '') !== 'soft_timeout') return max;
      if (String(payload.seatId || event.actingSeat || '') !== currentSeat) return max;
      return Math.max(max, Math.max(0, Math.floor(Number(payload.automationCount) || 0)));
    }, 0);
    const viewerSeat = String(timer.viewerSeat || actionPreview && actionPreview.viewerSeat || '').trim();
    const isViewerTurn = timer.isViewerTurn === true || !!(actionPreview && actionPreview.isViewerTurn);
    const canUseViewerPreview = !!actionPreview
      && actionPreview.isViewerTurn === true
      && (!viewerSeat || viewerSeat === currentSeat)
      && (!actionPreview.viewerSeat || actionPreview.viewerSeat === currentSeat);
    const defenseCardAvailable = canUseViewerPreview && actionPreview.playableCards.some(card => (
      Math.max(0, Math.floor(Number(card.blockGain) || 0)) > 0
      && Math.max(0, Math.floor(Number(card.hpDamage) || 0)) <= 0
    ));
    const remainingSec = Math.max(0, Math.ceil(timer.remainingMs / 1000));
    const forecastState = automationCount > 0 ? repeatTimeoutRiskState : firstSoftTimeoutState;
    const actorLine = isViewerTurn ? '你' : `${currentSeat} 席`;
    const primaryLine = forecastState === 'first_soft_timeout'
      ? `超时预告：${actorLine}还有 ${remainingSec}s；首次超时会交给服务端低影响托管，${defenseCardAvailable ? '优先使用公开可见防守牌' : '优先执行防守牌或结束回合'}，不会由前端提前判胜。`
      : `超时预告：${currentSeat} 已有 ${automationCount} 次超时托管；再次超时将等待服务端按行动超时权威结算，前端不会提前改写胜负。`;
    const secondaryLine = forecastState === 'first_soft_timeout'
      ? '仍可在倒计时内自行行动；托管只兜底低影响防守或交权，不替玩家寻找最优解。'
      : '重复超时属于正式行动窗口风险；继续对局或终局只看服务端权威事件。';
    return {
      reportVersion: 'pvp-live-timeout-automation-forecast-v1',
      sourceVisibility,
      usesHiddenInformation: false,
      rankedImpact: 'none',
      advisoryOnly,
      forecastState,
      currentSeat,
      viewerSeat,
      isViewerTurn,
      remainingSec,
      automationCount,
      defenseCardAvailable,
      primaryLine,
      secondaryLine,
      boundaryLine: '只提示不代打；超时托管规则不改变正式积分、奖励或结算口径。'
    };
  },
  renderLiveTimeoutAutomationForecast(view, phase = '') {
    const report = view && view.reportVersion === 'pvp-live-timeout-automation-forecast-v1'
      ? view
      : this.getLiveTimeoutAutomationForecast(view, phase);
    if (!report) return '超时预告：等待行动窗口';
    const boundaryLine = report.boundaryLine || '只提示不代打；超时托管规则不改变正式积分、奖励或结算口径。';
    const sourceLine = `${report.sourceVisibility} · ${report.usesHiddenInformation ? '含隐藏信息' : '不含隐藏信息'} · ${report.rankedImpact === 'none' ? '不写正式积分' : report.rankedImpact}`;
    return `
      <div class="pvp-live-timeout-forecast-line" data-live-timeout-forecast-line>
        <span class="pvp-live-timeout-forecast-chip" data-live-timeout-forecast-chip>超时预告</span>
        <span>${this.escapeHtml(report.primaryLine)}</span>
      </div>
      <div class="pvp-live-timeout-forecast-line compact" data-live-timeout-forecast-line>
        <span>${this.escapeHtml(report.secondaryLine)}</span>
      </div>
      <div class="pvp-live-timeout-forecast-line compact" data-live-timeout-forecast-line>
        <span>${this.escapeHtml(boundaryLine)}</span>
        <span>${this.escapeHtml(sourceLine)}</span>
      </div>
    `;
  },
  getLiveConnectionReport(view) {
    const report = view && view.connectionReport && typeof view.connectionReport === 'object' ? view.connectionReport : null;
    if (!report) return null;
    const normalizeSeat = (seat) => {
      if (!seat || typeof seat !== 'object') return null;
      const status = ['online', 'grace', 'disconnected'].includes(seat.status) ? seat.status : 'online';
      return {
        seatId: String(seat.seatId || ''),
        status,
        isViewer: seat.isViewer === true,
        lastHeartbeatAt: Math.max(0, Math.floor(Number(seat.lastHeartbeatAt) || 0)),
        elapsedMs: Math.max(0, Math.floor(Number(seat.elapsedMs) || 0)),
        remainingGraceMs: Math.max(0, Math.floor(Number(seat.remainingGraceMs) || 0))
      };
    };
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-connection-v1'),
      connectionHealth: String(report.connectionHealth || 'good'),
      viewerSeat: String(report.viewerSeat || ''),
      opponentSeat: String(report.opponentSeat || ''),
      heartbeatIntervalMs: Math.max(1000, Math.floor(Number(report.heartbeatIntervalMs) || 5000)),
      heartbeatStaleMs: Math.max(1000, Math.floor(Number(report.heartbeatStaleMs) || 15000)),
      graceMs: Math.max(1000, Math.floor(Number(report.graceMs) || 30000)),
      viewer: normalizeSeat(report.viewer),
      opponent: normalizeSeat(report.opponent)
    };
  },
  formatLiveFinishReasonLabel(reason = '') {
    const key = String(reason || '').trim();
    const labels = {
      surrender: '认输',
      lethal: '伤害终结',
      timeout: '行动超时',
      turn_timeout: '行动超时',
      connection_timeout: '连接超时',
      ready_timeout: '准备超时',
      forfeit_disconnect: '断线判负',
      match_invalidated: '无效局',
      invalidated: '无效局',
      queue_cooldown: '排队冷却',
      connection_health_failed: '连接健康不足',
      long_wait: '长等待保护'
    };
    if (labels[key]) return labels[key];
    return key ? '规则终局' : '终局';
  },
  formatLiveEventTypeLabel(eventType = '') {
    const key = String(eventType || '').trim();
    const labels = {
      opening_protection_triggered: '开局护体触发',
      opening_second_seat_buffer_granted: '后手护盾发放',
      opening_counterplay_granted: '反打缓冲发放',
      budget_clamped: '首动伤害压制',
      damage_applied: '伤害结算',
      status_applied: '公开状态施加',
      status_consumed: '公开状态兑现',
      status_mitigated: '公开状态缓解',
      hp_recovered: '公开恢复',
      card_cycled: '公开抽滤',
      block_gained: '护盾结算',
      card_played: '术式打出',
      turn_ended: '回合交替',
      mulligan_completed: '调息完成',
      player_ready: '准备确认',
      battle_started: '开战',
      player_surrendered: '认输',
      ready_timeout: '准备超时',
      connection_timeout: '连接超时',
      turn_timeout: '行动超时',
      automation_action: '超时托管',
      match_invalidated: '无效局',
      match_finished: '对局结束',
      snapshot_locked: '斗法谱锁定',
      test_state_forced: '测试态校准',
      emote_sent: '预设表情'
    };
    return labels[key] || (key ? '公开事件' : '事件');
  },
  formatLivePolicyLabel(policy = '') {
    const key = String(policy || '').trim();
    const labels = {
      ranked_authoritative: '服务端权威结算',
      practice_only: '仅练习不计分',
      friendly_only: '好友局不计分',
      swap_sides: '换边再战',
      same_sides: '固定席位',
      friendly_series_rotating_opener: '轮换先手',
      per_game_change_allowed: '每局可换谱',
      no_ranked_change: '不改正式积分',
      official: '正式结算',
      honor_only: '仅赛季荣誉',
      candidate_only: '候选意图'
    };
    if (labels[key]) return labels[key];
    if (key === 'none') return '不写正式积分';
    return key ? '公开规则' : '公开规则';
  },
  getLiveConnectionTempo(view, sourceState = null) {
    const authoritative = view && view.connectionTempoReport && typeof view.connectionTempoReport === 'object'
      ? view.connectionTempoReport
      : null;
    if (authoritative && String(authoritative.reportVersion || '') === 'pvp-live-connection-tempo-v1') {
      const safeSeverity = ['normal', 'info', 'warning', 'danger'].includes(authoritative.severity)
        ? authoritative.severity
        : 'normal';
      const action = authoritative.action && typeof authoritative.action === 'object'
        ? {
          id: String(authoritative.action.id || ''),
          label: String(authoritative.action.label || '')
        }
        : null;
      const tempoState = String(authoritative.tempoState || 'stable');
      const actionBoundary = String(authoritative.actionBoundary || '');
      const canSubmitIntent = authoritative.canSubmitIntent === true;
      const phase = String(authoritative.phase || view.status || sourceState && sourceState.phase || 'unknown');
      const continueSetupAction = phase === 'setup'
        && actionBoundary === 'continue_setup_action'
        && canSubmitIntent
        && (tempoState === 'opponent_setup_grace' || tempoState === 'opponent_setup_disconnected');
      const statusLine = continueSetupAction
        ? tempoState === 'opponent_setup_grace'
          ? String(authoritative.statusLine || '连接：对方重连宽限中') + ' · 仍可继续调息或确认准备'
          : String(authoritative.statusLine || '连接：对方断线') + ' · 仍可继续调息或确认准备'
        : String(authoritative.statusLine || '连接：等待权威状态');
      const detailLine = continueSetupAction
        ? '对手仍在准备阶段连接恢复中；你可以继续调息或确认准备，若未开战成功，本局会走无效局且不计正式积分。'
        : String(authoritative.detailLine || authoritative.statusLine || '连接节奏：等待权威状态');
      return {
        reportVersion: 'pvp-live-connection-tempo-v1',
        sourceVisibility: String(authoritative.sourceVisibility || 'server_authoritative_connection_state'),
        usesHiddenInformation: authoritative.usesHiddenInformation === true,
        rankedImpact: String(authoritative.rankedImpact || 'none'),
        tempoState,
        severity: safeSeverity,
        phase,
        currentSeat: String(authoritative.currentSeat || view.currentSeat || ''),
        viewerSeat: String(authoritative.viewerSeat || ''),
        opponentSeat: String(authoritative.opponentSeat || ''),
        affectedSeat: String(authoritative.affectedSeat || ''),
        statusLine,
        detailLine,
        action,
        actionBoundary,
        canSubmitIntent,
        shouldWaitForAuthority: authoritative.shouldWaitForAuthority === true,
        remainingGraceMs: Math.max(0, Math.floor(Number(authoritative.remainingGraceMs) || 0)),
        safeguards: Array.isArray(authoritative.safeguards)
          ? authoritative.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8)
          : []
      };
    }
    const report = this.getLiveConnectionReport(view);
    if (!report || !report.viewer || !report.opponent) return null;
    const phase = String(view && view.status || sourceState && sourceState.phase || '').trim();
    const currentSeat = String(view && view.currentSeat || '').trim();
    const viewerSeat = String(report.viewerSeat || report.viewer.seatId || '').trim();
    const opponentSeat = String(report.opponentSeat || report.opponent.seatId || '').trim();
    const labels = {
      online: '在线',
      grace: '重连宽限',
      disconnected: '断线'
    };
    const viewerLabel = labels[report.viewer.status] || report.viewer.status;
    const opponentLabel = labels[report.opponent.status] || report.opponent.status;
    const viewerGraceSec = Math.ceil((report.viewer.remainingGraceMs || 0) / 1000);
    const opponentGraceSec = Math.ceil((report.opponent.remainingGraceMs || 0) / 1000);
    const makeTempo = (tempoState, affectedSeat, severity, statusLine, detailLine, action = null) => ({
      reportVersion: 'pvp-live-connection-tempo-v1',
      sourceVisibility: 'public_connection_report',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      tempoState,
      severity,
      phase: phase || 'unknown',
      currentSeat,
      viewerSeat,
      opponentSeat,
      affectedSeat: String(affectedSeat || ''),
      statusLine,
      detailLine,
      action
    });
    if (report.viewer.status === 'grace') {
      return makeTempo(
        'viewer_reconnect_grace',
        viewerSeat,
        'warning',
        `连接：我方重连宽限 ${viewerGraceSec}s · 切回页面将自动恢复权威连接 · 对方${opponentLabel}`,
        '本地画面可能落后，恢复后会同步服务端权威状态；不要用旧画面判断胜负。',
        { id: 'refresh_match', label: '刷新权威状态' }
      );
    }
    if (report.viewer.status === 'disconnected') {
      if (phase === 'setup' || phase === 'matched') {
        return makeTempo(
          'viewer_refresh_required',
          viewerSeat,
          'danger',
          `连接：我方断线 · 刷新同步权威结果；准备阶段若未开战成功，本局会成为无效局且不计正式积分 · 对方${opponentLabel}`,
          '先刷新权威局面；准备阶段断线只等待服务端无效局判定，不等同于已开战后的正式胜负结算。',
          { id: 'refresh_match', label: '刷新权威状态' }
        );
      }
      return makeTempo(
        'viewer_refresh_required',
        viewerSeat,
        'danger',
        `连接：我方断线 · 刷新同步权威结果；若仍在可恢复窗口会自动重连，否则按连接超时结算 · 对方${opponentLabel}`,
        '先刷新权威局面，避免本地旧状态覆盖真实回合。',
        { id: 'refresh_match', label: '刷新权威状态' }
      );
    }
    if (report.opponent.status === 'grace') {
      if (phase === 'active' && currentSeat && currentSeat !== opponentSeat) {
        return makeTempo(
          'opponent_non_turn_grace',
          opponentSeat,
          'info',
          `连接：我方${viewerLabel} · 对方重连宽限 ${opponentGraceSec}s · 当前行动仍可提交；轮到对手仍未恢复才会处理`,
          '对局继续：对手不在当前行动窗口，服务端不会提前宣判胜负；本方当前行动仍可提交。'
        );
      }
      if (phase === 'active' && currentSeat === opponentSeat) {
        return makeTempo(
          'opponent_action_grace',
          opponentSeat,
          'warning',
          `连接：我方${viewerLabel} · 对方重连宽限 ${opponentGraceSec}s · 对方当前行动，宽限结束才会按连接超时权威结算`,
          '胜负仍等服务端终局事件，不由前端提前判定。'
        );
      }
      return makeTempo(
        'opponent_setup_grace',
        opponentSeat,
        'warning',
        `连接：我方${viewerLabel} · 对方重连宽限 ${opponentGraceSec}s · 不会立即判负`,
        '准备阶段断线会等待权威判定；若未开战成功，本局不写正式积分。'
      );
    }
    if (report.opponent.status === 'disconnected') {
      if (phase === 'active' && currentSeat && currentSeat !== opponentSeat) {
        return makeTempo(
          'opponent_non_turn_disconnected',
          opponentSeat,
          'info',
          `连接：我方${viewerLabel} · 对方断线 · 对局继续，当前行动仍可提交；轮到对手仍未恢复才会由服务端处理`,
          '对局继续：非当前行动方断线不会立刻触发连接超时；当前行动仍可提交，轮到对手仍未恢复才会处理。'
        );
      }
      if (phase === 'active' && currentSeat === opponentSeat) {
        return makeTempo(
          'opponent_action_timeout_pending',
          opponentSeat,
          'warning',
          `连接：我方${viewerLabel} · 对方断线 · 对方当前行动，等待连接超时权威结算`,
          '只有当前行动方断线超过宽限，服务端才会发布终局；胜负以对局结束事件为准。'
        );
      }
      if (phase === 'setup' || phase === 'matched') {
        return makeTempo(
          'opponent_setup_disconnected',
          opponentSeat,
          'warning',
          `连接：我方${viewerLabel} · 对方断线 · 准备阶段等待权威无效局判定`,
          '若未开战成功，本局不计正式积分，也不会把断线方直接判成正式败局。'
        );
      }
      return makeTempo(
        'opponent_disconnected',
        opponentSeat,
        'warning',
        `连接：我方${viewerLabel} · 对方断线 · 等待权威同步`,
        '连接状态只作为公开提示，终局仍以服务端事件为准。'
      );
    }
    return makeTempo(
      'stable',
      '',
      'normal',
      `连接：我方${viewerLabel} · 对方${opponentLabel}`,
      '双方在线，按当前行动窗口继续。'
    );
  },
  formatLiveConnectionStatus(view) {
    const tempo = this.getLiveConnectionTempo(view);
    return tempo ? tempo.statusLine : '连接：等待心跳';
  },
  renderLiveConnectionTempo(view, state = null) {
    const tempo = this.getLiveConnectionTempo(view, state);
    if (!tempo) return '连接节奏：等待权威心跳';
    const actionMarkup = tempo.action && tempo.action.id === 'refresh_match'
      ? `<button class="challenge-btn secondary pvp-live-tempo-action" type="button" data-live-tempo-action="refresh-match" onclick="PVPScene.refreshLiveMatch()">${this.escapeHtml(tempo.action.label || '刷新')}</button>`
      : '';
    return `<span class="pvp-live-tempo-copy">${this.escapeHtml(tempo.detailLine || tempo.statusLine)}</span>${actionMarkup}`;
  },
  getLiveConnectionSubmitBlock(stateOrView = null) {
    const sourceState = stateOrView && stateOrView.stateView ? stateOrView : null;
    const view = sourceState ? sourceState.stateView : stateOrView;
    const tempo = this.getLiveConnectionTempo(view, sourceState);
    if (!tempo || tempo.reportVersion !== 'pvp-live-connection-tempo-v1') return null;
    if (tempo.sourceVisibility !== 'server_authoritative_connection_state') return null;
    const tempoState = String(tempo.tempoState || '');
    const actionBoundary = String(tempo.actionBoundary || '');
    const explicitBlockedStates = new Set([
      'viewer_reconnect_grace',
      'viewer_refresh_required',
      'opponent_action_grace',
      'opponent_action_timeout_pending',
      'opponent_setup_grace',
      'opponent_setup_disconnected',
      'opponent_disconnected'
    ]);
    const recoverConnection = actionBoundary === 'recover_connection';
    const waitingForAuthority = tempo.shouldWaitForAuthority === true && tempo.canSubmitIntent === false;
    const explicitCannotSubmit = tempo.canSubmitIntent === false && explicitBlockedStates.has(tempoState);
    return recoverConnection || waitingForAuthority || explicitCannotSubmit ? tempo : null;
  },
  formatLiveConnectionSubmitBlockHint(block) {
    if (!block) return '';
    const detail = String(block.detailLine || block.statusLine || '连接状态等待权威同步').trim();
    const action = block.action && block.action.id === 'refresh_match' ? '请先刷新权威状态后再操作。' : '请等待服务端权威状态后再操作。';
    return `${detail}${detail.endsWith('。') ? '' : '。'}${action}`;
  },
  blockLiveConnectionSubmit(state = null) {
    const block = this.getLiveConnectionSubmitBlock(state);
    if (!block) return false;
    this.liveInlineHint = this.formatLiveConnectionSubmitBlockHint(block);
    this.clearLiveOpeningActionConfirm();
    this.clearLiveSurrenderConfirm();
    return true;
  },
  canRecoverLiveConnectionSubmitBlock(block = null) {
    if (!block) return false;
    const tempoState = String(block.tempoState || '');
    const actionBoundary = String(block.actionBoundary || '');
    return actionBoundary === 'recover_connection'
      || tempoState === 'viewer_reconnect_grace'
      || tempoState === 'viewer_refresh_required';
  },
  async recoverLiveConnectionSubmitBlock(state = null) {
    const block = this.getLiveConnectionSubmitBlock(state);
    if (!this.canRecoverLiveConnectionSubmitBlock(block)) return false;
    const session = this.getLiveSession();
    const sourceState = state || (session && typeof session.getState === 'function' ? session.getState() : null);
    if (!session || !sourceState || !sourceState.matchId || !this.shouldLiveHeartbeat(sourceState.phase)) return false;
    this.liveInlineHint = '正在恢复权威连接...';
    let heartbeatResult = null;
    try {
      heartbeatResult = await this.sendLiveHeartbeat({ resumeRealtime: true });
    } catch (error) {
      console.warn('[PVP Live] connection recovery heartbeat failed', error);
    }
    let nextState = typeof session.getState === 'function' ? session.getState() : null;
    if (heartbeatResult && heartbeatResult.transport !== 'http' && this.getLiveConnectionSubmitBlock(nextState) && typeof session.heartbeat === 'function') {
      try {
        await session.heartbeat();
      } catch (error) {
        console.warn('[PVP Live] connection recovery HTTP heartbeat failed', error);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 120));
    try {
      if (typeof session.refreshMatch === 'function') {
        await session.refreshMatch();
      }
    } catch (error) {
      console.warn('[PVP Live] connection recovery refresh failed', error);
    }
    nextState = typeof session.getState === 'function' ? session.getState() : null;
    return !this.getLiveConnectionSubmitBlock(nextState);
  },
  async ensureLiveConnectionReadyForSubmit(state = null) {
    if (!this.getLiveConnectionSubmitBlock(state)) return true;
    if (await this.recoverLiveConnectionSubmitBlock(state)) return true;
    const session = this.getLiveSession();
    const nextState = session && typeof session.getState === 'function' ? session.getState() : state;
    return !this.blockLiveConnectionSubmit(nextState);
  },
  getLiveRealtimeReport(state) {
    const report = state && state.realtimeReport && typeof state.realtimeReport === 'object' ? state.realtimeReport : null;
    if (!report) return null;
    const result = { ...report };
    if (Object.prototype.hasOwnProperty.call(report, 'connectionId')) {
      result.connectionId = String(report.connectionId || '');
    }
    if (Object.prototype.hasOwnProperty.call(report, 'heartbeatIntervalMs')) {
      result.heartbeatIntervalMs = Math.max(0, Math.floor(Number(report.heartbeatIntervalMs) || 0));
    }
    return result;
  },
  formatLiveRealtimeStatus(state) {
    const status = String(state && state.realtimeStatus || 'idle');
    const labels = {
      idle: '等待实时通道',
      unavailable: '实时通道不可用，使用 HTTP 心跳',
      connecting: '正在连接实时通道',
      connected: '实时通道已连接',
      reconnecting: '实时通道正在重连',
      closed: '实时通道已关闭',
      error: '实时通道异常'
    };
    const label = labels[status] || status;
    const lastSyncAt = Math.max(0, Math.floor(Number(state && state.lastRealtimeSyncAt) || 0));
    const syncText = lastSyncAt > 0 ? ` · 最近同步 ${new Date(lastSyncAt).toLocaleTimeString()}` : '';
    const reason = String(state && state.lastError && state.lastError.reason || '');
    const reasonText = reason && (status === 'reconnecting' || status === 'error' || status === 'unavailable') ? ` · ${reason}` : '';
    return `传输：${label}${syncText}${reasonText}`;
  },
  getLiveOpeningSafeguardReport(view) {
    const report = view && view.openingSafeguardReport && typeof view.openingSafeguardReport === 'object' ? view.openingSafeguardReport : null;
    if (!report) return null;
    const damageBudget = report.damageBudget && typeof report.damageBudget === 'object' ? report.damageBudget : {};
    const protection = report.openingProtection && typeof report.openingProtection === 'object' ? report.openingProtection : {};
    const secondSeatBuffer = report.secondSeatBuffer && typeof report.secondSeatBuffer === 'object' ? report.secondSeatBuffer : {};
    const counterplay = report.counterplay && typeof report.counterplay === 'object' ? report.counterplay : {};
    const secondSeatBufferBlock = Math.max(0, Math.floor(Number(secondSeatBuffer.block) || 0));
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-opening-safeguard-v1'),
      status: String(report.status || ''),
      currentSeat: String(report.currentSeat || damageBudget.currentSeat || ''),
      viewerSeat: String(report.viewerSeat || ''),
      firstSeat: String(report.firstSeat || ''),
      secondSeat: String(report.secondSeat || ''),
      damageBudget: {
        firstSeat: Math.max(0, Math.floor(Number(damageBudget.firstSeat) || 0)),
        secondSeat: Math.max(0, Math.floor(Number(damageBudget.secondSeat) || 0)),
        secondAction: Math.max(0, Math.floor(Number(damageBudget.secondAction) || 0)),
        currentSeat: String(damageBudget.currentSeat || report.currentSeat || ''),
        currentActionBudget: damageBudget.currentActionBudget === null || damageBudget.currentActionBudget === undefined
          ? null
          : Math.max(0, Math.floor(Number(damageBudget.currentActionBudget) || 0))
      },
      openingProtection: {
        minimumHp: Math.max(0, Math.floor(Number(protection.minimumHp) || 0)),
        protectedSeats: Array.isArray(protection.protectedSeats)
          ? protection.protectedSeats.map(item => String(item || '')).filter(item => item === 'A' || item === 'B').slice(0, 2)
          : [],
        active: !!protection.active,
        summary: String(protection.summary || '')
      },
      secondSeatBuffer: {
        block: secondSeatBufferBlock,
        seatId: String(secondSeatBuffer.seatId || report.secondSeat || ''),
        active: secondSeatBuffer.active === undefined ? secondSeatBufferBlock > 0 : !!secondSeatBuffer.active,
        summary: String(secondSeatBuffer.summary || '')
      },
      counterplay: {
        block: Math.max(0, Math.floor(Number(counterplay.block) || 0)),
        pendingSeats: Array.isArray(counterplay.pendingSeats)
          ? counterplay.pendingSeats.map(item => String(item || '')).filter(item => item === 'A' || item === 'B').slice(0, 2)
          : [],
        grantedSeats: Array.isArray(counterplay.grantedSeats)
          ? counterplay.grantedSeats.map(item => String(item || '')).filter(item => item === 'A' || item === 'B').slice(0, 2)
          : [],
        summary: String(counterplay.summary || '')
      },
      sourceVisibility: String(report.sourceVisibility || 'public_state'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none')
    };
  },
  getLiveOpenerAssignment(view) {
    const report = view && view.openerAssignment && typeof view.openerAssignment === 'object' ? view.openerAssignment : null;
    if (!report) return null;
    const firstSeat = report.firstSeat === 'B' ? 'B' : 'A';
    const secondSeat = firstSeat === 'A' ? 'B' : 'A';
    const viewerSeat = report.viewerSeat === 'B' ? 'B' : 'A';
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-opener-assignment-v1'),
      sourceVisibility: String(report.sourceVisibility || 'server_authoritative_public_seed'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      firstSeat,
      secondSeat,
      viewerSeat,
      opponentSeat: viewerSeat === 'A' ? 'B' : 'A',
      viewerStarts: viewerSeat === firstSeat,
      policy: String(report.policy || 'server_seeded_fair_opener'),
      seedTag: String(report.seedTag || '').slice(0, 24),
      queueOrderBinding: report.queueOrderBinding === true,
      hostBinding: report.hostBinding === true,
      boundaryLine: String(report.boundaryLine || '先后手由服务端公开种子分配，不绑定排队顺序或房主身份。')
    };
  },
  renderLiveOpeningSafeguardReport(view) {
    const report = this.getLiveOpeningSafeguardReport(view);
    if (!report) return '公平保护：等待权威状态';
    const opener = this.getLiveOpenerAssignment(view);
    const openerFirstSeat = opener && (opener.firstSeat === 'A' || opener.firstSeat === 'B') ? opener.firstSeat : report.firstSeat;
    const openerViewerSeat = opener && (opener.viewerSeat === 'A' || opener.viewerSeat === 'B') ? opener.viewerSeat : report.viewerSeat;
    const openerPerspective = openerFirstSeat && openerViewerSeat
      ? openerFirstSeat === openerViewerSeat ? '我方先手' : '对方先手'
      : '先手待同步';
    const openerBoundary = opener
      ? `${openerPerspective} · 服务端种子 · 不绑定排队/不绑定房主`
      : `${openerPerspective} · 等待服务端分配`;
    const currentSeat = report.damageBudget.currentSeat || report.currentSeat || '--';
    const currentBudget = report.damageBudget.currentActionBudget;
    const currentBudgetText = currentBudget === null
      ? `当前 ${currentSeat}：准备后生效`
      : `当前 ${currentSeat}：${currentBudget}`;
    const protectedSeats = report.openingProtection.protectedSeats.length
      ? report.openingProtection.protectedSeats.join('/')
      : '无';
    const protectionText = report.openingProtection.active
      ? `保护 ${protectedSeats} · 保底 ${report.openingProtection.minimumHp} 血`
      : '已完成首轮保护窗口';
    const secondSeatBufferSeat = report.secondSeatBuffer.seatId || report.secondSeat || '--';
    const secondSeatBufferText = report.secondSeatBuffer.block > 0
      ? `${secondSeatBufferSeat} +${report.secondSeatBuffer.block} · 公开规则`
      : '未启用';
    const counterplaySeats = report.counterplay.pendingSeats.length
      ? `待发放 ${report.counterplay.pendingSeats.join('/')}`
      : report.counterplay.grantedSeats.length ? `已发放 ${report.counterplay.grantedSeats.join('/')}` : '待触发';
    return `
      <span class="pvp-live-opening-safeguard-chip" data-live-opener-assignment>${this.escapeHtml(openerBoundary)}</span>
      <span class="pvp-live-opening-safeguard-chip" data-live-opening-budget>首动预算 · ${this.escapeHtml(currentBudgetText)}</span>
      <span class="pvp-live-opening-safeguard-chip" data-live-opening-budget-line>先手 ${this.escapeHtml(report.firstSeat || 'A')} ${report.damageBudget.firstSeat} / 后手 ${this.escapeHtml(report.secondSeat || 'B')} ${report.damageBudget.secondSeat}</span>
      <span class="pvp-live-opening-safeguard-chip" data-live-opening-second-seat-buffer>后手护盾 · ${this.escapeHtml(secondSeatBufferText)}</span>
      <span class="pvp-live-opening-safeguard-chip" data-live-opening-protection aria-label="开局护体防先手秒杀">${this.escapeHtml(`防先手秒杀 · 开局护体 · ${protectionText}`)}</span>
      <span class="pvp-live-opening-safeguard-chip" data-live-opening-counterplay aria-label="后手行动窗口反打缓冲">${this.escapeHtml(`后手行动窗口 · 反打缓冲 · 护盾 ${report.counterplay.block} · ${counterplaySeats}`)}</span>
    `;
  },
  getLiveActionPreviewReport(view) {
    const report = view && view.actionPreviewReport && typeof view.actionPreviewReport === 'object'
      ? view.actionPreviewReport
      : null;
    if (!report) return null;
    const playableCards = Array.isArray(report.playableCards) ? report.playableCards : [];
    const endTurn = report.endTurn && typeof report.endTurn === 'object' ? report.endTurn : null;
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-action-preview-v1'),
      sourceVisibility: String(report.sourceVisibility || 'viewer_public_state'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      viewerSeat: String(report.viewerSeat || ''),
      currentSeat: String(report.currentSeat || ''),
      isViewerTurn: !!report.isViewerTurn,
      status: String(report.status || ''),
      playableCards: playableCards.map(card => {
        const protection = card && card.openingProtection && typeof card.openingProtection === 'object'
          ? card.openingProtection
          : {};
        const publicStatusMitigation = card && card.publicStatusMitigation && typeof card.publicStatusMitigation === 'object'
          ? card.publicStatusMitigation
          : null;
        const cardDraw = card && card.cardDraw && typeof card.cardDraw === 'object'
          ? card.cardDraw
          : null;
        return {
          cardInstanceId: String(card && card.cardInstanceId || ''),
          cardName: String(card && card.cardName || '术式'),
          targetSeat: String(card && card.targetSeat || ''),
          cost: Math.max(0, Math.floor(Number(card && card.cost) || 0)),
          energyAfter: Math.max(0, Math.floor(Number(card && card.energyAfter) || 0)),
          rawDamage: Math.max(0, Math.floor(Number(card && card.rawDamage) || 0)),
          damageBudget: card && card.damageBudget === null || card && card.damageBudget === undefined
            ? null
            : Math.max(0, Math.floor(Number(card && card.damageBudget) || 0)),
          budgetedDamage: Math.max(0, Math.floor(Number(card && card.budgetedDamage) || 0)),
          preventedByBudget: Math.max(0, Math.floor(Number(card && card.preventedByBudget) || 0)),
          blockedDamage: Math.max(0, Math.floor(Number(card && card.blockedDamage) || 0)),
          hpDamage: Math.max(0, Math.floor(Number(card && card.hpDamage) || 0)),
          targetHpBefore: Math.max(0, Math.floor(Number(card && card.targetHpBefore) || 0)),
          targetHpAfter: Math.max(0, Math.floor(Number(card && card.targetHpAfter) || 0)),
          wouldHaveHp: Math.max(0, Math.floor(Number(card && card.wouldHaveHp) || 0)),
          openingProtection: {
            willTrigger: protection.willTrigger === true,
            minimumHp: Math.max(0, Math.floor(Number(protection.minimumHp) || 0)),
            preventedDamage: Math.max(0, Math.floor(Number(protection.preventedDamage) || 0))
          },
          blockGain: Math.max(0, Math.floor(Number(card && card.blockGain) || 0)),
          selfBlockAfter: Math.max(0, Math.floor(Number(card && card.selfBlockAfter) || 0)),
          healing: card && card.healing && typeof card.healing === 'object' ? {
            amount: Math.max(0, Math.floor(Number(card.healing.amount) || 0)),
            recoveredHp: Math.max(0, Math.floor(Number(card.healing.recoveredHp) || 0)),
            hpBefore: Math.max(0, Math.floor(Number(card.healing.hpBefore) || 0)),
            hpAfter: Math.max(0, Math.floor(Number(card.healing.hpAfter) || 0)),
            maxHp: Math.max(0, Math.floor(Number(card.healing.maxHp) || 0)),
            capped: card.healing.capped === true
          } : null,
          publicStatusMitigation: publicStatusMitigation ? {
            statusId: String(publicStatusMitigation.statusId || ''),
            label: String(publicStatusMitigation.label || ''),
            seatId: String(publicStatusMitigation.seatId || ''),
            sourceSeat: String(publicStatusMitigation.sourceSeat || ''),
            responseWindow: String(publicStatusMitigation.responseWindow || ''),
            mitigation: String(publicStatusMitigation.mitigation || '')
          } : null,
          cardDraw: cardDraw ? {
            count: Math.max(0, Math.floor(Number(cardDraw.count) || 0)),
            capped: cardDraw.capped === true
          } : null,
          summaryLine: String(card && card.summaryLine || ''),
          safeguards: Array.isArray(card && card.safeguards)
            ? card.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8)
            : []
        };
      }).filter(card => card.cardInstanceId),
      endTurn: endTurn ? {
        nextSeat: String(endTurn.nextSeat || ''),
        willGrantCounterplay: endTurn.willGrantCounterplay === true,
        counterplayBlock: Math.max(0, Math.floor(Number(endTurn.counterplayBlock) || 0)),
        summaryLine: String(endTurn.summaryLine || '')
      } : null
    };
  },
  getLiveCardActionPreview(view, cardInstanceId = '') {
    const report = this.getLiveActionPreviewReport(view);
    const targetId = String(cardInstanceId || '');
    if (!report || !targetId) return null;
    return report.playableCards.find(card => card.cardInstanceId === targetId) || null;
  },
  formatLiveActionPreviewLine(preview) {
    if (!preview) return '';
    if (preview.summaryLine) return preview.summaryLine;
    const targetSeat = preview.targetSeat || '目标';
    const protectionText = preview.openingProtection && preview.openingProtection.willTrigger
      ? `；护体触发，保底 ${preview.openingProtection.minimumHp} 血，挡下 ${preview.openingProtection.preventedDamage}`
      : '';
    const blockText = preview.blockGain > 0 ? `；自身获得 ${preview.blockGain} 护盾` : '';
    const healText = preview.healing
      ? preview.healing.recoveredHp > 0
        ? `；自身恢复 ${preview.healing.recoveredHp}，预计 ${preview.healing.hpAfter}/${preview.healing.maxHp}`
        : '；生命已满，恢复封顶'
      : '';
    return `${preview.cardName || '术式'}：预算后 ${preview.budgetedDamage}，破盾 ${preview.blockedDamage}，生命伤害 ${preview.hpDamage}，${targetSeat} 预计 ${preview.targetHpAfter} 血${protectionText}${blockText}${healText}。`;
  },
  formatLiveStatusMitigationLine(preview) {
    const mitigation = preview && preview.publicStatusMitigation && typeof preview.publicStatusMitigation === 'object'
      ? preview.publicStatusMitigation
      : null;
    if (!mitigation) return '';
    const label = mitigation.label || '公开状态';
    const action = mitigation.mitigation === 'cleared' ? `清除${label}` : `处理${label}`;
    return `响应牌 · ${action}`;
  },
  renderLiveCardActionPreview(view, cardInstanceId = '', phase = '') {
    if (String(phase || '') !== 'active') return '';
    const report = this.getLiveActionPreviewReport(view);
    if (!report || report.usesHiddenInformation || report.rankedImpact !== 'none' || !report.isViewerTurn) return '';
    if (report.viewerSeat && report.currentSeat && report.viewerSeat !== report.currentSeat) return '';
    const preview = this.getLiveCardActionPreview({ actionPreviewReport: report }, cardInstanceId);
    const previewLine = this.formatLiveActionPreviewLine(preview);
    if (!previewLine) return '';
    const mitigation = preview && preview.publicStatusMitigation ? preview.publicStatusMitigation : null;
    const mitigationLine = this.formatLiveStatusMitigationLine(preview);
    const mitigationAttrs = mitigation
      ? ` data-live-card-status-mitigation="${this.escapeHtml(mitigation.statusId || '')}" data-live-card-status-response-window="${this.escapeHtml(mitigation.responseWindow || '')}"`
      : '';
    return `
              <span
                class="pvp-live-card-preview${mitigation ? ' has-status-mitigation' : ''}"
                data-live-card-preview
                data-live-card-preview-source="${this.escapeHtml(report.sourceVisibility)}"
                data-live-card-preview-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
                data-live-card-preview-impact="${this.escapeHtml(report.rankedImpact)}"
                ${mitigationAttrs}
              >${mitigationLine ? `<span class="pvp-live-card-response-chip" data-live-card-response-chip>${this.escapeHtml(mitigationLine)}</span> ` : ''}${this.escapeHtml(previewLine)}</span>
            `;
  },
  getLiveActionReceiptReport(view) {
    const report = view && view.actionReceiptReport && typeof view.actionReceiptReport === 'object'
      ? view.actionReceiptReport
      : null;
    if (!report) return null;
    const damage = report.damage && typeof report.damage === 'object' ? report.damage : {};
    const protection = report.openingProtection && typeof report.openingProtection === 'object' ? report.openingProtection : {};
    const blockGain = report.blockGain && typeof report.blockGain === 'object' ? report.blockGain : null;
    const statusEffects = report.statusEffects && typeof report.statusEffects === 'object' ? report.statusEffects : {};
    const healing = report.healing && typeof report.healing === 'object' ? report.healing : null;
    const cardDraw = report.cardDraw && typeof report.cardDraw === 'object' ? report.cardDraw : null;
    const draw = report.draw && typeof report.draw === 'object' ? report.draw : {};
    const counterplay = report.counterplay && typeof report.counterplay === 'object' ? report.counterplay : {};
    const handoffRisk = report.handoffRisk && typeof report.handoffRisk === 'object' ? report.handoffRisk : null;
    const normalizeStatusEffect = (status = {}) => ({
      statusId: String(status.statusId || ''),
      label: String(status.label || ''),
      seatId: String(status.seatId || ''),
      sourceSeat: String(status.sourceSeat || ''),
      mitigatedBySeat: String(status.mitigatedBySeat || ''),
      damageBonus: Math.max(0, Math.floor(Number(status.damageBonus) || 0)),
      mitigationAmount: Math.max(0, Math.floor(Number(status.mitigationAmount) || 0)),
      preventedDamage: Math.max(0, Math.floor(Number(status.preventedDamage) || 0)),
      mitigatedTurnIndex: Math.max(0, Math.floor(Number(status.mitigatedTurnIndex) || 0)),
      consumedTurnIndex: Math.max(0, Math.floor(Number(status.consumedTurnIndex) || 0)),
      responseWindow: String(status.responseWindow || ''),
      mitigation: String(status.mitigation || '')
    });
    const normalizeHandoffRiskStatus = (status = {}) => ({
      statusId: String(status.statusId || ''),
      label: String(status.label || ''),
      seatId: String(status.seatId || ''),
      sourceSeat: String(status.sourceSeat || ''),
      responseWindow: String(status.responseWindow || ''),
      earliestConsumeTurnIndex: Math.max(0, Math.floor(Number(status.earliestConsumeTurnIndex) || 0)),
      expiresAtTurnIndex: Math.max(0, Math.floor(Number(status.expiresAtTurnIndex) || 0))
    });
    const hasFiniteCountValue = (value) => {
      if (typeof value === 'number') return Number.isFinite(value);
      if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value));
      return false;
    };
    const rawTargetHpAfter = damage.targetHpAfter;
    const hasExplicitTargetHpAfter = Object.prototype.hasOwnProperty.call(damage, 'targetHpAfter')
      && hasFiniteCountValue(rawTargetHpAfter);
    const hasTargetHpAfter = damage.hasTargetHpAfter === false
      ? false
      : hasExplicitTargetHpAfter;
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-action-receipt-v1'),
      sourceVisibility: String(report.sourceVisibility || 'authoritative_public_projection'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      viewerSeat: String(report.viewerSeat || ''),
      actingSeat: String(report.actingSeat || ''),
      actionType: String(report.actionType || ''),
      latestSequence: Number.isFinite(Number(report.latestSequence)) ? Math.floor(Number(report.latestSequence)) : null,
      cardName: String(report.cardName || ''),
      cost: Math.max(0, Math.floor(Number(report.cost) || 0)),
      remainingEnergy: Math.max(0, Math.floor(Number(report.remainingEnergy) || 0)),
      damage: {
        targetSeat: String(damage.targetSeat || ''),
        rawDamage: Math.max(0, Math.floor(Number(damage.rawDamage) || 0)),
        budgetedDamage: Math.max(0, Math.floor(Number(damage.budgetedDamage) || 0)),
        preventedByBudget: Math.max(0, Math.floor(Number(damage.preventedByBudget) || 0)),
        blockedDamage: Math.max(0, Math.floor(Number(damage.blockedDamage) || 0)),
        hpDamage: Math.max(0, Math.floor(Number(damage.hpDamage) || 0)),
        targetHpAfter: hasTargetHpAfter ? Math.max(0, Math.floor(Number(rawTargetHpAfter) || 0)) : 0,
        hasTargetHpAfter
      },
      openingProtection: {
        triggered: protection.triggered === true,
        protectedSeat: String(protection.protectedSeat || ''),
        minimumHp: Math.max(0, Math.floor(Number(protection.minimumHp) || 0)),
        preventedDamage: Math.max(0, Math.floor(Number(protection.preventedDamage) || 0)),
        wouldHaveHp: Math.max(0, Math.floor(Number(protection.wouldHaveHp) || 0))
      },
      blockGain: blockGain ? {
        seatId: String(blockGain.seatId || ''),
        block: Math.max(0, Math.floor(Number(blockGain.block) || 0)),
        totalBlock: Math.max(0, Math.floor(Number(blockGain.totalBlock) || 0))
      } : null,
      healing: healing ? {
        seatId: String(healing.seatId || ''),
        recoveredHp: Math.max(0, Math.floor(Number(healing.recoveredHp) || 0)),
        hp: Math.max(0, Math.floor(Number(healing.hp) || 0)),
        maxHp: Math.max(0, Math.floor(Number(healing.maxHp) || 0)),
        capped: healing.capped === true
      } : null,
      statusEffects: {
        applied: Array.isArray(statusEffects.applied) ? statusEffects.applied.map(normalizeStatusEffect).filter(status => status.statusId).slice(0, 3) : [],
        consumed: Array.isArray(statusEffects.consumed) ? statusEffects.consumed.map(normalizeStatusEffect).filter(status => status.statusId).slice(0, 3) : [],
        mitigated: Array.isArray(statusEffects.mitigated) ? statusEffects.mitigated.map(normalizeStatusEffect).filter(status => status.statusId).slice(0, 3) : []
      },
      cardDraw: cardDraw ? {
        seatId: String(cardDraw.seatId || ''),
        count: Math.max(0, Math.floor(Number(cardDraw.count) || 0)),
        handCount: Math.max(0, Math.floor(Number(cardDraw.handCount) || 0)),
        deckCount: Math.max(0, Math.floor(Number(cardDraw.deckCount) || 0)),
        capped: cardDraw.capped === true
      } : null,
      nextSeat: String(report.nextSeat || ''),
      completedTurns: Math.max(0, Math.floor(Number(report.completedTurns) || 0)),
      roundIndex: Math.max(0, Math.floor(Number(report.roundIndex) || 0)),
      turnIndex: Math.max(0, Math.floor(Number(report.turnIndex) || 0)),
      draw: {
        seatId: String(draw.seatId || ''),
        count: Math.max(0, Math.floor(Number(draw.count) || 0)),
        capped: draw.capped === true
      },
      counterplay: {
        granted: counterplay.granted === true,
        seatId: String(counterplay.seatId || ''),
        block: Math.max(0, Math.floor(Number(counterplay.block) || 0)),
        totalBlock: Math.max(0, Math.floor(Number(counterplay.totalBlock) || 0)),
        minimumHp: Math.max(0, Math.floor(Number(counterplay.minimumHp) || 0))
      },
      handoffRisk: handoffRisk ? {
        active: handoffRisk.active === true,
        riskState: String(handoffRisk.riskState || ''),
        seatId: String(handoffRisk.seatId || ''),
        nextSeat: String(handoffRisk.nextSeat || ''),
        statusCount: Math.max(0, Math.floor(Number(handoffRisk.statusCount) || 0)),
        statuses: Array.isArray(handoffRisk.statuses)
          ? handoffRisk.statuses.map(normalizeHandoffRiskStatus).filter(status => status.statusId).slice(0, 3)
          : [],
        summaryLine: String(handoffRisk.summaryLine || '')
      } : null,
      summaryLine: String(report.summaryLine || ''),
      safeguards: Array.isArray(report.safeguards)
        ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8)
        : []
    };
  },
  renderLiveActionReceiptReport(view) {
    const report = this.getLiveActionReceiptReport(view);
    if (!report) return '行动回执：等待首个权威行动';
    const summary = report.summaryLine || (report.actionType === 'end_turn'
      ? `${report.actingSeat || '--'} 结束回合：行动权交给 ${report.nextSeat || '--'}。`
      : `${report.actingSeat || '--'} 已完成行动。`);
    const receiptLabel = report.actionType === 'end_turn' ? '交权回执' : '行动回执';
    const source = report.sourceVisibility === 'authoritative_public_projection'
      ? '权威公开投影'
      : report.sourceVisibility === 'public_events' ? '公开事件' : report.sourceVisibility;
    const hidden = report.usesHiddenInformation ? '含隐藏信息' : '不含隐藏信息';
    const budgetClampChip = !report.usesHiddenInformation && report.damage && report.damage.preventedByBudget > 0
      ? `<span class="pvp-live-action-receipt-chip" data-live-action-budget-clamp="public_first_action_budget">${this.escapeHtml(`首动预算挡下 ${report.damage.preventedByBudget}`)}</span>`
      : '';
    const openingProtectionChip = !report.usesHiddenInformation
      && report.openingProtection
      && report.openingProtection.triggered
      && report.openingProtection.preventedDamage > 0
      ? `<span class="pvp-live-action-receipt-chip" data-live-action-opening-protection="public_opening_protection">${this.escapeHtml(`开局护体保底 ${report.openingProtection.minimumHp || 1} 血 · 挡下 ${report.openingProtection.preventedDamage}`)}</span>`
      : '';
    const survivalChip = !report.usesHiddenInformation
      && report.actionType === 'play_card'
      && report.damage
      && report.damage.hpDamage > 0
      && report.damage.targetSeat
      && report.damage.targetHpAfter > 0
      ? `<span
          class="pvp-live-action-receipt-chip"
          data-live-action-survival="public_damage_survival"
          data-live-action-survival-target="${this.escapeHtml(report.damage.targetSeat || '')}"
          data-live-action-survival-hp-after="${this.escapeHtml(String(report.damage.targetHpAfter || 0))}"
          data-live-action-survival-source="${this.escapeHtml(report.sourceVisibility || '')}"
          data-live-action-survival-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
          data-live-action-survival-impact="${this.escapeHtml(report.rankedImpact || 'none')}"
        >${this.escapeHtml(`承伤回执 · ${report.damage.targetSeat} 剩余 ${report.damage.targetHpAfter} 血，对局继续`)}</span>`
      : '';
    const terminalDamageChip = !report.usesHiddenInformation
      && report.actionType === 'play_card'
      && report.damage
      && report.damage.hpDamage > 0
      && report.damage.targetSeat
      && report.damage.hasTargetHpAfter
      && report.damage.targetHpAfter <= 0
      ? `<span
          class="pvp-live-action-receipt-chip"
          data-live-action-terminal="public_terminal_damage"
          data-live-action-terminal-target="${this.escapeHtml(report.damage.targetSeat || '')}"
          data-live-action-terminal-hp-after="${this.escapeHtml(String(report.damage.targetHpAfter || 0))}"
          data-live-action-terminal-source="${this.escapeHtml(report.sourceVisibility || '')}"
          data-live-action-terminal-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
          data-live-action-terminal-impact="${this.escapeHtml(report.rankedImpact || 'none')}"
        >${this.escapeHtml(`终局回执 · ${report.damage.targetSeat} 归零，公开伤害结算结束本局`)}</span>`
      : '';
    const handoffDrawCount = report.draw ? Math.max(0, Math.floor(Number(report.draw.count) || 0)) : 0;
    const handoffCounterplayBlock = report.counterplay && report.counterplay.granted
      ? Math.max(0, Math.floor(Number(report.counterplay.block) || 0))
      : 0;
    const handoffResourceLine = [
      handoffDrawCount > 0 ? `抽 ${handoffDrawCount}` : '',
      handoffCounterplayBlock > 0 ? `反打缓冲 +${handoffCounterplayBlock}` : ''
    ].filter(Boolean).join('，');
    const turnHandoffChip = !report.usesHiddenInformation
      && report.actionType === 'end_turn'
      && report.nextSeat
      ? `<span
          class="pvp-live-action-receipt-chip"
          data-live-action-turn-handoff="public_turn_handoff"
          data-live-action-turn-handoff-next-seat="${this.escapeHtml(report.nextSeat || '')}"
          data-live-action-turn-handoff-draw-count="${this.escapeHtml(String(handoffDrawCount))}"
          data-live-action-turn-handoff-counterplay-block="${this.escapeHtml(String(handoffCounterplayBlock))}"
          data-live-action-turn-handoff-source="${this.escapeHtml(report.sourceVisibility || '')}"
          data-live-action-turn-handoff-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
          data-live-action-turn-handoff-impact="${this.escapeHtml(report.rankedImpact || 'none')}"
        >${this.escapeHtml(`接手回执 · ${report.nextSeat} 接手${handoffResourceLine ? `，${handoffResourceLine}` : ''}`)}</span>`
      : '';
    const consumedStatuses = report.statusEffects && Array.isArray(report.statusEffects.consumed)
      ? report.statusEffects.consumed.filter(status => status && status.statusId)
      : [];
    const statusPayoffChip = consumedStatuses.map((status) => {
      const bonus = Math.max(0, Math.floor(Number(status.damageBonus) || 0));
      const label = status.label || '公开状态';
      const payoffText = bonus > 0
        ? `公开兑现 · ${label} +${bonus} 额外伤害`
        : `公开兑现 · ${label}`;
      return `<span
          class="pvp-live-action-receipt-chip"
          data-live-action-status-payoff="${this.escapeHtml(status.statusId || '')}"
          data-live-action-status-payoff-state="public_status_consumed"
          data-live-action-status-payoff-source="${this.escapeHtml(report.sourceVisibility || '')}"
          data-live-action-status-payoff-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
          data-live-action-status-payoff-impact="${this.escapeHtml(report.rankedImpact || 'none')}"
          data-live-action-status-payoff-bonus="${this.escapeHtml(String(bonus))}"
          data-live-action-status-payoff-safeguard="public_status_consumed"
        >${this.escapeHtml(payoffText)}</span>`;
    }).join('');
    const mitigatedStatuses = report.statusEffects && Array.isArray(report.statusEffects.mitigated)
      ? report.statusEffects.mitigated.filter(status => status && status.statusId)
      : [];
    const mitigationChip = !report.usesHiddenInformation
      ? mitigatedStatuses.map((status) => {
        const label = status.label || '公开状态';
        const targetSeat = status.seatId || '';
        const mitigatingSeat = status.mitigatedBySeat || report.actingSeat || '';
        const preventedDamage = Math.max(0, Math.floor(Number(status.preventedDamage) || 0));
        let mitigationText = `稳住回执 · ${mitigatingSeat ? `${mitigatingSeat} ` : ''}稳住${label}，阻止后续兑现`;
        if (status.statusId === 'guard_stance' || status.mitigation === 'guard_stance_damage_reduction') {
          mitigationText = `稳住回执 · ${targetSeat || mitigatingSeat || '目标'} 守势减伤 ${preventedDamage}`;
        } else if (status.statusId === 'weak_focus' || status.mitigation === 'public_weak_damage_reduction') {
          mitigationText = `稳住回执 · ${targetSeat || '目标'} 虚弱削减 ${preventedDamage}`;
        }
        return `<span
          class="pvp-live-action-receipt-chip"
          data-live-public-status-mitigation="public_status_mitigated"
          data-live-action-status-mitigation="${this.escapeHtml(status.statusId || '')}"
          data-live-action-status-mitigation-state="public_status_mitigated"
          data-live-action-status-mitigation-target="${this.escapeHtml(targetSeat)}"
          data-live-action-status-mitigation-by="${this.escapeHtml(mitigatingSeat)}"
          data-live-action-status-mitigation-response-window="${this.escapeHtml(status.responseWindow || '')}"
          data-live-action-status-mitigation-prevented="${this.escapeHtml(String(preventedDamage))}"
          data-live-action-status-mitigation-type="${this.escapeHtml(status.mitigation || '')}"
          data-live-action-status-mitigation-source="${this.escapeHtml(report.sourceVisibility || '')}"
          data-live-action-status-mitigation-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
          data-live-action-status-mitigation-impact="${this.escapeHtml(report.rankedImpact || 'none')}"
          data-live-action-status-mitigation-safeguard="public_status_mitigated"
        >${this.escapeHtml(mitigationText)}</span>`;
      }).join('')
      : '';
    const guardStanceStatus = report.statusEffects && (
      (Array.isArray(report.statusEffects.applied) && report.statusEffects.applied.some(status => status.statusId === 'guard_stance'))
      || (Array.isArray(report.statusEffects.mitigated) && report.statusEffects.mitigated.some(status => status.statusId === 'guard_stance'))
    );
    const guardStanceChip = guardStanceStatus
      ? '<span class="pvp-live-action-receipt-chip" data-live-guard-stance="public_guard_stance">公开守势</span>'
      : '';
    const weakFocusStatus = report.statusEffects && (
      (Array.isArray(report.statusEffects.applied) && report.statusEffects.applied.some(status => status.statusId === 'weak_focus'))
      || (Array.isArray(report.statusEffects.mitigated) && report.statusEffects.mitigated.some(status => status.statusId === 'weak_focus'))
    );
    const weakFocusChip = weakFocusStatus
      ? '<span class="pvp-live-action-receipt-chip" data-live-weak-focus="public_weak_focus">公开虚弱</span>'
      : '';
    const healingChip = report.healing
      ? `<span class="pvp-live-action-receipt-chip" data-live-hp-recovered="public_hp_recovered">${this.escapeHtml(report.healing.recoveredHp > 0 ? `恢复 +${report.healing.recoveredHp}` : '恢复封顶')}</span>`
      : '';
    const cardDrawChip = report.cardDraw
      ? `<span class="pvp-live-action-receipt-chip" data-live-card-cycle="public_card_cycle">${this.escapeHtml(report.cardDraw.capped ? '抽滤已满' : report.cardDraw.count > 0 ? `抽滤 +${report.cardDraw.count}` : '抽滤暂停')}</span>`
      : '';
    const handoffRisk = report.handoffRisk && report.handoffRisk.active ? report.handoffRisk : null;
    const handoffRiskText = handoffRisk
      ? handoffRisk.summaryLine || `${handoffRisk.seatId || report.actingSeat || '--'} 结束回合后仍有公开状态风险；行动权交给 ${handoffRisk.nextSeat || report.nextSeat || '--'}。`
      : '';
    const handoffRiskChip = handoffRisk
      ? `<span
          class="pvp-live-action-receipt-chip"
          data-live-action-handoff-risk="${this.escapeHtml(handoffRisk.riskState || 'status_response_handoff')}"
          data-live-action-handoff-risk-state="${this.escapeHtml(handoffRisk.riskState || '')}"
          data-live-action-handoff-risk-source="${this.escapeHtml(report.sourceVisibility || '')}"
          data-live-action-handoff-risk-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
          data-live-action-handoff-risk-impact="${this.escapeHtml(report.rankedImpact || 'none')}"
          data-live-action-handoff-risk-status-count="${this.escapeHtml(String(handoffRisk.statusCount || handoffRisk.statuses.length || 0))}"
          data-live-action-handoff-risk-safeguard="public_status_handoff_risk"
        >${this.escapeHtml(`交权风险 · ${handoffRiskText}`)}</span>`
      : '';
    return `
      <span class="pvp-live-action-receipt-chip">${this.escapeHtml(receiptLabel)}</span>
      <span class="pvp-live-action-receipt-line">${this.escapeHtml(summary)}</span>
      ${budgetClampChip}
      ${openingProtectionChip}
      ${survivalChip}
      ${terminalDamageChip}
      ${turnHandoffChip}
      ${statusPayoffChip}
      ${mitigationChip}
      ${guardStanceChip}
      ${weakFocusChip}
      ${healingChip}
      ${cardDrawChip}
      ${handoffRiskChip}
      <span class="pvp-live-action-receipt-chip">${this.escapeHtml(source)} · ${this.escapeHtml(hidden)} · ${this.escapeHtml(report.rankedImpact || 'none')}</span>
    `;
  },
  getLiveDuelMomentumReport(view) {
    const report = view && view.duelMomentumReport && typeof view.duelMomentumReport === 'object'
      ? view.duelMomentumReport
      : null;
    if (!report) return null;
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-duel-momentum-v1'),
      sourceVisibility: String(report.sourceVisibility || 'public_state'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      viewerSeat: String(report.viewerSeat || ''),
      opponentSeat: String(report.opponentSeat || ''),
      currentSeat: String(report.currentSeat || ''),
      isViewerTurn: !!report.isViewerTurn,
      viewerHpPct: Math.max(0, Math.min(100, Math.floor(Number(report.viewerHpPct) || 0))),
      opponentHpPct: Math.max(0, Math.min(100, Math.floor(Number(report.opponentHpPct) || 0))),
      hpDelta: Math.floor(Number(report.hpDelta) || 0),
      pressureState: String(report.pressureState || 'unknown'),
      pressureLabel: String(report.pressureLabel || '局势观察'),
      agencyLabel: String(report.agencyLabel || ''),
      summaryLine: String(report.summaryLine || '局势：等待权威状态。'),
      counterplayLine: String(report.counterplayLine || '行动窗口：等待权威状态。'),
      safeguards: Array.isArray(report.safeguards)
        ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8)
        : []
    };
  },
  renderLiveDuelMomentumReport(view) {
    const report = this.getLiveDuelMomentumReport(view);
    if (!report) return '局势：等待权威状态';
    const visibilityText = report.usesHiddenInformation ? '含隐藏信息' : '公开状态';
    const rankedText = report.rankedImpact === 'none' ? '不写正式积分' : report.rankedImpact;
    const hpText = `血线 ${report.viewerSeat || '--'} ${report.viewerHpPct}% / ${report.opponentSeat || '--'} ${report.opponentHpPct}%`;
    return `
      <div class="pvp-live-duel-momentum-line">
        <span class="pvp-live-duel-momentum-chip">${this.escapeHtml(report.pressureLabel)}</span>
        <span>${this.escapeHtml(report.summaryLine)}</span>
      </div>
      <div class="pvp-live-duel-momentum-line">
        <span class="pvp-live-duel-momentum-chip">${this.escapeHtml(report.agencyLabel || '行动窗口')}</span>
        <span>${this.escapeHtml(report.counterplayLine)}</span>
      </div>
      <div class="pvp-live-duel-momentum-line compact">
        <span>${this.escapeHtml(hpText)}</span>
        <span>${this.escapeHtml(visibilityText)} · ${this.escapeHtml(rankedText)}</span>
      </div>
    `;
  },
  getLiveIntentSignalReport(view) {
    const report = view && view.intentSignalReport && typeof view.intentSignalReport === 'object'
      ? view.intentSignalReport
      : null;
    if (!report) return null;
    const threat = report.threat && typeof report.threat === 'object' ? report.threat : {};
    const responseWindow = report.responseWindow && typeof report.responseWindow === 'object' ? report.responseWindow : {};
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-intent-signal-v1'),
      sourceVisibility: String(report.sourceVisibility || 'public_state_and_public_content'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      viewerSeat: String(report.viewerSeat || ''),
      opponentSeat: String(report.opponentSeat || ''),
      currentSeat: String(report.currentSeat || ''),
      isViewerTurn: !!report.isViewerTurn,
      signalState: String(report.signalState || 'closed'),
      signalLabel: String(report.signalLabel || '读牌观察'),
      intentLine: String(report.intentLine || '读牌：等待公开行动窗口。'),
      responseLine: String(report.responseLine || '反制窗口：等待权威状态。'),
      threat: {
        actorSeat: String(threat.actorSeat || ''),
        targetSeat: String(threat.targetSeat || ''),
        actorEnergy: Math.max(0, Math.floor(Number(threat.actorEnergy) || 0)),
        publicRawDamageCeiling: Math.max(0, Math.floor(Number(threat.publicRawDamageCeiling) || 0)),
        publicDamageCeiling: Math.max(0, Math.floor(Number(threat.publicDamageCeiling) || 0)),
        publicBlockCeiling: Math.max(0, Math.floor(Number(threat.publicBlockCeiling) || 0)),
        damageBudget: threat.damageBudget === null || threat.damageBudget === undefined
          ? null
          : Math.max(0, Math.floor(Number(threat.damageBudget) || 0)),
        blockedByCurrentBlock: Math.max(0, Math.floor(Number(threat.blockedByCurrentBlock) || 0)),
        targetHpBefore: Math.max(0, Math.floor(Number(threat.targetHpBefore) || 0)),
        targetHpAfter: Math.max(0, Math.floor(Number(threat.targetHpAfter) || 0)),
        targetBlock: Math.max(0, Math.floor(Number(threat.targetBlock) || 0)),
        openingProtectionWouldTrigger: threat.openingProtectionWouldTrigger === true
      },
      responseWindow: {
        defenderSeat: String(responseWindow.defenderSeat || ''),
        hasOpeningProtection: responseWindow.hasOpeningProtection === true,
        hasPendingCounterplay: responseWindow.hasPendingCounterplay === true,
        counterplayBlock: Math.max(0, Math.floor(Number(responseWindow.counterplayBlock) || 0)),
        defenderBlock: Math.max(0, Math.floor(Number(responseWindow.defenderBlock) || 0)),
        defenderHp: Math.max(0, Math.floor(Number(responseWindow.defenderHp) || 0))
      },
      safeguards: Array.isArray(report.safeguards)
        ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8)
        : []
    };
  },
  renderLiveIntentSignalReport(view) {
    const report = this.getLiveIntentSignalReport(view);
    if (!report) return '读牌：等待公开意图';
    const visibilityText = report.usesHiddenInformation ? '含隐藏信息' : '不含隐藏信息';
    const rankedText = report.rankedImpact === 'none' ? '不写正式积分' : report.rankedImpact;
    const budgetText = report.threat.damageBudget === null
      ? '无额外预算'
      : `预算 ${report.threat.damageBudget}`;
    const ceilingText = `公开上限 ${report.threat.publicDamageCeiling} / ${budgetText} / ${report.threat.targetSeat || '--'} 预计 ${report.threat.targetHpAfter} 血`;
    return `
      <div class="pvp-live-intent-signal-line">
        <span class="pvp-live-intent-signal-chip">${this.escapeHtml(report.signalLabel)}</span>
        <span>${this.escapeHtml(report.intentLine)}</span>
      </div>
      <div class="pvp-live-intent-signal-line">
        <span class="pvp-live-intent-signal-chip">反制窗口</span>
        <span>${this.escapeHtml(report.responseLine)}</span>
      </div>
      <div class="pvp-live-intent-signal-line compact">
        <span>${this.escapeHtml(ceilingText)}</span>
        <span>${this.escapeHtml(report.sourceVisibility)} · ${this.escapeHtml(visibilityText)} · ${this.escapeHtml(rankedText)}</span>
      </div>
    `;
  },
  getLiveCounterplayGuide(view, phase = '') {
    const livePhase = String(phase || '');
    const viewStatus = String(view && view.status || '');
    if (livePhase && livePhase !== 'active') return null;
    if (!livePhase && viewStatus && viewStatus !== 'active') return null;
    const actionPreview = this.getLiveActionPreviewReport(view);
    const duelMomentum = this.getLiveDuelMomentumReport(view);
    const intentSignal = this.getLiveIntentSignalReport(view);
    const safeReports = [actionPreview, duelMomentum, intentSignal].filter(Boolean);
    if (!safeReports.length) return null;
    if (safeReports.some(report => report.usesHiddenInformation || report.rankedImpact !== 'none')) return null;
    const forbiddenLineToken = /\b(?:cardInstanceId|cardId|instanceId|hand|deck|opponentHand|opponentDeck|loadoutSnapshot|reward|rating|elo|token)\b/i;
    const safeLine = value => {
      const line = String(value || '').trim();
      if (!line || forbiddenLineToken.test(line)) return '';
      return line;
    };
    const turnReports = safeReports.filter(report => report.viewerSeat || report.currentSeat || report.isViewerTurn);
    if (!turnReports.length || turnReports.some(report => report.isViewerTurn !== true)) return null;
    const viewerSeats = new Set(turnReports.map(report => report.viewerSeat).filter(Boolean));
    const currentSeats = new Set(turnReports.map(report => report.currentSeat).filter(Boolean));
    if (viewerSeats.size > 1 || currentSeats.size > 1) return null;
    const viewerSeat = viewerSeats.size ? Array.from(viewerSeats)[0] : '';
    const currentSeat = currentSeats.size ? Array.from(currentSeats)[0] : String(view && view.currentSeat || '');
    if (viewerSeat && currentSeat && viewerSeat !== currentSeat) return null;
    const supportedPressureStates = ['opening_window', 'status_response_window', 'reversal_window'];
    const pressureStates = [
      duelMomentum && duelMomentum.pressureState,
      intentSignal && intentSignal.signalState
    ].map(item => String(item || '')).filter(item => item && item !== 'idle' && item !== 'unknown');
    if (!pressureStates.length || pressureStates.some(item => !supportedPressureStates.includes(item))) return null;
    const uniquePressureStates = Array.from(new Set(pressureStates));
    if (uniquePressureStates.length !== 1) return null;
    const pressureState = uniquePressureStates[0];
    const playableCards = actionPreview && Array.isArray(actionPreview.playableCards) ? actionPreview.playableCards : [];
    const responseLabels = [];
    const addLabel = (label) => {
      const value = safeLine(label);
      if (value && !responseLabels.includes(value)) responseLabels.push(value);
    };
    playableCards.forEach(card => {
      if (card.publicStatusMitigation) {
        addLabel(card.publicStatusMitigation.mitigation === 'cleared'
          ? `清除${card.publicStatusMitigation.label || '公开状态'}`
          : `处理${card.publicStatusMitigation.label || '公开状态'}`);
      }
      if (card.blockGain > 0) addLabel(`补盾 +${card.blockGain}`);
      if (card.openingProtection && card.openingProtection.willTrigger) {
        addLabel(`护体保底 ${card.openingProtection.minimumHp || 1} 血`);
      }
    });
    const responseCardCount = playableCards.filter(card => (
      !!card.publicStatusMitigation
      || card.blockGain > 0
      || (card.openingProtection && card.openingProtection.willTrigger)
    )).length;
    if (intentSignal && intentSignal.responseWindow && intentSignal.responseWindow.counterplayBlock > 0) {
      addLabel(`反打缓冲 +${intentSignal.responseWindow.counterplayBlock}`);
    }
    const endTurnLine = actionPreview && actionPreview.endTurn && actionPreview.endTurn.summaryLine
      ? safeLine(actionPreview.endTurn.summaryLine)
      : '';
    const primaryLine = pressureState === 'status_response_window'
      ? '反制建议：先出响应牌清除破绽，再决定是否结束回合；不要直接结束回合交出反打窗口。'
      : pressureState === 'opening_window'
        ? '反制建议：当前仍有公开反制线，先读首动预算、开局护体和后手窗口，再确认行动。'
        : '反制建议：当前仍有公开反制线，先处理防守窗口，再决定是否交权。';
    const counterplayLine = [
      intentSignal && intentSignal.responseLine,
      duelMomentum && duelMomentum.counterplayLine
    ].map(safeLine).find(Boolean) || '';
    const responseLine = responseCardCount > 0
      ? `可用响应牌 ${responseCardCount} 张${responseLabels.length ? ` · ${responseLabels.slice(0, 4).join(' · ')}` : ''}`
      : responseLabels.length ? `公开反制线 · ${responseLabels.slice(0, 4).join(' · ')}` : '公开反制线：等待权威状态继续同步。';
    return {
      reportVersion: 'pvp-live-counterplay-guide-v1',
      sourceVisibility: 'public_state_and_public_content',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      advisoryOnly: true,
      viewerSeat,
      currentSeat,
      pressureState,
      responseCardCount,
      responseLabels: responseLabels.slice(0, 4),
      primaryLine,
      counterplayLine,
      responseLine,
      endTurnLine,
      boundaryLine: '只读取公开状态和公开卡面；只给提示、不代打、不写正式积分。'
    };
  },
  renderLiveCounterplayGuide(view, phase = '') {
    const report = view && view.reportVersion === 'pvp-live-counterplay-guide-v1'
      ? view
      : this.getLiveCounterplayGuide(view, phase);
    if (!report) return '反制建议：等待公开行动窗口';
    const boundaryLine = report.boundaryLine || '只读取公开状态和公开卡面；只给提示、不代打、不写正式积分。';
    const endTurnLine = report.endTurnLine
      ? `<div class="pvp-live-counterplay-guide-line compact" data-live-counterplay-guide-line><span>${this.escapeHtml(report.endTurnLine)}</span></div>`
      : '';
    const sourceLine = `${report.sourceVisibility} · ${report.usesHiddenInformation ? '含隐藏信息' : '不含隐藏信息'} · ${report.rankedImpact === 'none' ? '不写正式积分' : report.rankedImpact}`;
    return `
      <div class="pvp-live-counterplay-guide-line" data-live-counterplay-guide-line>
        <span class="pvp-live-counterplay-guide-chip" data-live-counterplay-guide-chip>反制建议</span>
        <span>${this.escapeHtml(report.primaryLine)}</span>
      </div>
      <div class="pvp-live-counterplay-guide-line" data-live-counterplay-guide-line>
        <span class="pvp-live-counterplay-guide-chip" data-live-counterplay-guide-chip>响应牌</span>
        <span>${this.escapeHtml(report.responseLine)}</span>
      </div>
      ${report.counterplayLine ? `<div class="pvp-live-counterplay-guide-line compact" data-live-counterplay-guide-line><span>${this.escapeHtml(report.counterplayLine)}</span></div>` : ''}
      ${endTurnLine}
      <div class="pvp-live-counterplay-guide-line compact" data-live-counterplay-guide-line>
        <span>${this.escapeHtml(boundaryLine)}</span>
        <span>${this.escapeHtml(sourceLine)}</span>
      </div>
    `;
  },
  getLiveActionWindowReceipt(view, phase = '') {
    const source = view && view.reportVersion === 'pvp-live-action-window-receipt-v1'
      ? view
      : this.getLiveCounterplayGuide(view, phase);
    if (!source) return null;
    if (source.usesHiddenInformation || source.rankedImpact !== 'none') return null;
    if (String(source.sourceVisibility || '') !== 'public_state_and_public_content') return null;
    const supportedPressureStates = ['opening_window', 'status_response_window', 'reversal_window'];
    const pressureState = String(source.pressureState || '');
    if (!supportedPressureStates.includes(pressureState)) return null;
    const forbiddenLineToken = /\b(?:cardInstanceId|cardId|instanceId|hand|deck|opponentHand|opponentDeck|loadoutSnapshot|reward|rating|elo|token)\b/i;
    const safeLine = value => {
      const line = String(value || '').trim();
      if (!line || forbiddenLineToken.test(line)) return '';
      return line;
    };
    const responseCardCount = Math.max(0, Math.floor(Number(source.responseCardCount) || 0));
    const responseLabels = Array.isArray(source.responseLabels)
      ? source.responseLabels.map(safeLine).filter(Boolean).slice(0, 4)
      : [];
    const stateLabels = {
      opening_window: '开局行动窗口',
      status_response_window: '公开状态响应窗口',
      reversal_window: '反打行动窗口'
    };
    const primaryLine = pressureState === 'status_response_window'
      ? `有效行动窗口：${stateLabels[pressureState]}仍在，${responseCardCount > 0 ? `还有 ${responseCardCount} 张响应牌可先处理公开风险` : '先确认公开风险再交权'}。`
      : pressureState === 'opening_window'
        ? '有效行动窗口：开局行动窗口仍在，先读首动预算、开局护体和后手行动窗口再确认。'
        : '有效行动窗口：反打行动窗口仍在，先处理防守或反击选择再交权。';
    const choiceLine = responseCardCount > 0
      ? `可响应 ${responseCardCount} 张${responseLabels.length ? ` · ${responseLabels.join(' · ')}` : ''}`
      : safeLine(source.responseLine) || '可响应：等待权威公开状态继续同步。';
    const riskLine = pressureState === 'status_response_window'
      ? '结束回合会放弃当前响应窗口并交出行动权；先处理响应牌再确认交权。'
      : pressureState === 'opening_window'
        ? '结束回合会交出开局行动窗口；确认前先读首动预算和护体。'
        : '结束回合会交出反打窗口；确认前先处理防守收益。';
    const counterplayLine = safeLine(source.counterplayLine);
    return {
      reportVersion: 'pvp-live-action-window-receipt-v1',
      sourceVisibility: 'public_state_and_public_content',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      advisoryOnly: true,
      viewerSeat: String(source.viewerSeat || ''),
      currentSeat: String(source.currentSeat || ''),
      pressureState,
      stateLabel: stateLabels[pressureState],
      responseCardCount,
      responseLabels,
      primaryLine,
      choiceLine,
      riskLine,
      counterplayLine,
      boundaryLine: '只提示不代打；不改变正式积分、奖励或结算。'
    };
  },
  renderLiveActionWindowReceipt(view, phase = '') {
    const report = view && view.reportVersion === 'pvp-live-action-window-receipt-v1'
      ? view
      : this.getLiveActionWindowReceipt(view, phase);
    if (!report) return '行动窗口回执：等待有效行动窗口';
    const sourceLine = `${report.sourceVisibility} · ${report.usesHiddenInformation ? '含隐藏信息' : '不含隐藏信息'} · ${report.rankedImpact === 'none' ? '不改变正式积分' : report.rankedImpact}`;
    const counterplayLine = report.counterplayLine
      ? `<div class="pvp-live-action-window-receipt-line compact" data-live-action-window-receipt-line><span>${this.escapeHtml(report.counterplayLine)}</span></div>`
      : '';
    return `
      <div class="pvp-live-action-window-receipt-line" data-live-action-window-receipt-line>
        <span class="pvp-live-action-window-receipt-chip" data-live-action-window-receipt-chip>行动窗口回执</span>
        <span>${this.escapeHtml(report.primaryLine)}</span>
      </div>
      <div class="pvp-live-action-window-receipt-line" data-live-action-window-receipt-line>
        <span class="pvp-live-action-window-receipt-chip" data-live-action-window-receipt-chip>可响应</span>
        <span>${this.escapeHtml(report.choiceLine)}</span>
      </div>
      <div class="pvp-live-action-window-receipt-line" data-live-action-window-receipt-line>
        <span class="pvp-live-action-window-receipt-chip" data-live-action-window-receipt-chip>交权风险</span>
        <span>${this.escapeHtml(report.riskLine)}</span>
      </div>
      ${counterplayLine}
      <div class="pvp-live-action-window-receipt-line compact" data-live-action-window-receipt-line>
        <span>${this.escapeHtml(report.boundaryLine || '只提示不代打；不改变正式积分、奖励或结算。')}</span>
        <span>${this.escapeHtml(sourceLine)}</span>
      </div>
    `;
  },
  getLivePublicStatuses(seat) {
    const statuses = Array.isArray(seat && seat.publicStatuses) ? seat.publicStatuses : [];
    return statuses.slice(0, 6).map(status => ({
      statusId: String(status && status.statusId || ''),
      label: String(status && status.label || '公开状态'),
      sourceSeat: String(status && status.sourceSeat || ''),
      stacks: Math.max(1, Math.floor(Number(status && status.stacks) || 1)),
      mitigationAmount: Math.max(0, Math.floor(Number(status && status.mitigationAmount) || 0)),
      earliestConsumeTurnIndex: Math.max(0, Math.floor(Number(status && status.earliestConsumeTurnIndex) || 0)),
      expiresAtTurnIndex: Math.max(0, Math.floor(Number(status && status.expiresAtTurnIndex) || 0)),
      responseWindow: String(status && status.responseWindow || ''),
      summary: String(status && status.summary || '')
    })).filter(status => status.statusId && status.label);
  },
  renderLivePublicStatuses(seat) {
    const statuses = this.getLivePublicStatuses(seat);
    if (!statuses.length) return '<span class="pvp-live-public-status-empty">状态：无公开状态</span>';
    return statuses.map(status => {
      const stackText = status.stacks > 1 ? ` x${status.stacks}` : '';
      const windowText = status.responseWindow === 'defender_turn_before_payoff'
        ? `反制窗口后可兑现`
        : status.responseWindow === 'next_incoming_attack'
          ? `下次受击减伤`
          : status.responseWindow === 'next_outgoing_attack'
            ? `下次出手减伤`
            : status.earliestConsumeTurnIndex > 0 ? `第 ${status.earliestConsumeTurnIndex} 手后可兑现` : '公开可见';
      const summary = status.summary || `${status.label}：${windowText}`;
      return `
        <span class="pvp-live-public-status" data-live-public-status="${this.escapeHtml(status.statusId)}">
          <span class="pvp-live-public-status-label">${this.escapeHtml(status.label)}${this.escapeHtml(stackText)}</span>
          <span class="pvp-live-public-status-window">${this.escapeHtml(windowText)}</span>
          <span class="pvp-live-public-status-summary">${this.escapeHtml(summary)}</span>
        </span>
      `;
    }).join('');
  },
  getLiveFirstMatchGuide(view) {
    const report = view && view.firstMatchGuide && typeof view.firstMatchGuide === 'object' ? view.firstMatchGuide : null;
    if (!report) return null;
    const steps = Array.isArray(report.steps) ? report.steps : [];
    const recommendedLoadouts = Array.isArray(report.recommendedLoadouts) ? report.recommendedLoadouts : [];
    const exceptionBranches = Array.isArray(report.exceptionBranches) ? report.exceptionBranches : [];
    const reviewActions = Array.isArray(report.reviewActions) ? report.reviewActions : [];
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-first-match-guide-v1'),
      title: String(report.title || '首战简报'),
      summary: String(report.summary || ''),
      nextAction: String(report.nextAction || ''),
      safeguards: Array.isArray(report.safeguards) ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8) : [],
      steps: steps.slice(0, 6).map(step => ({
        id: String(step && step.id || ''),
        label: String(step && step.label || ''),
        detail: String(step && step.detail || '')
      })).filter(step => step.id && step.label && step.detail),
      recommendedLoadouts: recommendedLoadouts.slice(0, 3).map(item => ({
        id: String(item && item.id || ''),
        label: String(item && item.label || ''),
        role: String(item && item.role || ''),
        weakness: String(item && item.weakness || '')
      })).filter(item => item.id && item.label && item.role && item.weakness),
      exceptionBranches: exceptionBranches.slice(0, 6).map(item => ({
        id: String(item && item.id || ''),
        label: String(item && item.label || ''),
        detail: String(item && item.detail || '')
      })).filter(item => item.id && item.label && item.detail),
      reviewActions: reviewActions.slice(0, 6).map(item => ({
        id: String(item && item.id || ''),
        label: String(item && item.label || '')
      })).filter(item => item.id && item.label)
    };
  },
  getLiveLoadoutExplorationReport(view) {
    const report = view && view.loadoutExplorationReport && typeof view.loadoutExplorationReport === 'object'
      ? view.loadoutExplorationReport
      : null;
    if (!report) return null;
    const profiles = Array.isArray(report.profiles) ? report.profiles : [];
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-loadout-exploration-v1'),
      contentPackVersion: String(report.contentPackVersion || ''),
      sourceVisibility: String(report.sourceVisibility || 'public_content'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      title: String(report.title || '谱系探索'),
      summary: String(report.summary || ''),
      progressionBoundary: String(report.progressionBoundary || ''),
      profiles: profiles.slice(0, 4).map(profile => {
        const practiceTopic = profile && profile.practiceTopic && typeof profile.practiceTopic === 'object' ? profile.practiceTopic : {};
        const swapSlots = Array.isArray(profile && profile.swapSlots) ? profile.swapSlots : [];
        return {
          id: String(profile && profile.id || ''),
          label: String(profile && profile.label || ''),
          primaryDecisionAxis: String(profile && profile.primaryDecisionAxis || ''),
          funHook: String(profile && profile.funHook || ''),
          skillTest: String(profile && profile.skillTest || ''),
          publicWeakness: String(profile && profile.publicWeakness || ''),
          swapSlots: swapSlots.slice(0, 4).map(slot => ({
            id: String(slot && slot.id || ''),
            label: String(slot && slot.label || ''),
            detail: String(slot && slot.detail || '')
          })).filter(slot => slot.id && slot.label && slot.detail),
          practiceTopic: {
            id: String(practiceTopic.id || ''),
            label: String(practiceTopic.label || ''),
            detail: String(practiceTopic.detail || '')
          },
          masteryBoundary: String(profile && profile.masteryBoundary || '')
        };
      }).filter(profile => (
        profile.id
        && profile.label
        && profile.funHook
        && profile.skillTest
        && profile.publicWeakness
        && profile.practiceTopic.id
      ))
    };
  },
  renderLiveLoadoutExplorationReport(view) {
    const report = this.getLiveLoadoutExplorationReport(view);
    if (!report || report.profiles.length === 0) return '';
    const visibleProfiles = report.profiles.slice(0, 3);
    return `
      <div
        class="pvp-live-loadout-exploration"
        data-live-loadout-exploration
        data-live-loadout-exploration-source="${this.escapeHtml(report.sourceVisibility)}"
        data-live-loadout-exploration-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
      >
        <div class="pvp-live-loadout-exploration-head">
          <span>${this.escapeHtml(report.title)}</span>
          <span>${this.escapeHtml(report.rankedImpact === 'none' ? '不写正式积分' : report.rankedImpact)}</span>
        </div>
        ${report.summary ? `<div class="pvp-live-loadout-exploration-summary">${this.escapeHtml(report.summary)}</div>` : ''}
        <div class="pvp-live-loadout-exploration-grid">
          ${visibleProfiles.map(profile => `
            <div class="pvp-live-loadout-exploration-card" data-live-loadout-profile="${this.escapeHtml(profile.id)}">
              <div class="pvp-live-loadout-exploration-card-head">
                <span>${this.escapeHtml(profile.label)}</span>
                <span>${this.escapeHtml(profile.practiceTopic.label)}</span>
              </div>
              <div class="pvp-live-loadout-exploration-hook">${this.escapeHtml(profile.funHook)}</div>
              <div class="pvp-live-loadout-exploration-lines">
                <span>${this.escapeHtml(profile.skillTest)}</span>
                <span>${this.escapeHtml(profile.publicWeakness)}</span>
                <span>${this.escapeHtml(profile.swapSlots.slice(0, 2).map(slot => slot.label).join(' / ') || profile.primaryDecisionAxis)}</span>
              </div>
            </div>
          `).join('')}
        </div>
        ${report.progressionBoundary ? `<div class="pvp-live-loadout-exploration-boundary">${this.escapeHtml(report.progressionBoundary)}</div>` : ''}
      </div>
    `;
  },
  getLiveFriendlySeries(source) {
    const report = source && source.friendlySeries && typeof source.friendlySeries === 'object'
      ? source.friendlySeries
      : source && typeof source === 'object' ? source : null;
    if (!report) return null;
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-friendly-series-v1'),
      sourceMatchId: String(report.sourceMatchId || ''),
      originMatchId: String(report.originMatchId || report.sourceMatchId || ''),
      seriesId: String(report.seriesId || ''),
      status: String(report.status || ''),
      format: String(report.format || 'bo3_mvp'),
      targetWins: Math.max(2, Math.min(5, Math.floor(Number(report.targetWins) || 2))),
      maxRounds: Math.max(1, Math.floor(Number(report.maxRounds) || 3)),
      roundIndex: Math.max(1, Math.floor(Number(report.roundIndex) || 2)),
      roundLabel: String(report.roundLabel || '换边再战'),
      seriesStatus: String(report.seriesStatus || ''),
      scoreBySourceSeat: {
        A: Math.max(0, Math.floor(Number(report.scoreBySourceSeat && report.scoreBySourceSeat.A) || 0)),
        B: Math.max(0, Math.floor(Number(report.scoreBySourceSeat && report.scoreBySourceSeat.B) || 0))
      },
      sourceParticipants: {
        A: {
          sourceSeat: 'A',
          displayName: String(report.sourceParticipants && report.sourceParticipants.A && report.sourceParticipants.A.displayName || '甲方')
        },
        B: {
          sourceSeat: 'B',
          displayName: String(report.sourceParticipants && report.sourceParticipants.B && report.sourceParticipants.B.displayName || '乙方')
        }
      },
      leaderSourceSeat: String(report.leaderSourceSeat || ''),
      winnerSourceSeat: String(report.winnerSourceSeat || ''),
      canRequestNextRound: !!report.canRequestNextRound,
      rankedImpact: String(report.rankedImpact || 'none'),
      formalResultPolicy: String(report.formalResultPolicy || 'practice_only'),
      seatPolicy: String(report.seatPolicy || 'swap_sides'),
      openerPolicy: String(report.openerPolicy || 'friendly_series_rotating_opener'),
      openingFirstSourceSeat: String(report.openingFirstSourceSeat || 'A') === 'B' ? 'B' : 'A',
      roundFirstSourceSeat: String(report.roundFirstSourceSeat || 'A') === 'B' ? 'B' : 'A',
      loadoutPolicy: String(report.loadoutPolicy || 'per_game_change_allowed'),
      confirmationCount: Math.max(1, Math.min(2, Math.floor(Number(report.confirmationCount) || 1))),
      safeguards: Array.isArray(report.safeguards) ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8) : []
    };
  },
  renderLiveFirstMatchGuide(view) {
    const guide = this.getLiveFirstMatchGuide(view);
    if (!guide) return '首战简报：等待真人匹配';
    const visibleSteps = guide.steps.slice(0, 4);
    const visibleLoadouts = guide.recommendedLoadouts.slice(0, 3);
    const visibleExceptions = guide.exceptionBranches;
    const visibleReviewActions = guide.reviewActions;
    return `
      <div class="pvp-live-guide-head">
        <span class="pvp-live-guide-title">${this.escapeHtml(guide.title)}</span>
        <span class="pvp-live-guide-next">${this.escapeHtml(guide.nextAction || guide.summary)}</span>
      </div>
      <div class="pvp-live-guide-steps">
        ${visibleSteps.map(step => `<span class="pvp-live-guide-step" title="${this.escapeHtml(step.detail)}">${this.escapeHtml(step.label)}：${this.escapeHtml(step.detail)}</span>`).join('')}
      </div>
      ${visibleLoadouts.length ? `
        <div class="pvp-live-guide-loadouts">
          ${visibleLoadouts.map(item => `<span class="pvp-live-guide-loadout" title="${this.escapeHtml(item.role)}">${this.escapeHtml(item.label)} · ${this.escapeHtml(item.weakness)}</span>`).join('')}
        </div>
      ` : ''}
      ${visibleExceptions.length ? `
        <div class="pvp-live-guide-exceptions">
          ${visibleExceptions.map(item => `<span class="pvp-live-guide-exception" title="${this.escapeHtml(item.detail)}">${this.escapeHtml(item.label)}：${this.escapeHtml(item.detail)}</span>`).join('')}
        </div>
      ` : ''}
      ${visibleReviewActions.length ? `
        <div class="pvp-live-guide-review-actions">
          ${visibleReviewActions.map(item => `<span class="pvp-live-guide-review-action">${this.escapeHtml(item.label)}</span>`).join('')}
        </div>
      ` : ''}
      ${this.renderLiveLoadoutExplorationReport(view)}
    `;
  },
  getLiveWaitingReport(state) {
    const report = state && state.waitingReport && typeof state.waitingReport === 'object' ? state.waitingReport : null;
    if (!report) return null;
    const actions = Array.isArray(report.actions) ? report.actions : [];
    const wideMatchConsentSource = report.wideMatchConsent && typeof report.wideMatchConsent === 'object'
      ? report.wideMatchConsent
      : null;
    const wideMatchConsent = wideMatchConsentSource ? {
      reportVersion: String(wideMatchConsentSource.reportVersion || 'pvp-live-wide-match-consent-v1'),
      viewerAccepted: wideMatchConsentSource.viewerAccepted === true,
      requiresBothPlayers: wideMatchConsentSource.requiresBothPlayers !== false,
      requiredAcceptedPlayers: Math.max(2, Math.floor(Number(wideMatchConsentSource.requiredAcceptedPlayers) || 2)),
      acceptedPlayerCount: Math.max(0, Math.floor(Number(wideMatchConsentSource.acceptedPlayerCount) || 0)),
      candidatePoolSize: Math.max(1, Math.floor(Number(wideMatchConsentSource.candidatePoolSize) || 1)),
      matchReady: wideMatchConsentSource.matchReady === true,
      status: String(wideMatchConsentSource.status || ''),
      detail: String(wideMatchConsentSource.detail || '')
    } : null;
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-waiting-report-v1'),
      waitMs: Math.max(0, Math.floor(Number(report.waitMs) || 0)),
      longWaitThresholdMs: Math.max(0, Math.floor(Number(report.longWaitThresholdMs) || 120000)),
      longWait: !!report.longWait,
      protectionReason: String(report.protectionReason || ''),
      releaseMode: String(report.releaseMode || ''),
      releaseAt: Math.max(0, Math.floor(Number(report.releaseAt) || 0)),
      releaseInMs: Math.max(0, Math.floor(Number(report.releaseInMs) || 0)),
      requiresPoolSize: Math.max(0, Math.floor(Number(report.requiresPoolSize) || 0)),
      candidatePoolSize: Math.max(0, Math.floor(Number(report.candidatePoolSize) || 0)),
      currentEligibleActions: Array.isArray(report.currentEligibleActions)
        ? report.currentEligibleActions.map(item => String(item || '')).filter(Boolean).slice(0, 8)
        : [],
      message: String(report.message || ''),
      safeguards: Array.isArray(report.safeguards) ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8) : [],
      wideMatchConsent,
      actions: actions.slice(0, 4).map(action => ({
        id: String(action && action.id || ''),
        label: String(action && action.label || ''),
        detail: String(action && action.detail || '')
      })).filter(action => action.id && action.label && action.detail)
    };
  },
  isLiveLongWait(state) {
    return !!this.getLiveWaitingReport(state)?.longWait;
  },
  getLiveWaitingQualitySafeguard(state) {
    const report = this.getLiveWaitingReport(state);
    const safeguards = report && Array.isArray(report.safeguards) ? report.safeguards : [];
    if (safeguards.includes('player_avoid_opponent')) {
      return {
        reason: 'player_avoid_opponent',
        title: '匹配质量护栏',
        themeLabel: '赛后避开对手',
        trainingTag: '赛后避开对手',
        advice: '赛后避开练习：系统正在跳过你赛后避开的对手，先练首轮稳血、反制和低费节奏；不写正式积分。'
      };
    }
    if (safeguards.includes('recent_opponent_suppression')) {
      return {
        reason: 'recent_opponent_suppression',
        title: '匹配质量护栏',
        themeLabel: '近期对手轮换',
        trainingTag: '近期对手轮换',
        advice: '近期对手练习：系统正在跳过刚刚交手的对手，先练首轮稳血、反制和低费节奏；不写正式积分。'
      };
    }
    if (safeguards.includes('low_sample_protection')) {
      return {
        reason: 'low_sample_protection',
        title: '匹配质量护栏',
        themeLabel: '匹配样本保护',
        trainingTag: '匹配样本保护',
        advice: '样本保护练习：系统正在等待更稳妥的真人匹配，先练起手调息和防秒杀节奏；不写正式积分。'
      };
    }
    return null;
  },
  getLiveConnectionHealthError(state = null) {
    const source = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    const error = source && source.lastError && typeof source.lastError === 'object' ? source.lastError : null;
    const health = error && error.connectionHealth && typeof error.connectionHealth === 'object' ? error.connectionHealth : null;
    if (!error || String(error.reason || '') !== 'connection_health_failed' || !health) return null;
    return {
      reason: String(error.reason || ''),
      message: String(error.message || ''),
      connectionHealth: {
        reportVersion: String(health.reportVersion || 'pvp-live-queue-connection-health-v1'),
        status: String(health.status || 'blocked'),
        sampleTag: String(health.sampleTag || 'client_preflight'),
        reasons: Array.isArray(health.reasons)
          ? health.reasons.map(item => String(item || '')).filter(Boolean).slice(0, 6)
          : [],
        actions: Array.isArray(health.actions)
          ? health.actions.slice(0, 4).map(action => ({
            id: String(action && action.id || ''),
            label: String(action && action.label || ''),
            detail: String(action && action.detail || '')
          })).filter(action => action.id && action.label)
          : []
      }
    };
  },
  getLiveQueueCooldownError(state = null) {
    const source = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    const error = source && source.lastError && typeof source.lastError === 'object' ? source.lastError : null;
    const guard = error && error.matchmakingGuard && typeof error.matchmakingGuard === 'object' ? error.matchmakingGuard : null;
    if (!error || String(error.reason || '') !== 'queue_cooldown' || !guard) return null;
    const actions = Array.isArray(guard.actions) ? guard.actions : [];
    return {
      reason: 'queue_cooldown',
      message: String(error.message || guard.message || ''),
      matchmakingGuard: {
        reportVersion: String(guard.reportVersion || 'pvp-live-matchmaking-guard-v1'),
        status: String(guard.status || 'blocked'),
        cooldownSource: String(guard.cooldownSource || 'queue_cooldown'),
        sourceLabel: String(guard.sourceLabel || '排队冷却'),
        retryAt: Math.max(0, Math.floor(Number(guard.retryAt || guard.cooldownUntil) || 0)),
        cooldownRemainingMs: Math.max(0, Math.floor(Number(guard.cooldownRemainingMs) || 0)),
        rankedImpact: String(guard.rankedImpact || 'none'),
        actions: actions.slice(0, 4).map(action => ({
          id: String(action && action.id || ''),
          label: String(action && action.label || ''),
          detail: String(action && action.detail || '')
        })).filter(action => action.id && action.label)
      }
    };
  },
  getLiveQueueCooldownCountdown(state = null) {
    const report = this.getLiveQueueCooldownError(state);
    const guard = report && report.matchmakingGuard ? report.matchmakingGuard : null;
    if (!guard || String(guard.status || '') !== 'blocked') return null;
    const retryAt = Math.max(0, Math.floor(Number(guard.retryAt) || 0));
    const reportedRemainingMs = Math.max(0, Math.floor(Number(guard.cooldownRemainingMs) || 0));
    const derivedRemainingMs = retryAt > 0 ? Math.max(0, retryAt - Date.now()) : 0;
    const remainingMs = retryAt > 0 ? derivedRemainingMs : reportedRemainingMs;
    const cooldownActive = remainingMs > 0;
    const remainingSeconds = cooldownActive ? Math.max(1, Math.ceil(remainingMs / 1000)) : 0;
    const sourceLabel = String(guard.sourceLabel || '排队冷却');
    return {
      remainingMs,
      remainingSeconds,
      retryAt,
      buttonText: cooldownActive ? `${remainingSeconds}s 后重试` : '入队',
      hint: cooldownActive
        ? `${sourceLabel}触发真人排位短暂冷却，剩余 ${remainingSeconds} 秒；可先进入问道练习，练习不写正式积分。`
        : `${sourceLabel}已结束，可以重新进入真人排位。`
    };
  },
  isLiveEntrySafeguardBlocked(state = null) {
    const report = this.getLiveConnectionHealthError(state);
    const status = String(report && report.connectionHealth && report.connectionHealth.status || '');
    if (status === 'blocked' || status === 'risky') return true;
    const cooldownReport = this.getLiveQueueCooldownError(state);
    const cooldownCountdown = this.getLiveQueueCooldownCountdown(state);
    return String(cooldownReport && cooldownReport.matchmakingGuard && cooldownReport.matchmakingGuard.status || '') === 'blocked'
      && !!cooldownCountdown
      && cooldownCountdown.remainingMs > 0;
  },
  hasLiveEntrySafeguardAction(state = null, actionId = '') {
    const id = String(actionId || '');
    const report = this.getLiveConnectionHealthError(state);
    if (report && report.connectionHealth.actions.some(action => action.id === id)) return true;
    const cooldownReport = this.getLiveQueueCooldownError(state);
    const cooldownCountdown = this.getLiveQueueCooldownCountdown(state);
    return !!(cooldownReport
      && cooldownCountdown
      && cooldownCountdown.remainingMs > 0
      && cooldownReport.matchmakingGuard.actions.some(action => action.id === id));
  },
  shouldLivePoll(state) {
    if (!state) return false;
    if (state.phase === 'idle') return true;
    if (state.phase === 'waiting_invite') return true;
    if (state.phase === 'waiting_rematch') return true;
    if (state.phase !== 'waiting') return false;
    if (!this.isLiveLongWait(state)) return true;
    return Date.now() < Math.max(0, Number(this.liveLongWaitPollUntil) || 0);
  },
  renderLiveWaitingReport(state) {
    const report = this.getLiveWaitingReport(state);
    const qualitySafeguard = this.getLiveWaitingQualitySafeguard(state);
    const wideConsent = report && report.wideMatchConsent;
    const hasWideConsentSignal = !!(wideConsent && (
      wideConsent.viewerAccepted
      || wideConsent.status
      || wideConsent.acceptedPlayerCount > 0
      || wideConsent.candidatePoolSize > 1
    ));
    const hasWaitingContract = !!(report && (
      report.longWait
      || qualitySafeguard
      || hasWideConsentSignal
      || report.releaseMode
      || report.currentEligibleActions.length > 0
    ));
    if (!hasWaitingContract) return '';
    const waitSec = Math.ceil(report.waitMs / 1000);
    const thresholdSec = Math.max(1, Math.ceil(report.longWaitThresholdMs / 1000));
    const heading = report.longWait
      ? `${thresholdSec} 秒无真人`
      : qualitySafeguard ? qualitySafeguard.title : hasWideConsentSignal ? '宽分差确认' : '等待真人';
    const signals = [];
    if (wideConsent) {
      signals.push(`宽分差确认 ${wideConsent.acceptedPlayerCount}/${wideConsent.requiredAcceptedPlayers}`);
      signals.push(`候选池 ${wideConsent.candidatePoolSize}`);
    }
    if (report.releaseMode) {
      const releaseModeLabel = this.formatLiveWaitingReleaseModeLabel(report.releaseMode);
      signals.push(report.releaseInMs > 0 ? `放行剩余 ${Math.ceil(report.releaseInMs / 1000)}s · ${releaseModeLabel}` : `放行条件 ${releaseModeLabel}`);
    }
    if (report.currentEligibleActions.length > 0) {
      const eligibleActions = this.formatLiveWaitingEligibleActions(report.currentEligibleActions);
      if (eligibleActions) {
        signals.push(`可选操作 ${eligibleActions}`);
      }
    }
    const renderWaitingAction = (action) => {
      if (action.id !== 'accept_wide_match') {
        return `<span class="pvp-live-waiting-action" title="${this.escapeHtml(action.detail)}">${this.escapeHtml(action.label)}：${this.escapeHtml(action.detail)}</span>`;
      }
      if (wideConsent && wideConsent.viewerAccepted) {
        const status = wideConsent.status || 'waiting_for_peer';
        const detail = wideConsent.detail || action.detail;
        return `<span class="pvp-live-waiting-action is-accepted" data-live-waiting-action="accept-wide-match" data-live-wide-match-consent-status="${this.escapeHtml(status)}" title="${this.escapeHtml(detail)}">已确认宽分差：等待对方确认</span>`;
      }
      return `<button class="pvp-live-waiting-action challenge-btn secondary" type="button" data-live-waiting-action="accept-wide-match" data-live-wide-match-consent-status="${this.escapeHtml(wideConsent && wideConsent.status || 'waiting_for_viewer')}" title="${this.escapeHtml(action.detail)}" onclick="PVPScene.acceptLiveWideMatch()">${this.escapeHtml(action.label)}</button>`;
    };
    return `
      <div class="pvp-live-waiting-head">
        <span>${this.escapeHtml(heading)}</span>
        <span>已等待 ${this.escapeHtml(waitSec)}s</span>
      </div>
      ${signals.length ? `<div class="pvp-live-waiting-signals">${signals.slice(0, 4).map(signal => `<span>${this.escapeHtml(signal)}</span>`).join('')}</div>` : ''}
      <div>${this.escapeHtml(report.message || '当前真人较少，可继续等待、进入问道练习或取消匹配；不会自动切残影。')}</div>
      <div class="pvp-live-waiting-actions">
        ${report.actions.map(action => renderWaitingAction(action)).join('')}
      </div>
    `;
  },
  buildLiveWaitingPracticeScenario(state = null) {
    const sourceState = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    const waitingReport = this.getLiveWaitingReport(sourceState);
    const qualitySafeguard = this.getLiveWaitingQualitySafeguard(sourceState);
    if (!waitingReport || (!waitingReport.longWait && !qualitySafeguard)) return null;
    const queueTicket = String(sourceState && sourceState.queueTicket || '').trim();
    const finishReason = qualitySafeguard ? qualitySafeguard.reason : 'long_wait';
    const sourceId = queueTicket || `${finishReason}-${Date.now()}`;
    const selectedLoadout = this.getLiveSelectedLoadoutPreset();
    const waitSec = Math.ceil(waitingReport.waitMs / 1000);
    const themeLabel = qualitySafeguard ? qualitySafeguard.themeLabel : '等待真人';
    const trainingAdvice = qualitySafeguard
      ? qualitySafeguard.advice
      : `长等待练习：已等待 ${waitSec}s，先练调息、首轮稳血和低费节奏；不写正式积分。`;
    return {
      reportVersion: 'pvp-live-drill-scenario-v1',
      sourceMatchId: `waiting:${sourceId}`,
      sourceVisibility: 'replay_self',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      result: 'waiting',
      finishReason,
      recommendedLoadoutId: selectedLoadout.id,
      recommendedLoadoutLabel: selectedLoadout.label,
      themeKey: 'tempo',
      themeLabel,
      trainingAdvice,
      drillObjective: `${selectedLoadout.label}：${themeLabel}时练首轮调息和出牌节奏，不写正式积分。`,
      trainingTags: ['真人 PVP', qualitySafeguard ? qualitySafeguard.trainingTag : '长等待练习', '不计积分', '等待真人'],
      publicEventTypes: [qualitySafeguard ? 'queue_quality_safeguard' : 'queue_long_wait'],
      sourceEventSequences: [],
      waitingReport
    };
  },
  buildLiveEntrySafeguardPracticeScenario(state = null) {
    const sourceState = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    if (!this.isLiveEntrySafeguardBlocked(sourceState) || !this.hasLiveEntrySafeguardAction(sourceState, 'practice')) return null;
    const report = this.getLiveConnectionHealthError(sourceState);
    const cooldownReport = this.getLiveQueueCooldownError(sourceState);
    const isCooldown = !!cooldownReport && !report;
    const cooldownSource = cooldownReport && cooldownReport.matchmakingGuard && cooldownReport.matchmakingGuard.cooldownSource || 'queue_cooldown';
    const isReadyTimeoutCooldown = isCooldown && cooldownSource === 'ready_timeout';
    const isConnectionTimeoutCooldown = isCooldown && cooldownSource === 'connection_timeout';
    const cooldownScenarioKey = isReadyTimeoutCooldown
      ? 'ready_timeout'
      : isConnectionTimeoutCooldown ? 'connection_timeout' : 'queue_cooldown';
    const cooldownScenarioLabel = isReadyTimeoutCooldown
      ? '准备超时冷却'
      : isConnectionTimeoutCooldown ? '连接超时冷却' : '排队冷却';
    const cooldownTrainingTag = isReadyTimeoutCooldown
      ? '准备超时练习'
      : isConnectionTimeoutCooldown ? '连接超时练习' : '排队冷却练习';
    const cooldownTrainingAdvice = isReadyTimeoutCooldown
      ? '准备阶段未确认触发短暂冷却：先用问道练习补首轮调息、确认准备和稳血节奏；不写正式积分。'
      : isConnectionTimeoutCooldown
        ? '准备阶段连接超时触发短暂冷却：先用问道练习补重连前后的调息、稳血和低费节奏；不写正式积分。'
        : '真人排位短暂冷却：先用问道练习保持手感，练首轮调息、稳血和低费节奏；不写正式积分。';
    const cooldownDrillObjective = isReadyTimeoutCooldown
      ? '准备超时冷却期间先练调息确认、稳血和低费节奏，不写正式积分。'
      : isConnectionTimeoutCooldown
        ? '连接超时冷却期间先练断线恢复后的调息确认、稳血和低费节奏，不写正式积分。'
        : '排队冷却期间先练首轮稳血和出牌节奏，不写正式积分。';
    const selectedLoadout = this.getLiveSelectedLoadoutPreset();
    return {
      reportVersion: 'pvp-live-drill-scenario-v1',
      sourceMatchId: isCooldown ? `entry_safeguard:${cooldownScenarioKey}` : 'entry_safeguard:connection_health_failed',
      sourceVisibility: 'replay_self',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      result: isCooldown ? 'queue_cooldown_blocked' : 'entry_safeguard_blocked',
      finishReason: isCooldown ? 'queue_cooldown' : 'connection_health_failed',
      recommendedLoadoutId: selectedLoadout.id,
      recommendedLoadoutLabel: selectedLoadout.label,
      themeKey: isCooldown ? cooldownScenarioKey : 'connection_health',
      themeLabel: isCooldown ? cooldownScenarioLabel : '入场保障',
      trainingAdvice: isCooldown
        ? cooldownTrainingAdvice
        : '连接健康入场保障：当前连接未稳定，先练首轮调息、稳血和低费节奏；不写正式积分。',
      drillObjective: isCooldown
        ? `${selectedLoadout.label}：${cooldownDrillObjective}`
        : `${selectedLoadout.label}：连接恢复前先练首轮稳血和出牌节奏，不写正式积分。`,
      trainingTags: ['真人 PVP', isCooldown ? cooldownTrainingTag : '连接健康练习', '不计积分', isCooldown ? cooldownScenarioLabel : '入场保障'],
      publicEventTypes: [isCooldown ? cooldownSource : 'connection_health_failed'],
      sourceEventSequences: [],
      ...(isCooldown ? { matchmakingGuard: cooldownReport.matchmakingGuard } : { connectionHealth: report ? report.connectionHealth : null })
    };
  },
  async commitLiveEntrySafeguardPracticeHandoff() {
    const session = this.getLiveSession();
    const sourceState = session && typeof session.getState === 'function' ? session.getState() : null;
    const scenario = this.buildLiveEntrySafeguardPracticeScenario(sourceState);
    if (!scenario) return null;
    this.liveDrillScenario = scenario;
    this.liveLongWaitPollUntil = 0;
    this.stopLivePolling();
    const gameRef = this.getGameRef();
    const focus = {
      sourceRunId: `pvp_live:${scenario.sourceMatchId}`,
      guideRecordId: `pvp_live:${scenario.sourceMatchId}`,
      chapterName: '真人 PVP 入场保障',
      sourceTitle: scenario.recommendedLoadoutLabel,
      themeKey: scenario.themeKey,
      themeLabel: scenario.themeLabel,
      ratingLabel: scenario.finishReason === 'queue_cooldown' ? '排队冷却练习' : '连接健康练习',
      ratingTone: 'selected',
      trainingAdvice: scenario.trainingAdvice,
      highlightLine: scenario.drillObjective,
      routeFocusLine: scenario.finishReason === 'queue_cooldown'
        ? `${scenario.themeLabel}期间未进入正式排位队列；练习不写正式积分，冷却结束后再重试排位。`
        : '未进入正式排位队列；练习不写正式积分，恢复后再重试检测。',
      compareHint: '练习只使用入场保障和公开规则，不读取对手隐藏手牌或牌库。',
      trainingTags: scenario.trainingTags,
      goalHighlights: [
        `入场保障：${scenario.finishReason === 'queue_cooldown' ? scenario.themeKey : 'connection_health_failed'}`,
        `推荐谱：${scenario.recommendedLoadoutLabel}`,
        '正式积分：不变'
      ]
    };
    if (gameRef && typeof gameRef.ensureChallengeHubLoaded === 'function') {
      await gameRef.ensureChallengeHubLoaded();
    }
    if (gameRef && typeof gameRef.setObservatoryTrainingFocus === 'function') {
      gameRef.setObservatoryTrainingFocus(focus, { silent: true });
    }
    const message = scenario.finishReason === 'queue_cooldown'
      ? '已进入真人 PVP 排队冷却练习：练习不写正式积分，冷却结束后可重试正式排位。'
      : '已进入真人 PVP 连接健康练习：练习不写正式积分，恢复后可重试正式排位。';
    this.liveInlineHint = message;
    const root = document.querySelector('[data-live-pvp-root]');
    const hint = root ? root.querySelector('[data-live-last-error]') : null;
    if (hint) hint.textContent = message;
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(message);
    }
    let drillStarted = false;
    if (gameRef && typeof gameRef.beginPvpLiveDrillScenario === 'function') {
      drillStarted = !!gameRef.beginPvpLiveDrillScenario(scenario);
    }
    if (!drillStarted && gameRef && typeof gameRef.showChallengeHub === 'function') {
      await gameRef.showChallengeHub('daily');
    }
    return scenario;
  },
  async commitLiveWaitingPracticeHandoff() {
    const session = this.getLiveSession();
    const sourceState = session && typeof session.getState === 'function' ? session.getState() : null;
    const scenario = this.buildLiveWaitingPracticeScenario(sourceState);
    if (!scenario) {
      const message = '问道练习不会写正式积分；当前还未进入 120 秒长等待，可继续等待真人或取消匹配后练习。';
      this.liveInlineHint = message;
      const root = document.querySelector('[data-live-pvp-root]');
      const hint = root ? root.querySelector('[data-live-last-error]') : null;
      if (hint) hint.textContent = message;
      if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(message);
      }
      return null;
    }
    if (sourceState && sourceState.phase === 'waiting' && session && typeof session.cancelQueue === 'function') {
      let cancelError = null;
      try {
        await session.cancelQueue();
      } catch (error) {
        cancelError = error;
      }
      const afterCancelState = session.getState();
      const afterCancelError = afterCancelState && afterCancelState.lastError ? afterCancelState.lastError : null;
      const afterCancelReason = String(afterCancelError && afterCancelError.reason || '');
      const cancelReceiptIsTerminal = !afterCancelError
        || afterCancelReason === 'queue_cancelled'
        || (afterCancelReason === 'queue_cooldown' && !!afterCancelError.matchmakingGuard);
      const cancelSucceeded = !cancelError
        && afterCancelState
        && afterCancelState.phase === 'idle'
        && !afterCancelState.queueTicket
        && !afterCancelState.matchId
        && cancelReceiptIsTerminal;
      if (!cancelSucceeded) {
        this.liveDrillScenario = null;
        this.liveLongWaitPollUntil = Date.now() + 30 * 1000;
        this.liveInlineHint = cancelError
          ? `练习暂未打开；退出排队失败，正在同步权威战局：${cancelError && cancelError.message ? cancelError.message : cancelError}`
          : '练习暂未打开；排队可能已经成局，正在同步权威战局。';
        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
          Utils.showBattleLog(this.liveInlineHint);
        }
        await this.refreshLiveMatch({ fromAutoPoll: true });
        const recoveredState = session.getState();
        if (this.shouldLivePoll(recoveredState)) this.startLivePolling();
        return null;
      }
    }
    this.liveDrillScenario = scenario;
    this.liveLongWaitPollUntil = 0;
    this.stopLivePolling();
    const gameRef = this.getGameRef();
    const focus = {
      sourceRunId: `pvp_live:${scenario.sourceMatchId}`,
      guideRecordId: `pvp_live:${scenario.sourceMatchId}`,
      chapterName: '真人 PVP 长等待',
      sourceTitle: scenario.recommendedLoadoutLabel,
      themeKey: scenario.themeKey,
      themeLabel: scenario.themeLabel,
      ratingLabel: '长等待练习',
      ratingTone: 'selected',
      trainingAdvice: scenario.trainingAdvice,
      highlightLine: scenario.drillObjective,
      routeFocusLine: '练习不写正式积分；已退出真人排队，避免成局后无人响应。',
      compareHint: '练习只使用等待分支和公开规则，不读取对手隐藏手牌或牌库。',
      trainingTags: scenario.trainingTags,
      goalHighlights: [
        `等待分支：${scenario.waitingReport.waitMs}ms`,
        `推荐谱：${scenario.recommendedLoadoutLabel}`,
        '正式积分：不变'
      ]
    };
    if (gameRef && typeof gameRef.ensureChallengeHubLoaded === 'function') {
      await gameRef.ensureChallengeHubLoaded();
    }
    if (gameRef && typeof gameRef.setObservatoryTrainingFocus === 'function') {
      gameRef.setObservatoryTrainingFocus(focus, { silent: true });
    }
    const message = '已进入真人 PVP 长等待练习：练习不写正式积分，且已退出本次排队。';
    this.liveInlineHint = message;
    const root = document.querySelector('[data-live-pvp-root]');
    const hint = root ? root.querySelector('[data-live-last-error]') : null;
    if (hint) hint.textContent = message;
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(message);
    }
    let drillStarted = false;
    if (gameRef && typeof gameRef.beginPvpLiveDrillScenario === 'function') {
      drillStarted = !!gameRef.beginPvpLiveDrillScenario(scenario);
    }
    if (!drillStarted && gameRef && typeof gameRef.showChallengeHub === 'function') {
      await gameRef.showChallengeHub('daily');
    }
    return scenario;
  },
  renderLiveInviteReport(report) {
    const source = report && typeof report === 'object' ? report : null;
    if (!source) return '约战不写正式积分，只和输入邀请码的真人匹配。';
    const code = String(source.inviteCode || '').trim() || '--';
    const status = String(source.status || 'waiting');
    const hostName = source.host && source.host.displayName ? source.host.displayName : '邀请者';
    const targetName = source.target && source.target.displayName ? source.target.displayName : '';
    const statusLabel = status === 'matched' ? '已成局' : status === 'cancelled' ? '已取消' : '等待好友加入';
    const impact = source.rankedImpact === 'none' ? '不写正式积分' : String(source.rankedImpact || '友谊局');
    const targetLabel = targetName ? ` · 指定 ${this.escapeHtml(targetName)}` : '';
    return `${statusLabel} · ${impact} · 房主 ${this.escapeHtml(hostName)}${targetLabel} · 邀请码 ${this.escapeHtml(code)}`;
  },
  renderLiveInviteInbox(invites = []) {
    const list = Array.isArray(invites) ? invites : [];
    if (list.length === 0) return '收到的约战：暂无';
    return list.slice(0, 4).map(invite => {
      const report = invite && invite.inviteReport ? invite.inviteReport : {};
      const code = String(invite && invite.inviteCode || report.inviteCode || '').trim();
      if (!code) return '';
      const hostName = report.host && report.host.displayName ? report.host.displayName : '道友';
      const expiresAt = Number(report.expiresAt) || 0;
      const expiresLabel = expiresAt ? ` · ${Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000))} 分钟内有效` : '';
      return `
        <div class="pvp-live-invite-inbox-item">
          <span>${this.escapeHtml(hostName)} 邀请你友谊约战 · ${this.escapeHtml(code)} · 不写正式积分${this.escapeHtml(expiresLabel)}</span>
          <button class="challenge-btn secondary" data-live-inbox-join="${this.escapeHtml(code)}" onclick="PVPScene.joinLiveInboxInvite('${this.escapeHtml(code)}')">加入</button>
        </div>
      `;
    }).filter(Boolean).join('') || '收到的约战：暂无';
  },
  getLivePostMatchReview(view) {
    const report = view && view.postMatchReview && typeof view.postMatchReview === 'object' ? view.postMatchReview : null;
    if (!report) return null;
    const evidence = Array.isArray(report.evidence) ? report.evidence : [];
    const suggestions = Array.isArray(report.suggestions) ? report.suggestions : [];
    const nextActions = Array.isArray(report.nextActions) ? report.nextActions : [];
    const actionBridge = report.postGameActionBridge && typeof report.postGameActionBridge === 'object' ? report.postGameActionBridge : null;
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-post-match-review-v1'),
      title: String(report.title || '赛后复盘 MVP'),
      result: String(report.result || ''),
      winnerSeat: String(report.winnerSeat || ''),
      loserSeat: String(report.loserSeat || ''),
      finishReason: String(report.finishReason || ''),
      summary: String(report.summary || ''),
      evidence: evidence.slice(0, 12).map(event => this.getLivePublicEventRef(event)).filter(Boolean),
      settlementReport: this.getLiveSettlementReport(report.settlementReport),
      keyTurnReplay: this.getLiveKeyTurnReplay(report.keyTurnReplay),
      experienceReport: this.getLiveExperienceReport(report.experienceReport),
      fairnessReceipt: this.getLiveFairnessReceipt(report.fairnessReceipt),
      loadoutRecommendation: this.getLiveLoadoutRecommendation(report.loadoutRecommendation),
      friendlySeries: this.getLiveFriendlySeries(report.friendlySeries),
      suggestions: suggestions.slice(0, 2).map(item => String(item || '')).filter(Boolean),
      postGameActionBridge: actionBridge ? {
        reportVersion: String(actionBridge.reportVersion || 'pvp-live-post-game-action-bridge-v1'),
        sourceVisibility: String(actionBridge.sourceVisibility || 'public_review_action_contract'),
        usesHiddenInformation: actionBridge.usesHiddenInformation === true,
        rankedImpact: String(actionBridge.rankedImpact || 'none'),
        coveredAuditActions: Array.isArray(actionBridge.coveredAuditActions)
          ? actionBridge.coveredAuditActions.map(item => String(item || '')).filter(Boolean).slice(0, 12)
          : [],
        uiActionIdsByAuditAction: actionBridge.uiActionIdsByAuditAction && typeof actionBridge.uiActionIdsByAuditAction === 'object'
          ? Object.fromEntries(Object.entries(actionBridge.uiActionIdsByAuditAction).map(([key, value]) => [
            String(key || ''),
            Array.isArray(value) ? value.map(item => String(item || '')).filter(Boolean).slice(0, 4) : []
          ]).filter(([key]) => key))
          : {}
      } : null,
      nextActions: nextActions.slice(0, 12).map(action => ({
        id: String(action && action.id || ''),
        auditActionId: String(action && action.auditActionId || ''),
        label: String(action && action.label || ''),
        detail: String(action && action.detail || '')
      })).filter(action => action.id && action.label)
    };
  },
  getLiveReplaySummary(source) {
    const replay = source && typeof source === 'object' ? source : null;
    if (!replay) return null;
    const hiddenScan = replay.hiddenScan && typeof replay.hiddenScan === 'object' ? replay.hiddenScan : {};
    const publicSummary = replay.publicSummary && typeof replay.publicSummary === 'object' ? replay.publicSummary : {};
    const events = Array.isArray(replay.events) ? replay.events : [];
    return {
      reportVersion: String(replay.reportVersion || 'pvp-live-replay-v1'),
      visibilityLayer: String(replay.visibilityLayer || ''),
      publicSummary: {
        status: String(publicSummary.status || ''),
        winnerSeat: String(publicSummary.winnerSeat || ''),
        loserSeat: String(publicSummary.loserSeat || ''),
        finishReason: String(publicSummary.finishReason || '')
      },
      eventCount: Math.max(0, Math.floor(Number(replay.eventCount) || events.length)),
      hiddenScan: {
        forbiddenTokenCount: Math.max(0, Math.floor(Number(hiddenScan.forbiddenTokenCount) || 0)),
        forbiddenKeyCount: Math.max(0, Math.floor(Number(hiddenScan.forbiddenKeyCount) || 0)),
        forbiddenStringCount: Math.max(0, Math.floor(Number(hiddenScan.forbiddenStringCount) || 0))
      }
    };
  },
  getLiveDisputeReportReceipt(source) {
    const report = source && typeof source === 'object' ? source : null;
    if (!report) return null;
    const evidence = report.evidencePackage && typeof report.evidencePackage === 'object'
      ? report.evidencePackage
      : {};
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-dispute-report-receipt-v1'),
      reportId: String(report.reportId || ''),
      status: String(report.status || 'reported'),
      reason: String(report.reason || 'player_report'),
      sourceVisibility: String(report.sourceVisibility || 'audit_safe_public_state'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      nextStepLine: String(report.nextStepLine || '异常反馈已提交；复核不会立即改写本局结算。'),
      evidencePackage: {
        reportVersion: String(evidence.reportVersion || 'pvp-live-dispute-evidence-v1'),
        sourceVisibility: String(evidence.sourceVisibility || 'audit_safe_public_state'),
        usesHiddenInformation: evidence.usesHiddenInformation === true,
        rankedImpact: String(evidence.rankedImpact || 'none'),
        matchId: String(evidence.matchId || ''),
        reporterSeat: String(evidence.reporterSeat || ''),
        finishReason: String(evidence.finishReason || ''),
        eventCount: Math.max(0, Math.floor(Number(evidence.eventCount) || 0)),
        riskTags: Array.isArray(evidence.riskTags)
          ? evidence.riskTags.map(item => String(item || '')).filter(Boolean).slice(0, 8)
          : []
      },
      boundary: String(report.boundary || '提交异常反馈不会即时改变正式积分、奖励或匹配评分。')
    };
  },
  getLiveAvoidOpponentReceipt(source) {
    const report = source && typeof source === 'object' ? source : null;
    if (!report) return null;
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-avoid-opponent-receipt-v1'),
      status: String(report.status || 'active'),
      reason: String(report.reason || 'post_match_avoid'),
      sourceVisibility: String(report.sourceVisibility || 'account_preference'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      formalResultPolicy: String(report.formalResultPolicy || 'no_result_change'),
      safeguard: String(report.safeguard || 'player_avoid_opponent'),
      sourceMatchId: String(report.sourceMatchId || ''),
      expiresAt: Math.max(0, Math.floor(Number(report.expiresAt) || 0)),
      nextStepLine: String(report.nextStepLine || '已记录赛后避开偏好；后续匹配会优先避开此对手。'),
      boundary: String(report.boundary || '避开对手只影响后续匹配优先级，不保证永久不匹配，不影响积分、奖励或隐藏信息。')
    };
  },
  getLiveLoadoutRecommendation(source) {
    const report = source && typeof source === 'object' ? source : null;
    if (!report || report.reportVersion !== 'pvp-live-loadout-recommendation-v1') return null;
    if (String(report.sourceVisibility || '') !== 'public_events_and_public_content') return null;
    if (report.usesHiddenInformation === true || String(report.rankedImpact || '') !== 'none') return null;
    const presets = this.getLiveLoadoutPresets();
    const recommendedPresetId = String(report.recommendedPresetId || '').trim();
    const preset = presets.find(item => item.id === recommendedPresetId);
    if (!preset) return null;
    const evidenceRefs = Array.isArray(report.evidenceRefs) ? report.evidenceRefs : [];
    return {
      reportVersion: 'pvp-live-loadout-recommendation-v1',
      sourceVisibility: String(report.sourceVisibility || 'public_events_and_public_content'),
      usesHiddenInformation: false,
      rankedImpact: 'none',
      recommendedPresetId: preset.id,
      recommendedPresetLabel: preset.label,
      reasonLine: String(report.reasonLine || ''),
      practiceLine: String(report.practiceLine || ''),
      boundaryLine: '一键套用只改下一局入队候选，不自动排队、不写正式积分。',
      evidenceRefs: evidenceRefs.slice(0, 4).map(event => ({
        eventType: String(event && event.eventType || ''),
        sequence: Number.isFinite(Number(event && event.sequence)) ? Math.floor(Number(event.sequence)) : null,
        actingSeat: String(event && event.actingSeat || '')
      })).filter(event => event.eventType)
    };
  },
  renderLiveLoadoutRecommendation(review, phase = 'idle') {
    const recommendation = review && review.loadoutRecommendation ? this.getLiveLoadoutRecommendation(review.loadoutRecommendation) : null;
    if (!recommendation) return '';
    const editable = this.canEditLiveLoadout(phase);
    const evidenceLine = recommendation.evidenceRefs
      .map(event => `${event.eventType}${event.sequence !== null ? ` #${event.sequence}` : ''}`)
      .join(' / ');
    return `
      <div
        class="pvp-live-loadout-recommendation"
        data-live-loadout-recommendation
        data-live-loadout-recommendation-source="${this.escapeHtml(recommendation.sourceVisibility)}"
        data-live-loadout-recommendation-hidden="${recommendation.usesHiddenInformation ? 'true' : 'false'}"
        data-live-loadout-recommendation-preset="${this.escapeHtml(recommendation.recommendedPresetId)}"
        data-live-loadout-recommendation-locked="${editable ? 'false' : 'true'}"
      >
        <div class="pvp-live-loadout-recommendation-head">
          <span>改谱建议</span>
          <span>${this.escapeHtml(recommendation.recommendedPresetLabel)}</span>
        </div>
        ${recommendation.reasonLine ? `<div class="pvp-live-loadout-recommendation-line">${this.escapeHtml(recommendation.reasonLine)}</div>` : ''}
        ${recommendation.practiceLine ? `<div class="pvp-live-loadout-recommendation-line">${this.escapeHtml(recommendation.practiceLine)}</div>` : ''}
        ${evidenceLine ? `<div class="pvp-live-loadout-recommendation-evidence">公开证据：${this.escapeHtml(evidenceLine)}</div>` : ''}
        <div class="pvp-live-loadout-recommendation-boundary">${this.escapeHtml(recommendation.boundaryLine)}</div>
        <div class="pvp-live-loadout-recommendation-actions">
          <button
            type="button"
            data-live-loadout-recommendation-action="apply"
            onclick="PVPScene.applyLivePostReviewLoadoutRecommendation()"
            ${editable ? '' : 'disabled aria-disabled="true"'}
          >${editable ? '一键套用' : '下一局已锁谱'}</button>
        </div>
      </div>
    `;
  },
  getLiveSettlementReport(source) {
    const report = source && typeof source === 'object' ? source : null;
    if (!report || report.reportVersion !== 'pvp-live-settlement-report-v1') return null;
    const ratingDelta = Math.floor(Number(report.ratingDelta) || 0);
    const coinsAwarded = Math.max(0, Math.floor(Number(report.coinsAwarded) || 0));
    const scoreAfter = Math.max(0, Math.floor(Number(report.scoreAfter) || 0));
    const oldScore = Math.max(0, Math.floor(Number(report.oldScore) || 0));
    const deltaText = ratingDelta > 0 ? `+${ratingDelta}` : `${ratingDelta}`;
    const supportedReasonIds = new Set(['finish_type', 'score_delta', 'reward_boundary']);
    const forbiddenReasonPattern = /rating":|\belo\b|opponentRating|expectedWinRate|ranked_authoritative|surrender_|connection_timeout|turn_timeout|ready_timeout/i;
    const reasonLines = Array.isArray(report.reasonLines)
      ? report.reasonLines
        .slice(0, 4)
        .map(reason => reason && typeof reason === 'object' ? {
          id: String(reason.id || ''),
          label: String(reason.label || ''),
          line: String(reason.line || ''),
          sourceVisibility: String(reason.sourceVisibility || 'server_authoritative_settlement'),
          usesHiddenInformation: !!reason.usesHiddenInformation,
          rankedImpact: String(reason.rankedImpact || 'none')
        } : null)
        .filter(reason => reason
          && supportedReasonIds.has(reason.id)
          && reason.label
          && reason.line
          && !reason.usesHiddenInformation
          && !forbiddenReasonPattern.test(`${reason.label} ${reason.line} ${reason.sourceVisibility} ${reason.rankedImpact}`))
      : [];
    return {
      reportVersion: 'pvp-live-settlement-report-v1',
      sourceVisibility: String(report.sourceVisibility || 'server_authoritative_settlement'),
      usesHiddenInformation: !!report.usesHiddenInformation,
      rankedImpact: String(report.rankedImpact || 'official'),
      settlementSource: String(report.settlementSource || 'live_ranked'),
      formalResultPolicy: String(report.formalResultPolicy || 'ranked_authoritative'),
      result: String(report.result || ''),
      finishReason: String(report.finishReason || ''),
      oldScore,
      scoreAfter,
      ratingDelta,
      coinsAwarded,
      settledAt: Math.max(0, Math.floor(Number(report.settledAt) || 0)),
      summaryLine: String(report.summaryLine || `正式积分 ${deltaText} · 当前 ${scoreAfter} · 天道币 +${coinsAwarded}`),
      reasonLines,
      boundary: String(report.boundary || '本报告来自服务端权威 live ranked 结算；好友约战、问道练习和无效局不会生成正式结算报告。'),
      seasonHonorReport: this.getLiveSeasonHonorReport(report.seasonHonorReport)
    };
  },
  getLiveSeasonHonorReport(source) {
    const report = source && typeof source === 'object' ? source : null;
    if (!report || report.reportVersion !== 'pvp-live-season-honor-v1') return null;
    const gamesPlayed = Math.max(1, Math.floor(Number(report.gamesPlayed) || 1));
    const wins = Math.max(0, Math.floor(Number(report.wins) || 0));
    const losses = Math.max(0, Math.floor(Number(report.losses) || 0));
    const nextMilestone = report.nextMilestone && typeof report.nextMilestone === 'object' ? report.nextMilestone : {};
    return {
      reportVersion: 'pvp-live-season-honor-v1',
      seasonId: String(report.seasonId || 's1-genesis'),
      seasonName: String(report.seasonName || '开天赛季'),
      sourceVisibility: String(report.sourceVisibility || 'server_authoritative_settlement'),
      usesHiddenInformation: !!report.usesHiddenInformation,
      rankedImpact: String(report.rankedImpact || 'honor_only'),
      powerImpact: String(report.powerImpact || 'none'),
      gamesPlayed,
      wins,
      losses,
      milestoneLabel: String(report.milestoneLabel || (gamesPlayed === 1 ? '首场入账' : `本季 ${gamesPlayed} 场`)),
      nextMilestone: {
        targetGames: Math.max(gamesPlayed, Math.floor(Number(nextMilestone.targetGames) || gamesPlayed)),
        remainingGames: Math.max(0, Math.floor(Number(nextMilestone.remainingGames) || 0)),
        label: String(nextMilestone.label || '赛季荣誉节点已更新')
      },
      cosmeticReward: this.getLiveSeasonHonorReward(report.cosmeticReward),
      summaryLine: String(report.summaryLine || `赛季荣誉 ${gamesPlayed} 场 · 胜 ${wins} / 负 ${losses}`),
      nextGoalLine: String(report.nextGoalLine || '把本局公开结论带到下一局真人排位。'),
      boundary: String(report.boundary || '只记录赛季荣誉、复盘目标和外观向回访，不改变生命、伤害、抽牌、灵力、起手或匹配。')
    };
  },
  getLiveSeasonHonorReward(source) {
    const reward = source && typeof source === 'object' ? source : null;
    if (!reward || reward.reportVersion !== 'pvp-live-season-honor-reward-v1') return null;
    const nextReward = reward.nextReward && typeof reward.nextReward === 'object' ? reward.nextReward : {};
    const collectionReport = reward.collectionReport && typeof reward.collectionReport === 'object' ? reward.collectionReport : null;
    const rewardName = String(reward.rewardName || '赛季荣誉外观');
    return {
      reportVersion: 'pvp-live-season-honor-reward-v1',
      rewardId: String(reward.rewardId || 's1_genesis_honor_mark_1'),
      rewardType: String(reward.rewardType || 'cosmetic_badge'),
      rewardName,
      rewardState: reward.rewardState === 'preview' ? 'preview' : 'earned',
      collectionState: reward.collectionState === 'newly_unlocked' ? 'newly_unlocked' : reward.collectionState === 'owned' ? 'owned' : 'earned',
      rewardImpact: String(reward.rewardImpact || 'cosmetic_only'),
      powerImpact: String(reward.powerImpact || 'none'),
      sourceVisibility: String(reward.sourceVisibility || 'server_authoritative_settlement'),
      usesHiddenInformation: !!reward.usesHiddenInformation,
      unlockedAt: Math.max(0, Math.floor(Number(reward.unlockedAt) || 0)),
      collectionSize: Math.max(0, Math.floor(Number(reward.collectionSize) || 0)),
      collectionReport: collectionReport ? {
        reportVersion: 'pvp-live-season-honor-collection-v1',
        seasonId: String(collectionReport.seasonId || 's1-genesis'),
        rewardImpact: String(collectionReport.rewardImpact || 'cosmetic_only'),
        powerImpact: String(collectionReport.powerImpact || 'none'),
        totalUnlocked: Math.max(0, Math.floor(Number(collectionReport.totalUnlocked) || 0)),
        lastUnlockedRewardId: String(collectionReport.lastUnlockedRewardId || ''),
        boundary: String(collectionReport.boundary || '赛季荣誉收藏只保存外观成就，不授予卡牌、属性、资源、起手、匹配或战斗效果。')
      } : null,
      unlockLine: String(reward.unlockLine || `已点亮外观目标：${rewardName}`),
      progressLine: String(reward.progressLine || '本季外观目标已更新'),
      nextReward: {
        targetGames: Math.max(1, Math.floor(Number(nextReward.targetGames) || 1)),
        remainingGames: Math.max(0, Math.floor(Number(nextReward.remainingGames) || 0)),
        rewardId: String(nextReward.rewardId || ''),
        rewardType: String(nextReward.rewardType || 'cosmetic_badge'),
        rewardName: String(nextReward.rewardName || '下一档外观目标'),
        label: String(nextReward.label || '下一档外观目标已更新')
      },
      boundary: String(reward.boundary || '仅用于赛季荣誉展示和外观回访，不授予卡牌、属性、资源、起手、匹配或战斗效果。')
    };
  },
  renderLiveSettlementReport(review) {
    const report = review && review.settlementReport ? this.getLiveSettlementReport(review.settlementReport) : null;
    if (!report) return '';
    const deltaText = report.ratingDelta > 0 ? `+${report.ratingDelta}` : `${report.ratingDelta}`;
    const resultLabel = report.result === 'win' ? '胜局结算' : report.result === 'loss' ? '败局结算' : '终局结算';
    const policyLabel = this.formatLivePolicyLabel(report.formalResultPolicy);
    const honor = report.seasonHonorReport;
    const getCollectionLabel = (state) => state === 'newly_unlocked' ? '新入库' : state === 'owned' ? '已入库' : '待入库';
    const reasonMarkup = report.reasonLines.length ? `
        <div class="pvp-live-settlement-reasons" data-live-settlement-reasons>
          ${report.reasonLines.map(reason => `
            <div
              class="pvp-live-settlement-reason"
              data-live-settlement-reason="${this.escapeHtml(reason.id)}"
              data-live-settlement-reason-source="${this.escapeHtml(reason.sourceVisibility)}"
              data-live-settlement-reason-impact="${this.escapeHtml(reason.rankedImpact)}"
            >
              <span>${this.escapeHtml(reason.label)}</span>
              <span>${this.escapeHtml(reason.line)}</span>
            </div>
          `).join('')}
        </div>
      ` : '';
    return `
      <div
        class="pvp-live-settlement-report"
        data-live-settlement-report
        data-live-settlement-source="${this.escapeHtml(report.sourceVisibility)}"
        data-live-settlement-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
      >
        <div class="pvp-live-settlement-head">
          <span>${this.escapeHtml(resultLabel)}</span>
          <span>${this.escapeHtml(policyLabel)}</span>
        </div>
        <div class="pvp-live-settlement-summary">${this.escapeHtml(report.summaryLine)}</div>
        <div class="pvp-live-settlement-grid">
          <span>原积分 ${this.escapeHtml(report.oldScore)}</span>
          <span>正式积分 ${this.escapeHtml(deltaText)}</span>
          <span>当前 ${this.escapeHtml(report.scoreAfter)}</span>
          <span>天道币 +${this.escapeHtml(report.coinsAwarded)}</span>
        </div>
        ${reasonMarkup}
        <div class="pvp-live-settlement-boundary">${this.escapeHtml(report.boundary)}</div>
        ${honor ? `
          <div
            class="pvp-live-season-honor"
            data-live-season-honor
            data-live-season-honor-power="${this.escapeHtml(honor.powerImpact)}"
          >
            <div class="pvp-live-season-honor-head">
              <span>赛季荣誉</span>
              <span>${this.escapeHtml(honor.milestoneLabel)}</span>
            </div>
            <div class="pvp-live-season-honor-summary">${this.escapeHtml(honor.summaryLine)}</div>
            <div class="pvp-live-season-honor-next">${this.escapeHtml(honor.nextMilestone.label)} · ${this.escapeHtml(honor.nextGoalLine)}</div>
            ${honor.cosmeticReward ? `
              <div
                class="pvp-live-season-honor-reward"
                data-live-season-honor-reward
                data-live-season-honor-reward-impact="${this.escapeHtml(honor.cosmeticReward.rewardImpact)}"
                data-live-season-honor-reward-state="${this.escapeHtml(honor.cosmeticReward.rewardState)}"
                data-live-season-honor-reward-collection="${this.escapeHtml(honor.cosmeticReward.collectionState)}"
              >
                <div class="pvp-live-season-honor-reward-head">
                  <span>外观目标</span>
                  <span>${this.escapeHtml(honor.cosmeticReward.rewardState === 'earned' ? '已点亮' : '预览')} · ${this.escapeHtml(getCollectionLabel(honor.cosmeticReward.collectionState))}</span>
                </div>
                <div class="pvp-live-season-honor-reward-name">${this.escapeHtml(honor.cosmeticReward.rewardName)}</div>
                <div class="pvp-live-season-honor-reward-collection">收藏状态：${this.escapeHtml(getCollectionLabel(honor.cosmeticReward.collectionState))} · 本季已入库 ${this.escapeHtml(honor.cosmeticReward.collectionSize)} 项</div>
                <div class="pvp-live-season-honor-reward-progress">${this.escapeHtml(honor.cosmeticReward.unlockLine)} · ${this.escapeHtml(honor.cosmeticReward.progressLine)}</div>
                <div class="pvp-live-season-honor-reward-next">${this.escapeHtml(honor.cosmeticReward.nextReward.label)}</div>
                <div class="pvp-live-season-honor-reward-boundary">${this.escapeHtml(honor.cosmeticReward.boundary)}</div>
              </div>
            ` : ''}
            <div class="pvp-live-season-honor-boundary">${this.escapeHtml(honor.boundary)}</div>
          </div>
        ` : ''}
      </div>
    `;
  },
  renderLiveFriendlySeries(report) {
    const series = this.getLiveFriendlySeries(report);
    if (!series) return '';
    const impactLabel = this.formatLivePolicyLabel(series.rankedImpact);
    const seatPolicyLabel = this.formatLivePolicyLabel(series.seatPolicy);
    const nameA = series.sourceParticipants.A.displayName || '甲方';
    const nameB = series.sourceParticipants.B.displayName || '乙方';
    const scoreLabel = `${nameA} ${series.scoreBySourceSeat.A} : ${series.scoreBySourceSeat.B} ${nameB}`;
    const seriesLabel = series.status === 'waiting_rematch'
      ? '等待对手确认 · 可取消等待'
      : series.status === 'cancelled'
        ? '等待已取消 · 可从复盘重新发起'
        : series.status === 'expired'
          ? '等待已过期 · 可从复盘重新发起'
          : series.winnerSourceSeat
            ? `系列结束 · ${series.winnerSourceSeat === 'A' ? nameA : nameB} 先到 ${series.targetWins} 胜`
            : series.canRequestNextRound ? '系列未决 · 可继续决胜局' : '系列进行中';
    return `
      <div
        class="pvp-live-friendly-series"
        data-live-friendly-series
        data-live-friendly-series-status="${this.escapeHtml(series.status || '')}"
        data-live-friendly-series-id="${this.escapeHtml(series.seriesId || '')}"
        data-live-friendly-series-source-match="${this.escapeHtml(series.sourceMatchId || '')}"
        data-live-friendly-series-confirmations="${this.escapeHtml(series.confirmationCount || 0)}"
      >
        <span>${this.escapeHtml(series.roundLabel)} · ${this.escapeHtml(scoreLabel)}</span>
        <span>${this.escapeHtml(seriesLabel)} · ${this.escapeHtml(impactLabel)}</span>
        <span>系列 ${this.escapeHtml(series.seriesId.slice(0, 12) || '--')} · ${this.escapeHtml(seatPolicyLabel)}</span>
      </div>
    `;
  },
  getLivePublicEventData(event) {
    const source = event && event.publicData && typeof event.publicData === 'object' ? event.publicData : {};
    const allowedKeys = [
      'firstSeat',
      'nextSeat',
      'seatId',
      'count',
      'targetSeat',
      'protectedSeat',
      'minimumHp',
      'preventedDamage',
      'wouldHaveHp',
      'rawDamage',
      'actualDamage',
      'budgetedDamage',
      'blockedDamage',
      'hpDamage',
      'targetHp',
      'block',
      'totalBlock',
      'completedTurns',
      'roundIndex',
      'turnIndex',
      'winnerSeat',
      'loserSeat',
      'finishReason',
      'reason',
      'cost',
      'remainingEnergy'
    ];
    return allowedKeys.reduce((publicData, key) => {
      const value = source[key];
      if (value === undefined || value === null) return publicData;
      if (typeof value === 'number') {
        publicData[key] = Number.isFinite(value) ? value : 0;
      } else if (typeof value === 'boolean') {
        publicData[key] = value;
      } else if (typeof value === 'string') {
        publicData[key] = String(value).slice(0, 64);
      }
      return publicData;
    }, {});
  },
  getLivePublicEventRef(event) {
    const eventType = String(event && event.eventType || '');
    if (!eventType) return null;
    const ref = {
      eventType,
      sequence: Number.isFinite(Number(event && event.sequence)) ? Math.floor(Number(event.sequence)) : null,
      actingSeat: String(event && event.actingSeat || '')
    };
    const publicData = this.getLivePublicEventData(event);
    if (Object.keys(publicData).length > 0) {
      ref.publicData = publicData;
    }
    return ref;
  },
  getLiveExperienceReport(source) {
    const report = source && typeof source === 'object' && source.experienceReport
      ? source.experienceReport
      : source && typeof source === 'object' ? source : null;
    if (!report) return null;
    const checks = Array.isArray(report.fairnessChecks) ? report.fairnessChecks : [];
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-experience-report-v1'),
      title: String(report.title || '双方体验诊断'),
      sourceVisibility: String(report.sourceVisibility || 'public_events'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      explicitSourceSafety: this.isExplicitLivePublicNoImpactReport(report),
      nonGameRisk: String(report.nonGameRisk || 'watch'),
      nonGameRiskReasons: Array.isArray(report.nonGameRiskReasons) ? report.nonGameRiskReasons.map(item => String(item || '')).filter(Boolean).slice(0, 6) : [],
      agencyLabel: String(report.agencyLabel || '公开窗口待复查'),
      decisionWindowCount: Math.max(0, Math.floor(Number(report.decisionWindowCount) || 0)),
      seatWindowSummary: {
        firstSeat: report.seatWindowSummary && report.seatWindowSummary.firstSeat ? String(report.seatWindowSummary.firstSeat) : '',
        secondSeat: report.seatWindowSummary && report.seatWindowSummary.secondSeat ? String(report.seatWindowSummary.secondSeat) : '',
        secondSeatWindowObserved: !!(report.seatWindowSummary && report.seatWindowSummary.secondSeatWindowObserved),
        terminalBeforeSecondSeatWindow: !!(report.seatWindowSummary && report.seatWindowSummary.terminalBeforeSecondSeatWindow)
      },
      effectiveActionReport: report.effectiveActionReport && typeof report.effectiveActionReport === 'object' ? {
        reportVersion: String(report.effectiveActionReport.reportVersion || 'pvp-live-effective-action-report-v1'),
        sourceVisibility: String(report.effectiveActionReport.sourceVisibility || 'public_events'),
        usesHiddenInformation: report.effectiveActionReport.usesHiddenInformation === true,
        rankedImpact: String(report.effectiveActionReport.rankedImpact || 'none'),
        secondSeat: report.effectiveActionReport.secondSeat ? String(report.effectiveActionReport.secondSeat) : '',
        secondSeatState: String(report.effectiveActionReport.secondSeatState || 'watch'),
        observedActionKinds: Array.isArray(report.effectiveActionReport.observedActionKinds)
          ? report.effectiveActionReport.observedActionKinds.map(item => String(item || '')).filter(Boolean).slice(0, 6)
          : [],
        primaryActionKind: String(report.effectiveActionReport.primaryActionKind || ''),
        primaryActionLabel: String(report.effectiveActionReport.primaryActionLabel || ''),
        effectiveActionLine: String(report.effectiveActionReport.effectiveActionLine || ''),
        reasons: Array.isArray(report.effectiveActionReport.reasons)
          ? report.effectiveActionReport.reasons.map(item => String(item || '')).filter(Boolean).slice(0, 6)
          : [],
        evidence: Array.isArray(report.effectiveActionReport.evidence)
          ? report.effectiveActionReport.evidence.map(event => this.getLivePublicEventRef(event)).filter(Boolean).slice(0, 4)
          : [],
        summary: String(report.effectiveActionReport.summary || '')
      } : null,
      safeguardSummary: {
        setupReady: String(report.safeguardSummary && report.safeguardSummary.setupReady || ''),
        firstActionBudget: String(report.safeguardSummary && report.safeguardSummary.firstActionBudget || ''),
        openingProtection: String(report.safeguardSummary && report.safeguardSummary.openingProtection || ''),
        effectiveAction: String(report.safeguardSummary && report.safeguardSummary.effectiveAction || '')
      },
      summary: String(report.summary || ''),
      recommendedAction: String(report.recommendedAction || ''),
      fairnessChecks: checks.slice(0, 6).map(check => ({
        id: String(check && check.id || ''),
        label: String(check && check.label || ''),
        passed: check && check.passed === true,
        detail: String(check && check.detail || ''),
        linkedEvidence: Array.isArray(check && check.linkedEvidence)
          ? check.linkedEvidence.map(event => this.getLivePublicEventRef(event)).filter(Boolean).slice(0, 4)
          : []
      })).filter(check => check.id && check.label && check.detail)
    };
  },
  getLiveFairnessReceipt(source) {
    const report = source && typeof source === 'object' && source.fairnessReceipt
      ? source.fairnessReceipt
      : source && typeof source === 'object' && source.reportVersion === 'pvp-live-fairness-receipt-v1' ? source : null;
    if (!report || report.reportVersion !== 'pvp-live-fairness-receipt-v1') return null;
    const evidenceSummary = Array.isArray(report.evidenceSummary) ? report.evidenceSummary : [];
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-fairness-receipt-v1'),
      sourceVisibility: String(report.sourceVisibility || 'public_events'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      explicitSourceSafety: this.isExplicitLivePublicNoImpactReport(report),
      result: String(report.result || ''),
      finishReason: String(report.finishReason || ''),
      receiptState: String(report.receiptState || 'watch'),
      riskState: String(report.riskState || 'watch'),
      agencyLabel: String(report.agencyLabel || '公开窗口待复查'),
      setupVerdict: String(report.setupVerdict || ''),
      fairnessVerdict: String(report.fairnessVerdict || ''),
      budgetVerdict: String(report.budgetVerdict || ''),
      counterplayVerdict: String(report.counterplayVerdict || ''),
      windowVerdict: String(report.windowVerdict || ''),
      effectiveActionVerdict: String(report.effectiveActionVerdict || ''),
      terminalVerdict: String(report.terminalVerdict || ''),
      nextStepLine: String(report.nextStepLine || ''),
      boundary: String(report.boundary || '公平回执只汇总公开复盘证据，不读取隐藏手牌、牌库或原始事件明细。'),
      evidenceSummary: evidenceSummary.slice(0, 6).map(item => ({
        id: String(item && item.id || ''),
        label: String(item && item.label || ''),
        passed: item && item.passed === true,
        evidenceSequences: Array.isArray(item && item.evidenceSequences)
          ? item.evidenceSequences.map(sequence => Math.max(0, Math.floor(Number(sequence) || 0))).slice(0, 4)
          : []
      })).filter(item => item.id && item.label)
    };
  },
  getLiveKeyTurnReplay(source) {
    const report = source && typeof source === 'object' && source.keyTurnReplay
      ? source.keyTurnReplay
      : source && typeof source === 'object' ? source : null;
    if (!report) return null;
    const turns = Array.isArray(report.turns) ? report.turns : [];
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-key-turn-replay-v1'),
      title: String(report.title || '关键回合复盘'),
      sourceVisibility: String(report.sourceVisibility || 'public_events'),
      usesHiddenInformation: report.usesHiddenInformation === true,
      rankedImpact: String(report.rankedImpact || 'none'),
      explicitSourceSafety: this.isExplicitLivePublicNoImpactReport(report),
      summary: String(report.summary || ''),
      recommendedAction: String(report.recommendedAction || ''),
      turns: turns.slice(0, 3).map(turn => ({
        id: String(turn && turn.id || ''),
        label: String(turn && turn.label || ''),
        sequence: Number.isFinite(Number(turn && turn.sequence)) ? Math.floor(Number(turn.sequence)) : null,
        eventType: String(turn && turn.eventType || ''),
        actingSeat: String(turn && turn.actingSeat || ''),
        severity: String(turn && turn.severity || 'tempo'),
        lesson: String(turn && turn.lesson || '')
      })).filter(turn => turn.id && turn.label && turn.eventType && turn.lesson)
    };
  },
  renderLiveExperienceReport(review) {
    const report = this.getLiveExperienceReport(review);
    if (!report) return '';
    const riskLabel = report.nonGameRisk === 'low' ? '低风险' : '需观察';
    const effectiveAction = report.effectiveActionReport && report.effectiveActionReport.secondSeatState === 'confirmed'
      ? report.effectiveActionReport
      : null;
    const effectiveActionKind = effectiveAction
      ? String(effectiveAction.primaryActionKind || effectiveAction.observedActionKinds[0] || '')
      : '';
    const effectiveActionLine = effectiveAction
      ? String(effectiveAction.effectiveActionLine || effectiveAction.summary || '')
      : '';
    return `
      <div
        class="pvp-live-experience-report risk-${this.escapeHtml(report.nonGameRisk)}"
        data-live-experience-report
        data-live-experience-source="${this.escapeHtml(report.sourceVisibility)}"
        data-live-experience-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
      >
        <div class="pvp-live-experience-head">
          <span>${this.escapeHtml(report.title)}</span>
          <span>${this.escapeHtml(riskLabel)} · ${this.escapeHtml(report.agencyLabel)}</span>
        </div>
        <div class="pvp-live-experience-summary">${this.escapeHtml(report.summary)}</div>
        ${effectiveAction && effectiveActionKind && effectiveActionLine ? `
          <div
            class="pvp-live-effective-action-proof"
            data-live-effective-action-proof="${this.escapeHtml(effectiveActionKind)}"
            data-live-effective-action-kind="${this.escapeHtml(effectiveActionKind)}"
          >
            <span>${this.escapeHtml(effectiveAction.primaryActionLabel || '后手有效行动')}</span>
            <span>${this.escapeHtml(effectiveActionLine)}</span>
          </div>
        ` : ''}
        <div class="pvp-live-experience-checks">
          ${report.fairnessChecks.map(check => `
            <button
              type="button"
              class="pvp-live-experience-check ${check.passed ? 'passed' : 'watch'}"
              data-live-experience-check="${this.escapeHtml(check.id)}"
              onclick="PVPScene.handleLiveExperienceCheckFocus('${this.escapeHtml(check.id)}')"
              title="查看 ${this.escapeHtml(check.label)} 的公开证据"
            >
              <div class="pvp-live-experience-check-head">
                <span>${this.escapeHtml(check.label)}</span>
                <span>${check.passed ? '通过' : '观察'}</span>
              </div>
              <div class="pvp-live-experience-check-detail">${this.escapeHtml(check.detail)}</div>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },
  renderLiveFairnessReceipt(review) {
    const receipt = this.getLiveFairnessReceipt(review && review.fairnessReceipt ? review.fairnessReceipt : review);
    if (!receipt) return '';
    const stateLabel = receipt.receiptState === 'accepted' ? '可接受' : '需复查';
    const verdicts = [
      receipt.setupVerdict,
      receipt.fairnessVerdict,
      receipt.budgetVerdict,
      receipt.counterplayVerdict,
      receipt.windowVerdict,
      receipt.effectiveActionVerdict,
      receipt.terminalVerdict,
      receipt.nextStepLine
    ].filter(Boolean);
    return `
      <div
        class="pvp-live-fairness-receipt state-${this.escapeHtml(receipt.receiptState)}"
        data-live-fairness-receipt
        data-live-fairness-source="${this.escapeHtml(receipt.sourceVisibility)}"
        data-live-fairness-hidden="${receipt.usesHiddenInformation ? 'true' : 'false'}"
        data-live-fairness-state="${this.escapeHtml(receipt.receiptState)}"
      >
        <div class="pvp-live-fairness-head">
          <span>公平回执</span>
          <span>${this.escapeHtml(stateLabel)} · ${this.escapeHtml(receipt.agencyLabel)}</span>
        </div>
        <div class="pvp-live-fairness-verdicts">
          ${verdicts.slice(0, 7).map(line => `<span>${this.escapeHtml(line)}</span>`).join('')}
        </div>
        <div class="pvp-live-fairness-evidence">
          ${receipt.evidenceSummary.map(item => {
            const checkId = String(item.id || '');
            const handlerArg = this.escapeHtml(JSON.stringify(checkId));
            return `
              <button
                type="button"
                class="${item.passed ? 'passed' : 'watch'}"
                data-live-fairness-check="${this.escapeHtml(checkId)}"
                onclick="PVPScene.handleLiveExperienceCheckFocus(${handlerArg})"
                title="定位 ${this.escapeHtml(item.label)} 的公开证据"
              >
                ${this.escapeHtml(item.label)} · ${this.escapeHtml(item.passed ? '通过' : '观察')}
                ${item.evidenceSequences.length ? ` · #${this.escapeHtml(item.evidenceSequences.join('/#'))}` : ''}
              </button>
            `;
          }).join('')}
        </div>
        <div class="pvp-live-fairness-boundary">${this.escapeHtml(receipt.boundary)}</div>
      </div>
    `;
  },
  renderLiveKeyTurnReplay(review) {
    const replay = this.getLiveKeyTurnReplay(review);
    if (!replay || replay.turns.length === 0) return '';
    return `
      <div
        class="pvp-live-key-turns"
        data-live-key-turn-replay
        data-live-key-turn-source="${this.escapeHtml(replay.sourceVisibility)}"
        data-live-key-turn-hidden="${replay.usesHiddenInformation ? 'true' : 'false'}"
      >
        <div class="pvp-live-key-turns-head">
          <span>${this.escapeHtml(replay.title)}</span>
          <span>${this.escapeHtml(replay.sourceVisibility)} · ${this.escapeHtml(replay.rankedImpact)}</span>
        </div>
        ${replay.summary ? `<div class="pvp-live-key-turns-summary">${this.escapeHtml(replay.summary)}</div>` : ''}
        <div class="pvp-live-key-turn-grid">
          ${replay.turns.map(turn => `
            <button
              type="button"
              class="pvp-live-key-turn severity-${this.escapeHtml(turn.severity)}"
              data-live-key-turn="${this.escapeHtml(turn.id)}"
              data-live-key-turn-focus="${this.escapeHtml(turn.id)}"
              onclick="PVPScene.focusLiveKeyTurn('${this.escapeHtml(turn.id)}')"
              title="定位 ${this.escapeHtml(turn.label)} 的公开事件"
            >
              <div class="pvp-live-key-turn-meta">
                <span>${this.escapeHtml(turn.label)}</span>
                <span>${turn.sequence !== null ? `#${this.escapeHtml(turn.sequence)}` : '--'} · ${this.escapeHtml(this.formatLiveEventTypeLabel(turn.eventType))}</span>
              </div>
              <div class="pvp-live-key-turn-lesson">${this.escapeHtml(turn.lesson)}</div>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },
  getLiveReviewFocusedEvents(view, reviewFocus = '') {
    const focus = String(reviewFocus || '');
    const review = this.getLivePostMatchReview(view);
    if (!review) return [];
    if (focus === 'events') return Array.isArray(review.evidence) ? review.evidence : [];
    const keyTurns = review.keyTurnReplay && Array.isArray(review.keyTurnReplay.turns)
      ? review.keyTurnReplay.turns
      : [];
    if (focus === 'key_turns') return keyTurns;
    if (focus.startsWith('key_turn:')) {
      const turnId = focus.slice('key_turn:'.length);
      const selectedTurns = keyTurns.filter(turn => String(turn && turn.id || '') === turnId);
      if (selectedTurns.length === 0) return [];
      const evidence = Array.isArray(review.evidence) ? review.evidence : [];
      const matchedEvidence = selectedTurns
        .map(turn => evidence.find(event => {
          const sameSequence = turn.sequence !== null && Number.isFinite(Number(event && event.sequence))
            && Math.floor(Number(event.sequence)) === turn.sequence;
          const sameType = String(event && event.eventType || '') === String(turn && turn.eventType || '');
          return sameSequence && sameType;
        }) || turn)
        .filter(Boolean);
      return matchedEvidence;
    }
    if (focus.startsWith('experience_check:')) {
      const checkId = focus.slice('experience_check:'.length);
      const checks = review.experienceReport && Array.isArray(review.experienceReport.fairnessChecks)
        ? review.experienceReport.fairnessChecks
        : [];
      const check = checks.find(item => String(item && item.id || '') === checkId);
      return check && Array.isArray(check.linkedEvidence) ? check.linkedEvidence : [];
    }
    return [];
  },
  renderLiveEventRows(events = []) {
    const list = Array.isArray(events) ? events : [];
    return list.map(event => {
      const formatted = this.formatLiveEvent(event);
      return `
        <div class="pvp-live-event-row" data-live-event-row data-live-event-type="${this.escapeHtml(formatted.type)}">
          <span class="pvp-live-event-main">${this.escapeHtml(formatted.label)}</span>
          <span class="pvp-live-event-detail">${this.escapeHtml(formatted.detail)}</span>
        </div>
      `;
    }).join('');
  },
  isLivePublicNoImpactReport(report = null) {
    const source = report && typeof report === 'object' ? report : null;
    return !!source
      && source.sourceVisibility === 'public_events'
      && source.usesHiddenInformation === false
      && source.rankedImpact === 'none';
  },
  getRawLivePostReviewPracticeReport(source = null, key = '') {
    const root = source && typeof source === 'object' ? source : null;
    if (!root || !key) return null;
    const nested = root[key] && typeof root[key] === 'object' ? root[key] : null;
    if (nested && nested[key] && typeof nested[key] === 'object') return nested[key];
    return nested;
  },
  isExplicitLivePublicNoImpactReport(report = null) {
    const source = report && typeof report === 'object' ? report : null;
    if (source && Object.prototype.hasOwnProperty.call(source, 'explicitSourceSafety')) {
      return source.explicitSourceSafety === true
        && source.sourceVisibility === 'public_events'
        && source.usesHiddenInformation === false
        && source.rankedImpact === 'none';
    }
    return !!source
      && Object.prototype.hasOwnProperty.call(source, 'sourceVisibility')
      && Object.prototype.hasOwnProperty.call(source, 'usesHiddenInformation')
      && Object.prototype.hasOwnProperty.call(source, 'rankedImpact')
      && source.sourceVisibility === 'public_events'
      && source.usesHiddenInformation === false
      && source.rankedImpact === 'none';
  },
	  hasUnsafeLivePostReviewPracticeSource(review = null) {
	    const source = review && typeof review === 'object' ? review : null;
	    if (!source) return true;
	    const hasReplay = !!source.keyTurnReplay;
	    const hasExperience = !!source.experienceReport;
    const replay = hasReplay ? this.getRawLivePostReviewPracticeReport(source, 'keyTurnReplay') : null;
    const experience = hasExperience ? this.getRawLivePostReviewPracticeReport(source, 'experienceReport') : null;
	    return (hasReplay && !this.isExplicitLivePublicNoImpactReport(replay))
	      || (hasExperience && !this.isExplicitLivePublicNoImpactReport(experience));
	  },
	  getLivePostReviewNextStepGuide(review = null, phase = 'idle') {
	    const source = review && typeof review === 'object' ? review : null;
	    if (!source) return null;
	    const actions = Array.isArray(source.nextActions) ? source.nextActions : [];
	    if (actions.length === 0) return null;
	    const actionById = new Map(actions.map(action => [String(action && action.id || ''), action]).filter(([id]) => id));
	    const hasAction = (id) => actionById.has(id);
	    const rawExperience = source.experienceReport ? this.getRawLivePostReviewPracticeReport(source, 'experienceReport') : null;
	    const rawReplay = source.keyTurnReplay ? this.getRawLivePostReviewPracticeReport(source, 'keyTurnReplay') : null;
	    const rawReceipt = source.fairnessReceipt ? this.getRawLivePostReviewPracticeReport(source, 'fairnessReceipt') : null;
	    if ((rawExperience && !this.isExplicitLivePublicNoImpactReport(rawExperience))
	      || (rawReplay && !this.isExplicitLivePublicNoImpactReport(rawReplay))
	      || (rawReceipt && !this.isExplicitLivePublicNoImpactReport(rawReceipt))) {
	      return null;
	    }
	    const experience = rawExperience ? this.getLiveExperienceReport(rawExperience) : null;
	    const replay = rawReplay ? this.getLiveKeyTurnReplay(rawReplay) : null;
	    const receipt = rawReceipt ? this.getLiveFairnessReceipt(rawReceipt) : null;
	    const recommendation = source.loadoutRecommendation ? this.getLiveLoadoutRecommendation(source.loadoutRecommendation) : null;
	    const friendlySeries = source.friendlySeries ? this.getLiveFriendlySeries(source.friendlySeries) : null;
	    const recommendedActions = [
	      experience && experience.recommendedAction,
	      replay && replay.recommendedAction
	    ].map(item => String(item || '')).filter(Boolean);
	    const receiptLine = String(receipt && receipt.nextStepLine || '');
	    const acceptedLowRiskLoss = source.result === 'loss'
	      && experience
	      && experience.nonGameRisk === 'low'
	      && receipt
	      && receipt.receiptState === 'accepted'
	      && receipt.riskState === 'low';
	    const needsReviewFirst = !acceptedLowRiskLoss && (source.result === 'loss'
	      || (experience && experience.nonGameRisk === 'watch')
	      || (receipt && (receipt.receiptState === 'watch' || receipt.riskState === 'watch'))
	      || /复盘|关键|窗口|练习/.test(receiptLine));
	    let primaryId = '';
	    if (friendlySeries && friendlySeries.canRequestNextRound && hasAction('friendly_rematch')) {
	      primaryId = 'friendly_rematch';
	    } else if (acceptedLowRiskLoss && recommendation && hasAction('adjust_loadout')) {
	      primaryId = 'adjust_loadout';
	    } else if (acceptedLowRiskLoss && hasAction('practice')) {
	      primaryId = 'practice';
	    } else if (source.result === 'win' && hasAction('queue_again') && !(experience && experience.nonGameRisk === 'watch')) {
	      primaryId = 'queue_again';
	    } else if (needsReviewFirst && hasAction('review_key_turns') && (replay && replay.turns.length > 0 || /关键|复盘|窗口/.test(receiptLine))) {
	      primaryId = 'review_key_turns';
	    } else if ((recommendedActions.includes('practice') || needsReviewFirst) && hasAction('practice')) {
	      primaryId = 'practice';
	    } else if (recommendation && hasAction('adjust_loadout')) {
	      primaryId = 'adjust_loadout';
	    } else if (hasAction('queue_again')) {
	      primaryId = 'queue_again';
	    } else {
	      primaryId = String(actions[0] && actions[0].id || '');
	    }
	    if (!primaryId || !hasAction(primaryId)) return null;
	    const secondaryOrder = primaryId === 'friendly_rematch'
	      ? ['queue_again', 'practice', 'review_events']
	      : primaryId === 'review_key_turns'
	      ? ['practice', 'adjust_loadout', 'queue_again', 'review_events']
	      : primaryId === 'practice'
	        ? ['queue_again', 'adjust_loadout', 'review_events']
	        : primaryId === 'queue_again'
	          ? ['practice', 'friendly_rematch', 'review_events']
	          : ['practice', 'queue_again', 'review_key_turns', 'review_events'];
	    const secondaryId = secondaryOrder.find(id => id !== primaryId && hasAction(id)) || '';
	    const getAction = (id, rank) => {
	      const action = actionById.get(id);
	      if (!action) return null;
	      return {
	        id,
	        rank,
	        auditActionId: String(action.auditActionId || id),
	        label: String(action.label || id),
	        detail: String(action.detail || action.label || id),
	        disabled: this.isLivePostReviewActionDisabled(id, phase)
	      };
	    };
	    const guideActions = [
	      getAction(primaryId, 'primary'),
	      secondaryId ? getAction(secondaryId, 'secondary') : null
	    ].filter(Boolean);
	    const summaryByPrimary = {
	      review_key_turns: '先复盘关键回合，再进入问道练习复刻公开窗口。',
	      practice: '先进入问道练习复刻公开窗口，再手动决定是否继续真人排位。',
	      queue_again: '本局公开轨迹可解释，可以带着结论继续真人排位。',
	      adjust_loadout: '先按公开改谱建议调整候选斗法谱，再决定练习或回排。',
	      friendly_rematch: '先低压力再战或换边复现，再决定是否回到真人排位。',
	      review_events: '先查看权威事件序列，再决定练习、改谱或继续排位。'
	    };
	    const reasonLine = receiptLine
	      || String(experience && experience.summary || '')
	      || String(replay && replay.summary || '')
	      || String(recommendation && recommendation.reasonLine || '')
	      || String(source.summary || '');
	    return {
	      reportVersion: 'pvp-live-post-review-next-step-v1',
	      sourceVisibility: 'public_review',
	      usesHiddenInformation: false,
	      rankedImpact: 'none',
	      recommendedAction: primaryId,
	      primaryActionId: primaryId,
	      summaryLine: summaryByPrimary[primaryId] || '按公开复盘建议选择下一步。',
	      reasonLine,
	      boundaryLine: primaryId === 'practice' || secondaryId === 'practice'
	        ? '问道练习不写正式积分；继续真人排位仍需玩家手动点击。'
	        : '只使用公开赛后建议；不会自动入队，也不会改写本局正式积分。',
	      actions: guideActions
	    };
	  },
	  renderLivePostReviewNextStepGuide(review = null, phase = 'idle') {
	    const guide = this.getLivePostReviewNextStepGuide(review, phase);
	    if (!guide) return '';
	    return `
	      <div
	        class="pvp-live-next-step-guide"
	        data-live-post-review-next-step
	        data-live-post-review-next-step-source="${this.escapeHtml(guide.sourceVisibility)}"
	        data-live-post-review-next-step-hidden="${guide.usesHiddenInformation ? 'true' : 'false'}"
	        data-live-post-review-next-step-impact="${this.escapeHtml(guide.rankedImpact)}"
	        data-live-post-review-next-step-primary="${this.escapeHtml(guide.primaryActionId)}"
	        data-live-post-review-next-step-recommended-action="${this.escapeHtml(guide.recommendedAction)}"
	      >
	        <div class="pvp-live-next-step-head">
	          <span>下一步建议</span>
	          <span>${this.escapeHtml(guide.actions[0] && guide.actions[0].label || '公开建议')}</span>
	        </div>
	        <div class="pvp-live-next-step-summary">${this.escapeHtml(guide.summaryLine)}</div>
	        ${guide.reasonLine ? `<div class="pvp-live-next-step-reason">${this.escapeHtml(guide.reasonLine)}</div>` : ''}
	        <div class="pvp-live-next-step-boundary">${this.escapeHtml(guide.boundaryLine)}</div>
	        <div class="pvp-live-next-step-actions">
	          ${guide.actions.map(action => {
	            const handlerArg = this.escapeHtml(JSON.stringify(action.id));
	            return `
	              <button
	                type="button"
	                data-live-post-review-next-step-action="${this.escapeHtml(action.id)}"
	                data-live-post-review-next-step-rank="${this.escapeHtml(action.rank)}"
	                data-live-post-review-audit-action="${this.escapeHtml(action.auditActionId)}"
	                onclick="PVPScene.handleLivePostReviewAction(${handlerArg})"
	                title="${this.escapeHtml(action.detail)}"
	                ${action.disabled ? 'disabled aria-disabled="true"' : ''}
	              >${this.escapeHtml(action.label)}</button>
	            `;
	          }).join('')}
	        </div>
	      </div>
	    `;
	  },
	  buildLivePostReviewPracticePlan(review = null) {
	    const source = review && typeof review === 'object' ? review : null;
	    if (!source) return null;
    if (this.hasUnsafeLivePostReviewPracticeSource(source)) return null;
    const replay = source.keyTurnReplay ? this.getLiveKeyTurnReplay(source.keyTurnReplay) : null;
    const experience = source.experienceReport ? this.getLiveExperienceReport(source.experienceReport) : null;
    const turns = Array.isArray(replay && replay.turns) ? replay.turns : [];
    const checks = Array.isArray(experience && experience.fairnessChecks) ? experience.fairnessChecks : [];
    const tempoScript = turns.slice(0, 3).map(turn => {
      const eventType = String(turn.eventType || '');
      const severity = String(turn.severity || 'tempo');
      const prompt = eventType === 'battle_started'
        ? '先复刻开局读题：确认先后手、护体和第一拍资源。'
        : eventType === 'match_finished' || eventType === 'player_surrendered'
          ? '复刻终局前一拍：确认是否还有防守、调息或反打窗口。'
          : severity === 'pressure'
            ? '复刻压力窗口：先保留低费响应，再决定是否抢节奏。'
            : '复刻公开关键回合：只按公开事件练操作顺序。';
      return {
        id: String(turn.id || eventType || 'tempo_window'),
        label: String(turn.label || '关键窗口'),
        sequence: Number.isFinite(Number(turn.sequence)) ? Math.floor(Number(turn.sequence)) : null,
        eventType,
        actingSeat: String(turn.actingSeat || ''),
        severity,
        lesson: String(turn.lesson || ''),
        drillPrompt: prompt
      };
    }).filter(item => item.id && item.eventType && item.lesson);
    const focusChecks = checks.filter(check => check && (check.passed !== true || ['decision_windows', 'first_action_budget', 'opening_protection'].includes(String(check.id || ''))));
    const fairnessFocus = (focusChecks.length ? focusChecks : checks).slice(0, 3).map(check => ({
      id: String(check.id || ''),
      label: String(check.label || ''),
      status: check.passed === true ? 'passed' : 'watch',
      detail: String(check.detail || '')
    })).filter(item => item.id && item.label && item.detail);
    if (tempoScript.length === 0 && fairnessFocus.length === 0) return null;
    const resultLabel = source.result === 'loss' ? '首败' : source.result === 'win' ? '胜局' : '终局';
    return {
      reportVersion: 'pvp-live-practice-plan-v1',
      sourceVisibility: 'public_events',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      objectiveLine: `${resultLabel}练习：按公开关键回合复刻节奏，不写正式积分。`,
      coachLine: experience && experience.nonGameRisk === 'watch'
        ? '先补足可读行动窗口，再回真人排位验证。'
        : '先复刻本局有效节奏，再尝试同谱稳定打出。',
      guardrailLine: '训练计划只读公开事件和本人赛后复盘，不读取隐藏手牌、牌库或原始事件明细。',
      tempoScript,
      fairnessFocus
    };
  },
  renderLivePostReviewPracticePlan(review = null) {
    const plan = this.buildLivePostReviewPracticePlan(review);
    if (!plan) return '';
    return `
      <div
        class="pvp-live-practice-plan"
        data-live-practice-plan
        data-live-practice-plan-source="${this.escapeHtml(plan.sourceVisibility)}"
        data-live-practice-plan-hidden="${plan.usesHiddenInformation ? 'true' : 'false'}"
        data-live-practice-plan-impact="${this.escapeHtml(plan.rankedImpact)}"
      >
        <div class="pvp-live-practice-plan-head">
          <span>问道练习单</span>
          <span>${this.escapeHtml(plan.sourceVisibility)} · ${this.escapeHtml(plan.rankedImpact)}</span>
        </div>
        <div class="pvp-live-practice-plan-objective">${this.escapeHtml(plan.objectiveLine)}</div>
        <div class="pvp-live-practice-plan-coach">${this.escapeHtml(plan.coachLine)}</div>
        ${plan.tempoScript.length ? `
          <div class="pvp-live-practice-plan-grid">
            ${plan.tempoScript.map(step => {
              const stepId = String(step.id || '');
              const handlerArg = this.escapeHtml(JSON.stringify(stepId));
              return `
                <button
                  type="button"
                  class="pvp-live-practice-plan-step severity-${this.escapeHtml(step.severity)}"
                  data-live-practice-plan-key-turn="${this.escapeHtml(stepId)}"
                  onclick="PVPScene.focusLiveKeyTurn(${handlerArg})"
                  title="定位 ${this.escapeHtml(step.label)} 的公开事件"
                >
                  <span>${this.escapeHtml(step.label)}</span>
                  <span>${step.sequence !== null ? `#${this.escapeHtml(step.sequence)}` : '--'} · ${this.escapeHtml(this.formatLiveEventTypeLabel(step.eventType))}</span>
                  <strong>${this.escapeHtml(step.drillPrompt)}</strong>
                </button>
              `;
            }).join('')}
          </div>
        ` : ''}
        ${plan.fairnessFocus.length ? `
          <div class="pvp-live-practice-plan-checks">
            ${plan.fairnessFocus.map(check => {
              const checkId = String(check.id || '');
              const handlerArg = this.escapeHtml(JSON.stringify(checkId));
              return `
                <button
                  type="button"
                  class="pvp-live-practice-plan-check ${this.escapeHtml(check.status)}"
                  data-live-practice-plan-check="${this.escapeHtml(checkId)}"
                  onclick="PVPScene.handleLiveExperienceCheckFocus(${handlerArg})"
                  title="定位 ${this.escapeHtml(check.label)} 的公开体验证据"
                >
                  <span>${this.escapeHtml(check.label)} · ${this.escapeHtml(check.status === 'passed' ? '通过' : '观察')}</span>
                  <strong>${this.escapeHtml(check.detail)}</strong>
                </button>
              `;
            }).join('')}
          </div>
        ` : ''}
        <div class="pvp-live-practice-plan-guardrail">${this.escapeHtml(plan.guardrailLine)}</div>
      </div>
    `;
  },
  getLiveSeasonGoalSeasonId(view) {
    const seasonId = String(view && view.matchQuality && view.matchQuality.seasonId || '').trim();
    return seasonId || 's1-genesis';
  },
  getLiveSeasonGoalRecommendedMode(review) {
    const actionIds = new Set((Array.isArray(review && review.nextActions) ? review.nextActions : [])
      .map(action => String(action && action.id || ''))
      .filter(Boolean));
    const seasonGoalActions = new Set(['friendly_rematch', 'adjust_loadout', 'practice', 'queue_again']);
    const nextStepGuide = this.getLivePostReviewNextStepGuide(review, 'finished');
    const nextStepAction = String(nextStepGuide && nextStepGuide.primaryActionId || '');
    if (seasonGoalActions.has(nextStepAction) && actionIds.has(nextStepAction)) return nextStepAction;
    const experienceReport = review && review.experienceReport ? this.getLiveExperienceReport(review.experienceReport) : null;
    if ((review && review.result === 'loss') || (experienceReport && experienceReport.nonGameRisk === 'watch')) {
      if (actionIds.has('practice')) return 'practice';
      if (actionIds.has('adjust_loadout')) return 'adjust_loadout';
    }
    const friendlySeries = review && review.friendlySeries ? this.getLiveFriendlySeries(review.friendlySeries) : null;
    if (friendlySeries && friendlySeries.canRequestNextRound && actionIds.has('friendly_rematch')) return 'friendly_rematch';
    if (review && review.result === 'win' && actionIds.has('queue_again')) return 'queue_again';
    if (actionIds.has('adjust_loadout')) return 'adjust_loadout';
    if (actionIds.has('queue_again')) return 'queue_again';
    return 'practice';
  },
  getLiveSeasonGoalCopy(mode, review, goalState = null) {
    const result = String(review && review.result || '');
    const recoveryState = String(goalState && goalState.recoveryState || '');
    if (recoveryState === 'practice_recommended') {
      return {
        label: '问道练习',
        title: '本赛季下一局目标：连续短局先练再排',
        detail: String(goalState && goalState.recoveryLine || '') || '连续低行动感失败后，先用练习复刻公开窗口，再手动决定是否继续真人排位。'
      };
    }
    const copies = {
      practice: {
        label: '问道练习',
        title: result === 'loss' ? '本赛季下一局目标：先练失守窗口' : '本赛季下一局目标：复刻关键节奏',
        detail: result === 'loss'
          ? '把首败拆成一个公开课题，先用练习复现压力窗口，再回到真人排位。'
          : '用练习复刻本局有效节奏，确认它不是偶然手顺。'
      },
      queue_again: {
        label: '继续真人排位',
        title: '本赛季下一局目标：带着结论再打一局',
        detail: '本局公开轨迹可解释，下一局继续验证同一套节奏是否稳定。'
      },
      friendly_rematch: {
        label: '低压力再战',
        title: '本赛季下一局目标：同对手换边复现',
        detail: '邀请本局对手进行不计正式结果的再战，验证先后手和调谱差异。'
      },
      adjust_loadout: {
        label: '调整斗法谱',
        title: '本赛季下一局目标：先改一个弱点',
        detail: '只围绕复盘暴露的一个公开弱点调谱，避免一口气改掉整套打法。'
      }
    };
    return copies[mode] || copies.practice;
  },
  getLiveSeasonGoalCard(view) {
    const review = this.getLivePostMatchReview(view);
    if (!review) return null;
    const seasonId = this.getLiveSeasonGoalSeasonId(view);
    const session = this.getLiveSession();
    const matchId = String(view && view.matchId || review && review.matchId || '');
    const stored = session && typeof session.syncSeasonGoalFromReview === 'function'
      ? session.syncSeasonGoalFromReview({
        seasonId,
        matchId,
        review
      })
      : session && typeof session.getSeasonGoalState === 'function'
        ? session.getSeasonGoalState(seasonId)
        : { seasonId, lastReviewAction: '', recommendedMode: '', dismissedUntilSeason: '' };
    const actionIds = new Set((Array.isArray(review && review.nextActions) ? review.nextActions : [])
      .map(action => String(action && action.id || ''))
      .filter(Boolean));
    const storedRecommendedMode = String(stored && stored.recommendedMode || '');
    const recommendedMode = storedRecommendedMode && actionIds.has(storedRecommendedMode)
      ? storedRecommendedMode
      : this.getLiveSeasonGoalRecommendedMode(review);
    const copy = this.getLiveSeasonGoalCopy(recommendedMode, review, stored);
    const dismissed = stored && stored.dismissedUntilSeason === seasonId;
    return {
      reportVersion: 'pvp-live-season-goal-v1',
      sourceVisibility: 'public_review',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      seasonId,
      dismissState: dismissed ? 'dismissed_for_trigger' : 'active',
      recommendedMode,
      actionLabel: copy.label,
      title: copy.title,
      detail: copy.detail,
      boundary: '只记录本地复盘目标，不写正式积分或奖励。',
      lastReviewAction: String(stored && stored.lastReviewAction || ''),
      badExperienceStreak: Math.max(0, Math.floor(Number(stored && stored.badExperienceStreak) || 0)),
      recoveryState: String(stored && stored.recoveryState || 'stable'),
      recoveryReason: String(stored && stored.recoveryReason || ''),
      recoveryLine: String(stored && stored.recoveryLine || ''),
      updatedAt: Math.max(0, Math.floor(Number(stored && stored.updatedAt) || 0))
    };
  },
  renderLiveSeasonGoalCard(view) {
    const goal = this.getLiveSeasonGoalCard(view);
    if (!goal || goal.dismissState !== 'active') return '';
    return `
      <div
        class="pvp-live-season-goal"
        data-live-season-goal
        data-live-season-goal-mode="${this.escapeHtml(goal.recommendedMode)}"
        data-live-season-goal-dismiss-state="${this.escapeHtml(goal.dismissState)}"
        data-live-season-goal-source="${this.escapeHtml(goal.sourceVisibility)}"
        data-live-season-goal-hidden="${goal.usesHiddenInformation ? 'true' : 'false'}"
      >
        <div class="pvp-live-season-goal-head">
          <span>${this.escapeHtml(goal.title)}</span>
          <span>${this.escapeHtml(goal.actionLabel)}</span>
        </div>
        <div class="pvp-live-season-goal-detail">${this.escapeHtml(goal.detail)}</div>
        <div class="pvp-live-season-goal-boundary">${this.escapeHtml(goal.boundary)}</div>
        ${goal.lastReviewAction ? `<div class="pvp-live-season-goal-last">上次复盘动作：${this.escapeHtml(goal.lastReviewAction)}</div>` : ''}
        <div class="pvp-live-season-goal-actions">
          <button
            type="button"
            data-live-season-goal-action="${this.escapeHtml(goal.recommendedMode)}"
            onclick="PVPScene.handleLivePostReviewAction('${this.escapeHtml(goal.recommendedMode)}')"
          >${this.escapeHtml(goal.actionLabel)}</button>
          <button
            type="button"
            data-live-season-goal-dismiss="${this.escapeHtml(goal.seasonId)}"
            onclick="PVPScene.dismissLiveSeasonGoal('${this.escapeHtml(goal.seasonId)}')"
          >本次不再提示</button>
        </div>
      </div>
    `;
  },
  recordLiveSeasonGoalAction(actionId) {
    const state = this.getLiveSession().getState();
    const view = state && state.stateView ? state.stateView : null;
    const goal = this.getLiveSeasonGoalCard(view);
    const session = this.getLiveSession();
    if (!goal || !session || typeof session.recordSeasonGoalAction !== 'function') return null;
    return session.recordSeasonGoalAction({
      seasonId: goal.seasonId,
      actionId,
      recommendedMode: goal.recommendedMode,
      matchId: state.matchId || view && view.matchId || ''
    });
  },
  dismissLiveSeasonGoal(seasonId = '') {
    const session = this.getLiveSession();
    if (session && typeof session.dismissSeasonGoal === 'function') {
      session.dismissSeasonGoal(seasonId || this.getLiveSeasonGoalSeasonId(this.getLiveSession().getState()?.stateView));
    }
    this.liveInlineHint = '已关闭当前复盘目标提示；这只影响本地显示，不写正式积分或奖励。';
    this.renderLivePanel();
    const root = document.querySelector('[data-live-pvp-root]');
    const hint = root ? root.querySelector('[data-live-last-error]') : null;
    if (hint) hint.textContent = this.liveInlineHint;
  },
  isLivePostReviewActionDisabled(actionId, phase = 'idle') {
    if (phase !== 'waiting_rematch') return false;
    return ['friendly_rematch', 'adjust_loadout', 'practice', 'queue_again'].includes(String(actionId || ''));
  },
  applyLivePostReviewLoadoutRecommendation() {
    const session = this.getLiveSession();
    const state = session && typeof session.getState === 'function' ? session.getState() : null;
    const phase = state && state.phase ? state.phase : 'idle';
    const review = this.getLivePostMatchReview(state && state.stateView ? state.stateView : null);
    const recommendation = review && review.loadoutRecommendation ? this.getLiveLoadoutRecommendation(review.loadoutRecommendation) : null;
    const root = document.querySelector('[data-live-pvp-root]');
    const setHint = (message) => {
      this.liveInlineHint = message;
      const hint = root ? root.querySelector('[data-live-last-error]') : null;
      if (hint) hint.textContent = message;
      if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(message);
      }
    };
    if (!recommendation) {
      setHint('当前复盘没有可套用的公开改谱建议。');
      return;
    }
    if (!this.canEditLiveLoadout(phase)) {
      setHint('当前对局已锁谱；改谱建议只能用于下一局入队前。');
      return;
    }
    const presets = this.getLiveLoadoutPresets();
    const preset = presets.find(item => item.id === recommendation.recommendedPresetId);
    if (!preset) {
      setHint('推荐斗法谱暂不可用；本次不会改动入队候选。');
      return;
    }
    this.liveSelectedLoadoutPreset = preset.id;
    this.liveLoadoutReviewFocused = true;
    this.liveLoadoutReviewFocusReason = 'loadout_recommendation';
    this.renderLivePanel();
    const nextRoot = document.querySelector('[data-live-pvp-root]');
    const loadoutPanel = nextRoot ? nextRoot.querySelector('.pvp-live-loadout-selector') : null;
    if (loadoutPanel) {
      loadoutPanel.setAttribute('data-live-review-focus', 'loadout_recommendation');
      if (typeof loadoutPanel.scrollIntoView === 'function') {
        loadoutPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    const message = `已套用${preset.label}到下一局入队候选；不自动排队，也不写正式积分。`;
    this.liveInlineHint = message;
    const hint = nextRoot ? nextRoot.querySelector('[data-live-last-error]') : null;
    if (hint) hint.textContent = message;
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(message);
    }
  },
  async copyLiveReplayShareLink(shareLink = '') {
    const text = String(shareLink || '').trim();
    if (!text) return false;
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.warn('[PVP Live] clipboard write failed', error);
      }
    }
    if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
      try {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', 'readonly');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
        document.body.removeChild(input);
        return !!copied;
      } catch (error) {
        console.warn('[PVP Live] clipboard fallback failed', error);
      }
    }
    return false;
  },
  async revokeLiveReplayShare() {
    const session = this.getLiveSession();
    const root = document.querySelector('[data-live-pvp-root]');
    const setHint = (message) => {
      this.liveInlineHint = message;
      const hint = root ? root.querySelector('[data-live-last-error]') : null;
      if (hint) hint.textContent = message;
      if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(message);
      }
    };
    if (!session || typeof session.revokeReplayShare !== 'function') {
      setHint('实时论道战报分享撤销服务未就绪。');
      return;
    }
    const nextState = await session.revokeReplayShare();
    this.renderLivePanel();
    if (nextState && nextState.lastError && nextState.lastError.reason === 'replay_share_revoked') {
      setHint(nextState.lastError.message || '公开战报链接已撤销。');
      return;
    }
    setHint(nextState && nextState.lastError && nextState.lastError.message || '公开战报分享撤销失败。');
  },
  normalizeLiveReplayShareToken(value = '') {
    const token = String(value || '').trim();
    return /^pvplrs-[a-zA-Z0-9_-]{24,80}$/.test(token) ? token : '';
  },
  activateLiveReplayShareViewerSurface() {
    if (typeof document === 'undefined') return;
    this.activeTab = 'live';
    document.querySelectorAll('.rune-tab').forEach(btn => btn.classList.remove('active'));
    const liveTabButton = document.querySelector('.rune-tab[data-pvp-tab="live"]');
    if (liveTabButton) liveTabButton.classList.add('active');
    document.querySelectorAll('.pvp-tab-pane').forEach(el => {
      el.classList.remove('active');
      el.style.display = '';
    });
    const livePane = document.getElementById('tab-live');
    if (livePane) livePane.classList.add('active');
  },
  async openLiveReplayShareViewer(shareToken = '') {
    const token = this.normalizeLiveReplayShareToken(shareToken);
    const gameRef = this.getGameRef();
    if (gameRef && typeof gameRef.showScreen === 'function') {
      gameRef.showScreen('pvp-screen');
    }
    this.activateLiveReplayShareViewerSurface();
    if (!token) {
      this.liveReplayShareViewer = {
        status: 'error',
        shareToken: '',
        message: '公开战报链接无效或已损坏。'
      };
      this.renderLiveReplayShareViewer();
      return this.liveReplayShareViewer;
    }
    this.liveReplayShareViewer = {
      status: 'loading',
      shareToken: token,
      message: '正在读取公开战报...'
    };
    this.renderLiveReplayShareViewer();
    try {
      if (!PVPService || !PVPService.live || typeof PVPService.live.getReplayShare !== 'function') {
        throw new Error('公开战报分享服务未就绪');
      }
      const result = await PVPService.live.getReplayShare(token);
      if (!result || result.success === false) {
        const reason = String(result && (result.reason || result.message) || 'replay_share_unavailable');
        this.liveReplayShareViewer = {
          status: 'error',
          shareToken: token,
          reason,
          message: result && result.message ? String(result.message) : '公开战报已失效或暂不可读。'
        };
        this.renderLiveReplayShareViewer();
        return this.liveReplayShareViewer;
      }
      this.liveReplayShareViewer = {
        status: 'ready',
        shareToken: token,
        share: result.share && typeof result.share === 'object' ? result.share : null,
        replay: result.replay && typeof result.replay === 'object' ? result.replay : null,
        message: '公开战报已载入。'
      };
      this.renderLiveReplayShareViewer();
      return this.liveReplayShareViewer;
    } catch (error) {
      this.liveReplayShareViewer = {
        status: 'error',
        shareToken: token,
        reason: error && error.reason || 'replay_share_fetch_failed',
        message: error && error.message ? error.message : '公开战报读取失败。'
      };
      this.renderLiveReplayShareViewer();
      return this.liveReplayShareViewer;
    }
  },
  renderLiveReplayShareViewer() {
    if (typeof document === 'undefined') return '';
    const root = document.querySelector('[data-live-pvp-root]');
    const host = root && typeof root.querySelector === 'function'
      ? root.querySelector('[data-live-replay-share-viewer-root]')
      : document.querySelector('[data-live-replay-share-viewer-root]');
    if (!host) return '';
    const viewer = this.liveReplayShareViewer;
    if (!viewer) {
      host.hidden = true;
      host.innerHTML = '';
      return '';
    }
    host.hidden = false;
    const status = String(viewer.status || 'idle');
    host.setAttribute('data-live-replay-share-viewer-status', status);
    const markup = this.renderLiveReplayShareViewerMarkup(viewer);
    host.innerHTML = markup;
    return markup;
  },
  getLiveReplayShareViewerSnapshot() {
    const viewer = this.liveReplayShareViewer && typeof this.liveReplayShareViewer === 'object'
      ? this.liveReplayShareViewer
      : null;
    if (!viewer) return null;
    const share = viewer.share && typeof viewer.share === 'object' ? viewer.share : {};
    const replay = viewer.replay && typeof viewer.replay === 'object' ? viewer.replay : {};
    const publicSummary = replay.publicSummary && typeof replay.publicSummary === 'object' ? replay.publicSummary : {};
    const hiddenScan = replay.hiddenScan && typeof replay.hiddenScan === 'object' ? replay.hiddenScan : {};
    return {
      reportVersion: 'pvp-live-replay-share-viewer-v1',
      status: String(viewer.status || 'idle'),
      publicOnly: true,
      sourceVisibility: String(share.sourceVisibility || share.visibilityLayer || replay.visibilityLayer || 'replay_public'),
      visibilityLayer: String(replay.visibilityLayer || share.visibilityLayer || 'replay_public'),
      matchRef: String(share.matchRef || ''),
      message: String(viewer.message || ''),
      reason: String(viewer.reason || ''),
      publicSummary: {
        status: String(publicSummary.status || ''),
        winnerSeat: String(publicSummary.winnerSeat || ''),
        loserSeat: String(publicSummary.loserSeat || ''),
        finishReason: String(publicSummary.finishReason || '')
      },
      eventCount: Math.max(0, Math.floor(Number(replay.eventCount) || (Array.isArray(replay.events) ? replay.events.length : 0))),
      hiddenScan: {
        forbiddenTokenCount: Math.max(0, Math.floor(Number(hiddenScan.forbiddenTokenCount) || 0)),
        forbiddenKeyCount: Math.max(0, Math.floor(Number(hiddenScan.forbiddenKeyCount) || 0)),
        forbiddenStringCount: Math.max(0, Math.floor(Number(hiddenScan.forbiddenStringCount) || 0))
      },
      highlights: this.getLiveReplayShareHighlights(replay, publicSummary)
    };
  },
  getLiveReplayShareHighlights(replay = {}, publicSummary = {}) {
    const events = Array.isArray(replay && replay.events) ? replay.events : [];
    const highlights = [];
    const usedKinds = new Set();
    const pushHighlight = (kind, title, event, fallbackDetail = '') => {
      if (usedKinds.has(kind) || highlights.length >= 4) return;
      const sequence = Number.isFinite(Number(event && event.sequence))
        ? Math.max(0, Math.floor(Number(event.sequence)))
        : 0;
      const formatted = event ? this.formatLiveEvent(event) : null;
      const detail = String(formatted && formatted.detail || fallbackDetail || '').trim();
      highlights.push({
        kind,
        title,
        sequence,
        label: formatted && formatted.label ? String(formatted.label) : title,
        detail
      });
      usedKinds.add(kind);
    };

    for (const event of events) {
      const type = String(event && event.eventType || '');
      if (type === 'battle_started') {
        pushHighlight('opening', '开局', event);
      } else if ([
        'opening_protection_triggered',
        'opening_second_seat_buffer_granted',
        'opening_counterplay_granted',
        'budget_clamped'
      ].includes(type)) {
        pushHighlight('counterplay', '反打窗口', event);
      } else if ([
        'status_applied',
        'status_consumed',
        'status_mitigated',
        'hp_recovered',
        'card_cycled',
        'block_gained'
      ].includes(type)) {
        pushHighlight('turning', '转折', event);
      } else if ([
        'match_finished',
        'match_invalidated',
        'player_surrendered',
        'ready_timeout',
        'connection_timeout',
        'turn_timeout'
      ].includes(type)) {
        pushHighlight('finish', '终局', event);
      }
    }

    if (!usedKinds.has('finish') && publicSummary && publicSummary.finishReason) {
      const winnerSeat = String(publicSummary.winnerSeat || '--');
      const loserSeat = String(publicSummary.loserSeat || '--');
      const finishLabel = this.formatLiveFinishReasonLabel(publicSummary.finishReason || '');
      pushHighlight('finish', '终局', null, `${finishLabel} · 胜方 ${winnerSeat} / 败方 ${loserSeat}`);
    }

    return highlights;
  },
  renderLiveReplayShareViewerMarkup(viewer = {}) {
    const status = String(viewer.status || 'idle');
    if (status === 'loading') {
      return `
        <section class="pvp-live-replay-share-card" data-live-replay-share-viewer data-live-replay-share-viewer-status="loading">
          <div class="pvp-live-dispute-receipt-head">
            <span>公开战报</span>
            <span>replay_public</span>
          </div>
          <div class="pvp-live-dispute-receipt-line">正在读取公开战报...</div>
        </section>
      `;
    }
    if (status === 'error') {
      return `
        <section class="pvp-live-replay-share-card error" data-live-replay-share-viewer data-live-replay-share-viewer-status="error">
          <div class="pvp-live-dispute-receipt-head">
            <span>公开战报不可用</span>
            <span>${this.escapeHtml(viewer.reason || 'unavailable')}</span>
          </div>
          <div class="pvp-live-dispute-receipt-line">${this.escapeHtml(viewer.message || '公开战报已失效或暂不可读。')}</div>
          <div class="pvp-live-dispute-receipt-boundary">公开 viewer 只读取 replay_public，不读取本人回放、隐藏手牌、牌库或结算奖励。</div>
        </section>
      `;
    }
    const share = viewer.share && typeof viewer.share === 'object' ? viewer.share : {};
    const replay = viewer.replay && typeof viewer.replay === 'object' ? viewer.replay : {};
    const publicSummary = replay.publicSummary && typeof replay.publicSummary === 'object' ? replay.publicSummary : {};
    const visibility = String(replay.visibilityLayer || share.visibilityLayer || 'replay_public');
    const finishLabel = this.formatLiveFinishReasonLabel(publicSummary.finishReason || '');
    const winnerSeat = String(publicSummary.winnerSeat || '--');
    const loserSeat = String(publicSummary.loserSeat || '--');
    const matchRef = String(share.matchRef || '--');
    const eventCount = Math.max(0, Math.floor(Number(replay.eventCount) || (Array.isArray(replay.events) ? replay.events.length : 0)));
    const hiddenScan = replay.hiddenScan && typeof replay.hiddenScan === 'object' ? replay.hiddenScan : {};
    const highlights = this.getLiveReplayShareHighlights(replay, publicSummary);
    const highlightRows = highlights.length > 0 ? highlights.map((item) => {
      const sequence = item.sequence ? `#${item.sequence} · ` : '';
      return `
        <div class="pvp-live-replay-share-highlight" data-live-replay-share-highlight="${this.escapeHtml(item.kind)}">
          <span class="pvp-live-replay-share-highlight-title">${this.escapeHtml(item.title)}</span>
          <span class="pvp-live-replay-share-highlight-main">${this.escapeHtml(sequence)}${this.escapeHtml(item.label)}</span>
          <span class="pvp-live-replay-share-highlight-detail">${this.escapeHtml(item.detail || '公开事件已记录')}</span>
        </div>
      `;
    }).join('') : '<div class="pvp-live-empty">暂无关键节点</div>';
    const events = Array.isArray(replay.events) ? replay.events.slice(0, 16) : [];
    const eventRows = events.length > 0 ? events.map(event => {
      const formatted = this.formatLiveEvent(event);
      const sequence = Number.isFinite(Number(event && event.sequence)) ? `#${Math.floor(Number(event.sequence))} · ` : '';
      return `
        <div class="pvp-live-event-row" data-live-replay-share-event="${this.escapeHtml(formatted.type)}">
          <span class="pvp-live-event-main">${this.escapeHtml(sequence)}${this.escapeHtml(formatted.label)}</span>
          <span class="pvp-live-event-detail">${this.escapeHtml(formatted.detail)}</span>
        </div>
      `;
    }).join('') : '<div class="pvp-live-empty">暂无公开事件</div>';
    const forbiddenTotal = Math.max(0, Math.floor(Number(hiddenScan.forbiddenTokenCount) || 0))
      + Math.max(0, Math.floor(Number(hiddenScan.forbiddenKeyCount) || 0))
      + Math.max(0, Math.floor(Number(hiddenScan.forbiddenStringCount) || 0));
    return `
      <section
        class="pvp-live-replay-share-card"
        data-live-replay-share-viewer
        data-live-replay-share-viewer-status="ready"
        data-live-replay-share-viewer-visibility="${this.escapeHtml(visibility)}"
        data-live-replay-share-viewer-public-only="true"
      >
        <div class="pvp-live-dispute-receipt-head">
          <span>公开战报</span>
          <span>${this.escapeHtml(visibility)}</span>
        </div>
        <div class="pvp-live-replay-share-summary" data-live-replay-share-summary>
          <span>战报 ${this.escapeHtml(matchRef)}</span>
          <span>${this.escapeHtml(finishLabel)}</span>
          <span>胜方 ${this.escapeHtml(winnerSeat)} / 败方 ${this.escapeHtml(loserSeat)}</span>
          <span>公开事件 ${this.escapeHtml(eventCount)}</span>
        </div>
        <div class="pvp-live-dispute-receipt-evidence">隐私扫描 ${this.escapeHtml(forbiddenTotal)} 项命中 · 不含原始战局 ID · 不含本人结算或赛季荣誉</div>
        <div class="pvp-live-replay-share-highlights" data-live-replay-share-highlight-list>
          <div class="pvp-live-replay-share-highlight-head">关键节点</div>
          ${highlightRows}
        </div>
        <div class="pvp-live-event-log" data-live-replay-share-event-log>${eventRows}</div>
        <div class="pvp-live-dispute-receipt-boundary">${this.escapeHtml(share.boundary || '公开战报分享只暴露 replay_public 脱敏回放，不读取隐藏手牌、牌库、随机种子或本人结算。')}</div>
      </section>
    `;
  },
  renderLiveDisputeReportReceipt() {
    const state = this.getLiveSession().getState();
    const activeMatchId = String(state && (state.matchId || state.stateView && state.stateView.matchId) || '');
    const receipt = this.getLiveDisputeReportReceipt(state && state.lastDisputeReport);
    if (!receipt || (receipt.evidencePackage.matchId && activeMatchId && receipt.evidencePackage.matchId !== activeMatchId)) {
      return '';
    }
    const tags = receipt.evidencePackage.riskTags.length
      ? receipt.evidencePackage.riskTags.join(' / ')
      : 'player_reported';
    return `
      <div
        class="pvp-live-dispute-receipt"
        data-live-dispute-report
        data-live-dispute-report-status="${this.escapeHtml(receipt.status)}"
        data-live-dispute-report-hidden="${receipt.usesHiddenInformation ? 'true' : 'false'}"
        data-live-dispute-report-ranked-impact="${this.escapeHtml(receipt.rankedImpact)}"
      >
        <div class="pvp-live-dispute-receipt-head">
          <span>异常反馈已提交</span>
          <span>${this.escapeHtml(receipt.reportId || 'reported')}</span>
        </div>
        <div class="pvp-live-dispute-receipt-line">${this.escapeHtml(receipt.nextStepLine)}</div>
        <div class="pvp-live-dispute-receipt-evidence">公开证据 ${this.escapeHtml(receipt.evidencePackage.eventCount)} 条 · ${this.escapeHtml(tags)}</div>
        <div class="pvp-live-dispute-receipt-boundary">${this.escapeHtml(receipt.boundary)}</div>
      </div>
    `;
  },
  renderLiveAvoidOpponentReceipt() {
    const state = this.getLiveSession().getState();
    const activeMatchId = String(state && (state.matchId || state.stateView && state.stateView.matchId) || '');
    const receipt = this.getLiveAvoidOpponentReceipt(state && state.lastAvoidOpponentReport);
    if (!receipt || (receipt.sourceMatchId && activeMatchId && receipt.sourceMatchId !== activeMatchId)) {
      return '';
    }
    return `
      <div
        class="pvp-live-dispute-receipt pvp-live-avoid-receipt"
        data-live-avoid-opponent
        data-live-avoid-opponent-status="${this.escapeHtml(receipt.status)}"
        data-live-avoid-opponent-hidden="${receipt.usesHiddenInformation ? 'true' : 'false'}"
        data-live-avoid-opponent-ranked-impact="${this.escapeHtml(receipt.rankedImpact)}"
        data-live-avoid-opponent-safeguard="${this.escapeHtml(receipt.safeguard)}"
      >
        <div class="pvp-live-dispute-receipt-head">
          <span>已优先避开此对手</span>
          <span>${this.escapeHtml(receipt.safeguard || 'player_avoid_opponent')}</span>
        </div>
        <div class="pvp-live-dispute-receipt-line">${this.escapeHtml(receipt.nextStepLine)}</div>
        <div class="pvp-live-dispute-receipt-evidence">不改写本局结算 · 不读取隐藏信息 · 后续匹配优先避开</div>
        <div class="pvp-live-dispute-receipt-boundary">${this.escapeHtml(receipt.boundary)}</div>
      </div>
    `;
  },
  renderLiveReplayShareReceipt() {
    const state = this.getLiveSession().getState();
    const activeMatchId = String(state && (state.matchId || state.stateView && state.stateView.matchId) || '');
    const receipt = state && state.lastReplayShare && typeof state.lastReplayShare === 'object' ? state.lastReplayShare : null;
    const receiptMatchId = String(state && state.lastReplayShareMatchId || '');
    if (!receipt || (receiptMatchId && activeMatchId && receiptMatchId !== activeMatchId)) {
      return '';
    }
    const shareUrl = String(receipt.shareUrl || receipt.sharePath || '').trim();
    if (!shareUrl) return '';
    const revoked = receipt.revoked === true;
    const expiresAt = Math.max(0, Math.floor(Number(receipt.expiresAt) || 0));
    const expiresText = expiresAt ? `${Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000))} 天内有效` : '限时有效';
    return `
      <div
        class="pvp-live-dispute-receipt pvp-live-replay-share-receipt"
        data-live-replay-share
        data-live-replay-share-visibility="${this.escapeHtml(receipt.visibilityLayer || 'replay_public')}"
        data-live-replay-share-ranked-impact="${this.escapeHtml(receipt.rankedImpact || 'none')}"
        data-live-replay-share-revoked="${revoked ? 'true' : 'false'}"
      >
        <div class="pvp-live-dispute-receipt-head">
          <span>${revoked ? '脱敏战报链接已撤销' : '脱敏战报链接已生成'}</span>
          <span>${this.escapeHtml(revoked ? '已失效' : expiresText)}</span>
        </div>
        <div class="pvp-live-dispute-receipt-line">${this.escapeHtml(shareUrl)}</div>
        <div class="pvp-live-dispute-receipt-evidence">只包含 replay_public · 不含原始战局 ID · 不改分不派奖励</div>
        <div class="pvp-live-dispute-receipt-boundary">${this.escapeHtml(receipt.boundary || '公开战报分享只暴露脱敏回放，不读取隐藏手牌、牌库、随机种子或本人结算。')}</div>
        ${revoked ? '' : '<button class="challenge-btn secondary" type="button" data-live-replay-share-revoke onclick="PVPScene.revokeLiveReplayShare()">撤销分享</button>'}
      </div>
    `;
  },
  renderLivePostMatchReview(view, phase = 'idle') {
    const review = this.getLivePostMatchReview(view);
    if (!review) return '';
    const resultLabel = review.result === 'win' ? '胜局' : review.result === 'loss' ? '败局' : '终局';
    const finishLabel = this.formatLiveFinishReasonLabel(review.finishReason);
    return `
      <div class="pvp-live-review-head">
        <span class="pvp-live-guide-title">${this.escapeHtml(review.title)}</span>
        <span class="pvp-live-review-chip">${this.escapeHtml(resultLabel)} · ${this.escapeHtml(finishLabel)}</span>
      </div>
      <div class="pvp-live-review-summary">${this.escapeHtml(review.summary)}</div>
      ${this.renderLiveSettlementReport(review)}
      ${review.evidence.length ? `
        <div class="pvp-live-review-evidence">
          ${review.evidence.map(event => {
            const formatted = this.formatLiveEvent(event);
            return `<span title="${this.escapeHtml(formatted.detail)}">${this.escapeHtml(formatted.label)}${event.sequence !== null ? ` #${this.escapeHtml(event.sequence)}` : ''}</span>`;
          }).join('')}
        </div>
      ` : ''}
      ${review.suggestions.length ? `
        <div class="pvp-live-review-suggestions">
          ${review.suggestions.map(line => `<span>${this.escapeHtml(line)}</span>`).join('')}
        </div>
      ` : ''}
      ${this.renderLiveFriendlySeries(review.friendlySeries)}
	      ${this.renderLiveFairnessReceipt(review)}
	      ${this.renderLiveExperienceReport(review)}
	      ${this.renderLiveKeyTurnReplay(review)}
	      ${this.renderLivePostReviewNextStepGuide(review, phase)}
	      ${this.renderLivePostReviewPracticePlan(review)}
	      ${this.renderLiveSeasonGoalCard(view)}
      ${this.renderLiveLoadoutRecommendation(review, phase)}
      <div class="pvp-live-review-actions">
        ${review.nextActions.map(action => `
          <button
            type="button"
            data-live-post-review-action="${this.escapeHtml(action.id)}"
            data-live-post-review-audit-action="${this.escapeHtml(action.auditActionId || action.id)}"
            onclick="PVPScene.handleLivePostReviewAction('${this.escapeHtml(action.id)}')"
            title="${this.escapeHtml(action.detail || action.label)}"
            ${this.isLivePostReviewActionDisabled(action.id, phase) ? 'disabled' : ''}
          >${this.escapeHtml(action.label)}</button>
        `).join('')}
      </div>
      ${this.renderLiveReplayShareReceipt()}
      ${this.renderLiveDisputeReportReceipt()}
      ${this.renderLiveAvoidOpponentReceipt()}
    `;
  },
  buildLivePostReviewDrillScenario(state = null) {
    const sourceState = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    const view = sourceState && sourceState.stateView ? sourceState.stateView : null;
    const review = this.getLivePostMatchReview(view);
    const rawReview = view && view.postMatchReview && typeof view.postMatchReview === 'object' ? view.postMatchReview : review;
    const matchId = String((sourceState && sourceState.matchId) || (view && view.matchId) || '').trim();
    if (!matchId || !review) return null;
    const theme = review.finishReason === 'timeout'
      ? { key: 'oracle', label: '推演控场', advice: '先练读秒前的权威局面刷新，再练保留可执行动作。' }
      : review.result === 'win'
        ? { key: 'assault', label: '前压爆发', advice: '把本局有效压制节奏复刻成可重复的前两手路线。' }
        : { key: 'bulwark', label: '稳守续航', advice: '先练低费防御、调息保留和首轮稳血，再回到真人排位。' };
    const loadoutResolution = this.resolveLivePostReviewLoadoutPreset('practice', sourceState);
    const recommendedLoadoutId = loadoutResolution && loadoutResolution.presetId
      ? loadoutResolution.presetId
      : review.result === 'loss' ? 'shield' : this.getLiveSelectedLoadoutPreset().id;
    const recommendedLoadout = this.getLiveLoadoutPresets().find(preset => preset.id === recommendedLoadoutId) || this.getLiveSelectedLoadoutPreset();
    const evidence = Array.isArray(review.evidence) ? review.evidence.slice(0, 12) : [];
    const publicEventTypes = evidence.map(event => String(event && event.eventType || '')).filter(Boolean);
    const sourceEventSequences = evidence
      .map(event => Number.isFinite(Number(event && event.sequence)) ? Math.floor(Number(event.sequence)) : null)
      .filter(sequence => sequence !== null);
    const resultLabel = review.result === 'loss' ? '首败' : review.result === 'win' ? '胜局' : '终局';
    const trainingAdvice = `真人 PVP ${resultLabel}复盘：${theme.advice}`;
    if (this.hasUnsafeLivePostReviewPracticeSource(rawReview)) return null;
    const practicePlan = this.buildLivePostReviewPracticePlan(review);
    return {
      reportVersion: 'pvp-live-drill-scenario-v1',
      sourceMatchId: matchId,
      sourceVisibility: 'replay_self',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      result: review.result,
      finishReason: review.finishReason,
      recommendedLoadoutId: recommendedLoadout.id,
      recommendedLoadoutLabel: recommendedLoadout.label,
      themeKey: theme.key,
      themeLabel: theme.label,
      trainingAdvice,
      drillObjective: `${recommendedLoadout.label}：围绕 ${theme.label} 复刻本局公开失误窗口，不写正式积分。`,
      trainingTags: ['真人 PVP', resultLabel === '首败' ? '首败复盘' : '赛后复盘', '不计积分', theme.label],
      publicEventTypes,
      sourceEventSequences,
      ...(practicePlan ? { practicePlan } : {})
    };
  },
  async commitLivePostReviewPracticeHandoff() {
    const scenario = this.buildLivePostReviewDrillScenario();
    if (!scenario) {
      this.openLivePracticeHint();
      return null;
    }
    this.liveDrillScenario = scenario;
    const gameRef = this.getGameRef();
    const focus = {
      sourceRunId: `pvp_live:${scenario.sourceMatchId}`,
      guideRecordId: `pvp_live:${scenario.sourceMatchId}`,
      chapterName: '真人 PVP 复盘',
      sourceTitle: scenario.recommendedLoadoutLabel,
      themeKey: scenario.themeKey,
      themeLabel: scenario.themeLabel,
      ratingLabel: scenario.result === 'loss' ? '首败练习' : '赛后练习',
      ratingTone: 'selected',
      trainingAdvice: scenario.trainingAdvice,
      highlightLine: scenario.drillObjective,
      routeFocusLine: '练习不写正式积分；只复用公开事件和本方可见复盘。',
      compareHint: '对照公开事件顺序、首动预算和调息窗口，不读取对手隐藏手牌或牌库。',
      trainingTags: scenario.trainingTags,
      goalHighlights: [
        `公开事件：${scenario.publicEventTypes.slice(0, 4).join(' / ') || '暂无'}`,
        `推荐谱：${scenario.recommendedLoadoutLabel}`,
        '正式积分：不变'
      ]
    };
    if (gameRef && typeof gameRef.ensureChallengeHubLoaded === 'function') {
      await gameRef.ensureChallengeHubLoaded();
    }
    if (gameRef && typeof gameRef.setObservatoryTrainingFocus === 'function') {
      gameRef.setObservatoryTrainingFocus(focus, { silent: true });
    }
    const resolution = this.resolveLivePostReviewLoadoutPreset('practice');
    const message = this.formatLivePostReviewLoadoutResolution('practice', resolution)
      || '已生成真人 PVP 练习课题：练习不写正式积分，只使用公开事件和本方复盘信息。';
    this.liveInlineHint = message;
    const root = document.querySelector('[data-live-pvp-root]');
    const hint = root ? root.querySelector('[data-live-last-error]') : null;
    if (hint) hint.textContent = message;
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(message);
    }
    let drillStarted = false;
    if (gameRef && typeof gameRef.beginPvpLiveDrillScenario === 'function') {
      drillStarted = !!gameRef.beginPvpLiveDrillScenario(scenario);
    }
    if (drillStarted) {
      return scenario;
    }
    if (gameRef && typeof gameRef.showChallengeHub === 'function') {
      await gameRef.showChallengeHub('daily');
    }
    return scenario;
  },
  formatLiveEvent(event = {}) {
    const type = String(event && event.eventType || 'event');
    const payload = event && event.publicData && typeof event.publicData === 'object'
      ? event.publicData
      : event && event.payload && typeof event.payload === 'object' ? event.payload : {};
    const actor = event && event.actingSeat ? `席位 ${event.actingSeat}` : '';
    let detail = actor;
    if (type === 'opening_protection_triggered') {
      const protectedSeat = String(payload.protectedSeat || '');
      const minimumHp = Math.max(0, Math.floor(Number(payload.minimumHp) || 0));
      const preventedDamage = Math.max(0, Math.floor(Number(payload.preventedDamage) || 0));
      detail = `${protectedSeat ? `护住 ${protectedSeat}` : '护住未行动方'} · 保底 ${minimumHp || 1} 血 · 挡下 ${preventedDamage} 点致命伤害`;
    } else if (type === 'opening_second_seat_buffer_granted') {
      const seatId = String(payload.seatId || '');
      const firstSeat = String(payload.firstSeat || '');
      const block = Math.max(0, Math.floor(Number(payload.block) || 0));
      const totalBlock = Math.max(0, Math.floor(Number(payload.totalBlock) || 0));
      detail = `${seatId ? `给 ${seatId}` : '给后手'} · 护盾 +${block} · 当前护盾 ${totalBlock}${firstSeat ? ` · 先手 ${firstSeat}` : ''}`;
    } else if (type === 'opening_counterplay_granted') {
      const seatId = String(payload.seatId || '');
      const block = Math.max(0, Math.floor(Number(payload.block) || 0));
      const totalBlock = Math.max(0, Math.floor(Number(payload.totalBlock) || 0));
      detail = `${seatId ? `给 ${seatId}` : '受保护方'} · 护盾 +${block} · 当前护盾 ${totalBlock}`;
    } else if (type === 'budget_clamped') {
      const targetSeat = String(payload.targetSeat || '');
      const preventedDamage = Math.max(0, Math.floor(Number(payload.preventedDamage) || 0));
      detail = `${targetSeat ? `目标 ${targetSeat}` : '首动'} · 压下 ${preventedDamage} 点爆发`;
    } else if (type === 'damage_applied') {
      const targetSeat = String(payload.targetSeat || '');
      const hpDamage = Math.max(0, Math.floor(Number(payload.hpDamage) || 0));
      const targetHp = Math.max(0, Math.floor(Number(payload.targetHp) || 0));
      detail = `${targetSeat ? `目标 ${targetSeat}` : '目标'} · 生命伤害 ${hpDamage} · 剩余 ${targetHp}`;
    } else if (type === 'status_applied') {
      const label = String(payload.label || '公开状态');
      const seatId = String(payload.seatId || '');
      const earliest = Math.max(0, Math.floor(Number(payload.earliestConsumeTurnIndex) || 0));
      if (payload.statusId === 'guard_stance') {
        const mitigationAmount = Math.max(0, Math.floor(Number(payload.mitigationAmount) || 0));
        detail = `${seatId || '行动方'} · ${label} · 下次生命伤害 -${mitigationAmount}`;
      } else if (payload.statusId === 'weak_focus') {
        const mitigationAmount = Math.max(0, Math.floor(Number(payload.mitigationAmount) || 0));
        detail = `${seatId ? `目标 ${seatId}` : '目标'} · ${label} · 下次出手伤害 -${mitigationAmount}`;
      } else {
        detail = `${seatId ? `目标 ${seatId}` : '目标'} · ${label} · 反制窗口后可兑现${earliest ? ` · 最早第 ${earliest} 手` : ''}`;
      }
    } else if (type === 'status_consumed') {
      const label = String(payload.label || '公开状态');
      const seatId = String(payload.seatId || '');
      const damageBonus = Math.max(0, Math.floor(Number(payload.damageBonus) || 0));
      detail = `${seatId ? `目标 ${seatId}` : '目标'} · 消耗${label} · 额外伤害 +${damageBonus}`;
    } else if (type === 'status_mitigated') {
      const label = String(payload.label || '公开状态');
      const seatId = String(payload.seatId || '');
      const mitigatedBySeat = String(payload.mitigatedBySeat || event.actingSeat || '');
      if (payload.statusId === 'guard_stance' || payload.mitigation === 'guard_stance_damage_reduction') {
        const preventedDamage = Math.max(0, Math.floor(Number(payload.preventedDamage) || 0));
        detail = `${seatId ? `目标 ${seatId}` : '目标'} · ${label}减伤 ${preventedDamage}`;
      } else if (payload.statusId === 'weak_focus' || payload.mitigation === 'public_weak_damage_reduction') {
        const preventedDamage = Math.max(0, Math.floor(Number(payload.preventedDamage) || 0));
        detail = `${seatId ? `目标 ${seatId}` : '目标'} · ${label}削减 ${preventedDamage} · 伤害降低 ${preventedDamage}`;
      } else {
        detail = `${seatId ? `目标 ${seatId}` : '目标'} · ${mitigatedBySeat ? `${mitigatedBySeat} ` : ''}稳住${label} · 阻止后续兑现`;
      }
    } else if (type === 'hp_recovered') {
      const seatId = String(payload.seatId || event.actingSeat || '');
      const recoveredHp = Math.max(0, Math.floor(Number(payload.recoveredHp) || 0));
      const hp = Math.max(0, Math.floor(Number(payload.hp) || 0));
      const maxHp = Math.max(0, Math.floor(Number(payload.maxHp) || 0));
      const capped = payload.capped === true;
      detail = recoveredHp > 0
        ? `${seatId || '行动方'} · 恢复 ${recoveredHp} · 当前 ${hp}/${maxHp}`
        : `${seatId || '行动方'} · 已到上限 · 当前 ${hp}/${maxHp}`;
      if (capped && recoveredHp > 0) detail += ' · 已到上限';
    } else if (type === 'card_cycled') {
      const seatId = String(payload.seatId || event.actingSeat || '');
      const count = Math.max(0, Math.floor(Number(payload.count) || 0));
      const handCount = Math.max(0, Math.floor(Number(payload.handCount) || 0));
      const deckCount = Math.max(0, Math.floor(Number(payload.deckCount) || 0));
      const capped = payload.capped === true;
      detail = capped
        ? `${seatId || '行动方'} · 手牌已满，抽滤暂停 · 当前手牌 ${handCount} · 牌库 ${deckCount}`
        : count > 0
          ? `${seatId || '行动方'} · 抽滤 ${count} 张 · 当前手牌 ${handCount} · 牌库 ${deckCount}`
          : `${seatId || '行动方'} · 牌库已空，抽滤暂停 · 当前手牌 ${handCount} · 牌库 ${deckCount}`;
    } else if (type === 'match_invalidated' && payload.reason) {
      detail = `原因：${this.formatLiveFinishReasonLabel(payload.reason)}`;
    } else if (type === 'match_finished') {
      detail = `胜者 ${String(payload.winnerSeat || '--')} · 败者 ${String(payload.loserSeat || '--')}`;
    } else if (type === 'battle_started') {
      detail = `先手 ${String(payload.firstSeat || '--')}`;
    } else if (type === 'mulligan_completed') {
      detail = `${String(payload.seatId || event.actingSeat || '--')} 调息 ${Math.max(0, Math.floor(Number(payload.count) || 0))} 张`;
    } else if (type === 'turn_ended') {
      detail = `下一手 ${String(payload.nextSeat || '--')}`;
    } else if (type === 'ready_timeout') {
      const seats = Array.isArray(payload.unreadySeats) ? payload.unreadySeats.join('/') : '';
      detail = seats ? `未准备：${seats}` : '准备窗口关闭';
    } else if (type === 'connection_timeout') {
      const seats = Array.isArray(payload.disconnectedSeats) ? payload.disconnectedSeats.join('/') : String(payload.seatId || '');
      detail = seats ? `断线席位：${seats}` : '重连宽限结束';
    } else if (type === 'turn_timeout') {
      const loserSeat = String(payload.loserSeat || payload.seatId || event.actingSeat || '--');
      detail = payload.finishReason === 'connection_timeout'
        ? `${loserSeat} 重连宽限结束`
        : `${loserSeat} 行动窗口超时`;
    } else if (type === 'automation_action') {
      const seatId = String(payload.seatId || event.actingSeat || '--');
      const actionType = String(payload.actionType || '');
      const automationCount = Math.max(1, Math.floor(Number(payload.automationCount) || 1));
      const actionLabel = actionType === 'defense_card'
        ? '防守牌'
        : actionType === 'end_turn' ? '结束回合' : '保底行动';
      detail = `${seatId} · 系统托管${actionLabel} · 第 ${automationCount} 次超时`;
    } else if (type === 'emote_sent') {
      const seatId = String(payload.seatId || event.actingSeat || '--');
      const label = String(payload.label || payload.emoteId || '预设表情');
      detail = `${seatId} · ${label}`;
    }
    return {
      type,
      label: this.formatLiveEventTypeLabel(type),
      detail: detail || actor || '公共事件'
    };
  },
  getLiveEmoteOptions() {
    return [
      { id: 'respect', label: '抱拳' },
      { id: 'thinking', label: '思考' },
      { id: 'well_played', label: '妙手' }
    ];
  },
  getLiveSocialPreferenceStorageKey() {
    return 'the-defier:pvp-live-social-preferences:v1';
  },
  getLivePreferenceStorage() {
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return null;
  },
  loadLiveSocialPreferences() {
    const storage = this.getLivePreferenceStorage();
    this.liveSocialPreferencesLoaded = true;
    if (!storage || typeof storage.getItem !== 'function') return { socialMuted: !!this.liveSocialMuted };
    try {
      const raw = storage.getItem(this.getLiveSocialPreferenceStorageKey());
      if (!raw) return { socialMuted: !!this.liveSocialMuted };
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'socialMuted')) {
        this.liveSocialMuted = parsed.socialMuted === true;
      }
    } catch (error) {
      this.liveSocialMuted = false;
    }
    return { socialMuted: !!this.liveSocialMuted };
  },
  saveLiveSocialPreferences() {
    const storage = this.getLivePreferenceStorage();
    const payload = {
      reportVersion: 'pvp-live-social-preferences-v1',
      preferenceScope: 'local_only',
      rankedImpact: 'none',
      socialMuted: !!this.liveSocialMuted,
      updatedAt: Date.now()
    };
    if (!storage || typeof storage.setItem !== 'function') return payload;
    try {
      storage.setItem(this.getLiveSocialPreferenceStorageKey(), JSON.stringify(payload));
    } catch (error) {
      // Local preference persistence is best-effort and must never block live PVP.
    }
    return payload;
  },
  ensureLiveSocialPreferencesLoaded() {
    if (!this.liveSocialPreferencesLoaded) this.loadLiveSocialPreferences();
    return { socialMuted: !!this.liveSocialMuted };
  },
  canSendLiveEmote(phase) {
    return phase === 'setup' || phase === 'active';
  },
  filterLiveEventsForMute(events = []) {
    this.ensureLiveSocialPreferencesLoaded();
    if (!this.liveSocialMuted) return Array.isArray(events) ? events : [];
    const state = this.getLiveSession().getState();
    const mySeat = String(state && state.seatId || '');
    return (Array.isArray(events) ? events : []).filter(event => {
      if (!event || event.eventType !== 'emote_sent') return true;
      const payload = event.payload && typeof event.payload === 'object'
        ? event.payload
        : event.publicData && typeof event.publicData === 'object' ? event.publicData : {};
      const seatId = String(payload.seatId || event.actingSeat || '');
      return seatId === mySeat;
    });
  },
  async submitLiveEmote(emoteId) {
    const option = this.getLiveEmoteOptions().find(item => item.id === emoteId);
    if (!option) return;
    const session = this.getLiveSession();
    const state = session.getState();
    if (!state || !state.matchId || !this.canSendLiveEmote(state.phase)) {
      const root = document.querySelector('[data-live-pvp-root]');
      const hint = root ? root.querySelector('[data-live-last-error]') : null;
      if (hint) hint.textContent = '表情只能在准备或对局中发送。';
      return;
    }
    await this.submitLiveIntent({
      intentId: this.makeLiveIntentId('emote'),
      intentType: 'emote',
      payload: { emoteId: option.id }
    });
    this.renderLivePanel();
  },
  toggleLiveSocialMute() {
    this.ensureLiveSocialPreferencesLoaded();
    this.liveSocialMuted = !this.liveSocialMuted;
    this.saveLiveSocialPreferences();
    this.renderLivePanel();
    const root = document.querySelector('[data-live-pvp-root]');
    const hint = root ? root.querySelector('[data-live-last-error]') : null;
    if (hint) {
      hint.textContent = this.liveSocialMuted
        ? '已静音对手表情；本地偏好已保存，只影响本机显示，不改变权威事件。'
        : '已恢复表情显示；本地偏好已保存，仍只允许预设表情，无自由文本。';
    }
  },
  renderLiveLoadoutPresets(phase = 'idle') {
    const root = document.querySelector('[data-live-pvp-root]');
    if (!root) return;
    const presetsEl = root.querySelector('[data-live-loadout-presets]');
    const selectedEl = root.querySelector('[data-live-selected-loadout]');
    const presets = this.getLiveLoadoutPresets();
    const selectedPreset = this.getLiveSelectedLoadoutPreset();
    const editable = this.canEditLiveLoadout(phase);
    if (selectedEl) {
      selectedEl.textContent = `当前：${selectedPreset.label}`;
    }
    if (!presetsEl) return;
    presetsEl.innerHTML = presets.map(preset => {
      const isSelected = preset.id === selectedPreset.id;
      return `
        <button
          type="button"
          class="pvp-live-loadout-option ${isSelected ? 'selected' : ''}"
          data-live-loadout-preset="${this.escapeHtml(preset.id)}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
          onclick="PVPScene.setLiveLoadoutPreset('${this.escapeHtml(preset.id)}')"
          ${editable ? '' : 'disabled'}
        >
          <span class="pvp-live-loadout-name">${this.escapeHtml(preset.label)}</span>
          <span class="pvp-live-loadout-desc">${this.escapeHtml(preset.summary)}</span>
        </button>
      `;
    }).join('');
  },
  getLiveLoadoutSummary(seat) {
    if (!seat || typeof seat !== 'object') return null;
    const summary = seat.loadoutSummary && typeof seat.loadoutSummary === 'object' ? seat.loadoutSummary : null;
    return {
      loadoutHash: String(seat.loadoutHash || summary && summary.loadoutHash || ''),
      label: String(summary && summary.label || '斗法谱'),
      identitySlot: String(summary && summary.identitySlot || ''),
      deckSize: Math.max(0, Math.floor(Number(summary && summary.deckSize) || 0)),
      locked: !summary || summary.locked !== false
    };
  },
  formatLiveLoadoutSummary(seat, fallback = '斗法谱：--') {
    const summary = this.getLiveLoadoutSummary(seat);
    if (!summary || !summary.loadoutHash) return fallback;
    const hash = summary.loadoutHash.slice(0, 8);
    const identity = summary.identitySlot ? ` · ${summary.identitySlot}` : '';
    const deckSize = summary.deckSize ? ` · ${summary.deckSize}张` : '';
    return `${summary.label}${identity}${deckSize} · ${hash}${summary.locked ? ' · 已锁定' : ''}`;
  },
  getLiveOpponentPublicProfile(seat) {
    const profile = seat && seat.publicProfile && typeof seat.publicProfile === 'object' ? seat.publicProfile : {};
    return {
      reportVersion: String(profile.reportVersion || 'pvp-live-ranked-opponent-profile-v1'),
      sourceVisibility: String(profile.sourceVisibility || 'ranked_public_boundary'),
      usesHiddenInformation: false,
      rankedImpact: 'none',
      alias: String(profile.alias || '对手'),
      archetypeLabel: String(profile.archetypeLabel || '流派待观察'),
      divisionBucket: String(profile.divisionBucket || ''),
      revealPolicy: String(profile.revealPolicy || 'no_precombat_build_reveal'),
      boundaryLine: String(profile.boundaryLine || '排位只展示公开状态，不展示对手斗法谱、hash 或身份槽。')
    };
  },
  formatLiveOpponentPublicProfile(seat, fallback = '公开画像：仅显示公开状态') {
    if (!seat) return fallback;
    const profile = this.getLiveOpponentPublicProfile(seat);
    const archetype = profile.archetypeLabel || '流派待观察';
    const bucket = profile.divisionBucket ? ` · ${profile.divisionBucket}` : '';
    return `公开画像：${archetype}${bucket} · 构筑隐藏`;
  },
  getLiveSnapshot() {
    this.ensureLiveSocialPreferencesLoaded();
    const session = this.getLiveSession();
    const state = session && typeof session.getState === 'function' ? session.getState() : null;
    if (!state) return null;
    const view = state.stateView || null;
    const liveDrillSourceId = String(this.liveDrillScenario && this.liveDrillScenario.sourceMatchId || '');
    const activeLiveSourceId = String(state.matchId || (view && view.matchId) || '');
    const replayMatchId = String(state.lastReplayMatchId || '');
    const replayShareMatchId = String(state.lastReplayShareMatchId || '');
    const waitingLiveSourceId = state.queueTicket ? `waiting:${state.queueTicket}` : '';
    const mode = view && view.mode === 'friendly' ? 'friendly' : 'ranked';
    const drillScenario = this.liveDrillScenario && (
      liveDrillSourceId === activeLiveSourceId
      || liveDrillSourceId === waitingLiveSourceId
      || (liveDrillSourceId.startsWith('waiting:') && !activeLiveSourceId)
      || (liveDrillSourceId.startsWith('entry_safeguard:') && !activeLiveSourceId)
    )
      ? {
          ...this.liveDrillScenario,
          trainingTags: Array.isArray(this.liveDrillScenario.trainingTags) ? this.liveDrillScenario.trainingTags.slice(0, 6) : [],
          publicEventTypes: Array.isArray(this.liveDrillScenario.publicEventTypes) ? this.liveDrillScenario.publicEventTypes.slice(0, 12) : [],
          sourceEventSequences: Array.isArray(this.liveDrillScenario.sourceEventSequences) ? this.liveDrillScenario.sourceEventSequences.slice(0, 12) : []
        }
      : null;
    return {
      phase: state.phase || 'idle',
      queueTicket: state.queueTicket || '',
      inviteCode: state.inviteCode || '',
      matchId: state.matchId || '',
      seatId: state.seatId || '',
      mode,
      stateVersion: view && Number.isFinite(Number(view.stateVersion)) ? Math.floor(Number(view.stateVersion)) : null,
      currentSeat: view ? view.currentSeat || '' : '',
      status: view ? view.status || '' : '',
      social: {
        reportVersion: 'pvp-live-social-preferences-v1',
        muted: !!this.liveSocialMuted,
        preferenceScope: 'local_only',
        sourceVisibility: 'local_preference',
        rankedImpact: 'none',
        persistence: 'local_storage',
        emotes: this.getLiveEmoteOptions().map(item => item.id)
      },
      matchQuality: this.getLiveMatchQuality(view),
      turnTimer: this.getLiveTurnTimer(view),
      timeoutAutomationForecast: this.getLiveTimeoutAutomationForecast(view, state.phase || ''),
      connectionReport: this.getLiveConnectionReport(view),
      connectionTempoReport: this.getLiveConnectionTempo(view, state),
      realtimeStatus: String(state.realtimeStatus || 'idle'),
      lastRealtimeSyncAt: Math.max(0, Math.floor(Number(state.lastRealtimeSyncAt) || 0)),
      realtimeReport: this.getLiveRealtimeReport(state),
      openingSafeguardReport: this.getLiveOpeningSafeguardReport(view),
      openerAssignment: this.getLiveOpenerAssignment(view),
      actionPreviewReport: this.getLiveActionPreviewReport(view),
      actionReceiptReport: this.getLiveActionReceiptReport(view),
      duelMomentumReport: this.getLiveDuelMomentumReport(view),
      intentSignalReport: this.getLiveIntentSignalReport(view),
      counterplayGuide: this.getLiveCounterplayGuide(view, state.phase || ''),
      actionWindowReceipt: this.getLiveActionWindowReceipt(view, state.phase || ''),
      friendlySeries: this.getLiveFriendlySeries(view && view.friendlySeries ? view.friendlySeries : state.rematchReport),
      firstMatchGuide: this.getLiveFirstMatchGuide(view),
      loadoutExplorationReport: this.getLiveLoadoutExplorationReport(view),
      postMatchReview: this.getLivePostMatchReview(view),
      seasonGoal: this.getLiveSeasonGoalCard(view),
      lastReplay: replayMatchId && replayMatchId === activeLiveSourceId ? this.getLiveReplaySummary(state.lastReplay) : null,
      lastReplayShare: replayShareMatchId && replayShareMatchId === activeLiveSourceId ? state.lastReplayShare : null,
      lastDisputeReport: state.lastDisputeReport ? this.getLiveDisputeReportReceipt(state.lastDisputeReport) : null,
      lastAvoidOpponentReport: state.lastAvoidOpponentReport ? this.getLiveAvoidOpponentReceipt(state.lastAvoidOpponentReport) : null,
      drillScenario,
      waitingReport: this.getLiveWaitingReport(state),
      inviteReport: state.inviteReport || null,
      inviteInbox: Array.isArray(state.inviteInbox) ? state.inviteInbox.slice(0, 20) : [],
      lastError: state.lastError ? {
        reason: String(state.lastError.reason || ''),
        message: String(state.lastError.message || ''),
        ...(state.lastError.connectionHealth && typeof state.lastError.connectionHealth === 'object' ? {
          connectionHealth: {
            reportVersion: String(state.lastError.connectionHealth.reportVersion || 'pvp-live-queue-connection-health-v1'),
            status: String(state.lastError.connectionHealth.status || 'blocked'),
            sampleTag: String(state.lastError.connectionHealth.sampleTag || 'client_preflight'),
            reasons: Array.isArray(state.lastError.connectionHealth.reasons)
              ? state.lastError.connectionHealth.reasons.map(item => String(item || '')).filter(Boolean).slice(0, 6)
              : [],
            actions: Array.isArray(state.lastError.connectionHealth.actions)
              ? state.lastError.connectionHealth.actions.slice(0, 4).map(action => ({
                id: String(action && action.id || ''),
                label: String(action && action.label || ''),
                detail: String(action && action.detail || '')
              })).filter(action => action.id && action.label)
              : []
          }
        } : {}),
        ...(state.lastError.matchmakingGuard && typeof state.lastError.matchmakingGuard === 'object' ? {
          matchmakingGuard: {
            reportVersion: String(state.lastError.matchmakingGuard.reportVersion || 'pvp-live-matchmaking-guard-v1'),
            status: String(state.lastError.matchmakingGuard.status || 'blocked'),
            cooldownSource: String(state.lastError.matchmakingGuard.cooldownSource || 'queue_cooldown'),
            sourceLabel: String(state.lastError.matchmakingGuard.sourceLabel || '排队冷却'),
            retryAt: Math.max(0, Math.floor(Number(state.lastError.matchmakingGuard.retryAt || state.lastError.matchmakingGuard.cooldownUntil) || 0)),
            cooldownRemainingMs: Math.max(0, Math.floor(Number(state.lastError.matchmakingGuard.cooldownRemainingMs) || 0)),
            rankedImpact: String(state.lastError.matchmakingGuard.rankedImpact || 'none'),
            actions: Array.isArray(state.lastError.matchmakingGuard.actions)
              ? state.lastError.matchmakingGuard.actions.slice(0, 4).map(action => ({
                id: String(action && action.id || ''),
                label: String(action && action.label || ''),
                detail: String(action && action.detail || '')
              })).filter(action => action.id && action.label)
              : []
          }
        } : {})
      } : null,
      lastEvents: Array.isArray(state.lastEvents) ? state.lastEvents.slice(0, 8).map(event => ({
        eventType: String(event && event.eventType || ''),
        actingSeat: String(event && event.actingSeat || ''),
        sequence: Number.isFinite(Number(event && event.sequence)) ? Math.floor(Number(event.sequence)) : null
      })) : [],
      self: view && view.self ? {
        seatId: String(view.self.seatId || ''),
        hp: Math.max(0, Math.floor(Number(view.self.hp) || 0)),
        maxHp: Math.max(0, Math.floor(Number(view.self.maxHp) || 0)),
        block: Math.max(0, Math.floor(Number(view.self.block) || 0)),
        energy: Math.max(0, Math.floor(Number(view.self.energy) || 0)),
        maxEnergy: Math.max(0, Math.floor(Number(view.self.maxEnergy) || 0)),
        ready: !!view.self.ready,
        mulliganUsed: !!view.self.mulliganUsed,
        handCount: Array.isArray(view.self.hand) ? view.self.hand.length : Math.max(0, Math.floor(Number(view.self.handCount) || 0)),
        publicStatuses: this.getLivePublicStatuses(view.self),
        loadout: this.getLiveLoadoutSummary(view.self)
      } : null,
      opponent: view && view.opponent ? {
        seatId: String(view.opponent.seatId || ''),
        hp: Math.max(0, Math.floor(Number(view.opponent.hp) || 0)),
        maxHp: Math.max(0, Math.floor(Number(view.opponent.maxHp) || 0)),
        block: Math.max(0, Math.floor(Number(view.opponent.block) || 0)),
        energy: Math.max(0, Math.floor(Number(view.opponent.energy) || 0)),
        maxEnergy: Math.max(0, Math.floor(Number(view.opponent.maxEnergy) || 0)),
        ready: !!view.opponent.ready,
        mulliganUsed: !!view.opponent.mulliganUsed,
        handCount: Math.max(0, Math.floor(Number(view.opponent.handCount) || 0)),
        publicStatuses: this.getLivePublicStatuses(view.opponent),
        ...(mode === 'friendly'
          ? { loadout: this.getLiveLoadoutSummary(view.opponent) }
          : { publicProfile: this.getLiveOpponentPublicProfile(view.opponent) })
      } : null
    };
  },
  async loadLivePanel() {
    const session = this.getLiveSession();
    const liveState = session.getState();
    if (liveState.phase === 'idle' && !liveState.queueTicket && !liveState.matchId) {
      await this.resumeLiveMatch();
      const afterMatchResume = session.getState();
      if (afterMatchResume.phase === 'idle' && !afterMatchResume.queueTicket && !afterMatchResume.matchId && typeof session.resumeCurrentInvite === 'function') {
        await session.resumeCurrentInvite();
        this.renderLivePanel();
      }
      const afterInviteResume = session.getState();
      if (afterInviteResume.phase === 'idle' && !afterInviteResume.queueTicket && !afterInviteResume.matchId && typeof session.refreshInviteInbox === 'function') {
        await session.refreshInviteInbox();
        this.renderLivePanel();
      }
      const recoveredState = this.getLiveSnapshot();
      if (this.shouldLivePoll(recoveredState)) this.startLivePolling();
      return;
    }
    this.renderLivePanel();
    const state = this.getLiveSnapshot();
    if (this.shouldLivePoll(state)) this.startLivePolling();
  },
  async resumeLiveMatch() {
    const session = this.getLiveSession();
    if (typeof session.resumeCurrentMatch === 'function') {
      await session.resumeCurrentMatch();
    }
    this.renderLivePanel();
    const state = session.getState();
    if (this.shouldLivePoll(state)) this.startLivePolling();
  },
  getLivePhaseLabel(phase) {
    const labels = {
      idle: '未入队',
      queueing: '入队中',
      waiting: '等待真人',
      waiting_invite: '等待好友加入',
      waiting_rematch: '等待再战确认',
      matched: '已匹配',
      setup: '准备调息',
      active: '对局中',
      sync_required: '需要同步权威状态',
      finished: '对局结束',
      invalidated: '无效局'
    };
    return labels[phase] || '实时论道';
  },
  renderLivePanel() {
    const root = document.querySelector('[data-live-pvp-root]');
    if (!root) {
      this.stopLiveQueueCooldownTicker();
      return;
    }
    this.ensureLiveSocialPreferencesLoaded();
    const session = this.getLiveSession();
    const state = session.getState();
    this.resolveAllLiveIntentInFlight(state);
    const view = state.stateView || null;
    const phase = state.phase || 'idle';
    root.dataset.livePhase = phase;
    root.setAttribute('data-live-phase', phase);
    const realtimeStatus = String(state.realtimeStatus || 'idle');
    root.dataset.liveRealtimeState = realtimeStatus;
    root.setAttribute('data-live-realtime-state', realtimeStatus);
    const setText = (selector, value) => {
      const el = root.querySelector(selector);
      if (el) el.textContent = value;
    };
    const statusText = this.getLivePhaseLabel(phase);
    const modeLabel = phase === 'waiting_rematch' || view && view.mode === 'friendly' ? '友谊再战' : '真人排位';
    setText('[data-live-phase-label]', statusText);
    setText('[data-live-status-chip]', phase === 'finished' ? 'FIN' : phase === 'invalidated' ? 'VOID' : phase === 'active' ? 'LIVE' : phase.toUpperCase());
    setText('[data-live-summary]', view && phase === 'setup'
      ? `${modeLabel} · 准备阶段 · 调息上限 ${view.setup && view.setup.mulliganLimit !== undefined ? view.setup.mulliganLimit : 2} 张 · 服务端版本 ${view.stateVersion || '--'}`
      : phase === 'waiting_invite'
        ? `好友约战 · 分享邀请码等待对手加入 · 不写正式积分`
      : view && phase === 'waiting_rematch'
        ? `${modeLabel} · 等待本局对手确认 · 不写正式积分 · 服务端版本 ${view.stateVersion || '--'}`
      : view && phase === 'invalidated'
        ? `${modeLabel} · 准备超时或无效局 · 不计正式积分 · 服务端版本 ${view.stateVersion || '--'}`
      : view ? `${modeLabel} · 第 ${view.roundIndex || 1} 轮 · 第 ${view.turnIndex || 1} 手 · 服务端版本 ${view.stateVersion || '--'}` : '排队、行动与终局都走 /api/pvp/live，不接旧残影结算。');
    setText('[data-live-queue-ticket]', state.queueTicket || '--');
    setText('[data-live-invite-code]', state.inviteCode || '--');
    setText('[data-live-match-id]', state.matchId || '--');
    setText('[data-live-seat]', state.seatId || '--');
    setText('[data-live-state-version]', view && view.stateVersion !== undefined ? String(view.stateVersion) : '--');
    setText('[data-live-current-seat]', view && view.currentSeat ? view.currentSeat : '--');
    setText('[data-live-match-quality]', this.formatLiveMatchQuality(view));
    const turnTimerEl = root.querySelector('[data-live-turn-timer]');
    if (turnTimerEl) {
      turnTimerEl.textContent = this.formatLiveTurnTimer(view);
      turnTimerEl.setAttribute('data-live-turn-timer-urgency', this.getLiveTurnTimerUrgency(view));
    }
    const timeoutForecastEl = root.querySelector('[data-live-timeout-forecast]');
    if (timeoutForecastEl) {
      const forecast = this.getLiveTimeoutAutomationForecast(view, phase);
      timeoutForecastEl.hidden = !forecast;
      timeoutForecastEl.setAttribute('data-live-timeout-forecast-state', forecast ? forecast.forecastState : 'idle');
      timeoutForecastEl.setAttribute('data-live-timeout-forecast-source', forecast ? forecast.sourceVisibility : '');
      timeoutForecastEl.setAttribute('data-live-timeout-forecast-hidden', forecast ? String(forecast.usesHiddenInformation === true) : '');
      timeoutForecastEl.setAttribute('data-live-timeout-forecast-impact', forecast ? forecast.rankedImpact : '');
      timeoutForecastEl.setAttribute('data-live-timeout-forecast-automation-count', forecast ? String(forecast.automationCount) : '0');
      timeoutForecastEl.setAttribute('data-live-timeout-forecast-advisory-only', forecast ? String(forecast.advisoryOnly === true) : 'true');
      timeoutForecastEl.innerHTML = this.renderLiveTimeoutAutomationForecast(forecast || view, phase);
    }
    setText('[data-live-connection-status]', this.formatLiveConnectionStatus(view));
    const connectionTempoEl = root.querySelector('[data-live-connection-tempo]');
    if (connectionTempoEl) {
      const tempo = this.getLiveConnectionTempo(view, state);
      connectionTempoEl.hidden = !tempo || tempo.tempoState === 'stable';
      connectionTempoEl.setAttribute('data-live-connection-tempo-state', tempo ? tempo.tempoState : '');
      connectionTempoEl.setAttribute('data-live-connection-tempo-actor', tempo ? tempo.affectedSeat : '');
      connectionTempoEl.setAttribute('data-live-connection-tempo-severity', tempo ? tempo.severity : '');
      connectionTempoEl.setAttribute('data-live-connection-tempo-boundary', tempo ? tempo.actionBoundary : '');
      connectionTempoEl.setAttribute('data-live-connection-tempo-can-submit', tempo ? String(tempo.canSubmitIntent === true) : '');
      connectionTempoEl.innerHTML = this.renderLiveConnectionTempo(view, state);
    }
    setText('[data-live-realtime-status]', this.formatLiveRealtimeStatus(state));
    const openingSafeguardEl = root.querySelector('[data-live-opening-safeguard]');
    if (openingSafeguardEl) {
      openingSafeguardEl.innerHTML = this.renderLiveOpeningSafeguardReport(view);
    }
    const actionReceiptEl = root.querySelector('[data-live-action-receipt]');
    if (actionReceiptEl) {
      const report = this.getLiveActionReceiptReport(view);
      actionReceiptEl.setAttribute('data-live-action-receipt-source', report ? report.sourceVisibility : '');
      actionReceiptEl.setAttribute('data-live-action-receipt-hidden', report ? String(report.usesHiddenInformation === true) : '');
      actionReceiptEl.setAttribute('data-live-action-receipt-seq', report && report.latestSequence !== null ? String(report.latestSequence) : '');
      actionReceiptEl.setAttribute('data-live-action-receipt-type', report ? report.actionType : '');
      actionReceiptEl.setAttribute('data-live-action-receipt-acting', report ? report.actingSeat : '');
      actionReceiptEl.setAttribute('data-live-action-receipt-next-seat', report ? report.nextSeat : '');
      actionReceiptEl.innerHTML = this.renderLiveActionReceiptReport(view);
    }
    const duelMomentumEl = root.querySelector('[data-live-duel-momentum]');
    if (duelMomentumEl) {
      const report = this.getLiveDuelMomentumReport(view);
      duelMomentumEl.setAttribute('data-live-duel-momentum-state', report ? report.pressureState : 'idle');
      duelMomentumEl.setAttribute('data-live-duel-momentum-source', report ? report.sourceVisibility : '');
      duelMomentumEl.setAttribute('data-live-duel-momentum-hidden', report ? String(report.usesHiddenInformation === true) : '');
      duelMomentumEl.innerHTML = this.renderLiveDuelMomentumReport(view);
    }
    const intentSignalEl = root.querySelector('[data-live-intent-signal]');
    if (intentSignalEl) {
      const report = this.getLiveIntentSignalReport(view);
      intentSignalEl.setAttribute('data-live-intent-signal-state', report ? report.signalState : 'idle');
      intentSignalEl.setAttribute('data-live-intent-signal-source', report ? report.sourceVisibility : '');
      intentSignalEl.setAttribute('data-live-intent-signal-hidden', report ? String(report.usesHiddenInformation === true) : '');
      intentSignalEl.setAttribute('data-live-intent-signal-current-seat', report ? report.currentSeat : '');
      intentSignalEl.innerHTML = this.renderLiveIntentSignalReport(view);
    }
    const counterplayGuideEl = root.querySelector('[data-live-counterplay-guide]');
    if (counterplayGuideEl) {
      const guideReport = this.getLiveCounterplayGuide(view, phase);
      counterplayGuideEl.hidden = !guideReport;
      counterplayGuideEl.setAttribute('data-live-counterplay-guide-state', guideReport ? guideReport.pressureState : 'idle');
      counterplayGuideEl.setAttribute('data-live-counterplay-guide-source', guideReport ? guideReport.sourceVisibility : '');
      counterplayGuideEl.setAttribute('data-live-counterplay-guide-hidden', guideReport ? String(guideReport.usesHiddenInformation === true) : '');
      counterplayGuideEl.setAttribute('data-live-counterplay-guide-impact', guideReport ? guideReport.rankedImpact : '');
      counterplayGuideEl.setAttribute('data-live-counterplay-guide-response-cards', guideReport ? String(guideReport.responseCardCount) : '0');
      counterplayGuideEl.setAttribute('data-live-counterplay-guide-advisory-only', guideReport ? String(guideReport.advisoryOnly === true) : 'true');
      counterplayGuideEl.innerHTML = this.renderLiveCounterplayGuide(guideReport || view, phase);
    }
    const actionWindowReceiptEl = root.querySelector('[data-live-action-window-receipt]');
    if (actionWindowReceiptEl) {
      const windowReceipt = this.getLiveActionWindowReceipt(view, phase);
      actionWindowReceiptEl.hidden = !windowReceipt;
      actionWindowReceiptEl.setAttribute('data-live-action-window-receipt-state', windowReceipt ? windowReceipt.pressureState : 'idle');
      actionWindowReceiptEl.setAttribute('data-live-action-window-receipt-source', windowReceipt ? windowReceipt.sourceVisibility : '');
      actionWindowReceiptEl.setAttribute('data-live-action-window-receipt-hidden', windowReceipt ? String(windowReceipt.usesHiddenInformation === true) : '');
      actionWindowReceiptEl.setAttribute('data-live-action-window-receipt-impact', windowReceipt ? windowReceipt.rankedImpact : '');
      actionWindowReceiptEl.setAttribute('data-live-action-window-receipt-response-cards', windowReceipt ? String(windowReceipt.responseCardCount) : '0');
      actionWindowReceiptEl.setAttribute('data-live-action-window-receipt-advisory-only', windowReceipt ? String(windowReceipt.advisoryOnly === true) : 'true');
      actionWindowReceiptEl.innerHTML = this.renderLiveActionWindowReceipt(windowReceipt || view, phase);
    }
    setText('[data-live-social-status]', this.liveSocialMuted
      ? '社交：已静音对手表情 · 本地偏好 · 不写正式积分'
      : '社交：预设表情 · 无自由文本 · 本地偏好');
    const guideEl = root.querySelector('[data-live-first-guide]');
    if (guideEl) guideEl.innerHTML = this.renderLiveFirstMatchGuide(view);
    const waitingReportEl = root.querySelector('[data-live-waiting-report]');
    if (waitingReportEl) {
      const waitingReportMarkup = this.renderLiveWaitingReport(state);
      waitingReportEl.hidden = !waitingReportMarkup;
      waitingReportEl.innerHTML = waitingReportMarkup || '等待真人：未进入长等待分支';
    }
    const inviteReportEl = root.querySelector('[data-live-invite-report]');
    if (inviteReportEl) {
      inviteReportEl.textContent = this.renderLiveInviteReport(state.inviteReport);
    }
    const inviteInboxEl = root.querySelector('[data-live-invite-inbox]');
    if (inviteInboxEl) {
      inviteInboxEl.innerHTML = this.renderLiveInviteInbox(state.inviteInbox);
    }
    const postReviewEl = root.querySelector('[data-live-post-match-review]');
    if (postReviewEl) {
      const postReviewMarkup = this.renderLivePostMatchReview(view, phase);
      const rematchReportMarkup = this.renderLiveFriendlySeries(state.rematchReport);
      postReviewEl.hidden = !(postReviewMarkup || rematchReportMarkup);
      postReviewEl.innerHTML = postReviewMarkup || rematchReportMarkup
        ? `${postReviewMarkup}${rematchReportMarkup}`
        : '赛后复盘：等待对局结束';
    }
    if (phase !== 'finished' && phase !== 'waiting_rematch') {
      this.liveReviewFocus = '';
      this.liveLoadoutReviewFocused = false;
      this.liveLoadoutReviewFocusReason = 'loadout';
      root.querySelectorAll('[data-live-review-focus]').forEach(element => {
        element.removeAttribute('data-live-review-focus');
      });
    }
    this.renderLiveLoadoutPresets(phase);
    if (this.liveReviewFocus) {
      const eventPanel = root.querySelector('[data-live-event-panel]');
      if (eventPanel) eventPanel.setAttribute('data-live-review-focus', this.liveReviewFocus);
      if (this.liveReviewFocus === 'key_turns' || this.liveReviewFocus.startsWith('key_turn:')) {
        const keyTurnPanel = root.querySelector('[data-live-key-turn-replay]');
        if (keyTurnPanel) keyTurnPanel.setAttribute('data-live-review-focus', this.liveReviewFocus);
        if (this.liveReviewFocus.startsWith('key_turn:')) {
          const turnId = this.liveReviewFocus.slice('key_turn:'.length);
          const focusedTurn = Array.from(root.querySelectorAll('[data-live-key-turn]'))
            .find(item => item.getAttribute('data-live-key-turn') === turnId);
          if (focusedTurn) focusedTurn.setAttribute('data-live-review-focus', this.liveReviewFocus);
          const focusedPracticeStep = Array.from(root.querySelectorAll('[data-live-practice-plan-key-turn]'))
            .find(item => item.getAttribute('data-live-practice-plan-key-turn') === turnId);
          if (focusedPracticeStep) focusedPracticeStep.setAttribute('data-live-review-focus', this.liveReviewFocus);
        }
      } else if (this.liveReviewFocus.startsWith('experience_check:')) {
        const checkId = this.liveReviewFocus.slice('experience_check:'.length);
        const focusedCheck = Array.from(root.querySelectorAll('[data-live-experience-check]')).find(item => item.getAttribute('data-live-experience-check') === checkId);
        if (focusedCheck) focusedCheck.setAttribute('data-live-review-focus', this.liveReviewFocus);
        const focusedFairnessCheck = Array.from(root.querySelectorAll('[data-live-fairness-check]')).find(item => item.getAttribute('data-live-fairness-check') === checkId);
        if (focusedFairnessCheck) focusedFairnessCheck.setAttribute('data-live-review-focus', this.liveReviewFocus);
        const focusedPracticeCheck = Array.from(root.querySelectorAll('[data-live-practice-plan-check]')).find(item => item.getAttribute('data-live-practice-plan-check') === checkId);
        if (focusedPracticeCheck) focusedPracticeCheck.setAttribute('data-live-review-focus', this.liveReviewFocus);
      }
    }
    if (this.liveLoadoutReviewFocused) {
      const loadoutPanel = root.querySelector('.pvp-live-loadout-selector');
      if (loadoutPanel) loadoutPanel.setAttribute('data-live-review-focus', this.liveLoadoutReviewFocusReason || 'loadout');
    }

    const self = view && view.self ? view.self : null;
    const opponent = view && view.opponent ? view.opponent : null;
    setText('[data-live-self-seat]', self && self.seatId ? self.seatId : '--');
    setText('[data-live-opponent-seat]', opponent && opponent.seatId ? opponent.seatId : '--');
    setText('[data-live-self-stats]', self ? `生命 ${self.hp}/${self.maxHp} · 灵力 ${self.energy}/${self.maxEnergy} · 护盾 ${self.block || 0} · ${self.ready ? '已准备' : '未准备'}${self.mulliganUsed ? ' · 已调息' : ''}` : '等待权威状态');
    setText('[data-live-opponent-stats]', opponent ? `生命 ${opponent.hp}/${opponent.maxHp} · 灵力 ${opponent.energy}/${opponent.maxEnergy} · 手牌 ${opponent.handCount} · ${opponent.ready ? '已准备' : '未准备'}` : '仅显示公开信息');
    const selfStatusesEl = root.querySelector('[data-live-self-statuses]');
    if (selfStatusesEl) selfStatusesEl.innerHTML = self ? this.renderLivePublicStatuses(self) : '状态：无公开状态';
    const opponentStatusesEl = root.querySelector('[data-live-opponent-statuses]');
    if (opponentStatusesEl) opponentStatusesEl.innerHTML = opponent ? this.renderLivePublicStatuses(opponent) : '状态：无公开状态';
    setText('[data-live-self-loadout]', self ? `斗法谱：${this.formatLiveLoadoutSummary(self, '未锁定')}` : '斗法谱：--');
    setText('[data-live-opponent-loadout]', opponent
      ? (view && view.mode === 'friendly'
        ? `公开谱：${this.formatLiveLoadoutSummary(opponent, '仅显示公开摘要')}`
        : this.formatLiveOpponentPublicProfile(opponent))
      : '公开画像：--');
    setText('[data-live-opponent-hand]', opponent ? `手牌：${Math.max(0, Number(opponent.handCount) || 0)} 张（隐藏）` : '手牌：--');

    const handEl = root.querySelector('[data-live-hand]');
    if (handEl) {
      const cards = self && Array.isArray(self.hand) ? self.hand : [];
      if (cards.length === 0) {
        handEl.innerHTML = '<div class="pvp-live-empty">暂无可用手牌</div>';
      } else {
        const liveCardIds = new Set(cards.map(card => card.instanceId).filter(Boolean));
        this.liveMulliganSelection.forEach(cardId => {
          if (!liveCardIds.has(cardId)) this.liveMulliganSelection.delete(cardId);
        });
        const intentLocked = this.isLiveIntentInFlight(state);
        const connectionSubmitBlocked = !!this.getLiveConnectionSubmitBlock(state);
        const canAct = phase === 'active' && view && view.currentSeat === state.seatId && !intentLocked && !connectionSubmitBlocked;
        const canSelectMulligan = phase === 'setup' && self && !self.mulliganUsed && !intentLocked && !connectionSubmitBlocked;
        handEl.innerHTML = cards.map(card => {
          const cardConfirming = !canSelectMulligan && this.isLiveOpeningActionConfirmArmed(state, 'play_card', { cardInstanceId: card.instanceId || '' });
          return `
          <button class="pvp-live-card ${this.liveMulliganSelection.has(card.instanceId) ? 'selected' : ''} ${cardConfirming ? 'confirming' : ''}" ${canSelectMulligan ? `data-live-mulligan-card="${this.escapeHtml(card.instanceId || '')}" onclick="PVPScene.toggleLiveMulliganCard('${this.escapeHtml(card.instanceId || '')}')"` : `data-live-card="${this.escapeHtml(card.instanceId || '')}" onclick="PVPScene.submitLiveCard('${this.escapeHtml(card.instanceId || '')}')"`} ${canAct || canSelectMulligan ? '' : 'disabled'}>
            <span class="pvp-live-card-name">${this.escapeHtml(card.name || card.cardId || '术式')}</span>
            <span class="pvp-live-card-meta">耗 ${this.escapeHtml(card.cost || 0)} · 伤 ${this.escapeHtml(card.damage || 0)} · 护 ${this.escapeHtml(card.block || 0)}${cardConfirming ? ' · 确认' : ''}</span>
            ${!canSelectMulligan ? this.renderLiveCardActionPreview(view, card.instanceId || '', phase) : ''}
          </button>
        `;
        }).join('');
      }
    }

    const eventLog = root.querySelector('[data-live-event-log]');
    if (eventLog) {
      const eventPanel = root.querySelector('[data-live-event-panel]');
      const reviewFocus = eventPanel ? eventPanel.getAttribute('data-live-review-focus') : '';
      let focusedEvents = this.getLiveReviewFocusedEvents(view, reviewFocus);
      if (focusedEvents.length === 0 && reviewFocus && reviewFocus.startsWith('key_turn:')) {
        const snapshot = this.getLiveSnapshot();
        focusedEvents = this.getLiveReviewFocusedEvents({ postMatchReview: snapshot && snapshot.postMatchReview }, reviewFocus);
      }
      const events = focusedEvents.length > 0
        ? focusedEvents
        : Array.isArray(state.lastEvents) && state.lastEvents.length > 0 ? state.lastEvents : view && Array.isArray(view.recentEvents) ? view.recentEvents.slice(-5) : [];
      const filteredEvents = this.filterLiveEventsForMute(events);
      const visibleEvents = focusedEvents.length > 0 ? filteredEvents.slice(0, 12) : filteredEvents.slice(-8);
      eventLog.innerHTML = visibleEvents.length > 0 ? this.renderLiveEventRows(visibleEvents) : '暂无事件';
    }

    const queueCooldownCountdown = this.getLiveQueueCooldownCountdown(state);
    const errorText = this.liveInlineHint || (queueCooldownCountdown ? queueCooldownCountdown.hint : state.lastError ? `${state.lastError.message || state.lastError.reason}` : phase === 'invalidated' ? '本局在开战前无效，不写正式积分；可以重新匹配或先练习斗法谱。' : phase === 'setup' ? '准备阶段只能调息或确认准备，不能提前出牌。' : phase === 'waiting_rematch' ? '已发起低压力再战，等待本局对手确认；不写正式积分。' : phase === 'waiting' ? '等待真实玩家加入；不会自动切换残影。' : '实时论道不会自动匹配残影；没有真人时可取消排队。');
    setText('[data-live-last-error]', errorText);
    this.updateLiveButtons(phase, !!view && view.currentSeat === state.seatId, self);
    this.syncLiveQueueCooldownTicker(phase, state);
    if (this.shouldLiveHeartbeat(phase)) {
      this.startLiveHeartbeat();
    } else {
      this.stopLiveHeartbeat();
    }
  },
  updateLiveButtons(phase, isMyTurn, self = null) {
    const root = document.querySelector('[data-live-pvp-root]');
    if (!root) return;
    const state = this.getLiveSession().getState();
    const connectionSubmitBlocked = !!this.getLiveConnectionSubmitBlock(state);
    if (connectionSubmitBlocked || !(phase === 'active' || phase === 'sync_required')) {
      this.clearLiveSurrenderConfirm();
    }
    if (connectionSubmitBlocked || phase !== 'active' || !this.isLiveOpeningActionConfirmArmed(state, this.liveOpeningActionConfirm?.actionType || '', this.liveOpeningActionConfirm?.payload || {})) {
      this.clearLiveOpeningActionConfirm();
    }
    const entrySafeguardBlocked = phase === 'idle' && this.isLiveEntrySafeguardBlocked(state);
    const queueCooldownBlocked = entrySafeguardBlocked && !!this.getLiveQueueCooldownError(state);
    const queueCooldownCountdown = this.getLiveQueueCooldownCountdown(state);
    const surrenderConfirmArmed = this.isLiveSurrenderConfirmArmed(state);
    const endTurnConfirmArmed = this.isLiveOpeningActionConfirmArmed(state, 'end_turn', {});
    const intentLocked = this.isLiveIntentInFlight(null, 'action');
    const socialIntentLocked = this.isLiveIntentInFlight(null, 'social');
    const setDisabled = (action, disabled) => {
      const btn = root.querySelector(`[data-live-action="${action}"]`);
      if (btn) btn.disabled = !!disabled;
    };
    const setHidden = (action, hidden) => {
      const btn = root.querySelector(`[data-live-action="${action}"]`);
      if (btn) btn.hidden = !!hidden;
    };
    const setButtonText = (action, text) => {
      const btn = root.querySelector(`[data-live-action="${action}"]`);
      const label = btn ? btn.querySelector('.text') || btn : null;
      if (label) label.textContent = text;
    };
    setDisabled('join-queue', phase === 'queueing' || phase === 'waiting' || phase === 'waiting_invite' || phase === 'waiting_rematch' || phase === 'matched' || phase === 'setup' || phase === 'active');
    setDisabled('create-invite', phase === 'queueing' || phase === 'waiting' || phase === 'waiting_invite' || phase === 'waiting_rematch' || phase === 'matched' || phase === 'setup' || phase === 'active');
    setDisabled('join-invite', phase === 'queueing' || phase === 'waiting' || phase === 'waiting_invite' || phase === 'waiting_rematch' || phase === 'matched' || phase === 'setup' || phase === 'active');
    setDisabled('cancel-invite', phase !== 'waiting_invite');
    setDisabled('cancel-queue', phase !== 'waiting');
    setHidden('cancel-rematch', phase !== 'waiting_rematch');
    setDisabled('cancel-rematch', phase !== 'waiting_rematch' || intentLocked);
    setDisabled('practice-live', !(entrySafeguardBlocked && this.hasLiveEntrySafeguardAction(state, 'practice')) && !(phase === 'waiting' && (this.getLiveWaitingReport(state)?.longWait || this.getLiveWaitingQualitySafeguard(state))));
    setDisabled('refresh-match', !connectionSubmitBlocked && (phase === 'queueing' || phase === 'idle' || phase === 'finished' || phase === 'invalidated'));
    setButtonText('join-queue', queueCooldownBlocked ? queueCooldownCountdown && queueCooldownCountdown.buttonText || '稍后重试' : entrySafeguardBlocked && this.hasLiveEntrySafeguardAction(state, 'retry_connection_check') ? '重试检测' : '入队');
    setButtonText('end-turn', endTurnConfirmArmed ? '确认结束' : '结束回合');
    setButtonText('surrender', surrenderConfirmArmed ? '确认认输' : '认输');
    setDisabled('confirm-mulligan', connectionSubmitBlocked || intentLocked || !(phase === 'setup' && self && !self.mulliganUsed));
    setDisabled('ready', connectionSubmitBlocked || intentLocked || !(phase === 'setup' && self && !self.ready));
    setDisabled('end-turn', connectionSubmitBlocked || intentLocked || !(phase === 'active' && isMyTurn));
    setDisabled('surrender', connectionSubmitBlocked || intentLocked || !(phase === 'active' || phase === 'sync_required'));
    root.querySelectorAll('[data-live-emote]').forEach(button => {
      button.disabled = connectionSubmitBlocked || socialIntentLocked || !this.canSendLiveEmote(phase);
      const emoteId = button.getAttribute('data-live-emote') || '';
      const option = this.getLiveEmoteOptions().find(item => item.id === emoteId);
      if (option) button.textContent = option.label;
    });
    const muteButton = root.querySelector('[data-live-action="toggle-social-mute"]');
    if (muteButton) {
      muteButton.disabled = false;
      muteButton.textContent = this.liveSocialMuted ? '取消静音' : '静音表情';
      muteButton.classList.toggle('selected', !!this.liveSocialMuted);
    }
  },
  startLivePolling() {
    this.stopLivePolling();
    this.livePollTimer = window.setInterval(async () => {
      const state = this.getLiveSession().getState();
      if (!this.shouldLivePoll(state)) {
        this.stopLivePolling();
        return;
      }
      await this.refreshLiveMatch({ fromAutoPoll: true });
    }, 2500);
  },
  stopLivePolling() {
    if (this.livePollTimer && typeof window !== 'undefined') {
      window.clearInterval(this.livePollTimer);
    }
    this.livePollTimer = null;
  },
  shouldLiveHeartbeat(phase) {
    return phase === 'matched' || phase === 'setup' || phase === 'active' || phase === 'sync_required';
  },
  getLiveHeartbeatIntervalMs(state = null) {
    const sourceState = state || this.getLiveSession().getState();
    const report = this.getLiveConnectionReport(sourceState && sourceState.stateView);
    return report ? report.heartbeatIntervalMs : 5000;
  },
  getLiveLastSeenEventRevision(state = null) {
    const sourceState = state || this.getLiveSession().getState();
    const viewEvents = sourceState && sourceState.stateView && Array.isArray(sourceState.stateView.recentEvents)
      ? sourceState.stateView.recentEvents
      : [];
    const replayEvents = sourceState && Array.isArray(sourceState.lastEvents)
      ? sourceState.lastEvents
      : [];
    return viewEvents.concat(replayEvents)
      .reduce((max, event) => Math.max(max, Math.floor(Number(event && event.sequence) || 0)), 0);
  },
  startLiveRealtime(state = null, { resume = false } = {}) {
    const session = this.getLiveSession();
    if (!session) return false;
    const sourceState = state || session.getState();
    if (!sourceState || !sourceState.matchId || !this.shouldLiveHeartbeat(sourceState.phase)) return;
    if (resume && typeof session.resumeRealtime === 'function') {
      return session.resumeRealtime(sourceState.matchId);
    }
    if (typeof session.connectRealtime !== 'function' || typeof session.joinRealtimeMatch !== 'function') return false;
    session.connectRealtime();
    return session.joinRealtimeMatch(sourceState.matchId, {
      lastSeenRevision: this.getLiveLastSeenEventRevision(sourceState)
    });
  },
  stopLiveRealtime() {
    const session = this.getLiveSession();
    if (session && typeof session.disconnectRealtime === 'function') {
      session.disconnectRealtime();
    }
  },
  startLiveHeartbeat({ sendImmediately = true } = {}) {
    if (typeof window === 'undefined') return;
    this.ensureLiveLifecycleBindings();
    const state = this.getLiveSession().getState();
    const heartbeatIntervalMs = this.getLiveHeartbeatIntervalMs(state);
    if (this.liveHeartbeatTimer && this.liveHeartbeatIntervalMs === heartbeatIntervalMs) {
      this.startLiveRealtime(state);
      return;
    }
    this.stopLiveHeartbeat();
    this.startLiveRealtime(state);
    this.liveHeartbeatIntervalMs = heartbeatIntervalMs;
    this.liveHeartbeatTimer = window.setInterval(async () => {
      try {
        await this.sendLiveHeartbeat();
      } catch (error) {
        console.warn('[PVP Live] heartbeat failed', error);
      }
    }, heartbeatIntervalMs);
    if (sendImmediately) {
      Promise.resolve(this.sendLiveHeartbeat()).catch(error => {
        console.warn('[PVP Live] heartbeat failed', error);
      });
    }
  },
  stopLiveHeartbeat() {
    if (this.liveHeartbeatTimer && typeof window !== 'undefined') {
      window.clearInterval(this.liveHeartbeatTimer);
    }
    this.liveHeartbeatTimer = null;
    this.liveHeartbeatIntervalMs = 0;
    this.stopLiveRealtime();
  },
  async sendLiveHeartbeat({ resumeRealtime = false } = {}) {
    const session = this.getLiveSession();
    const state = session.getState();
    if (!state || !state.matchId || !this.shouldLiveHeartbeat(state.phase)) {
      this.stopLiveHeartbeat();
      return { transport: 'stopped', state };
    }
    const usedRealtimeResume = !!(resumeRealtime && typeof session.resumeRealtime === 'function');
    const resumeQueued = this.startLiveRealtime(state, { resume: resumeRealtime });
    const realtimeSent = usedRealtimeResume
      ? !!(resumeQueued && state.realtimeStatus === 'connected')
      : state.realtimeStatus === 'connected'
        && typeof session.heartbeatRealtime === 'function'
        && session.heartbeatRealtime(state.matchId);
    let transport = realtimeSent ? 'realtime' : 'none';
    if (!realtimeSent) {
      if (typeof session.heartbeat !== 'function') return { transport, state: session.getState() };
      await session.heartbeat();
      transport = 'http';
    }
    const next = session.getState();
    if (!this.shouldLiveHeartbeat(next.phase)) {
      this.stopLiveHeartbeat();
      return { transport, state: next };
    }
    this.startLiveHeartbeat({ sendImmediately: false });
    this.renderLivePanel();
    return { transport, state: session.getState() };
  },
  async submitLiveIntent(intent = {}) {
    this.liveInlineHint = '';
    const session = this.getLiveSession();
    let state = session.getState();
    if (!state || !state.matchId) return state;
    if (!(await this.ensureLiveConnectionReadyForSubmit(state))) return session.getState();
    state = session.getState();
    if (String(intent.intentType || '') !== 'surrender') {
      this.clearLiveSurrenderConfirm();
    }
    if (String(intent.intentType || '') !== 'emote') {
      this.clearLiveOpeningActionConfirm();
    }
    const lockKey = this.getLiveIntentLockKey(intent.intentType);
    const pendingIntent = this.resolveLiveIntentInFlight(state, lockKey);
    if (pendingIntent) {
      this.liveInlineHint = '上一动作正在等待权威回执，请稍候。';
      return state;
    }
    const stateVersion = Number.isFinite(Number(intent.stateVersion))
      ? Math.floor(Number(intent.stateVersion))
      : Math.floor(Number(state.stateView && state.stateView.stateVersion) || 0);
    const intentWithVersion = {
      intentId: intent.intentId,
      intentType: intent.intentType,
      stateVersion,
      payload: intent.payload && typeof intent.payload === 'object' ? { ...intent.payload } : {}
    };
    this.startLiveRealtime(state);
    const nextState = session.getState();
    const realtimeSent = nextState && nextState.realtimeStatus === 'connected'
      && typeof session.submitRealtimeIntent === 'function'
      && session.submitRealtimeIntent(intentWithVersion, nextState.matchId || state.matchId);
    if (realtimeSent) {
      this.markLiveIntentInFlight(intentWithVersion, nextState || state, lockKey);
      return session.getState();
    }
    try {
      return await session.submitIntent(intentWithVersion);
    } finally {
      this.clearLiveIntentInFlight(lockKey);
    }
  },
  getLiveStateVersion(state = null) {
    const rawVersion = state && state.stateView && state.stateView.stateVersion !== undefined
      ? state.stateView.stateVersion
      : state && state.stateVersion;
    const version = Number(rawVersion);
    return Number.isFinite(version) ? Math.floor(version) : 0;
  },
  getLiveLastErrorSignature(state = null) {
    const error = state && state.lastError && typeof state.lastError === 'object'
      ? state.lastError
      : null;
    if (!error) return '';
    return `${String(error.reason || '')}:${String(error.message || '')}`;
  },
  normalizeLiveIntentInFlight() {
    if (!this.liveIntentInFlight || typeof this.liveIntentInFlight !== 'object' || Array.isArray(this.liveIntentInFlight)) {
      this.liveIntentInFlight = { action: null, social: null };
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveIntentInFlight, 'action')) this.liveIntentInFlight.action = null;
    if (!Object.prototype.hasOwnProperty.call(this.liveIntentInFlight, 'social')) this.liveIntentInFlight.social = null;
    return this.liveIntentInFlight;
  },
  getLiveIntentLockKey(intentType = '') {
    return String(intentType || '') === 'emote' ? 'social' : 'action';
  },
  getLiveIntentAck(state = null) {
    const result = state && state.lastRealtimeIntentResult && typeof state.lastRealtimeIntentResult === 'object'
      ? state.lastRealtimeIntentResult
      : null;
    if (!result) return null;
    return {
      intentId: String(result.intentId || ''),
      matchId: String(result.matchId || ''),
      result: String(result.result || ''),
      updatedAt: Math.max(0, Math.floor(Number(result.updatedAt || result.serverTime) || 0))
    };
  },
  getLiveActionReleaseEventTypes(intentType = '') {
    const releaseEventsByIntent = {
      play_card: [
        'card_played',
        'damage_applied',
        'block_gained',
        'hp_recovered',
        'card_cycled',
        'budget_clamped',
        'opening_protection_triggered',
        'opening_counterplay_granted',
        'opening_second_seat_buffer_granted',
        'match_finished'
      ],
      end_turn: ['turn_ended', 'cards_drawn', 'match_finished'],
      mulligan: ['mulligan_completed'],
      ready: ['player_ready', 'battle_started'],
      surrender: ['player_surrendered', 'match_finished']
    };
    return releaseEventsByIntent[String(intentType || '')] || [];
  },
  clearLiveSurrenderConfirm() {
    this.liveSurrenderConfirmUntil = 0;
  },
  clearLiveOpeningActionConfirm() {
    this.liveOpeningActionConfirm = null;
  },
  getLiveOpeningActionConfirmContext(state = null, actionType = '', payload = {}) {
    const source = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    const view = source && source.stateView && typeof source.stateView === 'object' ? source.stateView : null;
    if (!source || !view || !source.matchId || source.phase !== 'active') return null;
    const currentSeat = String(view.currentSeat || '');
    const viewerSeat = String(source.seatId || '');
    if (!viewerSeat || currentSeat !== viewerSeat) return null;
    const action = String(actionType || '');
    if (!(action === 'play_card' || action === 'end_turn')) return null;
    const momentum = this.getLiveDuelMomentumReport(view);
    const opening = this.getLiveOpeningSafeguardReport(view);
    const pressureState = String(momentum && momentum.pressureState || '');
    const openingActive = !!(opening && opening.openingProtection && opening.openingProtection.active);
    const statusResponseWindow = pressureState === 'status_response_window';
    if (pressureState !== 'opening_window' && !openingActive && !statusResponseWindow) return null;
    if (statusResponseWindow && action !== 'end_turn') return null;
    const actionPayload = payload && typeof payload === 'object' ? { ...payload } : {};
    const cardInstanceId = String(actionPayload.cardInstanceId || '');
    if (action === 'play_card') {
      const hand = view.self && Array.isArray(view.self.hand) ? view.self.hand : [];
      if (!cardInstanceId || !hand.some(card => String(card && card.instanceId || '') === cardInstanceId)) return null;
    }
    const stateVersion = this.getLiveStateVersion(source);
    return {
      actionType: action,
      payload: action === 'play_card' ? { cardInstanceId } : {},
      matchId: String(source.matchId || view.matchId || ''),
      seatId: viewerSeat,
      currentSeat,
      stateVersion,
      pressureState: pressureState || (openingActive ? 'opening_window' : ''),
      key: [
        String(source.matchId || view.matchId || ''),
        viewerSeat,
        currentSeat,
        stateVersion,
        action,
        cardInstanceId
      ].join(':')
    };
  },
  isLiveOpeningActionConfirmRequired(state = null, actionType = '', payload = {}) {
    return !!this.getLiveOpeningActionConfirmContext(state, actionType, payload);
  },
  formatLiveOpeningActionConfirmMessage(state = null, actionType = '', payload = {}) {
    const context = this.getLiveOpeningActionConfirmContext(state, actionType, payload);
    const session = this.getLiveSession();
    const source = state && typeof state === 'object'
      ? state
      : session && typeof session.getState === 'function' ? session.getState() : null;
    const view = source && source.stateView && typeof source.stateView === 'object' ? source.stateView : null;
    const opening = this.getLiveOpeningSafeguardReport(view);
    if (!context) return '再次点击确认行动；当前仍处于关键响应窗口。';
    if (context.pressureState === 'status_response_window' && String(actionType || '') === 'end_turn') {
      const intentSignal = this.getLiveIntentSignalReport(view);
      const responseLine = intentSignal && intentSignal.responseLine
        ? String(intentSignal.responseLine)
        : '反制窗口：当前有公开状态响应窗口。';
      const actionPreview = this.getLiveActionPreviewReport(view);
      const mitigationPreview = actionPreview && Array.isArray(actionPreview.playableCards)
        ? actionPreview.playableCards.find(card => card && card.publicStatusMitigation)
        : null;
      const mitigation = mitigationPreview && mitigationPreview.publicStatusMitigation
        ? mitigationPreview.publicStatusMitigation
        : null;
      const statusLabel = mitigation && mitigation.label ? mitigation.label : '公开状态';
      const mitigationLine = mitigation
        ? `可用防守牌处理 ${statusLabel}；${mitigation.mitigation === 'cleared' ? `清除${statusLabel}` : '降低后续兑现风险'}。`
        : '可先使用防守牌或补盾处理公开状态。';
      const endTurnPreview = actionPreview && actionPreview.endTurn && actionPreview.endTurn.summaryLine
        ? `权威预览：${actionPreview.endTurn.summaryLine}`
        : '若直接结束回合，后续可能被兑现。';
      return `再次点击确认结束回合；当前是${statusLabel}响应窗口。${responseLine}${mitigationLine}${endTurnPreview}`;
    }
    if (!opening) return '再次点击确认行动；当前仍处于关键响应窗口。';
    const currentBudget = opening.damageBudget.currentActionBudget;
    const budgetText = currentBudget === null
      ? '首动预算等待权威状态'
      : `首动预算 ${currentBudget}`;
    const protectedSeats = opening.openingProtection.protectedSeats.length
      ? opening.openingProtection.protectedSeats.join('/')
      : '待观察';
    const protectionText = `开局护体保护 ${protectedSeats} · 保底 ${opening.openingProtection.minimumHp} 血`;
    const secondSeat = opening.secondSeatBuffer.seatId || opening.secondSeat || '后手';
    const shieldText = opening.secondSeatBuffer.block > 0
      ? `后手护盾 ${secondSeat} +${opening.secondSeatBuffer.block}`
      : '后手护盾未启用';
    const counterplayText = opening.counterplay.block > 0
      ? `反打缓冲 +${opening.counterplay.block}`
      : '反打缓冲待观察';
    const publicRulesText = `公开预期：${budgetText}，${protectionText}，${shieldText}，${counterplayText}。`;
    if (String(actionType || '') === 'end_turn') {
      const nextSeat = view && view.opponent && view.opponent.seatId
        ? view.opponent.seatId
        : context.currentSeat === 'A' ? 'B' : 'A';
      const actionPreview = this.getLiveActionPreviewReport(view);
      const endTurnPreview = actionPreview && actionPreview.endTurn && actionPreview.endTurn.summaryLine
        ? `权威预览：${actionPreview.endTurn.summaryLine}`
        : '';
      return `再次点击确认结束回合；确认后行动权交给 ${nextSeat}。${publicRulesText}${endTurnPreview}`;
    }
    const cardInstanceId = String(payload && payload.cardInstanceId || context.payload && context.payload.cardInstanceId || '');
    const hand = view && view.self && Array.isArray(view.self.hand) ? view.self.hand : [];
    const card = hand.find(item => String(item && item.instanceId || '') === cardInstanceId) || null;
    const cardName = card && (card.name || card.cardId) ? String(card.name || card.cardId) : '当前术式';
    const targetSeat = String(payload && payload.targetSeat || view && view.opponent && view.opponent.seatId || '');
    const targetText = targetSeat ? `，目标 ${targetSeat}` : '';
    const previewText = this.formatLiveActionPreviewLine(this.getLiveCardActionPreview(view, cardInstanceId));
    const previewSuffix = previewText ? `权威预览：${previewText}` : '';
    return `再次点击确认出牌；${cardName}${targetText}。${publicRulesText}${previewSuffix}`;
  },
  isLiveOpeningActionConfirmArmed(state = null, actionType = '', payload = {}) {
    const context = this.getLiveOpeningActionConfirmContext(state, actionType, payload);
    const confirm = this.liveOpeningActionConfirm && typeof this.liveOpeningActionConfirm === 'object'
      ? this.liveOpeningActionConfirm
      : null;
    if (!context || !confirm || confirm.key !== context.key) return false;
    return Date.now() <= Math.max(0, Math.floor(Number(confirm.until) || 0));
  },
  armLiveOpeningActionConfirm(state = null, actionType = '', payload = {}, message = '再次点击确认行动；当前仍处于开局保护窗口。') {
    const context = this.getLiveOpeningActionConfirmContext(state, actionType, payload);
    if (!context) return false;
    this.liveOpeningActionConfirm = {
      ...context,
      until: Date.now() + Math.max(1000, Math.floor(Number(this.liveOpeningActionConfirmMs) || 6000))
    };
    this.liveInlineHint = message;
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function' && typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(this.liveInlineHint);
    }
    return true;
  },
  isLiveSurrenderConfirmArmed(state = null) {
    const source = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    if (!source || !source.matchId || !(source.phase === 'active' || source.phase === 'sync_required')) return false;
    return Date.now() <= Math.max(0, Math.floor(Number(this.liveSurrenderConfirmUntil) || 0));
  },
  armLiveSurrenderConfirm(state = null, message = '再次点击确认认输；本局会立刻结束，对手获胜，正式结果只按当前对局模式的服务端规则处理。') {
    const source = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    if (!source || !source.matchId || !(source.phase === 'active' || source.phase === 'sync_required')) return false;
    this.liveSurrenderConfirmUntil = Date.now() + Math.max(1000, Math.floor(Number(this.liveSurrenderConfirmMs) || 6000));
    this.liveInlineHint = message;
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function' && typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(this.liveInlineHint);
    }
    return true;
  },
  getLiveAuthoritativeEvents(state = null) {
    const source = state || this.getLiveSession().getState();
    const events = [];
    const addEvents = (candidate) => {
      if (!Array.isArray(candidate)) return;
      candidate.forEach(event => {
        if (event && typeof event === 'object' && event.eventType) events.push(event);
      });
    };
    addEvents(source && source.lastEvents);
    addEvents(source && source.stateView && source.stateView.recentEvents);
    return events;
  },
  hasLiveActionReleaseEvidence(state = null, pending = null) {
    if (!pending || !pending.intentType) return false;
    const releaseTypes = this.getLiveActionReleaseEventTypes(pending.intentType);
    if (releaseTypes.length === 0) return false;
    const releaseTypeSet = new Set(releaseTypes);
    const pendingSeat = String(pending.seatId || '');
    const pendingEventRevision = Math.max(0, Math.floor(Number(pending.lastSeenEventRevision) || 0));
    return this.getLiveAuthoritativeEvents(state).some(event => {
      const eventType = String(event && event.eventType || '');
      if (!releaseTypeSet.has(eventType)) return false;
      const eventRevision = Math.floor(Number(event && event.sequence) || 0);
      if (eventRevision <= pendingEventRevision) return false;
      if (!pendingSeat) return true;
      const payload = event && event.payload && typeof event.payload === 'object'
        ? event.payload
        : event && event.publicData && typeof event.publicData === 'object' ? event.publicData : {};
      const eventSeat = String(event && event.actingSeat || payload.seatId || '');
      return !eventSeat || eventSeat === pendingSeat;
    });
  },
  getLiveIntentLockState(state = null) {
    const source = state || this.getLiveSession().getState();
    return {
      matchId: String(source && (source.matchId || source.stateView && source.stateView.matchId) || ''),
      seatId: String(source && source.seatId || ''),
      phase: String(source && source.phase || ''),
      stateVersion: this.getLiveStateVersion(source),
      realtimeStatus: String(source && source.realtimeStatus || ''),
      lastErrorSignature: this.getLiveLastErrorSignature(source),
      lastRealtimeIntentResult: this.getLiveIntentAck(source),
      updatedAt: Math.max(0, Math.floor(Number(source && source.updatedAt) || 0))
    };
  },
  resolveLiveIntentInFlight(state = null, lockKey = 'action') {
    const locks = this.normalizeLiveIntentInFlight();
    const key = lockKey === 'social' ? 'social' : 'action';
    const pending = locks[key];
    if (!pending) return null;
    const source = state || this.getLiveSession().getState();
    const current = this.getLiveIntentLockState(source);
    const ack = current.lastRealtimeIntentResult;
    const acknowledged = !!ack
      && ack.intentId === pending.intentId
      && (!ack.matchId || ack.matchId === pending.matchId)
      && ack.updatedAt >= pending.updatedAt;
    const actionReleasedByEvent = key === 'action'
      && current.stateVersion > pending.stateVersion
      && this.hasLiveActionReleaseEvidence(source, pending);
    const released = !current.matchId
      || current.matchId !== pending.matchId
      || current.phase !== pending.phase
      || actionReleasedByEvent
      || acknowledged;
    if (released) {
      this.clearLiveIntentInFlight(key);
      return null;
    }
    return pending;
  },
  resolveAllLiveIntentInFlight(state = null) {
    this.resolveLiveIntentInFlight(state, 'action');
    this.resolveLiveIntentInFlight(state, 'social');
  },
  isLiveIntentInFlight(state = null, lockKey = 'action') {
    return !!this.resolveLiveIntentInFlight(state, lockKey);
  },
  markLiveIntentInFlight(intent = {}, state = null, lockKey = 'action') {
    const locks = this.normalizeLiveIntentInFlight();
    const key = lockKey === 'social' ? 'social' : 'action';
    const current = this.getLiveIntentLockState(state);
    locks[key] = {
      intentId: String(intent.intentId || ''),
      intentType: String(intent.intentType || ''),
      ...current,
      lastSeenEventRevision: this.getLiveLastSeenEventRevision(state),
      startedAt: Date.now()
    };
  },
  clearLiveIntentInFlight(lockKey = '') {
    const locks = this.normalizeLiveIntentInFlight();
    if (lockKey === 'action' || lockKey === 'social') {
      locks[lockKey] = null;
      return;
    }
    locks.action = null;
    locks.social = null;
  },
  makeLiveIntentId(type) {
    this.liveIntentSeq += 1;
    return `live-ui-${type}-${Date.now().toString(36)}-${this.liveIntentSeq}`;
  },
  async joinLiveQueue(options = {}) {
    this.liveInlineHint = '';
    this.liveDrillScenario = null;
    const session = this.getLiveSession();
    const gameRef = this.getGameRef();
    const displayName = gameRef && gameRef.player && gameRef.player.name ? gameRef.player.name : '无名修士';
    const presets = this.getLiveLoadoutPresets();
    const selectedPreset = options && typeof options.loadoutPresetId === 'string'
      ? presets.find(item => item.id === options.loadoutPresetId) || this.getLiveSelectedLoadoutPreset()
      : this.getLiveSelectedLoadoutPreset();
    const postReviewLoadoutResolution = options && options.postReviewLoadoutResolution
      && options.postReviewLoadoutResolution.reportVersion === 'pvp-live-post-review-loadout-resolution-v1'
      ? options.postReviewLoadoutResolution
      : null;
    const connectionHealthProbe = await this.buildLiveQueueConnectionHealthProbe();
    await session.joinQueue({
      displayName,
      loadout: this.getLiveQueueLoadoutCandidate(selectedPreset.id),
      connectionHealthProbe,
      ...(options && options.wideMatchConsent === true ? { wideMatchConsent: true } : {}),
      ...(options && typeof options.testMatchScope === 'string' && options.testMatchScope.trim()
        ? { testMatchScope: options.testMatchScope }
        : {}),
      ...(options && typeof options.testOpenerSeed === 'string' && options.testOpenerSeed.trim()
        ? { testOpenerSeed: options.testOpenerSeed }
        : {})
    });
    const state = session.getState();
    if (postReviewLoadoutResolution && ['waiting', 'matched', 'setup', 'active'].includes(state.phase)) {
      this.liveInlineHint = this.formatLivePostReviewLoadoutResolution('queue_again', postReviewLoadoutResolution);
    }
    this.liveLongWaitPollUntil = 0;
    if (['waiting', 'matched', 'setup', 'active'].includes(state.phase)) {
      this.liveDrillScenario = null;
    }
    this.renderLivePanel();
    if (this.shouldLivePoll(state)) this.startLivePolling();
  },
  async acceptLiveWideMatch() {
    const session = this.getLiveSession();
    const state = session && typeof session.getState === 'function' ? session.getState() : null;
    if (!state || state.phase !== 'waiting') return;
    await this.joinLiveQueue({ wideMatchConsent: true });
    this.liveLongWaitPollUntil = Date.now() + 30000;
    this.liveInlineHint = '已确认可接受 200-399 分差真人局；仍需对方也确认，不会自动切残影。';
    this.renderLivePanel();
    this.startLivePolling();
  },
  async createLiveInvite() {
    this.liveInlineHint = '';
    const session = this.getLiveSession();
    const gameRef = this.getGameRef();
    const displayName = gameRef && gameRef.player && gameRef.player.name ? gameRef.player.name : '无名修士';
    const selectedPreset = this.getLiveSelectedLoadoutPreset();
    const root = document.querySelector('[data-live-pvp-root]');
    const targetInput = root ? root.querySelector('[data-live-target-username]') : null;
    const targetUsername = targetInput ? String(targetInput.value || '').trim() : '';
    if (!session || typeof session.createInvite !== 'function') return;
    await session.createInvite({
      displayName,
      targetUsername,
      loadout: this.getLiveQueueLoadoutCandidate(selectedPreset.id)
    });
    this.liveLongWaitPollUntil = 0;
    this.renderLivePanel();
    const state = session.getState();
    if (state.phase === 'waiting_invite') {
      this.liveDrillScenario = null;
      this.startLivePolling();
    }
  },
  async joinLiveInvite() {
    this.liveInlineHint = '';
    const session = this.getLiveSession();
    const root = document.querySelector('[data-live-pvp-root]');
    const input = root ? root.querySelector('[data-live-invite-input]') : null;
    const inviteCode = input ? String(input.value || '').trim() : '';
    const gameRef = this.getGameRef();
    const displayName = gameRef && gameRef.player && gameRef.player.name ? gameRef.player.name : '无名修士';
    const selectedPreset = this.getLiveSelectedLoadoutPreset();
    if (!session || typeof session.joinInvite !== 'function') return;
    await session.joinInvite(inviteCode, {
      displayName,
      loadout: this.getLiveQueueLoadoutCandidate(selectedPreset.id)
    });
    this.liveLongWaitPollUntil = 0;
    this.renderLivePanel();
    const state = session.getState();
    if (['matched', 'setup', 'active'].includes(state.phase)) {
      this.liveDrillScenario = null;
    }
    if (this.shouldLivePoll(state)) this.startLivePolling();
  },
  async joinLiveInboxInvite(inviteCode = '') {
    this.liveInlineHint = '';
    const code = String(inviteCode || '').trim();
    if (!code) return;
    const session = this.getLiveSession();
    const gameRef = this.getGameRef();
    const displayName = gameRef && gameRef.player && gameRef.player.name ? gameRef.player.name : '无名修士';
    const selectedPreset = this.getLiveSelectedLoadoutPreset();
    if (!session || typeof session.joinInvite !== 'function') return;
    await session.joinInvite(code, {
      displayName,
      loadout: this.getLiveQueueLoadoutCandidate(selectedPreset.id)
    });
    this.liveLongWaitPollUntil = 0;
    this.renderLivePanel();
    const state = session.getState();
    if (['matched', 'setup', 'active'].includes(state.phase)) {
      this.liveDrillScenario = null;
    }
    if (this.shouldLivePoll(state)) this.startLivePolling();
  },
  async cancelLiveInvite() {
    this.liveInlineHint = '';
    const session = this.getLiveSession();
    if (!session || typeof session.cancelInvite !== 'function') return;
    const state = session.getState();
    await session.cancelInvite(state.inviteCode || '');
    this.liveLongWaitPollUntil = 0;
    this.stopLivePolling();
    this.renderLivePanel();
  },
  async cancelLiveQueue() {
    this.liveInlineHint = '';
    const session = this.getLiveSession();
    const nextState = await session.cancelQueue();
    this.liveLongWaitPollUntil = 0;
    this.stopLivePolling();
    const state = nextState || session.getState();
    const lastError = state && state.lastError ? state.lastError : null;
    if (lastError && lastError.reason === 'queue_cooldown' && lastError.matchmakingGuard) {
      this.liveInlineHint = '';
    } else if (lastError && lastError.message) {
      this.liveInlineHint = lastError.message;
    } else {
      this.liveInlineHint = '已退出真人排位队列；可稍后重试或先进入问道练习。';
    }
    this.renderLivePanel();
  },
  async cancelLiveRematch() {
    const session = this.getLiveSession();
    if (!session || typeof session.cancelRematch !== 'function') return;
    await session.cancelRematch();
    const state = session.getState();
    this.liveInlineHint = state.lastError && state.lastError.message
      ? state.lastError.message
      : '已取消低压力再战等待；本局复盘保留，不写正式积分。';
    this.stopLivePolling();
    this.renderLivePanel();
  },
  async openLivePracticeHint() {
    const entryScenario = await this.commitLiveEntrySafeguardPracticeHandoff();
    const scenario = entryScenario || await this.commitLiveWaitingPracticeHandoff();
    const message = scenario
      ? entryScenario
        ? entryScenario.finishReason === 'queue_cooldown'
          ? '已打开真人 PVP 排队冷却练习；练习不写正式积分，冷却结束后可重试正式排位。'
          : '已打开真人 PVP 连接健康练习；练习不写正式积分，恢复后可重试正式排位。'
        : '已打开真人 PVP 长等待练习；练习不写正式积分，返回真人排位需重新入队。'
      : this.liveInlineHint || '问道练习不会写正式积分；当前未进入长等待，继续等待真人或取消匹配后再练习。';
    this.liveInlineHint = message;
    const root = document.querySelector('[data-live-pvp-root]');
    const hint = root ? root.querySelector('[data-live-last-error]') : null;
    if (hint) hint.textContent = message;
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(message);
    }
  },
  handleLiveExperienceCheckFocus(checkId) {
    const id = String(checkId || '').trim();
    if (!id) return;
    this.liveReviewFocus = `experience_check:${id}`;
    this.liveInlineHint = '已定位体验诊断证据；事件面板只显示该检查项关联的公开事件。';
    const root = document.querySelector('[data-live-pvp-root]');
    const eventPanel = root ? root.querySelector('[data-live-event-panel]') : null;
    if (eventPanel) {
      eventPanel.setAttribute('data-live-review-focus', `experience_check:${id}`);
    }
    this.renderLivePanel();
    const nextRoot = document.querySelector('[data-live-pvp-root]') || root;
    const nextEventPanel = nextRoot ? nextRoot.querySelector('[data-live-event-panel]') : eventPanel;
    if (nextEventPanel) {
      nextEventPanel.setAttribute('data-live-review-focus', `experience_check:${id}`);
    }
    const focusedCheck = nextRoot
      ? Array.from(nextRoot.querySelectorAll('[data-live-experience-check]')).find(item => item.getAttribute('data-live-experience-check') === id)
      : null;
    if (focusedCheck) {
      focusedCheck.setAttribute('data-live-review-focus', `experience_check:${id}`);
      if (typeof focusedCheck.scrollIntoView === 'function') {
        focusedCheck.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    const focusedFairnessCheck = nextRoot
      ? Array.from(nextRoot.querySelectorAll('[data-live-fairness-check]')).find(item => item.getAttribute('data-live-fairness-check') === id)
      : null;
    if (focusedFairnessCheck) {
      focusedFairnessCheck.setAttribute('data-live-review-focus', `experience_check:${id}`);
    }
    const focusedPracticeCheck = nextRoot
      ? Array.from(nextRoot.querySelectorAll('[data-live-practice-plan-check]')).find(item => item.getAttribute('data-live-practice-plan-check') === id)
      : null;
    if (focusedPracticeCheck) {
      focusedPracticeCheck.setAttribute('data-live-review-focus', `experience_check:${id}`);
    }
    const hint = nextRoot ? nextRoot.querySelector('[data-live-last-error]') : null;
    const message = this.liveInlineHint;
    if (hint) hint.textContent = message;
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(message);
    }
  },
  focusLiveKeyTurn(turnId) {
    const id = String(turnId || '').trim();
    if (!id) return;
    const focus = `key_turn:${id}`;
    this.liveReviewFocus = focus;
    this.liveInlineHint = '已定位这个关键回合的公开事件；练习只使用公开序列，不读取隐藏手牌、牌库或事件 payload。';
    const root = document.querySelector('[data-live-pvp-root]');
    const eventPanel = root ? root.querySelector('[data-live-event-panel]') : null;
    if (eventPanel) {
      eventPanel.setAttribute('data-live-review-focus', focus);
    }
    this.renderLivePanel();
    const nextRoot = document.querySelector('[data-live-pvp-root]') || root;
    const nextEventPanel = nextRoot ? nextRoot.querySelector('[data-live-event-panel]') : eventPanel;
    const keyTurnPanel = nextRoot ? nextRoot.querySelector('[data-live-key-turn-replay]') : null;
    const focusedTurn = nextRoot
      ? Array.from(nextRoot.querySelectorAll('[data-live-key-turn]')).find(item => item.getAttribute('data-live-key-turn') === id)
      : null;
    const focusedPracticeStep = nextRoot
      ? Array.from(nextRoot.querySelectorAll('[data-live-practice-plan-key-turn]')).find(item => item.getAttribute('data-live-practice-plan-key-turn') === id)
      : null;
    if (nextEventPanel) nextEventPanel.setAttribute('data-live-review-focus', focus);
    if (keyTurnPanel) keyTurnPanel.setAttribute('data-live-review-focus', focus);
    if (focusedTurn) focusedTurn.setAttribute('data-live-review-focus', focus);
    if (focusedPracticeStep) focusedPracticeStep.setAttribute('data-live-review-focus', focus);
    const eventLog = nextRoot ? nextRoot.querySelector('[data-live-event-log]') : null;
    if (eventLog) {
      const state = this.getLiveSession().getState();
      const view = state && state.stateView ? state.stateView : null;
      let focusedEvents = this.getLiveReviewFocusedEvents(view, focus);
      if (focusedEvents.length === 0) {
        const snapshot = this.getLiveSnapshot();
        focusedEvents = this.getLiveReviewFocusedEvents({ postMatchReview: snapshot && snapshot.postMatchReview }, focus);
      }
      focusedEvents = this.filterLiveEventsForMute(focusedEvents);
      eventLog.innerHTML = focusedEvents.length > 0 ? this.renderLiveEventRows(focusedEvents.slice(0, 12)) : '暂无事件';
    }
    const scrollTarget = nextEventPanel || focusedPracticeStep || focusedTurn || keyTurnPanel;
    if (scrollTarget && typeof scrollTarget.scrollIntoView === 'function') {
      scrollTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const hint = nextRoot ? nextRoot.querySelector('[data-live-last-error]') : null;
    const message = this.liveInlineHint;
    if (hint) hint.textContent = message;
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(message);
    }
  },
  async handleLivePostReviewAction(actionId) {
    const id = String(actionId || '');
    const root = document.querySelector('[data-live-pvp-root]');
    const setHint = (message) => {
      this.liveInlineHint = message;
      const hint = root ? root.querySelector('[data-live-last-error]') : null;
      if (hint) hint.textContent = message;
      if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(message);
      }
    };
    const currentPhase = this.getLiveSession().getState()?.phase || '';
    if (this.isLivePostReviewActionDisabled(id, currentPhase)) {
      setHint('已发起低压力再战，等待本局对手确认；当前先保留复盘，不再改走其他入口。');
      this.renderLivePanel();
      return;
    }
    this.recordLiveSeasonGoalAction(id);
    if (id === 'queue_again') {
      this.liveInlineHint = '';
      const resolution = this.resolveLivePostReviewLoadoutPreset('queue_again');
      await this.joinLiveQueue({
        loadoutPresetId: resolution.presetId,
        postReviewLoadoutResolution: resolution
      });
      return;
    }
    if (id === 'practice') {
      await this.commitLivePostReviewPracticeHandoff();
      return;
    }
    if (id === 'friendly_rematch') {
      const session = this.getLiveSession();
      const gameRef = this.getGameRef();
      const displayName = gameRef && gameRef.player && gameRef.player.name ? gameRef.player.name : '无名修士';
      const selectedPreset = this.getLiveSelectedLoadoutPreset();
      if (!session || typeof session.requestRematch !== 'function') {
        setHint('实时论道再战服务未就绪。');
        return;
      }
      this.liveInlineHint = '';
      const resolution = this.resolveLivePostReviewLoadoutPreset('friendly_rematch');
      await session.requestRematch({
        displayName,
        loadout: this.getLiveQueueLoadoutCandidate(resolution.presetId || selectedPreset.id)
      });
      this.stopLivePolling();
      this.renderLivePanel();
      const next = session.getState();
      if (next.phase === 'setup' || next.phase === 'active') {
        this.liveDrillScenario = null;
        setHint(this.formatLivePostReviewLoadoutResolution('friendly_rematch', resolution) || '已进入低压力再战；本局不写正式积分。');
      } else if (next.phase === 'waiting_rematch' && next.lastError && next.lastError.reason === 'waiting_rematch') {
        const resolutionHint = this.formatLivePostReviewLoadoutResolution('friendly_rematch', resolution);
        setHint(resolutionHint ? `${resolutionHint} 等待本局对手确认。` : next.lastError.message || '已发起低压力再战，等待本局对手确认；不写正式积分。');
        if (next.phase === 'waiting_rematch') this.startLivePolling();
      }
      return;
    }
    if (id === 'review_events') {
      this.liveReviewFocus = 'events';
      const eventPanel = root ? root.querySelector('[data-live-event-panel]') : null;
      if (eventPanel) {
        eventPanel.setAttribute('data-live-review-focus', 'events');
      }
      this.renderLivePanel();
      const focusedPanel = root ? root.querySelector('[data-live-event-panel]') : null;
      if (focusedPanel) {
        if (typeof focusedPanel.scrollIntoView === 'function') {
          focusedPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
      setHint('已定位本局权威事件；复盘只展示公开事件，不暴露隐藏手牌或牌库顺序。');
      return;
    }
    if (id === 'review_key_turns') {
      this.liveReviewFocus = 'key_turns';
      const session = this.getLiveSession();
      let replayFetched = false;
      if (session && typeof session.getReplay === 'function') {
        try {
          const replayState = await session.getReplay({ visibility: 'replay_self' });
          replayFetched = !!(replayState && replayState.lastReplay);
        } catch (error) {
          console.warn('[PVP Live] replay fetch failed', error);
        }
      }
      const eventPanel = root ? root.querySelector('[data-live-event-panel]') : null;
      const keyTurnPanel = root ? root.querySelector('[data-live-key-turn-replay]') : null;
      if (eventPanel) {
        eventPanel.setAttribute('data-live-review-focus', 'key_turns');
      }
      if (keyTurnPanel) {
        keyTurnPanel.setAttribute('data-live-review-focus', 'key_turns');
      }
      this.renderLivePanel();
      const focusedKeyTurnPanel = root ? root.querySelector('[data-live-key-turn-replay]') : null;
      if (focusedKeyTurnPanel) {
        focusedKeyTurnPanel.setAttribute('data-live-review-focus', 'key_turns');
      }
      const focusedPanel = focusedKeyTurnPanel || (root ? root.querySelector('[data-live-event-panel]') : null);
      if (focusedPanel && typeof focusedPanel.scrollIntoView === 'function') {
        focusedPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      setHint(replayFetched
        ? '已拉取权威回放并定位关键回合；这里只使用 replay_self 与公开事件序列，不读取隐藏手牌、牌库或事件 payload。'
        : '已定位关键回合；这里只使用公开事件序列，不读取隐藏手牌、牌库或事件 payload。');
      return;
    }
    if (id === 'share_replay') {
      const session = this.getLiveSession();
      if (!session || typeof session.createReplayShare !== 'function') {
        setHint('实时论道战报分享服务未就绪。');
        return;
      }
      const nextState = await session.createReplayShare({ ttlDays: 30 });
      this.renderLivePanel();
      const share = nextState && nextState.lastReplayShare ? nextState.lastReplayShare : null;
      const shareLink = String(share && (share.shareUrl || share.sharePath) || '').trim();
      const shareCreated = nextState && nextState.lastError && nextState.lastError.reason === 'replay_share_created';
      if (!shareLink) {
        setHint(nextState && nextState.lastError && nextState.lastError.message || '公开战报分享生成失败。');
        return;
      }
      const copied = await this.copyLiveReplayShareLink(shareLink);
      setHint(copied && shareCreated
        ? '脱敏战报链接已复制；公开链接只包含 replay_public，不暴露隐藏手牌、牌库、本人结算或赛季荣誉。'
        : `脱敏战报链接已生成：${shareLink}`);
      return;
    }
    if (id === 'report_issue') {
      const session = this.getLiveSession();
      if (!session || typeof session.submitReport !== 'function') {
        setHint('实时论道异常反馈服务未就绪。');
        return;
      }
      const state = session.getState();
      const review = this.getLivePostMatchReview(state && state.stateView ? state.stateView : null);
      const reason = review && (review.finishReason === 'connection_timeout' || review.finishReason === 'timeout')
        ? 'connection_review'
        : 'fairness_review';
      await session.submitReport({
        reason,
        message: review
          ? `玩家从赛后复盘提交异常反馈：${review.finishReason || 'finished'} / ${review.result || 'result'}`
          : '玩家从赛后复盘提交异常反馈'
      });
      this.liveReviewFocus = this.liveReviewFocus || 'events';
      this.renderLivePanel();
      const next = session.getState();
      const receipt = this.getLiveDisputeReportReceipt(next.lastDisputeReport);
      setHint(receipt
        ? receipt.nextStepLine
        : next.lastError && next.lastError.message || '异常反馈提交失败，请稍后重试。');
      return;
    }
    if (id === 'avoid_opponent') {
      const session = this.getLiveSession();
      if (!session || typeof session.avoidOpponent !== 'function') {
        setHint('实时论道避开对手服务未就绪。');
        return;
      }
      const state = session.getState();
      const review = this.getLivePostMatchReview(state && state.stateView ? state.stateView : null);
      await session.avoidOpponent({
        reason: 'post_match_avoid',
        message: review
          ? `玩家从赛后复盘选择优先避开此对手：${review.finishReason || 'finished'} / ${review.result || 'result'}`
          : '玩家从赛后复盘选择优先避开此对手'
      });
      this.liveReviewFocus = this.liveReviewFocus || 'events';
      this.renderLivePanel();
      const next = session.getState();
      const receipt = this.getLiveAvoidOpponentReceipt(next.lastAvoidOpponentReport);
      setHint(receipt
        ? receipt.nextStepLine
        : next.lastError && next.lastError.message || '避开对手提交失败，请稍后重试。');
      return;
    }
    if (id === 'adjust_loadout') {
      if (!this.liveReviewFocus) this.liveReviewFocus = 'events';
      this.liveLoadoutReviewFocused = true;
      this.liveLoadoutReviewFocusReason = 'loadout';
      const loadoutPanel = root ? root.querySelector('.pvp-live-loadout-selector') : null;
      if (loadoutPanel) {
        loadoutPanel.setAttribute('data-live-review-focus', 'loadout');
        if (typeof loadoutPanel.scrollIntoView === 'function') {
          loadoutPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
      setHint('可以先调整入队斗法谱；finished 后改谱只影响下一局，当前战报保持不变。');
      return;
    }
    setHint('该复盘动作还在 MVP 阶段，当前不会写正式积分或调用旧残影结算。');
  },
  async refreshLiveMatch(options = {}) {
    this.liveInlineHint = '';
    const fromAutoPoll = options && options.fromAutoPoll === true;
    const session = this.getLiveSession();
    const state = session.getState();
    if (state.phase === 'waiting' && this.isLiveLongWait(state) && !fromAutoPoll) {
      this.liveLongWaitPollUntil = Date.now() + 30 * 1000;
    }
    if (state.phase === 'waiting') {
      await session.pollQueue();
    } else if (state.phase === 'idle' && typeof session.refreshInviteInbox === 'function') {
      await session.refreshInviteInbox();
    } else if (state.phase === 'waiting_invite' && typeof session.pollInvite === 'function') {
      await session.pollInvite();
    } else if (state.phase === 'waiting_rematch' && typeof session.pollRematch === 'function') {
      await session.pollRematch();
    } else if (state.matchId) {
      await session.refreshMatch();
    }
    const next = session.getState();
    if (!fromAutoPoll) {
      this.clearLiveIntentInFlight();
    }
    if (next.phase !== 'waiting' || !this.isLiveLongWait(next)) {
      this.liveLongWaitPollUntil = 0;
    }
    if (this.shouldLivePoll(next) && !this.livePollTimer) this.startLivePolling();
    if (!this.shouldLivePoll(next)) this.stopLivePolling();
    this.renderLivePanel();
  },
  async submitLiveCard(cardInstanceId) {
    const session = this.getLiveSession();
    if (!cardInstanceId) return;
    let state = session.getState();
    if (!(await this.ensureLiveConnectionReadyForSubmit(state))) {
      this.renderLivePanel();
      return session.getState();
    }
    state = session.getState();
    const view = state && state.stateView ? state.stateView : null;
    const targetSeat = view && view.opponent && view.opponent.seatId
      ? view.opponent.seatId
      : state && state.seatId === 'B'
        ? 'A'
        : 'B';
    const payload = {
      cardInstanceId,
      targetSeat
    };
    if (this.isLiveOpeningActionConfirmRequired(state, 'play_card', payload) && !this.isLiveOpeningActionConfirmArmed(state, 'play_card', payload)) {
      this.armLiveOpeningActionConfirm(state, 'play_card', payload, this.formatLiveOpeningActionConfirmMessage(state, 'play_card', payload));
      this.renderLivePanel();
      return state;
    }
    await this.submitLiveIntent({
      intentId: this.makeLiveIntentId('play-card'),
      intentType: 'play_card',
      payload
    });
    this.renderLivePanel();
  },
  toggleLiveMulliganCard(cardInstanceId) {
    if (!cardInstanceId) return;
    if (this.liveMulliganSelection.has(cardInstanceId)) {
      this.liveMulliganSelection.delete(cardInstanceId);
    } else if (this.liveMulliganSelection.size < 2) {
      this.liveMulliganSelection.add(cardInstanceId);
    }
    this.renderLivePanel();
  },
  async confirmLiveMulligan() {
    const session = this.getLiveSession();
    let state = session && typeof session.getState === 'function' ? session.getState() : null;
    if (!(await this.ensureLiveConnectionReadyForSubmit(state))) {
      this.renderLivePanel();
      return session.getState();
    }
    state = session.getState();
    await this.submitLiveIntent({
      intentId: this.makeLiveIntentId('mulligan'),
      intentType: 'mulligan',
      payload: {
        cardInstanceIds: Array.from(this.liveMulliganSelection).slice(0, 2)
      }
    });
    this.liveMulliganSelection.clear();
    this.renderLivePanel();
  },
  async readyLiveMatch() {
    const session = this.getLiveSession();
    let state = session && typeof session.getState === 'function' ? session.getState() : null;
    if (!(await this.ensureLiveConnectionReadyForSubmit(state))) {
      this.renderLivePanel();
      return session.getState();
    }
    state = session.getState();
    await this.submitLiveIntent({
      intentId: this.makeLiveIntentId('ready'),
      intentType: 'ready',
      payload: {}
    });
    this.renderLivePanel();
  },
  async endLiveTurn() {
    const session = this.getLiveSession();
    let state = session && typeof session.getState === 'function' ? session.getState() : null;
    if (!(await this.ensureLiveConnectionReadyForSubmit(state))) {
      this.renderLivePanel();
      return session.getState();
    }
    state = session.getState();
    if (this.isLiveOpeningActionConfirmRequired(state, 'end_turn', {}) && !this.isLiveOpeningActionConfirmArmed(state, 'end_turn', {})) {
      this.armLiveOpeningActionConfirm(state, 'end_turn', {}, this.formatLiveOpeningActionConfirmMessage(state, 'end_turn', {}));
      this.renderLivePanel();
      return state;
    }
    await this.submitLiveIntent({
      intentId: this.makeLiveIntentId('end-turn'),
      intentType: 'end_turn',
      payload: {}
    });
    this.renderLivePanel();
  },
  async surrenderLiveMatch() {
    const session = this.getLiveSession();
    let state = session && typeof session.getState === 'function' ? session.getState() : null;
    if (!state || !state.matchId || !(state.phase === 'active' || state.phase === 'sync_required')) return state;
    if (!(await this.ensureLiveConnectionReadyForSubmit(state))) {
      this.renderLivePanel();
      return session.getState();
    }
    state = session.getState();
    if (!this.isLiveSurrenderConfirmArmed(state)) {
      this.armLiveSurrenderConfirm(state, '再次点击确认认输；本局会立刻结束，对手获胜，正式结果只按当前对局模式的服务端规则处理。');
      this.renderLivePanel();
      return state;
    }
    this.clearLiveSurrenderConfirm();
    await this.submitLiveIntent({
      intentId: this.makeLiveIntentId('surrender'),
      intentType: 'surrender',
      payload: {}
    });
    this.stopLivePolling();
    this.renderLivePanel();
  },
  async updateMyRankInfo() {
    if (!PVPService || typeof PVPService.syncRank !== 'function') return;
    if (!PVPService.currentRankData) await PVPService.syncRank();
    const info = PVPService.currentRankData || null;
    const tierEl = document.getElementById('my-rank-tier');
    const scoreEl = document.getElementById('my-rank-score');
    if (info) {
      if (tierEl) tierEl.textContent = info.division || (PVPService.getDivisionByScore ? PVPService.getDivisionByScore(info.score || 1000) : '潜龙榜');
      if (scoreEl) scoreEl.textContent = info.score || 1000;
    } else {
      if (tierEl) tierEl.textContent = '潜龙榜';
      if (scoreEl) scoreEl.textContent = '1000';
    }
  },
  // === Ranking (Jade Slips) ===
  async loadRankings() {
    const listEl = document.getElementById('ranking-list');
    if (!listEl) return;
    const startedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    this.renderRankingFocusCard('loading');
    // Keep loading spinner if empty, or clear
    listEl.innerHTML = `
            <div class="loading-ink">
                 <div class="spinner"></div>
                 <span>读取天机中...</span>
            </div>
        `;
    try {
      if (!PVPService || typeof PVPService.getLeaderboard !== 'function') {
        throw new Error('PVPService unavailable');
      }
      const rankings = await PVPService.getLeaderboard();
      listEl.innerHTML = '';
      if (!rankings || rankings.length === 0) {
        listEl.innerHTML = '<div class="loading-ink"><span>暂无榜单数据</span></div>';
        this.rankingFocusData = null;
        this.rankingFocusId = null;
        this.lastLoadedRankings = [];
        this.renderRankingFocusCard();
        return;
      }
      const baseline = this.getCurrentRankBaseline();
      const myUserId = baseline.myRank && baseline.myRank.user ? baseline.myRank.user.objectId : null;
      const entries = [];
      rankings.forEach((rank, index) => {
        const row = document.createElement('div');
        row.className = 'jade-slip-row';
        if (index === 0) row.classList.add('rank-1');
        if (index === 1) row.classList.add('rank-2');
        if (index === 2) row.classList.add('rank-3');
        row.style.animationDelay = `${index * 0.1}s`; // Stagger animation

        const user = rank.user || {
          username: '未知修士'
        };
        const realmName = rank.realm ? `第${rank.realm}层` : '未知境界';
        const dangerProfile = typeof PVPService.getPVPDangerProfile === 'function' ? PVPService.getPVPDangerProfile({
          rank
        }, {
          ...baseline,
          listIndex: index
        }) : null;
        const rankId = rank.objectId || user.objectId || `rank-${index}`;
        // Avatar Initials
        const avatarChar = user.username ? user.username.charAt(0).toUpperCase() : '?';
        row.dataset.rankId = rankId;
        row.innerHTML = `
                    <div class="rank-index">${index + 1}</div>
                    
                    <div class="rank-avatar-container">
                        <div class="rank-avatar">${avatarChar}</div>
                        <div class="rank-aura"></div>
                    </div>
                    
                    <div class="rank-info">
                        <span class="rank-name">${user.username}</span>
                        <div class="rank-meta-strip">
                            <div class="rank-realm-badge">${realmName}</div>
                            ${dangerProfile ? `<div class="rank-risk-chip tier-${this.escapeHtml(dangerProfile.tierId || 'none')}">DRI ${this.escapeHtml(dangerProfile.index || 0)}</div>` : ''}
                            ${dangerProfile ? `<div class="rank-risk-chip axis">${this.escapeHtml(dangerProfile.dominantAxisLabel || '风险轴')}</div>` : ''}
                        </div>
                        ${dangerProfile ? `<div class="rank-risk-note">${this.escapeHtml(dangerProfile.brief || dangerProfile.summary || '')}</div>` : ''}
                    </div>
                    
                    <div class="rank-score-display">${rank.score}</div>
                `;
        row.addEventListener('click', () => this.setRankingFocus(rank, dangerProfile));
        listEl.appendChild(row);
        entries.push({
          rank,
          dangerProfile,
          rankId,
          isSelf: !!(myUserId && user.objectId === myUserId)
        });
      });
      this.lastLoadedRankings = entries;
      const focusedEntry = entries.find(entry => entry.rankId === this.rankingFocusId) || entries.find(entry => !entry.isSelf) || entries[0];
      if (focusedEntry) {
        this.setRankingFocus(focusedEntry.rank, focusedEntry.dangerProfile);
      } else {
        this.renderRankingFocusCard();
      }
      const gameRef = this.getGameRef();
      if (gameRef && gameRef.performanceStats) {
        const duration = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - startedAt;
        const arr = gameRef.performanceStats.pvpLoadDurations || [];
        arr.push(duration);
        if (arr.length > 20) arr.shift();
        gameRef.performanceStats.pvpLoadDurations = arr;
      }
    } catch (e) {
      listEl.innerHTML = '<div class="loading-ink" style="color:#f44">读取失败，请检查网络</div>';
      this.rankingFocusData = null;
      this.rankingFocusId = null;
      this.renderRankingFocusCard();
      console.error(e);
    }
  },
  async findMatch() {
    if (this.isMatching) {
      Utils.showBattleLog("正在匹配中，请稍候...");
      return;
    }
    this.setMatchingState(true);
    try {
      if (!PVPService || typeof PVPService.findOpponent !== 'function') {
        Utils.showBattleLog("匹配服务未就绪");
        return;
      }
      if (!PVPService.currentRankData) await PVPService.syncRank();
      const score = PVPService.currentRankData ? PVPService.currentRankData.score : 1000;
      const realm = PVPService.currentRankData ? PVPService.currentRankData.realm : 1;
      const preferredRank = this.rankingFocusData && this.rankingFocusData.rank ? this.rankingFocusData.rank : null;
      const preferredDangerProfile = this.rankingFocusData && this.rankingFocusData.dangerProfile ? this.rankingFocusData.dangerProfile : null;
      Utils.showBattleLog("神念搜寻中...");
      const timeoutMs = Math.max(2000, Number(this.matchingTimeoutMs) || 8000);
      const timeoutResult = new Promise(resolve => {
        setTimeout(() => resolve({
          success: false,
          timeout: true,
          message: '匹配超时，切换离线演武中...'
        }), timeoutMs);
      });
      let result = await Promise.race([PVPService.findOpponent(score, realm, {
        allowPractice: true,
        preferredRank,
        preferredDangerProfile
      }), timeoutResult]);
      if (result && result.timeout && typeof PVPService.createPracticeOpponent === 'function') {
        result = PVPService.createPracticeOpponent(score, realm, 'timeout', {
          preferredRank,
          preferredDangerProfile
        });
      }
      if (result.success) {
        if (typeof PVPService.getPVPDangerProfile === 'function') {
          result.opponent.dangerProfile = PVPService.getPVPDangerProfile(result.opponent, {
            myScore: score,
            myRealm: realm,
            myRank: PVPService.currentRankData || null
          });
        }
        if (preferredRank && typeof PVPService.getFocusDuelSlip === 'function') {
          result.opponent.matchIntent = PVPService.getFocusDuelSlip({
            rank: result.opponent.rank || preferredRank,
            dangerProfile: result.opponent.dangerProfile || preferredDangerProfile || null
          }, {
            myScore: score,
            myRealm: realm,
            myRank: PVPService.currentRankData || null,
            forcePractice: !!(result.opponent.rank && result.opponent.rank.isLocal)
          });
        }
        if (result.opponent && result.opponent.rank && result.opponent.rank.isLocal) {
          Utils.showBattleLog(preferredRank ? "已按焦点目标切入镜像演武" : "已进入离线演武匹配");
        } else if (result.opponent && result.opponent.matchIntent) {
          Utils.showBattleLog(`已锁定：${result.opponent.matchIntent.targetName} · ${result.opponent.matchIntent.modeLabel}`);
        }
        this.startPVPBattle(result.opponent);
      } else {
        Utils.showBattleLog(result.message || "未找到合适的对手");
      }
    } catch (e) {
      console.error("PVP matching failed:", e);
      Utils.showBattleLog("匹配失败，请稍后重试");
    } finally {
      this.setMatchingState(false);
    }
  },
  startPVPBattle(opponentData) {
    try {
      const gameRef = this.getGameRef();
      if (!gameRef) {
        Utils.showBattleLog("游戏实例未就绪，无法开始 PvP");
        return;
      }
      if (!opponentData || !opponentData.battleData) {
        console.error("Opponent data invalid", opponentData);
        Utils.showBattleLog("对手数据异常，无法开始");
        return;
      }
      const ghostData = opponentData.battleData;
      const ghostConfig = opponentData.ghost && opponentData.ghost.config ? opponentData.ghost.config : {};
      const opponentUserId = opponentData.ghost && opponentData.ghost.user && opponentData.ghost.user.objectId || opponentData.rank && opponentData.rank.user && opponentData.rank.user.objectId || 'ghost';
      const opponentUsername = opponentData.rank && opponentData.rank.user && opponentData.rank.user.username ? opponentData.rank.user.username : '未知对手';
      const matchIntent = opponentData.matchIntent && typeof opponentData.matchIntent === 'object' ? opponentData.matchIntent : null;
      const dangerProfile = opponentData.dangerProfile && typeof PVPService !== 'undefined' && PVPService && typeof PVPService.normalizePVPDangerProfile === 'function' ? PVPService.normalizePVPDangerProfile(opponentData.dangerProfile) : typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getPVPDangerProfile === 'function' ? PVPService.getPVPDangerProfile(opponentData, this.getCurrentRankBaseline()) : null;

      // Construct Ghost
      const ghost = new GhostEnemy({
        userId: opponentUserId,
        name: `幻影·${opponentUsername}`,
        maxHp: ghostData.me ? ghostData.me.maxHp : 100,
        // Fallback
        deck: ghostData.deck || [],
        currentHp: ghostData.me ? ghostData.me.maxHp : 100,
        maxEnergy: ghostData.me ? ghostData.me.energy || 3 : 3,
        energy: ghostData.me ? ghostData.me.currEnergy || ghostData.me.energy || 3 : 3,
        config: {
          ...ghostConfig,
          aiProfile: ghostData.aiProfile || ghostConfig.personality || 'balanced',
          personalityRules: ghostData.personalityRules || this.getPersonalityRuleSet(ghostConfig.personality || 'balanced')
        }
      });
      gameRef.pvpOpponentRank = opponentData.rank;
      gameRef.pvpMatchTicket = opponentData.matchTicket || null;
      gameRef.pvpDangerProfile = dangerProfile;
      gameRef.pvpMatchIntent = matchIntent;
      if (dangerProfile) {
        Utils.showBattleLog(`${dangerProfile.line}｜对策：${dangerProfile.counterplay}`);
      }
      if (matchIntent && matchIntent.modeLine) {
        Utils.showBattleLog(`约战单｜${matchIntent.modeLine}`);
      }

      // Initialize Battle
      if (typeof gameRef.startBattle === 'function') {
        gameRef.startBattle([ghost], null);
      } else if (gameRef.battle && typeof gameRef.battle.init === 'function') {
        console.log("Initializing PVP Battle with:", ghost);
        gameRef.mode = 'pvp';
        gameRef.showScreen('battle-screen');
        gameRef.battle.init([ghost]);
      } else {
        console.error("Battle module not ready");
        Utils.showBattleLog("战斗模块初始化失败");
        gameRef.showScreen('index'); // Return to safe screen
      }
    } catch (e) {
      console.error("PVP Start Crash:", e);
      Utils.showBattleLog("切磋启动失败，请查看控制台");
      const gameRef = this.getGameRef();
      if (gameRef) {
        gameRef.mode = 'pve';
        gameRef.pvpMatchTicket = null;
        gameRef.pvpOpponentRank = null;
        gameRef.pvpDangerProfile = null;
        gameRef.pvpMatchIntent = null;
        gameRef.pvpResultReview = null;
      }
      // Attempt to return to PVP screen
      setTimeout(() => {
        const safeGameRef = this.getGameRef();
        if (safeGameRef && typeof safeGameRef.showScreen === 'function') {
          safeGameRef.showScreen('main-menu');
          this.switchTab('ranking');
        }
      }, 1000);
    }
  },
  // === Defense Config ===

  // === Defense Config ===

  // === Defense Config ===

  // Personality Selector
  selectPersonality(type) {
    this.selectedPersonality = type;
    // Visual update for new DAO Cards
    document.querySelectorAll('.dao-card').forEach(el => {
      el.classList.remove('active');
      if (el.dataset.val === type) el.classList.add('active');
    });

    // Update Description
    const descEl = document.getElementById('dao-desc-text');
    if (descEl) {
      let text = "";
      let color = "rgba(255,255,255,0.6)";
      switch (type) {
        case 'balanced':
          text = "【万法自然】<br>均衡之道。不仅平衡攻防，战斗中每回合还能额外回复 1 点灵力。";
          color = "#aaddff";
          break;
        case 'slaughter':
          text = "【杀伐证道】<br>进攻是最好的防守。造成的伤害 +20%，但承受伤害增加 10%。";
          color = "#ff8888";
          break;
        case 'longevity':
          text = "【长生久视】<br>活着才有输出。最大生命值 +30%，造成的伤害降低 15%。";
          color = "#88ff88";
          break;
        default:
          text = "请选择阵灵的道心倾向...";
      }
      descEl.innerHTML = text;
      descEl.style.color = color;
    }
  },
  updateFormationVisuals() {
    const toggle = document.getElementById('guardian-formation');
    const isActive = toggle ? toggle.checked : false;
    const visualizer = document.querySelector('.defense-layout-split'); // Use container to scope active state
    const statusText = document.getElementById('formation-status-text');

    // Update Status Text on control panel
    if (statusText) {
      if (isActive) {
        statusText.textContent = "运行中";
        statusText.className = "value status-active";
      } else {
        statusText.textContent = "未激活";
        statusText.className = "value status-inactive";
      }
    }

    // Trigger animations via parent class
    if (visualizer) {
      if (isActive) {
        visualizer.classList.add('active-formation');
      } else {
        visualizer.classList.remove('active-formation');
      }
    }
  },
  async loadDefenseInfo() {
    const toggle = document.getElementById('guardian-formation');
    const visualizer = document.querySelector('.defense-layout-split');
    const statusText = document.getElementById('formation-status-text');
    const powerVal = document.getElementById('def-power-val');
    const defTime = document.getElementById('def-time');

    // Reset UI State
    if (toggle) toggle.checked = false;
    if (visualizer) visualizer.classList.remove('active-formation');
    if (statusText) {
      statusText.textContent = "未激活";
      statusText.className = "value status-inactive";
    }
    if (powerVal) powerVal.textContent = "---";
    if (defTime) defTime.textContent = "上次注入: 无记录";

    // Fetch Data
    try {
      const snapshot = await PVPService.getMyDefenseSnapshot();
      if (snapshot) {
        // Update UI with real data
        const config = snapshot.config || {};
        const isActive = config.guardianFormation || false;
        if (toggle) toggle.checked = isActive;

        // Visuals
        this.updateFormationVisuals();
        if (powerVal) powerVal.textContent = snapshot.powerScore || 0;
        if (snapshot.saveTime) {
          const date = new Date(snapshot.saveTime);
          const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          if (defTime) defTime.textContent = `上次注入: ${timeStr}`;
        }

        // Personality
        if (config.personality) {
          this.selectPersonality(config.personality);
        }
      }
    } catch (e) {
      console.warn("Failed to load defense info:", e);
    }
  },
  async uploadDefense() {
    const gameRef = this.getGameRef();
    if (!gameRef || !gameRef.player) {
      Utils.showBattleLog("请先进入游戏选择角色");
      return;
    }
    const toggle = document.getElementById('guardian-formation');
    const formation = !!(toggle && toggle.checked);
    const deck = Array.isArray(gameRef.player.deck) ? gameRef.player.deck : [];
    const snapshot = {
      powerScore: this.calculatePowerScore(),
      realm: gameRef.player.realm || 1,
      data: {
        me: {
          maxHp: gameRef.player.maxHp,
          energy: gameRef.player.maxEnergy,
          currEnergy: gameRef.player.maxEnergy
        },
        deck: deck.map(c => ({
          id: c.id,
          upgraded: c.upgraded,
          name: c.name
        })),
        aiProfile: this.selectedPersonality,
        deckArchetype: typeof PVPService !== 'undefined' && PVPService.getDeckArchetype ? PVPService.getDeckArchetype(deck) : 'balanced',
        ruleVersion: typeof PVPService !== 'undefined' && PVPService.ruleVersion ? PVPService.ruleVersion : 'pvp-v2'
      },
      personality: this.selectedPersonality,
      guardianFormation: formation
    };
    snapshot.data.personalityRules = this.getPersonalityRuleSet(this.selectedPersonality);

    // Visual Feedback - Pulse the button
    const btn = document.querySelector('#tab-defense .ink-btn-large span.btn-icon');
    if (btn) {
      btn.innerHTML = "⏳";
    }
    const res = await PVPService.uploadSnapshot(snapshot);
    if (btn) btn.innerHTML = "🌩️";
    if (res.success) {
      Utils.showBattleLog(res.message || "防御幻影上传成功！");
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const timeEl = document.getElementById('def-time');
      if (timeEl) timeEl.textContent = `上次注入: ${timeStr}`;
      const powerEl = document.getElementById('def-power-val');
      if (powerEl) powerEl.textContent = snapshot.powerScore;

      // Add success visual effect
      const visualizer = document.querySelector('.formation-visualizer-panel');
      if (visualizer) {
        const flash = document.createElement('div');
        flash.style.position = 'absolute';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.background = 'rgba(207, 170, 112, 0.5)';
        flash.style.pointerEvents = 'none';
        flash.style.transition = 'opacity 0.5s';
        visualizer.appendChild(flash);
        setTimeout(() => flash.style.opacity = '0', 50);
        setTimeout(() => flash.remove(), 550);
      }
    } else {
      Utils.showBattleLog("上传失败: " + (res.message || '未知错误'));
    }
  },
  calculatePowerScore() {
    const gameRef = this.getGameRef();
    if (!gameRef || !gameRef.player) return 0;
    let score = gameRef.player.maxHp * 2;
    if (gameRef.player.deck) score += gameRef.player.deck.length * 10;
    return Math.floor(score);
  },
  // === Shop (Zhutian Pavilion) ===
  filterShop(category) {
    this.activeShopCategory = category;
    this.loadShop();

    // Update Sidebar UI
    document.querySelectorAll('.shop-category').forEach(el => {
      el.classList.remove('active');
      // Simple check for onclick attribute content
      const clickAttr = el.getAttribute('onclick');
      if (clickAttr && clickAttr.includes(`'${category}'`)) {
        el.classList.add('active');
      }
    });
  },
  loadShop() {
    const grid = document.getElementById('shop-unified-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const allItems = PVP_SHOP_ITEMS ? PVP_SHOP_ITEMS : {
      cards: [],
      items: [],
      cosmetics: []
    };

    // Simple distinct arrays
    const cards = allItems.cards || [];
    const items = allItems.items || [];
    const cosmetics = allItems.cosmetics || [];
    let displayItems = [];
    if (this.activeShopCategory === 'all') {
      displayItems = [...cards, ...items, ...cosmetics];
    } else if (this.activeShopCategory === 'cards') {
      displayItems = cards;
    } else if (this.activeShopCategory === 'items') {
      displayItems = items;
    } else if (this.activeShopCategory === 'cosmetics') {
      displayItems = cosmetics;
    }
    if (displayItems.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; color:rgba(255,255,255,0.3); padding-top:100px; font-size:1.2rem;">此分类暂无商品</div>';
      this.updateShopWallet();
      return;
    }
    displayItems.forEach((item, index) => {
      const state = typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getShopItemState === 'function' ? PVPService.getShopItemState(item.id) : {
        buyable: false,
        reason: 'service_unavailable',
        remainingStock: null
      };
      const el = this.createShopItemElement(item, state);
      el.style.animationDelay = `${index * 0.05}s`; // Stagger
      grid.appendChild(el);
    });
    this.updateShopWallet();
  },
  updateShopWallet() {
    const walletEl = document.getElementById('shop-wallet-amount');
    if (!walletEl) return;
    if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getWalletSummary === 'function') {
      const wallet = PVPService.getWalletSummary();
      walletEl.textContent = Math.max(0, Math.floor(Number(wallet.coins) || 0));
      this.updateShopMetaPanels(wallet);
      return;
    }
    walletEl.textContent = '0';
    this.updateShopMetaPanels(null);
  },
  updateShopMetaPanels(wallet = null) {
    const cosmeticEl = document.getElementById('shop-cosmetic-status');
    const rewardEl = document.getElementById('shop-reward-status');
    const logEl = document.getElementById('shop-activity-log');
    const walletData = wallet || (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getWalletSummary === 'function' ? PVPService.getWalletSummary() : null);
    let equipped = {
      skin: null,
      title: null
    };
    if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getEquippedCosmetics === 'function') {
      equipped = PVPService.getEquippedCosmetics();
    }
    if (cosmeticEl) {
      const titleText = equipped && equipped.title ? equipped.title.name : '未佩戴称号';
      const skinText = equipped && equipped.skin ? equipped.skin.name : '未佩戴外观';
      cosmeticEl.textContent = `称号：${titleText} ｜ 外观：${skinText}`;
    }
    if (rewardEl) {
      if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getRewardPreview === 'function' && walletData) {
        const previewWin = PVPService.getRewardPreview(true, 1000);
        const mult = previewWin && previewWin.breakdown ? Number(previewWin.breakdown.totalMultiplier || 1).toFixed(2) : '1.00';
        const seasonName = previewWin && previewWin.season ? previewWin.season.name || '常驻' : '常驻';
        const division = previewWin && previewWin.breakdown ? previewWin.breakdown.myDivision || '潜龙榜' : '潜龙榜';
        rewardEl.textContent = `赛季：${seasonName} ｜ 段位：${division} ｜ 连胜 ${walletData.winStreak || 0} ｜ 下场胜利预估 +${previewWin.totalReward}（倍率 x${mult}）`;
      } else {
        rewardEl.textContent = '暂无奖励预估数据';
      }
    }
    if (logEl) {
      let logs = [];
      if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getRecentTransactions === 'function') {
        logs = PVPService.getRecentTransactions(6);
      }
      if (!logs || logs.length === 0) {
        logEl.innerHTML = '<div class="shop-log-empty">暂无交易记录</div>';
        return;
      }
      logEl.innerHTML = logs.map(entry => {
        const at = new Date(entry.at || Date.now());
        const hh = String(at.getHours()).padStart(2, '0');
        const mm = String(at.getMinutes()).padStart(2, '0');
        const sign = entry.coins > 0 ? '+' : '';
        const coinText = entry.coins ? `${sign}${entry.coins}` : '--';
        const title = entry.itemName || entry.detail || entry.type || '记录';
        return `<div class="shop-log-item"><span class="shop-log-time">${renderEscapeHtml(`${hh}:${mm}`)}</span><span class="shop-log-title">${renderEscapeHtml(title)}</span><span class="shop-log-coin">${renderEscapeHtml(coinText)}</span></div>`;
      }).join('');
    }
  },
  createShopItemElement(item, itemState = null) {
    const el = document.createElement('div');
    el.className = 'talisman-card';
    if (item && item.id) {
      el.dataset.itemId = item.id;
    }
    // Add fade-in animation class if needed, or rely on CSS default

    let typeLabel = "道具";
    if (item.type === 'card') typeLabel = "秘籍";
    if (item.type === 'skin') typeLabel = "外观";
    if (item.type === 'title') typeLabel = "称号";
    const state = itemState || {
      buyable: false,
      reason: 'unknown',
      remainingStock: null
    };
    const remaining = state.remainingStock;
    const stockText = remaining === null ? '不限量' : `剩余 ${remaining}/${Math.max(0, Math.floor(Number(item.stock) || 0))}`;
    let buyText = '兑换';
    if (state.reason === 'owned') buyText = '已拥有';else if (state.reason === 'equippable') buyText = '佩戴';else if (state.reason === 'equipped') buyText = '卸下';else if (state.reason === 'sold_out') buyText = '已售罄';else if (state.reason === 'insufficient') buyText = '币不足';
    el.innerHTML = `
            <div class="talisman-top-decor"></div>
            <div class="talisman-icon-area">
                <div class="shop-icon">${item.icon || '📦'}</div>
            </div>
            <div class="talisman-info">
                <div class="item-type-badge">${typeLabel}</div>
                <div class="talisman-name">${item.name}</div>
                <div class="talisman-desc">${item.description}</div>
                <div class="talisman-price-tag">
                    <span class="price-text">${item.price}</span>
                    <span style="font-size: 0.8rem; color: #666;">天道币</span>
                </div>
                <div class="shop-stock-info">${stockText}</div>
            </div>
            <div class="buy-overlay ${state.buyable ? 'buyable' : `state-${state.reason || 'locked'}`}" data-state="${state.reason || 'locked'}">
                <span class="buy-btn-text">${buyText}</span>
            </div>
        `;
    const overlay = el.querySelector('.buy-overlay');
    if (overlay) {
      overlay.dataset.itemId = item.id || '';
      if (state.buyable || state.reason === 'equippable' || state.reason === 'equipped') {
        overlay.addEventListener('click', () => this.purchaseShopItem(item.id));
      }
    }
    return el;
  },
  purchaseShopItem(itemId) {
    if (!itemId) return;
    if (typeof PVPService === 'undefined' || !PVPService || typeof PVPService.handleShopItemAction !== 'function') {
      Utils.showBattleLog('商店服务未就绪');
      return;
    }
    const result = PVPService.handleShopItemAction(itemId, {
      game: this.getGameRef()
    });
    if (result && result.success) {
      Utils.showBattleLog(result.message || '兑换成功');
      if (result.wallet && typeof result.wallet.coins === 'number') {
        const walletEl = document.getElementById('shop-wallet-amount');
        if (walletEl) walletEl.textContent = Math.max(0, Math.floor(result.wallet.coins));
      }
      this.updateShopMetaPanels(result.wallet || null);
      if (this.getGameRef() && typeof this.getGameRef().updateCharacterInfo === 'function') {
        this.getGameRef().updateCharacterInfo();
      }
      const gameRef = this.getGameRef();
      if (gameRef && typeof gameRef.autoSave === 'function') {
        gameRef.autoSave();
      }
    } else {
      Utils.showBattleLog(result && result.message ? result.message : '兑换失败');
    }
    this.loadShop();
  }
};

if (typeof window !== 'undefined') {
  window.PVPScene = PVPScene;
}
