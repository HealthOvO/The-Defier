/**
 * Runtime config defaults.
 *
 * Keep deploy-safe defaults here. For private/local overrides, create
 * `js/config/bmob.config.local.js`; local config files are ignored by Git.
 */
(function () {
    if (typeof window === 'undefined') return;

    window.__THE_DEFIER_CONFIG__ = window.__THE_DEFIER_CONFIG__ || {};

    window.__THE_DEFIER_CONFIG__.backend = window.__THE_DEFIER_CONFIG__.backend || {
        provider: 'server'
    };

    window.__THE_DEFIER_CONFIG__.bmob = window.__THE_DEFIER_CONFIG__.bmob || {
        secretKey: '',
        securityCode: '',
        masterKey: ''
    };

    window.__THE_DEFIER_CONFIG__.server = window.__THE_DEFIER_CONFIG__.server || {
        baseUrl: '',
        authPathPrefix: '/api/auth',
        savePathPrefix: '/api/saves',
        userPathPrefix: '/api/user',
        ghostPathPrefix: '/api/ghosts'
    };
})();
