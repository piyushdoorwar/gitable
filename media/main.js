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
    merge:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><line x1="6" y1="8.4" x2="6" y2="15.6"/><path d="M18 8.4c0 5.6-4.5 9.6-12 9.6"/></svg>',
    stash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10m-3.5-3.5L12 13l3.5-3.5"/><rect x="3" y="16" width="18" height="5" rx="1.5"/></svg>',
    stashPop:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="5" rx="1.5"/><path d="M12 21V11m-3.5 3.5L12 11l3.5 3.5"/></svg>',
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
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
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
      '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M20.017 14.669L23 13.564l-.012-3.208-2.996-1.085a8.455 8.455 0 0 0-.437-1.05l1.329-2.893-2.277-2.26-2.886 1.351a8.396 8.396 0 0 0-1.052-.436L13.564 1l-3.208.012-1.085 2.996a8.485 8.485 0 0 0-1.05.437L5.328 3.116l-2.26 2.276L4.419 8.28a8.378 8.378 0 0 0-.436 1.052L1 10.436l.012 3.208 2.996 1.085a8.46 8.46 0 0 0 .437 1.05l-1.329 2.893 2.276 2.26 2.887-1.351a8.383 8.383 0 0 0 1.052.436L10.436 23l3.208-.012 1.085-2.996a8.478 8.478 0 0 0 1.05-.437l2.893 1.329 2.26-2.276-1.351-2.887a8.382 8.382 0 0 0 .436-1.052zm-.287 3.73l-1.275 1.285-2.694-1.238-.429.215a7.612 7.612 0 0 1-.928.385l-.452.156-1.01 2.789-1.81.007-1.03-2.779-.456-.151a7.394 7.394 0 0 1-.926-.385l-.43-.21-2.688 1.257-1.286-1.275 1.239-2.695-.216-.43a7.551 7.551 0 0 1-.386-.926l-.155-.452-2.79-1.01-.005-1.81 2.777-1.03.152-.456a7.46 7.46 0 0 1 .384-.927l.212-.43L4.27 5.601l1.275-1.285 2.694 1.238.429-.215a7.612 7.612 0 0 1 .928-.385l.452-.156 1.01-2.789 1.81-.007 1.03 2.779.456.151a7.35 7.35 0 0 1 .925.385l.43.211L18.4 4.27l1.285 1.275-1.239 2.695.216.43a7.551 7.551 0 0 1 .386.926l.155.452 2.79 1.01.005 1.81-2.777 1.03-.152.456a7.46 7.46 0 0 1-.384.927l-.212.43zM12 7.2a4.8 4.8 0 1 0 4.8 4.8A4.8 4.8 0 0 0 12 7.2zm0 8.6a3.8 3.8 0 1 1 3.8-3.8 3.804 3.804 0 0 1-3.8 3.8z"/></svg>',
    file:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>',
    image:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>',
    dot:
      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>',
    copy:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    tag:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    revert:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5.4"/></svg>',
    cherryPick:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="2.5"/><line x1="3" y1="12" x2="6.5" y2="12"/><line x1="11.5" y1="12" x2="16" y2="12"/><polyline points="13 7 18 12 13 17"/></svg>',
    pencil:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
    shieldAi:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4 5.5V11c0 5.25 3.6 9.74 8 11.5 4.4-1.76 8-6.25 8-11.5V5.5L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 8l.75 2.1 2.1.75-2.1.75L12 13.7l-.75-2.1-2.1-.75 2.1-.75z" fill="currentColor" stroke="none"/></svg>',
    reports:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.8321 9.5547C18.1384 9.09517 18.0142 8.4743 17.5547 8.16795C17.0952 7.8616 16.4743 7.98577 16.168 8.4453L13.3925 12.6085L10.0529 10.3542C9.421 9.92768 8.55941 10.1339 8.18917 10.8004L6.12584 14.5144C5.85763 14.9971 6.03157 15.6059 6.51436 15.8742C6.99714 16.1424 7.60594 15.9684 7.87416 15.4856L9.56672 12.439L12.8571 14.66C13.4546 15.0634 14.2662 14.9035 14.6661 14.3036L17.8321 9.5547Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7 2C4.23858 2 2 4.23858 2 7V17C2 19.7614 4.23858 22 7 22H17C19.7614 22 22 19.7614 22 17V7C22 4.23858 19.7614 2 17 2H7ZM4 7C4 5.34315 5.34315 4 7 4H17C18.6569 4 20 5.34315 20 7V17C20 18.6569 18.6569 20 17 20H7C5.34315 20 4 18.6569 4 17V7Z" fill="currentColor"/></svg>',
    conflict:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
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
    expandedCommits: new Set(),
    commitFiles: /** @type {Record<string, any>} */ ({}),
    commitStats: /** @type {Record<string, any>} */ ({}),
    activeSummary: /** @type {null | {hash: string, subject: string, loading?: boolean, summary?: string, description?: string, error?: string}} */ (null),
    activeSecurityReview: /** @type {null | {staged: boolean, loading?: boolean, findings?: any[], safe?: boolean, error?: string}} */ (null),
    dd: /** @type {Record<string, any>} */ ({}),
    state: {
      repositoryName: "",
      branchName: "",
      branches: [],
      ahead: 0,
      behind: 0,
      hasUpstream: false,
      changes: { staged: [], unstaged: [], conflicts: [] },
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
  let tooltipNode = null;
  let tooltipTarget = null;
  let contextFile = null;
  let contextCommit = null;
  let contextBranch = null;

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
  function setDisabled(elm, disabled) {
    if (!elm) return;
    elm.toggleAttribute("aria-disabled", !!disabled);
    elm.classList.toggle("gx-disabled", !!disabled);
    elm.removeAttribute("disabled");
  }
  function tooltipText(elm) {
    return elm.getAttribute("data-tooltip") || elm.getAttribute("aria-label") || elm.getAttribute("title") || "";
  }
  function tooltipCandidate(node) {
    return node && node.closest ? node.closest("[data-tooltip], [aria-label], [title]") : null;
  }
  function initTooltips() {
    if (tooltipNode) return;
    tooltipNode = el("div", "gx-tooltip");
    tooltipNode.setAttribute("role", "tooltip");
    tooltipNode.hidden = true;
    document.body.append(tooltipNode);

    const show = (target) => {
      const text = tooltipText(target);
      if (!text) return;
      tooltipTarget = target;
      tooltipNode.textContent = text;
      tooltipNode.hidden = false;
      tooltipNode.classList.add("show");
      positionTooltip();
    };
    const hide = () => {
      tooltipTarget = null;
      tooltipNode.classList.remove("show");
      tooltipNode.hidden = true;
    };

    document.addEventListener(
      "pointerover",
      (e) => {
        const target = tooltipCandidate(e.target);
        if (!target || target === tooltipTarget) return;
        show(target);
      },
      true
    );
    document.addEventListener(
      "pointerout",
      (e) => {
        if (!tooltipTarget) return;
        const next = e.relatedTarget;
        if (next && tooltipTarget.contains(next)) return;
        hide();
      },
      true
    );
    document.addEventListener("focusin", (e) => {
      const target = tooltipCandidate(e.target);
      if (target) show(target);
    });
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
  }
  function positionTooltip() {
    if (!tooltipNode || !tooltipTarget || tooltipNode.hidden) return;
    const rect = tooltipTarget.getBoundingClientRect();
    const gap = 8;
    const margin = 6;
    const width = tooltipNode.offsetWidth;
    const height = tooltipNode.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top = rect.top - height - gap;
    if (top < margin) {
      top = rect.bottom + gap;
    }
    tooltipNode.style.left = `${Math.round(left)}px`;
    tooltipNode.style.top = `${Math.round(top)}px`;
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
      button.title = current ? `Selected: ${current.label}` : placeholder;
      button.setAttribute("aria-label", button.title);
      button.dataset.tooltip = button.title;
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
          <span class="gx-header-actions">
            <button class="gx-iconbtn gx-hdr-btn" data-action="openReports" title="Usage reports" aria-label="Usage reports" type="button">${icon("reports", "sm")}</button>
            <button class="gx-iconbtn gx-hdr-btn" data-action="openSettings" title="Settings" aria-label="Settings" type="button">${icon("settings", "sm")}</button>
          </span>
        </div>
        <div class="gx-branch-row">
          <button class="gx-branch-btn" data-action="openBranches" title="Manage branches" aria-label="Manage branches" type="button">
            ${icon("branch", "sm")}<span id="branchName" class="gx-branch-cur">—</span>
          </button>
          <button id="syncBtn" class="gx-sync-pill" data-action="syncAction" type="button" disabled>
            <span id="syncIcon" class="gx-ic sm"></span>
            <span id="syncLabel" class="gx-sync-pill-label">Fetch origin</span>
            <span id="syncBadge" class="gx-sync-pill-badge hidden"></span>
          </button>
        </div>
      </div>

      <div class="gx-tabs">
        <button class="gx-tab" data-tab="changes" title="Show working tree changes" aria-label="Show working tree changes" type="button">${icon("changes", "sm")}<span>Changes</span></button>
        <button class="gx-tab" data-tab="history" title="Show commit history" aria-label="Show commit history" type="button">${icon("history", "sm")}<span>History</span></button>
      </div>

      <div id="panel-changes" class="gx-panel">
        <div class="gx-changes-scroll">
          <div id="changesNotice"></div>

          <div id="conflictsBanner" class="gx-conflicts-banner hidden">
            ${icon("conflict", "sm")}<span id="conflictsBannerText"></span>
          </div>

          <div id="conflictsSection" class="hidden">
            <div class="gx-section-head gx-section-head-conflict">
              <span class="gx-section-title">Conflicts</span>
              <span id="conflictsCount" class="gx-count">0</span>
            </div>
            <ul id="conflictsList" class="gx-files"></ul>
          </div>

          <div class="gx-section-head">
            <span class="gx-section-title">Staged</span>
            <span id="stagedCount" class="gx-count">0</span>
            <span class="spacer"></span>
            <span class="gx-section-actions">
              <button id="stagedSecurityBtn" class="gx-mini-action gx-mini-action-ai" data-action="securityReview" data-staged="1" title="Security review of staged changes" aria-label="Security review of staged changes" type="button">${ICONS.shieldAi}</button>
              <span class="gx-mini-sep"></span>
              <button id="stashBtn" class="gx-mini-action" data-action="stashStaged" title="Stash staged changes (git stash push --staged)" aria-label="Stash staged changes" type="button">${ICONS.stash}</button>
              <span class="gx-mini-sep"></span>
              <button id="unstageSelectedBtn" class="gx-mini-action" data-action="unstageSelected" title="Unstage selected files" aria-label="Unstage selected files" type="button">${ICONS.minus}</button>
              <button id="unstageAllBtn" class="gx-mini-action" data-action="unstageAll" title="Unstage all files" aria-label="Unstage all files" type="button">${ICONS.unstageAll}</button>
            </span>
          </div>
          <ul id="stagedList" class="gx-files"></ul>

          <div class="gx-section-head">
            <span class="gx-section-title">Changes</span>
            <span id="unstagedCount" class="gx-count">0</span>
            <span class="spacer"></span>
            <span class="gx-section-actions">
              <button id="unstagedSecurityBtn" class="gx-mini-action gx-mini-action-ai" data-action="securityReview" data-staged="0" title="Security review of unstaged changes" aria-label="Security review of unstaged changes" type="button">${ICONS.shieldAi}</button>
              <span class="gx-mini-sep"></span>
              <button id="discardSelectedBtn" class="gx-mini-action gx-danger hidden" data-action="discardSelected" title="Discard selected files" aria-label="Discard selected files" type="button">${ICONS.trash}</button>
              <button id="stageSelectedBtn" class="gx-mini-action" data-action="stageSelected" title="Stage selected files" aria-label="Stage selected files" type="button">${ICONS.plus}</button>
              <button id="stageAllBtn" class="gx-mini-action" data-action="stageAll" title="Stage all files" aria-label="Stage all files" type="button">${ICONS.stageAll}</button>
            </span>
          </div>
          <ul id="unstagedList" class="gx-files"></ul>

          <div class="gx-section-head">
            <span class="gx-section-title">Stashes</span>
            <span id="stashCount" class="gx-count hidden">0</span>
          </div>
          <ul id="stashList" class="gx-stash-list"></ul>
        </div>

        <div class="gx-card">
          <div class="gx-field">
            <label class="gx-label" for="commitSummary">Summary</label>
            <div class="gx-input-wrap">
              <input id="commitSummary" class="has-action" type="text" placeholder="Summary (required)" maxlength="120" />
              <button id="generateBtn" class="gx-input-action" data-action="generate" type="button" title="Generate commit message with AI" aria-label="Generate commit message with AI">
                <span class="gx-vsep"></span><span class="gx-ic">${ICONS.sparkle}</span>
              </button>
            </div>
          </div>
          <div class="gx-field">
            <label class="gx-label" for="commitDescription">Description</label>
            <textarea id="commitDescription" placeholder="Description (optional)"></textarea>
          </div>
          <div class="gx-actions">
            <button id="commitBtn" class="gx-btn gx-btn-primary" data-action="commit" title="Commit staged changes" aria-label="Commit staged changes" type="button">
              ${icon("commit")}<span>Commit</span>
            </button>
          </div>
          <div id="undoBar" class="gx-undo-bar hidden">
            <span id="undoMsg" class="gx-undo-msg"></span>
            <button class="gx-undo-btn" data-action="undoLastCommit" title="Undo last commit (git reset --soft HEAD~1)" aria-label="Undo last commit" type="button">Undo</button>
          </div>
        </div>
      </div>

      <div id="panel-history" class="gx-panel hidden">
        <ul id="commitList" class="gx-commits"></ul>
      </div>

      <div id="panel-branches" class="gx-panel hidden">
        <div class="gx-newbranch">
          <input id="newBranchInput" type="text" placeholder="New branch name" autocomplete="off" spellcheck="false" />
          <button class="gx-btn gx-btn-primary" data-action="createBranchNamed" title="Create and switch to new branch" aria-label="Create and switch to new branch" type="button">${icon("plus", "sm")}<span>Create</span></button>
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
          <button id="saveValidateBtn" class="gx-btn gx-btn-primary" data-action="saveAndValidate" title="Save API key and validate" aria-label="Save API key and validate" type="button" disabled>${icon("lock")}<span>Save &amp; Validate</span></button>
        </div>
        <div id="modelHint" class="gx-hint">Save your API key to load the available models.</div>
        <div id="modelSection" class="hidden gx-model-block">
          <div class="gx-field">
            <label class="gx-label gx-label-row">
              <span>Model</span>
              <button class="gx-iconbtn gx-refresh-icon-btn" data-action="refreshModels" title="Refresh available models" aria-label="Refresh available models" type="button">${icon("refresh", "sm")}</button>
            </label>
            <div id="modelSlot"></div>
          </div>
        </div>
        <div id="settingsStatus" class="gx-status-line"></div>
        <div class="gx-privacy">
          ${icon("lock")}
          <span>Only the selected Git diff is sent to your configured AI provider. API keys are stored
          using VS Code SecretStorage. Gitable does not send data to any server owned by this extension.</span>
        </div>
      </div>

      <div id="panel-reports" class="gx-panel hidden">
        <div id="reportsContent"></div>
      </div>

      <div id="panel-summary" class="gx-ai-overlay hidden">
        <div id="summaryContent"></div>
      </div>
      <div id="panel-security" class="gx-ai-overlay hidden">
        <div id="securityContent"></div>
      </div>

      <div id="fileContextMenu" class="gx-context-menu hidden" role="menu">
        <button id="addToGitignoreItem" data-menu-action="addToGitignore" role="menuitem" type="button">${icon("file", "sm")}<span>Add to .gitignore</span></button>
        <span id="addToGitignoreSep" class="gx-menu-sep"></span>
        <button data-menu-action="discardFile" role="menuitem" type="button">${icon("trash", "sm")}<span>Discard file</span></button>
        <span class="gx-menu-sep"></span>
        <button data-menu-action="copyFilePath" role="menuitem" type="button">${icon("file", "sm")}<span>Copy file path</span></button>
        <button data-menu-action="copyRelativePath" role="menuitem" type="button">${icon("file", "sm")}<span>Copy relative path</span></button>
        <button data-menu-action="revealFile" role="menuitem" type="button">${icon("repo", "sm")}<span>Show in file manager</span></button>
      </div>

      <div id="commitContextMenu" class="gx-context-menu hidden" role="menu"></div>
      <div id="branchContextMenu" class="gx-context-menu hidden" role="menu"></div>
      <div id="stashContextMenu" class="gx-context-menu hidden" role="menu"></div>
      <div id="tagContextMenu" class="gx-context-menu hidden" role="menu"></div>
    `;
    initTooltips();

    // Dropdowns
    ui.dd.provider = createDropdown((provider) => post({ type: "saveProvider", provider }));
    ui.dd.model = createDropdown((model) => {
      if (model) post({ type: "saveModel", model });
    });
    byId("providerSlot").append(ui.dd.provider.root);
    byId("modelSlot").append(ui.dd.model.root);

    // Enable/disable Save & Validate based on key input content
    byId("apiKeyInput").addEventListener("input", () => {
      const hasText = /** @type {HTMLInputElement} */ (byId("apiKeyInput")).value.trim().length > 0;
      setDisabled(byId("saveValidateBtn"), !hasText && !ui.state.hasApiKey);
    });

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
      tab.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return; // close-btn handles itself
        switchTab(tab.getAttribute("data-tab"));
      });
    });

    // Delegated button actions
    app.addEventListener("click", (e) => {
      const tagBadge = e.target.closest(".gx-tag[data-tag-name]");
      if (tagBadge) {
        e.stopPropagation();
        const rect = tagBadge.getBoundingClientRect();
        openTagMenu(tagBadge.getAttribute("data-tag-name"), rect.left, rect.bottom + 4);
        return;
      }
      const target = e.target.closest("[data-action]");
      if (target && target.getAttribute("aria-disabled") === "true") {
        e.preventDefault();
        return;
      }
      if (target) {
        if (target.getAttribute("data-action") === "openStashMenu") {
          e.stopPropagation();
        }
        handleAction(target.getAttribute("data-action"), target);
      }
    });
    app.addEventListener("contextmenu", (e) => {
      const branchBtn = e.target.closest(".gx-branch-btn");
      if (branchBtn) {
        const name = ui.state.branchName;
        if (name) { e.preventDefault(); openBranchMenu(name, true, e.clientX, e.clientY); }
        return;
      }
      const branchItem = e.target.closest(".gx-branch-item");
      if (branchItem) {
        const name = branchItem.getAttribute("data-name");
        if (name) { e.preventDefault(); openBranchMenu(name, branchItem.classList.contains("current"), e.clientX, e.clientY); }
        return;
      }
      const commitHead = e.target.closest(".gx-commit-head");
      if (commitHead) {
        e.preventDefault();
        openCommitMenu(commitHead.getAttribute("data-hash"), e.clientX, e.clientY);
        return;
      }
      const row = e.target.closest(".gx-file");
      if (!row) {
        closeFileMenu();
        return;
      }
      e.preventDefault();
      openFileMenu(row, e.clientX, e.clientY);
    });

    const fileMenu = byId("fileContextMenu");
    fileMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-menu-action]");
      if (!item) return;
      e.stopPropagation();
      handleMenuAction(item.getAttribute("data-menu-action"));
    });

    const commitMenu = byId("commitContextMenu");
    commitMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-cmenu-action]");
      if (!item) return;
      e.stopPropagation();
      handleCommitMenuAction(item.getAttribute("data-cmenu-action"), item);
    });

    const branchMenu = byId("branchContextMenu");
    branchMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-bmenu-action]");
      if (!item) return;
      e.stopPropagation();
      handleBranchMenuAction(item.getAttribute("data-bmenu-action"));
    });

    const stashMenu = byId("stashContextMenu");
    stashMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-smenu-action]");
      if (!item) return;
      e.stopPropagation();
      handleStashMenuAction(item.getAttribute("data-smenu-action"));
    });

    const tagMenu = byId("tagContextMenu");
    tagMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-tmenu-action]");
      if (!item) return;
      e.stopPropagation();
      handleTagMenuAction(item.getAttribute("data-tmenu-action"), item);
    });

    function closeAllMenus() { closeFileMenu(); closeCommitMenu(); closeBranchMenu(); closeStashMenu(); closeTagMenu(); }
    document.addEventListener("click", closeAllMenus);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllMenus(); });
    window.addEventListener("resize", closeAllMenus);
    window.addEventListener("scroll", closeAllMenus, true);

    // Checkbox selection for bulk stage/unstage/discard actions.
    [byId("stagedList"), byId("unstagedList")].forEach((listEl) => {
      listEl.addEventListener("change", (e) => {
        const box = e.target;
        if (!box.classList.contains("gx-check")) return;
        const path = box.getAttribute("data-path");
        if (!path) return;
        const key = selectionKey(path, box.getAttribute("data-staged") === "1");
        if (box.checked) ui.selected.add(key);
        else ui.selected.delete(key);
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
    ["changes", "history", "branches", "settings", "reports"].forEach((name) => {
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
        const paths = selectedPaths(s.changes.unstaged, false);
        if (paths.length) post({ type: "stageFiles", filePaths: paths });
        break;
      }
      case "discardSelected": {
        const paths = selectedPaths(s.changes.unstaged, false);
        if (paths.length) post({ type: "discardFiles", filePaths: paths, staged: false });
        break;
      }
      case "unstageSelected": {
        const paths = selectedPaths(s.changes.staged, true);
        if (paths.length) post({ type: "unstageFiles", filePaths: paths });
        break;
      }
      case "stageOne":
        post({ type: "stageFile", filePath: elm.getAttribute("data-path") });
        break;
      case "unstageOne":
        post({ type: "unstageFile", filePath: elm.getAttribute("data-path") });
        break;
      case "undoLastCommit":
        post({ type: "undoLastCommit" });
        break;
      case "discardOne":
        post({ type: "discardFiles", filePaths: [elm.getAttribute("data-path")], staged: elm.getAttribute("data-staged") === "1" });
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
      case "saveAndValidate": {
        const apiKey = /** @type {HTMLInputElement} */ (byId("apiKeyInput")).value.trim();
        const provider = ui.dd.provider.getValue();
        post({ type: "saveAndValidate", provider, apiKey: apiKey || undefined });
        break;
      }
      case "refreshModels":
        post({ type: "fetchModels", provider: ui.dd.provider.getValue() });
        break;
      case "syncAction": {
        const s = ui.state;
        if (s.syncAction) break;
        if (!s.hasUpstream) {
          post({ type: "push" });
        } else if (s.behind > 0) {
          post({ type: "pull" });
        } else if (s.ahead > 0) {
          post({ type: "push" }); // push also pushes pending tags via pushAllTags
        } else if (s.pendingTagCount > 0) {
          post({ type: "pushTags" });
        } else {
          post({ type: "fetchOrigin" });
        }
        break;
      }
      case "stashStaged":
        post({ type: "stashStaged" });
        break;
      case "stashPop":
        post({ type: "stashPop", ref: elm.getAttribute("data-ref") });
        break;
      case "openStashMenu": {
        const rect = elm.getBoundingClientRect();
        openStashMenu(elm.getAttribute("data-ref"), rect.right, rect.bottom + 4, true);
        break;
      }
      case "openMergeEditor":
        post({ type: "openMergeEditor", filePath: elm.getAttribute("data-path") });
        break;
      case "markResolved":
        post({ type: "markResolved", filePath: elm.getAttribute("data-path") });
        break;
      case "openBranches":
        switchTab("branches");
        break;
      case "openSettings":
        switchTab("settings");
        break;
      case "openReports":
        switchTab("reports");
        post({ type: "getReports" });
        renderReports(null);
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
      case "toggleCommit": {
        const hash = elm.getAttribute("data-hash");
        if (!hash) break;
        if (ui.expandedCommits.has(hash)) {
          ui.expandedCommits.delete(hash);
        } else {
          ui.expandedCommits.add(hash);
          if (ui.commitFiles[hash] === undefined) {
            ui.commitFiles[hash] = "loading";
            post({ type: "commitFiles", hash });
          }
        }
        renderHistory(ui.state);
        break;
      }
      case "openCommitFile":
        post({
          type: "openCommitFile",
          hash: elm.getAttribute("data-hash"),
          filePath: elm.getAttribute("data-path"),
          status: elm.getAttribute("data-status")
        });
        break;
      case "summarizeCommit": {
        const hash = elm.getAttribute("data-hash");
        const subject = elm.getAttribute("data-subject") || "";
        if (!hash) break;
        ui.activeSummary = { hash, subject, loading: true };
        byId("panel-summary").classList.remove("hidden");
        renderSummaryPanel();
        post({ type: "summarizeCommit", hash, subject });
        break;
      }
      case "closeSummary":
        ui.activeSummary = null;
        byId("panel-summary").classList.add("hidden");
        break;
      case "securityReview": {
        const staged = elm.getAttribute("data-staged") === "1";
        ui.activeSecurityReview = { staged, loading: true };
        byId("panel-security").classList.remove("hidden");
        renderSecurityPanel();
        post({ type: "securityReview", staged });
        break;
      }
      case "closeSecurityReview":
        ui.activeSecurityReview = null;
        byId("panel-security").classList.add("hidden");
        break;
      case "copySecurityReview": {
        const sr = ui.activeSecurityReview;
        if (!sr || !sr.findings) break;
        const lines = sr.safe
          ? ["No security issues found."]
          : sr.findings.map((f) => `[${f.severity.toUpperCase()}] ${f.category} — ${f.title}\n${f.detail}`);
        post({ type: "copySummaryText", text: lines.join("\n\n") });
        break;
      }
      case "copySummaryText": {
        const parts = [ui.activeSummary?.summary, ui.activeSummary?.description].filter(Boolean);
        post({ type: "copySummaryText", text: parts.join("\n\n") });
        break;
      }
      default:
        break;
    }
  }

  function openFileMenu(row, x, y) {
    contextFile = {
      path: row.getAttribute("data-path") || "",
      staged: row.getAttribute("data-staged") === "1",
      status: row.getAttribute("data-status") || ""
    };
    const isUntracked = contextFile.status === "U";
    byId("addToGitignoreItem").classList.toggle("hidden", !isUntracked);
    byId("addToGitignoreSep").classList.toggle("hidden", !isUntracked);
    const menu = byId("fileContextMenu");
    menu.classList.remove("hidden");
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const margin = 6;
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function closeFileMenu() {
    const menu = document.getElementById("fileContextMenu");
    if (menu) menu.classList.add("hidden");
    contextFile = null;
  }

  function handleMenuAction(action) {
    if (!contextFile || !contextFile.path) return;
    const file = contextFile;
    closeFileMenu();
    switch (action) {
      case "addToGitignore":
        post({ type: "addToGitignore", filePath: file.path });
        break;
      case "discardFile":
        post({ type: "discardFiles", filePaths: [file.path], staged: file.staged });
        break;
      case "copyFilePath":
        post({ type: "copyFilePath", filePath: file.path });
        break;
      case "copyRelativePath":
        post({ type: "copyRelativePath", filePath: file.path });
        break;
      case "revealFile":
        post({ type: "revealFile", filePath: file.path });
        break;
      default:
        break;
    }
  }

  function openCommitMenu(hash, x, y) {
    if (!hash) return;
    closeFileMenu();
    const commit = (ui.state.history || []).find((c) => c.hash === hash);
    contextCommit = { hash, tags: (commit && commit.tags) || [] };
    const tags = contextCommit.tags;
    const tagItems = tags
      .map(
        (t) =>
          `<button data-cmenu-action="copyTag" data-tag="${escapeHtml(t)}" role="menuitem" type="button">${icon("tag", "sm")}<span>Copy tag: ${escapeHtml(t)}</span></button>`
      )
      .join("");
    const menu = byId("commitContextMenu");
    menu.innerHTML =
      `<button data-cmenu-action="copySha" role="menuitem" type="button">${icon("copy", "sm")}<span>Copy SHA</span></button>` +
      (tagItems ? `<span class="gx-menu-sep"></span>${tagItems}` : "") +
      `<span class="gx-menu-sep"></span>` +
      `<button data-cmenu-action="createTag" role="menuitem" type="button">${icon("tag", "sm")}<span>Create tag…</span></button>` +
      `<span class="gx-menu-sep"></span>` +
      `<button data-cmenu-action="revertCommit" role="menuitem" type="button">${icon("revert", "sm")}<span>Revert commit</span></button>` +
      `<button data-cmenu-action="cherryPickCommit" role="menuitem" type="button">${icon("cherryPick", "sm")}<span>Cherry-pick commit</span></button>`;
    menu.classList.remove("hidden");
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const margin = 6;
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function closeCommitMenu() {
    const menu = document.getElementById("commitContextMenu");
    if (menu) menu.classList.add("hidden");
    contextCommit = null;
  }

  function handleCommitMenuAction(action, elm) {
    if (!contextCommit) return;
    const commit = contextCommit;
    closeCommitMenu();
    switch (action) {
      case "copySha":
        post({ type: "copySha", hash: commit.hash });
        break;
      case "copyTag":
        post({ type: "copyTag", tag: elm.getAttribute("data-tag") });
        break;
      case "createTag":
        post({ type: "createTag", hash: commit.hash });
        break;
      case "revertCommit":
        post({ type: "revertCommit", hash: commit.hash });
        break;
      case "cherryPickCommit":
        post({ type: "cherryPickCommit", hash: commit.hash });
        break;
      default:
        break;
    }
  }

  function openBranchMenu(name, isCurrent, x, y) {
    closeCommitMenu();
    closeFileMenu();
    contextBranch = { name, isCurrent };
    const menu = byId("branchContextMenu");
    menu.innerHTML =
      `<button data-bmenu-action="renameBranch" role="menuitem" type="button">${icon("pencil", "sm")}<span>Rename…</span></button>` +
      `<span class="gx-menu-sep"></span>` +
      `<button data-bmenu-action="copyBranchName" role="menuitem" type="button">${icon("copy", "sm")}<span>Copy branch name</span></button>` +
      (!isCurrent
        ? `<span class="gx-menu-sep"></span>` +
          `<button data-bmenu-action="mergeBranch" role="menuitem" type="button">${icon("merge", "sm")}<span>Merge into current</span></button>` +
          `<span class="gx-menu-sep"></span>` +
          `<button data-bmenu-action="deleteBranch" role="menuitem" type="button" class="gx-menu-danger">${icon("trash", "sm")}<span>Delete…</span></button>`
        : "");
    menu.classList.remove("hidden");
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const margin = 6;
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function closeBranchMenu() {
    const menu = document.getElementById("branchContextMenu");
    if (menu) menu.classList.add("hidden");
    contextBranch = null;
  }

  function handleBranchMenuAction(action) {
    if (!contextBranch) return;
    const branch = contextBranch;
    closeBranchMenu();
    switch (action) {
      case "renameBranch":
        post({ type: "renameBranch", name: branch.name });
        break;
      case "copyBranchName":
        post({ type: "copyBranchName", name: branch.name });
        break;
      case "mergeBranch":
        post({ type: "mergeBranch", name: branch.name });
        break;
      case "deleteBranch":
        post({ type: "deleteBranch", name: branch.name });
        break;
      default:
        break;
    }
  }

  // ---- Stash context menu ----
  let contextStash = null;

  function openStashMenu(ref, x, y, alignRight) {
    closeCommitMenu(); closeFileMenu(); closeBranchMenu(); closeTagMenu();
    contextStash = { ref };
    const menu = byId("stashContextMenu");
    menu.innerHTML =
      `<button data-smenu-action="stashApply" role="menuitem" type="button">${icon("stashPop", "sm")}<span>Apply (keep stash)</span></button>` +
      `<span class="gx-menu-sep"></span>` +
      `<button data-smenu-action="stashDrop" role="menuitem" type="button" class="gx-menu-danger">${icon("trash", "sm")}<span>Drop stash</span></button>`;
    menu.classList.remove("hidden");
    menu.style.left = "0px"; menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const margin = 6;
    const anchorLeft = alignRight ? x - rect.width : x;
    const left = Math.max(margin, Math.min(anchorLeft, window.innerWidth - rect.width - margin));
    const top  = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top  = `${Math.round(top)}px`;
  }

  function closeStashMenu() {
    const menu = document.getElementById("stashContextMenu");
    if (menu) menu.classList.add("hidden");
    contextStash = null;
  }

  function handleStashMenuAction(action) {
    if (!contextStash) return;
    const { ref } = contextStash;
    closeStashMenu();
    if (action === "stashApply") post({ type: "stashApply", ref });
    else if (action === "stashDrop") post({ type: "stashDrop", ref });
  }

  // ---- Tag context menu ----
  let contextTag = null;

  function openTagMenu(name, x, y) {
    closeCommitMenu(); closeFileMenu(); closeBranchMenu(); closeStashMenu();
    contextTag = { name };
    const menu = byId("tagContextMenu");
    menu.innerHTML =
      `<button data-tmenu-action="deleteTag" role="menuitem" type="button" class="gx-menu-danger">${icon("trash", "sm")}<span>Delete tag…</span></button>`;
    menu.classList.remove("hidden");
    menu.style.left = "0px"; menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const margin = 6;
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function closeTagMenu() {
    const menu = document.getElementById("tagContextMenu");
    if (menu) menu.classList.add("hidden");
    contextTag = null;
  }

  function handleTagMenuAction(action) {
    if (!contextTag) return;
    const { name } = contextTag;
    closeTagMenu();
    if (action === "deleteTag") post({ type: "deleteTag", name });
  }

  function renderStashList(stashes) {
    if (!stashes || stashes.length === 0) return "";
    return stashes.map((s) =>
      `<li class="gx-stash-item">
        <span class="gx-stash-body">
          <span class="gx-stash-msg" title="${escapeHtml(s.message)}">${escapeHtml(s.message)}</span>
          <span class="gx-stash-meta">${escapeHtml(s.date)}</span>
        </span>
        <span class="gx-stash-actions">
          <button class="gx-mini-action gx-stash-pop-btn" data-action="stashPop" data-ref="${escapeHtml(s.ref)}" title="Pop: apply and remove this stash" aria-label="Pop: apply and remove this stash" type="button">${icon("stashPop", "sm")}<span>Pop</span></button>
          <button class="gx-mini-action gx-stash-more-btn" data-action="openStashMenu" data-ref="${escapeHtml(s.ref)}" title="More stash actions" aria-label="More stash actions" type="button"><span aria-hidden="true">···</span></button>
        </span>
      </li>`
    ).join("");
  }

  function renderConflictList(files) {
    if (!files || !files.length) return "";
    return files.map((f) =>
      `<li class="gx-file gx-file-conflict" data-path="${escapeHtml(f.path)}" data-staged="0" data-status="X">
        ${fileIcon(f.path)}
        <span class="gx-path" title="${escapeHtml(f.path)}">${escapeHtml(f.displayPath || f.path)}</span>
        <span class="gx-right">
          <button class="gx-row-action" data-action="openMergeEditor" data-path="${escapeHtml(f.path)}" title="Open in merge editor" aria-label="Open in merge editor" type="button">${ICONS.merge}</button>
          <button class="gx-row-action gx-conflict-resolve-btn" data-action="markResolved" data-path="${escapeHtml(f.path)}" title="Mark as resolved (stages the file)" aria-label="Mark as resolved" type="button">${ICONS.check}</button>
          ${statusGlyph("X")}
        </span>
      </li>`
    ).join("");
  }

  function setHint(elm, text) {
    if (!elm) return;
    elm.title = text;
    elm.setAttribute("aria-label", text);
    elm.dataset.tooltip = text;
  }
  function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm || singular + "s"}`;
  }
  function flashNotice(message, kind) {
    byId("changesNotice").innerHTML = `<div class="gx-notice ${kind}">${escapeHtml(message)}</div>`;
  }

  function selectionKey(path, staged) {
    return `${staged ? "staged" : "unstaged"}:${path}`;
  }

  function selectedPaths(files, staged) {
    return (files || []).filter((f) => ui.selected.has(selectionKey(f.path, staged))).map((f) => f.path);
  }

  // ---------- Render ----------
  function render() {
    const s = ui.state;

    // Header
    byId("repoName").textContent = s.repositoryName || "—";
    byId("branchName").textContent = s.branchName || "—";
    setHint(
      document.querySelector(".gx-branch-btn"),
      s.branchName ? `Manage branches · current: ${s.branchName}` : "Manage branches"
    );
    renderBranches(s);
    updateSync(s);

    renderNotice(s);

    const stagedFiles = s.changes.staged || [];
    const unstagedFiles = s.changes.unstaged || [];
    byId("stagedList").innerHTML = renderFileList(stagedFiles, true);
    byId("unstagedList").innerHTML = renderFileList(unstagedFiles, false);
    byId("stagedCount").textContent = String(stagedFiles.length);
    byId("unstagedCount").textContent = String(unstagedFiles.length);

    // Conflicts section
    const conflicts = (s.changes && s.changes.conflicts) || [];
    const hasConflicts = conflicts.length > 0;
    const conflictsBanner = byId("conflictsBanner");
    const conflictsSection = byId("conflictsSection");
    if (hasConflicts) {
      conflictsBanner.classList.remove("hidden");
      byId("conflictsBannerText").textContent =
        `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} — resolve all before committing`;
      conflictsSection.classList.remove("hidden");
      byId("conflictsCount").textContent = String(conflicts.length);
      byId("conflictsList").innerHTML = renderConflictList(conflicts);
    } else {
      conflictsBanner.classList.add("hidden");
      conflictsSection.classList.add("hidden");
    }

    // Stash section
    const stashes = s.stashes || [];
    byId("stashList").innerHTML = renderStashList(stashes);
    const stashCountEl = byId("stashCount");
    if (stashes.length > 0) {
      stashCountEl.textContent = String(stashes.length);
      stashCountEl.classList.remove("hidden");
    } else {
      stashCountEl.classList.add("hidden");
    }

    const busy = !!s.isLoading;
    const hasStaged = stagedFiles.length > 0;
    const provLabel = (PROVIDERS.find((p) => p.value === s.provider) || {}).label || s.provider;
    const genBtn = byId("generateBtn");
    const generateHint = hasConflicts
      ? "Resolve all conflicts before generating a commit message"
      : hasStaged
        ? `Generate commit message with ${provLabel}${s.model ? " · " + s.model : " · select a model first"}`
        : "Stage files to generate an AI commit message";
    genBtn.innerHTML =
      `<span class="gx-vsep"></span>` +
      (s.busyKind === "generate"
        ? `<span class="gx-spin"></span>`
        : `<span class="gx-ic">${ICONS.sparkle}</span>`);
    setHint(genBtn, generateHint);
    setDisabled(genBtn, busy || !hasStaged || hasConflicts);
    const commitBtn = byId("commitBtn");
    commitBtn.innerHTML = `${icon("commit")}<span>Commit${
      s.branchName ? " to " + escapeHtml(s.branchName) : ""
    }</span>`;
    setHint(
      commitBtn,
      hasConflicts
        ? `Resolve ${plural(conflicts.length, "conflict")} before committing`
        : hasStaged
          ? `Commit ${plural(stagedFiles.length, "staged file")} to ${s.branchName || "current branch"}`
          : "Stage files before committing"
    );
    setDisabled(commitBtn, busy || !hasStaged || hasConflicts);
    const undoBar = byId("undoBar");
    undoBar.classList.toggle("hidden", !s.canUndoCommit);
    if (s.canUndoCommit && s.lastCommitSummary) {
      const short = s.lastCommitSummary.length > 42 ? s.lastCommitSummary.slice(0, 42) + "…" : s.lastCommitSummary;
      byId("undoMsg").textContent = `Last commit: "${short}"`;
    }
    updateChangeActionButtons(s);

    renderHistory(s);
    renderSettings(s);
    renderSummaryPanel();
    renderSecurityPanel();
    byId("panel-summary").classList.toggle("hidden", !ui.activeSummary);
    byId("panel-security").classList.toggle("hidden", !ui.activeSecurityReview);
  }

  function updateChangeActionButtons(s) {
    const busy = !!s.isLoading;
    const stagedFiles = s.changes.staged || [];
    const unstagedFiles = s.changes.unstaged || [];
    const hasConflictsNow = ((s.changes && s.changes.conflicts) || []).length > 0;
    setDisabled(byId("stagedSecurityBtn"), busy || stagedFiles.length === 0);
    setDisabled(byId("unstagedSecurityBtn"), busy || unstagedFiles.length === 0);
    setDisabled(byId("stashBtn"), busy || stagedFiles.length === 0 || hasConflictsNow);
    const selectedStaged = selectedPaths(stagedFiles, true).length;
    const selectedUnstaged = selectedPaths(unstagedFiles, false).length;
    const unstageSelected = byId("unstageSelectedBtn");
    const unstageAll = byId("unstageAllBtn");
    const stageSelected = byId("stageSelectedBtn");
    const stageAll = byId("stageAllBtn");
    const discardSelected = byId("discardSelectedBtn");
    setHint(
      unstageSelected,
      selectedStaged ? `Unstage ${plural(selectedStaged, "selected file")}` : "Select staged files to unstage"
    );
    setHint(
      unstageAll,
      stagedFiles.length ? `Unstage all ${plural(stagedFiles.length, "file")}` : "No staged files to unstage"
    );
    setHint(
      stageSelected,
      selectedUnstaged ? `Stage ${plural(selectedUnstaged, "selected file")}` : "Select changed files to stage"
    );
    setHint(
      stageAll,
      unstagedFiles.length ? `Stage all ${plural(unstagedFiles.length, "file")}` : "No changed files to stage"
    );
    setHint(
      discardSelected,
      selectedUnstaged ? `Discard ${plural(selectedUnstaged, "selected file")}` : "Select changed files to discard"
    );
    setDisabled(unstageSelected, busy || selectedStaged === 0);
    setDisabled(unstageAll, busy || stagedFiles.length === 0);
    setDisabled(stageSelected, busy || selectedUnstaged === 0);
    setDisabled(stageAll, busy || unstagedFiles.length === 0);
    discardSelected.classList.toggle("hidden", selectedUnstaged === 0);
    setDisabled(discardSelected, busy || selectedUnstaged === 0);
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
        )}" title="${current ? "Current branch: " + escapeHtml(b) : "Switch to " + escapeHtml(b)}" aria-label="${
          current ? "Current branch: " + escapeHtml(b) : "Switch to " + escapeHtml(b)
        }">
            <span class="gx-ic sm gx-branch-ic">${ICONS.branch}</span>
            <span class="gx-branch-name">${escapeHtml(b)}</span>
            ${current ? `<span class="gx-ic sm gx-branch-check">${ICONS.check}</span>` : ""}
          </li>`;
      })
      .join("");
  }

  function timeAgo(ts) {
    if (!ts) return "";
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return "Last fetched just now";
    if (mins === 1) return "Last fetched 1 minute ago";
    return `Last fetched ${mins} minutes ago`;
  }

  const BADGE_UP = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 3C12.2652 3 12.5196 3.10536 12.7071 3.29289L19.7071 10.2929C20.0976 10.6834 20.0976 11.3166 19.7071 11.7071C19.3166 12.0976 18.6834 12.0976 18.2929 11.7071L13 6.41421V20C13 20.5523 12.5523 21 12 21C11.4477 21 11 20.5523 11 20V6.41421L5.70711 11.7071C5.31658 12.0976 4.68342 12.0976 4.29289 11.7071C3.90237 11.3166 3.90237 10.6834 4.29289 10.2929L11.2929 3.29289C11.4804 3.10536 11.7348 3 12 3Z" fill="currentColor"/></svg>`;
  const BADGE_DOWN = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 3C12.5523 3 13 3.44772 13 4V17.5858L18.2929 12.2929C18.6834 11.9024 19.3166 11.9024 19.7071 12.2929C20.0976 12.6834 20.0976 13.3166 19.7071 13.7071L12.7071 20.7071C12.3166 21.0976 11.6834 21.0976 11.2929 20.7071L4.29289 13.7071C3.90237 13.3166 3.90237 12.6834 4.29289 12.2929C4.68342 11.9024 5.31658 11.9024 5.70711 12.2929L11 17.5858V4C11 3.44772 11.4477 3 12 3Z" fill="currentColor"/></svg>`;
  const BADGE_TAG = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;

  function updateSync(s) {
    const btn = byId("syncBtn");
    const iconEl = byId("syncIcon");
    const labelEl = byId("syncLabel");
    const badgeEl = byId("syncBadge");
    const pendingTags = s.pendingTagCount || 0;

    const syncAction = s.syncAction || "";

    if (syncAction) {
      iconEl.innerHTML = `<span class="gx-spin"></span>`;
      labelEl.textContent = syncAction;
      btn.title = "Hang on…";
      badgeEl.classList.add("hidden");
      setDisabled(btn, true);
      return;
    }

    setDisabled(btn, !!s.isLoading || !s.branchName);

    const fetchedText = timeAgo(s.lastFetchedAt || 0);

    if (!s.branchName) {
      iconEl.innerHTML = ICONS.refresh;
      labelEl.textContent = "Fetch origin";
      btn.title = fetchedText;
      badgeEl.classList.add("hidden");
    } else if (!s.hasUpstream) {
      iconEl.innerHTML = ICONS.push;
      labelEl.textContent = "Publish branch";
      btn.title = "No upstream set";
      badgeEl.classList.add("hidden");
    } else if (s.behind > 0) {
      iconEl.innerHTML = ICONS.pull;
      labelEl.textContent = "Pull origin";
      btn.title = fetchedText;
      badgeEl.innerHTML = `${s.behind}${BADGE_DOWN}`;
      badgeEl.classList.remove("hidden");
    } else if (s.ahead > 0) {
      iconEl.innerHTML = ICONS.push;
      labelEl.textContent = "Push origin";
      btn.title = pendingTags > 0 ? `Push ${s.ahead} commit${s.ahead > 1 ? "s" : ""} + ${pendingTags} tag${pendingTags > 1 ? "s" : ""}` : fetchedText;
      badgeEl.innerHTML = pendingTags > 0
        ? `${s.ahead}${BADGE_UP}<span class="gx-badge-sep">·</span>${pendingTags}${BADGE_TAG}`
        : `${s.ahead}${BADGE_UP}`;
      badgeEl.classList.remove("hidden");
    } else if (pendingTags > 0) {
      iconEl.innerHTML = ICONS.push;
      labelEl.textContent = "Push tags";
      btn.title = `Push ${pendingTags} unpushed tag${pendingTags > 1 ? "s" : ""} to origin`;
      badgeEl.innerHTML = `${pendingTags}${BADGE_TAG}`;
      badgeEl.classList.remove("hidden");
    } else {
      iconEl.innerHTML = ICONS.refresh;
      labelEl.textContent = "Fetch origin";
      btn.title = fetchedText;
      badgeEl.classList.add("hidden");
    }
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
    if (status === "X") {
      return `<span class="gx-stat gx-stat-X" title="Conflict">${ICONS.conflict}</span>`;
    }
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

  function renderFileList(files, isStaged) {
    if (!files || !files.length) {
      return `<li class="gx-empty">No files</li>`;
    }
    return files.map((f) => renderFile(f, isStaged)).join("");
  }

  function renderFile(f, isStaged) {
    const checked = ui.selected.has(selectionKey(f.path, isStaged)) ? "checked" : "";
    const selectTitle = `Select ${f.displayPath || f.path}`;
    const stageTitle = `Stage ${f.displayPath || f.path}`;
    const unstageTitle = `Unstage ${f.displayPath || f.path}`;
    return `
      <li class="gx-file${isStaged ? " gx-file-staged" : ""}" data-path="${escapeHtml(f.path)}" data-staged="${isStaged ? 1 : 0}" data-status="${escapeHtml(f.status)}">
        <input type="checkbox" class="gx-check" data-path="${escapeHtml(f.path)}" data-staged="${isStaged ? 1 : 0}" title="${escapeHtml(selectTitle)}" aria-label="${escapeHtml(selectTitle)}" ${checked} />
        ${fileIcon(f.path)}
        <span class="gx-path" data-action="openFile" data-path="${escapeHtml(f.path)}" data-staged="${isStaged ? 1 : 0}" data-status="${escapeHtml(f.status)}" title="Open changes — ${escapeHtml(f.path)}">${escapeHtml(f.displayPath || f.path)}</span>
        <span class="gx-right">
          ${isStaged
            ? `<button class="gx-row-action" data-action="unstageOne" data-path="${escapeHtml(f.path)}" title="${escapeHtml(unstageTitle)}" aria-label="${escapeHtml(unstageTitle)}" type="button">${ICONS.minus}</button>`
            : `<button class="gx-row-action" data-action="stageOne" data-path="${escapeHtml(f.path)}" title="${escapeHtml(stageTitle)}" aria-label="${escapeHtml(stageTitle)}" type="button">${ICONS.plus}</button>`}
          ${statusGlyph(f.status)}
        </span>
      </li>`;
  }

  function renderHistory(s) {
    const list = byId("commitList");
    const commits = s.history || [];
    if (!commits.length) {
      list.innerHTML = `<li class="gx-empty">No commits yet</li>`;
      return;
    }
    list.innerHTML = commits
      .map((c) => {
        const expanded = ui.expandedCommits.has(c.hash);
        return `
        <li class="gx-commit${expanded ? " expanded" : ""}">
          <div class="gx-commit-head" data-action="toggleCommit" data-hash="${escapeHtml(c.hash)}" title="Show changed files" aria-label="Show changed files in ${escapeHtml(c.hash)}">
            <span class="gx-commit-col-left">
              <span class="rail gx-ic">${ICONS.commit}</span>
              <span class="gx-commit-col-bottom">
                <span class="gx-commit-caret gx-ic sm">${ICONS.chevron}</span>
              </span>
            </span>
            <span class="body">
              <div class="gx-commit-title">
                <span class="gx-commit-subject">${escapeHtml(c.subject)}</span>
                ${renderCommitTags(c.tags)}
              </div>
              <div class="gx-commit-meta">
                <span class="gx-hash">${escapeHtml(c.hash.slice(0, 7))}</span>
                <span>${escapeHtml(c.author)}</span>
                <span>${escapeHtml(c.relativeDate)}</span>
              </div>
            </span>
            <button class="gx-ai-sum gx-ic sm" data-action="summarizeCommit" data-hash="${escapeHtml(c.hash)}" data-subject="${escapeHtml(c.subject)}" title="Generate AI summary" aria-label="Generate AI summary" type="button">${ICONS.sparkle}</button>
          </div>
          ${expanded ? renderCommitFiles(c.hash) : ""}
        </li>`;
      })
      .join("");
  }

  function renderSummaryPanel() {
    const el = byId("summaryContent");
    if (!el) return;
    const s = ui.activeSummary;
    if (!s) { el.innerHTML = ""; return; }

    const hashEl = `<span class="gx-hash">${escapeHtml(s.hash.slice(0, 7))}</span>`;
    const subjectEl = s.subject ? `<span class="gx-ai-subject">${escapeHtml(s.subject)}</span>` : "";

    if (s.loading) {
      el.innerHTML = `
        <div class="gx-ai-panel">
          <div class="gx-ai-panel-meta">${hashEl}${subjectEl}</div>
          <div class="gx-ai-panel-loading">
            <span class="gx-spin"></span><span>Generating summary…</span>
          </div>
        </div>`;
      return;
    }
    if (s.error) {
      el.innerHTML = `
        <div class="gx-ai-panel">
          <div class="gx-ai-panel-meta">${hashEl}${subjectEl}</div>
          <div class="gx-ai-panel-error">${escapeHtml(s.error)}</div>
          <div class="gx-ai-panel-actions">
            <button class="gx-btn gx-btn-ghost" data-action="closeSummary" type="button">${icon("history", "sm")}<span>Back to History</span></button>
          </div>
        </div>`;
      return;
    }
    el.innerHTML = `
      <div class="gx-ai-panel">
        <div class="gx-ai-panel-meta">${hashEl}${subjectEl}</div>
        <div class="gx-ai-panel-body">
          <p class="gx-ai-panel-summary">${escapeHtml(s.summary || "")}</p>
          ${s.description ? `<p class="gx-ai-panel-desc">${escapeHtml(s.description)}</p>` : ""}
        </div>
        <div class="gx-ai-panel-actions">
          <button class="gx-btn gx-btn-primary" data-action="copySummaryText" type="button">${icon("copy", "sm")}<span>Copy</span></button>
          <button class="gx-btn gx-btn-ghost" data-action="closeSummary" type="button">${icon("history", "sm")}<span>Back to History</span></button>
        </div>
      </div>`;
  }

  function renderSecurityPanel() {
    const container = byId("securityContent");
    if (!container) return;
    const sr = ui.activeSecurityReview;
    if (!sr) { container.innerHTML = ""; return; }

    const scope = sr.staged ? "Staged Changes" : "Working Tree Changes";

    if (sr.loading) {
      container.innerHTML = `
        <div class="gx-ai-panel">
          <div class="gx-ai-panel-meta"><span class="gx-sec-scope">${escapeHtml(scope)}</span></div>
          <div class="gx-ai-panel-loading">${icon("shieldAi", "sm")}<span>Scanning for security risks…</span></div>
        </div>`;
      return;
    }
    if (sr.error) {
      container.innerHTML = `
        <div class="gx-ai-panel">
          <div class="gx-ai-panel-meta"><span class="gx-sec-scope">${escapeHtml(scope)}</span></div>
          <div class="gx-ai-panel-error">${escapeHtml(sr.error)}</div>
          <div class="gx-ai-panel-actions">
            <button class="gx-btn gx-btn-ghost" data-action="closeSecurityReview" type="button">${icon("changes", "sm")}<span>Back to Changes</span></button>
          </div>
        </div>`;
      return;
    }

    const findings = sr.findings || [];
    const bodyHtml = sr.safe || !findings.length
      ? `<div class="gx-sec-safe">${icon("check", "sm")}<span>No security issues found in ${escapeHtml(scope.toLowerCase())}.</span></div>`
      : findings.map((f) => `
          <div class="gx-finding gx-sev-${escapeHtml(f.severity)}">
            <div class="gx-finding-header">
              <span class="gx-severity-badge gx-sev-badge-${escapeHtml(f.severity)}">${escapeHtml(f.severity.toUpperCase())}</span>
              <span class="gx-finding-cat">${escapeHtml(f.category)}</span>
            </div>
            <div class="gx-finding-title">${escapeHtml(f.title)}</div>
            <div class="gx-finding-detail">${escapeHtml(f.detail)}</div>
          </div>`).join("");

    container.innerHTML = `
      <div class="gx-ai-panel">
        <div class="gx-ai-panel-meta">
          <span class="gx-sec-scope">${escapeHtml(scope)}</span>
          ${findings.length ? `<span class="gx-sec-count">${findings.length} issue${findings.length === 1 ? "" : "s"}</span>` : ""}
        </div>
        <div class="gx-ai-panel-body gx-sec-body">${bodyHtml}</div>
        <div class="gx-ai-panel-actions">
          <button class="gx-btn gx-btn-primary" data-action="copySecurityReview" type="button">${icon("copy", "sm")}<span>Copy</span></button>
          <button class="gx-btn gx-btn-ghost" data-action="closeSecurityReview" type="button">${icon("changes", "sm")}<span>Back to Changes</span></button>
        </div>
      </div>`;
  }

  function renderCommitTags(tags) {
    const names = Array.isArray(tags) ? tags.filter(Boolean) : [];
    if (!names.length) return "";
    return `<span class="gx-commit-tags">${names
      .map((tagName) => `<span class="gx-tag gx-tag-btn" data-tag-name="${escapeHtml(tagName)}" title="Click to manage tag: ${escapeHtml(tagName)}" role="button" tabindex="0">${icon("tag", "xs")}${escapeHtml(tagName)}</span>`)
      .join("")}</span>`;
  }

  function renderCommitFiles(hash) {
    const files = ui.commitFiles[hash];
    if (files === "loading" || files === undefined) {
      return `<ul class="gx-commit-files"><li class="gx-empty">Loading changes…</li></ul>`;
    }
    if (!files.length) {
      return `<ul class="gx-commit-files"><li class="gx-empty">No file changes</li></ul>`;
    }
    const stat = ui.commitStats[hash];
    const footer = stat
      ? `<li class="gx-diff-stat" aria-label="${stat.files} changed files, ${stat.insertions} insertions, ${stat.deletions} deletions">
          <span class="gx-ds-files">${stat.files} changed ${stat.files === 1 ? "file" : "files"}</span>
          ${stat.insertions ? `<span class="gx-ds-add">+${stat.insertions}</span>` : ""}
          ${stat.deletions ? `<span class="gx-ds-del">-${stat.deletions}</span>` : ""}
        </li>`
      : "";
    return `<ul class="gx-commit-files">${files
      .map((f) => {
        const label = f.displayPath || f.path;
        return `<li class="gx-cfile" data-action="openCommitFile" data-hash="${escapeHtml(hash)}" data-path="${escapeHtml(
          f.path
        )}" data-status="${escapeHtml(f.status)}" title="Open changes — ${escapeHtml(
          label
        )}" aria-label="Open changes — ${escapeHtml(label)}">
            ${fileIcon(f.path)}
            <span class="gx-path">${escapeHtml(label)}</span>
            ${commitStatusGlyph(f.status)}
          </li>`;
      })
      .join("")}${footer}</ul>`;
  }

  function commitStatusGlyph(status) {
    if (status === "A" || status === "U") return `<span class="gx-cstat gx-stat-A">${ICONS.plus}</span>`;
    if (status === "D") return `<span class="gx-cstat gx-stat-D">${ICONS.minus}</span>`;
    if (status === "R" || status === "C") return `<span class="gx-cstat gx-stat-R">${ICONS.dot}</span>`;
    return `<span class="gx-cstat gx-stat-M">${ICONS.dot}</span>`;
  }

  function renderSettings(s) {
    const keyInput = /** @type {HTMLInputElement} */ (byId("apiKeyInput"));
    keyInput.placeholder = s.hasApiKey
      ? "•••••••••••• stored — paste to replace"
      : "Paste your API key";
    const hasInputText = keyInput.value.trim().length > 0;
    setDisabled(byId("saveValidateBtn"), !hasInputText && !s.hasApiKey);

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

  // ---------- Reports ----------

  const TYPE_LABELS = { commitMessage: "Commit msg", commitSummary: "AI Summary", security: "Security" };
  const TYPE_COLORS = { commitMessage: "var(--gx-pink)", commitSummary: "#7aa2ff", security: "#e7bd57" };
  const PROVIDER_COLORS = { openai: "#19c37d", gemini: "#6aa9ff", claude: "#e8991e" };

  /**
   * @param {Array<{ts:number,provider:string,model:string,type:string}>|null} entries — null = loading
   */
  function renderReports(entries) {
    const el = byId("reportsContent");
    if (!el) return;

    if (entries === null) {
      el.innerHTML = `<div class="gx-rep-loading"><span class="gx-spin"></span><span>Loading…</span></div>`;
      return;
    }

    if (!entries.length) {
      el.innerHTML = `
        <div class="gx-rep-empty">
          ${icon("reports", "sm")}
          <p>No AI calls recorded yet.</p>
          <p class="gx-rep-hint">Usage is tracked each time you generate a commit message, run an AI summary, or run a security review.</p>
        </div>`;
      return;
    }

    const total = entries.length;

    // ── By type ──
    const typeCounts = /** @type {Record<string,number>} */ ({});
    entries.forEach((e) => { typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });

    // ── By provider ──
    const provCounts = /** @type {Record<string,number>} */ ({});
    entries.forEach((e) => { const p = e.provider || "other"; provCounts[p] = (provCounts[p] || 0) + 1; });

    // ── By model (top 5) ──
    const modelCounts = /** @type {Record<string,number>} */ ({});
    entries.forEach((e) => { if (e.model) modelCounts[e.model] = (modelCounts[e.model] || 0) + 1; });
    const topModels = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // ── Daily sparkline (last 30 days) ──
    const days = [];
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, count: 0 });
    }
    entries.forEach((e) => {
      const d = new Date(e.ts);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const slot = days.find((day) => day.key === key);
      if (slot) slot.count++;
    });
    const maxDay = Math.max(...days.map((d) => d.count), 1);

    function barRow(label, count, color) {
      const pct = Math.round((count / total) * 100);
      const width = Math.max(2, pct);
      return `
        <div class="gx-rep-bar-row">
          <span class="gx-rep-bar-label">${escapeHtml(label)}</span>
          <span class="gx-rep-bar-track">
            <span class="gx-rep-bar-fill" style="width:${width}%;background:${color}"></span>
          </span>
          <span class="gx-rep-bar-count">${count}</span>
        </div>`;
    }

    const typeRows = Object.entries(TYPE_LABELS).filter(([k]) => typeCounts[k]).map(([k, label]) =>
      barRow(label, typeCounts[k] || 0, TYPE_COLORS[k] || "var(--gx-pink)")
    ).join("");

    const provRows = Object.entries(provCounts).sort((a, b) => b[1] - a[1]).map(([p, c]) =>
      barRow(p.charAt(0).toUpperCase() + p.slice(1), c, PROVIDER_COLORS[p] || "#9a8f83")
    ).join("");

    const modelRows = topModels.map(([m, c]) => `
      <div class="gx-rep-model-row">
        <span class="gx-rep-model-name" title="${escapeHtml(m)}">${escapeHtml(m)}</span>
        <span class="gx-rep-model-count">${c}</span>
      </div>`).join("");

    const sparkBars = days.map((d) => {
      const h = Math.max(2, Math.round((d.count / maxDay) * 36));
      return `<span class="gx-spark-bar" style="height:${h}px" title="${escapeHtml(d.label)}: ${d.count}"></span>`;
    }).join("");

    el.innerHTML = `
      <div class="gx-rep-header">
        <span class="gx-rep-title">Last 30 days</span>
        <button class="gx-iconbtn gx-rep-refresh" data-action="openReports" title="Refresh" aria-label="Refresh" type="button">${icon("refresh", "sm")}</button>
      </div>

      <div class="gx-rep-total">
        <span class="gx-rep-total-num">${total}</span>
        <span class="gx-rep-total-label">AI call${total === 1 ? "" : "s"}</span>
      </div>

      <div class="gx-rep-spark">${sparkBars}</div>

      <div class="gx-rep-section">
        <div class="gx-rep-section-title">BY TYPE</div>
        ${typeRows}
      </div>

      <div class="gx-rep-section">
        <div class="gx-rep-section-title">BY PROVIDER</div>
        ${provRows}
      </div>

      ${topModels.length ? `
      <div class="gx-rep-section">
        <div class="gx-rep-section-title">TOP MODELS</div>
        ${modelRows}
      </div>` : ""}
    `;
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
      case "commitFiles":
        ui.commitFiles[message.hash] = Array.isArray(message.files) ? message.files : [];
        if (message.stat) ui.commitStats[message.hash] = message.stat;
        if (ui.expandedCommits.has(message.hash)) renderHistory(ui.state);
        break;
      case "commitSummary":
        if (ui.activeSummary && ui.activeSummary.hash === message.hash) {
          if (message.error) {
            ui.activeSummary = { ...ui.activeSummary, loading: false, error: message.error };
          } else {
            ui.activeSummary = { ...ui.activeSummary, loading: false, summary: message.summary, description: message.description };
          }
          renderSummaryPanel();
        }
        break;
      case "securityReview":
        if (ui.activeSecurityReview) {
          if (message.error) {
            ui.activeSecurityReview = { ...ui.activeSecurityReview, loading: false, error: message.error };
          } else {
            ui.activeSecurityReview = { ...ui.activeSecurityReview, loading: false, findings: message.findings, safe: !!message.safe };
          }
          renderSecurityPanel();
        }
        break;
      case "reports":
        renderReports(Array.isArray(message.entries) ? message.entries : []);
        break;
      default:
        break;
    }
  });

  function pruneSelection() {
    const present = new Set();
    (ui.state.changes.staged || []).forEach((f) => present.add(selectionKey(f.path, true)));
    (ui.state.changes.unstaged || []).forEach((f) => present.add(selectionKey(f.path, false)));
    Array.from(ui.selected).forEach((path) => {
      if (!present.has(path)) ui.selected.delete(path);
    });
  }

  // ---------- Boot ----------
  buildShell();
  switchTab("changes");
  render();
  post({ type: "ready" });
})();
