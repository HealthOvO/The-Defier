import { Utils } from "../core/utils.js";
export class SanctumAgendaManager {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  createFateAftereffectFromSanctumAgenda(resolved = null, context = {}) {
    if (!resolved || typeof resolved !== 'object' || !resolved.agendaId) return null;
    const outcomeId = resolved.recoveryEligible ? 'recovery' : resolved.contractResolved ? resolved.contractSuccess ? 'contract_success' : 'contract_miss' : resolved.outcome === 'success' ? 'stabilized' : '';
    if (!outcomeId) return null;
    const rewardTrackId = String(resolved.rewardTrackId || '').trim();
    const templateId = rewardTrackId === 'forbidden_altar' ? 'risk_bias' : rewardTrackId === 'memory_rift' ? 'archive_bias' : 'route_bias';
    const catalog = {
      route_bias: {
        contract_success: {
          name: '星镜余痕',
          icon: '🧭',
          durationChapters: 2,
          weightShift: {
            observatory: 0.028,
            event: 0.018,
            memory_rift: 0.014,
            enemy: -0.014,
            rest: -0.010
          },
          positiveLine: '观星 / 事件 / 裂隙更容易连成同轴路线。',
          negativeLine: '战斗与营地窗口会略少，路线更容易被细线样本牵走。',
          summaryLine: '契约兑现后，观星锁线会继续牵引下一章路线。'
        },
        contract_miss: {
          name: '欠契偏航',
          icon: '🧭',
          durationChapters: 1,
          weightShift: {
            observatory: 0.018,
            event: 0.012,
            memory_rift: 0.010,
            rest: -0.016,
            shop: -0.010
          },
          positiveLine: '观星 / 事件仍更容易刷到，便于补回未兑契账。',
          negativeLine: '修整与商路更少，补题压力会直接压到下一章。',
          summaryLine: '未兑现的锁线契约在下章留下了偏航账。'
        },
        recovery: {
          name: '残卷引线',
          icon: '🧭',
          durationChapters: 1,
          weightShift: {
            observatory: 0.012,
            event: 0.008,
            memory_rift: 0.006,
            enemy: -0.004
          },
          positiveLine: '下一章仍会略偏观星 / 事件，方便把残卷线索补全。',
          negativeLine: '偏压较轻，但主线选择仍会被旧样本牵一下。',
          summaryLine: '残卷回收留下了一条较轻的路线牵引。'
        },
        stabilized: {
          name: '稳线回响',
          icon: '🧭',
          durationChapters: 1,
          weightShift: {
            observatory: 0.016,
            event: 0.012,
            memory_rift: 0.008,
            rest: -0.006
          },
          positiveLine: '下一章更容易续上观星 / 事件主轴，便于把稳线收益滚起来。',
          negativeLine: '休整窗口略少，路线会更坚持当前主轴。',
          summaryLine: '结题后的稳线研究留下了短期路线偏置。'
        }
      },
      risk_bias: {
        contract_success: {
          name: '血线余压',
          icon: '🩸',
          durationChapters: 2,
          weightShift: {
            elite: 0.020,
            trial: 0.018,
            forbidden_altar: 0.016,
            rest: -0.018,
            shop: -0.012
          },
          positiveLine: '精英 / 试炼 / 禁术节点更容易成串，便于继续验证高压模板。',
          negativeLine: '商路与营地更少，章节容错会明显下降。',
          summaryLine: '高压契约兑现后，下一轮仍会被压向敌情与风险线。'
        },
        contract_miss: {
          name: '欠压追痕',
          icon: '🩸',
          durationChapters: 1,
          weightShift: {
            enemy: 0.018,
            elite: 0.016,
            trial: 0.014,
            rest: -0.018,
            shop: -0.014
          },
          positiveLine: '敌影与高压样本会更密，方便补完未收口的压强研究。',
          negativeLine: '休整窗口更稀，上一章欠下的高压代价会继续追着你。',
          summaryLine: '未兑现的高压契约把风险继续压到了下一章。'
        },
        recovery: {
          name: '残压余波',
          icon: '🩸',
          durationChapters: 1,
          weightShift: {
            trial: 0.012,
            elite: 0.008,
            enemy: 0.006,
            rest: -0.006
          },
          positiveLine: '仍会稍微偏向试炼 / 精英，方便用轻量样本补回残卷。',
          negativeLine: '虽然只剩余波，但下章的风险密度依然会偏高一点。',
          summaryLine: '残卷回收保留了一点高压余波，但强度明显低于成功结题。'
        },
        stabilized: {
          name: '校压回响',
          icon: '🩸',
          durationChapters: 1,
          weightShift: {
            elite: 0.014,
            trial: 0.012,
            forbidden_altar: 0.010,
            rest: -0.008
          },
          positiveLine: '高压节点会略微增多，便于继续把校压模板跑熟。',
          negativeLine: '休整与补给略少，下章需要更主动管控血线。',
          summaryLine: '这轮高压研究留下了一次短程敌情偏置。'
        }
      },
      archive_bias: {
        contract_success: {
          name: '归卷余映',
          icon: '🪞',
          durationChapters: 2,
          weightShift: {
            memory_rift: 0.022,
            observatory: 0.016,
            spirit_grotto: 0.014,
            enemy: -0.008,
            shop: -0.008
          },
          positiveLine: '裂隙 / 观星 / 灵契节点更容易连成归卷线，档案收益更好补齐。',
          negativeLine: '直接推进主线的窗口更窄，商路节奏也会放慢。',
          summaryLine: '归卷契约兑现后，下一轮会更容易刷出档案系节点。'
        },
        contract_miss: {
          name: '欠卷旁注',
          icon: '🪞',
          durationChapters: 1,
          weightShift: {
            memory_rift: 0.018,
            observatory: 0.012,
            event: 0.010,
            shop: -0.014,
            rest: -0.008
          },
          positiveLine: '归卷相关节点仍会增多，方便补回未结清的档案账。',
          negativeLine: '旁注与归档会拖慢主线收束，补给窗口也更少。',
          summaryLine: '未结清的归卷契账会在下一章继续拖住路线节奏。'
        },
        recovery: {
          name: '残卷旁辉',
          icon: '🪞',
          durationChapters: 1,
          weightShift: {
            memory_rift: 0.012,
            observatory: 0.008,
            spirit_grotto: 0.006,
            enemy: -0.004
          },
          positiveLine: '仍会轻微偏向裂隙 / 观星，方便把回收到的残页补完整。',
          negativeLine: '代价较轻，但下章仍会多分一点心力给归档收束。',
          summaryLine: '残卷回收只留下轻量档案偏置，不会等同完整结题。'
        },
        stabilized: {
          name: '归档回响',
          icon: '🪞',
          durationChapters: 1,
          weightShift: {
            memory_rift: 0.016,
            observatory: 0.012,
            spirit_grotto: 0.008,
            enemy: -0.006
          },
          positiveLine: '下一章更容易续上裂隙 / 观星 / 灵契线，便于把归卷收益继续压实。',
          negativeLine: '主线推进会稍慢，路线会更偏向收档与旁证。',
          summaryLine: '这轮归卷研究留下了一次短程档案偏置。'
        }
      }
    };
    const template = catalog[templateId]?.[outcomeId] || null;
    if (!template) return null;
    const chapterIndex = Math.max(0, Math.floor(Number(context.chapterIndex ?? resolved.boundChapterIndex) || 0));
    const sourceRunId = String(resolved.sourceRunId || '').trim();
    const record = this.game.normalizeFateAftereffectRecord({
      recordId: `aftereffect_${sourceRunId || resolved.agendaId || Date.now()}_${outcomeId}`,
      icon: template.icon,
      name: template.name,
      sourceRunId,
      sourceAgendaId: resolved.agendaId,
      sourceLabel: resolved.name || '洞府议程',
      sourceLine: [resolved.name || '洞府议程', resolved.selectedContractLabel ? `契约「${resolved.selectedContractLabel}」` : '', !resolved.selectedContractLabel && resolved.selectedDecisionLabel ? `处置「${resolved.selectedDecisionLabel}」` : '', resolved.boundChapterName || resolved.chapterName || ''].filter(Boolean).join(' · '),
      sourceContractLabel: resolved.selectedContractLabel || '',
      sourceDecisionLabel: resolved.selectedDecisionLabel || '',
      templateId,
      outcomeId,
      chapterIndex,
      chapterName: resolved.boundChapterName || resolved.chapterName || '',
      durationChapters: template.durationChapters,
      positiveLine: template.positiveLine,
      negativeLine: template.negativeLine,
      summaryLine: `${template.name}：${template.summaryLine}`,
      detailLine: [`来源：${resolved.name || '洞府议程'}${resolved.selectedContractLabel ? ` · 契约「${resolved.selectedContractLabel}」` : resolved.selectedDecisionLabel ? ` · 处置「${resolved.selectedDecisionLabel}」` : ''}`, `正向：${template.positiveLine}`, `代价：${template.negativeLine}`].filter(Boolean).join('｜'),
      weightShift: template.weightShift,
      createdAt: Date.now()
    });
    const state = this.game.ensureFateAftereffectState({
      pruneExpired: true,
      currentChapterIndex: chapterIndex
    });
    state.records = Array.isArray(state.records) ? state.records.filter(entry => entry.recordId !== record.recordId && !(entry.sourceRunId === record.sourceRunId && entry.sourceAgendaId === record.sourceAgendaId)).concat(record).slice(-6) : [record];
    state.history = Array.isArray(state.history) ? state.history.filter(entry => entry.recordId !== record.recordId).concat(record).slice(-10) : [record];
    state.lastResolved = record;
    this.game.fateAftereffectState = state;
    return record;
  }
  createDefaultSanctumAgendaState() {
    return {
      version: 1,
      activeAgenda: null,
      lastResolved: null,
      history: [],
      totalCompleted: 0,
      totalFailed: 0
    };
  }
  normalizeSanctumAgendaNodeTypes(list = [], limit = 4) {
    const allowed = new Set(['enemy', 'elite', 'event', 'shop', 'trial', 'forge', 'rest', 'observatory', 'spirit_grotto', 'forbidden_altar', 'memory_rift']);
    const result = [];
    const pushValue = value => {
      const key = String(value || '').trim();
      if (!allowed.has(key) || result.includes(key)) return;
      result.push(key);
    };
    const visit = value => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (value && typeof value === 'object' && typeof value.type === 'string') {
        pushValue(value.type);
        return;
      }
      if (typeof value === 'string') {
        pushValue(value);
      }
    };
    visit(list);
    return result.slice(0, Math.max(1, Math.floor(Number(limit) || 4)));
  }
  inferSanctumAgendaNodeTypes(values = [], fallbackThemeKey = '') {
    const result = [];
    const pushType = type => {
      if (!result.includes(type)) result.push(type);
    };
    const directNodeTypes = new Set(['enemy', 'elite', 'event', 'shop', 'trial', 'forge', 'rest', 'observatory', 'spirit_grotto', 'forbidden_altar', 'memory_rift']);
    const patternMap = [{
      type: 'observatory',
      regex: /(观星|观测|天象|星镜|星轨|天机)/
    }, {
      type: 'event',
      regex: /(事件|机缘|奇遇|留痕)/
    }, {
      type: 'memory_rift',
      regex: /(裂隙|归卷|改写|回响|答卷|复盘|镜)/
    }, {
      type: 'spirit_grotto',
      regex: /(灵契|护道|调息|养势|休整)/
    }, {
      type: 'forbidden_altar',
      regex: /(禁术|血契|高压|搏命|献祭)/
    }, {
      type: 'trial',
      regex: /(试炼|检定|压强)/
    }, {
      type: 'forge',
      regex: /(锻炉|炼器|补件|器灵)/
    }, {
      type: 'shop',
      regex: /(商店|补给|货单|折价|灵石)/
    }, {
      type: 'rest',
      regex: /(营地|休整|续航|稳血|恢复)/
    }, {
      type: 'elite',
      regex: /(精英|追猎|高危)/
    }, {
      type: 'enemy',
      regex: /(战斗|前压|清场|接战)/
    }];
    const visit = value => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (value && typeof value === 'object' && typeof value.type === 'string') {
        pushType(value.type);
        return;
      }
      if (typeof value !== 'string') return;
      const text = String(value || '').trim();
      if (!text) return;
      const normalized = text.toLowerCase();
      if (directNodeTypes.has(normalized)) {
        pushType(normalized);
      }
      patternMap.forEach(entry => {
        if (entry.regex.test(text)) pushType(entry.type);
      });
    };
    visit(values);
    const themeDefaults = {
      assault: ['enemy', 'elite', 'trial'],
      bulwark: ['rest', 'spirit_grotto', 'observatory'],
      forge: ['forge', 'trial', 'memory_rift'],
      oracle: ['observatory', 'event', 'memory_rift'],
      tempo: ['enemy', 'event', 'trial'],
      marathon: ['rest', 'spirit_grotto', 'observatory']
    };
    const defaults = themeDefaults[String(fallbackThemeKey || '').trim()] || ['observatory', 'event', 'memory_rift'];
    defaults.forEach(pushType);
    return this.normalizeSanctumAgendaNodeTypes(result, 4);
  }
  getSanctumAgendaNodeMeta(nodeType = '') {
    const catalog = {
      enemy: {
        icon: '⚔️',
        label: '战斗'
      },
      elite: {
        icon: '💀',
        label: '精英'
      },
      event: {
        icon: '❓',
        label: '事件'
      },
      shop: {
        icon: '🏪',
        label: '商路'
      },
      trial: {
        icon: '⚖️',
        label: '试炼'
      },
      forge: {
        icon: '⚒️',
        label: '锻炉'
      },
      rest: {
        icon: '🏕️',
        label: '营地'
      },
      observatory: {
        icon: '🔭',
        label: '观星'
      },
      spirit_grotto: {
        icon: '🪷',
        label: '灵契'
      },
      forbidden_altar: {
        icon: '🩸',
        label: '禁术'
      },
      memory_rift: {
        icon: '🪞',
        label: '裂隙'
      }
    };
    return catalog[nodeType] || {
      icon: '✦',
      label: String(nodeType || '未知节点').trim() || '未知节点'
    };
  }
  formatSanctumAgendaNodeLine(nodeTypes = [], prefix = '优先节点') {
    const normalized = this.normalizeSanctumAgendaNodeTypes(nodeTypes, 4);
    if (normalized.length <= 0) return `${prefix}：暂未锁定`;
    const labels = normalized.map(type => {
      const meta = this.getSanctumAgendaNodeMeta(type);
      return `${meta.icon}${meta.label}`;
    });
    return `${prefix}：${labels.join(' / ')}`;
  }
  formatSanctumAgendaCurrencyLine(cost = null, emptyLabel = '无需额外代价') {
    const source = cost && typeof cost === 'object' ? cost : {};
    const parts = [];
    const insight = Math.max(0, Math.floor(Number(source.insight) || 0));
    const karma = Math.max(0, Math.floor(Number(source.karma) || 0));
    if (insight > 0) parts.push(`🔮 ${insight}`);
    if (karma > 0) parts.push(`🜂 ${karma}`);
    return parts.length > 0 ? parts.join(' / ') : emptyLabel;
  }
  sanitizeSanctumAgendaWeightShift(value = null) {
    const allowedKeys = new Set(['enemy', 'elite', 'event', 'shop', 'trial', 'forge', 'rest', 'observatory', 'spirit_grotto', 'forbidden_altar', 'memory_rift']);
    const result = {};
    if (!value || typeof value !== 'object') return result;
    Object.keys(value).forEach(key => {
      if (!allowedKeys.has(key)) return;
      const delta = Number(value[key]);
      if (!Number.isFinite(delta)) return;
      result[key] = Math.max(-0.12, Math.min(0.12, delta));
    });
    return result;
  }
  mergeSanctumAgendaWeightShifts(...values) {
    const result = {};
    values.forEach(value => {
      const shift = this.sanitizeSanctumAgendaWeightShift(value);
      Object.keys(shift).forEach(key => {
        result[key] = (result[key] || 0) + shift[key];
      });
    });
    return this.sanitizeSanctumAgendaWeightShift(result);
  }
  normalizeSanctumAgendaDecisionOptions(list = [], agendaName = '洞府议程') {
    const sanitizeText = (value = '', limit = 180) => String(value || '').trim().slice(0, limit);
    const clampDelta = (value, min = -2, max = 2) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
    const clampReward = (value, min = -20, max = 20) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
    const allowedTones = ['completed', 'selected', 'suggested', 'idle'];
    return Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object').slice(0, 3).map((entry, index) => ({
      id: sanitizeText(entry.id || `decision_${index + 1}`, 40),
      label: sanitizeText(entry.label || `处置 ${index + 1}`, 40) || `处置 ${index + 1}`,
      tagLabel: sanitizeText(entry.tagLabel || '', 20),
      summaryLine: sanitizeText(entry.summaryLine || entry.summary || `${agendaName} 已进入章中处置。`, 180),
      statusLine: sanitizeText(entry.statusLine || entry.effectLine || '', 180),
      buttonLabel: sanitizeText(entry.buttonLabel || '采用处置', 20) || '采用处置',
      weightShift: this.sanitizeSanctumAgendaWeightShift(entry.weightShift),
      rewardDelta: {
        insight: clampReward(entry?.rewardDelta?.insight, -4, 4),
        karma: clampReward(entry?.rewardDelta?.karma, -4, 4),
        ringExp: clampReward(entry?.rewardDelta?.ringExp, -20, 20)
      },
      targetDelta: clampDelta(entry.targetDelta, -1, 2),
      minCompletedGoalsDelta: clampDelta(entry.minCompletedGoalsDelta, -2, 2),
      allowDeviation: typeof entry.allowDeviation === 'boolean' ? entry.allowDeviation : null,
      acceptedTonesAdd: Array.isArray(entry.acceptedTonesAdd) ? Array.from(new Set(entry.acceptedTonesAdd.map(value => String(value || '').trim()).filter(value => allowedTones.includes(value)))).slice(0, 4) : [],
      successLine: sanitizeText(entry.successLine || '', 180),
      failureLine: sanitizeText(entry.failureLine || '', 180)
    })).filter(entry => entry.id && entry.label) : [];
  }
  normalizeSanctumAgendaContractOptions(list = [], agendaName = '洞府议程') {
    const sanitizeText = (value = '', limit = 180) => String(value || '').trim().slice(0, limit);
    const clampReward = (value, min = 0, max = 20) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
    const allowedTones = ['completed', 'selected', 'suggested', 'idle'];
    return Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object').slice(0, 3).map((entry, index) => {
      const record = {
        id: sanitizeText(entry.id || `contract_${index + 1}`, 40),
        label: sanitizeText(entry.label || `契约 ${index + 1}`, 40) || `契约 ${index + 1}`,
        tagLabel: sanitizeText(entry.tagLabel || '', 20),
        summaryLine: sanitizeText(entry.summaryLine || entry.summary || `${agendaName} 可追加一条锁线契约。`, 180),
        statusLine: sanitizeText(entry.statusLine || entry.effectLine || '', 180),
        buttonLabel: sanitizeText(entry.buttonLabel || '立契锁线', 20) || '立契锁线',
        weightShift: this.sanitizeSanctumAgendaWeightShift(entry.weightShift),
        nodeTypes: this.normalizeSanctumAgendaNodeTypes(entry.nodeTypes, 3),
        target: Math.max(1, Math.min(3, Math.floor(Number(entry.target) || 1))),
        minCompletedGoals: Math.max(0, Math.min(4, Math.floor(Number(entry.minCompletedGoals) || 0))),
        requireNoDeviation: !!entry.requireNoDeviation,
        acceptedTones: Array.isArray(entry.acceptedTones) ? Array.from(new Set(entry.acceptedTones.map(value => String(value || '').trim()).filter(value => allowedTones.includes(value)))).slice(0, 4) : [],
        signCost: {
          insight: clampReward(entry?.signCost?.insight, 0, 3),
          karma: clampReward(entry?.signCost?.karma, 0, 3)
        },
        signCostLine: sanitizeText(entry.signCostLine || '', 80),
        burdenLine: sanitizeText(entry.burdenLine || '', 180),
        bonusReward: {
          insight: clampReward(entry?.bonusReward?.insight, 0, 4),
          karma: clampReward(entry?.bonusReward?.karma, 0, 4),
          ringExp: clampReward(entry?.bonusReward?.ringExp, 0, 20)
        },
        bonusLine: sanitizeText(entry.bonusLine || '', 180),
        successLine: sanitizeText(entry.successLine || '', 180),
        failureLine: sanitizeText(entry.failureLine || '', 180)
      };
      if (!record.signCostLine) {
        record.signCostLine = this.formatSanctumAgendaCurrencyLine(record.signCost, '');
      }
      return record;
    }).filter(entry => entry.id && entry.label) : [];
  }
  resolveSanctumAgendaPhase(record = null) {
    const source = record && typeof record === 'object' ? record : null;
    if (!source || !source.agendaId) {
      return {
        phaseKey: 'idle',
        label: '未立项',
        line: ''
      };
    }
    const progress = Math.max(0, Math.floor(Number(source.progress) || 0));
    const target = Math.max(1, Math.floor(Number(source.target) || 1));
    if (source.outcome === 'success') {
      return {
        phaseKey: 'completed',
        label: '结题成功',
        line: source.grantedLine || source.summaryLine || ''
      };
    }
    if (source.outcome === 'failed' || source.outcome === 'abandoned') {
      return {
        phaseKey: 'failed',
        label: '研究未成',
        line: source.recoveryLine || source.grantedLine || source.reasonLine || source.summaryLine || ''
      };
    }
    if (source.contractState === 'pending' && Array.isArray(source.contractOptions) && source.contractOptions.length > 0) {
      return {
        phaseKey: 'contract',
        label: '待立契',
        line: source.contractPromptLine || `${source.name} 已命中足够样本，可回洞府补一条锁线契约来追额外回报。`
      };
    }
    if (progress >= target) {
      return {
        phaseKey: 'closing',
        label: '收束期',
        line: source.selectedDecisionLine || '关键节点已达标，等待章节结算时核对答卷。'
      };
    }
    if (source.decisionState === 'pending' && Array.isArray(source.decisionOptions) && source.decisionOptions.length > 0) {
      return {
        phaseKey: 'decision',
        label: '待处置',
        line: source.decisionPromptLine || `${source.name} 已进入章中处置，可回洞府在两条研究处置间二选一。`
      };
    }
    if (source.selectedContractLabel) {
      return {
        phaseKey: 'contracting',
        label: `锁线中 · ${source.selectedContractLabel}`,
        line: source.selectedContractLine || source.summaryLine || ''
      };
    }
    if (source.selectedDecisionLabel) {
      return {
        phaseKey: 'executing',
        label: `执行中 · ${source.selectedDecisionLabel}`,
        line: source.selectedDecisionLine || source.summaryLine || ''
      };
    }
    if (progress > 0) {
      return {
        phaseKey: 'sampling',
        label: '取样期',
        line: `${source.name} 已命中 ${progress}/${target} 次关键节点，继续沿 ${source.focusNodeLine || '样本主轴'} 推进。`
      };
    }
    return {
      phaseKey: 'planning',
      label: '立项期',
      line: source.summaryLine || source.focusNodeLine || ''
    };
  }
  normalizeSanctumAgendaRecord(source = null) {
    const root = source && typeof source === 'object' ? source : {};
    const sanitizeText = (value = '', limit = 160) => String(value || '').trim().slice(0, limit);
    const sanitizeTags = (value, limit = 4) => Array.isArray(value) ? Array.from(new Set(value.map(entry => String(entry || '').trim()).filter(Boolean))).slice(0, limit) : [];
    const sanitizeAcceptedTones = (value, fallback = ['completed', 'selected']) => {
      const allowed = ['completed', 'selected', 'suggested', 'idle'];
      const tones = Array.isArray(value) ? value.map(entry => String(entry || '').trim()).filter(entry => allowed.includes(entry)) : [];
      return tones.length > 0 ? Array.from(new Set(tones)).slice(0, 4) : Array.isArray(fallback) ? Array.from(new Set(fallback)).slice(0, 4) : [];
    };
    const sanitizeHistory = value => Array.isArray(value) ? value.filter(entry => entry && typeof entry === 'object').slice(-8).map(entry => ({
      nodeType: String(entry.nodeType || '').trim(),
      nodeId: String(entry.nodeId || '').trim(),
      row: Math.max(0, Math.floor(Number(entry.row) || 0)),
      realm: Math.max(0, Math.floor(Number(entry.realm) || 0)),
      chapterIndex: Math.max(0, Math.floor(Number(entry.chapterIndex) || 0)),
      at: Math.max(0, Math.floor(Number(entry.at) || 0))
    })).filter(entry => entry.nodeType) : [];
    const resolveOutcome = value => ['active', 'success', 'failed', 'abandoned'].includes(String(value || '').trim()) ? String(value || '').trim() : 'active';
    const resolveTone = (value, fallback = 'tracking') => ['tracking', 'selected', 'completed', 'failed', 'idle'].includes(String(value || '').trim()) ? String(value || '').trim() : fallback;
    const resolveRatingTone = value => ['completed', 'selected', 'suggested', 'idle'].includes(String(value || '').trim()) ? String(value || '').trim() : 'idle';
    const rewardTrackId = ['observatory', 'spirit_grotto', 'forbidden_altar', 'memory_rift'].includes(String(root.rewardTrackId || '').trim()) ? String(root.rewardTrackId || '').trim() : '';
    const record = {
      agendaId: sanitizeText(root.agendaId || root.id || '', 40),
      icon: sanitizeText(root.icon || '🧮', 8) || '🧮',
      name: sanitizeText(root.name || '洞府议程', 60) || '洞府议程',
      sourceRunId: sanitizeText(root.sourceRunId || '', 80),
      guideRecordId: sanitizeText(root.guideRecordId || '', 80),
      sourceLine: sanitizeText(root.sourceLine || '', 120),
      chapterName: sanitizeText(root.chapterName || '', 60),
      sourceTitle: sanitizeText(root.sourceTitle || '', 80),
      themeKey: sanitizeText(root.themeKey || '', 40),
      themeLabel: sanitizeText(root.themeLabel || '', 60),
      ratingLabel: sanitizeText(root.ratingLabel || '', 60),
      ratingTone: resolveRatingTone(root.ratingTone),
      trainingAdvice: sanitizeText(root.trainingAdvice || '', 180),
      highlightLine: sanitizeText(root.highlightLine || '', 180),
      routeFocusLine: sanitizeText(root.routeFocusLine || '', 180),
      compareHint: sanitizeText(root.compareHint || '', 180),
      trainingTags: sanitizeTags(root.trainingTags, 4),
      goalHighlights: sanitizeTags(root.goalHighlights, 3),
      focusNodeTypes: this.normalizeSanctumAgendaNodeTypes(root.focusNodeTypes, 4),
      focusNodeLine: sanitizeText(root.focusNodeLine || '', 120),
      progress: Math.max(0, Math.floor(Number(root.progress) || 0)),
      target: Math.max(1, Math.floor(Number(root.target) || 1)),
      matchedNodeIds: sanitizeTags(root.matchedNodeIds, 12),
      hitHistory: sanitizeHistory(root.hitHistory),
      boundChapterIndex: Math.max(0, Math.floor(Number(root.boundChapterIndex) || 0)),
      boundChapterName: sanitizeText(root.boundChapterName || '', 60),
      selectedAt: Math.max(0, Math.floor(Number(root.selectedAt) || 0)),
      updatedAt: Math.max(0, Math.floor(Number(root.updatedAt) || 0)),
      cost: {
        insight: Math.max(0, Math.floor(Number(root?.cost?.insight) || 0)),
        karma: Math.max(0, Math.floor(Number(root?.cost?.karma) || 0))
      },
      costLine: sanitizeText(root.costLine || '', 80),
      weightShift: this.sanitizeSanctumAgendaWeightShift(root.weightShift),
      rewardTrackId,
      rewardTrackName: sanitizeText(root.rewardTrackName || '', 60),
      rewardTrackIcon: sanitizeText(root.rewardTrackIcon || '', 8),
      reward: {
        insight: Math.max(0, Math.floor(Number(root?.reward?.insight) || 0)),
        karma: Math.max(0, Math.floor(Number(root?.reward?.karma) || 0)),
        ringExp: Math.max(0, Math.floor(Number(root?.reward?.ringExp) || 0))
      },
      rewardLine: sanitizeText(root.rewardLine || '', 180),
      successLine: sanitizeText(root.successLine || '', 180),
      failureLine: sanitizeText(root.failureLine || '', 180),
      minCompletedGoals: Math.max(0, Math.floor(Number(root.minCompletedGoals) || 0)),
      allowDeviation: !!root.allowDeviation,
      acceptedTones: sanitizeAcceptedTones(root.acceptedTones),
      decisionThreshold: Math.max(1, Math.floor(Number(root.decisionThreshold) || 1)),
      decisionState: ['locked', 'pending', 'selected'].includes(String(root.decisionState || '').trim()) ? String(root.decisionState || '').trim() : 'locked',
      decisionPromptLine: sanitizeText(root.decisionPromptLine || '', 180),
      decisionOptions: this.normalizeSanctumAgendaDecisionOptions(root.decisionOptions, root.name || '洞府议程'),
      selectedDecisionId: sanitizeText(root.selectedDecisionId || '', 40),
      selectedDecisionLabel: sanitizeText(root.selectedDecisionLabel || '', 60),
      selectedDecisionLine: sanitizeText(root.selectedDecisionLine || '', 180),
      contractThreshold: Math.max(1, Math.floor(Number(root.contractThreshold) || 2)),
      contractState: ['locked', 'pending', 'selected', 'resolved'].includes(String(root.contractState || '').trim()) ? String(root.contractState || '').trim() : 'locked',
      contractPromptLine: sanitizeText(root.contractPromptLine || '', 180),
      contractOptions: this.normalizeSanctumAgendaContractOptions(root.contractOptions, root.name || '洞府议程'),
      selectedContractId: sanitizeText(root.selectedContractId || '', 40),
      selectedContractLabel: sanitizeText(root.selectedContractLabel || '', 60),
      selectedContractLine: sanitizeText(root.selectedContractLine || '', 180),
      contractSignCost: {
        insight: Math.max(0, Math.floor(Number(root?.contractSignCost?.insight) || 0)),
        karma: Math.max(0, Math.floor(Number(root?.contractSignCost?.karma) || 0))
      },
      contractSignCostLine: sanitizeText(root.contractSignCostLine || '', 80),
      contractBurdenLine: sanitizeText(root.contractBurdenLine || '', 180),
      selectedContractAt: Math.max(0, Math.floor(Number(root.selectedContractAt) || 0)),
      contractNodeTypes: this.normalizeSanctumAgendaNodeTypes(root.contractNodeTypes, 3),
      contractProgress: Math.max(0, Math.floor(Number(root.contractProgress) || 0)),
      contractTarget: Math.max(1, Math.floor(Number(root.contractTarget) || 1)),
      contractMatchedNodeIds: sanitizeTags(root.contractMatchedNodeIds, 12),
      contractRequireNoDeviation: !!root.contractRequireNoDeviation,
      contractAcceptedTones: sanitizeAcceptedTones(root.contractAcceptedTones, []),
      contractMinCompletedGoals: Math.max(0, Math.floor(Number(root.contractMinCompletedGoals) || 0)),
      contractBonusReward: {
        insight: Math.max(0, Math.floor(Number(root?.contractBonusReward?.insight) || 0)),
        karma: Math.max(0, Math.floor(Number(root?.contractBonusReward?.karma) || 0)),
        ringExp: Math.max(0, Math.floor(Number(root?.contractBonusReward?.ringExp) || 0))
      },
      contractBonusLine: sanitizeText(root.contractBonusLine || '', 180),
      contractSuccessLine: sanitizeText(root.contractSuccessLine || '', 180),
      contractFailureLine: sanitizeText(root.contractFailureLine || '', 180),
      contractResolved: !!root.contractResolved,
      contractSuccess: !!root.contractSuccess,
      contractResolutionLine: sanitizeText(root.contractResolutionLine || '', 180),
      recoveryEligible: !!root.recoveryEligible,
      recoveryLabel: sanitizeText(root.recoveryLabel || '', 40),
      recoveryTier: ['trace', 'salvage', 'deep'].includes(String(root.recoveryTier || '').trim()) ? String(root.recoveryTier || '').trim() : '',
      recoveryTierLabel: sanitizeText(root.recoveryTierLabel || '', 40),
      recoveryReward: {
        insight: Math.max(0, Math.floor(Number(root?.recoveryReward?.insight) || 0)),
        karma: Math.max(0, Math.floor(Number(root?.recoveryReward?.karma) || 0)),
        ringExp: Math.max(0, Math.floor(Number(root?.recoveryReward?.ringExp) || 0))
      },
      recoveryLine: sanitizeText(root.recoveryLine || '', 180),
      recoveryHintLine: sanitizeText(root.recoveryHintLine || '', 180),
      outcome: resolveOutcome(root.outcome),
      outcomeLabel: sanitizeText(root.outcomeLabel || '', 60),
      outcomeTone: resolveTone(root.outcomeTone, resolveOutcome(root.outcome) === 'success' ? 'completed' : resolveOutcome(root.outcome) === 'failed' || resolveOutcome(root.outcome) === 'abandoned' ? 'failed' : 'tracking'),
      reasonId: sanitizeText(root.reasonId || '', 40),
      reasonLine: sanitizeText(root.reasonLine || '', 180),
      summaryLine: sanitizeText(root.summaryLine || '', 180),
      grantedLine: sanitizeText(root.grantedLine || '', 180),
      logLine: sanitizeText(root.logLine || '', 220),
      phaseKey: sanitizeText(root.phaseKey || '', 24),
      phaseLabel: sanitizeText(root.phaseLabel || '', 60),
      phaseLine: sanitizeText(root.phaseLine || '', 180),
      statusLine: sanitizeText(root.statusLine || '', 180)
    };
    if (!record.sourceLine) {
      record.sourceLine = [record.chapterName, record.sourceTitle || record.themeLabel].filter(Boolean).join(' · ');
    }
    if (!record.focusNodeLine) {
      record.focusNodeLine = this.formatSanctumAgendaNodeLine(record.focusNodeTypes, '议程节点');
    }
    if (!record.costLine) {
      record.costLine = this.formatSanctumAgendaCurrencyLine(record.cost, '无需额外代价');
    }
    if (record.rewardTrackId && (!record.rewardTrackName || !record.rewardTrackIcon)) {
      const engineeringCatalog = this.game.getStrategicEngineeringCatalog();
      const track = engineeringCatalog[record.rewardTrackId];
      if (track) {
        if (!record.rewardTrackName) record.rewardTrackName = track.name || track.nodeLabel || record.rewardTrackId;
        if (!record.rewardTrackIcon) record.rewardTrackIcon = track.icon || '✦';
      }
    }
    if (!record.summaryLine) {
      record.summaryLine = record.trainingAdvice || record.highlightLine || `${record.name} 已立项。`;
    }
    if (record.recoveryEligible && !record.recoveryLabel) {
      record.recoveryLabel = '残卷回收';
    }
    if (record.recoveryEligible && !record.recoveryTierLabel) {
      const recoveryTierLabelMap = {
        trace: '残页',
        salvage: '残卷',
        deep: '整编'
      };
      record.recoveryTierLabel = recoveryTierLabelMap[record.recoveryTier] || '残卷';
    }
    if (record.recoveryEligible && record.outcome !== 'success' && !record.grantedLine) {
      record.grantedLine = record.recoveryLine;
    }
    const selectedDecision = record.decisionOptions.find(entry => entry.id === record.selectedDecisionId) || null;
    const selectedContract = record.contractOptions.find(entry => entry.id === record.selectedContractId) || null;
    if (selectedDecision) {
      record.decisionState = 'selected';
      if (!record.selectedDecisionLabel) record.selectedDecisionLabel = selectedDecision.label;
      if (!record.selectedDecisionLine) {
        record.selectedDecisionLine = selectedDecision.statusLine || selectedDecision.summaryLine;
      }
    } else if (record.outcome === 'active' && record.progress >= record.decisionThreshold && record.decisionOptions.length > 0) {
      record.decisionState = 'pending';
    } else {
      record.decisionState = 'locked';
    }
    if (!record.decisionPromptLine && record.decisionOptions.length > 0) {
      const decisionLabels = record.decisionOptions.map(entry => `【${entry.label}】`).join(' / ');
      record.decisionPromptLine = `${record.name} 已进入章中处置，可回洞府在 ${decisionLabels} 之间二选一。`;
    }
    if (selectedContract) {
      record.contractState = record.outcome === 'active' ? 'selected' : 'resolved';
      record.contractResolved = record.outcome !== 'active';
      if (!record.selectedContractLabel) record.selectedContractLabel = selectedContract.label;
      if (!record.selectedContractLine) {
        const contractParts = [selectedContract.statusLine || selectedContract.summaryLine, selectedContract.signCostLine ? `契押 ${selectedContract.signCostLine}` : '', selectedContract.burdenLine || ''].filter(Boolean);
        record.selectedContractLine = contractParts.join(' · ');
      }
      if ((!root.contractSignCost || typeof root.contractSignCost !== 'object') && selectedContract.signCost) {
        record.contractSignCost = {
          insight: Math.max(0, Math.floor(Number(selectedContract?.signCost?.insight) || 0)),
          karma: Math.max(0, Math.floor(Number(selectedContract?.signCost?.karma) || 0))
        };
      }
      if (!record.contractSignCostLine) {
        record.contractSignCostLine = selectedContract.signCostLine || this.formatSanctumAgendaCurrencyLine(record.contractSignCost, '');
      }
      if (!record.contractBurdenLine) {
        record.contractBurdenLine = selectedContract.burdenLine || '';
      }
      if (record.contractNodeTypes.length <= 0) {
        record.contractNodeTypes = this.normalizeSanctumAgendaNodeTypes(selectedContract.nodeTypes, 3);
      }
      if (!(Number(root.contractTarget) > 0)) {
        record.contractTarget = Math.max(1, Math.floor(Number(selectedContract.target) || 1));
      }
      if (!Object.prototype.hasOwnProperty.call(root, 'contractMinCompletedGoals')) {
        record.contractMinCompletedGoals = Math.max(0, Math.floor(Number(selectedContract.minCompletedGoals) || 0));
      }
      if (!Object.prototype.hasOwnProperty.call(root, 'contractRequireNoDeviation')) {
        record.contractRequireNoDeviation = !!selectedContract.requireNoDeviation;
      }
      if ((!Array.isArray(root.contractAcceptedTones) || root.contractAcceptedTones.length <= 0) && Array.isArray(selectedContract.acceptedTones)) {
        record.contractAcceptedTones = Array.from(new Set(selectedContract.acceptedTones.map(entry => String(entry || '').trim()).filter(Boolean))).slice(0, 4);
      }
      if ((!root.contractBonusReward || typeof root.contractBonusReward !== 'object') && selectedContract.bonusReward) {
        record.contractBonusReward = {
          insight: Math.max(0, Math.floor(Number(selectedContract?.bonusReward?.insight) || 0)),
          karma: Math.max(0, Math.floor(Number(selectedContract?.bonusReward?.karma) || 0)),
          ringExp: Math.max(0, Math.floor(Number(selectedContract?.bonusReward?.ringExp) || 0))
        };
      }
      if (!record.contractBonusLine) record.contractBonusLine = selectedContract.bonusLine || '';
      if (!record.contractSuccessLine) record.contractSuccessLine = selectedContract.successLine || '';
      if (!record.contractFailureLine) record.contractFailureLine = selectedContract.failureLine || '';
    } else if (record.outcome === 'active' && record.selectedDecisionId && record.progress >= record.contractThreshold && record.contractOptions.length > 0) {
      record.contractState = 'pending';
    } else {
      record.contractState = 'locked';
    }
    if (!record.contractPromptLine && record.contractOptions.length > 0) {
      const contractLabels = record.contractOptions.map(entry => `【${entry.label}】`).join(' / ');
      record.contractPromptLine = `${record.name} 已取到关键样本，可回洞府在 ${contractLabels} 之间立一条锁线契约，争取章末额外奖赏。`;
    }
    const phase = this.resolveSanctumAgendaPhase(record);
    record.phaseKey = phase.phaseKey;
    record.phaseLabel = phase.label;
    record.phaseLine = phase.line;
    const statusParts = [record.phaseLabel ? `阶段 ${record.phaseLabel}` : '', record.outcome === 'active' ? `关键节点 ${record.progress}/${record.target}` : '', record.selectedDecisionLabel || '', record.selectedContractLabel ? `契约 ${record.selectedContractLabel}` : ''].filter(Boolean);
    record.statusLine = statusParts.join(' · ');
    return record;
  }
  normalizeSanctumAgendaState(source = null) {
    const defaults = this.createDefaultSanctumAgendaState();
    const root = source && typeof source === 'object' ? source : {};
    const history = Array.isArray(root.history) ? root.history.map(entry => this.normalizeSanctumAgendaRecord(entry)).filter(entry => entry.agendaId).slice(-6) : [];
    const activeAgenda = root.activeAgenda && typeof root.activeAgenda === 'object' ? this.normalizeSanctumAgendaRecord({
      ...root.activeAgenda,
      outcome: 'active',
      outcomeTone: 'tracking'
    }) : null;
    const lastResolved = root.lastResolved && typeof root.lastResolved === 'object' ? this.normalizeSanctumAgendaRecord(root.lastResolved) : null;
    const completedFromHistory = history.filter(entry => entry.outcome === 'success').length;
    const failedFromHistory = history.filter(entry => entry.outcome === 'failed').length;
    return {
      version: Math.max(1, Math.floor(Number(root.version) || defaults.version)),
      activeAgenda: activeAgenda && activeAgenda.agendaId ? activeAgenda : null,
      lastResolved: lastResolved && lastResolved.agendaId ? lastResolved : null,
      history,
      totalCompleted: Math.max(completedFromHistory, Math.floor(Number(root.totalCompleted) || 0)),
      totalFailed: Math.max(failedFromHistory, Math.floor(Number(root.totalFailed) || 0))
    };
  }
  ensureSanctumAgendaState() {
    this.game.sanctumAgendaState = this.normalizeSanctumAgendaState(this.game.sanctumAgendaState);
    return this.game.sanctumAgendaState;
  }
  getSanctumAgendaSaveState() {
    return this.ensureSanctumAgendaState();
  }
  resetSanctumAgendaRunState(reason = 'new_run') {
    const state = this.ensureSanctumAgendaState();
    if (!state.activeAgenda) return state;
    state.activeAgenda = null;
    if (reason === 'clear_all') {
      state.lastResolved = null;
      state.history = [];
      state.totalCompleted = 0;
      state.totalFailed = 0;
    }
    return state;
  }
  getSanctumAgendaSourceSnapshot() {
    const latestSlate = typeof this.game.getLatestRunSlate === 'function' ? this.game.getLatestRunSlate() : null;
    const currentTraining = typeof this.game.getObservatoryTrainingFocus === 'function' ? this.game.getObservatoryTrainingFocus() : null;
    const fallbackTraining = !currentTraining && latestSlate && typeof this.game.buildObservatoryTrainingFocusFromSlate === 'function' ? this.game.buildObservatoryTrainingFocusFromSlate(latestSlate) : null;
    const trainingFocus = currentTraining || fallbackTraining;
    const selectedGuideCandidate = typeof this.game.getSelectedObservatoryExpeditionGuide === 'function' ? this.game.getSelectedObservatoryExpeditionGuide({
      silentSync: true
    }) : null;
    const selectedGuide = selectedGuideCandidate && !selectedGuideCandidate.isFallback ? selectedGuideCandidate : null;
    const trainingTags = Array.from(new Set([...(Array.isArray(trainingFocus?.trainingTags) ? trainingFocus.trainingTags : []), ...(Array.isArray(selectedGuide?.trainingTags) ? selectedGuide.trainingTags : []), ...(Array.isArray(latestSlate?.tags) ? latestSlate.tags.map(entry => String(entry || '').trim()).filter(entry => /^训练·/.test(entry)).map(entry => entry.replace(/^训练·/, '')) : [])].map(entry => String(entry || '').trim()).filter(Boolean))).slice(0, 4);
    const goalHighlights = Array.isArray(trainingFocus?.goalHighlights) && trainingFocus.goalHighlights.length > 0 ? trainingFocus.goalHighlights.map(entry => String(entry || '').trim()).filter(Boolean).slice(0, 3) : Array.isArray(latestSlate?.answerReview?.goalHighlights) ? latestSlate.answerReview.goalHighlights.map(entry => String(entry || '').trim()).filter(Boolean).slice(0, 3) : [];
    const routeFocusLine = String(trainingFocus?.routeFocusLine || latestSlate?.practiceTopic?.routeFocusLine || latestSlate?.practiceTopic?.routeHint || latestSlate?.observatoryLink?.routeFocusLine || selectedGuide?.routeFocusLine || '').trim();
    const compareHint = String(trainingFocus?.compareHint || latestSlate?.practiceTopic?.compareHint || latestSlate?.observatoryLink?.compareHint || selectedGuide?.compareHint || '').trim();
    const trainingAdvice = String(trainingFocus?.trainingAdvice || latestSlate?.answerReview?.trainingAdvice || selectedGuide?.coachBrief || selectedGuide?.drillObjective || '').trim();
    const routeNodeTypes = this.inferSanctumAgendaNodeTypes([routeFocusLine, compareHint, trainingAdvice, goalHighlights, Array.isArray(selectedGuide?.preferredNodes) ? selectedGuide.preferredNodes : []], trainingFocus?.themeKey || latestSlate?.themeKey || selectedGuide?.themeKey || '');
    const sourceReady = !!(trainingAdvice || routeFocusLine || latestSlate || selectedGuide);
    return {
      ready: sourceReady,
      latestSlate,
      trainingFocus,
      selectedGuide,
      sourceRunId: String(trainingFocus?.sourceRunId || latestSlate?.id || '').trim(),
      guideRecordId: String(trainingFocus?.guideRecordId || selectedGuide?.id || '').trim(),
      chapterName: String(trainingFocus?.chapterName || latestSlate?.chapterName || '').trim(),
      sourceTitle: String(trainingFocus?.sourceTitle || latestSlate?.practiceTopic?.sourceTitle || latestSlate?.observatoryLink?.sourceTitle || selectedGuide?.title || '').trim(),
      themeKey: String(trainingFocus?.themeKey || latestSlate?.themeKey || selectedGuide?.themeKey || '').trim(),
      themeLabel: String(trainingFocus?.themeLabel || latestSlate?.themeLabel || latestSlate?.observatoryLink?.sourceThemeLabel || selectedGuide?.themeLabel || '').trim(),
      ratingLabel: String(trainingFocus?.ratingLabel || latestSlate?.ratingLabel || latestSlate?.answerReview?.ratingLabel || '').trim(),
      ratingTone: String(trainingFocus?.ratingTone || latestSlate?.ratingTone || latestSlate?.answerReview?.ratingTone || 'selected').trim() || 'selected',
      trainingAdvice,
      highlightLine: String(trainingFocus?.highlightLine || latestSlate?.answerReview?.highlightLine || latestSlate?.answerReview?.overviewLine || selectedGuide?.expeditionNote || '').trim(),
      routeFocusLine,
      compareHint,
      trainingTags,
      goalHighlights,
      preferredNodes: Array.isArray(selectedGuide?.preferredNodes) ? selectedGuide.preferredNodes.slice(0, 4) : [],
      routeNodeTypes
    };
  }
  buildSanctumAgendaCatalog() {
    const source = this.getSanctumAgendaSourceSnapshot();
    const themeLabel = source.themeLabel || '主练样本';
    const sourceTitle = source.sourceTitle || source.chapterName || '当前归卷';
    const sourceLine = [source.chapterName, sourceTitle || themeLabel].filter(Boolean).join(' · ') || '先完成一章远征，再用归卷答卷立项。';
    const routeNodeTypes = this.normalizeSanctumAgendaNodeTypes([source.preferredNodes, source.routeNodeTypes], 4);
    const supportNodes = routeNodeTypes.filter(type => ['observatory', 'event', 'rest', 'spirit_grotto', 'shop', 'memory_rift'].includes(type));
    const pressureNodes = routeNodeTypes.filter(type => ['enemy', 'elite', 'trial', 'forbidden_altar', 'memory_rift', 'forge'].includes(type));
    const archiveNodes = routeNodeTypes.filter(type => ['observatory', 'memory_rift', 'spirit_grotto', 'event', 'shop'].includes(type));
    const buildRecord = (payload = {}) => this.normalizeSanctumAgendaRecord({
      ...payload,
      sourceRunId: source.sourceRunId,
      guideRecordId: source.guideRecordId,
      chapterName: source.chapterName,
      sourceTitle,
      sourceLine,
      themeKey: source.themeKey,
      themeLabel,
      ratingLabel: source.ratingLabel,
      ratingTone: source.ratingTone,
      trainingAdvice: source.trainingAdvice,
      highlightLine: source.highlightLine,
      routeFocusLine: source.routeFocusLine,
      compareHint: source.compareHint,
      trainingTags: source.trainingTags,
      goalHighlights: source.goalHighlights
    });
    return {
      steady_line: buildRecord({
        agendaId: 'steady_line',
        icon: '🧭',
        name: '稳线研究',
        focusNodeTypes: this.normalizeSanctumAgendaNodeTypes([supportNodes, ['observatory', 'event', 'rest']], 4),
        progress: 0,
        target: 3,
        cost: {
          insight: 3,
          karma: 0
        },
        weightShift: {
          observatory: 0.024,
          event: 0.018,
          rest: 0.01,
          enemy: -0.012,
          forbidden_altar: -0.01
        },
        rewardTrackId: 'observatory',
        reward: {
          insight: 1,
          ringExp: 10
        },
        successLine: `本章命中 3 次关键节点，并把【${themeLabel}】答卷维持在贴题以上。`,
        failureLine: '若路线偏题或关键节点不足，本轮只会留下研究札记，无法沉淀成稳定工程。',
        rewardLine: '成功后推进 1 次观星工程，并回收少量天机与命环经验。',
        minCompletedGoals: 2,
        allowDeviation: false,
        acceptedTones: ['completed', 'selected'],
        decisionThreshold: 1,
        contractThreshold: 2,
        decisionOptions: [{
          id: 'seal_outline',
          label: '保底成卷',
          tagLabel: '保底',
          summaryLine: '先把路线收稳，降低本章的结题门槛，但额外研究回报会更保守。',
          statusLine: '保底成卷：答卷只需完成 1 条目标即可结案，适合先把主线写稳。',
          weightShift: {
            rest: 0.012,
            event: 0.008,
            enemy: -0.006
          },
          rewardDelta: {
            ringExp: -4
          },
          minCompletedGoalsDelta: -1,
          acceptedTonesAdd: ['suggested'],
          successLine: `本章命中 3 次关键节点，并至少完成 1 条目标，即可按【保底成卷】方案结题。`,
          failureLine: '若关键节点不足或路线偏题，保底方案也只能留下稳线札记。'
        }, {
          id: 'double_commit',
          label: '加倍投入',
          tagLabel: '激进',
          summaryLine: '继续把路线锁得更死，追加关键节点与答卷要求，换更高的章末研究回报。',
          statusLine: '加倍投入：关键节点需求 +1、答卷目标 +1，成功后会拿到更高的稳线收益。',
          weightShift: {
            observatory: 0.012,
            event: 0.012,
            rest: -0.004
          },
          rewardDelta: {
            insight: 1,
            ringExp: 6
          },
          targetDelta: 1,
          minCompletedGoalsDelta: 1,
          successLine: `本章命中 4 次关键节点，并完成至少 3 条目标，才能把【加倍投入】研究结成工程。`,
          failureLine: '若加倍投入后关键节点或答卷目标不足，本轮不会折现额外研究回报。'
        }],
        contractOptions: [{
          id: 'starlock_trace',
          label: '星镜锁线',
          tagLabel: '同轴',
          summaryLine: '继续沿观星与事件轴取样，把这轮稳线研究压成一条更完整的同轴锁线。',
          statusLine: '星镜锁线：再补 2 次观星 / 事件样本，且答卷保持不偏题，即可兑换额外天机与命环经验。',
          nodeTypes: ['observatory', 'event'],
          target: 2,
          minCompletedGoals: 2,
          requireNoDeviation: true,
          acceptedTones: ['selected', 'completed'],
          weightShift: {
            observatory: 0.01,
            event: 0.01,
            rest: -0.004
          },
          signCost: {
            insight: 1,
            karma: 0
          },
          burdenLine: '立契后会追加 1 点天机契押，路线也会继续压向观星 / 事件，修整窗口更少。',
          bonusReward: {
            insight: 1,
            ringExp: 6
          },
          bonusLine: '契约兑现后，额外回收少量天机与命环经验。',
          successLine: '锁线契约「星镜锁线」兑现：同轴观测已被写成完整路线，额外研究奖赏已入账。',
          failureLine: '锁线契约「星镜锁线」未兑现：观星与事件样本还不够连成一条稳定锁线。'
        }, {
          id: 'rest_anchor',
          label: '安流定锚',
          tagLabel: '定锚',
          summaryLine: '在保住主线的前提下，把修整与灵契样本也钉进路线，换一份更稳的补偿。',
          statusLine: '安流定锚：补 2 次休整 / 灵契 / 观星样本，并至少完成 1 条目标，即可拿到稳态契约奖赏。',
          nodeTypes: ['rest', 'spirit_grotto', 'observatory'],
          target: 2,
          minCompletedGoals: 1,
          requireNoDeviation: false,
          acceptedTones: ['suggested', 'selected', 'completed'],
          weightShift: {
            rest: 0.012,
            spirit_grotto: 0.01,
            enemy: -0.006
          },
          signCost: {
            insight: 0,
            karma: 1
          },
          burdenLine: '立契后会追加 1 点业果契押，为保住定锚，后续样本会更偏修整 / 灵契，爆发窗口更慢。',
          bonusReward: {
            insight: 1,
            karma: 1,
            ringExp: 2
          },
          bonusLine: '契约兑现后，会返还少量天机、业果与命环经验。',
          successLine: '锁线契约「安流定锚」兑现：稳线样本已被固定住，洞府额外返还了保底奖赏。',
          failureLine: '锁线契约「安流定锚」未兑现：修整样本还不足以把这条保底支线钉牢。'
        }, {
          id: 'rift_margin',
          label: '裂隙借谱',
          tagLabel: '借谱',
          summaryLine: '把一段裂隙旁证也借入稳线主轴，争取更厚的稳线收益，但签约时要先垫一笔双资源契押。',
          statusLine: '裂隙借谱：补 2 次裂隙 / 观星 / 事件样本，并至少完成 2 条目标，即可兑现更高的稳线 bonus。',
          nodeTypes: ['memory_rift', 'observatory', 'event'],
          target: 2,
          minCompletedGoals: 2,
          requireNoDeviation: false,
          acceptedTones: ['selected', 'completed'],
          weightShift: {
            memory_rift: 0.014,
            observatory: 0.008,
            event: 0.008,
            rest: -0.006
          },
          signCost: {
            insight: 1,
            karma: 1
          },
          burdenLine: '立契后会立即垫付 1 点天机与 1 点业果，后续路线也会更偏裂隙 / 观星，容错更紧。',
          bonusReward: {
            insight: 2,
            karma: 1,
            ringExp: 6
          },
          bonusLine: '契约兑现后，会把借来的旁证一并压成稳线追加收益。',
          successLine: '锁线契约「裂隙借谱」兑现：裂隙旁证已被并入主轴，额外稳线收益已被洞府收拢。',
          failureLine: '锁线契约「裂隙借谱」未兑现：借来的旁证还没并成稳定路线，那笔追加收益没能落袋。'
        }],
        summaryLine: source.trainingAdvice || `围绕【${themeLabel}】把路线继续写稳，优先命中情报与修整节点。`
      }),
      pressure_line: buildRecord({
        agendaId: 'pressure_line',
        icon: '🩸',
        name: '高压研究',
        focusNodeTypes: this.normalizeSanctumAgendaNodeTypes([pressureNodes, ['elite', 'trial', 'forbidden_altar', 'memory_rift']], 4),
        progress: 0,
        target: 3,
        cost: {
          insight: 0,
          karma: 3
        },
        weightShift: {
          elite: 0.018,
          trial: 0.022,
          forbidden_altar: 0.02,
          memory_rift: 0.014,
          rest: -0.016,
          shop: -0.008
        },
        rewardTrackId: 'forbidden_altar',
        reward: {
          karma: 1,
          ringExp: 12
        },
        successLine: '本章命中 3 次高压节点，并至少完成 1 条答卷目标。',
        failureLine: '若中途折损或高压段没有写进答卷，这轮研究就只会留下偏题代价。',
        rewardLine: '成功后推进 1 次禁术工程，并沉淀少量业果与命环经验。',
        minCompletedGoals: 1,
        allowDeviation: true,
        acceptedTones: ['completed', 'selected'],
        decisionThreshold: 1,
        contractThreshold: 2,
        decisionOptions: [{
          id: 'safety_anchor',
          label: '先锁安全垫',
          tagLabel: '稳住',
          summaryLine: '先把高压段的容错垫起来，降低评分压力，但回报会更轻。',
          statusLine: '先锁安全垫：评分允许降到贴题边缘，路线也会稍微回到休整与补给。',
          weightShift: {
            rest: 0.014,
            shop: 0.008,
            elite: -0.006
          },
          rewardDelta: {
            ringExp: -4
          },
          acceptedTonesAdd: ['suggested'],
          successLine: '本章命中 3 次高压节点，并至少完成 1 条答卷目标，即可按安全垫方案结题。',
          failureLine: '若高压节点仍旧不足，这轮安全垫只会换回较轻的观察留痕。'
        }, {
          id: 'raise_pressure',
          label: '继续抬压',
          tagLabel: '冲顶',
          summaryLine: '继续把章节推向精英、试炼与禁术段，换更高的高压研究收益。',
          statusLine: '继续抬压：关键节点需求 +1、答卷目标 +1，成功后会追加业果与命环经验。',
          weightShift: {
            trial: 0.014,
            forbidden_altar: 0.014,
            memory_rift: 0.01,
            rest: -0.006
          },
          rewardDelta: {
            karma: 1,
            ringExp: 6
          },
          targetDelta: 1,
          minCompletedGoalsDelta: 1,
          successLine: '本章命中 4 次高压节点，并至少完成 2 条答卷目标，才能兑现继续抬压的研究回报。',
          failureLine: '若继续抬压后章节折损或高压段没有写成卷，本轮不会回收那部分额外收益。'
        }],
        contractOptions: [{
          id: 'blood_oath',
          label: '血线追猎',
          tagLabel: '追猎',
          summaryLine: '继续把高压样本压进精英与禁术段，换更狠的一笔契约奖赏。',
          statusLine: '血线追猎：再补 2 次精英 / 试炼 / 禁术样本，并至少完成 2 条目标，即可兑现额外业果与命环经验。',
          nodeTypes: ['elite', 'trial', 'forbidden_altar'],
          target: 2,
          minCompletedGoals: 2,
          requireNoDeviation: false,
          acceptedTones: ['selected', 'completed'],
          weightShift: {
            elite: 0.01,
            trial: 0.012,
            forbidden_altar: 0.012,
            rest: -0.006
          },
          signCost: {
            insight: 0,
            karma: 1
          },
          burdenLine: '立契后会追加 1 点业果契押，后续精英 / 禁术偏置会更重，章节容错更低。',
          bonusReward: {
            karma: 1,
            ringExp: 8
          },
          bonusLine: '契约兑现后，会额外沉淀业果与命环经验。',
          successLine: '锁线契约「血线追猎」兑现：高压样本被压成了可复用的冲顶模板。',
          failureLine: '锁线契约「血线追猎」未兑现：高压样本还不够密，没能撑起那部分追加收益。'
        }, {
          id: 'scar_control',
          label: '无伤校压',
          tagLabel: '校压',
          summaryLine: '在高压推进里仍旧校住偏题风险，证明这条危险路线可以被稳定驾驭。',
          statusLine: '无伤校压：补 2 次精英 / 裂隙 / 休整样本，且答卷保持不偏题，即可换额外天机与命环经验。',
          nodeTypes: ['elite', 'memory_rift', 'rest'],
          target: 2,
          minCompletedGoals: 1,
          requireNoDeviation: true,
          acceptedTones: ['completed'],
          weightShift: {
            memory_rift: 0.012,
            rest: 0.008,
            elite: 0.008
          },
          signCost: {
            insight: 1,
            karma: 0
          },
          burdenLine: '立契后会追加 1 点天机契押，为了校压成功，必须把高压段稳稳拉回主轴。',
          bonusReward: {
            insight: 1,
            ringExp: 6
          },
          bonusLine: '契约兑现后，会返还少量天机并追加命环经验。',
          successLine: '锁线契约「无伤校压」兑现：高压路线已经被校成可重复执行的模板。',
          failureLine: '锁线契约「无伤校压」未兑现：高压段虽过关，但还没有稳到能吃满那份契约奖赏。'
        }, {
          id: 'rift_gamble',
          label: '裂压赌注',
          tagLabel: '豪赌',
          summaryLine: '把裂隙和禁术一起压成高压赌注，换更高的业果与命环收益，但契押也更重。',
          statusLine: '裂压赌注：补 2 次禁术 / 裂隙 / 试炼样本，并至少完成 2 条目标，即可兑现一笔高波动契约收益。',
          nodeTypes: ['forbidden_altar', 'memory_rift', 'trial'],
          target: 2,
          minCompletedGoals: 2,
          requireNoDeviation: false,
          acceptedTones: ['selected', 'completed'],
          weightShift: {
            forbidden_altar: 0.014,
            memory_rift: 0.014,
            trial: 0.01,
            rest: -0.008,
            shop: -0.006
          },
          signCost: {
            insight: 1,
            karma: 1
          },
          burdenLine: '立契后会立即垫付 1 点天机与 1 点业果，后续路线更少给休整与商路缓冲。',
          bonusReward: {
            insight: 1,
            karma: 2,
            ringExp: 10
          },
          bonusLine: '契约兑现后，会把这次豪赌追加折成更高的高压研究收益。',
          successLine: '锁线契约「裂压赌注」兑现：高压样本已被压成一笔高波动的冲顶收益。',
          failureLine: '锁线契约「裂压赌注」未兑现：高压段虽然写出了痕迹，但还没顶到那笔豪赌回报。'
        }],
        summaryLine: source.highlightLine || `把【${themeLabel}】里的高压处理拆开研究，优先去精英、试炼与禁术节点做验证。`
      }),
      archive_line: buildRecord({
        agendaId: 'archive_line',
        icon: '🪞',
        name: '归卷研究',
        focusNodeTypes: this.normalizeSanctumAgendaNodeTypes([archiveNodes, ['observatory', 'memory_rift', 'spirit_grotto']], 4),
        progress: 0,
        target: 2,
        cost: {
          insight: 2,
          karma: 1
        },
        weightShift: {
          observatory: 0.016,
          memory_rift: 0.018,
          spirit_grotto: 0.014,
          event: 0.01,
          enemy: -0.012
        },
        rewardTrackId: 'memory_rift',
        reward: {
          insight: 1,
          ringExp: 8
        },
        successLine: '本章命中 2 次归卷相关节点，并把至少 2 条作答目标写入答卷。',
        failureLine: '若归卷素材不足，洞府只能记下观察线索，无法把这轮推成结构奖励。',
        rewardLine: '成功后推进 1 次裂隙工程，并回收少量天机与命环经验。',
        minCompletedGoals: 2,
        allowDeviation: false,
        acceptedTones: ['completed', 'selected'],
        decisionThreshold: 1,
        contractThreshold: 2,
        decisionOptions: [{
          id: 'capture_excerpt',
          label: '先截取样本',
          tagLabel: '截样',
          summaryLine: '先把本章最有价值的一段素材保住，降低归卷门槛，但完整收益会更保守。',
          statusLine: '先截取样本：答卷只需完成 1 条目标即可结案，适合先保住可复盘的一段样本。',
          weightShift: {
            observatory: 0.01,
            event: 0.01,
            memory_rift: -0.004
          },
          rewardDelta: {
            ringExp: -2
          },
          minCompletedGoalsDelta: -1,
          acceptedTonesAdd: ['suggested'],
          successLine: '本章命中 2 次归卷节点，并至少完成 1 条作答目标，即可按截样方案结题。',
          failureLine: '若归卷素材仍旧不足，这轮截样也只能留下轻量札记。'
        }, {
          id: 'complete_volume',
          label: '追完整答卷',
          tagLabel: '全卷',
          summaryLine: '继续追更完整的归卷答卷，追加关键节点和目标要求，换更高的档案收益。',
          statusLine: '追完整答卷：关键节点需求 +1、答卷目标 +1，成功后会追加天机与命环经验。',
          weightShift: {
            memory_rift: 0.014,
            spirit_grotto: 0.012,
            event: -0.004
          },
          rewardDelta: {
            insight: 1,
            ringExp: 6
          },
          targetDelta: 1,
          minCompletedGoalsDelta: 1,
          successLine: '本章命中 3 次归卷节点，并至少完成 3 条作答目标，才能把完整答卷压进档案室。',
          failureLine: '若追完整答卷后目标或节点不足，本轮不会折现那部分追加档案收益。'
        }],
        contractOptions: [{
          id: 'mirror_excerpt_lock',
          label: '镜段封样',
          tagLabel: '封样',
          summaryLine: '继续把裂隙与观星样本封成连续镜段，为归卷追加一笔高质量档案奖励。',
          statusLine: '镜段封样：再补 2 次裂隙 / 观星样本，且答卷保持不偏题，即可追加天机与命环经验。',
          nodeTypes: ['memory_rift', 'observatory'],
          target: 2,
          minCompletedGoals: 2,
          requireNoDeviation: true,
          acceptedTones: ['selected', 'completed'],
          weightShift: {
            memory_rift: 0.014,
            observatory: 0.01,
            event: -0.004
          },
          signCost: {
            insight: 1,
            karma: 0
          },
          burdenLine: '立契后会追加 1 点天机契押，为保镜段完整，偏题与旁线余地都会更少。',
          bonusReward: {
            insight: 1,
            ringExp: 5
          },
          bonusLine: '契约兑现后，会把额外档案收益折成天机与命环经验。',
          successLine: '锁线契约「镜段封样」兑现：裂隙样本已被压成连续可复刻的镜段档案。',
          failureLine: '锁线契约「镜段封样」未兑现：镜段样本还不够完整，没能换出那笔追加档案收益。'
        }, {
          id: 'spirit_volume_sync',
          label: '灵契合卷',
          tagLabel: '合卷',
          summaryLine: '把灵契与事件线也压进归卷主轴，争取一份更完整的章节合卷奖励。',
          statusLine: '灵契合卷：补 2 次灵契 / 事件 / 观星样本，并完成至少 3 条目标，即可兑现额外天机、业果与命环经验。',
          nodeTypes: ['spirit_grotto', 'event', 'observatory'],
          target: 2,
          minCompletedGoals: 3,
          requireNoDeviation: false,
          acceptedTones: ['completed'],
          weightShift: {
            spirit_grotto: 0.014,
            event: 0.012,
            observatory: 0.008
          },
          signCost: {
            insight: 0,
            karma: 1
          },
          burdenLine: '立契后会追加 1 点业果契押，为了补全合卷，灵契与事件线要吃更多注意力。',
          bonusReward: {
            insight: 1,
            karma: 1,
            ringExp: 6
          },
          bonusLine: '契约兑现后，会追加一份灵契合卷的局外回收。',
          successLine: '锁线契约「灵契合卷」兑现：章节答卷已被压成更完整的一次归卷合卷。',
          failureLine: '锁线契约「灵契合卷」未兑现：归卷虽然完成，但还没完整吃满灵契支线的追加回报。'
        }, {
          id: 'echo_annotation',
          label: '旁注索隐',
          tagLabel: '索隐',
          summaryLine: '把事件旁注也并入归卷档案，争取更厚的章节回报，但签约要先垫一笔契押。',
          statusLine: '旁注索隐：补 2 次事件 / 裂隙 / 灵契样本，并至少完成 2 条目标，即可兑现追加的归卷 bonus。',
          nodeTypes: ['event', 'memory_rift', 'spirit_grotto'],
          target: 2,
          minCompletedGoals: 2,
          requireNoDeviation: false,
          acceptedTones: ['selected', 'completed'],
          weightShift: {
            event: 0.012,
            memory_rift: 0.01,
            spirit_grotto: 0.01,
            enemy: -0.006
          },
          signCost: {
            insight: 1,
            karma: 1
          },
          burdenLine: '立契后会立即垫付 1 点天机与 1 点业果，后续样本会更偏旁注 / 裂隙，主线收束节奏更紧。',
          bonusReward: {
            insight: 1,
            karma: 1,
            ringExp: 7
          },
          bonusLine: '契约兑现后，会把并入的旁注一起折成更厚的归卷收益。',
          successLine: '锁线契约「旁注索隐」兑现：旁注样本已被并入主卷，额外归卷收益已被档案室接收。',
          failureLine: '锁线契约「旁注索隐」未兑现：旁注虽然补进来了，但还没形成可结案的完整归卷。'
        }],
        summaryLine: source.compareHint || `把【${themeLabel}】的样本与归卷档案重新压成研究线，优先看观星、裂隙与灵契节点。`
      })
    };
  }
  getSanctumAgendaDashboard() {
    const state = this.ensureSanctumAgendaState();
    const source = this.getSanctumAgendaSourceSnapshot();
    const catalog = this.buildSanctumAgendaCatalog();
    const active = state.activeAgenda && state.activeAgenda.agendaId ? state.activeAgenda : null;
    const lastResolved = state.lastResolved && state.lastResolved.agendaId ? state.lastResolved : null;
    const candidates = Object.values(catalog).map(entry => {
      const affordableInsight = this.game.getStrategicCurrencyAmount('insight') >= Math.max(0, entry.cost?.insight || 0);
      const affordableKarma = this.game.getStrategicCurrencyAmount('karma') >= Math.max(0, entry.cost?.karma || 0);
      const affordable = affordableInsight && affordableKarma;
      const activeMatch = !!active && active.agendaId === entry.agendaId;
      const missing = [];
      if (!affordableInsight && (entry.cost?.insight || 0) > 0) {
        missing.push(`天机 ${Math.max(0, entry.cost.insight - this.game.getStrategicCurrencyAmount('insight'))}`);
      }
      if (!affordableKarma && (entry.cost?.karma || 0) > 0) {
        missing.push(`业果 ${Math.max(0, entry.cost.karma - this.game.getStrategicCurrencyAmount('karma'))}`);
      }
      return {
        ...entry,
        sourceReady: !!source.ready,
        affordable,
        active: activeMatch,
        disabled: active ? !activeMatch : !source.ready || !affordable,
        toneClass: activeMatch ? 'ready' : 'tracking',
        statusLine: activeMatch ? `进行中 · ${active.progress}/${active.target}` : !source.ready ? '待归卷提供研究题面' : affordable ? `立项代价 · ${entry.costLine}` : `资源不足 · 还缺 ${missing.join(' / ')}`,
        buttonLabel: activeMatch ? '当前议程' : active ? '已有本轮议程' : !source.ready ? '先写成一份归卷' : affordable ? '立为本轮议程' : '资源不足',
        sourceLine: entry.sourceLine || sourceLine
      };
    }).sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.affordable !== b.affordable) return a.affordable ? -1 : 1;
      return String(a.agendaId || '').localeCompare(String(b.agendaId || ''));
    });
    return {
      source,
      active,
      lastResolved,
      candidates,
      completedCount: Math.max(0, Math.floor(Number(state.totalCompleted) || 0)),
      failedCount: Math.max(0, Math.floor(Number(state.totalFailed) || 0)),
      history: Array.isArray(state.history) ? state.history.slice() : []
    };
  }
  activateSanctumAgenda(agendaId = '') {
    const safeId = String(agendaId || '').trim();
    if (!safeId) return null;
    const state = this.ensureSanctumAgendaState();
    if (state.activeAgenda && state.activeAgenda.agendaId) {
      if (state.activeAgenda.agendaId === safeId) return state.activeAgenda;
      if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(`当前已有【${state.activeAgenda.name}】进行中，需先结题才能改立其他议程。`);
      }
      return null;
    }
    const catalog = this.buildSanctumAgendaCatalog();
    const entry = catalog[safeId];
    if (!entry) return null;
    const source = this.getSanctumAgendaSourceSnapshot();
    if (!source.ready) {
      if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog('先完成一章裂界远征并写成归卷答卷，洞府才会给出可立项的议程。');
      }
      return null;
    }
    const insightCost = Math.max(0, Math.floor(Number(entry.cost?.insight) || 0));
    const karmaCost = Math.max(0, Math.floor(Number(entry.cost?.karma) || 0));
    if (this.game.getStrategicCurrencyAmount('insight') < insightCost || this.game.getStrategicCurrencyAmount('karma') < karmaCost) {
      if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(`资源不足，无法立【${entry.name}】。需要 ${entry.costLine}。`);
      }
      return null;
    }
    if (insightCost > 0) {
      this.game.player.heavenlyInsight = this.game.getStrategicCurrencyAmount('insight') - insightCost;
    }
    if (karmaCost > 0) {
      this.game.player.karma = this.game.getStrategicCurrencyAmount('karma') - karmaCost;
    }
    const expeditionState = typeof this.game.getExpeditionState === 'function' ? this.game.getExpeditionState() : null;
    const next = this.normalizeSanctumAgendaRecord({
      ...entry,
      progress: 0,
      matchedNodeIds: [],
      hitHistory: [],
      boundChapterIndex: Math.max(0, Math.floor(Number(expeditionState?.chapterIndex || ((typeof this.game.getLatestRunSlate === 'function' ? this.game.getLatestRunSlate()?.chapterIndex : 0) || 0) + 1) || 0)),
      boundChapterName: String(expeditionState?.chapterFullName || expeditionState?.chapterName || '').trim(),
      selectedAt: Date.now(),
      updatedAt: Date.now(),
      outcome: 'active',
      outcomeTone: 'tracking',
      summaryLine: entry.trainingAdvice || entry.highlightLine || entry.summaryLine
    });
    state.activeAgenda = next;
    if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`洞府已立【${next.name}】${next.costLine ? `（${next.costLine}）` : ''}：${next.focusNodeLine}`);
    }
    if (this.game.currentScreen === 'collection' && this.game.getCollectionHubState?.().section === 'sanctum') {
      this.game.initCollection();
    }
    this.game.autoSave?.();
    return next;
  }
  applySanctumAgendaDecisionChoice(activeAgenda = null, decisionOption = null) {
    const agenda = activeAgenda && typeof activeAgenda === 'object' ? activeAgenda : null;
    const option = decisionOption && typeof decisionOption === 'object' ? decisionOption : null;
    if (!agenda || !option || !agenda.agendaId || !option.id) return null;
    agenda.weightShift = this.mergeSanctumAgendaWeightShifts(agenda.weightShift, option.weightShift);
    agenda.reward = {
      insight: Math.max(0, Math.floor(Number(agenda.reward?.insight) || 0) + Math.floor(Number(option.rewardDelta?.insight) || 0)),
      karma: Math.max(0, Math.floor(Number(agenda.reward?.karma) || 0) + Math.floor(Number(option.rewardDelta?.karma) || 0)),
      ringExp: Math.max(0, Math.floor(Number(agenda.reward?.ringExp) || 0) + Math.floor(Number(option.rewardDelta?.ringExp) || 0))
    };
    agenda.target = Math.max(1, Math.floor(Number(agenda.target) || 1) + Math.floor(Number(option.targetDelta) || 0));
    agenda.progress = Math.min(agenda.target, Math.max(0, Math.floor(Number(agenda.progress) || 0)));
    agenda.minCompletedGoals = Math.max(0, Math.floor(Number(agenda.minCompletedGoals) || 0) + Math.floor(Number(option.minCompletedGoalsDelta) || 0));
    agenda.acceptedTones = Array.from(new Set([...(Array.isArray(agenda.acceptedTones) ? agenda.acceptedTones : []), ...(Array.isArray(option.acceptedTonesAdd) ? option.acceptedTonesAdd : [])])).filter(Boolean).slice(0, 4);
    if (typeof option.allowDeviation === 'boolean') {
      agenda.allowDeviation = option.allowDeviation;
    }
    if (option.successLine) {
      agenda.successLine = option.successLine;
    }
    if (option.failureLine) {
      agenda.failureLine = option.failureLine;
    }
    agenda.selectedDecisionId = option.id;
    agenda.selectedDecisionLabel = option.label || '';
    agenda.selectedDecisionLine = option.statusLine || option.summaryLine || '';
    agenda.decisionState = 'selected';
    agenda.updatedAt = Date.now();
    Object.assign(agenda, this.normalizeSanctumAgendaRecord(agenda));
    return agenda;
  }
  chooseSanctumAgendaDecision(optionId = '') {
    const safeId = String(optionId || '').trim();
    if (!safeId) return null;
    const state = this.ensureSanctumAgendaState();
    const activeAgenda = state.activeAgenda && state.activeAgenda.agendaId ? state.activeAgenda : null;
    if (!activeAgenda || activeAgenda.outcome !== 'active') return null;
    const option = Array.isArray(activeAgenda.decisionOptions) ? activeAgenda.decisionOptions.find(entry => entry.id === safeId) : null;
    if (!option) return null;
    if (activeAgenda.selectedDecisionId) {
      if (activeAgenda.selectedDecisionId === safeId) return activeAgenda;
      if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(`【${activeAgenda.name}】本章处置已锁定为「${activeAgenda.selectedDecisionLabel || activeAgenda.selectedDecisionId}」，不能改选。`);
      }
      return null;
    }
    this.applySanctumAgendaDecisionChoice(activeAgenda, option);
    if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`【${activeAgenda.name}】采用处置「${option.label}」：${option.statusLine || option.summaryLine || '本章研究条件已更新。'}`);
      if (activeAgenda.contractState === 'pending') {
        Utils.showBattleLog(`【${activeAgenda.name}】锁线契约已解锁：${activeAgenda.contractPromptLine || '可回洞府为本章追加一条 bonus 契约。'}`);
      }
    }
    if (this.game.currentScreen === 'collection' && this.game.getCollectionHubState?.().section === 'sanctum') {
      this.game.initCollection();
    }
    this.game.autoSave?.();
    return activeAgenda;
  }
  applySanctumAgendaContractChoice(activeAgenda = null, contractOption = null) {
    const agenda = activeAgenda && typeof activeAgenda === 'object' ? activeAgenda : null;
    const option = contractOption && typeof contractOption === 'object' ? contractOption : null;
    if (!agenda || !option || !agenda.agendaId || !option.id) return null;
    const contractNodeTypes = this.normalizeSanctumAgendaNodeTypes(option.nodeTypes, 3);
    const matchedContractIds = Array.isArray(agenda.hitHistory) ? Array.from(new Set(agenda.hitHistory.filter(entry => contractNodeTypes.includes(String(entry?.nodeType || '').trim())).map(entry => String(entry?.nodeId || '').trim()).filter(Boolean))).slice(-12) : [];
    const signCost = {
      insight: Math.max(0, Math.floor(Number(option?.signCost?.insight) || 0)),
      karma: Math.max(0, Math.floor(Number(option?.signCost?.karma) || 0))
    };
    const signCostLine = option.signCostLine || this.formatSanctumAgendaCurrencyLine(signCost, '');
    agenda.weightShift = this.mergeSanctumAgendaWeightShifts(agenda.weightShift, option.weightShift);
    agenda.selectedContractId = option.id;
    agenda.selectedContractLabel = option.label || '';
    agenda.selectedContractLine = [option.statusLine || option.summaryLine || '', signCostLine ? `契押 ${signCostLine}` : '', option.burdenLine || ''].filter(Boolean).join(' · ');
    agenda.contractSignCost = signCost;
    agenda.contractSignCostLine = signCostLine;
    agenda.contractBurdenLine = option.burdenLine || '';
    agenda.selectedContractAt = Date.now();
    agenda.contractState = 'selected';
    agenda.contractNodeTypes = contractNodeTypes;
    agenda.contractTarget = Math.max(1, Math.floor(Number(option.target) || 1));
    agenda.contractMatchedNodeIds = matchedContractIds;
    agenda.contractProgress = Math.min(agenda.contractTarget, matchedContractIds.length);
    agenda.contractMinCompletedGoals = Math.max(0, Math.floor(Number(option.minCompletedGoals) || 0));
    agenda.contractRequireNoDeviation = !!option.requireNoDeviation;
    agenda.contractAcceptedTones = Array.isArray(option.acceptedTones) ? Array.from(new Set(option.acceptedTones.map(entry => String(entry || '').trim()).filter(Boolean))).slice(0, 4) : [];
    agenda.contractBonusReward = {
      insight: Math.max(0, Math.floor(Number(option?.bonusReward?.insight) || 0)),
      karma: Math.max(0, Math.floor(Number(option?.bonusReward?.karma) || 0)),
      ringExp: Math.max(0, Math.floor(Number(option?.bonusReward?.ringExp) || 0))
    };
    agenda.contractBonusLine = option.bonusLine || '';
    agenda.contractSuccessLine = option.successLine || '';
    agenda.contractFailureLine = option.failureLine || '';
    agenda.contractResolved = false;
    agenda.contractSuccess = false;
    agenda.contractResolutionLine = '';
    agenda.updatedAt = Date.now();
    Object.assign(agenda, this.normalizeSanctumAgendaRecord(agenda));
    return agenda;
  }
  chooseSanctumAgendaContract(optionId = '') {
    const safeId = String(optionId || '').trim();
    if (!safeId) return null;
    const state = this.ensureSanctumAgendaState();
    const activeAgenda = state.activeAgenda && state.activeAgenda.agendaId ? state.activeAgenda : null;
    if (!activeAgenda || activeAgenda.outcome !== 'active' || !activeAgenda.selectedDecisionId) return null;
    const option = Array.isArray(activeAgenda.contractOptions) ? activeAgenda.contractOptions.find(entry => entry.id === safeId) : null;
    if (!option) return null;
    if (Math.max(0, Math.floor(Number(activeAgenda.progress) || 0)) < Math.max(1, Math.floor(Number(activeAgenda.contractThreshold) || 2))) {
      return null;
    }
    if (activeAgenda.selectedContractId) {
      if (activeAgenda.selectedContractId === safeId) return activeAgenda;
      if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(`【${activeAgenda.name}】锁线契约已锁定为「${activeAgenda.selectedContractLabel || activeAgenda.selectedContractId}」，不能改签。`);
      }
      return null;
    }
    const signCost = {
      insight: Math.max(0, Math.floor(Number(option?.signCost?.insight) || 0)),
      karma: Math.max(0, Math.floor(Number(option?.signCost?.karma) || 0))
    };
    const signCostLine = option.signCostLine || this.formatSanctumAgendaCurrencyLine(signCost, '');
    if (this.game.getStrategicCurrencyAmount('insight') < signCost.insight || this.game.getStrategicCurrencyAmount('karma') < signCost.karma) {
      if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(`资源不足，无法为【${activeAgenda.name}】立下「${option.label}」。需要契押 ${signCostLine || '额外资源'}。`);
      }
      return null;
    }
    this.applySanctumAgendaContractChoice(activeAgenda, option);
    if (signCost.insight > 0) {
      this.game.player.heavenlyInsight = this.game.getStrategicCurrencyAmount('insight') - signCost.insight;
    }
    if (signCost.karma > 0) {
      this.game.player.karma = this.game.getStrategicCurrencyAmount('karma') - signCost.karma;
    }
    if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`【${activeAgenda.name}】立下契约「${option.label}」：${option.statusLine || option.summaryLine || '本章已追加 bonus 锁线条件。'}${signCostLine ? `｜契押 ${signCostLine}` : ''}`);
      if (option.burdenLine) {
        Utils.showBattleLog(`【${activeAgenda.name}】契约代价：${option.burdenLine}`);
      }
      if (activeAgenda.contractProgress >= activeAgenda.contractTarget) {
        Utils.showBattleLog(`【${activeAgenda.name}】锁线契约样本已达标：${activeAgenda.selectedContractLabel} · ${activeAgenda.contractProgress}/${activeAgenda.contractTarget}`);
      }
    }
    if (this.game.currentScreen === 'collection' && this.game.getCollectionHubState?.().section === 'sanctum') {
      this.game.initCollection();
    }
    this.game.autoSave?.();
    return activeAgenda;
  }
  getSanctumAgendaWeightShift() {
    const state = this.ensureSanctumAgendaState();
    const active = state.activeAgenda && state.activeAgenda.agendaId ? state.activeAgenda : null;
    if (!active || active.outcome !== 'active') return null;
    return active.weightShift && typeof active.weightShift === 'object' ? {
      ...active.weightShift
    } : null;
  }
  recordSanctumAgendaNodeProgress(nodeType = '', context = {}) {
    const safeNodeType = String(nodeType || '').trim();
    if (!safeNodeType) return null;
    const state = this.ensureSanctumAgendaState();
    const active = state.activeAgenda && state.activeAgenda.agendaId ? state.activeAgenda : null;
    if (!active || active.outcome !== 'active') return null;
    if (!Array.isArray(active.focusNodeTypes) || !active.focusNodeTypes.includes(safeNodeType)) return null;
    const chapterIndex = Math.max(0, Math.floor(Number(context.chapterIndex) || 0));
    if (active.boundChapterIndex > 0 && chapterIndex > 0 && active.boundChapterIndex !== chapterIndex) return null;
    const nodeId = String(context.nodeId || '').trim() || `${safeNodeType}:${Date.now()}`;
    if (Array.isArray(active.matchedNodeIds) && active.matchedNodeIds.includes(nodeId)) return null;
    active.matchedNodeIds = Array.isArray(active.matchedNodeIds) ? active.matchedNodeIds.concat(nodeId).slice(-12) : [nodeId];
    active.progress = Math.min(active.target, Math.max(0, Math.floor(Number(active.progress) || 0)) + 1);
    active.hitHistory = Array.isArray(active.hitHistory) ? active.hitHistory.concat({
      nodeType: safeNodeType,
      nodeId,
      row: Math.max(0, Math.floor(Number(context.row) || 0)),
      realm: Math.max(0, Math.floor(Number(context.realm) || 0)),
      chapterIndex,
      at: Date.now()
    }).slice(-8) : [];
    if (!active.boundChapterIndex && chapterIndex > 0) {
      active.boundChapterIndex = chapterIndex;
    }
    const previousDecisionState = active.decisionState || 'locked';
    const previousContractState = active.contractState || 'locked';
    const previousContractProgress = Math.max(0, Math.floor(Number(active.contractProgress) || 0));
    const previousPhaseLabel = active.phaseLabel || '';
    if (active.selectedContractId && Array.isArray(active.contractNodeTypes) && active.contractNodeTypes.includes(safeNodeType)) {
      if (!Array.isArray(active.contractMatchedNodeIds) || !active.contractMatchedNodeIds.includes(nodeId)) {
        active.contractMatchedNodeIds = Array.isArray(active.contractMatchedNodeIds) ? active.contractMatchedNodeIds.concat(nodeId).slice(-12) : [nodeId];
        active.contractProgress = Math.min(Math.max(1, Math.floor(Number(active.contractTarget) || 1)), Math.max(0, Math.floor(Number(active.contractProgress) || 0)) + 1);
      }
    }
    active.updatedAt = Date.now();
    const summaryName = [active.name, active.selectedDecisionLabel, active.selectedContractLabel].filter(Boolean).join(' · ');
    active.summaryLine = active.selectedContractLabel ? `${summaryName}：关键节点 ${active.progress}/${active.target}，契约样本 ${active.contractProgress}/${active.contractTarget}。` : active.selectedDecisionLabel ? `${summaryName}：已命中 ${active.progress}/${active.target} 次关键节点。` : `${active.name}：已命中 ${active.progress}/${active.target} 次关键节点。`;
    Object.assign(active, this.normalizeSanctumAgendaRecord(active));
    if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
      const meta = this.getSanctumAgendaNodeMeta(safeNodeType);
      Utils.showBattleLog(`【${active.name}】记录 ${meta.icon}${meta.label} · ${active.progress}/${active.target}`);
      if (previousDecisionState !== 'pending' && active.decisionState === 'pending') {
        Utils.showBattleLog(`【${active.name}】进入章中处置：${active.decisionPromptLine || '可回洞府在两条研究处置间二选一。'}`);
      }
      if (previousContractState !== 'pending' && active.contractState === 'pending') {
        Utils.showBattleLog(`【${active.name}】锁线契约已解锁：${active.contractPromptLine || '可回洞府追加一条 bonus 锁线契约。'}`);
      }
      if (active.selectedContractLabel && previousContractProgress < active.contractTarget && active.contractProgress >= active.contractTarget) {
        Utils.showBattleLog(`【${active.name}】锁线契约样本已达标：${active.selectedContractLabel} · ${active.contractProgress}/${active.contractTarget}`);
      }
      if (previousPhaseLabel !== active.phaseLabel && active.phaseLabel === '收束期') {
        Utils.showBattleLog(`【${active.name}】已进入收束期：关键节点达标，章节结算时会核对答卷。`);
      }
      if (active.progress >= active.target) {
        Utils.showBattleLog(`【${active.name}】关键节点已达标，章节结算时会核对答卷是否成卷。`);
      }
    }
    return {
      agendaId: active.agendaId,
      progress: active.progress,
      target: active.target,
      nodeType: safeNodeType,
      reachedTarget: active.progress >= active.target,
      decisionState: active.decisionState || 'locked',
      contractState: active.contractState || 'locked',
      contractProgress: active.contractProgress || 0,
      contractTarget: active.contractTarget || 0,
      phaseLabel: active.phaseLabel || ''
    };
  }
  applySanctumAgendaOutcomeReward(resolution = null) {
    const source = resolution && typeof resolution === 'object' ? resolution : null;
    if (!source || source.outcome !== 'success') return '';
    const details = [];
    if (source.rewardTrackId) {
      const engineering = this.game.recordStrategicNodeEngineering(source.rewardTrackId, {
        realm: this.game.player?.realm || 0,
        nodeId: `agenda_${source.agendaId}_${Date.now()}`
      });
      if (engineering?.after) {
        details.push(`${engineering.after.icon} ${engineering.after.name} 推进 1 次`);
      }
    }
    const currencyGain = this.game.grantStrategicCurrencies(source.reward || {}, '');
    if (currencyGain.insight > 0) details.push(`天机 +${currencyGain.insight}`);
    if (currencyGain.karma > 0) details.push(`业果 +${currencyGain.karma}`);
    const ringExp = this.game.grantFateRingExp(source.reward?.ringExp || 0, '');
    if (ringExp > 0) details.push(`命环经验 +${ringExp}`);
    if (source.contractSuccess) {
      const contractDetails = [];
      const contractCurrencyGain = this.game.grantStrategicCurrencies(source.contractBonusReward || {}, '');
      if (contractCurrencyGain.insight > 0) contractDetails.push(`天机 +${contractCurrencyGain.insight}`);
      if (contractCurrencyGain.karma > 0) contractDetails.push(`业果 +${contractCurrencyGain.karma}`);
      const contractRingExp = this.game.grantFateRingExp(source.contractBonusReward?.ringExp || 0, '');
      if (contractRingExp > 0) contractDetails.push(`命环经验 +${contractRingExp}`);
      if (contractDetails.length > 0) {
        details.push(`契约加奖 ${contractDetails.join('，')}`);
      } else if (source.contractBonusLine) {
        details.push(source.contractBonusLine);
      }
    }
    return details.join('，');
  }
  formatSanctumAgendaRecoveryHint(reasonId = '', agenda = null, context = {}) {
    const active = agenda && typeof agenda === 'object' ? agenda : null;
    if (!active) return '';
    const focusLine = String(active.focusNodeLine || '').replace(/^优先节点[:：]/, '').trim() || '当前样本主轴';
    const progress = Math.max(0, Math.floor(Number(active.progress) || 0));
    const target = Math.max(1, Math.floor(Number(active.target) || 1));
    const completedGoals = Math.max(0, Math.floor(Number(context.completedGoals) || 0));
    const requiredGoals = Math.max(1, Math.floor(Number(active.minCompletedGoals) || 0));
    const remainingNodes = Math.max(1, target - progress);
    const remainingGoals = Math.max(1, requiredGoals - completedGoals);
    switch (String(reasonId || '').trim()) {
      case 'battle_lost':
        return `补卷提示：先稳住战损，再沿 ${focusLine} 补齐剩余 ${remainingNodes} 个关键节点。`;
      case 'node_shortfall':
        return `补卷提示：下轮先把 ${focusLine} 的关键节点补满，再回来结题。`;
      case 'route_deviated':
        return `补卷提示：下轮尽量按 ${focusLine} 重走，先把答卷拉回主轴。`;
      case 'answer_incomplete':
        return `补卷提示：下轮至少再补 ${remainingGoals} 条作答目标，再沿 ${focusLine} 收束。`;
      default:
        return `补卷提示：继续沿 ${focusLine} 追样本，先把剩余关键节点与作答目标补齐。`;
    }
  }
  buildSanctumAgendaFailureRecovery(activeAgenda = null, context = {}) {
    const agenda = activeAgenda && typeof activeAgenda === 'object' ? activeAgenda : null;
    if (!agenda) return null;
    const progress = Math.max(0, Math.floor(Number(agenda.progress) || 0));
    const target = Math.max(1, Math.floor(Number(agenda.target) || 1));
    const completedGoals = Math.max(0, Math.floor(Number(context.completedGoals) || 0));
    const totalGoals = Math.max(completedGoals, Math.floor(Number(context.totalGoals) || 0));
    const hasMeaningfulEffort = progress > 0 || completedGoals > 0 || !!agenda.selectedDecisionId || !!agenda.selectedContractId;
    if (!hasMeaningfulEffort) return null;
    const progressRatio = Math.min(1, progress / target);
    const goalRatio = totalGoals > 0 ? Math.min(1, completedGoals / totalGoals) : 0;
    const effortScore = progressRatio * 0.65 + goalRatio * 0.25 + (agenda.selectedDecisionId ? 0.1 : 0) + (agenda.selectedContractId ? 0.1 : 0);
    let recoveryTier = 'trace';
    let recoveryTierLabel = '残页';
    if (effortScore >= 0.95 || progress >= Math.max(1, target - 1) && !!agenda.selectedContractId) {
      recoveryTier = 'deep';
      recoveryTierLabel = '整编';
    } else if (effortScore >= 0.55 || progress >= Math.max(1, Math.ceil(target / 2))) {
      recoveryTier = 'salvage';
      recoveryTierLabel = '残卷';
    }
    const recoveryReward = {
      insight: 0,
      karma: 0,
      ringExp: recoveryTier === 'deep' ? 8 : recoveryTier === 'salvage' ? 4 : 2
    };
    const primaryResource = (Number(agenda?.cost?.insight) || 0) >= (Number(agenda?.cost?.karma) || 0) ? 'insight' : 'karma';
    const secondaryResource = primaryResource === 'insight' ? 'karma' : 'insight';
    if ((Number(agenda?.cost?.[primaryResource]) || 0) > 0) {
      recoveryReward[primaryResource] = 1;
    }
    if (recoveryTier !== 'trace' && (Number(agenda?.cost?.[secondaryResource]) || 0) > 0) {
      recoveryReward[secondaryResource] = 1;
    }
    const rewardParts = [];
    if (recoveryReward.insight > 0) rewardParts.push(`天机 +${recoveryReward.insight}`);
    if (recoveryReward.karma > 0) rewardParts.push(`业果 +${recoveryReward.karma}`);
    if (recoveryReward.ringExp > 0) rewardParts.push(`命环经验 +${recoveryReward.ringExp}`);
    const retainedParts = [`${progress}/${target} 份关键样本`];
    if (completedGoals > 0) {
      retainedParts.push(`${completedGoals}/${Math.max(1, totalGoals)} 条作答留痕`);
    }
    if (agenda.selectedContractId) {
      retainedParts.push('契约旁注');
    }
    const rewardLine = rewardParts.length > 0 ? `，回收 ${rewardParts.join('、')}` : '';
    return {
      recoveryEligible: true,
      recoveryLabel: '残卷回收',
      recoveryTier,
      recoveryTierLabel,
      recoveryReward,
      recoveryLine: `残卷回收·${recoveryTierLabel}：已封存 ${retainedParts.join('、')}${rewardLine}。`,
      recoveryHintLine: this.formatSanctumAgendaRecoveryHint(context.reasonId, agenda, {
        completedGoals,
        totalGoals
      })
    };
  }
  applySanctumAgendaFailureRecovery(resolution = null) {
    const source = resolution && typeof resolution === 'object' ? resolution : null;
    if (!source || source.outcome !== 'failed' || !source.recoveryEligible) return '';
    this.game.grantStrategicCurrencies(source.recoveryReward || {}, '');
    this.game.grantFateRingExp(source.recoveryReward?.ringExp || 0, '');
    return source.recoveryLine || source.grantedLine || '';
  }
  buildSanctumAgendaFailureRecoveryNotice(resolution = null) {
    const source = resolution && typeof resolution === 'object' ? resolution : null;
    if (!source || source.outcome !== 'failed' || !source.recoveryEligible) return null;
    const iconMap = {
      trace: '🗒️',
      salvage: '📜',
      deep: '📚'
    };
    const recoveryLabel = String(source.recoveryLabel || '残卷回收').trim() || '残卷回收';
    const recoveryTierLabel = String(source.recoveryTierLabel || '').trim();
    const title = recoveryTierLabel ? `${recoveryLabel} · ${recoveryTierLabel}` : recoveryLabel;
    const summaryLine = recoveryTierLabel ? `洞府已执行${recoveryLabel}（${recoveryTierLabel}）` : `洞府已执行${recoveryLabel}`;
    const message = [String(source.recoveryLine || '').trim(), String(source.recoveryHintLine || '').trim()].filter(Boolean).join('\n');
    return {
      title,
      message,
      icon: iconMap[String(source.recoveryTier || '').trim()] || '📘',
      summaryLine
    };
  }
  resolveSanctumAgenda(reason = 'realm_clear', context = {}) {
    const state = this.ensureSanctumAgendaState();
    const active = state.activeAgenda && state.activeAgenda.agendaId ? state.activeAgenda : null;
    if (!active || active.outcome !== 'active') return null;
    const expeditionState = context.state && typeof context.state === 'object' ? context.state : typeof this.game.getExpeditionState === 'function' ? this.game.getExpeditionState() : null;
    const slate = context.slate && typeof context.slate === 'object' ? context.slate : typeof this.game.getLatestRunSlate === 'function' ? this.game.getLatestRunSlate() : null;
    const answerSheet = context.answerSheet && typeof context.answerSheet === 'object' ? context.answerSheet : expeditionState && typeof this.game.getExpeditionAnswerSheet === 'function' ? this.game.getExpeditionAnswerSheet(expeditionState) : null;
    const reviewCard = answerSheet?.reviewCard && typeof answerSheet.reviewCard === 'object' ? answerSheet.reviewCard : slate?.answerReview && typeof slate.answerReview === 'object' ? slate.answerReview : null;
    const completedGoals = Math.max(0, Math.floor(Number(answerSheet?.completedGoals) || Number(reviewCard?.completedGoals) || 0));
    const totalGoals = Math.max(completedGoals, Math.floor(Number(answerSheet?.totalGoals) || 0));
    const ratingTone = ['completed', 'selected', 'suggested', 'idle'].includes(String(answerSheet?.ratingTone || reviewCard?.ratingTone || '').trim()) ? String(answerSheet?.ratingTone || reviewCard?.ratingTone || '').trim() : 'idle';
    const ratingLabel = String(answerSheet?.ratingLabel || reviewCard?.ratingLabel || active.ratingLabel || '').trim();
    const deviated = Array.isArray(answerSheet?.goals) ? answerSheet.goals.some(goal => goal && goal.deviated) : false;
    const progressOk = Math.max(0, Math.floor(Number(active.progress) || 0)) >= Math.max(1, Math.floor(Number(active.target) || 1));
    const ratingOk = active.acceptedTones.includes(ratingTone) || completedGoals >= Math.max(0, Math.floor(Number(active.minCompletedGoals) || 0));
    const deviationOk = !!active.allowDeviation || !deviated;
    const clearOk = String(reason || '').trim() === 'realm_clear';
    const resolutionName = active.selectedDecisionLabel ? `${active.name}·${active.selectedDecisionLabel}` : active.name;
    let outcome = 'failed';
    let outcomeLabel = '研究未成';
    let outcomeTone = 'failed';
    let reasonId = 'answer_incomplete';
    let reasonLine = `当前答卷尚未达到【${resolutionName}】的结题门槛。`;
    if (clearOk && progressOk && ratingOk && deviationOk) {
      outcome = 'success';
      outcomeLabel = '结题成功';
      outcomeTone = 'completed';
      reasonId = 'completed';
      reasonLine = `本章命中 ${active.progress}/${active.target} 次关键节点，并以「${ratingLabel || '成卷'}」完成收束。`;
    } else if (!clearOk) {
      reasonId = 'battle_lost';
      reasonLine = `章节中途折损，${active.name} 只留下 ${active.progress}/${active.target} 次关键节点记录。`;
    } else if (!progressOk) {
      reasonId = 'node_shortfall';
      reasonLine = `关键节点仅命中 ${active.progress}/${active.target} 次，未能把研究样本跑成一条稳定路线。`;
    } else if (!deviationOk) {
      reasonId = 'route_deviated';
      reasonLine = '本章答卷出现偏题，研究对象没有稳定落回样本主轴。';
    } else if (!ratingOk) {
      reasonId = 'answer_incomplete';
      reasonLine = `当前答卷仅完成 ${completedGoals}/${Math.max(1, totalGoals)} 项目标，评级仍未达到结题门槛。`;
    }
    const contractSelected = !!active.selectedContractId;
    const contractProgressOk = Math.max(0, Math.floor(Number(active.contractProgress) || 0)) >= Math.max(1, Math.floor(Number(active.contractTarget) || 1));
    const contractGoalOk = completedGoals >= Math.max(0, Math.floor(Number(active.contractMinCompletedGoals) || 0));
    const contractAcceptedTones = Array.isArray(active.contractAcceptedTones) ? active.contractAcceptedTones.filter(Boolean) : [];
    const contractToneOk = contractAcceptedTones.length <= 0 || contractAcceptedTones.includes(ratingTone);
    const contractDeviationOk = !active.contractRequireNoDeviation || !deviated;
    const contractMissReasons = [];
    if (contractSelected && outcome === 'success') {
      if (!contractProgressOk) {
        contractMissReasons.push(`契约样本仅达成 ${active.contractProgress}/${active.contractTarget}`);
      }
      if (!contractGoalOk) {
        contractMissReasons.push(`作答目标仅完成 ${completedGoals}/${Math.max(1, totalGoals)}`);
      }
      if (!contractToneOk && contractAcceptedTones.length > 0) {
        contractMissReasons.push(`答卷评级未达到 ${contractAcceptedTones.join(' / ')}`);
      }
      if (!contractDeviationOk) {
        contractMissReasons.push('答卷出现偏题');
      }
    }
    const contractSuccess = contractSelected && outcome === 'success' && contractProgressOk && contractGoalOk && contractToneOk && contractDeviationOk;
    let contractResolutionLine = '';
    if (contractSelected) {
      const contractName = active.selectedContractLabel || active.selectedContractId;
      const contractStakeLine = String(active.contractSignCostLine || '').trim();
      if (outcome !== 'success') {
        contractResolutionLine = `锁线契约「${contractName}」未兑现：基础议程尚未结题。${contractStakeLine ? ` 已支付的契押 ${contractStakeLine} 不会退回。` : ''}`;
      } else if (contractSuccess) {
        contractResolutionLine = (active.contractSuccessLine || `锁线契约「${contractName}」兑现：${active.contractBonusLine || '额外奖赏已入账。'}`) + (contractStakeLine ? ` 已支付的契押 ${contractStakeLine} 已一并折成契约收益。` : '');
      } else {
        const contractReason = contractMissReasons.length > 0 ? contractMissReasons.join('；') : '尚未满足额外契约条件。';
        contractResolutionLine = (active.contractFailureLine || `锁线契约「${contractName}」未兑现：${contractReason}`) + (contractStakeLine ? ` 已支付的契押 ${contractStakeLine} 未能折现。` : '');
      }
    }
    const recovery = outcome === 'failed' ? this.buildSanctumAgendaFailureRecovery(active, {
      reasonId,
      completedGoals,
      totalGoals
    }) : null;
    const chapterIndex = Math.max(0, Math.floor(Number(expeditionState?.chapterIndex || slate?.chapterIndex || active.boundChapterIndex) || 0));
    const resolved = this.normalizeSanctumAgendaRecord({
      ...active,
      sourceRunId: String(slate?.id || active.sourceRunId || '').trim(),
      chapterName: String(slate?.chapterName || active.chapterName || '').trim(),
      ratingLabel: ratingLabel || active.ratingLabel,
      ratingTone: ratingTone || active.ratingTone,
      boundChapterIndex: chapterIndex,
      boundChapterName: String(expeditionState?.chapterFullName || expeditionState?.chapterName || active.boundChapterName || '').trim(),
      outcome,
      outcomeLabel,
      outcomeTone,
      reasonId,
      reasonLine,
      summaryLine: outcome === 'success' ? `${resolutionName}结题成功：${active.progress}/${active.target} 次关键节点，答卷评级 ${ratingLabel || '成卷'}。${contractSelected ? `｜契约「${active.selectedContractLabel || active.selectedContractId}」${contractSuccess ? '兑现' : '未兑现'}。` : ''}` : `${resolutionName}未能结题：${reasonLine}${recovery?.recoveryEligible ? '｜已执行残卷回收。' : ''}`,
      contractResolved: contractSelected,
      contractSuccess,
      contractResolutionLine,
      recoveryEligible: !!recovery?.recoveryEligible,
      recoveryLabel: recovery?.recoveryLabel || '',
      recoveryTier: recovery?.recoveryTier || '',
      recoveryTierLabel: recovery?.recoveryTierLabel || '',
      recoveryReward: recovery?.recoveryReward || null,
      recoveryLine: recovery?.recoveryLine || '',
      recoveryHintLine: recovery?.recoveryHintLine || '',
      updatedAt: Date.now()
    });
    const grantedLine = outcome === 'success' ? this.applySanctumAgendaOutcomeReward(resolved) : this.applySanctumAgendaFailureRecovery(resolved);
    resolved.grantedLine = grantedLine || (outcome === 'success' ? resolved.rewardLine : resolved.recoveryEligible ? resolved.recoveryLine : '');
    const aftereffect = this.createFateAftereffectFromSanctumAgenda(resolved, {
      chapterIndex,
      latestRunId: resolved.sourceRunId || ''
    });
    const runtimeAftereffect = aftereffect ? this.game.getFateAftereffectRuntimeRecord(aftereffect, {
      currentChapterIndex: chapterIndex
    }) : null;
    resolved.logLine = [resolved.summaryLine, resolved.recoveryLine || '', resolved.contractResolutionLine || '', runtimeAftereffect?.summaryLine || '', outcome === 'success' ? resolved.grantedLine || '' : ''].filter(Boolean).join('｜');
    state.activeAgenda = null;
    state.lastResolved = resolved;
    state.history = Array.isArray(state.history) ? state.history.concat(resolved).slice(-6) : [resolved];
    if (outcome === 'success') {
      state.totalCompleted = Math.max(0, Math.floor(Number(state.totalCompleted) || 0)) + 1;
    } else if (outcome === 'failed') {
      state.totalFailed = Math.max(0, Math.floor(Number(state.totalFailed) || 0)) + 1;
    }
    if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(outcome === 'success' ? `【${resolved.name}】结题：${resolved.grantedLine || resolved.contractResolutionLine || resolved.reasonLine}` : `【${resolved.name}】未成：${resolved.recoveryLine || resolved.contractResolutionLine || resolved.reasonLine}`);
    }
    if (this.game.currentScreen === 'collection' && this.game.getCollectionHubState?.().section === 'sanctum') {
      this.game.initCollection();
    }
    return resolved;
  }
  getSanctumAgendaExpeditionSnapshot(context = {}) {
    const dashboard = this.getSanctumAgendaDashboard();
    const latestRunId = String(context.latestRunId || '').trim();
    const active = dashboard.active && dashboard.active.agendaId ? {
      agendaId: dashboard.active.agendaId,
      icon: dashboard.active.icon,
      name: dashboard.active.name,
      sourceRunId: dashboard.active.sourceRunId || '',
      sourceTitle: dashboard.active.sourceTitle || '',
      themeLabel: dashboard.active.themeLabel || '',
      progress: dashboard.active.progress,
      target: dashboard.active.target,
      focusNodeTypes: Array.isArray(dashboard.active.focusNodeTypes) ? dashboard.active.focusNodeTypes.slice() : [],
      focusNodeLine: dashboard.active.focusNodeLine || '',
      summaryLine: dashboard.active.summaryLine || '',
      phaseKey: dashboard.active.phaseKey || '',
      phaseLabel: dashboard.active.phaseLabel || '',
      phaseLine: dashboard.active.phaseLine || '',
      statusLine: dashboard.active.statusLine || '',
      costLine: dashboard.active.costLine || '',
      rewardTrackId: dashboard.active.rewardTrackId || '',
      rewardTrackName: dashboard.active.rewardTrackName || '',
      rewardTrackIcon: dashboard.active.rewardTrackIcon || '',
      decisionState: dashboard.active.decisionState || 'locked',
      decisionPromptLine: dashboard.active.decisionPromptLine || '',
      selectedDecisionId: dashboard.active.selectedDecisionId || '',
      selectedDecisionLabel: dashboard.active.selectedDecisionLabel || '',
      selectedDecisionLine: dashboard.active.selectedDecisionLine || '',
      contractState: dashboard.active.contractState || 'locked',
      contractPromptLine: dashboard.active.contractPromptLine || '',
      selectedContractId: dashboard.active.selectedContractId || '',
      selectedContractLabel: dashboard.active.selectedContractLabel || '',
      selectedContractLine: dashboard.active.selectedContractLine || '',
      contractSignCost: dashboard.active.contractSignCost ? {
        insight: dashboard.active.contractSignCost.insight || 0,
        karma: dashboard.active.contractSignCost.karma || 0
      } : null,
      contractSignCostLine: dashboard.active.contractSignCostLine || '',
      contractBurdenLine: dashboard.active.contractBurdenLine || '',
      contractProgress: dashboard.active.contractProgress || 0,
      contractTarget: dashboard.active.contractTarget || 0,
      contractNodeTypes: Array.isArray(dashboard.active.contractNodeTypes) ? dashboard.active.contractNodeTypes.slice() : [],
      decisionOptions: Array.isArray(dashboard.active.decisionOptions) ? dashboard.active.decisionOptions.map(entry => ({
        id: entry.id || '',
        label: entry.label || '',
        tagLabel: entry.tagLabel || '',
        summaryLine: entry.summaryLine || '',
        statusLine: entry.statusLine || '',
        buttonLabel: entry.buttonLabel || '采用处置'
      })) : [],
      contractOptions: Array.isArray(dashboard.active.contractOptions) ? dashboard.active.contractOptions.map(entry => ({
        id: entry.id || '',
        label: entry.label || '',
        tagLabel: entry.tagLabel || '',
        summaryLine: entry.summaryLine || '',
        statusLine: entry.statusLine || '',
        signCostLine: entry.signCostLine || '',
        burdenLine: entry.burdenLine || '',
        buttonLabel: entry.buttonLabel || '立契锁线'
      })) : [],
      trainingTags: Array.isArray(dashboard.active.trainingTags) ? dashboard.active.trainingTags.slice() : [],
      goalHighlights: Array.isArray(dashboard.active.goalHighlights) ? dashboard.active.goalHighlights.slice() : [],
      chapterIndex: dashboard.active.boundChapterIndex || 0,
      chapterName: dashboard.active.boundChapterName || dashboard.active.chapterName || ''
    } : null;
    const lastResolved = dashboard.lastResolved && dashboard.lastResolved.agendaId && (!latestRunId || dashboard.lastResolved.sourceRunId === latestRunId) ? {
      agendaId: dashboard.lastResolved.agendaId,
      icon: dashboard.lastResolved.icon,
      name: dashboard.lastResolved.name,
      sourceRunId: dashboard.lastResolved.sourceRunId || '',
      chapterName: dashboard.lastResolved.chapterName || '',
      outcome: dashboard.lastResolved.outcome || 'failed',
      outcomeLabel: dashboard.lastResolved.outcomeLabel || '',
      outcomeTone: dashboard.lastResolved.outcomeTone || '',
      progress: dashboard.lastResolved.progress || 0,
      target: dashboard.lastResolved.target || 0,
      ratingLabel: dashboard.lastResolved.ratingLabel || '',
      summaryLine: dashboard.lastResolved.summaryLine || '',
      reasonLine: dashboard.lastResolved.reasonLine || '',
      grantedLine: dashboard.lastResolved.grantedLine || '',
      phaseLabel: dashboard.lastResolved.phaseLabel || '',
      selectedDecisionLabel: dashboard.lastResolved.selectedDecisionLabel || '',
      selectedContractLabel: dashboard.lastResolved.selectedContractLabel || '',
      contractSignCost: dashboard.lastResolved.contractSignCost ? {
        insight: dashboard.lastResolved.contractSignCost.insight || 0,
        karma: dashboard.lastResolved.contractSignCost.karma || 0
      } : null,
      contractSignCostLine: dashboard.lastResolved.contractSignCostLine || '',
      contractBurdenLine: dashboard.lastResolved.contractBurdenLine || '',
      contractSuccess: !!dashboard.lastResolved.contractSuccess,
      contractResolutionLine: dashboard.lastResolved.contractResolutionLine || '',
      recoveryEligible: !!dashboard.lastResolved.recoveryEligible,
      recoveryLabel: dashboard.lastResolved.recoveryLabel || '',
      recoveryTier: dashboard.lastResolved.recoveryTier || '',
      recoveryTierLabel: dashboard.lastResolved.recoveryTierLabel || '',
      recoveryLine: dashboard.lastResolved.recoveryLine || '',
      recoveryHintLine: dashboard.lastResolved.recoveryHintLine || '',
      recoveryReward: dashboard.lastResolved.recoveryReward ? {
        insight: dashboard.lastResolved.recoveryReward.insight || 0,
        karma: dashboard.lastResolved.recoveryReward.karma || 0,
        ringExp: dashboard.lastResolved.recoveryReward.ringExp || 0
      } : null,
      rewardTrackId: dashboard.lastResolved.rewardTrackId || '',
      rewardTrackName: dashboard.lastResolved.rewardTrackName || '',
      rewardTrackIcon: dashboard.lastResolved.rewardTrackIcon || ''
    } : null;
    if (!active && !lastResolved) return null;
    return {
      active,
      lastResolved,
      completedCount: dashboard.completedCount,
      failedCount: dashboard.failedCount
    };
  }
}
if (typeof window !== 'undefined') {}
