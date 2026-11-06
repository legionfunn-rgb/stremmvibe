/* =========================================================
   StreamVibe — общий UI-слой
   Модальные окна (с фокус-ловушкой и Esc), уведомления,
   шапка, мобильное меню, анимации, параллакс и наклон карточек.
   Остальные модули (catalog, auth, plans) используют SV.ui.
   ========================================================= */
(function () {
  "use strict";

  const SV = (window.SV = window.SV || {});

  /* ---------- Утилиты ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ready = (fn) => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  };

  // Безопасная работа с localStorage: может быть недоступен (приватный режим, запрет cookies)
  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  // Экранирование для вставки в innerHTML
  const esc = (str) =>
    String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

  SV.$ = $;
  SV.$$ = $$;
  SV.storage = storage;
  SV.esc = esc;

  /* ---------- Модальные окна ---------- */
  const modalStack = [];
  let lastFocused = null;

  const isVisible = (el) => !!el.getClientRects().length;

  const getFocusable = (root) =>
    $$(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      root
    ).filter(isVisible);

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    // Открываем только одно окно за раз: предыдущее закрываем
    if (!modalStack.length) lastFocused = document.activeElement;
    while (modalStack.length) closeModal(modalStack[modalStack.length - 1], { silent: true });
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    modalStack.push(id);
    document.body.classList.add("is-locked");

    // Фокус на первое поле или кнопку внутри окна
    setTimeout(() => {
      const first = getFocusable(modal).find((el) => el.matches("input, select, textarea")) || getFocusable(modal)[0];
      if (first) first.focus({ preventScroll: true });
    }, 60);
  }

  function closeModal(id, opts = {}) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    const idx = modalStack.indexOf(id);
    if (idx !== -1) modalStack.splice(idx, 1);

    if (!modalStack.length) {
      document.body.classList.remove("is-locked");
      if (!opts.silent && lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus({ preventScroll: true });
      }
    }
  }

  const closeTopModal = () => {
    if (modalStack.length) closeModal(modalStack[modalStack.length - 1]);
  };

  // Ловушка фокуса внутри открытого окна
  document.addEventListener("keydown", (e) => {
    if (!modalStack.length) return;
    const modal = document.getElementById(modalStack[modalStack.length - 1]);

    if (e.key === "Escape") {
      e.preventDefault();
      closeTopModal();
      return;
    }
    if (e.key !== "Tab") return;

    const items = getFocusable(modal);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ---------- Уведомления ---------- */
  function toast(message, type = "info", timeout = 4200) {
    const stack = $("#toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast" + (type !== "info" ? " is-" + type : "");
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.textContent = message; // textContent — безопасно для любого текста
    stack.appendChild(el);

    setTimeout(() => {
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 320);
    }, timeout);
  }

  SV.ui = { openModal, closeModal, closeTopModal, toast };

  /* ---------- Шапка и мобильное меню ---------- */
  function initHeader() {
    const header = $(".site-header");
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const burger = $("#burger");
    const menu = $("#mobile-menu");
    const setMenu = (open) => {
      menu.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    };
    burger.addEventListener("click", () => setMenu(!menu.classList.contains("is-open")));
    menu.addEventListener("click", (e) => { if (e.target.closest("a, button")) setMenu(false); });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("is-open")) setMenu(false);
    });
    window.addEventListener("resize", () => { if (window.innerWidth > 1024) setMenu(false); });
  }

  /* ---------- Закрытие окон по клику на фон и крестик ---------- */
  function initModalClose() {
    document.addEventListener("click", (e) => {
      const closer = e.target.closest("[data-close-modal]");
      if (!closer) return;
      const modal = closer.closest(".modal");
      if (modal) closeModal(modal.id);
    });
  }

  /* ---------- Появление при скролле ---------- */
  function initReveal() {
    const els = $$(".reveal");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("IntersectionObserver" in window) || reduce) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Параллакс в hero (слои читаются при каждом движении) ---------- */
  function initParallax() {
    const stage = $("#hero-stage");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!stage || !finePointer || reduce) return;

    const zs = [-80, 40, -20, 90];
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

    const render = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      stage.querySelectorAll(".layer").forEach((layer, i) => {
        const depth = parseFloat(layer.dataset.depth) || 1;
        const k = depth * 14;
        layer.style.transform = `translate3d(${(cx * k).toFixed(2)}px, ${(cy * k).toFixed(2)}px, ${zs[i] ?? 0}px) rotate(${layer.dataset.rot || 0}deg)`;
      });
      raf = Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(render) : null;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(render); };

    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      kick();
    });
    stage.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
  }

  /* ---------- Наклон карточек тарифов и отзывов ---------- */
  function initTilt() {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reduce) return;

    $$(".plan, .feature, .review").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 10).toFixed(2)}deg) translateY(-6px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------- Старт ---------- */
  ready(() => {
    initHeader();
    initModalClose();
    initReveal();
    initParallax();
    initTilt();
  });
})();
