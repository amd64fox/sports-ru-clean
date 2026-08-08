const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'sports-ru-clean-dark.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const constantsSource = [
    source.slice(
        source.indexOf('    const STORAGE_KEY'),
        source.indexOf('    const state = normalizeState')
    ),
    source.slice(
        source.indexOf('    const AD_NOTICE_BACKUP_KEY'),
        source.indexOf('    const hiddenTopUrls')
    )
].join('\n');

function extractFunction(name) {
    const signature = `function ${name}(`;
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `Function ${name} was not found`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = bodyStart; index < source.length; index += 1) {
        const character = source[index];
        const next = source[index + 1];
        if (lineComment) {
            if (character === '\n') lineComment = false;
            continue;
        }
        if (blockComment) {
            if (character === '*' && next === '/') {
                blockComment = false;
                index += 1;
            }
            continue;
        }
        if (quote) {
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === quote) {
                quote = '';
            }
            continue;
        }
        if (character === '/' && next === '/') {
            lineComment = true;
            index += 1;
            continue;
        }
        if (character === '/' && next === '*') {
            blockComment = true;
            index += 1;
            continue;
        }
        if (character === '"' || character === "'" || character === '`') {
            quote = character;
            continue;
        }
        if (character === '{') depth += 1;
        if (character === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    assert.fail(`Function ${name} is incomplete`);
}

function extractSelectorArray(name) {
    const start = source.indexOf(`const ${name} = [`);
    assert.notEqual(start, -1, `Selector array ${name} was not found`);
    const arrayStart = source.indexOf('[', start);
    const arrayEnd = source.indexOf("].join(',');", arrayStart);
    assert.notEqual(arrayEnd, -1, `Selector array ${name} is incomplete`);
    return vm.runInNewContext(source.slice(arrayStart, arrayEnd + 1));
}

function createCoreApi() {
    const names = [
        'normalizeState',
        'normalizeProfileMap',
        'normalizeAuthorCache',
        'normalizeAuthorList',
        'isVideoPlayerContext',
        'extractUrlValue',
        'isAnalyticsRequestUrl',
        'isClickTrackingUrl',
        'isBanditTrackingUrl',
        'isRecommendationEndpointUrl',
        'getAnalyticsResponseKind',
        'parseGraphqlOperation',
        'sanitizeRecommendationPayload',
        'sanitizeVideoApolloState',
        'canonicalizeArticleUrl',
        'isGameOrSpecialUrl',
        'buildStyles'
    ];
    const context = {
        location: {
            href: 'https://www.sports.ru/',
            origin: 'https://www.sports.ru'
        },
        URL
    };
    vm.createContext(context);
    vm.runInContext(`${constantsSource}\n${names.map(extractFunction).join('\n')}\nthis.api = {\n${names.join(',\n')}\n};`, context);
    return context.api;
}

test('metadata and persisted state key remain backward compatible', () => {
    assert.match(source, /\/\/ @version\s+1\.3\.33/);
    assert.match(source, /const STORAGE_KEY = 'sports-ru-clean-dark-state-v1';/);
    assert.match(source, /version:\s*2/);
    assert.match(source, /^\/\/ @match\s+https:\/\/video\.sports\.ru\/embed\/\*$/m);
    assert.match(source, /^\/\/ @match\s+https:\/\/video\.sports\.ru\/video\/\*$/m);
    assert.doesNotMatch(source, /^\/\/ @noframes\s*$/m);
    assert.match(source, /^\/\/ @run-at\s+document-start$/m);
});

