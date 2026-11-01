// --- ВСТАВЬ СВОИ КЛЮЧИ СЮДА ---
const KP_API_KEY = '7e115cee-1cd5-4b7a-8e6a-534c97594942'; 
const TMDB_API_KEY = 'c13229fe729d41bf0820d12548bc4845'; 
// ------------------------------

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMG_URL = 'https://image.tmdb.org/t/p/w500';
const KP_BASE_URL = 'https://kinopoiskapiunofficial.tech/api/v2.1';

let currentGenre = ''; 
let currentMovie = null;
let isSpinning = false;
let isFirstSpin = true;
let isFavoritesView = false;
let lastMovieTitle = "";

const moviesCache = {}; // Кэш для мгновенного доступа
let favorites = JSON.parse(localStorage.getItem('kinoroulette_favorites')) || [];

const genreMap = {
    "28": "Боевик", "12": "Приключения", "35": "Комедия", "80": "Криминал",
    "18": "Драма", "14": "Фэнтези", "27": "Ужасы", "878": "Фантастика", "53": "Триллер"
};

const customMovies = [
    { title: "Бойцовский клуб", genre: "28" }, { title: "Джон Уик", genre: "28" },
    { title: "Дэдпул", genre: "28" }, { title: "Форсаж", genre: "28" },
    { title: "Быстрее пули", genre: "28" }, { title: "Особо опасен", genre: "28" },
    { title: "Гран Туризмо", genre: "28" },
    { title: "Непосредственно Каха", genre: "35" },
    { title: "Аватар", genre: "878" },
    { title: "Пятница 13", genre: "27" },
    { title: "Форд против Феррари", genre: "18" }, { title: "Гонка", genre: "18" },
    { title: "F1", genre: "18" }
];

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ==========================================
// ПРЕДЗАГРУЗКА ВСЕХ ЖАНРОВ ПРИ СТАРТЕ (Убирает лаги)
// ==========================================
async function preloadAllGenres() {
    const genres = ['', '28', '12', '35', '80', '18', '14', '27', '878', '53'];
    for (let g of genres) {
        if (!moviesCache[g]) {
            await preloadTMDBMovies(g);
        }
    }
}

async function preloadTMDBMovies(genre) {
    if (moviesCache[genre]) return; 
    try {
        let allMovies = [];
        for (let page = 1; page <= 5; page++) {
            let url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=ru-RU&sort_by=popularity.desc&vote_count.gte=100&vote_average.gte=6.0&without_genres=16&page=${page}`;
            if (genre) url += `&with_genres=${genre}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Ошибка API TMDB");
            const data = await res.json();
            if (data.results) {
                const valid = data.results.filter(m => m.poster_path && m.overview && m.overview.trim().length > 20);
                allMovies = allMovies.concat(valid);
            }
        }
        moviesCache[genre] = Array.from(new Map(allMovies.map(item => [item.id, item])).values());
    } catch (e) { console.log("Ошибка загрузки TMDB:", e); }
}

// ==========================================
// ОБНОВЛЕНИЕ КАРТОЧКИ (Без лагов и стирания рейтинга)
// ==========================================
async function fetchFromKinopoisk(title) {
    try {
        const url = `${KP_BASE_URL}/films/search-by-keyword?keyword=${encodeURIComponent(title)}&page=1`;
        const res = await fetch(url, { headers: { 'X-API-KEY': KP_API_KEY } });
        if (!res.ok) return null;
        const data = await res.json();
        
        if (data.films && data.films.length > 0) {
            let film = data.films.find(f => f.type === "FILM") || data.films[0];
            let finalTitle = film.nameRu || film.nameEn || title;
            if (finalTitle.includes("13-е")) finalTitle = "Пятница 13";
            return {
                title: finalTitle,
                rating: film.ratingKinopoisk || film.ratingImdb || null,
                year: film.year ? film.year.toString() : "----",
                overview: film.description || null,
                poster: film.posterUrlPreview,
                ageRating: film.ratingAgeLimits || ""
            };
        }
        return null;
    } catch (error) { return null; }
}

let currentCardRequestId = 0;

