// --- Chart.js and react-chartjs-2 imports ---
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

import React, { useMemo, useState, useEffect, useRef } from "react";
// --- Merge Deck helpers ----------------------------------------------------
const MERGE_CHOICES_KEY = "mtg_deck_diff_merge_choices_v1";
const loadMergeChoices = () => {
  try {
    const raw = localStorage.getItem(MERGE_CHOICES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
};
const saveMergeChoices = (obj) => {
  try {
    localStorage.setItem(MERGE_CHOICES_KEY, JSON.stringify(obj));
  } catch { }
};
// Compute merged deck based on deckA, deckB and mergeChoices.
// Returns array of { name, qty, choice, options } sorted by name.
const computeMergedDeck = (deckA, deckB, mergeChoices) => {
  const names = unionNames(deckA, deckB);
  return names.map((name) => {
    const qa = deckA.get(name) || 0;
    const qb = deckB.get(name) || 0;
    let options = [];
    let defaultChoice = null;
    if (qa > 0 && qb > 0) {
      if (qa === qb) {
        options = ["A", "B"];
        defaultChoice = "A";
      } else {
        options = ["A", "B", "Both"];
        defaultChoice = "Both";
      }
    } else if (qa > 0) {
      options = ["A"];
      defaultChoice = "A";
    } else if (qb > 0) {
      options = ["B"];
      defaultChoice = "B";
    }
    const choice = mergeChoices[name] || defaultChoice;
    let qty = 0;
    if (choice === "A") qty = qa;
    else if (choice === "B") qty = qb;
    else if (choice === "Both") qty = qa + qb;
    return { name, qty, choice, options, qa, qb };
  }).filter((row) => row.qty > 0);
};
// Download merged deck as .txt file
const downloadMergedDeck = (deckRows) => {
  const lines = deckRows.map((row) => `${row.qty} ${row.name}`);
  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "merged_deck.txt";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};
// --- CardSearchPanel: left sidebar with card search and add to deck ---
function CardSearchPanel({ onAddCard, getCard }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [mobilePreviewCard, setMobilePreviewCard] = useState(null);

  useEffect(() => {
    let ignore = false;
    if (!query || query.length < 2) {
      setResults([]);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=released&unique=cards`
    )
      .then((r) => r.json())
      .then((json) => {
        if (ignore) return;
        if (json.object === "error") {
          setError(json.details || "No results");
          setResults([]);
        } else {
          setResults(json.data?.slice(0, 5) || []);
          setError("");
        }
        setLoading(false);
      })
      .catch((e) => {
        if (ignore) return;
        setError("Search failed");
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [query]);

  const handleAdd = (card, deck) => {
    onAddCard(card, deck);
    setQuery("");
    setResults([]);
    setError("");
    if (inputRef.current) inputRef.current.blur();
  };

  // Helper to get normalized card with images
  const getNormCard = (c) => getCard ? getCard(c.name) : null;

  // Mobile: tap to show preview
  const handlePreviewMobile = (card) => {
    setMobilePreviewCard(card);
  };

  const closeMobilePreview = () => setMobilePreviewCard(null);

  return (
    <aside className="fixed left-0 top-0 z-30 h-full w-72 bg-slate-900 border-r border-white/10 shadow-lg flex flex-col p-4">
      <div className="mb-4 text-lg font-bold tracking-wide">Card Search</div>
      <input
        ref={inputRef}
        className="w-full rounded-lg bg-slate-800 p-2 mb-2 text-sm text-white ring-1 ring-white/10 focus:outline-none"
        placeholder="Search Scryfall (min 2 chars)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <div className="text-xs text-gray-300 mb-2">Searching…</div>}
      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
      <div className="flex-1 overflow-y-auto relative">
        {results.map((c) => {
          const norm = getNormCard(c) || c;
          // For preview, prefer normalized card image URLs
          const previewCard = {
            ...c,
            ...norm,
            png: norm?.png || c.image_uris?.png || c.card_faces?.[0]?.image_uris?.png,
            back_png: norm?.back_png || c.card_faces?.[1]?.image_uris?.png,
            name: c.name,
          };
          return (
            <div
              key={c.id}
              className="mb-3 rounded-lg bg-black/30 p-2 flex items-center gap-2 relative group"
              onMouseEnter={() => setHoveredCard(previewCard)}
              onMouseLeave={() => setHoveredCard((h) => (h?.id === c.id ? null : h))}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('card', JSON.stringify(previewCard));
              }}
              // Mobile tap: show preview
              onClick={e => {
                // Only show on mobile (hide on md+)
                if (window.innerWidth < 768) {
                  handlePreviewMobile(previewCard);
                }
              }}
              tabIndex={0}
              style={{ cursor: "grab" }}
            >
              <img
                src={norm?.small || c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small}
                alt={c.name}
                className="h-12 w-9 rounded-md object-cover ring-1 ring-white/10"
              />
              <div className="flex-1 min-w-0">
                <div className="truncate font-semibold text-sm">{c.name}</div>
                <div className="truncate text-xs opacity-80">{c.type_line}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  className="rounded bg-red-700 hover:bg-red-600 px-2 py-1 text-xs text-white"
                  onClick={e => { e.stopPropagation(); handleAdd(c, "A"); }}
                  title="Add to Deck A"
                  tabIndex={-1}
                >
                  A
                </button>
                <button
                  className="rounded bg-green-700 hover:bg-green-600 px-2 py-1 text-xs text-white"
                  onClick={e => { e.stopPropagation(); handleAdd(c, "B"); }}
                  title="Add to Deck B"
                  tabIndex={-1}
                >
                  B
                </button>
                <button
                  className="rounded bg-blue-700 hover:bg-blue-600 px-2 py-1 text-xs text-white"
                  onClick={e => { e.stopPropagation(); handleAdd(c, "C"); }}
                  title="Add to Merged Deck"
                  tabIndex={-1}
                >
                  C
                </button>
              </div>
              {/* Desktop large preview - for search results, show below the card */}
              {hoveredCard?.id === c.id && previewCard.png && (
                <div className="absolute z-50 top-full left-0 mt-2 w-[250px] hidden md:block">
                  <img
                    src={previewCard.png}
                    alt={previewCard.name}
                    className="rounded-lg shadow-2xl border border-gray-300 w-full object-cover"
                  />
                  {previewCard.back_png && (
                    <img
                      src={previewCard.back_png}
                      alt={previewCard.name + ' (back)'}
                      className="rounded-lg shadow-2xl border border-gray-300 w-full object-cover mt-2"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* Mobile preview modal */}
        {mobilePreviewCard && mobilePreviewCard.png && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={closeMobilePreview}
            style={{ cursor: "pointer" }}
          >
            <div>
              <img
                src={mobilePreviewCard.png}
                alt={mobilePreviewCard.name}
                className="max-h-full rounded-xl shadow-2xl border border-white/20"
                style={{ maxWidth: "90vw", maxHeight: "80vh" }}
              />
              {mobilePreviewCard.back_png && (
                <img
                  src={mobilePreviewCard.back_png}
                  alt={mobilePreviewCard.name + " (back)"}
                  className="max-h-full rounded-xl shadow-2xl border border-white/20 mt-2"
                  style={{ maxWidth: "90vw", maxHeight: "80vh" }}
                />
              )}
            </div>
          </div>
        )}
      </div>
      <div className="mt-auto pt-4 text-xs text-gray-400 opacity-70">
        Powered by Scryfall search.
      </div>
    </aside>
  );
}

// --- ManaCurvePanel: right sidebar with mana curve bar chart ---
function ManaCurvePanel({ deckA, deckB, mergedDeck, getCard, showMerge }) {
  // Color symbol mapping for legend
  const colorMap = {
    W: "#f9e79f", U: "#85c1e9", B: "#566573", R: "#e74c3c", G: "#27ae60", C: "#aaa",
  };
  // Color keys
  const colorKeys = ["W", "U", "B", "R", "G", "C"];

  // Helper: get mana value (CMC) from card object
  const getManaValue = (card) => {
    if (!card) return null;
    // Try to get from card data, fallback to parsing mana_cost
    if (typeof card.cmc === "number") return card.cmc;
    if (card.mana_cost) {
      // crude parse: count digits and X
      const tokens = card.mana_cost.match(/\{[^}]+\}/g) || [];
      let total = 0;
      tokens.forEach((tok) => {
        const inner = tok.replace(/[{}]/g, "").toUpperCase();
        if (/^\d+$/.test(inner)) total += parseInt(inner, 10);
        else if (inner === "X") total += 0;
        else total += 1;
      });
      return total;
    }
    return null;
  };

  // Helper: get color identity from card object
  const getColors = (card) => card?.color_identity || card?.colors || [];

  // Compute mana curve, color dist, and colorByCmc for each deck
  const computeStats = (deckMap) => {
    const curve = {};
    const colorDist = {};
    const colorByCmc = {};
    for (const [name, qty] of deckMap.entries()) {
      const card = getCard(name);
      const isLand = card?.type_line && card.type_line.includes("Land");
      const cmc = getManaValue(card);
      const colors = getColors(card);
      // lands go into special "Lands" bucket, others by CMC
      const key = isLand ? "Lands" : (cmc != null ? Math.min(Math.max(Math.round(cmc), 0), 7) : 0);
      curve[key] = (curve[key] || 0) + qty;
      // Color dist: count per color symbol
      if (colors && colors.length) {
        colors.forEach((col) => {
          colorDist[col] = (colorDist[col] || 0) + qty;
        });
      } else {
        colorDist["C"] = (colorDist["C"] || 0) + qty;
      }
      // Color by CMC or by "Lands"
      if (!colorByCmc[key]) colorByCmc[key] = {};
      if (colors && colors.length) {
        colors.forEach((col) => {
          colorByCmc[key][col] = (colorByCmc[key][col] || 0) + qty;
        });
      } else {
        colorByCmc[key]["C"] = (colorByCmc[key]["C"] || 0) + qty;
      }
    }
    return { curve, colorDist, colorByCmc };
  };

  // Convert mergedDeckRows to Map for stats
  const mergedMap = useMemo(() => {
    if (!mergedDeck) return new Map();
    const m = new Map();
    mergedDeck.forEach((row) => {
      m.set(row.name, row.qty);
    });
    return m;
  }, [mergedDeck]);

  // Individual stats for each deck
  const statsA = useMemo(() => computeStats(deckA), [deckA, getCard]);
  const statsB = useMemo(() => computeStats(deckB), [deckB, getCard]);
  const statsC = useMemo(() => computeStats(mergedMap), [mergedMap, getCard]);

  // Chart labels: "Lands" first, then 0..6, then "7+"
  const labels = ["Lands", "0", "1", "2", "3", "4", "5", "6", "7+"];
  // The corresponding keys in colorByCmc: "Lands", 0..6, 7
  const cmcKeys = ["Lands", 0, 1, 2, 3, 4, 5, 6, 7];

  // Generate stacked datasets per color for a deck stats/colorByCmc
  function makeStackedDatasets(stats, labelPrefix, stackKey) {
    return colorKeys.map((color) => ({
      label: color,
      data: cmcKeys.map((cmc) => stats.colorByCmc[cmc]?.[color] || 0),
      backgroundColor: colorMap[color],
      stack: stackKey,
      borderWidth: 0,
    }));
  }

  const dataA = {
    labels,
    datasets: makeStackedDatasets(statsA, "Deck A", "stackA"),
  };
  const dataB = {
    labels,
    datasets: makeStackedDatasets(statsB, "Deck B", "stackB"),
  };
  const dataC = {
    labels,
    datasets: makeStackedDatasets(statsC, "Merged", "stackC"),
  };

  // Hover state for color dist: 0 = A, 1 = B, 2 = C
  const [hovered, setHovered] = useState(null); // 0, 1, 2 or null

  // Chart options (common), now with stacked bars
  const chartOptions = (deckIndex) => ({
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: function (ctx) {
            return `${ctx.dataset.label}: ${ctx.parsed.y}`;
          },
        },
      },
    },
    scales: {
      x: { stacked: true, ticks: { color: "#ccc" }, grid: { color: "#333" } },
      y: { stacked: true, ticks: { color: "#ccc" }, grid: { color: "#333" }, beginAtZero: true },
    },
    onHover: (e, elements) => {
      if (elements && elements.length > 0) setHovered(deckIndex);
      else setHovered(null);
    },
  });

  // Helper to render a color distribution block
  function ColorDistributionBlock({ colorDist, stats }) {
    if (!colorDist) return null;

    // Prepare colorDist as array, and add 'Lands' if not present
    let distArr = Object.entries(colorDist);
    let hasLands = distArr.some(([col]) => col === "Lands");
    let landsCount = 0;
    if (stats && stats.curve && typeof stats.curve["Lands"] === "number") {
      landsCount = stats.curve["Lands"];
    }
    if (!hasLands) {
      distArr.push(["Lands", landsCount]);
    }

    // Scryfall color symbol order
    const colorOrder = ["W", "U", "B", "R", "G", "C"];
    // Sort so colors first, then 'Lands' last
    distArr.sort((a, b) => {
      if (a[0] === "Lands") return 1;
      if (b[0] === "Lands") return -1;
      const ia = colorOrder.indexOf(a[0]);
      const ib = colorOrder.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    // Helper for Scryfall SVGs
    const getManaIcon = (col) => {
      // Scryfall SVGs: e.g., https://svgs.scryfall.io/card-symbols/W.svg
      // For hybrid, phyrexian, etc., use same as ManaCost
      const code = col.replace("/", "");
      const url = `https://svgs.scryfall.io/card-symbols/${code}.svg`;
      // Only for color symbols
      if (colorOrder.includes(col)) {
        return (
          <img
            src={url}
            alt={col}
            title={col}
            className="h-4 w-4 inline-block"
            loading="lazy"
            style={{ verticalAlign: "text-bottom" }}
          />
        );
      }
      return null;
    };

    return (
      <div className="mt-2 mb-2">
        <div className="text-xs font-semibold mb-1">Color Distribution</div>
        <div className="flex flex-wrap gap-2">
          {distArr.map(([col, count]) => {
            if (col === "Lands") {
              // Special style for lands
              return (
                <span
                  key={col}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold"
                  style={{ background: "#ccc", color: "#222" }}
                >
                  {/* Land icon: use emoji if no image */}
                  <span
                    className="inline-block text-base"
                    role="img"
                    aria-label="Land"
                    style={{ lineHeight: "1" }}
                  >
                    🏞️
                  </span>
                  <span className="font-mono">{count}</span>
                </span>
              );
            }
            // For normal colors (WUBRGC)
            return (
              <span
                key={col}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold"
                style={{ background: colorMap[col] || "#aaa", color: "#222" }}
              >
                {getManaIcon(col) || col}
                <span className="font-mono">{count}</span>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <aside className="fixed right-0 top-0 z-30 h-full w-80 bg-slate-900 border-l border-white/10 shadow-lg flex flex-col p-4">
      <div className="mb-4 text-lg font-bold tracking-wide">Mana Curve</div>
      <div className="flex-1 space-y-6">
        <div>
          <div className="mb-2 text-xs font-semibold text-white/80">Deck A — CMC Curve</div>
          <Bar
            data={dataA}
            options={chartOptions(0)}
            height={120}
          />
          <ColorDistributionBlock colorDist={statsA.colorDist} stats={statsA} />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-white/80">Deck B — CMC Curve</div>
          <Bar
            data={dataB}
            options={chartOptions(1)}
            height={120}
          />
          <ColorDistributionBlock colorDist={statsB.colorDist} stats={statsB} />
        </div>
        {showMerge && (
          <div>
            <div className="mb-2 text-xs font-semibold text-white/80">Merged Deck — CMC Curve</div>
            <Bar
              data={dataC}
              options={chartOptions(2)}
              height={120}
            />
            <ColorDistributionBlock colorDist={statsC.colorDist} stats={statsC} />
          </div>
        )}
      </div>
      {/* Removed hovered colorDist block */}
    </aside>
  );
}

// --- Utilities --------------------------------------------------------------
// Normalize multi-face separators and spacing for card names
const normalizeName = (raw) => {
  if (!raw) return raw;
  let s = raw.trim();
  // Collapse 3+ slashes to two (some exports use '///')
  s = s.replace(/\/{3,}/g, "//");
  // Ensure single spaces around double-slash separators
  s = s.replace(/\s*\/\/\s*/g, " // ");
  // Collapse multiple spaces
  s = s.replace(/\s{2,}/g, " ");
  return s.trim();
};

const parseDeckText = (text) => {
  // Supports lines like: "3 Lightning Bolt", "1x Island"
  // Skips everything after a line starting with "Sideboard" (Arena export)
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const map = new Map();
  let inSideboard = false;

  for (const line of lines) {
    if (/^sideboard\b/i.test(line)) {
      inSideboard = true;
      break; // skip sideboard entirely per requirements
    }
    // Skip Arena headers like "Deck" or metadata lines
    if (/^(deck|companion)\b/i.test(line)) continue;

    // Match quantity and name
    const m = line.match(/^(\d+)x?\s+(.+)$/i);
    if (!m) continue;
    const qty = parseInt(m[1], 10) || 0;
    let name = m[2].trim();

    // Remove set/code in brackets like "[MOM]" or trailing comments
    name = name.replace(/\s*\[[^\]]+\]\s*$/, "");
    // Remove trailing parenthetical set codes and optional collector numbers, e.g. "(M11) 150" or "(151/280)"
    name = name.replace(/\s*\([^)]*\)\s*[\d/]*\s*$/, "");
    // Remove stray trailing collector numbers if any remain (e.g., "Lightning Bolt 150")
    name = name.replace(/\s+\d+\s*$/, "");

    // Normalize multi-face separators (e.g., '///' -> ' // ')
    name = normalizeName(name);

    // Collapse basic lands variants just by name (already the case)
    const prev = map.get(name) || 0;
    map.set(name, prev + qty);
  }

  return map; // Map<name, qty>
};

const unionNames = (a, b) => {
  const s = new Set([...a.keys(), ...b.keys()]);
  return [...s].sort((x, y) => x.localeCompare(y));
};

const batch = (arr, size = 75) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const CARD_CACHE_KEY = "mtg_deck_diff_cache_v2"; // bump to invalidate old entries without back face URLs
const loadCache = () => {
  try {
    const raw = localStorage.getItem(CARD_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
};
const saveCache = (obj) => {
  try {
    localStorage.setItem(CARD_CACHE_KEY, JSON.stringify(obj));
  } catch { }
};

const normalizeCard = (c) => {
  const faces = Array.isArray(c.card_faces) ? c.card_faces : null;
  const front = faces?.[0] || c;
  const back = faces?.[1] || null;

  const pick = (obj, pref = "big") => {
    const u = obj?.image_uris || {};
    if (pref === "big") return u.png || u.large || u.normal || u.small || null;
    if (pref === "small") return u.small || u.normal || u.large || u.png || null;
    if (pref === "art") return u.art_crop || u.normal || u.large || u.small || null;
    return null;
  };

  // Always prefer face-level images for DFCs
  const art = pick(front, "art") || pick(c, "art");
  const small = pick(front, "small") || pick(c, "small");
  const frontBig = pick(front, "big") || pick(c, "big");
  const backBig = back ? pick(back, "big") : null;

  return {
    id: c.id,
    name: c.name,
    mana_cost: front.mana_cost || c.mana_cost || "",
    type_line: c.type_line || front.type_line || "",
    oracle_text: front.oracle_text || c.oracle_text || "",
    colors: c.colors || front.colors || [],
    color_identity: c.color_identity || [],
    art,
    small,
    png: frontBig,
    back_png: backBig,
    scryfall_uri: c.scryfall_uri,
    set_name: c.set_name,
  };
};

const fetchCardsByNames = async (names, cache) => {
  const toFetch = names.filter((n) => !cache[n]);
  if (toFetch.length === 0) return cache;

  for (const chunk of batch(toFetch, 70)) {
    const body = {
      identifiers: chunk.map((name) => ({ name })),
    };
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("Scryfall collection fetch failed", res.status, json);
    }
    const notFound = new Set((json.not_found || []).map((i) => i.name?.toLowerCase()));

    // Index received cards by canonical name and by front-face name (case-insensitive)
    const received = json.data || [];
    const byCanonical = new Map();
    const byFront = new Map();
    for (const c of received) {
      const canon = (c.name || "").toLowerCase();
      if (canon) byCanonical.set(canon, c);
      const face0 = (c.card_faces?.[0]?.name || "").toLowerCase();
      if (face0) byFront.set(face0, c);
      // Always cache under canonical name
      const card = normalizeCard(c);
      cache[card.name] = { card, ts: Date.now() };
    }

    // For each requested name in this chunk, if it's not in cache yet but was resolved
    // in the collection response, map it to either canonical or front-face match.
    for (const origName of chunk) {
      if (cache[origName]) continue;
      const q = normalizeName(origName).toLowerCase();
      let c = byCanonical.get(q);
      if (!c) c = byFront.get(q);
      if (c) {
        const card = normalizeCard(c);
        cache[origName] = { card, ts: Date.now() };
      }
    }

    // Fallback for unresolved names: try multiple variants and endpoints
    for (const origName of chunk) {
      if (cache[origName]) continue; // already resolved above
      if (!notFound.has(origName.toLowerCase())) continue;

      const variants = [];
      const full = normalizeName(origName);
      const parts = full.split("//");
      const frontOnly = parts[0]?.trim();

      // Try exact then fuzzy on full, then exact then fuzzy on front-only (if present)
      variants.push({ kind: "exact", q: full });
      variants.push({ kind: "fuzzy", q: full });
      if (frontOnly && frontOnly.length > 0) {
        variants.push({ kind: "exact", q: frontOnly });
        variants.push({ kind: "fuzzy", q: frontOnly });
      }

      let resolved = false;
      for (const v of variants) {
        const url = v.kind === "exact"
          ? `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(v.q)}`
          : `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(v.q)}`;
        try {
          const r = await fetch(url);
          if (r.ok) {
            const c = await r.json();
            const card = normalizeCard(c);
            cache[origName] = { card, ts: Date.now() };
            resolved = true;
            break;
          }
        } catch (e) {
          console.error("Scryfall named lookup failed for", v.kind, v.q, e);
        }
      }

      // if still unresolved, mark as not found to avoid loops
      if (!resolved && !cache[origName]) {
        console.warn("Unresolved card name after fallbacks:", origName);
        cache[origName] = { card: null, ts: Date.now() };
      }
    }
  }
  saveCache(cache);
  return cache;
};

const useScryfall = (names) => {
  const [cache, setCache] = useState(() => loadCache());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const next = { ...cache };
      await fetchCardsByNames(names, next);
      if (mounted) setCache({ ...next });
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(names.sort())]);

  const get = (name) => cache[name]?.card || null;
  return { get, loading };
};

// StatusColors is not used for card background color in DeckColumn; instead, see below for per-card row coloring

const computeStatus = (qa, qb) => {
  if (qa && qb) {
    if (qa === qb) return "equal";
    return "diff";
  }
  if (qa && !qb) return "onlyA";
  if (!qa && qb) return "onlyB";
  return "equal";
};

const DiffBadge = ({ qa, qb, side }) => {
  if (qa == null || qb == null) return null;
  // Show delta relative to the current column: A shows (A - B), B shows (B - A)
  const raw = side === "B" ? (qb - qa) : (qa - qb);
  if (raw === 0) return null;
  const sign = raw > 0 ? "+" : "";
  return (
    <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold bg-black/40">
      {sign}
      {raw}
    </span>
  );
};

// Hover/Tap preview
const useHoverIntent = () => {
  const [active, setActive] = useState(null); // { name, img, rect }
  return {
    active,
    show: (payload) => setActive(payload),
    hide: () => setActive(null),
  };
};

// --- Mana Cost Rendering ----------------------------------------------------
const normalizeManaToken = (tok) => {
  // tok like "{1}", "{W}", "{W/U}", "{W/P}", "{2/U}", "{C}", "{S}", "{X}"
  const inner = tok.replace(/[{}]/g, "").toUpperCase();
  // Remove slashes for hybrid/phyrexian to match Scryfall SVG filenames (e.g., WU.svg, WP.svg, 2U.svg)
  return inner.replaceAll("/", "");
};

const ManaCost = ({ cost, className = "h-4 w-4" }) => {
  if (!cost) return null;
  const tokens = cost.match(/\{[^}]+\}/g) || [];
  if (tokens.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {tokens.map((t, i) => {
        const code = normalizeManaToken(t);
        const src = `https://svgs.scryfall.io/card-symbols/${code}.svg`;
        return (
          <img
            key={`${code}-${i}`}
            src={src}
            alt={t}
            title={t}
            className={`${className} inline-block`}
            loading="lazy"
          />
        );
      })}
    </span>
  );
};

const CardRow = ({ deckLabel, name, qty, qa, qb, getCard, side, deckB }) => {
  const card = getCard(name);
  const status = computeStatus(qa, qb);
  const [showModal, setShowModal] = useState(false);

  const onClickMobile = () => setShowModal(true);

  // Determine background color for card row
  // Old logic:
  // const bgColor =
  //   inBothSameQty ? "bg-gray-700" :
  //   onlyInB ? "bg-green-700" :
  //   onlyInA ? "bg-red-700" :
  //   diffQty ? "bg-yellow-700" : "bg-gray-800";
  // New logic: only apply bg-red-700 for onlyInA if deckB is loaded
  const inBothSameQty = qa && qb && qa === qb;
  const onlyInB = !qa && qb;
  const onlyInA = qa && !qb;
  const diffQty = qa && qb && qa !== qb;
  const bgColor =
    inBothSameQty ? "bg-gray-700" :
      onlyInB ? "bg-green-700" :
        (deckB && deckB.size > 0 && onlyInA) ? "bg-red-700" :
          diffQty ? "bg-yellow-700" : "bg-gray-800";

  return (
    <div
      className="group relative rounded-xl shadow-sm"
      role="listitem"
    >
      <div className={`relative overflow-hidden rounded-xl border border-white/10 ${bgColor}`}>
        {/* Background art */}
        {card?.art && (
          <div
            className="absolute inset-0 opacity-30 bg-cover bg-center"
            style={{ backgroundImage: `url(${card.art})` }}
            aria-hidden
          />
        )}
        {/* Scrim */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" aria-hidden />

        {/* Content */}
        <div className="relative z-10 flex items-center gap-3 p-2">
          {/* Thumbnail */}
          {card?.small ? (
            <img
              src={card.small}
              alt={name}
              className="h-12 w-9 rounded-md object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="h-12 w-9 rounded-md bg-black/30 ring-1 ring-white/10 flex items-center justify-center text-[10px] leading-tight text-white/60">
              N/A
            </div>
          )}

          {/* Quantity + Header */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <div className="truncate text-sm font-semibold tracking-wide">
                <span className="mr-2 opacity-90">{qty}×</span>
                <span title={name}>{name}</span>
              </div>
              <div className="ml-2 flex items-center">
                {/* Mana cost string (rendered as mana symbols) */}
                {card?.mana_cost && (
                  <ManaCost cost={card.mana_cost} />
                )}
                <DiffBadge qa={qa} qb={qb} side={side} />
              </div>
            </div>
            {/* Type line */}
            {card?.type_line && (
              <div className="truncate text-xs opacity-80">{card.type_line}</div>
            )}
          </div>

          {/* Tap to open modal on mobile */}
          {card?.png && (
            <button
              className="md:hidden ml-2 rounded-lg bg-black/30 px-2 py-1 text-xs ring-1 ring-white/10"
              onClick={onClickMobile}
            >
              Preview
            </button>
          )}
        </div>

        {/* Mobile modal */}
        {showModal && card?.png && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowModal(false)}>
            {card.back_png ? (
              <div className="flex gap-2">
                <img src={card.png} alt={`${name} (front)`} className="max-h-full rounded-xl" />
                <img src={card.back_png} alt={`${name} (back)`} className="max-h-full rounded-xl" />
              </div>
            ) : (
              <img src={card.png} alt={name} className="max-h-full rounded-xl" />
            )}
          </div>
        )}
      </div>
      {/* Desktop hover preview (absolute, not clipped) */}
      {card?.png && (
        <div className="pointer-events-none absolute top-2 right-2 z-50 hidden md:group-hover:block">
          {card.back_png ? (
            <div className="flex gap-2 rounded-xl border border-white/10 bg-black/20 p-2 shadow-2xl">
              <img src={card.png} alt={`${name} (front)`} className="h-80 rounded-lg" />
              <img src={card.back_png} alt={`${name} (back)`} className="h-80 rounded-lg" />
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/20 p-2 shadow-2xl">
              <img src={card.png} alt={name} className="h-80 rounded-lg" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DeckColumn = ({
  title,
  deckMap,
  otherDeckMap,
  getCard,
  side,
  showMerge = false,
  eligibleForMerge = () => false,
  selectedForMerge = {},
  onCardClick = null,
  addCardToDeck, // for drag-and-drop
  deckB, // pass deckB for merge overlay logic
}) => {
  const names = useMemo(() => [...deckMap.keys()].sort((a, b) => a.localeCompare(b)), [deckMap]);
  // Drag-and-drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
  };
  const handleDrop = (e) => {
    e.preventDefault();
    if (!addCardToDeck) return;
    const cardStr = e.dataTransfer.getData('card');
    if (cardStr) {
      try {
        const card = JSON.parse(cardStr);
        addCardToDeck(side, card);
      } catch { }
    }
  };
  return (
    <div
      className="space-y-2"
      role="list"
      aria-label={`${title} cards`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {names.map((name) => {
        // When showMerge is true, hide cards present in both A and B, and hide those selected for merge
        if (showMerge) {
          if (eligibleForMerge(name) && !selectedForMerge[name]) {
            // Eligible and not selected: show with highlight
            // (handled below)
          } else if (selectedForMerge[name]) {
            // Selected for merge: hide from A/B columns
            return null;
          } else if (eligibleForMerge(name)) {
            // Defensive: already handled above
          } else if (otherDeckMap.has(name) && deckMap.has(name)) {
            // Present in both decks but not eligible for merge: hide
            return null;
          }
        }
        // Visual highlight for eligible-for-merge cards
        const isEligible = showMerge && eligibleForMerge(name) && !selectedForMerge[name];
        // Only apply opacity overlay if deckB is loaded
        const rowOpacity = (deckB && deckB.size > 0 && showMerge && eligibleForMerge(name) && selectedForMerge[name])
          ? "opacity-40 pointer-events-none"
          : "";
        return (
          <div
            key={`${side}-${name}`}
            className={isEligible ? "ring-2 ring-blue-400 rounded-xl" : ""}
            style={rowOpacity ? { opacity: 0.4, pointerEvents: "none" } : undefined}
            onClick={isEligible && onCardClick ? () => onCardClick(name) : undefined}
          >
            <CardRow
              deckLabel={title}
              name={name}
              qty={deckMap.get(name)}
              qa={side === "A" ? deckMap.get(name) : otherDeckMap.get(name)}
              qb={side === "B" ? deckMap.get(name) : otherDeckMap.get(name)}
              getCard={getCard}
              side={side}
              deckB={deckB}
            />
          </div>
        );
      })}
    </div>
  );
};

const FileOrPaste = ({ label, value, setValue, example, onNameChange }) => {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setFileName(f.name || "");
    if (onNameChange) onNameChange(f.name || "");
    setValue(text);
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold opacity-90">
          {fileName ? fileName : label}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-black/30 px-2 py-1 text-xs ring-1 ring-white/10"
          >
            Load .txt
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={onFile}
          />
        </div>
      </div>
      <textarea
        className="h-40 w-full resize-y rounded-xl bg-black/40 p-3 font-mono text-sm ring-1 ring-white/10 focus:outline-none"
        placeholder={example}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
};

export default function App() {
  // Handler for drag-and-drop: add card to deck by name
  const addCardToDeck = (deckName, cardObj) => {
    const name = cardObj?.name;
    if (!name) return;
    if (deckName === "A") {
      setDeckAText((prev) => {
        const lines = prev.split(/\r?\n/);
        let found = false;
        const nextLines = lines.map((line) => {
          const m = line.match(/^(\d+)x?\s+(.+)$/i);
          if (m && normalizeName(m[2]) === normalizeName(name)) {
            found = true;
            return `${parseInt(m[1], 10) + 1} ${name}`;
          }
          return line;
        });
        if (!found) nextLines.push(`1 ${name}`);
        return nextLines.filter((l) => l.trim().length > 0).join("\n");
      });
    } else if (deckName === "B") {
      setDeckBText((prev) => {
        const lines = prev.split(/\r?\n/);
        let found = false;
        const nextLines = lines.map((line) => {
          const m = line.match(/^(\d+)x?\s+(.+)$/i);
          if (m && normalizeName(m[2]) === normalizeName(name)) {
            found = true;
            return `${parseInt(m[1], 10) + 1} ${name}`;
          }
          return line;
        });
        if (!found) nextLines.push(`1 ${name}`);
        return nextLines.filter((l) => l.trim().length > 0).join("\n");
      });
    } else if (deckName === "C") {
      // Add to merged deck: for now, add to A (as above)
      setDeckAText((prev) => {
        const lines = prev.split(/\r?\n/);
        let found = false;
        const nextLines = lines.map((line) => {
          const m = line.match(/^(\d+)x?\s+(.+)$/i);
          if (m && normalizeName(m[2]) === normalizeName(name)) {
            found = true;
            return `${parseInt(m[1], 10) + 1} ${name}`;
          }
          return line;
        });
        if (!found) nextLines.push(`1 ${name}`);
        return nextLines.filter((l) => l.trim().length > 0).join("\n");
      });
    }
  };
  const [deckAText, setDeckAText] = useState("");
  const [deckBText, setDeckBText] = useState("");
  const [deckAName, setDeckAName] = useState("Deck A");
  const [deckBName, setDeckBName] = useState("Deck B");
  const [showMerge, setShowMerge] = useState(false);
  const [mergeChoices, setMergeChoices] = useState(() => loadMergeChoices());
  // --- New state for cards selected for merge
  const [selectedForMerge, setSelectedForMerge] = useState({});

  const deckA = useMemo(() => parseDeckText(deckAText), [deckAText]);
  const deckB = useMemo(() => parseDeckText(deckBText), [deckBText]);

  const allNames = useMemo(() => unionNames(deckA, deckB), [deckA, deckB]);
  const { get, loading } = useScryfall(allNames);

  const equalCount = useMemo(() => allNames.filter((n) => computeStatus(deckA.get(n), deckB.get(n)) === "equal").length, [allNames, deckA, deckB]);
  const onlyA = useMemo(() => allNames.filter((n) => computeStatus(deckA.get(n), deckB.get(n)) === "onlyA").length, [allNames, deckA, deckB]);
  const onlyB = useMemo(() => allNames.filter((n) => computeStatus(deckA.get(n), deckB.get(n)) === "onlyB").length, [allNames, deckA, deckB]);
  const diffs = useMemo(() => allNames.filter((n) => computeStatus(deckA.get(n), deckB.get(n)) === "diff").length, [allNames, deckA, deckB]);

  // Compute merged deck rows for display
  // --- Custom mergedDeckRows for merge mode with selectedForMerge
  const mergedDeckRows = useMemo(() => {
    if (!showMerge) {
      return computeMergedDeck(deckA, deckB, mergeChoices);
    }
    // Cards present in both decks (intersection)
    const both = allNames.filter(
      (n) => deckA.has(n) && deckB.has(n)
    );
    // Cards selected for merge (from either deck, not already in both)
    const selected = Object.keys(selectedForMerge).filter(
      (n) =>
        selectedForMerge[n] &&
        ((deckA.has(n) && !deckB.has(n)) || (deckB.has(n) && !deckA.has(n)))
    );
    const mergedNames = [...both, ...selected].sort((a, b) => a.localeCompare(b));
    return mergedNames.map((name) => {
      const qa = deckA.get(name) || 0;
      const qb = deckB.get(name) || 0;
      // For cards in both, use merged computation
      if (deckA.has(name) && deckB.has(name)) {
        let options = [];
        let defaultChoice = null;
        if (qa === qb) {
          options = ["A", "B"];
          defaultChoice = "A";
        } else {
          options = ["A", "B", "Both"];
          defaultChoice = "Both";
        }
        const choice = mergeChoices[name] || defaultChoice;
        let qty = 0;
        if (choice === "A") qty = qa;
        else if (choice === "B") qty = qb;
        else if (choice === "Both") qty = qa + qb;
        return { name, qty, choice, options, qa, qb };
      }
      // For cards selected from A or B only
      let options = [];
      let defaultChoice = null;
      if (qa > 0) {
        options = ["A"];
        defaultChoice = "A";
      } else if (qb > 0) {
        options = ["B"];
        defaultChoice = "B";
      }
      const choice = mergeChoices[name] || defaultChoice;
      let qty = 0;
      if (choice === "A") qty = qa;
      else if (choice === "B") qty = qb;
      return { name, qty, choice, options, qa, qb };
    }).filter((row) => row.qty > 0);
  }, [showMerge, deckA, deckB, mergeChoices, selectedForMerge, allNames]);

  // Save mergeChoices to localStorage when changed
  useEffect(() => {
    saveMergeChoices(mergeChoices);
  }, [mergeChoices]);

  // Reset merge choices if deckA or deckB changes drastically
  useEffect(() => {
    // Remove merge choices for cards that no longer exist
    const validNames = new Set(unionNames(deckA, deckB));
    const filtered = {};
    for (const k in mergeChoices) {
      if (validNames.has(k)) filtered[k] = mergeChoices[k];
    }
    if (Object.keys(filtered).length !== Object.keys(mergeChoices).length) {
      setMergeChoices(filtered);
    }
    // Remove selectedForMerge for names that no longer exist
    setSelectedForMerge((prev) => {
      const filteredSel = {};
      for (const k in prev) {
        if (validNames.has(k)) filteredSel[k] = prev[k];
      }
      return filteredSel;
    });
    // eslint-disable-next-line
  }, [deckA, deckB]);

  // Handler for merge choice change
  const handleMergeChoice = (name, value) => {
    setMergeChoices((prev) => ({ ...prev, [name]: value }));
  };

  // --- Merge logic helpers
  // A card is eligible for merge selection if it is present in only one deck (A or B, not both)
  const eligibleForMerge = (name) =>
    (deckA.has(name) && !deckB.has(name)) || (deckB.has(name) && !deckA.has(name));
  // Toggle selection for merge
  const handleToggleSelectForMerge = (name) => {
    setSelectedForMerge((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  // --- Handler for CardSearchPanel add ---
  const handleAddCard = (cardObj, deck) => {
    // cardObj: Scryfall card object
    const name = cardObj.name;
    if (deck === "A") {
      setDeckAText((prev) => {
        // Try to find line for this card, if so, bump qty, else add
        const lines = prev.split(/\r?\n/);
        let found = false;
        const nextLines = lines.map((line) => {
          const m = line.match(/^(\d+)x?\s+(.+)$/i);
          if (m && normalizeName(m[2]) === normalizeName(name)) {
            found = true;
            return `${parseInt(m[1], 10) + 1} ${name}`;
          }
          return line;
        });
        if (!found) nextLines.push(`1 ${name}`);
        return nextLines.filter((l) => l.trim().length > 0).join("\n");
      });
    } else if (deck === "B") {
      setDeckBText((prev) => {
        const lines = prev.split(/\r?\n/);
        let found = false;
        const nextLines = lines.map((line) => {
          const m = line.match(/^(\d+)x?\s+(.+)$/i);
          if (m && normalizeName(m[2]) === normalizeName(name)) {
            found = true;
            return `${parseInt(m[1], 10) + 1} ${name}`;
          }
          return line;
        });
        if (!found) nextLines.push(`1 ${name}`);
        return nextLines.filter((l) => l.trim().length > 0).join("\n");
      });
    } else if (deck === "C") {
      // Add to merged deck: add to both A and B, or just to merged state?
      // We'll add to both for simplicity (if not present), or bump in A.
      setDeckAText((prev) => {
        const lines = prev.split(/\r?\n/);
        let found = false;
        const nextLines = lines.map((line) => {
          const m = line.match(/^(\d+)x?\s+(.+)$/i);
          if (m && normalizeName(m[2]) === normalizeName(name)) {
            found = true;
            return `${parseInt(m[1], 10) + 1} ${name}`;
          }
          return line;
        });
        if (!found) nextLines.push(`1 ${name}`);
        return nextLines.filter((l) => l.trim().length > 0).join("\n");
      });
    }
  };

  // Only show merge toggle if both decks are loaded (non-empty)
  const canShowMerge = deckA.size > 0 && deckB.size > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-white">
      {/* Left: CardSearchPanel */}
      <CardSearchPanel onAddCard={handleAddCard} getCard={get} />
      {/* Right: ManaCurvePanel */}
      <ManaCurvePanel
        deckA={deckA}
        deckB={deckB}
        mergedDeck={mergedDeckRows}
        getCard={get}
        showMerge={showMerge}
      />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur ml-72 mr-80">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-wide">MTG Deck Diff</h1>
            <div className="text-xs opacity-80">
              {loading ? "Fetching card data…" : "Ready"}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 ml-72 mr-80">
        {/* Inputs */}
        <div className="grid gap-4 md:grid-cols-2">
          <FileOrPaste
            label="Deck A (First)"
            value={deckAText}
            setValue={setDeckAText}
            onNameChange={setDeckAName}
            example={`Example:\n4 Lightning Bolt\n4 Goblin Guide\n2 Searing Blaze\n\nSideboard\n3 Smash to Smithereens`}
          />
          <FileOrPaste
            label="Deck B (Second)"
            value={deckBText}
            setValue={setDeckBText}
            onNameChange={setDeckBName}
            example={`Example:\n4 Lightning Bolt\n3 Goblin Guide\n3 Monastery Swiftspear`}
          />
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {/* "Only in A" box: always show if Deck A is loaded; border only if Deck B is loaded */}
          {deckA.size > 0 && (
            <div
              className={`rounded-xl ${deckB.size > 0 ? 'border border-white/10' : ''} bg-red-800 p-3 text-center`}
            >
              <div className="text-xs uppercase opacity-80">Only in A</div>
              <div className="text-xl font-bold">{onlyA}</div>
            </div>
          )}
          {(deckA.size > 0 && deckB.size > 0) && (
            <>
              <div className="rounded-xl border border-white/10 bg-gray-800 p-3 text-center">
                <div className="text-xs uppercase opacity-80">Equal Quantity</div>
                <div className="text-xl font-bold">{equalCount}</div>
              </div>
              {/* Only in B */}
              <div className="rounded-xl border border-white/10 bg-green-800 p-3 text-center">
                <div className="text-xs uppercase opacity-80">Only in B</div>
                <div className="text-xl font-bold">{onlyB}</div>
              </div>
              {/* Different Quantity */}
              <div className="rounded-xl border border-white/10 bg-yellow-700 p-3 text-center">
                <div className="text-xs uppercase opacity-80">Different Quantity</div>
                <div className="text-xl font-bold">{diffs}</div>
              </div>
            </>
          )}
          {canShowMerge && (
            <div className="rounded-xl border border-white/10 bg-blue-800 p-3 text-center cursor-pointer select-none"
              role="button"
              tabIndex={0}
              aria-pressed={showMerge}
              onClick={() => setShowMerge((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") setShowMerge((v) => !v);
              }}
            >
              <div className="text-xs uppercase opacity-80 flex items-center justify-center gap-1">
                <svg className="inline h-4 w-4 text-blue-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h10M7 12h10M7 17h6" />
                </svg>
                Merge
              </div>
              <div className="text-xl font-bold">{showMerge ? "On" : "Off"}</div>
            </div>
          )}
        </div>

        {/* Columns */}
        <div
          className={
            showMerge
              ? "grid gap-6 md:grid-cols-3"
              : deckBName && deckB && deckB.size > 0
                ? "grid gap-6 md:grid-cols-2"
                : "grid gap-6 md:grid-cols-1"
          }
        >
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-white/90">{deckAName}</h2>
            <DeckColumn
              title={deckAName}
              deckMap={deckA}
              otherDeckMap={deckB}
              getCard={get}
              side="A"
              showMerge={showMerge}
              eligibleForMerge={eligibleForMerge}
              selectedForMerge={selectedForMerge}
              onCardClick={showMerge ? handleToggleSelectForMerge : undefined}
              addCardToDeck={addCardToDeck}
              deckB={deckB}
            />
          </section>
          {deckBName && deckB && deckB.size > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold tracking-wide text-white/90">{deckBName}</h2>
              <DeckColumn
                title={deckBName}
                deckMap={deckB}
                otherDeckMap={deckA}
                getCard={get}
                side="B"
                showMerge={showMerge}
                eligibleForMerge={eligibleForMerge}
                selectedForMerge={selectedForMerge}
                onCardClick={showMerge ? handleToggleSelectForMerge : undefined}
                addCardToDeck={addCardToDeck}
                deckB={deckB}
              />
            </section>
          )}
          {showMerge && (
            <section>
              <h2 className="mb-2 text-sm font-semibold tracking-wide text-white/90 flex items-center gap-2">
                <svg className="inline h-5 w-5 text-blue-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h10M7 12h10M7 17h6" />
                </svg>
                Merged Deck
                <button
                  className="ml-auto rounded-lg bg-blue-700 hover:bg-blue-600 px-3 py-1 text-xs font-semibold ring-1 ring-blue-400 transition-colors"
                  onClick={() => downloadMergedDeck(mergedDeckRows)}
                  type="button"
                >
                  Download .txt
                </button>
              </h2>
              <div className="space-y-2" role="list" aria-label="Merged deck cards">
                {mergedDeckRows.map((row) => {
                  const card = get(row.name);
                  // For cards with multiple options, show a selector
                  const needsSelector = row.options.length > 1;
                  return (
                    <div key={`merge-${row.name}`} className="group relative rounded-xl shadow-sm">
                      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-blue-900/50">
                        {/* Background art */}
                        {card?.art && (
                          <div
                            className="absolute inset-0 opacity-30 bg-cover bg-center"
                            style={{ backgroundImage: `url(${card.art})` }}
                            aria-hidden
                          />
                        )}
                        {/* Scrim */}
                        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-blue-900/20" aria-hidden />
                        {/* Content */}
                        <div className="relative z-10 flex items-center gap-3 p-2">
                          {/* Thumbnail */}
                          {card?.small ? (
                            <img
                              src={card.small}
                              alt={row.name}
                              className="h-12 w-9 rounded-md object-cover ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="h-12 w-9 rounded-md bg-black/30 ring-1 ring-white/10 flex items-center justify-center text-[10px] leading-tight text-white/60">
                              N/A
                            </div>
                          )}
                          {/* Quantity + Header */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <div className="truncate text-sm font-semibold tracking-wide">
                                <span className="mr-2 opacity-90">{row.qty}×</span>
                                <span title={row.name}>{row.name}</span>
                              </div>
                              <div className="ml-2 flex items-center">
                                {/* Mana cost string (rendered as mana symbols) */}
                                {card?.mana_cost && <ManaCost cost={card.mana_cost} />}
                              </div>
                            </div>
                            {/* Type line */}
                            {card?.type_line && (
                              <div className="truncate text-xs opacity-80">{card.type_line}</div>
                            )}
                          </div>
                          {/* Choice selector for diffs */}
                          {needsSelector && (
                            <div className="ml-2 flex gap-1">
                              {row.options.map((opt) => {
                                let color, label;
                                if (opt === "A") {
                                  color = "bg-red-700 hover:bg-red-600 ring-red-400";
                                  label = `A${row.qa !== row.qb ? ` (${row.qa})` : ""}`;
                                } else if (opt === "B") {
                                  color = "bg-green-700 hover:bg-green-600 ring-green-400";
                                  label = `B${row.qa !== row.qb ? ` (${row.qb})` : ""}`;
                                } else if (opt === "Both") {
                                  color = "bg-blue-700 hover:bg-blue-600 ring-blue-400";
                                  label = `Both (${row.qa + row.qb})`;
                                }
                                return (
                                  <button
                                    key={opt}
                                    className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 transition-colors
                                      ${color} ${row.choice === opt ? "opacity-100" : "opacity-60"}
                                    `}
                                    onClick={() => handleMergeChoice(row.name, opt)}
                                    type="button"
                                    aria-pressed={row.choice === opt}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs opacity-60">
          Built with Scryfall data. This product uses the Scryfall API but is not produced or endorsed by Scryfall.
        </div>
        <div className="mt-4 text-center text-xs">
          <a
            href="https://github.com/htaschne/mtg-deck-diff"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 17.07 3.633 16.7 3.633 16.7c-1.087-.744.084-.729.084-.729 1.205.084 1.84 1.236 1.84 1.236 1.07 1.834 2.807 1.304 3.492.997.108-.776.418-1.304.762-1.604-2.665-.304-5.466-1.334-5.466-5.931 0-1.31.468-2.382 1.236-3.221-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.301 1.23a11.48 11.48 0 0 1 3.003-.404c1.018.005 2.045.138 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.655 1.653.243 2.873.12 3.176.77.839 1.234 1.911 1.234 3.221 0 4.609-2.803 5.625-5.475 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.286 0 .321.216.694.825.576C20.565 22.092 24 17.592 24 12.297 24 5.67 18.627.297 12 .297z" />
            </svg>
            <span>Created by @htaschne</span>
          </a>
        </div>
      </main>
    </div>
  );
}
