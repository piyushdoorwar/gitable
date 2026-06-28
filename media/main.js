(function () {
  const vscode = acquireVsCodeApi();

  const SUMMARY_MESSAGES = ["Reading commits…", "Summarizing changes…", "Connecting the dots…", "Almost there…"];
  const SECURITY_MESSAGES = ["Reviewing the code…", "Joining the dots…", "Matching against known vulnerabilities…", "Categorizing risks…", "Almost there…"];
  const AI_PROGRESS_INTERVAL = 3000;

  /** Inline SVG icons (no emojis / unicode glyphs). */
  const ICONS = {
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    externalLink:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    branch:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="14"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="7" r="2.4"/><path d="M18 9.4c0 4-3.5 5.6-6 5.6"/></svg>',
    merge:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><line x1="6" y1="8.4" x2="6" y2="15.6"/><path d="M18 8.4c0 5.6-4.5 9.6-12 9.6"/></svg>',
    rebase:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><line x1="18" y1="8.4" x2="18" y2="15.6"/><path d="M6 15.6C6 10 10 8.4 18 8.4"/></svg>',
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
    undo:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/></svg>',
    cherryPick:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="2.5"/><line x1="3" y1="12" x2="6.5" y2="12"/><line x1="11.5" y1="12" x2="16" y2="12"/><polyline points="13 7 18 12 13 17"/></svg>',
    pencil:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
    shieldAi:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4 5.5V11c0 5.25 3.6 9.74 8 11.5 4.4-1.76 8-6.25 8-11.5V5.5L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 8l.75 2.1 2.1.75-2.1.75L12 13.7l-.75-2.1-2.1-.75 2.1-.75z" fill="currentColor" stroke="none"/></svg>',
    reports:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.8321 9.5547C18.1384 9.09517 18.0142 8.4743 17.5547 8.16795C17.0952 7.8616 16.4743 7.98577 16.168 8.4453L13.3925 12.6085L10.0529 10.3542C9.421 9.92768 8.55941 10.1339 8.18917 10.8004L6.12584 14.5144C5.85763 14.9971 6.03157 15.6059 6.51436 15.8742C6.99714 16.1424 7.60594 15.9684 7.87416 15.4856L9.56672 12.439L12.8571 14.66C13.4546 15.0634 14.2662 14.9035 14.6661 14.3036L17.8321 9.5547Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7 2C4.23858 2 2 4.23858 2 7V17C2 19.7614 4.23858 22 7 22H17C19.7614 22 22 19.7614 22 17V7C22 4.23858 19.7614 2 17 2H7ZM4 7C4 5.34315 5.34315 4 7 4H17C18.6569 4 20 5.34315 20 7V17C20 18.6569 18.6569 20 17 20H7C5.34315 20 4 18.6569 4 17V7Z" fill="currentColor"/></svg>',
    conflict:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    jira:
      '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M29.762 1.004h-14.443c0 3.599 2.918 6.517 6.517 6.517h2.66v2.571c0.003 3.591 2.91 6.502 6.498 6.512v-14.343c0-0.685-0.55-1.241-1.232-1.251zM22.616 8.198h-14.443c0.001 3.599 2.918 6.516 6.517 6.516h2.66v2.572c0.003 3.598 2.919 6.513 6.517 6.516v-14.352c0-0.691-0.56-1.251-1.251-1.251zM15.464 15.391h-14.46c0.002 3.6 2.921 6.517 6.521 6.517h2.661v2.57c0 3.598 2.916 6.515 6.514 6.517v-14.348c0-0.694-0.562-1.256-1.256-1.256z"/></svg>',
    dots:
      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 3H16.5C16.9644 3 17.1966 3 17.3916 3.02567C18.7378 3.2029 19.7971 4.26222 19.9743 5.60842C20 5.80337 20 6.03558 20 6.5" stroke="currentColor" stroke-width="1.5"/><path d="M2 6.94975C2 6.06722 2 5.62595 2.06935 5.25839C2.37464 3.64031 3.64031 2.37464 5.25839 2.06935C5.62595 2 6.06722 2 6.94975 2C7.33642 2 7.52976 2 7.71557 2.01738C8.51665 2.09229 9.27652 2.40704 9.89594 2.92051C10.0396 3.03961 10.1763 3.17633 10.4497 3.44975L11 4C11.8158 4.81578 12.2237 5.22367 12.7121 5.49543C12.9804 5.64471 13.2651 5.7626 13.5604 5.84678C14.0979 6 14.6747 6 15.8284 6H16.2021C18.8345 6 20.1506 6 21.0062 6.76946C21.0849 6.84024 21.1598 6.91514 21.2305 6.99383C22 7.84935 22 9.16554 22 11.7979V14C22 17.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V6.94975Z" stroke="currentColor" stroke-width="1.5"/></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="8.01"/><line x1="12" y1="12" x2="12" y2="16"/></svg>'
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
    { value: "openai",  label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
    { value: "gemini",  label: "Gemini", keyUrl: "https://aistudio.google.com/api-keys" },
    { value: "claude",  label: "Claude", keyUrl: "https://platform.claude.com/settings/keys" }
  ];

  const CONFIG_STORAGE_KEY = "gitable.config.v1";

  const TOKEN_PRESETS = { low: 10_000, mid: 40_000, high: 80_000 };

  function readConfig() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        return {
          jiraEnabled: !!p.jiraEnabled,
          fileView: p.fileView === "tree" ? "tree" : "flat",
          budgets: {
            commit:   ["low","mid","high"].includes(p.budgets?.commit)   ? p.budgets.commit   : "mid",
            summary:  ["low","mid","high"].includes(p.budgets?.summary)  ? p.budgets.summary  : "mid",
            security: ["low","mid","high"].includes(p.budgets?.security) ? p.budgets.security : "mid"
          }
        };
      }
    } catch (_) {}
    return { jiraEnabled: false, fileView: "flat", budgets: { commit: "mid", summary: "mid", security: "mid" } };
  }

  function saveConfig(cfg) {
    try { window.localStorage && window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg)); } catch (_) {}
  }

  function getMaxChars(feature) {
    const key = ui.config.budgets[feature] || "mid";
    return TOKEN_PRESETS[key] || TOKEN_PRESETS.mid;
  }

  function updateJiraVisibility() {
    const enabled = ui.config.jiraEnabled;
    const btn = byId("jiraHeaderBtn");
    const tab = byId("settingsTabJira");
    if (btn) btn.classList.toggle("hidden", !enabled);
    if (tab) tab.classList.toggle("hidden", !enabled);
    if (!enabled && ui.activeTab === "jira") switchTab("changes");
    if (!enabled && ui.activeSettingsTab === "jira") {
      ui.activeSettingsTab = "ai";
      byId("settingsTabAi").classList.add("active");
      byId("settingsPaneAi").classList.remove("hidden");
      byId("settingsPaneJira").classList.add("hidden");
    }
  }

  function updateConfigUi() {
    const cfg = ui.config;
    const toggleBtn = byId("jiraToggleBtn");
    if (toggleBtn) {
      toggleBtn.classList.toggle("on", cfg.jiraEnabled);
      toggleBtn.setAttribute("aria-pressed", String(cfg.jiraEnabled));
    }
    document.querySelectorAll(".gx-budget-btn").forEach((btn) => {
      const feature = btn.getAttribute("data-feature");
      const preset = btn.getAttribute("data-preset");
      btn.classList.toggle("active", cfg.budgets[feature] === preset);
    });
    document.querySelectorAll(".gx-file-view-btn").forEach((btn) => {
      btn.classList.toggle("active", cfg.fileView === btn.getAttribute("data-view"));
    });
  }

  const COMMIT_PREFIX_STORAGE_KEY = "gitable.commitPrefix.v1";

  function readCommitPrefixState() {
    try {
      const stored = window.localStorage && window.localStorage.getItem(COMMIT_PREFIX_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          enabled: !!parsed.enabled,
          value: typeof parsed.value === "string" ? parsed.value : ""
        };
      }
    } catch (_) {
      // Ignore unavailable storage; VS Code webview state below is the fallback.
    }

    try {
      const state = vscode.getState && vscode.getState();
      const saved = state && state.commitPrefix;
      if (saved) {
        return {
          enabled: !!saved.enabled,
          value: typeof saved.value === "string" ? saved.value : ""
        };
      }
    } catch (_) {
      // No persisted state available.
    }

    return { enabled: false, value: "" };
  }

  /** Local UI state preserved across re-renders. */
  const ui = {
    activeTab: "changes",
    activeChangeTab: "working",
    amendMode: false,
    selected: new Set(),
    selectedCommits: new Set(),
    historyAnchorHash: "",
    branchFilter: "",
    expandedCommits: new Set(),
    collapsedFolders: new Set(),
    commitFiles: /** @type {Record<string, any>} */ ({}),
    commitStats: /** @type {Record<string, any>} */ ({}),
    activeSummary: /** @type {null | {hash: string, subject: string, loading?: boolean, summary?: string, description?: string, error?: string}} */ (null),
    activeSecurityReview: /** @type {null | {staged: boolean, loading?: boolean, findings?: any[], safe?: boolean, error?: string}} */ (null),
    summaryProgress: { timer: /** @type {ReturnType<typeof setTimeout>|null} */ (null), idx: 0 },
    securityProgress: { timer: /** @type {ReturnType<typeof setTimeout>|null} */ (null), idx: 0 },
    commitPrefix: readCommitPrefixState(),
    config: readConfig(),
    activeSettingsTab: "ai",
    jiraIssues: /** @type {null | any[]} */ (null),
    jiraLoading: false,
    jiraError: "",
    jiraSort: /** @type {{ col: string|null, dir: "asc"|"desc" }} */ ({ col: null, dir: "asc" }),
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
  let contextJiraIssue = /** @type {null | {key: string, summary: string}} */ (null);

  function post(message) {
    vscode.postMessage(message);
  }

  function startAiProgress(messages, progressState, renderFn) {
    stopAiProgress(progressState);
    progressState.idx = 0;
    const tick = () => {
      if (progressState.timer === null) return;
      if (progressState.idx < messages.length - 1) {
        progressState.idx++;
        renderFn();
        progressState.timer = setTimeout(tick, AI_PROGRESS_INTERVAL);
      } else {
        progressState.timer = null;
      }
    };
    progressState.timer = setTimeout(tick, AI_PROGRESS_INTERVAL);
    renderFn();
  }

  function stopAiProgress(progressState) {
    if (progressState.timer !== null) {
      clearTimeout(progressState.timer);
      progressState.timer = null;
    }
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
  function commitPrefixValue() {
    return ui.commitPrefix && ui.commitPrefix.enabled ? ui.commitPrefix.value.trim() : "";
  }
  function applyCommitPrefix(summary) {
    const text = String(summary || "").trim();
    const prefix = commitPrefixValue();
    if (!prefix || !text) return text;
    if (text === prefix || text.startsWith(prefix + " ")) return text;
    return `${prefix} ${text}`;
  }
  function persistCommitPrefix() {
    const payload = {
      enabled: !!(ui.commitPrefix && ui.commitPrefix.enabled),
      value: ui.commitPrefix && typeof ui.commitPrefix.value === "string" ? ui.commitPrefix.value : ""
    };
    try {
      window.localStorage && window.localStorage.setItem(COMMIT_PREFIX_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {
      // Best effort; webview state is enough for the current panel lifecycle.
    }
    try {
      if (vscode.setState) {
        const state = vscode.getState && vscode.getState();
        vscode.setState({ ...(state || {}), commitPrefix: payload });
      }
    } catch (_) {
      // Persisting prefix is non-critical.
    }
  }
  function updatePrefixUi() {
    const enabled = !!(ui.commitPrefix && ui.commitPrefix.enabled);
    const row = byId("commitPrefixRow");
    const input = /** @type {HTMLInputElement} */ (byId("commitPrefix"));
    const toggle = byId("prefixToggleBtn");
    const remove = byId("prefixRemoveBtn");
    if (row) row.classList.toggle("hidden", !enabled);
    if (toggle) toggle.classList.toggle("hidden", enabled);
    if (input && input.value !== ui.commitPrefix.value) input.value = ui.commitPrefix.value || "";
    setHint(toggle, ui.commitPrefix.value.trim() ? `Prefix: ${ui.commitPrefix.value.trim()}` : "Prefix");
    setHint(remove, "Remove prefix");
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
  function setInputDisabled(elm, disabled) {
    if (!elm) return;
    elm.disabled = !!disabled;
    elm.classList.toggle("gx-disabled", !!disabled);
  }
  function tooltipText(elm) {
    return elm.getAttribute("data-tooltip") || elm.getAttribute("aria-label") || elm.getAttribute("title") || "";
  }
  // The webview ships its own custom tooltip (see initTooltips). Any native
  // `title` attribute would render a SECOND, OS-drawn tooltip on top of it —
  // a double tooltip that appears on some Electron/GTK builds but not others.
  // Move every `title` into `data-tooltip` (which tooltipText prefers) and drop
  // the native attribute so only the custom tooltip ever shows.
  function dedupeNativeTitles(root) {
    (root || document.body).querySelectorAll("[title]").forEach((elm) => {
      if (!elm.dataset.tooltip) elm.dataset.tooltip = elm.getAttribute("title");
      elm.removeAttribute("title");
    });
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
      const tip = current ? `Selected: ${current.label}` : placeholder;
      button.setAttribute("aria-label", tip);
      button.dataset.tooltip = tip;
      button.removeAttribute("title");
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
  function closeAllMenus() {
    closeFileMenu();
    closeCommitMenu();
    closeBranchMenu();
    closeStashMenu();
    closeTagMenu();
    closeJiraMenu();
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
            <button id="jiraHeaderBtn" class="gx-iconbtn gx-hdr-btn" data-action="openJira" title="Jira issues" aria-label="Jira issues" type="button">${icon("jira", "sm")}</button>
            <button class="gx-iconbtn gx-hdr-btn" data-action="openSettings" title="Settings" aria-label="Settings" type="button">${icon("settings", "sm")}</button>
          </span>
        </div>
        <div class="gx-branch-row">
          <button class="gx-branch-btn" data-action="openBranches" title="Manage branches" aria-label="Manage branches" type="button">
            ${icon("branch", "sm")}<span id="branchName" class="gx-branch-cur">—</span>
          </button>
          <button id="pullBtn" class="gx-sync-btn" data-action="pullSync" title="Fetch origin" aria-label="Fetch origin" type="button" disabled>
            <span id="pullIcon" class="gx-ic sm"></span>
            <span id="pullBadge" class="gx-sync-btn-badge hidden"></span>
          </button>
          <button id="pushBtn" class="gx-sync-btn" data-action="pushSync" title="Push origin" aria-label="Push origin" type="button" disabled>
            <span id="pushIcon" class="gx-ic sm"></span>
            <span id="pushBadge" class="gx-sync-btn-badge hidden"></span>
          </button>
        </div>
      </div>

      <div class="gx-tabs">
        <button class="gx-tab" data-tab="changes" title="Show working tree changes" aria-label="Show working tree changes" type="button">${icon("changes", "sm")}<span>Changes</span></button>
        <button class="gx-tab" data-tab="history" title="Show commit history" aria-label="Show commit history" type="button">${icon("history", "sm")}<span>History</span></button>
      </div>

      <div id="panel-changes" class="gx-panel">
        <div class="gx-changes-scroll">
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

          <div class="gx-change-subtabs" role="tablist" aria-label="Change sections">
            <button id="changeTabWorking" class="gx-change-subtab" data-action="changeSubTab" data-change-tab="working" role="tab" type="button">
              <span>Working</span><span id="unstagedCount" class="gx-count">0</span>
            </button>
            <button id="changeTabStaged" class="gx-change-subtab" data-action="changeSubTab" data-change-tab="staged" role="tab" type="button">
              <span>Staged</span><span id="stagedCount" class="gx-count">0</span>
            </button>
            <button id="changeTabStashes" class="gx-change-subtab" data-action="changeSubTab" data-change-tab="stashes" role="tab" type="button">
              <span>Stashes</span><span id="stashCount" class="gx-count">0</span>
            </button>
          </div>

          <div id="changePaneWorking" class="gx-change-pane">
            <div class="gx-section-head gx-pane-toolbar">
              <span class="gx-section-title">Working</span>
              <span class="spacer"></span>
              <span class="gx-section-actions">
                <button id="unstagedSecurityBtn" class="gx-mini-action gx-mini-action-ai" data-action="securityReview" data-staged="0" title="Security review of unstaged changes" aria-label="Security review of unstaged changes" type="button">${ICONS.shieldAi}</button>
                <span class="gx-mini-sep"></span>
                <button id="discardSelectedBtn" class="gx-mini-action gx-danger hidden" data-action="discardSelected" title="Discard selected files" aria-label="Discard selected files" type="button">${ICONS.trash}</button>
                <button id="stageSelectedBtn" class="gx-mini-action" data-action="stageSelected" title="Stage selected files" aria-label="Stage selected files" type="button">${ICONS.plus}</button>
              </span>
            </div>
            <ul id="unstagedList" class="gx-files"></ul>
          </div>

          <div id="changePaneStaged" class="gx-change-pane hidden">
            <div class="gx-section-head gx-pane-toolbar">
              <span class="gx-section-title">Staged</span>
              <span class="spacer"></span>
              <span class="gx-section-actions">
                <button id="stagedSecurityBtn" class="gx-mini-action gx-mini-action-ai" data-action="securityReview" data-staged="1" title="Security review of staged changes" aria-label="Security review of staged changes" type="button">${ICONS.shieldAi}</button>
                <span class="gx-mini-sep"></span>
                <button id="stashBtn" class="gx-mini-action" data-action="stashStaged" title="Stash staged changes (git stash push --staged)" aria-label="Stash staged changes" type="button">${ICONS.stash}</button>
                <span class="gx-mini-sep"></span>
                <button id="unstageSelectedBtn" class="gx-mini-action" data-action="unstageSelected" title="Unstage selected files" aria-label="Unstage selected files" type="button">${ICONS.minus}</button>
              </span>
            </div>
            <ul id="stagedList" class="gx-files"></ul>
          </div>

          <div id="changePaneStashes" class="gx-change-pane hidden">
            <ul id="stashList" class="gx-stash-list"></ul>
          </div>
        </div>

        <div id="changesNotice" class="gx-bottom-notice"></div>
        <div id="commitCard" class="gx-card">
          <div id="commitPrefixRow" class="gx-field gx-prefix-field hidden">
            <label class="gx-label gx-label-row" for="commitPrefix">
              <span>Prefix</span>
              <button id="prefixRemoveBtn" class="gx-iconbtn gx-prefix-btn" data-action="removePrefix" title="Remove prefix" aria-label="Remove prefix" type="button">${icon("minus", "sm")}</button>
            </label>
            <input id="commitPrefix" type="text" placeholder="JIRA-123" maxlength="48" autocomplete="off" spellcheck="false" />
          </div>
          <div class="gx-field">
            <label class="gx-label gx-label-row" for="commitSummary">
              <span>Summary</span>
              <button id="prefixToggleBtn" class="gx-iconbtn gx-prefix-btn" data-action="enablePrefix" title="Prefix" aria-label="Prefix" type="button">${icon("plus", "sm")}</button>
            </label>
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
          <div id="amendBar" class="gx-amend-bar hidden">
            <span class="gx-amend-bar-label">${icon("commit", "sm")}<span>Amending last commit</span></span>
            <button class="gx-amend-cancel" data-action="cancelAmend" type="button">Cancel</button>
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
        <div id="rebaseBar" class="gx-rebase-bar hidden">
          <span class="gx-rebase-bar-label">${icon("rebase", "sm")}<span id="rebaseBarLabel">Rebasing</span></span>
          <div class="gx-rebase-bar-actions">
            <button id="rebaseContinueBtn" class="gx-btn gx-btn-primary" data-action="rebaseContinue" type="button">Continue Rebase</button>
            <button id="rebaseAbortBtn" class="gx-btn gx-btn-secondary" data-action="rebaseAbort" type="button">Abort</button>
          </div>
        </div>
      </div>

      <div id="panel-history" class="gx-panel hidden">
        <div class="gx-history-actions">
          <span id="historySelectedCount" class="gx-history-selected">0 selected</span>
          <span class="spacer"></span>
          <span class="gx-history-action-group">
            <button id="historySummaryBtn" class="gx-history-action gx-history-action-primary" data-action="summarizeSelectedCommits" title="AI summary for selected commits" aria-label="AI summary for selected commits" type="button">${ICONS.sparkle}<span>Summary</span></button>
            <button id="historySecurityBtn" class="gx-history-action gx-history-action-primary" data-action="securityReviewSelectedCommits" title="Security review for selected commits" aria-label="Security review for selected commits" type="button">${ICONS.shieldAi}<span>Security</span></button>
            <button id="historyClearBtn" class="gx-history-action gx-history-action-clear" data-action="clearCommitSelection" title="Clear selected commits" aria-label="Clear selected commits" type="button">${ICONS.minus}<span>Clear</span></button>
          </span>
        </div>
        <div class="gx-history-scroll">
          <ul id="commitList" class="gx-commits"></ul>
        </div>
      </div>

      <div id="panel-branches" class="gx-panel hidden">
        <div class="gx-branch-scroll">
          <div class="gx-branch-filter-wrap">
            <span class="gx-branch-filter-icon">${icon("search", "sm")}</span>
            <input id="branchFilter" type="text" class="gx-branch-filter" placeholder="Filter branches" autocomplete="off" spellcheck="false" />
          </div>
          <ul id="branchList" class="gx-branch-list"></ul>
        </div>
        <div class="gx-newbranch">
          <input id="newBranchInput" type="text" placeholder="New branch name" autocomplete="off" spellcheck="false" />
          <button class="gx-btn gx-btn-primary" data-action="createBranchNamed" title="Create and switch to new branch" aria-label="Create and switch to new branch" type="button">${icon("plus", "sm")}<span>Create</span></button>
        </div>
      </div>

      <div id="panel-settings" class="gx-panel hidden">
        <div class="gx-settings-subtabs">
          <button id="settingsTabAi" class="gx-change-subtab active" data-action="switchSettingsTab" data-settings-tab="ai" type="button">AI Provider</button>
          <button id="settingsTabJira" class="gx-change-subtab" data-action="switchSettingsTab" data-settings-tab="jira" type="button">Jira</button>
          <button id="settingsTabConfig" class="gx-change-subtab" data-action="switchSettingsTab" data-settings-tab="config" type="button">Config</button>
        </div>
        <div id="settingsPaneAi">
          <div class="gx-field">
            <label class="gx-label">AI Provider</label>
            <div id="providerSlot"></div>
          </div>
          <div class="gx-field">
            <label class="gx-label gx-label-row" for="apiKeyInput">
              <span>API Key</span>
              <a id="apiKeyLink" class="gx-ext-link" href="#" target="_blank" tabindex="-1">Generate ↗</a>
            </label>
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
        <div id="settingsPaneConfig" class="hidden">
          <div class="gx-field">
            <div class="gx-config-toggle-row">
              <span class="gx-label gx-label-info gx-label-no-margin">
                <span>Jira Integration</span>
                <span class="gx-info-icon gx-ic sm" title="Shows the Jira icon and settings tab when enabled.">${ICONS.info}</span>
              </span>
              <button id="jiraToggleBtn" class="gx-toggle" data-action="toggleJira" type="button" aria-pressed="false">
                <span class="gx-toggle-thumb"></span>
              </button>
            </div>
          </div>
          <div class="gx-field">
            <label class="gx-label gx-label-info">
              <span>File View</span>
              <span class="gx-info-icon gx-ic sm" title="How files are displayed in the Changes and Staged tabs.">${ICONS.info}</span>
            </label>
            <div class="gx-file-view-picker">
              <button id="fileViewFlat" class="gx-file-view-btn" data-action="setFileView" data-view="flat" type="button">Flat</button>
              <button id="fileViewTree" class="gx-file-view-btn" data-action="setFileView" data-view="tree" type="button">Tree</button>
            </div>
          </div>
          <div class="gx-field">
            <label class="gx-label gx-label-info">
              <span>AI Token Budget</span>
              <span class="gx-info-icon gx-ic sm" title="Controls how much diff is sent per AI call. Low~10k · Mid~40k · High~80k chars.">${ICONS.info}</span>
            </label>
            <div class="gx-budget-table">
              <span class="gx-budget-label">Commit message</span>
              <div class="gx-budget-btns" data-budget-feature="commit">
                <button class="gx-budget-btn" data-action="setTokenBudget" data-feature="commit" data-preset="low" title="~10,000 chars of diff" type="button">Low</button>
                <button class="gx-budget-btn" data-action="setTokenBudget" data-feature="commit" data-preset="mid" title="~40,000 chars of diff" type="button">Mid</button>
                <button class="gx-budget-btn" data-action="setTokenBudget" data-feature="commit" data-preset="high" title="~80,000 chars of diff" type="button">High</button>
              </div>
              <span class="gx-budget-label">AI summary</span>
              <div class="gx-budget-btns" data-budget-feature="summary">
                <button class="gx-budget-btn" data-action="setTokenBudget" data-feature="summary" data-preset="low" title="~10,000 chars of diff" type="button">Low</button>
                <button class="gx-budget-btn" data-action="setTokenBudget" data-feature="summary" data-preset="mid" title="~40,000 chars of diff" type="button">Mid</button>
                <button class="gx-budget-btn" data-action="setTokenBudget" data-feature="summary" data-preset="high" title="~80,000 chars of diff" type="button">High</button>
              </div>
              <span class="gx-budget-label">Security review</span>
              <div class="gx-budget-btns" data-budget-feature="security">
                <button class="gx-budget-btn" data-action="setTokenBudget" data-feature="security" data-preset="low" title="~10,000 chars of diff" type="button">Low</button>
                <button class="gx-budget-btn" data-action="setTokenBudget" data-feature="security" data-preset="mid" title="~40,000 chars of diff" type="button">Mid</button>
                <button class="gx-budget-btn" data-action="setTokenBudget" data-feature="security" data-preset="high" title="~80,000 chars of diff" type="button">High</button>
              </div>
            </div>
          </div>
        </div>
        <div id="settingsPaneJira" class="hidden">
          <div class="gx-field">
            <label class="gx-label" for="jiraBaseUrlInput">Jira Base URL</label>
            <input id="jiraBaseUrlInput" type="text" placeholder="https://yourcompany.atlassian.net" autocomplete="off" spellcheck="false" />
          </div>
          <div class="gx-field">
            <label class="gx-label" for="jiraEmailInput">Email</label>
            <input id="jiraEmailInput" type="text" placeholder="you@company.com" autocomplete="off" spellcheck="false" />
          </div>
          <div class="gx-field">
            <label class="gx-label gx-label-row" for="jiraTokenInput">
              <span>API Token</span>
              <a class="gx-ext-link" href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" tabindex="-1">Generate ↗</a>
            </label>
            <input id="jiraTokenInput" type="password" placeholder="Paste your Jira API token" autocomplete="off" spellcheck="false" />
          </div>
          <div class="gx-actions">
            <button id="saveJiraBtn" class="gx-btn gx-btn-primary" data-action="saveJiraConfig" type="button" disabled>${icon("lock")}<span>Save &amp; Validate</span></button>
          </div>
          <div id="jiraSettingsStatus" class="gx-status-line"></div>
          <div class="gx-privacy">
            ${icon("lock")}
            <span>API token stored in VS Code SecretStorage. Base URL and email saved in extension state.</span>
          </div>
        </div>
      </div>

      <div id="panel-reports" class="gx-panel hidden">
        <div id="reportsContent"></div>
      </div>

      <div id="panel-jira" class="gx-panel hidden">
        <div class="gx-jira-search-row">
          <div class="gx-jira-search-wrap">
            <span class="gx-jira-search-icon">${icon("search", "sm")}</span>
            <input id="jiraSearchInput" type="text" placeholder="Search your issues…" autocomplete="off" spellcheck="false" />
          </div>
          <button class="gx-iconbtn" data-action="refreshJira" title="Refresh" aria-label="Refresh" type="button">${icon("refresh", "sm")}</button>
        </div>
        <div class="gx-jira-table">
          <div id="jiraListHeader" class="gx-jira-list-header">
            <button class="gx-jira-col-hdr" data-action="sortJira" data-col="key" type="button"><span>Jira ID</span><span class="gx-sort-ind"></span></button>
            <button class="gx-jira-col-hdr" data-action="sortJira" data-col="summary" type="button"><span>Description</span><span class="gx-sort-ind"></span></button>
            <button class="gx-jira-col-hdr" data-action="sortJira" data-col="status" type="button"><span>Status</span><span class="gx-sort-ind"></span></button>
            <span></span>
          </div>
          <div id="jiraContent"></div>
        </div>
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
      <div id="jiraIssueMenu" class="gx-context-menu hidden" role="menu">
        <button data-jira-action="usePrefix" role="menuitem" type="button">${icon("tag", "sm")}<span>Use as commit prefix</span></button>
        <button data-jira-action="createBranch" role="menuitem" type="button">${icon("branch", "sm")}<span>Create branch</span></button>
        <span class="gx-menu-sep"></span>
        <button data-jira-action="openInJira" role="menuitem" type="button">${icon("externalLink", "sm")}<span>Open in Jira</span></button>
      </div>
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

    // Jira settings inputs: enable Save & Validate when all three fields have content
    ["jiraBaseUrlInput", "jiraEmailInput", "jiraTokenInput"].forEach((id) => {
      byId(id).addEventListener("input", () => {
        const hasUrl = /** @type {HTMLInputElement} */ (byId("jiraBaseUrlInput")).value.trim().length > 0;
        const hasEmail = /** @type {HTMLInputElement} */ (byId("jiraEmailInput")).value.trim().length > 0;
        const hasToken = /** @type {HTMLInputElement} */ (byId("jiraTokenInput")).value.trim().length > 0 || ui.state.jiraHasToken;
        setDisabled(byId("saveJiraBtn"), !(hasUrl && hasEmail && hasToken));
      });
    });

    // Jira search: debounce 300ms
    byId("jiraSearchInput").addEventListener("input", () => {
      renderJira();
    });

    // Branches tab: filter (client-side) + create-on-Enter
    byId("branchFilter").addEventListener("input", (e) => {
      ui.branchFilter = e.target.value;
      renderBranches(ui.state);
    });
    byId("newBranchInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAction("createBranchNamed");
    });
    byId("commitPrefix").addEventListener("input", (e) => {
      ui.commitPrefix.value = e.target.value;
      persistCommitPrefix();
      updatePrefixUi();
    });
    byId("commitPrefix").addEventListener("keydown", (e) => {
      if (e.key === "Enter") byId("commitSummary").focus();
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
        const act = target.getAttribute("data-action");
        if (act === "openStashMenu" || act === "openJiraIssueMenu") {
          e.stopPropagation();
        }
        handleAction(act, target, e);
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

    const jiraMenu = byId("jiraIssueMenu");
    jiraMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-jira-action]");
      if (!item) return;
      e.stopPropagation();
      handleJiraMenuAction(item.getAttribute("data-jira-action"));
    });

    document.addEventListener("click", closeAllMenus);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllMenus(); });
    window.addEventListener("resize", closeAllMenus);
    window.addEventListener("scroll", closeAllMenus, true);

    // Checkbox selection for bulk stage/unstage/discard actions.
    [byId("stagedList"), byId("unstagedList")].forEach((listEl) => {
      listEl.addEventListener("change", (e) => {
        const box = e.target;
        if (!box.classList.contains("gx-check")) return;
        const isStaged = box.getAttribute("data-staged") === "1";

        if (box.classList.contains("gx-folder-check")) {
          // Select/deselect all descendant files
          const folderLi = box.closest(".gx-tree-folder");
          if (folderLi) {
            folderLi.querySelectorAll(".gx-check:not(.gx-folder-check)").forEach((fileBox) => {
              const filePath = fileBox.getAttribute("data-path");
              if (!filePath) return;
              const key = selectionKey(filePath, isStaged);
              if (box.checked) { ui.selected.add(key); fileBox.checked = true; }
              else { ui.selected.delete(key); fileBox.checked = false; }
            });
          }
          applyFolderIndeterminate(listEl, isStaged);
          updateChangeActionButtons(ui.state);
          return;
        }

        const path = box.getAttribute("data-path");
        if (!path) return;
        const key = selectionKey(path, isStaged);
        if (box.checked) ui.selected.add(key);
        else ui.selected.delete(key);
        applyFolderIndeterminate(listEl, isStaged);
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
    ["changes", "history", "branches", "settings", "reports", "jira"].forEach((name) => {
      byId("panel-" + name).classList.toggle("hidden", name !== tab);
    });
  }

  function switchChangeTab(tab, shouldRender = true) {
    if (!["working", "staged", "stashes"].includes(tab)) return;
    ui.activeChangeTab = tab;
    if (shouldRender) render();
  }

  function handleAction(action, elm, event) {
    const s = ui.state;
    switch (action) {
      case "stageAll":
        switchChangeTab("staged");
        post({ type: "stageAll", count: (s.changes.unstaged || []).length });
        break;
      case "unstageAll":
        switchChangeTab("working");
        post({ type: "unstageAll", count: (s.changes.staged || []).length });
        break;
      case "stageSelected": {
        const paths = selectedPaths(s.changes.unstaged, false);
        if (paths.length) {
          switchChangeTab("staged");
          post({ type: "stageFiles", filePaths: paths });
        }
        break;
      }
      case "discardSelected": {
        const paths = selectedPaths(s.changes.unstaged, false);
        if (paths.length) post({ type: "discardFiles", filePaths: paths, staged: false });
        break;
      }
      case "unstageSelected": {
        const paths = selectedPaths(s.changes.staged, true);
        if (paths.length) {
          switchChangeTab("working");
          post({ type: "unstageFiles", filePaths: paths });
        }
        break;
      }
      case "stageOne":
        switchChangeTab("staged");
        post({ type: "stageFile", filePath: elm.getAttribute("data-path") });
        break;
      case "unstageOne":
        switchChangeTab("working");
        post({ type: "unstageFile", filePath: elm.getAttribute("data-path") });
        break;
      case "cancelAmend":
        ui.amendMode = false;
        /** @type {HTMLInputElement} */ (byId("commitSummary")).value = "";
        /** @type {HTMLTextAreaElement} */ (byId("commitDescription")).value = "";
        render();
        break;
      case "undoLastCommit":
        post({ type: "undoLastCommit" });
        break;
      case "rebaseContinue":
        post({ type: "rebaseContinue" });
        break;
      case "rebaseAbort":
        post({ type: "rebaseAbort" });
        break;
      case "discardOne":
        post({ type: "discardFiles", filePaths: [elm.getAttribute("data-path")], staged: elm.getAttribute("data-staged") === "1" });
        break;
      case "generate":
        if (ui.activeChangeTab !== "staged") return;
        post({ type: "generateCommitMessage", maxChars: getMaxChars("commit") });
        break;
      case "commit": {
        if (ui.activeChangeTab !== "staged") return;
        const rawSummary = /** @type {HTMLInputElement} */ (byId("commitSummary")).value.trim();
        const description = /** @type {HTMLTextAreaElement} */ (byId("commitDescription")).value.trim();
        if (!rawSummary) {
          flashNotice("Please enter a commit summary.", "error");
          return;
        }
        const summary = applyCommitPrefix(rawSummary);
        const isAmend = ui.amendMode;
        if (isAmend) {
          post({ type: "amend", summary, description });
        } else {
          post({ type: "commit", summary, description });
        }
        break;
      }
      case "enablePrefix":
        ui.commitPrefix.enabled = true;
        persistCommitPrefix();
        updatePrefixUi();
        byId("commitPrefix").focus();
        break;
      case "removePrefix":
        ui.commitPrefix.enabled = false;
        ui.commitPrefix.value = "";
        persistCommitPrefix();
        updatePrefixUi();
        byId("commitSummary").focus();
        break;
      case "saveAndValidate": {
        const apiKey = /** @type {HTMLInputElement} */ (byId("apiKeyInput")).value.trim();
        const provider = ui.dd.provider.getValue();
        post({ type: "saveAndValidate", provider, apiKey: apiKey || undefined });
        break;
      }
      case "refreshModels":
        post({ type: "fetchModels", provider: ui.dd.provider.getValue() });
        break;
      case "pullSync": {
        const s = ui.state;
        if (s.syncAction) break;
        // Behind → pull (host prompts merge/rebase if also diverged); otherwise fetch.
        if (s.hasUpstream && s.behind > 0) {
          post({ type: "pull" });
        } else {
          post({ type: "fetchOrigin" });
        }
        break;
      }
      case "pushSync": {
        const s = ui.state;
        if (s.syncAction) break;
        if (!s.hasUpstream || s.ahead > 0) {
          post({ type: "push" }); // publish when no upstream; push also pushes pending tags
        } else if (s.pendingTagCount > 0) {
          post({ type: "pushTags" });
        }
        break;
      }
      case "stashStaged":
        switchChangeTab("stashes");
        post({ type: "stashStaged" });
        break;
      case "stashPop":
        switchChangeTab("working");
        post({ type: "stashPop", ref: elm.getAttribute("data-ref") });
        break;
      case "changeSubTab":
        switchChangeTab(elm.getAttribute("data-change-tab") || "working");
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
      case "switchSettingsTab": {
        const stab = elm.getAttribute("data-settings-tab") || "ai";
        ui.activeSettingsTab = stab;
        byId("settingsTabAi").classList.toggle("active", stab === "ai");
        byId("settingsTabJira").classList.toggle("active", stab === "jira");
        byId("settingsTabConfig").classList.toggle("active", stab === "config");
        byId("settingsPaneAi").classList.toggle("hidden", stab !== "ai");
        byId("settingsPaneJira").classList.toggle("hidden", stab !== "jira");
        byId("settingsPaneConfig").classList.toggle("hidden", stab !== "config");
        if (stab === "config") { updateConfigUi(); }
        break;
      }
      case "toggleJira": {
        ui.config.jiraEnabled = !ui.config.jiraEnabled;
        saveConfig(ui.config);
        updateJiraVisibility();
        updateConfigUi();
        break;
      }
      case "setTokenBudget": {
        const feature = elm.getAttribute("data-feature");
        const preset = elm.getAttribute("data-preset");
        if (feature && preset) {
          ui.config.budgets[feature] = preset;
          saveConfig(ui.config);
          updateConfigUi();
        }
        break;
      }
      case "setFileView": {
        const view = elm.getAttribute("data-view");
        if (view === "flat" || view === "tree") {
          ui.config.fileView = view;
          saveConfig(ui.config);
          updateConfigUi();
          render();
        }
        break;
      }
      case "toggleFolder": {
        const folderPath = elm.getAttribute("data-folder-path");
        if (!folderPath) break;
        if (ui.collapsedFolders.has(folderPath)) {
          ui.collapsedFolders.delete(folderPath);
        } else {
          ui.collapsedFolders.add(folderPath);
        }
        render();
        break;
      }
      case "openReports":
        switchTab("reports");
        post({ type: "getReports" });
        renderReports(null);
        break;
      case "openJira":
        if (!ui.config.jiraEnabled) break;
        switchTab("jira");
        if (ui.jiraIssues === null && !ui.jiraLoading) {
          ui.jiraLoading = true;
          renderJira();
          post({ type: "fetchJiraIssues", query: "" });
        }
        break;
      case "refreshJira":
        ui.jiraLoading = true;
        ui.jiraError = "";
        renderJira();
        post({ type: "fetchJiraIssues", query: "" });
        break;
      case "sortJira": {
        const col = elm.getAttribute("data-col") || "";
        if (ui.jiraSort.col === col) {
          if (ui.jiraSort.dir === "asc") {
            ui.jiraSort.dir = "desc";
          } else {
            ui.jiraSort.col = null;
            ui.jiraSort.dir = "asc";
          }
        } else {
          ui.jiraSort.col = col;
          ui.jiraSort.dir = "asc";
        }
        renderJira();
        break;
      }
      case "saveJiraConfig": {
        const baseUrl = (/** @type {HTMLInputElement} */ (byId("jiraBaseUrlInput"))).value.trim();
        const email = (/** @type {HTMLInputElement} */ (byId("jiraEmailInput"))).value.trim();
        const token = (/** @type {HTMLInputElement} */ (byId("jiraTokenInput"))).value.trim();
        byId("jiraSettingsStatus").innerHTML = `<span class="gx-spin"></span><span>Validating…</span>`;
        setDisabled(byId("saveJiraBtn"), true);
        post({ type: "saveJiraConfig", baseUrl, email, token });
        break;
      }
      case "openJiraIssueMenu": {
        const key = elm.getAttribute("data-jira-key") || "";
        const summary = elm.getAttribute("data-jira-summary") || "";
        const isOpen = elm.getAttribute("aria-expanded") === "true";
        if (isOpen) {
          closeJiraMenu();
          break;
        }
        const rect = elm.getBoundingClientRect();
        if (key) openJiraMenu(key, summary, rect.right, rect.bottom + 4, true, elm);
        break;
      }
      case "toggleCommitSelection":
        toggleCommitSelection(elm.getAttribute("data-hash"), !!(event && event.shiftKey));
        break;
      case "summarizeSelectedCommits": {
        const commits = selectedCommitPayload();
        if (!commits.length) return;
        const label = selectedCommitLabel(commits);
        ui.activeSummary = { hash: label, subject: commitSubjectsLabel(commits), loading: true };
        byId("panel-summary").classList.remove("hidden");
        startAiProgress(SUMMARY_MESSAGES, ui.summaryProgress, renderSummaryPanel);
        post({ type: "summarizeCommits", commits, maxChars: getMaxChars("summary") });
        break;
      }
      case "securityReviewSelectedCommits": {
        const commits = selectedCommitPayload();
        if (!commits.length) return;
        ui.activeSecurityReview = { staged: false, scope: selectedCommitLabel(commits), loading: true };
        byId("panel-security").classList.remove("hidden");
        startAiProgress(SECURITY_MESSAGES, ui.securityProgress, renderSecurityPanel);
        post({ type: "securityReviewCommits", commits, maxChars: getMaxChars("security") });
        break;
      }
      case "clearCommitSelection":
        ui.selectedCommits.clear();
        ui.historyAnchorHash = "";
        renderHistory(ui.state);
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
        startAiProgress(SUMMARY_MESSAGES, ui.summaryProgress, renderSummaryPanel);
        post({ type: "summarizeCommit", hash, subject, maxChars: getMaxChars("summary") });
        break;
      }
      case "closeSummary":
        stopAiProgress(ui.summaryProgress);
        ui.activeSummary = null;
        byId("panel-summary").classList.add("hidden");
        break;
      case "securityReview": {
        const staged = elm.getAttribute("data-staged") === "1";
        ui.activeSecurityReview = { staged, loading: true };
        byId("panel-security").classList.remove("hidden");
        startAiProgress(SECURITY_MESSAGES, ui.securityProgress, renderSecurityPanel);
        post({ type: "securityReview", staged, maxChars: getMaxChars("security") });
        break;
      }
      case "closeSecurityReview":
        stopAiProgress(ui.securityProgress);
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
    const history = ui.state.history || [];
    const commit = history.find((c) => c.hash === hash);
    const isHead = history.length > 0 && history[0].hash === hash;
    // The latest commit can be dropped entirely (reset --soft) only while it is
    // still local — i.e. it is part of the unpushed ahead range.
    const isUnpushedHead = isHead && (ui.state.ahead || 0) > 0;
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
      (isHead ? `<button data-cmenu-action="amendCommit" role="menuitem" type="button">${icon("commit", "sm")}<span>Amend commit…</span></button>` : "") +
      (isUnpushedHead ? `<button data-cmenu-action="undoCommit" role="menuitem" type="button">${icon("undo", "sm")}<span>Undo commit (drop)</span></button>` : "") +
      (isHead ? `<span class="gx-menu-sep"></span>` : "") +
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
      case "undoCommit":
        // Drop the latest (unpushed) commit, returning its changes to staged.
        switchTab("changes");
        switchChangeTab("staged", false);
        post({ type: "undoLastCommit" });
        break;
      case "revertCommit":
        post({ type: "revertCommit", hash: commit.hash });
        break;
      case "cherryPickCommit":
        post({ type: "cherryPickCommit", hash: commit.hash });
        break;
      case "amendCommit": {
        const lc = ui.state.lastCommit;
        switchTab("changes");
        switchChangeTab("staged", false);
        if (lc) {
          /** @type {HTMLInputElement} */ (byId("commitSummary")).value = lc.summary || "";
          /** @type {HTMLTextAreaElement} */ (byId("commitDescription")).value = lc.description || "";
        }
        ui.amendMode = true;
        render();
        byId("commitSummary").focus();
        break;
      }
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
      (isCurrent
        ? `<button data-bmenu-action="setUpstream" role="menuitem" type="button">${icon("push", "sm")}<span>Set upstream…</span></button>`
        : "") +
      (!isCurrent
        ? `<span class="gx-menu-sep"></span>` +
          `<button data-bmenu-action="mergeBranch" role="menuitem" type="button">${icon("merge", "sm")}<span>Merge into current</span></button>` +
          `<button data-bmenu-action="rebaseBranch" role="menuitem" type="button">${icon("rebase", "sm")}<span>Rebase onto this</span></button>` +
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
      case "setUpstream":
        post({ type: "setUpstream", name: branch.name });
        break;
      case "mergeBranch":
        post({ type: "mergeBranch", name: branch.name });
        break;
      case "rebaseBranch":
        post({ type: "rebaseBranch", name: branch.name });
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
    if (action === "stashApply") {
      switchChangeTab("working");
      post({ type: "stashApply", ref });
    } else if (action === "stashDrop") post({ type: "stashDrop", ref });
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
    elm.removeAttribute("title");
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
    const partialPaths = partialFilePaths(stagedFiles, unstagedFiles);
    byId("stagedList").innerHTML = renderFileList(stagedFiles, true, partialPaths);
    byId("unstagedList").innerHTML = renderFileList(unstagedFiles, false, partialPaths);
    byId("stagedCount").textContent = String(stagedFiles.length);
    byId("unstagedCount").textContent = String(unstagedFiles.length);
    if (ui.config.fileView === "tree") {
      applyFolderIndeterminate(byId("stagedList"), true);
      applyFolderIndeterminate(byId("unstagedList"), false);
    }

    // Conflicts section
    const conflicts = (s.changes && s.changes.conflicts) || [];
    const hasConflicts = conflicts.length > 0;
    const rebase = s.rebaseState || { inProgress: false };
    const conflictsBanner = byId("conflictsBanner");
    const conflictsSection = byId("conflictsSection");
    if (hasConflicts) {
      conflictsBanner.classList.remove("hidden");
      byId("conflictsBannerText").textContent = rebase.inProgress
        ? `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} — resolve all to continue rebase`
        : `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} — resolve all before committing`;
      conflictsSection.classList.remove("hidden");
      byId("conflictsCount").textContent = String(conflicts.length);
      byId("conflictsList").innerHTML = renderConflictList(conflicts);
    } else {
      conflictsBanner.classList.add("hidden");
      conflictsSection.classList.add("hidden");
    }

    // Rebase action bar (replaces commit button area when rebase is in progress)
    const rebaseBar = byId("rebaseBar");
    if (rebase.inProgress) {
      rebaseBar.classList.remove("hidden");
      const label = rebase.onto ? `onto ${rebase.onto}` : "";
      byId("rebaseBarLabel").textContent = `Rebasing${label ? " " + label : ""}`;
      setDisabled(byId("rebaseContinueBtn"), busy || hasConflicts);
      setDisabled(byId("rebaseAbortBtn"), busy);
    } else {
      rebaseBar.classList.add("hidden");
    }

    // Stash section
    const stashes = s.stashes || [];
    byId("stashList").innerHTML = renderStashList(stashes);
    const stashCountEl = byId("stashCount");
    stashCountEl.textContent = String(stashes.length);
    renderChangeSubTabs();

    const busy = !!s.isLoading;
    const hasStaged = stagedFiles.length > 0;
    const commitPanelActive = ui.activeChangeTab === "staged";
    const provLabel = (PROVIDERS.find((p) => p.value === s.provider) || {}).label || s.provider;
    const genBtn = byId("generateBtn");
    const generateHint = hasConflicts
      ? "Resolve all conflicts before generating a commit message"
      : !commitPanelActive
        ? "Open Staged to generate a commit message"
        : hasStaged
        ? `Generate commit message with ${provLabel}${s.model ? " · " + s.model : " · select a model first"}`
        : "Stage files to generate an AI commit message";
    genBtn.innerHTML =
      `<span class="gx-vsep"></span>` +
      (s.busyKind === "generate"
        ? `<span class="gx-spin"></span>`
        : `<span class="gx-ic">${ICONS.sparkle}</span>`);
    setHint(genBtn, generateHint);
    setDisabled(genBtn, busy || !commitPanelActive || !hasStaged || hasConflicts);
    const isAmend = ui.amendMode && !!s.lastCommit && !rebase.inProgress;
    if (!isAmend && ui.amendMode) ui.amendMode = false;
    byId("amendBar").classList.toggle("hidden", !isAmend || !commitPanelActive);

    const commitBtn = byId("commitBtn");
    const branch = s.branchName ? " to " + escapeHtml(s.branchName) : "";
    commitBtn.innerHTML = isAmend
      ? `${icon("commit")}<span>Amend commit</span>`
      : `${icon("commit")}<span>Commit${branch}</span>`;
    const canSubmit = isAmend ? !hasConflicts && !rebase.inProgress : hasStaged && !hasConflicts && !rebase.inProgress;
    setHint(
      commitBtn,
      hasConflicts
        ? `Resolve ${plural(conflicts.length, "conflict")} before committing`
        : !commitPanelActive
          ? "Open Staged to commit"
        : isAmend
          ? `Amend last commit on ${s.branchName || "current branch"}`
          : hasStaged
            ? `Commit ${plural(stagedFiles.length, "staged file")} to ${s.branchName || "current branch"}`
            : "Stage files before committing"
    );
    setDisabled(commitBtn, busy || !commitPanelActive || !canSubmit);
    byId("commitCard").classList.toggle("hidden", !commitPanelActive || rebase.inProgress);
    setInputDisabled(byId("commitPrefix"), busy);
    setInputDisabled(byId("commitSummary"), busy);
    setInputDisabled(byId("commitDescription"), busy);
    setDisabled(byId("prefixToggleBtn"), busy);
    setDisabled(byId("prefixRemoveBtn"), busy);
    updatePrefixUi();
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
    dedupeNativeTitles();
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
    const stageSelected = byId("stageSelectedBtn");
    const discardSelected = byId("discardSelectedBtn");
    setHint(
      unstageSelected,
      selectedStaged ? `Unstage ${plural(selectedStaged, "selected file")}` : "Uncheck files above to keep them staged"
    );
    setHint(
      stageSelected,
      selectedUnstaged ? `Stage ${plural(selectedUnstaged, "selected file")}` : "Uncheck files above to exclude from staging"
    );
    setHint(
      discardSelected,
      selectedUnstaged ? `Discard ${plural(selectedUnstaged, "selected file")}` : "Select changed files to discard"
    );
    setDisabled(unstageSelected, busy || selectedStaged === 0);
    setDisabled(stageSelected, busy || selectedUnstaged === 0);
    discardSelected.classList.toggle("hidden", selectedUnstaged === 0);
    setDisabled(discardSelected, busy || selectedUnstaged === 0);
  }

  function renderChangeSubTabs() {
    const active = ui.activeChangeTab || "working";
    [
      ["working", byId("changeTabWorking"), byId("changePaneWorking")],
      ["staged", byId("changeTabStaged"), byId("changePaneStaged")],
      ["stashes", byId("changeTabStashes"), byId("changePaneStashes")]
    ].forEach(([name, tab, pane]) => {
      const isActive = name === active;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      pane.classList.toggle("hidden", !isActive);
    });
  }

  function partialFilePaths(stagedFiles, unstagedFiles) {
    const unstaged = new Set((unstagedFiles || []).map((file) => file.path));
    return new Set((stagedFiles || []).filter((file) => unstaged.has(file.path)).map((file) => file.path));
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

  // Split Pull (incoming) and Push (outgoing) buttons. Ahead and behind are
  // independent dimensions, so a diverged branch lights up BOTH simultaneously —
  // something the old single combo button could not represent.
  function updateSync(s) {
    const pullBtn = byId("pullBtn");
    const pullIcon = byId("pullIcon");
    const pullBadge = byId("pullBadge");
    const pushBtn = byId("pushBtn");
    const pushIcon = byId("pushIcon");
    const pushBadge = byId("pushBadge");
    const pendingTags = s.pendingTagCount || 0;
    const syncAction = s.syncAction || "";
    const fetchedText = timeAgo(s.lastFetchedAt || 0);

    const setBadge = (el, html) => {
      if (html) { el.innerHTML = html; el.classList.remove("hidden"); }
      else { el.innerHTML = ""; el.classList.add("hidden"); }
    };

    // Busy: show the spinner on whichever button owns the running operation.
    if (syncAction) {
      const action = syncAction.toLowerCase();
      const onPush = action.includes("push") || action.includes("publish");
      const spin = `<span class="gx-spin"></span>`;
      pullIcon.innerHTML = onPush ? ICONS.pull : spin;
      pushIcon.innerHTML = onPush ? spin : ICONS.push;
      pullBtn.title = pushBtn.title = "Hang on…";
      setBadge(pullBadge, "");
      setBadge(pushBadge, "");
      setDisabled(pullBtn, true);
      setDisabled(pushBtn, true);
      return;
    }

    const blocked = !!s.isLoading || !s.branchName;

    // ---- Pull / incoming button -------------------------------------------
    if (s.hasUpstream && s.behind > 0) {
      pullIcon.innerHTML = ICONS.pull;
      pullBtn.title = `Pull ${s.behind} commit${s.behind > 1 ? "s" : ""} from origin`;
      setBadge(pullBadge, `${s.behind}${BADGE_DOWN}`);
    } else {
      // Up to date or no upstream — the incoming button fetches.
      pullIcon.innerHTML = ICONS.refresh;
      pullBtn.title = fetchedText || "Fetch origin";
      setBadge(pullBadge, "");
    }
    setDisabled(pullBtn, blocked);

    // ---- Push / outgoing button -------------------------------------------
    pushIcon.innerHTML = ICONS.push;
    if (!s.hasUpstream) {
      pushBtn.title = "Publish branch to origin";
      setBadge(pushBadge, "");
      setDisabled(pushBtn, blocked);
    } else if (s.ahead > 0) {
      pushBtn.title = pendingTags > 0
        ? `Push ${s.ahead} commit${s.ahead > 1 ? "s" : ""} + ${pendingTags} tag${pendingTags > 1 ? "s" : ""}`
        : `Push ${s.ahead} commit${s.ahead > 1 ? "s" : ""} to origin`;
      setBadge(pushBadge, pendingTags > 0
        ? `${s.ahead}${BADGE_UP}<span class="gx-badge-sep">·</span>${pendingTags}${BADGE_TAG}`
        : `${s.ahead}${BADGE_UP}`);
      setDisabled(pushBtn, blocked);
    } else if (pendingTags > 0) {
      pushBtn.title = `Push ${pendingTags} unpushed tag${pendingTags > 1 ? "s" : ""} to origin`;
      setBadge(pushBadge, `${pendingTags}${BADGE_TAG}`);
      setDisabled(pushBtn, blocked);
    } else {
      pushBtn.title = "Nothing to push";
      setBadge(pushBadge, "");
      setDisabled(pushBtn, true);
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
    const label = statusLabel(status);
    if (status === "X") {
      return `<span class="gx-stat gx-stat-X" data-tooltip="${label}" aria-label="${label}">${ICONS.conflict}</span>`;
    }
    if (status === "A" || status === "U") {
      return `<span class="gx-stat gx-stat-A" data-tooltip="${label}" aria-label="${label}">${ICONS.plus}</span>`;
    }
    if (status === "D") {
      return `<span class="gx-stat gx-stat-D" data-tooltip="${label}" aria-label="${label}">${ICONS.minus}</span>`;
    }
    if (status === "R" || status === "C") {
      return `<span class="gx-stat gx-stat-R" data-tooltip="${label}" aria-label="${label}">${ICONS.dot}</span>`;
    }
    return `<span class="gx-stat gx-stat-M" data-tooltip="${label}" aria-label="${label}">${ICONS.dot}</span>`;
  }

  function statusLabel(status) {
    if (status === "X") return "Conflict";
    if (status === "U") return "Untracked";
    if (status === "A") return "Added";
    if (status === "D") return "Deleted";
    if (status === "R") return "Renamed";
    if (status === "C") return "Copied";
    return "Modified";
  }

  // ---------- Tree view helpers ----------
  function buildFileTree(files) {
    const root = [];
    const dirs = new Map();

    function getOrCreateDir(dirPath) {
      if (dirs.has(dirPath)) return dirs.get(dirPath);
      const parts = dirPath.split("/");
      const name = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join("/");
      const node = { type: "folder", name, path: dirPath, children: [] };
      dirs.set(dirPath, node);
      if (parentPath) {
        getOrCreateDir(parentPath).children.push(node);
      } else {
        root.push(node);
      }
      return node;
    }

    files.forEach((f) => {
      const parts = f.path.split("/");
      if (parts.length === 1) {
        root.push({ type: "file", name: parts[0], file: f });
      } else {
        const dirPath = parts.slice(0, -1).join("/");
        getOrCreateDir(dirPath).children.push({ type: "file", name: parts[parts.length - 1], file: f });
      }
    });

    return root;
  }

  function getAllFilesInFolder(node) {
    const files = [];
    function walk(n) {
      if (n.type === "file") files.push(n.file);
      else (n.children || []).forEach(walk);
    }
    walk(node);
    return files;
  }

  function renderFileTree(nodes, isStaged, partialPaths) {
    return nodes.map((node) => {
      if (node.type === "file") {
        return renderFile(node.file, isStaged, partialPaths && partialPaths.has(node.file.path), true);
      }
      const collapsed = ui.collapsedFolders.has(node.path);
      const folderFiles = getAllFilesInFolder(node);
      const selectedCount = folderFiles.filter((f) => ui.selected.has(selectionKey(f.path, isStaged))).length;
      const allSelected = folderFiles.length > 0 && selectedCount === folderFiles.length;
      return `
        <li class="gx-tree-folder" data-folder-path="${escapeHtml(node.path)}" data-staged="${isStaged ? 1 : 0}">
          <div class="gx-tree-folder-row">
            <input type="checkbox" class="gx-check gx-folder-check" data-folder-path="${escapeHtml(node.path)}" data-staged="${isStaged ? 1 : 0}" ${allSelected ? "checked" : ""} title="Select all in ${escapeHtml(node.name)}" aria-label="Select all in ${escapeHtml(node.name)}" />
            <span class="gx-tree-chevron gx-ic sm${collapsed ? "" : " open"}" data-action="toggleFolder" data-folder-path="${escapeHtml(node.path)}" data-staged="${isStaged ? 1 : 0}">${ICONS.chevron}</span>
            <span class="gx-tree-folder-icon gx-ic sm">${ICONS.folder}</span>
            <span class="gx-tree-folder-name" data-action="toggleFolder" data-folder-path="${escapeHtml(node.path)}" data-staged="${isStaged ? 1 : 0}">${escapeHtml(node.name)}</span>
          </div>
          ${!collapsed ? `<ul class="gx-tree-children">${renderFileTree(node.children, isStaged, partialPaths)}</ul>` : ""}
        </li>`;
    }).join("");
  }

  function applyFolderIndeterminate(listEl, isStaged) {
    listEl.querySelectorAll(".gx-tree-folder").forEach((folderLi) => {
      const folderBox = folderLi.querySelector(":scope > .gx-tree-folder-row > .gx-folder-check");
      if (!folderBox) return;
      // Collapsed folders have no .gx-tree-children — leave their checkbox state as-is
      if (!folderLi.querySelector(":scope > .gx-tree-children")) return;
      const fileBoxes = folderLi.querySelectorAll(".gx-check:not(.gx-folder-check)");
      const total = fileBoxes.length;
      if (total === 0) return;
      const checked = Array.from(fileBoxes).filter((b) => b.checked).length;
      if (checked === total) {
        folderBox.checked = true;
        folderBox.indeterminate = false;
      } else if (checked === 0) {
        folderBox.checked = false;
        folderBox.indeterminate = false;
      } else {
        folderBox.checked = false;
        folderBox.indeterminate = true;
      }
    });
  }
  // ---------- End tree view helpers ----------

  function renderFileList(files, isStaged, partialPaths) {
    if (!files || !files.length) {
      return `<li class="gx-empty">No files</li>`;
    }
    if (ui.config.fileView === "tree") {
      const tree = buildFileTree(files);
      return renderFileTree(tree, isStaged, partialPaths);
    }
    return files.map((f) => renderFile(f, isStaged, partialPaths && partialPaths.has(f.path))).join("");
  }

  function renderFile(f, isStaged, isPartial, treeMode) {
    const checked = ui.selected.has(selectionKey(f.path, isStaged)) ? "checked" : "";
    const displayText = treeMode ? (f.path.split("/").pop() || f.path) : (f.displayPath || f.path);
    const selectTitle = `Select ${displayText}`;
    const partialBadge = isPartial
      ? `<span class="gx-partial-badge" title="Partially staged: this file also has ${isStaged ? "working tree" : "staged"} changes">Partial</span>`
      : "";
    return `
      <li class="gx-file${isStaged ? " gx-file-staged" : ""}" data-path="${escapeHtml(f.path)}" data-staged="${isStaged ? 1 : 0}" data-status="${escapeHtml(f.status)}">
        <input type="checkbox" class="gx-check" data-path="${escapeHtml(f.path)}" data-staged="${isStaged ? 1 : 0}" title="${escapeHtml(selectTitle)}" aria-label="${escapeHtml(selectTitle)}" ${checked} />
        ${fileIcon(f.path)}
        <span class="gx-path" data-action="openFile" data-path="${escapeHtml(f.path)}" data-staged="${isStaged ? 1 : 0}" data-status="${escapeHtml(f.status)}" title="Open changes — ${escapeHtml(f.path)}">${escapeHtml(displayText)}</span>
        ${partialBadge}
        <span class="gx-right">
          ${statusGlyph(f.status)}
        </span>
      </li>`;
  }

  function renderHistory(s) {
    const list = byId("commitList");
    const commits = s.history || [];
    pruneCommitSelection(commits);
    renderHistoryActions();
    if (!commits.length) {
      list.innerHTML = `<li class="gx-empty">No commits yet</li>`;
      return;
    }
    list.innerHTML = commits
      .map((c) => {
        const expanded = ui.expandedCommits.has(c.hash);
        const selected = ui.selectedCommits.has(c.hash);
        const selectTitle = `Select ${c.subject}`;
        return `
        <li class="gx-commit${expanded ? " expanded" : ""}${selected ? " selected" : ""}">
          <div class="gx-commit-head" data-action="toggleCommit" data-hash="${escapeHtml(c.hash)}" title="Show changed files" aria-label="Show changed files in ${escapeHtml(c.hash)}">
            <input type="checkbox" class="gx-check gx-commit-check" data-action="toggleCommitSelection" data-hash="${escapeHtml(c.hash)}" title="${escapeHtml(selectTitle)}" aria-label="${escapeHtml(selectTitle)}" ${selected ? "checked" : ""} />
            <span class="gx-commit-col-left">
              <span class="rail gx-ic">${ICONS.commit}</span>
              <span class="gx-commit-col-bottom">
                <span class="gx-commit-caret gx-ic sm">${ICONS.chevron}</span>
              </span>
            </span>
            <span class="body">
              <div class="gx-commit-title">
                <span class="gx-commit-subject">${escapeHtml(c.subject)}</span>
              </div>
              <div class="gx-commit-meta">
                <span class="gx-hash">${escapeHtml(c.hash.slice(0, 7))}</span>
                <span>${escapeHtml(c.author)}</span>
                <span>${escapeHtml(c.relativeDate)}</span>
                ${renderCommitTags(c.tags)}
              </div>
            </span>
          </div>
          ${expanded ? renderCommitFiles(c.hash) : ""}
        </li>`;
      })
      .join("");
  }

  function renderHistoryActions() {
    const count = ui.selectedCommits.size;
    byId("historySelectedCount").textContent = `${count} selected`;
    setDisabled(byId("historySummaryBtn"), count === 0 || !!ui.state.isLoading);
    setDisabled(byId("historySecurityBtn"), count === 0 || !!ui.state.isLoading);
    setDisabled(byId("historyClearBtn"), count === 0);
  }

  function toggleCommitSelection(hash, range) {
    if (!hash) return;
    const commits = ui.state.history || [];
    if (range && ui.historyAnchorHash) {
      const from = commits.findIndex((commit) => commit.hash === ui.historyAnchorHash);
      const to = commits.findIndex((commit) => commit.hash === hash);
      if (from >= 0 && to >= 0) {
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        commits.slice(start, end + 1).forEach((commit) => ui.selectedCommits.add(commit.hash));
        renderHistory(ui.state);
        return;
      }
    }
    if (ui.selectedCommits.has(hash)) {
      ui.selectedCommits.delete(hash);
    } else {
      ui.selectedCommits.add(hash);
    }
    ui.historyAnchorHash = hash;
    renderHistory(ui.state);
  }

  function pruneCommitSelection(commits) {
    const present = new Set((commits || []).map((commit) => commit.hash));
    Array.from(ui.selectedCommits).forEach((hash) => {
      if (!present.has(hash)) ui.selectedCommits.delete(hash);
    });
    if (ui.historyAnchorHash && !present.has(ui.historyAnchorHash)) {
      ui.historyAnchorHash = "";
    }
  }

  function selectedCommitPayload() {
    return (ui.state.history || [])
      .filter((commit) => ui.selectedCommits.has(commit.hash))
      .map((commit) => ({ hash: commit.hash, subject: commit.subject }));
  }

  function selectedCommitLabel(commits) {
    if (commits.length === 1) return commits[0].hash.slice(0, 7);
    return `${commits.length} commits`;
  }

  function commitSubjectsLabel(commits) {
    if (commits.length === 1) return commits[0].subject || "";
    return commits.map((commit) => commit.subject).filter(Boolean).slice(0, 3).join(" · ");
  }

  function renderSummaryPanel() {
    const el = byId("summaryContent");
    if (!el) return;
    const s = ui.activeSummary;
    if (!s) { el.innerHTML = ""; return; }

    const summaryScope = /^[a-f0-9]{7,40}$/i.test(s.hash) ? s.hash.slice(0, 7) : s.hash;
    const hashEl = `<span class="gx-hash">${escapeHtml(summaryScope)}</span>`;
    const subjectEl = s.subject ? `<span class="gx-ai-subject">${escapeHtml(s.subject)}</span>` : "";

    if (s.loading) {
      const progressText = SUMMARY_MESSAGES[ui.summaryProgress.idx] || SUMMARY_MESSAGES[0];
      el.innerHTML = `
        <div class="gx-ai-panel">
          <div class="gx-ai-panel-meta">${hashEl}${subjectEl}</div>
          <div class="gx-ai-panel-loading">
            <span class="gx-spin"></span><span>${escapeHtml(progressText)}</span>
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
          ${s.note ? `<div class="gx-ai-panel-note">${escapeHtml(s.note)}</div>` : ""}
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

    const scope = sr.scope || (sr.staged ? "Staged Changes" : "Working Tree Changes");

    if (sr.loading) {
      const progressText = SECURITY_MESSAGES[ui.securityProgress.idx] || SECURITY_MESSAGES[0];
      container.innerHTML = `
        <div class="gx-ai-panel">
          <div class="gx-ai-panel-meta"><span class="gx-sec-scope">${escapeHtml(scope)}</span></div>
          <div class="gx-ai-panel-loading">${icon("shieldAi", "sm")}<span>${escapeHtml(progressText)}</span></div>
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
        <div class="gx-ai-panel-body gx-sec-body">
          ${sr.note ? `<div class="gx-ai-panel-note">${escapeHtml(sr.note)}</div>` : ""}
          ${bodyHtml}
        </div>
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
    const label = statusLabel(status);
    if (status === "A" || status === "U") return `<span class="gx-cstat gx-stat-A" data-tooltip="${label}" aria-label="${label}">${ICONS.plus}</span>`;
    if (status === "D") return `<span class="gx-cstat gx-stat-D" data-tooltip="${label}" aria-label="${label}">${ICONS.minus}</span>`;
    if (status === "R" || status === "C") return `<span class="gx-cstat gx-stat-R" data-tooltip="${label}" aria-label="${label}">${ICONS.dot}</span>`;
    return `<span class="gx-cstat gx-stat-M" data-tooltip="${label}" aria-label="${label}">${ICONS.dot}</span>`;
  }

  function renderSettings(s) {
    // Jira pane — populate inputs only when empty (don't clobber user typing)
    const jiraConfig = s.jiraConfig || { baseUrl: "", email: "" };
    const jiraUrlInput = /** @type {HTMLInputElement} */ (byId("jiraBaseUrlInput"));
    const jiraEmailInput = /** @type {HTMLInputElement} */ (byId("jiraEmailInput"));
    const jiraTokenInput = /** @type {HTMLInputElement} */ (byId("jiraTokenInput"));
    if (jiraUrlInput && !jiraUrlInput.value) jiraUrlInput.value = jiraConfig.baseUrl;
    if (jiraEmailInput && !jiraEmailInput.value) jiraEmailInput.value = jiraConfig.email;
    if (jiraTokenInput) {
      jiraTokenInput.placeholder = s.jiraHasToken
        ? "•••••••••••• stored — paste to replace"
        : "Paste your Jira API token";
    }
    const hasUrl = jiraUrlInput && jiraUrlInput.value.trim().length > 0;
    const hasEmail = jiraEmailInput && jiraEmailInput.value.trim().length > 0;
    const hasToken = (jiraTokenInput && jiraTokenInput.value.trim().length > 0) || s.jiraHasToken;
    if (byId("saveJiraBtn")) setDisabled(byId("saveJiraBtn"), !(hasUrl && hasEmail && hasToken));
    if (s.jiraHasToken && !byId("jiraSettingsStatus").innerHTML.trim()) {
      byId("jiraSettingsStatus").innerHTML = `<span class="gx-badge ok">connected</span>`;
    }

    const keyInput = /** @type {HTMLInputElement} */ (byId("apiKeyInput"));
    keyInput.placeholder = s.hasApiKey
      ? "•••••••••••• stored — paste to replace"
      : "Paste your API key";
    const hasInputText = keyInput.value.trim().length > 0;
    setDisabled(byId("saveValidateBtn"), !hasInputText && !s.hasApiKey);

    const icons = s.providerIcons || {};
    const providerItems = PROVIDERS.map((p) => ({ value: p.value, label: p.label, icon: icons[p.value] }));
    const activeProvider = PROVIDERS.find((p) => p.value === s.provider);
    const keyLink = byId("apiKeyLink");
    if (keyLink && activeProvider) keyLink.href = activeProvider.keyUrl;
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

  // ---------- Jira ----------

  function openJiraMenu(key, summary, x, y, alignRight, trigger) {
    closeAllMenus();
    contextJiraIssue = { key, summary };
    document.querySelectorAll(".gx-jira-dots[aria-expanded]").forEach((btn) => btn.setAttribute("aria-expanded", "false"));
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    const menu = byId("jiraIssueMenu");
    menu.classList.remove("hidden");
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const margin = 6;
    const anchorLeft = alignRight ? x - rect.width : x;
    menu.style.left = `${Math.round(Math.max(margin, Math.min(anchorLeft, window.innerWidth - rect.width - margin)))}px`;
    menu.style.top = `${Math.round(Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)))}px`;
  }

  function closeJiraMenu() {
    const menu = byId("jiraIssueMenu");
    if (menu) menu.classList.add("hidden");
    document.querySelectorAll(".gx-jira-dots[aria-expanded]").forEach((btn) => btn.setAttribute("aria-expanded", "false"));
    contextJiraIssue = null;
  }

  function handleJiraMenuAction(action) {
    const issue = contextJiraIssue;
    closeJiraMenu();
    if (!issue) return;
    if (action === "usePrefix") {
      ui.commitPrefix = { enabled: true, value: issue.key };
      persistCommitPrefix();
      updatePrefixUi();
      switchTab("changes");
    } else if (action === "createBranch") {
      post({ type: "createBranchFromJira", key: issue.key, summary: issue.summary });
    } else if (action === "openInJira") {
      post({ type: "openJiraIssue", key: issue.key });
    }
  }

  const JIRA_TYPE_SVGS = {
    bug: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.47 5.777C6.64843 5.66548 6.82631 5.57017 7.00005 5.48867C7.00341 5.24634 7.03488 5.00375 7.08016 4.76601C7.15702 4.36251 7.31232 3.81288 7.63176 3.25386C8.30808 2.0703 9.63768 1 12 1C14.3623 1 15.6919 2.0703 16.3682 3.25386C16.6877 3.81288 16.843 4.36251 16.9198 4.76601C16.9651 5.00366 16.9966 5.24615 16.9999 5.48839C17.1737 5.56989 17.3516 5.66548 17.53 5.777C18.207 6.20012 18.8425 6.82582 19.2994 7.71927C19.7656 7.53233 20.2282 7.23 20.5429 6.7578C20.7966 6.3773 21 5.82502 21 5C21 4.44772 21.4477 4 22 4C22.5523 4 23 4.44772 23 5C23 6.17498 22.7034 7.1227 22.2071 7.8672C21.5676 8.82639 20.6756 9.34444 19.8991 9.63125C19.9646 10.0513 20 10.5067 20 11V12H22C22.5523 12 23 12.4477 23 13C23 13.5523 22.5523 14 22 14H20V15.5191C19.9891 15.8049 19.9498 16.088 19.9016 16.3697C20.6774 16.6566 21.5683 17.1746 22.2071 18.1328C22.7034 18.8773 23 19.825 23 21C23 21.5523 22.5523 22 22 22C21.4477 22 21 21.5523 21 21C21 20.175 20.7966 19.6227 20.5429 19.2422C20.2401 18.7879 19.8018 18.4912 19.3524 18.3025C19.2288 18.6068 19.0814 18.9213 18.9053 19.237C17.8448 21.1392 15.7816 23 12 23C8.2184 23 6.15524 21.1392 5.09465 19.237C4.91864 18.9213 4.77118 18.6068 4.6476 18.3025C4.19823 18.4912 3.75992 18.7879 3.45705 19.2422C3.20338 19.6227 3 20.175 3 21C3 21.5523 2.55228 22 2 22C1.44772 22 1 21.5523 1 21C1 19.825 1.29662 18.8773 1.79295 18.1328C2.43173 17.1746 3.32255 16.6566 4.09839 16.3697C4.05024 16.0885 4.0127 15.8043 4 15.5191V14H2C1.44772 14 1 13.5523 1 13C1 12.4477 1.44772 12 2 12H4V11C4 10.5067 4.0354 10.0513 4.10086 9.63125C3.3244 9.34444 2.43241 8.82639 1.79295 7.8672C1.29662 7.1227 1 6.17498 1 5C1 4.44772 1.44772 4 2 4C2.55228 4 3 4.44772 3 5C3 5.82502 3.20338 6.3773 3.45705 6.7578C3.77185 7.23 4.2344 7.53233 4.70063 7.71927C5.15748 6.82582 5.79302 6.20012 6.47 5.777ZM14.6318 4.24614C14.7804 4.50632 14.8709 4.77287 14.9251 5H9.07491C9.1291 4.77287 9.21957 4.50632 9.36824 4.24614C9.69192 3.6797 10.3623 3 12 3C13.6377 3 14.3081 3.6797 14.6318 4.24614ZM8.99671 7.00035C8.48495 7.02168 7.96106 7.20358 7.53 7.473C6.84294 7.90241 6 8.81983 6 11V15.4738C6.06537 16.4404 6.37182 17.4207 6.84149 18.263C7.5032 19.4498 8.69637 20.6688 11 20.943V7L8.99671 7.00035ZM13 7V20.943C15.3036 20.6688 16.4968 19.4498 17.1585 18.263C17.6282 17.4206 17.9346 16.4404 18 15.4738V11C18 8.81983 17.1571 7.90241 16.47 7.473C16.0389 7.20358 15.515 7.02168 15.0033 7.00035L13 7Z"/></svg>`,
    task: `<svg viewBox="0 0 15 15" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 3H12V12H3L3 3ZM2 3C2 2.44771 2.44772 2 3 2H12C12.5523 2 13 2.44772 13 3V12C13 12.5523 12.5523 13 12 13H3C2.44771 13 2 12.5523 2 12V3ZM10.3498 5.51105C10.506 5.28337 10.4481 4.97212 10.2204 4.81587C9.99275 4.65961 9.6815 4.71751 9.52525 4.94519L6.64048 9.14857L5.19733 7.40889C5.02102 7.19635 4.7058 7.16699 4.49327 7.34329C4.28073 7.5196 4.25137 7.83482 4.42767 8.04735L6.2934 10.2964C6.39348 10.4171 6.54437 10.4838 6.70097 10.4767C6.85757 10.4695 7.00177 10.3894 7.09047 10.2601L10.3498 5.51105Z"/></svg>`,
    epic: `<svg viewBox="0 0 24 24" fill="none"><path d="M5.66953 9.91436L8.73167 5.77133C10.711 3.09327 11.7007 1.75425 12.6241 2.03721C13.5474 2.32018 13.5474 3.96249 13.5474 7.24712V7.55682C13.5474 8.74151 13.5474 9.33386 13.926 9.70541L13.946 9.72466C14.3327 10.0884 14.9492 10.0884 16.1822 10.0884C18.4011 10.0884 19.5106 10.0884 19.8855 10.7613C19.8917 10.7724 19.8977 10.7837 19.9036 10.795C20.2576 11.4784 19.6152 12.3475 18.3304 14.0857L15.2683 18.2287C13.2889 20.9067 12.2992 22.2458 11.3758 21.9628C10.4525 21.6798 10.4525 20.0375 10.4525 16.7528L10.4526 16.4433C10.4526 15.2585 10.4526 14.6662 10.074 14.2946L10.054 14.2754C9.6673 13.9117 9.05079 13.9117 7.81775 13.9117C5.59888 13.9117 4.48945 13.9117 4.1145 13.2387C4.10829 13.2276 4.10225 13.2164 4.09639 13.205C3.74244 12.5217 4.3848 11.6526 5.66953 9.91436Z" stroke="currentColor" stroke-width="1.5"/></svg>`,
    story: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 6.2C5 5.07989 5 4.51984 5.21799 4.09202C5.40973 3.71569 5.71569 3.40973 6.09202 3.21799C6.51984 3 7.07989 3 8.2 3H15.8C16.9201 3 17.4802 3 17.908 3.21799C18.2843 3.40973 18.5903 3.71569 18.782 4.09202C19 4.51984 19 5.07989 19 6.2V21L12 16L5 21V6.2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    improvement: `<svg viewBox="0 0 32 32" fill="currentColor"><g transform="translate(-516 -983)"><path d="M546,1011 C546,1012.1 545.104,1013 544,1013 L520,1013 C518.896,1013 518,1012.1 518,1011 L518,987 C518,985.896 518.896,985 520,985 L544,985 C545.104,985 546,985.896 546,987 L546,1011 L546,1011 Z M544,983 L520,983 C517.791,983 516,984.791 516,987 L516,1011 C516,1013.21 517.791,1015 520,1015 L544,1015 C546.209,1015 548,1013.21 548,1011 L548,987 C548,984.791 546.209,983 544,983 L544,983 Z M532.879,991.465 C532.639,991.225 532.311,991.15 532,991.205 C531.689,991.15 531.361,991.225 531.121,991.465 L525.465,997.121 C525.074,997.512 525.074,998.146 525.465,998.535 C525.854,998.926 526.488,998.926 526.879,998.535 L531,994.414 L531,1005 C531,1005.55 531.447,1006 532,1006 C532.552,1006 533,1005.55 533,1005 L533,994.414 L537.121,998.535 C537.512,998.926 538.145,998.926 538.535,998.535 C538.926,998.146 538.926,997.512 538.535,997.121 L532.879,991.465 L532.879,991.465 Z"/></g></svg>`,
  };

  function jiraTypeIcon(type) {
    const t = (type || "").toLowerCase();
    let svg, cls;
    if (t.includes("bug"))                                        { svg = JIRA_TYPE_SVGS.bug;         cls = "gx-jtype-bug"; }
    else if (t.includes("epic"))                                  { svg = JIRA_TYPE_SVGS.epic;        cls = "gx-jtype-epic"; }
    else if (t.includes("story"))                                 { svg = JIRA_TYPE_SVGS.story;       cls = "gx-jtype-story"; }
    else if (t.includes("subtask") || t.includes("sub-task"))    { svg = JIRA_TYPE_SVGS.task;        cls = "gx-jtype-task"; }
    else if (t.includes("task"))                                  { svg = JIRA_TYPE_SVGS.task;        cls = "gx-jtype-task"; }
    else if (t.includes("improvement") || t.includes("feature")) { svg = JIRA_TYPE_SVGS.improvement; cls = "gx-jtype-improvement"; }
    else                                                          { svg = JIRA_TYPE_SVGS.task;        cls = "gx-jtype-default"; }
    return `<span class="gx-jira-type-icon ${cls}" title="${escapeHtml(type || "Issue")}">${svg}</span>`;
  }

  function jiraStatusClass(status) {
    const s = status.toLowerCase();
    if (s.includes("progress") || s.includes("doing") || s.includes("active")) return "gx-jira-st-progress";
    if (s.includes("review") || s.includes("testing") || s.includes("qa")) return "gx-jira-st-review";
    if (s.includes("done") || s.includes("closed") || s.includes("resolved") || s.includes("complete")) return "gx-jira-st-done";
    if (s.includes("blocked") || s.includes("hold")) return "gx-jira-st-blocked";
    return "gx-jira-st-todo";
  }

  function renderJira() {
    const el = byId("jiraContent");
    if (!el) return;
    if (ui.jiraLoading) {
      el.innerHTML = `<div class="gx-jira-state"><span class="gx-spin"></span><span>Loading issues…</span></div>`;
      return;
    }
    if (ui.jiraError) {
      const isUnconfigured = ui.jiraError.includes("not configured");
      el.innerHTML = `<div class="gx-jira-state gx-jira-error">
        <p>${escapeHtml(ui.jiraError)}</p>
        ${isUnconfigured ? `<button class="gx-btn gx-btn-secondary" data-action="openSettings" type="button">Open Settings → Jira</button>` : ""}
      </div>`;
      return;
    }
    if (ui.jiraIssues === null) {
      el.innerHTML = `<div class="gx-jira-state"><p>Click refresh to load your issues.</p></div>`;
      return;
    }
    const query = ((/** @type {HTMLInputElement|null} */ (byId("jiraSearchInput")))?.value ?? "").trim().toLowerCase();
    let issues = query
      ? ui.jiraIssues.filter((i) =>
          i.key.toLowerCase().includes(query) ||
          i.summary.toLowerCase().includes(query) ||
          i.status.toLowerCase().includes(query)
        )
      : [...ui.jiraIssues];
    if (!issues.length) {
      el.innerHTML = `<div class="gx-jira-state"><p>${query ? "No matching issues." : "No open issues assigned to you."}</p></div>`;
      updateJiraSortHeaders();
      return;
    }
    const { col, dir } = ui.jiraSort;
    if (col) {
      issues.sort((a, b) => {
        const av = String(a[col] ?? "").toLowerCase();
        const bv = String(b[col] ?? "").toLowerCase();
        return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    el.innerHTML = issues.map((issue) => `
      <div class="gx-jira-issue">
        <span class="gx-jira-key">
          ${jiraTypeIcon(issue.type)}
          <span class="gx-jira-key-chip">${escapeHtml(issue.key)}</span>
        </span>
        <span class="gx-jira-summary" title="${escapeHtml(issue.summary)}">${escapeHtml(issue.summary)}</span>
        <span class="gx-jira-status ${jiraStatusClass(issue.status)}">${escapeHtml(issue.status)}</span>
        <button class="gx-iconbtn gx-jira-dots" data-action="openJiraIssueMenu"
          data-jira-key="${escapeHtml(issue.key)}" data-jira-summary="${escapeHtml(issue.summary)}"
          title="Actions" aria-label="Issue actions" aria-haspopup="menu" aria-expanded="false" type="button">${icon("dots", "sm")}</button>
      </div>`).join("");
    updateJiraSortHeaders();
  }

  function updateJiraSortHeaders() {
    const { col, dir } = ui.jiraSort;
    document.querySelectorAll(".gx-jira-col-hdr").forEach((btn) => {
      const c = btn.getAttribute("data-col");
      const ind = btn.querySelector(".gx-sort-ind");
      const active = c === col;
      btn.classList.toggle("active", active);
      if (ind) ind.textContent = active ? (dir === "asc" ? "↑" : "↓") : "";
    });
  }

  // ---------- Reports ----------

  const TYPE_LABELS = { commitMessage: "Commit msg", commitSummary: "AI Summary", security: "Security" };
  const TYPE_COLORS = { commitMessage: "var(--gx-accent)", commitSummary: "#7aa2ff", security: "#e7bd57" };
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

    // ── Daily counts (last 30 days) ──
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

    // Last 5 days that have data
    const activeDays = days.filter((d) => d.count > 0).slice(-5);

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
      barRow(label, typeCounts[k] || 0, TYPE_COLORS[k] || "var(--gx-accent)")
    ).join("");

    const provRows = Object.entries(provCounts).sort((a, b) => b[1] - a[1]).map(([p, c]) =>
      barRow(p.charAt(0).toUpperCase() + p.slice(1), c, PROVIDER_COLORS[p] || "#9a8f83")
    ).join("");

    const modelRows = topModels.map(([m, c]) => `
      <div class="gx-rep-model-row">
        <span class="gx-rep-model-name" title="${escapeHtml(m)}">${escapeHtml(m)}</span>
        <span class="gx-rep-model-count">${c}</span>
      </div>`).join("");

    el.innerHTML = `
      <div class="gx-rep-header">
        <span class="gx-rep-title">Last 30 days</span>
        <button class="gx-iconbtn gx-rep-refresh" data-action="openReports" title="Refresh" aria-label="Refresh" type="button">${icon("refresh", "sm")}</button>
      </div>

      <div class="gx-rep-total">
        <span class="gx-rep-total-num">${total}</span>
        <span class="gx-rep-total-label">AI call${total === 1 ? "" : "s"}</span>
      </div>

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

      ${activeDays.length ? `
      <div class="gx-rep-section">
        <div class="gx-rep-section-title">Last 5 active days</div>
        <div class="gx-daychart-wrap"><canvas id="repDayChart"></canvas></div>
      </div>` : ""}
    `;

    // ── Chart.js bar chart ──
    if (activeDays.length && typeof Chart !== "undefined") {
      const canvas = /** @type {HTMLCanvasElement|null} */ (byId("repDayChart"));
      if (canvas) {
        new Chart(canvas, {
          type: "bar",
          data: {
            labels: activeDays.map((d) => d.label),
            datasets: [{
              data: activeDays.map((d) => d.count),
              backgroundColor: "rgba(31,156,240,0.75)",
              hoverBackgroundColor: "rgba(31,156,240,1)",
              borderRadius: 4,
              borderSkipped: false,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => ` ${ctx.parsed.y} AI call${ctx.parsed.y === 1 ? "" : "s"}`,
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: "rgba(180,180,190,0.7)", font: { size: 10 } },
                border: { display: false },
              },
              y: {
                beginAtZero: true,
                ticks: {
                  color: "rgba(180,180,190,0.5)",
                  font: { size: 9 },
                  stepSize: 1,
                  maxTicksLimit: 5,
                },
                grid: { color: "rgba(255,255,255,0.05)" },
                border: { display: false },
              }
            }
          }
        });
      }
    }
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
        if (typeof message.renderId === "number") {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => post({ type: "stateRendered", renderId: message.renderId }));
          });
        }
        break;
      case "setCommitFields":
        if (typeof message.summary === "string")
          /** @type {HTMLInputElement} */ (byId("commitSummary")).value = applyCommitPrefix(message.summary);
        if (typeof message.description === "string")
          /** @type {HTMLTextAreaElement} */ (byId("commitDescription")).value = message.description;
        break;
      case "clearCommitFields":
        /** @type {HTMLInputElement} */ (byId("commitSummary")).value = "";
        /** @type {HTMLTextAreaElement} */ (byId("commitDescription")).value = "";
        ui.amendMode = false;
        break;
      case "switchTab":
        switchTab(message.tab);
        break;
      case "changesSubTab":
        switchChangeTab(message.tab || "working");
        break;
      case "commitFiles":
        ui.commitFiles[message.hash] = Array.isArray(message.files) ? message.files : [];
        if (message.stat) ui.commitStats[message.hash] = message.stat;
        if (ui.expandedCommits.has(message.hash)) renderHistory(ui.state);
        break;
      case "commitSummary":
        stopAiProgress(ui.summaryProgress);
        if (ui.activeSummary && ui.activeSummary.hash === message.hash) {
          if (message.error) {
            ui.activeSummary = { ...ui.activeSummary, loading: false, error: message.error };
          } else {
            ui.activeSummary = { ...ui.activeSummary, loading: false, summary: message.summary, description: message.description, note: message.note };
          }
          renderSummaryPanel();
        }
        break;
      case "securityReview":
        stopAiProgress(ui.securityProgress);
        if (ui.activeSecurityReview) {
          if (message.error) {
            ui.activeSecurityReview = { ...ui.activeSecurityReview, loading: false, error: message.error };
          } else {
            ui.activeSecurityReview = { ...ui.activeSecurityReview, loading: false, findings: message.findings, safe: !!message.safe, note: message.note, scope: message.scope || ui.activeSecurityReview.scope };
          }
          renderSecurityPanel();
        }
        break;
      case "reports":
        renderReports(Array.isArray(message.entries) ? message.entries : []);
        break;
      case "jiraIssues":
        ui.jiraLoading = false;
        if (message.error) {
          ui.jiraError = message.error;
          ui.jiraIssues = null;
        } else {
          ui.jiraError = "";
          ui.jiraIssues = Array.isArray(message.issues) ? message.issues : [];
        }
        renderJira();
        break;
      case "jiraStatus": {
        const statusEl = byId("jiraSettingsStatus");
        if (!statusEl) break;
        if (message.loading) {
          statusEl.innerHTML = `<span class="gx-spin"></span><span>Validating…</span>`;
        } else if (message.ok) {
          statusEl.innerHTML = `<span class="gx-badge ok">connected</span><span>Jira credentials saved.</span>`;
          byId("jiraTokenInput").value = "";
          byId("jiraTokenInput").placeholder = "•••••••••••• stored — paste to replace";
        } else if (message.error) {
          statusEl.innerHTML = `<span class="gx-badge missing">error</span><span>${escapeHtml(message.error)}</span>`;
        }
        const hasUrl = /** @type {HTMLInputElement} */ (byId("jiraBaseUrlInput")).value.trim().length > 0;
        const hasEmail = /** @type {HTMLInputElement} */ (byId("jiraEmailInput")).value.trim().length > 0;
        const hasToken = /** @type {HTMLInputElement} */ (byId("jiraTokenInput")).value.trim().length > 0 || ui.state.jiraHasToken;
        setDisabled(byId("saveJiraBtn"), !(hasUrl && hasEmail && hasToken) || !!message.loading);
        break;
      }
      default:
        break;
    }
  });

  // Keys seen in any previous state — used to avoid re-checking files the user
  // explicitly unchecked. A file is auto-checked only on its first appearance.
  const _seenFileKeys = new Set();

  function pruneSelection() {
    const current = new Set();
    (ui.state.changes.staged || []).forEach((f) => current.add(selectionKey(f.path, true)));
    (ui.state.changes.unstaged || []).forEach((f) => current.add(selectionKey(f.path, false)));
    // Remove selections for files that no longer exist
    Array.from(ui.selected).forEach((key) => {
      if (!current.has(key)) ui.selected.delete(key);
    });
    // Forget files that are no longer present so they auto-check if they reappear
    Array.from(_seenFileKeys).forEach((key) => {
      if (!current.has(key)) _seenFileKeys.delete(key);
    });
    // Auto-check files that are appearing for the first time
    current.forEach((key) => {
      if (!_seenFileKeys.has(key)) ui.selected.add(key);
    });
    current.forEach((key) => _seenFileKeys.add(key));
  }

  // ---------- Boot ----------
  buildShell();
  updateJiraVisibility();
  switchTab("changes");
  render();
  post({ type: "ready" });
})();