test('observer root queue keeps only the broadest scan roots', () => {
    class FakeElement {
        constructor(name, ownUi = false) {
            this.name = name;
            this.ownUi = ownUi;
            this.parentElement = null;
        }

        append(child) {
            child.parentElement = this;
            return child;
        }

        contains(node) {
            for (let current = node; current; current = current.parentElement) {
                if (current === this) return true;
            }
            return false;
        }

        matches(selector) {
            return selector === '[data-sru-clean-dark-ui]' && this.ownUi;
        }

        closest(selector) {
            for (let current = this; current; current = current.parentElement) {
                if (current.matches(selector)) return current;
            }
            return null;
        }
    }

    class FakeDocument {
        constructor(documentElement) {
            this.documentElement = documentElement;
        }
    }

    const root = new FakeElement('root');
    const branch = root.append(new FakeElement('branch'));
    const leaf = branch.append(new FakeElement('leaf'));
    const sibling = root.append(new FakeElement('sibling'));
    const queuedRoots = new Set();
    const context = {
        Element: FakeElement,
        Document: FakeDocument,
        document: new FakeDocument(root),
        queuedRoots
    };
    vm.createContext(context);
    vm.runInContext(`${extractFunction('enqueueScanRoot')}\nthis.enqueueScanRoot = enqueueScanRoot;`, context);

    assert.equal(context.enqueueScanRoot(leaf), true);
    assert.equal(context.enqueueScanRoot(branch), true);
    assert.deepEqual(Array.from(queuedRoots), [branch]);
    assert.equal(context.enqueueScanRoot(leaf), false);
    assert.equal(context.enqueueScanRoot(sibling), true);
    assert.equal(queuedRoots.size, 2);
    assert.equal(context.enqueueScanRoot(context.document), true);
    assert.deepEqual(Array.from(queuedRoots), [root]);
    assert.equal(context.enqueueScanRoot({}), false);

    queuedRoots.clear();
    const batchTarget = root.append(new FakeElement('batch-target'));
    assert.equal(context.enqueueScanRoot(batchTarget), true);
    for (let index = 0; index < 100; index += 1) {
        assert.equal(context.enqueueScanRoot(batchTarget.append(new FakeElement(`child-${index}`))), false);
    }
    assert.deepEqual(Array.from(queuedRoots), [batchTarget]);
});

test('observer ignores only self-inserted UI and still handles removals', () => {
    class FakeElement {
        constructor(ownUi = false, parentElement = null) {
            this.ownUi = ownUi;
            this.parentElement = parentElement;
        }

        matches(selector) {
            return selector === '[data-sru-clean-dark-ui]' && this.ownUi;
        }

        closest(selector) {
            for (let current = this; current; current = current.parentElement) {
                if (current.matches(selector)) return current;
            }
            return null;
        }
    }

    const context = {
        Element: FakeElement,
        Node: { TEXT_NODE: 3 },
        UI_ATTRIBUTE: 'data-sru-clean-dark-ui'
    };
    vm.createContext(context);
    vm.runInContext(`${extractFunction('mutationAddsOnlyOwnUi')}\nthis.mutationAddsOnlyOwnUi = mutationAddsOnlyOwnUi;`, context);
    const ownUi = new FakeElement(true);
    const ownChild = new FakeElement(false, ownUi);
    const native = new FakeElement(false);
    const whitespace = { nodeType: 3, textContent: '  ' };
    const nativeText = { nodeType: 3, textContent: 'Новый текст' };

    assert.equal(context.mutationAddsOnlyOwnUi({
        type: 'childList',
        addedNodes: [ownUi, ownChild, whitespace],
        removedNodes: []
    }), true);
    assert.equal(context.mutationAddsOnlyOwnUi({
        type: 'childList',
        addedNodes: [native],
        removedNodes: []
    }), false);
    assert.equal(context.mutationAddsOnlyOwnUi({
        type: 'childList',
        addedNodes: [ownUi, native],
        removedNodes: []
    }), false);
    assert.equal(context.mutationAddsOnlyOwnUi({
        type: 'childList',
        addedNodes: [ownUi, nativeText],
        removedNodes: []
    }), false);
    assert.equal(context.mutationAddsOnlyOwnUi({
        type: 'childList',
        addedNodes: [],
        removedNodes: [ownUi]
    }), false);
    assert.equal(context.mutationAddsOnlyOwnUi({
        type: 'attributes',
        addedNodes: [],
        removedNodes: []
    }), false);
});

