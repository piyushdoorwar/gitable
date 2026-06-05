// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  /** Local UI state that must survive re-renders. */
  const ui = {
    activeTab: "changes",
    selected: new Set(),
    /** @type {any} */
    state: {
      repositoryName: "",
      branchName: "",
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

  const PROVIDER_LABELS = { openai: "OpenAI", gemini: "Gemini", claude: "Claude" };

  function post(message) {
    vscode.postMessage(message);
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- Shell (built once) ----------
  function buildShell() {
    const app = document.getElementById("app");
    if (!app) {
      return;
    }
    app.innerHTML = `
      <div class="header">
        <div class="repo-row">
          <select id="repoSelect" class="repo-select" title="Repository"></select>
          <button id="refreshBtn" class="icon-button" title="Refresh">&#x21bb;</button>
        </div>
        <div class="branch-row">
          <span>&#x2387;</span><span id="branchName" class="branch-name">—</span>
        </div>
      </div>

      <div class="tabs">
        <button class="tab" data-tab="changes">Changes</button>
        <button class="tab" data-tab="history">History</button>
        <button class="tab" data-tab="settings">Settings</button>
      </div>

      <div id="panel-changes" class="tab-panel">
        <div id="changesNotice"></div>
        <div class="button-row">
          <button class="btn" data-action="stageSelected">Stage selected</button>
          <button class="btn" data-action="unstageSelected">Unstage selected</button>
        </div>
        <div class="button-row">
          <button class="btn" data-action="stageAll">Stage all</button>
          <button class="btn" data-action="unstageAll">Unstage all</button>
        </div>

        <div class="section-title"><span>Staged Changes</span></div>
        <ul id="stagedList" class="file-list"></ul>

        <div class="section-title"><span>Changes</span></div>
        <ul id="unstagedList" class="file-list"></ul>

        <div class="field" style="margin-top:12px;">
          <label for="commitSummary">Summary</label>
          <input id="commitSummary" type="text" placeholder="Summary (required)" maxlength="120" />
        </div>
        <div class="field">
          <label for="commitDescription">Description</label>
          <textarea id="commitDescription" placeholder="Description (optional)"></textarea>
        </div>
        <div class="button-row">
          <button id="generateBtn" class="btn" data-action="generate">&#10024; Generate AI message</button>
        </div>
        <div class="button-row">
          <button id="commitBtn" class="btn primary" data-action="commit">Commit</button>
        </div>
      </div>

      <div id="panel-history" class="tab-panel hidden">
        <ul id="commitList" class="commit-list"></ul>
      </div>

      <div id="panel-settings" class="tab-panel hidden">
        <div class="field">
          <label for="providerSelect">AI Provider</label>
          <select id="providerSelect">
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
          </select>
        </div>
        <div class="field">
          <label for="apiKeyInput">API Key</label>
          <input id="apiKeyInput" type="password" placeholder="Paste your API key" autocomplete="off" />
        </div>
        <div class="button-row">
          <button class="btn primary" data-action="saveApiKey">Save key</button>
          <button class="btn" data-action="validateApiKey">Validate key</button>
        </div>
        <div class="field">
          <label for="modelSelect">Model</label>
          <select id="modelSelect"></select>
        </div>
        <div class="button-row">
          <button class="btn" data-action="refreshModels">Refresh models</button>
          <button class="btn primary" data-action="saveModel">Save model</button>
        </div>
        <div id="settingsStatus" class="status-line"></div>
        <div class="privacy-note">
          Only the selected Git diff is sent to your configured AI provider. API keys are stored
          using VS Code SecretStorage. Gitable does not send data to any server owned by this extension.
        </div>
      </div>
    `;

    // Tab switching
    app.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.getAttribute("data-tab")));
    });

    // Header actions
    byId("refreshBtn").addEventListener("click", () => post({ type: "refresh" }));
    byId("repoSelect").addEventListener("change", (e) =>
      post({ type: "selectRepo", root: e.target.value })
    );

    // Delegated button actions
    app.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) {
        return;
      }
      handleAction(target.getAttribute("data-action"), target);
    });

    // Provider change refreshes the key/model view immediately
    byId("providerSelect").addEventListener("change", (e) => {
      post({ type: "saveProvider", provider: e.target.value });
    });
  }

  function byId(id) {
    return /** @type {HTMLElement} */ (document.getElementById(id));
  }

  function switchTab(tab) {
    if (!tab) {
      return;
    }
    ui.activeTab = tab;
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.getAttribute("data-tab") === tab);
    });
    ["changes", "history", "settings"].forEach((name) => {
      byId("panel-" + name).classList.toggle("hidden", name !== tab);
    });
  }

  function handleAction(action, el) {
    const state = ui.state;
    switch (action) {
      case "stageAll":
        post({ type: "stageAll" });
        break;
      case "unstageAll":
        post({ type: "unstageAll" });
        break;
      case "stageSelected": {
        const paths = selectedPaths(state.changes.unstaged);
        if (paths.length) {
          post({ type: "stageFiles", filePaths: paths });
        }
        break;
      }
      case "unstageSelected": {
        const paths = selectedPaths(state.changes.staged);
        if (paths.length) {
          post({ type: "unstageFiles", filePaths: paths });
        }
        break;
      }
      case "stageOne":
        post({ type: "stageFile", filePath: el.getAttribute("data-path") });
        break;
      case "unstageOne":
        post({ type: "unstageFile", filePath: el.getAttribute("data-path") });
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
        if (!apiKey) {
          return;
        }
        post({ type: "saveApiKey", provider: currentProvider(), apiKey });
        break;
      }
      case "validateApiKey":
        post({ type: "validateApiKey", provider: currentProvider() });
        break;
      case "refreshModels":
        post({ type: "fetchModels", provider: currentProvider() });
        break;
      case "saveModel": {
        const model = /** @type {HTMLSelectElement} */ (byId("modelSelect")).value;
        post({ type: "saveModel", model });
        break;
      }
      default:
        break;
    }
  }

  function currentProvider() {
    return /** @type {HTMLSelectElement} */ (byId("providerSelect")).value;
  }

  function selectedPaths(files) {
    return files.filter((f) => ui.selected.has(f.path)).map((f) => f.path);
  }

  function flashNotice(message, kind) {
    const region = byId("changesNotice");
    region.innerHTML = `<div class="notice ${kind}">${escapeHtml(message)}</div>`;
  }

  // ---------- Rendering dynamic regions ----------
  function render() {
    const s = ui.state;

    // Header
    byId("branchName").textContent = s.branchName || "—";
    renderRepoSelect(s);

    // Notice
    renderNotice(s);

    // File lists
    byId("stagedList").innerHTML = renderFileList(s.changes.staged, "unstageOne");
    byId("unstagedList").innerHTML = renderFileList(s.changes.unstaged, "stageOne");
    wireCheckboxes();

    // Buttons disabled state
    const busy = !!s.isLoading;
    byId("generateBtn").toggleAttribute("disabled", busy);
    byId("commitBtn").toggleAttribute("disabled", busy);

    // History
    renderHistory(s);

    // Settings
    renderSettings(s);
  }

  function renderRepoSelect(s) {
    const select = /** @type {HTMLSelectElement} */ (byId("repoSelect"));
    const repos = s.repositories || [];
    if (!repos.length) {
      select.innerHTML = `<option>${escapeHtml(s.repositoryName || "No repository")}</option>`;
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = repos
      .map(
        (r) =>
          `<option value="${escapeHtml(r.root)}" ${r.root === s.activeRoot ? "selected" : ""}>${escapeHtml(
            r.name
          )}</option>`
      )
      .join("");
  }

  function renderNotice(s) {
    const region = byId("changesNotice");
    if (s.error) {
      region.innerHTML = `<div class="notice error">${escapeHtml(s.error)}</div>`;
    } else if (s.notice) {
      region.innerHTML = `<div class="notice info">${escapeHtml(s.notice)}</div>`;
    } else if (s.isLoading) {
      region.innerHTML = `<div class="spinner">Working…</div>`;
    } else {
      region.innerHTML = "";
    }
  }

  function renderFileList(files, action) {
    if (!files || !files.length) {
      return `<li class="empty">No files</li>`;
    }
    const actionLabel = action === "stageOne" ? "+" : "−";
    const actionTitle = action === "stageOne" ? "Stage file" : "Unstage file";
    return files
      .map((f) => {
        const checked = ui.selected.has(f.path) ? "checked" : "";
        return `
          <li class="file-item">
            <input type="checkbox" data-path="${escapeHtml(f.path)}" ${checked} />
            <span class="file-status status-${escapeHtml(f.status)}" title="${escapeHtml(f.status)}">${escapeHtml(
          f.status
        )}</span>
            <span class="file-path" title="${escapeHtml(f.path)}">${escapeHtml(f.displayPath || f.path)}</span>
            <button class="icon-button file-action" data-action="${action}" data-path="${escapeHtml(
          f.path
        )}" title="${actionTitle}">${actionLabel}</button>
          </li>`;
      })
      .join("");
  }

  function wireCheckboxes() {
    document
      .querySelectorAll('.file-item input[type="checkbox"]')
      .forEach((box) => {
        box.addEventListener("change", (e) => {
          const path = e.target.getAttribute("data-path");
          if (e.target.checked) {
            ui.selected.add(path);
          } else {
            ui.selected.delete(path);
          }
        });
      });
  }

  function renderHistory(s) {
    const list = byId("commitList");
    const commits = s.history || [];
    if (!commits.length) {
      list.innerHTML = `<li class="empty">No commits yet</li>`;
      return;
    }
    list.innerHTML = commits
      .map(
        (c) => `
        <li class="commit-item">
          <div class="commit-subject">${escapeHtml(c.subject)}</div>
          <div class="commit-meta">
            <span class="commit-hash">${escapeHtml(c.hash)}</span>
            <span>${escapeHtml(c.author)}</span>
            <span>${escapeHtml(c.relativeDate)}</span>
          </div>
        </li>`
      )
      .join("");
  }

  function renderSettings(s) {
    /** @type {HTMLSelectElement} */ (byId("providerSelect")).value = s.provider || "openai";

    const modelSelect = /** @type {HTMLSelectElement} */ (byId("modelSelect"));
    const models = s.models && s.models.length ? s.models : s.model ? [s.model] : [];
    modelSelect.innerHTML = models
      .map((m) => `<option value="${escapeHtml(m)}" ${m === s.model ? "selected" : ""}>${escapeHtml(m)}</option>`)
      .join("");
    if (!models.length) {
      modelSelect.innerHTML = `<option value="">Validate your key to load models</option>`;
    }

    const providerLabel = PROVIDER_LABELS[s.provider] || s.provider;
    const keyBadge = s.hasApiKey
      ? `<span class="status-badge ok">key saved</span>`
      : `<span class="status-badge missing">no key</span>`;
    byId("settingsStatus").innerHTML =
      `${escapeHtml(providerLabel)} ${keyBadge} ` +
      `&nbsp; model: <strong>${escapeHtml(s.model || "—")}</strong>`;
  }

  // ---------- Messages from the extension host ----------
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message) {
      return;
    }
    switch (message.type) {
      case "state":
        ui.state = Object.assign(ui.state, message.data);
        // Drop selections for files that no longer exist.
        pruneSelection();
        render();
        break;
      case "setCommitFields": {
        if (typeof message.summary === "string") {
          /** @type {HTMLInputElement} */ (byId("commitSummary")).value = message.summary;
        }
        if (typeof message.description === "string") {
          /** @type {HTMLTextAreaElement} */ (byId("commitDescription")).value = message.description;
        }
        break;
      }
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
      if (!present.has(p)) {
        ui.selected.delete(p);
      }
    });
  }

  // ---------- Boot ----------
  buildShell();
  switchTab("changes");
  render();
  post({ type: "ready" });
})();
