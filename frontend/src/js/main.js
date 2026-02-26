/**
 * Catalog – Frontend App
 * jQuery + WPGraphQL Subscriptions (GraphQL-SSE) + JWT Authentication
 *
 * Flow:
 *  1. On load → check localStorage for JWT token.
 *  2. Fetch catalogItems via GraphQL (with auth header if logged in).
 *  3. GraphQL server resolves correct price and hides Set B for guests.
 *  4. Subscribe to real-time updates via SSE (catalog item changes).
 *  5. Render cards. Set B section shows only when logged in.
 */

(function ($) {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────────────
    const WP_BASE = 'http://localhost:8080'; // Hey!!! Web must be changed for production #fgs-production-note (tag for myself xD)
    const GQL_ENDPOINT = WP_BASE + '/graphql';
    const SSE_ENDPOINT = WP_BASE + '/graphql/stream';
    const TOKEN_KEY = 'catalog_jwt';
    const REFRESH_TOKEN_KEY = 'catalog_refresh_jwt';

    // ── State ─────────────────────────────────────────────────────────────────
    let isLoggedIn = false;
    let authToken = null;
    let sseToken = null;
    let refreshingPromise = null; // single in-flight refresh
    let eventSource = null;
    let catalogItemsA = [];
    let catalogItemsB = [];

    // Independent pagination state for each set
    let stateA = {
        currentPage: 1,
        cursorHistory: [],
        after: null,
        first: 6,
        pageInfo: { hasNextPage: false, startCursor: null, endCursor: null }
    };
    let stateB = {
        currentPage: 1,
        cursorHistory: [],
        after: null,
        first: 6,
        pageInfo: { hasNextPage: false, startCursor: null, endCursor: null }
    };

    // Independent filters per set
    let filtersA = {
        search: '',
        category: ''
    };
    let filtersB = {
        search: '',
        category: ''
    };

    //#region Helpers
    // ── Helpers ───────────────────────────────────────────────────────────────
    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function setToken(t) {
        localStorage.setItem(TOKEN_KEY, t);
    }

    function removeToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    function getRefreshToken() {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }

    function setRefreshToken(t) {
        localStorage.setItem(REFRESH_TOKEN_KEY, t);
    }

    function removeRefreshToken() {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    }

    function decodeJwtPayload(token) {
        try {
            const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(atob(base64));
        } catch (e) { return null; }
    }

    function isTokenExpired(token) {
        const payload = decodeJwtPayload(token);
        if (!payload || !payload.exp) return true;
        return Date.now() / 1000 > payload.exp;
    }


    //#region Shared helpers
    function parseAttrs(item) {
        try { return item.itemAttributes ? JSON.parse(item.itemAttributes) : {}; }
        catch (e) { return {}; }
    }

    const DEFAULT_MAPPING = {
        preset: 'default', header: 'title', subtitle: '',
        badges: '', show_price: true, show_image: true, show_description: true
    };

    function getItemConfig(item) {
        try {
            const raw = item.displayMapping ? JSON.parse(item.displayMapping) : {};
            return { ...DEFAULT_MAPPING, ...raw };
        } catch (e) { return { ...DEFAULT_MAPPING }; }
    }

    function thumbHtml(item, cfg) {
        if (!cfg.show_image) return '';
        const img = item.featuredImage?.node;
        if (!img?.sourceUrl) return '<div class="catalog-card__thumb-placeholder">🖼️</div>';

        return `
            <img 
                class="catalog-card__thumb" 
                src="${img.sourceUrl}" 
                srcset="${img.srcSet || ''}" 
                sizes="${img.sizes || '(max-width: 768px) 100vw, 33vw'}" 
                alt="${img.altText || item.title}"
                loading="lazy"
            >`;
    }

    function badgeHtml(item) {
        if (item.badge) return `<span class="catalog-card__badge">${item.badge}</span>`;
        if (item.cardSet === 'B') return `<span class="catalog-card__badge">Member</span>`;
        return '';
    }

    function categoryHtml(item) {
        return item.itemCategory
            ? `<span class="catalog-card__category">${item.itemCategory}</span>`
            : '';
    }

    function descHtml(item, cfg) {
        if (!cfg.show_description) return '';
        return item.content
            ? `<p class="catalog-card__desc">${$('<div>').html(item.content).text().substring(0, 100)}…</p>`
            : '';
    }

    function priceHtml(item, size, cfg) {
        if (!cfg.show_price || !item.price) return '';
        const isSetB = item.cardSet === 'B';
        const label = isSetB ? 'Member' : 'From';
        const cls = size === 'lg' ? 'catalog-card__price catalog-card__price--lg' : 'catalog-card__price';
        return `<div class="${cls}"><span class="catalog-card__price-label">${label}</span>$${parseFloat(item.price).toFixed(2)}</div>`;
    }

    // Render attribute keys as pill badges (from item config)
    function attrBadgesHtml(item, cfg) {
        const badgeKeys = (cfg.badges || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!badgeKeys.length) return '';
        const attrs = parseAttrs(item);
        return badgeKeys
            .filter(k => attrs[k] !== undefined)
            .map(k => `<span class="catalog-card__attr-badge">${k}: ${attrs[k]}</span>`)
            .join('');
    }

    // Full attributes grid (for specs_first)
    function attrsGridHtml(item) {
        const attrs = parseAttrs(item);
        const keys = Object.keys(attrs);
        if (!keys.length) return '';
        const items = keys.slice(0, 4).map(k =>
            `<div class="catalog-card__attr"><span class="catalog-card__attr-key">${k}</span><span class="catalog-card__attr-val">${attrs[k]}</span></div>`
        ).join('');
        return `<div class="catalog-card__attrs">${items}</div>`;
    }

    // Resolve which value to show for a named slot (header / subtitle)
    function resolveField(item, fieldName) {
        if (!fieldName) return '';
        switch (fieldName) {
            case 'title': return item.title || '';
            case 'price': return item.price ? `$${parseFloat(item.price).toFixed(2)}` : '';
            case 'category': return item.itemCategory || '';
            default: return '';
        }
    }

    function cardClasses(item, cfg) {
        return [
            'catalog-card',
            `catalog-card--${cfg.preset}`,
            item.cardSet === 'B' ? 'catalog-card--set-b' : '',
        ].filter(Boolean).join(' ');
    }

    // ── Token lifecycle helpers ────────────────────────────────────────────

    /**
     * Returns true when the auth token will expire within `marginSec` seconds.
     */
    function tokenExpiresSoon(token, marginSec = 60) {
        const payload = decodeJwtPayload(token);
        if (!payload || !payload.exp) return true;
        return Date.now() / 1000 > payload.exp - marginSec;
    }

    /**
     * Use the stored refresh token to obtain a fresh auth token.
     * Returns a Promise that resolves to the new authToken or null on failure.
     * Multiple concurrent callers share a single in-flight request.
     */
    function refreshAuthToken() {
        if (refreshingPromise) return refreshingPromise;

        const rt = getRefreshToken();
        if (!rt) return Promise.resolve(null);

        refreshingPromise = $.ajax({
            url: GQL_ENDPOINT,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                query: REFRESH_MUTATION,
                variables: { jwtRefreshToken: rt }
            }),
        }).then(function (resp) {
            const newToken = resp?.data?.refreshJwtAuthToken?.authToken;
            if (newToken) {
                authToken = newToken;
                setToken(newToken);
                isLoggedIn = true;
                console.log('[Auth] Token refreshed successfully');
                return newToken;
            }
            console.warn('[Auth] Refresh response did not contain a new token');
            return null;
        }).catch(function (err) {
            console.error('[Auth] Token refresh failed:', err.statusText || err);
            return null;
        }).always(function () {
            refreshingPromise = null;
        });

        return refreshingPromise;
    }

    /**
     * Ensure we have a valid, non-expired auth token before making a request.
     * If the current token is about to expire, refresh it transparently.
     * Returns a Promise that resolves when the token state is up-to-date.
     */
    function ensureValidToken() {
        if (!authToken) return Promise.resolve();

        if (isTokenExpired(authToken)) {
            console.log('[Auth] Token expired — attempting refresh');
            return refreshAuthToken().then(function (newToken) {
                if (!newToken) {
                    handleSessionExpired();
                }
            });
        }

        if (tokenExpiresSoon(authToken, 120)) {
            // Refresh proactively but don't block the request
            refreshAuthToken();
        }

        return Promise.resolve();
    }

    /**
     * Called when both authToken and refreshToken are invalid.
     * Logs out the user and shows a toast / console message.
     */
    function handleSessionExpired() {
        console.warn('[Auth] Session expired — logging out');
        removeToken();
        removeRefreshToken();
        authToken = null;
        isLoggedIn = false;
        stopSubscription();
        stopPolling();
        resetPagStateObj(stateA);
        resetPagStateObj(stateB);
        updateAuthUI();
        renderSetB([]);
        loadSetA();
        showToast('Your session has expired. Please log in again.');
    }

    /**
     * Minimal ephemeral toast notification.
     */
    function showToast(message, duration = 4000) {
        const $toast = $('<div class="toast-msg"></div>').text(message);
        $('body').append($toast);
        setTimeout(() => $toast.addClass('toast-msg--visible'), 10);
        setTimeout(() => {
            $toast.removeClass('toast-msg--visible');
            setTimeout(() => $toast.remove(), 400);
        }, duration);
    }

    //#endregion Helpers

    //#region GraphQL Fetch
    // ── GraphQL Fetch (HTTP – queries & mutations) ───────────────────────────

    /**
     * Core GraphQL fetch with automatic token validation & retry.
     * 1. Before each request, ensures the auth token is valid / refreshed.
     * 2. On auth-related GraphQL errors, retries once after refreshing.
     */
    function gqlFetch(query, variables = {}) {
        return ensureValidToken().then(function () {
            return _gqlRaw(query, variables);
        }).then(function (resp) {
            // Check for auth-related GraphQL errors (e.g. "invalid-secret-key" or "expired-token")
            if (hasAuthError(resp) && getRefreshToken()) {
                return refreshAuthToken().then(function (newToken) {
                    if (newToken) {
                        return _gqlRaw(query, variables);
                    }
                    handleSessionExpired();
                    return resp; // return original error response
                });
            }
            return resp;
        });
    }

    /** Low-level GraphQL POST — no token validation. */
    function _gqlRaw(query, variables) {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        return $.ajax({
            url: GQL_ENDPOINT,
            method: 'POST',
            contentType: 'application/json',
            headers: headers,
            data: JSON.stringify({ query, variables }),
        });
    }

    /** Detect authentication / authorization errors in a GraphQL response. */
    function hasAuthError(resp) {
        if (!resp || !resp.errors) return false;
        return resp.errors.some(function (e) {
            const msg = (e.message || '').toLowerCase();
            const cat = (e.extensions?.category || '').toLowerCase();
            return msg.includes('expired') || msg.includes('invalid-secret-key')
                || msg.includes('not allowed') || cat === 'authentication'
                || cat === 'authorization' || msg.includes('invalid token');
        });
    }

    // ── GraphQL Queries ──────────────────────────────────────────────────────
    const CATALOG_QUERY = `
    query GetCatalogItems($first: Int, $after: String, $last: Int, $before: String, $search: String, $category: String, $cardSet: String) {
      catalogItems(
        first: $first, 
        after: $after, 
        last: $last, 
        before: $before, 
        where: { search: $search, category: $category, cardSet: $cardSet }
      ) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        nodes {
          databaseId
          title
          content
          cardSet
          price
          badge
          itemCategory
          itemAttributes
          displayMapping
          featuredImage {
            node { 
              sourceUrl 
              altText 
              srcSet
              sizes
            }
          }
        }
      }
    }
    `;

    const LOGIN_MUTATION = `
    mutation Login($username: String!, $password: String!) {
      login(input: { username: $username, password: $password }) {
        authToken
        refreshToken
        user { name email }
      }
    }
    `;

    const REFRESH_MUTATION = `
    mutation RefreshToken($jwtRefreshToken: String!) {
      refreshJwtAuthToken(input: { jwtRefreshToken: $jwtRefreshToken }) {
        authToken
      }
    }
    `;

    // ── GraphQL-SSE Subscription (catalog_item changes) ─────────────────────
    // Uses the graphql-sse protocol from wp-graphql-subscriptions:
    //   1. PUT  /graphql/stream         → get a connection token
    //   2. POST /graphql/stream         → register subscription query
    //   3. GET  /graphql/stream?token=  → SSE event stream

    const CATALOG_SUBSCRIPTION = `
    subscription OnCatalogItemUpdated {
      catalogItemUpdated {
        databaseId
        title
        content
        cardSet
        price
        badge
        displayMapping
        featuredImage {
          node { 
            sourceUrl 
            altText 
            srcSet
            sizes
          }
        }
      }
    }
    `;

    async function startSubscription() {
        try {
            // 1. Reserve a connection token
            const headers = {};
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
            }

            const reserveResponse = await fetch(SSE_ENDPOINT, {
                method: 'PUT',
                headers: headers,
            });

            if (!reserveResponse.ok) {
                console.warn('[SSE] Reservation failed:', reserveResponse.status,
                    '— subscriptions may not be available');
                return;
            }

            sseToken = await reserveResponse.text();
            console.log('[SSE] Token acquired');

            // 2. Register the subscription query
            const subHeaders = {
                'Content-Type': 'application/json',
                'X-GraphQL-Event-Stream-Token': sseToken,
            };
            if (authToken) subHeaders['Authorization'] = `Bearer ${authToken}`;

            const subResponse = await fetch(SSE_ENDPOINT, {
                method: 'POST',
                headers: subHeaders,
                body: JSON.stringify({
                    query: CATALOG_SUBSCRIPTION,
                    extensions: { operationId: 'catalog-live-' + Date.now() },
                }),
            });

            if (!subResponse.ok) {
                console.warn('[SSE] Subscription registration failed:', subResponse.status);
                return;
            }

            console.log('[SSE] Subscription registered');

            // 3. Open the SSE stream
            if (eventSource) eventSource.close();
            eventSource = new EventSource(`${SSE_ENDPOINT}?token=${sseToken}`);

            eventSource.addEventListener('next', function (event) {
                try {
                    const payload = JSON.parse(event.data);
                    const updated = payload?.payload?.data?.catalogItemUpdated;
                    if (updated) {
                        console.log('[SSE] Item updated:', updated.title);
                        handleItemUpdate(updated);
                    }
                } catch (e) {
                    console.error('[SSE] Parse error:', e);
                }
            });

            eventSource.addEventListener('test', function (event) {
                console.log('[SSE] Test event received:', JSON.parse(event.data));
            });

            eventSource.onerror = function () {
                console.warn('[SSE] Connection lost – will retry in 5s');
                eventSource.close();
                eventSource = null;
                setTimeout(startSubscription, 5000);
            };

            console.log('[SSE] Stream connected ✓');
        } catch (err) {
            console.log(err);
            console.warn('[SSE] Setup error (plugin may not be active):', err.message);
        }
    }

    function stopSubscription() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
            console.log('[SSE] Stream closed');
        }
    }

    // ── Handle live item updates ─────────────────────────────────────────────
    function handleItemUpdate(updated) {
        // Reload the affected set to get fresh server-paginated data
        const set = updated.cardSet || 'A';
        if (set === 'B') {
            loadSetB();
        } else {
            loadSetA();
        }

        // Flash animation on the updated card (after re-render)
        setTimeout(() => {
            const $card = $(`.catalog-card[data-id="${updated.databaseId}"]`);
            if ($card.length) {
                $card.addClass('catalog-card--flash');
                setTimeout(() => $card.removeClass('catalog-card--flash'), 1200);
            }
        }, 200);
    }

    //#endregion GraphQL Fetch

    // ── Single rule-driven card renderer ───────────────────────────────────
    function renderCard(item) {
        const cfg = getItemConfig(item);
        const isSetB = item.cardSet === 'B';
        const preset = cfg.preset;

        const headerText = resolveField(item, cfg.header);
        const subtitleText = resolveField(item, cfg.subtitle);

        const subtitleEl = subtitleText
            ? `<p class="catalog-card__subtitle">${subtitleText}</p>`
            : '';

        if (preset === 'price_first') {
            return `
          <div class="col">
          <div class="${cardClasses(item, cfg)}" data-id="${item.databaseId}" data-set="${item.cardSet}">
            <div class="catalog-card__body">
              <div class="catalog-card__meta-row">
                ${categoryHtml(item)}
                ${badgeHtml(item)}
                ${attrBadgesHtml(item, cfg)}
              </div>
              ${priceHtml(item, 'lg', cfg)}
              <h3 class="catalog-card__title">${headerText}</h3>
              ${subtitleEl}
              ${attrsGridHtml(item)}
            </div>
            ${thumbHtml(item, cfg)}
          </div>
          </div>`;
        }

        if (preset === 'specs_first') {
            return `
          <div class="col">
          <div class="${cardClasses(item, cfg)}" data-id="${item.databaseId}" data-set="${item.cardSet}">
            <div class="catalog-card__body">
              ${attrsGridHtml(item)}
              <div class="catalog-card__meta-row">
                ${categoryHtml(item)}
                ${badgeHtml(item)}
                ${attrBadgesHtml(item, cfg)}
              </div>
              <h3 class="catalog-card__title">${headerText}</h3>
              ${subtitleEl}
              ${descHtml(item, cfg)}
            </div>
          </div>
          </div>`;
        }

        // Default
        return `
      <div class="col">
      <div class="${cardClasses(item, cfg)}" data-id="${item.databaseId}" data-set="${item.cardSet}">
        ${thumbHtml(item, cfg)}
        <div class="catalog-card__body">
          <div class="catalog-card__meta-row">
            ${categoryHtml(item)}
            ${badgeHtml(item)}
            ${attrBadgesHtml(item, cfg)}
          </div>
          <h3 class="catalog-card__title">${headerText}</h3>
          ${subtitleEl}
          ${descHtml(item, cfg)}
        </div>
      </div>
      </div>`;
    }

    // ── SEO: Structured Data (JSON-LD) ───────────────────────────────────────
    /**
     * Updates the JSON-LD script tag with an ItemList containing Product entities.
     * This combines Set A and Set B items currently in state.
     */
    function updateCatalogSchema() {
        const allItems = [...catalogItemsA, ...catalogItemsB];
        if (!allItems.length) return;

        const itemList = {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "numberOfItems": allItems.length,
            "itemListElement": allItems.map((item, index) => {
                const cfg = getItemConfig ? getItemConfig(item) : {};
                return {
                    "@type": "ListItem",
                    "position": index + 1,
                    "item": {
                        "@type": "Product",
                        "name": item.title,
                        "description": item.content ? $('<div>').html(item.content).text().substring(0, 160) : "",
                        "image": item.featuredImage?.node?.sourceUrl || "",
                        "category": item.itemCategory || "",
                        "offers": {
                            "@type": "Offer",
                            "price": item.price || "0.00",
                            "priceCurrency": "USD",
                            "availability": "https://schema.org/InStock"
                        }
                    }
                };
            })
        };

        $('#catalog-schema').text(JSON.stringify(itemList, null, 2));
    }

    // ── Skeleton Loaders ─────────────────────────────────────────────────────
    function renderSkeletons(container, count = 6) {
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
        <div class="col">
        <div class="skeleton-card">
          <div class="skel-thumb"></div>
          <div class="skel-body">
            <div class="skel-line" style="width:40%;height:8px"></div>
            <div class="skel-line"></div>
            <div class="skel-line" style="width:75%"></div>
            <div class="skel-line-sm"></div>
          </div>
        </div>
        </div>`;
        }
        container.html(html);
    }

    // ── Render Catalog ───────────────────────────────────────────────────────
    function renderSetA(items) {
        const $setA = $('#set-a-grid');
        // Safety: only render items that are NOT Set B
        const safeItems = items.filter(i => i.cardSet !== 'B');
        if (safeItems.length) {
            console.log(items);
            $setA.html(safeItems.map(renderCard).join(''));
        } else {
            $setA.html('<div class="col-12"><p style="color:var(--text-muted)">No items matched your criteria.</p></div>');
        }
        updatePaginationUI('a', stateA);
        updateCatalogSchema();
    }

    function renderSetB(items) {
        const $setBSection = $('#set-b-section');
        const $setB = $('#set-b-grid');
        const $authGate = $('#auth-gate');
        const $filterBarB = $('#filter-bar-b');

        if (isLoggedIn) {
            // Safety: only render items that ARE Set B
            const safeItems = items.filter(i => i.cardSet === 'B');
            $setBSection.show();
            $authGate.hide();
            $filterBarB.show();
            if (safeItems.length) {
                $setB.html(safeItems.map(renderCard).join(''));
            } else {
                $setB.html('<div class="col-12"><p style="color:var(--text-muted)">No matching member-exclusive items.</p></div>');
            }
            updatePaginationUI('b', stateB);
            updateCatalogSchema();
        } else {
            // Guest: hide everything in Set B section
            $setBSection.hide();
            $filterBarB.hide();
            $setB.html('');
            $('#pagination-b').hide();
        }
    }

    function updatePaginationUI(suffix, state) {
        const hasPrev = state.currentPage > 1;
        const hasNext = state.pageInfo.hasNextPage;
        const showPag = hasPrev || hasNext;

        $(`#pagination-${suffix}`).toggle(showPag);
        $(`#btn-prev-${suffix}`).prop('disabled', !hasPrev);
        $(`#btn-next-${suffix}`).prop('disabled', !hasNext);

        if (showPag) {
            $(`#page-info-${suffix}`).text('Page ' + state.currentPage);
        } else {
            $(`#page-info-${suffix}`).text('');
        }
    }

    // ── Load Catalog (separate queries for Set A and Set B) ────────────────
    let pollTimer = null;

    function buildQueryVars(state, cardSet) {
        const f = cardSet === 'B' ? filtersB : filtersA;
        return {
            first: state.first,
            after: state.after || null,
            last: null,
            before: null,
            search: f.search || null,
            category: f.category || null,
            cardSet: cardSet
        };
    }

    function loadSetA() {
        const $setA = $('#set-a-grid');
        renderSkeletons($setA, 3);

        gqlFetch(CATALOG_QUERY, buildQueryVars(stateA, 'A'))
            .then(function (resp) {
                if (resp.errors) {
                    console.error('GraphQL errors (Set A):', resp.errors);
                    $setA.html('<p style="color:#ef9a9a">Failed to load catalog. Is WordPress running?</p>');
                    return;
                }
                const data = resp.data?.catalogItems;
                catalogItemsA = data?.nodes || [];
                stateA.pageInfo = data?.pageInfo || stateA.pageInfo;
                renderSetA(catalogItemsA);
            })
            .catch(function (xhr) {
                console.error('Request failed (Set A):', xhr.statusText);
                $setA.html('<p style="color:#ef9a9a">Could not connect to WordPress.</p>');
            });
    }

    function loadSetB() {
        if (!isLoggedIn) {
            renderSetB([]);
            return;
        }
        const $setB = $('#set-b-grid');
        renderSkeletons($setB, 3);

        gqlFetch(CATALOG_QUERY, buildQueryVars(stateB, 'B'))
            .then(function (resp) {
                if (resp.errors) {
                    console.error('GraphQL errors (Set B):', resp.errors);
                    return;
                }
                const data = resp.data?.catalogItems;
                catalogItemsB = data?.nodes || [];
                stateB.pageInfo = data?.pageInfo || stateB.pageInfo;
                renderSetB(catalogItemsB);
            })
            .catch(function (xhr) {
                console.error('Request failed (Set B):', xhr.statusText);
            });
    }

    function loadCatalog() {
        loadSetA();
        loadSetB();

        // Start real-time subscription (SSE) - only once
        if (!eventSource) startSubscription();

        // Start polling fallback
        startPolling();
    }

    // Polling fallback — poll each set independently
    function startPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(function () {
            // Poll Set A
            gqlFetch(CATALOG_QUERY, buildQueryVars(stateA, 'A')).then(function (resp) {
                if (resp.errors) return;
                const data = resp.data?.catalogItems;
                const newItems = data?.nodes || [];
                const newPageInfo = data?.pageInfo || stateA.pageInfo;

                const changed = JSON.stringify(catalogItemsA) !== JSON.stringify(newItems)
                    || JSON.stringify(stateA.pageInfo) !== JSON.stringify(newPageInfo);

                if (changed) {
                    const changedIds = newItems.filter(item => {
                        const old = catalogItemsA.find(o => o.databaseId === item.databaseId);
                        return !old || JSON.stringify(old) !== JSON.stringify(item);
                    }).map(i => i.databaseId);

                    catalogItemsA = newItems;
                    stateA.pageInfo = newPageInfo;
                    renderSetA(catalogItemsA);
                    flashCards(changedIds);
                    if (changedIds.length) console.log('[Poll] Set A items updated:', changedIds);
                }
            });

            // Poll Set B (only if logged in)
            if (!isLoggedIn) return;
            gqlFetch(CATALOG_QUERY, buildQueryVars(stateB, 'B')).then(function (resp) {
                if (resp.errors) return;
                const data = resp.data?.catalogItems;
                const newItems = data?.nodes || [];
                const newPageInfo = data?.pageInfo || stateB.pageInfo;

                const changed = JSON.stringify(catalogItemsB) !== JSON.stringify(newItems)
                    || JSON.stringify(stateB.pageInfo) !== JSON.stringify(newPageInfo);

                if (changed) {
                    const changedIds = newItems.filter(item => {
                        const old = catalogItemsB.find(o => o.databaseId === item.databaseId);
                        return !old || JSON.stringify(old) !== JSON.stringify(item);
                    }).map(i => i.databaseId);

                    catalogItemsB = newItems;
                    stateB.pageInfo = newPageInfo;
                    renderSetB(catalogItemsB);
                    flashCards(changedIds);
                    if (changedIds.length) console.log('[Poll] Set B items updated:', changedIds);
                }
            });
        }, 5000);
    }

    function flashCards(ids) {
        ids.forEach(function (id) {
            const $card = $(`.catalog-card[data-id="${id}"]`);
            if ($card.length) {
                $card.addClass('catalog-card--flash');
                setTimeout(() => $card.removeClass('catalog-card--flash'), 1200);
            }
        });
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // ── Update UI State ──────────────────────────────────────────────────────
    function updateAuthUI() {
        if (isLoggedIn) {
            $('#btn-login').hide();
            $('#btn-logout').show();
            $('#user-greeting').show();
        } else {
            $('#btn-login').show();
            $('#btn-logout').hide();
            $('#user-greeting').hide();
        }
    }

    // ── Logout ───────────────────────────────────────────────────────────────
    function logout() {
        removeToken();
        removeRefreshToken();
        authToken = null;
        isLoggedIn = false;
        stopSubscription();
        stopPolling();
        // Reset pagination state for both sets
        resetPagStateObj(stateA);
        resetPagStateObj(stateB);
        updateAuthUI();
        loadCatalog();
    }

    function resetPagStateObj(state) {
        state.after = null;
        state.first = 6;
        state.currentPage = 1;
        state.cursorHistory = [];
    }

    // ── Periodic token health check ───────────────────────────────────────
    let tokenCheckTimer = null;

    function startTokenHealthCheck() {
        if (tokenCheckTimer) clearInterval(tokenCheckTimer);
        tokenCheckTimer = setInterval(function () {
            if (!authToken) return;

            if (isTokenExpired(authToken)) {
                console.log('[Auth] Periodic check: token expired');
                refreshAuthToken().then(function (newToken) {
                    if (!newToken) handleSessionExpired();
                });
            } else if (tokenExpiresSoon(authToken, 120)) {
                console.log('[Auth] Periodic check: token expires soon — refreshing');
                refreshAuthToken();
            }
        }, 30000); // check every 30 seconds
    }

    function stopTokenHealthCheck() {
        if (tokenCheckTimer) {
            clearInterval(tokenCheckTimer);
            tokenCheckTimer = null;
        }
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    function init() {
        const token = getToken();
        if (token && !isTokenExpired(token)) {
            authToken = token;
            isLoggedIn = true;
            const payload = decodeJwtPayload(token);
            if (payload?.data?.user?.nicename || payload?.user?.name) {
                const name = payload?.user?.name || payload?.data?.user?.nicename || 'User';
                $('#user-greeting strong').text(name);
            }
        } else if (token && isTokenExpired(token)) {
            // Auth token expired — try the refresh token
            const rt = getRefreshToken();
            if (rt) {
                console.log('[Auth] Stored token expired — attempting silent refresh');
                refreshAuthToken().then(function (newToken) {
                    if (newToken) {
                        const payload = decodeJwtPayload(newToken);
                        const name = payload?.user?.name || payload?.data?.user?.nicename || 'User';
                        $('#user-greeting strong').text(name);
                        updateAuthUI();
                        loadCatalog();
                        startTokenHealthCheck();
                    } else {
                        removeToken();
                        removeRefreshToken();
                        updateAuthUI();
                        loadCatalog();
                    }
                });
                return; // async path — don't fall through
            } else {
                removeToken();
            }
        } else {
            removeToken();
        }

        updateAuthUI();

        // Only run catalog logic on index page
        if ($('#set-a-grid').length) {
            loadCatalog();
        }

        // Start periodic token health check if logged in
        if (isLoggedIn) startTokenHealthCheck();

        // Logout button
        $('#btn-logout').on('click', function (e) {
            e.preventDefault();
            logout();
        });

        // ── Input Event Handlers (Set A) ──────────────────────────────────────
        let searchDebounceA = null;
        $('#catalog-search').on('input', function () {
            clearTimeout(searchDebounceA);
            searchDebounceA = setTimeout(() => {
                filtersA.search = $(this).val();
                resetPagStateObj(stateA);
                loadSetA();
            }, 400);
        });

        $('#catalog-category').on('change', function () {
            filtersA.category = $(this).val();
            resetPagStateObj(stateA);
            loadSetA();
        });

        // ── Input Event Handlers (Set B) ──────────────────────────────────────
        let searchDebounceB = null;
        $('#catalog-search-b').on('input', function () {
            clearTimeout(searchDebounceB);
            searchDebounceB = setTimeout(() => {
                filtersB.search = $(this).val();
                resetPagStateObj(stateB);
                loadSetB();
            }, 400);
        });

        $('#catalog-category-b').on('change', function () {
            filtersB.category = $(this).val();
            resetPagStateObj(stateB);
            loadSetB();
        });

        // ── Pagination Click Handlers ──────────────────────────────────────────
        function goNext(state, loadFn) {
            if (!state.pageInfo.hasNextPage) return;
            state.cursorHistory.push(state.after);
            state.after = state.pageInfo.endCursor;
            state.first = 6;
            state.currentPage++;
            loadFn();
        }

        function goPrev(state, loadFn) {
            if (state.currentPage <= 1) return;
            state.after = state.cursorHistory.pop() || null;
            state.first = 6;
            state.currentPage--;
            loadFn();
        }

        $(document).on('click', '#btn-next-a', function () {
            goNext(stateA, loadSetA);
            window.scrollTo({ top: $('.filter-bar').offset().top - 100, behavior: 'smooth' });
        });
        $(document).on('click', '#btn-prev-a', function () {
            goPrev(stateA, loadSetA);
            window.scrollTo({ top: $('.filter-bar').offset().top - 100, behavior: 'smooth' });
        });
        $(document).on('click', '#btn-next-b', function () {
            goNext(stateB, loadSetB);
            window.scrollTo({ top: $('#set-b-section').offset().top - 100, behavior: 'smooth' });
        });
        $(document).on('click', '#btn-prev-b', function () {
            goPrev(stateB, loadSetB);
            window.scrollTo({ top: $('#set-b-section').offset().top - 100, behavior: 'smooth' });
        });


        // ── Login Form (login.html) ──────────────────────────────────────────
        $('#login-form').on('submit', function (e) {
            e.preventDefault();
            const $btn = $(this).find('button[type=submit]');
            const $msg = $('#login-msg');
            const username = $('#username').val().trim();
            const password = $('#password').val();

            $msg.removeClass('error success').hide();
            $btn.prop('disabled', true).text('Logging in…');

            gqlFetch(LOGIN_MUTATION, { username, password })
                .then(function (resp) {
                    if (resp.errors) {
                        $msg.addClass('error').text(resp.errors[0].message).show();
                        return;
                    }
                    const data = resp.data?.login;
                    if (!data?.authToken) {
                        $msg.addClass('error').text('Login failed – invalid credentials.').show();
                        return;
                    }
                    setToken(data.authToken);
                    if (data.refreshToken) {
                        setRefreshToken(data.refreshToken);
                    }
                    $msg.addClass('success').text(`Welcome back, ${data.user?.name}! Redirecting…`).show();
                    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
                })
                .catch(function () {
                    $msg.addClass('error').text('Connection error. Is WordPress running?').show();
                })
                .finally(function () {
                    $btn.prop('disabled', false).text('Log In');
                });
        });

        // Clean up SSE & timers on page unload
        $(window).on('beforeunload', function () {
            stopSubscription();
            stopTokenHealthCheck();
        });
    }

    // ── Bootstrap ────────────────────────────────────────────────────────────
    $(document).ready(init);

}(jQuery));
