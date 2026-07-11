/**
 * Runtime config defaults.
 *
 * Keep deploy-safe defaults here. Do not commit private credentials or
 * environment-specific server URLs.
 *
 * For local development, either:
 * - set localStorage.theDefierServerConfig at runtime; or
 * - copy `bmob.config.example.js` outside version control and inject it in
 *   your own deployment shell before the app bundle.
 */
(function () {
    if (typeof window === 'undefined') return;

    window.__THE_DEFIER_CONFIG__ = window.__THE_DEFIER_CONFIG__ || {};
    const productionHosts = new Set(['080305.xyz', 'www.080305.xyz']);
    const currentHost = window.location && typeof window.location.hostname === 'string'
        ? window.location.hostname
        : '';
    const productionBaseUrl = productionHosts.has(currentHost) && window.location.origin
        ? window.location.origin
        : '';

    window.__THE_DEFIER_CONFIG__.backend = window.__THE_DEFIER_CONFIG__.backend || {
        provider: 'server'
    };

    window.__THE_DEFIER_CONFIG__.bmob = window.__THE_DEFIER_CONFIG__.bmob || {
        secretKey: '',
        securityCode: '',
        masterKey: ''
    };

    window.__THE_DEFIER_CONFIG__.server = window.__THE_DEFIER_CONFIG__.server || {
        baseUrl: productionBaseUrl,
        authPathPrefix: '/api/auth',
        savePathPrefix: '/api/saves',
        userPathPrefix: '/api/user',
        ghostPathPrefix: '/api/ghosts',
        seasonOpsPathPrefix: '/api/season-ops'
    };
})();
