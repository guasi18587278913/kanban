module.exports = [
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/tags-manifest.external.js [external] (next/dist/server/lib/incremental-cache/tags-manifest.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/tags-manifest.external.js", () => require("next/dist/server/lib/incremental-cache/tags-manifest.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[project]/src/config/index.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Load .env files for scripts (tsx/ts-node) - but NOT in Edge Runtime or browser
// This ensures scripts can read DATABASE_URL and other env vars
// Check for real Node.js environment by looking at global 'process' properties
__turbopack_context__.s([
    "envConfigs",
    ()=>envConfigs
]);
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
const envConfigs = {
    app_url: ("TURBOPACK compile-time value", "http://localhost:3000") ?? 'http://localhost:3000',
    app_name: ("TURBOPACK compile-time value", "ShipAny Two") ?? 'ShipAny App',
    theme: ("TURBOPACK compile-time value", "default") ?? 'default',
    appearance: ("TURBOPACK compile-time value", "system") ?? 'system',
    locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en',
    database_url: process.env.DATABASE_URL ?? '',
    database_provider: process.env.DATABASE_PROVIDER ?? 'postgresql',
    db_singleton_enabled: process.env.DB_SINGLETON_ENABLED || 'false',
    auth_url: process.env.AUTH_URL || ("TURBOPACK compile-time value", "http://localhost:3000") || '',
    auth_secret: process.env.AUTH_SECRET ?? ''
};
}),
"[project]/src/config/locale/index.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "defaultLocale",
    ()=>defaultLocale,
    "localeDetection",
    ()=>localeDetection,
    "localeMessagesPaths",
    ()=>localeMessagesPaths,
    "localeMessagesRootPath",
    ()=>localeMessagesRootPath,
    "localeNames",
    ()=>localeNames,
    "localePrefix",
    ()=>localePrefix,
    "locales",
    ()=>locales
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/config/index.ts [middleware] (ecmascript)");
;
const localeNames = {
    en: 'English',
    zh: '中文'
};
const locales = [
    'en',
    'zh'
];
const defaultLocale = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envConfigs"].locale;
const localePrefix = 'as-needed';
const localeDetection = false;
const localeMessagesRootPath = '@/config/locale/messages';
const localeMessagesPaths = [
    'common',
    'landing',
    'showcases',
    'blog',
    'pricing',
    'settings/sidebar',
    'settings/profile',
    'settings/security',
    'settings/billing',
    'settings/payments',
    'settings/credits',
    'settings/apikeys',
    'admin/sidebar',
    'admin/users',
    'admin/roles',
    'admin/permissions',
    'admin/categories',
    'admin/posts',
    'admin/payments',
    'admin/subscriptions',
    'admin/credits',
    'admin/settings',
    'admin/apikeys',
    'admin/ai-tasks',
    'admin/chats',
    'ai/music',
    'ai/chat',
    'ai/image',
    'activity/sidebar',
    'activity/ai-tasks',
    'activity/chats'
];
}),
"[project]/src/core/i18n/config.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "routing",
    ()=>routing
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$2d$intl$40$4$2e$3$2e$6_next$40$16$2e$0$2e$0_$40$babel$2b$core$40$7$2e$28$2e$4_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_babel$2d$plugin$2d$re_20adf6a8d80b548bb2c65a00364ce7f7$2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$routing$2f$defineRouting$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__default__as__defineRouting$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next-intl@4.3.6_next@16.0.0_@babel+core@7.28.4_@opentelemetry+api@1.9.0_babel-plugin-re_20adf6a8d80b548bb2c65a00364ce7f7/node_modules/next-intl/dist/esm/development/routing/defineRouting.js [middleware] (ecmascript) <export default as defineRouting>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$locale$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/config/locale/index.ts [middleware] (ecmascript)");
;
;
const routing = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$2d$intl$40$4$2e$3$2e$6_next$40$16$2e$0$2e$0_$40$babel$2b$core$40$7$2e$28$2e$4_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_babel$2d$plugin$2d$re_20adf6a8d80b548bb2c65a00364ce7f7$2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$routing$2f$defineRouting$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__default__as__defineRouting$3e$__["defineRouting"])({
    locales: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$locale$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["locales"],
    defaultLocale: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$locale$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["defaultLocale"],
    localePrefix: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$locale$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["localePrefix"],
    localeDetection: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$locale$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["localeDetection"]
});
}),
"[project]/src/proxy.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "proxy",
    ()=>proxy
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$0_$40$babel$2b$core$40$7$2e$28$2e$4_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_babel$2d$plugin$2d$react$2d$compiler$40$1$2e$0_6bc289d4c207a4b31a4838b02d822d84$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.0.0_@babel+core@7.28.4_@opentelemetry+api@1.9.0_babel-plugin-react-compiler@1.0_6bc289d4c207a4b31a4838b02d822d84/node_modules/next/server.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$better$2d$auth$40$1$2e$3$2e$9_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/better-auth@1.3.9_react-dom@19.2.0_react@19.2.0__react@19.2.0/node_modules/better-auth/dist/cookies/index.mjs [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$better$2d$auth$40$1$2e$3$2e$9_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$better$2d$auth$2f$dist$2f$shared$2f$better$2d$auth$2e$UfVWArIB$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__f__as__getSessionCookie$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/better-auth@1.3.9_react-dom@19.2.0_react@19.2.0__react@19.2.0/node_modules/better-auth/dist/shared/better-auth.UfVWArIB.mjs [middleware] (ecmascript) <export f as getSessionCookie>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$2d$intl$40$4$2e$3$2e$6_next$40$16$2e$0$2e$0_$40$babel$2b$core$40$7$2e$28$2e$4_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_babel$2d$plugin$2d$re_20adf6a8d80b548bb2c65a00364ce7f7$2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$middleware$2f$middleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next-intl@4.3.6_next@16.0.0_@babel+core@7.28.4_@opentelemetry+api@1.9.0_babel-plugin-re_20adf6a8d80b548bb2c65a00364ce7f7/node_modules/next-intl/dist/esm/development/middleware/middleware.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$core$2f$i18n$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/core/i18n/config.ts [middleware] (ecmascript)");
;
;
;
;
const intlMiddleware = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$2d$intl$40$4$2e$3$2e$6_next$40$16$2e$0$2e$0_$40$babel$2b$core$40$7$2e$28$2e$4_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_babel$2d$plugin$2d$re_20adf6a8d80b548bb2c65a00364ce7f7$2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$middleware$2f$middleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["default"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$core$2f$i18n$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["routing"]);
async function proxy(request) {
    const { pathname } = request.nextUrl;
    // Handle internationalization first
    const intlResponse = intlMiddleware(request);
    // Extract locale from pathname
    const locale = pathname.split('/')[1];
    const isValidLocale = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$core$2f$i18n$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["routing"].locales.includes(locale);
    const pathWithoutLocale = isValidLocale ? pathname.slice(locale.length + 1) : pathname;
    // Only check authentication for admin routes
    if (pathWithoutLocale.startsWith('/admin') || pathWithoutLocale.startsWith('/settings') || pathWithoutLocale.startsWith('/activity')) {
        // Check if session cookie exists
        const sessionCookie = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$better$2d$auth$40$1$2e$3$2e$9_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$better$2d$auth$2f$dist$2f$shared$2f$better$2d$auth$2e$UfVWArIB$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__f__as__getSessionCookie$3e$__["getSessionCookie"])(request);
        // If no session token found, redirect to sign-in
        if (!sessionCookie) {
            const signInUrl = new URL(isValidLocale ? `/${locale}/sign-in` : '/sign-in', request.url);
            // Add the current path (including search params) as callback - use relative path for multi-language support
            const callbackPath = pathWithoutLocale + request.nextUrl.search;
            signInUrl.searchParams.set('callbackUrl', callbackPath);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$0_$40$babel$2b$core$40$7$2e$28$2e$4_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_babel$2d$plugin$2d$react$2d$compiler$40$1$2e$0_6bc289d4c207a4b31a4838b02d822d84$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(signInUrl);
        }
    // For admin routes, we need to check RBAC permissions
    // Note: Full permission check happens in the page/API route level
    // This is a lightweight session check to prevent unauthorized access
    // The detailed permission check (admin.access and specific permissions)
    // will be done in the layout or individual pages using requirePermission()
    }
    intlResponse.headers.set('x-pathname', request.nextUrl.pathname);
    intlResponse.headers.set('x-url', request.url);
    // For all other routes (including /, /sign-in, /sign-up, /sign-out), just return the intl response
    return intlResponse;
}
const config = {
    matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)'
};
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__737f4c37._.js.map