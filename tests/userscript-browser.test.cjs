const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const workspacePath = path.join(__dirname, '..');
const userscriptPath = path.join(workspacePath, 'sports-ru-clean-dark.user.js');
const fixturePath = path.join(__dirname, 'browser-fixture.html');
const instrumentedFunctions = [
    'runQueuedScan',
    'scanAds',
    'scanPromos',
    'scanSiteAuthorBlocks',
    'installAnalyticsDefusers',
    'installVideoAdBypass',
    'ensureThemeToggle',
    'renderSettingsDialog'
];

function loadPlaywright() {
    const bundledModules = path.join(
        os.homedir(),
        '.cache',
        'codex-runtimes',
        'codex-primary-runtime',
        'dependencies',
        'node',
        'node_modules'
    );
    const searchPaths = [
        process.env.NODE_PATH,
        bundledModules,
        path.join(bundledModules, '.pnpm', 'node_modules')
    ].filter(Boolean);
    process.env.NODE_PATH = searchPaths.join(path.delimiter);
    Module._initPaths();
    return require('playwright');
}

function findChromiumExecutable(chromium) {
    const candidates = [
        chromium.executablePath(),
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ];
    return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function instrumentUserscript(source) {
    let result = source;
    for (const name of instrumentedFunctions) {
        const signature = new RegExp(`(    function ${name}\\([^\\n]*\\) \\{)`);
        let replacements = 0;
        result = result.replace(signature, (match) => {
            replacements += 1;
            return `${match}
        window.__sruMetrics.calls.${name} = (window.__sruMetrics.calls.${name} || 0) + 1;
        window.__syncSruMetrics();`;
        });
        assert.equal(replacements, 1, `Unable to instrument ${name}`);
    }
    return result;
}

function buildVideoFixtureHtml() {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Video fixture</title>
<script>
const fixtureParams = new URLSearchParams(location.search);
window.__sruStore = new Map([['sports-ru-clean-dark-state-v1', {
    version: 2,
    theme: 'dark',
    adBlockingEnabled: fixtureParams.get('ads') !== 'off',
    hidePromosEnabled: true,
    analyticsBlockingEnabled: fixtureParams.get('analytics') !== 'off'
}]]);
var GM_getValue = (key, fallback) => window.__sruStore.has(key)
    ? structuredClone(window.__sruStore.get(key))
    : fallback;
var GM_setValue = (key, value) => window.__sruStore.set(key, structuredClone(value));
var GM_addValueChangeListener = () => 1;
var GM_xmlhttpRequest = () => {};
var GM_addStyle = (css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    return style;
};
var unsafeWindow = window;
window.__nativeFetchCalls = [];
window.fetch = async (input, init) => {
    const signal = init?.signal || input?.signal;
    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const operationName = body.operationName || '';
    window.__nativeFetchCalls.push(operationName);
    const data = operationName === 'SponsorVideo'
        ? { sponsorCampaign: { id: 'fixture-ad' } }
        : { content: { ok: true, operationName } };
    const errors = operationName === 'SponsorVideo' ? [{ message: 'partial fixture error' }] : undefined;
    return new Response(JSON.stringify({ data, errors }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-viewerid': 'fixture-viewer' }
    });
};
</script>
<script src="/sports-ru-clean-dark.user.js"></script>
<script>
window.__APOLLO_STATE__ = {
    content: { __typename: 'Content', isAdvEnabled: true, preRollCount: 2 },
    rights: { __typename: 'Rightholder', isAdvEnabled: true },
    viewer: { __typename: 'Viewer', enabled: true }
};
const request = (operationName) => fetch('/site/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-viewerId': 'fixture-viewer' },
    body: JSON.stringify({
        operationName,
        query: operationName === 'SponsorVideo'
            ? 'query SponsorVideo($contentId: ID) { sponsorCampaign(contentId: $contentId) }'
            : (operationName === 'CreateEvent'
                ? 'mutation CreateEvent($token: String!) { createEvent(token: $token) }'
                : 'query ContentQuery { content { id } }')
    })
});
window.__videoResults = Promise.all([
    request('SponsorVideo'),
    request('CreateEvent'),
    request('ContentQuery')
]).then(async ([sponsor, analytics, content]) => ({
    sponsor: await sponsor.json(),
    sponsorViewer: sponsor.headers.get('x-viewerid'),
    analytics: await analytics.json(),
    analyticsViewer: analytics.headers.get('x-viewerid'),
    content: await content.json()
}));
</script></head><body><main id="video-player">Player</main></body></html>`;
}

function readCalls(rootAttributes) {
    return JSON.parse(rootAttributes.calls || '{}');
}

function getRootAttributes(page) {
    return page.evaluate(() => {
        const root = document.documentElement;
        return {
            calls: root.getAttribute('data-sru-fixture-calls'),
            errors: root.getAttribute('data-sru-fixture-errors'),
            styleBytes: Number(root.getAttribute('data-sru-fixture-styleBytes')),
            initialArticleDisplay: root.getAttribute('data-sru-fixture-initial-article-display'),
            initialPromoDisplay: root.getAttribute('data-sru-fixture-initial-promo-display'),
            initialAdDisplay: root.getAttribute('data-sru-fixture-initial-ad-display'),
            initialAdLabelDisplay: root.getAttribute('data-sru-fixture-initial-ad-label-display'),
            initialCompetitionDisplay: root.getAttribute('data-sru-fixture-initial-competition-display'),
            initialSirenaPromoDisplay: root.getAttribute('data-sru-fixture-initial-sirena-promo-display'),
            initialSponsoredPromoDisplay: root.getAttribute('data-sru-fixture-initial-sponsored-promo-display'),
            initialFooterAppDisplay: root.getAttribute('data-sru-fixture-initial-footer-app-display')
        };
    });
}

function getSettingsSwitchStyles(page, action) {
    return page.evaluate((settingsAction) => {
        const control = document.querySelector(`[data-sru-settings-action="${settingsAction}"]`);
        const track = control?.querySelector('.sru-clean-dark-settings-switch__track');
        const thumb = control?.querySelector('.sru-clean-dark-settings-switch__thumb');
        return {
            checked: control?.getAttribute('aria-checked'),
            trackBackground: track ? getComputedStyle(track).backgroundColor : null,
            trackShadow: track ? getComputedStyle(track).boxShadow : null,
            thumbBackground: thumb ? getComputedStyle(thumb).backgroundColor : null,
            thumbShadow: thumb ? getComputedStyle(thumb).boxShadow : null
        };
    }, action);
}

function getStatisticsStyles(page) {
    return page.evaluate(() => {
        const root = document.querySelector('.fixture-statistics .gadget__tournament-data');
        const handles = Array.from(root.querySelectorAll('.accordion__handle_dark'));
        return {
            handles: handles.map((handle) => {
                const icon = handle.querySelector('.accordion__icon-status');
                const style = getComputedStyle(handle);
                return {
                    background: style.backgroundColor,
                    border: style.borderTopColor,
                    title: getComputedStyle(handle.querySelector('.accordion__title')).color,
                    titleLink: getComputedStyle(handle.querySelector('.accordion__title > a')).color,
                    icon: getComputedStyle(icon).backgroundColor,
                    iconBefore: getComputedStyle(icon, '::before').backgroundColor,
                    iconAfter: getComputedStyle(icon, '::after').backgroundColor
                };
            }),
            whiteBackgrounds: Array.from(root.querySelectorAll('*'))
                .filter((element) => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)')
                .map((element) => element.className)
        };
    });
}

function getLegacyThemeStyles(page) {
    return page.evaluate(() => {
        const profileTable = document.querySelector('.fixture-entity .profile-table');
        const genericTable = document.querySelector('.fixture-entity .fixture-generic-table');
        const blogLabel = document.querySelector('.fixture-feed .blog-posts-list__top');
        const blogLink = blogLabel.querySelector('a');
        const showMore = document.querySelector('.fixture-feed .btn-show-more');
        const blogsShowMore = document.querySelector('.fixture-feed .user-feed__show-more');
        const personalShowMore = document.querySelector('.fixture-personal-feed .gray-more');
        const competition = document.querySelector('.fixture-competition');
        const footerApp = document.querySelector('.fixture-footer-app-link');
        return {
            profileTableBackground: getComputedStyle(profileTable).backgroundColor,
            profileTableBorder: getComputedStyle(profileTable).borderTopWidth,
            genericTableBackground: getComputedStyle(genericTable).backgroundColor,
            blogLabel: getComputedStyle(blogLabel).color,
            blogLink: getComputedStyle(blogLink).color,
            showMoreBackground: getComputedStyle(showMore).backgroundColor,
            showMoreColor: getComputedStyle(showMore).color,
            showMoreBorder: getComputedStyle(showMore).borderTopColor,
            blogsShowMoreBackground: getComputedStyle(blogsShowMore).backgroundColor,
            blogsShowMoreColor: getComputedStyle(blogsShowMore).color,
            blogsShowMoreBorder: getComputedStyle(blogsShowMore).borderTopColor,
            personalShowMoreBackground: getComputedStyle(personalShowMore).backgroundColor,
            personalShowMoreColor: getComputedStyle(personalShowMore).color,
            socialText: getComputedStyle(document.querySelector('.fixture-feed .social-links > span')).color,
            competitionDisplay: getComputedStyle(competition).display,
            competitionMarker: competition.getAttribute('data-sru-clean-dark-promo'),
            footerAppDisplay: getComputedStyle(footerApp).display
        };
    });
}

function getEntityTabsStyles(page) {
    return page.evaluate(() => {
        const root = document.querySelector('.fixture-entity-tabs');
        const activeFilter = root.querySelector('.sm-act');
        const inactiveFilter = root.querySelector('.sm:not(.sm-act)');
        const arrow = root.querySelector('.arr-down-blk');
        const menu = root.querySelector('.c-dropdown__dropdown-menu');
        const menuItem = menu.querySelector('li');
        const menuLink = menu.querySelector('a');
        return {
            root: getComputedStyle(root).backgroundColor,
            activeFilter: getComputedStyle(activeFilter).backgroundColor,
            activeFilterText: getComputedStyle(activeFilter).color,
            activeFilterShadow: getComputedStyle(activeFilter).boxShadow,
            inactiveFilter: getComputedStyle(inactiveFilter).backgroundColor,
            inactiveFilterText: getComputedStyle(inactiveFilter).color,
            arrowFilter: getComputedStyle(arrow).filter,
            arrowOpacity: getComputedStyle(arrow).opacity,
            menu: getComputedStyle(menu).backgroundColor,
            menuText: getComputedStyle(menu).color,
            menuBorder: getComputedStyle(menu).borderTopColor,
            menuItem: getComputedStyle(menuItem).backgroundColor,
            menuItemBorder: getComputedStyle(menuItem).borderBottomColor,
            menuLink: getComputedStyle(menuLink).backgroundColor,
            menuLinkText: getComputedStyle(menuLink).color
        };
    });
}

function getMatchChatStyles(page) {
    return page.evaluate(() => {
        const message = document.querySelector('.fixture-match-chat .message--your-message');
        const text = message.querySelector('.message-base__text');
        return {
            background: getComputedStyle(message).backgroundColor,
            text: getComputedStyle(text).color
        };
    });
}

function getMatchPopupStyles(page) {
    return page.evaluate(() => {
        const popup = document.querySelector('.fixture-match-popup');
        const score = popup.querySelector('.popup-match__board-score');
        const eventItem = popup.querySelector('.popup-match__events-item');
        const events = popup.querySelectorAll('.popup-match__event');
        return {
            display: getComputedStyle(popup).display,
            background: getComputedStyle(popup).backgroundColor,
            border: getComputedStyle(popup).borderTopColor,
            scoreBackground: getComputedStyle(score).backgroundColor,
            scoreColor: getComputedStyle(score).color,
            team: getComputedStyle(popup.querySelector('.popup-match__board-player-name')).color,
            event: getComputedStyle(events[1]).color,
            time: getComputedStyle(popup.querySelector('.popup-match__event-time')).color,
            scorer: getComputedStyle(popup.querySelector('.popup-match__event a')).color,
            rowBorder: getComputedStyle(eventItem).borderTopColor,
            columnBorder: getComputedStyle(events[0]).borderRightColor
        };
    });
}

function getLegacyBlogStyles(page) {
    return page.evaluate(() => {
        const root = document.querySelector('.fixture-legacy-blog');
        const menu = root.querySelector('.blog-menu');
        const active = root.querySelector('.blog-menu__item_state_active');
        const inactive = root.querySelector('.blog-menu__item:not(.blog-menu__item_state_active)');
        const item = root.querySelector('.blog-feed__item');
        return {
            menuBackground: getComputedStyle(menu).backgroundColor,
            menuBorder: getComputedStyle(menu).borderTopColor,
            activeBackground: getComputedStyle(active).backgroundColor,
            activeColor: getComputedStyle(active).color,
            inactiveBackground: getComputedStyle(inactive).backgroundColor,
            inactiveColor: getComputedStyle(inactive).color,
            link: getComputedStyle(root.querySelector('.blog-menu__link')).color,
            title: getComputedStyle(root.querySelector('.blog-feed__item-title > .content-link')).color,
            brief: getComputedStyle(root.querySelector('.blog-feed__item-brief')).color,
            figcaption: getComputedStyle(root.querySelector('.blog-feed__item-figcaption')).color,
            itemBorder: getComputedStyle(item).borderBottomColor,
            dropdownBackground: getComputedStyle(root.querySelector('.blog-menu__create-dropdown')).backgroundColor,
            dropdownText: getComputedStyle(root.querySelector('.blog-menu__create-dropdown-text')).color,
            recentBackground: getComputedStyle(root.querySelector('.recent-entries')).backgroundColor,
            recentLink: getComputedStyle(root.querySelector('.recent-entries .link')).color,
            paginationBackground: getComputedStyle(root.querySelector('.pagination__item_state_active')).backgroundColor,
            paginationColor: getComputedStyle(root.querySelector('.pagination__link')).color,
            statisticCell: getComputedStyle(root.querySelector('.blog-statistic__table__cell')).color,
            statisticBorder: getComputedStyle(root.querySelector('.blog-statistic__table__cell')).borderBottomColor,
            statisticMuted: getComputedStyle(root.querySelector('.blog-statistic__table__cell--grey')).color,
            statisticIcon: getComputedStyle(root.querySelector('.blog-statistic__table__icon')).color,
            statisticLink: getComputedStyle(root.querySelector('.blog-statistic__post__link')).color,
            newBlogTitle: getComputedStyle(root.querySelector('.new-blog__line-title')).color,
            newBlogDescription: getComputedStyle(root.querySelector('.new-blog__line-description')).color,
            newBlogTextarea: getComputedStyle(root.querySelector('.new-blog__textarea')).backgroundColor,
            uploadBackground: getComputedStyle(root.querySelector('.image-upload__input__trigger')).backgroundColor,
            uploadColor: getComputedStyle(root.querySelector('.image-upload__input__trigger')).color
        };
    });
}

function getTournamentFadeStyles(page) {
    return page.evaluate(() => ({
        left: getComputedStyle(document.querySelector(
            '.fixture-tournament-tabs .ui-tabbar__side-icon-left--grey'
        )).backgroundImage,
        right: getComputedStyle(document.querySelector(
            '.fixture-tournament-tabs .ui-tabbar__side-icon-right--grey'
        )).backgroundImage
    }));
}

function getAuditedLegacyStyles(page) {
    return page.evaluate(() => {
        const tag = document.querySelector('.fixture-tag-audit');
        const legacy = document.querySelector('.fixture-legacy-audit');
        const inactiveTab = legacy.querySelector('.tab:not(.active)');
        const activeTab = legacy.querySelector('.tab.active');
        const sorts = legacy.querySelectorAll('.sort');
        const score = tag.querySelector('.score-cell--losing');
        const matchScore = legacy.querySelector('.teaser-event__board-score');
        return {
            breadcrumbLink: getComputedStyle(tag.querySelector('.bread-item__link')).color,
            breadcrumbText: getComputedStyle(tag.querySelector('.bread-item__text')).color,
            newsBorder: getComputedStyle(tag.querySelector('.news-group__item')).borderTopColor,
            newsListBorder: getComputedStyle(legacy.querySelector('.nl-item')).borderTopColor,
            inactiveTabBackground: getComputedStyle(inactiveTab).backgroundColor,
            inactiveTabColor: getComputedStyle(inactiveTab).color,
            activeTabBackground: getComputedStyle(activeTab).backgroundColor,
            activeTabColor: getComputedStyle(activeTab).color,
            sort: getComputedStyle(sorts[0]).color,
            activeSort: getComputedStyle(sorts[1]).color,
            losingScoreBackground: getComputedStyle(score).backgroundColor,
            losingScoreColor: getComputedStyle(score).color,
            penaltyMark: getComputedStyle(matchScore.querySelector('span')).color
        };
    });
}

function getCabinetStyles(page) {
    return page.evaluate(() => {
        const cabinet = document.querySelector('.fixture-cabinet');
        const form = cabinet.querySelector('#edit_profile');
        const inactiveTab = cabinet.querySelector('.tabs > .tab:not(.active)');
        const activeTab = cabinet.querySelector('.tabs > .tab.active');
        const fields = form.querySelectorAll('.input-box');
        const formBlock = form.querySelector('.form-block');
        const textarea = form.querySelector('.textarea-box');
        const upload = form.querySelector('.file-input .but');
        const emailSave = form.querySelector('.change-email__save');
        const submit = form.querySelector('.pink-but');
        const select = form.querySelector('select');
        const settingsField = cabinet.querySelector('#edit_cabinet_settings .input-box');
        return {
            page: document.documentElement.getAttribute('data-sru-clean-dark-page'),
            inactiveTab: getComputedStyle(inactiveTab).backgroundColor,
            activeTab: getComputedStyle(activeTab).backgroundColor,
            disabledField: getComputedStyle(fields[0]).backgroundColor,
            normalField: getComputedStyle(fields[1]).backgroundColor,
            fieldInnerBorder: getComputedStyle(fields[1].firstElementChild).borderTopColor,
            textarea: getComputedStyle(textarea).backgroundColor,
            select: getComputedStyle(select).backgroundColor,
            divider: getComputedStyle(formBlock).borderBottomColor,
            upload: getComputedStyle(upload).backgroundColor,
            uploadText: getComputedStyle(upload).color,
            emailSave: getComputedStyle(emailSave).backgroundColor,
            emailSaveText: getComputedStyle(emailSave).color,
            submit: getComputedStyle(submit).backgroundColor,
            submitText: getComputedStyle(submit).color,
            settingsField: getComputedStyle(settingsField).backgroundColor,
            settingsFieldInnerBorder: getComputedStyle(settingsField.firstElementChild).borderTopColor
        };
    });
}

function getNotificationStyles(page) {
    return page.evaluate(() => {
        const root = document.querySelector('.fixture-notifications');
        const inner = root.querySelector('.personal-notifications__inner');
        const activeTab = root.querySelector('.personal-notifications__header-tab--active');
        const inactiveTab = root.querySelector('.personal-notifications__header-tab:not(.personal-notifications__header-tab--active)');
        const listItem = root.querySelector('.personal-notifications__list-item');
        const message = root.querySelector('.personal-notifications__message');
        const markAll = root.querySelector('.personal-notifications__footer-mark-all');
        return {
            arrow: getComputedStyle(root.querySelector('.personal-notifications__dropdown-arrow')).backgroundColor,
            inner: getComputedStyle(inner).backgroundColor,
            innerText: getComputedStyle(inner).color,
            header: getComputedStyle(root.querySelector('.personal-notifications__header')).backgroundColor,
            headerBorder: getComputedStyle(root.querySelector('.personal-notifications__header')).borderBottomColor,
            body: getComputedStyle(root.querySelector('.personal-notifications__body')).backgroundColor,
            bodyBorder: getComputedStyle(root.querySelector('.personal-notifications__body')).borderBottomColor,
            activeTab: getComputedStyle(activeTab).backgroundColor,
            activeTabText: getComputedStyle(activeTab).color,
            inactiveTabText: getComputedStyle(inactiveTab).color,
            count: getComputedStyle(root.querySelector('.personal-notifications__header-count')).color,
            stub: getComputedStyle(root.querySelector('.personal-notifications__stub-message')).color,
            listItem: getComputedStyle(listItem).backgroundColor,
            listItemBorder: getComputedStyle(listItem).borderBottomColor,
            message: getComputedStyle(message).color,
            messageLink: getComputedStyle(message.querySelector('a')).color,
            time: getComputedStyle(root.querySelector('.personal-notifications__time')).color,
            footer: getComputedStyle(root.querySelector('.personal-notifications__footer')).backgroundColor,
            footerBorder: getComputedStyle(root.querySelector('.personal-notifications__footer')).borderBottomColor,
            footerLink: getComputedStyle(root.querySelector('.personal-notifications__link')).color,
            markAll: getComputedStyle(markAll).backgroundColor,
            markAllText: getComputedStyle(markAll).color,
            markAllBorder: getComputedStyle(markAll).borderTopColor,
            whiteBackgrounds: Array.from(inner.querySelectorAll('*')).filter((element) => (
                getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)'
            )).length
        };
    });
}

function getCreateContentDropdownStyles(page) {
    return page.evaluate(() => {
        const menu = document.querySelector('menu.ui-dropdown.create-content-dropdown');
        const list = menu.querySelector('.ui-dropdown__list');
        const item = menu.querySelector('.ui-dropdown__item');
        return {
            menu: getComputedStyle(menu).backgroundColor,
            menuText: getComputedStyle(menu).color,
            menuBorder: getComputedStyle(menu).borderTopColor,
            list: getComputedStyle(list).backgroundColor,
            item: getComputedStyle(item).backgroundColor,
            itemText: getComputedStyle(item).color,
            controlText: getComputedStyle(item.querySelector('.ui-dropdown__item-control')).color,
            icon: getComputedStyle(item.querySelector('svg')).color
        };
    });
}

function getSettingsRecoveryLayout(page) {
    return page.evaluate(() => {
        const dialog = document.querySelector('.sru-clean-dark-settings-dialog');
        const content = dialog.querySelector('.sru-clean-dark-settings-content');
        const sections = Array.from(document.querySelectorAll('.sru-clean-dark-settings-section'))
            .filter((section) => section.querySelector('.sru-clean-dark-settings-list-item'));
        const actionButtons = sections.flatMap((section) => [
            section.querySelector('.sru-clean-dark-settings-section-head > .sru-clean-dark-settings-button'),
            ...section.querySelectorAll('.sru-clean-dark-settings-list-item > .sru-clean-dark-settings-button')
        ]).filter(Boolean);
        const listRows = sections.flatMap((section) => [...section.querySelectorAll('.sru-clean-dark-settings-list-item')]);
        const links = [...document.querySelectorAll('.sru-clean-dark-settings-item-link')];
        const articleLinks = links.filter((link) => link.dataset.sruSettingsLinkKind === 'article');
        const authorLinks = links.filter((link) => link.dataset.sruSettingsLinkKind === 'author');
        const longArticle = articleLinks.find((link) => link.textContent.includes('Как Испании'));
        const rounded = (value) => Math.round(value * 10) / 10;
        return {
            sections: sections.length,
            buttons: actionButtons.length,
            buttonWidths: [...new Set(actionButtons.map((button) => rounded(button.getBoundingClientRect().width)))],
            buttonHeights: [...new Set(actionButtons.map((button) => rounded(button.getBoundingClientRect().height)))],
            buttonFontSizes: [...new Set(actionButtons.map((button) => getComputedStyle(button).fontSize))],
            buttonWhiteSpace: [...new Set(actionButtons.map((button) => getComputedStyle(button).whiteSpace))],
            buttonsSingleLine: actionButtons.every((button) => button.scrollHeight <= button.clientHeight + 1),
            actionColumnsAligned: sections.every((section) => {
                const buttons = [
                    section.querySelector('.sru-clean-dark-settings-section-head > .sru-clean-dark-settings-button'),
                    ...section.querySelectorAll('.sru-clean-dark-settings-list-item > .sru-clean-dark-settings-button')
                ].filter(Boolean);
                const lefts = buttons.map((button) => button.getBoundingClientRect().left);
                return Math.max(...lefts) - Math.min(...lefts) < 0.5;
            }),
            rowsUniform: sections.every((section) => {
                const heights = [...section.querySelectorAll('.sru-clean-dark-settings-list-item')]
                    .map((row) => rounded(row.getBoundingClientRect().height));
                return new Set(heights).size <= 1;
            }),
            rowCount: listRows.length,
            longLabelTruncated: Boolean(longArticle && longArticle.scrollWidth > longArticle.clientWidth),
            longLabelOverflow: longArticle ? getComputedStyle(longArticle).textOverflow : null,
            longLabelWhiteSpace: longArticle ? getComputedStyle(longArticle).whiteSpace : null,
            articleLinks: articleLinks.length,
            authorLinks: authorLinks.length,
            articleHref: articleLinks[0]?.href || null,
            authorHref: authorLinks[0]?.href || null,
            articleTitle: articleLinks[0]?.title || null,
            linksOpenSafely: links.every((link) => (
                link.target === '_blank'
                && link.rel.split(/\s+/).includes('noopener')
                && link.rel.split(/\s+/).includes('noreferrer')
            )),
            articleLabel: articleLinks[0]?.getAttribute('aria-label') || null,
            authorLabel: authorLinks[0]?.getAttribute('aria-label') || null,
            linkColor: links[0] ? getComputedStyle(links[0]).color : null,
            dialogOverflow: getComputedStyle(dialog).overflowY,
            contentOverflow: getComputedStyle(content).overflowY,
            contentScrollable: content.scrollHeight > content.clientHeight
        };
    });
}

function buildLoadingSidebarFixtureHtml(fixtureSource) {
    const bodyIndex = fixtureSource.indexOf('<body>');
    assert.ok(bodyIndex >= 0);
    return `${fixtureSource.slice(0, bodyIndex)}