test('queueScan keeps one timer while a covered root is already queued', () => {
    class FakeElement {
        constructor(parentElement = null) {
            this.parentElement = parentElement;
        }

        contains(node) {
            for (let current = node; current; current = current.parentElement) {
                if (current === this) return true;
            }
            return false;
        }
    }

    class FakeDocument {
        constructor(documentElement) {
            this.documentElement = documentElement;
        }
    }

    const root = new FakeElement();
    const child = new FakeElement(root);
    const timers = [];
    const context = {
        Element: FakeElement,
        Document: FakeDocument,
        document: new FakeDocument(root),
        queuedRoots: new Set(),
        scanScheduled: false,
        runQueuedScan() {},
        window: {
            setTimeout(callback, delay) {
                timers.push({ callback, delay });
            }
        }
    };
    vm.createContext(context);
    vm.runInContext(`
        ${extractFunction('enqueueScanRoot')}
        ${extractFunction('queueScan')}
        ${extractFunction('scheduleScan')}
        this.queueScan = queueScan;
    `, context);

    context.queueScan(root);
    context.queueScan(child);
    assert.equal(context.queuedRoots.size, 1);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 16);
});

test('P0 cleanup removes only fields and wrappers without readers', () => {
    assert.doesNotMatch(source, /sruCleanDarkAuthorId/);
    assert.doesNotMatch(source, /notice\.dataset\.sruAuthorId\s*=/);
    assert.doesNotMatch(source, /function authorFromLink\s*\(/);
    assert.doesNotMatch(source, /const job = \{ href, cacheKey,/);
    assert.doesNotMatch(source, /function setTheme\([^)]*,/);
    assert.doesNotMatch(source, /function profileIdentityFromLink\([^)]*,/);
    assert.doesNotMatch(source, /function renderSettingsDialog\([^)]*=/);
    for (const token of [
        'BLOCKED_COMMENT_ATTRIBUTE',
        'scanBlockedComments',
        'data-sru-profile-action="comments"',
        'unblock-comment-user',
        'unblock-all-comment-users',
        'data-sru-settings-comment-user-'
    ]) {
        assert.equal(source.includes(token), false, `${token} is still present`);
    }
    assert.match(source, /queuedRoots\.size > 50/);
});

test('state normalization keeps all user filters independent', () => {
    const { normalizeState } = createCoreApi();
    const normalized = normalizeState({
        theme: 'light',
        adBlockingEnabled: false,
        hidePromosEnabled: false,
        analyticsBlockingEnabled: false,
        hiddenTopUrls: ['a', 1, 'b'],
        blockedTopAuthors: { 1: { name: ' Top ' } },
        blockedSiteAuthors: { 2: { name: ' Site ' } },
        blockedCommentUsers: { 3: { name: ' Comments ' } },
        authorCache: {}
    });

    assert.equal(normalized.theme, 'light');
    assert.equal(normalized.adBlockingEnabled, false);
    assert.equal(normalized.hidePromosEnabled, false);
    assert.equal(normalized.analyticsBlockingEnabled, false);
    assert.deepEqual(Array.from(normalized.hiddenTopUrls), ['a', 'b']);
    assert.deepEqual(Object.keys(normalized.blockedTopAuthors), ['1']);
    assert.deepEqual(Object.keys(normalized.blockedSiteAuthors), ['2']);
    assert.equal('blockedCommentUsers' in normalized, false);
    assert.equal(normalized.authorCache && typeof normalized.authorCache, 'object');
});

test('state defaults and collection limits remain stable', () => {
    const { normalizeState, normalizeProfileMap, normalizeAuthorCache } = createCoreApi();
    const defaults = normalizeState(null);
    assert.equal(defaults.theme, 'dark');
    assert.equal(defaults.adBlockingEnabled, true);
    assert.equal(defaults.hidePromosEnabled, true);
    assert.equal(defaults.analyticsBlockingEnabled, true);
    assert.equal('blockedCommentUsers' in defaults, false);
    assert.deepEqual(Array.from(defaults.hiddenTopUrls), []);

    const hiddenTopUrls = Array.from({ length: 600 }, (_, index) => `sports.ru/article-${index}.html`);
    const limitedState = normalizeState({ hiddenTopUrls });
    assert.equal(limitedState.hiddenTopUrls.length, 500);
    assert.equal(limitedState.hiddenTopUrls[0], 'sports.ru/article-100.html');

    const profiles = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [
        String(index + 1),
        { name: `  User   ${index + 1}  ` }
    ]));
    profiles.invalid = { name: 'Ignored' };
    const normalizedProfiles = normalizeProfileMap(profiles);
    assert.equal(Object.keys(normalizedProfiles).length, 500);
    assert.ok(Object.values(normalizedProfiles).every((profile) => (
        profile.name === profile.name.trim()
        && profile.profileUrl.startsWith('https://www.sports.ru/profile/')
    )));

    const now = Date.now();
    const cache = Object.fromEntries(Array.from({ length: 201 }, (_, index) => [
        `www.sports.ru/article-${index}.html`,
        { authors: [], complete: true, authorsVersion: 3, expiresAt: now + 1000 }
    ]));
    cache['evil.example/article.html'] = {
        authors: [], complete: true, authorsVersion: 3, expiresAt: now + 1000
    };
    cache['www.sports.ru'] = {
        authors: [], complete: true, authorsVersion: 3, expiresAt: now + 1000
    };
    const normalizedCache = normalizeAuthorCache(cache);
    assert.equal(Object.keys(normalizedCache).length, 200);
    assert.ok(Object.values(normalizedCache).every((entry) => (
        Array.isArray(entry.authors) && entry.authors.length === 0
    )));
    assert.equal(normalizedCache['evil.example/article.html'], undefined);
    assert.equal(normalizedCache['www.sports.ru'], undefined);
});