async function updateCard(movie) {
    if (!movie) return;
    currentMovie = movie;

    currentCardRequestId++;
    const requestId = currentCardRequestId;

    const posterImg = document.getElementById('poster');
    const posterBg = document.getElementById('posterBg');
    const titleEl = document.getElementById('title');
    const descEl = document.getElementById('description');
    const ratingEl = document.getElementById('rating');
    const yearEl = document.getElementById('year');
    const adultBadge = document.getElementById('adultBadge');
    const genreBadge = document.getElementById('genreBadge');
    
    // 1. ОЧИСТКА
    posterImg.classList.remove('loaded');
    posterImg.src = ""; 
    posterBg.innerHTML = movie.title;
    posterBg.classList.remove('hidden');

    // 2. БАЗОВЫЙ ТЕКСТ
    titleEl.textContent = movie.title;
    titleEl.classList.remove('blinking-text'); 
    
    // Ставим рейтинг TMDB (он не пропадет, даже если Кинопоиск не ответит)
    let tmdbRating = movie.vote_average || movie.rating;
    ratingEl.textContent = (tmdbRating && tmdbRating > 0) ? tmdbRating.toFixed(1) : "—";
    let year = movie.release_date ? movie.release_date.split('-')[0] : (movie.year || "—");
    yearEl.textContent = year;
    
    descEl.textContent = movie.preloadedOverview || "Загрузка описания..."; 
    adultBadge.style.display = 'none';

    // Жанр
    if (currentGenre === '' && movie.genre_ids && movie.genre_ids.length > 0) {
        const firstGenreId = movie.genre_ids.find(id => genreMap[id.toString()]);
        if (firstGenreId) {
            genreBadge.textContent = genreMap[firstGenreId.toString()];
            genreBadge.style.display = 'inline-block';
        } else { genreBadge.style.display = 'none'; }
    } else { genreBadge.style.display = 'none'; }

    // 3. ЗАГРУЗКА ОБЛОЖКИ (сразу)
    let initialPoster = movie.poster_path ? TMDB_IMG_URL + movie.poster_path : (movie.poster ? movie.poster : null);
    
    let isFriday13 = false;
    if (movie.title && (movie.title.toLowerCase().includes("пятница 13") || movie.title.toLowerCase().includes("пятница, 13"))) {
        isFriday13 = true;
        initialPoster = "https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg"; 
        yearEl.textContent = "2009";
        descEl.textContent = "Компания друзей - Уитни, Майк, Ричи, Аманда и Уэйд - заблудилась в лесах около заброшенного лагеря «Хрустальное озеро»...";
        ratingEl.textContent = "5.9";
        adultBadge.textContent = "18+";
        adultBadge.style.display = 'inline-block';
    }

    if (initialPoster) {
        const tempImg = new Image();
        tempImg.onload = () => {
            if (requestId !== currentCardRequestId) return; 
            posterImg.src = tempImg.src;
            posterImg.classList.add('loaded');
            posterBg.classList.add('hidden');
        };
        tempImg.src = initialPoster;
    }

    // 4. ЗАПРОС К КИНОПОИСКУ (фоном)
    if (!isFriday13) {
        fetchFromKinopoisk(movie.title).then(kpData => {
            if (requestId !== currentCardRequestId) return; 
            
            if (kpData) {
                if (kpData.overview) descEl.textContent = kpData.overview;
                // Обновляем рейтинг ТОЛЬКО если Кинопоиск реально дал цифру
                if (kpData.rating && kpData.rating > 0) ratingEl.textContent = kpData.rating.toFixed(1);
                if (kpData.year && kpData.year !== "----") yearEl.textContent = kpData.year;
                
                if (kpData.poster && !initialPoster) {
                    const kpImg = new Image();
                    kpImg.onload = () => {
                        if (requestId !== currentCardRequestId) return;
                        posterImg.src = kpImg.src;
                        posterImg.classList.add('loaded');
                        posterBg.classList.add('hidden');
                    };
                    kpImg.src = kpData.poster;
                }

                // УМНЫЙ ЗНАЧОК 18+
                if (kpData.ageRating === "age18") { 
                    adultBadge.textContent = "18+"; adultBadge.style.display = 'inline-block'; 
                } else if (kpData.ageRating === "age16") { 
                    adultBadge.textContent = "16+"; adultBadge.style.display = 'inline-block'; 
                } else if (movie.adult || (movie.genre_ids && (movie.genre_ids.includes(27) || movie.genre_ids.includes(80)))) {
                    adultBadge.textContent = "18+"; adultBadge.style.display = 'inline-block';
                }
            } else {
                // Если Кинопоиск не ответил - ставим описание из TMDB
                if (movie.overview) descEl.textContent = movie.overview;
                if (movie.adult || (movie.genre_ids && movie.genre_ids.includes(27))) {
                    adultBadge.textContent = "18+"; adultBadge.style.display = 'inline-block';
                }
            }
        });
    }

    updateFavHeart();
}

