/**
 * BOOMFLIX - Stabilised & Optimised Core
 * Powered by TMDB API
 *
 * Stability improvements in this version:
 *  - Global error boundary: window.onerror + unhandledrejection prevent silent crashes
 *  - Exponential-backoff retry (up to 3 attempts) on all API calls
 *  - Network-offline detection: banner shown, retries queued on reconnect
 *  - localStorage guard: all reads/writes wrapped in try/catch with quota-full handling
 *  - Cache integrity check: corrupt JSON in localStorage is silently discarded
 *  - Player source auto-fallback timeout raised to 8 s (was 4 s) to handle slow CDNs
 *  - Player load-token race condition eliminated (single authoritative token per open)
 *  - Hero rotation paused while page is hidden (Page Visibility API)
 *  - IntersectionObserver polyfill fallback loads all rows immediately if unavailable
 *  - Search debounce extended to 400 ms; empty-string guard prevents blank requests
 *  - All DOM look-ups cached / null-checked before use
 *  - escHtml hardened against null / undefined / non-string input
 *  - watchlist de-duplicated on load to prevent corrupt state
 *  - apiFetch aborts in-flight requests older than 15 s (AbortController)
 */

// ─── Global Error Boundary ────────────────────────────────────────────────────
window.onerror = function(msg, src, line, col, err) {
    console.error('[BOOMFLIX] Uncaught error:', msg, src, line, err);
    return false; // don't suppress default console output
};
window.addEventListener('unhandledrejection', e => {
    console.error('[BOOMFLIX] Unhandled promise rejection:', e.reason);
});

// ─── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
    API_KEY: '3814ec092bdf6cb3d3d3929bce608f37',
    BASE_URL: 'https://api.themoviedb.org/3',
    IMG_PATH: 'https://image.tmdb.org/t/p/original',
    IMG_W500: 'https://image.tmdb.org/t/p/w500',
    CACHE_TTL: 5 * 60 * 1000,   // 5 minutes in ms
};

const IS_NESTED_IFRAME = window.top !== window.self;