<body>
    <section class="pageLayout fixture-loading-sidebar">
        <div class="layout-columns" style="display:flex;width:1052px">
            <main class="mainPart" style="width:732px;flex:0 0 732px">Новости</main>
            <aside class="rightPart" style="width:300px;margin-left:20px">
                <div class="media-kit" data-control="Banners.MediaKit"></div>
                <div class="float-block" data-control="Common.Float">
                    <div id="top-ad"><div class="top-ad__wrapper"><ad-slot></ad-slot></div></div>
                    <div class="high-adload-banners-container"></div>
                </div>
            </aside>
        </div>
    </section>
    <section class="pageLayout fixture-useful-sidebar">
        <div class="layout-columns" style="display:flex;width:1052px">
            <main class="mainPart" style="width:732px;flex:0 0 732px">Материалы</main>
            <aside class="rightPart" style="width:300px;margin-left:20px">
                <div data-control="Sidebar.Scoreboard"><a href="#scoreboard">Таблица</a></div>
            </aside>
        </div>
    </section>
    <script>
        requestAnimationFrame(() => {
            const readState = (selector) => document.querySelector(selector)
                ?.getAttribute('data-sru-clean-dark-empty-sidebar') || 'false';
            document.documentElement.setAttribute('data-sru-fixture-sidebar-first-frame', JSON.stringify({
                readyState: document.readyState,
                adOnly: readState('.fixture-loading-sidebar .layout-columns'),
                useful: readState('.fixture-useful-sidebar .layout-columns')
            }));
        });
    </script>
    <script src="/slow-loading-sidebar.js"></script>
