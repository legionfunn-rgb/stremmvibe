/* =========================================================
   StreamVibe — вход, регистрация, личный кабинет
   ---------------------------------------------------------
   ВАЖНО: это демо-версия фронтенда. Пользователи хранятся в
   localStorage браузера, пароль хэшируется SHA-256 с солью.
   Для реального сайта нужен бэкенд (сессии на сервере, HTTPS,
   защита от перебора, подтверждение почты) — см. README.md.
   ========================================================= */
(function () {
  "use strict";

  const SV = window.SV;
  const $ = SV.$;
  const $$ = SV.$$;
  const esc = SV.esc;
  const storage = SV.storage;

  const USERS_KEY = "sv_users";
  const SESSION_KEY = "sv_session";
  const enc = new TextEncoder();

  const PLAN_NAMES = { basic: "Базовый", standard: "Стандарт", premium: "Премиум" };
  const PERIOD_NAMES = { month: "оплата за месяц", year: "оплата за год" };

  const ready = (fn) => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Криптография (пароль не хранится в открытом виде) ---------- */
  function randomHex(bytes = 16) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function hashPassword(password, salt) {
    const data = enc.encode(`${salt}:${password}`);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- Хранилище пользователей ---------- */
  function getUsers() {
    const users = storage.get(USERS_KEY, []);
    return Array.isArray(users) ? users : [];
  }

  function saveUsers(users) {
    return storage.set(USERS_KEY, users);
  }

  // Публичные поля пользователя (без соли и хэша)
  function publicUser(u) {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      plan: u.plan || null,
      period: u.period || null,
      trialEndsAt: u.trialEndsAt || null
    };
  }

  function getUser() {
    const sessionId = storage.get(SESSION_KEY, null);
    if (!sessionId) return null;
    const u = getUsers().find((x) => x.id === sessionId);
    return u ? publicUser(u) : null;
  }

  function updateUser(patch) {
    const sessionId = storage.get(SESSION_KEY, null);
    const users = getUsers();
    const i = users.findIndex((u) => u.id === sessionId);
    if (i === -1) return null;
    users[i] = { ...users[i], ...patch };
    if (!saveUsers(users)) throw new Error("Не удалось сохранить данные. Разрешите сайту хранение данных в браузере.");
    render();
    emit();
    return publicUser(users[i]);
  }

  async function register({ name, email, password }) {
    const mail = email.trim().toLowerCase();
    const users = getUsers();
    if (users.some((u) => u.email === mail)) {
      throw new Error("Аккаунт с этой почтой уже есть. Войдите в него.");
    }
    const salt = randomHex();
    const user = {
      id: randomHex(8),
      name: name.trim(),
      email: mail,
      salt,
      passHash: await hashPassword(password, salt),
      createdAt: Date.now(),
      plan: null,
      period: null,
      trialEndsAt: null
    };
    users.push(user);
    if (!saveUsers(users)) {
      throw new Error("Не удалось сохранить данные. Разрешите сайту хранение данных в браузере.");
    }
    storage.set(SESSION_KEY, user.id);
    return publicUser(user);
  }

  async function login(email, password) {
    const mail = email.trim().toLowerCase();
    const u = getUsers().find((x) => x.email === mail);
    if (!u) return null;
    const hash = await hashPassword(password, u.salt);
    if (hash !== u.passHash) return null;
    storage.set(SESSION_KEY, u.id);
    return publicUser(u);
  }

  function logout() {
    storage.remove(SESSION_KEY);
    SV.pendingPlan = null;
    render();
    emit();
    SV.ui.toast("Вы вышли из аккаунта.");
  }

  function emit() {
    document.dispatchEvent(new CustomEvent("sv:auth", { detail: getUser() }));
  }

  /* ---------- Правила проверки полей ---------- */
  const rules = {
    name: (v) => (v.trim().length >= 2 ? "" : "Введите имя, минимум 2 символа"),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "Укажите корректную почту, например name@mail.ru"),
    password: (v) =>
      v.length >= 8 && /[A-Za-zА-Яа-яЁё]/.test(v) && /\d/.test(v) ? "" : "Минимум 8 символов, буквы и цифры"
  };

  // Сила пароля: 0–4
  function passwordScore(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-zа-яё]/.test(pw) && /[A-ZА-ЯЁ]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-zА-Яа-яЁё0-9]/.test(pw)) score++;
    return Math.min(4, score);
  }

  const STRENGTH = [
    { pct: "10%", color: "#f87171", label: "Очень слабый" },
    { pct: "30%", color: "#fb923c", label: "Слабый" },
    { pct: "55%", color: "#facc15", label: "Средний" },
    { pct: "80%", color: "#a3e635", label: "Хороший" },
    { pct: "100%", color: "#34d399", label: "Надёжный" }
  ];

  function setError(input, msg) {
    const err = document.getElementById("err-" + input.id);
    if (err) err.textContent = msg;
    input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  /* ---------- Окно входа / регистрации ---------- */
  function showAlert(msg, success = false) {
    const box = $("#auth-alert");
    box.textContent = msg;
    box.classList.toggle("is-success", success);
    box.hidden = !msg;
  }

  function setMode(mode) {
    const isLogin = mode === "login";
    $("#tab-login").setAttribute("aria-selected", String(isLogin));
    $("#tab-register").setAttribute("aria-selected", String(!isLogin));
    $("#tab-login").tabIndex = isLogin ? 0 : -1;
    $("#tab-register").tabIndex = isLogin ? -1 : 0;
    $("#login-form").hidden = !isLogin;
    $("#register-form").hidden = isLogin;
    $("#auth-title").textContent = isLogin ? "С возвращением" : "Создайте аккаунт";
    showAlert("");
  }

  function open(mode = "login", message = "") {
    setMode(mode);
    $("#auth-lead").textContent =
      message || (mode === "login"
        ? "Войдите, чтобы управлять подпиской и списком."
        : "Первые 14 дней бесплатно. Отмена в любой момент.");
    SV.ui.openModal("auth-modal");
  }

  function setLoading(btn, on) {
    if (!btn) return;
    btn.classList.toggle("is-loading", on);
    btn.disabled = on;
  }

  function validateRegister() {
    const name = $("#r-name");
    const email = $("#r-email");
    const pw = $("#r-password");
    const confirm = $("#r-confirm");
    const terms = $("#r-terms");

    const checks = [
      [name, rules.name(name.value)],
      [email, rules.email(email.value)],
      [pw, rules.password(pw.value)],
      [confirm, confirm.value === pw.value ? "" : "Пароли не совпадают"],
      [terms, terms.checked ? "" : "Нужно принять условия"]
    ];

    let firstBad = null;
    checks.forEach(([input, msg]) => {
      setError(input, msg);
      if (msg && !firstBad) firstBad = input;
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  function afterAuth(user, message) {
    render();
    emit();
    SV.ui.closeModal("auth-modal");
    SV.ui.toast(message || `Добро пожаловать, ${user.name}!`, "success");

    // Если пользователь выбрал тариф до входа — сразу открываем оформление
    if (SV.pendingPlan) {
      const planId = SV.pendingPlan;
      SV.pendingPlan = null;
      setTimeout(() => SV.plans && SV.plans.openCheckout(planId), 350);
    }
  }

  function bindForms() {
    // Переключение вкладок
    $$("[data-auth-tab]").forEach((tab) =>
      tab.addEventListener("click", () => setMode(tab.dataset.authTab))
    );

    // Показ / скрытие пароля
    $$("[data-toggle-pw]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.togglePw);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
      })
    );

    // Снимаем ошибку, как только пользователь начал исправлять поле
    $$("#login-form input, #register-form input").forEach((input) =>
      input.addEventListener("input", () => {
        if (input.getAttribute("aria-invalid") === "true") setError(input, "");
        showAlert("");
      })
    );

    // Индикатор сложности пароля
    const pw = $("#r-password");
    pw.addEventListener("input", () => {
      const v = pw.value;
      const level = v ? STRENGTH[passwordScore(v)] : null;
      const bar = $("#pw-bar");
      bar.style.setProperty("--s", level ? level.pct : "0%");
      bar.style.setProperty("--pw-color", level ? level.color : "transparent");
      $("#pw-hint").textContent = level ? level.label : "Минимум 8 символов, буквы и цифры";
    });

    // Вход
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#l-email");
      const password = $("#l-password");
      const emailErr = rules.email(email.value);
      setError(email, emailErr);
      setError(password, password.value ? "" : "Введите пароль");
      if (emailErr || !password.value) {
        (emailErr ? email : password).focus();
        return;
      }

      const btn = e.submitter || e.target.querySelector("button[type=submit]");
      setLoading(btn, true);
      try {
        await sleep(350);
        const user = await login(email.value, password.value);
        if (!user) {
          showAlert("Неверная почта или пароль.");
          password.value = "";
          password.focus();
          return;
        }
        e.target.reset();
        afterAuth(user, `С возвращением, ${user.name}!`);
      } finally {
        setLoading(btn, false);
      }
    });

    // Регистрация
    $("#register-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validateRegister()) return;

      const btn = e.submitter || e.target.querySelector("button[type=submit]");
      setLoading(btn, true);
      try {
        await sleep(450);
        const user = await register({
          name: $("#r-name").value,
          email: $("#r-email").value,
          password: $("#r-password").value
        });
        e.target.reset();
        pw.dispatchEvent(new Event("input"));
        afterAuth(user, `Аккаунт создан, ${user.name}. Выберите тариф, чтобы начать пробный период.`);
      } catch (err) {
        showAlert(err.message || "Что-то пошло не так. Попробуйте ещё раз.");
      } finally {
        setLoading(btn, false);
      }
    });
  }

  /* ---------- Форма на главной (CTA): почта переносится в регистрацию ---------- */
  function bindCta() {
    const form = $("#signup-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#cta-email");
      const msg = $("#form-msg");
      const err = rules.email(input.value);
      if (err) {
        msg.style.color = "var(--danger)";
        msg.textContent = err;
        input.focus();
        return;
      }
      msg.textContent = "";
      open("register", "Почти готово: задайте имя и пароль.");
      $("#r-email").value = input.value.trim();
      input.value = "";
    });
  }

  /* ---------- Шапка: кнопки входа или личный кабинет ---------- */
  function planLine(user) {
    if (!user.plan) return "";
    const until = user.trialEndsAt
      ? `, пробный до ${new Date(user.trialEndsAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`
      : "";
    return `Тариф: <b>${esc(PLAN_NAMES[user.plan] || user.plan)}</b>${esc(until)}`;
  }

  function render() {
    const user = getUser();

    $$(".js-auth-login, .js-auth-register").forEach((el) => (el.hidden = !!user));
    const guest = $("#mobile-guest");
    if (guest) guest.hidden = !!user;
    const mobileUser = $("#mobile-user");
    if (mobileUser) mobileUser.hidden = !user;

    const account = $("#account");
    if (!account) return;
    account.hidden = !user;
    if (!user) return;

    const initials = user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    $("#account-avatar").textContent = initials;
    $("#account-name").textContent = user.name.split(" ")[0];
    $("#menu-name").textContent = user.name;
    $("#menu-email").textContent = user.email;

    const planEl = $("#menu-plan");
    planEl.innerHTML = user.plan
      ? planLine(user)
      : `Подписки нет. <button type="button" class="btn-link" data-action="go-pricing">Выбрать тариф</button>`;

    $$(".plan").forEach((card) => {
      const current = user.plan === card.dataset.plan;
      card.classList.toggle("is-selected", current);
      const badge = card.querySelector(".plan-current");
      if (badge) badge.hidden = !current;
    });

    if (SV.catalog) SV.catalog.updateMenuCount();
  }

  function bindAccount() {
    const btn = $("#account-btn");
    const menu = $("#account-menu");
    if (!btn || !menu) return;

    const setOpen = (open) => {
      menu.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(!menu.classList.contains("is-open"));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    // Общий обработчик для меню, мобильного меню и ссылок в личном кабинете
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#account")) setOpen(false);

      const openBtn = e.target.closest("[data-open-auth]");
      if (openBtn) {
        e.preventDefault();
        open(openBtn.dataset.openAuth);
        return;
      }

      const actionBtn = e.target.closest("[data-action]");
      if (!actionBtn) return;
      setOpen(false);
      const name = actionBtn.dataset.action;

      if (name === "logout") logout();
      if (name === "go-pricing") {
        const pricing = document.getElementById("pricing");
        if (pricing) pricing.scrollIntoView({ behavior: "smooth" });
      }
      if (name === "go-list") {
        if (!SV.catalog || !SV.catalog.getList().length) {
          SV.ui.toast("Список пока пуст. Добавляйте фильмы кнопкой «+» на карточке.");
          return;
        }
        const row = document.querySelector('[data-row="mylist"]');
        if (row) row.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  /* ---------- Публичный API для других модулей ---------- */
  SV.auth = { getUser, updateUser, open, logout, login, register };
  SV.pendingPlan = null;

  ready(() => {
    bindForms();
    bindCta();
    bindAccount();
    render();
  });
})();