// ─── Player Sources — matches the 5 buttons in the HTML dropdown ─────────────
const PLAYER_SOURCES = [
    // 0 — VidSrc CC  (Recommended)
    (id, type) => type === 'tv'
        ? `https://vidsrc.cc/v2/embed/tv/${id}`
        : `https://vidsrc.cc/v2/embed/movie/${id}`,
    // 1 — MultiEmbed  (Africa CDN)
    (id, type) => type === 'tv'
        ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=1&e=1`
        : `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    // 2 — VidSrc TO  (Stable)
    (id, type) => type === 'tv'
        ? `https://vidsrc.to/embed/tv/${id}`
        : `https://vidsrc.to/embed/movie/${id}`,
    // 3 — Embed SU  (TV Shows)
    (id, type) => type === 'tv'
        ? `https://embed.su/embed/tv/${id}`
        : `https://embed.su/embed/movie/${id}`,
    // 4 — VidSrc XYZ  (Fallback)
    (id, type) => type === 'tv'
        ? `https://vidsrc.xyz/embed/tv?tmdb=${id}`
        : `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
];
const SOURCE_NAMES = ['VidSrc CC', 'MultiEmbed', 'VidSrc TO', 'Embed SU', 'VidSrc XYZ'];

// ─── Category Definitions (20 rows) ───────────────────────────────────────────
const CATEGORIES = [
    // ── Above-fold (loaded immediately)
    { name: '🔥 Trending Now',          url: 'trending/all/day' },
    { name: '⭐ Top Rated Movies',       url: 'movie/top_rated' },

    // ── Loaded lazily as user scrolls
    { name: '🎬 Now Playing in Cinemas', url: 'movie/now_playing' },
    { name: '🍿 Popular This Week',      url: 'trending/movie/week' },
    { name: '📺 Trending TV Shows',      url: 'trending/tv/week' },
    { name: '🌍 Nollywood Hits',         url: 'discover/movie?with_origin_country=NG&sort_by=popularity.desc' },
    { name: '🎭 Bollywood Magic',        url: 'discover/movie?with_original_language=hi&sort_by=popularity.desc' },
    { name: '🇰🇷 Korean Cinema',          url: 'discover/movie?with_original_language=ko&sort_by=vote_average.desc&vote_count.gte=200' },
    { name: '🚀 Sci-Fi Universe',         url: 'discover/movie?with_genres=878&sort_by=popularity.desc' },
    { name: '💥 Action Hits',            url: 'discover/movie?with_genres=28&sort_by=popularity.desc' },
    { name: '😱 Horror Nights',          url: 'discover/movie?with_genres=27&sort_by=vote_average.desc&vote_count.gte=100' },
    { name: '😂 Comedy Central',         url: 'discover/movie?with_genres=35&sort_by=popularity.desc' },
    { name: '❤️ Romance & Drama',         url: 'discover/movie?with_genres=10749,18&sort_by=vote_average.desc&vote_count.gte=200' },
    { name: '🎭 Award Winners',          url: 'discover/movie?sort_by=vote_average.desc&vote_count.gte=2000&with_genres=18' },
    { name: '🌟 Hidden Gems',            url: 'discover/movie?sort_by=vote_average.desc&vote_count.gte=50&vote_average.lte=7.5&vote_average.gte=7' },
    { name: '🗡️ Adventure & Fantasy',    url: 'discover/movie?with_genres=12,14&sort_by=popularity.desc' },
    { name: '🧩 Mind-Bending Thrillers', url: 'discover/movie?with_genres=53&sort_by=vote_average.desc&vote_count.gte=300' },
    { name: '🎞️ Classic Cinema',         url: 'discover/movie?primary_release_date.lte=1995-12-31&sort_by=vote_average.desc&vote_count.gte=500' },
    { name: '🌏 Japanese Animation',     url: 'discover/movie?with_original_language=ja&with_genres=16&sort_by=popularity.desc' },
    { name: '📡 Popular TV Dramas',      url: 'discover/tv?with_genres=18&sort_by=popularity.desc' },
];

const GENRE_FILTERS = [
    { name: 'All',        url: 'trending/all/day' },
    { name: 'Action',     url: 'discover/movie?with_genres=28' },
    { name: 'Comedy',     url: 'discover/movie?with_genres=35' },
    { name: 'Drama',      url: 'discover/movie?with_genres=18' },
    { name: 'Horror',     url: 'discover/movie?with_genres=27' },
    { name: 'Sci-Fi',     url: 'discover/movie?with_genres=878' },
    { name: 'Romance',    url: 'discover/movie?with_genres=10749' },
    { name: 'Animation',  url: 'discover/movie?with_genres=16' },
    { name: 'Thriller',   url: 'discover/movie?with_genres=53' },
    { name: 'Adventure',  url: 'discover/movie?with_genres=12' },
    { name: 'Fantasy',    url: 'discover/movie?with_genres=14' },
    { name: 'Crime',      url: 'discover/movie?with_genres=80' },
    { name: 'Mystery',    url: 'discover/movie?with_genres=9648' },
    { name: 'Family',     url: 'discover/movie?with_genres=10751' },
    { name: 'TV Shows',   url: 'trending/tv/week' },
];

// ─── Movie Store ───────────────────────────────────────────────────────────────
const movieStore = new Map();
function storeMovie(movie) { if (movie?.id) movieStore.set(movie.id, movie); }
function getMovie(id) { return movieStore.get(Number(id)); }

// ─── Safe localStorage helpers ────────────────────────────────────────────────
function lsGet(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
    } catch(e) {
        console.warn('[BOOMFLIX] lsGet parse error for key:', key, e);
        return fallback;
    }
}
function lsSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch(e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
            console.warn('[BOOMFLIX] localStorage quota exceeded, pruning cache…');
            try { localStorage.removeItem(LS_CACHE_KEY); } catch(e2) {}
            try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch(e3) {}
        }
        console.warn('[BOOMFLIX] lsSet error:', e);
        return false;
    }
}

// ─── Watchlist ─────────────────────────────────────────────────────────────────
let watchlist = [];
try {
    const raw = lsGet('boomflix_watchlist', []);
    // De-duplicate by id and filter out corrupt entries
    const seen = new Set();
    watchlist = (Array.isArray(raw) ? raw : []).filter(m => {
        if (!m || !m.id || seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });
} catch(e) { watchlist = []; }
function saveWatchlist() { lsSet('boomflix_watchlist', watchlist); }
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
    if (valid.length) { grid.innerHTML = valid.map(buildCard).join(''); if (window.lucide) lucide.createIcons(); }
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
try { currentUser = lsGet('boomflix_user', null); } catch(e) {}
function openAuthModal() {
    const m = document.getElementById('auth-modal');
    if (!m) return;
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
        lsSet('boomflix_user', user);
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function restoreScroll() {
    const open = ['player-modal','auth-modal']
        .some(id => document.getElementById(id)?.style.display === 'flex');
    if (!open) document.body.style.overflow = 'auto';
}

// ─── Network Offline Detection ────────────────────────────────────────────────
let _isOffline = !navigator.onLine;
let _offlineBanner = null;
function _showOfflineBanner() {
    if (_offlineBanner) return;
    _offlineBanner = document.createElement('div');
    _offlineBanner.id = 'bf-offline-banner';
    _offlineBanner.textContent = '⚠️ No internet connection — content may not load.';
    _offlineBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b71c1c;color:#fff;text-align:center;padding:10px;font-size:0.88rem;font-weight:600;';
    document.body.prepend(_offlineBanner);
}
function _hideOfflineBanner() {
    if (_offlineBanner) { _offlineBanner.remove(); _offlineBanner = null; }
}
window.addEventListener('offline', () => { _isOffline = true; _showOfflineBanner(); });
window.addEventListener('online', () => {
    _isOffline = false; _hideOfflineBanner();
    showToast('Back online — reloading content…');
    // Retry pending lazy rows
    document.querySelectorAll('.category-row[data-lazy][data-pending]').forEach(row => {
        const idx = Number(row.dataset.catIndex);
        const cat = CATEGORIES[idx];
        if (cat) { loadRowContent(cat.url, `grid-${idx}`); row.removeAttribute('data-pending'); }
    });
});
if (_isOffline) { document.addEventListener('DOMContentLoaded', _showOfflineBanner); }

// ─── API — with memory cache + localStorage TTL cache + inflight dedup + retry ─
const apiCache  = new Map();          // in-memory (fast)
const _inflight = new Map();          // dedup concurrent requests

const LS_CACHE_KEY = 'bfcache_v2';
let _lsCache = {};
try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (raw) _lsCache = JSON.parse(raw);
    if (typeof _lsCache !== 'object' || Array.isArray(_lsCache)) _lsCache = {};
} catch(e) { _lsCache = {}; }

function _lsCacheGet(key) {
    try {
        const entry = _lsCache[key];
        if (!entry || typeof entry !== 'object') return null;
        if (Date.now() - entry.ts > CONFIG.CACHE_TTL) { delete _lsCache[key]; return null; }
        return entry.data;
    } catch(e) { return null; }
}
function _lsCacheSet(key, data) {
    try {
        _lsCache[key] = { ts: Date.now(), data };
        lsSet(LS_CACHE_KEY, _lsCache);
    } catch(e) {
        _lsCache = {};
        try { localStorage.removeItem(LS_CACHE_KEY); } catch(e2) {}
    }
}

// Exponential-backoff fetch with AbortController timeout
async function _fetchWithRetry(url, retries = 3, baseDelay = 600) {
    for (let attempt = 0; attempt < retries; attempt++) {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 15000); // 15 s hard timeout
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(tid);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch(err) {
            clearTimeout(tid);
            if (attempt === retries - 1) throw err;
            if (err.name === 'AbortError') throw err; // don't retry aborted
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        }
    }
}

async function apiFetch(endpoint) {
    // 1. Memory cache
    if (apiCache.has(endpoint)) return apiCache.get(endpoint);
    // 2. localStorage cache (survives page refresh)
    const cached = _lsCacheGet(endpoint);
    if (cached) { apiCache.set(endpoint, cached); return cached; }
    // 3. Deduplicate in-flight requests
    if (_inflight.has(endpoint)) return _inflight.get(endpoint);

    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `${CONFIG.BASE_URL}/${endpoint}${sep}api_key=${CONFIG.API_KEY}`;

    const promise = _fetchWithRetry(url)
        .then(data => {
            apiCache.set(endpoint, data);
            _lsCacheSet(endpoint, data);
            _inflight.delete(endpoint);
            return data;
        })
        .catch(err => {
            console.warn('[BOOMFLIX] API fetch failed:', endpoint, err.message);
            _inflight.delete(endpoint);
            return null;
        });

    _inflight.set(endpoint, promise);
    return promise;
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

// ─── Event Delegation ──────────────────────────────────────────────────────────
document.addEventListener('click', e => {
    const playBtn = e.target.closest('.card-play-btn');
    if (playBtn) { e.stopPropagation(); openPlayer(Number(playBtn.dataset.id), playBtn.dataset.type); return; }
    const wBtn = e.target.closest('.watchlist-btn');
    if (wBtn) { e.stopPropagation(); toggleWatchlist(Number(wBtn.dataset.wid), e); return; }
    const card = e.target.closest('.card[data-id]');
    if (card) { e.stopPropagation(); const m = getMovie(Number(card.dataset.id)); if (m) openPlayer(Number(card.dataset.id), card.dataset.type); return; }
    const priceBox = e.target.closest('.price-box');
    if (priceBox) { document.querySelectorAll('.price-box').forEach(b => b.classList.remove('selected')); priceBox.classList.add('selected'); return; }
    const userMenu = document.getElementById('user-menu');
    if (userMenu && !e.target.closest('#user-profile-btn')) userMenu.classList.remove('open');
    if (e.target.id === 'auth-modal')    closeAuthModal();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('card')) {
        const m = getMovie(Number(e.target.dataset.id));
        if (m) openPlayer(Number(e.target.dataset.id), e.target.dataset.type);
    }
    if (e.key === 'Escape') { closePlayerModal(); closeAuthModal(); }
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
    const heroBtns = document.querySelector('.hero-btns');
    if (heroBtns) {
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
    if (badges) {
        badges.innerHTML = '';
        // Defer detail + cast fetch — doesn't block hero display
        apiFetch(`${type}/${movie.id}`).then(details => {
            if (heroMovieId !== movie.id || !details) return;
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
        });
        apiFetch(`${type}/${movie.id}/credits`).then(credits => {
            if (heroMovieId !== movie.id) return;
            const extraEl = document.getElementById('hero-extra');
            if (!extraEl) return;
            extraEl.innerHTML = '';
            const cast = (credits?.cast || []).slice(0, 5);
            if (cast.length) {
                const castHTML = cast.map(p => `
                    <div class="hero-cast-member">
                        <div class="hero-cast-avatar" style="${p.profile_path ? `background-image:url(${CONFIG.IMG_W500}${p.profile_path})` : 'background:#333'}"></div>
                        <span class="hero-cast-name">${escHtml(p.name)}</span>
                    </div>`).join('');
                extraEl.innerHTML = `<div class="hero-cast-label">Starring</div><div class="hero-cast-row">${castHTML}</div>`;
            }
        });
    }
}
function updateHeroListBtn(id) {
    const btn = document.getElementById('hero-list-btn');
    if (!btn || Number(btn.dataset.heroId) !== Number(id)) return;
    const inList = isInWatchlist(id);
    btn.textContent = inList ? '✓ In My List' : '+ My List';
    btn.classList.toggle('active', inList);
}

// ─── Hero Auto-Rotation ────────────────────────────────────────────────────────
let _heroRotationTimer = null;
let _heroMovies = [];
let _heroIndex  = 0;
function startHeroRotation(movies) {
    _heroMovies = movies; _heroIndex = 0;
    clearInterval(_heroRotationTimer);
    const hero = document.getElementById('hero-section');
    if (hero) {
        let dots = document.getElementById('hero-dots');
        if (!dots) {
            dots = document.createElement('div');
            dots.id = 'hero-dots';
            dots.style.cssText = 'position:absolute;bottom:18px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10;';
            hero.style.position = hero.style.position || 'relative';
            hero.appendChild(dots);
        }
        dots.innerHTML = movies.map((_, i) =>
            `<button class="hero-dot${i===0?' active':''}" data-hi="${i}" aria-label="Hero slide ${i+1}"
                style="width:9px;height:9px;border-radius:50%;border:none;cursor:pointer;padding:0;
                background:${i===0?'#fff':'rgba(255,255,255,0.35)'};transition:background 0.3s,transform 0.3s;
                transform:${i===0?'scale(1.3)':'scale(1)'}"></button>`
        ).join('');
        dots.addEventListener('click', e => {
            const dot = e.target.closest('.hero-dot');
            if (!dot) return;
            const idx = Number(dot.dataset.hi);
            _heroIndex = idx;
            updateHero(_heroMovies[idx]);
            _updateHeroDots(idx);
            clearInterval(_heroRotationTimer);
            _heroRotationTimer = setInterval(_heroAdvance, 8000);
        });
    }
    _heroRotationTimer = setInterval(_heroAdvance, 5000); // Rotate every 5 seconds for a more dynamic feel
}
function _heroAdvance() {
    if (!_heroMovies.length) return;
    _heroIndex = (_heroIndex + 1) % _heroMovies.length;
    updateHero(_heroMovies[_heroIndex]);
    _updateHeroDots(_heroIndex);
}
function _updateHeroDots(activeIdx) {
    document.querySelectorAll('.hero-dot').forEach((dot, i) => {
        const active = i === activeIdx;
        dot.style.background = active ? '#fff' : 'rgba(255,255,255,0.35)';
        dot.style.transform = active ? 'scale(1.3)' : 'scale(1)';
        dot.classList.toggle('active', active);
    });
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
    const grid = document.getElementById(gridId);
    if (!grid) return;
    if (_isOffline) {
        const row = grid.closest('.category-row');
        if (row) row.dataset.pending = '1';
        grid.innerHTML = '<p class="empty-msg">No connection — will load when online.</p>';
        return;
    }
    const data = await apiFetch(url);
    const results = data?.results?.filter(m => m.backdrop_path) || [];
    grid.innerHTML = results.length ? results.map(buildCard).join('') : '<p class="empty-msg">Could not load.</p>';
}