</body>
</html>`;
}

let playwright;
let playwrightLoadError;
let chromiumExecutable;
try {
    playwright = loadPlaywright();
    chromiumExecutable = findChromiumExecutable(playwright.chromium);
    if (!chromiumExecutable) {
        throw new Error('Chromium, Chrome or Edge executable was not found');
    }
} catch (error) {
    playwrightLoadError = error;
}

let browser;
let server;
let origin;

test.before(async () => {
    if (!playwright) return;
    const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
    const fixture = Buffer.from(fixtureSource);
    const loadingSidebarFixture = Buffer.from(buildLoadingSidebarFixtureHtml(fixtureSource));
    const userscript = Buffer.from(instrumentUserscript(fs.readFileSync(userscriptPath, 'utf8')));
    server = http.createServer((request, response) => {
        const requestUrl = new URL(request.url, 'http://127.0.0.1');
        const pathname = requestUrl.pathname;
        if (pathname === '/basketball/news/' && requestUrl.searchParams.has('loading-sidebar')) {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(loadingSidebarFixture);
            return;
        }
        if (pathname === '/slow-loading-sidebar.js') {
            setTimeout(() => {
                response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
                response.end('');
            }, 1000);
            return;
        }
        if (
            pathname === '/tests/browser-fixture.html'
            || pathname === '/profile/1090664296/'
            || pathname === '/cabinet/'
            || pathname === '/cabinet/settings.html'
            || pathname === '/tribuna/blogs/pavle21/'
        ) {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(fixture);
            return;
        }
        if (pathname === '/sports-ru-clean-dark.user.js') {
            response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
            response.end(userscript);
            return;
        }
        response.writeHead(404);
        response.end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({
        headless: true,
        executablePath: chromiumExecutable
    });
});

test.after(async () => {
    await browser?.close();
    if (server) {
        await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
});

test('full userscript handles initial and dynamic DOM without self-scan loops', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/tests/browser-fixture.html?automated=1`);
    await page.waitForTimeout(250);

    const initial = await page.evaluate(() => {
        const cards = document.querySelectorAll('.super-top__article');
        const ad = document.querySelector('.ad-slot');
        const adLabel = document.querySelector('.teaser-before-links__adv-label');
        const matchCenterLink = document.querySelector('.teaser-before-links__item');
        const sponsoredPromo = document.querySelector('.fixture-sponsored-promo');
        const sirenaPromo = document.querySelector('.fixture-sirena-promo');
        const inlinePromoText = document.querySelector('.fixture-inline-promo-text');
        const inlinePromoImage = document.querySelector('.fixture-inline-promo-image');
        const inlineArticleLink = document.querySelector('.fixture-inline-article-link');
        const inlineArticleImage = document.querySelector('.fixture-inline-article-image');
        const matchRoot = document.querySelector('.main-teaser-container--common');
        const matchHeader = matchRoot.querySelector('.teaser-group__handle');
        const matchEvent = matchRoot.querySelector('.teaser-event');
        const matchIcon = matchRoot.querySelector('.accordion__icon-status');
        const matchTitle = matchRoot.querySelector('.accordion__title > a');
        const matchStatus = matchRoot.querySelector('.teaser-event__status');
        const matchScore = matchRoot.querySelector('.teaser-event__board-score');
        const matchPlayer = matchRoot.querySelector('.teaser-event__board-player-name');
        const matchSeparator = matchRoot.querySelector('.separator_color-gray');
        return {
            theme: document.documentElement.getAttribute('data-sru-clean-dark-theme'),
            controls: document.querySelectorAll('.sru-clean-dark-header-controls').length,
            themeButtons: document.querySelectorAll('.sru-clean-dark-theme-toggle').length,
            settingsButtons: document.querySelectorAll('.sru-clean-dark-settings-toggle').length,
            nativeButtons: document.querySelectorAll('.native-search, .native-profile, .native-pencil').length,
            normalDisplay: getComputedStyle(cards[0]).display,
            normalMenus: cards[0].querySelectorAll('.sru-clean-dark-card-menu-button').length,
            promoDisplay: getComputedStyle(cards[1]).display,
            promoMenus: cards[1].querySelectorAll('.sru-clean-dark-card-menu-button').length,
            adDisplay: getComputedStyle(ad).display,
            adHidden: ad.getAttribute('aria-hidden'),
            adLabelDisplay: getComputedStyle(adLabel).display,
            adLabelHidden: adLabel.getAttribute('aria-hidden'),
            matchCenterDisplay: getComputedStyle(matchCenterLink).display,
            sponsoredPromoDisplay: getComputedStyle(sponsoredPromo).display,
            sponsoredPromoMarker: sponsoredPromo.getAttribute('data-sru-clean-dark-promo'),
            sponsoredPromoHidden: sponsoredPromo.getAttribute('aria-hidden'),
            sirenaPromoDisplay: getComputedStyle(sirenaPromo).display,
            sirenaPromoMarker: sirenaPromo.getAttribute('data-sru-clean-dark-promo'),
            sirenaPromoHidden: sirenaPromo.getAttribute('aria-hidden'),
            inlinePromo: {
                textDisplay: getComputedStyle(inlinePromoText).display,
                textMarker: inlinePromoText.getAttribute('data-sru-clean-dark-promo'),
                imageDisplay: getComputedStyle(inlinePromoImage).display,
                imageMarker: inlinePromoImage.getAttribute('data-sru-clean-dark-promo'),
                imageHidden: inlinePromoImage.getAttribute('aria-hidden')
            },
            inlineArticle: {
                linkDisplay: getComputedStyle(inlineArticleLink).display,
                linkMarker: inlineArticleLink.getAttribute('data-sru-clean-dark-promo'),
                imageDisplay: getComputedStyle(inlineArticleImage).display,
                imageMarker: inlineArticleImage.getAttribute('data-sru-clean-dark-promo')
            },
            canvas: {
                modernLayoutBackground: getComputedStyle(document.querySelector('.fixture-feed')).backgroundColor,
                modernMainBackground: getComputedStyle(document.querySelector('.fixture-feed .columns-layout__main')).backgroundColor,
                legacyMainBackground: getComputedStyle(document.querySelector('.fixture-personal-feed .mainPart')).backgroundColor,
                articleLayoutBackground: getComputedStyle(document.querySelector('.fixture-news-layout')).backgroundColor,
                contentCardBackground: getComputedStyle(document.querySelector('.fixture-feed .blog-posts-list__item')).backgroundColor,
                legacyTabsBackground: getComputedStyle(document.querySelector('.fixture-entity-tabs')).backgroundColor,
                homeMaterialBackground: getComputedStyle(document.querySelector('.fixture-competition')).backgroundColor,
                homeNewsBackground: getComputedStyle(document.querySelector('.fixture-feed .aside-news-block')).backgroundColor,
                homeGadgetBackground: getComputedStyle(document.querySelector('.fixture-home-gadget')).backgroundColor,
                homeGadgetTableBackground: getComputedStyle(document.querySelector('.fixture-home-gadget .gadget-table')).backgroundColor
            },
            palette: {
                background: getComputedStyle(document.body).getPropertyValue('--sru-bg').trim(),
                surface: getComputedStyle(document.body).getPropertyValue('--sru-surface').trim(),
                raised: getComputedStyle(document.body).getPropertyValue('--sru-surface-raised').trim(),
                hover: getComputedStyle(document.body).getPropertyValue('--sru-surface-hover').trim(),
                text: getComputedStyle(document.body).getPropertyValue('--sru-text').trim(),
                muted: getComputedStyle(document.body).getPropertyValue('--sru-muted').trim(),
                border: getComputedStyle(document.body).getPropertyValue('--sru-border').trim(),
                articleTextColor: getComputedStyle(document.querySelector('.fixture-news-layout')).color
            },
            match: {
                rootBackground: getComputedStyle(matchRoot).backgroundColor,
                headerBackground: getComputedStyle(matchHeader).backgroundColor,
                eventBackground: getComputedStyle(matchEvent).backgroundColor,
                iconBackground: getComputedStyle(matchIcon).backgroundColor,
                iconMark: getComputedStyle(matchIcon, '::before').backgroundColor,
                titleColor: getComputedStyle(matchTitle).color,
                statusColor: getComputedStyle(matchStatus).color,
                scoreBackground: getComputedStyle(matchScore).backgroundColor,
                scoreColor: getComputedStyle(matchScore).color,
                scoreSpanColor: getComputedStyle(matchScore.querySelector('span')).color,
                playerColor: getComputedStyle(matchPlayer).color,
                separatorColor: getComputedStyle(matchSeparator).borderTopColor,
                whiteBackgrounds: Array.from(matchRoot.querySelectorAll('*')).filter((element) => (
                    getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)'
                )).length
            }
        };
    });
    const initialRoot = await getRootAttributes(page);

    assert.deepEqual(JSON.parse(initialRoot.errors), []);
    assert.equal(initialRoot.styleBytes, 127181);
    assert.equal(initialRoot.initialArticleDisplay, 'block');
    assert.equal(initialRoot.initialPromoDisplay, 'none');
    assert.equal(initialRoot.initialAdDisplay, 'none');
    assert.equal(initialRoot.initialAdLabelDisplay, 'none');
    assert.equal(initialRoot.initialCompetitionDisplay, 'none');
    assert.equal(initialRoot.initialSirenaPromoDisplay, 'none');
    assert.equal(initialRoot.initialSponsoredPromoDisplay, 'none');
    assert.equal(initialRoot.initialFooterAppDisplay, 'inline');
    assert.deepEqual(initial, {
        theme: 'dark',
        controls: 1,
        themeButtons: 1,
        settingsButtons: 1,
        nativeButtons: 3,
        normalDisplay: 'block',
        normalMenus: 1,
        promoDisplay: 'none',
        promoMenus: 0,
        adDisplay: 'none',
        adHidden: 'true',
        adLabelDisplay: 'none',
        adLabelHidden: 'true',
        matchCenterDisplay: 'inline',
        sponsoredPromoDisplay: 'none',
        sponsoredPromoMarker: 'true',
        sponsoredPromoHidden: 'true',
        sirenaPromoDisplay: 'none',
        sirenaPromoMarker: 'true',
        sirenaPromoHidden: 'true',
        inlinePromo: {
            textDisplay: 'none',
            textMarker: 'true',
            imageDisplay: 'none',
            imageMarker: 'true',
            imageHidden: 'true'
        },
        inlineArticle: {
            linkDisplay: 'block',
            linkMarker: null,
            imageDisplay: 'block',
            imageMarker: null
        },
        canvas: {
            modernLayoutBackground: 'rgba(0, 0, 0, 0)',
            modernMainBackground: 'rgba(0, 0, 0, 0)',
            legacyMainBackground: 'rgba(0, 0, 0, 0)',
            articleLayoutBackground: 'rgba(0, 0, 0, 0)',
            contentCardBackground: 'rgb(44, 44, 44)',
            legacyTabsBackground: 'rgb(44, 44, 44)',
            homeMaterialBackground: 'rgba(0, 0, 0, 0)',
            homeNewsBackground: 'rgba(0, 0, 0, 0)',
            homeGadgetBackground: 'rgba(0, 0, 0, 0)',
            homeGadgetTableBackground: 'rgba(0, 0, 0, 0)'
        },
        palette: {
            background: '#222222',
            surface: '#2c2c2c',
            raised: '#373737',
            hover: '#505050',
            text: '#d8d8d8',
            muted: '#9b9b9b',
            border: '#505050',
            articleTextColor: 'rgb(216, 216, 216)'
        },
        match: {
            rootBackground: 'rgba(0, 0, 0, 0)',
            headerBackground: 'rgb(55, 55, 55)',
            eventBackground: 'rgb(44, 44, 44)',
            iconBackground: 'rgb(80, 80, 80)',
            iconMark: 'rgb(216, 216, 216)',
            titleColor: 'rgb(216, 216, 216)',
            statusColor: 'rgb(155, 155, 155)',
            scoreBackground: 'rgb(55, 55, 55)',
            scoreColor: 'rgb(107, 188, 255)',
            scoreSpanColor: 'rgb(107, 188, 255)',
            playerColor: 'rgb(107, 188, 255)',
            separatorColor: 'rgb(80, 80, 80)',
            whiteBackgrounds: 0
        }
    });

    const beforePromo = readCalls(await getRootAttributes(page));
    await page.click('#fixture-add-promo');
    await page.waitForTimeout(80);
    const dynamicPromo = await page.evaluate(() => {
        const promo = document.querySelector('.fixture-dynamic-promo');
        return {
            marker: promo?.getAttribute('data-sru-clean-dark-promo'),
            display: promo ? getComputedStyle(promo).display : null
        };
    });
    const afterPromo = readCalls(await getRootAttributes(page));
    assert.deepEqual(dynamicPromo, { marker: 'true', display: 'none' });
    assert.ok(afterPromo.scanPromos > beforePromo.scanPromos);
    assert.ok(afterPromo.runQueuedScan > beforePromo.runQueuedScan);

    const beforeUi = readCalls(await getRootAttributes(page));
    await page.click('#fixture-add-ui');
    await page.waitForTimeout(80);
    const afterUi = readCalls(await getRootAttributes(page));
    for (const name of ['runQueuedScan', 'scanAds', 'scanPromos', 'scanSiteAuthorBlocks']) {
        assert.equal(afterUi[name] || 0, beforeUi[name] || 0, `${name} ran for own UI`);
    }

    const beforeRemoval = readCalls(await getRootAttributes(page));
    await page.click('#fixture-remove-controls');
    await page.waitForTimeout(80);
    const afterRemoval = readCalls(await getRootAttributes(page));
    assert.ok(afterRemoval.runQueuedScan > beforeRemoval.runQueuedScan);
    assert.equal(await page.locator('.sru-clean-dark-header-controls').count(), 1);
    assert.equal(await page.locator('.sru-clean-dark-theme-toggle').count(), 1);
    assert.equal(await page.locator('.sru-clean-dark-settings-toggle').count(), 1);

    await page.click('.sru-clean-dark-settings-toggle');
    const darkThemeOutlines = await page.evaluate(() => ({
        settings: getComputedStyle(document.querySelector(
            '.sru-clean-dark-settings-backdrop .sru-clean-dark-theme-toggle__viewport'
        )).boxShadow,
        header: getComputedStyle(document.querySelector(
            '.sru-clean-dark-header-controls .sru-clean-dark-theme-toggle__viewport'
        )).boxShadow,
        settingsFill: getComputedStyle(document.querySelector(
            '.sru-clean-dark-settings-backdrop .sru-clean-dark-theme-toggle__toggler'
        )).backgroundColor,
        headerFill: getComputedStyle(document.querySelector(
            '.sru-clean-dark-header-controls .sru-clean-dark-theme-toggle__toggler'
        )).backgroundColor
    }));
    assert.deepEqual(darkThemeOutlines, {
        settings: 'none',
        header: 'none',
        settingsFill: 'rgb(34, 34, 34)',
        headerFill: 'rgb(55, 55, 55)'
    });
    assert.deepEqual(await getSettingsSwitchStyles(page, 'toggle-ad-blocking'), {
        checked: 'true',
        trackBackground: 'rgb(34, 34, 34)',
        trackShadow: 'none',
        thumbBackground: 'rgb(0, 168, 118)',
        thumbShadow: 'none'
    });
    await page.click('[data-sru-settings-action="reset"]');
    assert.equal(
        await page.locator('[data-sru-settings-action="reset"]').getAttribute('data-confirming'),
        'true'
    );
    const renderBeforeTheme = readCalls(await getRootAttributes(page)).renderSettingsDialog;
    await page.click('[data-sru-settings-action="toggle-theme"]');
    await page.waitForTimeout(300);
    const afterTheme = await page.evaluate(() => ({
        root: document.documentElement.getAttribute('data-sru-clean-dark-theme'),
        header: document.querySelector('.sru-clean-dark-theme-toggle')?.getAttribute('data-sru-theme-state'),
        settings: document.querySelector('[data-sru-settings-action="toggle-theme"]')?.getAttribute('data-sru-theme-state'),
        dialogs: document.querySelectorAll('.sru-clean-dark-settings-backdrop:not([hidden])').length,
        articleLayoutBackground: getComputedStyle(document.querySelector('.fixture-news-layout')).backgroundColor
    }));
    const renderAfterTheme = readCalls(await getRootAttributes(page)).renderSettingsDialog;
    assert.deepEqual(afterTheme, {
        root: 'light',
        header: 'light',
        settings: 'light',
        dialogs: 1,
        articleLayoutBackground: 'rgb(255, 255, 255)'
    });
    assert.equal(renderAfterTheme, renderBeforeTheme);
    assert.deepEqual(await page.evaluate(() => ({
        outline: getComputedStyle(document.querySelector(
            '.sru-clean-dark-settings-backdrop .sru-clean-dark-theme-toggle__viewport'
        )).boxShadow,
        fill: getComputedStyle(document.querySelector(
            '.sru-clean-dark-settings-backdrop .sru-clean-dark-theme-toggle__toggler'
        )).backgroundColor
    })), {
        outline: 'none',
        fill: 'rgb(223, 228, 232)'
    });
    assert.deepEqual(await getSettingsSwitchStyles(page, 'toggle-ad-blocking'), {
        checked: 'true',
        trackBackground: 'rgb(223, 228, 232)',
        trackShadow: 'none',
        thumbBackground: 'rgb(0, 168, 118)',
        thumbShadow: 'none'
    });
    assert.equal(
        await page.locator('[data-sru-settings-action="reset"]').getAttribute('data-confirming'),
        'false'
    );
    assert.equal(await page.locator('[data-sru-settings-action="reset"]').textContent(), 'Сбросить настройки');
    assert.deepEqual(JSON.parse((await getRootAttributes(page)).errors), []);
    await page.close();
});

