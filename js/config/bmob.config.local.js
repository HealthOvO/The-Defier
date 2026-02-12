/**
 * Local runtime config (safe default, no secrets committed).
 *
 * To enable cloud auth/save, fill in:
 * - secretKey
 * - securityCode
 *
 * Note:
 * - Do NOT put masterKey in browser code.
 * - AuthService will ignore masterKey even if provided.
 */
(function () {
    if (typeof window === 'undefined') return;

    window.__THE_DEFIER_CONFIG__ = window.__THE_DEFIER_CONFIG__ || {};
    window.__THE_DEFIER_CONFIG__.bmob = window.__THE_DEFIER_CONFIG__.bmob || {
        secretKey: '',
        securityCode: '',
        masterKey: ''
    };
})();