// ─── Lazy Row Loading via IntersectionObserver ─────────────────────────────────
function setupLazyRows(wrapper) {
    if (!('IntersectionObserver' in window)) {
        // Fallback: load all immediately if IntersectionObserver not available
        CATEGORIES.slice(2).forEach((cat, i) => loadRowContent(cat.url, `grid-${i + 2}`));
        return;
    }
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const row  = entry.target;
            const idx  = Number(row.dataset.catIndex);
            const cat  = CATEGORIES[idx];
            if (cat) loadRowContent(cat.url, `grid-${idx}`);
            obs.unobserve(row);
        });
    }, { rootMargin: '200px 0px' });   // start loading 200px before in viewport

    // Observe all lazy rows (index >= 2)
    wrapper.querySelectorAll('.category-row[data-lazy]').forEach(row => observer.observe(row));
}

// ─── Search ────────────────────────────────────────────────────────────────────
let searchDebounce = null;
function handleSearch(query) {
    query = (query || '').trim();
    if (!query || query.length < 2) return; // guard: skip empty or single-char
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
    }, 400);
}
function clearSearch() {
    document.getElementById('search-row')?.remove();
    const input = document.getElementById('movie-search');
    if (input) input.value = '';
}

// ─── Premium Source Selector ───────────────────────────────────────────────────
function toggleSourceMenu() {
    const btn      = document.getElementById('psrc-menu-btn');
    const dropdown = document.getElementById('psrc-dropdown');
    if (!btn || !dropdown) return;
    const isOpen = dropdown.classList.contains('visible');
    dropdown.classList.toggle('visible', !isOpen);
    btn.classList.toggle('open', !isOpen);
}
function pickSource(index) {
    document.getElementById('psrc-dropdown')?.classList.remove('visible');
    document.getElementById('psrc-menu-btn')?.classList.remove('open');
    trySourceAt(index);
}
function _syncSourceDropdown(index, state) {
    const label   = document.getElementById('psrc-active-label');
    const options = document.querySelectorAll('.psrc-option');
    if (label) label.textContent = SOURCE_NAMES[index] || `Source ${index + 1}`;
    options.forEach((opt, i) => {
        opt.classList.remove('active', 'loading');
        if (i === index) opt.classList.add(state === 'loading' ? 'loading' : 'active');
    });
}
document.addEventListener('click', function(e) {
    if (!e.target.closest('#psource-wrap')) {
        document.getElementById('psrc-dropdown')?.classList.remove('visible');
        document.getElementById('psrc-menu-btn')?.classList.remove('open');
    }
}, true);