test('ad-only legacy sidebar centers before the first frame while useful mounts stay visible', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/basketball/news/?seed=1&loading-sidebar=1`, { waitUntil: 'commit' });
    await page.waitForSelector('html[data-sru-fixture-sidebar-first-frame]');

    const firstFrame = JSON.parse(await page.locator('html').getAttribute(
        'data-sru-fixture-sidebar-first-frame'
    ));
    assert.deepEqual(firstFrame, {
        readyState: 'loading',
        adOnly: 'true',
        useful: 'false'
    });

    const layout = await page.evaluate(() => {
        const adLayout = document.querySelector('.fixture-loading-sidebar .layout-columns');
        const main = adLayout.querySelector('.mainPart');
        const sidebar = adLayout.querySelector('.rightPart');
        const usefulLayout = document.querySelector('.fixture-useful-sidebar .layout-columns');
        const layoutRect = adLayout.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        return {
            adOnly: adLayout.getAttribute('data-sru-clean-dark-empty-sidebar'),
            sidebarDisplay: getComputedStyle(sidebar).display,
            mainWidth: mainRect.width,
            centerDelta: Math.abs(
                (layoutRect.left + layoutRect.right) / 2 - (mainRect.left + mainRect.right) / 2
            ),
            useful: usefulLayout.getAttribute('data-sru-clean-dark-empty-sidebar'),
            usefulSidebarDisplay: getComputedStyle(usefulLayout.querySelector('.rightPart')).display
        };
    });
    assert.deepEqual(layout, {
        adOnly: 'true',
        sidebarDisplay: 'none',
        mainWidth: 732,
        centerDelta: 0,
        useful: null,
        usefulSidebarDisplay: 'block'
    });

    await page.waitForLoadState('load');
    assert.deepEqual(JSON.parse((await getRootAttributes(page)).errors), []);
    await page.close();
});

test('settings recovery lists keep one action column and expose safe links', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const cases = [
        { width: 1280, theme: 'dark', linkColor: 'rgb(107, 188, 255)' },
        { width: 390, theme: 'dark', linkColor: 'rgb(107, 188, 255)' },
        { width: 1280, theme: 'light', linkColor: 'rgb(0, 100, 150)' }
    ];
    for (const fixtureCase of cases) {
        const page = await browser.newPage({ viewport: { width: fixtureCase.width, height: 500 } });
        await page.goto(`${origin}/tests/browser-fixture.html?seed=1&blocks=1&settings-layout=1&theme=${fixtureCase.theme}`);
        await page.waitForTimeout(120);
        await page.click('.sru-clean-dark-settings-toggle');
        const layout = await getSettingsRecoveryLayout(page);
        assert.deepEqual(layout, {
            sections: 3,
            buttons: 8,
            buttonWidths: [164],
            buttonHeights: [34],
            buttonFontSizes: ['14px'],
            buttonWhiteSpace: ['nowrap'],
            buttonsSingleLine: true,
            actionColumnsAligned: true,
            rowsUniform: true,
            rowCount: 5,
            longLabelTruncated: true,
            longLabelOverflow: 'ellipsis',
            longLabelWhiteSpace: 'nowrap',
            articleLinks: 2,
            authorLinks: 3,
            articleHref: 'https://www.sports.ru/football/blogs/long-title.html',
            authorHref: 'https://www.sports.ru/profile/41/',
            articleTitle: 'Как Испании справиться с Месси, а Аргентине – с Испанией? Превью финала ЧМ-2026',
            linksOpenSafely: true,
            articleLabel: 'Открыть статью «Как Испании справиться с Месси, а Аргентине – с Испанией? Превью финала ЧМ-2026» в новой вкладке',
            authorLabel: 'Открыть профиль автора Вадим Лукомский в новой вкладке',
            linkColor: fixtureCase.linkColor,
            dialogOverflow: 'hidden',
            contentOverflow: 'auto',
            contentScrollable: true
        });
        assert.deepEqual(JSON.parse((await getRootAttributes(page)).errors), []);
        await page.close();
    }
});

test('statistics accordion handles use dark surfaces without white plaques', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=dark`);
    await page.waitForTimeout(100);

    const statistics = await getStatisticsStyles(page);
    assert.equal(statistics.handles.length, 3);
    for (const handle of statistics.handles) {
        assert.deepEqual(handle, {
            background: 'rgb(55, 55, 55)',
            border: 'rgb(80, 80, 80)',
            title: 'rgb(216, 216, 216)',
            titleLink: 'rgb(216, 216, 216)',
            icon: 'rgb(80, 80, 80)',
            iconBefore: 'rgb(216, 216, 216)',
            iconAfter: 'rgb(216, 216, 216)'
        });
    }
    assert.deepEqual(statistics.whiteBackgrounds, []);
    assert.deepEqual(JSON.parse((await getRootAttributes(page)).errors), []);
    await page.close();
});

