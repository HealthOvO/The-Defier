/**
 * Local runtime config (safe default, no secrets committed).
 *
 * To enable cloud auth/save via Bmob, fill in:
 * - secretKey
 * - securityCode
 *
 * To enable your custom backend server, fill in:
 * - backend.provider: 'server'
 * - server.baseUrl: 'https://your-server.com'
 */
(function () {
    if (typeof window === 'undefined') return;

    window.__THE_DEFIER_CONFIG__ = window.__THE_DEFIER_CONFIG__ || {};

    // 默认后端供应商: 'bmob' 或 'server'
    window.__THE_DEFIER_CONFIG__.backend = {
        provider: 'server'
    };

    window.__THE_DEFIER_CONFIG__.bmob = window.__THE_DEFIER_CONFIG__.bmob || {
        secretKey: '259e1a51585d4437',
        securityCode: '1234567891011121',
        masterKey: ''
    };

    window.__THE_DEFIER_CONFIG__.server = window.__THE_DEFIER_CONFIG__.server || {
        baseUrl: 'https://080305.xyz',
        authPathPrefix: '/api/auth',
        savePathPrefix: '/api/saves',
        userPathPrefix: '/api/user',
        ghostPathPrefix: '/api/ghosts'
    };
})();