// ==========================================
// ИЗБРАННОЕ (Сохраняем постер!)
// ==========================================
function toggleFavorite() {
    if (!currentMovie) return;
    const index = favorites.findIndex(m => m.title === currentMovie.title);
    const heartBtn = document.getElementById('favHeartBtn');

    if (index === -1) {
        favorites.push({
            title: currentMovie.title, 
            poster_path: currentMovie.poster_path, // Сохраняем путь к постеру
            poster: currentMovie.poster, 
            rating: currentMovie.rating,
            vote_average: currentMovie.vote_average, 
            year: currentMovie.year,
            release_date: currentMovie.release_date, 
            overview: currentMovie.overview,
            genre_ids: currentMovie.genre_ids
        });
        heartBtn.classList.add('active');
    } else {
        favorites.splice(index, 1);
        heartBtn.classList.remove('active');
    }
    localStorage.setItem('kinoroulette_favorites', JSON.stringify(favorites));
    
    if (isFavoritesView) renderFavoritesGrid();
}

function updateFavHeart() {
    const btn = document.getElementById('favHeartBtn');
    if (!currentMovie) return;
    const isFav = favorites.some(m => m.title === currentMovie.title);
    if (isFav) btn.classList.add('active');
    else btn.classList.remove('active');
}

function renderFavoritesGrid() {
    const grid = document.getElementById('favoritesGrid');
    grid.innerHTML = '';
    
    if (favorites.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Вы пока ничего не лайкнули.</p>';
        return;
    }

    favorites.forEach((movie, index) => {
        const posterUrl = movie.poster_path ? TMDB_IMG_URL + movie.poster_path : (movie.poster || 'https://via.placeholder.com/500x750/12121c/8b5cf6?text=' + encodeURIComponent(movie.title));
        
        const item = document.createElement('div');
        item.className = 'fav-item';
        item.innerHTML = `
            <img src="${posterUrl}" alt="${movie.title}" onerror="this.src='https://via.placeholder.com/500x750/12121c/8b5cf6?text=Error'">
            <button class="fav-remove" onclick="event.stopPropagation(); removeFavoriteFromGrid(${index})">×</button>
            <div class="fav-item-title">${movie.title}</div>
        `;
        
        item.onclick = () => {
            isFavoritesView = false;
            document.getElementById('favoritesGrid').classList.add('hidden');
            document.getElementById('filtersWrapper').style.display = 'none';
            document.getElementById('movieCard').classList.remove('hidden');
            document.getElementById('spinBtn').style.display = 'none';
            document.getElementById('mainSubtitle').textContent = "Фильм из вашего списка";
            updateCard(movie);
        };
        
        grid.appendChild(item);
    });
}

function removeFavoriteFromGrid(index) {
    favorites.splice(index, 1);
    localStorage.setItem('kinoroulette_favorites', JSON.stringify(favorites));
    renderFavoritesGrid();
}

function toggleFavoritesView() {
    if (isSpinning) return;
    isFavoritesView = !isFavoritesView;
    
    const favBtn = document.getElementById('favToggleBtn');
    const filtersWrapper = document.getElementById('filtersWrapper');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const card = document.getElementById('movieCard');
    const spinBtn = document.getElementById('spinBtn');
    const grid = document.getElementById('favoritesGrid');
    const subtitle = document.getElementById('mainSubtitle');

    if (isFavoritesView) {
        favBtn.classList.add('active');
        favBtn.innerHTML = 'Назад к рулетке';
        filtersWrapper.style.display = 'none';
        welcomeScreen.classList.add('hide');
        card.classList.add('hidden');
        spinBtn.style.display = 'none';
        subtitle.textContent = "Ваша личная коллекция";
        
        renderFavoritesGrid();
        grid.classList.remove('hidden');
        
        // Добавляем плавную анимацию для сетки фильмов
        grid.classList.add('fade-in-view');
        setTimeout(() => grid.classList.remove('fade-in-view'), 500);
    } else {
        favBtn.classList.remove('active');
        favBtn.innerHTML = 'Мои фильмы';
        grid.classList.add('hidden');
        filtersWrapper.style.display = 'flex';
        subtitle.textContent = "Выбери жанр и доверься рулетке";
        
        if (isFirstSpin) {
            welcomeScreen.classList.remove('hide');
            card.classList.add('hidden');
            spinBtn.style.display = 'flex';
            spinBtn.innerHTML = `КРУТИТЬ РУЛЕТКУ`;
        } else {
            card.classList.remove('hidden');
            spinBtn.style.display = 'flex';
            spinBtn.innerHTML = `КРУТИТЬ ЕЩЕ РАЗ`;
        }

        // Добавляем плавную анимацию для элементов рулетки
        const rouletteElements = [filtersWrapper, welcomeScreen, card];
        rouletteElements.forEach(el => {
            if (!el.classList.contains('hidden')) {
                el.classList.add('fade-in-view');
                setTimeout(() => el.classList.remove('fade-in-view'), 500);
            }
        });
    }
}

