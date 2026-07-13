import { AuthService } from '../services/authService.js';
import { BackendClient } from '../services/backend-client.js';

const TABS = new Set(['friends', 'requests', 'squad', 'security']);

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
    this.searchResult = null;
    this.busy = false;
    this.bound = false;
    this.presenceTimer = null;
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
    const result = await BackendClient.getSocialDashboard({ expectedUserId });
    if (result && result.success !== false) {
      this.dashboard = result;
    } else if (result && result.reason === 'account_social_account_changed') {
      this.dashboard = null;
      this.security = null;
      this.searchResult = null;
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
      return `<section class="social-section social-squad-summary"><span class="social-kicker">本轮天穹裂隙</span><h3>尚未结成小队</h3><p>可独自建队后邀请至多三位道友。组队只汇总真实贡献，不增加次数、伤害或战力。</p><button type="button" data-social-action="squad-create">创建小队</button></section><section class="social-section"><div class="social-section-heading"><h3>待处理邀请</h3><span>${invites.length}</span></div>${inviteRows || '<div class="social-empty">当前没有裂隙小队邀请。</div>'}</section>`;
    }
    const members = list(squad, 'members');
    const score = Number(value(squad, 'cooperativeScore', 'score') || 0);
    const memberRows = members.map(member => `<div class="social-member"><strong>${escapeHtml(displayName(member))}</strong><span>${Number(member.bestContribution || member.contribution || 0) > 0 ? `真实贡献 ${Number(member.bestContribution || member.contribution)}` : '尚无贡献'}</span></div>`).join('');
    const rewards = list(current, 'milestones', 'rewards').map(reward => `<button type="button" class="${reward.claimable ? '' : 'secondary'}" data-social-action="squad-claim" data-milestone-id="${escapeHtml(reward.milestoneId || reward.id)}" ${reward.claimable ? '' : 'disabled'}>${reward.claimed ? '已领取' : `${Number(reward.reward?.amount || reward.amount || 0)} 荣誉`}</button>`).join('');
    const locked = Number(value(current, 'membership.lockedAt') || 0) > 0;
    return `<section class="social-section social-squad-summary"><span class="social-kicker">本轮协作分</span><div class="social-score"><strong>${score}</strong><span>/ 9600</span></div><p>${members.length}/4 位成员 · 每人仅取最佳一次真实贡献</p><div class="social-members">${memberRows}</div><div class="social-rewards">${rewards}</div><button type="button" class="danger" data-social-action="squad-leave" ${locked ? 'disabled' : ''}>${locked ? '已有贡献，本轮归属已锁定' : '退出小队'}</button></section><section class="social-section"><div class="social-section-heading"><h3>待处理邀请</h3><span>${invites.length}</span></div>${inviteRows || '<div class="social-empty">当前没有其他小队邀请。</div>'}</section>`;
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
    if (action === 'refresh') return this.refresh();
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
      const result = await AuthService.logoutAll();
      if (result && result.success !== false) window.location.reload();
      else this.notice(result && result.message || '全端退出失败', true);
    }
  }

  async mutate(task, successMessage, refreshSecurity = false) {
    this.busy = true;
    const result = await task();
    this.busy = false;
    if (!result || result.success === false) {
      this.notice(result && result.message || '操作未完成', true);
      return result;
    }
    this.notice(successMessage);
    await this.refresh();
    if (refreshSecurity) await this.refreshSecurity();
    return result;
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