test('statistics accordion handles retain native light colors', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light`);
    await page.waitForTimeout(100);

    const statistics = await getStatisticsStyles(page);
    assert.equal(statistics.handles.length, 3);
    for (const handle of statistics.handles) {
        assert.deepEqual(handle, {
            background: 'rgb(137, 137, 137)',
            border: 'rgb(137, 137, 137)',
            title: 'rgb(255, 255, 255)',
            titleLink: 'rgb(78, 78, 78)',
            icon: 'rgb(255, 255, 255)',
            iconBefore: 'rgb(34, 34, 34)',
            iconAfter: 'rgb(34, 34, 34)'
        });
    }
    assert.deepEqual(JSON.parse((await getRootAttributes(page)).errors), []);
    await page.close();
});

test('legacy entity header and home feed controls follow the selected theme', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    assert.deepEqual(await getLegacyThemeStyles(darkPage), {
        profileTableBackground: 'rgba(0, 0, 0, 0)',
        profileTableBorder: '0px',
        genericTableBackground: 'rgb(44, 44, 44)',
        blogLabel: 'rgb(155, 155, 155)',
        blogLink: 'rgb(107, 188, 255)',
        showMoreBackground: 'rgb(55, 55, 55)',
        showMoreColor: 'rgb(216, 216, 216)',
        showMoreBorder: 'rgb(80, 80, 80)',
        blogsShowMoreBackground: 'rgb(55, 55, 55)',
        blogsShowMoreColor: 'rgb(216, 216, 216)',
        blogsShowMoreBorder: 'rgb(80, 80, 80)',
        personalShowMoreBackground: 'rgb(55, 55, 55)',
        personalShowMoreColor: 'rgb(216, 216, 216)',
        socialText: 'rgb(155, 155, 155)',
        competitionDisplay: 'none',
        competitionMarker: 'true',
        footerAppDisplay: 'inline'
    });
    const showMore = darkPage.locator('.fixture-feed .btn-show-more[data-model="Section.Articles"]');
    await showMore.hover();
    assert.deepEqual(await showMore.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        color: getComputedStyle(element).color
    })), {
        background: 'rgb(80, 80, 80)',
        color: 'rgb(0, 199, 139)'
    });
    await showMore.focus();
    assert.deepEqual(await showMore.evaluate((element) => ({
        active: document.activeElement === element,
        outlineColor: getComputedStyle(element).outlineColor,
        outlineWidth: getComputedStyle(element).outlineWidth
    })), {
        active: true,
        outlineColor: 'rgb(0, 199, 139)',
        outlineWidth: '2px'
    });
    const blogsShowMore = darkPage.locator('.fixture-feed .user-feed__show-more');
    await blogsShowMore.hover();
    assert.deepEqual(await blogsShowMore.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        color: getComputedStyle(element).color
    })), {
        background: 'rgb(80, 80, 80)',
        color: 'rgb(0, 199, 139)'
    });
    await blogsShowMore.focus();
    assert.equal(await blogsShowMore.evaluate((element) => getComputedStyle(element).outlineWidth), '2px');
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.deepEqual(await getLegacyThemeStyles(lightPage), {
        profileTableBackground: 'rgba(0, 0, 0, 0)',
        profileTableBorder: '0px',
        genericTableBackground: 'rgba(0, 0, 0, 0)',
        blogLabel: 'rgb(34, 34, 34)',
        blogLink: 'rgb(0, 100, 150)',
        showMoreBackground: 'rgb(243, 243, 239)',
        showMoreColor: 'rgb(34, 34, 34)',
        showMoreBorder: 'rgb(243, 243, 239)',
        blogsShowMoreBackground: 'rgb(243, 243, 239)',
        blogsShowMoreColor: 'rgb(34, 34, 34)',
        blogsShowMoreBorder: 'rgb(243, 243, 239)',
        personalShowMoreBackground: 'rgb(232, 232, 224)',
        personalShowMoreColor: 'rgb(34, 34, 34)',
        socialText: 'rgb(34, 34, 34)',
        competitionDisplay: 'none',
        competitionMarker: 'true',
        footerAppDisplay: 'inline'
    });
    assert.deepEqual(JSON.parse((await getRootAttributes(lightPage)).errors), []);
    await lightPage.close();
});

test('legacy entity filters and More menu keep distinct dark states', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    assert.deepEqual(await getEntityTabsStyles(darkPage), {
        root: 'rgb(44, 44, 44)',
        activeFilter: 'rgb(34, 34, 34)',
        activeFilterText: 'rgb(216, 216, 216)',
        activeFilterShadow: 'rgb(80, 80, 80) 0px 0px 0px 1px inset',
        inactiveFilter: 'rgba(0, 0, 0, 0)',
        inactiveFilterText: 'rgb(107, 188, 255)',
        arrowFilter: 'brightness(0) invert(1)',
        arrowOpacity: '0.8',
        menu: 'rgb(55, 55, 55)',
        menuText: 'rgb(216, 216, 216)',
        menuBorder: 'rgb(80, 80, 80)',
        menuItem: 'rgba(0, 0, 0, 0)',
        menuItemBorder: 'rgb(80, 80, 80)',
        menuLink: 'rgba(0, 0, 0, 0)',
        menuLinkText: 'rgb(107, 188, 255)'
    });
    const darkMenuLink = darkPage.locator('.fixture-entity-tabs .c-dropdown__dropdown-menu a').first();
    await darkMenuLink.hover();
    assert.deepEqual(await darkMenuLink.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        color: getComputedStyle(element).color
    })), {
        background: 'rgb(80, 80, 80)',
        color: 'rgb(159, 212, 255)'
    });
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.deepEqual(await getEntityTabsStyles(lightPage), {
        root: 'rgb(243, 243, 239)',
        activeFilter: 'rgb(50, 50, 50)',
        activeFilterText: 'rgb(255, 255, 255)',
        activeFilterShadow: 'none',
        inactiveFilter: 'rgba(0, 0, 0, 0)',
        inactiveFilterText: 'rgb(0, 100, 150)',
        arrowFilter: 'none',
        arrowOpacity: '1',
        menu: 'rgb(255, 255, 255)',
        menuText: 'rgb(34, 34, 34)',
        menuBorder: 'rgb(34, 34, 34)',
        menuItem: 'rgba(0, 0, 0, 0)',
        menuItemBorder: 'rgb(229, 229, 229)',
        menuLink: 'rgba(0, 0, 0, 0)',
        menuLinkText: 'rgb(0, 100, 150)'
    });
    await lightPage.close();
});

test('legacy Tribuna blog menu and feed stay readable in both themes', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/tribuna/blogs/pavle21/?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    assert.deepEqual(await getLegacyBlogStyles(darkPage), {
        menuBackground: 'rgb(55, 55, 55)',
        menuBorder: 'rgb(80, 80, 80)',
        activeBackground: 'rgb(44, 44, 44)',
        activeColor: 'rgb(216, 216, 216)',
        inactiveBackground: 'rgba(0, 0, 0, 0)',
        inactiveColor: 'rgb(216, 216, 216)',
        link: 'rgb(107, 188, 255)',
        title: 'rgb(216, 216, 216)',
        brief: 'rgb(155, 155, 155)',
        figcaption: 'rgb(155, 155, 155)',
        itemBorder: 'rgb(80, 80, 80)',
        dropdownBackground: 'rgb(55, 55, 55)',
        dropdownText: 'rgb(216, 216, 216)',
        recentBackground: 'rgb(55, 55, 55)',
        recentLink: 'rgb(107, 188, 255)',
        paginationBackground: 'rgb(55, 55, 55)',
        paginationColor: 'rgb(216, 216, 216)',
        statisticCell: 'rgb(216, 216, 216)',
        statisticBorder: 'rgb(80, 80, 80)',
        statisticMuted: 'rgb(155, 155, 155)',
        statisticIcon: 'rgb(216, 216, 216)',
        statisticLink: 'rgb(107, 188, 255)',
        newBlogTitle: 'rgb(216, 216, 216)',
        newBlogDescription: 'rgb(155, 155, 155)',
        newBlogTextarea: 'rgb(44, 44, 44)',
        uploadBackground: 'rgb(55, 55, 55)',
        uploadColor: 'rgb(216, 216, 216)'
    });
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/tribuna/blogs/pavle21/?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.deepEqual(await getLegacyBlogStyles(lightPage), {
        menuBackground: 'rgb(243, 243, 239)',
        menuBorder: 'rgb(216, 216, 216)',
        activeBackground: 'rgb(255, 255, 255)',
        activeColor: 'rgb(0, 0, 0)',
        inactiveBackground: 'rgba(0, 0, 0, 0)',
        inactiveColor: 'rgb(34, 34, 34)',
        link: 'rgb(0, 100, 150)',
        title: 'rgb(34, 34, 34)',
        brief: 'rgb(0, 0, 0)',
        figcaption: 'rgb(0, 0, 0)',
        itemBorder: 'rgb(216, 216, 216)',
        dropdownBackground: 'rgb(255, 255, 255)',
        dropdownText: 'rgb(51, 51, 51)',
        recentBackground: 'rgb(246, 246, 243)',
        recentLink: 'rgb(0, 100, 150)',
        paginationBackground: 'rgb(243, 243, 239)',
        paginationColor: 'rgb(34, 34, 34)',
        statisticCell: 'rgb(34, 34, 34)',
        statisticBorder: 'rgb(216, 216, 216)',
        statisticMuted: 'rgb(136, 136, 136)',
        statisticIcon: 'rgb(34, 34, 34)',
        statisticLink: 'rgb(0, 100, 150)',
        newBlogTitle: 'rgb(34, 34, 34)',
        newBlogDescription: 'rgb(136, 136, 136)',
        newBlogTextarea: 'rgb(255, 255, 255)',
        uploadBackground: 'rgb(243, 243, 239)',
        uploadColor: 'rgb(34, 34, 34)'
    });
    await lightPage.close();
});

test('own match-chat messages stay readable in dark and light themes', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    assert.deepEqual(await getMatchChatStyles(darkPage), {
        background: 'rgb(0, 82, 57)',
        text: 'rgb(216, 216, 216)'
    });
    await darkPage.hover('.fixture-match-chat .message--your-message');
    assert.deepEqual(await getMatchChatStyles(darkPage), {
        background: 'rgb(80, 80, 80)',
        text: 'rgb(216, 216, 216)'
    });
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.deepEqual(await getMatchChatStyles(lightPage), {
        background: 'rgb(204, 243, 222)',
        text: 'rgb(34, 34, 34)'
    });
    await lightPage.hover('.fixture-match-chat .message--your-message');
    assert.deepEqual(await getMatchChatStyles(lightPage), {
        background: 'rgb(234, 234, 234)',
        text: 'rgb(34, 34, 34)'
    });
    await lightPage.close();
});

test('compact match score popup follows the selected theme on hover', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    assert.equal((await getMatchPopupStyles(darkPage)).display, 'none');
    await darkPage.hover('.js-popup-match_handle');
    assert.deepEqual(await getMatchPopupStyles(darkPage), {
        display: 'block',
        background: 'rgb(55, 55, 55)',
        border: 'rgb(80, 80, 80)',
        scoreBackground: 'rgb(80, 80, 80)',
        scoreColor: 'rgb(216, 216, 216)',
        team: 'rgb(107, 188, 255)',
        event: 'rgb(216, 216, 216)',
        time: 'rgb(216, 216, 216)',
        scorer: 'rgb(107, 188, 255)',
        rowBorder: 'rgb(80, 80, 80)',
        columnBorder: 'rgb(80, 80, 80)'
    });
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.equal((await getMatchPopupStyles(lightPage)).display, 'none');
    await lightPage.hover('.js-popup-match_handle');
    assert.deepEqual(await getMatchPopupStyles(lightPage), {
        display: 'block',
        background: 'rgb(255, 255, 255)',
        border: 'rgb(216, 216, 216)',
        scoreBackground: 'rgb(243, 243, 239)',
        scoreColor: 'rgb(34, 34, 34)',
        team: 'rgb(0, 100, 150)',
        event: 'rgb(34, 34, 34)',
        time: 'rgb(34, 34, 34)',
        scorer: 'rgb(0, 0, 0)',
        rowBorder: 'rgb(243, 243, 239)',
        columnBorder: 'rgb(216, 216, 216)'
    });
    await lightPage.close();
});

test('tournament tab fades follow the selected theme', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    const darkFades = await getTournamentFadeStyles(darkPage);
    assert.match(darkFades.left, /rgb\(34, 34, 34\)/);
    assert.match(darkFades.right, /rgb\(34, 34, 34\)/);
    assert.doesNotMatch(darkFades.left, /rgb\(241, 241, 241\)/);
    assert.doesNotMatch(darkFades.right, /rgb\(241, 241, 241\)/);
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    const lightFades = await getTournamentFadeStyles(lightPage);
    assert.match(lightFades.left, /rgb\(241, 241, 241\)/);
    assert.match(lightFades.right, /rgb\(241, 241, 241\)/);
    await lightPage.close();
});

test('audited legacy tournament and news controls keep readable theme colors', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    assert.deepEqual(await getAuditedLegacyStyles(darkPage), {
        breadcrumbLink: 'rgb(155, 155, 155)',
        breadcrumbText: 'rgb(155, 155, 155)',
        newsBorder: 'rgb(80, 80, 80)',
        newsListBorder: 'rgb(80, 80, 80)',
        inactiveTabBackground: 'rgb(44, 44, 44)',
        inactiveTabColor: 'rgb(107, 188, 255)',
        activeTabBackground: 'rgb(55, 55, 55)',
        activeTabColor: 'rgb(216, 216, 216)',
        sort: 'rgb(107, 188, 255)',
        activeSort: 'rgb(216, 216, 216)',
        losingScoreBackground: 'rgb(74, 37, 43)',
        losingScoreColor: 'rgb(216, 216, 216)',
        penaltyMark: 'rgb(216, 216, 216)'
    });
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.deepEqual(await getAuditedLegacyStyles(lightPage), {
        breadcrumbLink: 'rgb(34, 34, 34)',
        breadcrumbText: 'rgb(34, 34, 34)',
        newsBorder: 'rgb(255, 255, 255)',
        newsListBorder: 'rgb(216, 216, 216)',
        inactiveTabBackground: 'rgb(255, 255, 255)',
        inactiveTabColor: 'rgb(0, 100, 150)',
        activeTabBackground: 'rgb(243, 243, 239)',
        activeTabColor: 'rgb(34, 34, 34)',
        sort: 'rgb(0, 100, 150)',
        activeSort: 'rgb(0, 0, 0)',
        losingScoreBackground: 'rgb(255, 218, 218)',
        losingScoreColor: 'rgb(34, 34, 34)',
        penaltyMark: 'rgb(34, 34, 34)'
    });
    await lightPage.close();
});

test('legacy cabinet controls use dark surfaces without changing the light theme', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/cabinet/?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    assert.deepEqual(await getCabinetStyles(darkPage), {
        page: 'legacy-cabinet',
        inactiveTab: 'rgb(44, 44, 44)',
        activeTab: 'rgb(55, 55, 55)',
        disabledField: 'rgb(55, 55, 55)',
        normalField: 'rgb(55, 55, 55)',
        fieldInnerBorder: 'rgb(80, 80, 80)',
        textarea: 'rgb(55, 55, 55)',
        select: 'rgb(55, 55, 55)',
        divider: 'rgb(80, 80, 80)',
        upload: 'rgb(55, 55, 55)',
        uploadText: 'rgb(216, 216, 216)',
        emailSave: 'rgb(55, 55, 55)',
        emailSaveText: 'rgb(216, 216, 216)',
        submit: 'rgb(255, 0, 60)',
        submitText: 'rgb(255, 255, 255)',
        settingsField: 'rgb(55, 55, 55)',
        settingsFieldInnerBorder: 'rgb(80, 80, 80)'
    });
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/cabinet/?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.deepEqual(await getCabinetStyles(lightPage), {
        page: 'legacy-cabinet',
        inactiveTab: 'rgb(255, 255, 255)',
        activeTab: 'rgb(243, 243, 239)',
        disabledField: 'rgb(232, 232, 224)',
        normalField: 'rgb(255, 255, 255)',
        fieldInnerBorder: 'rgb(232, 232, 224)',
        textarea: 'rgb(255, 255, 255)',
        select: 'rgb(255, 255, 255)',
        divider: 'rgb(216, 216, 216)',
        upload: 'rgb(232, 232, 224)',
        uploadText: 'rgb(34, 34, 34)',
        emailSave: 'rgb(232, 232, 224)',
        emailSaveText: 'rgb(34, 34, 34)',
        submit: 'rgb(255, 0, 60)',
        submitText: 'rgb(255, 255, 255)',
        settingsField: 'rgb(255, 255, 255)',
        settingsFieldInnerBorder: 'rgb(232, 232, 224)'
    });
    await lightPage.close();
});

test('notification panel follows the selected theme without a white canvas', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    assert.deepEqual(await getNotificationStyles(darkPage), {
        arrow: 'rgb(44, 44, 44)',
        inner: 'rgb(44, 44, 44)',
        innerText: 'rgb(216, 216, 216)',
        header: 'rgb(44, 44, 44)',
        headerBorder: 'rgb(80, 80, 80)',
        body: 'rgb(44, 44, 44)',
        bodyBorder: 'rgb(80, 80, 80)',
        activeTab: 'rgb(80, 80, 80)',
        activeTabText: 'rgb(216, 216, 216)',
        inactiveTabText: 'rgb(216, 216, 216)',
        count: 'rgb(155, 155, 155)',
        stub: 'rgb(155, 155, 155)',
        listItem: 'rgb(44, 44, 44)',
        listItemBorder: 'rgb(80, 80, 80)',
        message: 'rgb(216, 216, 216)',
        messageLink: 'rgb(107, 188, 255)',
        time: 'rgb(155, 155, 155)',
        footer: 'rgb(44, 44, 44)',
        footerBorder: 'rgb(80, 80, 80)',
        footerLink: 'rgb(107, 188, 255)',
        markAll: 'rgb(55, 55, 55)',
        markAllText: 'rgb(216, 216, 216)',
        markAllBorder: 'rgb(80, 80, 80)',
        whiteBackgrounds: 0
    });
    const markAll = darkPage.locator('.fixture-notifications .personal-notifications__footer-mark-all');
    await markAll.hover();
    assert.deepEqual(await markAll.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        color: getComputedStyle(element).color
    })), {
        background: 'rgb(80, 80, 80)',
        color: 'rgb(0, 199, 139)'
    });
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.deepEqual(await getNotificationStyles(lightPage), {
        arrow: 'rgb(255, 255, 255)',
        inner: 'rgb(255, 255, 255)',
        innerText: 'rgb(0, 0, 0)',
        header: 'rgba(0, 0, 0, 0)',
        headerBorder: 'rgb(229, 229, 229)',
        body: 'rgba(0, 0, 0, 0)',
        bodyBorder: 'rgb(229, 229, 229)',
        activeTab: 'rgb(34, 34, 34)',
        activeTabText: 'rgb(255, 255, 255)',
        inactiveTabText: 'rgb(0, 0, 0)',
        count: 'rgb(127, 127, 127)',
        stub: 'rgb(127, 127, 127)',
        listItem: 'rgba(0, 0, 0, 0)',
        listItemBorder: 'rgb(229, 229, 229)',
        message: 'rgb(0, 0, 0)',
        messageLink: 'rgb(0, 100, 150)',
        time: 'rgb(127, 127, 127)',
        footer: 'rgba(0, 0, 0, 0)',
        footerBorder: 'rgb(229, 229, 229)',
        footerLink: 'rgb(0, 100, 150)',
        markAll: 'rgb(244, 244, 244)',
        markAllText: 'rgb(0, 0, 0)',
        markAllBorder: 'rgb(244, 244, 244)',
        whiteBackgrounds: 0
    });
    await lightPage.close();
});

test('create-content dropdown follows the selected theme', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const darkPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await darkPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=dark`);
    await darkPage.waitForTimeout(100);
    assert.deepEqual(await getCreateContentDropdownStyles(darkPage), {
        menu: 'rgb(44, 44, 44)',
        menuText: 'rgb(216, 216, 216)',
        menuBorder: 'rgb(80, 80, 80)',
        list: 'rgb(44, 44, 44)',
        item: 'rgba(0, 0, 0, 0)',
        itemText: 'rgb(216, 216, 216)',
        controlText: 'rgb(216, 216, 216)',
        icon: 'rgb(216, 216, 216)'
    });
    const darkItem = darkPage.locator('.create-content-dropdown .ui-dropdown__item').first();
    await darkItem.hover();
    assert.equal(
        await darkItem.evaluate((element) => getComputedStyle(element).backgroundColor),
        'rgb(80, 80, 80)'
    );
    await darkPage.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.deepEqual(await getCreateContentDropdownStyles(lightPage), {
        menu: 'rgb(255, 255, 255)',
        menuText: 'rgb(34, 34, 34)',
        menuBorder: 'rgb(216, 216, 216)',
        list: 'rgb(255, 255, 255)',
        item: 'rgba(0, 0, 0, 0)',
        itemText: 'rgb(34, 34, 34)',
        controlText: 'rgb(34, 34, 34)',
        icon: 'rgb(34, 34, 34)'
    });
    await lightPage.close();
});

