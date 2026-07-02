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
      renderStatus(me);
      if (!me.revealDone) openReveal();
    } catch (e) {
      toast(e.message);
    }
  }

  /* ── 메인 상태 요약 ── */
  // done: 완료 여부, doneText: 완료 시 문구 (미완료 문구는 HTML 기본값 유지)
  function setStatus(id, done, doneText) {
    const el = $("#" + id);
    if (!el) return;
    el.classList.toggle("done", done);
    if (done) $(".status-text", el).textContent = doneText;
  }
  function renderStatus(me) {
    setStatus("st-letter", !!me.hasLetter, "마니또에게 선물을 받았어요!");
    setStatus("st-reply-sent", !!me.replySent, "마니또에게 답장을 보냈어요!");
    setStatus("st-gift-sent", !!me.hasSentGift, "마니띠에게 선물을 보냈어요!");
    setStatus("st-reply-received", !!me.hasReplyReceived, "마니띠에게 답장을 받았어요!");
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

  /* ── 받은 감사 쪽지 최초 공개 팝업 ── */
  function openReplyReveal(message) {
    $("#reply-reveal-text").textContent = message || "";
    $("#modal-reply").hidden = false;
    $("#replybox").hidden = false;
    $("#reply-reveal-result").hidden = true;
  }
  function openReplybox() {
    $("#replybox").hidden = true;
    $("#reply-reveal-result").hidden = false;
  }
  function confirmReplyReveal() {
    markSeen("reply");         // 확인 후에는 다시 최초 공개되지 않음
    $("#modal-reply").hidden = true;
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

    // 상태 조회 (편지 도착 여부 / 답장 여부 / 내 정보 입력 여부)
    let me = null;
    try { me = await api("/api/me"); } catch {}
    const hasLetter = !!(me && me.hasLetter);
    const profileDone = !!(me && me.profileSubmitted);

    // 편지가 도착하면 정보 수정 불가(접힘 + 수정 버튼 숨김),
    // 아니면 입력 완료 시 접어두기 (수정 버튼으로 다시 펼침)
    if (hasLetter) setProfileCollapsed(true, true);
    else setProfileCollapsed(profileDone);

    // 편지가 활성화된 상태로 이 화면을 열었으면 '확인함' → 레드닷 제거
    if (hasLetter) markSeen("receive");

    // 편지·쪽지 패널: 내 정보를 입력하기 전에는 통째로 숨김
    const box = $("#letter-box");
    const letterPanel = box.closest(".panel");
    const replyPanel = $("#reply-form").closest(".panel");
    if (!profileDone) {
      if (letterPanel) letterPanel.hidden = true;
      if (replyPanel) replyPanel.hidden = true;
      return;
    }
    if (letterPanel) letterPanel.hidden = false;
    if (replyPanel) replyPanel.hidden = false;

    // 마니또로부터 온 편지 — 편지 받기 전까지 비활성화
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

  // 저장된 내 정보 요약 (접힘 상태에서 보여줌) — 현재 입력값 기준
  function renderProfileSummary() {
    const seat = $("#pf-seat").value.trim();
    const days = $$("#pf-days input:checked").map((c) => DAY_LABEL[c.value] || c.value);
    const intro = $("#pf-intro").value.trim();
    const giftSpot = $("#pf-giftspot").value.trim();
    const contact = $("#pf-contact").value.trim();
    const row = (label, val) =>
      `<div class="info-row"><dt>${label}</dt>` +
      (val ? `<dd>${escapeHtml(val)}</dd>` : `<dd class="empty">미입력</dd>`) +
      `</div>`;
    return (
      row("자리", seat) +
      `<div class="info-row"><dt>편한 날짜</dt>` +
        (days.length ? `<dd><div class="chips">${days.map((d) => `<span>${d}</span>`).join("")}</div></dd>` : `<dd class="empty">미선택</dd>`) +
      `</div>` +
      row("소개", intro) +
      row("선물 위치", giftSpot) +
      row("연락처", contact)
    );
  }

  // 내 정보 패널 접기(collapsed=true)/펼치기(false)
  // lockEdit=true면 접힌 채 수정 버튼도 숨김 (편지 도착 후 수정 불가)
  function setProfileCollapsed(collapsed, lockEdit = false) {
    $("#profile-form").hidden = collapsed;
    $("#profile-edit").hidden = !collapsed || lockEdit;
    const summary = $("#profile-summary");
    if (collapsed) {
      summary.innerHTML = renderProfileSummary();
      summary.hidden = false;
      $("#profile-hint").textContent = lockEdit
        ? "마니또에게 편지가 도착해서 정보는 더 이상 수정할 수 없어요."
        : "저장 완료! 바꾸려면 ‘수정’을 눌러요.";
    } else {
      summary.hidden = true;
      $("#profile-hint").textContent = "마니또가 당신을 잘 챙길 수 있게 알려주세요.";
    }
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
      toast("내 정보를 저장했어요 💌");
      loadReceive();   // 저장 후 갱신: 프로필 접힘 + 편지·쪽지 패널 표시
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

    // 상태 조회 (내가 선물 쪽지를 보냈는지)
    let me = null;
    try { me = await api("/api/me"); } catch {}
    const hasSentGift = !!(me && me.hasSentGift);

    // 받은 감사 쪽지 — 내가 선물 쪽지를 주기 전에는 패널 자체를 숨김
    const rbox = $("#reply-received-box");
    const replyPanel = rbox.closest(".panel");
    if (!hasSentGift) {
      if (replyPanel) replyPanel.hidden = true;
      return;
    }
    if (replyPanel) replyPanel.hidden = false;

    try {
      const { message } = await api("/api/me/reply-received");
      setPanelLocked(rbox, !message);
      if (message) {
        rbox.textContent = message;
        markSeen("give");
        // 감사 쪽지를 한 번도 확인한 적 없으면 최초 공개 연출
        if (!isSeen("reply")) openReplyReveal(message);
      } else {
        rbox.innerHTML = '<p class="letter-empty">아직 답장이 없어요.</p>';
      }
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
      loadGive();   // 선물 쪽지를 보냈으니 '받은 감사 쪽지' 패널 표시
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

    // 받은 감사 쪽지 최초 공개
    $("#replybox").addEventListener("click", openReplybox);
    $("#reply-reveal-confirm").addEventListener("click", confirmReplyReveal);

    // 폼
    $("#profile-form").addEventListener("submit", submitProfile);
    $("#profile-edit").addEventListener("click", () => setProfileCollapsed(false));
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
