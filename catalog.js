/* =========================================================
   StreamVibe — каталог
   • Фильтры: тип, жанр (несколько), поиск, год, страна, рейтинг, сортировка
   • Ленты на главной, герой-стопка, «Мой список»
   • Карточка тайтла в модальном окне
   • Необязательная подгрузка постеров и рейтингов из TMDB
   ========================================================= */
(function () {
  "use strict";

  const SV = window.SV;
  const $ = SV.$;
  const $$ = SV.$$;
  const esc = SV.esc;
  const storage = SV.storage;

  const LIST_KEY = "sv_my_list";
  const TMDB_CACHE_KEY = "sv_tmdb_cache";
  const TMDB_TTL = 7 * 24 * 60 * 60 * 1000; // неделя

  const HERO_IDS = ["godfather", "inception", "forrest-gump", "dark"];
  const HERO_LAYERS = [
    { depth: 0.6, rot: -8 },
    { depth: 1.2, rot: 2 },
    { depth: 0.8, rot: 9 },
    { depth: 1.6, rot: -3 }
  ];

  const TYPE_LABEL = { movie: "Фильм", series: "Сериал", doc: "Документальный", anime: "Аниме" };

  const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.1 8.6 22 9.3 17 14.1 18.2 21 12 17.6 5.8 21 7 14.1 2 9.3 8.9 8.6"/></svg>';
  const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  const DEFAULT_STATE = {
    type: "all",
    genres: [],
    search: "",
    yearFrom: "",
    yearTo: "",
    country: "",
    minRating: 0,
    sort: "rating"
  };
  let state = { ...DEFAULT_STATE, genres: [] };

  let titles = [];
  let searchTimer = null;

  const sorters = {
    rating: (a, b) => b.rating - a.rating || a.title.localeCompare(b.title, "ru"),
    new: (a, b) => b.year - a.year || b.rating - a.rating,
    old: (a, b) => a.year - b.year || b.rating - a.rating,
    title: (a, b) => a.title.localeCompare(b.title, "ru")
  };

  /* ---------- Утилиты ---------- */
  const ready = (fn) => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  };

  // Русское склонение: pluralRu(5, ["сезон", "сезона", "сезонов"]) -> "сезонов"
  function pluralRu(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  const byId = (id) => titles.find((t) => t.id === id);

  function prepare(raw) {
    return raw.map((t) => ({
      ...t,
      poster: SV.CONFIG.posterDir + t.id + ".jpg", // сначала локальный файл
      posterRemote: null,                           // запасной вариант из TMDB
      desc: t.description,
      ratingSource: "IMDb",
      countries: t.country.split(",").map((s) => s.trim()),
      searchText: [t.title, t.original, t.director, t.genres.join(" ")].join(" ").toLowerCase()
    }));
  }

  function lengthText(t) {
    if (t.type === "movie" && t.duration) return `${t.duration} мин`;
    if (t.mini) return "Мини-сериал";
    if (t.type === "doc" && t.episodes) return `${t.episodes} ${pluralRu(t.episodes, ["серия", "серии", "серий"])}`;
    if (t.seasons) return `${t.seasons} ${pluralRu(t.seasons, ["сезон", "сезона", "сезонов"])}`;
    return "";
  }

  // Запасной вариант, если картинка не загрузилась: пробуем TMDB, иначе убираем <img>
  SV.imgFallback = function (img) {
    const remote = img.dataset.fallback;
    if (remote && img.dataset.tried !== "1") {
      img.dataset.tried = "1";
      img.src = remote;
      return;
    }
    img.remove();
  };

  /* ---------- Мой список ---------- */
  function getList() {
    const list = storage.get(LIST_KEY, []);
    return Array.isArray(list) ? list : [];
  }
  const isInList = (id) => getList().includes(id);

  function toggleList(id) {
    const list = getList();
    const i = list.indexOf(id);
    let added;
    if (i === -1) {
      list.unshift(id);
      added = true;
    } else {
      list.splice(i, 1);
      added = false;
    }
    storage.set(LIST_KEY, list);
    return added;
  }

  /* ---------- Фильтрация и сортировка ---------- */
  function matches(t) {
    const s = state;
    if (s.type !== "all" && t.type !== s.type) return false;
    if (s.genres.length && !t.genres.some((g) => s.genres.includes(g))) return false;
    const q = s.search.trim().toLowerCase();
    if (q && !t.searchText.includes(q)) return false;
    if (s.yearFrom && t.year < Number(s.yearFrom)) return false;
    if (s.yearTo && t.year > Number(s.yearTo)) return false;
    if (s.country && !t.countries.includes(s.country)) return false;
    if (t.rating < s.minRating) return false;
    return true;
  }

  function filtered() {
    return titles.filter(matches).sort(sorters[state.sort] || sorters.rating);
  }

  /* ---------- HTML-шаблоны ---------- */
  function posterHTML(t, extra = "") {
    const bg = `linear-gradient(160deg, ${t.g[0]}, ${t.g[1]})`;
    return `
      <div class="poster" style="--poster-bg:${bg}">
        <span class="poster-fallback">${esc(t.title)}</span>
        <img src="${esc(t.poster)}" alt="" loading="lazy" data-fallback="${esc(t.posterRemote || "")}" onerror="SV.imgFallback(this)">
        ${extra}
      </div>`;
  }

  function cardHTML(t, badge = null) {
    const fav = isInList(t.id);
    const badgeHTML = badge ? `<span class="badge ${badge.cls || ""}">${esc(badge.text)}</span>` : "";
    const favLabel = fav ? "Убрать из списка" : "Добавить в список";
    return `
      <div class="card-wrap">
        <button type="button" class="card" data-open="${t.id}" aria-label="${esc(t.title)}, ${t.year}, рейтинг ${t.rating.toFixed(1)}">
          ${posterHTML(t, `<span class="rate">${STAR_SVG}${t.rating.toFixed(1)}</span>${badgeHTML}`)}
          <div class="card-meta">
            <strong>${esc(t.title)}</strong>
            <span>${t.year} · ${esc(TYPE_LABEL[t.type])}</span>
          </div>
        </button>
        <button type="button" class="card-fav" data-fav="${t.id}" aria-pressed="${fav}" aria-label="${favLabel}: ${esc(t.title)}" title="${favLabel}">
          ${fav ? CHECK_SVG : PLUS_SVG}
        </button>
      </div>`;
  }

  function emptyHTML() {
    return `
      <div class="empty glass">
        <h3>Ничего не нашли</h3>
        <p>Попробуйте убрать часть фильтров или изменить запрос.</p>
        <button type="button" class="btn btn-primary" data-reset-filters>Сбросить фильтры</button>
      </div>`;
  }

  /* ---------- Рендер ---------- */
  function renderHero() {
    const stage = $("#hero-stage");
    if (!stage) return;
    stage.querySelectorAll(".layer").forEach((el) => el.remove());

    const html = HERO_IDS.map((id, i) => {
      const t = byId(id);
      if (!t) return "";
      const L = HERO_LAYERS[i];
      return `
        <button type="button" class="layer layer-${i + 1}" data-open="${t.id}"
          data-depth="${L.depth}" data-rot="${L.rot}"
          style="background:linear-gradient(160deg, ${t.g[0]}, ${t.g[1]})"
          aria-label="Открыть: ${esc(t.title)}">
          <img src="${esc(t.poster)}" alt="" data-fallback="${esc(t.posterRemote || "")}" onerror="SV.imgFallback(this)">
          <span class="layer-tag">${esc(TYPE_LABEL[t.type])}</span>
          <span class="layer-title">${esc(t.title)}</span>
        </button>`;
    }).join("");
    stage.insertAdjacentHTML("beforeend", html);
  }

  function renderRail(name, list, badgeFn) {
    const rail = $(`[data-rail="${name}"]`);
    if (!rail) return;
    rail.innerHTML = list.map((t, i) => cardHTML(t, badgeFn ? badgeFn(t, i) : null)).join("");
  }

  function renderRails() {
    const byRating = [...titles].sort(sorters.rating);
    renderRail("top", byRating.slice(0, 10), (t, i) => (i < 3 ? { text: `№${i + 1}` } : null));
    renderRail(
      "series",
      byRating.filter((t) => t.type === "series").slice(0, 12)
    );
    renderRail(
      "new",
      [...titles].sort(sorters.new).slice(0, 12),
      (t, i) => (i < 3 ? { text: "Новинка", cls: "new" } : null)
    );

    const mine = getList().map(byId).filter(Boolean);
    const row = $('[data-row="mylist"]');
    if (row) row.hidden = mine.length === 0;
    renderRail("mylist", mine);
  }

  function renderCatalog() {
    const grid = $("#catalog-grid");
    const count = $("#results-count");
    if (!grid) return;
    const list = filtered();
    grid.innerHTML = list.length ? list.map((t) => cardHTML(t)).join("") : emptyHTML();
    if (count) count.innerHTML = `Найдено: <strong>${list.length}</strong> из ${titles.length}`;
  }

  function renderCounts() {
    $$("[data-genre-count]").forEach((el) => {
      const n = titles.filter((t) => t.genres.includes(el.dataset.genreCount)).length;
      el.textContent = `${n} ${pluralRu(n, ["тайтл", "тайтла", "тайтлов"])}`;
    });
    $$("[data-type-count]").forEach((el) => {
      const n = titles.filter((t) => t.type === el.dataset.typeCount).length;
      el.textContent = `${n} ${pluralRu(n, ["тайтл", "тайтла", "тайтлов"])}`;
    });
  }

  function updateMenuCount() {
    const el = $("#menu-list-count");
    if (el) el.textContent = String(getList().length);
  }

  function renderAll() {
    renderHero();
    renderRails();
    renderCatalog();
    updateMenuCount();
  }

  /* ---------- Панель фильтров ---------- */
  function initFilterOptions() {
    const years = [...new Set(titles.map((t) => t.year))].sort((a, b) => a - b);
    const yearOptions = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    $("#f-year-from").innerHTML = `<option value="">Любой</option>${yearOptions}`;
    $("#f-year-to").innerHTML = `<option value="">Любой</option>${yearOptions}`;

    const countries = [...new Set(titles.flatMap((t) => t.countries))].sort((a, b) => a.localeCompare(b, "ru"));
    $("#f-country").innerHTML =
      `<option value="">Любая</option>` + countries.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

    const counts = {};
    titles.forEach((t) => t.genres.forEach((g) => (counts[g] = (counts[g] || 0) + 1)));
    const genres = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, "ru"));
    $("#genre-chips").innerHTML = genres
      .map(
        (g) => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="false">${esc(g)} <span style="opacity:.6">${counts[g]}</span></button>`
      )
      .join("");
  }

  function updateRatingUI() {
    const input = $("#f-rating");
    const v = Number(input.value);
    state.minRating = v;
    $("#f-rating-out").textContent = v > 0 ? `от ${v.toFixed(1)}` : "Любой";
    input.style.setProperty("--fill", `${(v / 10) * 100}%`);
  }

  function syncControls() {
    $$("#type-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === state.type)));
    $$("#genre-chips .chip").forEach((c) => c.setAttribute("aria-pressed", String(state.genres.includes(c.dataset.genre))));
    $("#f-search").value = state.search;
    $("#f-year-from").value = state.yearFrom;
    $("#f-year-to").value = state.yearTo;
    $("#f-country").value = state.country;
    $("#f-rating").value = String(state.minRating);
    $("#f-sort").value = state.sort;
    updateRatingUI();
  }

  function resetFilters() {
    state = { ...DEFAULT_STATE, genres: [] };
    syncControls();
    renderCatalog();
  }

  // Быстрый фильтр: из разделов «Жанры», навигации и лент
  function quickFilter({ genre = null, type = null }) {
    state = { ...DEFAULT_STATE, genres: [] };
    if (genre) state.genres = [genre];
    if (type) state.type = type;
    syncControls();
    renderCatalog();
    const section = document.getElementById("catalog");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Карточка тайтла ---------- */
  function openTitle(id) {
    const t = byId(id);
    if (!t) return;
    const fav = isInList(id);
    const ratingSrc = t.ratingSource === "TMDB" ? "TMDB" : "IMDb · ориентировочно";
    const meta = [String(t.year), TYPE_LABEL[t.type], lengthText(t), t.country].filter(Boolean);

    $("#title-content").innerHTML = `
      <div class="detail-poster">${posterHTML(t)}</div>
      <div>
        <h2 id="title-name">${esc(t.title)}</h2>
        <p class="detail-original">${esc(t.original)}</p>
        <div class="detail-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
        <div class="detail-rating">${STAR_SVG}<strong>${t.rating.toFixed(1)}</strong><span>${ratingSrc}</span></div>
        <div class="detail-tags">${t.genres.map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</div>
        <p class="detail-desc">${esc(t.desc)}</p>
        <dl class="detail-info">
          <div><dt>Режиссёр</dt><dd>${esc(t.director)}</dd></div>
          <div><dt>Страна</dt><dd>${esc(t.country)}</dd></div>
        </dl>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary" data-watch="${t.id}">${PLAY_SVG}<span>Смотреть</span></button>
          <button type="button" class="btn btn-ghost" data-detail-fav="${t.id}" aria-pressed="${fav}">
            ${fav ? CHECK_SVG : PLUS_SVG}<span>${fav ? "В моём списке" : "В мой список"}</span>
          </button>
        </div>
      </div>`;

    SV.ui.openModal("title-modal");
  }

  // Кнопка «Смотреть» проверяет вход и подписку
  function watch(id) {
    const t = byId(id);
    const user = SV.auth && SV.auth.getUser ? SV.auth.getUser() : null;

    if (!user) {
      SV.ui.closeModal("title-modal");
      SV.auth.open("register", "Создайте аккаунт, чтобы начать просмотр.");
      return;
    }
    if (!user.plan) {
      SV.ui.closeModal("title-modal");
      SV.ui.toast("Выберите тариф, чтобы начать просмотр.");
      const pricing = document.getElementById("pricing");
      if (pricing) pricing.scrollIntoView({ behavior: "smooth" });
      return;
    }
    SV.ui.toast(`Воспроизведение (демо): «${t.title}»`, "success");
  }

  /* ---------- Обработчики ---------- */
  function bindEvents() {
    // Фильтры
    $("#f-search").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = e.target.value;
        renderCatalog();
      }, 150);
    });

    $("#type-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-type]");
      if (!btn) return;
      state.type = btn.dataset.type;
      syncControls();
      renderCatalog();
    });

    $("#genre-chips").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      const g = chip.dataset.genre;
      state.genres = state.genres.includes(g) ? state.genres.filter((x) => x !== g) : [...state.genres, g];
      syncControls();
      renderCatalog();
    });

    $("#f-year-from").addEventListener("change", (e) => { state.yearFrom = e.target.value; renderCatalog(); });
    $("#f-year-to").addEventListener("change", (e) => { state.yearTo = e.target.value; renderCatalog(); });
    $("#f-country").addEventListener("change", (e) => { state.country = e.target.value; renderCatalog(); });
    $("#f-sort").addEventListener("change", (e) => { state.sort = e.target.value; renderCatalog(); });
    $("#f-rating").addEventListener("input", () => { updateRatingUI(); renderCatalog(); });
    $("#f-reset").addEventListener("click", resetFilters);

    // Делегирование: карточки, ленты, жанры, кнопки в окнах
    document.addEventListener("click", (e) => {
      const open = e.target.closest("[data-open]");
      if (open) return openTitle(open.dataset.open);

      const fav = e.target.closest("[data-fav]");
      if (fav) {
        const id = fav.dataset.fav;
        toggleList(id);
        renderRails();
        renderCatalog();
        updateMenuCount();
        const t = byId(id);
        SV.ui.toast(isInList(id) ? `«${t.title}» добавлен в список` : `«${t.title}» убран из списка`, "success");
        return;
      }

      const detailFav = e.target.closest("[data-detail-fav]");
      if (detailFav) {
        const id = detailFav.dataset.detailFav;
        const added = toggleList(id);
        detailFav.setAttribute("aria-pressed", String(added));
        detailFav.querySelector("span").textContent = added ? "В моём списке" : "В мой список";
        detailFav.querySelector("svg").outerHTML = added ? CHECK_SVG : PLUS_SVG;
        renderRails();
        renderCatalog();
        updateMenuCount();
        return;
      }

      const watchBtn = e.target.closest("[data-watch]");
      if (watchBtn) return watch(watchBtn.dataset.watch);

      const chip = e.target.closest(".chip");
      if (chip) return; // чипы обрабатываются отдельно

      const genre = e.target.closest("[data-genre]");
      if (genre) return quickFilter({ genre: genre.dataset.genre });

      const quick = e.target.closest("[data-quick-type]");
      if (quick) return quickFilter({ type: quick.dataset.quickType });

      if (e.target.closest("[data-reset-filters]")) return resetFilters();
    });
  }

  /* ---------- TMDB (необязательно) ---------- */
  function yearOf(r) {
    return Number(((r.release_date || r.first_air_date) || "").slice(0, 4));
  }

  async function fetchTMDB(t, key) {
    const params = new URLSearchParams({
      api_key: key,
      language: SV.CONFIG.tmdbLanguage,
      query: t.original,
      include_adult: "false"
    });
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    const results = (json.results || []).filter((r) => r.media_type === "movie" || r.media_type === "tv");
    const hit = results.find((r) => yearOf(r) === t.year) || results[0];
    if (!hit) return null;
    return {
      poster: hit.poster_path ? SV.CONFIG.tmdbImageBase + hit.poster_path : null,
      overview: hit.overview || null,
      rating: hit.vote_count >= 50 ? Math.round(hit.vote_average * 10) / 10 : null
    };
  }

  function applyTMDB(t, d) {
    if (d.poster) t.posterRemote = d.poster;
    if (d.overview) t.desc = d.overview;
    if (d.rating) {
      t.rating = d.rating;
      t.ratingSource = "TMDB";
    }
  }

  async function loadTMDB() {
    const key = SV.CONFIG.tmdbApiKey;
    if (!key) return;

    const cache = storage.get(TMDB_CACHE_KEY, {});
    let dirty = false;

    await Promise.all(
      titles.map(async (t) => {
        let entry = cache[t.id];
        if (!entry || Date.now() - entry.ts > TMDB_TTL) {
          try {
            entry = { ts: Date.now(), data: await fetchTMDB(t, key) };
            cache[t.id] = entry;
            dirty = true;
          } catch (err) {
            entry = null; // сеть недоступна — остаются локальные данные
          }
        }
        if (entry && entry.data) applyTMDB(t, entry.data);
      })
    );

    if (dirty) storage.set(TMDB_CACHE_KEY, cache);
    renderAll();
  }

  /* ---------- Старт ---------- */
  ready(() => {
    titles = prepare(SV.titles || []);
    initFilterOptions();
    renderCounts();
    syncControls();
    bindEvents();
    renderAll();
    loadTMDB();
  });

  SV.catalog = {
    openTitle,
    quickFilter,
    toggleList,
    isInList,
    getList,
    byId,
    getTitles: () => titles,
    renderAll,
    updateMenuCount
  };
})();