test('author cache invalidates incomplete entries and preserves verified coauthors', () => {
    const { normalizeAuthorCache } = createCoreApi();
    const expiresAt = Date.now() + 60_000;
    const normalized = normalizeAuthorCache({
        'www.sports.ru/football/blogs/legacy.html': {
            author: { id: 41, name: '  Вадим   Лукомский  ' },
            expiresAt
        },
        'www.sports.ru/football/blogs/incomplete-array.html': {
            authors: [{ id: 41, name: 'Вадим Лукомский' }],
            expiresAt
        },
        'www.sports.ru/football/blogs/stale-scope.html': {
            authors: [
                { id: 41, name: 'Вадим Лукомский' },
                { id: 99, name: 'Комментатор' }
            ],
            complete: true,
            expiresAt
        },
        'www.sports.ru/football/blogs/stale-authors-version.html': {
            authors: [],
            complete: true,
            authorsVersion: 2,
            expiresAt
        },
        'www.sports.ru/football/blogs/single.html': {
            authors: [{ id: 41, name: '  Вадим   Лукомский  ' }],
            complete: true,
            authorsVersion: 3,
            expiresAt
        },
        'www.sports.ru/football/blogs/coauthored.html': {
            authors: [
                { id: 41, name: 'Вадим Лукомский' },
                { id: 42, name: 'Вячеслав Палагин' },
                { id: 42, name: 'Дубликат' },
                { id: 'bad', name: 'Ошибка' }
            ],
            complete: true,
            authorsVersion: 3,
            expiresAt
        }
    });

    assert.equal(normalized['www.sports.ru/football/blogs/legacy.html'], undefined);
    assert.equal(normalized['www.sports.ru/football/blogs/incomplete-array.html'], undefined);
    assert.equal(normalized['www.sports.ru/football/blogs/stale-scope.html'], undefined);
    assert.equal(normalized['www.sports.ru/football/blogs/stale-authors-version.html'], undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(
        normalized['www.sports.ru/football/blogs/single.html'].authors
    )), [{
        id: '41',
        name: 'Вадим Лукомский',
        profileUrl: 'https://www.sports.ru/profile/41/'
    }]);
    assert.deepEqual(JSON.parse(JSON.stringify(
        normalized['www.sports.ru/football/blogs/coauthored.html'].authors
    )), [
        {
            id: '41',
            name: 'Вадим Лукомский',
            profileUrl: 'https://www.sports.ru/profile/41/'
        },
        {
            id: '42',
            name: 'Вячеслав Палагин',
            profileUrl: 'https://www.sports.ru/profile/42/'
        }
    ]);
});

test('ad wrapper selectors stay a strict subset of all ad selectors', () => {
    const all = new Set(extractSelectorArray('AD_NODE_SELECTOR'));
    const wrappers = extractSelectorArray('KNOWN_AD_WRAPPER_SELECTOR');

    assert.equal(all.size, 67);
    assert.equal(new Set(wrappers).size, 33);
    assert.ok(wrappers.every((selector) => all.has(selector)));
});

