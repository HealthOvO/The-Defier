import { Utils } from "../core/utils.js";
/**
 * ShopView
 * Handles rendering and interaction for the Shop screen.
 */

export class ShopView {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.containerId = 'shop-screen';
  }
  renderShop() {
    const activeTab = this.game.syncActiveShopTab();
    this.game.updateShopCurrencyDisplays();
    const tabBar = document.getElementById('shop-tab-bar');
    if (tabBar) {
      tabBar.innerHTML = '';
      Object.values(this.game.shopCatalog || {}).forEach(tab => {
        const btn = document.createElement('button');
        btn.className = `shop-tab-btn ${tab.id === this.game.shopActiveTab ? 'active' : ''}`;
        btn.type = 'button';
        btn.innerHTML = `<span class="tab-icon">${tab.icon}</span><span>${tab.label}</span>`;
        btn.onclick = () => this.game.switchShopTab(tab.id);
        tabBar.appendChild(btn);
      });
    }
    const summaryEl = document.getElementById('shop-tab-summary');
    if (summaryEl) {
      const rumors = this.game.ensureShopRumors();
      const advice = this.game.buildShopSpendRecommendation();
      const runPathProfile = typeof this.game.getRunPathShopProfile === 'function' ? this.game.getRunPathShopProfile() : null;
      let summaryText = activeTab?.summary || '暂无摘要。';
      if (this.game.shopActiveTab === 'contract') {
        summaryText = `以业果换取高波动收益。当前业果：${this.game.getStrategicCurrencyAmount('karma')}。`;
      } else if (this.game.shopActiveTab === 'rumor') {
        summaryText = rumors.nextRealmLabel ? `已锁定第 ${rumors.nextRealmTarget || '?'} 重路线：${rumors.nextRealmLabel}` : runPathProfile ? `花费天机锁定未来奖励与下一重天路线倾向。当前命途「${runPathProfile.name}」提供专属情报。` : '花费天机锁定未来奖励与下一重天路线倾向。';
      }
      const history = Array.isArray(rumors.history) && rumors.history.length > 0 ? `<div class="shop-summary-history">最近锁定：${rumors.history.slice(-2).join(' ｜ ')}</div>` : '';
      summaryEl.innerHTML = `
                <div class="shop-summary-title">${activeTab?.icon || '🏪'} ${activeTab?.label || '基础页'}</div>
                <div class="shop-summary-text">${summaryText}</div>
                <div class="shop-spend-advice tone-${advice.tone || 'save'}">
                    <span class="shop-advice-badge">${advice.action}</span>
                    <div class="shop-advice-text">${advice.reason}</div>
                    ${advice.forecast?.summary ? `<div class="shop-advice-forecast ${advice.forecast.danger || 'low'}">${advice.forecast.summary}</div>` : ''}
                    ${advice.economy ? `
                        <div class="shop-advice-economy">
                            <span class="shop-economy-chip ${advice.economy.status || 'tight'}">预算 ${advice.economy.budget}</span>
                            <span class="shop-economy-chip ${advice.economy.status || 'tight'}">储备线 ${advice.economy.reserveTarget}</span>
                            <span class="shop-economy-chip ${advice.economy.status || 'tight'}">建议单次 ≤ ${advice.economy.spendCeiling}</span>
                            <span class="shop-economy-chip ${advice.economy.status || 'tight'}">${advice.economy.statusLabel}</span>
                        </div>
                        <div class="shop-advice-note">${advice.economy.note}</div>
                    ` : ''}
                    <div class="shop-advice-meta">
                        <span>最佳卡牌：${advice.bestCard?.item?.card?.name || '暂无'}</span>
                        <span>最佳服务：${advice.bestService?.item?.name || '暂无'}</span>
                    </div>
                </div>
                ${history}
            `;
    }
    const cardSection = document.getElementById('shop-card-section');
    const cardTitle = document.getElementById('shop-card-section-title');
    const cardContainer = document.getElementById('shop-cards');
    if (cardTitle) cardTitle.textContent = activeTab?.cardTitle || '📜 卡牌出售';
    if (cardSection) cardSection.style.display = this.game.shopActiveTab === 'base' ? 'block' : 'none';
    if (cardContainer) {
      cardContainer.innerHTML = '';
      this.game.shopItems.forEach((item, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'shop-card-wrapper';
        const cardEl = Utils.createCardElement(item.card, index);
        cardEl.classList.add(`rarity-${item.card.rarity || 'common'}`);
        if (item.sold) cardEl.classList.add('sold');
        cardEl.style.cursor = 'zoom-in';
        cardEl.addEventListener('click', () => {
          const fit = this.game.evaluateShopCardDeckFit(item.card);
          Utils.showCardDetail(item.card, {
            sectionLabel: '商店详情',
            sourceLabel: activeTab?.label || '基础页',
            priceText: item.sold ? '已售出' : this.game.formatShopPrice(item),
            availabilityText: item.sold ? '已售出' : this.game.canAffordShopItem(item) ? '可购买' : '资源不足',
            usageHint: fit.reason,
            extraSummaryRows: fit.summaryRows,
            closeLabel: '返回商店'
          });
        });
        const priceBtn = document.createElement('div');
        priceBtn.className = `card-price ${this.game.canAffordShopItem(item) && !item.sold ? '' : 'cannot-afford'}`.trim();
        priceBtn.innerHTML = item.sold ? '已售出' : this.game.formatShopPrice(item);
        if (!item.sold) {
          priceBtn.addEventListener('click', () => this.game.buyItem('card', index));
          priceBtn.style.cursor = 'pointer';
        }
        wrapper.appendChild(cardEl);
        wrapper.appendChild(priceBtn);
        cardContainer.appendChild(wrapper);
      });
    }
    const serviceTitle = document.getElementById('shop-service-section-title');
    if (serviceTitle) serviceTitle.textContent = activeTab?.serviceTitle || '✨ 特殊服务';
    const serviceContainer = document.getElementById('shop-services-container');
    if (!serviceContainer) return;
    serviceContainer.innerHTML = '';
    if (!Array.isArray(this.game.shopServices) || this.game.shopServices.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'shop-empty-state';
      emptyState.textContent = '此页暂无可交易项目。';
      serviceContainer.appendChild(emptyState);
      return;
    }
    this.game.shopServices.forEach((service, index) => {
      const el = document.createElement('div');
      const currency = service.currency || 'gold';
      const isAffordable = this.game.canAffordShopItem(service);
      const fit = this.game.evaluateShopServiceFit(service);
      el.className = `shop-service currency-${currency}${service.riskLabel ? ' is-risky' : ''}`;
      el.id = `service-${service.id}`;
      if (service.sold) el.style.opacity = '0.5';
      const tags = [service.tagLabel ? {
        value: service.tagLabel,
        className: ''
      } : null, service.riskLabel ? {
        value: service.riskLabel,
        className: ''
      } : null, fit?.label ? {
        value: fit.label,
        className: `fit-${fit.label === '高适配' ? 'high' : fit.label === '中适配' ? 'mid' : 'low'}`
      } : null].filter(Boolean).map(entry => `<span class="shop-service-tag ${entry.className}">${entry.value}</span>`).join('');
      el.innerHTML = `
                <div class="service-icon">${service.icon}</div>
                <div class="service-info">
                    <div class="service-name-row">
                        <div class="service-name">${service.name}</div>
                        <div class="service-tags">${tags}</div>
                    </div>
                    <div class="service-desc">${service.desc}</div>
                    <div class="service-fit-note">${fit.reason}</div>
                </div>
                <button class="buy-btn ${isAffordable && !service.sold ? '' : 'disabled'}">
                    <span class="price">${service.sold ? '已售出' : this.game.formatShopPrice(service)}</span>
                </button>
            `;
      if (!service.sold) {
        const btn = el.querySelector('.buy-btn');
        btn.addEventListener('click', () => this.game.buyItem('service', index));
      }
      serviceContainer.appendChild(el);
    });
  }
}

// Temporary export mechanism
if (typeof window !== 'undefined') {}