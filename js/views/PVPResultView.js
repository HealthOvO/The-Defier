export class PVPResultView {
    constructor(gameInstance) {
        this.game = gameInstance;
    }

    renderPVPResultReview(review = null) {
        const panel = document.getElementById('pvp-result-review');
        const kicker = document.getElementById('pvp-result-review-kicker');
        const title = document.getElementById('pvp-result-review-title');
        const subtitle = document.getElementById('pvp-result-review-subtitle');
        const chip = document.getElementById('pvp-result-review-chip');
        const summary = document.getElementById('pvp-result-review-summary');
        const focusLabel = document.getElementById('pvp-result-review-focus-label');
        const focusValue = document.getElementById('pvp-result-review-focus-value');
        const nextLabel = document.getElementById('pvp-result-review-next-label');
        const nextValue = document.getElementById('pvp-result-review-next-value');
        const foot = document.getElementById('pvp-result-review-foot');
        if (!panel || !kicker || !title || !subtitle || !chip || !summary || !focusLabel || !focusValue || !nextLabel || !nextValue || !foot) {
            this.game.pvpResultReview = review && typeof review === 'object' ? review : null;
            return;
        }

        const safeReview = review && typeof review === 'object'
            ? review
            : {
                outcomeId: '',
                kicker: '赛后复盘',
                title: '本局题面会在这里回看',
                subtitle: 'DRI、主轴与对手画像会同步写入复盘卡。',
                chipText: 'DRI 0 · 可控',
                chipTierId: 'controlled',
                summary: '当你完成一场 PVP，对局复盘会总结这把到底是越压破局，还是哪里读题失拍。',
                focusTitle: '判词',
                focusText: '系统会结合这场的风险主轴给出一句更具体的复盘提示。',
                nextTitle: '下一把',
                nextText: '这里会告诉你下一把应该优先保留什么资源与节拍。',
                economyLine: '对局结束后会同步展示道韵变化与天道币收益。',
                dangerLine: '',
                dangerProfile: null,
                tags: []
            };

        panel.dataset.tier = safeReview.chipTierId || 'controlled';
        kicker.textContent = safeReview.kicker || '赛后复盘';
        title.textContent = safeReview.title || '本局题面会在这里回看';
        subtitle.textContent = safeReview.subtitle || '';
        chip.textContent = safeReview.chipText || 'DRI 0 · 可控';
        chip.className = `pvp-result-review-chip tier-${safeReview.chipTierId || 'controlled'}`;
        summary.textContent = safeReview.summary || '';
        focusLabel.textContent = safeReview.focusTitle || '判词';
        focusValue.textContent = safeReview.focusText || '';
        nextLabel.textContent = safeReview.nextTitle || '下一把';
        nextValue.textContent = safeReview.nextText || '';
        foot.textContent = safeReview.economyLine || safeReview.dangerLine || '';
        this.game.pvpResultReview = safeReview;
    }


}

if (typeof window !== 'undefined') {
    window.PVPResultView = PVPResultView;
}
