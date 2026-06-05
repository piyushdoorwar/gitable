(function () {
  const vscode = acquireVsCodeApi();

  /** Inline SVG icons (no emojis / unicode glyphs). */
  const ICONS = {
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>',
    branch:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="14"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="7" r="2.4"/><path d="M18 9.4c0 4-3.5 5.6-6 5.6"/></svg>',
    sparkle:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2l1.9 5.4 5.4 1.9-5.4 1.9L12 16.8l-1.9-5.4L4.7 9.5l5.4-1.9z"/><path d="M18.7 13.6l.85 2.45 2.45.85-2.45.85-.85 2.45-.85-2.45-2.45-.85 2.45-.85z"/></svg>',
    commit:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.4"/><line x1="3" y1="12" x2="8.6" y2="12"/><line x1="15.4" y1="12" x2="21" y2="12"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    minus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    lock:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  };

  const PROVIDERS = [
    { value: "openai", label: "OpenAI" },
    { value: "gemini", label: "Gemini" },
    { value: "claude", label: "Claude" }
  ];

  /** Local UI state preserved across re-renders. */
  const ui = {
    activeTab: "changes",
    selected: new Set(),
    dd: /** @type {Record<string, any>} */ ({}),
    state: {
      repositoryName: "",
      branchName: "",
      activeRoot: "",
      repositories: [],
      changes: { staged: [], unstaged: [] },
      history: [],
      provider: "openai",
      model: "",
      models: [],
      hasApiKey: false,
      isLoading: false,
      error: "",
      notice: ""
    }
  };

  const openDropdowns = [];

  function post(message) {
    vscode.postMessage(message);
  }
  function byId(id) {
    return /** @type {HTMLElement} */ (document.getElementById(id));
  }
  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function icon(name, cls) {
    return `<span class="gx-ic ${cls || ""}">${ICONS[name]}</span>`;
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- Custom dropdown ----------
  function createDropdown(onSelect) {
    const root = el("div", "gx-select");
    const button = el("button", "gx-select-btn");
    button.type = "button";
    const iconSlot = el("span", "gx-select-ic");
    const label = el("span", "gx-select-label");
    button.append(iconSlot, label, el("span", "gx-chevron gx-ic sm", ICONS.chevron));
    const list = el("div", "gx-select-list");
    root.append(button, list);

    const iconHtml = (url) => (url ? `<img class="gx-opt-ic" src="${url}" alt="" />` : "");

    let items = [];
    let value = null;
    let disabled = false;
    let placeholder = "Select";

    function close() {
      root.classList.remove("open");
    }
    function open() {
      if (disabled) return;
      closeAllDropdowns();
      root.classList.add("open");
    }
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      root.classList.contains("open") ? close() : open();
    });
    openDropdowns.push(close);

    function paintLabel() {
      const current = items.find((i) => i.value === value);
      label.textContent = current ? current.label : placeholder;
      label.classList.toggle("placeholder", !current);
      iconSlot.innerHTML = current ? iconHtml(current.icon) : "";
    }
    function paintList() {
      list.innerHTML = "";
      items.forEach((it) => {
        const opt = el(
          "div",
          "gx-option" + (it.value === value ? " selected" : ""),
          iconHtml(it.icon) + `<span>${escapeHtml(it.label)}</span>`
        );
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          value = it.value;
          paintLabel();
          paintList();
          close();
          onSelect(it.value);
        });
        list.append(opt);
      });
    }

    return {
      root,
      getValue: () => value,
      update(nextItems, nextValue, options) {
        items = nextItems || [];
        value = nextValue;
        disabled = !!(options && options.disabled);
        placeholder = (options && options.placeholder) || "Select";
        root.classList.toggle("disabled", disabled);
        paintLabel();
        paintList();
      }
    };
  }
  function closeAllDropdowns() {
    openDropdowns.forEach((fn) => fn());
  }
  document.addEventListener("click", closeAllDropdowns);

  // ---------- Shell (built once) ----------
  function buildShell() {
    const app = byId("app");
    app.innerHTML = `
      <div class="gx-header">
        <div class="gx-repo-row">
          <div id="repoSlot" style="flex:1;min-width:0"></div>
          <button id="refreshBtn" class="gx-iconbtn" title="Refresh" type="button">${ICONS.refresh}</button>
        </div>
        <span class="gx-branch">${icon("branch", "sm")}<span id="branchName">—</span></span>
      </div>

      <div class="gx-tabs">
        <button class="gx-tab" data-tab="changes" type="button">Changes</button>
        <button class="gx-tab" data-tab="history" type="button">History</button>
        <button class="gx-tab" data-tab="settings" type="button">Settings</button>
      </div>

      <div id="panel-changes" class="gx-panel">
        <div id="changesNotice"></div>

        <div class="gx-section-head">
          <span class="gx-section-title">Staged</span>
          <span id="stagedCount" class="gx-count">0</span>
          <span class="spacer"></span>
          <button class="gx-mini-action" data-action="unstageSelected" type="button">Unstage selected</button>
          <button class="gx-mini-action" data-action="unstageAll" type="button">Unstage all</button>
        </div>
        <ul id="stagedList" class="gx-files"></ul>

        <div class="gx-section-head">
          <span class="gx-section-title">Changes</span>
          <span id="unstagedCount" class="gx-count">0</span>
          <span class="spacer"></span>
          <button class="gx-mini-action" data-action="stageSelected" type="button">Stage selected</button>
          <button class="gx-mini-action" data-action="stageAll" type="button">Stage all</button>
        </div>
        <ul id="unstagedList" class="gx-files"></ul>

        <div class="gx-card">
          <div class="gx-field">
            <label class="gx-label" for="commitSummary">Summary</label>
            <input id="commitSummary" type="text" placeholder="Summary (required)" maxlength="120" />
          </div>
          <div class="gx-field">
            <label class="gx-label" for="commitDescription">Description</label>
            <textarea id="commitDescription" placeholder="Description (optional)"></textarea>
          </div>
          <div class="gx-actions">
            <button id="generateBtn" class="gx-btn gx-btn-ghost" data-action="generate" type="button">
              ${icon("sparkle")}<span>Generate message</span>
            </button>
          </div>
          <div class="gx-actions">
            <button id="commitBtn" class="gx-btn gx-btn-primary" data-action="commit" type="button">
              ${icon("commit")}<span>Commit</span>
            </button>
          </div>
        </div>
      </div>

      <div id="panel-history" class="gx-panel hidden">
        <ul id="commitList" class="gx-commits"></ul>
      </div>

      <div id="panel-settings" class="gx-panel hidden">
        <div class="gx-field">
          <label class="gx-label">AI Provider</label>
          <div id="providerSlot"></div>
        </div>
        <div class="gx-field">
          <label class="gx-label" for="apiKeyInput">API Key</label>
          <input id="apiKeyInput" type="password" placeholder="Paste your API key" autocomplete="off" spellcheck="false" />
        </div>
        <div class="gx-actions">
          <button class="gx-btn gx-btn-primary" data-action="saveApiKey" type="button">${icon("lock")}<span>Save key</span></button>
          <button class="gx-btn gx-btn-ghost" data-action="validateApiKey" type="button">${icon("check")}<span>Validate</span></button>
        </div>
        <div id="modelHint" class="gx-hint">Save or validate your API key to load the available models.</div>
        <div id="modelSection" class="hidden">
          <div class="gx-field" style="margin-top:14px">
            <label class="gx-label">Model</label>
            <div id="modelSlot"></div>
          </div>
          <div class="gx-actions">
            <button class="gx-btn gx-btn-soft" data-action="refreshModels" type="button">${icon("refresh", "sm")}<span>Refresh</span></button>
            <button class="gx-btn gx-btn-primary" data-action="saveModel" type="button">${icon("check")}<span>Save model</span></button>
          </div>
        </div>
        <div id="settingsStatus" class="gx-status-line"></div>
        <div class="gx-privacy">
          ${icon("lock")}
          <span>Only the selected Git diff is sent to your configured AI provider. API keys are stored
          using VS Code SecretStorage. Gitable does not send data to any server owned by this extension.</span>
        </div>
      </div>
    `;

    // Dropdowns
    ui.dd.repo = createDropdown((root) => post({ type: "selectRepo", root }));
    ui.dd.provider = createDropdown((provider) => post({ type: "saveProvider", provider }));
    ui.dd.model = createDropdown(() => {
      /* value tracked in dropdown; persisted via Save model */
    });
    byId("repoSlot").append(ui.dd.repo.root);
    byId("providerSlot").append(ui.dd.provider.root);
    byId("modelSlot").append(ui.dd.model.root);

    // Tabs
    app.querySelectorAll(".gx-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.getAttribute("data-tab")));
    });
    byId("refreshBtn").addEventListener("click", () => post({ type: "refresh" }));

    // Delegated button actions
    app.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (target) handleAction(target.getAttribute("data-action"), target);
    });

    // Checkbox selection (delegated)
    [byId("stagedList"), byId("unstagedList")].forEach((listEl) => {
      listEl.addEventListener("change", (e) => {
        const box = e.target;
        if (!box.classList.contains("gx-check")) return;
        const path = box.getAttribute("data-path");
        if (box.checked) ui.selected.add(path);
        else ui.selected.delete(path);
      });
    });
  }

  function switchTab(tab) {
    if (!tab) return;
    ui.activeTab = tab;
    document.querySelectorAll(".gx-tab").forEach((t) => {
      t.classList.toggle("active", t.getAttribute("data-tab") === tab);
    });
    ["changes", "history", "settings"].forEach((name) => {
      byId("panel-" + name).classList.toggle("hidden", name !== tab);
    });
  }

  function handleAction(action, elm) {
    const s = ui.state;
    switch (action) {
      case "stageAll":
        post({ type: "stageAll" });
        break;
      case "unstageAll":
        post({ type: "unstageAll" });
        break;
      case "stageSelected": {
        const paths = selectedPaths(s.changes.unstaged);
        if (paths.length) post({ type: "stageFiles", filePaths: paths });
        break;
      }
      case "unstageSelected": {
        const paths = selectedPaths(s.changes.staged);
        if (paths.length) post({ type: "unstageFiles", filePaths: paths });
        break;
      }
      case "stageOne":
        post({ type: "stageFile", filePath: elm.getAttribute("data-path") });
        break;
      case "unstageOne":
        post({ type: "unstageFile", filePath: elm.getAttribute("data-path") });
        break;
      case "generate":
        post({ type: "generateCommitMessage" });
        break;
      case "commit": {
        const summary = /** @type {HTMLInputElement} */ (byId("commitSummary")).value.trim();
        const description = /** @type {HTMLTextAreaElement} */ (byId("commitDescription")).value.trim();
        if (!summary) {
          flashNotice("Please enter a commit summary.", "error");
          return;
        }
        post({ type: "commit", summary, description });
        break;
      }
      case "saveApiKey": {
        const apiKey = /** @type {HTMLInputElement} */ (byId("apiKeyInput")).value.trim();
        if (apiKey) post({ type: "saveApiKey", provider: ui.dd.provider.getValue(), apiKey });
        break;
      }
      case "validateApiKey":
        post({ type: "validateApiKey", provider: ui.dd.provider.getValue() });
        break;
      case "refreshModels":
        post({ type: "fetchModels", provider: ui.dd.provider.getValue() });
        break;
      case "saveModel": {
        const model = ui.dd.model.getValue();
        if (model) post({ type: "saveModel", model });
        break;
      }
      default:
        break;
    }
  }

  function selectedPaths(files) {
    return files.filter((f) => ui.selected.has(f.path)).map((f) => f.path);
  }
  function flashNotice(message, kind) {
    byId("changesNotice").innerHTML = `<div class="gx-notice ${kind}">${escapeHtml(message)}</div>`;
  }

  // ---------- Render ----------
  function render() {
    const s = ui.state;

    // Header
    byId("branchName").textContent = s.branchName || "—";
    const repos = (s.repositories || []).map((r) => ({ value: r.root, label: r.name }));
    ui.dd.repo.update(repos, s.activeRoot, {
      disabled: repos.length === 0,
      placeholder: s.repositoryName || "No repository"
    });

    renderNotice(s);

    // Lists
    byId("stagedList").innerHTML = renderFileList(s.changes.staged, "unstageOne", "minus");
    byId("unstagedList").innerHTML = renderFileList(s.changes.unstaged, "stageOne", "plus");
    byId("stagedCount").textContent = String((s.changes.staged || []).length);
    byId("unstagedCount").textContent = String((s.changes.unstaged || []).length);

    const busy = !!s.isLoading;
    byId("generateBtn").toggleAttribute("disabled", busy);
    byId("commitBtn").toggleAttribute("disabled", busy);

    renderHistory(s);
    renderSettings(s);
  }

  function renderNotice(s) {
    const region = byId("changesNotice");
    if (s.error) {
      region.innerHTML = `<div class="gx-notice error">${escapeHtml(s.error)}</div>`;
    } else if (s.isLoading) {
      region.innerHTML = `<div class="gx-spinner"><span class="dot"></span><span>Working…</span></div>`;
    } else if (s.notice) {
      region.innerHTML = `<div class="gx-notice info">${escapeHtml(s.notice)}</div>`;
    } else {
      region.innerHTML = "";
    }
  }

  function renderFileList(files, action, iconName) {
    if (!files || !files.length) {
      return `<li class="gx-empty">No files</li>`;
    }
    return files
      .map((f) => {
        const checked = ui.selected.has(f.path) ? "checked" : "";
        const title = action === "stageOne" ? "Stage file" : "Unstage file";
        return `
          <li class="gx-file">
            <input type="checkbox" class="gx-check" data-path="${escapeHtml(f.path)}" ${checked} />
            <span class="gx-status gx-status-${escapeHtml(f.status)}" title="${escapeHtml(f.status)}">${escapeHtml(
          f.status
        )}</span>
            <span class="gx-path" title="${escapeHtml(f.path)}">${escapeHtml(f.displayPath || f.path)}</span>
            <button class="gx-row-action" data-action="${action}" data-path="${escapeHtml(
          f.path
        )}" title="${title}" type="button">${ICONS[iconName]}</button>
          </li>`;
      })
      .join("");
  }

  function renderHistory(s) {
    const list = byId("commitList");
    const commits = s.history || [];
    if (!commits.length) {
      list.innerHTML = `<li class="gx-empty">No commits yet</li>`;
      return;
    }
    list.innerHTML = commits
      .map(
        (c) => `
        <li class="gx-commit">
          <span class="rail gx-ic">${ICONS.commit}</span>
          <span class="body">
            <div class="gx-commit-subject">${escapeHtml(c.subject)}</div>
            <div class="gx-commit-meta">
              <span class="gx-hash">${escapeHtml(c.hash)}</span>
              <span>${escapeHtml(c.author)}</span>
              <span>${escapeHtml(c.relativeDate)}</span>
            </div>
          </span>
        </li>`
      )
      .join("");
  }

  function renderSettings(s) {
    const icons = s.providerIcons || {};
    const providerItems = PROVIDERS.map((p) => ({ value: p.value, label: p.label, icon: icons[p.value] }));
    ui.dd.provider.update(providerItems, s.provider);

    // Models are only ever what the provider's API returned — never hardcoded.
    const list = s.models || [];
    const hasModels = list.length > 0;
    byId("modelSection").classList.toggle("hidden", !hasModels);
    byId("modelHint").classList.toggle("hidden", hasModels);
    if (hasModels) {
      ui.dd.model.update(
        list.map((m) => ({ value: m, label: m })),
        s.model,
        { placeholder: "Select a model" }
      );
    }

    const providerLabel = (PROVIDERS.find((p) => p.value === s.provider) || {}).label || s.provider;
    const keyBadge = s.hasApiKey
      ? `<span class="gx-badge ok">key saved</span>`
      : `<span class="gx-badge missing">no key</span>`;
    const provIcon = icons[s.provider] ? `<img class="gx-opt-ic" src="${icons[s.provider]}" alt="" />` : "";
    byId("settingsStatus").innerHTML =
      `${provIcon}<span class="gx-strong">${escapeHtml(providerLabel)}</span> ${keyBadge}` +
      `<span>model: <span class="gx-strong">${escapeHtml(s.model || "—")}</span></span>`;
  }

  // ---------- Messages from the extension host ----------
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message) return;
    switch (message.type) {
      case "state":
        ui.state = Object.assign(ui.state, message.data);
        pruneSelection();
        render();
        break;
      case "setCommitFields":
        if (typeof message.summary === "string")
          /** @type {HTMLInputElement} */ (byId("commitSummary")).value = message.summary;
        if (typeof message.description === "string")
          /** @type {HTMLTextAreaElement} */ (byId("commitDescription")).value = message.description;
        break;
      case "clearCommitFields":
        /** @type {HTMLInputElement} */ (byId("commitSummary")).value = "";
        /** @type {HTMLTextAreaElement} */ (byId("commitDescription")).value = "";
        break;
      case "switchTab":
        switchTab(message.tab);
        break;
      default:
        break;
    }
  });

  function pruneSelection() {
    const present = new Set();
    (ui.state.changes.staged || []).forEach((f) => present.add(f.path));
    (ui.state.changes.unstaged || []).forEach((f) => present.add(f.path));
    Array.from(ui.selected).forEach((p) => {
      if (!present.has(p)) ui.selected.delete(p);
    });
  }

  // ---------- Boot ----------
  buildShell();
  switchTab("changes");
  render();
  post({ type: "ready" });
})();
