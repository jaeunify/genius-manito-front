/* 마니또 · 프론트 로직: 라우터 + API 연동 + 상태 */
(() => {
  "use strict";

  const API = window.MANITO_CONFIG.API_BASE;
  const TOKEN_KEY = "manito_token";
  const DAY_LABEL = { mon: "월", tue: "화", wed: "수", thu: "목" };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);

  /* ── API 헬퍼 ── */
  async function api(path, { method = "GET", body } = {}) {
    const headers = {};
    const token = getToken();
    if (token) headers["X-Token"] = token;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error("서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.");
    }

    if (res.status === 401) {
      // 토큰 만료/무효 → 로그인으로
      localStorage.removeItem(TOKEN_KEY);
      showScreen("login");
      throw new Error("다시 로그인해주세요.");
    }

    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }

    if (!res.ok) {
      const msg = (data && data.message) || "요청을 처리하지 못했어요.";
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ── 화면 전환 ── */
  const SCREENS = ["login", "main", "receive", "give"];
  function showScreen(name) {
    SCREENS.forEach((s) => {
      const el = $("#screen-" + s);
      if (el) el.hidden = s !== name;
    });
    window.scrollTo(0, 0);
    if (name === "main") loadMain();
    if (name === "receive") loadReceive();
    if (name === "give") loadGive();
  }

  /* ── 토스트 ── */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => (t.hidden = true), 300);
    }, 2200);
  }

  function setMsg(el, text, kind) {
    el.textContent = text;
    el.className = "form-msg " + (kind || "");
    el.hidden = !text;
  }

  /* ═══════════ 로그인 ═══════════ */
  function submitName(e) {
    e.preventDefault();
    const raw = $("#name-input").value;
    const name = raw.trim();
    console.log("[마니또] 이름 입력:", JSON.stringify(raw), "→ 정리:", JSON.stringify(name), "길이:", name.length);
    if (!name) {
      setMsg($("#login-msg"), "이름을 입력해주세요.", "err");
      return;
    }
    setMsg($("#login-msg"), "", "");
    openConfirm(name);
  }

  let pendingName = null;
  function openConfirm(name) {
    pendingName = name;
    $("#confirm-name").textContent = name;
    $("#modal-confirm").hidden = false;
  }
  function closeConfirm() {
    $("#modal-confirm").hidden = true;
    pendingName = null;
  }

  async function doClaim() {
    if (!pendingName) return;
    const name = pendingName;
    console.log("[마니또] claim 전송:", JSON.stringify(name), "→", API + "/api/claim");
    $("#confirm-yes").disabled = true;
    try {
      const res = await api("/api/claim", { method: "POST", body: { name } });
      setToken(res.token);
      closeConfirm();
      showScreen("main");
    } catch (e) {
      closeConfirm();
      setMsg($("#login-msg"), e.message, "err");
      toast(e.message);
    } finally {
      $("#confirm-yes").disabled = false;
    }
  }

  /* ═══════════ 레드닷 (안 본 알림) ═══════════ */
  const SEEN_KEY = "manito_seen";
  function getSeen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; }
    catch { return {}; }
  }
  function isSeen(key) { return !!getSeen()[key]; }
  function markSeen(key) {
    const s = getSeen();
    if (s[key]) return;
    s[key] = true;
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  }

  /* ═══════════ 메인 ═══════════ */
  async function loadMain() {
    try {
      const me = await api("/api/me");
      $("#main-name").textContent = me.name;
      // 편지가 도착하면 '받기', 답장이 도착하면 '하기'가 활성화 → 레드닷
      if (me.hasLetter && !isSeen("receive")) $("#badge-receive").hidden = false;
      else $("#badge-receive").hidden = true;
      if (me.hasReplyReceived && !isSeen("give")) $("#badge-give").hidden = false;
      else $("#badge-give").hidden = true;
      if (!me.revealDone) openReveal();
    } catch (e) {
      toast(e.message);
    }
  }

  /* ── 마니또 공개 팝업 ── */
  function openReveal() {
    $("#modal-reveal").hidden = false;
    $("#giftbox").hidden = false;
    $("#reveal-result").hidden = true;
  }
  async function openGiftbox() {
    try {
      const res = await api("/api/me/target");
      $("#reveal-name").textContent = res.targetName;
      $("#giftbox").hidden = true;
      $("#reveal-result").hidden = false;
    } catch (e) {
      toast(e.message);
    }
  }
  async function confirmReveal() {
    $("#reveal-confirm").disabled = true;
    try {
      await api("/api/me/reveal", { method: "POST" });
      $("#modal-reveal").hidden = true;
    } catch (e) {
      toast(e.message);
    } finally {
      $("#reveal-confirm").disabled = false;
    }
  }

  /* ── 편지 최초 공개 팝업 ── */
  function openLetterReveal(message) {
    $("#letter-reveal-text").textContent = message || "";
    $("#modal-letter").hidden = false;
    $("#letterbox").hidden = false;
    $("#letter-reveal-result").hidden = true;
  }
  function openLetterbox() {
    $("#letterbox").hidden = true;
    $("#letter-reveal-result").hidden = false;
  }
  function confirmLetter() {
    markSeen("letter");        // 확인 후에는 다시 최초 공개되지 않음
    $("#modal-letter").hidden = true;
  }

  /* ═══════════ 마니또 받기 ═══════════ */
  async function loadReceive() {
    // 내 정보
    try {
      const p = await api("/api/me/profile");
      $("#pf-seat").value = p.seat || "";
      $("#pf-intro").value = p.intro || "";
      $("#pf-giftspot").value = p.giftSpot || "";
      $("#pf-contact").value = p.contact || "";
      const days = p.days || [];
      $$("#pf-days input").forEach((c) => (c.checked = days.includes(c.value)));
    } catch (e) { /* 무시: 빈 폼 */ }

    // 상태 조회 (편지 도착 여부 / 답장 여부)
    let me = null;
    try { me = await api("/api/me"); } catch {}
    const hasLetter = !!(me && me.hasLetter);

    // 편지가 활성화된 상태로 이 화면을 열었으면 '확인함' → 레드닷 제거
    if (hasLetter) markSeen("receive");

    // 마니또로부터 온 편지 — 편지 받기 전까지 비활성화
    const box = $("#letter-box");
    setPanelLocked(box, !hasLetter);
    if (hasLetter) {
      let message = "";
      try {
        const res = await api("/api/me/letter");
        message = res.message || "";
        box.textContent = message;
      } catch { /* keep default */ }
      // 편지를 한 번도 확인한 적 없으면 최초 공개 연출
      if (message && !isSeen("letter")) openLetterReveal(message);
    } else {
      box.innerHTML = '<p class="letter-empty">아직 편지가 도착하지 않았어요. 조금만 기다려요 :)</p>';
    }

    // 마니또에게 보내는 쪽지 — 편지 받기 전까지 비활성화
    if (!hasLetter) setReplyState("locked");
    else if (me && me.replySent) setReplyState("sent");
    else setReplyState("open");
  }

  // 편지·감사쪽지처럼 아직 차례가 안 된 패널을 비활성화(흐리게) 처리
  function setPanelLocked(childEl, locked) {
    const panel = childEl.closest(".panel");
    if (panel) panel.classList.toggle("locked", locked);
  }

  // 답장 폼 상태: locked(편지 전) / sent(이미 보냄) / open(작성 가능)
  function setReplyState(state) {
    const ta = $("#reply-text");
    const btn = $("#reply-btn");
    const panel = ta.closest(".panel");
    const disabled = state !== "open";
    ta.disabled = disabled;
    btn.disabled = disabled;
    panel.classList.toggle("locked", state === "locked");

    if (state === "locked") {
      btn.textContent = "보내기";
      setMsg($("#reply-msg"), "마니또의 편지를 받은 뒤에 답장할 수 있어요.", "");
    } else if (state === "sent") {
      btn.textContent = "이미 보냈어요";
      setMsg($("#reply-msg"), "감사 쪽지는 한 번만 보낼 수 있어요.", "ok");
    } else {
      btn.textContent = "보내기";
      setMsg($("#reply-msg"), "", "");
    }
  }

  async function submitProfile(e) {
    e.preventDefault();
    const body = {
      seat: $("#pf-seat").value.trim(),
      days: $$("#pf-days input:checked").map((c) => c.value),
      intro: $("#pf-intro").value.trim(),
      giftSpot: $("#pf-giftspot").value.trim(),
      contact: $("#pf-contact").value.trim(),
    };
    try {
      await api("/api/me/profile", { method: "PUT", body });
      setMsg($("#profile-msg"), "저장했어요!", "ok");
      toast("내 정보를 저장했어요 💌");
    } catch (err) {
      setMsg($("#profile-msg"), err.message, "err");
    }
  }

  async function submitReply(e) {
    e.preventDefault();
    const text = $("#reply-text").value.trim();
    if (!text) { setMsg($("#reply-msg"), "내용을 입력해주세요.", "err"); return; }
    try {
      await api("/api/me/reply", { method: "POST", body: { text } });
      setReplyState("sent");
      toast("마니또에게 감사 쪽지를 보냈어요 🤫");
    } catch (err) {
      setMsg($("#reply-msg"), err.message, "err");
    }
  }

  /* ═══════════ 마니또 하기 ═══════════ */
  async function loadGive() {
    const card = $("#target-card");
    card.innerHTML = '<p class="loading">불러오는 중…</p>';
    try {
      const t = await api("/api/me/target/profile");
      card.innerHTML = renderTarget(t);
    } catch (e) {
      card.innerHTML = `<p class="letter-empty">${e.message}</p>`;
    }

    // 기존 쪽지 불러오기 (letter API로 확인 불가 → me/target/profile엔 없음; gift는 별도 저장값 없어 빈칸 유지)
    // 받은 감사 쪽지
    const rbox = $("#reply-received-box");
    try {
      const { message } = await api("/api/me/reply-received");
      setPanelLocked(rbox, !message);
      if (message) { rbox.textContent = message; markSeen("give"); }
      else rbox.innerHTML = '<p class="letter-empty">아직 답장이 없어요.</p>';
    } catch { setPanelLocked(rbox, true); /* keep default */ }
  }

  function renderTarget(t) {
    const days = (t.days || []).map((d) => `<span>${DAY_LABEL[d] || d}</span>`).join("");
    const row = (label, val) =>
      `<div class="info-row"><dt>${label}</dt>` +
      (val ? `<dd>${escapeHtml(val)}</dd>` : `<dd class="empty">아직 안 적었어요</dd>`) +
      `</div>`;
    return (
      `<div class="target-name">${escapeHtml(t.targetName)} <span class="tag">내 마니또 대상</span></div>` +
      row("자리", t.seat) +
      `<div class="info-row"><dt>편한 날짜</dt>` +
        (days ? `<dd><div class="chips">${days}</div></dd>` : `<dd class="empty">아직 안 골랐어요</dd>`) +
      `</div>` +
      row("소개", t.intro) +
      row("선물 위치", t.giftSpot)
    );
  }

  async function submitGift(e) {
    e.preventDefault();
    const message = $("#gift-text").value.trim();
    if (!message) { setMsg($("#gift-msg"), "쪽지 내용을 입력해주세요.", "err"); return; }
    try {
      await api("/api/me/gift", { method: "PUT", body: { message } });
      setMsg($("#gift-msg"), "쪽지를 남겼어요!", "ok");
      toast("선물 위치 쪽지를 남겼어요 🎁");
    } catch (err) {
      setMsg($("#gift-msg"), err.message, "err");
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ═══════════ 이벤트 바인딩 ═══════════ */
  function bind() {
    // 네비게이션
    $$("[data-nav]").forEach((el) =>
      el.addEventListener("click", () => showScreen(el.dataset.nav)));

    // 이름 입력 · 확인 모달
    $("#name-form").addEventListener("submit", submitName);
    $("#confirm-yes").addEventListener("click", doClaim);
    $("#confirm-no").addEventListener("click", closeConfirm);

    // 마니또 공개
    $("#giftbox").addEventListener("click", openGiftbox);
    $("#reveal-confirm").addEventListener("click", confirmReveal);

    // 편지 최초 공개
    $("#letterbox").addEventListener("click", openLetterbox);
    $("#letter-confirm").addEventListener("click", confirmLetter);

    // 폼
    $("#profile-form").addEventListener("submit", submitProfile);
    $("#reply-form").addEventListener("submit", submitReply);
    $("#gift-form").addEventListener("submit", submitGift);

    // 답장 글자 수
    $("#reply-text").addEventListener("input", (e) => {
      $("#reply-count").textContent = e.target.value.length;
    });
  }

  /* ═══════════ 부팅 ═══════════ */
  async function boot() {
    bind();
    if (getToken()) {
      showScreen("main");
    } else {
      showScreen("login");
    }
  }

  boot();
})();
