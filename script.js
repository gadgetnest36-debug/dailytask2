/* =========================================================
   DailyTask — script.js
   Vanilla JS. No frameworks, no build step.
   Data model (localStorage key: "dailytask_data"):
   {
     "2026-09-17": [
       { id, name, category, priority, time, status, createdAt }
     ],
     "2026-09-16": [ ... ]
   }
   status is one of: "done" | "doing" | "notdone"
   Theme preference stored under "dailytask_theme".
   ========================================================= */

(function () {
  "use strict";

  // ---------- Storage keys ----------
  const DATA_KEY = "dailytask_data";
  const THEME_KEY = "dailytask_theme";

  // ---------- State ----------
  let allData = {};          // full localStorage-backed object, keyed by date
  let todayKey = getDateKey(new Date());
  let currentFilter = "all"; // all | done | doing | notdone
  let searchTerm = "";
  let taskPendingDelete = null;

  // ---------- DOM references ----------
  const el = {
    currentDate: document.getElementById("currentDate"),
    themeToggle: document.getElementById("themeToggle"),
    themeIcon: document.getElementById("themeIcon"),
    themeLabel: document.getElementById("themeLabel"),

    taskForm: document.getElementById("taskForm"),
    taskName: document.getElementById("taskName"),
    taskNameError: document.getElementById("taskNameError"),
    taskCategory: document.getElementById("taskCategory"),
    taskPriority: document.getElementById("taskPriority"),
    taskTime: document.getElementById("taskTime"),

    taskList: document.getElementById("taskList"),
    emptyState: document.getElementById("emptyState"),
    noResultsState: document.getElementById("noResultsState"),
    emptyAddBtn: document.getElementById("emptyAddBtn"),

    filterBtns: Array.from(document.querySelectorAll(".filter-btn")),
    searchInput: document.getElementById("searchInput"),

    completedCount: document.getElementById("completedCount"),
    totalCount: document.getElementById("totalCount"),
    progressPercent: document.getElementById("progressPercent"),
    progressFill: document.getElementById("progressFill"),
    progressBarWrap: document.getElementById("progressBarWrap"),

    statTotal: document.getElementById("statTotal"),
    statDone: document.getElementById("statDone"),
    statDoing: document.getElementById("statDoing"),
    statNotDone: document.getElementById("statNotDone"),

    editModalOverlay: document.getElementById("editModalOverlay"),
    editTaskForm: document.getElementById("editTaskForm"),
    editTaskId: document.getElementById("editTaskId"),
    editTaskName: document.getElementById("editTaskName"),
    editTaskCategory: document.getElementById("editTaskCategory"),
    editTaskPriority: document.getElementById("editTaskPriority"),
    editTaskTime: document.getElementById("editTaskTime"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),

    deleteModalOverlay: document.getElementById("deleteModalOverlay"),
    deleteModalText: document.getElementById("deleteModalText"),
    cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
    confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),

    historyToggle: document.getElementById("historyToggle"),
    historyOverlay: document.getElementById("historyOverlay"),
    closeHistoryBtn: document.getElementById("closeHistoryBtn"),
    historyDateSelect: document.getElementById("historyDateSelect"),
    historyContent: document.getElementById("historyContent"),

    toast: document.getElementById("toast"),
  };

  // =========================================================
  // Utility functions
  // =========================================================

  /** Returns a "YYYY-MM-DD" key for a given Date, based on local time. */
  function getDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /** Formats today's date nicely, e.g. "Wednesday, September 17, 2026" */
  function formatFriendlyDate(date) {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatDateKeyFriendly(key) {
    // key is "YYYY-MM-DD" — parse as local date to avoid TZ shifting the day
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return formatFriendlyDate(date);
  }

  function generateId() {
    return "t-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime12h(timeStr) {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    requestAnimationFrame(() => el.toast.classList.add("show"));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.toast.classList.remove("show");
      setTimeout(() => { el.toast.hidden = true; }, 220);
    }, 2200);
  }

  // =========================================================
  // Storage layer
  // =========================================================

  function loadData() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.error("DailyTask: failed to parse stored data, starting fresh.", err);
      allData = {};
    }
    if (!allData[todayKey]) {
      allData[todayKey] = [];
    }
  }

  function saveData() {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    } catch (err) {
      console.error("DailyTask: failed to save data.", err);
      showToast("⚠ Could not save — storage may be full.");
    }
  }

  function getTodayTasks() {
    return allData[todayKey] || [];
  }

  // =========================================================
  // Theme
  // =========================================================

  function loadTheme() {
    let theme = "light";
    try {
      theme = localStorage.getItem(THEME_KEY) || "light";
    } catch (err) { /* ignore */ }
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const isDark = theme === "dark";
    el.themeToggle.setAttribute("aria-pressed", String(isDark));
    el.themeIcon.textContent = isDark ? "☀️" : "🌙";
    el.themeLabel.textContent = isDark ? "Light" : "Dark";
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* ignore */ }
  }

  // =========================================================
  // Rendering
  // =========================================================

  function renderDate() {
    el.currentDate.textContent = formatFriendlyDate(new Date());
  }

  function computeStats(tasks) {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const doing = tasks.filter((t) => t.status === "doing").length;
    const notdone = tasks.filter((t) => t.status === "notdone").length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, doing, notdone, percent };
  }

  function renderProgress() {
    const tasks = getTodayTasks();
    const { total, done, doing, notdone, percent } = computeStats(tasks);

    el.completedCount.textContent = done;
    el.totalCount.textContent = total;
    el.progressPercent.textContent = `${percent}%`;
    el.progressFill.style.width = `${percent}%`;
    el.progressBarWrap.setAttribute("aria-valuenow", String(percent));

    el.statTotal.textContent = total;
    el.statDone.textContent = done;
    el.statDoing.textContent = doing;
    el.statNotDone.textContent = notdone;
  }

  function getFilteredTasks() {
    const tasks = getTodayTasks();
    return tasks.filter((task) => {
      const matchesFilter = currentFilter === "all" || task.status === currentFilter;
      const matchesSearch =
        searchTerm.trim() === "" ||
        task.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }

  const STATUS_LABEL = { done: "DONE", doing: "DOING", notdone: "NOT DONE" };
  const STATUS_DOT = { done: "🟢", doing: "🟡", notdone: "🔴" };

  function buildTaskCard(task) {
    const card = document.createElement("article");
    card.className = `task-card status-${task.status}`;
    card.dataset.id = task.id;

    const priorityClass = `priority-${task.priority.toLowerCase()}`;
    const timeChip = task.time
      ? `<span class="meta-chip">🕒 ${escapeHtml(formatTime12h(task.time))}</span>`
      : "";

    card.innerHTML = `
      <div class="task-top">
        <p class="task-name">${escapeHtml(task.name)}</p>
        <span class="status-badge ${task.status}">${STATUS_DOT[task.status]} ${STATUS_LABEL[task.status]}</span>
      </div>
      <div class="task-meta">
        <span class="meta-chip">${escapeHtml(task.category)}</span>
        <span class="meta-chip ${priorityClass}">⚑ ${escapeHtml(task.priority)}</span>
        ${timeChip}
      </div>
      <div class="task-actions">
        <button type="button" class="status-action-btn sa-done ${task.status === "done" ? "current" : ""}" data-action="status" data-status="done">✓ Done</button>
        <button type="button" class="status-action-btn sa-doing ${task.status === "doing" ? "current" : ""}" data-action="status" data-status="doing">◐ Doing</button>
        <button type="button" class="status-action-btn sa-notdone ${task.status === "notdone" ? "current" : ""}" data-action="status" data-status="notdone">✕ Not Done</button>
      </div>
      <div class="task-bottom-row">
        <div class="task-icon-actions">
          <button type="button" class="icon-action-btn edit-btn" data-action="edit" aria-label="Edit task: ${escapeHtml(task.name)}">✎</button>
          <button type="button" class="icon-action-btn delete-btn" data-action="delete" aria-label="Delete task: ${escapeHtml(task.name)}">🗑</button>
        </div>
      </div>
    `;
    return card;
  }

  function renderTaskList() {
    const allTasks = getTodayTasks();
    const filtered = getFilteredTasks();

    el.taskList.innerHTML = "";

    if (allTasks.length === 0) {
      el.emptyState.hidden = false;
      el.noResultsState.hidden = true;
      el.taskList.hidden = true;
      return;
    }

    el.emptyState.hidden = true;
    el.taskList.hidden = false;

    if (filtered.length === 0) {
      el.noResultsState.hidden = false;
      return;
    }
    el.noResultsState.hidden = true;

    // Sort: not-done/doing tasks first (actionable), then by time, then done at bottom-ish
    const sorted = [...filtered].sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return a.createdAt - b.createdAt;
    });

    const fragment = document.createDocumentFragment();
    sorted.forEach((task) => fragment.appendChild(buildTaskCard(task)));
    el.taskList.appendChild(fragment);
  }

  function renderAll() {
    renderProgress();
    renderTaskList();
  }

  // =========================================================
  // Task CRUD
  // =========================================================

  function addTask(data) {
    const task = {
      id: generateId(),
      name: data.name.trim(),
      category: data.category,
      priority: data.priority,
      time: data.time || "",
      status: "doing",
      createdAt: Date.now(),
    };
    allData[todayKey] = allData[todayKey] || [];
    allData[todayKey].push(task);
    saveData();
    renderAll();
    showToast("Task added ✓");
  }

  function updateTaskStatus(id, status) {
    const tasks = getTodayTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    task.status = status;
    saveData();
    renderAll();
  }

  function updateTaskDetails(id, updates) {
    const tasks = getTodayTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    Object.assign(task, updates);
    saveData();
    renderAll();
    showToast("Task updated ✓");
  }

  function deleteTask(id) {
    allData[todayKey] = getTodayTasks().filter((t) => t.id !== id);
    saveData();
    renderAll();
    showToast("Task deleted");
  }

  // =========================================================
  // Event handlers — Add Task form
  // =========================================================

  el.taskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el.taskName.value.trim();

    if (!name) {
      el.taskNameError.hidden = false;
      el.taskName.setAttribute("aria-invalid", "true");
      el.taskName.focus();
      return;
    }
    el.taskNameError.hidden = true;
    el.taskName.removeAttribute("aria-invalid");

    addTask({
      name,
      category: el.taskCategory.value,
      priority: el.taskPriority.value,
      time: el.taskTime.value,
    });

    el.taskForm.reset();
    el.taskCategory.value = "Personal";
    el.taskPriority.value = "Medium";
    el.taskName.focus();
  });

  el.taskName.addEventListener("input", () => {
    if (el.taskName.value.trim()) {
      el.taskNameError.hidden = true;
      el.taskName.removeAttribute("aria-invalid");
    }
  });

  el.emptyAddBtn.addEventListener("click", () => {
    el.taskName.focus();
    window.scrollTo({ top: el.taskForm.getBoundingClientRect().top + window.scrollY - 20, behavior: "smooth" });
  });

  // =========================================================
  // Event handlers — Task list (event delegation)
  // =========================================================

  el.taskList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const card = e.target.closest(".task-card");
    const id = card?.dataset.id;
    if (!id) return;

    const action = btn.dataset.action;

    if (action === "status") {
      updateTaskStatus(id, btn.dataset.status);
    } else if (action === "edit") {
      openEditModal(id);
    } else if (action === "delete") {
      openDeleteModal(id, card);
    }
  });

  // =========================================================
  // Filters + Search
  // =========================================================

  el.filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      el.filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderTaskList();
    });
  });

  el.searchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderTaskList();
  });

  // =========================================================
  // Edit modal
  // =========================================================

  function openEditModal(id) {
    const task = getTodayTasks().find((t) => t.id === id);
    if (!task) return;
    el.editTaskId.value = task.id;
    el.editTaskName.value = task.name;
    el.editTaskCategory.value = task.category;
    el.editTaskPriority.value = task.priority;
    el.editTaskTime.value = task.time || "";
    el.editModalOverlay.hidden = false;
    el.editTaskName.focus();
  }

  function closeEditModal() {
    el.editModalOverlay.hidden = true;
  }

  el.editTaskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el.editTaskName.value.trim();
    if (!name) {
      el.editTaskName.focus();
      return;
    }
    updateTaskDetails(el.editTaskId.value, {
      name,
      category: el.editTaskCategory.value,
      priority: el.editTaskPriority.value,
      time: el.editTaskTime.value,
    });
    closeEditModal();
  });

  el.cancelEditBtn.addEventListener("click", closeEditModal);
  el.editModalOverlay.addEventListener("click", (e) => {
    if (e.target === el.editModalOverlay) closeEditModal();
  });

  // =========================================================
  // Delete modal
  // =========================================================

  function openDeleteModal(id, cardEl) {
    const task = getTodayTasks().find((t) => t.id === id);
    if (!task) return;
    taskPendingDelete = { id, cardEl };
    el.deleteModalText.textContent = `"${task.name}" will be permanently removed. This action cannot be undone.`;
    el.deleteModalOverlay.hidden = false;
    el.confirmDeleteBtn.focus();
  }

  function closeDeleteModal() {
    el.deleteModalOverlay.hidden = true;
    taskPendingDelete = null;
  }

  el.cancelDeleteBtn.addEventListener("click", closeDeleteModal);
  el.deleteModalOverlay.addEventListener("click", (e) => {
    if (e.target === el.deleteModalOverlay) closeDeleteModal();
  });

  el.confirmDeleteBtn.addEventListener("click", () => {
    if (!taskPendingDelete) return;
    const { id, cardEl } = taskPendingDelete;
    if (cardEl) {
      cardEl.classList.add("removing");
      setTimeout(() => deleteTask(id), 200);
    } else {
      deleteTask(id);
    }
    closeDeleteModal();
  });

  // Escape key closes any open modal
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!el.editModalOverlay.hidden) closeEditModal();
    if (!el.deleteModalOverlay.hidden) closeDeleteModal();
    if (!el.historyOverlay.hidden) closeHistory();
  });

  // =========================================================
  // Theme toggle
  // =========================================================

  el.themeToggle.addEventListener("click", toggleTheme);

  // =========================================================
  // History panel
  // =========================================================

  function getSortedHistoryDates() {
    return Object.keys(allData)
      .filter((key) => allData[key] && allData[key].length > 0)
      .sort((a, b) => (a < b ? 1 : -1)); // newest first
  }

  function openHistory() {
    const dates = getSortedHistoryDates();

    // Use a native date picker so the history can be selected from a
    // real calendar on both desktop and mobile.
    if (dates.length === 0) {
      el.historyDateSelect.value = todayKey;
      el.historyContent.innerHTML = `<p class="history-empty">No tasks recorded yet. Start adding tasks today!</p>`;
    } else {
      el.historyDateSelect.value = dates[0];
      renderHistoryForDate(dates[0]);
    }

    el.historyOverlay.hidden = false;
  }

  function closeHistory() {
    el.historyOverlay.hidden = true;
  }

  function renderHistoryForDate(key) {
    const tasks = allData[key] || [];
    const { total, done, doing, notdone, percent } = computeStats(tasks);

    if (tasks.length === 0) {
      el.historyContent.innerHTML = `<p class="history-empty">No tasks recorded for this date.</p>`;
      return;
    }

    const summary = `
      <div class="history-summary">
        <span><strong>${total}</strong> total</span>
        <span><strong>${done}</strong> done</span>
        <span><strong>${doing}</strong> doing</span>
        <span><strong>${notdone}</strong> not done</span>
        <span><strong>${percent}%</strong> completion</span>
      </div>
    `;

    const rows = tasks
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((t) => `
        <div class="history-task-row">
          <span>${escapeHtml(t.name)} <span style="color:var(--text-muted); font-size:12px;">(${escapeHtml(t.category)})</span></span>
          <span class="status-badge ${t.status}">${STATUS_DOT[t.status]} ${STATUS_LABEL[t.status]}</span>
        </div>
      `)
      .join("");

    el.historyContent.innerHTML = summary + rows;
  }

  el.historyToggle.addEventListener("click", openHistory);
  el.closeHistoryBtn.addEventListener("click", closeHistory);
  el.historyOverlay.addEventListener("click", (e) => {
    if (e.target === el.historyOverlay) closeHistory();
  });
  el.historyDateSelect.addEventListener("change", (e) => {
    if (e.target.value) {
      renderHistoryForDate(e.target.value);
    }
  });

  // =========================================================
  // Daily rollover check
  // Checks periodically whether the calendar day has changed while
  // the app is open (e.g. left open overnight), and refreshes the
  // dashboard to show the new day's (empty) task list without
  // deleting the previous day's data.
  // =========================================================

  function checkForNewDay() {
    const freshKey = getDateKey(new Date());
    if (freshKey !== todayKey) {
      todayKey = freshKey;
      if (!allData[todayKey]) allData[todayKey] = [];
      saveData();
      renderDate();
      renderAll();
      showToast("A new day has started — here's your fresh task list.");
    }
  }

  // =========================================================
  // Init
  // =========================================================

  function init() {
    loadTheme();
    loadData();
    renderDate();
    renderAll();

    // Check every minute in case the app is left open across midnight.
    setInterval(checkForNewDay, 60 * 1000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
