// ==UserScript==
// @name         Sports.ru Clean
// @namespace    https://www.sports.ru/
// @version      1.3.33
// @description  Cleaner interface for Sports.ru
// @author       amd64fox
// @updateURL    https://raw.githubusercontent.com/amd64fox/sports-ru-clean/main/sports-ru-clean-dark.user.js
// @downloadURL  https://raw.githubusercontent.com/amd64fox/sports-ru-clean/main/sports-ru-clean-dark.user.js
// @match        https://sports.ru/*
// @match        https://www.sports.ru/*
// @match        https://m.sports.ru/*
// @match        https://video.sports.ru/embed/*
// @match        https://video.sports.ru/video/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      sports.ru
// @connect      www.sports.ru
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'sports-ru-clean-dark-state-v1';
    const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
    const NEGATIVE_CACHE_TTL = 6 * 60 * 60 * 1000;
    const AUTHOR_CACHE_VERSION = 3;
    const MAX_HIDDEN_URLS = 500;
    const MAX_AUTHOR_CACHE = 200;
    const BLOCKED_ANALYTICS_GRAPHQL_OPERATIONS = new Set(['CreateEvent', 'TrackWidget']);
    const state = normalizeState(GM_getValue(STORAGE_KEY, null));
    let analyticsBlockingActive = state.analyticsBlockingEnabled;
    let analyticsDefuserControl = null;
    let videoAdControl = null;

    if (analyticsBlockingActive) {
        installAnalyticsDefusers();
    }
    if (isVideoPlayerContext()) {
        if (state.adBlockingEnabled) {
            installVideoAdBypass();
        }
        return;
    }
    if (window.self !== window.top) {
        return;
    }

    const AD_NOTICE_BACKUP_KEY = `sports-ru-clean-dark-ad-notice-backup-v1:${location.origin}`;
    const AD_NOTICE_VALUES = {
        'sports:views:anti-adblock:shower': 'null',
        's-presence-notification-first-time': '99999999999999'
    };
    const UI_ATTRIBUTE = 'data-sru-clean-dark-ui';
    const THEME_ATTRIBUTE = 'data-sru-clean-dark-theme';
    const PAGE_ATTRIBUTE = 'data-sru-clean-dark-page';
    const AD_FILTER_ATTRIBUTE = 'data-sru-clean-dark-block-ads';
    const PROMO_FILTER_ATTRIBUTE = 'data-sru-clean-dark-hide-promos';
    const EMPTY_SIDEBAR_ATTRIBUTE = 'data-sru-clean-dark-empty-sidebar';
    const BLOCKED_SITE_ARTICLE_ATTRIBUTE = 'data-sru-clean-dark-site-author-blocked';
    const HIDDEN_TOP_PREPAINT_STYLE_ID = 'sru-clean-dark-hidden-top-prepaint';

    const AD_NODE_SELECTOR = [
        'ad-slot',
        '.ad-slot',
        '[data-banner-type]',
        '[data-testid="top-wrapper"]',
        '.ad-root-view',
        '.adfox_placeholder',
        '#Adfox_Banner',
        'div[id^="AdFox_banner_"]',
        'aside[data-control="Banners.DFP"]',
        'article[data-article-type="advert_material"]',
        'div[data-control="Common.RbPromo"]',
        'div[data-control="Common.BookmakerTeaser"]',
        '.mc-layout__top-ads',
        '.teaser-before-links__adv-label',
        '.news-page__branding',
        '.post-page__branding',
        '.ad-banner-layout',
        '.ad-banner',
        '.place-for-ad',
        '.in-read-wrapper',
        '.right-banner-element',
        '.layout__branding',
        '.layout-branding',
        '.news-ad-inreads',
        '.comment-ads',
        '.post-content__write-post',
        '.webpush',
        '[data-control="Common.WebpushSubscribe"]',
        ':is(.document-card,.news-layout__frame,.frame):has(a:is([href*="redirect.appmetrica.yandex.com/serve/"],[href*="sirena.world/"],[href*="beterabelarus"]))',
        'div.news-layout__frame:has(> div.ad-slot)',
        '.frame:has(> div[data-banner-type])',
        '.footer-banner-layout',
        '.top-ad__wrapper',
        '.banner-in-material',
        '.rb-promo',
        '.nav-left-banner',
        '.navigation-left-banner',
        '.navigation-right-column-banner',
        '.navigation-ad-banner',
        '.bookmaker-bonuses',
        '.b-dfp-banner',
        '.b-adv-carousel-wrap',
        '.g-banner-context-wrap',
        '.zen-adload-ad-wrapper',
        '.geo-banner',
        '#ya-antiadblock-notification-container',
        '#s-presence-notification-container',
        '.header__smart-app',
        '.smartbanner',
        '[class^="smart-banner"]',
        '[class*=" smart-banner"]',
        '[class^="branding-collapsing"]',
        '[class*=" branding-collapsing"]',
        '[class^="branding-sticker"]',
        '[class*=" branding-sticker"]',
        '.media-promo',
        '#media-promo-mount-point',
        'ins.adsbygoogle',
        '[id^="adfox_"]',
        '[id^="yandex_rtb_"]',
        'iframe[src*="/ad-widgets/"]',
        'iframe[src*="an.yandex.ru"]',
        'iframe[src*="yandex.ru/ads/"]',
        'iframe[src*="adfox"]',
        'iframe[src*="doubleclick.net"]',
        'iframe[src*="googlesyndication.com"]',
        'iframe[src*="googleadservices.com"]'
    ].join(',');

    const AD_LINK_SELECTOR = [
        'a[href*="yandex.ru/adfox/"]',
        'a[href*="an.yandex.ru/"]',
        'a[href*="doubleclick.net/"]',
        'a[href*="googleadservices.com/"]',
        'a[href*="googlesyndication.com/"]'
    ].join(',');

    const KNOWN_AD_WRAPPER_SELECTOR = [
        'ad-slot',
        '.ad-slot',
        '[data-banner-type]',
        '[data-testid="top-wrapper"]',
        '.post-page__branding',
        '.news-page__branding',
        '.ad-banner-layout',
        '.ad-banner',
        '.place-for-ad',
        '.in-read-wrapper',
        '.right-banner-element',
        '.layout__branding',
        '.layout-branding',
        '.news-ad-inreads',
        '.comment-ads',
        '.post-content__write-post',
        '.webpush',
        '[data-control="Common.WebpushSubscribe"]',
        '.footer-banner-layout',
        '.top-ad__wrapper',
        '.banner-in-material',
        '.rb-promo',
        '.nav-left-banner',
        '.navigation-left-banner',
        '.navigation-right-column-banner',
        '.navigation-ad-banner',
        '.bookmaker-bonuses',
        '[class^="branding-collapsing"]',
        '[class*=" branding-collapsing"]',
        '[class^="branding-sticker"]',
        '[class*=" branding-sticker"]',
        '.media-promo',
        '#media-promo-mount-point'
    ].join(',');

    const PROMO_WRAPPER_SELECTOR = [
        '.super-top__article',
        '.material-list__item',
        '.aside-news-list__item',
        '.document-card-list__item',
        '.document-card',
        '.news-layout__frame',
        '.short-news > p',
        '.post-body .sb-paragraph:has(> a:only-child[href])',
        '.post-body .sb-paragraph:has(> a:only-child[href]) + figure.sb-image',
        '.post-body a.sb-linked-image[href]'
    ].join(',');

    const PROMO_PATH_PREFIXES = [
        'games',
        'special',
        'specials',
        'invisible',
        'osnova',
        'picker',
        'fantasy',
        'predictor'
    ];

    const PROMO_URL_ORIGINS = [
        '',
        'https://sports.ru',
        'https://www.sports.ru',
        'https://m.sports.ru'
    ];

    const SPONSORED_APPMETRICA_LINK_SELECTOR = '[href*="redirect.appmetrica.yandex.com/serve/" i][rel~="sponsored" i]';

    const PROMO_HREF_PREPAINT_SELECTOR = [
        '[href^="https://specials.sports.ru/" i]',
        '[href^="//specials.sports.ru/" i]',
        '[href^="https://sirena.sports.ru/" i]',
        '[href^="//sirena.sports.ru/" i]',
        '[href^="https://sirena.world/" i]',
        '[href^="//sirena.world/" i]',
        SPONSORED_APPMETRICA_LINK_SELECTOR,
        '[href*="redirect.appmetrica.yandex.com/serve/" i][href*="campaign_id=wccontest" i]',
        ...PROMO_PATH_PREFIXES.flatMap((path) => PROMO_URL_ORIGINS.flatMap((origin) => {
            const base = `${origin}/${path}`;
            return [
                `[href="${base}" i]`,
                `[href^="${base}/" i]`,
                `[href^="${base}?" i]`,
                `[href^="${base}#" i]`
            ];
        }))
    ].join(',');

    const SITE_ARTICLE_WRAPPER_SELECTOR = [
        '.material-list__item',
        '.aside-news-list__item',
        '.document-card-list__item',
        '.document-card',
        '.blog-posts-list__item',
        '.official-blogs__item',
        '.post-preview',
        '.news-list.blog-post-list > .anons',
        '.blog-post-list > .anons'
    ].join(',');

    const SITE_ARTICLE_LINK_SELECTORS = [
        '.material-list__title a[href]',
        'a.material-list__title-link[href]',
        '.document-card__title a[href]',
        'a.document-card__title-link[href]',
        '.blog-posts-list__title a[href]',
        '.official-blogs__title a[href]',
        'a.post-preview__title[href]',
        '.anons h2 a[href]',
        '.anons h3 a[href]',
        'h2 > a[href]',
        'h3 > a[href]',
        'a[href*=".html"]'
    ];

    const hiddenTopUrls = new Set(state.hiddenTopUrls);
    const cardState = new WeakMap();
    const siteArticleState = new WeakMap();
    const lookupPromises = new Map();
    const lookupQueue = [];
    const queuedRoots = new Set();
    const originalFilterAria = new WeakMap();
    let activeLookups = 0;
    let scanScheduled = false;
    let openMenu = null;
    let openProfileMenu = null;
    let toastTimer = 0;
    let settingsReturnFocus = null;
    let settingsBodyOverflow = '';
    let settingsResetTimer = 0;
    let themeAnimationTimer = 0;
    let hiddenTopPrepaintStyle = null;
    let adNetworkDefusersInstalled = false;
    let lastProcessedPathname = location.pathname;

    applyTheme();
    GM_addStyle(buildStyles());
    updateHiddenTopPrepaintStyle();
    applyAdBlockingRuntime();
    installStorageSync();
    installGlobalListeners();
    startObserver();
    queueScan(document.documentElement);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => queueScan(document.documentElement), { once: true });
    }

    window.addEventListener('load', () => {
        applyAnalyticsBlockingRuntime();
        queueScan(document.documentElement);
        window.setTimeout(() => queueScan(document.documentElement), 1500);
        window.setTimeout(() => queueScan(document.documentElement), 5000);
    }, { once: true });

    function normalizeState(value) {
        const input = value && typeof value === 'object' ? value : {};
        const blockedTopAuthors = normalizeProfileMap(input.blockedTopAuthors);
        const authorCache = normalizeAuthorCache(input.authorCache);
        const hiddenTopArticles = input.hiddenTopArticles && typeof input.hiddenTopArticles === 'object'
            ? input.hiddenTopArticles
            : {};
        const blockedSiteAuthors = normalizeProfileMap(input.blockedSiteAuthors);

        return {
            version: 2,
            theme: input.theme === 'light' ? 'light' : 'dark',
            adBlockingEnabled: input.adBlockingEnabled !== false,
            hidePromosEnabled: input.hidePromosEnabled !== false,
            analyticsBlockingEnabled: input.analyticsBlockingEnabled !== false,
            hiddenTopUrls: Array.isArray(input.hiddenTopUrls)
                ? input.hiddenTopUrls.filter((item) => typeof item === 'string').slice(-MAX_HIDDEN_URLS)
                : [],
            hiddenTopArticles,
            blockedTopAuthors,
            blockedSiteAuthors,
            authorCache
        };
    }

    function normalizeProfileMap(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        const entries = [];
        for (const [profileId, profile] of Object.entries(value)) {
            if (!/^\d+$/.test(profileId) || !profile || typeof profile !== 'object') {
                continue;
            }
            const name = String(profile.name || `Пользователь ${profileId}`)
                .trim()
                .replace(/\s+/g, ' ')
                .slice(0, 160);
            entries.push([profileId, {
                name: name || `Пользователь ${profileId}`,
                profileUrl: `https://www.sports.ru/profile/${profileId}/`
            }]);
        }
        return Object.fromEntries(entries.slice(-500));
    }

    function normalizeAuthorCache(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        const entries = [];
        for (const [cacheKey, entry] of Object.entries(value)) {
            if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.expiresAt)) {
                continue;
            }
            try {
                const url = new URL(`https://${cacheKey}`);
                const hostname = url.hostname.toLowerCase();
                if ((hostname !== 'sports.ru' && !hostname.endsWith('.sports.ru')) || url.pathname === '/') {
                    continue;
                }
            } catch {
                continue;
            }
            if (entry.complete !== true
                || entry.authorsVersion !== AUTHOR_CACHE_VERSION
                || !Array.isArray(entry.authors)) {
                continue;
            }
            const rawAuthors = entry.authors;
            const authors = normalizeAuthorList(rawAuthors);
            if (rawAuthors.length > 0 && authors.length === 0) {
                continue;
            }
            entries.push([cacheKey, {
                authors,
                complete: true,
                authorsVersion: AUTHOR_CACHE_VERSION,
                expiresAt: entry.expiresAt
            }]);
        }
        return Object.fromEntries(entries.slice(-MAX_AUTHOR_CACHE));
    }

    function normalizeAuthorList(value) {
        const input = Array.isArray(value) ? value : [];
        const authors = [];
        const ids = new Set();
        for (const item of input) {
            if (!item || typeof item !== 'object' || !/^\d+$/.test(String(item.id || ''))) {
                continue;
            }
            const id = String(item.id);
            if (ids.has(id)) {
                continue;
            }
            ids.add(id);
            const name = String(item.name || `Пользователь ${id}`)
                .trim()
                .replace(/\s+/g, ' ')
                .slice(0, 160);
            authors.push({
                id,
                name: name || `Пользователь ${id}`,
                profileUrl: `https://www.sports.ru/profile/${id}/`
            });
        }
        return authors.slice(0, 20);
    }

    function areAllAuthorsBlocked(authors, scope) {
        if (!Array.isArray(authors) || authors.length === 0) {
            return false;
        }
        return authors.every((author) => {
            if (scope === 'site') {
                return Boolean(state.blockedSiteAuthors[author.id]);
            }
            return Boolean(state.blockedTopAuthors[author.id] || state.blockedSiteAuthors[author.id]);
        });
    }

    function isArticleOnOwnAuthorProfile(authors) {
        const profileId = getProfileIdFromPath();
        return Boolean(profileId && Array.isArray(authors)
            && authors.some((author) => author.id === profileId));
    }

    function isVideoPlayerContext(value = location.href) {
        try {
            const url = new URL(value, location.href);
            return url.hostname.toLowerCase() === 'video.sports.ru'
                && /^\/(?:embed|video)\//i.test(url.pathname);
        } catch {
            return false;
        }
    }

    function extractUrlValue(value) {
        if (typeof value === 'string') {
            return value;
        }
        if (value && typeof value.url === 'string') {
            return value.url;
        }
        try {
            return value == null ? '' : String(value);
        } catch {
            return '';
        }
    }

    function isFetchRequestAborted(input, init) {
        return Boolean(init?.signal?.aborted || input?.signal?.aborted);
    }

    function getFetchRequestHeader(page, input, init, name) {
        try {
            if (init && Object.prototype.hasOwnProperty.call(init, 'headers')) {
                return new page.Headers(init.headers).get(name) || '';
            }
            return input?.headers?.get?.(name) || '';
        } catch {
            return '';
        }
    }

    function isAnalyticsRequestUrl(value, baseUrl = location.href) {
        try {
            const rawUrl = extractUrlValue(value);
            const url = new URL(rawUrl, baseUrl);
            const hostname = url.hostname.toLowerCase();
            const pathname = url.pathname.toLowerCase();

            if (hostname === 'www.googletagmanager.com') {
                return pathname === '/gtm.js' || pathname === '/gtag/js';
            }
            if ([
                'www.google-analytics.com',
                'ssl.google-analytics.com',
                'analytics.google.com',
                'region1.google-analytics.com',
                'stats.g.doubleclick.net'
            ].includes(hostname)) {
                return true;
            }
            if (hostname === 'mc.yandex.ru' || hostname === 'mc.yandex.com') {
                return true;
            }
            if (hostname === 't.sports.ru') {
                return pathname.startsWith('/manager/');
            }
            if (hostname === 'rum.sports.ru') {
                return /^\/intake\/v\d+\/rum\/events\/?$/i.test(url.pathname);
            }
            if (hostname === 'sentry.sports.ru') {
                return /^\/api\/\d+\/(?:envelope|store|minidump|security)\/?$/i.test(url.pathname);
            }
            if (hostname === 'r.sports.ru') {
                return pathname === '/segments' || pathname.startsWith('/segments/');
            }
            if (hostname === 'recs.s5o.ru' || hostname === 'recs.yc-stage-s5o.ru') {
                const normalizedPath = pathname.replace(/\/+$/, '') || '/';
                return ['/match', '/match/merge', '/send'].includes(normalizedPath);
            }
            if (hostname === 'log.strm.yandex.ru') {
                return pathname === '/log' || pathname.startsWith('/log/');
            }
            if (hostname === 'impression.appmetrica.yandex.com') {
                return true;
            }
            if (hostname === 'amc.yandex.ru') {
                return pathname === '/show' || pathname.startsWith('/show/');
            }
            return hostname === 'www.facebook.com' && pathname === '/tr';
        } catch {
            return false;
        }
    }

    function isClickTrackingUrl(value, baseUrl = location.href) {
        try {
            const rawUrl = extractUrlValue(value);
            const url = new URL(rawUrl, baseUrl);
            const hostname = url.hostname.toLowerCase();
            return (hostname === 'yandex.ru' || hostname === 'yandex.com')
                && (url.pathname.startsWith('/clck/') || url.pathname.startsWith('/jclck/'));
        } catch {
            return false;
        }
    }

    function isBanditTrackingUrl(value, baseUrl = location.href) {
        try {
            const rawUrl = extractUrlValue(value);
            const url = new URL(rawUrl, baseUrl);
            const normalizedPath = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
            return url.hostname.toLowerCase() === 'r.sports.ru' && normalizedPath === '/bandit';
        } catch {
            return false;
        }
    }

    function isRecommendationEndpointUrl(value, baseUrl = location.href) {
        try {
            const rawUrl = extractUrlValue(value);
            const url = new URL(rawUrl, baseUrl);
            const normalizedPath = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
            return url.hostname.toLowerCase() === 'r.sports.ru'
                && ['/recommender', '/bandit'].includes(normalizedPath);
        } catch {
            return false;
        }
    }

    function getAnalyticsResponseKind(value, baseUrl = location.href) {
        try {
            const rawUrl = extractUrlValue(value);
            const hostname = new URL(rawUrl, baseUrl).hostname.toLowerCase();
            return [
                'r.sports.ru',
                'recs.s5o.ru',
                'recs.yc-stage-s5o.ru'
            ].includes(hostname) ? 'json' : 'empty';
        } catch {
            return 'empty';
        }
    }

    function parseGraphqlOperation(body) {
        if (typeof body !== 'string') {
            return null;
        }
        try {
            const payload = JSON.parse(body);
            if (Array.isArray(payload) || typeof payload?.operationName !== 'string') {
                return null;
            }
            const operationName = payload.operationName;
            const signatures = {
                SponsorVideo: /\bquery\s+SponsorVideo\b[\s\S]*\bsponsorCampaign\s*\(/,
                CreateEvent: /\bmutation\s+CreateEvent\b[\s\S]*\bcreateEvent\s*\(/,
                TrackWidget: /\bmutation\s+TrackWidget\b[\s\S]*\btrackWidget\s*\(/
            };
            if (signatures[operationName]) {
                return typeof payload.query === 'string' && signatures[operationName].test(payload.query)
                    ? operationName
                    : null;
            }
            return operationName;
        } catch {
            return null;
        }
    }

    function sanitizeRecommendationPayload(body) {
        if (typeof body !== 'string') {
            return null;
        }
        try {
            const payload = JSON.parse(body);
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)
                || !Object.prototype.hasOwnProperty.call(payload, 'send_data')) {
                return null;
            }
            if (!Object.prototype.hasOwnProperty.call(payload, 'return_data') || payload.return_data == null) {
                return { blocked: true };
            }
            const sanitized = { ...payload };
            delete sanitized.send_data;
            return { blocked: false, body: JSON.stringify(sanitized) };
        } catch {
            return null;
        }
    }

    function inspectRecommendationRequest(page, input, init) {
        try {
            const rawUrl = typeof input === 'string' || input instanceof page.URL
                ? String(input)
                : input?.url;
            if (!rawUrl) {
                return null;
            }
            const url = new page.URL(rawUrl, page.location.href);
            if (!isRecommendationEndpointUrl(url.href, page.location.href)) {
                return null;
            }
            const method = String(init?.method || input?.method || 'GET').toUpperCase();
            if (method !== 'POST') {
                return null;
            }

            const buildResult = (body) => {
                const sanitized = sanitizeRecommendationPayload(body);
                if (!sanitized || sanitized.blocked) {
                    return sanitized;
                }
                if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
                    return { blocked: false, args: [input, { ...init, body: sanitized.body }] };
                }
                try {
                    return {
                        blocked: false,
                        args: [new page.Request(input, { body: sanitized.body })]
                    };
                } catch {
                    return null;
                }
            };

            if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
                return buildResult(init.body);
            }
            if (!input || typeof input.clone !== 'function' || input.bodyUsed) {
                return null;
            }
            return input.clone().text().then(buildResult, () => null);
        } catch {
            return null;
        }
    }

    function inspectGraphqlOperation(page, input, init) {
        try {
            const rawUrl = typeof input === 'string' || input instanceof page.URL
                ? String(input)
                : input?.url;
            if (!rawUrl) {
                return null;
            }
            const url = new page.URL(rawUrl, page.location.href);
            if (url.origin !== page.location.origin || url.pathname !== '/site/graphql') {
                return null;
            }
            const method = String(init?.method || input?.method || 'GET').toUpperCase();
            if (method !== 'POST') {
                return null;
            }
            if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
                return parseGraphqlOperation(init.body);
            }
            if (!input || typeof input.clone !== 'function' || input.bodyUsed) {
                return null;
            }
            return input.clone().text().then(parseGraphqlOperation, () => null);
        } catch {
            return null;
        }
    }

    function createBlockedAnalyticsResponse(page, operationName = '', requestUrl = '', viewerId = '') {
        if (operationName || getAnalyticsResponseKind(requestUrl, page.location.href) === 'json') {
            const operationData = operationName === 'CreateEvent'
                ? { createEvent: true }
                : (operationName === 'TrackWidget' ? { trackWidget: true } : {});
            const headers = new page.Headers({ 'content-type': 'application/json; charset=utf-8' });
            if (viewerId) {
                headers.set('x-viewerId', viewerId);
            }
            return new page.Response(JSON.stringify(operationName ? { data: operationData } : {}), {
                status: 200,
                headers
            });
        }
        return new page.Response(null, { status: 204 });
    }

    function installAnalyticsDefusers() {
        const page = typeof unsafeWindow === 'object' ? unsafeWindow : window;
        const marker = page.Symbol.for('sru-clean-dark.analytics-v1');
        const sharedControl = page[marker];
        if (sharedControl?.version === 1 && typeof sharedControl.setEnabled === 'function') {
            analyticsDefuserControl = sharedControl;
            sharedControl.setEnabled(analyticsBlockingActive);
            return;
        }
        if (analyticsDefuserControl) {
            analyticsDefuserControl.setEnabled(analyticsBlockingActive);
            return;
        }

        const control = {
            version: 1,
            enabled: analyticsBlockingActive,
            setEnabled(value) {
                this.enabled = Boolean(value);
            }
        };
        analyticsDefuserControl = control;
        try {
            if (!page[marker]) {
                Object.defineProperty(page, marker, { value: control });
            }
        } catch {
        }

        const originalFetch = page.fetch;
        if (typeof originalFetch === 'function') {
            const analyticsFetch = function (...args) {
                const input = args[0];
                if (!control.enabled || isFetchRequestAborted(input, args[1])) {
                    return Reflect.apply(originalFetch, page, args);
                }
                const rawUrl = typeof input === 'string' || input instanceof page.URL
                    ? String(input)
                    : input?.url;
                if (isAnalyticsRequestUrl(rawUrl, page.location.href)) {
                    return page.Promise.resolve(createBlockedAnalyticsResponse(page, '', rawUrl));
                }

                const sendRequest = (requestArgs) => {
                    if (!control.enabled) {
                        return Reflect.apply(originalFetch, page, args);
                    }
                    const inspected = inspectGraphqlOperation(page, requestArgs[0], requestArgs[1]);
                    const handleOperation = (operationName) => {
                        if (control.enabled && BLOCKED_ANALYTICS_GRAPHQL_OPERATIONS.has(operationName)) {
                            const viewerId = getFetchRequestHeader(
                                page,
                                requestArgs[0],
                                requestArgs[1],
                                'x-viewerId'
                            );
                            return page.Promise.resolve(
                                createBlockedAnalyticsResponse(page, operationName, '', viewerId)
                            );
                        }
                        return Reflect.apply(originalFetch, page, requestArgs);
                    };
                    return inspected && typeof inspected.then === 'function'
                        ? inspected.then(handleOperation, () => Reflect.apply(originalFetch, page, requestArgs))
                        : handleOperation(inspected);
                };

                const recommendation = inspectRecommendationRequest(page, input, args[1]);
                const handleRecommendation = (result) => {
                    if (!control.enabled) {
                        return Reflect.apply(originalFetch, page, args);
                    }
                    if (result?.blocked) {
                        return page.Promise.resolve(createBlockedAnalyticsResponse(page, '', rawUrl));
                    }
                    return sendRequest(result?.args || args);
                };
                return recommendation && typeof recommendation.then === 'function'
                    ? recommendation.then(handleRecommendation, () => sendRequest(args))
                    : handleRecommendation(recommendation);
            };
            try {
                page.fetch = analyticsFetch;
            } catch {
            }
        }

        const originalBeacon = page.navigator?.sendBeacon;
        if (typeof originalBeacon === 'function') {
            try {
                page.navigator.sendBeacon = function (url, data) {
                    if (control.enabled && (
                        isAnalyticsRequestUrl(url, page.location.href)
                        || isClickTrackingUrl(url, page.location.href)
                        || isBanditTrackingUrl(url, page.location.href)
                    )) {
                        return true;
                    }
                    return Reflect.apply(originalBeacon, this, [url, data]);
                };
            } catch {
            }
        }

        const xhrPrototype = page.XMLHttpRequest?.prototype;
        const originalXhrOpen = xhrPrototype?.open;
        const originalXhrSend = xhrPrototype?.send;
        if (typeof originalXhrOpen === 'function' && typeof originalXhrSend === 'function') {
            const xhrRequests = new WeakMap();
            try {
                xhrPrototype.open = function (method, url, ...rest) {
                    xhrRequests.set(this, { url, rest });
                    if (control.enabled && isAnalyticsRequestUrl(url, page.location.href)) {
                        const async = rest.length > 0 ? rest[0] : true;
                        return Reflect.apply(originalXhrOpen, this, [
                            'GET',
                            'data:application/json,%7B%7D',
                            async,
                            ...rest.slice(1)
                        ]);
                    }
                    return Reflect.apply(originalXhrOpen, this, [method, url, ...rest]);
                };
                xhrPrototype.send = function (body) {
                    const request = xhrRequests.get(this);
                    if (!control.enabled || !request
                        || !isRecommendationEndpointUrl(request.url, page.location.href)) {
                        return Reflect.apply(originalXhrSend, this, [body]);
                    }
                    const sanitized = sanitizeRecommendationPayload(body);
                    if (!sanitized) {
                        return Reflect.apply(originalXhrSend, this, [body]);
                    }
                    if (!sanitized.blocked) {
                        return Reflect.apply(originalXhrSend, this, [sanitized.body]);
                    }
                    const async = request.rest.length > 0 ? request.rest[0] : true;
                    Reflect.apply(originalXhrOpen, this, [
                        'GET',
                        'data:application/json,%7B%7D',
                        async,
                        ...request.rest.slice(1)
                    ]);
                    return Reflect.apply(originalXhrSend, this, [null]);
                };
            } catch {
            }
        }

        const patchSourceProperty = (prototype, property, replacement) => {
            const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, property);
            if (!descriptor?.get || !descriptor?.set || descriptor.configurable === false) {
                return;
            }
            try {
                Object.defineProperty(prototype, property, {
                    configurable: true,
                    enumerable: descriptor.enumerable,
                    get: descriptor.get,
                    set(value) {
                        const nextValue = control.enabled && (
                            isAnalyticsRequestUrl(value, page.location.href)
                            || isClickTrackingUrl(value, page.location.href)
                        )
                            ? replacement
                            : value;
                        return Reflect.apply(descriptor.set, this, [nextValue]);
                    }
                });
            } catch {
            }
        };
        patchSourceProperty(page.HTMLScriptElement?.prototype, 'src', 'data:text/javascript,void%200');
        patchSourceProperty(
            page.HTMLImageElement?.prototype,
            'src',
            'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
        );

        const elementPrototype = page.Element?.prototype;
        const originalSetAttribute = elementPrototype?.setAttribute;
        if (typeof originalSetAttribute === 'function') {
            try {
                elementPrototype.setAttribute = function (name, value) {
                    const isSource = String(name).toLowerCase() === 'src';
                    const isScript = this instanceof page.HTMLScriptElement;
                    const isImage = this instanceof page.HTMLImageElement;
                    if (control.enabled && isSource && (isScript || isImage)
                        && (isAnalyticsRequestUrl(value, page.location.href)
                            || isClickTrackingUrl(value, page.location.href))) {
                        const replacement = isScript
                            ? 'data:text/javascript,void%200'
                            : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                        return Reflect.apply(originalSetAttribute, this, [name, replacement]);
                    }
                    return Reflect.apply(originalSetAttribute, this, [name, value]);
                };
            } catch {
            }
        }
    }

    function applyAnalyticsBlockingRuntime() {
        analyticsBlockingActive = state.analyticsBlockingEnabled;
        if (analyticsDefuserControl) {
            analyticsDefuserControl.setEnabled(analyticsBlockingActive);
        } else if (analyticsBlockingActive) {
            installAnalyticsDefusers();
        }
    }

    function sanitizeVideoApolloState(value) {
        if (!value || typeof value !== 'object') {
            return value;
        }
        const queue = [value];
        const visited = new WeakSet();
        let inspected = 0;
        while (queue.length > 0 && inspected < 50000) {
            const current = queue.pop();
            if (!current || typeof current !== 'object' || visited.has(current)) {
                continue;
            }
            visited.add(current);
            inspected += 1;
            if (current.__typename === 'Content') {
                if (Object.prototype.hasOwnProperty.call(current, 'isAdvEnabled')) {
                    current.isAdvEnabled = false;
                }
                if (Object.prototype.hasOwnProperty.call(current, 'preRollCount')) {
                    current.preRollCount = 0;
                }
            } else if (current.__typename === 'Rightholder'
                && Object.prototype.hasOwnProperty.call(current, 'isAdvEnabled')) {
                current.isAdvEnabled = false;
            }
            for (const nested of Object.values(current)) {
                if (nested && typeof nested === 'object') {
                    queue.push(nested);
                }
            }
        }
        return value;
    }

    function rewriteSponsorVideoResponse(page, response) {
        if (!response?.ok || response.type === 'opaque' || typeof response.clone !== 'function') {
            return response;
        }
        return response.clone().text().then((text) => {
            try {
                const payload = JSON.parse(text);
                if (Array.isArray(payload)
                    || !payload?.data
                    || !Object.prototype.hasOwnProperty.call(payload.data, 'sponsorCampaign')
                    || payload.data.sponsorCampaign === null) {
                    return response;
                }
                payload.data.sponsorCampaign = null;
                const headers = new page.Headers(response.headers);
                headers.delete('content-length');
                headers.delete('content-encoding');
                headers.delete('transfer-encoding');
                headers.set('content-type', 'application/json; charset=utf-8');
                const rewritten = new page.Response(JSON.stringify(payload), {
                    status: response.status,
                    statusText: response.statusText,
                    headers
                });
                for (const property of ['url', 'redirected', 'type']) {
                    try {
                        Object.defineProperty(rewritten, property, { value: response[property] });
                    } catch {
                    }
                }
                return rewritten;
            } catch {
                return response;
            }
        }, () => response);
    }

    function installVideoAdBypass() {
        const page = typeof unsafeWindow === 'object' ? unsafeWindow : window;
        const marker = page.Symbol.for('sru-clean-dark.video-ads-v1');
        const sharedControl = page[marker];
        if (sharedControl?.version === 1 && typeof sharedControl.setEnabled === 'function') {
            videoAdControl = sharedControl;
            sharedControl.setEnabled(true);
            sanitizeVideoApolloState(page.__APOLLO_STATE__);
            return;
        }
        if (videoAdControl) {
            videoAdControl.setEnabled(true);
            sanitizeVideoApolloState(page.__APOLLO_STATE__);
            return;
        }

        const control = {
            version: 1,
            enabled: true,
            setEnabled(value) {
                this.enabled = Boolean(value);
            }
        };
        videoAdControl = control;
        try {
            if (!page[marker]) {
                Object.defineProperty(page, marker, { value: control });
            }
        } catch {
        }

        try {
            const descriptor = Object.getOwnPropertyDescriptor(page, '__APOLLO_STATE__');
            if (!descriptor || descriptor.configurable !== false) {
                let storedValue = descriptor?.get ? Reflect.apply(descriptor.get, page, []) : descriptor?.value;
                storedValue = sanitizeVideoApolloState(storedValue);
                Object.defineProperty(page, '__APOLLO_STATE__', {
                    configurable: true,
                    enumerable: descriptor?.enumerable ?? true,
                    get() {
                        const value = descriptor?.get ? Reflect.apply(descriptor.get, this, []) : storedValue;
                        return control.enabled ? sanitizeVideoApolloState(value) : value;
                    },
                    set(value) {
                        const nextValue = control.enabled ? sanitizeVideoApolloState(value) : value;
                        if (descriptor?.set) {
                            Reflect.apply(descriptor.set, this, [nextValue]);
                        } else {
                            storedValue = nextValue;
                        }
                    }
                });
            } else {
                sanitizeVideoApolloState(page.__APOLLO_STATE__);
            }
        } catch {
            sanitizeVideoApolloState(page.__APOLLO_STATE__);
        }

        const originalFetch = page.fetch;
        if (typeof originalFetch !== 'function') {
            return;
        }
        const videoFetch = function (...args) {
            if (!control.enabled || isFetchRequestAborted(args[0], args[1])) {
                return Reflect.apply(originalFetch, page, args);
            }
            const inspected = inspectGraphqlOperation(page, args[0], args[1]);
            const handleOperation = (operationName) => {
                const pending = Reflect.apply(originalFetch, page, args);
                return operationName === 'SponsorVideo'
                    ? page.Promise.resolve(pending).then((response) => rewriteSponsorVideoResponse(page, response))
                    : pending;
            };
            return inspected && typeof inspected.then === 'function'
                ? inspected.then(handleOperation, () => Reflect.apply(originalFetch, page, args))
                : handleOperation(inspected);
        };
        try {
            page.fetch = videoFetch;
        } catch {
        }
    }

    function applyAdBlockingRuntime() {
        if (state.adBlockingEnabled) {
            suppressAdNotices();
            installAdNetworkDefusers();
        } else {
            restoreAdNotices();
        }
    }

    function suppressAdNotices() {
        try {
            let backup = GM_getValue(AD_NOTICE_BACKUP_KEY, null);
            if (!backup || typeof backup !== 'object') {
                backup = {};
                for (const [key, blockedValue] of Object.entries(AD_NOTICE_VALUES)) {
                    const currentValue = localStorage.getItem(key);
                    backup[key] = {
                        hadValue: currentValue !== null && currentValue !== blockedValue,
                        value: currentValue !== blockedValue ? currentValue : null
                    };
                }
                GM_setValue(AD_NOTICE_BACKUP_KEY, backup);
            }
            for (const [key, value] of Object.entries(AD_NOTICE_VALUES)) {
                localStorage.setItem(key, value);
            }
        } catch {
            return;
        }
    }

    function restoreAdNotices() {
        try {
            const backup = GM_getValue(AD_NOTICE_BACKUP_KEY, null);
            for (const [key, blockedValue] of Object.entries(AD_NOTICE_VALUES)) {
                const entry = backup && typeof backup === 'object' ? backup[key] : null;
                if (entry?.hadValue && typeof entry.value === 'string') {
                    localStorage.setItem(key, entry.value);
                } else if (localStorage.getItem(key) === blockedValue || entry) {
                    localStorage.removeItem(key);
                }
            }
            GM_setValue(AD_NOTICE_BACKUP_KEY, null);
        } catch {
            return;
        }
    }

    function installAdNetworkDefusers() {
        if (adNetworkDefusersInstalled) {
            return;
        }
        adNetworkDefusersInstalled = true;
        const page = typeof unsafeWindow === 'object' ? unsafeWindow : window;
        try {
            Object.defineProperty(page, 'antiadblockCallback', {
                configurable: true,
                get: () => undefined,
                set: () => undefined
            });
        } catch {
        }

        let attempts = 0;
        const neutralizeAdFox = () => {
            attempts += 1;
            try {
                if (page.Ya?.adfoxCode && typeof page.Ya.adfoxCode.create === 'function') {
                    page.Ya.adfoxCode.create = () => undefined;
                }
            } catch {
            }
            if (attempts >= 100) {
                window.clearInterval(timer);
            }
        };
        const timer = window.setInterval(neutralizeAdFox, 100);
        neutralizeAdFox();
    }

    function updateHiddenTopPrepaintStyle() {
        const parent = document.head || document.documentElement;
        if (!parent) {
            return;
        }

        if (!(hiddenTopPrepaintStyle instanceof HTMLStyleElement) || !hiddenTopPrepaintStyle.isConnected) {
            hiddenTopPrepaintStyle = document.getElementById(HIDDEN_TOP_PREPAINT_STYLE_ID);
        }
        if (!(hiddenTopPrepaintStyle instanceof HTMLStyleElement)) {
            hiddenTopPrepaintStyle = document.createElement('style');
            hiddenTopPrepaintStyle.id = HIDDEN_TOP_PREPAINT_STYLE_ID;
            hiddenTopPrepaintStyle.setAttribute(UI_ATTRIBUTE, 'hidden-top-prepaint-style');
            parent.append(hiddenTopPrepaintStyle);
        }

        const css = buildHiddenTopPrepaintStyles();
        if (hiddenTopPrepaintStyle.textContent !== css) {
            hiddenTopPrepaintStyle.textContent = css;
        }
    }

    function buildHiddenTopPrepaintStyles() {
        const rules = [];
        const urlKeys = new Set(hiddenTopUrls);
        for (const [url, entry] of Object.entries(state.authorCache)) {
            if (entry.expiresAt > Date.now()
                && !isArticleOnOwnAuthorProfile(entry.authors)
                && areAllAuthorsBlocked(entry.authors, 'top')) {
                urlKeys.add(url);
            }
        }

        const hrefSelectors = new Set();
        for (const urlKey of urlKeys) {
            for (const selector of buildHiddenTopHrefSelectors(urlKey)) {
                hrefSelectors.add(selector);
            }
        }
        if (hrefSelectors.size > 0) {
            const selectorList = Array.from(hrefSelectors).join(',');
            rules.push(`
                .super-top__article:has(> .super-top__link:is(${selectorList})) {
                    display: none !important;
                    visibility: hidden !important;
                }

                .super-top:has(.super-top__article > .super-top__link:is(${selectorList})):not(:has(.super-top__article > .super-top__link:not(:is(${selectorList})))) {
                    display: none !important;
                    visibility: hidden !important;
                }
            `);
        }

        const currentProfileId = getProfileIdFromPath();
        const blockedSiteProfileSelectors = Object.keys(state.blockedSiteAuthors)
            .filter((profileId) => profileId !== currentProfileId)
            .flatMap(buildProfileHrefSelectors);
        if (blockedSiteProfileSelectors.length > 0) {
            const selectorList = blockedSiteProfileSelectors.join(',');
            rules.push(`
                .post-content:has(> .post-content__header .user-info__nick:is(${selectorList})):not(:has(> .post-content__header .user-info__nick:not(:is(${selectorList})))) {
                    display: none !important;
                    visibility: hidden !important;
                }
            `);
        }

        const blockedSiteUrlKeys = new Set();
        for (const [url, entry] of Object.entries(state.authorCache)) {
            if (entry.expiresAt > Date.now()
                && !isArticleOnOwnAuthorProfile(entry.authors)
                && areAllAuthorsBlocked(entry.authors, 'site')) {
                blockedSiteUrlKeys.add(url);
            }
        }
        const blockedSiteHrefSelectors = new Set();
        for (const urlKey of blockedSiteUrlKeys) {
            for (const selector of buildHiddenTopHrefSelectors(urlKey)) {
                blockedSiteHrefSelectors.add(selector);
            }
        }
        if (blockedSiteHrefSelectors.size > 0) {
            const selectorList = Array.from(blockedSiteHrefSelectors).join(',');
            rules.push(`
                :is(${SITE_ARTICLE_WRAPPER_SELECTOR}):has(a:is(${selectorList})) {
                    display: none !important;
                    visibility: hidden !important;
                }
            `);
        }

        return rules.join('\n');
    }

    function buildProfileHrefSelectors(profileId) {
        const id = String(profileId || '');
        if (!/^\d+$/.test(id)) {
            return [];
        }
        const path = `/profile/${id}`;
        const escapedPath = escapeCssString(path);
        const escapedSlashPath = escapeCssString(`${path}/`);
        return [
            `[href$="${escapedPath}" i]`,
            `[href$="${escapedSlashPath}" i]`,
            `[href*="${escapedPath}?" i]`,
            `[href*="${escapedPath}#" i]`,
            `[href*="${escapedSlashPath}?" i]`,
            `[href*="${escapedSlashPath}#" i]`
        ];
    }

    function getProfileIdFromPath(value = location.pathname) {
        const match = String(value || '').match(/^\/profile\/(\d+)(?:\/|$)/i);
        return match ? match[1] : '';
    }

    function buildHiddenTopHrefSelectors(urlKey) {
        try {
            const url = new URL(`https://${urlKey}`);
            const hostname = url.hostname.toLowerCase();
            if (hostname !== 'sports.ru' && !hostname.endsWith('.sports.ru')) {
                return [];
            }

            const pathname = url.pathname.replace(/\/+$/, '') || '/';
            if (pathname === '/') {
                return [];
            }
            const escapedPath = escapeCssString(pathname);
            const escapedSlashPath = escapeCssString(`${pathname}/`);
            return [
                `[href$="${escapedPath}" i]`,
                `[href$="${escapedSlashPath}" i]`,
                `[href*="${escapedPath}?" i]`,
                `[href*="${escapedPath}#" i]`,
                `[href*="${escapedSlashPath}?" i]`,
                `[href*="${escapedSlashPath}#" i]`
            ];
        } catch {
            return [];
        }
    }

    function escapeCssString(value) {
        return String(value)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\r/g, '\\d ')
            .replace(/\n/g, '\\a ')
            .replace(/\f/g, '\\c ');
    }

    function persistState() {
        state.hiddenTopUrls = Array.from(hiddenTopUrls).slice(-MAX_HIDDEN_URLS);
        if (hiddenTopUrls.size !== state.hiddenTopUrls.length) {
            hiddenTopUrls.clear();
            for (const url of state.hiddenTopUrls) {
                hiddenTopUrls.add(url);
            }
        }
        state.hiddenTopArticles = Object.fromEntries(
            state.hiddenTopUrls
                .filter((url) => state.hiddenTopArticles[url])
                .map((url) => [url, state.hiddenTopArticles[url]])
        );
        pruneAuthorCache();
        updateHiddenTopPrepaintStyle();
        GM_setValue(STORAGE_KEY, state);
    }

    function pruneAuthorCache() {
        const entries = Object.entries(state.authorCache)
            .filter(([, entry]) => entry && typeof entry.expiresAt === 'number' && entry.expiresAt > Date.now())
            .sort((left, right) => right[1].expiresAt - left[1].expiresAt)
            .slice(0, MAX_AUTHOR_CACHE);
        state.authorCache = Object.fromEntries(entries);
    }

    function applyTheme() {
        const root = document.documentElement;
        if (!root) {
            return;
        }
        const pageType = /^\/profile\/\d+(?:\/|$)/.test(location.pathname)
            ? 'legacy-profile'
            : (/^\/cabinet(?:\/|$)/.test(location.pathname) ? 'legacy-cabinet' : '');
        if (pageType) {
            root.setAttribute(PAGE_ATTRIBUTE, pageType);
        } else {
            root.removeAttribute(PAGE_ATTRIBUTE);
        }
        root.setAttribute(THEME_ATTRIBUTE, state.theme);
        applyFilterPreferences();
        syncNativeTheme();
        updateThemeButtons();
    }

    function applyFilterPreferences() {
        const root = document.documentElement;
        if (!root) {
            return;
        }
        root.setAttribute(AD_FILTER_ATTRIBUTE, String(state.adBlockingEnabled));
        root.setAttribute(PROMO_FILTER_ATTRIBUTE, String(state.hidePromosEnabled));
        syncFilteredAccessibility(root);
        syncLegacyEmptySidebars(root);
    }

    function syncFilteredAccessibility(root = document.documentElement) {
        if (!root) {
            return;
        }
        const nodes = new Set();
        if (root instanceof Element && root.matches('[data-sru-clean-dark-ad-collapsed="true"], [data-sru-clean-dark-promo="true"]')) {
            nodes.add(root);
        }
        if (typeof root.querySelectorAll === 'function') {
            for (const node of root.querySelectorAll('[data-sru-clean-dark-ad-collapsed="true"], [data-sru-clean-dark-promo="true"]')) {
                nodes.add(node);
            }
        }
        for (const node of nodes) {
            syncFilteredNodeAccessibility(node);
        }
    }

    function syncFilteredNodeAccessibility(node) {
        const hiddenByAds = state.adBlockingEnabled
            && node.getAttribute('data-sru-clean-dark-ad-collapsed') === 'true';
        const hiddenByPromo = state.hidePromosEnabled
            && node.getAttribute('data-sru-clean-dark-promo') === 'true';
        if (hiddenByAds || hiddenByPromo) {
            if (!originalFilterAria.has(node)) {
                originalFilterAria.set(node, {
                    hadAttribute: node.hasAttribute('aria-hidden'),
                    value: node.getAttribute('aria-hidden')
                });
            }
            node.setAttribute('aria-hidden', 'true');
            return;
        }

        const original = originalFilterAria.get(node);
        if (!original) {
            return;
        }
        if (original.hadAttribute) {
            node.setAttribute('aria-hidden', original.value ?? '');
        } else {
            node.removeAttribute('aria-hidden');
        }
        originalFilterAria.delete(node);
    }

    function syncNativeTheme() {
        if (document.body) {
            document.body.classList.remove('dark');
        }
    }

    function setTheme(theme) {
        state.theme = theme === 'light' ? 'light' : 'dark';
        applyTheme();
        persistState();
        window.clearTimeout(settingsResetTimer);
        settingsResetTimer = 0;
        const resetButton = document.querySelector('[data-sru-settings-action="reset"]');
        if (resetButton?.dataset.confirming === 'true') {
            resetButton.dataset.confirming = 'false';
            resetButton.textContent = 'Сбросить настройки';
        }
        showToast(state.theme === 'dark' ? 'Темная тема включена' : 'Темная тема выключена');
    }

    function toggleTheme() {
        const buttons = Array.from(document.querySelectorAll('[data-sru-theme-toggle]'));
        for (const button of buttons) {
            button.classList.remove('sru-clean-dark-theme-toggle--animate');
        }
        setTheme(state.theme === 'dark' ? 'light' : 'dark');
        void document.documentElement.offsetWidth;
        for (const button of buttons) {
            if (button.isConnected) {
                button.classList.add('sru-clean-dark-theme-toggle--animate');
            }
        }
        window.clearTimeout(themeAnimationTimer);
        themeAnimationTimer = window.setTimeout(() => {
            for (const button of document.querySelectorAll('[data-sru-theme-toggle]')) {
                button.classList.remove('sru-clean-dark-theme-toggle--animate');
            }
        }, 720);
    }

    function buildStyles() {
        return `
            html[${AD_FILTER_ATTRIBUTE}="true"] :is(${AD_NODE_SELECTOR}),
            html[${AD_FILTER_ATTRIBUTE}="true"] [data-sru-clean-dark-ad-collapsed="true"],
            html[${PROMO_FILTER_ATTRIBUTE}="true"] .super-top__article:has(
                > .super-top__link:is(${PROMO_HREF_PREPAINT_SELECTOR})
            ),
            html[${PROMO_FILTER_ATTRIBUTE}="true"] .super-top:has(
                .super-top__article > .super-top__link:is(${PROMO_HREF_PREPAINT_SELECTOR})
            ):not(:has(
                .super-top__article > .super-top__link:not(:is(${PROMO_HREF_PREPAINT_SELECTOR}))
            )),
            html[${PROMO_FILTER_ATTRIBUTE}="true"] .aside-news-list__item:has(
                > a${SPONSORED_APPMETRICA_LINK_SELECTOR}
            ),
            html[${PROMO_FILTER_ATTRIBUTE}="true"] .material-list__item:is(
                [data-article-type="competition" i],
                [data-article-type="promo" i]
            ),
            html[${PROMO_FILTER_ATTRIBUTE}="true"] [data-sru-clean-dark-promo="true"] {
                display: none !important;
                visibility: hidden !important;
                width: 0 !important;
                min-width: 0 !important;
                max-width: 0 !important;
                height: 0 !important;
                min-height: 0 !important;
                max-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                overflow: hidden !important;
                pointer-events: none !important;
            }

            [${BLOCKED_SITE_ARTICLE_ATTRIBUTE}="true"] {
                display: none !important;
                visibility: hidden !important;
            }

            html[${AD_FILTER_ATTRIBUTE}="true"] :is(${AD_LINK_SELECTOR}) {
                display: none !important;
            }

            .ui-theme-switcher {
                display: none !important;
            }

            .post-content .document-header__meta > .post-dropdown-list {
                display: none !important;
            }

            html[${AD_FILTER_ATTRIBUTE}="true"] {
                --branding-fixed-height: 0px !important;
            }

            html[${AD_FILTER_ATTRIBUTE}="true"] body,
            html[${AD_FILTER_ATTRIBUTE}="true"] #branding-layout {
                background-image: none !important;
            }

            html[${AD_FILTER_ATTRIBUTE}="true"] .pageLayout .layout-columns[${EMPTY_SIDEBAR_ATTRIBUTE}="true"] {
                justify-content: center !important;
            }

            html[${AD_FILTER_ATTRIBUTE}="true"] .pageLayout .layout-columns[${EMPTY_SIDEBAR_ATTRIBUTE}="true"] > .mainPart {
                margin-right: auto !important;
                margin-left: auto !important;
                width: var(--sru-clean-dark-main-width) !important;
                max-width: 100% !important;
                flex: 0 1 var(--sru-clean-dark-main-width) !important;
            }

            html[${AD_FILTER_ATTRIBUTE}="true"] .pageLayout .layout-columns[${EMPTY_SIDEBAR_ATTRIBUTE}="true"] > .rightPart {
                display: none !important;
            }

            .post-content .document-actions-comments > .ui-badge__content {
                background-color: #505050 !important;
                color: #f4f4f4 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"],
            html[${THEME_ATTRIBUTE}="dark"] body {
                color-scheme: dark;
                --sru-bg: #222222;
                --sru-surface: #2c2c2c;
                --sru-surface-raised: #373737;
                --sru-surface-hover: #505050;
                --sru-text: #d8d8d8;
                --sru-muted: #9b9b9b;
                --sru-border: #505050;
                --sru-accent: #00c78b;
                --ui-bg: var(--sru-surface);
                --ui-canvas: var(--sru-bg);
                --ui-content: var(--sru-text);
                --ui-headers: var(--sru-text);
                --ui-additional: var(--sru-muted);
                --ui-fill: var(--sru-surface-raised);
                --ui-fill-hover: var(--sru-surface-hover);
                --ui-block-border: var(--sru-border);
                --ui-tertiary-light: var(--sru-border);
                --ui-secondary: var(--sru-muted);
                --ui-secondary-light: var(--sru-border);
                --ui-disabled-fill: var(--sru-surface-raised);
                --ui-link: #7781ff;
                --ui-link-hover: #9aa2ff;
                --ui-primary-bg: #005239;
                --ui-success-bg: #005239;
                --sports-primary-light-color-hover: #005239;
                --ui-kit-link-color-default-background: var(--sru-surface-raised);
                --ui-kit-link-color-default-background-hover: var(--sru-surface-hover);
                --ui-kit-link-color-default-text: var(--sru-text);
            }

            html[${THEME_ATTRIBUTE}="dark"],
            html[${THEME_ATTRIBUTE}="dark"] body,
            html[${THEME_ATTRIBUTE}="dark"] #branding-layout,
            html[${THEME_ATTRIBUTE}="dark"] .post-root,
            html[${THEME_ATTRIBUTE}="dark"] .news-root,
            html[${THEME_ATTRIBUTE}="dark"] .layout,
            html[${THEME_ATTRIBUTE}="dark"] .layout__content-wrapper {
                background: var(--sru-bg) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common {
                background-color: transparent !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .teaser-group__handle {
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .teaser-event {
                background-color: transparent !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .teaser-event::before {
                border-left-color: var(--sru-surface-raised) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .accordion__icon-status {
                background-color: var(--sru-surface-raised) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .accordion__icon-status::before,
            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .accordion__icon-status::after {
                background-color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common :where(
                .accordion__title,
                .accordion__title > a,
                .teaser-event__board,
                .teaser-event__board-player
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common :where(
                .teaser-before-links__item,
                .accordion__links > a,
                .teaser-event__board-player-name
            ) {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common :where(
                .teaser-before-links__item,
                .accordion__links > a,
                .teaser-event__board-player-name
            ):is(:hover, :focus-visible) {
                color: #9fd4ff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common :where(
                .teaser-event__status,
                .teaser-event__tv
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .teaser-event__board-score {
                background-color: var(--sru-surface) !important;
                color: #6bbcff !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .teaser-event__board-score span {
                color: inherit !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .teaser-event.is-active .teaser-event__board-score {
                background-color: #123d33 !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .separator_color-gray {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .main-teaser-container--common .flex-teaser-item__img {
                filter: invert(1) brightness(1.35);
                opacity: 0.72;
            }

            html[${THEME_ATTRIBUTE}="dark"] .popup-match {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
                box-shadow: 0 12px 28px rgba(0, 0, 0, 0.34) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .popup-match :where(
                .popup-match__board-player,
                .popup-match__board-player-name,
                .popup-match__event a,
                .popup-match__event-link-video
            ) {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .popup-match .popup-match__board-score {
                background-color: var(--sru-surface-hover) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .popup-match_state-active .popup-match__board-score {
                background-color: #123d33 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .popup-match .popup-match__events-item {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .popup-match .popup-match__events-item .popup-match__event:first-child {
                border-right-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .popup-match :where(
                .popup-match__events,
                .popup-match__event,
                .popup-match__event-text,
                .popup-match__event-time
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"],
            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] body,
            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .pageLayout {
                background: var(--sru-bg) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] :where(
                .contentLayout,
                .contentLayout > .box,
                .contentLayout .layout-columns.second-page
            ) {
                background: transparent !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] :where(
                .contentLayout .mainPart,
                .contentLayout .rightPart
            ) {
                background-color: transparent !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout > .box a {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout > .box a:hover,
            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout > .box a:focus-visible {
                color: #9fd4ff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout .title-page .titleH1 a {
                color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout :where(
                .titleH1,
                .titleH2,
                .titleH3,
                .profile-table,
                .profile-table td,
                .blog-post-list,
                .blog-post-list p,
                .user-comment-item,
                .user-comment-item p
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout :where(
                .user-rating,
                .profile-table th,
                .rate-text,
                .sp,
                .user-comment-item__date,
                .user-comment-item__sp
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout .user-rating span {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout .info-block .about > table {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .pageLayout .info-block .short-info > .big-title {
                border-bottom-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout .gray-block.tags-menu {
                background: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout .tags-menu .act {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-profile"] .contentLayout :where(
                .bordered,
                .anons,
                .more,
                .user-comment-item
            ) {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"],
            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] body,
            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] .pageLayout {
                background: var(--sru-bg) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] .contentLayout .tabs > .tab {
                background-color: var(--sru-surface) !important;
                color: #6bbcff !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] .contentLayout .tabs > .tab.active {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) .form-block {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) :where(
                .input-box,
                .textarea-box,
                .textarea-box > .inner
            ) {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
                box-shadow: none !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) .input-box > span {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) .input-box.disabled-input {
                background-color: var(--ui-disabled-fill) !important;
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) .input-box.disabled-input input {
                color: var(--sru-muted) !important;
                -webkit-text-fill-color: var(--sru-muted) !important;
                opacity: 1 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) :where(
                .input-box input,
                .textarea-box textarea
            ) {
                background-color: transparent !important;
                color: inherit !important;
                border-color: transparent !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) :where(
                select,
                option
            ) {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) input:-webkit-autofill {
                -webkit-box-shadow: 0 0 0 1000px var(--sru-surface-raised) inset !important;
                -webkit-text-fill-color: var(--sru-text) !important;
                caret-color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) :where(
                .file-input .but,
                .change-email__save
            ) {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border: 0 !important;
                box-shadow: inset 0 0 0 1px var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) :where(
                .file-input .but,
                .change-email__save
            ):is(:hover, :focus-visible) {
                background-color: var(--sru-surface-hover) !important;
                color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) input.pink-but {
                background-color: #ff003c !important;
                color: #ffffff !important;
                border-color: #ff003c !important;
            }

            html[${THEME_ATTRIBUTE}="dark"][${PAGE_ATTRIBUTE}="legacy-cabinet"] :is(#edit_profile, #edit_cabinet_settings) input.pink-but:is(:hover, :focus-visible) {
                background-color: #d90035 !important;
                border-color: #d90035 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout {
                background-color: var(--sru-bg) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :where(
                .headerLayout,
                .contentLayout,
                .contentLayout > .box,
                .layout-columns
            ) {
                background-color: transparent !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :where(
                .tabs-menu,
                .tabs,
                .tabs__header,
                .statistic-snipnet,
                .accordion__handle,
                .teaser-group__handle,
                .teaser-event,
                .transfers__list-item,
                .transfers__content-wrapper,
                .short-text,
                .c-show-more
            ) {
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :where(
                .mainPart,
                .rightPart
            ) {
                background-color: transparent !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :where(
                table,
                thead,
                tbody,
                tfoot,
                tr,
                th,
                td
            ) {
                background-color: transparent !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout table {
                background-color: var(--sru-surface) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .short-info > table.profile-table {
                background-color: transparent !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout td.color1 {
                background-color: #27734b !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout td.color2 {
                background-color: #17452d !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout td.color3 {
                background-color: #512b35 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout td.color4 {
                background-color: #6b2b3d !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :where(
                .tm-item,
                .tab,
                .tabs__header-tab
            ) {
                background-color: var(--sru-surface) !important;
                color: #6bbcff !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :where(
                .tm-item.active,
                .tab.active,
                .tabs__header-tab_active
            ) {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout a {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout a:hover,
            html[${THEME_ATTRIBUTE}="dark"] .pageLayout a:focus-visible {
                color: #9fd4ff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :is(
                .tab.active,
                .tabs__header-tab_active
            ),
            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :is(
                .tab.active,
                .tabs__header-tab_active
            ):is(:hover, :focus-visible) {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .tabs-menu .tm-item.active > .sm-act,
            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .tabs-menu .tm-item.active > .sm-act:is(:hover, :focus-visible) {
                background-color: var(--sru-bg) !important;
                color: var(--sru-text) !important;
                border-radius: 2px;
                box-shadow: inset 0 0 0 1px var(--sru-border);
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .tabs-menu .c-dropdown__dropdown-menu {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .tabs-menu .c-dropdown__trigger .arr-down-blk {
                filter: brightness(0) invert(1);
                opacity: 0.8;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .tabs-menu .c-dropdown__dropdown-menu > li {
                background-color: transparent !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .tabs-menu .c-dropdown__dropdown-menu a {
                background-color: transparent !important;
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .tabs-menu .c-dropdown__dropdown-menu a:is(:hover, :focus-visible) {
                background-color: var(--sru-surface-hover) !important;
                color: #9fd4ff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .pager a {
                background-color: var(--sru-surface-raised) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .pager .act,
            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .pager .act:is(:hover, :focus-visible) {
                background-color: #000000 !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :where(
                .short-text,
                .accordion__title,
                .accordion__links,
                .teaser-event__status,
                .teaser-event__tv,
                .teaser-event__board,
                .teaser-event__board-player,
                .transfers__description,
                .transfers__other,
                .like-count,
                .like-count .count,
                .like-count .count-more,
                .like-count .count-less,
                strong
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout :where(
                .sp,
                .teaser-event__status,
                .teaser-event__tv
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .like-count {
                background-color: var(--sru-surface-raised) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .statistic-snipnet {
                background-image: none !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .statistic-snipnet .fader {
                background: linear-gradient(90deg, rgba(44, 44, 44, 0), var(--sru-surface)) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .statistic-snipnet .gray-more {
                background-color: var(--sru-surface-raised) !important;
                color: #6bbcff !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .layout-columns.second-page .mainPart .gray-more.mB20 {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
                box-shadow: none !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .teaser-event__board-score {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .teaser-event__board-score span {
                color: inherit !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .nl-item {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .sort {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .sort-act > .sort {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .statistic-block .fader {
                background: linear-gradient(90deg, rgba(44, 44, 44, 0), var(--sru-surface)) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .statistic-block .stat > .more {
                background-color: var(--sru-surface-raised) !important;
                color: #6bbcff !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .pageLayout .statistic-block .stat > .more .arr-blk {
                filter: invert(1) brightness(1.45) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .mc-navigation__tabs .ui-tabbar__side-icon-left--white {
                background-image: linear-gradient(
                    270deg,
                    rgba(44, 44, 44, 0) 0%,
                    rgba(44, 44, 44, 0.45) 13.91%,
                    var(--sru-surface) 54.55%
                ) !important;
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .mc-navigation__tabs .ui-tabbar__side-icon-right--white {
                background-image: linear-gradient(
                    90deg,
                    rgba(44, 44, 44, 0) 0%,
                    rgba(44, 44, 44, 0.45) 11.59%,
                    var(--sru-surface) 45.45%
                ) !important;
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .mc-navigation__tabs::before {
                background-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-main-layout__tabbar :is(
                .ui-tabbar__side-icon-left--grey,
                .ui-tabbar__side-icon-left--white
            ) {
                background-image: linear-gradient(
                    270deg,
                    rgba(34, 34, 34, 0) 0%,
                    rgba(34, 34, 34, 0.45) 13.91%,
                    var(--sru-bg) 54.55%
                ) !important;
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-layout .tag-header__breadcrumbs :is(
                .bread-item__link,
                .bread-item__text
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-layout .tag-header__breadcrumbs .bread-item__link {
                opacity: 1 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-layout .tag-header__breadcrumbs .bread-item:last-child .bread-item__text {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .news-group__item {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .score-cell--losing {
                background-color: #4a252b !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-main-layout__tabbar :is(
                .ui-tabbar__side-icon-right--grey,
                .ui-tabbar__side-icon-right--white
            ) {
                background-image: linear-gradient(
                    90deg,
                    rgba(34, 34, 34, 0) 0%,
                    rgba(34, 34, 34, 0.45) 11.59%,
                    var(--sru-bg) 45.45%
                ) !important;
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .page-layout,
                .content-wrapper,
                .post-layout,
                .post-content,
                .news-layout,
                .columns-layout__main-wrapper,
                .columns-layout__main,
                .columns-layout__left,
                .columns-layout__right,
                .layout__content,
                .layout__breadcrumbs
            ) {
                background-color: transparent !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .material-list__item,
                .material-list__additional-block,
                .blog-posts-list__item,
                .official-blogs__item,
                .aside-news-block,
                .gadget,
                .gadget-table,
                .gadget-table-stat,
                .gadget-results__item,
                .poll,
                .poll-widget,
                .ui-dropdown,
                .popup,
                .footer,
                .footerLayoutDesktop,
                .footer-app-button,
                .footer-apps__more,
                .navigation-navbar-mobile,
                input,
                textarea,
                select
            ) {
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout:has(.super-top) :where(
                .material-list__item,
                .material-list__additional-block,
                .official-blogs__item,
                .aside-news-block,
                .gadget,
                .gadget-table,
                .gadget-table-stat,
                .gadget-results__item
            ) {
                background-color: transparent !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .poll-variant,
                .tabs__item,
                .ui-button--secondary,
                .comment,
                .comments__item
            ) {
                background-color: var(--sru-surface-raised) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .gadget__tournament-data .accordion__handle_dark {
                background: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
                box-shadow: none !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .gadget__tournament-data .accordion__handle_dark:is(:hover, :focus-within) {
                background: var(--sru-surface-hover) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .gadget__tournament-data .accordion__handle_dark :is(.accordion__title, .accordion__title > a) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .gadget__tournament-data .accordion__handle_dark .accordion__icon-status {
                background-color: var(--sru-surface-hover) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .gadget__tournament-data .accordion__handle_dark .accordion__icon-status::before,
            html[${THEME_ATTRIBUTE}="dark"] .gadget__tournament-data .accordion__handle_dark .accordion__icon-status::after {
                background-color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .gadget-table_bg-color-1 {
                background-color: #27734b !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .gadget-table_bg-color-2 {
                background-color: #17452d !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .gadget-table_bg-color-3 {
                background-color: #512b35 !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .gadget-table_bg-color-4 {
                background-color: #6b2b3d !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :is(.gadget-table, .gadget-table-stat) tr {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                h1,
                h2,
                h3,
                h4,
                h5,
                h6,
                .document-header__title,
                .post-body,
                .link_color_black,
                .material-list__title,
                .material-list__title-link,
                .blog-posts-list__title,
                .blog-posts-list__title a,
                .official-blogs__item-name,
                .aside-news-list__link-to-news,
                .gadget__header,
                .gadget-table__team,
                .gadget-results-board__player-name,
                .poll__title,
                .poll-variant__name,
                .footer-links__link,
                .footer-support,
                .footer-recommendation,
                .post-content,
                .post-content p,
                .news-item,
                .comment__text,
                .user-info__nick
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .navigation-navbar-item__link,
                .navigation-navbar-button,
                .navigation-navbar-item__link-text,
                .navigation-navbar-button__text
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-posts-list__top > a {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-posts-list__top > a:is(:hover, :focus-visible) {
                color: #9fd4ff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout :where(
                .blog-menu,
                .blog-menu__create-dropdown,
                .recent-entries
            ) {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-menu .blog-menu__item {
                background-color: transparent !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-menu .blog-menu__item_state_active {
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout :where(
                .blog-menu__item_state_active,
                .blog-menu__item_state_active .blog-menu__link,
                .blog-menu__create-dropdown-link,
                .blog-menu__create-dropdown-text,
                .blog-menu__create-dropdown-icon
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-feed__item {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-feed__item-title > .content-link {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout :where(
                .blog-feed__item-brief,
                .blog-feed__item-figcaption
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout :is(
                .blog-feed .feed-item__source-link,
                .recent-entries .link,
                .blog-statistic__post__link
            ) {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .pagination__item_state_active {
                background-color: var(--sru-surface-raised) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .pagination__item_state_active .pagination__link {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-statistic__table__cell {
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-statistic__table__cell--grey {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-statistic :where(
                .blog-statistic__table__row,
                .blog-statistic__separator,
                .blog-statistic__stats__block
            ) {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .blog-statistic__table__icon {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .new-blog {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .new-blog :where(
                .new-blog__line-title,
                .new-blog__line-content,
                .new-blog__inline-wrapper,
                .new-blog__lock-block,
                .new-blog__lock-block-logo-text,
                .new-blog__textarea
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .new-blog :where(
                .new-blog__line-description,
                .new-blog__input-description,
                .new-blog__input-length,
                .new-blog__input-example
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .new-blog :where(
                .new-blog__line,
                .new-blog__internal-line,
                .new-blog__textarea,
                .search-block__form
            ) {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .new-blog .new-blog__textarea {
                background-color: var(--sru-surface) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .new-blog .image-upload__input__trigger {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout--editors .editor-page .blog-post-header {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout--editors .editor-page :where(
                .material-item__header textarea,
                .blog-feed__item-title textarea,
                textarea.blog-feed__item-figcaption
            ) {
                background-color: transparent !important;
                color: var(--sru-text) !important;
                border-color: transparent !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout--editors .editor-page :where(
                .preview-item__add,
                .ui-select__custom-container,
                .ProseMirror-menuitem__icon
            ) {
                background-color: var(--sru-surface-raised) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout--editors .editor-page :where(
                .preview-item__add,
                .ui-select__custom-container,
                .ProseMirror-menuitem__icon:not(.ProseMirror-menuitem__icon--active)
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout--editors .editor-page textarea.blog-feed__item-figcaption::placeholder {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout--editors .editor-page .edit-tags__select {
                --ui-kit-palette-grey-200: var(--sru-surface-raised);
                --ui-kit-select-color-background: var(--sru-surface-raised);
                --ui-kit-select-options-item-color-hover: var(--sru-surface-hover);
                --ui-kit-select-options-selected-color: var(--sru-text);
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout--editors .editor-page .edit-tags__tags-item {
                --ui-kit-palette-grey-200: var(--sru-surface-raised);
                --ui-kit-palette-grey-600: var(--sru-muted);
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout--editors .editor-page .edit-tags__select-icon {
                filter: brightness(0) invert(1);
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout--editors .editor-page :is(
                .ui-select__arrow,
                .ui-select__arrow path
            ) {
                fill: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .navigation-navbar-item--current .navigation-navbar-item__link,
                .navigation-navbar-item--current .navigation-navbar-item__link-text
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .navigation-burger-dropdown,
                .navigation-burger-dropdown__wrap,
                .navigation-burger-dropdown__column-left,
                .navigation-burger-dropdown__column-right,
                .burger-right-column
            ) {
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .navigation-burger-dropdown :where(
                .navigation-burger-column-list__item,
                .burger-right-column__item,
                .navigation-item__link,
                .navigation-item__description
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .navigation-burger-dropdown :where(
                .navigation-burger-column-list__item,
                .burger-right-column__item
            ):is(:hover, :focus-within) {
                background-color: var(--sru-surface-hover) !important;
                color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :where(
                .tag-table-page__season-select .star-ui-select__value,
                .tag-calendar-page__season-select .star-ui-select__value,
                .tag-calendar-page__filter .star-ui-select__value,
                .news-groups__item.news-group,
                .post-preview,
                .message-sender
            ) {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .tournament-table__td {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :is(
                .tournament-table,
                .tournament-table__td
            ) {
                border-color: transparent !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .section-container.about {
                background-color: transparent !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :is(
                .tag-calendar-page__season-select,
                .tag-calendar-page__filter
            ) .star-ui-select__name {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :is(
                .tag-calendar-page__season-select,
                .tag-calendar-page__filter
            ) .star-ui-select__arrow {
                border-right-color: var(--sru-text) !important;
                border-bottom-color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :is(
                .tag-table-page__season-select,
                .tag-calendar-page__season-select,
                .tag-calendar-page__filter
            ) .dropdown-list__items {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :is(
                .tag-table-page__season-select,
                .tag-calendar-page__season-select,
                .tag-calendar-page__filter
            ) :is(
                .dropdown-list__item,
                .dropdown-item__name
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :is(
                .tag-table-page__season-select,
                .tag-calendar-page__season-select,
                .tag-calendar-page__filter
            ) .dropdown-list__item:is(
                :hover,
                .dropdown-list__item--active
            ) {
                background-color: var(--sru-surface-hover) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :is(
                .tag-table-page__season-select,
                .tag-calendar-page__season-select,
                .tag-calendar-page__filter
            ) .dropdown-list__item--selected::after {
                border-color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :where(
                .tournament-table__group-name,
                .tournament-table__tr--head,
                .news-group__title,
                .news-card__text,
                .fire-counter__count,
                .post-preview__title,
                .post-preview__author-name,
                .match-schedule-column__title
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .tournament-table__link {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :where(
                .match-schedule__link,
                .one-message__user-name
            ) {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :where(
                .match-schedule__link,
                .one-message__user-name
            ):is(:hover, :focus-visible) {
                color: #9fd4ff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :where(
                .tournament-table__legend,
                .messages-date-separator__date,
                .news-list__show-more,
                .post-preview-list__more-btn,
                .post-preview-list__more-btn-text,
                .about__show-more-button
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page :where(
                .news-list__show-more,
                .post-preview-list__more-btn,
                .about__show-more-button
            ):is(:hover, :focus-visible) {
                color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .post-preview-list__more-btn:is(:hover, :focus-visible) .post-preview-list__more-btn-text {
                color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .messages-date-separator::before,
            html[${THEME_ATTRIBUTE}="dark"] .tag-page .messages-date-separator::after {
                background-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .chat-room__message-list-wrapper::after {
                background: linear-gradient(180deg, var(--sru-surface), rgba(44, 44, 44, 0)) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .about__text-inner--blur::after {
                background: linear-gradient(180deg, rgba(34, 34, 34, 0), var(--sru-bg)) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .one-message__wrapper:hover {
                background-color: transparent !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .one-message__actions .actions-wrapper {
                background: linear-gradient(90deg, rgba(34, 34, 34, 0) 2%, var(--sru-bg) 55%) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .one-message__actions .actions-item {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .one-message__actions .actions-reply svg {
                fill: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .one-message__actions .actions-menu__icon,
            html[${THEME_ATTRIBUTE}="dark"] .tag-page .one-message__actions .actions-menu__icon::before,
            html[${THEME_ATTRIBUTE}="dark"] .tag-page .one-message__actions .actions-menu__icon::after {
                background-color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .actions-menu__list {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                box-shadow: 0 6px 15px rgba(0, 0, 0, 0.45) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .actions-menu__list-item {
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .actions-menu__list-item:hover {
                background-color: var(--sru-surface-hover) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .tag-page .actions-menu__list-item:last-child {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .columns-layout__right .blogs-block .title-list__item-image {
                background-color: var(--sru-surface-raised) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .columns-layout__right .blogs-block :where(
                .title-list,
                .title-list__item
            ) {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .columns-layout__right .blogs-block .title-list__item-title {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .columns-layout__right .blogs-block .title-list__item-description {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .columns-layout__right .blogs-block .title-list__item-title > a {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .columns-layout__right .blogs-block .title-list__item-title > a:is(:hover, :focus-visible) {
                color: #9fd4ff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .navigation-burger-dropdown .navigation-item--active,
            html[${THEME_ATTRIBUTE}="dark"] .navigation-burger-dropdown .navigation-item--active :where(
                .navigation-item__link,
                .navigation-item__description
            ) {
                color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .navigation-burger-dropdown svg {
                color: currentColor !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .navigation-burger-dropdown svg [fill]:not([fill="none"]) {
                fill: currentColor !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .navigation-burger-dropdown svg [stroke]:not([stroke="none"]) {
                stroke: currentColor !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .super-top .super-top__title {
                color: #ffffff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .super-top .super-top__block--green {
                color: #00a876 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .super-top .super-top__block--red {
                color: #ff003c !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .navigation-navbar-button__icon svg path {
                fill: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .link_color_gray,
                .description-text,
                .blog-posts-list__top,
                .official-blogs__item-subtitle,
                .material-list__item-text,
                .poll__votes-amount,
                .footer-support__copy,
                .footer-copyright,
                time
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .columns-layout__main > .btn-show-more[data-model="Section.Articles"],
            html[${THEME_ATTRIBUTE}="dark"] .page-layout .user-feed__show-more.btn-show-more[data-model="Blogs.FeedModel"] {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
                box-shadow: none !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .columns-layout__main > .btn-show-more[data-model="Section.Articles"]:is(:hover, :focus-visible),
            html[${THEME_ATTRIBUTE}="dark"] .page-layout .user-feed__show-more.btn-show-more[data-model="Blogs.FeedModel"]:is(:hover, :focus-visible) {
                background-color: var(--sru-surface-hover) !important;
                color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .page-layout .columns-layout__main > .btn-show-more[data-model="Section.Articles"]:focus-visible,
            html[${THEME_ATTRIBUTE}="dark"] .page-layout .user-feed__show-more.btn-show-more[data-model="Blogs.FeedModel"]:focus-visible {
                outline: 2px solid var(--sru-accent) !important;
                outline-offset: 2px !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .aside-news-block .social-links > span {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .poll-variant__progressbar {
                background-color: #303944 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .poll-variant--selected {
                border-color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .poll-variant--selected .poll-variant__progressbar {
                background-color: #1f624c !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .poll-variant__name,
                .poll-variant__value
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .poll-share__text {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .post-content .poll-widget .variant {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .post-content .poll-widget .variant--active {
                border-color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .post-content .poll-widget :where(
                .poll-widget__title,
                .poll-widget__share-title,
                .variant__title,
                .variant__percents-number
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .post-content .poll-widget .poll-widget__votes {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .post-content .poll-widget .variant__percents {
                background-color: #303944 !important;
                opacity: 1 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .post-content .poll-widget .variant--active .variant__percents {
                background-color: #1f624c !important;
            }

            html[${THEME_ATTRIBUTE}="light"] .post-content .poll-widget {
                background-color: #f9f9f7 !important;
            }

            html[${THEME_ATTRIBUTE}="light"] .post-content .poll-widget .variant__percents {
                background-color: #ececea !important;
                opacity: 1 !important;
            }

            html[${THEME_ATTRIBUTE}="light"] .post-content .poll-widget .variant--active .variant__percents {
                background-color: #d3edd9 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .link_color_blue,
                .gadget-type-sport:not(.gadget_link_disabled),
                .gadget__full-link
            ) {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .super-top .comment-count__value {
                color: #ffffff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .aside-news-list__item-sport,
                .gadget-type-sport.gadget_link_disabled
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .material-list__item,
                .material-list__separator,
                .aside-news-list__item,
                .blog-posts-list__item,
                .official-blogs__item,
                .gadget,
                .gadget-table td,
                .gadget-table th,
                .gadget-results__item,
                .poll,
                .ui-dropdown,
                .footer-app-button,
                .navigation-navbar-mobile,
                hr
            ) {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(input, textarea, select)::placeholder {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(input, textarea, select):focus {
                outline-color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .auth-popup {
                color-scheme: light;
                --ui-bg: #ffffff;
                --ui-canvas: #f1f1f1;
                --ui-content: #222222;
                --ui-headers: #222222;
                --ui-additional: #505050;
                --ui-fill: #f4f4f4;
                --ui-fill-hover: #eaeaea;
                --ui-block-border: #eaeaea;
                --ui-disabled-fill: #f4f4f4;
                --ui-secondary: #7f7f7f;
                --ui-secondary-light: #d8d8d8;
                --ui-link: #616dff;
            }

            html[${THEME_ATTRIBUTE}="dark"] .auth-popup :where(input, textarea, select) {
                background-color: transparent !important;
                color: #222222 !important;
                border-color: transparent !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .auth-popup :where(input, textarea, select)::placeholder {
                color: #9b9b9b !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .navigation-search-popup,
                .navigation-search-results
            ) {
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .navigation-search-results__item,
                .navigation-search-results__info,
                .navigation-search-results__controls
            ) {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .navigation-search-results__name,
                .navigation-search-results__anchor
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .navigation-search-results__title,
                .navigation-search-results__type
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .navigation-search-results__anchor:hover {
                background-color: var(--sru-surface-hover) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .popup-wrapper.search-popup::before {
                border-bottom-color: var(--sru-surface) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu {
                color-scheme: dark;
                --ui-content: var(--sru-text);
                --ui-secondary: var(--sru-muted);
                --ui-kit-palette-black-700: var(--sru-text);
                --ui-kit-palette-white-100: var(--sru-surface);
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu :where(
                .personal-menu__column-left,
                .personal-menu__column-right,
                .personal-menu-nav,
                .personal-menu__dropdown-arrow
            ) {
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu :where(
                .personal-menu-user__link,
                .personal-menu-user__name,
                .personal-menu-new-post-btn,
                .personal-menu-nav__link,
                .personal-menu-nav__link-text,
                .personal-menu-block,
                .personal-menu-block__title,
                .personal-menu-empty-block__caption,
                .personal-menu-post-card__title,
                .personal-menu-blog-card__info,
                .personal-menu-tags__tag-counter
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu :where(
                .personal-menu-empty-block,
                .personal-menu-blog-card,
                .personal-menu-post-card,
                .personal-menu-tags__tag-counter,
                .personal-menu-nav__sublist
            ) {
                background-color: var(--sru-surface-raised) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu :where(
                .personal-menu__column-left,
                .personal-menu-new-post-btn,
                .personal-menu-nav__link-text,
                .personal-menu-tags__tag-link,
                .personal-menu__bottom-menu
            ) {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu .personal-menu-nav__list-item-inner:hover {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu :where(
                .personal-menu-nav__list-item-inner:hover > .personal-menu-nav__link,
                .personal-menu-nav__sublist-item:hover,
                .personal-menu-blog-card:hover,
                .personal-menu-post-card:hover,
                .personal-menu-tags__tag-counter:hover
            ) {
                background-color: var(--sru-surface-hover) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu .personal-menu-nav__list-item-inner:hover > .personal-menu-nav__link .personal-menu-nav__link-icon-wrapper {
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu :where(
                .personal-menu-block__more-link,
                .personal-menu-blog-card__author,
                .personal-menu-post-card__time,
                .personal-menu-post-card__draft
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-menu :where(
                .personal-menu-nav__link-icon,
                .personal-menu-new-post-btn img
            ) {
                filter: brightness(0) invert(1);
                opacity: 0.88;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-notifications-dropdown {
                color-scheme: dark;
                --ui-content: var(--sru-text);
                --ui-secondary: var(--sru-muted);
                --ui-bg: var(--sru-surface);
                --ui-fill: var(--sru-surface-raised);
                --ui-fill-hover: var(--sru-surface-hover);
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .personal-notifications__dropdown-arrow,
                .personal-notifications__inner,
                .personal-notifications__header,
                .personal-notifications__body,
                .personal-notifications__footer,
                .personal-notifications__list-item
            ) {
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-notifications__inner {
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-notifications__header-tab {
                color: var(--sru-text) !important;
                border-color: transparent !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-notifications__header-tab--active {
                background-color: var(--sru-surface-hover) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .personal-notifications__header-count,
                .personal-notifications__stub-message,
                .personal-notifications__time
            ) {
                color: var(--sru-muted) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .personal-notifications__message,
                .personal-notifications__list-item-body,
                .personal-notifications__header-close
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-notifications__list-item:hover {
                background-color: var(--sru-surface-raised) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .personal-notifications__message a,
                .personal-notifications__link
            ) {
                color: #6bbcff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] :where(
                .personal-notifications__message a,
                .personal-notifications__link
            ):hover {
                color: #9fd4ff !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-notifications__footer-mark-all {
                background-color: var(--sru-surface-raised) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .personal-notifications__footer-mark-all:hover {
                background-color: var(--sru-surface-hover) !important;
                color: var(--sru-accent) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] menu.ui-dropdown.create-content-dropdown {
                color-scheme: dark;
                --ui-content: var(--sru-text);
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
                border-color: var(--sru-border) !important;
                box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] menu.ui-dropdown.create-content-dropdown .ui-dropdown__list {
                background-color: var(--sru-surface) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] menu.ui-dropdown.create-content-dropdown :where(
                .ui-dropdown__item,
                .ui-dropdown__item-control,
                svg
            ) {
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] menu.ui-dropdown.create-content-dropdown .ui-dropdown__item {
                background-color: transparent !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] menu.ui-dropdown.create-content-dropdown .ui-dropdown__item:hover,
            html[${THEME_ATTRIBUTE}="dark"] menu.ui-dropdown.create-content-dropdown .ui-dropdown__item:focus-visible {
                background-color: var(--sru-surface-hover) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] menu.ui-dropdown.create-content-dropdown .ui-dropdown__item:focus-visible {
                outline: 2px solid var(--sru-accent);
                outline-offset: -2px;
            }

            html[${THEME_ATTRIBUTE}="light"] .comment-item-body__content > .comment-text-content.comment-text-content--silent[data-test="comment-text-content"] {
                color: #505050 !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .comments-block-filters .ui-tabbar__tab--active {
                background-color: #007f5a !important;
                color: #ffffff !important;
                box-shadow: inset 0 0 0 1px #00b880;
            }

            html[${THEME_ATTRIBUTE}="dark"] .comments-block-filters .ui-tabbar__tab:not(.ui-tabbar__tab--active):hover {
                background-color: var(--sru-surface-hover) !important;
                color: var(--sru-text) !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .post-content .document-actions-comments > .ui-badge__content {
                background-color: var(--sru-muted) !important;
                color: var(--sru-surface-raised) !important;
            }

            .sru-clean-dark-header-controls {
                display: inline-flex;
                align-items: center;
                flex: 0 0 auto;
            }

            .navigation-aside-block:has(> .sru-clean-dark-header-controls) {
                flex: 0 0 auto !important;
                align-items: center;
                overflow: visible !important;
            }

            .navigation-aside-block:has(> .sru-clean-dark-header-controls) > * {
                flex-shrink: 0;
                order: 3;
            }

            .navigation-aside-block:has(> .sru-clean-dark-header-controls) > #popup-anchor-notifications {
                order: 1;
            }

            .navigation-aside-block:has(> .sru-clean-dark-header-controls) > #popup-anchor-notifications > * {
                order: 1;
            }

            .navigation-aside-block:has(> .sru-clean-dark-header-controls) > .sru-clean-dark-header-controls {
                order: 2;
            }

            .navigation-aside-block:has(> .sru-clean-dark-header-controls) > :is(
                #popup-anchor-personalMenu,
                #popup-anchor-profile,
                .unauthorized-block
            ) {
                order: 4;
            }

            .navigation-aside-block:has(> .sru-clean-dark-header-controls) > .ui-dropdown__anchor > .navigation-aside-block__create-post {
                order: 3;
            }

            .navigation-aside-block:has(> .sru-clean-dark-header-controls) > :is(
                #popup-anchor-personalMenu,
                #popup-anchor-profile,
                .unauthorized-block
            ) > * {
                order: 4;
            }

            .navigation-aside-block:has(> .sru-clean-dark-header-controls) > #popup-anchor-burgerMobile {
                order: 5;
            }

            .sru-clean-dark-theme-toggle,
            .sru-clean-dark-settings-toggle {
                all: unset;
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 48px;
                width: 48px;
                height: 48px;
                margin: 0;
                border-radius: 0;
                color: #fff;
                font-family: Arial, sans-serif;
                font-size: 24px;
                line-height: 1;
                cursor: pointer;
                transition: color 0.2s ease;
            }

            .sru-clean-dark-theme-toggle {
                flex-basis: 56px;
                width: 56px;
            }

            .sru-clean-dark-settings-toggle svg {
                display: block;
                width: 22px;
                height: 22px;
            }

            .sru-clean-dark-theme-toggle__viewport {
                display: block;
                overflow: hidden;
                width: 50.4px;
                height: 28px;
                border-radius: 22.4px;
            }

            .sru-clean-dark-theme-toggle__toggler {
                position: relative;
                display: inline-block;
                width: 72px;
                height: 40px;
                box-sizing: border-box;
                border-radius: 32px;
                background: #f4f4f4;
                transform: scale(0.7);
                transform-origin: top left;
            }

            .sru-clean-dark-theme-toggle__toggler::after {
                position: absolute;
                top: 4px;
                left: 4px;
                width: 32px;
                height: 32px;
                border-radius: 20px;
                background: #00a876;
                content: "";
            }

            .sru-clean-dark-theme-toggle__icon {
                position: absolute;
                z-index: 1;
                top: 4px;
                left: 4px;
                display: flex;
                overflow: hidden;
                width: 16px;
                height: 16px;
                align-items: center;
                justify-content: center;
                color: #ffffff;
                pointer-events: none;
            }

            .sru-clean-dark-theme-toggle__icon svg {
                display: block;
                width: 16px;
                height: 16px;
            }

            .sru-clean-dark-theme-toggle__icon--sun {
                transform: translate(50%, 50%);
            }

            .sru-clean-dark-theme-toggle__icon--moon {
                left: 100%;
                margin-left: -4px;
                color: #9b9b9b;
                transform: translate(-162.5%, 50%) rotate(-90deg);
            }

            [data-sru-theme-toggle][data-sru-theme-state="dark"] .sru-clean-dark-theme-toggle__toggler {
                background: #373737;
            }

            html[${THEME_ATTRIBUTE}="light"] .sru-clean-dark-settings-backdrop .sru-clean-dark-theme-toggle__toggler {
                background: #dfe4e8;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-settings-backdrop .sru-clean-dark-theme-toggle__toggler {
                background: var(--sru-bg);
            }

            [data-sru-theme-toggle][data-sru-theme-state="dark"] .sru-clean-dark-theme-toggle__toggler::after {
                left: 100%;
                margin-left: -4px;
                transform: translateX(-100%);
            }

            [data-sru-theme-toggle][data-sru-theme-state="dark"] .sru-clean-dark-theme-toggle__icon--sun {
                color: #9b9b9b;
            }

            [data-sru-theme-toggle][data-sru-theme-state="dark"] .sru-clean-dark-theme-toggle__icon--moon {
                color: #ffffff;
            }

            .sru-clean-dark-theme-toggle--animate[data-sru-theme-state="dark"] .sru-clean-dark-theme-toggle__toggler::after {
                animation: sru-clean-dark-animate-toggle-off 0.7s ease-in-out;
            }

            .sru-clean-dark-theme-toggle--animate[data-sru-theme-state="dark"] .sru-clean-dark-theme-toggle__icon--sun svg {
                animation: sru-clean-dark-rotate-sun-on 0.7s;
            }

            .sru-clean-dark-theme-toggle--animate[data-sru-theme-state="dark"] .sru-clean-dark-theme-toggle__icon--moon svg {
                animation: sru-clean-dark-rotate-moon-on 0.7s;
            }

            .sru-clean-dark-theme-toggle--animate[data-sru-theme-state="light"] .sru-clean-dark-theme-toggle__toggler::after {
                animation: sru-clean-dark-animate-toggle-on 0.7s ease-in-out;
            }

            .sru-clean-dark-theme-toggle--animate[data-sru-theme-state="light"] .sru-clean-dark-theme-toggle__icon--sun svg {
                animation: sru-clean-dark-rotate-sun-off 0.7s;
            }

            .sru-clean-dark-theme-toggle--animate[data-sru-theme-state="light"] .sru-clean-dark-theme-toggle__icon--moon svg {
                animation: sru-clean-dark-rotate-moon-off 0.7s;
            }

            @keyframes sru-clean-dark-animate-toggle-off {
                0% { left: 60%; }
                85% { width: 60px; }
                100% { left: 100%; width: 32px; }
            }

            @keyframes sru-clean-dark-animate-toggle-on {
                0% { left: 50%; }
                85% { width: 60px; }
                100% { left: 0; width: 32px; }
            }

            @keyframes sru-clean-dark-rotate-sun-on {
                0%, 85% { color: #ffffff; }
                100% { transform: rotate(360deg); }
            }

            @keyframes sru-clean-dark-rotate-moon-on {
                0% { color: #9b9b9b; transform: rotate(0); }
                25% { color: #9b9b9b; }
                100% { transform: rotate(360deg); }
            }

            @keyframes sru-clean-dark-rotate-sun-off {
                0% { color: #9b9b9b; transform: rotate(0); }
                25% { color: #9b9b9b; }
                100% { color: #ffffff; transform: rotate(-360deg); }
            }

            @keyframes sru-clean-dark-rotate-moon-off {
                0%, 85% { color: #ffffff; }
                100% { color: #9b9b9b; transform: rotate(-360deg); }
            }

            .sru-clean-dark-theme-toggle:hover,
            .sru-clean-dark-settings-toggle:hover,
            .sru-clean-dark-settings-toggle[aria-expanded="true"] {
                background: transparent;
                color: var(--ui-primary-menu-hover, #00c78b);
            }

            .sru-clean-dark-theme-toggle:focus-visible,
            .sru-clean-dark-settings-toggle:focus-visible {
                outline: 2px solid #00c78b;
                outline-offset: -4px;
            }

            .sru-clean-dark-settings-backdrop {
                --sru-settings-bg: #ffffff;
                --sru-settings-raised: #f3f5f7;
                --sru-settings-hover: #e7ebef;
                --sru-settings-text: #15202b;
                --sru-settings-muted: #66717d;
                --sru-settings-link: #006496;
                --sru-settings-border: #d8dee5;
                --sru-settings-switch-track: #dfe4e8;
                --sru-settings-switch-thumb-off: #9b9b9b;
                position: fixed;
                inset: 0;
                z-index: 12000;
                display: grid;
                place-items: center;
                box-sizing: border-box;
                padding: 20px;
                background: rgba(4, 8, 12, 0.68);
                font: 14px/1.4 Arial, sans-serif;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-settings-backdrop {
                --sru-settings-bg: var(--sru-surface);
                --sru-settings-raised: var(--sru-surface-raised);
                --sru-settings-hover: var(--sru-surface-hover);
                --sru-settings-text: var(--sru-text);
                --sru-settings-muted: var(--sru-muted);
                --sru-settings-link: #6bbcff;
                --sru-settings-border: var(--sru-border);
                --sru-settings-switch-track: var(--sru-bg);
                --sru-settings-switch-thumb-off: #9b9b9b;
            }

            .sru-clean-dark-settings-backdrop[hidden] {
                display: none !important;
            }

            .sru-clean-dark-settings-dialog {
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                width: min(580px, 100%);
                max-height: min(760px, calc(100vh - 40px));
                overflow: hidden;
                border: 1px solid var(--sru-settings-border);
                border-radius: 18px;
                background: var(--sru-settings-bg);
                color: var(--sru-settings-text);
                box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
            }

            .sru-clean-dark-settings-head {
                display: flex;
                flex: 0 0 auto;
                align-items: flex-start;
                justify-content: space-between;
                gap: 18px;
                padding: 20px 22px 17px;
                border-bottom: 1px solid var(--sru-settings-border);
            }

            .sru-clean-dark-settings-title {
                margin: 0;
                color: var(--sru-settings-text) !important;
                font-size: 20px;
                line-height: 1.2;
            }

            .sru-clean-dark-settings-subtitle {
                margin: 5px 0 0;
                color: var(--sru-settings-muted);
                font-size: 13px;
            }

            .sru-clean-dark-settings-close {
                all: unset;
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 34px;
                width: 34px;
                height: 34px;
                border-radius: 9px;
                color: var(--sru-settings-muted);
                font-size: 25px;
                line-height: 1;
                cursor: pointer;
            }

            .sru-clean-dark-settings-close:hover,
            .sru-clean-dark-settings-close:focus-visible {
                background: var(--sru-settings-hover);
                color: var(--sru-settings-text);
            }

            .sru-clean-dark-settings-content {
                display: grid;
                grid-auto-rows: max-content;
                align-content: start;
                gap: 14px;
                min-height: 0;
                padding: 18px 22px 22px;
                overflow-y: auto;
                scrollbar-gutter: stable;
            }

            .sru-clean-dark-settings-section {
                border: 1px solid var(--sru-settings-border);
                border-radius: 14px;
                background: var(--sru-settings-raised);
                overflow: hidden;
            }

            .sru-clean-dark-settings-section-head,
            .sru-clean-dark-settings-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                padding: 13px 14px;
            }

            .sru-clean-dark-settings-section-head {
                display: grid;
                grid-template-columns: minmax(0, 1fr) 164px;
                border-bottom: 1px solid var(--sru-settings-border);
            }

            .sru-clean-dark-settings-section-head > :first-child {
                min-width: 0;
            }

            .sru-clean-dark-settings-row + .sru-clean-dark-settings-row {
                border-top: 1px solid var(--sru-settings-border);
            }

            .sru-clean-dark-settings-section-title,
            .sru-clean-dark-settings-row-title {
                color: var(--sru-settings-text);
                font-weight: 700;
            }

            .sru-clean-dark-settings-count,
            .sru-clean-dark-settings-empty,
            .sru-clean-dark-settings-row-note {
                color: var(--sru-settings-muted);
                font-size: 12px;
            }

            .sru-clean-dark-settings-list {
                display: grid;
                margin: 0;
                padding: 0;
                list-style: none;
            }

            .sru-clean-dark-settings-list-item {
                box-sizing: border-box;
                display: grid;
                grid-template-columns: minmax(0, 1fr) 164px;
                align-items: center;
                gap: 12px;
                min-width: 0;
                min-height: 57px;
                padding: 11px 14px;
                border-top: 1px solid var(--sru-settings-border);
            }

            .sru-clean-dark-settings-list-item:first-child {
                border-top: 0;
            }

            .sru-clean-dark-settings-item-label {
                display: block;
                min-width: 0;
                overflow: hidden;
                color: var(--sru-settings-text);
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .sru-clean-dark-settings-item-link {
                color: var(--sru-settings-link) !important;
                text-decoration: none;
            }

            .sru-clean-dark-settings-item-link:hover {
                text-decoration: underline;
            }

            .sru-clean-dark-settings-item-link:focus-visible {
                border-radius: 3px;
                outline: 2px solid #00a876;
                outline-offset: 2px;
            }

            .sru-clean-dark-settings-button {
                all: unset;
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 34px;
                padding: 7px 11px;
                border: 1px solid var(--sru-settings-border);
                border-radius: 9px;
                background: var(--sru-settings-bg);
                color: var(--sru-settings-text);
                font-weight: 700;
                line-height: 1.2;
                cursor: pointer;
            }

            .sru-clean-dark-settings-section-head > .sru-clean-dark-settings-button,
            .sru-clean-dark-settings-list-item > .sru-clean-dark-settings-button {
                width: 164px;
                height: 34px;
                padding-block: 0;
                font-size: 14px;
                white-space: nowrap;
            }

            .sru-clean-dark-settings-button:hover,
            .sru-clean-dark-settings-button:focus-visible {
                border-color: #00a876;
                background: var(--sru-settings-hover);
            }

            .sru-clean-dark-settings-button:disabled {
                opacity: 0.45;
                cursor: default;
            }

            .sru-clean-dark-settings-switch {
                all: unset;
                box-sizing: border-box;
                display: inline-flex;
                flex: 0 0 56px;
                width: 56px;
                height: 48px;
                align-items: center;
                justify-content: center;
                border-radius: 12px;
                cursor: pointer;
            }

            .sru-clean-dark-settings-switch__track {
                position: relative;
                display: block;
                width: 50px;
                height: 28px;
                border-radius: 32px;
                background: var(--sru-settings-switch-track);
                transition: background-color 0.2s ease;
            }

            .sru-clean-dark-settings-switch__thumb {
                position: absolute;
                top: 3px;
                left: 3px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: var(--sru-settings-switch-thumb-off);
                transform: translateX(0);
                transition: background-color 0.2s ease, filter 0.2s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
                will-change: transform;
            }

            .sru-clean-dark-settings-switch[aria-checked="true"] .sru-clean-dark-settings-switch__thumb {
                background: #00a876;
                transform: translateX(22px);
            }

            .sru-clean-dark-settings-switch:hover .sru-clean-dark-settings-switch__thumb {
                filter: brightness(1.08);
            }

            .sru-clean-dark-settings-switch:focus-visible {
                outline: 2px solid #00a876;
                outline-offset: 1px;
            }

            .sru-clean-dark-settings-button--danger {
                color: #e05269;
            }

            .sru-clean-dark-settings-button--danger[data-confirming="true"] {
                border-color: #e05269;
                background: rgba(224, 82, 105, 0.12);
            }

            .sru-clean-dark-settings-empty {
                padding: 13px 14px;
            }

            .sru-clean-dark-settings-footer {
                display: flex;
                justify-content: flex-end;
                padding-top: 2px;
            }

            .super-top__article {
                position: relative !important;
            }

            .sru-clean-dark-overflow-button {
                all: unset;
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                padding: 0;
                border-radius: 8px;
                font: 700 20px/1 Arial, sans-serif;
                letter-spacing: 0;
                overflow: visible;
                cursor: pointer;
            }

            .sru-clean-dark-overflow-button__glyph {
                display: block;
                line-height: 1;
                pointer-events: none;
                transform: translateY(-1px);
            }

            .sru-clean-dark-card-menu-button {
                --sru-overflow-bg: rgba(8, 12, 16, 0.48);
                --sru-overflow-bg-hover: rgba(8, 12, 16, 0.66);
                --sru-overflow-bg-active: rgba(8, 12, 16, 0.74);
                --sru-overflow-border: rgba(255, 255, 255, 0.24);
                --sru-overflow-border-hover: rgba(255, 255, 255, 0.44);
                --sru-overflow-border-active: rgba(107, 188, 255, 0.72);
                --sru-overflow-color: rgba(255, 255, 255, 0.92);
                --sru-overflow-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
                --sru-overflow-shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.28);
                --sru-overflow-filter: blur(10px) saturate(115%);
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 8;
            }

            .sru-clean-dark-card-menu {
                box-sizing: border-box;
                position: absolute;
                top: 48px;
                right: 10px;
                z-index: 9;
                width: min(310px, calc(100% - 20px));
                padding: 8px;
                border: 1px solid #d8dee5;
                border-radius: 12px;
                background: #ffffff;
                color: #15202b;
                font-family: Arial, sans-serif;
                font-size: 13px;
                line-height: 1.35;
                box-shadow: 0 12px 30px rgba(15, 23, 42, 0.24);
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu {
                border-color: var(--sru-border);
                background: var(--sru-surface);
                color: var(--sru-text);
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.46);
            }

            .sru-clean-dark-card-menu[hidden] {
                display: none !important;
            }

            .sru-clean-dark-card-menu-author {
                min-height: 18px;
                padding: 5px 8px 8px;
                color: #66717d;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-author {
                color: var(--sru-muted);
            }

            .sru-clean-dark-card-menu-author-link {
                color: #006c9f;
                font-weight: 700;
                text-decoration: none;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-author-link {
                color: #6bbcff;
            }

            .sru-clean-dark-card-menu-author-link:hover {
                text-decoration: underline;
            }

            .sru-clean-dark-card-menu-author-link:focus-visible {
                outline: 2px solid #00a876;
                outline-offset: 2px;
                border-radius: 2px;
            }

            .sru-clean-dark-card-menu-author-list {
                display: grid;
                gap: 3px;
                padding: 0 2px 6px;
            }

            .sru-clean-dark-card-menu-author-list[hidden] {
                display: none !important;
            }

            .sru-clean-dark-card-menu-author-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: center;
                gap: 8px;
                min-height: 34px;
                padding: 2px 6px;
                border-radius: 8px;
            }

            .sru-clean-dark-card-menu-author-row .sru-clean-dark-card-menu-author-link {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .sru-clean-dark-card-menu-author-action {
                all: unset;
                box-sizing: border-box;
                padding: 5px 7px;
                border: 1px solid #d8dee5;
                border-radius: 7px;
                color: #425466;
                font-size: 12px;
                line-height: 1.2;
                white-space: nowrap;
                cursor: pointer;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-author-action {
                border-color: var(--sru-border);
                color: var(--sru-text);
            }

            .sru-clean-dark-card-menu-author-action:hover,
            .sru-clean-dark-card-menu-author-action:focus-visible {
                border-color: #8a9aaa;
                background: #edf1f4;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-author-action:hover,
            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-author-action:focus-visible {
                border-color: #6bbcff;
                background: var(--sru-surface-hover);
            }

            .sru-clean-dark-card-menu-author-action:disabled {
                border-color: transparent;
                color: #9aa5b1;
                cursor: default;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-author-action:disabled {
                color: var(--sru-muted);
            }

            .sru-clean-dark-card-menu-action {
                all: unset;
                box-sizing: border-box;
                display: block;
                width: 100%;
                padding: 9px 10px;
                border-radius: 8px;
                color: #15202b;
                cursor: pointer;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-action {
                color: var(--sru-text);
            }

            .sru-clean-dark-card-menu-action:hover,
            .sru-clean-dark-card-menu-action:focus-visible {
                background: #edf1f4;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-action:hover,
            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-action:focus-visible {
                background: var(--sru-surface-hover);
            }

            .sru-clean-dark-card-menu-action:disabled {
                color: #9aa5b1;
                cursor: wait;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-card-menu-action:disabled {
                color: #65717e;
            }

            .pageLayout .big-title:has(> .sru-clean-dark-profile-controls) {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .pageLayout .big-title:has(> .sru-clean-dark-profile-controls) > .titleH1 {
                min-width: 0;
                margin-right: 0 !important;
            }

            .pageLayout .info-block:has(.sru-clean-dark-profile-controls) {
                display: flow-root;
                overflow: visible !important;
            }

            .sru-clean-dark-profile-controls {
                position: relative;
                z-index: 20;
                display: inline-flex;
                flex: 0 0 auto;
                align-self: center;
                font-family: Arial, sans-serif;
            }

            .sru-clean-dark-profile-menu-button {
                --sru-overflow-bg: rgba(245, 247, 248, 0.72);
                --sru-overflow-bg-hover: rgba(231, 235, 239, 0.9);
                --sru-overflow-bg-active: rgba(222, 228, 234, 0.94);
                --sru-overflow-border: rgba(21, 32, 43, 0.18);
                --sru-overflow-border-hover: rgba(21, 32, 43, 0.34);
                --sru-overflow-border-active: rgba(0, 100, 150, 0.68);
                --sru-overflow-color: #17212b;
                --sru-overflow-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
                --sru-overflow-shadow-hover: 0 4px 12px rgba(15, 23, 42, 0.13);
                --sru-overflow-filter: blur(8px) saturate(110%);
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-profile-menu-button {
                --sru-overflow-bg: rgba(55, 55, 55, 0.62);
                --sru-overflow-bg-hover: rgba(80, 80, 80, 0.82);
                --sru-overflow-bg-active: rgba(80, 80, 80, 0.92);
                --sru-overflow-border: rgba(155, 155, 155, 0.28);
                --sru-overflow-border-hover: rgba(155, 155, 155, 0.48);
                --sru-overflow-border-active: rgba(107, 188, 255, 0.72);
                --sru-overflow-color: var(--sru-text);
                --sru-overflow-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
                --sru-overflow-shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.26);
            }

            :is(
                .sru-clean-dark-card-menu-button,
                .sru-clean-dark-profile-menu-button
            ) {
                border: 1px solid var(--sru-overflow-border);
                background: var(--sru-overflow-bg);
                color: var(--sru-overflow-color);
                box-shadow: var(--sru-overflow-shadow);
                backdrop-filter: var(--sru-overflow-filter);
                transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
            }

            :is(
                .sru-clean-dark-card-menu-button,
                .sru-clean-dark-profile-menu-button
            ):hover {
                border-color: var(--sru-overflow-border-hover);
                background: var(--sru-overflow-bg-hover);
                color: var(--sru-overflow-color);
                box-shadow: var(--sru-overflow-shadow-hover);
            }

            :is(
                .sru-clean-dark-card-menu-button,
                .sru-clean-dark-profile-menu-button
            )[aria-expanded="true"] {
                border-color: var(--sru-overflow-border-active);
                background: var(--sru-overflow-bg-active);
                color: var(--sru-overflow-color);
                box-shadow: var(--sru-overflow-shadow-hover);
            }

            :is(
                .sru-clean-dark-card-menu-button,
                .sru-clean-dark-profile-menu-button
            ):focus-visible {
                outline: 2px solid rgba(107, 188, 255, 0.95);
                outline-offset: 2px;
                box-shadow: 0 0 0 4px rgba(107, 188, 255, 0.22), var(--sru-overflow-shadow-hover);
            }

            .sru-clean-dark-profile-menu {
                box-sizing: border-box;
                position: absolute;
                top: calc(100% + 7px);
                right: 0;
                z-index: 30;
                width: 280px;
                padding: 8px;
                border: 1px solid #d8dee5;
                border-radius: 12px;
                background: #ffffff;
                color: #15202b;
                box-shadow: 0 14px 34px rgba(15, 23, 42, 0.24);
            }

            .sru-clean-dark-profile-menu[hidden] {
                display: none !important;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-profile-menu {
                border-color: var(--sru-border);
                background: var(--sru-surface);
                color: var(--sru-text);
                box-shadow: 0 14px 34px rgba(0, 0, 0, 0.48);
            }

            .sru-clean-dark-profile-menu > button {
                all: unset;
                box-sizing: border-box;
                display: block;
                width: 100%;
                padding: 9px 10px;
                border-radius: 8px;
                color: inherit;
                font-size: 13px;
                line-height: 1.35;
                cursor: pointer;
            }

            .sru-clean-dark-profile-menu > button:hover,
            .sru-clean-dark-profile-menu > button:focus-visible {
                background: #edf1f4;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-profile-menu > button:hover,
            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-profile-menu > button:focus-visible {
                background: var(--sru-surface-hover);
            }

            .sru-clean-dark-profile-menu > button[aria-checked="true"]::before {
                content: "✓";
                display: inline-block;
                width: 18px;
                color: #00a876;
                font-weight: 700;
            }

            .sru-clean-dark-profile-menu > button:disabled {
                color: #98a1ab;
                cursor: default;
            }

            .sru-clean-dark-blocked-article-notice {
                box-sizing: border-box;
                display: grid;
                gap: 7px;
                width: min(760px, calc(100% - 32px));
                margin: 24px auto;
                padding: 20px;
                border: 1px solid #d8dee5;
                border-radius: 12px;
                background: #f5f7f8;
                color: #15202b;
                font-family: Arial, sans-serif;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-blocked-article-notice {
                border-color: var(--sru-border);
                background: var(--sru-surface);
                color: var(--sru-text);
            }

            .sru-clean-dark-blocked-article-notice span {
                color: #66717d;
                font-size: 13px;
            }

            html[${THEME_ATTRIBUTE}="dark"] .sru-clean-dark-blocked-article-notice span {
                color: var(--sru-muted);
            }

            .sru-clean-dark-blocked-article-notice button {
                justify-self: start;
                padding: 8px 12px;
                border: 0;
                border-radius: 8px;
                background: #00a876;
                color: #ffffff;
                font-weight: 700;
                cursor: pointer;
            }

            .super-top__article[data-sru-clean-dark-hidden="true"] {
                display: none !important;
            }

            .super-top.sru-clean-dark-filtered {
                display: grid !important;
                grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                grid-auto-rows: minmax(320px, 400px);
                gap: 8px;
                height: auto !important;
            }

            .super-top.sru-clean-dark-filtered[data-sru-clean-dark-visible-count="1"] {
                grid-template-columns: 1fr;
            }

            .super-top.sru-clean-dark-filtered[data-sru-clean-dark-visible-count="2"] {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .super-top.sru-clean-dark-filtered > .super-top__left,
            .super-top.sru-clean-dark-filtered > .super-top__right {
                display: contents !important;
            }

            .super-top.sru-clean-dark-filtered .super-top__article:not([data-sru-clean-dark-hidden="true"]) {
                width: auto !important;
                height: 100% !important;
                min-height: 320px !important;
                margin: 0 !important;
            }

            .super-top.sru-clean-dark-filtered .super-top__article:not([data-sru-clean-dark-hidden="true"]) > .super-top__img-bg {
                inset: 0 !important;
                width: 100% !important;
                height: 100% !important;
                object-fit: cover !important;
                object-position: center !important;
            }

            .super-top[data-sru-clean-dark-visible-count="0"] {
                display: none !important;
            }

            .sru-clean-dark-toast-root {
                position: fixed;
                right: 20px;
                bottom: 20px;
                z-index: 13000;
                display: flex;
                align-items: center;
                gap: 12px;
                max-width: min(420px, calc(100vw - 40px));
                padding: 12px 14px;
                border: 1px solid var(--sru-border, #3a4653);
                border-radius: 12px;
                background: var(--sru-surface, #161b22);
                color: var(--sru-text, #e6edf3);
                font: 14px/1.35 Arial, sans-serif;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
            }

            .sru-clean-dark-toast-root[hidden] {
                display: none !important;
            }

            .sru-clean-dark-toast-action {
                all: unset;
                flex: 0 0 auto;
                color: #34d6a2;
                font-weight: 700;
                cursor: pointer;
            }

            .sru-clean-dark-toast-action:hover,
            .sru-clean-dark-toast-action:focus-visible {
                text-decoration: underline;
            }

            @media (max-width: 720px) {
                .sru-clean-dark-settings-backdrop {
                    align-items: end;
                    padding: 0;
                }

                .sru-clean-dark-settings-dialog {
                    width: 100%;
                    max-height: 88vh;
                    border-width: 1px 0 0;
                    border-radius: 18px 18px 0 0;
                }

                .sru-clean-dark-settings-head,
                .sru-clean-dark-settings-content {
                    padding-inline: 16px;
                }

                .super-top.sru-clean-dark-filtered,
                .super-top.sru-clean-dark-filtered[data-sru-clean-dark-visible-count="2"] {
                    grid-template-columns: 1fr;
                    grid-auto-rows: minmax(230px, 300px);
                }

                .super-top.sru-clean-dark-filtered .super-top__article:not([data-sru-clean-dark-hidden="true"]) {
                    min-height: 230px !important;
                }

                .sru-clean-dark-toast-root {
                    right: 12px;
                    bottom: 12px;
                    max-width: calc(100vw - 24px);
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .sru-clean-dark-theme-toggle,
                .sru-clean-dark-theme-toggle__toggler,
                .sru-clean-dark-theme-toggle__icon svg,
                .sru-clean-dark-settings-switch__track,
                .sru-clean-dark-settings-switch__thumb,
                .sru-clean-dark-card-menu-button,
                .sru-clean-dark-profile-menu-button {
                    transition-duration: 0.01ms !important;
                    animation: none !important;
                }

                .sru-clean-dark-theme-toggle__toggler::after {
                    animation: none !important;
                }
            }
        `;
    }

    function startObserver() {
        if (!document.documentElement) {
            window.setTimeout(startObserver, 0);
            return;
        }

        applyTheme();
        updateHiddenTopPrepaintStyle();

        const observer = new MutationObserver((mutations) => {
            if (!(hiddenTopPrepaintStyle instanceof HTMLStyleElement) || !hiddenTopPrepaintStyle.isConnected) {
                updateHiddenTopPrepaintStyle();
            }
            let addedCount = 0;
            let headerTouched = false;
            let legacySidebarTouched = false;
            const immediatePromoRoots = new Set();
            const addClosestPromoRoot = (node) => {
                if (!(node instanceof Element)) {
                    return;
                }
                const marked = node.closest('[data-sru-clean-dark-promo="true"]');
                const wrapper = node.matches(PROMO_WRAPPER_SELECTOR)
                    ? node
                    : node.closest(PROMO_WRAPPER_SELECTOR);
                if (marked || wrapper) {
                    immediatePromoRoots.add(marked || wrapper);
                }
            };
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    if (!mutation.target.closest?.(`[${UI_ATTRIBUTE}]`)) {
                        headerTouched ||= mutation.target.matches?.('header')
                            || Boolean(mutation.target.closest?.('header'));
                        legacySidebarTouched ||= rootTouches(mutation.target, '.pageLayout .layout-columns');
                        addClosestPromoRoot(mutation.target);
                        enqueueScanRoot(mutation.target);
                    }
                    continue;
                }

                if (mutationAddsOnlyOwnUi(mutation)) {
                    continue;
                }

                if (mutation.target instanceof Element && !mutation.target.closest(`[${UI_ATTRIBUTE}]`)) {
                    headerTouched ||= mutation.target.matches('header')
                        || Boolean(mutation.target.closest('header'));
                    legacySidebarTouched ||= rootTouches(mutation.target, '.pageLayout .layout-columns');
                    addClosestPromoRoot(mutation.target);
                    enqueueScanRoot(mutation.target);
                }

                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) {
                        continue;
                    }
                    if (node.closest(`[${UI_ATTRIBUTE}]`)) {
                        continue;
                    }
                    headerTouched ||= rootTouches(node, 'header');
                    legacySidebarTouched ||= rootTouches(node, '.pageLayout .layout-columns');
                    immediatePromoRoots.add(node);
                    enqueueScanRoot(node);
                    addedCount += 1;
                }
            }

            if (addedCount > 50 || immediatePromoRoots.size > 50 || queuedRoots.size > 50) {
                queuedRoots.clear();
                queuedRoots.add(document.documentElement);
                immediatePromoRoots.clear();
                immediatePromoRoots.add(document.documentElement);
            }
            for (const root of immediatePromoRoots) {
                scanPromos(root);
            }
            if (headerTouched) {
                ensureThemeToggle();
            }
            if (legacySidebarTouched) {
                syncLegacyEmptySidebars(document.documentElement);
            }
            if (queuedRoots.size > 0) {
                scheduleScan();
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'href', 'class', 'data-article-type', 'data-banner-type', 'data-testid']
        });
        scanPromos(document.documentElement);
        ensureThemeToggle();
    }

    function mutationAddsOnlyOwnUi(mutation) {
        if (mutation.type !== 'childList'
            || mutation.addedNodes.length === 0
            || mutation.removedNodes.length > 0) {
            return false;
        }
        return Array.from(mutation.addedNodes).every((node) => {
            if (node instanceof Element) {
                return node.matches(`[${UI_ATTRIBUTE}]`) || Boolean(node.closest(`[${UI_ATTRIBUTE}]`));
            }
            return node.nodeType === Node.TEXT_NODE && !node.textContent.trim();
        });
    }

    function enqueueScanRoot(root) {
        const scanRoot = root instanceof Document ? root.documentElement : root;
        if (!(scanRoot instanceof Element)) {
            return false;
        }
        for (const queuedRoot of queuedRoots) {
            if (queuedRoot === scanRoot || queuedRoot.contains(scanRoot)) {
                return false;
            }
        }
        for (const queuedRoot of queuedRoots) {
            if (scanRoot.contains(queuedRoot)) {
                queuedRoots.delete(queuedRoot);
            }
        }
        queuedRoots.add(scanRoot);
        return true;
    }

    function queueScan(root) {
        enqueueScanRoot(root);
        if (queuedRoots.size > 0) {
            scheduleScan();
        }
    }

    function scheduleScan() {
        if (scanScheduled) {
            return;
        }
        scanScheduled = true;
        window.setTimeout(runQueuedScan, 16);
    }

    function runQueuedScan() {
        scanScheduled = false;
        if (lastProcessedPathname !== location.pathname) {
            lastProcessedPathname = location.pathname;
            updateHiddenTopPrepaintStyle();
        }
        const roots = Array.from(queuedRoots);
        queuedRoots.clear();
        let shouldScanHeader = false;
        let shouldScanTop = false;

        for (const root of roots) {
            scanAds(root);
            scanPromos(root);
            scanSiteAuthorBlocks(root);
            shouldScanHeader ||= rootTouches(root, 'header');
            shouldScanTop ||= rootTouches(root, '.super-top');
        }
        syncNativeTheme();
        if (shouldScanHeader) {
            ensureThemeToggle();
        }
        if (shouldScanTop) {
            scanTopStories();
        }
        ensureProfileMenu();
        syncBlockedCurrentArticle();
        syncLegacyEmptySidebars(document.documentElement);
    }

    function rootTouches(root, selector) {
        if (root instanceof Document || root === document.documentElement) {
            return true;
        }
        if (!(root instanceof Element)) {
            return false;
        }
        return root.matches(selector)
            || Boolean(root.closest(selector))
            || Boolean(root.querySelector(selector));
    }

    function collectMatchingElements(root, selector) {
        const elements = new Set();
        if (root instanceof Element && root.matches(selector)) {
            elements.add(root);
        }
        if (root && typeof root.querySelectorAll === 'function') {
            for (const element of root.querySelectorAll(selector)) {
                elements.add(element);
            }
        }
        return elements;
    }

    function scanAds(root) {
        if (!state.adBlockingEnabled || !root || typeof root.querySelectorAll !== 'function') {
            return;
        }

        reconcileCollapsedAdNodes(root);

        if (root instanceof Element && root.matches(AD_NODE_SELECTOR)) {
            collapseAdNode(root);
        }

        for (const node of root.querySelectorAll(AD_NODE_SELECTOR)) {
            collapseAdNode(node);
        }

        if (root instanceof Element && root.matches(AD_LINK_SELECTOR)) {
            collapseAdLink(root);
        }

        for (const link of root.querySelectorAll(AD_LINK_SELECTOR)) {
            collapseAdLink(link);
        }
    }

    function reconcileCollapsedAdNodes(root) {
        const markedNodes = new Set();
        if (root instanceof Element) {
            for (let current = root; current; current = current.parentElement) {
                if (current.hasAttribute('data-sru-clean-dark-ad-collapsed')) {
                    markedNodes.add(current);
                }
            }
        }
        for (const node of root.querySelectorAll('[data-sru-clean-dark-ad-collapsed="true"]')) {
            markedNodes.add(node);
        }
        const getDepth = (node) => {
            let depth = 0;
            for (let current = node.parentElement; current; current = current.parentElement) {
                depth += 1;
            }
            return depth;
        };
        const deepestFirst = Array.from(markedNodes).sort((left, right) => getDepth(right) - getDepth(left));
        for (const node of deepestFirst) {
            const selfIsAd = node.matches(AD_NODE_SELECTOR) || node.matches(AD_LINK_SELECTOR);
            const directText = Array.from(node.childNodes)
                .filter((child) => child.nodeType === Node.TEXT_NODE)
                .some((child) => Boolean((child.textContent || '').trim()));
            const hasUsefulChild = Array.from(node.children).some((child) => {
                if (child.matches('script, style, link, noscript')) {
                    return false;
                }
                return child.getAttribute('data-sru-clean-dark-ad-collapsed') !== 'true';
            });
            if (!selfIsAd && (directText || hasUsefulChild)) {
                node.removeAttribute('data-sru-clean-dark-ad-collapsed');
                syncFilteredNodeAccessibility(node);
            }
        }
    }

    function syncLegacyEmptySidebars(root = document.documentElement) {
        const markedSelector = `.pageLayout .layout-columns[${EMPTY_SIDEBAR_ATTRIBUTE}="true"]`;
        if (!state.adBlockingEnabled) {
            for (const layout of document.querySelectorAll(markedSelector)) {
                layout.removeAttribute(EMPTY_SIDEBAR_ATTRIBUTE);
                layout.style.removeProperty('--sru-clean-dark-main-width');
            }
            return;
        }

        const layouts = new Set();
        if (root instanceof Element) {
            const ownLayout = root.matches('.pageLayout .layout-columns')
                ? root
                : root.closest('.pageLayout .layout-columns');
            if (ownLayout) {
                layouts.add(ownLayout);
            }
        }
        if (root && typeof root.querySelectorAll === 'function') {
            for (const layout of root.querySelectorAll('.pageLayout .layout-columns')) {
                layouts.add(layout);
            }
        }

        for (const layout of layouts) {
            const main = Array.from(layout.children).find((child) => child.matches('.mainPart'));
            const sidebar = Array.from(layout.children).find((child) => child.matches('.rightPart'));
            const shouldCollapse = Boolean(main && sidebar && !hasUsefulLegacySidebarContent(sidebar));
            if (shouldCollapse) {
                if (!layout.hasAttribute(EMPTY_SIDEBAR_ATTRIBUTE)) {
                    const mainWidth = main.getBoundingClientRect().width;
                    if (mainWidth <= 0) {
                        continue;
                    }
                    layout.style.setProperty('--sru-clean-dark-main-width', `${mainWidth}px`);
                }
                layout.setAttribute(EMPTY_SIDEBAR_ATTRIBUTE, 'true');
            } else {
                layout.removeAttribute(EMPTY_SIDEBAR_ATTRIBUTE);
                layout.style.removeProperty('--sru-clean-dark-main-width');
            }
        }
    }

    function hasUsefulLegacySidebarContent(sidebar) {
        if (document.readyState !== 'complete') {
            for (const mount of sidebar.querySelectorAll('[data-control], [id$="_gadget"]')) {
                if (!mount.matches(AD_NODE_SELECTOR)
                    && !mount.matches(KNOWN_AD_WRAPPER_SELECTOR)
                    && !isLegacyAdOnlySidebarMount(mount)) {
                    return true;
                }
            }
        }
        const pending = Array.from(sidebar.childNodes);
        while (pending.length > 0) {
            const node = pending.pop();
            if (node.nodeType === Node.TEXT_NODE) {
                const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
                if (text && !/^Реклама(?:\s*\d+\+)?$/i.test(text)) {
                    return true;
                }
                continue;
            }
            if (!(node instanceof Element)) {
                continue;
            }
            if (node.hidden
                || node.getAttribute('aria-hidden') === 'true'
                || node.matches('script, style, link, noscript, template')
                || node.matches(AD_NODE_SELECTOR)
                || node.matches(AD_LINK_SELECTOR)
                || node.matches(KNOWN_AD_WRAPPER_SELECTOR)
                || node.getAttribute('data-sru-clean-dark-ad-collapsed') === 'true') {
                continue;
            }
            if (node.matches('img[src], picture, video[src], canvas, iframe[src], form, button, input, select, textarea, a[href]')) {
                return true;
            }
            pending.push(...node.childNodes);
        }
        return false;
    }

    function isLegacyAdOnlySidebarMount(mount) {
        const control = mount.getAttribute('data-control');
        if (control === 'Banners.MediaKit') {
            return true;
        }
        if (control !== 'Common.Float') {
            return false;
        }
        const children = Array.from(mount.children)
            .filter((child) => !child.matches('script, style, link, noscript, template'));
        return children.length > 0 && children.every((child) => (
            child.matches('#top-ad, .high-adload-banners-container')
        ));
    }

    function scanPromos(root) {
        if (!root || typeof root.querySelectorAll !== 'function') {
            return;
        }

        const wrappers = new Set();
        if (root instanceof Element) {
            const markedWrapper = root.closest('[data-sru-clean-dark-promo="true"]');
            if (markedWrapper) {
                wrappers.add(markedWrapper);
            }
            if (root.matches(PROMO_WRAPPER_SELECTOR)) {
                wrappers.add(root);
            }
            const parentWrapper = root.closest(PROMO_WRAPPER_SELECTOR);
            if (parentWrapper) {
                wrappers.add(parentWrapper);
            }
        }
        for (const wrapper of root.querySelectorAll(PROMO_WRAPPER_SELECTOR)) {
            wrappers.add(wrapper);
        }
        for (const wrapper of root.querySelectorAll('[data-sru-clean-dark-promo="true"]')) {
            wrappers.add(wrapper);
        }
        for (const wrapper of wrappers) {
            refreshPromoNode(wrapper);
        }
    }

    function refreshPromoNode(node) {
        const linkSource = node.matches('.post-body .sb-paragraph + figure.sb-image')
            ? node.previousElementSibling
            : node;
        const links = [
            ...(linkSource?.matches('a[href]') ? [linkSource] : []),
            ...(linkSource?.querySelectorAll('a[href]') || [])
        ];
        const hasDirectText = linkSource?.matches('.post-body .sb-paragraph')
            && Array.from(linkSource.childNodes).some((child) => (
                child.nodeType === Node.TEXT_NODE && Boolean((child.textContent || '').trim())
        ));
        const articleType = String(node.getAttribute('data-article-type') || '').toLowerCase();
        const isPromo = ['tests-games', 'competition', 'promo'].includes(articleType)
            || (!hasDirectText && links.some((link) => (
                isGameOrSpecialUrl(link.href)
                || link.matches(SPONSORED_APPMETRICA_LINK_SELECTOR)
            )));
        if (isPromo) {
            node.setAttribute('data-sru-clean-dark-promo', 'true');
        } else {
            node.removeAttribute('data-sru-clean-dark-promo');
        }
        syncFilteredNodeAccessibility(node);
        return isPromo;
    }

    function collapseAdNode(node) {
        if (!(node instanceof Element) || node.hasAttribute(UI_ATTRIBUTE)) {
            return;
        }

        let current = node;
        for (let depth = 0; depth < 3; depth += 1) {
            current.setAttribute('data-sru-clean-dark-ad-collapsed', 'true');
            syncFilteredNodeAccessibility(current);

            const parent = current.parentElement;
            if (!parent || parent.matches('html, body, main, article, section, aside, nav, header, footer, .super-top, .super-top__article')) {
                break;
            }

            const directText = Array.from(parent.childNodes)
                .filter((child) => child.nodeType === Node.TEXT_NODE)
                .map((child) => child.textContent || '')
                .join('')
                .trim();
            const hasUsefulChild = Array.from(parent.children).some((child) => {
                if (child === current || child.matches('script, style, link, noscript')) {
                    return false;
                }
                return !child.matches(AD_NODE_SELECTOR)
                    && !child.hasAttribute('data-sru-clean-dark-ad-collapsed');
            });
            if (directText || hasUsefulChild) {
                break;
            }
            current = parent;
        }
    }

    function collapseAdLink(link) {
        const knownWrapper = link.closest(KNOWN_AD_WRAPPER_SELECTOR);
        if (knownWrapper) {
            collapseAdNode(knownWrapper);
            return;
        }

        let target = link;
        for (let depth = 0; depth < 3; depth += 1) {
            const parent = target.parentElement;
            if (!parent || parent.matches('body, main, article, section, aside, nav, header, footer')) {
                break;
            }
            const meaningfulChildren = Array.from(parent.children)
                .filter((child) => !child.matches('script, style, link, noscript'));
            const text = (parent.innerText || '').trim();
            if (meaningfulChildren.length !== 1 || text.length > 120) {
                break;
            }
            target = parent;
        }
        collapseAdNode(target);
    }

    function getThemeToggleMarkup() {
        return `
            <span class="sru-clean-dark-theme-toggle__viewport" aria-hidden="true">
                <span class="sru-clean-dark-theme-toggle__toggler">
                    <span class="sru-clean-dark-theme-toggle__icon sru-clean-dark-theme-toggle__icon--sun">
                        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                            <path d="M4.19 3.134 2.88 1.826l-1.025 1.03 1.301 1.308 1.033-1.03ZM2.181 7.27H0v1.462h2.182V7.269ZM8.727 0H7.273v2.155h1.454V0Zm5.418 2.857-1.025-1.03-1.302 1.307 1.026 1.03 1.302-1.307Zm-2.334 10.009 1.302 1.315 1.025-1.03-1.309-1.308-1.018 1.023Zm2.007-5.597v1.462H16V7.269h-2.182ZM8 3.616A4.375 4.375 0 0 0 3.636 8 4.375 4.375 0 0 0 8 12.384 4.375 4.375 0 0 0 12.364 8 4.375 4.375 0 0 0 8 3.616ZM7.273 16h1.454v-2.155H7.273V16Zm-5.418-2.857 1.025 1.03 1.302-1.315-1.026-1.03-1.301 1.315Z"></path>
                        </svg>
                    </span>
                    <span class="sru-clean-dark-theme-toggle__icon sru-clean-dark-theme-toggle__icon--moon">
                        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                            <path d="M8.226 1.337C4.393 1.204 1.333 4.271 1.333 7.991A6.67 6.67 0 0 0 8 14.657a6.652 6.652 0 0 0 5.773-3.347c-5.007-.166-8.06-5.62-5.547-9.973Z"></path>
                        </svg>
                    </span>
                </span>
            </span>
        `;
    }

    function ensureThemeToggle() {
        const header = document.querySelector('header.header, header');
        if (!header) {
            return;
        }

        const host = header.querySelector('.navigation-aside-block');
        if (!host) {
            return;
        }

        let controls = header.querySelector('.sru-clean-dark-header-controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'sru-clean-dark-header-controls';
            controls.setAttribute(UI_ATTRIBUTE, 'header-controls');
        }
        if (controls.parentElement !== host) {
            host.append(controls);
        }

        if (!controls.querySelector('.sru-clean-dark-theme-toggle')) {
            const themeButton = document.createElement('button');
            themeButton.type = 'button';
            themeButton.className = 'sru-clean-dark-theme-toggle';
            themeButton.setAttribute(UI_ATTRIBUTE, 'theme-toggle');
            themeButton.setAttribute('data-sru-theme-toggle', '');
            themeButton.setAttribute('data-sru-theme-state', state.theme);
            themeButton.innerHTML = getThemeToggleMarkup();
            themeButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleTheme();
            });
            controls.append(themeButton);
        }

        if (!controls.querySelector('.sru-clean-dark-settings-toggle')) {
            const settingsButton = document.createElement('button');
            settingsButton.type = 'button';
            settingsButton.className = 'sru-clean-dark-settings-toggle';
            settingsButton.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"></path>
                </svg>
            `;
            settingsButton.setAttribute(UI_ATTRIBUTE, 'settings-toggle');
            settingsButton.setAttribute('aria-label', 'Открыть настройки');
            settingsButton.setAttribute('aria-haspopup', 'dialog');
            settingsButton.setAttribute('aria-expanded', 'false');
            settingsButton.title = 'Настройки';
            settingsButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                openSettingsDialog(settingsButton);
            });
            controls.append(settingsButton);
        }
        for (const settingsButton of document.querySelectorAll('.sru-clean-dark-settings-toggle')) {
            settingsButton.setAttribute('aria-expanded', String(isSettingsDialogOpen()));
        }
        updateThemeButtons();
    }

    function updateThemeButtons() {
        const enabled = state.theme === 'dark';
        for (const button of document.querySelectorAll('[data-sru-theme-toggle]')) {
            button.setAttribute('role', 'switch');
            button.setAttribute('data-sru-theme-state', enabled ? 'dark' : 'light');
            button.setAttribute('aria-checked', String(enabled));
            button.removeAttribute('aria-pressed');
            if (button.hasAttribute('aria-labelledby')) {
                button.removeAttribute('aria-label');
            } else {
                button.setAttribute('aria-label', 'Темная тема');
            }
            button.title = enabled ? 'Отключить темную тему' : 'Включить темную тему';
        }
    }

    function scanTopStories() {
        const sections = document.querySelectorAll('.super-top');
        for (const section of sections) {
            const cards = Array.from(section.querySelectorAll('.super-top__article'));
            for (const card of cards) {
                prepareTopCard(card);
            }
            updateTopSectionLayout(section, cards);
        }
    }

    function prepareTopCard(card) {
        const link = card.querySelector('.super-top__link[href]');
        if (!link) {
            return;
        }

        if (refreshPromoNode(card)) {
            if (openMenu?.card === card) {
                closeCardMenu();
            }
            for (const element of card.querySelectorAll('.sru-clean-dark-card-menu-button, .sru-clean-dark-card-menu')) {
                element.remove();
            }
            cardState.delete(card);
            card.removeAttribute('data-sru-clean-dark-hidden');
            return;
        }

        const url = canonicalizeArticleUrl(link.href);
        const title = (card.querySelector('.super-top__title')?.textContent || link.textContent || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 300);
        let meta = cardState.get(card);
        if (!meta || meta.url !== url) {
            meta = {
                url,
                href: link.href,
                title,
                authors: undefined,
                authorsPromise: null
            };
            cardState.set(card, meta);
        } else {
            meta.href = link.href;
            meta.title = title;
        }

        if (!card.querySelector('.sru-clean-dark-card-menu-button')) {
            addCardMenu(card);
        }

        refreshCardVisibility(card);
        if ((Object.keys(state.blockedTopAuthors).length > 0 || Object.keys(state.blockedSiteAuthors).length > 0)
            && meta.authors === undefined) {
            resolveAuthorsForCard(card).then(() => {
                refreshCardVisibility(card);
                const section = card.closest('.super-top');
                if (section) {
                    updateTopSectionLayout(section, Array.from(section.querySelectorAll('.super-top__article')));
                }
            });
        }
    }

    function addCardMenu(card) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sru-clean-dark-overflow-button sru-clean-dark-card-menu-button';
        button.innerHTML = '<span class="sru-clean-dark-overflow-button__glyph" aria-hidden="true">⋯</span>';
        button.setAttribute(UI_ATTRIBUTE, 'card-menu-button');
        button.setAttribute('aria-label', 'Меню статьи на главной');
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.title = 'Меню статьи на главной';

        const menu = document.createElement('div');
        menu.className = 'sru-clean-dark-card-menu';
        menu.setAttribute(UI_ATTRIBUTE, 'card-menu');
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        menu.innerHTML = `
            <div class="sru-clean-dark-card-menu-author">Авторы: не определены</div>
            <div class="sru-clean-dark-card-menu-author-list" role="group" aria-label="Авторы статьи" hidden></div>
            <button type="button" class="sru-clean-dark-card-menu-action" data-sru-action="hide" role="menuitem">Скрыть статью с главной</button>
            <button type="button" class="sru-clean-dark-card-menu-action" data-sru-action="block-all-authors" role="menuitem" hidden>Скрыть статьи всех авторов с главной</button>
        `;

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleCardMenu(card, button, menu);
        });

        menu.addEventListener('click', async (event) => {
            const authorLink = event.target.closest('.sru-clean-dark-card-menu-author-link');
            if (authorLink) {
                event.stopPropagation();
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const actionButton = event.target.closest('[data-sru-action]');
            if (!actionButton) {
                return;
            }
            if (actionButton.dataset.sruAction === 'hide') {
                hideTopArticle(card);
                return;
            }
            if (actionButton.dataset.sruAction === 'block-author') {
                await blockTopAuthors(card, actionButton, [actionButton.dataset.sruAuthorId]);
                return;
            }
            if (actionButton.dataset.sruAction === 'block-all-authors') {
                await blockTopAuthors(card, actionButton);
            }
        });

        card.append(button, menu);
    }

    function toggleCardMenu(card, button, menu) {
        const willOpen = menu.hidden;
        closeCardMenu();
        if (!willOpen) {
            return;
        }

        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        openMenu = { card, button, menu };
        updateCardMenuAuthor(card, 'loading');
        resolveAuthorsForCard(card, true).then((authors) => {
            if (openMenu && openMenu.card === card) {
                updateCardMenuAuthor(card, authors.length > 0 ? 'ready' : 'missing');
            }
        });
    }

    function closeCardMenu() {
        if (!openMenu) {
            return;
        }
        openMenu.menu.hidden = true;
        openMenu.button.setAttribute('aria-expanded', 'false');
        openMenu = null;
    }

    function updateCardMenuAuthor(card, status) {
        const menu = card.querySelector('.sru-clean-dark-card-menu');
        const authorLabel = menu?.querySelector('.sru-clean-dark-card-menu-author');
        const authorList = menu?.querySelector('.sru-clean-dark-card-menu-author-list');
        const blockAllButton = menu?.querySelector('[data-sru-action="block-all-authors"]');
        if (!authorLabel || !authorList || !blockAllButton) {
            return;
        }

        const meta = cardState.get(card);
        if (status === 'loading') {
            authorLabel.textContent = 'Авторы: определяю…';
            authorList.replaceChildren();
            authorList.hidden = true;
            blockAllButton.hidden = true;
            return;
        }

        const authors = meta?.authors || [];
        if (status === 'ready' && authors.length > 0) {
            authorList.replaceChildren();
            if (authors.length === 1) {
                authorLabel.replaceChildren(document.createTextNode('Автор: '), createCardMenuAuthorLink(authors[0]));
                authorList.hidden = true;
                blockAllButton.textContent = state.blockedSiteAuthors[authors[0].id]
                    ? 'Автор уже скрыт на сайте'
                    : (state.blockedTopAuthors[authors[0].id]
                        ? 'Автор уже скрыт с главной'
                        : 'Скрыть все статьи автора с главной');
            } else {
                authorLabel.textContent = `Авторы статьи (${authors.length})`;
                authorList.hidden = false;
                for (const author of authors) {
                    const row = document.createElement('div');
                    row.className = 'sru-clean-dark-card-menu-author-row';
                    const action = document.createElement('button');
                    action.type = 'button';
                    action.className = 'sru-clean-dark-card-menu-author-action';
                    action.dataset.sruAction = 'block-author';
                    action.dataset.sruAuthorId = author.id;
                    action.setAttribute('role', 'menuitem');
                    if (state.blockedSiteAuthors[author.id]) {
                        action.textContent = 'Скрыт на сайте';
                        action.disabled = true;
                    } else if (state.blockedTopAuthors[author.id]) {
                        action.textContent = 'Уже скрыт';
                        action.disabled = true;
                    } else {
                        action.textContent = 'Скрыть статьи';
                        action.setAttribute('aria-label', `Скрыть статьи автора ${author.name} с главной`);
                    }
                    row.append(createCardMenuAuthorLink(author), action);
                    authorList.append(row);
                }
                const blockedCount = authors.filter((author) => (
                    state.blockedTopAuthors[author.id] || state.blockedSiteAuthors[author.id]
                )).length;
                blockAllButton.textContent = blockedCount > 0
                    ? 'Скрыть статьи остальных авторов с главной'
                    : 'Скрыть статьи всех авторов с главной';
            }
            blockAllButton.hidden = false;
            blockAllButton.disabled = areAllAuthorsBlocked(authors, 'top');
            return;
        }

        authorLabel.textContent = 'Авторы: не найдены';
        authorList.replaceChildren();
        authorList.hidden = true;
        blockAllButton.textContent = 'Авторы недоступны';
        blockAllButton.hidden = false;
        blockAllButton.disabled = true;
    }

    function createCardMenuAuthorLink(author) {
        const profileUrl = getAuthorProfileUrl(author);
        if (!profileUrl) {
            return document.createTextNode(author.name);
        }
        const authorLink = document.createElement('a');
        authorLink.className = 'sru-clean-dark-card-menu-author-link';
        authorLink.href = profileUrl;
        authorLink.target = '_blank';
        authorLink.rel = 'noopener noreferrer';
        authorLink.setAttribute('role', 'menuitem');
        authorLink.textContent = author.name;
        authorLink.title = `Открыть профиль в новой вкладке: ${author.name}`;
        authorLink.setAttribute('aria-label', `Открыть профиль автора ${author.name} в новой вкладке`);
        return authorLink;
    }

    function getAuthorProfileUrl(author) {
        try {
            const url = new URL(author?.profileUrl || `/profile/${author?.id || ''}/`, location.origin);
            const isSportsHost = url.hostname === 'sports.ru' || url.hostname.endsWith('.sports.ru');
            return isSportsHost && /^\/profile\/\d+\/?$/i.test(url.pathname) ? url.href : '';
        } catch {
            return '';
        }
    }

    function hideTopArticle(card) {
        const meta = cardState.get(card);
        if (!meta) {
            return;
        }

        hiddenTopUrls.add(meta.url);
        state.hiddenTopArticles[meta.url] = {
            title: meta.title,
            href: meta.href
        };
        persistState();
        closeCardMenu();
        refreshAllTopStories();
        showToast('Статья скрыта с главной', {
            label: 'Отменить',
            action: () => {
                hiddenTopUrls.delete(meta.url);
                delete state.hiddenTopArticles[meta.url];
                persistState();
                refreshAllTopStories();
            }
        });
    }

    async function blockTopAuthors(card, actionButton, authorIds = null) {
        actionButton.disabled = true;
        const authors = await resolveAuthorsForCard(card, true);
        const requestedIds = authorIds ? new Set(authorIds.filter(Boolean)) : null;
        const selectedAuthors = requestedIds
            ? authors.filter((author) => requestedIds.has(author.id))
            : authors;
        if (selectedAuthors.length === 0) {
            updateCardMenuAuthor(card, 'missing');
            showToast('Не удалось определить авторов');
            return;
        }

        const addedAuthors = [];
        for (const author of selectedAuthors) {
            if (state.blockedTopAuthors[author.id] || state.blockedSiteAuthors[author.id]) {
                continue;
            }
            state.blockedTopAuthors[author.id] = {
                name: author.name,
                profileUrl: author.profileUrl
            };
            addedAuthors.push(author);
        }
        if (addedAuthors.length === 0) {
            updateCardMenuAuthor(card, 'ready');
            showToast(selectedAuthors.length === 1 ? 'Автор уже заблокирован' : 'Все авторы уже заблокированы');
            return;
        }
        persistState();
        closeCardMenu();
        refreshAllTopStories();
        const message = addedAuthors.length === 1
            ? `Статьи автора «${addedAuthors[0].name}» скрыты с главной`
            : `Статьи ${addedAuthors.length} авторов скрыты с главной`;
        showToast(message, {
            label: 'Отменить',
            action: () => {
                for (const author of addedAuthors) {
                    delete state.blockedTopAuthors[author.id];
                }
                persistState();
                refreshAllTopStories();
            }
        });
    }

    function refreshAllTopStories() {
        for (const section of document.querySelectorAll('.super-top')) {
            const cards = Array.from(section.querySelectorAll('.super-top__article'));
            for (const card of cards) {
                refreshCardVisibility(card);
                const meta = cardState.get(card);
                if (meta && meta.authors === undefined
                    && (Object.keys(state.blockedTopAuthors).length > 0 || Object.keys(state.blockedSiteAuthors).length > 0)) {
                    resolveAuthorsForCard(card).then(() => {
                        refreshCardVisibility(card);
                        updateTopSectionLayout(section, cards);
                    });
                }
            }
            updateTopSectionLayout(section, cards);
        }
    }

    function refreshCardVisibility(card) {
        const meta = cardState.get(card);
        if (!meta) {
            return;
        }
        const hiddenByUrl = hiddenTopUrls.has(meta.url);
        const hiddenByAuthor = !isArticleOnOwnAuthorProfile(meta.authors)
            && areAllAuthorsBlocked(meta.authors, 'top');
        card.setAttribute('data-sru-clean-dark-hidden', String(hiddenByUrl || hiddenByAuthor));
    }

    function updateTopSectionLayout(section, cards) {
        const visibleCards = cards.filter((card) => {
            const hiddenByUser = card.getAttribute('data-sru-clean-dark-hidden') === 'true';
            const hiddenByPromo = state.hidePromosEnabled
                && card.getAttribute('data-sru-clean-dark-promo') === 'true';
            return !hiddenByUser && !hiddenByPromo;
        });
        const filtered = visibleCards.length !== cards.length;
        section.classList.toggle('sru-clean-dark-filtered', filtered && visibleCards.length > 0);
        section.setAttribute('data-sru-clean-dark-visible-count', String(visibleCards.length));
    }

    function canonicalizeArticleUrl(value) {
        try {
            const url = new URL(value, location.href);
            const hostname = url.hostname.replace(/^(?:www|m)\./i, '').toLowerCase();
            const pathname = url.pathname.replace(/\/+$/, '') || '/';
            return `${hostname}${pathname}`;
        } catch {
            return String(value).split(/[?#]/, 1)[0];
        }
    }

    function isGameOrSpecialUrl(value) {
        try {
            const url = new URL(value, location.href);
            const hostname = url.hostname.toLowerCase();
            const pathname = url.pathname.toLowerCase();
            if (hostname === 'redirect.appmetrica.yandex.com') {
                return pathname.startsWith('/serve/')
                    && url.searchParams.get('campaign_id')?.toLowerCase() === 'wccontest';
            }
            if (hostname === 'specials.sports.ru'
                || hostname === 'sirena.sports.ru'
                || hostname === 'sirena.world'
                || hostname.endsWith('.sirena.world')) {
                return true;
            }

            const isSportsHost = hostname === 'sports.ru' || hostname.endsWith('.sports.ru');
            if (!isSportsHost) {
                return false;
            }
            return /^\/(?:games|specials?|invisible|osnova|picker|fantasy|predictor)(?:\/|$)/.test(pathname);
        } catch {
            return false;
        }
    }

    function scanSiteAuthorBlocks(root) {
        const hasBlockedAuthors = Object.keys(state.blockedSiteAuthors).length > 0;
        if (!hasBlockedAuthors) {
            for (const element of collectMatchingElements(root, `[${BLOCKED_SITE_ARTICLE_ATTRIBUTE}="true"]`)) {
                element.removeAttribute(BLOCKED_SITE_ARTICLE_ATTRIBUTE);
            }
            return;
        }
        const wrappers = collectMatchingElements(root, SITE_ARTICLE_WRAPPER_SELECTOR);
        for (const wrapper of wrappers) {
            let meta = siteArticleState.get(wrapper);
            const articleLink = findPrimaryArticleLink(wrapper);
            const url = articleLink ? canonicalizeArticleUrl(articleLink.href) : '';
            if (!meta || meta.url !== url) {
                meta = {
                    url,
                    href: articleLink?.href || '',
                    authors: undefined,
                    authorsPromise: null
                };
                siteArticleState.set(wrapper, meta);
            } else if (articleLink) {
                meta.href = articleLink.href;
            }

            const directAuthors = getSiteArticleAuthors(wrapper);
            if (meta.authors === undefined && meta.url) {
                const cached = state.authorCache[meta.url];
                if (cached && cached.expiresAt > Date.now()) {
                    meta.authors = cached.authors;
                }
            }

            refreshSiteArticleVisibility(wrapper);
            const directBlocked = directAuthors.some((author) => state.blockedSiteAuthors[author.id]);
            if (hasBlockedAuthors && meta.authors === undefined && meta.href
                && (directAuthors.length === 0 || directBlocked)) {
                resolveAuthorsForSiteArticle(wrapper).then(() => refreshSiteArticleVisibility(wrapper));
            }
        }

    }

    function getSiteArticleAuthors(wrapper) {
        const links = wrapper.querySelectorAll([
            '.user-info__nick[href*="/profile/"]',
            '[rel="author"][href*="/profile/"]',
            '.material-list__user-name[href*="/profile/"]',
            '.anons__author[href*="/profile/"]',
            '.post-preview__author[href*="/profile/"]',
            ':scope > div:first-child a.bold[href*="/profile/"]'
        ].join(','));
        return authorsFromLinks(links);
    }

    function findPrimaryArticleLink(wrapper) {
        const seen = new Set();
        for (const selector of SITE_ARTICLE_LINK_SELECTORS) {
            for (const link of wrapper.querySelectorAll(selector)) {
                if (!(link instanceof HTMLAnchorElement) || seen.has(link)) {
                    continue;
                }
                seen.add(link);
                try {
                    const url = new URL(link.href, location.href);
                    const hostname = url.hostname.toLowerCase();
                    const isSportsHost = hostname === 'sports.ru' || hostname.endsWith('.sports.ru');
                    if (!isSportsHost || !/\.html$/i.test(url.pathname) || isGameOrSpecialUrl(url.href)) {
                        continue;
                    }
                    if (/^\/(?:profile|tags?|brand)\//i.test(url.pathname)) {
                        continue;
                    }
                    return link;
                } catch {
                    continue;
                }
            }
        }
        return null;
    }

    function refreshSiteArticleVisibility(wrapper) {
        const meta = siteArticleState.get(wrapper);
        if (!isArticleOnOwnAuthorProfile(meta?.authors) && areAllAuthorsBlocked(meta?.authors, 'site')) {
            wrapper.setAttribute(BLOCKED_SITE_ARTICLE_ATTRIBUTE, 'true');
        } else {
            wrapper.removeAttribute(BLOCKED_SITE_ARTICLE_ATTRIBUTE);
        }
    }

    function resolveAuthorsForSiteArticle(wrapper) {
        const meta = siteArticleState.get(wrapper);
        if (!meta || !meta.href || !meta.url) {
            return Promise.resolve([]);
        }
        if (meta.authors !== undefined) {
            return Promise.resolve(meta.authors);
        }
        if (meta.authorsPromise) {
            return meta.authorsPromise;
        }

        meta.authorsPromise = queueAuthorLookup(meta.href, meta.url, false)
            .then((authors) => {
                meta.authors = authors;
                meta.authorsPromise = null;
                state.authorCache[meta.url] = {
                    authors,
                    complete: true,
                    authorsVersion: AUTHOR_CACHE_VERSION,
                    expiresAt: Date.now() + (authors.length > 0 ? CACHE_TTL : NEGATIVE_CACHE_TTL)
                };
                persistState();
                return authors;
            })
            .catch(() => {
                meta.authors = [];
                meta.authorsPromise = null;
                state.authorCache[meta.url] = {
                    authors: [],
                    complete: true,
                    authorsVersion: AUTHOR_CACHE_VERSION,
                    expiresAt: Date.now() + NEGATIVE_CACHE_TTL
                };
                persistState();
                return [];
            });
        return meta.authorsPromise;
    }

    function syncBlockedCurrentArticle() {
        const articles = document.querySelectorAll('article.post-content');
        const activeNotices = new Set();
        for (const article of articles) {
            const authors = authorsFromLinks(article.querySelectorAll(
                ':scope > .post-content__header a.user-info__nick[href*="/profile/"]'
            ));
            const blocked = !isArticleOnOwnAuthorProfile(authors) && areAllAuthorsBlocked(authors, 'site');
            if (blocked) {
                article.setAttribute(BLOCKED_SITE_ARTICLE_ATTRIBUTE, 'true');
                const notice = ensureBlockedArticleNotice(article, authors);
                if (notice) {
                    activeNotices.add(notice);
                }
            } else {
                article.removeAttribute(BLOCKED_SITE_ARTICLE_ATTRIBUTE);
            }
        }
        for (const notice of document.querySelectorAll('.sru-clean-dark-blocked-article-notice')) {
            if (!activeNotices.has(notice)) {
                notice.remove();
            }
        }
    }

    function ensureBlockedArticleNotice(article, authors) {
        const parent = article.parentElement;
        if (!parent) {
            return null;
        }
        let notice = article.previousElementSibling;
        if (!notice?.classList.contains('sru-clean-dark-blocked-article-notice')) {
            notice = document.createElement('section');
            notice.className = 'sru-clean-dark-blocked-article-notice';
            notice.setAttribute(UI_ATTRIBUTE, 'blocked-article-notice');
            notice.innerHTML = `
                <strong>Материал скрыт</strong>
                <span></span>
                <button type="button"></button>
            `;
            parent.insertBefore(notice, article);
        }
        const names = authors.map((author) => author.name).join(', ');
        notice.querySelector('span').textContent = authors.length === 1
            ? `Все статьи автора ${names} скрыты на сайте`
            : `Все статьи авторов ${names} скрыты на сайте`;
        const button = notice.querySelector('button');
        button.textContent = authors.length === 1 ? 'Разблокировать автора' : 'Разблокировать авторов';
        button.onclick = () => {
            const remainsHiddenOnHome = authors.some((author) => state.blockedTopAuthors[author.id]);
            for (const author of authors) {
                delete state.blockedSiteAuthors[author.id];
            }
            persistState();
            refreshBlockingFilters();
            showToast(remainsHiddenOnHome
                ? 'Общая блокировка снята; отдельные фильтры главной сохранены'
                : (authors.length === 1
                    ? 'Статьи автора снова показываются на сайте'
                    : 'Статьи авторов снова показываются на сайте'));
        };
        return notice;
    }

    function authorsFromLinks(links) {
        return normalizeAuthorList(Array.from(links, profileIdentityFromLink).filter(Boolean));
    }

    function profileIdentityFromLink(link) {
        if (!(link instanceof HTMLAnchorElement)) {
            return null;
        }
        try {
            const profileUrl = new URL(link.href, location.origin).href;
            const hostname = new URL(profileUrl).hostname.toLowerCase();
            if (hostname !== 'sports.ru' && !hostname.endsWith('.sports.ru')) {
                return null;
            }
            const match = profileUrl.match(/\/profile\/(\d+)\/?/i);
            if (!match) {
                return null;
            }
            const name = (link.textContent || link.getAttribute('aria-label') || link.title || `Пользователь ${match[1]}`)
                .trim()
                .replace(/\s+/g, ' ');
            return {
                id: match[1],
                name,
                profileUrl
            };
        } catch {
            return null;
        }
    }

    function refreshBlockingFilters() {
        updateHiddenTopPrepaintStyle();
        refreshAllTopStories();
        scanSiteAuthorBlocks(document.documentElement);
        syncBlockedCurrentArticle();
        updateProfileMenu();
        refreshSettingsDialogIfOpen();
    }

    function resolveAuthorsForCard(card, priority = false) {
        const meta = cardState.get(card);
        if (!meta) {
            return Promise.resolve([]);
        }
        if (meta.authors !== undefined) {
            return Promise.resolve(meta.authors);
        }
        if (meta.authorsPromise) {
            return meta.authorsPromise;
        }

        const cached = state.authorCache[meta.url];
        if (cached && cached.expiresAt > Date.now()) {
            meta.authors = cached.authors;
            return Promise.resolve(meta.authors);
        }

        meta.authorsPromise = queueAuthorLookup(meta.href, meta.url, priority)
            .then((authors) => {
                meta.authors = authors;
                meta.authorsPromise = null;
                state.authorCache[meta.url] = {
                    authors,
                    complete: true,
                    authorsVersion: AUTHOR_CACHE_VERSION,
                    expiresAt: Date.now() + (authors.length > 0 ? CACHE_TTL : NEGATIVE_CACHE_TTL)
                };
                persistState();
                return authors;
            })
            .catch(() => {
                meta.authors = [];
                meta.authorsPromise = null;
                state.authorCache[meta.url] = {
                    authors: [],
                    complete: true,
                    authorsVersion: AUTHOR_CACHE_VERSION,
                    expiresAt: Date.now() + NEGATIVE_CACHE_TTL
                };
                persistState();
                return [];
            });
        return meta.authorsPromise;
    }

    function queueAuthorLookup(href, cacheKey, priority) {
        if (lookupPromises.has(cacheKey)) {
            return lookupPromises.get(cacheKey);
        }

        const promise = new Promise((resolve, reject) => {
            const job = { href, resolve, reject };
            if (priority) {
                lookupQueue.unshift(job);
            } else {
                lookupQueue.push(job);
            }
            pumpAuthorQueue();
        }).finally(() => lookupPromises.delete(cacheKey));

        lookupPromises.set(cacheKey, promise);
        return promise;
    }

    function pumpAuthorQueue() {
        while (activeLookups < 2 && lookupQueue.length > 0) {
            const job = lookupQueue.shift();
            activeLookups += 1;
            requestArticleDocument(job.href)
                .then(extractAuthorsFromDocument)
                .then(job.resolve, job.reject)
                .finally(() => {
                    activeLookups -= 1;
                    pumpAuthorQueue();
                });
        }
    }

    function requestArticleDocument(value) {
        const url = new URL(value, location.href);
        if (!/(^|\.)sports\.ru$/i.test(url.hostname)) {
            return Promise.reject(new Error('Unsupported host'));
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url.href,
                timeout: 12000,
                headers: {
                    Accept: 'text/html,application/xhtml+xml'
                },
                onload(response) {
                    if (response.status < 200 || response.status >= 400) {
                        reject(new Error(`HTTP ${response.status}`));
                        return;
                    }
                    const documentValue = new DOMParser().parseFromString(response.responseText, 'text/html');
                    resolve(documentValue);
                },
                onerror: () => reject(new Error('Request failed')),
                ontimeout: () => reject(new Error('Request timed out'))
            });
        });
    }

    function extractAuthorsFromDocument(documentValue) {
        const selectors = [
            '.post-content > .post-content__header .post-authors__author .user-info__nick[href*="/profile/"]',
            '.post-content > .post-content__header .user-info__nick[href*="/profile/"]',
            '.post-page__article > .post-page__header .user-info__nick[href*="/profile/"]',
            '.post-page__article > header .user-info__nick[href*="/profile/"]'
        ];

        for (const selector of selectors) {
            const authors = authorsFromLinks(documentValue.querySelectorAll(selector));
            if (authors.length > 0) {
                return authors;
            }
        }

        const authors = [];
        for (const script of documentValue.querySelectorAll('script[type="application/ld+json"]')) {
            try {
                const value = JSON.parse(script.textContent || 'null');
                authors.push(...authorsFromStructuredData(value));
            } catch {
                continue;
            }
        }
        return normalizeAuthorList(authors);
    }

    function authorsFromStructuredData(value) {
        const queue = Array.isArray(value) ? [...value] : [value];
        const authors = [];
        while (queue.length > 0) {
            const item = queue.shift();
            if (!item || typeof item !== 'object') {
                continue;
            }
            if (Array.isArray(item)) {
                queue.push(...item);
                continue;
            }
            if (item['@graph']) {
                queue.push(item['@graph']);
            }
            const type = Array.isArray(item['@type']) ? item['@type'].join(' ') : item['@type'];
            if (/Article|NewsArticle|BlogPosting/i.test(type || '') && item.author) {
                const authorValues = Array.isArray(item.author) ? item.author : [item.author];
                for (const authorValue of authorValues) {
                    if (!authorValue || typeof authorValue !== 'object') {
                        continue;
                    }
                    const profileUrl = authorValue.url || authorValue['@id'] || '';
                    const match = String(profileUrl).match(/\/profile\/(\d+)\/?/i);
                    if (match && authorValue.name) {
                        authors.push({
                            id: match[1],
                            name: String(authorValue.name).trim(),
                            profileUrl: new URL(profileUrl, location.origin).href
                        });
                    }
                }
            }
        }
        return normalizeAuthorList(authors);
    }

    function ensureProfileMenu() {
        const profileId = getProfileIdFromPath();
        if (!profileId) {
            closeProfileMenu();
            for (const element of document.querySelectorAll('.sru-clean-dark-profile-controls')) {
                element.remove();
            }
            return;
        }

        const title = document.querySelector('.pageLayout .info-block .short-info > .big-title > h1.titleH1, .pageLayout .big-title > h1.titleH1');
        if (!(title instanceof HTMLElement)) {
            return;
        }
        const host = title.parentElement;
        if (!host) {
            return;
        }

        for (const staleControls of document.querySelectorAll('.sru-clean-dark-profile-controls')) {
            if (staleControls.parentElement !== host || staleControls.dataset.sruProfileId !== profileId) {
                if (openProfileMenu?.controls === staleControls) {
                    closeProfileMenu();
                }
                staleControls.remove();
            }
        }

        let controls = host.querySelector(':scope > .sru-clean-dark-profile-controls');
        if (controls && controls.dataset.sruProfileId !== profileId) {
            closeProfileMenu();
            controls.remove();
            controls = null;
        }
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'sru-clean-dark-profile-controls';
            controls.dataset.sruProfileId = profileId;
            controls.setAttribute(UI_ATTRIBUTE, 'profile-controls');
            controls.innerHTML = `
                <button type="button" class="sru-clean-dark-overflow-button sru-clean-dark-profile-menu-button" aria-label="Настройки фильтрации пользователя" aria-haspopup="menu" aria-expanded="false"><span class="sru-clean-dark-overflow-button__glyph" aria-hidden="true">⋯</span></button>
                <div class="sru-clean-dark-profile-menu" role="menu" hidden>
                    <button type="button" role="menuitemcheckbox" data-sru-profile-action="top"></button>
                    <button type="button" role="menuitemcheckbox" data-sru-profile-action="site"></button>
                </div>
            `;
            controls.addEventListener('click', handleProfileMenuClick);
            host.append(controls);
        }
        controls.dataset.sruProfileName = (title.textContent || `Пользователь ${profileId}`).trim().replace(/\s+/g, ' ');
        updateProfileMenu();
    }

    function handleProfileMenuClick(event) {
        const controls = event.currentTarget;
        const button = event.target.closest('.sru-clean-dark-profile-menu-button');
        if (button) {
            event.preventDefault();
            toggleProfileMenu(controls);
            return;
        }
        const actionButton = event.target.closest('[data-sru-profile-action]');
        if (!actionButton) {
            return;
        }
        event.preventDefault();
        const profileId = controls.dataset.sruProfileId;
        const name = controls.dataset.sruProfileName || `Пользователь ${profileId}`;
        toggleProfileBlock(profileId, name, actionButton.dataset.sruProfileAction);
    }

    function toggleProfileMenu(controls) {
        const button = controls.querySelector('.sru-clean-dark-profile-menu-button');
        const menu = controls.querySelector('.sru-clean-dark-profile-menu');
        if (!button || !menu) {
            return;
        }
        const shouldOpen = menu.hidden;
        closeCardMenu();
        closeProfileMenu();
        if (shouldOpen) {
            menu.hidden = false;
            button.setAttribute('aria-expanded', 'true');
            openProfileMenu = { controls, button, menu };
            menu.querySelector('button')?.focus();
        }
    }

    function closeProfileMenu(restoreFocus = false) {
        if (!openProfileMenu) {
            return;
        }
        const button = openProfileMenu.button;
        openProfileMenu.menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        openProfileMenu = null;
        if (restoreFocus && button.isConnected) {
            button.focus();
        }
    }

    function updateProfileMenu() {
        for (const controls of document.querySelectorAll('.sru-clean-dark-profile-controls')) {
            const profileId = controls.dataset.sruProfileId;
            const topBlocked = Boolean(state.blockedTopAuthors[profileId]);
            const siteBlocked = Boolean(state.blockedSiteAuthors[profileId]);
            updateProfileAction(controls, 'top', topBlocked || siteBlocked,
                'Показывать статьи на главной', 'Скрыть статьи с главной', siteBlocked);
            updateProfileAction(controls, 'site', siteBlocked,
                'Снять общую блокировку статей', 'Скрыть статьи на всем сайте');
        }
    }

    function updateProfileAction(controls, action, active, activeText, inactiveText, disabled = false) {
        const button = controls.querySelector(`[data-sru-profile-action="${action}"]`);
        if (!button) {
            return;
        }
        button.textContent = disabled ? 'Статьи уже скрыты на всем сайте' : (active ? activeText : inactiveText);
        button.setAttribute('aria-checked', String(active));
        button.disabled = disabled;
    }

    function toggleProfileBlock(profileId, name, action) {
        if (!/^\d+$/.test(profileId)) {
            return;
        }
        const profileUrl = new URL(`/profile/${profileId}/`, location.origin).href;
        const record = { name, profileUrl };
        let enabled = false;
        let message = '';
        if (action === 'top') {
            enabled = !state.blockedTopAuthors[profileId];
            if (enabled) {
                state.blockedTopAuthors[profileId] = record;
            } else {
                delete state.blockedTopAuthors[profileId];
            }
            message = enabled ? 'Статьи пользователя скрыты с главной' : 'Статьи пользователя возвращены на главную';
        } else if (action === 'site') {
            enabled = !state.blockedSiteAuthors[profileId];
            if (enabled) {
                state.blockedSiteAuthors[profileId] = record;
            } else {
                delete state.blockedSiteAuthors[profileId];
            }
            message = enabled
                ? 'Статьи пользователя скрыты на всем сайте'
                : (state.blockedTopAuthors[profileId]
                    ? 'Общая блокировка снята; отдельный фильтр главной сохранен'
                    : 'Статьи пользователя снова показываются на сайте');
        } else {
            return;
        }
        persistState();
        refreshBlockingFilters();
        showToast(message);
    }

    function installStorageSync() {
        if (typeof GM_addValueChangeListener !== 'function') {
            return;
        }

        GM_addValueChangeListener(STORAGE_KEY, (_name, _oldValue, newValue, remote) => {
            if (!remote) {
                return;
            }

            const nextState = normalizeState(newValue);
            hiddenTopUrls.clear();
            for (const url of nextState.hiddenTopUrls) {
                hiddenTopUrls.add(url);
            }
            state.theme = nextState.theme;
            state.adBlockingEnabled = nextState.adBlockingEnabled;
            state.hidePromosEnabled = nextState.hidePromosEnabled;
            state.analyticsBlockingEnabled = nextState.analyticsBlockingEnabled;
            state.hiddenTopArticles = nextState.hiddenTopArticles;
            state.blockedTopAuthors = nextState.blockedTopAuthors;
            state.blockedSiteAuthors = nextState.blockedSiteAuthors;
            state.authorCache = nextState.authorCache;
            updateHiddenTopPrepaintStyle();
            applyAdBlockingRuntime();
            applyAnalyticsBlockingRuntime();
            applyTheme();
            queueScan(document.documentElement);
            refreshBlockingFilters();
        });
    }

    function ensureSettingsDialog() {
        if (!document.body) {
            return null;
        }

        let backdrop = document.querySelector('.sru-clean-dark-settings-backdrop');
        if (backdrop) {
            return backdrop;
        }

        backdrop = document.createElement('div');
        backdrop.className = 'sru-clean-dark-settings-backdrop';
        backdrop.setAttribute(UI_ATTRIBUTE, 'settings-backdrop');
        backdrop.hidden = true;
        backdrop.innerHTML = `
            <section class="sru-clean-dark-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="sru-clean-dark-settings-title">
                <div class="sru-clean-dark-settings-head">
                    <div>
                        <h2 class="sru-clean-dark-settings-title" id="sru-clean-dark-settings-title">Sports.ru Clean</h2>
                        <p class="sru-clean-dark-settings-subtitle">Настройки применяются во всех вкладках</p>
                    </div>
                    <button type="button" class="sru-clean-dark-settings-close" data-sru-settings-action="close" aria-label="Закрыть настройки">×</button>
                </div>
                <div class="sru-clean-dark-settings-content">
                    <section class="sru-clean-dark-settings-section">
                        <div class="sru-clean-dark-settings-row">
                            <div>
                                <div class="sru-clean-dark-settings-row-title" id="sru-settings-theme-title">Тема сайта</div>
                                <div class="sru-clean-dark-settings-row-note" id="sru-settings-theme-note">Переключается без перезагрузки</div>
                            </div>
                            <button type="button" class="sru-clean-dark-settings-switch" data-sru-theme-toggle data-sru-settings-action="toggle-theme" role="switch" aria-labelledby="sru-settings-theme-title" aria-describedby="sru-settings-theme-note">${getThemeToggleMarkup()}</button>
                        </div>
                        <div class="sru-clean-dark-settings-row">
                            <div>
                                <div class="sru-clean-dark-settings-row-title" id="sru-settings-ads-title">Блокировка рекламы</div>
                                <div class="sru-clean-dark-settings-row-note" id="sru-settings-ads-note">Баннеры и рекламные вставки; полностью применяется после перезагрузки</div>
                            </div>
                            <button type="button" class="sru-clean-dark-settings-switch" data-sru-settings-action="toggle-ad-blocking" role="switch" aria-labelledby="sru-settings-ads-title" aria-describedby="sru-settings-ads-note">
                                <span class="sru-clean-dark-settings-switch__track" aria-hidden="true">
                                    <span class="sru-clean-dark-settings-switch__thumb"></span>
                                </span>
                            </button>
                        </div>
                        <div class="sru-clean-dark-settings-row">
                            <div>
                                <div class="sru-clean-dark-settings-row-title" id="sru-settings-promos-title">Скрытие игр и спецпроектов</div>
                                <div class="sru-clean-dark-settings-row-note" id="sru-settings-promos-note">Игровые каталоги, квизы, тестовые лендинги и промо</div>
                            </div>
                            <button type="button" class="sru-clean-dark-settings-switch" data-sru-settings-action="toggle-promos" role="switch" aria-labelledby="sru-settings-promos-title" aria-describedby="sru-settings-promos-note">
                                <span class="sru-clean-dark-settings-switch__track" aria-hidden="true">
                                    <span class="sru-clean-dark-settings-switch__thumb"></span>
                                </span>
                            </button>
                        </div>
                        <div class="sru-clean-dark-settings-row">
                            <div>
                                <div class="sru-clean-dark-settings-row-title" id="sru-settings-analytics-title">Блокировка аналитики</div>
                                <div class="sru-clean-dark-settings-row-note" id="sru-settings-analytics-note">GTM, Google Analytics, Яндекс.Метрика и телеметрия плеера; полностью применяется после перезагрузки</div>
                            </div>
                            <button type="button" class="sru-clean-dark-settings-switch" data-sru-settings-action="toggle-analytics-blocking" role="switch" aria-labelledby="sru-settings-analytics-title" aria-describedby="sru-settings-analytics-note">
                                <span class="sru-clean-dark-settings-switch__track" aria-hidden="true">
                                    <span class="sru-clean-dark-settings-switch__thumb"></span>
                                </span>
                            </button>
                        </div>
                    </section>
                    <section class="sru-clean-dark-settings-section">
                        <div class="sru-clean-dark-settings-section-head">
                            <div>
                                <span class="sru-clean-dark-settings-section-title">Статьи, скрытые с главной</span>
                                <span class="sru-clean-dark-settings-count" data-sru-settings-hidden-count></span>
                            </div>
                            <button type="button" class="sru-clean-dark-settings-button" data-sru-settings-action="restore-all-articles">Вернуть все</button>
                        </div>
                        <ul class="sru-clean-dark-settings-list" data-sru-settings-hidden-list></ul>
                        <div class="sru-clean-dark-settings-empty" data-sru-settings-hidden-empty>Нет статей, скрытых с главной</div>
                    </section>
                    <section class="sru-clean-dark-settings-section">
                        <div class="sru-clean-dark-settings-section-head">
                            <div>
                                <span class="sru-clean-dark-settings-section-title">Авторы, чьи статьи скрыты с главной</span>
                                <span class="sru-clean-dark-settings-count" data-sru-settings-author-count></span>
                            </div>
                            <button type="button" class="sru-clean-dark-settings-button" data-sru-settings-action="unblock-all-authors">Вернуть все</button>
                        </div>
                        <ul class="sru-clean-dark-settings-list" data-sru-settings-author-list></ul>
                        <div class="sru-clean-dark-settings-empty" data-sru-settings-author-empty>Нет авторов, чьи статьи скрыты с главной</div>
                    </section>
                    <section class="sru-clean-dark-settings-section">
                        <div class="sru-clean-dark-settings-section-head">
                            <div>
                                <span class="sru-clean-dark-settings-section-title">Авторы, чьи статьи скрыты на сайте</span>
                                <span class="sru-clean-dark-settings-count" data-sru-settings-site-author-count></span>
                            </div>
                            <button type="button" class="sru-clean-dark-settings-button" data-sru-settings-action="unblock-all-site-authors">Вернуть все</button>
                        </div>
                        <ul class="sru-clean-dark-settings-list" data-sru-settings-site-author-list></ul>
                        <div class="sru-clean-dark-settings-empty" data-sru-settings-site-author-empty>Нет авторов, скрытых на всем сайте</div>
                    </section>
                    <div class="sru-clean-dark-settings-footer">
                        <button type="button" class="sru-clean-dark-settings-button sru-clean-dark-settings-button--danger" data-sru-settings-action="reset">Сбросить настройки</button>
                    </div>
                </div>
            </section>
        `;

        backdrop.addEventListener('click', handleSettingsClick);
        document.body.append(backdrop);
        return backdrop;
    }

    function openSettingsDialog(trigger) {
        const backdrop = ensureSettingsDialog();
        if (!backdrop) {
            window.setTimeout(() => openSettingsDialog(trigger), 0);
            return;
        }
        if (!backdrop.hidden) {
            backdrop.querySelector('.sru-clean-dark-settings-close')?.focus();
            return;
        }

        closeCardMenu();
        closeProfileMenu();
        settingsReturnFocus = trigger || document.activeElement;
        settingsBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        renderSettingsDialog(backdrop);
        backdrop.hidden = false;
        for (const button of document.querySelectorAll('.sru-clean-dark-settings-toggle')) {
            button.setAttribute('aria-expanded', 'true');
        }
        window.setTimeout(() => backdrop.querySelector('.sru-clean-dark-settings-close')?.focus(), 0);
    }

    function closeSettingsDialog(restoreFocus = true) {
        const backdrop = document.querySelector('.sru-clean-dark-settings-backdrop');
        if (!backdrop || backdrop.hidden) {
            return;
        }

        backdrop.hidden = true;
        if (document.body) {
            document.body.style.overflow = settingsBodyOverflow;
        }
        for (const button of document.querySelectorAll('.sru-clean-dark-settings-toggle')) {
            button.setAttribute('aria-expanded', 'false');
        }
        window.clearTimeout(settingsResetTimer);
        settingsResetTimer = 0;
        if (restoreFocus && settingsReturnFocus instanceof HTMLElement && settingsReturnFocus.isConnected) {
            settingsReturnFocus.focus();
        } else {
            const fallback = document.querySelector('.sru-clean-dark-settings-toggle');
            if (fallback instanceof HTMLElement) {
                fallback.focus();
            } else if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        }
        settingsReturnFocus = null;
    }

    function isSettingsDialogOpen() {
        const backdrop = document.querySelector('.sru-clean-dark-settings-backdrop');
        return Boolean(backdrop && !backdrop.hidden);
    }

    function refreshSettingsDialogIfOpen() {
        const backdrop = document.querySelector('.sru-clean-dark-settings-backdrop');
        if (backdrop && !backdrop.hidden) {
            renderSettingsDialog(backdrop);
        }
    }

    function renderSettingsDialog(backdrop) {
        if (!backdrop) {
            return;
        }

        const themeButton = backdrop.querySelector('[data-sru-settings-action="toggle-theme"]');
        themeButton.setAttribute('data-sru-theme-state', state.theme);
        themeButton.setAttribute('aria-checked', String(state.theme === 'dark'));
        themeButton.removeAttribute('aria-pressed');
        themeButton.title = state.theme === 'dark' ? 'Отключить темную тему' : 'Включить темную тему';

        const adBlockingButton = backdrop.querySelector('[data-sru-settings-action="toggle-ad-blocking"]');
        adBlockingButton.setAttribute('aria-checked', String(state.adBlockingEnabled));
        adBlockingButton.title = state.adBlockingEnabled
            ? 'Выключить блокировку рекламы'
            : 'Включить блокировку рекламы';

        const promosButton = backdrop.querySelector('[data-sru-settings-action="toggle-promos"]');
        promosButton.setAttribute('aria-checked', String(state.hidePromosEnabled));
        promosButton.title = state.hidePromosEnabled
            ? 'Показывать игры и спецпроекты'
            : 'Скрывать игры и спецпроекты';

        const analyticsButton = backdrop.querySelector('[data-sru-settings-action="toggle-analytics-blocking"]');
        analyticsButton.setAttribute('aria-checked', String(state.analyticsBlockingEnabled));
        analyticsButton.title = state.analyticsBlockingEnabled
            ? 'Выключить блокировку аналитики'
            : 'Включить блокировку аналитики';

        const hiddenUrls = Array.from(hiddenTopUrls).sort((left, right) => left.localeCompare(right, 'ru'));
        const hiddenList = backdrop.querySelector('[data-sru-settings-hidden-list]');
        const hiddenEmpty = backdrop.querySelector('[data-sru-settings-hidden-empty]');
        const restoreAllButton = backdrop.querySelector('[data-sru-settings-action="restore-all-articles"]');
        backdrop.querySelector('[data-sru-settings-hidden-count]').textContent = `(${hiddenUrls.length})`;
        restoreAllButton.disabled = hiddenUrls.length === 0;
        hiddenEmpty.hidden = hiddenUrls.length > 0;
        hiddenList.replaceChildren();
        for (const url of hiddenUrls) {
            const item = document.createElement('li');
            item.className = 'sru-clean-dark-settings-list-item';
            const article = state.hiddenTopArticles[url];
            const title = article?.title || formatHiddenArticle(url);
            const label = createSettingsItemLink(
                title,
                getSettingsArticleHref(url, article),
                `Открыть статью «${title}» в новой вкладке`
            );
            label.dataset.sruSettingsLinkKind = 'article';
            const restoreButton = document.createElement('button');
            restoreButton.type = 'button';
            restoreButton.className = 'sru-clean-dark-settings-button';
            restoreButton.dataset.sruSettingsAction = 'restore-article';
            restoreButton.dataset.sruHiddenUrl = url;
            restoreButton.textContent = 'Вернуть на главную';
            item.append(label, restoreButton);
            hiddenList.append(item);
        }

        const authors = Object.entries(state.blockedTopAuthors)
            .sort((left, right) => String(left[1]?.name || '').localeCompare(String(right[1]?.name || ''), 'ru'));
        const authorList = backdrop.querySelector('[data-sru-settings-author-list]');
        const authorEmpty = backdrop.querySelector('[data-sru-settings-author-empty]');
        const unblockAllButton = backdrop.querySelector('[data-sru-settings-action="unblock-all-authors"]');
        backdrop.querySelector('[data-sru-settings-author-count]').textContent = `(${authors.length})`;
        unblockAllButton.disabled = authors.length === 0;
        authorEmpty.hidden = authors.length > 0;
        authorList.replaceChildren();
        for (const [authorId, author] of authors) {
            const item = document.createElement('li');
            item.className = 'sru-clean-dark-settings-list-item';
            const authorName = author?.name || `Автор ${authorId}`;
            const label = createSettingsItemLink(
                authorName,
                author?.profileUrl || `https://www.sports.ru/profile/${authorId}/`,
                `Открыть профиль автора ${authorName} в новой вкладке`
            );
            label.dataset.sruSettingsLinkKind = 'author';
            const unblockButton = document.createElement('button');
            unblockButton.type = 'button';
            unblockButton.className = 'sru-clean-dark-settings-button';
            unblockButton.dataset.sruSettingsAction = 'unblock-author';
            unblockButton.dataset.sruAuthorId = authorId;
            unblockButton.textContent = 'Вернуть статьи';
            item.append(label, unblockButton);
            authorList.append(item);
        }

        renderBlockedPeopleSettings(backdrop, {
            entries: Object.entries(state.blockedSiteAuthors),
            prefix: 'site-author',
            action: 'unblock-site-author',
            allAction: 'unblock-all-site-authors',
            buttonText: 'Снять блокировку'
        });

        const resetButton = backdrop.querySelector('[data-sru-settings-action="reset"]');
        resetButton.dataset.confirming = 'false';
        resetButton.textContent = 'Сбросить настройки';
    }

    function createSettingsItemLink(text, href, ariaLabel) {
        const link = document.createElement('a');
        link.className = 'sru-clean-dark-settings-item-label sru-clean-dark-settings-item-link';
        link.textContent = text;
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = text;
        link.setAttribute('aria-label', ariaLabel);
        return link;
    }

    function getSettingsArticleHref(url, article) {
        const fallback = `https://www.${String(url).replace(/^www\./i, '')}`;
        for (const candidate of [article?.href, fallback]) {
            if (!candidate) {
                continue;
            }
            try {
                const parsed = new URL(candidate, location.origin);
                if ((parsed.protocol === 'https:' || parsed.protocol === 'http:')
                    && (parsed.hostname === 'sports.ru' || parsed.hostname.endsWith('.sports.ru'))) {
                    return parsed.href;
                }
            } catch {}
        }
        return 'https://www.sports.ru/';
    }

    function renderBlockedPeopleSettings(backdrop, options) {
        const entries = options.entries
            .sort((left, right) => String(left[1]?.name || '').localeCompare(String(right[1]?.name || ''), 'ru'));
        const list = backdrop.querySelector(`[data-sru-settings-${options.prefix}-list]`);
        const empty = backdrop.querySelector(`[data-sru-settings-${options.prefix}-empty]`);
        const count = backdrop.querySelector(`[data-sru-settings-${options.prefix}-count]`);
        const restoreAll = backdrop.querySelector(`[data-sru-settings-action="${options.allAction}"]`);
        count.textContent = `(${entries.length})`;
        restoreAll.disabled = entries.length === 0;
        empty.hidden = entries.length > 0;
        list.replaceChildren();
        for (const [profileId, profile] of entries) {
            const item = document.createElement('li');
            item.className = 'sru-clean-dark-settings-list-item';
            const profileName = profile?.name || `Пользователь ${profileId}`;
            const label = createSettingsItemLink(
                profileName,
                profile?.profileUrl || `https://www.sports.ru/profile/${profileId}/`,
                `Открыть профиль автора ${profileName} в новой вкладке`
            );
            label.dataset.sruSettingsLinkKind = 'author';
            const restoreButton = document.createElement('button');
            restoreButton.type = 'button';
            restoreButton.className = 'sru-clean-dark-settings-button';
            restoreButton.dataset.sruSettingsAction = options.action;
            restoreButton.dataset.sruProfileId = profileId;
            restoreButton.textContent = options.buttonText;
            item.append(label, restoreButton);
            list.append(item);
        }
    }

    function formatHiddenArticle(value) {
        try {
            const url = new URL(`https://www.${value}`);
            return decodeURIComponent(url.pathname).replace(/^\//, '') || value;
        } catch {
            return value;
        }
    }

    function focusSettingsAfterRender(backdrop, selectors = []) {
        window.setTimeout(() => {
            if (backdrop.hidden) {
                return;
            }
            for (const selector of selectors) {
                const target = backdrop.querySelector(selector);
                if (target instanceof HTMLElement) {
                    target.focus();
                    return;
                }
            }
            backdrop.querySelector('.sru-clean-dark-settings-close')?.focus();
        }, 0);
    }

    function handleSettingsClick(event) {
        const backdrop = event.currentTarget;
        if (event.target === backdrop) {
            closeSettingsDialog();
            return;
        }

        const button = event.target.closest('[data-sru-settings-action]');
        if (!button) {
            return;
        }
        event.preventDefault();

        const action = button.dataset.sruSettingsAction;
        if (action === 'close') {
            closeSettingsDialog();
            return;
        }
        if (action === 'toggle-theme') {
            toggleTheme();
            return;
        }
        if (action === 'toggle-ad-blocking') {
            state.adBlockingEnabled = !state.adBlockingEnabled;
            applyAdBlockingRuntime();
            applyFilterPreferences();
            persistState();
            if (state.adBlockingEnabled) {
                queueScan(document.documentElement);
            }
            renderSettingsDialog(backdrop);
            showToast(state.adBlockingEnabled
                ? 'Блокировка рекламы включена. Для полного применения обновите страницу'
                : 'Блокировка рекламы выключена. Для полной загрузки обновите страницу');
            return;
        }
        if (action === 'toggle-promos') {
            state.hidePromosEnabled = !state.hidePromosEnabled;
            applyFilterPreferences();
            queueScan(document.documentElement);
            refreshAllTopStories();
            persistState();
            renderSettingsDialog(backdrop);
            showToast(state.hidePromosEnabled
                ? 'Игры и спецпроекты скрыты'
                : 'Игры и спецпроекты показываются');
            return;
        }
        if (action === 'toggle-analytics-blocking') {
            state.analyticsBlockingEnabled = !state.analyticsBlockingEnabled;
            applyAnalyticsBlockingRuntime();
            persistState();
            renderSettingsDialog(backdrop);
            showToast(state.analyticsBlockingEnabled
                ? 'Блокировка аналитики включена. Для полного применения обновите страницу'
                : 'Блокировка аналитики выключена. Для полной загрузки обновите страницу');
            return;
        }
        if (action === 'restore-article') {
            hiddenTopUrls.delete(button.dataset.sruHiddenUrl);
            delete state.hiddenTopArticles[button.dataset.sruHiddenUrl];
            persistState();
            refreshAllTopStories();
            renderSettingsDialog(backdrop);
            focusSettingsAfterRender(backdrop, [
                '[data-sru-settings-action="restore-article"]',
                '[data-sru-settings-action="restore-all-articles"]:not(:disabled)'
            ]);
            showToast('Статья возвращена на главную');
            return;
        }
        if (action === 'restore-all-articles') {
            hiddenTopUrls.clear();
            state.hiddenTopArticles = {};
            persistState();
            refreshAllTopStories();
            renderSettingsDialog(backdrop);
            focusSettingsAfterRender(backdrop);
            showToast('Скрытые статьи возвращены на главную');
            return;
        }
        if (action === 'unblock-author') {
            delete state.blockedTopAuthors[button.dataset.sruAuthorId];
            persistState();
            refreshAllTopStories();
            updateProfileMenu();
            renderSettingsDialog(backdrop);
            focusSettingsAfterRender(backdrop, [
                '[data-sru-settings-action="unblock-author"]',
                '[data-sru-settings-action="unblock-all-authors"]:not(:disabled)'
            ]);
            showToast('Статьи автора возвращены на главную');
            return;
        }
        if (action === 'unblock-all-authors') {
            state.blockedTopAuthors = {};
            persistState();
            refreshAllTopStories();
            updateProfileMenu();
            renderSettingsDialog(backdrop);
            focusSettingsAfterRender(backdrop);
            showToast('Статьи авторов возвращены на главную');
            return;
        }
        if (action === 'unblock-site-author') {
            const remainsHiddenOnHome = Boolean(state.blockedTopAuthors[button.dataset.sruProfileId]);
            delete state.blockedSiteAuthors[button.dataset.sruProfileId];
            persistState();
            refreshBlockingFilters();
            focusSettingsAfterRender(backdrop, [
                '[data-sru-settings-action="unblock-site-author"]',
                '[data-sru-settings-action="unblock-all-site-authors"]:not(:disabled)'
            ]);
            showToast(remainsHiddenOnHome
                ? 'Общая блокировка снята; отдельный фильтр главной сохранен'
                : 'Статьи автора снова показываются на сайте');
            return;
        }
        if (action === 'unblock-all-site-authors') {
            const keepsHomeFilters = Object.keys(state.blockedSiteAuthors)
                .some((profileId) => Boolean(state.blockedTopAuthors[profileId]));
            state.blockedSiteAuthors = {};
            persistState();
            refreshBlockingFilters();
            focusSettingsAfterRender(backdrop);
            showToast(keepsHomeFilters
                ? 'Общие блокировки сняты; отдельные фильтры главной сохранены'
                : 'Все авторы разблокированы на сайте');
            return;
        }
        if (action === 'reset') {
            if (button.dataset.confirming !== 'true') {
                button.dataset.confirming = 'true';
                button.textContent = 'Нажмите еще раз для сброса';
                window.clearTimeout(settingsResetTimer);
                settingsResetTimer = window.setTimeout(() => {
                    if (button.isConnected) {
                        button.dataset.confirming = 'false';
                        button.textContent = 'Сбросить настройки';
                    }
                }, 3000);
                return;
            }
            window.clearTimeout(settingsResetTimer);
            hiddenTopUrls.clear();
            state.hiddenTopArticles = {};
            state.blockedTopAuthors = {};
            state.blockedSiteAuthors = {};
            state.authorCache = {};
            state.theme = 'dark';
            state.adBlockingEnabled = true;
            state.hidePromosEnabled = true;
            state.analyticsBlockingEnabled = true;
            applyAdBlockingRuntime();
            applyAnalyticsBlockingRuntime();
            applyTheme();
            persistState();
            queueScan(document.documentElement);
            refreshBlockingFilters();
            showToast('Настройки сброшены');
        }
    }

    function trapSettingsFocus(event) {
        if (event.key !== 'Tab') {
            return;
        }
        const backdrop = document.querySelector('.sru-clean-dark-settings-backdrop');
        if (!backdrop || backdrop.hidden) {
            return;
        }

        const focusable = Array.from(backdrop.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
            .filter((element) => element.getClientRects().length > 0);
        if (focusable.length === 0) {
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!backdrop.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function installGlobalListeners() {
        document.addEventListener('click', (event) => {
            if (openMenu && !openMenu.menu.contains(event.target) && !openMenu.button.contains(event.target)) {
                closeCardMenu();
            }
            if (openProfileMenu
                && !openProfileMenu.menu.contains(event.target)
                && !openProfileMenu.button.contains(event.target)) {
                closeProfileMenu();
            }
        }, true);

        document.addEventListener('keydown', (event) => {
            trapSettingsFocus(event);
            if (event.key === 'Escape') {
                if (isSettingsDialogOpen()) {
                    event.preventDefault();
                    closeSettingsDialog();
                } else if (openProfileMenu) {
                    event.preventDefault();
                    closeProfileMenu(true);
                } else {
                    closeCardMenu();
                }
            }
        }, true);

        window.addEventListener('popstate', () => {
            closeSettingsDialog(false);
            closeProfileMenu();
            updateHiddenTopPrepaintStyle();
            queueScan(document.documentElement);
        });
    }

    function showToast(message, options = {}) {
        if (!document.body) {
            window.setTimeout(() => showToast(message, options), 0);
            return;
        }

        let toast = document.querySelector('.sru-clean-dark-toast-root');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'sru-clean-dark-toast-root';
            toast.setAttribute(UI_ATTRIBUTE, 'toast');
            toast.setAttribute('role', 'status');
            document.body.append(toast);
        }

        toast.replaceChildren();
        const text = document.createElement('span');
        text.textContent = message;
        toast.append(text);

        if (options.label && typeof options.action === 'function') {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'sru-clean-dark-toast-action';
            action.textContent = options.label;
            action.addEventListener('click', () => {
                options.action();
                toast.hidden = true;
            }, { once: true });
            toast.append(action);
        }

        toast.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            toast.hidden = true;
        }, 5000);
    }

}());
