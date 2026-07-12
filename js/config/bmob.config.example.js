/**
 * Example runtime override.
 *
 * Copy values from this file into your private deployment script or browser
 * localStorage. Do not commit real credentials or production-only URLs.
 */
(function () {
    if (typeof window === 'undefined') return;

    window.__THE_DEFIER_CONFIG__ = window.__THE_DEFIER_CONFIG__ || {};

    window.__THE_DEFIER_CONFIG__.backend = {
        provider: 'server'
    };

    window.__THE_DEFIER_CONFIG__.server = {
        baseUrl: 'http://127.0.0.1:9000',
        authPathPrefix: '/api/auth',
        savePathPrefix: '/api/saves',
        userPathPrefix: '/api/user',
        ghostPathPrefix: '/api/ghosts',
        seasonOpsPathPrefix: '/api/season-ops',
        challengeLadderPathPrefix: '/api/challenge-ladder',
        worldRiftPathPrefix: '/api/world-rift'
    };

    window.__THE_DEFIER_CONFIG__.bmob = {
        secretKey: '',
        securityCode: '',
        masterKey: ''
    };
})();
