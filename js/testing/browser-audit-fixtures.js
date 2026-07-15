import { AuthService } from '../services/authService.js';
import { BackendClient } from '../services/backend-client.js';

const AUDIT_USER = Object.freeze({
  objectId: 'browser-audit-user',
  username: '卷宗测试者'
});

function installAuditIdentity() {
  AuthService.getCurrentUser = () => AUDIT_USER;
  AuthService.isLoggedIn = () => true;
  AuthService.getUserIdentity = user => String(user?.objectId || user?.id || user?.username || '');
  BackendClient.getCurrentUser = () => AUDIT_USER;
  return AUDIT_USER;
}

function createSeasonOpsDashboard(now = Date.now()) {
  return {
    success: true,
    reportVersion: 'season-ops-dashboard-v1',
    protocolVersion: 'season-ops-v1',
    generatedAt: now,
    season: {
      seasonId: 's1-genesis',
      title: '开天赛季',
      ruleVersion: 'season-ops-v1-s1',
      catalogVersion: 'season-ops-catalog-v1',
      startsAt: Date.UTC(2026, 6, 6),
      endsAt: Date.UTC(2026, 7, 17),
      graceEndsAt: Date.UTC(2026, 7, 24),
      rewardCurrency: 'renown',
      rewardImpact: 'cosmetic_only',
      state: 'active',
      isActive: true,
      isGrace: false,
      isEnded: false,
      boundary: '正式榜单只接收服务端权威真人结算。'
    },
    wallet: {
      currency: 'renown',
      balance: 1280,
      lifetimeEarned: 2160,
      lifetimeSpent: 880,
      spendPolicy: 'cosmetic_only',
      updatedAt: now
    },
    objectives: [{
      objectiveId: 'daily_battle_wins',
      title: '三战热身',
      scope: 'daily',
      cycleId: 'daily:2026-07-15',
      current: 3,
      target: 3,
      completed: true,
      claimable: true,
      claimed: false,
      trustRequirement: 'client_observed',
      reward: { currency: 'renown', amount: 30, rewardImpact: 'cosmetic_only' }
    }, {
      objectiveId: 'season_live_pvp_matches',
      title: '天道应战',
      scope: 'season',
      cycleId: 'season:s1-genesis',
      current: 7,
      target: 10,
      completed: false,
      claimable: false,
      claimed: false,
      trustRequirement: 'server_authoritative',
      reward: { currency: 'renown', amount: 260, rewardImpact: 'cosmetic_only' }
    }],
    entitlements: [{
      entitlementId: 'ent-owned-0001',
      entitlementKey: 'badge.genesis_witness',
      entitlementType: 'badge',
      seasonId: 's1-genesis',
      grantedAt: now - 5000
    }],
    offers: [],
    leaderboard: [{
      rank: 1,
      userName: '问道者',
      score: 1160,
      wins: 6,
      losses: 2,
      rankedGames: 8,
      division: '潜龙榜',
      authoritativeParticipant: true,
      updatedAt: now - 3000
    }, {
      rank: 2,
      userName: '卷宗测试者',
      score: 1088,
      wins: 4,
      losses: 3,
      rankedGames: 7,
      division: '潜龙榜',
      authoritativeParticipant: true,
      updatedAt: now - 2000
    }, {
      rank: 3,
      userName: '折剑客',
      score: 1024,
      wins: 5,
      losses: 4,
      rankedGames: 9,
      division: '潜龙榜',
      authoritativeParticipant: true,
      updatedAt: now - 1000
    }],
    self: {
      rank: 2,
      userName: '卷宗测试者',
      score: 1088,
      wins: 4,
      losses: 3,
      rankedGames: 7,
      division: '潜龙榜',
      authoritativeParticipant: true,
      updatedAt: now - 2000
    },
    ledger: [{
      entryId: 'ledger-reward-0001',
      currency: 'renown',
      delta: 100,
      balanceAfter: 1280,
      reason: '契约奖励',
      rewardImpact: 'cosmetic_only',
      createdAt: now - 1000
    }, {
      entryId: 'ledger-purchase-0001',
      currency: 'renown',
      delta: -180,
      balanceAfter: 1180,
      reason: '商店购买',
      rewardImpact: 'cosmetic_only',
      createdAt: now - 2000
    }, {
      entryId: 'ledger-battle-0001',
      currency: 'renown',
      delta: 45,
      balanceAfter: 1360,
      reason: '真人论道结算',
      rewardImpact: 'cosmetic_only',
      createdAt: now - 3000
    }],
    ledgerNextCursor: '100:season-ledger-cursor-0001'
  };
}

