import { Utils } from "../core/utils.js";
import { particles } from "../core/particles.js";
import { REALM_ENVIRONMENTS } from "../data/environments.js";
import { AuthService } from "../services/authService.js";
import { CHARACTERS } from "../data/index.js";
export class SystemView {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  showLegacyScreen() {
    this.showScreen('inheritance-screen');
  }
  showFirstBattleGuide() {
    if (!this.game.guideState || this.game.guideState.firstBattleGuideSeen) return;
    this.game.markGuideSeen('firstBattleGuideSeen');
    const tips = ['新手提示：先看敌方意图，再决定是进攻还是防御。', '新手提示：打完牌后，点击“结束回合”推进战斗。', '新手提示：按 L 可以打开战斗记录，复盘每次触发。'];
    tips.forEach((msg, idx) => {
      setTimeout(() => {
        Utils.showBattleLog(msg, {
          category: 'system',
          duration: 2800
        });
      }, idx * 1700);
    });
  }
  showScreen(screenId) {
    console.log(`[Debug] showScreen called for: ${screenId}`);
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    const screen = document.getElementById(screenId);
    if (screen) {
      // Safety: Ensure screen is visible before running logic that might crash
      screen.classList.add('active');
      this.game.currentScreen = screenId;
      if (document.body) {
        document.body.dataset.currentScreen = screenId;
      }
      this.game.dismissBattleOverlaysForScreen(screenId);
      this.game.resetScreenAmbientState(screenId);
      this.game.resetScreenScrollPosition(screen);
      console.log(`[Debug] Screen ${screenId} set to active class.`);
      if (screenId === 'map-screen') {
        const resetMapScroll = () => {
          const mapSurface = screen.querySelector('.map-screen-v3');
          if (mapSurface) {
            mapSurface.scrollTop = 0;
            mapSurface.scrollLeft = 0;
            if (typeof mapSurface.scrollTo === 'function') {
              mapSurface.scrollTo({
                top: 0,
                left: 0,
                behavior: 'auto'
              });
            }
          }
        };
        setTimeout(resetMapScroll, 0);
        setTimeout(resetMapScroll, 220);
      }

      // Use Try-Catch to prevent logical errors from blocking UI rendering (Black Screen Fix)
      try {
        // Particle Control
        if (typeof particles !== 'undefined') {
          if (screenId === 'main-menu') {
            particles.startMainMenuParticles();
            this.game.tryShowMainMenuGuide();
          } else {
            particles.stopMainMenuParticles();
          }
        }

        // 特殊处理
        if (screenId === 'map-screen') {
          console.log('[Debug] Initializing map-screen logic');
          if (this.game.map) {
            console.log('[Debug] Calling this.game.map.render()');
            this.game.map.render();
            if (typeof this.game.renderExpeditionMapPanels === 'function') {
              this.game.renderExpeditionMapPanels();
            }
          } else {
            console.error('[Debug] this.game.map is undefined!');
          }
          console.log('[Debug] Calling updatePlayerDisplay()');
          this.game.updatePlayerDisplay();
          this.game.refreshLegacyMissionTrackers();

          // DEBUG: Check DOM state after render
          setTimeout(() => {
            const mapScreen = document.getElementById('map-screen');
            if (mapScreen) {
              const style = window.getComputedStyle(mapScreen);
              console.log(`[Debug] #map-screen style: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}, height=${style.height}, width=${style.width}, z-index=${style.zIndex}`);
              console.log(`[Debug] #map-screen Parent: <${mapScreen.parentNode.tagName} id="${mapScreen.parentNode.id}" class="${mapScreen.parentNode.className}">`);
              console.log(`[Debug] #map-screen innerHTML length: ${mapScreen.innerHTML.length}`);

              // Audit body children for overlays
              console.log('[Debug] Auditing Body Children for Overlays:');
              Array.from(document.body.children).forEach(child => {
                const s = window.getComputedStyle(child);
                if (s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0) {
                  console.log(`[Debug] Visible Child: <${child.tagName} id="${child.id}" class="${child.className}"> Z=${s.zIndex} Pos=${s.position} Rect=${child.getBoundingClientRect().height}x${child.getBoundingClientRect().width}`);
                }
              });
            }
          }, 500); // Delayed check
        } else if (screenId === 'battle-screen') {
          console.log('[Debug] Initializing battle-screen logic');
          this.game.updatePlayerDisplay();
          this.game.refreshLegacyMissionTrackers();
          if (!this.game.guideState.battleLogHintSeen) {
            this.game.markGuideSeen('battleLogHintSeen');
            setTimeout(() => {
              Utils.showBattleLog('提示：按 L 可查看战斗记录面板。', {
                category: 'system',
                duration: 2600
              });
            }, 350);
          }
        } else if (screenId === 'collection') {
          this.game.initCollection();
        } else if (screenId === 'achievements-screen') {
          this.game.initAchievements();
        } else if (screenId === 'inheritance-screen') {
          this.game.initInheritanceScreen();
        } else if (screenId === 'character-select') {
          this.game.updateCharacterInfo();
        } else if (screenId === 'realm-select-screen') {
          this.game.initRealmSelect();
        }
        console.log(`[Debug] showScreen logic for ${screenId} completed successfully.`);
      } catch (e) {
        console.error(`Error initializing screen ${screenId}:`, e);
        // Try to show error safely
        if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
          Utils.showBattleLog('界面加载异常: ' + e.message);
        }
      }
    } else {
      console.error(`[Debug] Screen element #${screenId} NOT FOUND in DOM!`);
    }
  }
  showVictoryScreen() {
    document.getElementById('game-over-title').textContent = '逆天成功！';
    document.getElementById('game-over-title').classList.add('victory');
    document.getElementById('game-over-text').textContent = '你打破了命运的枷锁，成为了真正的逆命者！';
    document.getElementById('stat-floor').textContent = this.game.map.getRealmName(this.game.player.realm);
    document.getElementById('stat-enemies').textContent = this.game.player.enemiesDefeated;
    document.getElementById('stat-laws').textContent = this.game.player.collectedLaws.length;
    const legacyStat = document.getElementById('stat-legacy');
    if (legacyStat) {
      legacyStat.textContent = `+${this.game.lastLegacyGain || 0}（库存 ${this.game.legacyProgress.essence}）`;
    }
    this.showScreen('game-over-screen');
  }
  showCheatMonsterSelector() {
    const modalId = 'cheat-monster-selector';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.85); z-index: 10000; display: flex;
                flex-direction: column; padding: 20px; overflow-y: auto;
                color: #fff; font-family: sans-serif;
            `;
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; border-bottom:1px solid #444; padding-bottom:10px;">
                <h2 style="margin:0; color:gold;">⚔️ 试炼场 (Debug)</h2>
                <button type="button" data-system-action="close-cheat-monster-selector" style="padding:5px 15px;">关闭</button>
            </div>
            <div id="cheat-realm-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:15px;"></div>
        `;
    if (!modal.__cheatMonsterDelegatesBound) {
      modal.addEventListener('click', event => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const actionBtn = target.closest('[data-system-action]');
        if (!actionBtn || actionBtn.disabled || !modal.contains(actionBtn)) return;
        const action = String(actionBtn.dataset.systemAction || '');
        if (action === 'close-cheat-monster-selector') {
          modal.style.display = 'none';
          return;
        }
        if (action === 'start-debug-battle') {
          const realm = Number(actionBtn.dataset.realmIndex || 0);
          const battleType = String(actionBtn.dataset.battleType || 'normal');
          if (realm > 0) {
            this.game.startDebugBattle(realm, battleType);
            modal.style.display = 'none';
          }
        }
      });
      modal.__cheatMonsterDelegatesBound = true;
    }
    const list = modal.querySelector('#cheat-realm-list');

    // 遍历所有境界 (1-14)
    for (let r = 1; r <= 14; r++) {
      const realmData = REALM_ENVIRONMENTS[r] || {
        name: `第${r}重天`
      };
      const card = document.createElement('div');
      card.style.cssText = `
                background: #222; border: 1px solid #555; padding: 10px; border-radius: 4px;
            `;

      // 添加两个通用测试按钮
      const btnStyle = "display:block; width:100%; margin:5px 0; padding:8px; background:#333; color:#eee; border:none; cursor:pointer; text-align:left;";
      card.innerHTML = `<h3 style="margin-top:0; color:#ddd;">${r}. ${realmData.name}</h3>`;

      // 1. 生成普通测试怪
      const normalBtn = document.createElement('button');
      normalBtn.style.cssText = btnStyle;
      normalBtn.textContent = "👊 生成随机小怪 (Random)";
      normalBtn.type = 'button';
      normalBtn.dataset.systemAction = 'start-debug-battle';
      normalBtn.dataset.realmIndex = String(r);
      normalBtn.dataset.battleType = 'normal';
      card.appendChild(normalBtn);

      // 2. 生成 Boss
      const bossBtn = document.createElement('button');
      bossBtn.style.cssText = btnStyle;
      bossBtn.textContent = "💀 生成 Boss";
      bossBtn.type = 'button';
      bossBtn.dataset.systemAction = 'start-debug-battle';
      bossBtn.dataset.realmIndex = String(r);
      bossBtn.dataset.battleType = 'boss';
      card.appendChild(bossBtn);
      list.appendChild(card);
    }
    modal.style.display = 'flex';
  }
  showGameIntro() {
    const modal = document.getElementById('settings-modal');
    // 确保模态框存在
    if (!modal) {
      console.error('Settings modal not found!');
      return;
    }
    const settingsContainer = document.getElementById('settings-options');
    if (!settingsContainer) return;

    // Content for specific tabs
    // Tab 1: Overview
    const overviewContent = `
            <div class="intro-section">
                <h3><span style="font-size:1.5rem; margin-right:10px;">☯</span> 游戏定位</h3>
                <p class="intro-text">
                    《逆命者 The Defier》是一款东方仙侠题材的卡牌 Roguelike。你将在随机地图中构筑卡组、收集法宝、推进命环成长，
                    在不断变化的战斗与事件中完成“逆天改命”。
                </p>
                <ul class="intro-list">
                    <li><strong>主线挑战</strong>：闯过 18 层天域，击败镇守强敌。</li>
                    <li><strong>长线玩法</strong>：无尽轮回高压成长，挑战更高轮次。</li>
                    <li><strong>对抗玩法</strong>：PVP 天道榜，镜像对战、风险画像与赛季奖励并行。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🚀 30秒上手</h3>
                <ul class="intro-list">
                    <li>点击「新的轮回」进入选角，游客模式可直接开局。</li>
                    <li>进入战斗后先看敌方意图，再决定攻防节奏。</li>
                    <li>优先围绕 1-2 套核心机制构筑，不要平均拿牌。</li>
                    <li>打完牌后点击「结束回合」，逐步滚起资源优势。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>👥 可选角色（6位）</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="char-highlight" style="border-color: var(--accent-gold);">
                        <strong style="color: var(--accent-gold);">🤺 林风 · 逆命者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">命环成长收益高，后期上限强。</p>
                    </div>
                    <div class="char-highlight" style="border-color: var(--accent-green);">
                        <strong style="color: var(--accent-green);">🌿 香叶 · 被诅咒的医者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">治疗与持续压制并存，续航稳定。</p>
                    </div>
                    <div class="char-highlight" style="border-color: var(--accent-red);">
                        <strong style="color: var(--accent-red);">📿 无欲 · 苦行僧</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">功德/业力双资源，攻守切换明显。</p>
                    </div>
                    <div class="char-highlight" style="border-color: #2196F3;">
                        <strong style="color: #2196F3;">📚 严寒 · 命环学者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">解析与技能联动，节奏控制强。</p>
                    </div>
                    <div class="char-highlight" style="border-color: #8aa4ff;">
                        <strong style="color: #8aa4ff;">🌠 墨尘 · 星律巡使</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">围绕命环节奏与标记链条展开。</p>
                    </div>
                    <div class="char-highlight" style="border-color: #4ecdc4;">
                        <strong style="color: #4ecdc4;">🪬 宁玄 · 灵器行者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">法宝与攻防同频，回合质量高。</p>
                    </div>
                </div>
            </div>
        `;

    // Tab 2: Mechanics
    const mechanicsContent = `
            <div class="intro-section">
                <h3>⚔️ 战斗资源与回合节奏</h3>
                <ul class="intro-list">
                    <li><strong>灵力</strong>：决定当回合可打出的卡牌总费用。</li>
                    <li><strong>奶糖</strong>：用于特定卡牌与无尽指令交易，属于关键节奏资源。</li>
                    <li><strong>战场指令</strong>：中后期核心资源，可在关键回合完成“稳压/破阵/斩杀”反转。</li>
                    <li><strong>敌方意图</strong>：先看意图再出牌，能显著降低无效损失。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>⭕ 命环系统与路径</h3>
                <ul class="intro-list">
                    <li>命环升级可提升基础属性并解锁更多法则槽位。</li>
                    <li>不同路径决定你的战斗身份与长期收益。</li>
                    <li>命环、法则、法宝、构筑流派会形成联动增益。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🌌 五行法则与共鸣</h3>
                <p class="intro-text">金→木→土→水→火→金。属性克制是前中期最稳定的增伤来源之一。</p>
                <ul class="intro-list">
                    <li><strong>克制</strong>：伤害显著提高。</li>
                    <li><strong>被克</strong>：伤害明显衰减。</li>
                    <li><strong>法则共鸣</strong>：同系法则与套装协同可触发额外效果。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>♾️ 无尽与 🏆 PVP</h3>
                <ul class="intro-list">
                    <li><strong>无尽轮回</strong>：压力、赛季、季签与偏执会汇总成 DRI 主轴与对策，强调读题后的稳压与爆发平衡。</li>
                    <li><strong>天道榜（PVP）</strong>：榜单推演、焦点约战、定向匹配、镜像演武兜底、实战与赛后复盘会同步展示 PVP DRI、主轴、对策与预留，并联动段位奖励、商店外观与经济循环。</li>
                    <li><strong>传承系统</strong>：局外成长可强化下一轮开局强度与构筑容错。</li>
                </ul>
            </div>
        `;

    // Tab 3: Controls & Tips
    const controlsContent = `
            <div class="intro-section">
                <h3>🎮 操作指南</h3>
                <ul class="intro-list">
                    <li><strong>出牌</strong>：拖拽卡牌到敌人或目标区域。</li>
                    <li><strong>结束回合</strong>：点击右侧按钮推进回合。</li>
                    <li><strong>目标切换</strong>：优先处理高威胁意图目标。</li>
                    <li><strong>详情查看</strong>：悬停卡牌/图标查看完整说明。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>⌨️ 常用快捷键</h3>
                <ul class="intro-list">
                    <li><strong>L</strong>：打开/关闭战斗日志面板。</li>
                    <li><strong>F</strong>：切换全屏模式。</li>
                    <li><strong>Esc</strong>：退出全屏或关闭当前弹窗。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>💾 存档与同步</h3>
                <ul class="intro-list">
                    <li><strong>本地存档</strong>：自动保存，离线可玩。</li>
                    <li><strong>云存档</strong>：登录后可跨设备同步。</li>
                    <li><strong>冲突处理</strong>：系统会在冲突时提示保留版本。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>💡 实战建议</h3>
                <ul class="intro-list">
                    <li><strong>先保命后爆发</strong>：面对高威胁回合优先防守与净化。</li>
                    <li><strong>集中构筑</strong>：围绕单一核心机制拿牌，避免功能分散。</li>
                    <li><strong>关注资源峰值</strong>：灵力、奶糖、指令槽留给关键回合。</li>
                </ul>
            </div>
        `;

    // Tab 4: Updates
    const updatesContent = `
            <div class="intro-section">
                <h3>🌌 当前版本重点（V9.2）</h3>
                <p class="intro-text">
                    当前主线已进入 V9.2 迭代：核心目标是把“命途构筑、章节考试、赛季组织层、长线复盘”彻底打通。
                    版本强调中盘转轴、章节风险识别、季盘组织与跨模式成长闭环，而不是单纯叠加体量。
                </p>
            </div>

            <div class="intro-section">
                <h3>✅ V9.2 已开发到位的核心能力</h3>
                <ul class="intro-list">
                    <li><strong>命途主线三阶段</strong>：每局有明确阶段目标、阶段奖励与圆满归档。</li>
                    <li><strong>命途裂变中盘抉择</strong>：中盘可执行极化 / 转修 / 献祭等路线改写，提升局内分叉感。</li>
                    <li><strong>章节世界规则考试化</strong>：章节天象、地脉、主宰提示与路线建议形成统一语义。</li>
                    <li><strong>赛季天道盘组织层</strong>：精选命盘、章节归卷、洞府承诺、界痕后效、无尽轮回与 PVP 天道榜现会统一整理成训练线 / 远征线 / 验算线三条季盘任务，并同步出现在奖励页、构筑快照、洞府总览与文本 payload；奖励页会按押卷中 / 正卷 / 险卷 / 欠卷分支直接露出赛季裁定、债账 / 验证 / 下一步行动卡，锁线期会优先强调当前承诺动作，定榜后的正卷 / 险卷还会额外露出可点击的“七日劫数”旁验证状，同时保留路线引导与地图轻偏置；主验证通过会直接清债或把押卷升成正卷，主验证失败会把旧债改记成反证/险卷，而周挑战旁验证只负责补强推荐与复盘，不会替代主验证本身。</li>
                    <li><strong>DRI 风险指数面板</strong>：章节简报、挑战观察站与无尽轮回现已共享风险指数、主导维度与对策提示，读题语言更统一。</li>
                    <li><strong>挑战试炼压强 DRI</strong>：观察站挑战页、锁定开局横幅与地图运行横幅现已同步展示试炼压强、主轴维度与应对提示。</li>
                    <li><strong>挑战观察站深化</strong>：观察站留痕现会自动生成复刻重点 / 失手剖面、训练标签、演练目标与同主题对比轴，并提供跨赛道历史留痕筛面、训练预设与样本排序，可按窗口 / 样本层 / 结果 / 主题检索旧样本并快速切回常用训练视角。</li>
                            <li><strong>观星共鸣 / 路线合卷 / 洞府议程</strong>：挑战观察站给出的精选命盘现会冻结成章节观星线索，并展开“修行课题 -> 章节答卷状态 -> 章节观星回响”的作答链路，持续驱动命盘共鸣、路线合卷、开战触发加成、训练标签与样本路径，也支持按推荐路线一键锁线；章节归卷后，奖励页会生成观星回响总结卡，洞府里的归卷书架会长期保存章节答卷、评分与训练建议，并支持把当前主练立成“洞府议程 / 命盘研究”，消耗天机 / 业果换取章节节点偏置、章中研究处置、锁线契约 bonus、失败后的残卷回收与章末结题奖励。</li>
                    <li><strong>仇敌追猎链路预判</strong>：地图总览、章节风险卡与远征态势会同步给出追猎历史、下一次高压窗口与建议对策。</li>
                    <li><strong>地图节点工程化 2.0</strong>：观星 / 禁术 / 裂隙 / 灵契线路会形成跨章工程主轴，持续改写后续地图结构。</li>
                    <li><strong>工程事件联动 2.1</strong>：观星 / 裂隙主轴会继续偏置章节事件池，并为命中事件追加货位、折价、命环、天机等强化。</li>
                    <li><strong>工程追猎联动 2.2</strong>：跨章工程主轴现已同步影响悬赏冲突、路线分歧、远征态势、章节总览桥接与仇敌追猎窗口。</li>
                    <li><strong>无尽轮回 DRI 同轴化</strong>：赛季词条、季签、崩盘账本与偏执层现已统一折算成轮回压强 DRI、主轴与预留建议。</li>
                    <li><strong>PVP 风险画像 + 焦点约战闭环</strong>：榜单推演、对手档案回看、PVP DRI、对策/预留、焦点约战单、定向匹配、镜像演武兜底、赛后复盘卡、段位倍率、连胜奖励、交易日志、称号与法相佩戴现已完整打通。</li>
                </ul>
                <p class=\"intro-text\">
                    同步锚点：三周一章 / feedbackLine / objective / pressureWindow，确保游戏内更新页、游戏介绍页与 progress.md 保持同一套版本口径。
                </p>
            </div>

            <div class="intro-section">
                <h3>🧭 推荐体验路线（V9.2）</h3>
                <ul class="intro-list">
                    <li>先开主线跑完一条命途三阶段，观察章节 DRI 与命途任务的联动节奏。</li>
                    <li>再进无尽轮回对照 DRI 主轴与赛季账本，确认“崩盘维度”并反向优化主线构筑。</li>
                    <li>最后进入天道榜，对照 PVP DRI、主轴与对策微调构筑，再利用赛季倍率与商店经济把强势套路沉淀成长期竞争力。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🛰 下一迭代方向（V9.x）</h3>
                <ul class="intro-list">
                    <li><strong>PVP 赛季题面深化</strong>：继续补更细的赛季题面提示、分段标签与跨场对照线索，让 PVP DRI 不只在开战前可读，也能继续承接到赛后复盘。</li>
                    <li><strong>挑战观察站深化</strong>：继续补跨周检索、更长档期聚合与更细历史分层，让观察站从“可检索样本库”继续走向长期打法训练器。</li>
                    <li><strong>洞府议程深化</strong>：继续补更多议程分支与更重的契约代价，让“归卷 -> 立项 -> 章中处置 -> 锁线契约 -> 残卷回收 / 结题 -> 压成工程”的循环继续长出更强的策略分叉。</li>
                    <li><strong>赛季天道盘深化</strong>：继续补更完整的采样 / 锁线 / 定榜阶段包装、更多季盘 lane 奖励与跨周收口规则，让季盘在现有“赛季裁定 + 债账 / 验证 / 下一步行动卡 + 路线引导 + 地图轻偏置”基础上继续成长为真正的赛季外场规划板。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>👨‍💻 项目与反馈</h3>
                <p class="intro-text">
                    Designed & Developed by <strong>HealthOvO</strong> Team.
                </p>
                <p class="intro-text" style="font-size: 0.9rem;">
                    若你遇到问题，或想反馈某个流派 / 章节 / Boss 的体验，欢迎在仓库提交 issue / discussion。
                </p>
                <div style="margin-top:20px; text-align:center;">
                    <a href="https://github.com/HealthOvO/The-Defier" target="_blank" style="color:var(--accent-cyan); text-decoration:none; border-bottom:1px dashed var(--accent-cyan);">GitHub Repository</a>
                </div>
            </div>
        `;
    this.game.introTabContent = {
      overview: overviewContent,
      mechanics: mechanicsContent,
      controls: controlsContent,
      updates: updatesContent
    };
    settingsContainer.innerHTML = `
        <div class="game-intro-container">
            <div class="intro-header">
                <h2>📖 逆命者指南</h2>
                <div class="subtitle">The Defier's Handbook</div>
            </div>

            <nav class="intro-tabs">
                <button class="intro-tab-btn active" type="button" data-tab="overview" data-system-action="switch-intro-tab">综述</button>
                <button class="intro-tab-btn" type="button" data-tab="mechanics" data-system-action="switch-intro-tab">机制</button>
                <button class="intro-tab-btn" type="button" data-tab="controls" data-system-action="switch-intro-tab">操作</button>
                <button class="intro-tab-btn" type="button" data-tab="updates" data-system-action="switch-intro-tab">更新</button>
            </nav>

            <div class="intro-content-area">
                <div id="intro-tab-content" class="intro-tab-panel active" data-active-tab="overview">
                    ${overviewContent}
                </div>
            </div>

            <div style="text-align: center; margin-top: auto; font-size: 0.8rem; color: rgba(255,255,255,0.2); padding-top: 10px;">
                v9.2 当前版本 | Breaking Fate since 2024
            </div>
        </div>
        `;
    this.bindSystemIntroDelegates(settingsContainer);
    modal.classList.add('active');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => this.game.switchIntroTab('overview'));
    } else {
      this.game.switchIntroTab('overview');
    }
  }
  showSkillConfirmModal() {
    const modal = document.getElementById('skill-confirm-modal');
    const titleEl = document.getElementById('skill-confirm-title');
    const iconEl = document.getElementById('skill-confirm-icon');
    const descEl = document.getElementById('skill-confirm-desc');
    if (this.game.player.activeSkill) {
      titleEl.textContent = `${this.game.player.activeSkill.name} `;
      iconEl.textContent = this.game.player.activeSkill.icon || '⚡';
      if (this.game.player.activeSkill.getDescription) {
        descEl.textContent = this.game.player.activeSkill.getDescription(this.game.player.skillLevel);
      } else {
        descEl.textContent = this.game.player.activeSkill.description;
      }
    }
    modal.classList.add('active');
  }
  showConfirmModal(message, onConfirm, onCancel = null) {
    let modal = document.getElementById('generic-confirm-modal');

    // 动态创建模态框
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'generic-confirm-modal';
      modal.className = 'modal';
      modal.style.zIndex = '10000'; // 确保在最上层
      modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 400px; padding: 30px;">
                    <h3 id="generic-confirm-title" style="color: var(--accent-gold); margin-bottom: 20px;">提示</h3>
                    <p id="generic-confirm-message" style="color: #ccc; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <div style="display: flex; justify-content: center; gap: 20px;">
                        <button id="generic-confirm-btn" class="menu-btn primary small">确定</button>
                        <button id="generic-cancel-btn" class="menu-btn small">取消</button>
                    </div>
                </div>
            `;
      document.body.appendChild(modal);

      // 绑定通用关闭
      const closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.innerHTML = '×';
      const modalContent = modal.querySelector('.modal-content');
      if (!modalContent) return;
      modalContent.appendChild(closeBtn);
    }

    // 更新内容
    const msgEl = document.getElementById('generic-confirm-message');
    const confirmBtn = document.getElementById('generic-confirm-btn');
    const cancelBtn = document.getElementById('generic-cancel-btn');
    if (msgEl) msgEl.textContent = message;

    // 绑定事件 (使用 onclick 覆盖之前的绑定，防止多次触发)
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      if (closeBtn.__systemClickHandler) {
        closeBtn.removeEventListener('click', closeBtn.__systemClickHandler);
      }
      const closeHandler = () => modal.classList.remove('active');
      closeBtn.addEventListener('click', closeHandler);
      closeBtn.__systemClickHandler = closeHandler;
    }
    if (confirmBtn) {
      if (confirmBtn.__systemClickHandler) {
        confirmBtn.removeEventListener('click', confirmBtn.__systemClickHandler);
      }
      const confirmHandler = () => {
        modal.classList.remove('active');
        if (typeof onConfirm === 'function') onConfirm();
      };
      confirmBtn.addEventListener('click', confirmHandler);
      confirmBtn.__systemClickHandler = confirmHandler;
    }
    if (cancelBtn) {
      if (cancelBtn.__systemClickHandler) {
        cancelBtn.removeEventListener('click', cancelBtn.__systemClickHandler);
      }
      const cancelHandler = () => {
        modal.classList.remove('active');
        if (typeof onCancel === 'function') onCancel();
      };
      cancelBtn.addEventListener('click', cancelHandler);
      cancelBtn.__systemClickHandler = cancelHandler;
    }

    // 显示
    modal.classList.add('active');
  }
  showAlertModal(message, title = '提示', onOk = null) {
    let modal = document.getElementById('generic-alert-modal');

    // 动态创建模态框
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'generic-alert-modal';
      modal.className = 'modal';
      modal.style.zIndex = '10001'; // 比Confirm更高
      modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 400px; padding: 30px;">
                    <h3 id="generic-alert-title" style="color: var(--accent-gold); margin-bottom: 20px;">提示</h3>
                    <p id="generic-alert-message" style="color: #ccc; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <div style="display: flex; justify-content: center;">
                        <button id="generic-alert-btn" class="menu-btn primary small" style="min-width: 100px;">确定</button>
                    </div>
                </div>
            `;
      document.body.appendChild(modal);

      // 绑定通用关闭
      const closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.innerHTML = '×';
      const modalContent = modal.querySelector('.modal-content');
      if (!modalContent) return;
      modalContent.appendChild(closeBtn);
    }

    // 更新内容
    const msgEl = document.getElementById('generic-alert-message');
    const titleEl = document.getElementById('generic-alert-title');
    if (msgEl) msgEl.innerHTML = message.replace(/\n/g, '<br>');
    if (titleEl) titleEl.textContent = title;

    // 按钮事件
    const okBtn = document.getElementById('generic-alert-btn');
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      if (closeBtn.__systemClickHandler) {
        closeBtn.removeEventListener('click', closeBtn.__systemClickHandler);
      }
      const closeHandler = () => modal.classList.remove('active');
      closeBtn.addEventListener('click', closeHandler);
      closeBtn.__systemClickHandler = closeHandler;
    }
    if (okBtn) {
      if (okBtn.__systemClickHandler) {
        okBtn.removeEventListener('click', okBtn.__systemClickHandler);
      }
      const okHandler = () => {
        if (onOk) onOk();
        modal.classList.remove('active');
      };
      okBtn.addEventListener('click', okHandler);
      okBtn.__systemClickHandler = okHandler;
    }
    modal.classList.add('active');
  }
  showLoginModal() {
    if (typeof AuthService !== 'undefined' && AuthService.isCloudEnabled && !AuthService.isCloudEnabled()) {
      const modalMsg = document.getElementById('auth-message');
      if (modalMsg) modalMsg.innerText = '云存档未配置，当前仅可离线游玩';
      Utils.showBattleLog('云存档未配置，已切换为离线模式');
      return;
    }
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.add('active');
      // Clear inputs
      const u = document.getElementById('auth-username');
      const p = document.getElementById('auth-password');
      const m = document.getElementById('auth-message');
      if (u) u.value = '';
      if (p) p.value = '';
      if (m) m.innerText = '';
    }
  }
  renderSaveSlots(slots) {
    const modal = document.getElementById('save-slots-modal');
    const container = document.getElementById('slots-container');
    if (!modal || !container) return;
    container.innerHTML = '';
    slots.forEach((slotData, index) => {
      const slotEl = document.createElement('div');
      const isEmpty = !slotData;
      slotEl.className = `save-slot ${isEmpty ? 'empty' : ''}`;
      const slotName = `命 牌 · ${['一', '二', '三', '四'][index] || index + 1}`;
      let contentHtml = '';
      if (isEmpty) {
        contentHtml = `
                    <div class="slot-visual" style="border-color: #555; opacity: 0.5;">?</div>
                    <div class="slot-empty-text">虚位以待</div>
                `;
      } else {
        let date = new Date(slotData.timestamp).toLocaleDateString();
        let dateLabel = "更新";
        if (slotData.player && slotData.player.registerTime) {
          date = new Date(slotData.player.registerTime).toLocaleDateString();
          dateLabel = "注册";
        }
        const realm = slotData.player && slotData.player.realm ? slotData.player.realm : 1;
        const hp = slotData.player && slotData.player.currentHp ? slotData.player.currentHp : '?';
        const roleId = slotData.player && slotData.player.characterId;
        let roleName = '未知角色';
        let roleIcon = '👤';
        if (roleId && typeof CHARACTERS !== 'undefined' && CHARACTERS[roleId]) {
          const c = CHARACTERS[roleId];
          roleName = c.name;
          // Resolve Image Path: Check .image, .portrait, or .avatar (if path)
          const imagePath = c.image || c.portrait || (c.avatar && c.avatar.includes('/') ? c.avatar : null);
          if (imagePath) {
            // Use image
            roleIcon = ''; // Clear text icon
            // We'll handle image via style in the HTML construction loop below
          } else {
            roleIcon = c.avatar || '👤';
          }

          // Store for use below
          slotData._tempImage = imagePath;
        }
        let maxRealm = 1;
        if (slotData.unlockedRealms && Array.isArray(slotData.unlockedRealms)) {
          maxRealm = Math.max(...slotData.unlockedRealms);
        } else if (slotData.player && slotData.player.realm) {
          maxRealm = slotData.player.realm;
        }
        let realmDisplay = `第${maxRealm}重天`;
        if (maxRealm > 18) {
          realmDisplay = `<span style="color:var(--accent-gold); font-weight:bold;">已通关</span>`;
        }
        contentHtml = `
                    <div class="slot-visual ${slotData._tempImage ? 'is-image' : ''}" 
                         style="${slotData._tempImage ? `background-image: url('${slotData._tempImage}');` : ''}">
                        ${slotData._tempImage ? '' : roleIcon}
                    </div>
                
                    <div class="slot-info-primary">${roleName} <span style="font-size:0.8em; opacity:0.7">| ${realmDisplay}</span></div>
                    <div class="slot-info-secondary">❤️ ${hp}  📅 ${dateLabel}: ${date}</div>
                `;
      }
      const actionsHtml = isEmpty ? `<button class="talisman-btn small" type="button" data-system-action="select-slot" data-slot-index="${index}" data-slot-mode="new">
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-text">开启轮回</span>
                    </div>
                </button>` : `<button class="talisman-btn small primary" type="button" data-system-action="select-slot" data-slot-index="${index}" data-slot-mode="load">
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-text">继续</span>
                    </div>
                </button>
                <button class="talisman-btn small" type="button" data-system-action="select-slot" data-slot-index="${index}" data-slot-mode="overwrite" style="margin-top:5px; transform:scale(0.9);">
                    <div class="talisman-paper" style="border-color:var(--accent-red);"></div>
                    <div class="talisman-content">
                        <span class="btn-text" style="color:var(--accent-red);">覆盖</span>
                    </div>
                </button>`;
      slotEl.innerHTML = `
                <div class="slot-header">${slotName}</div>
                <div class="slot-content">
                    ${contentHtml}
                </div>
                <div class="slot-actions">
                    ${actionsHtml}
                </div>
            `;
      container.appendChild(slotEl);
    });
    this.bindSaveSlotDelegates(container);
    modal.classList.add('active');
  }
  bindSystemIntroDelegates(settingsContainer) {
    if (!settingsContainer || settingsContainer.__systemIntroDelegatesBound) return;
    settingsContainer.addEventListener('click', event => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const tabBtn = target.closest('[data-system-action="switch-intro-tab"]');
      if (!tabBtn || tabBtn.disabled || !settingsContainer.contains(tabBtn)) return;
      const tabId = String(tabBtn.dataset.tab || 'overview');
      this.game.switchIntroTab(tabId);
    });
    settingsContainer.__systemIntroDelegatesBound = true;
  }
  bindSaveSlotDelegates(container) {
    if (!container || container.__saveSlotDelegatesBound) return;
    container.addEventListener('click', event => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const actionBtn = target.closest('[data-system-action="select-slot"]');
      if (!actionBtn || actionBtn.disabled || !container.contains(actionBtn)) return;
      const index = Number(actionBtn.dataset.slotIndex);
      const mode = String(actionBtn.dataset.slotMode || '');
      if (Number.isFinite(index) && mode) {
        this.game.selectSlot(index, mode);
      }
    });
    container.__saveSlotDelegatesBound = true;
  }
  showSaveConflictModal(localData, cloudData, cloudTime) {
    const modal = document.getElementById('save-conflict-modal');
    if (!modal) return;

    // Populate Info
    const localInfo = document.getElementById('local-save-info');
    const cloudInfo = document.getElementById('cloud-save-info');
    const formatInfo = (data, time) => {
      if (!data) return '无数据';
      const date = time ? new Date(time).toLocaleString() : data.timestamp ? new Date(data.timestamp).toLocaleString() : '未知时间';
      const realm = data.player && data.player.realm ? data.player.realm : '?';
      const hp = data.player && data.player.currentHp ? data.player.currentHp : '?';
      const gold = data.player && data.player.gold ? data.player.gold : '?';
      return `
                    <div style="margin-bottom:4px">📅 ${date}</div>
                <div style="margin-bottom:4px">🏔️ 第 ${realm} 重天</div>
                <div>❤️ ${hp} | 💰 ${gold}</div>
                `;
    };
    if (localInfo) localInfo.innerHTML = formatInfo(localData, localData ? localData.timestamp : null);
    if (cloudInfo) cloudInfo.innerHTML = formatInfo(cloudData, cloudTime);

    // Store temp data
    this.game.tempCloudData = cloudData;
    modal.classList.add('active');
  }
}
if (typeof window !== 'undefined') {}
