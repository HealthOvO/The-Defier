/**
 * The Defier - 关卡配置数据
 * 定义每个天域(Realm)的层数结构
 */

const LEVEL_CONFIG = {
    // 默认配置 (如果不匹配任何规则)
    default: {
        rows: 8,
        nodesPerRow: [2, 3] // 在2和3之间循环
    },

    // 获取特定天域的配置
    getRealmConfig(realm) {
        realm = parseInt(realm) || 1;

        // 1-3重天 (前期): 8层
        if (realm <= 3) {
            return {
                rows: 8,
                // 前期简单一点
                nodesSequence: [2, 2, 3, 2, 2, 3, 2] // 最后一层必须是BOSS(单独处理)
            };
        }

        // 4-9重天 (中期): 12层
        if (realm <= 9) {
            return {
                rows: 12,
                nodesSequence: [2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2]
            };
        }

        // 10-18重天 (后期): 15层
        return {
            rows: 15,
            nodesSequence: [2, 3, 3, 2, 3, 3, 2, 3, 3, 2, 3, 3, 2, 2]
        };
    },

    // 生成某一行的节点数量
    getNodesCountOriginal(row, totalRows, realm) {
        // 旧逻辑兼容 backup
        if (row === 0) return 2;
        if (row === totalRows - 1) return 1; // Boss
        return Math.random() > 0.5 ? 3 : 2;
    }
};

// 导出到全局
window.LEVEL_CONFIG = LEVEL_CONFIG;
