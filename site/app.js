/* Gitable site — shared behaviour (nav, copy buttons, reveal, hero mock). */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Mobile navigation toggle
  const topbar = document.querySelector(".topbar");
  const toggle = document.querySelector(".nav-toggle");
  if (topbar && toggle) {
    const setOpen = (open) => {
      topbar.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    toggle.addEventListener("click", () => setOpen(!topbar.classList.contains("open")));
    topbar.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  }

  // Copy-to-clipboard buttons
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  document.addEventListener("click", async (event) => {
    const btn = event.target.closest(".copy-btn");
    if (!btn) return;
    const text = btn.dataset.copy ?? btn.closest(".cmd")?.querySelector("code")?.innerText ?? "";
    const ok = await copyText(text);
    const label = btn.querySelector("span");
    btn.classList.toggle("done", ok);
    if (label) label.textContent = ok ? "Copied" : "Press Ctrl+C";
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.classList.remove("done");
      if (label) label.textContent = "Copy";
    }, 1800);
  });

  // Scroll reveal
  const revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Also reveal anything already scrolled past (anchor jumps, reloads mid-page).
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            entry.target.classList.add("in");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => obs.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  // Hero mock: the sparkle "generates" a fresh commit message.
  const mock = document.getElementById("mock");
  if (mock) {
    const gen = document.getElementById("mockGen");
    const summary = document.getElementById("mockSummary");
    const desc = document.getElementById("mockDesc");
    const peek = mock.querySelector(".peek");
    const drafts = [
      ["GIT-142 feat: add commit prefix support", "Prefix is stored per workspace and applied to generated and typed summaries."],
      ["GIT-142 fix: keep prefix when amending", "Amend now pre-fills the stored prefix instead of dropping it from the summary."],
      ["GIT-142 refactor: share prefix helper", "Moves prefix handling into one helper used by commit, amend and AI generation."]
    ];
    let next = 1;

    const place = () => {
      const m = mock.getBoundingClientRect();
      const r = gen.getBoundingClientRect();
      // Beside the summary field (over the editor) when there is room, else above it.
      const roomRight = m.right - r.right - 12 >= peek.offsetWidth;
      const left = roomRight
        ? r.right - m.left + 12
        : Math.max(8, Math.min(r.right - m.left - peek.offsetWidth, m.width - peek.offsetWidth - 8));
      peek.style.left = left + "px";
      peek.style.top = (roomRight ? r.top - m.top - 6 : r.top - m.top - peek.offsetHeight - 8) + "px";
    };
    const flashPeek = () => {
      place();
      mock.classList.add("peeking");
      clearTimeout(flashPeek._t);
      flashPeek._t = setTimeout(() => mock.classList.remove("peeking"), 2400);
    };

    const type = (text, done) => {
      if (reduceMotion) {
        summary.textContent = text;
        done();
        return;
      }
      summary.textContent = "";
      summary.classList.add("typing");
      let i = 0;
      const step = () => {
        summary.textContent = text.slice(0, ++i);
        if (i < text.length) setTimeout(step, 18);
        else { summary.classList.remove("typing"); done(); }
      };
      step();
    };

    gen.addEventListener("click", () => {
      const [s, d] = drafts[next];
      next = (next + 1) % drafts.length;
      gen.disabled = true;
      desc.textContent = "";
      setTimeout(() => {
        type(s, () => {
          desc.textContent = d;
          gen.disabled = false;
          flashPeek();
        });
      }, reduceMotion ? 0 : 380);
    });
    window.addEventListener("resize", () => mock.classList.contains("peeking") && place());

    if (!reduceMotion) setTimeout(flashPeek, 1100);
  }
})();
