/**
 * BOOMFLIX - Stable Core
 * Powered by TMDB API
 */

/**
 * BOOMFLIX - Stable Core
 * ─────────────────────────────────────
 * PLAYER STABILITY:
 *   - 5 embed sources tried in order with auto-fallback
 *   - 14s timeout before showing error/next-source prompt
 *   - All player state cleared on close to prevent stuck iframes
 */

// ─── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
    API_KEY: '3814ec092bdf6cb3d3d3929bce608f37',
    BASE_URL: 'https://api.themoviedb.org/3',
    IMG_PATH: 'https://image.tmdb.org/t/p/original',
    IMG_W500: 'https://image.tmdb.org/t/p/w500'
};



// Multiple embed sources tried in order (most reliable first)
// For TV shows, `id` passed in will be "showId/season/episode" string
const PLAYER_SOURCES = [
    (id, type) => type === 'tv'
        ? `https://vidsrc.to/embed/tv/${id}`
        : `https://vidsrc.to/embed/movie/${id}`,
    (id, type) => type === 'tv'
        ? `https://vidsrc.xyz/embed/tv/${id}`
        : `https://vidsrc.xyz/embed/movie/${id}`,
    (id, type) => type === 'tv'
        ? `https://embed.su/embed/tv/${id}`
        : `https://embed.su/embed/movie/${id}`,
    (id, type) => {
        const base = id.toString().split('/')[0];
        return type === 'tv'
            ? `https://multiembed.mov/?video_id=${base}&tmdb=1&tv=1`
            : `https://multiembed.mov/?video_id=${base}&tmdb=1`;
    },
    (id, type) => {
        const base = id.toString().split('/')[0];
        return type === 'tv'
            ? `https://vidsrc.me/embed/tv?tmdb=${base}`
            : `https://vidsrc.me/embed/movie?tmdb=${base}`;
    },
];

const CATEGORIES = [
    { name: 'Trending Now',    url: 'trending/all/day' },
    { name: 'Nollywood Hits',  url: 'discover/movie?with_origin_country=NG' },
    { name: 'Sci-Fi Universe', url: 'discover/movie?with_genres=878' },
    { name: 'Action Hits',     url: 'discover/movie?with_genres=28' },
    { name: 'Korean Cinema',   url: 'discover/movie?with_original_language=ko' },
    { name: 'Bollywood Magic', url: 'discover/movie?with_original_language=hi' },
    { name: 'Horror Nights',   url: 'discover/movie?with_genres=27' },
    { name: 'Top Rated',       url: 'movie/top_rated' },
];

const GENRE_FILTERS = [
    { name: 'All',       url: 'trending/all/day' },
    { name: 'Action',    url: 'discover/movie?with_genres=28' },
    { name: 'Comedy',    url: 'discover/movie?with_genres=35' },
    { name: 'Drama',     url: 'discover/movie?with_genres=18' },
    { name: 'Horror',    url: 'discover/movie?with_genres=27' },
    { name: 'Sci-Fi',    url: 'discover/movie?with_genres=878' },
    { name: 'Romance',   url: 'discover/movie?with_genres=10749' },
    { name: 'Animation', url: 'discover/movie?with_genres=16' },
    { name: 'Thriller',  url: 'discover/movie?with_genres=53' },
];

// ─── Movie Store (safe alternative to inline JSON in HTML) ─────────────────────
const movieStore = new Map();
function storeMovie(movie) { if (movie?.id) movieStore.set(movie.id, movie); }
function getMovie(id) { return movieStore.get(Number(id)); }

// ─── Watchlist ─────────────────────────────────────────────────────────────────
let watchlist = [];
try { watchlist = JSON.parse(localStorage.getItem('boomflix_watchlist') || '[]'); } catch(e) {}

function saveWatchlist() {
    try { localStorage.setItem('boomflix_watchlist', JSON.stringify(watchlist)); } catch(e) {}
}
function isInWatchlist(id) { return watchlist.some(m => m.id === Number(id)); }

function toggleWatchlist(id, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const movie = getMovie(id);
    if (!movie) return;
    if (isInWatchlist(id)) {
        watchlist = watchlist.filter(m => m.id !== Number(id));
        showToast('Removed from My List');
    } else {
        watchlist.push(movie);
        showToast('Added to My List ✓');
    }
    saveWatchlist();
    refreshWatchlistRow();
    document.querySelectorAll(`[data-wid="${id}"]`).forEach(btn => {
        const inList = isInWatchlist(id);
        btn.classList.toggle('active', inList);
        btn.textContent = inList ? '✓' : '+';
    });
    updateHeroListBtn(id);
}

