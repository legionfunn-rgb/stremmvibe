/* =========================================================
   Изменение 03: «Настроение сегодня» (обыгровка)
   Три кнопки в hero: меняют цвета акцентов сайта и открывают
   подборку нужного жанра. Повторный клик выключает настроение.
   Выбор запоминается в браузере.
   Подключение: в index.html после строки с plans.js добавить
   <script src="изменения/03-mood-switch.js"></script>
   ========================================================= */
(function () {
  "use strict";

  const SV = window.SV;
  if (!SV || !SV.catalog) return;

  const KEY = "sv_mood";
  const MOODS = {
    fun:      { label: "Весело",       from: "#f59e0b", to: "#ef4444", genre: "Комедия" },
    tense:    { label: "Напряжённо",   from: "#0ea5e9", to: "#6d28d9", genre: "Триллер" },
    inspired: { label: "Вдохновляюще", from: "#22c55e", to: "#06b6d4", genre: "Фантастика" }
  };

  const style = document.createElement("style");
  style.textContent = `
    .mood { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 22px; }
    .mood-label { font-size: .9rem; color: var(--muted); margin-right: 4px; }
    .mood button {
      font: inherit;
      font-size: .88rem;
      font-weight: 600;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      transition: transform .2s ease, background-color .2s ease;
    }
    .mood button:hover { transform: translateY(-1px); background: var(--surface-strong); }
    .mood button[aria-pressed="true"] {
      color: #fff;
      background: var(--accent-grad);
      border-color: transparent;
      box-shadow: var(--glow);
    }
  `;
  document.head.appendChild(style);

  // «#rrggbb» -> «rgba(r, g, b, a)»
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  function applyColors(m) {
    const root = document.documentElement.style;
    if (!m) {
      ["--accent-1", "--accent-2", "--glow"].forEach((p) => root.removeProperty(p));
      return;
    }
    root.setProperty("--accent-1", m.from);
    root.setProperty("--accent-2", m.to);
    root.setProperty("--glow", `0 0 24px ${rgba(m.from, 0.45)}, 0 0 48px ${rgba(m.to, 0.25)}`);
  }

  function setMood(key, { filter = true } = {}) {
    const m = MOODS[key] || null;
    applyColors(m);
    box.querySelectorAll("[data-mood]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.mood === key))
    );
    try {
      if (m) localStorage.setItem(KEY, key);
      else localStorage.removeItem(KEY);
    } catch (e) { /* хранилище недоступно: просто не запоминаем */ }
    if (m && filter) SV.catalog.quickFilter({ genre: m.genre });
  }

  // Блок с кнопками: в конец текстовой части hero
  const box = document.createElement("div");
  box.className = "mood";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "Настроение сегодня");
  box.innerHTML =
    '<span class="mood-label">Настроение сегодня:</span>' +
    Object.entries(MOODS)
      .map(([key, m]) => `<button type="button" data-mood="${key}" aria-pressed="false">${m.label}</button>`)
      .join("");

  const copy = document.querySelector(".hero-copy");
  if (copy) copy.appendChild(box);

  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mood]");
    if (!b) return;
    if (b.getAttribute("aria-pressed") === "true") setMood(null);
    else setMood(b.dataset.mood);
  });

  // Восстанавливаем выбор без прокрутки страницы
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (saved && MOODS[saved]) setMood(saved, { filter: false });
})();
