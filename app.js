/**
 * BOOMFLIX - Stable Core
 * Powered by TMDB API
 */

// ─── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
    API_KEY: '3814ec092bdf6cb3d3d3929bce608f37',
    BASE_URL: 'https://api.themoviedb.org/3',
    IMG_PATH: 'https://image.tmdb.org/t/p/original',
    IMG_W500: 'https://image.tmdb.org/t/p/w500'
};

// Multiple embed sources tried in order
const PLAYER_SOURCES = [
    (id, type) => `https://vidsrc.to/embed/${type}/${id}`,
    (id, type) => `https://vidsrc.xyz/embed/${type}/${id}`,
    (id, type) => `https://embed.su/embed/${type}/${id}`,
    (id, type) => `https://multiembed.mov/?video_id=${id}&tmdb=1${type === 'tv' ? '&tv=1' : ''}`,
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
    if (valid.length) grid.innerHTML = valid.map(buildCard).join('');
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
    if (currentUser) {
        const initial = (currentUser.name || '?')[0].toUpperCase();
        el.innerHTML = `<div class="user-profile" id="user-profile-btn">
            <div class="user-avatar-initials">${initial}</div>
            <span class="user-name">${escHtml(currentUser.name)}</span>
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
    if (!e.target.closest('#user-profile-btn')) document.getElementById('user-menu')?.classList.remove('open');
    if (e.target.id === 'player-modal')  closePlayerModal();
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
    const actions = document.getElementById('hero-actions');
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
        playBtn.parentNode.replaceChild(newBtn, playBtn);
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

    if (actions) {
        actions.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = `btn btn-list${isInWatchlist(movie.id) ? ' active' : ''}`;
        btn.id = 'hero-list-btn';
        btn.dataset.heroId = movie.id;
        btn.textContent = isInWatchlist(movie.id) ? '✓ In My List' : '+ My List';
        btn.addEventListener('click', e => { e.stopPropagation(); toggleWatchlist(movie.id, e); });
        actions.appendChild(btn);
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

// ─── Player ────────────────────────────────────────────────────────────────────
let playerSourceIndex = 0;
let currentPlayerMovie = null;
let playerTimeout = null;

function openPlayer(id, type) {
    const movie = getMovie(id);
    currentPlayerMovie = { id, type, title: movie?.title || movie?.name || 'Now Playing' };
    playerSourceIndex = 0;
    _loadPlayerSource();
}

function _loadPlayerSource() {
    const { id, type, title } = currentPlayerMovie;
    const modal    = document.getElementById('player-modal');
    const player   = document.getElementById('main-player');
    const loader   = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');
    const titleEl  = document.getElementById('player-title');
    const srcLabel = document.getElementById('player-source-label');
    if (!modal || !player) return;

    // Reset
    clearTimeout(playerTimeout);
    if (player.src !== 'about:blank') { player.src = 'about:blank'; }
    if (loader)   { loader.style.display = 'flex'; }
    if (errorBox) { errorBox.style.display = 'none'; }
    if (titleEl)  { titleEl.textContent = title; }
    if (srcLabel) { srcLabel.textContent = `Source ${playerSourceIndex + 1} / ${PLAYER_SOURCES.length}`; }

    // Update source buttons
    document.querySelectorAll('.source-btn').forEach((btn, i) =>
        btn.classList.toggle('active', i === playerSourceIndex)
    );

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const url = PLAYER_SOURCES[playerSourceIndex](id, type);

    // Timeout fallback — show error UI after 14s
    playerTimeout = setTimeout(() => {
        if (loader)   loader.style.display = 'none';
        if (errorBox) errorBox.style.display = 'flex';
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
    };

    setTimeout(() => { player.src = url; }, 100);
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
    const modal    = document.getElementById('player-modal');
    const player   = document.getElementById('main-player');
    const loader   = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');
    if (!modal) return;
    modal.style.display = 'none';
    if (player) { player.onload = null; player.onerror = null; player.src = 'about:blank'; }
    if (loader)   loader.style.display = 'flex';
    if (errorBox) errorBox.style.display = 'none';
    currentPlayerMovie = null;
    playerSourceIndex  = 0;
    restoreScroll();
}

// ─── Premium ───────────────────────────────────────────────────────────────────
function openPremiumModal() {
    const m = document.getElementById('premium-modal');
    if (m) { m.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}
function closePremiumModal() {
    const m = document.getElementById('premium-modal');
    if (m) m.style.display = 'none';
    restoreScroll();
}

// ─── Scroll Nav ────────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

// ─── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    updateAuthUI();
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

    // Search
    const searchInput = document.getElementById('movie-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') handleSearch(searchInput.value);
        });
    }

    if (window.lucide) lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', init);