// ==========================================
// ЗАПУСК
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Запускаем фоновую предзагрузку ВСЕХ жанров сразу
    preloadAllGenres();

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (isSpinning || isFavoritesView) return; 
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const genreData = e.target.dataset.genre;
            currentGenre = genreData === 'all' ? '' : genreData;
            
            // Если кэш уже есть (благодаря предзагрузке) - запустится моментально
            spinRoulette();
        });
    });
});

async function spinRoulette() {
    if (isSpinning) return;
    const card = document.getElementById('movieCard');
    const btn = document.getElementById('spinBtn');
    const titleEl = document.getElementById('title');
    
    isSpinning = true;
    btn.disabled = true;
    btn.innerHTML = `КРУТИМ...`;
    document.getElementById('welcomeScreen').classList.add('hide');
    card.classList.remove('hidden');
    card.classList.remove('fade-in');
    card.classList.add('blur-out');

    // Если кэша нет - ждем максимум 1 секунду (чтобы не было вечного зависания)
    if (!moviesCache[currentGenre]) {
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 1000));
        await Promise.race([preloadTMDBMovies(currentGenre), timeoutPromise]);
    }

    let currentPool = [];
    let customFiltered = currentGenre === '' ? customMovies : customMovies.filter(m => m.genre === currentGenre);
    let tmdbMovies = moviesCache[currentGenre] || [];
    let combined = [...customFiltered, ...tmdbMovies];
    combined = Array.from(new Map(combined.map(item => [item.title, item])).values());
    currentPool = shuffleArray(combined).slice(0, 100);
    if (currentPool.length < 5) currentPool = customMovies; 

    // ВЫБИРАЕМ ФИНАЛЬНЫЙ ФИЛЬМ ЗАРАНЕЕ
    let finalMovie;
    do {
        finalMovie = currentPool[Math.floor(Math.random() * currentPool.length)];
    } while (finalMovie.title === lastMovieTitle && currentPool.length > 1);
    lastMovieTitle = finalMovie.title;

    // Предзагрузка описания (пока крутится)
    if (!finalMovie.preloadedOverview) {
        fetchFromKinopoisk(finalMovie.title).then(kpData => {
            if (kpData && kpData.overview) {
                finalMovie.preloadedOverview = kpData.overview; 
            }
        });
    }

    let counter = 0;
    const totalFlashes = 20; 
    const flashInterval = 60; 

    const interval = setInterval(() => {
        const randomMovie = currentPool[Math.floor(Math.random() * currentPool.length)];
        titleEl.textContent = randomMovie.title;
        titleEl.classList.add('blinking-text');

        counter++;
        if (counter >= totalFlashes) {
            clearInterval(interval);
            
            updateCard(finalMovie); 
            
            card.classList.remove('blur-out');
            card.classList.add('fade-in'); 
            titleEl.classList.remove('blinking-text');
            
            btn.disabled = false;
            btn.innerHTML = `КРУТИТЬ ЕЩЕ РАЗ`;
            isSpinning = false;
            isFirstSpin = false;
        }
    }, flashInterval);
}

function openTrailer() {
    if(!currentMovie) return;
    window.open(`https://vk.com/video?q=${encodeURIComponent(currentMovie.title + ' трейлер')}`, '_blank');
}

function searchVK() {
    if(!currentMovie) return;
    window.open(`https://vk.com/video?q=${encodeURIComponent(currentMovie.title + ' Кинобро')}`, '_blank');
}