function createSocialDashboard(now = Date.now()) {
  return {
    success: true,
    profile: { profileId: AUDIT_USER.objectId, displayName: AUDIT_USER.username },
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    riftSquad: {
      current: {
        rotation: { rotationId: 'rift-audit-rotation', title: '裂隙轮替 · 烬天回廊' },
        membership: { lockedAt: now - 60000 },
        squad: {
          squadId: 'rift-audit-squad',
          rotationId: 'rift-audit-rotation',
          cooperativeScore: 4380,
          members: [{ userId: AUDIT_USER.objectId, displayName: '卷宗测试者', bestContribution: 1680 },
            { userId: 'ally-2', displayName: '问道者', bestContribution: 1220 },
            { userId: 'ally-3', displayName: '折剑客', bestContribution: 960 }]
        },
        milestones: [{ milestoneId: 'squad-2400', reward: { amount: 60 }, claimable: false, claimed: true },
          { milestoneId: 'squad-4200', reward: { amount: 100 }, claimable: true, claimed: false }],
        invites: { received: [] }
      }
    }
  };
}

function createRelayState(now = Date.now()) {
  const sessionId = 'relay-audit-session';
  const members = [{ userId: AUDIT_USER.objectId, displayName: '卷宗测试者', seat: 0 },
    { userId: 'ally-2', displayName: '问道者', seat: 1 },
    { userId: 'ally-3', displayName: '折剑客', seat: 2 }];
  const currentLeg = {
    sessionId,
    legId: 'relay-audit-leg-3',
    legIndex: 3,
    status: 'reserved',
    priorityMemberId: AUDIT_USER.objectId,
    priorityUntil: now + 18 * 60000,
    openClaimUntil: now + 48 * 60000,
    canClaim: true,
    canPass: true,
    allowedTactics: [{ tacticId: 'vanguard' }, { tacticId: 'bulwark' }, { tacticId: 'insight' }]
  };
  return {
    pending: null,
    lastError: null,
    current: {
      rotation: { rotationId: 'rift-audit-rotation', title: '烬天回廊 · 四棒接力' },
      sourceSquad: { sourceSquadId: 'rift-audit-squad', eligible: true, isLeader: true },
      previousSessions: []
    },
    session: {
      sessionId,
      rotationId: 'rift-audit-rotation',
      totalScore: 4380,
      processedLegs: 2,
      projectedLegs: 2,
      members,
      legs: [{ legIndex: 1, status: 'projected', runnerUserId: 'ally-2', tacticId: 'vanguard', routeScore: 1880 },
        { legIndex: 2, status: 'projected', runnerUserId: 'ally-3', tacticId: 'bulwark', routeScore: 2500 },
        currentLeg,
        { legIndex: 4, status: 'queued', priorityMemberId: 'ally-2' }],
      rewardMilestones: [{ milestoneId: 'relay-3200', reward: { amount: 80 }, claimable: true, claimed: false },
        { milestoneId: 'relay-5200', reward: { amount: 140 }, claimable: false, claimed: false }]
    },
    currentLeg
  };
}

export async function showSeasonOpsAuditState(game, tab = 'ledger') {
  const user = installAuditIdentity();
  const view = await game.ensureSeasonOpsViewLoaded();
  game.showScreen('season-ops-screen');
  view.ensureRoot();
  view.boundUserId = user.objectId;
  view.activeTab = tab === 'leaderboard' ? 'leaderboard' : 'ledger';
  view.dashboard = view.normalizeDashboard(createSeasonOpsDashboard(), user.objectId);
  view.phase = 'ready';
  view.errorMessage = '';
  view.notice = null;
  view.isRefreshing = false;
  view.render();
  return true;
}

export async function showSocialRelayAuditState(game) {
  installAuditIdentity();
  const view = await game.ensureSocialViewLoaded();
  game.showScreen('social-screen');
  game.setSocialHubLoadingState('ready');
  view.tab = 'squad';
  view.dashboard = createSocialDashboard();
  view.relayState = createRelayState();
  view.authExpired = false;
  view.bind();
  view.syncTabs();
  view.render();
  return true;
}
