/* =========================================================
   Изменение 02: кнопка «Случайный фильм» (обыгровка)
   Выбирает случайный тайтл из тех, что видны в каталоге
   (учитываются фильтры). Перед открытием название «крутится».
   Подключение: в index.html после строки с plans.js добавить
   <script src="изменения/02-random-movie.js"></script>
   ========================================================= */
(function () {
  "use strict";

  const SV = window.SV;
  if (!SV || !SV.catalog) return;

  const style = document.createElement("style");
  style.textContent = `
    .rnd-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 18px;
      padding: 12px 22px;
      border: 0;
      border-radius: 999px;
      font: inherit;
      font-weight: 600;
      color: #fff;
      background: var(--accent-grad);
      box-shadow: var(--glow);
      cursor: pointer;
      transition: transform .25s ease;
    }
    .rnd-btn:hover:not(:disabled) { transform: translateY(-2px) scale(1.03); }
    .rnd-btn:disabled { cursor: progress; opacity: .85; }
    .rnd-btn svg { width: 20px; height: 20px; flex: none; }
    .rnd-btn.is-spinning svg { animation: rnd-spin .7s linear infinite; }
    .rnd-label { min-width: 12ch; text-align: left; }
    @keyframes rnd-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rnd-btn";
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="3"/>' +
    '<circle cx="8" cy="8" r="1.4" fill="currentColor"/>' +
    '<circle cx="12" cy="12" r="1.4" fill="currentColor"/>' +
    '<circle cx="16" cy="16" r="1.4" fill="currentColor"/>' +
    "</svg>" +
    '<span class="rnd-label">Случайный фильм</span>';

  const anchor = document.querySelector(".catalog-meta");
  if (anchor) anchor.parentNode.insertBefore(btn, anchor);

  const label = btn.querySelector(".rnd-label");
  const defaultText = label.textContent;
  let busy = false;

  // ID тайтлов, которые сейчас видны в каталоге
  const visibleIds = () =>
    Array.from(document.querySelectorAll("#catalog-grid [data-open]")).map((el) => el.dataset.open);

  btn.addEventListener("click", () => {
    if (busy) return;
    const ids = visibleIds();
    if (!ids.length) {
      SV.ui.toast("Под текущие фильтры ничего не подходит.", "error");
      return;
    }

    const pick = ids[Math.floor(Math.random() * ids.length)];
    busy = true;
    btn.disabled = true;
    btn.classList.add("is-spinning");

    // «Крутим» названия и постепенно замедляем
    let step = 0;
    const total = 12;
    const spin = () => {
      const t = SV.catalog.byId(ids[Math.floor(Math.random() * ids.length)]);
      label.textContent = t ? t.title : "...";
      step++;
      if (step < total) {
        setTimeout(spin, 50 + step * step * 3);
        return;
      }
      const chosen = SV.catalog.byId(pick);
      label.textContent = chosen ? chosen.title : defaultText;
      setTimeout(() => {
        SV.catalog.openTitle(pick);
        label.textContent = defaultText;
        btn.classList.remove("is-spinning");
        btn.disabled = false;
        busy = false;
      }, 500);
    };
    spin();
  });
})();
