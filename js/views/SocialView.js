import { AuthService } from '../services/authService.js';
import { BackendClient } from '../services/backend-client.js';
import { RelayExpeditionService } from '../services/relay-expedition-service.js';

const TABS = new Set(['friends', 'requests', 'squad', 'security']);
const RELAY_TACTIC_META = Object.freeze({
  vanguard: {
    title: '破阵谱',
    summary: '主动压缩战线，追求更快收束。'
  },
  bulwark: {
    title: '守脉谱',
    summary: '护盾更稳，适合救援和兜底。'
  },
  insight: {
    title: '观星谱',
    summary: '偏抽滤与节奏调整，保留更多路线选择。'
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function list(source, ...paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current && current[key], source);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function value(source, ...paths) {
  for (const path of paths) {
    const result = path.split('.').reduce((current, key) => current && current[key], source);
    if (result !== undefined && result !== null) return result;
  }
  return null;
}

function profileId(entry) {
  return String(entry && (entry.profileId || entry.profile_id || entry.profile?.profileId) || '').trim();
}

function displayName(entry) {
  return String(entry && (entry.displayName || entry.userName || entry.username || entry.name || entry.profile?.displayName) || '无名道友');
}

export class SocialView {
  constructor(game) {
    this.game = game;
    this.tab = 'friends';
    this.dashboard = null;
    this.security = null;
    this.relayState = RelayExpeditionService.getState();
    this.searchResult = null;
    this.busy = false;
    this.bound = false;
    this.presenceTimer = null;
    this.relayTacticSelections = new Map();
  }

  async show(tab = 'friends') {
    if (!AuthService.isLoggedIn()) {
      this.game.showLoginModal();
      return;
    }
    this.tab = TABS.has(tab) ? tab : 'friends';
    this.bind();
    this.syncTabs();
    this.renderLoading();
    this.startPresence();
    await this.refresh();
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    document.getElementById('social-tabs')?.addEventListener('click', event => {
      const button = event.target.closest('[data-social-tab]');
      if (!button || this.busy) return;
      const tab = String(button.dataset.socialTab || 'friends');
      if (!TABS.has(tab)) return;
      this.tab = tab;
      this.searchResult = null;
      this.syncTabs();
      this.render();
      if (tab === 'security' && !this.security) this.refreshSecurity();
    });
    document.getElementById('social-content')?.addEventListener('click', event => {
      const button = event.target.closest('[data-social-action]');
      if (!button || this.busy) return;
      this.handleAction(button.dataset.socialAction, button.dataset);
    });
    document.getElementById('social-content')?.addEventListener('submit', event => {
      const form = event.target.closest('form[data-social-form]');
      if (!form) return;
      event.preventDefault();
      this.handleForm(form.dataset.socialForm, new FormData(form));
    });
  }

  syncTabs() {
    document.querySelectorAll('[data-social-tab]').forEach(button => {
      const active = button.dataset.socialTab === this.tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  renderLoading() {
    const content = document.getElementById('social-content');
    if (content) content.innerHTML = '<div class="social-empty">正在校验关系与会话...</div>';
  }

  async refresh() {
    const expectedUserId = AuthService.getUserIdentity(AuthService.getCurrentUser());
    const [result, relayResult] = await Promise.all([
      BackendClient.getSocialDashboard({ expectedUserId }),
      this.refreshRelay({ expectedUserId, render: false })
    ]);
    if (result && result.success !== false) {
      this.dashboard = result;
    } else if (result && result.reason === 'account_social_account_changed') {
      this.dashboard = null;
      this.security = null;
      this.searchResult = null;
    }
    if (relayResult && relayResult.reason === 'relay_expedition_account_changed') {
      this.relayTacticSelections.clear();
    }
    if (this.tab === 'security') await this.refreshSecurity(false);
    this.render(result && result.success === false ? result.message : '');
  }

  async refreshSecurity(render = true) {
    const expectedUserId = AuthService.getUserIdentity(AuthService.getCurrentUser());
    const result = await AuthService.getSecurityOverview({ expectedUserId });
    if (result && result.success !== false) {
      this.security = result;
    } else if (result && result.reason === 'account_social_account_changed') {
      this.dashboard = null;
      this.security = null;
      this.searchResult = null;
    }
    if (render) this.render(result && result.success === false ? result.message : '');
  }

  startPresence() {
    if (this.presenceTimer) return;
    const heartbeat = () => {
      if (!AuthService.isLoggedIn() || document.visibilityState === 'hidden') return;
      const activity = this.game.currentScreen === 'pvp-screen' ? 'pvp_queue'
        : this.game.currentScreen === 'challenge-hub-screen' ? 'world_rift'
          : this.game.currentScreen === 'battle-screen' ? 'pve' : 'menu';
      BackendClient.heartbeatSocialPresence(activity).catch(() => {});
    };
    heartbeat();
    this.presenceTimer = window.setInterval(heartbeat, 45000);
  }

  render(errorMessage = '') {
    const content = document.getElementById('social-content');
    if (!content) return;
    if (errorMessage && !this.dashboard && this.tab !== 'security') {
      content.innerHTML = `<div class="social-empty error">${escapeHtml(errorMessage)}</div>`;
      return;
    }
    if (this.tab === 'friends') content.innerHTML = this.renderFriends();
    if (this.tab === 'requests') content.innerHTML = this.renderRequests();
    if (this.tab === 'squad') content.innerHTML = this.renderSquad();
    if (this.tab === 'security') content.innerHTML = this.renderSecurity(errorMessage);
  }

  getRoot() {
    return value(this.dashboard, 'dashboard', 'social') || this.dashboard || {};
  }

  getSquadContext() {
    const squadRoot = value(this.dashboard, 'riftSquad') || value(this.getRoot(), 'riftSquad') || {};
    const current = value(squadRoot, 'current') || squadRoot;
    const squad = value(current, 'squad') || null;
    return {
      root: squadRoot,
      current,
      squad,
      rotationId: String(value(current, 'rotation.rotationId') || squad?.rotationId || ''),
      squadId: String(squad?.squadId || '')
    };
  }

  async refreshRelay({ expectedUserId = AuthService.getUserIdentity(AuthService.getCurrentUser()), render = true } = {}) {
    if (!expectedUserId) {
      this.relayState = RelayExpeditionService.reset();
      if (render) this.render();
      return { success: false, reason: 'not_logged_in' };
    }
    const result = await RelayExpeditionService.current({ expectedUserId });
    this.relayState = RelayExpeditionService.getState();
    if (render) this.render();
    return result;
  }

  getRelaySnapshot() {
    return this.relayState || RelayExpeditionService.getState() || {};
  }

  getRelaySession() {
    const relay = this.getRelaySnapshot();
    return value(relay, 'session', 'current.currentSession', 'current.session') || null;
  }

  getRelayCurrentLeg() {
    const relay = this.getRelaySnapshot();
    return value(relay, 'currentLeg', 'session.currentLeg', 'session.activeLeg', 'current.currentLeg', 'current.activeLeg') || null;
  }

  getRelayRotation() {
    const relay = this.getRelaySnapshot();
    const rotation = value(relay, 'current.rotation') || {};
    return {
      rotationId: String(value(rotation, 'rotationId') || value(relay, 'session.rotationId', 'current.currentSession.rotationId') || ''),
      title: String(value(rotation, 'title') || '同道远征')
    };
  }

  getRelaySourceSquad() {
    const relay = this.getRelaySnapshot();
    return value(relay, 'current.sourceSquad') || null;
  }

  getRelayMembers() {
    const session = this.getRelaySession();
    return list(session, 'members', 'memberSnapshots', 'team.members');
  }

  getRelayLegs() {
    const session = this.getRelaySession();
    const currentLeg = this.getRelayCurrentLeg();
    const source = list(session, 'legs', 'route.legs', 'archive.legs');
    const maxLegs = Math.max(4, Number(value(session, 'legCount', 'rotation.legCount') || 4));
    const legs = source.length ? source.slice() : [];
    if (currentLeg && !legs.some(entry => Number(entry && entry.legIndex) === Number(currentLeg.legIndex))) {
      legs.push(currentLeg);
    }
    const indexed = new Map();
    legs.forEach(entry => {
      const legIndex = Number(entry && entry.legIndex);
      if (Number.isFinite(legIndex) && !indexed.has(legIndex)) indexed.set(legIndex, entry);
    });
    return Array.from({ length: maxLegs }, (_, index) => {
      const legIndex = index + 1;
      return indexed.get(legIndex) || { legIndex, status: 'queued' };
    });
  }

  getRelayMilestones() {
    return this.getRelaySessionMilestones(this.getRelaySession());
  }

  getRelaySessionMilestones(session) {
    return list(session, 'rewardMilestones', 'milestones', 'rewards', 'archive.rewardMilestones');
  }

  getRelayPreviousSessions() {
    const relay = this.getRelaySnapshot();
    const current = value(relay, 'current') || {};
    const seen = new Set();
    const sessions = [];
    const pushSession = session => {
      if (!session || typeof session !== 'object') return;
      const sessionId = String(session.sessionId || '').trim();
      if (!sessionId || seen.has(sessionId)) return;
      seen.add(sessionId);
      sessions.push(session);
    };
    list(current, 'previousSessions').forEach(pushSession);
    pushSession(value(current, 'previousSession'));
    return sessions;
  }

  getRelayRewardSessions() {
    const bundles = [];
    const includedSessionIds = new Set();
    const currentSession = this.getRelaySession();
    const currentMilestones = this.getRelaySessionMilestones(currentSession);
    if (currentSession && currentMilestones.length) {
      includedSessionIds.add(String(currentSession.sessionId || '').trim());
      bundles.push({
        session: currentSession,
        milestones: currentMilestones,
        isCurrent: true
      });
    }
    this.getRelayPreviousSessions().forEach(session => {
      const sessionId = String(session.sessionId || '').trim();
      if (sessionId && includedSessionIds.has(sessionId)) return;
      const milestones = this.getRelaySessionMilestones(session);
      if (!milestones.length) return;
      if (sessionId) includedSessionIds.add(sessionId);
      bundles.push({
        session,
        milestones,
        isCurrent: false
      });
    });
    return bundles;
  }

  getRelayRewardSessionSummary(bundle) {
    const session = bundle && bundle.session || {};
    const routeScore = Number(value(session, 'totalScore', 'routeScore') || 0);
    const processedLegs = Number(value(session, 'processedLegs', 'completedLegs') || 0);
    const projectedLegs = Number(value(session, 'projectedLegs') || 0);
    if (bundle && bundle.isCurrent) {
      return `${routeScore} 路线分 · ${processedLegs}/4 棒已处理 · ${projectedLegs} 棒已投影`;
    }
    return `${routeScore} 路线分 · ${processedLegs}/4 棒已处理 · 领奖窗口内保留`;
  }

  renderRelayRewardPanels(relayPending) {
    const bundles = this.getRelayRewardSessions();
    if (!bundles.length) {
      return '<div class="social-rewards"><button type="button" class="secondary" disabled>暂无里程碑</button></div>';
    }
    const rewardPending = relayPending && relayPending.kind === 'claimReward';
    return bundles.map(bundle => {
      const session = bundle.session || {};
      const sessionId = String(session.sessionId || '').trim();
      const rotationId = String(session.rotationId || '').trim();
      const title = bundle.isCurrent ? '当前路线里程碑' : '历史路线待领奖';
      const buttons = bundle.milestones.map(entry => {
        const milestoneId = String(entry?.milestoneId || entry?.id || '').trim();
        const amount = Number(entry?.reward?.amount || entry?.amount || 0);
        const claimable = !!entry?.claimable && !entry?.claimed;
        const disabled = rewardPending || !claimable;
        const label = entry?.claimed ? '已领取' : `${amount} 荣誉`;
        return `<button type="button" class="${claimable ? '' : 'secondary'}" data-social-action="relay-claim-reward" data-session-id="${escapeHtml(sessionId)}" data-rotation-id="${escapeHtml(rotationId)}" data-milestone-id="${escapeHtml(milestoneId)}" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>`;
      }).join('');
      return `<div class="social-relay-reward-panel">
        <div class="social-relay-reward-copy">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(this.getRelayRewardSessionSummary(bundle))}</span>
        </div>
        <div class="social-rewards">${buttons || '<button type="button" class="secondary" disabled>暂无里程碑</button>'}</div>
      </div>`;
    }).join('');
  }

  getRelayIdentity(entry) {
    return String(
      entry && (
        entry.userId
        || entry.accountId
        || entry.objectId
        || entry.memberId
        || entry.profileId
        || entry.playerId
      ) || ''
    ).trim();
  }

  getRelayMemberLabel(memberRef) {
    if (memberRef && typeof memberRef === 'object') {
      const seat = Number(memberRef.seat);
      return `${displayName(memberRef)}${Number.isFinite(seat) ? ` · ${seat + 1} 棒位` : ''}`;
    }
    const safeMemberId = String(memberRef || '').trim();
    if (!safeMemberId) return '待定成员';
    const member = this.getRelayMembers().find(entry => this.getRelayIdentity(entry) === safeMemberId);
    if (!member) return safeMemberId.length > 12 ? `${safeMemberId.slice(0, 8)}…` : safeMemberId;
    const seat = Number(member.seat);
    return `${displayName(member)}${Number.isFinite(seat) ? ` · ${seat + 1} 棒位` : ''}`;
  }

  getRelaySelectedTactic(leg) {
    const legKey = `${String(leg?.sessionId || this.getRelaySession()?.sessionId || '')}:${Number(leg?.legIndex)}`;
    const options = Array.isArray(leg?.allowedTactics)
      ? leg.allowedTactics
      : Array.isArray(leg?.handoffOptions) ? leg.handoffOptions : [];
    const candidate = this.relayTacticSelections.get(legKey);
    if (candidate && options.some(option => String(option?.tacticId || option) === candidate)) return candidate;
    const fallback = String(options[0]?.tacticId || options[0] || '').trim();
    if (fallback) this.relayTacticSelections.set(legKey, fallback);
    return fallback;
  }

  setRelaySelectedTactic(leg, tacticId) {
    const legKey = `${String(leg?.sessionId || this.getRelaySession()?.sessionId || '')}:${Number(leg?.legIndex)}`;
    if (!legKey || !tacticId) return;
    this.relayTacticSelections.set(legKey, String(tacticId));
  }

  formatRelayCountdown(timestamp) {
    const endAt = Number(timestamp);
    if (!Number.isFinite(endAt) || endAt <= 0) return '待服务器记时';
    const delta = endAt - Date.now();
    if (delta <= 0) return '已到期';
    const totalMinutes = Math.ceil(delta / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days} 天 ${hours} 小时`;
    if (hours > 0) return `${hours} 小时 ${minutes} 分`;
    return `${Math.max(1, minutes)} 分`;
  }

  getRelayWindowSummary(leg) {
    const priorityUntil = Number(leg && leg.priorityUntil);
    const openClaimUntil = Number(leg && leg.openClaimUntil);
    const activeLeaseUntil = Number(leg && leg.activeLeaseUntil);
    if (activeLeaseUntil > Date.now()) return `进行中 · 剩余 ${this.formatRelayCountdown(activeLeaseUntil)}`;
    if (priorityUntil > Date.now()) return `优先窗口 · 剩余 ${this.formatRelayCountdown(priorityUntil)}`;
    if (openClaimUntil > Date.now()) return `开放接棒 · 剩余 ${this.formatRelayCountdown(openClaimUntil)}`;
    if (openClaimUntil > 0) return '棒次窗口已结束';
    return '等待服务器开窗';
  }

  getRelayLegStatusLabel(leg) {
    const status = String(leg?.status || '').trim();
    if (status === 'projected') return '已投影';
    if (status === 'settled') return '待投影';
    if (status === 'active') return '进行中';
    if (status === 'reserved') return '已预留';
    if (status === 'queued') return '待接棒';
    if (status === 'skipped') return '已跳过';
    if (status === 'expired') return '已过期';
    if (status === 'defeated') return '已败退';
    if (status === 'abandoned') return '已放弃';
    return status || '待命';
  }

  renderRelayExpeditionWorkspace(context) {
    const relay = this.getRelaySnapshot();
    const session = this.getRelaySession();
    const leg = this.getRelayCurrentLeg();
    const rotation = this.getRelayRotation();
    const rewardSessions = this.getRelayRewardSessions();
    const relayError = relay && relay.lastError && relay.lastError.message ? relay.lastError.message : '';
    const relayPending = relay && relay.pending ? relay.pending : null;
    const noSquadState = !context.squad;
    const hasRewardSessions = rewardSessions.length > 0;

    if (noSquadState && !session && !hasRewardSessions) {
      return `<section class="social-section social-relay-workspace">
        <div class="social-section-heading">
          <div><h3>同道远征</h3><span>四棒共享路线</span></div>
          <button type="button" class="icon-btn" title="刷新同道远征" data-social-action="relay-refresh">刷</button>
        </div>
        <div class="social-empty">需先结成本轮裂隙小队，才能开启同道远征。</div>
      </section>`;
    }

    if (relayPending && !session && !hasRewardSessions && !relayError) {
      return `<section class="social-section social-relay-workspace">
        <div class="social-section-heading">
          <div><h3>同道远征</h3><span>${escapeHtml(rotation.title)}</span></div>
          <button type="button" class="icon-btn" title="刷新同道远征" data-social-action="relay-refresh" disabled>刷</button>
        </div>
        <div class="social-empty">正在恢复共享路线与当前棒次...</div>
      </section>`;
    }

    if (relayError && !session && !hasRewardSessions) {
      return `<section class="social-section social-relay-workspace">
        <div class="social-section-heading">
          <div><h3>同道远征</h3><span>${escapeHtml(rotation.title)}</span></div>
          <button type="button" class="icon-btn" title="恢复同道远征" data-social-action="relay-refresh">复</button>
        </div>
        <div class="social-empty error">${escapeHtml(relayError)}</div>
      </section>`;
    }

    const routeScore = Number(value(session, 'totalScore', 'routeScore') || 0);
    const processedLegs = Number(value(session, 'processedLegs', 'completedLegs') || 0);
    const projectedLegs = Number(value(session, 'projectedLegs') || 0);
    const actionButtons = this.renderRelayActionButtons(context, session, leg, relayPending);
    const rewardPanels = this.renderRelayRewardPanels(relayPending);
    const activeWorkspace = session
      ? `<div class="social-relay-hero">
        <div class="social-relay-score">
          <span class="social-kicker">共享路线分</span>
          <strong>${routeScore}</strong>
          <span>${processedLegs}/4 棒已处理 · ${projectedLegs} 棒已投影</span>
        </div>
        <div class="social-relay-current">
          <strong>当前优先成员</strong>
          <span>${escapeHtml(this.getRelayMemberLabel(value(leg, 'priorityMember', 'priorityMemberId', 'priorityUserId', 'priorityProfileId')))}</span>
          <span>${escapeHtml(this.getRelayWindowSummary(leg))}</span>
        </div>
      </div>
      <div class="social-inline-note">队伍只共享路线、棒次和权威摘要；不会把上一棒的残血、手牌、弃牌堆或临时状态交给下一位。</div>
      ${this.renderRelayRouteGrid()}
      ${this.renderRelayTacticSelector(leg)}
      <div class="social-row-actions social-relay-actions">${actionButtons}</div>`
      : `<div class="social-inline-note">${hasRewardSessions ? '当前没有进行中的共享路线；以下保留领奖窗口内的历史里程碑。' : '队伍只共享路线、棒次和权威摘要；不会把上一棒的残血、手牌、弃牌堆或临时状态交给下一位。'}</div>${actionButtons ? `<div class="social-row-actions social-relay-actions">${actionButtons}</div>` : ''}`;

    return `<section class="social-section social-relay-workspace">
      <div class="social-section-heading">
        <div>
          <h3>同道远征</h3>
          <span>${escapeHtml(rotation.title)} · 共享路线，不共享残血牌组</span>
        </div>
        <button type="button" class="icon-btn" title="刷新同道远征" data-social-action="relay-refresh" ${relayPending ? 'disabled' : ''}>刷</button>
      </div>
      ${relayError ? `<div class="social-search-result unavailable">${escapeHtml(relayError)}</div>` : ''}
      ${activeWorkspace}
      <div class="social-relay-rewards">
        <div class="social-relay-reward-copy">
          <strong>里程碑荣誉</strong>
          <span>${hasRewardSessions ? '当前与仍在领奖窗的历史路线都会保留在此；仅真实投影成员可领取。' : '仅真实投影成员可领取，仅用于外观。'}</span>
        </div>
        ${rewardPanels}
      </div>
    </section>`;
  }

  renderRelayRouteGrid() {
    const legs = this.getRelayLegs();
    return `<div class="social-relay-route-grid">${legs.map(leg => {
      const legIndex = Number(leg?.legIndex);
      const runner = value(leg, 'runner', 'runnerUserId', 'runnerId', 'runnerMemberId');
      const tacticId = String(value(leg, 'tacticId', 'selectedTacticId') || '').trim();
      const summary = value(leg, 'authoritativeSummary', 'summary') || {};
      const completedEncounters = Number(summary?.encountersWon || leg?.encountersWon || 0);
      const score = Number(value(leg, 'routeScore', 'legScore', 'score') || 0);
      return `<article class="social-relay-leg ${escapeHtml(String(leg?.status || 'queued'))}">
        <div class="social-relay-leg-top">
          <strong>第 ${Number.isFinite(legIndex) ? legIndex : '?'} 棒</strong>
          <span>${escapeHtml(this.getRelayLegStatusLabel(leg))}</span>
        </div>
        <div class="social-relay-leg-meta">
          <span>${escapeHtml(runner ? `执行 ${this.getRelayMemberLabel(runner)}` : `优先 ${this.getRelayMemberLabel(value(leg, 'priorityMember', 'priorityMemberId', 'priorityUserId', 'priorityProfileId'))}`)}</span>
          <span>${escapeHtml(tacticId ? (RELAY_TACTIC_META[tacticId]?.title || tacticId) : '待选接力谱')}</span>
        </div>
        <div class="social-relay-leg-summary">
          <span>${escapeHtml(score > 0 ? `路线分 ${score}` : completedEncounters > 0 ? `完成 ${completedEncounters} 战` : '等待本棒处理')}</span>
        </div>
      </article>`;
    }).join('')}</div>`;
  }

  renderRelayTacticSelector(leg) {
    const options = Array.isArray(leg?.allowedTactics)
      ? leg.allowedTactics
      : Array.isArray(leg?.handoffOptions) ? leg.handoffOptions : [];
    if (!options.length) {
      return `<div class="social-relay-tactics social-empty">当前棒次暂无可选接力谱。</div>`;
    }
    const selected = this.getRelaySelectedTactic(leg);
    return `<div class="social-relay-tactics">
      <div class="social-section-heading">
        <div><h3>允许接力谱</h3><span>选择后再接棒</span></div>
      </div>
      <div class="social-relay-tactic-grid">${options.map(option => {
        const tacticId = String(option?.tacticId || option || '').trim();
        const meta = RELAY_TACTIC_META[tacticId] || { title: tacticId || '未知接力谱', summary: '等待服务器描述。' };
        return `<label class="social-relay-tactic ${selected === tacticId ? 'selected' : ''}">
          <input type="radio" name="relay-tactic-choice" data-social-action="relay-select-tactic" data-tactic-id="${escapeHtml(tacticId)}" ${selected === tacticId ? 'checked' : ''}>
          <span class="social-relay-tactic-copy">
            <strong>${escapeHtml(meta.title)}</strong>
            <span>${escapeHtml(option?.description || meta.summary)}</span>
          </span>
        </label>`;
      }).join('')}</div>
    </div>`;
  }

  renderRelayActionButtons(context, session, leg, relayPending) {
    const sessionId = String(session?.sessionId || '').trim();
    const rotationId = String(context?.rotationId || value(session, 'rotationId') || '').trim();
    const legId = String(leg?.legId || '').trim();
    const runId = String(value(leg, 'runId', 'run.runId') || '').trim();
    const pendingKind = String(relayPending?.kind || '').trim();
    const sourceSquad = this.getRelaySourceSquad();
    const canStart = !sessionId && !!sourceSquad?.eligible && !!sourceSquad?.isLeader;
    const canClaim = !!sessionId && leg?.canClaim === true;
    const canPass = !!sessionId && leg?.canPass === true;
    const canProject = !!sessionId && !!legId && !!runId && ['completed', 'settled'].includes(String(leg?.status || '').trim());
    const buttons = [];
    if (canStart) {
      buttons.push(`<button type="button" data-social-action="relay-start" ${relayPending ? 'disabled' : ''}>${pendingKind === 'createSession' ? '开队中...' : '开始同道远征'}</button>`);
    }
    if (canClaim) {
      buttons.push(`<button type="button" data-social-action="relay-claim" data-session-id="${escapeHtml(sessionId)}" data-leg-index="${escapeHtml(String(leg?.legIndex ?? ''))}" ${relayPending ? 'disabled' : ''}>${pendingKind === 'claimLeg' ? '接棒中...' : '接棒并进入权威试炼'}</button>`);
    }
    if (canPass) {
      buttons.push(`<button type="button" class="secondary" data-social-action="relay-pass" data-session-id="${escapeHtml(sessionId)}" data-leg-index="${escapeHtml(String(leg?.legIndex ?? ''))}" ${relayPending ? 'disabled' : ''}>${pendingKind === 'passBaton' ? '让棒中...' : '让棒'}</button>`);
    }
    if (runId) {
      buttons.push(`<button type="button" class="secondary" data-social-action="relay-open-run" ${relayPending ? 'disabled' : ''}>恢复权威卷面</button>`);
    }
    if (canProject) {
      buttons.push(`<button type="button" class="secondary" data-social-action="relay-project" data-session-id="${escapeHtml(sessionId)}" data-leg-id="${escapeHtml(legId)}" data-run-id="${escapeHtml(runId)}" ${relayPending ? 'disabled' : ''}>${pendingKind === 'projectLeg' ? '投影中...' : '投影'}</button>`);
    }
    if (rotationId) {
      buttons.push(`<button type="button" class="secondary" data-social-action="relay-refresh" ${relayPending ? 'disabled' : ''}>恢复共享状态</button>`);
    }
    return buttons.join('');
  }

  renderFriends() {
    const root = this.getRoot();
    const friends = list(root, 'friends', 'relationships.friends');
    const profile = value(root, 'profile', 'self') || {};
    const search = this.searchResult ? this.renderSearchResult() : '';
    const rows = friends.map(friend => {
      const id = profileId(friend);
      const presence = value(friend, 'presence.label', 'presence.status', 'presence', 'status') || 'offline';
      const activity = value(friend, 'presence.activity', 'activity') || '';
      const muted = Boolean(value(friend, 'muted', 'controls.muted'));
      return `<article class="social-row" data-profile-id="${escapeHtml(id)}">
        <div class="social-identity"><span class="social-presence ${escapeHtml(presence)}" aria-hidden="true"></span><div><strong>${escapeHtml(displayName(friend))}</strong><span>${escapeHtml(presence === 'online' ? `在线${activity ? ` · ${activity}` : ''}` : presence === 'recent' ? '最近出现' : '暂未在线')}</span></div></div>
        <div class="social-row-actions">
          <button type="button" title="发起友谊约战" data-social-action="pvp-invite" data-profile-id="${escapeHtml(id)}">⚔ 约战</button>
          <button type="button" title="邀请进入本轮裂隙小队" data-social-action="squad-invite" data-profile-id="${escapeHtml(id)}">✦ 组队</button>
          <button type="button" class="secondary" data-social-action="${muted ? 'unmute' : 'mute'}" data-profile-id="${escapeHtml(id)}">${muted ? '取消静音' : '静音'}</button>
          <button type="button" class="danger" data-social-action="remove" data-profile-id="${escapeHtml(id)}">删除</button>
        </div>
      </article>`;
    }).join('');
    return `<div class="social-toolbar"><div><span class="social-kicker">我的身份</span><strong>${escapeHtml(displayName(profile))}</strong></div><span>${friends.length}/100 位道友</span></div>
      <form class="social-search" data-social-form="search"><label for="social-exact-search">精确道号</label><input id="social-exact-search" name="username" minlength="3" maxlength="24" autocomplete="off" required><button type="submit">查找</button></form>
      ${search}
      <section class="social-section"><div class="social-section-heading"><h3>道友</h3><button type="button" class="icon-btn" title="刷新道友录" data-social-action="refresh">↻</button></div>${rows || '<div class="social-empty">尚无道友。使用完整道号发出一封道友信。</div>'}</section>`;
  }

  renderSearchResult() {
    const result = this.searchResult;
    if (result.success === false || !value(result, 'profile', 'result')) {
      return `<div class="social-search-result unavailable">${escapeHtml(result.message || '未找到可联系的道友')}</div>`;
    }
    const profile = value(result, 'profile', 'result');
    return `<div class="social-search-result"><div><span class="social-kicker">精确匹配</span><strong>${escapeHtml(displayName(profile))}</strong></div><button type="button" data-social-action="request" data-username="${escapeHtml(profile.username || profile.displayName || '')}">发送道友信</button></div>`;
  }

  renderRequests() {
    const root = this.getRoot();
    const incoming = list(root, 'incomingRequests', 'requests.incoming', 'requests.received');
    const outgoing = list(root, 'outgoingRequests', 'requests.outgoing', 'requests.sent');
    const incomingRows = incoming.map(request => `<article class="social-row"><div class="social-identity"><div><strong>${escapeHtml(displayName(request))}</strong><span>等待你的答复</span></div></div><div class="social-row-actions"><button type="button" data-social-action="accept" data-request-id="${escapeHtml(request.requestId || request.id)}">接受</button><button type="button" class="secondary" data-social-action="decline" data-request-id="${escapeHtml(request.requestId || request.id)}">谢绝</button></div></article>`).join('');
    const outgoingRows = outgoing.map(request => `<article class="social-row"><div class="social-identity"><div><strong>${escapeHtml(displayName(request))}</strong><span>道友信已送达</span></div></div><div class="social-row-actions"><button type="button" class="secondary" data-social-action="cancel" data-request-id="${escapeHtml(request.requestId || request.id)}">撤回</button></div></article>`).join('');
    return `<section class="social-section"><div class="social-section-heading"><h3>收到的信笺</h3><span>${incoming.length}/50</span></div>${incomingRows || '<div class="social-empty">没有待处理的道友信。</div>'}</section><section class="social-section"><div class="social-section-heading"><h3>送出的信笺</h3><span>${outgoing.length}/20</span></div>${outgoingRows || '<div class="social-empty">没有等待答复的道友信。</div>'}</section>`;
  }

  renderSquad() {
    const context = this.getSquadContext();
    const { current, squad } = context;
    const invites = list(current, 'invites.received', 'incomingInvites', 'invites');
    const inviteRows = invites.map(invite => `<article class="social-row"><div class="social-identity"><div><strong>${escapeHtml(invite.inviter?.userName || invite.squadName || displayName(invite))}</strong><span>本轮裂隙小队邀请</span></div></div><div class="social-row-actions"><button type="button" data-social-action="squad-accept" data-invite-id="${escapeHtml(invite.inviteId || invite.id)}">加入</button><button type="button" class="secondary" data-social-action="squad-decline" data-invite-id="${escapeHtml(invite.inviteId || invite.id)}">谢绝</button></div></article>`).join('');
    if (!squad) {
      return `<section class="social-section social-squad-summary"><span class="social-kicker">本轮天穹裂隙</span><h3>尚未结成小队</h3><p>可独自建队后邀请至多三位道友。组队只汇总真实贡献，不增加次数、伤害或战力。</p><button type="button" data-social-action="squad-create">创建小队</button></section>${this.renderRelayExpeditionWorkspace(context)}<section class="social-section"><div class="social-section-heading"><h3>待处理邀请</h3><span>${invites.length}</span></div>${inviteRows || '<div class="social-empty">当前没有裂隙小队邀请。</div>'}</section>`;
    }
    const members = list(squad, 'members');
    const score = Number(value(squad, 'cooperativeScore', 'score') || 0);
    const memberRows = members.map(member => `<div class="social-member"><strong>${escapeHtml(displayName(member))}</strong><span>${Number(member.bestContribution || member.contribution || 0) > 0 ? `真实贡献 ${Number(member.bestContribution || member.contribution)}` : '尚无贡献'}</span></div>`).join('');
    const rewards = list(current, 'milestones', 'rewards').map(reward => `<button type="button" class="${reward.claimable ? '' : 'secondary'}" data-social-action="squad-claim" data-milestone-id="${escapeHtml(reward.milestoneId || reward.id)}" ${reward.claimable ? '' : 'disabled'}>${reward.claimed ? '已领取' : `${Number(reward.reward?.amount || reward.amount || 0)} 荣誉`}</button>`).join('');
    const locked = Number(value(current, 'membership.lockedAt') || 0) > 0;
    return `<section class="social-section social-squad-summary"><span class="social-kicker">本轮协作分</span><div class="social-score"><strong>${score}</strong><span>/ 9600</span></div><p>${members.length}/4 位成员 · 每人仅取最佳一次真实贡献</p><div class="social-members">${memberRows}</div><div class="social-rewards">${rewards}</div><button type="button" class="danger" data-social-action="squad-leave" ${locked ? 'disabled' : ''}>${locked ? '已有贡献，本轮归属已锁定' : '退出小队'}</button></section>${this.renderRelayExpeditionWorkspace(context)}<section class="social-section"><div class="social-section-heading"><h3>待处理邀请</h3><span>${invites.length}</span></div>${inviteRows || '<div class="social-empty">当前没有其他小队邀请。</div>'}</section>`;
  }

  renderSecurity(errorMessage = '') {
    const root = value(this.security, 'security', 'data') || this.security || {};
    if (!this.security) return `<div class="social-empty${errorMessage ? ' error' : ''}">${escapeHtml(errorMessage || '正在读取账号安全状态...')}</div>`;
    const sessions = list(root, 'sessions', 'devices');
    const events = list(root, 'recentEvents', 'events').slice(0, 8);
    const sessionRows = sessions.map(session => `<article class="social-row"><div class="social-identity"><div><strong>${escapeHtml(session.deviceName || '浏览器设备')}${session.current ? ' · 当前' : ''}</strong><span>${escapeHtml(session.lastSeenLabel || session.lastSeenAt || '最近使用')}</span></div></div><div class="social-row-actions"><button type="button" class="danger" data-social-action="revoke-session" data-session-id="${escapeHtml(session.sessionId || session.id)}" ${session.current ? 'disabled' : ''}>撤销</button></div></article>`).join('');
    const eventRows = events.map(event => `<div class="social-event"><strong>${escapeHtml(event.label || event.eventType || event.type || '安全操作')}</strong><span>${escapeHtml(event.createdAtLabel || event.createdAt || '')}</span></div>`).join('');
    return `<div class="social-security-grid"><section class="social-section"><span class="social-kicker">修改密语</span><h3>立即撤销所有旧会话</h3><form class="social-password-form" data-social-form="password"><label>当前密语<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>新密语<input name="newPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></label><label>再次输入<input name="confirmPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></label><button type="submit">更新密语</button></form></section><section class="social-section"><div class="social-section-heading"><h3>设备会话</h3><span>${sessions.length}</span></div>${sessionRows || '<div class="social-empty">当前会话由旧版票据恢复，暂无设备记录。</div>'}<button type="button" class="danger social-wide-action" data-social-action="logout-all">退出所有设备</button></section></div><section class="social-section"><div class="social-section-heading"><h3>最近安全记录</h3><span>仅账号本人可见</span></div>${eventRows || '<div class="social-empty">暂无安全变更记录。</div>'}</section>`;
  }

  async handleForm(form, data) {
    if (form === 'search') {
      this.busy = true;
      this.searchResult = await BackendClient.searchSocialProfile(String(data.get('username') || ''));
      this.busy = false;
      this.render();
      return;
    }
    if (form === 'password') {
      const currentPassword = String(data.get('currentPassword') || '');
      const newPassword = String(data.get('newPassword') || '');
      const confirmPassword = String(data.get('confirmPassword') || '');
      if (newPassword !== confirmPassword) return this.notice('两次输入的新密语不一致', true);
      await this.mutate(() => AuthService.changePassword(currentPassword, newPassword), '密语已更新，旧设备会话已撤销', true);
    }
  }

  async handleAction(action, data) {
    if (action === 'relay-select-tactic') {
      this.setRelaySelectedTactic(this.getRelayCurrentLeg(), data.tacticId);
      this.render();
      return;
    }
    if (action === 'refresh') return this.refresh();
    if (action === 'relay-refresh') return this.mutate(() => this.refreshRelay({ render: false }), '同道远征共享状态已恢复');
    if (action === 'relay-start') {
      const sourceSquad = this.getRelaySourceSquad();
      const rotation = this.getRelayRotation();
      return this.mutate(
        () => RelayExpeditionService.createSession({
          rotationId: rotation.rotationId,
          sourceSquadId: sourceSquad?.sourceSquadId,
          expectedUserId: AuthService.getUserIdentity(AuthService.getCurrentUser())
        }),
        '同道远征已开跑'
      );
    }
    if (action === 'relay-claim') {
      const leg = this.getRelayCurrentLeg();
      const tacticId = this.getRelaySelectedTactic(leg);
      const result = await this.mutate(
        () => RelayExpeditionService.claimLeg({
          sessionId: data.sessionId,
          legIndex: Number(data.legIndex),
          tacticId,
          expectedUserId: AuthService.getUserIdentity(AuthService.getCurrentUser())
        }),
        '已接棒，正在转入权威试炼'
      );
      if (result && result.success !== false) this.openRelayExpeditionOps();
      return result;
    }
    if (action === 'relay-pass') {
      return this.mutate(
        () => RelayExpeditionService.passBaton({
          sessionId: data.sessionId,
          legIndex: Number(data.legIndex),
          expectedUserId: AuthService.getUserIdentity(AuthService.getCurrentUser())
        }),
        '优先权已让给下一位成员'
      );
    }
    if (action === 'relay-open-run') {
      this.openRelayExpeditionOps();
      return;
    }
    if (action === 'relay-project') {
      return this.mutate(
        () => RelayExpeditionService.projectLeg({
          sessionId: data.sessionId,
          legId: data.legId,
          runId: data.runId,
          expectedUserId: AuthService.getUserIdentity(AuthService.getCurrentUser())
        }),
        '本棒权威结果已投影到共享路线'
      );
    }
    if (action === 'relay-claim-reward') {
      const session = this.getRelaySession();
      return this.mutate(
        () => RelayExpeditionService.claimReward({
          sessionId: String(data.sessionId || session?.sessionId || '').trim(),
          rotationId: String(data.rotationId || session?.rotationId || '').trim(),
          milestoneId: data.milestoneId,
          expectedUserId: AuthService.getUserIdentity(AuthService.getCurrentUser())
        }),
        '同道远征荣誉已入账'
      );
    }
    if (action === 'request') return this.mutate(() => BackendClient.sendFriendRequest(data.username), '道友信已送达');
    if (action === 'accept') return this.mutate(() => BackendClient.acceptFriendRequest(data.requestId), '已结为道友');
    if (action === 'decline') return this.mutate(() => BackendClient.declineFriendRequest(data.requestId), '已谢绝道友信');
    if (action === 'cancel') return this.mutate(() => BackendClient.cancelFriendRequest(data.requestId), '已撤回道友信');
    if (action === 'remove' && window.confirm('删除这位道友？已有邀请会同时失效。')) return this.mutate(() => BackendClient.removeFriend(data.profileId), '已删除道友');
    if (['mute', 'unmute', 'block', 'unblock'].includes(action)) return this.mutate(() => BackendClient.setSocialControl(data.profileId, action), '关系设置已更新');
    if (action === 'pvp-invite') return this.mutate(() => BackendClient.createLivePvpInvite({ targetProfileId: data.profileId }), '友谊约战已发出');
    if (action === 'squad-invite') {
      const context = this.getSquadContext();
      if (!context.squadId) return this.notice('请先在裂隙小队页创建本轮小队', true);
      return this.mutate(() => BackendClient.inviteRiftSquadFriend(data.profileId, context), '裂隙小队邀请已发出');
    }
    if (action === 'squad-create') {
      const context = this.getSquadContext();
      return this.mutate(() => BackendClient.createRiftSquad({ rotationId: context.rotationId }), '本轮裂隙小队已建立');
    }
    if (action === 'squad-accept') return this.mutate(() => BackendClient.acceptRiftSquadInvite(data.inviteId), '已加入裂隙小队');
    if (action === 'squad-decline') return this.mutate(() => BackendClient.declineRiftSquadInvite(data.inviteId), '已谢绝小队邀请');
    if (action === 'squad-leave' && window.confirm('退出本轮裂隙小队？已有贡献后不能退出。')) return this.mutate(() => BackendClient.leaveRiftSquad(this.getSquadContext()), '已退出小队');
    if (action === 'squad-claim') return this.mutate(() => BackendClient.claimRiftSquadReward(data.milestoneId, this.getSquadContext()), '协作荣誉已入账');
    if (action === 'revoke-session' && window.confirm('撤销这台设备的登录会话？')) return this.mutate(() => AuthService.revokeSession(data.sessionId), '设备会话已撤销', true);
    if (action === 'logout-all' && window.confirm('退出所有设备？当前页面也会退出登录。')) {
      const gameRef = this.game;
      if (gameRef && typeof gameRef.prepareForAuthLogout === 'function') {
        await gameRef.prepareForAuthLogout();
      }
      let result = null;
      try {
        result = await AuthService.logoutAll();
      } catch (error) {
        if (gameRef && typeof gameRef.resumeAfterAuthLogoutFailure === 'function') {
          await gameRef.resumeAfterAuthLogoutFailure();
        }
        throw error;
      }
      if (result && result.success !== false) window.location.reload();
      else {
        if (gameRef && typeof gameRef.resumeAfterAuthLogoutFailure === 'function') {
          await gameRef.resumeAfterAuthLogoutFailure();
        }
        this.notice(result && result.message || '全端退出失败', true);
      }
    }
  }

  openRelayExpeditionOps() {
    if (this.game && this.game.seasonOpsView && typeof this.game.seasonOpsView.openRelayExpeditionMode === 'function') {
      this.game.seasonOpsView.openRelayExpeditionMode({ render: false });
    }
    if (this.game && typeof this.game.showSeasonOps === 'function') {
      this.game.showSeasonOps('authoritative');
    }
  }

  async mutate(task, successMessage, refreshSecurity = false) {
    this.busy = true;
    try {
      const result = await task();
      if (!result || result.success === false) {
        this.notice(result && result.message || '操作未完成', true);
        return result;
      }
      await this.refresh();
      if (refreshSecurity) await this.refreshSecurity();
      this.notice(successMessage);
      return result;
    } finally {
      this.busy = false;
    }
  }

  notice(message, error = false) {
    const status = document.getElementById('social-status');
    if (!status) return;
    status.textContent = String(message || '');
    status.classList.toggle('error', error);
    window.setTimeout(() => {
      if (status.textContent === message) status.textContent = '';
    }, 3600);
  }
}
