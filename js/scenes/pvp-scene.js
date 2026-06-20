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
  switchTab(tabName) {
    if (this.activeTab === 'live' && tabName !== 'live') {
      this.stopLivePolling();
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
    if (tabName === 'ranking') this.loadRankings();
    if (tabName === 'live') this.loadLivePanel();
    if (tabName === 'defense') this.loadDefenseInfo();
    if (tabName === 'shop') this.loadShop();
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
    await this.sendLiveHeartbeat({ resumeRealtime: true });
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
    return labels[status] || `连接${status}`;
  },
  formatLiveMatchQuality(view) {
    const report = this.getLiveMatchQuality(view);
    if (!report) return '匹配质量：等待真人';
    const labels = {
      good: '良好',
      expanded: '扩圈',
      wide_but_accepted: '宽跨度',
      rejected: '拒绝'
    };
    const tag = labels[report.tag] || report.tag;
    const maxWaitSec = Math.ceil(Math.max(report.waitMs.A, report.waitMs.B) / 1000);
    const connectionHealth = this.formatLiveMatchConnectionHealth(report);
    return `匹配质量：${tag} · ${report.expansionStage} · ${report.ratingDeltaBucket} · ${connectionHealth} · 等待 ${maxWaitSec}s`;
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
  getLiveConnectionTempo(view, sourceState = null) {
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
      return makeTempo(
        'viewer_refresh_required',
        viewerSeat,
        'danger',
        `连接：我方断线 · 刷新同步权威结果；若仍在可恢复窗口会自动重连，否则按 connection_timeout 结算 · 对方${opponentLabel}`,
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
          `连接：我方${viewerLabel} · 对方重连宽限 ${opponentGraceSec}s · 对方当前行动，宽限结束才会按 connection_timeout 权威结算`,
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
          '对局继续：非当前行动方断线不会立刻触发 connection_timeout；当前行动仍可提交，轮到对手仍未恢复才会处理。'
        );
      }
      if (phase === 'active' && currentSeat === opponentSeat) {
        return makeTempo(
          'opponent_action_timeout_pending',
          opponentSeat,
          'warning',
          `连接：我方${viewerLabel} · 对方断线 · 对方当前行动，等待 connection_timeout 权威超时结算`,
          '只有当前行动方断线超过宽限，服务端才会发布终局；胜负以 match_finished 为准。'
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
      <span class="pvp-live-opening-safeguard-chip">首动预算 · ${this.escapeHtml(currentBudgetText)}</span>
      <span class="pvp-live-opening-safeguard-chip">先手 ${this.escapeHtml(report.firstSeat || 'A')} ${report.damageBudget.firstSeat} / 后手 ${this.escapeHtml(report.secondSeat || 'B')} ${report.damageBudget.secondSeat}</span>
      <span class="pvp-live-opening-safeguard-chip" data-live-opening-second-seat-buffer>后手护盾 · ${this.escapeHtml(secondSeatBufferText)}</span>
      <span class="pvp-live-opening-safeguard-chip">开局护体 · ${this.escapeHtml(protectionText)}</span>
      <span class="pvp-live-opening-safeguard-chip">反打缓冲 · 护盾 ${report.counterplay.block} · ${this.escapeHtml(counterplaySeats)}</span>
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
          publicStatusMitigation: publicStatusMitigation ? {
            statusId: String(publicStatusMitigation.statusId || ''),
            label: String(publicStatusMitigation.label || ''),
            seatId: String(publicStatusMitigation.seatId || ''),
            sourceSeat: String(publicStatusMitigation.sourceSeat || ''),
            responseWindow: String(publicStatusMitigation.responseWindow || ''),
            mitigation: String(publicStatusMitigation.mitigation || '')
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
    return `${preview.cardName || '术式'}：预算后 ${preview.budgetedDamage}，破盾 ${preview.blockedDamage}，生命伤害 ${preview.hpDamage}，${targetSeat} 预计 ${preview.targetHpAfter} 血${protectionText}${blockText}。`;
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
    const draw = report.draw && typeof report.draw === 'object' ? report.draw : {};
    const counterplay = report.counterplay && typeof report.counterplay === 'object' ? report.counterplay : {};
    const normalizeStatusEffect = (status = {}) => ({
      statusId: String(status.statusId || ''),
      label: String(status.label || ''),
      seatId: String(status.seatId || ''),
      sourceSeat: String(status.sourceSeat || ''),
      mitigatedBySeat: String(status.mitigatedBySeat || ''),
      damageBonus: Math.max(0, Math.floor(Number(status.damageBonus) || 0)),
      mitigatedTurnIndex: Math.max(0, Math.floor(Number(status.mitigatedTurnIndex) || 0)),
      consumedTurnIndex: Math.max(0, Math.floor(Number(status.consumedTurnIndex) || 0)),
      responseWindow: String(status.responseWindow || ''),
      mitigation: String(status.mitigation || '')
    });
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
        targetHpAfter: Math.max(0, Math.floor(Number(damage.targetHpAfter) || 0))
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
      statusEffects: {
        applied: Array.isArray(statusEffects.applied) ? statusEffects.applied.map(normalizeStatusEffect).filter(status => status.statusId).slice(0, 3) : [],
        consumed: Array.isArray(statusEffects.consumed) ? statusEffects.consumed.map(normalizeStatusEffect).filter(status => status.statusId).slice(0, 3) : [],
        mitigated: Array.isArray(statusEffects.mitigated) ? statusEffects.mitigated.map(normalizeStatusEffect).filter(status => status.statusId).slice(0, 3) : []
      },
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
    const mitigationChip = report.statusEffects && Array.isArray(report.statusEffects.mitigated) && report.statusEffects.mitigated.length > 0
      ? '<span class="pvp-live-action-receipt-chip" data-live-public-status-mitigation="public_status_mitigated">公开状态缓解</span>'
      : '';
    return `
      <span class="pvp-live-action-receipt-chip">${this.escapeHtml(receiptLabel)}</span>
      <span class="pvp-live-action-receipt-line">${this.escapeHtml(summary)}</span>
      ${mitigationChip}
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
  getLivePublicStatuses(seat) {
    const statuses = Array.isArray(seat && seat.publicStatuses) ? seat.publicStatuses : [];
    return statuses.slice(0, 6).map(status => ({
      statusId: String(status && status.statusId || ''),
      label: String(status && status.label || '公开状态'),
      sourceSeat: String(status && status.sourceSeat || ''),
      stacks: Math.max(1, Math.floor(Number(status && status.stacks) || 1)),
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
          userId: String(report.sourceParticipants && report.sourceParticipants.A && report.sourceParticipants.A.userId || ''),
          displayName: String(report.sourceParticipants && report.sourceParticipants.A && (report.sourceParticipants.A.displayName || report.sourceParticipants.A.userId) || '甲方')
        },
        B: {
          sourceSeat: 'B',
          userId: String(report.sourceParticipants && report.sourceParticipants.B && report.sourceParticipants.B.userId || ''),
          displayName: String(report.sourceParticipants && report.sourceParticipants.B && (report.sourceParticipants.B.displayName || report.sourceParticipants.B.userId) || '乙方')
        }
      },
      leaderSourceSeat: String(report.leaderSourceSeat || ''),
      winnerSourceSeat: String(report.winnerSourceSeat || ''),
      canRequestNextRound: !!report.canRequestNextRound,
      rankedImpact: String(report.rankedImpact || 'none'),
      formalResultPolicy: String(report.formalResultPolicy || 'practice_only'),
      seatPolicy: String(report.seatPolicy || 'swap_sides'),
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
    return {
      reportVersion: String(report.reportVersion || 'pvp-live-waiting-report-v1'),
      waitMs: Math.max(0, Math.floor(Number(report.waitMs) || 0)),
      longWaitThresholdMs: Math.max(0, Math.floor(Number(report.longWaitThresholdMs) || 120000)),
      longWait: !!report.longWait,
      message: String(report.message || ''),
      safeguards: Array.isArray(report.safeguards) ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8) : [],
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
  isLiveEntrySafeguardBlocked(state = null) {
    const report = this.getLiveConnectionHealthError(state);
    const status = String(report && report.connectionHealth && report.connectionHealth.status || '');
    return status === 'blocked' || status === 'risky';
  },
  hasLiveEntrySafeguardAction(state = null, actionId = '') {
    const report = this.getLiveConnectionHealthError(state);
    const id = String(actionId || '');
    return !!(report && report.connectionHealth.actions.some(action => action.id === id));
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
    if (!report || !report.longWait) return '';
    const waitSec = Math.ceil(report.waitMs / 1000);
    const thresholdSec = Math.max(1, Math.ceil(report.longWaitThresholdMs / 1000));
    return `
      <div class="pvp-live-waiting-head">
        <span>${this.escapeHtml(thresholdSec)} 秒无真人</span>
        <span>已等待 ${this.escapeHtml(waitSec)}s</span>
      </div>
      <div>${this.escapeHtml(report.message || '当前真人较少，可继续等待、进入问道练习或取消匹配；不会自动切残影。')}</div>
      <div class="pvp-live-waiting-actions">
        ${report.actions.map(action => action.id === 'accept_wide_match'
          ? `<button class="pvp-live-waiting-action challenge-btn secondary" type="button" data-live-waiting-action="accept-wide-match" title="${this.escapeHtml(action.detail)}" onclick="PVPScene.acceptLiveWideMatch()">${this.escapeHtml(action.label)}</button>`
          : `<span class="pvp-live-waiting-action" title="${this.escapeHtml(action.detail)}">${this.escapeHtml(action.label)}：${this.escapeHtml(action.detail)}</span>`).join('')}
      </div>
    `;
  },
  buildLiveWaitingPracticeScenario(state = null) {
    const sourceState = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    const waitingReport = this.getLiveWaitingReport(sourceState);
    if (!waitingReport || !waitingReport.longWait) return null;
    const queueTicket = String(sourceState && sourceState.queueTicket || '').trim();
    const sourceId = queueTicket || `long-wait-${Date.now()}`;
    const selectedLoadout = this.getLiveSelectedLoadoutPreset();
    const waitSec = Math.ceil(waitingReport.waitMs / 1000);
    return {
      reportVersion: 'pvp-live-drill-scenario-v1',
      sourceMatchId: `waiting:${sourceId}`,
      sourceVisibility: 'replay_self',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      result: 'waiting',
      finishReason: 'long_wait',
      recommendedLoadoutId: selectedLoadout.id,
      recommendedLoadoutLabel: selectedLoadout.label,
      themeKey: 'tempo',
      themeLabel: '等待真人',
      trainingAdvice: `长等待练习：已等待 ${waitSec}s，先练调息、首轮稳血和低费节奏；不写正式积分。`,
      drillObjective: `${selectedLoadout.label}：等待真人时练首轮调息和出牌节奏，不写正式积分。`,
      trainingTags: ['真人 PVP', '长等待练习', '不计积分', '等待真人'],
      publicEventTypes: ['queue_long_wait'],
      sourceEventSequences: [],
      waitingReport
    };
  },
  buildLiveEntrySafeguardPracticeScenario(state = null) {
    const sourceState = state && typeof state === 'object' ? state : this.getLiveSession().getState();
    if (!this.isLiveEntrySafeguardBlocked(sourceState) || !this.hasLiveEntrySafeguardAction(sourceState, 'practice')) return null;
    const report = this.getLiveConnectionHealthError(sourceState);
    const selectedLoadout = this.getLiveSelectedLoadoutPreset();
    return {
      reportVersion: 'pvp-live-drill-scenario-v1',
      sourceMatchId: 'entry_safeguard:connection_health_failed',
      sourceVisibility: 'replay_self',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      result: 'entry_safeguard_blocked',
      finishReason: 'connection_health_failed',
      recommendedLoadoutId: selectedLoadout.id,
      recommendedLoadoutLabel: selectedLoadout.label,
      themeKey: 'connection_health',
      themeLabel: '入场保障',
      trainingAdvice: '连接健康入场保障：当前连接未稳定，先练首轮调息、稳血和低费节奏；不写正式积分。',
      drillObjective: `${selectedLoadout.label}：连接恢复前先练首轮稳血和出牌节奏，不写正式积分。`,
      trainingTags: ['真人 PVP', '连接健康练习', '不计积分', '入场保障'],
      publicEventTypes: ['connection_health_failed'],
      sourceEventSequences: [],
      connectionHealth: report ? report.connectionHealth : null
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
      ratingLabel: '连接健康练习',
      ratingTone: 'selected',
      trainingAdvice: scenario.trainingAdvice,
      highlightLine: scenario.drillObjective,
      routeFocusLine: '未进入正式排位队列；练习不写正式积分，恢复后再重试检测。',
      compareHint: '练习只使用入场保障和公开规则，不读取对手隐藏手牌或牌库。',
      trainingTags: scenario.trainingTags,
      goalHighlights: [
        '入场保障：connection_health_failed',
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
    const message = '已进入真人 PVP 连接健康练习：练习不写正式积分，恢复后可重试正式排位。';
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
      const cancelSucceeded = !cancelError
        && afterCancelState
        && afterCancelState.phase === 'idle'
        && !afterCancelState.queueTicket
        && !afterCancelState.matchId
        && !afterCancelState.lastError;
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
      nextActions: nextActions.slice(0, 6).map(action => ({
        id: String(action && action.id || ''),
        label: String(action && action.label || ''),
        detail: String(action && action.detail || '')
      })).filter(action => action.id && action.label)
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
    const honor = report.seasonHonorReport;
    const getCollectionLabel = (state) => state === 'newly_unlocked' ? '新入库' : state === 'owned' ? '已入库' : '待入库';
    return `
      <div
        class="pvp-live-settlement-report"
        data-live-settlement-report
        data-live-settlement-source="${this.escapeHtml(report.sourceVisibility)}"
        data-live-settlement-hidden="${report.usesHiddenInformation ? 'true' : 'false'}"
      >
        <div class="pvp-live-settlement-head">
          <span>${this.escapeHtml(resultLabel)}</span>
          <span>${this.escapeHtml(report.formalResultPolicy)}</span>
        </div>
        <div class="pvp-live-settlement-summary">${this.escapeHtml(report.summaryLine)}</div>
        <div class="pvp-live-settlement-grid">
          <span>原积分 ${this.escapeHtml(report.oldScore)}</span>
          <span>正式积分 ${this.escapeHtml(deltaText)}</span>
          <span>当前 ${this.escapeHtml(report.scoreAfter)}</span>
          <span>天道币 +${this.escapeHtml(report.coinsAwarded)}</span>
        </div>
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
    const impactLabel = series.rankedImpact === 'none' ? '不写正式积分' : series.rankedImpact;
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
    const canCancel = series.status === 'waiting_rematch';
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
        <span>系列 ${this.escapeHtml(series.seriesId.slice(0, 12) || '--')} · ${this.escapeHtml(series.seatPolicy)}</span>
        ${canCancel ? `
          <button
            type="button"
            class="pvp-live-friendly-series-cancel"
            data-live-action="cancel-rematch"
            onclick="PVPScene.cancelLiveRematch()"
          >取消再战等待</button>
        ` : ''}
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
      safeguardSummary: {
        setupReady: String(report.safeguardSummary && report.safeguardSummary.setupReady || ''),
        firstActionBudget: String(report.safeguardSummary && report.safeguardSummary.firstActionBudget || ''),
        openingProtection: String(report.safeguardSummary && report.safeguardSummary.openingProtection || '')
      },
      summary: String(report.summary || ''),
      recommendedAction: String(report.recommendedAction || ''),
      fairnessChecks: checks.slice(0, 5).map(check => ({
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
      terminalVerdict: String(report.terminalVerdict || ''),
      nextStepLine: String(report.nextStepLine || ''),
      boundary: String(report.boundary || '公平回执只汇总公开复盘证据，不读取隐藏手牌、牌库或原始事件明细。'),
      evidenceSummary: evidenceSummary.slice(0, 5).map(item => ({
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
          ${verdicts.slice(0, 6).map(line => `<span>${this.escapeHtml(line)}</span>`).join('')}
        </div>
        <div class="pvp-live-fairness-evidence">
          ${receipt.evidenceSummary.map(item => `
            <span class="${item.passed ? 'passed' : 'watch'}">
              ${this.escapeHtml(item.label)} · ${this.escapeHtml(item.passed ? '通过' : '观察')}
              ${item.evidenceSequences.length ? ` · #${this.escapeHtml(item.evidenceSequences.join('/#'))}` : ''}
            </span>
          `).join('')}
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
            <div class="pvp-live-key-turn severity-${this.escapeHtml(turn.severity)}" data-live-key-turn="${this.escapeHtml(turn.id)}">
              <div class="pvp-live-key-turn-meta">
                <span>${this.escapeHtml(turn.label)}</span>
                <span>${turn.sequence !== null ? `#${this.escapeHtml(turn.sequence)}` : '--'} · ${this.escapeHtml(turn.eventType)}</span>
              </div>
              <div class="pvp-live-key-turn-lesson">${this.escapeHtml(turn.lesson)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
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
  getLiveSeasonGoalSeasonId(view) {
    const seasonId = String(view && view.matchQuality && view.matchQuality.seasonId || '').trim();
    return seasonId || 's1-genesis';
  },
  getLiveSeasonGoalRecommendedMode(review) {
    const actionIds = new Set((Array.isArray(review && review.nextActions) ? review.nextActions : [])
      .map(action => String(action && action.id || ''))
      .filter(Boolean));
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
  getLiveSeasonGoalCopy(mode, review) {
    const result = String(review && review.result || '');
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
    const stored = session && typeof session.getSeasonGoalState === 'function'
      ? session.getSeasonGoalState(seasonId)
      : { seasonId, lastReviewAction: '', recommendedMode: '', dismissedUntilSeason: '' };
    const recommendedMode = this.getLiveSeasonGoalRecommendedMode(review);
    const copy = this.getLiveSeasonGoalCopy(recommendedMode, review);
    const dismissed = stored && stored.dismissedUntilSeason === seasonId;
    return {
      reportVersion: 'pvp-live-season-goal-v1',
      sourceVisibility: 'public_review',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      seasonId,
      dismissState: dismissed ? 'dismissed_until_season' : 'active',
      recommendedMode,
      actionLabel: copy.label,
      title: copy.title,
      detail: copy.detail,
      boundary: '只记录本地复盘目标，不写正式积分或奖励。',
      lastReviewAction: String(stored && stored.lastReviewAction || ''),
      updatedAt: Math.max(0, Math.floor(Number(stored && stored.updatedAt) || 0))
    };
  },
  renderLiveSeasonGoalCard(view) {
    const goal = this.getLiveSeasonGoalCard(view);
    if (!goal || goal.dismissState === 'dismissed_until_season') return '';
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
          >本赛季不再提示</button>
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
    this.liveInlineHint = '已关闭本赛季复盘目标提示；这只影响本地显示，不写正式积分或奖励。';
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
  renderLivePostMatchReview(view, phase = 'idle') {
    const review = this.getLivePostMatchReview(view);
    if (!review) return '';
    const resultLabel = review.result === 'win' ? '胜局' : review.result === 'loss' ? '败局' : '终局';
    const finishLabels = {
      surrender: '认输',
      lethal: '伤害终结',
      timeout: '行动超时'
    };
    const finishLabel = finishLabels[review.finishReason] || review.finishReason || '终局';
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
      ${this.renderLiveSeasonGoalCard(view)}
      ${this.renderLiveLoadoutRecommendation(review, phase)}
      <div class="pvp-live-review-actions">
        ${review.nextActions.map(action => `
          <button
            type="button"
            data-live-post-review-action="${this.escapeHtml(action.id)}"
            onclick="PVPScene.handleLivePostReviewAction('${this.escapeHtml(action.id)}')"
            title="${this.escapeHtml(action.detail || action.label)}"
            ${this.isLivePostReviewActionDisabled(action.id, phase) ? 'disabled' : ''}
          >${this.escapeHtml(action.label)}</button>
        `).join('')}
      </div>
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
    const payload = event && event.payload && typeof event.payload === 'object'
      ? event.payload
      : event && event.publicData && typeof event.publicData === 'object' ? event.publicData : {};
    const actor = event && event.actingSeat ? `席位 ${event.actingSeat}` : '';
    const eventMap = {
      opening_protection_triggered: '开局护体触发',
      opening_second_seat_buffer_granted: '后手护盾发放',
      opening_counterplay_granted: '反打缓冲发放',
      budget_clamped: '首动伤害压制',
      damage_applied: '伤害结算',
      status_applied: '公开状态施加',
      status_consumed: '公开状态兑现',
      status_mitigated: '公开状态缓解',
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
      match_invalidated: '无效局',
      match_finished: '对局结束',
      snapshot_locked: '斗法谱锁定',
      test_state_forced: '测试态校准',
      emote_sent: '预设表情'
    };
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
      detail = `${seatId ? `目标 ${seatId}` : '目标'} · ${label} · 反制窗口后可兑现${earliest ? ` · 最早第 ${earliest} 手` : ''}`;
    } else if (type === 'status_consumed') {
      const label = String(payload.label || '公开状态');
      const seatId = String(payload.seatId || '');
      const damageBonus = Math.max(0, Math.floor(Number(payload.damageBonus) || 0));
      detail = `${seatId ? `目标 ${seatId}` : '目标'} · 消耗${label} · 额外伤害 +${damageBonus}`;
    } else if (type === 'status_mitigated') {
      const label = String(payload.label || '公开状态');
      const seatId = String(payload.seatId || '');
      const mitigatedBySeat = String(payload.mitigatedBySeat || event.actingSeat || '');
      detail = `${seatId ? `目标 ${seatId}` : '目标'} · ${mitigatedBySeat ? `${mitigatedBySeat} ` : ''}稳住${label} · 阻止后续兑现`;
    } else if (type === 'match_invalidated' && payload.reason) {
      detail = `原因：${String(payload.reason)}`;
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
    } else if (type === 'emote_sent') {
      const seatId = String(payload.seatId || event.actingSeat || '--');
      const label = String(payload.label || payload.emoteId || '预设表情');
      detail = `${seatId} · ${label}`;
    }
    return {
      type,
      label: eventMap[type] || type,
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
  getLiveSnapshot() {
    this.ensureLiveSocialPreferencesLoaded();
    const session = this.getLiveSession();
    const state = session && typeof session.getState === 'function' ? session.getState() : null;
    if (!state) return null;
    const view = state.stateView || null;
    const liveDrillSourceId = String(this.liveDrillScenario && this.liveDrillScenario.sourceMatchId || '');
    const activeLiveSourceId = String(state.matchId || (view && view.matchId) || '');
    const waitingLiveSourceId = state.queueTicket ? `waiting:${state.queueTicket}` : '';
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
      mode: view && view.mode === 'friendly' ? 'friendly' : 'ranked',
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
      friendlySeries: this.getLiveFriendlySeries(view && view.friendlySeries ? view.friendlySeries : state.rematchReport),
      firstMatchGuide: this.getLiveFirstMatchGuide(view),
      loadoutExplorationReport: this.getLiveLoadoutExplorationReport(view),
      postMatchReview: this.getLivePostMatchReview(view),
      seasonGoal: this.getLiveSeasonGoalCard(view),
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
        loadout: this.getLiveLoadoutSummary(view.opponent)
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
    if (!root) return;
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
    setText('[data-live-connection-status]', this.formatLiveConnectionStatus(view));
    const connectionTempoEl = root.querySelector('[data-live-connection-tempo]');
    if (connectionTempoEl) {
      const tempo = this.getLiveConnectionTempo(view, state);
      connectionTempoEl.hidden = !tempo || tempo.tempoState === 'stable';
      connectionTempoEl.setAttribute('data-live-connection-tempo-state', tempo ? tempo.tempoState : '');
      connectionTempoEl.setAttribute('data-live-connection-tempo-actor', tempo ? tempo.affectedSeat : '');
      connectionTempoEl.setAttribute('data-live-connection-tempo-severity', tempo ? tempo.severity : '');
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
      if (this.liveReviewFocus === 'key_turns') {
        const keyTurnPanel = root.querySelector('[data-live-key-turn-replay]');
        if (keyTurnPanel) keyTurnPanel.setAttribute('data-live-review-focus', 'key_turns');
      } else if (this.liveReviewFocus.startsWith('experience_check:')) {
        const checkId = this.liveReviewFocus.slice('experience_check:'.length);
        const focusedCheck = Array.from(root.querySelectorAll('[data-live-experience-check]')).find(item => item.getAttribute('data-live-experience-check') === checkId);
        if (focusedCheck) focusedCheck.setAttribute('data-live-review-focus', this.liveReviewFocus);
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
    setText('[data-live-opponent-loadout]', opponent ? `公开谱：${this.formatLiveLoadoutSummary(opponent, '仅显示公开摘要')}` : '公开谱：--');
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
        const canAct = phase === 'active' && view && view.currentSeat === state.seatId && !intentLocked;
        const canSelectMulligan = phase === 'setup' && self && !self.mulliganUsed && !intentLocked;
        handEl.innerHTML = cards.map(card => {
          const cardConfirming = !canSelectMulligan && this.isLiveOpeningActionConfirmArmed(state, 'play_card', { cardInstanceId: card.instanceId || '' });
          return `
          <button class="pvp-live-card ${this.liveMulliganSelection.has(card.instanceId) ? 'selected' : ''} ${cardConfirming ? 'confirming' : ''}" ${canSelectMulligan ? `data-live-mulligan-card="${this.escapeHtml(card.instanceId || '')}" onclick="PVPScene.toggleLiveMulliganCard('${this.escapeHtml(card.instanceId || '')}')"` : `data-live-card="${this.escapeHtml(card.instanceId || '')}" onclick="PVPScene.submitLiveCard('${this.escapeHtml(card.instanceId || '')}')"`} ${canAct || canSelectMulligan ? '' : 'disabled'}>
            <span class="pvp-live-card-name">${this.escapeHtml(card.name || card.cardId || '术式')}</span>
            <span class="pvp-live-card-meta">耗 ${this.escapeHtml(card.cost || 0)} · 伤 ${this.escapeHtml(card.damage || 0)} · 护 ${this.escapeHtml(card.block || 0)}${cardConfirming ? ' · 确认' : ''}</span>
          </button>
        `;
        }).join('');
      }
    }

    const eventLog = root.querySelector('[data-live-event-log]');
    if (eventLog) {
      const eventPanel = root.querySelector('[data-live-event-panel]');
      const reviewFocus = eventPanel ? eventPanel.getAttribute('data-live-review-focus') : '';
      const review = this.getLivePostMatchReview(view);
      const reviewEvents = reviewFocus === 'events' ? review?.evidence || [] : [];
      const keyTurnEvents = reviewFocus === 'key_turns' ? review?.keyTurnReplay?.turns || [] : [];
      const experienceCheckId = reviewFocus && reviewFocus.startsWith('experience_check:') ? reviewFocus.slice('experience_check:'.length) : '';
      const experienceEvents = experienceCheckId
        ? (review?.experienceReport?.fairnessChecks || []).find(check => check.id === experienceCheckId)?.linkedEvidence || []
        : [];
      const focusedEvents = experienceEvents.length > 0 ? experienceEvents : keyTurnEvents.length > 0 ? keyTurnEvents : reviewEvents;
      const events = focusedEvents.length > 0
        ? focusedEvents
        : Array.isArray(state.lastEvents) && state.lastEvents.length > 0 ? state.lastEvents : view && Array.isArray(view.recentEvents) ? view.recentEvents.slice(-5) : [];
      const filteredEvents = this.filterLiveEventsForMute(events);
      const visibleEvents = focusedEvents.length > 0 ? filteredEvents.slice(0, 12) : filteredEvents.slice(-8);
      eventLog.innerHTML = visibleEvents.length > 0 ? visibleEvents.map(event => {
        const formatted = this.formatLiveEvent(event);
        return `
        <div class="pvp-live-event-row" data-live-event-type="${this.escapeHtml(formatted.type)}">
          <span class="pvp-live-event-main">${this.escapeHtml(formatted.label)}</span>
          <span class="pvp-live-event-detail">${this.escapeHtml(formatted.detail)}</span>
        </div>
      `;
      }).join('') : '暂无事件';
    }

    const errorText = this.liveInlineHint || (state.lastError ? `${state.lastError.message || state.lastError.reason}` : phase === 'invalidated' ? '本局在开战前无效，不写正式积分；可以重新匹配或先练习斗法谱。' : phase === 'setup' ? '准备阶段只能调息或确认准备，不能提前出牌。' : phase === 'waiting_rematch' ? '已发起低压力再战，等待本局对手确认；不写正式积分。' : phase === 'waiting' ? '等待真实玩家加入；不会自动切换残影。' : '实时论道不会自动匹配残影；没有真人时可取消排队。');
    setText('[data-live-last-error]', errorText);
    this.updateLiveButtons(phase, !!view && view.currentSeat === state.seatId, self);
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
    if (!(phase === 'active' || phase === 'sync_required')) {
      this.clearLiveSurrenderConfirm();
    }
    if (phase !== 'active' || !this.isLiveOpeningActionConfirmArmed(state, this.liveOpeningActionConfirm?.actionType || '', this.liveOpeningActionConfirm?.payload || {})) {
      this.clearLiveOpeningActionConfirm();
    }
    const entrySafeguardBlocked = phase === 'idle' && this.isLiveEntrySafeguardBlocked(state);
    const surrenderConfirmArmed = this.isLiveSurrenderConfirmArmed(state);
    const endTurnConfirmArmed = this.isLiveOpeningActionConfirmArmed(state, 'end_turn', {});
    const intentLocked = this.isLiveIntentInFlight(null, 'action');
    const socialIntentLocked = this.isLiveIntentInFlight(null, 'social');
    const setDisabled = (action, disabled) => {
      const btn = root.querySelector(`[data-live-action="${action}"]`);
      if (btn) btn.disabled = !!disabled;
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
    setDisabled('practice-live', !(entrySafeguardBlocked && this.hasLiveEntrySafeguardAction(state, 'practice')) && !(phase === 'waiting' && this.getLiveWaitingReport(state)?.longWait));
    setDisabled('refresh-match', phase === 'queueing' || phase === 'idle' || phase === 'finished' || phase === 'invalidated');
    setButtonText('join-queue', entrySafeguardBlocked && this.hasLiveEntrySafeguardAction(state, 'retry_connection_check') ? '重试检测' : '入队');
    setButtonText('end-turn', endTurnConfirmArmed ? '确认结束' : '结束回合');
    setButtonText('surrender', surrenderConfirmArmed ? '确认认输' : '认输');
    setDisabled('confirm-mulligan', intentLocked || !(phase === 'setup' && self && !self.mulliganUsed));
    setDisabled('ready', intentLocked || !(phase === 'setup' && self && !self.ready));
    setDisabled('end-turn', intentLocked || !(phase === 'active' && isMyTurn));
    setDisabled('surrender', intentLocked || !(phase === 'active' || phase === 'sync_required'));
    root.querySelectorAll('[data-live-emote]').forEach(button => {
      button.disabled = socialIntentLocked || !this.canSendLiveEmote(phase);
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
      return;
    }
    const usedRealtimeResume = !!(resumeRealtime && typeof session.resumeRealtime === 'function');
    const resumeQueued = this.startLiveRealtime(state, { resume: resumeRealtime });
    const realtimeSent = usedRealtimeResume
      ? !!(resumeQueued && state.realtimeStatus === 'connected')
      : state.realtimeStatus === 'connected'
        && typeof session.heartbeatRealtime === 'function'
        && session.heartbeatRealtime(state.matchId);
    if (!realtimeSent) {
      if (typeof session.heartbeat !== 'function') return;
      await session.heartbeat();
    }
    const next = session.getState();
    if (!this.shouldLiveHeartbeat(next.phase)) {
      this.stopLiveHeartbeat();
      return;
    }
    this.startLiveHeartbeat({ sendImmediately: false });
    this.renderLivePanel();
  },
  async submitLiveIntent(intent = {}) {
    this.liveInlineHint = '';
    const session = this.getLiveSession();
    const state = session.getState();
    if (!state || !state.matchId) return state;
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
    if (pressureState !== 'opening_window' && !openingActive) return null;
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
    if (!context || !opening) return '再次点击确认行动；当前仍处于开局保护窗口。';
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
        : {})
    });
    const state = session.getState();
    if (postReviewLoadoutResolution && ['waiting', 'matched', 'setup', 'active'].includes(state.phase)) {
      this.liveInlineHint = this.formatLivePostReviewLoadoutResolution('queue_again', postReviewLoadoutResolution);
    }
    this.liveLongWaitPollUntil = 0;
    this.renderLivePanel();
    if (['waiting', 'matched', 'setup', 'active'].includes(state.phase)) {
      this.liveDrillScenario = null;
    }
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
    await session.cancelQueue();
    this.liveLongWaitPollUntil = 0;
    this.stopLivePolling();
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
        ? '已打开真人 PVP 连接健康练习；练习不写正式积分，恢复后可重试正式排位。'
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
    const focusedCheck = root
      ? Array.from(root.querySelectorAll('[data-live-experience-check]')).find(item => item.getAttribute('data-live-experience-check') === id)
      : null;
    if (focusedCheck) {
      focusedCheck.setAttribute('data-live-review-focus', `experience_check:${id}`);
      if (typeof focusedCheck.scrollIntoView === 'function') {
        focusedCheck.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    const hint = root ? root.querySelector('[data-live-last-error]') : null;
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
      setHint('已定位关键回合；这里只使用公开事件序列，不读取隐藏手牌、牌库或事件 payload。');
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
    const state = session.getState();
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
    await this.submitLiveIntent({
      intentId: this.makeLiveIntentId('ready'),
      intentType: 'ready',
      payload: {}
    });
    this.renderLivePanel();
  },
  async endLiveTurn() {
    const session = this.getLiveSession();
    const state = session && typeof session.getState === 'function' ? session.getState() : null;
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
    const state = session && typeof session.getState === 'function' ? session.getState() : null;
    if (!state || !state.matchId || !(state.phase === 'active' || state.phase === 'sync_required')) return state;
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
