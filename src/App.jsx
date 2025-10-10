import React, { useMemo, useState, useEffect, useRef } from "react";

// --- Utilities --------------------------------------------------------------
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

const CARD_CACHE_KEY = "mtg_deck_diff_cache_v1";
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

// pick front face and a few useful fields; prefer English printing
const normalizeCard = (c) => {
  const front = c.card_faces?.[0] || c;
  const imageUris = front.image_uris || c.image_uris || {};
  const art = imageUris.art_crop || imageUris.normal || imageUris.large || imageUris.small;
  const small = imageUris.small || imageUris.normal || imageUris.png || art;
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
    png: imageUris.png || null,
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
    const notFound = new Set((json.not_found || []).map((i) => i.name?.toLowerCase()));
    for (const c of json.data || []) {
      const card = normalizeCard(c);
      cache[card.name] = { card, ts: Date.now() };
    }
    // mark not found to avoid repeated refetch this session
    for (const name of chunk) {
      if (!cache[name] && notFound.has(name.toLowerCase())) {
        cache[name] = { card: null, ts: Date.now() };
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

const StatusColors = {
  equal: "bg-gray-700",
  onlyA: "bg-red-700",
  onlyB: "bg-green-700",
  diff: "bg-yellow-600",
};

const computeStatus = (qa, qb) => {
  if (qa && qb) {
    if (qa === qb) return "equal";
    return "diff";
  }
  if (qa && !qb) return "onlyA";
  if (!qa && qb) return "onlyB";
  return "equal";
};

const DiffBadge = ({ qa, qb }) => {
  if (qa == null || qb == null) return null;
  const delta = qa - qb; // as requested: first deck minus second
  if (delta === 0) return null;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold bg-black/40">
      {sign}
      {delta}
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

const CardRow = ({ deckLabel, name, qty, qa, qb, getCard, side }) => {
  const card = getCard(name);
  const status = computeStatus(qa, qb);
  const [showModal, setShowModal] = useState(false);

  const onClickMobile = () => setShowModal(true);

  return (
    <div
      className="group relative rounded-xl shadow-sm"
      role="listitem"
    >
      <div className={`relative overflow-hidden rounded-xl border border-white/10 ${StatusColors[status]}`}>
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
            <div className="h-12 w-9 rounded-md bg-black/30 ring-1 ring-white/10" />
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
                <DiffBadge qa={qa} qb={qb} />
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
            <img src={card.png} alt={name} className="max-h-full rounded-xl" />
          </div>
        )}
      </div>
      {/* Desktop hover preview (absolute, not clipped) */}
      {card?.png && (
        <div className="pointer-events-none absolute top-2 right-2 z-50 hidden md:group-hover:block rounded-xl border border-white/10 shadow-2xl">
          <img src={card.png} alt={name} className="h-80 rounded-xl" />
        </div>
      )}
    </div>
  );
};

const DeckColumn = ({ title, deckMap, otherDeckMap, getCard, side }) => {
  const names = useMemo(() => [...deckMap.keys()].sort((a, b) => a.localeCompare(b)), [deckMap]);
  return (
    <div className="space-y-2" role="list" aria-label={`${title} cards`}>
      {names.map((name) => (
        <CardRow
          key={`${side}-${name}`}
          deckLabel={title}
          name={name}
          qty={deckMap.get(name)}
          qa={side === "A" ? deckMap.get(name) : otherDeckMap.get(name)}
          qb={side === "B" ? deckMap.get(name) : otherDeckMap.get(name)}
          getCard={getCard}
          side={side}
        />
      ))}
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
  const [deckAText, setDeckAText] = useState("");
  const [deckBText, setDeckBText] = useState("");
  const [deckAName, setDeckAName] = useState("Deck A");
  const [deckBName, setDeckBName] = useState("Deck B");

  const deckA = useMemo(() => parseDeckText(deckAText), [deckAText]);
  const deckB = useMemo(() => parseDeckText(deckBText), [deckBText]);

  const allNames = useMemo(() => unionNames(deckA, deckB), [deckA, deckB]);
  const { get, loading } = useScryfall(allNames);

  const equalCount = useMemo(() => allNames.filter((n) => computeStatus(deckA.get(n), deckB.get(n)) === "equal").length, [allNames, deckA, deckB]);
  const onlyA = useMemo(() => allNames.filter((n) => computeStatus(deckA.get(n), deckB.get(n)) === "onlyA").length, [allNames, deckA, deckB]);
  const onlyB = useMemo(() => allNames.filter((n) => computeStatus(deckA.get(n), deckB.get(n)) === "onlyB").length, [allNames, deckA, deckB]);
  const diffs = useMemo(() => allNames.filter((n) => computeStatus(deckA.get(n), deckB.get(n)) === "diff").length, [allNames, deckA, deckB]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-wide">MTG Deck Diff</h1>
            <div className="text-xs opacity-80">
              {loading ? "Fetching card data…" : "Ready"}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
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
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-gray-800 p-3 text-center">
            <div className="text-xs uppercase opacity-80">Equal Quantity</div>
            <div className="text-xl font-bold">{equalCount}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-red-800 p-3 text-center">
            <div className="text-xs uppercase opacity-80">Only in A</div>
            <div className="text-xl font-bold">{onlyA}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-green-800 p-3 text-center">
            <div className="text-xs uppercase opacity-80">Only in B</div>
            <div className="text-xl font-bold">{onlyB}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-yellow-700 p-3 text-center">
            <div className="text-xs uppercase opacity-80">Different Quantity</div>
            <div className="text-xl font-bold">{diffs}</div>
          </div>
        </div>

        {/* Columns */}
        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-white/90">{deckAName}</h2>
            <DeckColumn
              title={deckAName}
              deckMap={deckA}
              otherDeckMap={deckB}
              getCard={get}
              side="A"
            />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-white/90">{deckBName}</h2>
            <DeckColumn
              title={deckBName}
              deckMap={deckB}
              otherDeckMap={deckA}
              getCard={get}
              side="B"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs opacity-60">
          Built with Scryfall data. This product uses the Scryfall API but is not produced or endorsed by Scryfall.
        </div>
      </main>
    </div>
  );
}
