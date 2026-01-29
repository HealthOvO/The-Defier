/**
 * The Defier - Pavilion of Heavens Items
 * 诸天阁商品列表 (PVP Shop)
 */

window.PVP_SHOP_ITEMS = {
    cards: [
        {
            id: 'secret_manual_1',
            type: 'card',
            name: '虚空破碎',
            cost: 2,
            icon: '🌌',
            rarity: 'legendary',
            description: '对所有敌人造成 30 点伤害，无视护盾。',
            price: 500, // Dao Coins
            stock: 1,
            data: {
                // Card definition for unlocking
                id: 'void_shatter',
                name: '虚空破碎',
                type: 'attack',
                cost: 2,
                effects: [{ type: 'penetrate', value: 30, target: 'all' }]
            }
        },
        {
            id: 'secret_manual_2',
            type: 'card',
            name: '天道庇护',
            cost: 1,
            icon: '🛡️',
            rarity: 'epic',
            description: '获得 20 点护盾，下回合保留护盾。',
            price: 300,
            stock: 1,
            data: {
                id: 'heavenly_protection',
                name: '天道庇护',
                type: 'skill',
                cost: 1,
                effects: [{ type: 'block', value: 20 }, { type: 'buff', buffType: 'retainBlock', value: 1 }]
            }
        }
    ],
    items: [
        {
            id: 'item_reset_stats',
            type: 'consumable',
            name: '洗髓丹',
            icon: '💊',
            description: '重置所有属性点，重新分配。',
            price: 1000,
            stock: 5,
            action: 'resetStats'
        }
    ],
    cosmetics: [
        {
            id: 'skin_void_walker',
            type: 'skin',
            name: '法相·虚空行者',
            icon: '👤',
            description: '解锁“虚空行者”角色外观。',
            price: 2000,
            stock: 1,
            skinId: 'void_walker'
        },
        {
            id: 'title_supreme',
            type: 'title',
            name: '称号·独断万古',
            icon: '👑',
            description: '佩戴传说称号“独断万古”。',
            price: 5000,
            stock: 1,
            titleId: 'supreme_ruler'
        }
    ]
};