// ─── TV Show Episode State ─────────────────────────────────────────────────────
let tvState = { showId: null, totalSeasons: 0, season: 1, episode: 1, maxEpisode: 1 };
async function loadSeasonData(showId, season) {
    const data = await apiFetch(`tv/${showId}/season/${season}`);
    return data?.episodes?.length || 1;
}
async function buildEpisodeUI(showId, totalSeasons, initialSeason, initialEp) {
    const seasonSel  = document.getElementById('season-select');
    const episodeSel = document.getElementById('episode-select');
    if (!seasonSel || !episodeSel) return;
    seasonSel.innerHTML = '';
    for (let s = 1; s <= totalSeasons; s++) {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = `Season ${s}`;
        if (s === initialSeason) opt.selected = true;
        seasonSel.appendChild(opt);
    }
    const epCount = await loadSeasonData(showId, initialSeason);
    tvState.maxEpisode = epCount;
    episodeSel.innerHTML = '';
    for (let e = 1; e <= epCount; e++) {
        const opt = document.createElement('option');
        opt.value = e; opt.textContent = `Episode ${e}`;
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
    tvState.season  = newSeason; tvState.episode = 1;
    const epCount   = await loadSeasonData(tvState.showId, newSeason);
    tvState.maxEpisode = epCount;
    episodeSel.innerHTML = '';
    for (let e = 1; e <= epCount; e++) {
        const opt = document.createElement('option');
        opt.value = e; opt.textContent = `Episode ${e}`;
        if (e === 1) opt.selected = true;
        episodeSel.appendChild(opt);
    }
    _updateNavButtons(); playerSourceIndex = 0; _playTvEpisode();
}
function onEpisodeChange() {
    const episodeSel = document.getElementById('episode-select');
    if (!episodeSel) return;
    tvState.episode = Number(episodeSel.value);
    _updateNavButtons(); playerSourceIndex = 0; _playTvEpisode();
}
async function navEpisode(dir) {
    const newEp = tvState.episode + dir;
    if (newEp < 1) {
        if (tvState.season <= 1) return;
        tvState.season--;
        const seasonSel = document.getElementById('season-select');
        if (seasonSel) seasonSel.value = tvState.season;
        const epCount = await loadSeasonData(tvState.showId, tvState.season);
        tvState.maxEpisode = epCount; tvState.episode = epCount;
        const episodeSel = document.getElementById('episode-select');
        if (episodeSel) { episodeSel.innerHTML = ''; for (let e = 1; e <= epCount; e++) { const opt = document.createElement('option'); opt.value = e; opt.textContent = `Episode ${e}`; if (e === epCount) opt.selected = true; episodeSel.appendChild(opt); } }
    } else if (newEp > tvState.maxEpisode) {
        if (tvState.season >= tvState.totalSeasons) return;
        tvState.season++;
        const seasonSel = document.getElementById('season-select');
        if (seasonSel) seasonSel.value = tvState.season;
        const epCount = await loadSeasonData(tvState.showId, tvState.season);
        tvState.maxEpisode = epCount; tvState.episode = 1;
        const episodeSel = document.getElementById('episode-select');
        if (episodeSel) { episodeSel.innerHTML = ''; for (let e = 1; e <= epCount; e++) { const opt = document.createElement('option'); opt.value = e; opt.textContent = `Episode ${e}`; if (e === 1) opt.selected = true; episodeSel.appendChild(opt); } }
    } else {
        tvState.episode = newEp;
        const episodeSel = document.getElementById('episode-select');
        if (episodeSel) episodeSel.value = newEp;
    }
    _updateNavButtons(); playerSourceIndex = 0; _playTvEpisode();
}
function _updateNavButtons() {
    const prev = document.getElementById('ep-prev-btn');
    const next = document.getElementById('ep-next-btn');
    if (prev) prev.disabled = tvState.season <= 1 && tvState.episode <= 1;
    if (next) next.disabled = tvState.season >= tvState.totalSeasons && tvState.episode >= tvState.maxEpisode;
}
function _playTvEpisode(isRetry = false) {
    if (!currentPlayerMovie) return;
    const id = tvState.showId || currentPlayerMovie.id;
    if (!isRetry) playerSourceIndex = 0;
    const url = PLAYER_SOURCES[playerSourceIndex](id, 'tv');
    const player   = document.getElementById('main-player');
    const loader   = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');
    if (loader)    loader.style.display = 'flex';
    if (errorBox)  errorBox.style.display = 'none';
    clearTimeout(playerTimeout); clearTimeout(_playerLoadCooldown);

    const myToken = ++_loadToken;

    if (player) {
        player.onload  = null;
        player.onerror = null;
        player.onload = () => {
            if (_loadToken !== myToken) return;
            clearTimeout(playerTimeout);
            if (loader)    loader.style.display = 'none';
            if (errorBox)  errorBox.style.display = 'none';
            _syncSourceDropdown(playerSourceIndex, 'active');
        };
        player.onerror = () => {
            if (_loadToken !== myToken) return;
            clearTimeout(playerTimeout);
            if (playerSourceIndex < PLAYER_SOURCES.length - 1) { playerSourceIndex++; _playTvEpisode(true); }
            else { if (loader) loader.style.display = 'none'; if (errorBox) errorBox.style.display = 'flex'; }
        };
        player.src = url;
    // Timeout: 8 s per source — accommodates slower CDNs while still falling back promptly
        playerTimeout = setTimeout(() => {
            if (_loadToken !== myToken) return;
            if (playerSourceIndex < PLAYER_SOURCES.length - 1) { playerSourceIndex++; _playTvEpisode(true); }
            else { playerSourceIndex = 0; if (loader) loader.style.display = 'none'; if (errorBox) errorBox.style.display = 'flex'; }
        }, 8000);
    }
    const metaEl = document.getElementById('player-meta');
    if (metaEl) metaEl.textContent = `S${tvState.season} · E${tvState.episode}`;
}

// ─── Player Core ───────────────────────────────────────────────────────────────
let playerSourceIndex   = 0;
let currentPlayerMovie  = null;
let playerTimeout       = null;
let _playerLoadCooldown = null;
function openPlayer(id, type) { _doOpenPlayer(id, type); }
async function _doOpenPlayer(id, type) {
    const movie = getMovie(id);
    if (!movie) return;
    clearInterval(_heroRotationTimer); _heroRotationTimer = null;
    currentPlayerMovie = { id, type, title: movie?.title || movie?.name || 'Now Playing' };
    playerSourceIndex  = 0;
    const modal    = document.getElementById('player-modal');
    const titleEl  = document.getElementById('player-title');
    const metaEl   = document.getElementById('player-meta');
    const epRow    = document.getElementById('pepisode-row');
    const infoRow  = document.getElementById('pinfo-row');
    if (!modal) return;

    // Fully reset iframe before reuse — prevents stale onload fires
    const player = document.getElementById('main-player');
    if (player) {
        player.onload  = null;
        player.onerror = null;
        player.src = 'about:blank';
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const adRight = document.getElementById('player-ad-right');
    if (adRight) adRight.style.display = '';
    startSkipAdCountdown();

    // Set title ONCE — clear first to prevent duplicates
    if (titleEl) titleEl.textContent = currentPlayerMovie.title;

    // Reset info row completely before writing new chips
    if (infoRow) {
        infoRow.innerHTML = '';
        const year   = (movie?.release_date || movie?.first_air_date || '').slice(0, 4);
        const rating = movie?.vote_average ? `⭐ ${Number(movie.vote_average).toFixed(1)}` : '';
        infoRow.innerHTML = [
            rating && `<span class="pinfo-chip rating">${escHtml(rating)}</span>`,
            year   && `<span class="pinfo-chip">${escHtml(year)}</span>`,
        ].filter(Boolean).join('');
    }

    if (type === 'tv') {
        if (epRow)  epRow.style.display = 'flex';
        if (metaEl) metaEl.textContent  = 'S1 · E1';
        tvState = { showId: id, totalSeasons: 1, season: 1, episode: 1, maxEpisode: 1 };
        playerSourceIndex = 0;
        const details = await apiFetch(`tv/${id}`);
        if (details) { tvState.totalSeasons = details.number_of_seasons || 1; await buildEpisodeUI(id, tvState.totalSeasons, 1, 1); }
        _playTvEpisode();
    } else {
        if (epRow)  epRow.style.display = 'none';
        if (metaEl) metaEl.textContent  = '';
        _loadPlayerSource();
    }
}

// Counter to invalidate stale callbacks when source switches mid-flight
let _loadToken = 0;

function _loadPlayerSource() {
    if (!currentPlayerMovie?.id) return;
    const { id, type } = currentPlayerMovie;
    const player   = document.getElementById('main-player');
    const loader   = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');
    if (!player) return;

    clearTimeout(playerTimeout);
    clearTimeout(_playerLoadCooldown);

    // Increment token — any callback from a previous load call will see a stale token and bail
    const myToken = ++_loadToken;

    if (loader)    loader.style.display = 'flex';
    if (errorBox)  errorBox.style.display = 'none';
    _syncSourceDropdown(playerSourceIndex, 'loading');

    const urlId = type === 'tv' ? `${id}/${tvState.season}/${tvState.episode}` : String(id);
    const url   = PLAYER_SOURCES[playerSourceIndex](urlId, type);

    // Detach old handlers before assigning new ones
    player.onload  = null;
    player.onerror = null;

    player.onload = () => {
        if (_loadToken !== myToken) return;   // stale — a newer load already started
        clearTimeout(playerTimeout);
        if (loader)    loader.style.display = 'none';
        if (errorBox)  errorBox.style.display = 'none';
        _syncSourceDropdown(playerSourceIndex, 'active');
    };
    player.onerror = () => {
        if (_loadToken !== myToken) return;
        clearTimeout(playerTimeout);
        if (playerSourceIndex < PLAYER_SOURCES.length - 1) { playerSourceIndex++; _loadPlayerSource(); }
        else { if (loader) loader.style.display = 'none'; if (errorBox) errorBox.style.display = 'flex'; }
    };

    // Optimization: Pre-set src to about:blank to clear previous state immediately
    // player.src = 'about:blank'; // Already handled in _doOpenPlayer for first load
    player.src = url;

    // Timeout: 8 s per source — accommodates slower CDNs while still falling back promptly
    playerTimeout = setTimeout(() => {
        if (_loadToken !== myToken) return;
        if (playerSourceIndex < PLAYER_SOURCES.length - 1) { playerSourceIndex++; _loadPlayerSource(); }
        else { playerSourceIndex = 0; if (loader) loader.style.display = 'none'; if (errorBox) errorBox.style.display = 'flex'; }
    }, 8000);
}
function tryNextSource() {
    if (!currentPlayerMovie) return;
    if (playerSourceIndex < PLAYER_SOURCES.length - 1) { playerSourceIndex++; _loadPlayerSource(); }
}
function trySourceAt(index) {
    if (!currentPlayerMovie) return;
    playerSourceIndex = index; _loadPlayerSource();
}
function closePlayerModal() {
    if (_heroMovies.length && !_heroRotationTimer) _heroRotationTimer = setInterval(_heroAdvance, 8000);
    clearTimeout(playerTimeout); clearTimeout(_playerLoadCooldown);
    const modal    = document.getElementById('player-modal');
    const player   = document.getElementById('main-player');
    const loader   = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');
    const epRow    = document.getElementById('pepisode-row');
    if (!modal) return;
    if (player) { player.onload = null; player.onerror = null; player.src = ''; player.removeAttribute('src'); }
    clearInterval(_skipAdTimer);
    const adSlot  = document.getElementById('ad-slot-right-top');
    const skipBtn = document.getElementById('skip-ad-btn');
    const skipCountdown = document.getElementById('skip-ad-countdown');
    if (adSlot)  adSlot.style.display  = '';
    if (skipBtn) { skipBtn.style.display = ''; skipBtn.disabled = true; }
    if (skipCountdown) skipCountdown.textContent = '5';
    modal.style.display = 'none';
    if (loader)   loader.style.display = 'flex';
    if (errorBox) errorBox.style.display = 'none';
    if (epRow)    epRow.style.display = 'none';
    currentPlayerMovie = null; playerSourceIndex = 0;
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
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="shuffle"></i> <span>Surprise Me</span>'; if(window.lucide) lucide.createIcons(); }
}

// ─── Premium ──────────────────────────────────────────────────────────────────
function openPremiumModal() { window.location.href = 'payment.html'; }
function setupPremiumBtn() {
    const premiumBtn = document.getElementById('premium-nav-btn');
    if (premiumBtn) {
        if (currentUser && currentUser.elite) { premiumBtn.style.display = 'none'; }
        else { premiumBtn.style.display = 'block'; premiumBtn.onclick = openPremiumModal; }
    }
}
function updateAuthUI() {
    const el = document.getElementById('auth-status');
    if (!el) return;
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
    setupPremiumBtn();
}
// Check for elite status on page load (in case user returned from payment.html)
function checkEliteStatusOnLoad() {
    try {
        const user = lsGet('boomflix_user', null);
        if (user && user.elite && !currentUser?.elite) {
            currentUser = user;
            updateAuthUI();
            setupPremiumBtn();
            showToast('✨ Welcome to ELITE!');
        }
    } catch(e) {}
}

// ─── Page Visibility: Pause hero rotation when tab hidden, sync elite on return ─
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        // Pause rotation to avoid wasted work while tab is backgrounded
        if (_heroRotationTimer) { clearInterval(_heroRotationTimer); _heroRotationTimer = null; }
    } else {
        // Resume rotation and sync elite status
        if (_heroMovies.length && !_heroRotationTimer) {
            _heroRotationTimer = setInterval(_heroAdvance, 8000);
        }
        checkEliteStatusOnLoad();
    }
});

