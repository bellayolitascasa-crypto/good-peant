const FEELING_OPTIONS = ["开心", "安心", "放松", "被支持", "被看见", "有成就感", "感激", "幸运", "有希望", "平静"];

/**
 * @typedef {Object} GoodThingEntry
 * @property {string} id
 * @property {string} date Local calendar date in YYYY-MM-DD format.
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} content
 * @property {string} reason
 * @property {string} feeling
 * @property {boolean=} isDeleted
 */

const KEYS = { entries: "good-things.entries.v1", settings: "good-things.settings.v1" };
const THEMES = {
  sunny: { name: "Sunny Yellow", desc: "像午后的阳光，明亮又柔和" },
  blue: { name: "Soft Blue", desc: "像晴空一样，安静而舒展" },
  cream: { name: "Cream Classic", desc: "温暖的奶油色，简单耐看" }
};

const state = {
  tab: "today",
  entries: readJSON(KEYS.entries, []),
  settings: readJSON(KEYS.settings, { reminder: "21:00", theme: "sunny" }),
  composing: false,
  editingId: null
};

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveEntries() { localStorage.setItem(KEYS.entries, JSON.stringify(state.entries)); }
function saveSettings() { localStorage.setItem(KEYS.settings, JSON.stringify(state.settings)); }
function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseDate(value) { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d); }
function dateLabel(value) {
  const date = parseDate(value);
  const now = localDate();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (value === now) return "今天";
  if (value === localDate(yesterday)) return "昨天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
function fullDateLabel(value) {
  const date = parseDate(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
function timeLabel(value) { return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }); }
function activeEntries() { return state.entries.filter(e => !e.isDeleted); }
function getCurrentMonthEntries(entries = state.entries, now = new Date()) {
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return entries.filter(e => !e.isDeleted && e.date.startsWith(prefix));
}
function getEntryCount(entries) { return entries.filter(e => !e.isDeleted).length; }
function getDaysCount(entries) { return new Set(entries.filter(e => !e.isDeleted).map(e => e.date)).size; }
function getTopFeeling(entries) {
  const counts = {};
  entries.filter(e => !e.isDeleted).forEach(e => counts[e.feeling] = (counts[e.feeling] || 0) + 1);
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || FEELING_OPTIONS.indexOf(a[0]) - FEELING_OPTIONS.indexOf(b[0]))[0]?.[0] || "—";
}
function getCurrentStreak(entries = state.entries, now = new Date()) {
  const dates = new Set(entries.filter(e => !e.isDeleted).map(e => e.date));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!dates.has(localDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dates.has(localDate(cursor))) return 0;
  }
  let streak = 0;
  while (dates.has(localDate(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}
function getLongestStreakInMonth(entries, now = new Date()) {
  const dates = [...new Set(getCurrentMonthEntries(entries, now).map(e => e.date))].sort();
  let longest = 0, current = 0, prev = null;
  for (const value of dates) {
    const day = parseDate(value);
    current = prev && Math.round((day - prev) / 86400000) === 1 ? current + 1 : 1;
    longest = Math.max(longest, current); prev = day;
  }
  return longest;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
}
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function showToast(message) {
  const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function shell(content) {
  const navItems = [
    ["today", "☀", "Today"], ["timeline", "≋", "Timeline"], ["report", "✦", "Report"]
  ];
  return `<div class="app-shell">
    <main class="page">${content}</main>
    ${state.tab === "settings" ? "" : `<nav class="bottom-nav" aria-label="主导航">${navItems.map(([id, icon, label]) => `<button class="nav-item ${state.tab === id ? "active" : ""}" data-tab="${id}"><span>${icon}</span>${label}</button>`).join("")}</nav>`}
  </div>`;
}

function topbar({ eyebrow = "GOOD THINGS", title = "", settings = false, back = false } = {}) {
  return `<header class="topbar">
    <div>${back ? `<button class="icon-btn" data-action="back" aria-label="返回">←</button>` : `<div class="brand-mark">${eyebrow}<span>✦</span></div>`}${title ? `<h1>${title}</h1>` : ""}</div>
    ${settings ? `<button class="icon-btn" data-action="settings" aria-label="设置">⚙</button>` : ""}
  </header>`;
}

function feelingPicker(selected = "") {
  return `<div class="feelings" role="radiogroup" aria-label="感受词">${FEELING_OPTIONS.map(f => `<button type="button" class="feeling-chip ${selected === f ? "selected" : ""}" data-feeling="${f}" role="radio" aria-checked="${selected === f}">${f}</button>`).join("")}</div>`;
}

function entryForm(entry = {}) {
  return `<form id="entry-form" class="entry-form" data-id="${entry.id || ""}">
    <label class="field"><span>今天的好事是：</span><textarea name="content" rows="3" maxlength="300" placeholder="比如：今天阳光很好，我出门散步了十分钟。">${escapeHTML(entry.content || "")}</textarea></label>
    <label class="field"><span>它为什么会发生？</span><textarea name="reason" rows="3" maxlength="300" placeholder="比如：因为我今天主动出门了，也允许自己休息了一会儿。">${escapeHTML(entry.reason || "")}</textarea></label>
    <fieldset class="field"><legend>这件事让我感受到：</legend>${feelingPicker(entry.feeling)}</fieldset>
    <input type="hidden" name="feeling" value="${entry.feeling || ""}" />
    <button class="primary-btn" type="submit" disabled>${entry.id ? "保存修改" : "保存今天的好事"}<span>→</span></button>
  </form>`;
}

function renderToday() {
  const todayEntries = activeEntries().filter(e => e.date === localDate()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hasEntries = todayEntries.length > 0;
  let body;
  if (!hasEntries || state.composing) {
    body = `<section class="hero ${hasEntries ? "compact" : ""}"><div class="sun-doodle">☀</div><p class="kicker">${hasEntries ? "再记下一件" : "今天 · " + fullDateLabel(localDate())}</p>
      <h2>${hasEntries ? "还有什么小小的好，想被记住？" : "今天有一件什么好事，<br>值得被记住？"}</h2>
      <p>${hasEntries ? "不需要特别，也不需要完整。记下你刚刚想到的那一件就好。" : "写一件就够了。可以很小，很普通，<br class='desktop-only'>也可以只是一个让你舒服了一点的瞬间。"}</p></section>
      <section class="paper-card">${entryForm()}</section>`;
  } else {
    body = `<section class="completion hero"><div class="success-orbit">✓</div><p class="kicker">今天 · 已记录</p>
      <h2>今天的好事已经被<br>好好收下了。</h2><p>你今天为自己留下了一个积极证据。</p></section>
      <section class="today-list"><div class="section-heading"><h3>今天的好事</h3><span>${todayEntries.length} 件</span></div>${todayEntries.map(entryCard).join("")}</section>
      <section class="more-card"><div><span class="tiny-sun">☀</span><h3>还想再记录一件吗？</h3><p>不写也完全可以，今天这一件已经很好了。</p></div><button class="secondary-btn" data-action="compose">再写一件 <span>＋</span></button></section>`;
  }
  return shell(`${topbar({ settings: true })}<div class="content-wrap">${body}</div>`);
}

function entryCard(e) {
  return `<article class="entry-card">
    <div class="entry-card-head"><span class="feeling-badge">${escapeHTML(e.feeling)}</span><time>${timeLabel(e.createdAt)}</time></div>
    <h3>${escapeHTML(e.content)}</h3>
    <div class="reason"><span>因为</span><p>${escapeHTML(e.reason)}</p></div>
    <div class="card-actions"><button data-action="edit" data-id="${e.id}">编辑</button><button data-action="delete" data-id="${e.id}">删除</button></div>
  </article>`;
}

function renderTimeline() {
  const entries = activeEntries().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  if (!entries.length) return shell(`${topbar({ title: "时间线" })}<div class="content-wrap empty-state"><div class="empty-illustration">✿<span>✦</span></div><h2>这里会慢慢长出你的好事。</h2><p>从今天的一件小事开始就好。以后回头看，<br>你会发现它们并不小。</p><button class="primary-btn narrow" data-action="go-today">去记录今天的好事 <span>→</span></button></div>`);
  const groups = Object.groupBy ? Object.groupBy(entries, e => e.date) : entries.reduce((a, e) => ((a[e.date] ||= []).push(e), a), {});
  return shell(`${topbar({ title: "时间线" })}<div class="content-wrap timeline"><div class="page-intro"><p class="kicker">一路收集的小小证据</p><h2>回头看，它们都在这里。</h2><p>每一件被记住的好事，都让生活多了一点清晰的光。</p></div>
    ${Object.entries(groups).map(([date, items]) => `<section class="date-group"><div class="date-marker"><span>${dateLabel(date)}</span><time>${fullDateLabel(date)}</time><i></i></div>${items.map(entryCard).join("")}</section>`).join("")}</div>`);
}

function renderReport() {
  const month = getCurrentMonthEntries();
  const entryCount = getEntryCount(month), daysCount = getDaysCount(month);
  const currentStreak = getCurrentStreak();
  const monthName = `${new Date().getMonth() + 1} 月成长报告`;
  if (entryCount < 3) return shell(`${topbar({ title: monthName })}<div class="content-wrap empty-state report-empty"><div class="report-moon">☀<span>✦</span></div><p class="kicker">正在积累 · ${entryCount}/3</p><h2>这个月的好事还在积累中。</h2><p>再记录几次后，你会看到更完整的成长报告。<br>不用着急，从今天的一件小事开始就好。</p><div class="mini-progress"><i style="width:${entryCount / 3 * 100}%"></i></div><button class="primary-btn narrow" data-action="go-today">去记录今天的好事 <span>→</span></button></div>`);
  const highlights = [...month].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  return shell(`${topbar({ title: monthName })}<div class="content-wrap report">
    <section class="report-cover"><span class="cover-sun">☀</span><p class="kicker">${new Date().getFullYear()} · ${new Date().getMonth()+1}月</p><h2>这个月，你记录了<br><strong>${entryCount}</strong> 件好事。</h2><p>它们不一定都很大，<br>但每一次记录，都是你停下来认真看见生活的一次练习。</p><div class="proof">这些小事一起证明：<br><b>这个月并不是空白的。</b></div></section>
    <section class="stats-grid"><div><b>${entryCount}</b><span>本月好事</span></div><div><b>${daysCount}</b><span>记录天数</span></div><div><b>${getLongestStreakInMonth(month)}</b><span>最长连续</span></div><div><b>${currentStreak}</b><span>当前连续</span></div></section>
    <section class="top-feeling"><span>这个月最常出现的感受</span><strong>${getTopFeeling(month)}</strong><p>这种感受，正在你的生活里悄悄发芽。</p></section>
    <section class="highlights"><div class="section-heading"><h3>最近的三件好事</h3><span>✦</span></div>${highlights.map(e => `<div class="highlight"><time>${dateLabel(e.date)}</time><div><b>${escapeHTML(e.content)}</b><span>${escapeHTML(e.feeling)}</span></div></div>`).join("")}</section>
    <section class="report-ending"><span>✦</span><h3>这个月，你没有忽略那些小小的好。</h3><p>你一次次把它们写下来，也是在提醒自己：<br>生活不是只有压力、问题和未完成。</p><b>下个月，也从一件小事开始就好。</b></section>
  </div>`);
}

function renderSettings() {
  return shell(`${topbar({ title: "设置", back: true })}<div class="content-wrap settings">
    <section class="settings-card"><h2>每日提醒</h2><p>给自己留一个温柔的小提示。</p><label class="setting-row"><div><span>提醒时间</span><small>每天在这个时间提醒我</small></div><input id="reminder" type="time" value="${state.settings.reminder}" /></label></section>
    <section class="settings-card"><h2>主题选择</h2><p>选一种让你觉得舒服的颜色。</p><div class="theme-options">${Object.entries(THEMES).map(([id, t]) => `<button class="theme-option ${state.settings.theme === id ? "selected" : ""}" data-theme="${id}"><i class="theme-dot ${id}"></i><span><b>${t.name}</b><small>${t.desc}</small></span><em>${state.settings.theme === id ? "✓" : ""}</em></button>`).join("")}</div></section>
    <section class="settings-card privacy"><div class="privacy-icon">⌂</div><div><h2>你的记录，只属于你。</h2><p>Good Things 里的内容默认私密保存。<br>它们不会被公开，也不会出现在任何社区或排行榜里。</p></div></section>
    <section class="settings-card actions"><button data-action="export"><span>⇩</span><div><b>导出记录</b><small>保存一份属于你的好事</small></div><em>›</em></button><button class="danger" data-action="clear"><span>⌫</span><div><b>清空数据</b><small>删除设备上的全部记录</small></div><em>›</em></button></section>
    <p class="version">Good Things · 愿你常常看见生活里小小的光</p>
  </div>`);
}

function renderEdit() {
  const e = state.entries.find(x => x.id === state.editingId);
  if (!e) { state.tab = "timeline"; return render(); }
  return shell(`${topbar({ title: "编辑这件好事", back: true })}<div class="content-wrap edit-page"><div class="edit-note">你可以重新整理这段记忆，让它更贴近当时的感受。</div><section class="paper-card">${entryForm(e)}</section></div>`);
}

function render() {
  document.documentElement.dataset.theme = state.settings.theme;
  const views = { today: renderToday, timeline: renderTimeline, report: renderReport, settings: renderSettings, edit: renderEdit };
  document.querySelector("#app").innerHTML = views[state.tab]();
  bindForm();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function bindForm() {
  const form = document.querySelector("#entry-form"); if (!form) return;
  const validate = () => { form.querySelector("button[type=submit]").disabled = !(form.content.value.trim() && form.reason.value.trim() && form.feeling.value); };
  form.addEventListener("input", validate); validate();
  form.addEventListener("submit", e => {
    e.preventDefault(); const data = new FormData(form); const now = new Date().toISOString(); const id = form.dataset.id;
    if (id) {
      const item = state.entries.find(x => x.id === id); Object.assign(item, { content: data.get("content").trim(), reason: data.get("reason").trim(), feeling: data.get("feeling"), updatedAt: now });
      saveEntries(); state.editingId = null; state.tab = "timeline"; render(); showToast("这件好事已经更新了");
    } else {
      state.entries.push({ id: uid(), date: localDate(), createdAt: now, updatedAt: now, content: data.get("content").trim(), reason: data.get("reason").trim(), feeling: data.get("feeling") });
      saveEntries(); state.composing = false; render(); showToast("今天的好事，收好啦");
    }
  });
}

function confirmModal({ title, body, cancel, confirm, danger = false, onConfirm }) {
  const root = document.querySelector("#modal-root");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><div class="modal-icon ${danger ? "danger" : ""}">${danger ? "⌫" : "✦"}</div><h2>${title}</h2><p>${body}</p><div class="modal-actions"><button data-modal="cancel">${cancel}</button><button class="${danger ? "danger-btn" : "primary-btn"}" data-modal="confirm">${confirm}</button></div></div></div>`;
  root.querySelector('[data-modal="cancel"]').onclick = () => root.innerHTML = "";
  root.querySelector('[data-modal="confirm"]').onclick = () => { root.innerHTML = ""; onConfirm(); };
  root.querySelector(".modal-backdrop").onclick = e => { if (e.target === e.currentTarget) root.innerHTML = ""; };
}

document.addEventListener("click", e => {
  const tab = e.target.closest("[data-tab]"); if (tab) { state.tab = tab.dataset.tab; state.composing = false; render(); return; }
  const feeling = e.target.closest("[data-feeling]"); if (feeling) {
    const form = feeling.closest("form"); form.querySelectorAll("[data-feeling]").forEach(x => { x.classList.toggle("selected", x === feeling); x.setAttribute("aria-checked", x === feeling); });
    form.feeling.value = feeling.dataset.feeling; form.dispatchEvent(new Event("input")); return;
  }
  const action = e.target.closest("[data-action]"); if (!action) return;
  const id = action.dataset.id;
  if (action.dataset.action === "settings") { state.tab = "settings"; render(); }
  if (action.dataset.action === "back") { state.tab = state.editingId ? "timeline" : "today"; state.editingId = null; render(); }
  if (action.dataset.action === "compose") { state.composing = true; render(); }
  if (action.dataset.action === "go-today") { state.tab = "today"; render(); }
  if (action.dataset.action === "edit") { state.editingId = id; state.tab = "edit"; render(); }
  if (action.dataset.action === "delete") confirmModal({ title: "要删除这条好事吗？", body: "删除后，这条记录就不会出现在时间线和成长报告里了。", cancel: "先不删", confirm: "删除", danger: true, onConfirm: () => { const item = state.entries.find(x => x.id === id); item.isDeleted = true; item.updatedAt = new Date().toISOString(); saveEntries(); render(); showToast("这条记录已删除"); } });
  if (action.dataset.action === "clear") confirmModal({ title: "要清空所有记录吗？", body: "清空后，所有好事记录和成长报告都会从这台设备上删除，且无法恢复。", cancel: "先不清空", confirm: "全部清空", danger: true, onConfirm: () => { state.entries = []; saveEntries(); render(); showToast("本地记录已清空"); } });
  if (action.dataset.action === "export") {
    const blob = new Blob([JSON.stringify(activeEntries(), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `good-things-${localDate()}.json`; a.click(); URL.revokeObjectURL(a.href); showToast("记录已经为你整理好了");
  }
});

document.addEventListener("change", e => {
  if (e.target.id === "reminder") { state.settings.reminder = e.target.value; saveSettings(); showToast("提醒时间已保存"); }
});
document.addEventListener("click", e => {
  const theme = e.target.closest(".theme-option[data-theme]"); if (!theme) return; state.settings.theme = theme.dataset.theme; saveSettings(); render(); showToast(`已换成 ${THEMES[state.settings.theme].name}`);
});

window.GoodThings = { getCurrentMonthEntries, getEntryCount, getDaysCount, getTopFeeling, getCurrentStreak, getLongestStreakInMonth, localDate, FEELING_OPTIONS };
render();