test('video player context blocks prerolls and analytics independently without main UI', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const userscript = fs.readFileSync(userscriptPath, 'utf8');
    const fixture = buildVideoFixtureHtml();
    const cases = [
        { ads: true, analytics: true },
        { ads: true, analytics: false },
        { ads: false, analytics: true },
        { ads: false, analytics: false }
    ];

    for (const options of cases) {
        const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
        await page.route('https://video.sports.ru/**', async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === '/sports-ru-clean-dark.user.js') {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/javascript; charset=utf-8',
                    body: userscript
                });
                return;
            }
            await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture });
        });
        const query = `ads=${options.ads ? 'on' : 'off'}&analytics=${options.analytics ? 'on' : 'off'}`;
        await page.goto(`https://video.sports.ru/embed/fixture?${query}`);
        await page.waitForFunction(() => Boolean(window.__videoResults));
        const result = await page.evaluate(async () => ({
            responses: await window.__videoResults,
            nativeCalls: [...window.__nativeFetchCalls].sort(),
            apollo: window.__APOLLO_STATE__,
            analyticsControl: Boolean(window[Symbol.for('sru-clean-dark.analytics-v1')]),
            videoControl: Boolean(window[Symbol.for('sru-clean-dark.video-ads-v1')]),
            styles: document.querySelectorAll('style').length,
            ownUi: document.querySelectorAll('[data-sru-clean-dark-ui]').length,
            theme: document.documentElement.getAttribute('data-sru-clean-dark-theme')
        }));

        assert.equal(result.analyticsControl, options.analytics);
        assert.equal(result.videoControl, options.ads);
        assert.equal(result.styles, 0);
        assert.equal(result.ownUi, 0);
        assert.equal(result.theme, null);
        assert.equal(result.apollo.content.isAdvEnabled, !options.ads);
        assert.equal(result.apollo.content.preRollCount, options.ads ? 0 : 2);
        assert.equal(result.apollo.rights.isAdvEnabled, !options.ads);
        assert.equal(result.apollo.viewer.enabled, true);
        assert.equal(result.responses.sponsorViewer, 'fixture-viewer');
        assert.deepEqual(result.responses.sponsor.errors, [{ message: 'partial fixture error' }]);
        assert.deepEqual(
            result.responses.sponsor.data.sponsorCampaign,
            options.ads ? null : { id: 'fixture-ad' }
        );
        assert.deepEqual(
            result.responses.analytics,
            options.analytics
                ? { data: { createEvent: true } }
                : { data: { content: { ok: true, operationName: 'CreateEvent' } } }
        );
        assert.equal(result.responses.analyticsViewer, 'fixture-viewer');
        const expectedCalls = options.analytics
            ? ['ContentQuery', 'SponsorVideo']
            : ['ContentQuery', 'CreateEvent', 'SponsorVideo'];
        assert.deepEqual(result.nativeCalls, expectedCalls);

        const aborted = await page.evaluate(async () => {
            const controller = new AbortController();
            controller.abort();
            const request = new Request('/site/graphql', {
                method: 'POST',
                signal: controller.signal,
                body: JSON.stringify({
                    operationName: 'CreateEvent',
                    query: 'mutation CreateEvent($token: String!) { createEvent(token: $token) }'
                })
            });
            try {
                await fetch(request);
                return 'resolved';
            } catch (error) {
                return error.name;
            }
        });
        assert.equal(aborted, 'AbortError');

        if (options.ads && options.analytics) {
            const duplicate = await page.evaluate(async () => {
                const fetchBefore = window.fetch;
                const analyticsBefore = window[Symbol.for('sru-clean-dark.analytics-v1')];
                const videoBefore = window[Symbol.for('sru-clean-dark.video-ads-v1')];
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = '/sports-ru-clean-dark.user.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.append(script);
                });
                return {
                    sameFetch: window.fetch === fetchBefore,
                    sameAnalytics: window[Symbol.for('sru-clean-dark.analytics-v1')] === analyticsBefore,
                    sameVideo: window[Symbol.for('sru-clean-dark.video-ads-v1')] === videoBefore,
                    ownUi: document.querySelectorAll('[data-sru-clean-dark-ui]').length
                };
            });
            assert.deepEqual(duplicate, {
                sameFetch: true,
                sameAnalytics: true,
                sameVideo: true,
                ownUi: 0
            });
        }
        await page.close();
    }
});

