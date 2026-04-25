/**
 * BOOMFLIX - Optimized Core Logic
 * Powered by TMDB API
 */

const CONFIG = {
    API_KEY: '3814ec092bdf6cb3d3d3929bce608f37', // Provided by user
    BASE_URL: 'https://api.themoviedb.org/3',
    IMG_PATH: 'https://image.tmdb.org/t/p/original',
    IMG_W500: 'https://image.tmdb.org/t/p/w500'
};

const CATEGORIES = [
    { name: 'Trending Now', url: 'trending/all/day' },
    { name: 'Nollywood Hits', url: 'discover/movie?with_origin_country=NG' },
    { name: 'Sci-Fi Universe', url: 'discover/movie?with_genres=878' },
    { name: 'Action Hits', url: 'discover/movie?with_genres=28' },
    { name: 'Korean Cinema', url: 'discover/movie?with_original_language=ko' },
    { name: 'Bollywood Magic', url: 'discover/movie?with_original_language=hi|ta|te' },
    { name: 'Horror Nights', url: 'discover/movie?with_genres=27' }
];

/**
 * Fetch helper for TMDB API
 */
async function apiFetch(endpoint) {
    try {
        const connector = endpoint.includes('?') ? '&' : '?';
        const response = await fetch(`${CONFIG.BASE_URL}/${endpoint}${connector}api_key=${CONFIG.API_KEY}`);
        if (!response.ok) throw new Error('API request failed');
        return await response.json();
    } catch (error) {
        console.error('BOOMFLIX Error:', error);
        return null;
    }
}

/**
 * Initialize App
 */
async function init() {
    // 1. Load Hero Section
    const trending = await apiFetch('trending/all/week');
    if (trending?.results?.[0]) {
        updateHero(trending.results[0]);
    }

    // 2. Build Category Rows
    const wrapper = document.getElementById('categories-wrapper');
    if (!wrapper) return;

    for (const [index, cat] of CATEGORIES.entries()) {
        const row = document.createElement('div');
        row.className = 'category-row';
        row.innerHTML = `<h2>${cat.name}</h2><div class="movie-grid" id="grid-${index}"></div>`;
        wrapper.appendChild(row);
        
        loadRowContent(cat.url, `grid-${index}`);
    }

    // 3. Search Listener
    const searchInput = document.getElementById('movie-search');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
            handleSearch(searchInput.value.trim());
        }
    });
}

/**
 * Load movies into a specific grid
 */
async function loadRowContent(url, gridId) {
    const data = await apiFetch(url);
    const grid = document.getElementById(gridId);
    if (!grid || !data?.results) return;

    grid.innerHTML = data.results
        .filter(m => m.backdrop_path)
        .map(movie => `
            <div class="card" onclick='handleMovieClick(${JSON.stringify(movie).replace(/'/g, "&apos;")})'>
                <img src="${CONFIG.IMG_W500 + movie.backdrop_path}" loading="lazy" alt="${movie.title || movie.name}">
            </div>
        `).join('');
}

/**
 * Update Hero Section with movie data
 */
function updateHero(movie) {
    const hero = document.getElementById('hero-section');
    const title = document.getElementById('hero-title');
    const desc = document.getElementById('hero-desc');
    const playBtn = document.getElementById('hero-play');

    if (movie.backdrop_path) {
        hero.style.backgroundImage = `url(${CONFIG.IMG_PATH + movie.backdrop_path})`;
    }
    
    title.innerText = movie.title || movie.name || 'Featured Title';
    desc.innerText = movie.overview ? movie.overview.slice(0, 160) + '...' : 'Discover this exclusive title on BOOMFLIX.';
    
    const type = movie.title ? 'movie' : 'tv';
    playBtn.onclick = () => openPlayer(movie.id, type);
}

/**
 * Handle card click (Update hero and scroll up)
 */
function handleMovieClick(movie) {
    updateHero(movie);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Search Functionality
 */
async function handleSearch(query) {
    const wrapper = document.getElementById('categories-wrapper');
    let searchRow = document.getElementById('search-row');
    
    if (!searchRow) {
        searchRow = document.createElement('div');
        searchRow.id = 'search-row';
        searchRow.className = 'category-row';
        wrapper.prepend(searchRow);
    }
    
    searchRow.innerHTML = `<h2 style="color: var(--primary)">Results for: ${query}</h2><div class="movie-grid" id="search-grid"></div>`;
    loadRowContent(`search/multi?query=${encodeURIComponent(query)}`, 'search-grid');
    searchRow.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Video Player Controls
 */
/**
 * Video Player Controls - Optimized for instant playback
 */
function openPlayer(id, type) {
    const modal = document.getElementById('player-modal');
    const player = document.getElementById('main-player');
    
    // Clear previous source to ensure a fresh load
    player.src = 'about:blank';
    
    // Set the new source with autoplay enabled
    // We use a slight timeout or immediate assignment to ensure the modal shows while loading
    const videoUrl = `https://vidsrc.xyz/embed/${type}/${id}?autoplay=1`;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Assign source after modal is visible to prioritize rendering
    setTimeout(() => {
        player.src = videoUrl;
    }, 50);
}

function closePlayerModal() {
    const modal = document.getElementById('player-modal');
    const player = document.getElementById('main-player');
    const loader = document.getElementById('player-loader');
    
    modal.style.display = 'none';
    player.src = '';
    loader.style.display = 'flex'; // Reset loader for next play
    document.body.style.overflow = 'auto';
}

/**
 * UI Enhancements
 */
window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (window.scrollY > 50) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
});

// Run Init
document.addEventListener('DOMContentLoaded', init);

/**
 * Premium Modal Controls
 */
function openPremiumModal() {
    const modal = document.getElementById('premium-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePremiumModal() {
    const modal = document.getElementById('premium-modal');
    modal.style.display = 'none';
    if (document.getElementById('player-modal').style.display !== 'flex') {
        document.body.style.overflow = 'auto';
    }
}

// Handle price box selection
document.addEventListener('click', (e) => {
    if (e.target.closest('.price-box')) {
        document.querySelectorAll('.price-box').forEach(box => box.classList.remove('selected'));
        e.target.closest('.price-box').classList.add('selected');
    }
});