function refreshWatchlistRow() {
    const row  = document.getElementById('watchlist-row');
    const grid = document.getElementById('watchlist-grid');
    if (!row || !grid) return;
    const valid = watchlist.filter(m => m?.backdrop_path);
    row.style.display = valid.length ? 'block' : 'none';
    if (valid.length) {
        grid.innerHTML = valid.map(buildCard).join('');
        if (window.lucide) lucide.createIcons();
    }
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
    const old = document.getElementById('bf-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'bf-toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2800);
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
let currentUser = null;
try { currentUser = JSON.parse(localStorage.getItem('boomflix_user') || 'null'); } catch(e) {}

function openAuthModal() {
    const m = document.getElementById('auth-modal');
    if (!m) return;
    // Close user menu if open
    document.getElementById('user-menu')?.classList.remove('open');
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    toggleAuth('login');
}
function closeAuthModal() {
    const m = document.getElementById('auth-modal');
    if (m) m.style.display = 'none';
    restoreScroll();
}
function toggleAuth(mode) {
    const lf = document.getElementById('login-form');
    const sf = document.getElementById('signup-form');
    if (lf) lf.style.display = mode === 'login' ? 'block' : 'none';
    if (sf) sf.style.display = mode === 'signup' ? 'block' : 'none';
}
function handleAuth(event, type) {
    event.preventDefault();
    try {
        let user;
        if (type === 'login') {
            const email = document.getElementById('login-email')?.value.trim();
            if (!email) return;
            user = { email, name: email.split('@')[0], avatar: '' };
        } else {
            const name  = document.getElementById('signup-name')?.value.trim();
            const email = document.getElementById('signup-email')?.value.trim();
            if (!name || !email) return;
            user = { email, name, avatar: '' };
        }
        currentUser = user;
        localStorage.setItem('boomflix_user', JSON.stringify(user));
        updateAuthUI();
        closeAuthModal();
        showToast(`Welcome, ${user.name}! 🎬`);
    } catch(e) { console.error('Auth error', e); }
}
function logout() {
    currentUser = null;
    try { localStorage.removeItem('boomflix_user'); } catch(e) {}
    updateAuthUI();
    showToast('Logged out. See you soon!');
}
function updateAuthUI() {
    const el = document.getElementById('auth-status');
    if (!el) return;
    
    // Refresh premium button visibility whenever Auth UI updates
    setupPremiumBtn();

    if (currentUser) {
        const initial = (currentUser.name || '?')[0].toUpperCase();
        const eliteBadge = currentUser.elite ? '<span class="pbar-elite-badge" style="margin-left:8px; font-size:0.6rem;">⚡ ELITE</span>' : '';
        el.innerHTML = `<div class="user-profile" id="user-profile-btn">
            <div class="user-avatar-initials">${initial}</div>
            <span class="user-name">${escHtml(currentUser.name)}${eliteBadge}</span>
            <div class="user-menu" id="user-menu">
                <div class="user-menu-name">${escHtml(currentUser.name)}</div>
                <div class="user-menu-email">${escHtml(currentUser.email)}</div>
                <hr class="user-menu-divider">
                <a href="#" id="logout-link">Sign Out</a>
            </div>
        </div>`;
        document.getElementById('user-profile-btn').addEventListener('click', e => {
            e.stopPropagation();
            document.getElementById('user-menu')?.classList.toggle('open');
        });
        document.getElementById('logout-link').addEventListener('click', e => {
            e.preventDefault(); logout();
        });
    } else {
        el.innerHTML = `<button class="login-btn" id="login-trigger">LOG IN</button>`;
        document.getElementById('login-trigger').addEventListener('click', openAuthModal);
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function restoreScroll() {
    const open = ['player-modal','auth-modal','premium-modal']
        .some(id => document.getElementById(id)?.style.display === 'flex');
    if (!open) document.body.style.overflow = 'auto';
}

// ─── API (with caching) ────────────────────────────────────────────────────────
const apiCache = new Map();
async function apiFetch(endpoint) {
    if (apiCache.has(endpoint)) return apiCache.get(endpoint);
    try {
        const sep = endpoint.includes('?') ? '&' : '?';
        const res = await fetch(`${CONFIG.BASE_URL}/${endpoint}${sep}api_key=${CONFIG.API_KEY}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        apiCache.set(endpoint, data);
        return data;
    } catch(err) {
        console.warn('BOOMFLIX API:', endpoint, err.message);
        return null;
    }
}

// ─── Card Builder ──────────────────────────────────────────────────────────────
function buildCard(movie) {
    if (!movie?.backdrop_path) return '';
    storeMovie(movie);
    const id     = movie.id;
    const inList = isInWatchlist(id);
    const title  = escHtml(movie.title || movie.name || '');
    const year   = (movie.release_date || movie.first_air_date || '').slice(0, 4);
    const rating = movie.vote_average ? Number(movie.vote_average).toFixed(1) : '';
    const type   = movie.title ? 'movie' : 'tv';
    return `<div class="card" data-id="${id}" data-type="${type}" tabindex="0" role="button" aria-label="${title}">
        <img src="${CONFIG.IMG_W500}${movie.backdrop_path}" loading="lazy" alt="${title}"
            onerror="this.closest('.card').style.display='none'">
        <div class="card-overlay">
            <div class="card-meta">
                ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
                ${year   ? `<span class="card-year">${year}</span>` : ''}
            </div>
            <p class="card-title">${title}</p>
            <div class="card-actions">
                <button class="card-play-btn" data-id="${id}" data-type="${type}">▶ Play</button>
                <button class="watchlist-btn ${inList?'active':''}" data-wid="${id}"
                    title="${inList?'Remove from My List':'Add to My List'}">${inList?'✓':'+'}</button>
            </div>
        </div>
    </div>`;
}

// ─── Event Delegation (all clicks in one place, no inline handlers) ────────────
document.addEventListener('click', e => {
    const playBtn = e.target.closest('.card-play-btn');
    if (playBtn) { e.stopPropagation(); openPlayer(Number(playBtn.dataset.id), playBtn.dataset.type); return; }

    const wBtn = e.target.closest('.watchlist-btn');
    if (wBtn) { e.stopPropagation(); toggleWatchlist(Number(wBtn.dataset.wid), e); return; }

    const card = e.target.closest('.card[data-id]');
    if (card) { const m = getMovie(Number(card.dataset.id)); if (m) handleMovieClick(m); return; }

    const priceBox = e.target.closest('.price-box');
    if (priceBox) {
        document.querySelectorAll('.price-box').forEach(b => b.classList.remove('selected'));
        priceBox.classList.add('selected'); return;
    }
    
    // Fix: Ensure user-menu exists before checking classList
    const userMenu = document.getElementById('user-menu');
    if (userMenu && !e.target.closest('#user-profile-btn')) userMenu.classList.remove('open');
    // player-modal backdrop click intentionally NOT wired — close only via X button
    if (e.target.id === 'auth-modal')    closeAuthModal();
    if (e.target.id === 'premium-modal') closePremiumModal();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('card')) {
        const m = getMovie(Number(e.target.dataset.id)); if (m) handleMovieClick(m);
    }
    if (e.key === 'Escape') { closePlayerModal(); closeAuthModal(); closePremiumModal(); }
    if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault(); document.getElementById('movie-search')?.focus();
    }
});

// ─── Hero ──────────────────────────────────────────────────────────────────────
let heroMovieId = null;

async function updateHero(movie) {
    if (!movie) return;
    storeMovie(movie);
    heroMovieId = movie.id;

    const hero    = document.getElementById('hero-section');
    const titleEl = document.getElementById('hero-title');
    const descEl  = document.getElementById('hero-desc');
    const badges  = document.getElementById('hero-badges');
    const playBtn = document.getElementById('hero-play');

    if (!hero || !titleEl) return;

    if (movie.backdrop_path) {
        const img = new Image();
        img.onload = () => { hero.style.backgroundImage = `url(${img.src})`; };
        img.src = CONFIG.IMG_PATH + movie.backdrop_path;
    }

    titleEl.textContent = movie.title || movie.name || 'Featured Title';
    if (descEl) {
        const ov = movie.overview || '';
        descEl.textContent = ov.length > 190 ? ov.slice(0, 190) + '…' : ov || 'Stream this title on BOOMFLIX.';
    }

    const type = movie.title ? 'movie' : 'tv';
    if (playBtn) {
        const newBtn = playBtn.cloneNode(true);
        newBtn.addEventListener('click', () => openPlayer(movie.id, type));
        if (playBtn.parentNode) playBtn.parentNode.replaceChild(newBtn, playBtn);
    }

    if (badges) {
        badges.innerHTML = '<span class="hero-badge loading">Loading…</span>';
        const details = await apiFetch(`${type}/${movie.id}`);
        if (heroMovieId !== movie.id) return; // stale
        if (details) {
            const year    = (details.release_date || details.first_air_date || '').slice(0, 4);
            const runtime = details.runtime ? `${details.runtime}m`
                : (details.episode_run_time?.[0] ? `${details.episode_run_time[0]}m/ep` : '');
            const rating  = details.vote_average ? Number(details.vote_average).toFixed(1) : '';
            const genres  = (details.genres || []).slice(0,3).map(g => escHtml(g.name)).join(' · ');
            badges.innerHTML = [
                year    && `<span class="hero-badge">${year}</span>`,
                rating  && `<span class="hero-badge">⭐ ${rating}</span>`,
                runtime && `<span class="hero-badge">${runtime}</span>`,
                genres  && `<span class="hero-badge genre">${genres}</span>`,
            ].filter(Boolean).join('');
        } else badges.innerHTML = '';
    }

    // My List button — injected directly into the button row beside Surprise Me
    const heroBtns = document.querySelector('.hero-btns');
    if (heroBtns) {
        // Remove any existing My List btn to avoid duplicates on hero refresh
        document.getElementById('hero-list-btn')?.remove();
        const btn = document.createElement('button');
        btn.className = `btn btn-list${isInWatchlist(movie.id) ? ' active' : ''}`;
        btn.id = 'hero-list-btn';
        btn.dataset.heroId = movie.id;
        btn.textContent = isInWatchlist(movie.id) ? '✓ In My List' : '+ My List';
        btn.addEventListener('click', e => { e.stopPropagation(); toggleWatchlist(movie.id, e); });
        const surpriseBtn = document.getElementById('surprise-btn');
        surpriseBtn ? heroBtns.insertBefore(btn, surpriseBtn) : heroBtns.appendChild(btn);
    }
}

function updateHeroListBtn(id) {
    const btn = document.getElementById('hero-list-btn');
    if (!btn || Number(btn.dataset.heroId) !== Number(id)) return;
    const inList = isInWatchlist(id);
    btn.textContent = inList ? '✓ In My List' : '+ My List';
    btn.classList.toggle('active', inList);
}

function handleMovieClick(movie) {
    updateHero(movie);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Genre Filters ─────────────────────────────────────────────────────────────
function buildGenreFilters() {
    const container = document.getElementById('genre-filters');
    if (!container) return;
    container.innerHTML = GENRE_FILTERS.map((g, i) =>
        `<button class="genre-tab${i===0?' active':''}" data-url="${escHtml(g.url)}">${escHtml(g.name)}</button>`
    ).join('');
    container.addEventListener('click', e => {
        const tab = e.target.closest('.genre-tab');
        if (!tab) return;
        container.querySelectorAll('.genre-tab').forEach(b => b.classList.remove('active'));
        tab.classList.add('active');
        filterByGenre(tab.dataset.url);
    });
}

async function filterByGenre(url) {
    const grid = document.getElementById('filter-grid');
    if (!grid) return;
    grid.innerHTML = Array(8).fill('<div class="loading-shimmer"></div>').join('');
    const data = await apiFetch(url);
    const results = data?.results?.filter(m => m.backdrop_path) || [];
    grid.innerHTML = results.length ? results.map(buildCard).join('') : '<p class="empty-msg">No results.</p>';
}

// ─── Row Loader ────────────────────────────────────────────────────────────────
async function loadRowContent(url, gridId) {
    const data = await apiFetch(url);
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const results = data?.results?.filter(m => m.backdrop_path) || [];
    grid.innerHTML = results.length ? results.map(buildCard).join('') : '<p class="empty-msg">Could not load.</p>';
}

// ─── Search ────────────────────────────────────────────────────────────────────
let searchDebounce = null;
function handleSearch(query) {
    query = (query || '').trim();
    if (!query) return;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
        const wrapper = document.getElementById('categories-wrapper');
        if (!wrapper) return;
        let row = document.getElementById('search-row');
        if (!row) {
            row = document.createElement('div');
            row.id = 'search-row'; row.className = 'category-row';
            wrapper.prepend(row);
        }
        row.innerHTML = `<h2 style="color:var(--primary)">
            Results for: "${escHtml(query)}"
            <button class="clear-search-btn" id="clear-search-btn">✕ Clear</button>
        </h2><div class="movie-grid" id="search-grid"></div>`;
        document.getElementById('clear-search-btn').addEventListener('click', clearSearch);
        await loadRowContent(`search/multi?query=${encodeURIComponent(query)}`, 'search-grid');
        row.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
}
function clearSearch() {
    document.getElementById('search-row')?.remove();
    const input = document.getElementById('movie-search');
    if (input) input.value = '';
}

// ─── Ad System ─────────────────────────────────────────────────────────────────
// Ads ONLY in: side panels beside video + non-blocking ticker at bottom.
// Zero redirects. Zero overlays. Zero interruptions to playback.
//
// MONETAG SIDE BANNER SETUP (paste your tags once):
//   Slot IDs available:
//     monetag-slot-left-top    (300×250, left column, top)
//     monetag-slot-left-sky    (160×600, left column, bottom)
//     monetag-slot-right-top   (300×250, right column, top)
//     monetag-slot-right-sky   (160×600, right column, bottom)
//
//   Example — paste your Monetag banner tag into a slot:
//     const slot = document.getElementById('monetag-slot-left-top');
//     if (slot) slot.innerHTML = `<script>atOptions={key:'YOUR_KEY',format:'iframe',
//         height:250,width:300,params:{}};<\/script>
//         <script src="//www.topcreativeformat.com/YOUR_KEY/invoke.js"><\/script>`;

const TICKER_ADS = [
    '🎬 Go ELITE — 4K, ad-free, offline. Upgrade now.',
    '🍿 BOOMFLIX ELITE: Watch on 4 screens simultaneously.',
    '⚡ Elite members get priority access to new releases.',
    '🌍 Nollywood, Bollywood, Korean cinema — all in 4K with Elite.',
    '📲 Download & watch offline — Elite only. Upgrade today.',
];

let tickerInterval = null;
let tickerIndex    = 0;

function startTickerAd() { /* ticker removed */ }
function stopTickerAd()  { /* ticker removed */ }
function dismissTicker() { /* ticker removed */ }

function _isEliteUser() {
    try { return JSON.parse(localStorage.getItem('boomflix_user') || '{}').elite === true; } catch(e) { return false; }
}

// ─── Skip Ad countdown ─────────────────────────────────────────────────────────
let _skipAdTimer = null;
const SKIP_AD_DELAY = 5; // seconds before skip is enabled

function startSkipAdCountdown() {
    const btn       = document.getElementById('skip-ad-btn');
    const countdown = document.getElementById('skip-ad-countdown');
    if (!btn) return;
    btn.disabled = true;
    let remaining = SKIP_AD_DELAY;
    if (countdown) countdown.textContent = remaining;
    clearInterval(_skipAdTimer);
    _skipAdTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(_skipAdTimer);
            if (countdown) countdown.textContent = '›';
            btn.disabled = false;
        } else {
            if (countdown) countdown.textContent = remaining;
        }
    }, 1000);
}

function stopSkipAdCountdown() {
    clearInterval(_skipAdTimer);
    _skipAdTimer = null;
}

function skipAd() {
    stopSkipAdCountdown();
    const panel = document.getElementById('player-ad-right');
    const btn   = document.getElementById('skip-ad-btn');
    if (!panel) return;
    panel.style.transition = 'width 0.3s ease, min-width 0.3s ease, opacity 0.25s ease';
    panel.style.opacity    = '0';
    panel.style.width      = '0';
    panel.style.minWidth   = '0';
    panel.style.padding    = '0';
    panel.style.overflow   = 'hidden';
    if (btn) btn.style.display = 'none';
}

// ─── Block embed click-jacking (window.open from iframes) ─────────────────────
// The embed sources fire window.open() on click to open ad tabs.
// Overriding window.open in the parent context blocks those navigations
// that bubble up through cross-origin iframes trying to open new tabs.
(function blockEmbedPopups() {
    const _origOpen = window.open.bind(window);
    window.open = function(url, target, features) {
        // Allow only explicit in-app calls (none currently). Block everything else.
        if (!url || url === 'about:blank') return _origOpen(url, target, features);
        // Silently block — no new tab, no redirect
        return null;
    };
    // Also block any iframe trying to set top-level location
    window.addEventListener('message', function(e) {
        // Drop any postMessage trying to navigate parent
        if (typeof e.data === 'string' && /location|href|redirect|navigate/i.test(e.data)) return;
    }, true);
})();

// ─── Blur / focus watchdog ─────────────────────────────────────────────────────
// If the page loses focus while the player is open it means an iframe stole
// focus — almost always an ad redirect attempt. We immediately refocus the
// parent window and blank→restore the iframe src to kill the navigation
// mid-flight without disrupting the stream for the user.
(function blurWatchdog() {
    let _blurTimer = null;

    window.addEventListener('blur', function() {
        const modal = document.getElementById('player-modal');
        if (!modal || modal.style.display === 'none') return; // player not open

        // Refocus parent immediately — aborts the redirect
        window.focus();

        // Grace period: if focus doesn't return within 300ms the iframe
        // likely navigated away — blank & restore the src to recover.
        _blurTimer = setTimeout(function() {
            const player = document.getElementById('main-player');
            if (!player || !currentPlayerMovie) return;
            const { id, type } = currentPlayerMovie;
            const urlId = type === 'tv'
                ? `${id}/${tvState.season}/${tvState.episode}`
                : String(id);
            const url = PLAYER_SOURCES[playerSourceIndex](urlId, type);
            // Blank first, then restore — kills the hijacked navigation
            player.src = 'about:blank';
            setTimeout(function() {
                if (currentPlayerMovie && currentPlayerMovie.id === id) {
                    player.src = url;
                }
            }, 200);
        }, 300);
    }, true);

    window.addEventListener('focus', function() {
        // Focus returned normally — cancel the recovery timer
        clearTimeout(_blurTimer);
    }, true);
})();

// ─── beforeunload guard ────────────────────────────────────────────────────────
// Last line of defence: if something tries to navigate the top page while the
// player is open, blank the iframe immediately to cut off the redirect source.
window.addEventListener('beforeunload', function(e) {
    const modal = document.getElementById('player-modal');
    if (!modal || modal.style.display === 'none') return;
    // Attempt to blank the iframe — may not always succeed depending on timing
    // but cuts off the most common redirect vectors.
    const player = document.getElementById('main-player');
    if (player) { try { player.src = 'about:blank'; } catch(err) {} }
}, true);

// Fullscreen: lower the click-shield so native player controls work.
// shield-off sets pointer-events:none + z-index:-1 (see style.css).
document.addEventListener('fullscreenchange', _onFullscreenChange);
document.addEventListener('webkitfullscreenchange', _onFullscreenChange);
function _onFullscreenChange() {
    const shield = document.getElementById('iframe-click-shield');
    if (!shield) return;
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    // In fullscreen: lift shield so player controls are tappable
    // Out of fullscreen: restore shield to block ad click-jacks
    shield.classList.toggle('shield-off', isFs);
}

let _sideAdsInjected = false;
function injectSideAds() {
    if (_sideAdsInjected) return;
    const slot = document.getElementById('ad-slot-right-top');
    if (!slot) return;
    _sideAdsInjected = true;
    
    // ── Adsterra 300x250 Banner Integration ──
    const conf = document.createElement('script');
    conf.innerHTML = `
        atOptions = {
            'key' : '6efe268bbe911abbc4a448708e0c098c',
            'format' : 'iframe',
            'height' : 250,
            'width' : 300,
            'params' : {}
        };
    `;
    const invoke = document.createElement('script');
    invoke.src = 'https://www.highperformanceformat.com/6efe268bbe911abbc4a448708e0c098c/invoke.js';
    
    slot.appendChild(conf);
    slot.appendChild(invoke);
}

// No interstitial — player opens immediately
function showInterstitialThenPlay(id, type) { _doOpenPlayer(id, type); }


// ─── TV Show Episode State ─────────────────────────────────────────────────────
let tvState = {
    showId: null,
    totalSeasons: 0,
    season: 1,
    episode: 1,
    maxEpisode: 1,
};

async function loadSeasonData(showId, season) {
    const data = await apiFetch(`tv/${showId}/season/${season}`);
    return data?.episodes?.length || 1;
}

async function buildEpisodeUI(showId, totalSeasons, initialSeason, initialEp) {
    const seasonSel  = document.getElementById('season-select');
    const episodeSel = document.getElementById('episode-select');
    if (!seasonSel || !episodeSel) return;

    // Populate seasons
    seasonSel.innerHTML = '';
    for (let s = 1; s <= totalSeasons; s++) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `Season ${s}`;
        if (s === initialSeason) opt.selected = true;
        seasonSel.appendChild(opt);
    }

    // Populate episodes for initial season
    const epCount = await loadSeasonData(showId, initialSeason);
    tvState.maxEpisode = epCount;
    episodeSel.innerHTML = '';
    for (let e = 1; e <= epCount; e++) {
        const opt = document.createElement('option');
        opt.value = e;
        opt.textContent = `Episode ${e}`;
        if (e === initialEp) opt.selected = true;
        episodeSel.appendChild(opt);
    }
    _updateNavButtons();
}

async function onSeasonChange() {
    const seasonSel  = document.getElementById('season-select');
    const episodeSel = document.getElementById('episode-select');
    if (!seasonSel || !episodeSel) return;
    const newSeason = Number(seasonSel.value);
    tvState.season  = newSeason;
    tvState.episode = 1;
    const epCount   = await loadSeasonData(tvState.showId, newSeason);
    tvState.maxEpisode = epCount;
    episodeSel.innerHTML = '';
    for (let e = 1; e <= epCount; e++) {
        const opt = document.createElement('option');
        opt.value = e;
        opt.textContent = `Episode ${e}`;
        if (e === 1) opt.selected = true;
        episodeSel.appendChild(opt);
    }
    _updateNavButtons();
    _playTvEpisode();
}

function onEpisodeChange() {
    const episodeSel = document.getElementById('episode-select');
    if (!episodeSel) return;
    tvState.episode = Number(episodeSel.value);
    _updateNavButtons();
    _playTvEpisode();
}

async function navEpisode(dir) {
    const newEp = tvState.episode + dir;
    if (newEp < 1) {
        // Go to previous season last episode
        if (tvState.season <= 1) return;
        tvState.season--;
        const seasonSel = document.getElementById('season-select');
        if (seasonSel) seasonSel.value = tvState.season;
        const epCount = await loadSeasonData(tvState.showId, tvState.season);
        tvState.maxEpisode = epCount;
        tvState.episode = epCount;
        const episodeSel = document.getElementById('episode-select');
        if (episodeSel) {
            episodeSel.innerHTML = '';
            for (let e = 1; e <= epCount; e++) {
                const opt = document.createElement('option');
                opt.value = e; opt.textContent = `Episode ${e}`;
                if (e === epCount) opt.selected = true;
                episodeSel.appendChild(opt);
            }
        }
    } else if (newEp > tvState.maxEpisode) {
        // Go to next season
        if (tvState.season >= tvState.totalSeasons) return;
        tvState.season++;
        const seasonSel = document.getElementById('season-select');
        if (seasonSel) seasonSel.value = tvState.season;
        const epCount = await loadSeasonData(tvState.showId, tvState.season);
        tvState.maxEpisode = epCount;
        tvState.episode = 1;
        const episodeSel = document.getElementById('episode-select');
        if (episodeSel) {
            episodeSel.innerHTML = '';
            for (let e = 1; e <= epCount; e++) {
                const opt = document.createElement('option');
                opt.value = e; opt.textContent = `Episode ${e}`;
                if (e === 1) opt.selected = true;
                episodeSel.appendChild(opt);
            }
        }
    } else {
        tvState.episode = newEp;
        const episodeSel = document.getElementById('episode-select');
        if (episodeSel) episodeSel.value = newEp;
    }
    _updateNavButtons();
    _playTvEpisode();
}

function _updateNavButtons() {
    const prev = document.getElementById('ep-prev-btn');
    const next = document.getElementById('ep-next-btn');
    if (prev) prev.disabled = tvState.season <= 1 && tvState.episode <= 1;
    if (next) next.disabled = tvState.season >= tvState.totalSeasons && tvState.episode >= tvState.maxEpisode;
}

function _playTvEpisode() {
    if (!currentPlayerMovie) return;
    const { id } = currentPlayerMovie;
    const url = PLAYER_SOURCES[playerSourceIndex](
        `${id}/${tvState.season}/${tvState.episode}`, 'tv'
    );
    const player = document.getElementById('main-player');
    const loader = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');
    if (loader)   loader.style.display = 'flex';
    if (errorBox) errorBox.style.display = 'none';
    clearTimeout(playerTimeout);
    if (player) {
        player.onload = null; player.onerror = null;
        player.src = 'about:blank';
        setTimeout(() => { player.src = url; }, 100);
        playerTimeout = setTimeout(() => {
            if (loader)   loader.style.display = 'none';
            if (errorBox) errorBox.style.display = 'flex';
        }, 14000);
        player.onload  = () => { clearTimeout(playerTimeout); if (loader) loader.style.display = 'none'; if (errorBox) errorBox.style.display = 'none'; };
        player.onerror = () => { clearTimeout(playerTimeout); if (loader) loader.style.display = 'none'; if (errorBox) errorBox.style.display = 'flex'; };
    }
    // Update meta label
    const metaEl = document.getElementById('player-meta');
    if (metaEl) metaEl.textContent = `S${tvState.season} · E${tvState.episode}`;
}


// ─── Player ────────────────────────────────────────────────────────────────────
let playerSourceIndex  = 0;
let currentPlayerMovie = null;
let playerTimeout      = null;

function openPlayer(id, type) { _doOpenPlayer(id, type); }

async function _doOpenPlayer(id, type) {
    const movie = getMovie(id);
    currentPlayerMovie = { id, type, title: movie?.title || movie?.name || 'Now Playing' };
    playerSourceIndex  = 0;

    const modal    = document.getElementById('player-modal');
    const titleEl  = document.getElementById('player-title');
    const metaEl   = document.getElementById('player-meta');
    const epRow    = document.getElementById('pepisode-row');
    const infoRow  = document.getElementById('pinfo-row');

    if (!modal) return;

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Title
    if (titleEl) titleEl.textContent = currentPlayerMovie.title;

    // Info chips (rating, year, genres)
    if (infoRow) {
        const year   = (movie?.release_date || movie?.first_air_date || '').slice(0,4);
        const rating = movie?.vote_average ? `⭐ ${Number(movie.vote_average).toFixed(1)}` : '';
        infoRow.innerHTML = [
            rating && `<span class="pinfo-chip rating">${escHtml(rating)}</span>`,
            year   && `<span class="pinfo-chip">${escHtml(year)}</span>`,
        ].filter(Boolean).join('');
        // Fetch genre chips asynchronously
        apiFetch(`${type}/${id}`).then(details => {
            if (!details || !currentPlayerMovie || currentPlayerMovie.id !== id) return;
            const genres = (details.genres || []).slice(0,3).map(g =>
                `<span class="pinfo-chip genre">${escHtml(g.name)}</span>`
            ).join('');
            // Fix: Re-fetch infoRow as it might have been updated or cleared
            const currentInfoRow = document.getElementById('pinfo-row');
            if (genres && currentInfoRow) currentInfoRow.innerHTML += genres;
        });
    }

    // TV show: show episode selector
    if (type === 'tv') {
        if (epRow) epRow.style.display = 'flex';
        if (metaEl) metaEl.textContent = 'S1 · E1';
        tvState = { showId: id, totalSeasons: 1, season: 1, episode: 1, maxEpisode: 1 };
        // Fetch season count
        apiFetch(`tv/${id}`).then(details => {
            if (!details || !currentPlayerMovie || currentPlayerMovie.id !== id) return;
            tvState.totalSeasons = details.number_of_seasons || 1;
            buildEpisodeUI(id, tvState.totalSeasons, 1, 1);
        });
    } else {
        if (epRow) epRow.style.display = 'none';
        if (metaEl) metaEl.textContent = '';
    }

    injectSideAds();
    startSkipAdCountdown();
    _loadPlayerSource();
}

function _loadPlayerSource() {
    if (!currentPlayerMovie) return;
    const { id, type } = currentPlayerMovie;
    const player   = document.getElementById('main-player');
    const loader   = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');

    if (!player) return;

    clearTimeout(playerTimeout);
    player.onload  = null;
    player.onerror = null;
    player.src     = 'about:blank';

    if (loader)   loader.style.display = 'flex';
    if (errorBox) errorBox.style.display = 'none';

    // Sync source pill buttons
    document.querySelectorAll('.psrc-pill').forEach((btn, i) =>
        btn.classList.toggle('active', i === playerSourceIndex)
    );

    const urlId = type === 'tv'
        ? `${id}/${tvState.season}/${tvState.episode}`
        : String(id);
    const url = PLAYER_SOURCES[playerSourceIndex](urlId, type);

    // 14s timeout before showing error panel
    playerTimeout = setTimeout(() => {
        if (loader)   loader.style.display = 'none';
        if (errorBox) errorBox.style.display = 'flex';
        player.onload  = null;
        player.onerror = null;
    }, 14000);

    player.onload = () => {
        clearTimeout(playerTimeout);
        if (loader)   loader.style.display = 'none';
        if (errorBox) errorBox.style.display = 'none';
    };
    player.onerror = () => {
        clearTimeout(playerTimeout);
        if (loader)   loader.style.display = 'none';
        if (errorBox) errorBox.style.display = 'flex';
        player.onload = null; player.onerror = null;
    };

    setTimeout(() => {
        if (currentPlayerMovie && currentPlayerMovie.id === id) player.src = url;
    }, 150);
}

function tryNextSource() {
    if (!currentPlayerMovie) return;
    playerSourceIndex = (playerSourceIndex + 1) % PLAYER_SOURCES.length;
    _loadPlayerSource();
}
function trySourceAt(index) {
    if (!currentPlayerMovie) return;
    playerSourceIndex = index;
    _loadPlayerSource();
}

function closePlayerModal() {
    clearTimeout(playerTimeout);
    stopTickerAd();
    stopSkipAdCountdown();
    const modal    = document.getElementById('player-modal');
    const player   = document.getElementById('main-player');
    const loader   = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');
    const epRow    = document.getElementById('pepisode-row');
    if (!modal) return;
    // Blank the iframe FIRST — synchronously — so no redirect can fire
    // as focus returns to the parent page when the modal hides.
    if (player) {
        player.onload = null; player.onerror = null;
        try { player.src = 'about:blank'; } catch(e) {}
    }
    modal.style.display = 'none';
    if (player) {
        // Belt-and-suspenders: clear again after paint
        setTimeout(() => { try { player.src = 'about:blank'; } catch(e){} }, 50);
    }
    if (loader)   loader.style.display = 'flex';
    if (errorBox) errorBox.style.display = 'none';
    if (epRow)    epRow.style.display = 'none';
    currentPlayerMovie = null;
    playerSourceIndex  = 0;
    
    // Reset ad state so it can re-inject next time the player opens
    _sideAdsInjected = false;
    const slot = document.getElementById('ad-slot-right-top');
    if (slot) slot.innerHTML = '<span class="pad-label">Advertisement</span>';

    // Reset ad panel so it's visible next open
    const adPanel = document.getElementById('player-ad-right');
    const skipBtn = document.getElementById('skip-ad-btn');
    if (adPanel) adPanel.style.cssText = '';
    if (skipBtn) { skipBtn.style.display = ''; skipBtn.disabled = true; }
    restoreScroll();
}

// ─── Surprise Me ──────────────────────────────────────────────────────────────
async function surpriseMe() {
    const btn = document.getElementById('surprise-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i> <span>Finding…</span>'; if(window.lucide) lucide.createIcons(); }
    try {
        const page = Math.floor(Math.random() * 8) + 1;
        const endpoints = [
            `trending/all/week?page=${page}`,
            `discover/movie?sort_by=vote_average.desc&vote_count.gte=100&page=${page}`,
            `discover/movie?with_genres=28&page=${page}`,
        ];
        const url = endpoints[Math.floor(Math.random() * endpoints.length)];
        const data = await apiFetch(url);
        const picks = (data?.results || []).filter(m => m.backdrop_path && m.overview);
        if (picks.length) {
            const pick = picks[Math.floor(Math.random() * picks.length)];
            updateHero(pick);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast('🎲 Surprise pick — enjoy!');
        }
    } catch(e) {}
    if (btn) { 
        btn.disabled = false; 
        btn.innerHTML = '<i data-lucide="shuffle"></i> <span>Surprise Me</span>'; 
        if(window.lucide) lucide.createIcons(); 
    }
}

// ─── Premium → payment page ───────────────────────────────────────────────────
// Premium modal — no redirect
function openPremiumModal() { 
    if (!currentUser) {
        openAuthModal();
    } else {
        window.location.href = 'payment.html';
    }
}

// Ensure the premium-btn in the navbar uses openPremiumModal
function setupPremiumBtn() {
    const premiumBtn = document.getElementById('premium-nav-btn');
    if (premiumBtn) {
        // Hide button if user is already elite
        if (currentUser && currentUser.elite) {
            premiumBtn.style.display = 'none';
        } else {
            premiumBtn.style.display = 'block';
            premiumBtn.onclick = openPremiumModal;
        }
    }
}
function closePremiumModal() { closeAuthModal(); }

// ─── Scroll Nav ────────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

// ─── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    updateAuthUI();
    setupPremiumBtn();
    buildGenreFilters();
    filterByGenre(GENRE_FILTERS[0].url);
    refreshWatchlistRow();



    // Hero
    apiFetch('trending/all/week').then(data => {
        const first = data?.results?.find(m => m.backdrop_path);
        if (first) updateHero(first);
    });

    // Category rows — build DOM first then load in parallel
    const wrapper = document.getElementById('categories-wrapper');
    if (wrapper) {
        CATEGORIES.forEach((cat, i) => {
            const row = document.createElement('div');
            row.className = 'category-row';
            row.innerHTML = `<h2>${escHtml(cat.name)}</h2>
                <div class="movie-grid" id="grid-${i}">
                    ${Array(6).fill('<div class="loading-shimmer"></div>').join('')}
                </div>`;
            wrapper.appendChild(row);
        });
        Promise.allSettled(CATEGORIES.map((cat, i) => loadRowContent(cat.url, `grid-${i}`)));
    }

    // Search — animated placeholder cycles through category names
    const searchInput = document.getElementById('movie-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') handleSearch(searchInput.value);
        });

        // Cycle placeholder through category/genre names
        const placeholders = [
            'Search Nollywood movies…',
            'Search Action & Thriller…',
            'Search Korean Cinema…',
            'Search Bollywood hits…',
            'Search Horror movies…',
            'Search Sci-Fi & Fantasy…',
            'Search Comedy shows…',
            'Search Top Rated films…',
            'Search Trending now…',
        ];
        let phIndex = 0;
        function rotatePlaceholder() {
            if (document.activeElement === searchInput) return; // don't change while typing
            searchInput.style.transition = 'opacity 0.3s';
            searchInput.style.opacity = '0';
            setTimeout(() => {
                phIndex = (phIndex + 1) % placeholders.length;
                searchInput.placeholder = placeholders[phIndex];
                searchInput.style.opacity = '1';
            }, 300);
        }
        searchInput.placeholder = placeholders[0];
        setInterval(rotatePlaceholder, 2800);
    }

    if (window.lucide) lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', init);
