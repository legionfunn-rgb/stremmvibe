/* =========================================================
   StreamVibe — тарифы и подписка
   • Переключатель «месяц / год» и пересчёт цен
   • Выбор тарифа: без входа — регистрация, с входом — оформление
   • Смена и отмена подписки, отметка текущего тарифа
   Платёжных данных не запрашиваем: это демонстрация.
   ========================================================= */
(function () {
  "use strict";

  const SV = window.SV;
  const $ = SV.$;
  const $$ = SV.$$;
  const esc = SV.esc;

  const TRIAL_DAYS = 14;
  const PLAN_NAMES = { basic: "Базовый", standard: "Стандарт", premium: "Премиум" };

  let period = "month";
  let checkoutPlanId = null;

  const ready = (fn) => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtPrice = (n) => `${Number(n).toLocaleString("ru-RU")} ₽`;
  const fmtDate = (ts) =>
    new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  function getPlanCard(id) {
    return document.querySelector(`.plan[data-plan="${id}"]`);
  }

  /* ---------- Переключатель периода ---------- */
  function setPeriod(next) {
    period = next === "year" ? "year" : "month";
    $("#btn-month").setAttribute("aria-pressed", String(period === "month"));
    $("#btn-year").setAttribute("aria-pressed", String(period === "year"));

    $$(".plan").forEach((card) => {
      const isYear = period === "year";
      const value = isYear ? card.dataset.yearly : card.dataset.monthly;
      card.querySelector("[data-price]").textContent = fmtPrice(value);
      card.querySelector("[data-period-label]").textContent = isYear ? "/ год" : "/ мес";
      card.querySelector("[data-note]").textContent = isYear
        ? "Оплата раз в год, экономия 20%"
        : "Списание каждый месяц";
    });
  }

  /* ---------- Выбор тарифа ---------- */
  function selectPlan(planId) {
    const user = SV.auth.getUser();

    if (!user) {
      // Запоминаем выбор и просим зарегистрироваться; после входа откроем оформление
      SV.pendingPlan = planId;
      SV.auth.open("register", `Создайте аккаунт, чтобы оформить тариф «${PLAN_NAMES[planId]}».`);
      return;
    }
    if (user.plan === planId && user.period === period) {
      SV.ui.toast("Этот тариф уже активен.");
      return;
    }
    openCheckout(planId);
  }

  function openCheckout(planId) {
    const user = SV.auth.getUser();
    if (!user) {
      SV.pendingPlan = planId;
      SV.auth.open("register");
      return;
    }

    checkoutPlanId = planId;
    const card = getPlanCard(planId);
    if (!card) return;

    const isChange = !!user.plan;
    const price = period === "year" ? card.dataset.yearly : card.dataset.monthly;
    const periodText = period === "year" ? "раз в год" : "раз в месяц";
    const total = period === "year" ? `${fmtPrice(price)} / год` : `${fmtPrice(price)} / мес`;

    let trialRow;
    let firstCharge;
    if (isChange) {
      trialRow = ["Смена тарифа", "Новый тариф со следующего периода"];
      firstCharge = ["Первое списание", "В начале следующего периода"];
    } else {
      const trialEnd = Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
      trialRow = ["Пробный период", `${TRIAL_DAYS} дней бесплатно`];
      firstCharge = ["Первое списание", `${fmtDate(trialEnd)}, ${fmtPrice(price)}`];
    }

    $("#checkout-title").textContent = isChange ? "Смена тарифа" : "Оформление подписки";
    $("#checkout-body").innerHTML = `
      <div class="summary">
        <div><span>Тариф</span><strong>${esc(PLAN_NAMES[planId])}</strong></div>
        <div><span>Оплата</span><strong>${esc(periodText)}</strong></div>
        <div><span>${esc(trialRow[0])}</span><strong>${esc(trialRow[1])}</strong></div>
        <div><span>${esc(firstCharge[0])}</span><strong>${esc(firstCharge[1])}</strong></div>
        <div class="total"><span>Стоимость</span><strong>${esc(total)}</strong></div>
      </div>`;

    $("#checkout-confirm").textContent = isChange ? "Подтвердить смену" : "Начать пробный период";
    SV.ui.openModal("checkout-modal");
  }

  async function confirmCheckout() {
    const btn = $("#checkout-confirm");
    const user = SV.auth.getUser();
    if (!user || !checkoutPlanId) return;

    btn.classList.add("is-loading");
    btn.disabled = true;
    try {
      await sleep(500);
      const isFirst = !user.plan;
      SV.auth.updateUser({
        plan: checkoutPlanId,
        period,
        // Пробный период выдаём один раз — при первой подписке
        trialEndsAt: isFirst ? Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000 : user.trialEndsAt
      });
      SV.ui.closeModal("checkout-modal");
      SV.ui.toast(
        isFirst
          ? `Тариф «${PLAN_NAMES[checkoutPlanId]}» подключён. Пробный период — ${TRIAL_DAYS} дней.`
          : `Тариф изменён на «${PLAN_NAMES[checkoutPlanId]}».`,
        "success"
      );
      checkoutPlanId = null;
    } catch (err) {
      SV.ui.toast(err.message || "Не удалось оформить подписку.", "error");
    } finally {
      btn.classList.remove("is-loading");
      btn.disabled = false;
    }
  }

  function cancelSubscription() {
    const user = SV.auth.getUser();
    if (!user || !user.plan) return;
    if (!window.confirm("Отменить подписку? Вы сможете выбрать тариф снова в любой момент.")) return;

    try {
      SV.auth.updateUser({ plan: null, period: null, trialEndsAt: null });
      SV.ui.toast("Подписка отменена.");
    } catch (err) {
      SV.ui.toast(err.message, "error");
    }
  }

  /* ---------- Состояние кнопок и кнопки отмены ---------- */
  function syncWithUser() {
    const user = SV.auth.getUser();
    const currentPlan = user ? user.plan : null;

    $$("[data-plan-select]").forEach((btn) => {
      const id = btn.dataset.planSelect;
      if (!btn.dataset.label) btn.dataset.label = btn.textContent.trim();
      const isCurrent = currentPlan === id;
      btn.textContent = isCurrent ? "Ваш тариф" : btn.dataset.label;
      btn.disabled = isCurrent;
    });

    const cancel = $("#cancel-plan");
    if (cancel) cancel.hidden = !currentPlan;
  }

  function addCancelButton() {
    const plans = $(".plans");
    if (!plans || $("#cancel-plan")) return;
    plans.insertAdjacentHTML(
      "afterend",
      `<p style="text-align:center; margin:28px 0 0;">
         <button type="button" class="btn-link" id="cancel-plan" hidden>Отменить подписку</button>
       </p>`
    );
    $("#cancel-plan").addEventListener("click", cancelSubscription);
  }

  /* ---------- Старт ---------- */
  ready(() => {
    if (!SV.auth) return; // auth.js не загружен — тарифы работают без кабинета

    $("#btn-month").addEventListener("click", () => setPeriod("month"));
    $("#btn-year").addEventListener("click", () => setPeriod("year"));

    $$("[data-plan-select]").forEach((btn) =>
      btn.addEventListener("click", () => selectPlan(btn.dataset.planSelect))
    );

    $("#checkout-confirm").addEventListener("click", confirmCheckout);

    addCancelButton();
    setPeriod("month");
    syncWithUser();

    document.addEventListener("sv:auth", syncWithUser);
  });

  SV.plans = { openCheckout, selectPlan, setPeriod };
})();
