/**
 * BOOMFLIX - Stable Core (Enhanced)
 * Powered by TMDB API
 * 
 * STRIPPED DOWN - FOCUSED ON PLAYBACK
 * Removed all potential playback blockers
 */

// ─── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
    API_KEY: '3814ec092bdf6cb3d3d3929bce608f37',
    BASE_URL: 'https://api.themoviedb.org/3',
    IMG_PATH: 'https://image.tmdb.org/t/p/original',
    IMG_W500: 'https://image.tmdb.org/t/p/w500'
};

// Detect if running inside iframe
const IS_NESTED_IFRAME = window.top !== window.self;

// ─── Player Sources (Most Stable Only) ──────────────────────────────────────────
// Using only the most reliable sources, removed complex fallback logic
const PLAYER_SOURCES = [
    (id, type) => type === 'tv'
        ? `https://vidsrc.cc/v2/embed/tv/${id}`
        : `https://vidsrc.cc/v2/embed/movie/${id}`,
    (id, type) => type === 'tv'
        ? `https://vidsrc.to/embed/tv/${id}`
        : `https://vidsrc.to/embed/movie/${id}`,
    (id, type) => type === 'tv'
        ? `https://embed.su/embed/tv/${id}`
        : `https://embed.su/embed/movie/${id}`,
];

const SOURCE_NAMES = ['VidSrc CC', 'VidSrc TO', 'Embed SU'];

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

// ─── Movie Store ─────────────────────────────────────────────────────────────────
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

// ─── Helpers ────────────────────────   ──────────────────────────────────────────
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

// ─── Event Delegation ──────────────────────────────────────────────────────────
document.addEventListener('click', e => {
    const playBtn = e.target.closest('.card-play-btn');
    if (playBtn) { e.stopPropagation(); openPlayer(Number(playBtn.dataset.id), playBtn.dataset.type); return; }

    const wBtn = e.target.closest('.watchlist-btn');
    if (wBtn) { e.stopPropagation(); toggleWatchlist(Number(wBtn.dataset.wid), e); return; }

    const card = e.target.closest('.card[data-id]');
    if (card) { 
        e.stopPropagation();
        const m = getMovie(Number(card.dataset.id)); 
        if (m) openPlayer(Number(card.dataset.id), card.dataset.type);
        return; 
    }

    const priceBox = e.target.closest('.price-box');
    if (priceBox) {
        document.querySelectorAll('.price-box').forEach(b => b.classList.remove('selected'));
        priceBox.classList.add('selected'); return;
    }
    
    const userMenu = document.getElementById('user-menu');
    if (userMenu && !e.target.closest('#user-profile-btn')) userMenu.classList.remove('open');
    if (e.target.id === 'auth-modal')    closeAuthModal();
    if (e.target.id === 'premium-modal') closePremiumModal();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('card')) {
        const m = getMovie(Number(e.target.dataset.id)); 
        if (m) openPlayer(Number(e.target.dataset.id), e.target.dataset.type);
    }
    if (e.key === 'Escape') { closePlayerModal(); closeAuthModal(); closePremiumModal(); }
    if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault(); 
        document.getElementById('movie-search')?.focus();
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
        if (heroMovieId !== movie.id) return;
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

    const extraEl = document.getElementById('hero-extra');
    if (extraEl) {
        extraEl.innerHTML = '';
        try {
            const credits = await apiFetch(`${type}/${movie.id}/credits`);
            if (heroMovieId !== movie.id) return;
            const cast = (credits?.cast || []).slice(0, 5);
            if (cast.length) {
                const castHTML = cast.map(p => `
                    <div class="hero-cast-member">
                        <div class="hero-cast-avatar" style="${p.profile_path ? `background-image:url(${CONFIG.IMG_W500}${p.profile_path})` : 'background:#333'}"></div>
                        <span class="hero-cast-name">${escHtml(p.name)}</span>
                    </div>`).join('');
                extraEl.innerHTML = `<div class="hero-cast-label">Starring</div><div class="hero-cast-row">${castHTML}</div>`;
            }
        } catch(e) {}
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
let _heroIndex = 0;

function startHeroRotation(movies) {
    _heroMovies = movies;
    _heroIndex = 0;
    clearInterval(_heroRotationTimer);

    // Build dot indicators
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

    _heroRotationTimer = setInterval(_heroAdvance, 8000);
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
        if (i === index) {
            opt.classList.add(state === 'loading' ? 'loading' : 'active');
        }
    });
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('#psource-wrap')) {
        document.getElementById('psrc-dropdown')?.classList.remove('visible');
        document.getElementById('psrc-menu-btn')?.classList.remove('open');
    }
}, true);

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

    seasonSel.innerHTML = '';
    for (let s = 1; s <= totalSeasons; s++) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `Season ${s}`;
        if (s === initialSeason) opt.selected = true;
        seasonSel.appendChild(opt);
    }

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
    playerSourceIndex = 0;
    _playTvEpisode();
}