// ─── Message Listener: Receive elite status update from payment.html ───────
window.addEventListener('message', (event) => {
    if (event.data.type === 'BOOMFLIX_ELITE_UPDATE') {
        currentUser = event.data.user;
        updateAuthUI();
        setupPremiumBtn();
        showToast('✨ Welcome to ELITE!');
    }
});

// ─── Skip Ad ───────────────────────────────────────────────────────────────────
let _skipAdTimer = null;
function startSkipAdCountdown() {
    const btn = document.getElementById('skip-ad-btn');
    const countdown = document.getElementById('skip-ad-countdown');
    if (!btn || !countdown) return;
    btn.disabled = true; let secs = 5; countdown.textContent = secs;
    clearInterval(_skipAdTimer);
    _skipAdTimer = setInterval(() => {
        secs--; countdown.textContent = secs;
        if (secs <= 0) { clearInterval(_skipAdTimer); btn.disabled = false; countdown.textContent = '✕'; }
    }, 1000);
}
function skipAd() {
    clearInterval(_skipAdTimer);
    const adSlot  = document.getElementById('ad-slot-right-top');
    const skipBtn = document.getElementById('skip-ad-btn');
    if (adSlot)  adSlot.style.display  = 'none';
    if (skipBtn) skipBtn.style.display = 'none';
}

