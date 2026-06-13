const today = new Date();
const dateKey = toDateKey(today);
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const englishWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const reasonPrefix = "是因为";

let entries = loadEntries();
let editingId = null;
let selectedDateKey = dateKey;
let entryDateKey = dateKey;

const views = document.querySelectorAll("[data-view]");
const tabs = document.querySelectorAll("[data-tab]");
const emptyHero = document.querySelector("#empty-hero");
const todayContent = document.querySelector("#today-content");
const todayList = document.querySelector("#today-list");
const todayCount = document.querySelector("#today-count");
const calendarGrid = document.querySelector("#calendar-grid");
const selectedDateLabel = document.querySelector("#selected-date-label");
const selectedDayList = document.querySelector("#selected-day-list");
const editor = document.querySelector("#editor");
const settings = document.querySelector("#settings");
const thingInput = document.querySelector("#thing-input");
const reasonInput = document.querySelector("#reason-input");
const tagsInput = document.querySelector("#tags-input");
const saveButton = document.querySelector("#save-entry");
const editorTitle = document.querySelector("#editor-title");

document.querySelector("#today-date").textContent = today.getDate();
document.querySelector("#today-weekday").textContent = englishWeekdays[today.getDay()];
document.querySelector("#calendar-title").textContent = `${monthNames[today.getMonth()]}`;
document.querySelector("#calendar-month-number").textContent = today.getMonth() + 1;

document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]");
  const action = event.target.closest("[data-action]");
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-delete]");
  const calendarDay = event.target.closest("[data-calendar-date]");

  if (tab) switchView(tab.dataset.tab);
  if (action?.dataset.action === "new") openEditor();
  if (edit) openEditor(edit.dataset.edit);
  if (remove) deleteEntry(remove.dataset.delete);
  if (calendarDay) selectDate(calendarDay.dataset.calendarDate);
});

document.querySelector("#cancel-edit").addEventListener("click", closeEditor);
document.querySelector("#settings-button").addEventListener("click", () => (settings.hidden = false));
document.querySelector("#close-settings").addEventListener("click", () => (settings.hidden = true));
document.querySelector("#add-selected-day").addEventListener("click", () => openEditor(null, selectedDateKey));

[thingInput, reasonInput].forEach((input) => input.addEventListener("input", validateEditor));
saveButton.addEventListener("click", saveEntry);

render();
registerServiceWorker();

function loadEntries() {
  const stored = localStorage.getItem("good-peanut-entries");
  if (stored) return JSON.parse(stored);
  return [];
}

function persist() {
  localStorage.setItem("good-peanut-entries", JSON.stringify(entries));
}

function switchView(viewName) {
  views.forEach((view) => (view.hidden = view.dataset.view !== viewName));
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === viewName));
  if (viewName === "review") renderReview();
}

function render() {
  renderToday();
  renderReview();
}

function renderToday() {
  const todaysEntries = entries.filter((entry) => entry.date === dateKey);
  emptyHero.hidden = todaysEntries.length > 0;
  todayContent.hidden = todaysEntries.length === 0;
  todayCount.textContent = `已经留下 ${todaysEntries.length} 件好事`;

  todayList.innerHTML = todaysEntries
    .map(
      (entry) => `
        <article class="entry-card">
          <header>
            <h3>${escapeHtml(entry.title)}</h3>
            <div class="entry-actions">
              <button class="mini-button" data-edit="${entry.id}">编辑</button>
              <button class="mini-button danger" data-delete="${entry.id}">删除</button>
            </div>
          </header>
          <p>${escapeHtml(entry.reason)}</p>
          ${renderTags(entry.tags)}
        </article>
      `,
    )
    .join("");
}

function renderReview() {
  renderCalendar();
  renderSelectedDay();
}

function renderCalendar() {
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const leadingBlanks = (firstDay + 6) % 7;
  const recordedDates = new Set(entries.map((entry) => entry.date));
  const cells = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    cells.push(`<span class="calendar-day placeholder" aria-hidden="true"></span>`);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = toDateKey(new Date(year, month, day));
    const classes = [
      "calendar-day",
      recordedDates.has(key) ? "has-entry" : "",
      key === selectedDateKey ? "selected" : "",
      key === dateKey ? "today" : "",
    ]
      .filter(Boolean)
      .join(" ");
    cells.push(`<button class="${classes}" data-calendar-date="${key}" aria-label="${formatDate(key)}">${day}</button>`);
  }

  calendarGrid.innerHTML = cells.join("");
}

function renderSelectedDay() {
  const dayEntries = entries.filter((entry) => entry.date === selectedDateKey);
  selectedDateLabel.textContent = formatDate(selectedDateKey);
  selectedDayList.innerHTML = dayEntries.length
    ? dayEntries
        .map(
          (entry) => `
            <article class="entry-card compact-card">
              <header>
                <h3>${escapeHtml(entry.title)}</h3>
                <div class="entry-actions">
                  <button class="mini-button" data-edit="${entry.id}">编辑</button>
                  <button class="mini-button danger" data-delete="${entry.id}">删除</button>
                </div>
              </header>
              <p>${escapeHtml(entry.reason)}</p>
              ${renderTags(entry.tags)}
            </article>
          `,
        )
        .join("")
    : `<p class="empty-day-copy">这一天还没有记录。</p>`;
}

function renderTags(tags) {
  if (!tags?.length) return "";
  return `<div class="tag-row">${tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function openEditor(id = null, date = dateKey) {
  editingId = id;
  const entry = entries.find((item) => item.id === id);
  entryDateKey = entry?.date ?? date;
  editorTitle.textContent = entry ? "编辑这件好事" : "记录一件好事";
  thingInput.value = entry?.title ?? "";
  reasonInput.value = stripReasonPrefix(entry?.reason ?? "");
  tagsInput.value = entry?.tags?.join("、") ?? "";
  editor.hidden = false;
  validateEditor();
  setTimeout(() => thingInput.focus(), 50);
}

function closeEditor() {
  editor.hidden = true;
  editingId = null;
}

function validateEditor() {
  saveButton.disabled = !(thingInput.value.trim() && reasonInput.value.trim());
}

function saveEntry() {
  const now = new Date().toISOString();
  const payload = {
    title: thingInput.value.trim(),
    reason: `${reasonPrefix}${reasonInput.value.trim()}`,
    tags: tagsInput.value
      .split(/[、,，\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    updatedAt: now,
  };

  if (editingId) {
    entries = entries.map((entry) => (entry.id === editingId ? { ...entry, ...payload } : entry));
  } else {
    entries.unshift({
      id: crypto.randomUUID(),
      date: entryDateKey,
      createdAt: now,
      ...payload,
    });
  }

  selectedDateKey = entryDateKey;
  persist();
  closeEditor();
  render();
}

function deleteEntry(id) {
  entries = entries.filter((entry) => entry.id !== id);
  persist();
  render();
}

function selectDate(value) {
  selectedDateKey = value;
  renderReview();
}

function stripReasonPrefix(value) {
  return value.startsWith(reasonPrefix) ? value.slice(reasonPrefix.length) : value;
}

function offsetDate(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
