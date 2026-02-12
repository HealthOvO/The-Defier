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
        secretKey: '259e1a51585d4437',
        securityCode: '1234567891011121',
        masterKey: ''
    };
})();