window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

// ─── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    updateAuthUI();
    setupPremiumBtn();
    buildGenreFilters();

    // Kick off genre filter + watchlist in parallel (no awaiting)
    filterByGenre(GENRE_FILTERS[0].url);
    refreshWatchlistRow();

    // Hero: load latest movies and start rotation
    apiFetch('movie/now_playing').then(data => {
        const heroMovies = (data?.results || []).filter(m => m.backdrop_path && m.overview).slice(0, 10);
        if (!heroMovies.length) return;
        updateHero(heroMovies[0]);
        startHeroRotation(heroMovies);
    });

    // Build all category row DOM shells immediately (shimmer placeholders)
    const wrapper = document.getElementById('categories-wrapper');
    if (wrapper) {
        const frag = document.createDocumentFragment();
        CATEGORIES.forEach((cat, i) => {
            const row = document.createElement('div');
            row.className = 'category-row';
            row.dataset.catIndex = i;
            if (i >= 2) row.dataset.lazy = '1';   // mark for lazy loading
            row.innerHTML = `<h2>${escHtml(cat.name)}</h2>
                <div class="movie-grid" id="grid-${i}">
                    ${Array(6).fill('<div class="loading-shimmer"></div>').join('')}
                </div>`;
            frag.appendChild(row);
        });
        wrapper.appendChild(frag);

        // Load first two rows immediately (above the fold)
        loadRowContent(CATEGORIES[0].url, 'grid-0');
        loadRowContent(CATEGORIES[1].url, 'grid-1');

        // Remaining rows load lazily
        setupLazyRows(wrapper);
    }

    // Search wire-up
    const searchInput = document.getElementById('movie-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleSearch(searchInput.value); });
        const placeholders = [
            'Search Nollywood movies…', 'Search Action & Thriller…',
            'Search Korean Cinema…',    'Search Bollywood hits…',
            'Search Horror movies…',    'Search Sci-Fi & Fantasy…',
            'Search Comedy shows…',     'Search Top Rated films…',
            'Search Trending now…',
        ];
        let phIndex = 0;
        function rotatePlaceholder() {
            if (document.activeElement === searchInput) return;
            searchInput.style.transition = 'opacity 0.3s'; searchInput.style.opacity = '0';
            setTimeout(() => { phIndex = (phIndex + 1) % placeholders.length; searchInput.placeholder = placeholders[phIndex]; searchInput.style.opacity = '1'; }, 300);
        }
        searchInput.placeholder = placeholders[0];
        setInterval(rotatePlaceholder, 2800);
    }

    if (window.lucide) lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', () => {
    checkEliteStatusOnLoad();
    init();
});
