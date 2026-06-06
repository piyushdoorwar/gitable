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
    stageAll:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h7"/><path d="M4 12h7"/><path d="M4 17h7"/><path d="M17 6v12"/><path d="M11 12h12"/></svg>',
    unstageAll:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h7"/><path d="M4 12h7"/><path d="M4 17h7"/><path d="M12 12h10"/></svg>',
    lock:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    repo:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h11a1 1 0 0 1 1 1v14H7a2 2 0 0 0-2 2V5a2 2 0 0 1 2-2z"/><path d="M5 18a2 2 0 0 0 2 2h11"/></svg>',
    push:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-8"/><path d="m8 16 4-4 4 4"/><path d="M4.6 14.5A6 6 0 0 1 8 3.6a6.5 6.5 0 0 1 11.7 3.4A4.8 4.8 0 0 1 19 16.4"/></svg>',
    pull:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/><path d="M4.6 14.5A6 6 0 0 1 8 3.6a6.5 6.5 0 0 1 11.7 3.4A4.8 4.8 0 0 1 19 16.4"/></svg>',
    changes:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    history:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    file:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>',
    image:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>',
    dot:
      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>'
  };

  /** Extension -> a colour class for the file-type icon. */
  const EXT_CLASS = {
    // JavaScript / TypeScript
    ts: "ts", tsx: "ts", mts: "ts", cts: "ts",
    js: "js", jsx: "js", mjs: "js", cjs: "js",
    json: "json", jsonc: "json", json5: "json",
    // Web
    css: "css", less: "css",
    scss: "scss", sass: "scss",
    html: "html", htm: "html", xhtml: "html", xml: "html", vue: "html", svelte: "html", astro: "html",
    // Docs / text
    md: "md", markdown: "md", mdx: "md", rst: "md", txt: "md", tex: "md", adoc: "md",
    // Images
    svg: "img", png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", ico: "img", bmp: "img", avif: "img",
    // Python
    py: "py", pyw: "py", pyi: "py", ipynb: "py",
    // Go / Rust
    go: "go",
    rs: "rs",
    // JVM
    java: "java", jar: "java",
    kt: "kotlin", kts: "kotlin",
    scala: "scala", sc: "scala",
    groovy: "groovy", gradle: "groovy",
    clj: "clojure", cljs: "clojure", cljc: "clojure", edn: "clojure",
    // .NET
    cs: "cs", csx: "cs", vb: "cs", fs: "cs", fsx: "cs", fsi: "cs",
    // C / C++ / Objective-C
    c: "cpp", h: "cpp", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", ino: "cpp", m: "cpp", mm: "cpp",
    // Other languages
    rb: "ruby", erb: "ruby", gemspec: "ruby",
    php: "php",
    swift: "swift",
    dart: "dart",
    r: "r",
    lua: "lua",
    pl: "perl", pm: "perl",
    ex: "elixir", exs: "elixir",
    erl: "elixir", hrl: "elixir",
    hs: "haskell",
    jl: "julia",
    // Shell / scripts
    sh: "sh", bash: "sh", zsh: "sh", fish: "sh", ksh: "sh",
    bat: "bat", cmd: "bat",
    ps1: "ps", psm1: "ps", psd1: "ps",
    // Data / config
    yml: "yaml", yaml: "yaml", toml: "yaml",
    env: "yaml", ini: "yaml", cfg: "yaml", conf: "yaml", properties: "yaml",
    sql: "sql",
    graphql: "gql", gql: "gql", proto: "gql",
    csv: "sh", tsv: "sh"
  };

  /** Special files without a useful extension. */
  const FILENAME_CLASS = {
    dockerfile: "docker",
    makefile: "default",
    gemfile: "ruby",
    rakefile: "ruby",
    cmakelists: "cpp"
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
    branchFilter: "",
    dd: /** @type {Record<string, any>} */ ({}),
    state: {
      repositoryName: "",
      branchName: "",
      branches: [],
      ahead: 0,
      behind: 0,
      hasUpstream: false,
      changes: { staged: [], unstaged: [] },
      history: [],
      provider: "openai",
      model: "",
      models: [],
      hasApiKey: false,
      providerIcons: {},
      isLoading: false,
      busyKind: "",
      busyText: "",
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
    const optIcon = (it) => (it.iconSvg ? `<span class="gx-ic sm">${it.iconSvg}</span>` : iconHtml(it.icon));

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
      iconSlot.innerHTML = current ? optIcon(current) : "";
    }
    function paintList() {
      list.innerHTML = "";
      items.forEach((it) => {
        const opt = el(
          "div",
          "gx-option" + (it.value === value ? " selected" : ""),
          optIcon(it) + `<span>${escapeHtml(it.label)}</span>`
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
          <span class="gx-repo-name">${icon("repo", "sm")}<span id="repoName">—</span></span>
        </div>
        <div class="gx-branch-row">
          <button class="gx-branch-btn" data-action="openBranches" title="Manage branches" type="button">
            ${icon("branch", "sm")}<span id="branchName" class="gx-branch-cur">—</span>
          </button>
          <button id="pullBtn" class="gx-iconbtn gx-sync-btn" data-action="pull" title="Pull" type="button">${ICONS.pull}<span id="behindBadge" class="gx-sync-badge hidden"></span></button>
          <button id="pushBtn" class="gx-iconbtn gx-sync-btn" data-action="push" title="Push" type="button">${ICONS.push}<span id="aheadBadge" class="gx-sync-badge hidden"></span></button>
        </div>
      </div>

      <div class="gx-tabs">
        <button class="gx-tab" data-tab="changes" type="button">${icon("changes", "sm")}<span>Changes</span></button>
        <button class="gx-tab" data-tab="history" type="button">${icon("history", "sm")}<span>History</span></button>
      </div>

      <div id="panel-changes" class="gx-panel">
        <div id="changesNotice"></div>

        <div class="gx-section-head">
          <span class="gx-section-title">Staged</span>
          <span id="stagedCount" class="gx-count">0</span>
          <span class="spacer"></span>
          <span class="gx-section-actions">
            <button id="unstageSelectedBtn" class="gx-mini-action" data-action="unstageSelected" title="Unstage selected" aria-label="Unstage selected" type="button">${ICONS.minus}</button>
            <button id="unstageAllBtn" class="gx-mini-action" data-action="unstageAll" title="Unstage all" aria-label="Unstage all" type="button">${ICONS.unstageAll}</button>
          </span>
        </div>
        <ul id="stagedList" class="gx-files"></ul>

        <div class="gx-section-head">
          <span class="gx-section-title">Changes</span>
          <span id="unstagedCount" class="gx-count">0</span>
          <span class="spacer"></span>
          <span class="gx-section-actions">
            <button id="stageSelectedBtn" class="gx-mini-action" data-action="stageSelected" title="Stage selected" aria-label="Stage selected" type="button">${ICONS.plus}</button>
            <button id="stageAllBtn" class="gx-mini-action" data-action="stageAll" title="Stage all" aria-label="Stage all" type="button">${ICONS.stageAll}</button>
          </span>
        </div>
        <ul id="unstagedList" class="gx-files"></ul>

        <div class="gx-card">
          <div class="gx-field">
            <label class="gx-label" for="commitSummary">Summary</label>
            <div class="gx-input-wrap">
              <input id="commitSummary" class="has-action" type="text" placeholder="Summary (required)" maxlength="120" />
              <button id="generateBtn" class="gx-input-action" data-action="generate" type="button" title="Generate with AI">
                <span class="gx-vsep"></span><span class="gx-ic">${ICONS.sparkle}</span>
              </button>
            </div>
          </div>
          <div class="gx-field">
            <label class="gx-label" for="commitDescription">Description</label>
            <textarea id="commitDescription" placeholder="Description (optional)"></textarea>
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

      <div id="panel-branches" class="gx-panel hidden">
        <div class="gx-newbranch">
          <input id="newBranchInput" type="text" placeholder="New branch name" autocomplete="off" spellcheck="false" />
          <button class="gx-btn gx-btn-primary" data-action="createBranchNamed" type="button">${icon("plus", "sm")}<span>Create</span></button>
        </div>
        <input id="branchFilter" type="text" class="gx-branch-filter" placeholder="Filter branches" autocomplete="off" spellcheck="false" />
        <ul id="branchList" class="gx-branch-list"></ul>
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
        <div id="modelSection" class="hidden gx-model-block">
          <div class="gx-field">
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
    ui.dd.provider = createDropdown((provider) => post({ type: "saveProvider", provider }));
    ui.dd.model = createDropdown(() => {
      /* value tracked in dropdown; persisted via Save model */
    });
    byId("providerSlot").append(ui.dd.provider.root);
    byId("modelSlot").append(ui.dd.model.root);

    // Branches tab: filter (client-side) + create-on-Enter
    byId("branchFilter").addEventListener("input", (e) => {
      ui.branchFilter = e.target.value;
      renderBranches(ui.state);
    });
    byId("newBranchInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAction("createBranchNamed");
    });

    // Tabs
    app.querySelectorAll(".gx-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.getAttribute("data-tab")));
    });

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
        updateChangeActionButtons(ui.state);
      });
    });
  }

  function switchTab(tab) {
    if (!tab) return;
    ui.activeTab = tab;
    document.querySelectorAll(".gx-tab").forEach((t) => {
      t.classList.toggle("active", t.getAttribute("data-tab") === tab);
    });
    const branchButton = document.querySelector(".gx-branch-btn");
    if (branchButton) {
      branchButton.classList.toggle("active", tab === "branches");
    }
    ["changes", "history", "branches", "settings"].forEach((name) => {
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
      case "push":
        post({ type: "push" });
        break;
      case "pull":
        post({ type: "pull" });
        break;
      case "openBranches":
        switchTab("branches");
        break;
      case "createBranchNamed": {
        const input = /** @type {HTMLInputElement} */ (byId("newBranchInput"));
        const name = input.value.trim();
        if (name) {
          post({ type: "createBranch", name });
          input.value = "";
        }
        break;
      }
      case "switchBranchTo":
        post({ type: "switchBranch", name: elm.getAttribute("data-name") });
        break;
      case "openFile":
        post({
          type: "openFile",
          filePath: elm.getAttribute("data-path"),
          staged: elm.getAttribute("data-staged") === "1",
          status: elm.getAttribute("data-status")
        });
        break;
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
    byId("repoName").textContent = s.repositoryName || "—";
    byId("branchName").textContent = s.branchName || "—";
    renderBranches(s);
    updateSync(s);

    renderNotice(s);

    // Lists
    byId("stagedList").innerHTML = renderFileList(s.changes.staged, "unstageOne", "minus");
    byId("unstagedList").innerHTML = renderFileList(s.changes.unstaged, "stageOne", "plus");
    byId("stagedCount").textContent = String((s.changes.staged || []).length);
    byId("unstagedCount").textContent = String((s.changes.unstaged || []).length);

    const busy = !!s.isLoading;
    const stagedFiles = s.changes.staged || [];
    const unstagedFiles = s.changes.unstaged || [];
    const hasStaged = stagedFiles.length > 0;
    const provLabel = (PROVIDERS.find((p) => p.value === s.provider) || {}).label || s.provider;
    const genBtn = byId("generateBtn");
    genBtn.innerHTML =
      `<span class="gx-vsep"></span>` +
      (s.busyKind === "generate"
        ? `<span class="gx-spin"></span>`
        : `<span class="gx-ic">${ICONS.sparkle}</span>`);
    genBtn.title = hasStaged
      ? `Generate with ${provLabel}${s.model ? " · " + s.model : " · select a model"}`
      : "Stage changes to generate a message";
    // Generate reads the staged diff and Commit commits the index — both need staged changes.
    genBtn.toggleAttribute("disabled", busy || !hasStaged);
    const commitBtn = byId("commitBtn");
    commitBtn.innerHTML = `${icon("commit")}<span>Commit${
      s.branchName ? " to " + escapeHtml(s.branchName) : ""
    }</span>`;
    commitBtn.toggleAttribute("disabled", busy || !hasStaged);
    byId("pushBtn").toggleAttribute("disabled", busy || !s.branchName);
    byId("pullBtn").toggleAttribute("disabled", busy || !s.branchName);
    updateChangeActionButtons(s);

    renderHistory(s);
    renderSettings(s);
  }

  function updateChangeActionButtons(s) {
    const busy = !!s.isLoading;
    const stagedFiles = s.changes.staged || [];
    const unstagedFiles = s.changes.unstaged || [];
    byId("unstageSelectedBtn").toggleAttribute("disabled", busy || selectedPaths(stagedFiles).length === 0);
    byId("unstageAllBtn").toggleAttribute("disabled", busy || stagedFiles.length === 0);
    byId("stageSelectedBtn").toggleAttribute("disabled", busy || selectedPaths(unstagedFiles).length === 0);
    byId("stageAllBtn").toggleAttribute("disabled", busy || unstagedFiles.length === 0);
  }

  function renderBranches(s) {
    const list = byId("branchList");
    const filter = (ui.branchFilter || "").toLowerCase();
    const branches = (s.branches || []).filter((b) => b.toLowerCase().includes(filter));
    if (!branches.length) {
      list.innerHTML = `<li class="gx-empty">${
        s.branches && s.branches.length ? "No matching branches" : "No branches"
      }</li>`;
      return;
    }
    list.innerHTML = branches
      .map((b) => {
        const current = b === s.branchName;
        return `<li class="gx-branch-item${current ? " current" : ""}" data-action="switchBranchTo" data-name="${escapeHtml(
          b
        )}" title="${current ? "Current branch" : "Switch to " + escapeHtml(b)}">
            <span class="gx-ic sm gx-branch-ic">${ICONS.branch}</span>
            <span class="gx-branch-name">${escapeHtml(b)}</span>
            ${current ? `<span class="gx-ic sm gx-branch-check">${ICONS.check}</span>` : ""}
          </li>`;
      })
      .join("");
  }

  function updateSync(s) {
    const ahead = byId("aheadBadge");
    const behind = byId("behindBadge");
    ahead.textContent = s.ahead > 0 ? String(s.ahead) : "";
    behind.textContent = s.behind > 0 ? String(s.behind) : "";
    ahead.classList.toggle("hidden", !(s.ahead > 0));
    behind.classList.toggle("hidden", !(s.behind > 0));
  }

  function renderNotice(s) {
    const region = byId("changesNotice");
    if (s.error) {
      region.innerHTML = `<div class="gx-notice error">${escapeHtml(s.error)}</div>`;
    } else if (s.isLoading) {
      region.innerHTML = `<div class="gx-spinner"><span class="dot"></span><span>${escapeHtml(
        s.busyText || "Working…"
      )}</span></div>`;
    } else if (s.notice) {
      region.innerHTML = `<div class="gx-notice info">${escapeHtml(s.notice)}</div>`;
    } else {
      region.innerHTML = "";
    }
  }

  function fileIcon(path) {
    const base = (String(path || "").split("/").pop() || "").toLowerCase();
    const match = /\.([a-z0-9]+)$/.exec(base);
    const ext = match ? match[1] : "";
    const cls = EXT_CLASS[ext] || FILENAME_CLASS[base.replace(/\..*$/, "")] || "default";
    const glyph = cls === "img" ? ICONS.image : ICONS.file;
    return `<span class="gx-ftype gx-ext-${cls}">${glyph}</span>`;
  }

  /** Right-side status marker: yellow dot = modified, green + = added, etc. */
  function statusGlyph(status) {
    if (status === "A" || status === "U") {
      return `<span class="gx-stat gx-stat-A" title="${status === "U" ? "Untracked" : "Added"}">${ICONS.plus}</span>`;
    }
    if (status === "D") {
      return `<span class="gx-stat gx-stat-D" title="Deleted">${ICONS.minus}</span>`;
    }
    if (status === "R" || status === "C") {
      return `<span class="gx-stat gx-stat-R" title="${status === "R" ? "Renamed" : "Copied"}">${ICONS.dot}</span>`;
    }
    return `<span class="gx-stat gx-stat-M" title="Modified">${ICONS.dot}</span>`;
  }

  function renderFileList(files, action, actionIcon) {
    if (!files || !files.length) {
      return `<li class="gx-empty">No files</li>`;
    }
    const staged = action === "unstageOne";
    return files
      .map((f) => {
        const checked = ui.selected.has(f.path) ? "checked" : "";
        const title = action === "stageOne" ? "Stage file" : "Unstage file";
        return `
          <li class="gx-file">
            <input type="checkbox" class="gx-check" data-path="${escapeHtml(f.path)}" ${checked} />
            ${fileIcon(f.path)}
            <span class="gx-path" data-action="openFile" data-path="${escapeHtml(f.path)}" data-staged="${
          staged ? 1 : 0
        }" data-status="${escapeHtml(f.status)}" title="Open changes — ${escapeHtml(f.path)}">${escapeHtml(
          f.displayPath || f.path
        )}</span>
            <span class="gx-right">
              <button class="gx-row-action" data-action="${action}" data-path="${escapeHtml(
          f.path
        )}" title="${title}" type="button">${ICONS[actionIcon]}</button>
              ${statusGlyph(f.status)}
            </span>
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
    const keyInput = /** @type {HTMLInputElement} */ (byId("apiKeyInput"));
    keyInput.placeholder = s.hasApiKey
      ? "•••••••••••• stored — paste to replace"
      : "Paste your API key";

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
