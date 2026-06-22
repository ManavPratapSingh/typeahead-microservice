/**
 * app.js
 * Frontend logic for the Search Typeahead UI.
 * - Debounced fetch to GET /suggest?q=<prefix>
 * - Keyboard navigation (ArrowUp/Down/Enter/Escape)
 * - Click or Enter fires POST /search to record the hit
 */

(function () {
  "use strict";

  // ── DOM refs ──
  const input = document.getElementById("search-input");
  const list = document.getElementById("suggestions-list");
  const spinner = document.getElementById("spinner");
  const stats = document.getElementById("stats");
  const wrapper = document.getElementById("search-wrapper");
  const trendingSection = document.getElementById("trending-section");
  const trendingList = document.getElementById("trending-list");

  // ── State ──
  let debounceTimer = null;
  let activeIndex = -1;
  let currentSuggestions = [];

  const DEBOUNCE_MS = 200;

  // ── Debounced input handler ──
  input.addEventListener("input", () => {
    const q = input.value.trim();
    activeIndex = -1;

    if (!q) {
      closeSuggestions();
      stats.textContent = "";
      return;
    }

    clearTimeout(debounceTimer);
    spinner.classList.add("active");

    debounceTimer = setTimeout(() => fetchSuggestions(q), DEBOUNCE_MS);
  });

  // ── Fetch suggestions from the backend ──
  async function fetchSuggestions(query) {
    const t0 = performance.now();

    try {
      const res = await fetch(`/suggest?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const elapsed = (performance.now() - t0).toFixed(1);

      currentSuggestions = data.suggestions || [];
      renderSuggestions(query);

      stats.textContent = currentSuggestions.length
        ? `${currentSuggestions.length} suggestion${currentSuggestions.length > 1 ? "s" : ""} · ${elapsed}ms round-trip`
        : `No suggestions · ${elapsed}ms`;
    } catch (err) {
      console.error("Fetch error:", err);
      stats.textContent = "Error fetching suggestions";
    } finally {
      spinner.classList.remove("active");
    }
  }

  // ── Render suggestion items ──
  function renderSuggestions(query) {
    list.innerHTML = "";

    if (currentSuggestions.length === 0) {
      const li = document.createElement("li");
      li.className = "no-results";
      li.textContent = "No matching suggestions";
      list.appendChild(li);
      list.classList.add("open");
      return;
    }

    const lowerQuery = query.toLowerCase();

    currentSuggestions.forEach((suggestion, i) => {
      const li = document.createElement("li");
      li.className = "suggestion-item";
      li.dataset.index = i;

      // Rank badge
      const rank = document.createElement("span");
      rank.className = "suggestion-rank";
      rank.textContent = i + 1;

      // Highlighted text — bold the matching prefix portion
      const textSpan = document.createElement("span");
      const lowerSuggestion = suggestion.toLowerCase();
      const matchEnd = lowerQuery.length;

      if (lowerSuggestion.startsWith(lowerQuery)) {
        const matchPart = document.createElement("span");
        matchPart.className = "match";
        matchPart.textContent = suggestion.substring(0, matchEnd);

        const restPart = document.createElement("span");
        restPart.className = "rest";
        restPart.textContent = suggestion.substring(matchEnd);

        textSpan.appendChild(matchPart);
        textSpan.appendChild(restPart);
      } else {
        textSpan.textContent = suggestion;
      }

      li.appendChild(rank);
      li.appendChild(textSpan);

      li.addEventListener("click", () => selectSuggestion(suggestion));
      li.addEventListener("mouseenter", () => {
        activeIndex = i;
        highlightActive();
      });

      list.appendChild(li);
    });

    list.classList.add("open");
  }

  // ── Close suggestions dropdown ──
  function closeSuggestions() {
    list.classList.remove("open");
    activeIndex = -1;
    currentSuggestions = [];
    setTimeout(() => { list.innerHTML = ""; }, 200); // wait for transition
  }

  // ── Highlight active keyboard-navigated item ──
  function highlightActive() {
    const items = list.querySelectorAll(".suggestion-item");
    items.forEach((el, i) => {
      el.classList.toggle("active", i === activeIndex);
    });
  }

  // ── Select a suggestion: populate input + fire POST /search ──
  // ── Show toast notification ──
  function showToast(message) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger animate-in
    setTimeout(() => {
      toast.classList.add("show");
    }, 10);

    // Animate out and remove
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  // ── Select a suggestion: populate input + fire POST /search ──
  async function selectSuggestion(query) {
    input.value = query;
    closeSuggestions();
    stats.textContent = `Searched: "${query}"`;
    showToast(`searched ${query}`);

    try {
      await fetch("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
    } catch (err) {
      console.error("Search post error:", err);
    }
  }

  // ── Keyboard navigation ──
  input.addEventListener("keydown", (e) => {
    const items = list.querySelectorAll(".suggestion-item");
    if (!items.length) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        highlightActive();
        break;

      case "ArrowUp":
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        highlightActive();
        break;

      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < currentSuggestions.length) {
          selectSuggestion(currentSuggestions[activeIndex]);
        } else if (input.value.trim()) {
          selectSuggestion(input.value.trim());
        }
        break;

      case "Escape":
        closeSuggestions();
        input.blur();
        break;
    }
  });

  // ── Close on outside click ──
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      closeSuggestions();
    }
  });

  // ── Fetch trending searches on page load ──
  async function fetchTrending() {
    try {
      const res = await fetch("/trending");
      const data = await res.json();
      const trending = data.trending || [];

      trendingList.innerHTML = "";

      if (trending.length === 0) {
        trendingSection.style.display = "none";
        return;
      }

      trending.forEach((item) => {
        const li = document.createElement("li");
        li.className = "trending-item";

        const querySpan = document.createElement("span");
        querySpan.className = "trending-item-query";
        querySpan.textContent = item.query;

        const freqSpan = document.createElement("span");
        freqSpan.className = "trending-item-freq";
        freqSpan.textContent = Number(item.frequency).toLocaleString() + " hits";

        li.appendChild(querySpan);
        li.appendChild(freqSpan);

        // Clicking a trending item searches for it
        li.addEventListener("click", () => selectSuggestion(item.query));

        trendingList.appendChild(li);
      });

      // Animate section in
      setTimeout(() => {
        trendingSection.classList.add("visible");
      }, 100);
    } catch (err) {
      console.error("Failed to fetch trending:", err);
      trendingSection.style.display = "none";
    }
  }

  // Fire once on page load
  fetchTrending();
})();