test('known game and special URLs are classified without UTM dependence', () => {
    const { isGameOrSpecialUrl } = createCoreApi();
    const promos = [
        '/games/categories/world-cup/?utm_source=native',
        'https://specials.sports.ru/world-cube/start?utm_source=supertop',
        '/specials/squad-clubs/?utm_source=news',
        '/specials/dinamo-stars/?utm_source=native',
        'https://sirena.world/materialf',
        'https://redirect.appmetrica.yandex.com/serve/966662197017104881?campaign_id=wccontest',
        '/fantasy/'
    ];
    const articles = [
        'https://www.sports.ru/football/news/example.html',
        'https://example.com/games/world-cup/',
        'https://sports.ru.evil.example/specials/demo/',
        'https://sirena.world.evil.example/materialf',
        'https://redirect.appmetrica.yandex.com/serve/app?campaign_id=footer-app',
        '/news/games/example.html'
    ];

    assert.ok(promos.every((url) => isGameOrSpecialUrl(url)));
    assert.ok(articles.every((url) => !isGameOrSpecialUrl(url)));
});

test('video and iframe guards run before the main Sports.ru bootstrap', () => {
    const stateAt = source.indexOf('    const state = normalizeState');
    const analyticsAt = source.indexOf('    if (analyticsBlockingActive)');
    const videoAt = source.indexOf('    if (isVideoPlayerContext())');
    const iframeAt = source.indexOf('    if (window.self !== window.top)');
    const mainConstantsAt = source.indexOf('    const AD_NOTICE_BACKUP_KEY');
    const mainBootstrapAt = source.indexOf('    applyTheme();');

    assert.ok(stateAt < analyticsAt);
    assert.ok(analyticsAt < videoAt);
    assert.ok(videoAt < iframeAt);
    assert.ok(iframeAt < mainConstantsAt);
    assert.ok(mainConstantsAt < mainBootstrapAt);
});

test('video context and analytics URL classifiers are exact', () => {
    const {
        isVideoPlayerContext,
        isAnalyticsRequestUrl,
        isClickTrackingUrl,
        isBanditTrackingUrl,
        isRecommendationEndpointUrl
    } = createCoreApi();
    assert.equal(isVideoPlayerContext('https://video.sports.ru/embed/id'), true);
    assert.equal(isVideoPlayerContext('https://video.sports.ru/video/id'), true);
    assert.equal(isVideoPlayerContext('https://www.sports.ru/video/id'), false);
    assert.equal(isVideoPlayerContext('https://video.sports.ru.evil.test/embed/id'), false);

    for (const url of [
        'https://www.googletagmanager.com/gtm.js?id=GTM-1',
        'https://www.googletagmanager.com/gtag/js?id=G-1',
        'https://www.google-analytics.com/g/collect?v=2',
        'https://mc.yandex.ru/metrika/tag.js',
        'https://mc.yandex.ru/watch/103180910',
        'https://t.sports.ru/manager/MT88Z7Z2.js',
        'https://rum.sports.ru/intake/v2/rum/events',
        'https://sentry.sports.ru/api/498/envelope/',
        'https://r.sports.ru/segments/ru/',
        'https://recs.s5o.ru/match/merge/',
        'https://recs.s5o.ru/send/',
        'https://recs.yc-stage-s5o.ru/match/',
        'https://log.strm.yandex.ru/log',
        'https://amc.yandex.ru/show/12345',
        'https://www.facebook.com/tr?id=1'
    ]) {
        assert.equal(isAnalyticsRequestUrl(url), true, url);
    }
    for (const url of [
        'https://video.sports.ru/site/graphql',
        'https://vod.video.sports.ru/video/master.m3u8',
        'https://www.gstatic.com/recaptcha/api2/webworker.js',
        'https://r.sports.ru/recommender/',
        'https://r.sports.ru/bandit/',
        'https://recs.s5o.ru/get/by_config/',
        'https://recs.s5o.ru/matchmaking/',
        'https://recs.s5o.ru/sender/',
        'https://rum.sports.ru/not-rum',
        'https://sentry.sports.ru/api/project/envelope/',
        'https://sentry.sports.ru.evil.test/api/498/envelope/',
        'https://yandex.ru/clck/click',
        'https://www.googletagmanager.com/not-analytics.js',
        'https://amc.yandex.ru/not-show',
        'https://mc.yandex.ru.evil.test/metrika/tag.js'
    ]) {
        assert.equal(isAnalyticsRequestUrl(url), false, url);
    }
    assert.equal(isClickTrackingUrl('https://yandex.ru/clck/click'), true);
    assert.equal(isClickTrackingUrl('https://yandex.ru/search/'), false);
    assert.equal(isBanditTrackingUrl('https://r.sports.ru/bandit/'), true);
    assert.equal(isBanditTrackingUrl('https://r.sports.ru/bandit/history'), false);
    assert.equal(isRecommendationEndpointUrl('https://r.sports.ru/recommender/'), true);
    assert.equal(isRecommendationEndpointUrl('https://r.sports.ru/bandit/'), true);
    assert.equal(isRecommendationEndpointUrl('https://r.sports.ru/recommender/history'), false);
});