test('site-wide analytics blocking keeps functional recommendation and GraphQL traffic', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const recommendationBodies = [];
    let rumRequests = 0;
    let recsTrackingRequests = 0;
    let functionalGraphqlRequests = 0;
    await page.route('https://r.sports.ru/**', async (route) => {
        recommendationBodies.push(route.request().method() === 'GET'
            ? 'GET'
            : JSON.parse(route.request().postData() || '{}'));
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ ok: true })
        });
    });
    await page.route('https://rum.sports.ru/**', async (route) => {
        rumRequests += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('https://recs.s5o.ru/**', async (route) => {
        recsTrackingRequests += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/gql/graphql/**', async (route) => {
        functionalGraphqlRequests += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"ok":true}}' });
    });

    await page.goto(`${origin}/tests/browser-fixture.html?seed=1`);
    const result = await page.evaluate(async () => {
        const script = document.createElement('script');
        script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST';
        const image = document.createElement('img');
        image.src = 'https://mc.yandex.ru/watch/1';
        const banditBeacon = navigator.sendBeacon(
            'https://r.sports.ru/bandit/',
            JSON.stringify({ send_data: [{ action: 'pull' }] })
        );
        const post = (url, payload) => fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body: JSON.stringify(payload)
        }).then((response) => response.json());
        const xhrPost = (url, payload) => new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('content-type', 'application/json');
            xhr.onload = () => resolve(JSON.parse(xhr.responseText || '{}'));
            xhr.onerror = () => reject(new Error(`XHR failed: ${url}`));
            xhr.send(JSON.stringify(payload));
        });

        const rumResponse = await fetch('https://rum.sports.ru/intake/v2/rum/events');
        const rum = { status: rumResponse.status, body: await rumResponse.text() };
        const trackingOnly = await post('https://r.sports.ru/recommender/', {
            send_data: { interactions: [{ type: 'view' }] }
        });
        const hybrid = await post('https://r.sports.ru/recommender/', {
            send_data: { interactions: [{ type: 'click' }] },
            return_data: { limit: 5 },
            context: { page: 'home' }
        });
        const returnOnly = await post('https://r.sports.ru/bandit/', {
            return_data: { slot: 'top' }
        });
        const getRecommendation = await fetch('https://r.sports.ru/recommender/?slot=top')
            .then((response) => response.json());
        const identity = await post('https://recs.s5o.ru/match/merge/', { id: 'fixture' });
        const functional = await post('/gql/graphql/', { operationName: 'FunctionalQuery' });
        const xhrTrackingOnly = await xhrPost('https://r.sports.ru/bandit/', {
            send_data: { interactions: [{ type: 'view' }] }
        });
        const xhrHybrid = await xhrPost('https://r.sports.ru/recommender/', {
            send_data: { interactions: [{ type: 'click' }] },
            return_data: { limit: 2 }
        });
        return {
            scriptSrc: script.src,
            imageSrc: image.src,
            banditBeacon,
            nativeBeaconCount: window.__sruMetrics.beacons,
            rum,
            trackingOnly,
            hybrid,
            returnOnly,
            getRecommendation,
            identity,
            functional,
            xhrTrackingOnly,
            xhrHybrid
        };
    });

    assert.match(result.scriptSrc, /^data:text\/javascript,/);
    assert.match(result.imageSrc, /^data:image\/gif;base64,/);
    assert.equal(result.banditBeacon, true);
    assert.equal(result.nativeBeaconCount, 0);
    assert.deepEqual(result.rum, { status: 204, body: '' });
    assert.deepEqual(result.trackingOnly, {});
    assert.deepEqual(result.hybrid, { ok: true });
    assert.deepEqual(result.returnOnly, { ok: true });
    assert.deepEqual(result.getRecommendation, { ok: true });
    assert.deepEqual(result.identity, {});
    assert.deepEqual(result.functional, { data: { ok: true } });
    assert.deepEqual(result.xhrTrackingOnly, {});
    assert.deepEqual(result.xhrHybrid, { ok: true });
    assert.equal(rumRequests, 0);
    assert.equal(recsTrackingRequests, 0);
    assert.equal(functionalGraphqlRequests, 1);
    assert.deepEqual(recommendationBodies, [
        { return_data: { limit: 5 }, context: { page: 'home' } },
        { return_data: { slot: 'top' } },
        'GET',
        { return_data: { limit: 2 } }
    ]);
    assert.deepEqual(JSON.parse((await getRootAttributes(page)).errors), []);
    await page.close();
});

test('overflow menus stay aligned and author profiles open in a new tab', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/profile/1090664296/?seed=1&author=1`);
    await page.waitForTimeout(250);

    assert.equal(await page.locator('.sru-clean-dark-card-menu-button').count(), 1);
    assert.equal(await page.locator('.sru-clean-dark-profile-menu-button').count(), 1);

    const buttons = await page.evaluate(() => {
        const readButton = (selector) => {
            const button = document.querySelector(selector);
            const glyph = button.querySelector('.sru-clean-dark-overflow-button__glyph');
            const buttonRect = button.getBoundingClientRect();
            const glyphRect = glyph.getBoundingClientRect();
            const style = getComputedStyle(button);
            return {
                width: buttonRect.width,
                height: buttonRect.height,
                borderRadius: style.borderRadius,
                fontFamily: style.fontFamily,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                lineHeight: style.lineHeight,
                letterSpacing: style.letterSpacing,
                glyph: glyph.textContent.trim(),
                centerDeltaX: Math.abs(
                    (buttonRect.left + buttonRect.right) / 2 - (glyphRect.left + glyphRect.right) / 2
                ),
                centerDeltaY: Math.abs(
                    (buttonRect.top + buttonRect.bottom) / 2 - (glyphRect.top + glyphRect.bottom) / 2
                ),
                glyphInside: glyphRect.left >= buttonRect.left - 1
                    && glyphRect.right <= buttonRect.right + 1
                    && glyphRect.top >= buttonRect.top - 1
                    && glyphRect.bottom <= buttonRect.bottom + 1,
                scrollOverflow: button.scrollWidth > button.clientWidth + 1
                    || button.scrollHeight > button.clientHeight + 1
            };
        };
        return {
            card: readButton('.sru-clean-dark-card-menu-button'),
            profile: readButton('.sru-clean-dark-profile-menu-button')
        };
    });

    for (const button of Object.values(buttons)) {
        assert.equal(button.width, 28);
        assert.equal(button.height, 28);
        assert.equal(button.borderRadius, '8px');
        assert.equal(button.fontSize, '20px');
        assert.equal(button.fontWeight, '700');
        assert.equal(button.lineHeight, '20px');
        assert.equal(button.letterSpacing, 'normal');
        assert.equal(button.glyph, '⋯');
        assert.ok(button.centerDeltaX <= 0.5);
        assert.ok(button.centerDeltaY <= 1.1);
        assert.equal(button.glyphInside, true);
        assert.equal(button.scrollOverflow, false);
    }
    assert.equal(buttons.card.fontFamily, buttons.profile.fontFamily);
    assert.equal(await page.locator('[data-sru-profile-action]').count(), 2);
    assert.equal(await page.locator('[data-sru-profile-action="comments"]').count(), 0);

    const readVisual = (selector) => page.locator(selector).evaluate((button) => {
        const style = getComputedStyle(button);
        return {
            background: style.backgroundColor,
            border: style.borderTopColor,
            color: style.color,
            shadow: style.boxShadow,
            filter: style.backdropFilter,
            transition: style.transitionDuration
        };
    });
    assert.deepEqual(await readVisual('.sru-clean-dark-card-menu-button'), {
        background: 'rgba(8, 12, 16, 0.48)',
        border: 'rgba(255, 255, 255, 0.24)',
        color: 'rgba(255, 255, 255, 0.92)',
        shadow: 'rgba(0, 0, 0, 0.22) 0px 2px 8px 0px',
        filter: 'blur(10px) saturate(1.15)',
        transition: '0.16s, 0.16s, 0.16s, 0.16s'
    });
    assert.deepEqual(await readVisual('.sru-clean-dark-profile-menu-button'), {
        background: 'rgba(55, 55, 55, 0.62)',
        border: 'rgba(155, 155, 155, 0.28)',
        color: 'rgb(216, 216, 216)',
        shadow: 'rgba(0, 0, 0, 0.18) 0px 2px 8px 0px',
        filter: 'blur(8px) saturate(1.1)',
        transition: '0.16s, 0.16s, 0.16s, 0.16s'
    });

    await page.hover('.sru-clean-dark-card-menu-button');
    await page.waitForTimeout(180);
    assert.deepEqual(await readVisual('.sru-clean-dark-card-menu-button'), {
        background: 'rgba(8, 12, 16, 0.66)',
        border: 'rgba(255, 255, 255, 0.44)',
        color: 'rgba(255, 255, 255, 0.92)',
        shadow: 'rgba(0, 0, 0, 0.28) 0px 4px 12px 0px',
        filter: 'blur(10px) saturate(1.15)',
        transition: '0.16s, 0.16s, 0.16s, 0.16s'
    });
    await page.hover('.sru-clean-dark-profile-menu-button');
    await page.waitForTimeout(180);
    assert.deepEqual(await readVisual('.sru-clean-dark-profile-menu-button'), {
        background: 'rgba(80, 80, 80, 0.82)',
        border: 'rgba(155, 155, 155, 0.48)',
        color: 'rgb(216, 216, 216)',
        shadow: 'rgba(0, 0, 0, 0.26) 0px 4px 12px 0px',
        filter: 'blur(8px) saturate(1.1)',
        transition: '0.16s, 0.16s, 0.16s, 0.16s'
    });

    await page.click('.sru-clean-dark-profile-menu-button');
    await page.waitForTimeout(180);
    assert.deepEqual(await readVisual('.sru-clean-dark-profile-menu-button'), {
        background: 'rgba(80, 80, 80, 0.92)',
        border: 'rgba(107, 188, 255, 0.72)',
        color: 'rgb(216, 216, 216)',
        shadow: 'rgba(0, 0, 0, 0.26) 0px 4px 12px 0px',
        filter: 'blur(8px) saturate(1.1)',
        transition: '0.16s, 0.16s, 0.16s, 0.16s'
    });
    const profileMenu = await page.evaluate(() => {
        const info = document.querySelector('.fixture-profile .info-block');
        const menu = document.querySelector('.sru-clean-dark-profile-menu');
        const infoRect = info.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        return {
            overflow: getComputedStyle(info).overflow,
            menuVisible: getComputedStyle(menu).display !== 'none',
            extendsPastContainer: menuRect.bottom > infoRect.bottom,
            profileTitleBorder: getComputedStyle(document.querySelector('.fixture-profile .big-title')).borderBottomColor,
            titleCount: menu.querySelectorAll('.sru-clean-dark-profile-menu-title').length,
            containsProfileName: menu.textContent.includes('Иван Ефимов')
        };
    });
    assert.deepEqual(profileMenu, {
        overflow: 'visible',
        menuVisible: true,
        extendsPastContainer: true,
        profileTitleBorder: 'rgb(80, 80, 80)',
        titleCount: 0,
        containsProfileName: false
    });

    await page.click('.sru-clean-dark-profile-menu-button');
    await page.click('.sru-clean-dark-card-menu-button');
    await page.waitForTimeout(180);
    assert.deepEqual(await readVisual('.sru-clean-dark-card-menu-button'), {
        background: 'rgba(8, 12, 16, 0.74)',
        border: 'rgba(107, 188, 255, 0.72)',
        color: 'rgba(255, 255, 255, 0.92)',
        shadow: 'rgba(0, 0, 0, 0.28) 0px 4px 12px 0px',
        filter: 'blur(10px) saturate(1.15)',
        transition: '0.16s, 0.16s, 0.16s, 0.16s'
    });
    await page.waitForSelector('.sru-clean-dark-card-menu-author-link');
    const authorLink = await page.evaluate(() => {
        const link = document.querySelector('.sru-clean-dark-card-menu-author-link');
        return {
            href: link.href,
            target: link.target,
            rel: link.rel,
            role: link.getAttribute('role'),
            text: link.textContent.trim(),
            label: link.getAttribute('aria-label')
        };
    });
    assert.deepEqual(authorLink, {
        href: 'https://www.sports.ru/profile/1090664296/',
        target: '_blank',
        rel: 'noopener noreferrer',
        role: 'menuitem',
        text: 'Иван Ефимов',
        label: 'Открыть профиль автора Иван Ефимов в новой вкладке'
    });

    assert.deepEqual(JSON.parse((await getRootAttributes(page)).errors), []);
    await page.close();

    const lightPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await lightPage.goto(`${origin}/profile/1090664296/?seed=1&author=1&theme=light`);
    await lightPage.waitForTimeout(100);
    assert.equal(
        await lightPage.locator('.fixture-profile .big-title').evaluate(
            (element) => getComputedStyle(element).borderBottomColor
        ),
        'rgb(216, 216, 216)'
    );
    assert.deepEqual(JSON.parse((await getRootAttributes(lightPage)).errors), []);
    await lightPage.close();
});

test('coauthored stories exclude commenters and hide only after all authors are blocked', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/tests/browser-fixture.html?seed=1&author=multi&cache=stale-scope&xhr-authors=multi`);
    await page.waitForTimeout(150);
    await page.click('.sru-clean-dark-card-menu-button');
    await page.waitForSelector('.sru-clean-dark-card-menu-author-row');

    const initialMenu = await page.evaluate(() => ({
        xhr: window.__sruMetrics.xhr,
        heading: document.querySelector('.sru-clean-dark-card-menu-author').textContent.trim(),
        authors: Array.from(document.querySelectorAll('.sru-clean-dark-card-menu-author-row')).map((row) => ({
            name: row.querySelector('.sru-clean-dark-card-menu-author-link').textContent.trim(),
            href: row.querySelector('.sru-clean-dark-card-menu-author-link').href,
            action: row.querySelector('.sru-clean-dark-card-menu-author-action').textContent.trim(),
            authorId: row.querySelector('.sru-clean-dark-card-menu-author-action').dataset.sruAuthorId,
            disabled: row.querySelector('.sru-clean-dark-card-menu-author-action').disabled
        })),
        bulk: document.querySelector('[data-sru-action="block-all-authors"]').textContent.trim(),
        bulkDisabled: document.querySelector('[data-sru-action="block-all-authors"]').disabled
    }));
    assert.deepEqual(initialMenu, {
        xhr: 1,
        heading: 'Авторы статьи (3)',
        authors: [
            {
                name: 'Вадим Лукомский',
                href: 'https://www.sports.ru/profile/3014310/',
                action: 'Скрыть статьи',
                authorId: '3014310',
                disabled: false
            },
            {
                name: 'Вячеслав Палагин',
                href: 'https://www.sports.ru/profile/74112501/',
                action: 'Скрыть статьи',
                authorId: '74112501',
                disabled: false
            },
            {
                name: 'Тимур Боков',
                href: 'https://www.sports.ru/profile/1068241957/',
                action: 'Скрыть статьи',
                authorId: '1068241957',
                disabled: false
            }
        ],
        bulk: 'Скрыть статьи всех авторов с главной',
        bulkDisabled: false
    });

    await page.click('[data-sru-author-id="3014310"]');
    await page.waitForTimeout(50);
    const afterOne = await page.evaluate(() => {
        const saved = window.__sruStore.get('sports-ru-clean-dark-state-v1');
        const card = document.querySelector('.super-top__article');
        return {
            blocked: Object.keys(saved.blockedTopAuthors),
            hiddenUrls: saved.hiddenTopUrls,
            cache: {
                complete: saved.authorCache['sports.ru/football/news/example.html'].complete,
                authorsVersion: saved.authorCache['sports.ru/football/news/example.html'].authorsVersion,
                authors: saved.authorCache['sports.ru/football/news/example.html'].authors.length
            },
            hidden: card.getAttribute('data-sru-clean-dark-hidden'),
            display: getComputedStyle(card).display
        };
    });
    assert.deepEqual(afterOne, {
        blocked: ['3014310'],
        hiddenUrls: [],
        cache: { complete: true, authorsVersion: 2, authors: 3 },
        hidden: 'false',
        display: 'block'
    });

    await page.click('.sru-clean-dark-card-menu-button');
    const partialMenu = await page.evaluate(() => ({
        actions: Array.from(document.querySelectorAll('.sru-clean-dark-card-menu-author-action')).map((button) => ({
            authorId: button.dataset.sruAuthorId,
            text: button.textContent.trim(),
            disabled: button.disabled
        })),
        bulk: document.querySelector('[data-sru-action="block-all-authors"]').textContent.trim()
    }));
    assert.deepEqual(partialMenu, {
        actions: [
            { authorId: '3014310', text: 'Уже скрыт', disabled: true },
            { authorId: '74112501', text: 'Скрыть статьи', disabled: false },
            { authorId: '1068241957', text: 'Скрыть статьи', disabled: false }
        ],
        bulk: 'Скрыть статьи остальных авторов с главной'
    });

    await page.click('[data-sru-action="block-all-authors"]');
    await page.waitForTimeout(50);
    const afterAll = await page.evaluate(() => {
        const saved = window.__sruStore.get('sports-ru-clean-dark-state-v1');
        const card = document.querySelector('.super-top__article');
        return {
            blocked: Object.keys(saved.blockedTopAuthors).sort(),
            hiddenUrls: saved.hiddenTopUrls,
            hidden: card.getAttribute('data-sru-clean-dark-hidden'),
            display: getComputedStyle(card).display
        };
    });
    assert.deepEqual(afterAll, {
        blocked: ['1068241957', '3014310', '74112501'],
        hiddenUrls: [],
        hidden: 'true',
        display: 'none'
    });
    assert.deepEqual(JSON.parse((await getRootAttributes(page)).errors), []);
    await page.close();

    const manualPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await manualPage.goto(`${origin}/tests/browser-fixture.html?seed=1&author=multi`);
    await manualPage.waitForTimeout(100);
    await manualPage.click('.sru-clean-dark-card-menu-button');
    await manualPage.click('[data-sru-action="hide"]');
    const manualState = await manualPage.evaluate(() => {
        const saved = window.__sruStore.get('sports-ru-clean-dark-state-v1');
        const card = document.querySelector('.super-top__article');
        return {
            blocked: Object.keys(saved.blockedTopAuthors),
            hiddenUrls: saved.hiddenTopUrls,
            hidden: card.getAttribute('data-sru-clean-dark-hidden'),
            display: getComputedStyle(card).display
        };
    });
    assert.deepEqual(manualState, {
        blocked: [],
        hiddenUrls: ['sports.ru/football/news/example.html'],
        hidden: 'true',
        display: 'none'
    });
    assert.deepEqual(JSON.parse((await getRootAttributes(manualPage)).errors), []);
    await manualPage.close();

    const partialPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await partialPage.goto(`${origin}/tests/browser-fixture.html?seed=1&author=multi&blocked-authors=first`);
    await partialPage.waitForTimeout(100);
    const partialState = await partialPage.evaluate(() => {
        const card = document.querySelector('.super-top__article');
        return {
            initial: document.documentElement.getAttribute('data-sru-fixture-initial-article-display'),
            hidden: card.getAttribute('data-sru-clean-dark-hidden'),
            display: getComputedStyle(card).display
        };
    });
    assert.deepEqual(partialState, { initial: 'block', hidden: 'false', display: 'block' });
    assert.deepEqual(JSON.parse((await getRootAttributes(partialPage)).errors), []);
    await partialPage.close();
});

test('persisted filters prepaint before the first observer scan and settings rerender once', {
    skip: playwrightLoadError ? `Playwright unavailable: ${playwrightLoadError.message}` : false
}, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/tests/browser-fixture.html?seed=1&theme=light&blocks=1&analytics=off`);
    await page.waitForTimeout(200);
    const rootAttributes = await getRootAttributes(page);
    const state = await page.evaluate(() => {
        const cards = document.querySelectorAll('.super-top__article');
        const matchRoot = document.querySelector('.main-teaser-container--common');
        return {
            theme: document.documentElement.getAttribute('data-sru-clean-dark-theme'),
            article: getComputedStyle(cards[0]).display,
            promo: getComputedStyle(cards[1]).display,
            ad: getComputedStyle(document.querySelector('.ad-slot')).display,
            adLabel: getComputedStyle(document.querySelector('.teaser-before-links__adv-label')).display,
            matchCenter: getComputedStyle(document.querySelector('.teaser-before-links__item')).display,
            visibleCount: document.querySelector('.super-top')?.getAttribute('data-sru-clean-dark-visible-count'),
            matchHeaderBackground: getComputedStyle(matchRoot.querySelector('.teaser-group__handle')).backgroundColor,
            matchIconBackground: getComputedStyle(matchRoot.querySelector('.accordion__icon-status')).backgroundColor,
            matchScoreBackground: getComputedStyle(matchRoot.querySelector('.teaser-event__board-score')).backgroundColor,
            matchTitleColor: getComputedStyle(matchRoot.querySelector('.accordion__title > a')).color
        };
    });

    assert.equal(rootAttributes.initialArticleDisplay, 'none');
    assert.equal(rootAttributes.initialPromoDisplay, 'none');
    assert.equal(rootAttributes.initialAdDisplay, 'none');
    assert.equal(rootAttributes.initialAdLabelDisplay, 'none');
    assert.deepEqual(state, {
        theme: 'light',
        article: 'none',
        promo: 'none',
        ad: 'none',
        adLabel: 'none',
        matchCenter: 'inline',
        visibleCount: '0',
        matchHeaderBackground: 'rgb(243, 243, 239)',
        matchIconBackground: 'rgb(255, 255, 255)',
        matchScoreBackground: 'rgb(243, 243, 239)',
        matchTitleColor: 'rgb(78, 78, 78)'
    });

    await page.click('.sru-clean-dark-settings-toggle');
    assert.equal(await page.locator('[data-sru-settings-comment-user-list]').count(), 0);
    assert.equal(await page.locator('[data-sru-settings-action="unblock-comment-user"], [data-sru-settings-action="unblock-all-comment-users"]').count(), 0);
    const analyticsToggle = page.locator('[data-sru-settings-action="toggle-analytics-blocking"]');
    assert.equal(await analyticsToggle.getAttribute('role'), 'switch');
    assert.equal(await analyticsToggle.getAttribute('aria-checked'), 'false');
    assert.deepEqual(await getSettingsSwitchStyles(page, 'toggle-analytics-blocking'), {
        checked: 'false',
        trackBackground: 'rgb(223, 228, 232)',
        trackShadow: 'none',
        thumbBackground: 'rgb(155, 155, 155)',
        thumbShadow: 'none'
    });

    let before = readCalls(await getRootAttributes(page)).renderSettingsDialog;
    await page.click('[data-sru-settings-action="unblock-site-author"]');
    await page.waitForTimeout(50);
    let after = readCalls(await getRootAttributes(page)).renderSettingsDialog;
    assert.equal(after - before, 1);

    before = after;
    await analyticsToggle.click();
    await page.waitForTimeout(300);
    after = readCalls(await getRootAttributes(page)).renderSettingsDialog;
    assert.equal(after - before, 1);
    const analyticsState = await page.evaluate(() => {
        const saved = window.__sruStore.get('sports-ru-clean-dark-state-v1');
        return {
            enabled: saved.analyticsBlockingEnabled,
            ads: saved.adBlockingEnabled,
            promos: saved.hidePromosEnabled,
            checked: document.querySelector('[data-sru-settings-action="toggle-analytics-blocking"]')
                ?.getAttribute('aria-checked')
        };
    });
    assert.deepEqual(analyticsState, { enabled: true, ads: true, promos: true, checked: 'true' });
    assert.deepEqual(await getSettingsSwitchStyles(page, 'toggle-analytics-blocking'), {
        checked: 'true',
        trackBackground: 'rgb(223, 228, 232)',
        trackShadow: 'none',
        thumbBackground: 'rgb(0, 168, 118)',
        thumbShadow: 'none'
    });
    assert.deepEqual(JSON.parse((await getRootAttributes(page)).errors), []);
    await page.close();
});