function onEpisodeChange() {
    const episodeSel = document.getElementById('episode-select');
    if (!episodeSel) return;
    tvState.episode = Number(episodeSel.value);
    _updateNavButtons();
    playerSourceIndex = 0;
    _playTvEpisode();
}

async function navEpisode(dir) {
    const newEp = tvState.episode + dir;
    if (newEp < 1) {
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
    playerSourceIndex = 0;
    _playTvEpisode();
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
    const url = PLAYER_SOURCES[playerSourceIndex](
        `${id}/${tvState.season}/${tvState.episode}`, 'tv'
    );
    const player = document.getElementById('main-player');
    const loader = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');
    if (loader)   loader.style.display = 'flex';
    if (errorBox) errorBox.style.display = 'none';
    clearTimeout(playerTimeout);
    clearTimeout(_playerLoadCooldown);
    if (player) {
        player.onload = () => {
            clearTimeout(playerTimeout);
            if (loader)   loader.style.display = 'none';
            if (errorBox) errorBox.style.display = 'none';
            _syncSourceDropdown(playerSourceIndex, 'active');
        };
        player.onerror = () => {
            clearTimeout(playerTimeout);
            if (playerSourceIndex < PLAYER_SOURCES.length - 1) {
                playerSourceIndex++;
                _playTvEpisode(true);
            } else {
                if (loader)   loader.style.display = 'none';
                if (errorBox) errorBox.style.display = 'flex';
            }
        };
        player.src = url;
        playerTimeout = setTimeout(() => {
            if (playerSourceIndex < PLAYER_SOURCES.length - 1) {
                playerSourceIndex++;
                _playTvEpisode(true);
            } else {
                playerSourceIndex = 0;
                if (loader)   loader.style.display = 'none';
                if (errorBox) errorBox.style.display = 'flex';
            }
        }, 12000);
    }
    const metaEl = document.getElementById('player-meta');
    if (metaEl) metaEl.textContent = `S${tvState.season} · E${tvState.episode}`;
}

// ─── PLAYER CORE (SIMPLIFIED - NO BLOCKERS) ───────────────────────────────────
let playerSourceIndex  = 0;
let currentPlayerMovie = null;
let playerTimeout      = null;
let _playerLoadCooldown = null;

function openPlayer(id, type) { 
    _doOpenPlayer(id, type); 
}

async function _doOpenPlayer(id, type) {
    const movie = getMovie(id);
    if (!movie) return;

    // Pause hero rotation while player is open
    clearInterval(_heroRotationTimer);
    _heroRotationTimer = null;
    
    currentPlayerMovie = { id, type, title: movie?.title || movie?.name || 'Now Playing' };
    playerSourceIndex  = 0;

    const modal    = document.getElementById('player-modal');
    const titleEl  = document.getElementById('player-title');
    const metaEl   = document.getElementById('player-meta');
    const epRow    = document.getElementById('pepisode-row');
    const infoRow  = document.getElementById('pinfo-row');

    if (!modal) return;

    const player = document.getElementById('main-player');
    if (player) {
        player.onload = null;
        player.onerror = null;
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Restore ad column and start skip countdown
    const adRight = document.getElementById('player-ad-right');
    if (adRight) adRight.style.display = '';
    startSkipAdCountdown();
    
    if (titleEl) titleEl.textContent = currentPlayerMovie.title;

    if (infoRow) {
        const year   = (movie?.release_date || movie?.first_air_date || '').slice(0,4);
        const rating = movie?.vote_average ? `⭐ ${Number(movie.vote_average).toFixed(1)}` : '';
        infoRow.innerHTML = [
            rating && `<span class="pinfo-chip rating">${escHtml(rating)}</span>`,
            year   && `<span class="pinfo-chip">${escHtml(year)}</span>`,
        ].filter(Boolean).join('');
    }

    if (type === 'tv') {
        if (epRow) epRow.style.display = 'flex';
        if (metaEl) metaEl.textContent = 'S1 · E1';
        tvState = { showId: id, totalSeasons: 1, season: 1, episode: 1, maxEpisode: 1 };
        playerSourceIndex = 0;
        const details = await apiFetch(`tv/${id}`);
        if (details) {
            tvState.totalSeasons = details.number_of_seasons || 1;
            await buildEpisodeUI(id, tvState.totalSeasons, 1, 1);
        }
        _playTvEpisode(); // ← actually start playing
    } else {
        if (epRow) epRow.style.display = 'none';
        if (metaEl) metaEl.textContent = '';
        _loadPlayerSource();
    }
}

function _loadPlayerSource() {
    if (!currentPlayerMovie || !currentPlayerMovie.id) return;

    const { id, type } = currentPlayerMovie;
    const player = document.getElementById('main-player');
    const loader = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');

    if (!player) return;

    clearTimeout(playerTimeout);
    clearTimeout(_playerLoadCooldown);

    if (loader)   loader.style.display = 'flex';
    if (errorBox) errorBox.style.display = 'none';

    _syncSourceDropdown(playerSourceIndex, 'loading');

    const urlId = type === 'tv'
        ? `${id}/${tvState.season}/${tvState.episode}`
        : String(id);
    
    const url = PLAYER_SOURCES[playerSourceIndex](urlId, type);

    console.log('Loading source:', playerSourceIndex, url);

    player.onload = () => {
        console.log('Player loaded successfully');
        clearTimeout(playerTimeout);
        if (loader)   loader.style.display = 'none';
        if (errorBox) errorBox.style.display = 'none';
        _syncSourceDropdown(playerSourceIndex, 'active');

        // Watch for the iframe going blank/broken after load (stream died)
        _playerLoadCooldown = setTimeout(() => {
            try {
                // If iframe src was cleared or navigated away, retry next source
                if (player.src && !player.src.includes(url.split('/embed')[1]?.split('/')[0] || '___')) return;
            } catch(e) {}
        }, 3000);
    };

    player.onerror = () => {
        console.log('Player error, trying next source');
        clearTimeout(playerTimeout);
        // Auto-advance to next source instead of just showing error
        if (playerSourceIndex < PLAYER_SOURCES.length - 1) {
            playerSourceIndex++;
            _loadPlayerSource();
        } else {
            if (loader)   loader.style.display = 'none';
            if (errorBox) errorBox.style.display = 'flex';
        }
    };

    player.src = url;

    // Timeout: auto-advance to next source, show error only on last
    playerTimeout = setTimeout(() => {
        console.log('Source timeout - switching');
        if (playerSourceIndex < PLAYER_SOURCES.length - 1) {
            playerSourceIndex++;
            _loadPlayerSource();
        } else {
            // All sources tried — reset and let user pick manually
            playerSourceIndex = 0;
            if (loader)   loader.style.display = 'none';
            if (errorBox) errorBox.style.display = 'flex';
        }
    }, 12000);
}

function tryNextSource() {
    if (!currentPlayerMovie) return;
    if (playerSourceIndex < PLAYER_SOURCES.length - 1) {
        playerSourceIndex++;
        _loadPlayerSource();
    }
}

function trySourceAt(index) {
    if (!currentPlayerMovie) return;
    playerSourceIndex = index;
    _loadPlayerSource();
}

function closePlayerModal() {
    // Resume hero rotation if it was running
    if (_heroMovies.length && !_heroRotationTimer) {
        _heroRotationTimer = setInterval(_heroAdvance, 8000);
    }
    clearTimeout(playerTimeout);
    clearTimeout(_playerLoadCooldown);
    
    const modal    = document.getElementById('player-modal');
    const player   = document.getElementById('main-player');
    const loader   = document.getElementById('player-loader');
    const errorBox = document.getElementById('player-error');
    const epRow    = document.getElementById('pepisode-row');
    
    if (!modal) return;
    
    if (player) {
        player.onload = null; 
        player.onerror = null;
        player.src = '';
        player.removeAttribute('src');
    }
    
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
    
    currentPlayerMovie = null;
    playerSourceIndex  = 0;
    
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

// ─── Premium ──────────────────────────────────────────────────────────────────
function openPremiumModal() { 
    window.location.href = 'payment.html';
}

function setupPremiumBtn() {
    const premiumBtn = document.getElementById('premium-nav-btn');
    if (premiumBtn) {
        if (currentUser && currentUser.elite) {
            premiumBtn.style.display = 'none';
        } else {
            premiumBtn.style.display = 'block';
            premiumBtn.onclick = openPremiumModal;
        }
    }
}

function closePremiumModal() { closeAuthModal(); }

// ─── Skip Ad ───────────────────────────────────────────────────────────────────
let _skipAdTimer = null;

function startSkipAdCountdown() {
    const btn       = document.getElementById('skip-ad-btn');
    const countdown = document.getElementById('skip-ad-countdown');
    if (!btn || !countdown) return;

    btn.disabled = true;
    let secs = 5;
    countdown.textContent = secs;

    clearInterval(_skipAdTimer);
    _skipAdTimer = setInterval(() => {
        secs--;
        countdown.textContent = secs;
        if (secs <= 0) {
            clearInterval(_skipAdTimer);
            btn.disabled = false;
            countdown.textContent = '✕';
        }
    }, 1000);
}

function skipAd() {
    clearInterval(_skipAdTimer);
    // Hide just the ad slot and skip button, not the whole column
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
    filterByGenre(GENRE_FILTERS[0].url);
    refreshWatchlistRow();

    apiFetch('trending/all/week').then(data => {
        const heroMovies = (data?.results || []).filter(m => m.backdrop_path && m.overview).slice(0, 8);
        if (!heroMovies.length) return;
        updateHero(heroMovies[0]);
        startHeroRotation(heroMovies);
    });

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

    const searchInput = document.getElementById('movie-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') handleSearch(searchInput.value);
        });

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
            if (document.activeElement === searchInput) return;
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