test('recommendation telemetry is stripped without disabling functional results', () => {
    const { sanitizeRecommendationPayload, getAnalyticsResponseKind } = createCoreApi();
    const hybrid = sanitizeRecommendationPayload(JSON.stringify({
        send_data: { interactions: [{ type: 'view' }] },
        return_data: { limit: 10 },
        context: { page: 'home' }
    }));
    assert.equal(hybrid.blocked, false);
    assert.deepEqual(JSON.parse(hybrid.body), {
        return_data: { limit: 10 },
        context: { page: 'home' }
    });
    assert.equal(
        sanitizeRecommendationPayload(JSON.stringify({ send_data: { interactions: [] } })).blocked,
        true
    );
    assert.equal(sanitizeRecommendationPayload(JSON.stringify({ return_data: { limit: 5 } })), null);
    assert.equal(sanitizeRecommendationPayload('not json'), null);
    assert.equal(sanitizeRecommendationPayload(new URLSearchParams('return_data=1')), null);
    assert.equal(getAnalyticsResponseKind('https://r.sports.ru/segments/ru/'), 'json');
    assert.equal(getAnalyticsResponseKind('https://www.google-analytics.com/g/collect'), 'empty');
});

test('video GraphQL helpers isolate telemetry and disable only ad state', () => {
    const { parseGraphqlOperation, sanitizeVideoApolloState } = createCoreApi();
    assert.equal(parseGraphqlOperation(JSON.stringify({
        operationName: 'SponsorVideo',
        query: 'query SponsorVideo($contentId: ID) { sponsorCampaign(contentId: $contentId) }'
    })), 'SponsorVideo');
    assert.equal(parseGraphqlOperation(JSON.stringify({ operationName: 'SponsorVideo' })), null);
    assert.equal(parseGraphqlOperation(JSON.stringify([{ operationName: 'SponsorVideo' }])), null);
    assert.equal(parseGraphqlOperation('not json'), null);

    const stateTree = {
        content: { __typename: 'Content', isAdvEnabled: true, preRollCount: 2, title: 'Video' },
        rights: { nested: { __typename: 'Rightholder', isAdvEnabled: true } },
        passiveContent: { __typename: 'Content', title: 'Related video' },
        functional: { __typename: 'Viewer', enabled: true }
    };
    sanitizeVideoApolloState(stateTree);
    assert.equal(stateTree.content.isAdvEnabled, false);
    assert.equal(stateTree.content.preRollCount, 0);
    assert.equal(stateTree.rights.nested.isAdvEnabled, false);
    assert.equal('isAdvEnabled' in stateTree.passiveContent, false);
    assert.equal('preRollCount' in stateTree.passiveContent, false);
    assert.equal(stateTree.functional.enabled, true);
});

test('article URL canonicalization ignores mobile host, query and hash', () => {
    const { canonicalizeArticleUrl } = createCoreApi();
    assert.equal(
        canonicalizeArticleUrl('https://m.sports.ru/football/news/test.html?utm_source=x#comments'),
        'sports.ru/football/news/test.html'
    );
});

test('generated CSS is byte-for-byte identical to the audited baseline', () => {
    const { buildStyles } = createCoreApi();
    const css = buildStyles();
    const hash = crypto.createHash('sha256').update(css).digest('hex');

    assert.equal(css.length, 135269);
    assert.equal(hash, 'f87602beda746376b89b210f46562d4bb4bd033f775d1465095994fd1afa255b');
});
