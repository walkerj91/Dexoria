/**
 * set-tracker.js
 * Dexoria — Set Tracker page
 *
 * Fetches card lists from TCGDex, persists collected state to
 * localStorage (keyed per Supabase user ID when logged in, or
 * anonymous key otherwise), and renders an interactive card grid.
 */

import { supabase } from './supabaseClient.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';

// Your Dexoria sets — update as new sets are added
// Add a `series` field to group sets into collapsible sections
const TRACKED_SETS = [
  { id: 'me05',   name: 'Pitch Black',        year: '2026', series: 'Mega Evolution Series', officialCount: 120 },
  { id: 'me04',   name: 'Chaos Rising',       year: '2026', series: 'Mega Evolution Series', officialCount: 198 },
  { id: 'me03',   name: 'Perfect Order',      year: '2026', series: 'Mega Evolution Series', officialCount: 203 },
  { id: 'me02.5', name: 'Ascended Heroes',    year: '2026', series: 'Mega Evolution Series', officialCount: 295 },
  { id: 'me02',   name: 'Phantasmal Flames',  year: '2025', series: 'Mega Evolution Series', officialCount: 214 },
  { id: 'me01',   name: 'Mega Evolution',     year: '2025', series: 'Mega Evolution Series', officialCount: 188 },

  { id: 'sv10.5b', name: 'Black Bolt',           year: '2025', series: 'Scarlet & Violet', officialCount: 90  },
  { id: 'sv10.5a', name: 'White Flare',          year: '2025', series: 'Scarlet & Violet', officialCount: 90  },
  { id: 'sv10',    name: 'Destined Rivals',      year: '2025', series: 'Scarlet & Violet', officialCount: 190 },
  { id: 'sv09',    name: 'Journey Together',     year: '2025', series: 'Scarlet & Violet', officialCount: 190 },
  { id: 'sv08.5',  name: 'Prismatic Evolutions', year: '2025', series: 'Scarlet & Violet', officialCount: 131 },
  { id: 'sv08',    name: 'Surging Sparks',       year: '2024', series: 'Scarlet & Violet', officialCount: 191 },
  { id: 'sv07',    name: 'Stellar Crown',        year: '2024', series: 'Scarlet & Violet', officialCount: 175 },
  { id: 'sv06.5',  name: 'Shrouded Fable',       year: '2024', series: 'Scarlet & Violet', officialCount: 99  },
  { id: 'sv06',    name: 'Twilight Masquerade',  year: '2024', series: 'Scarlet & Violet', officialCount: 167 },
  { id: 'sv05',    name: 'Temporal Forces',      year: '2024', series: 'Scarlet & Violet', officialCount: 162 },
  { id: 'sv04',    name: 'Paradox Rift',         year: '2024', series: 'Scarlet & Violet', officialCount: 266 },
  { id: 'sv03.5',  name: '151',                  year: '2023', series: 'Scarlet & Violet', officialCount: 207 },
  { id: 'sv03',    name: 'Obsidian Flames',      year: '2023', series: 'Scarlet & Violet', officialCount: 197 },
  { id: 'sv02',    name: 'Paldea Evolved',       year: '2023', series: 'Scarlet & Violet', officialCount: 193 },
  { id: 'sv01',    name: 'Scarlet & Violet Base', year: '2023', series: 'Scarlet & Violet', officialCount: 198 },


  { id: 'swsh12.5', name: 'Crown Zenith',         year: '2023', series: 'Sword & Shield', officialCount: 159 },
  { id: 'swsh10',   name: 'Astral Radiance',      year: '2023', series: 'Sword & Shield', officialCount: 189 },
  { id: 'swsh09',   name: 'Brilliant Stars',      year: '2022', series: 'Sword & Shield', officialCount: 186 },
  { id: 'swsh08',   name: 'Fusion Strike',        year: '2021', series: 'Sword & Shield', officialCount: 264 },
  { id: 'swsh07',   name: 'Evolving Skies',       year: '2021', series: 'Sword & Shield', officialCount: 203 },
  { id: 'swsh06',   name: 'Chilling Reign',       year: '2020', series: 'Sword & Shield', officialCount: 198 },
  { id: 'swsh05',   name: 'Battle Styles',        year: '2020', series: 'Sword & Shield', officialCount: 163 },
  { id: 'swsh04',   name: 'Vivid Voltage',        year: '2020', series: 'Sword & Shield', officialCount: 185 },
  { id: 'swsh03',   name: 'Darkness Ablaze',      year: '2020', series: 'Sword & Shield', officialCount: 189 },
  { id: 'swsh02',   name: 'Rebel Clash',          year: '2019', series: 'Sword & Shield', officialCount: 192 },
  { id: 'swsh01',   name: 'Sword & Shield Base',  year: '2019', series: 'Sword & Shield', officialCount: 202 },

  { id: 'base1', name: 'Base Set',    year: '1999', series: 'Base Set', officialCount: 102, holoCount: 16 },
  { id: 'base2', name: 'Jungle',      year: '1999', series: 'Base Set', officialCount: 64,  holoCount: 16 },
  { id: 'base3', name: 'Fossil',      year: '1999', series: 'Base Set', officialCount: 62,  holoCount: 15 },
  { id: 'base4', name: 'Base Set 2',  year: '2000', series: 'Base Set', officialCount: 130, holoCount: null },
  { id: 'base5', name: 'Team Rocket', year: '2000', series: 'Base Set', officialCount: 82,  holoCount: null },
];

const CACHE_PREFIX      = 'dexoria_set_v7_';  // bumped: fix || vs ?? for rarity fallback
const RARITY_CACHE_PREFIX = 'dexoria_rarity_v1_';
const PRICE_CACHE_PREFIX  = 'dexoria_price_v1_';
const CACHE_TTL         = 60 * 60 * 1000;          // 1 hour per set
const RARITY_CACHE_TTL  = 7 * 24 * 60 * 60 * 1000; // 7 days — rarity never changes
const PRICE_CACHE_TTL   = 12 * 60 * 60 * 1000;     // 12 hours — Cardmarket updates daily
const STORAGE_KEY       = 'dexoria_tracker_collected';

// ─── Pricing / FX ─────────────────────────────────────────────────────────────
// Collection value uses Cardmarket (EUR) — the closer market proxy for a UK
// collector than TCGPlayer (USD) — converted to GBP via Frankfurter (ECB rates,
// free, no key, no rate limit). Not every card has pricing data (TCGDex omits
// it for some older EX/Full Art cards, brand-new releases, and regional
// exclusives) — those are excluded from the total rather than counted as £0.

const FX_CACHE_KEY   = 'dexoria_fx_eur_gbp_v1';
const FX_CACHE_TTL   = 24 * 60 * 60 * 1000; // ECB publishes once per business day
const FX_FALLBACK_RATE = 0.87;              // used only if the API is unreachable and nothing is cached

async function getEurToGbpRate() {
  try {
    const cached = localStorage.getItem(FX_CACHE_KEY);
    if (cached) {
      const { rate, ts } = JSON.parse(cached);
      if (Date.now() - ts < FX_CACHE_TTL) return rate;
    }
  } catch { /* ignore */ }

  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=EUR&to=GBP');
    if (res.ok) {
      const data = await res.json();
      const rate = data.rates?.GBP;
      if (typeof rate === 'number') {
        try { localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rate, ts: Date.now() })); } catch { /* ignore */ }
        return rate;
      }
    }
  } catch (err) {
    console.warn('[SetTracker] FX rate fetch failed:', err);
  }

  // Fall back to a stale cached rate rather than the hardcoded default, if we have one
  try {
    const cached = localStorage.getItem(FX_CACHE_KEY);
    if (cached) return JSON.parse(cached).rate;
  } catch { /* ignore */ }
  return FX_FALLBACK_RATE;
}

/** Sums collected cards with known Cardmarket prices and converts the total to GBP. */
async function computeCollectionValueGBP() {
  let totalEUR = 0, pricedCount = 0, collectedCount = 0;
  state.sets.forEach(s => {
    s.cards.forEach(c => {
      if (!isCollected(s.id, c.localId)) return;
      collectedCount++;
      if (typeof c.priceEUR === 'number') {
        totalEUR += c.priceEUR;
        pricedCount++;
      }
    });
  });
  const rate = await getEurToGbpRate();
  return { totalGBP: totalEUR * rate, pricedCount, collectedCount };
}

// Debounced Supabase sync so rapid card-toggling doesn't spam writes
let _syncTimer = null;
function syncCollectionValue() {
  if (!window.__dexoriaUserId) return; // only sync for logged-in users
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    try {
      const { totalGBP, pricedCount, collectedCount } = await computeCollectionValueGBP();
      await supabase.from('collection_value').upsert({
        user_id:               window.__dexoriaUserId,
        total_value_gbp:       Math.round(totalGBP * 100) / 100,
        priced_card_count:     pricedCount,
        collected_card_count:  collectedCount,
        updated_at:            new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[SetTracker] Failed to sync collection value:', err);
    }
  }, 2000);
}

// ─── Reverse holo logic ───────────────────────────────────────────────────────

// Cards whose names match these patterns never have a reverse holo print.
// Covers SV "ex", SWSH "V/VMAX/VSTAR", SM "GX", XY "EX", Radiant Pokémon.
const NO_RH_NAME     = /\b(ex|EX|GX|V|VMAX|VSTAR)\b/;
const RADIANT_PREFIX = /^Radiant\s/i;

function hasReverseHolo(name) {
  if (!name) return true; // unknown — include RH by default
  return !NO_RH_NAME.test(name) && !RADIANT_PREFIX.test(name);
}

/**
 * Maps raw TCGDex cards and appends a Reverse Holo variant for every
 * eligible card:
 *  - numeric localId within the official count, AND
 *  - card name does not indicate a high rarity (ex/V/GX etc.)
 * All other cards (special arts, ex, V, VMAX…) are flagged isSpecial
 * so they show no label and no RH twin.
 */
function buildCards(rawCards, officialCount, holoCount) {
  const result = [];
  for (const c of (rawCards ?? [])) {
    const lid        = String(c.localId);
    const num        = parseInt(lid, 10);
    const isNum      = /^\d+$/.test(lid);
    const aboveCount = isNum && officialCount != null && num > officialCount;
    const highRarity = isNum && !hasReverseHolo(c.name);   // ex/V/GX within main set
    const isSpecial  = !isNum || aboveCount || highRarity;

    // Use TCGDex-provided rarity first; fall back to holoCount for classic sets.
    // Use || not ?? so an empty string from TCGDex doesn't block the fallback.
    const isHolo = !c.rarity && holoCount && isNum && num <= holoCount;
    const rarity = c.rarity || (isHolo ? 'Rare Holo' : null);

    const base = { localId: c.localId, name: c.name, image: c.image ?? null, rarity, isSpecial, priceEUR: null };
    result.push(base);

    // Only eligible main-set numbered cards get a reverse holo copy
    if (!isSpecial) {
      result.push({ ...base, localId: `${c.localId}RH`, rarity: 'Reverse Holo', isSpecial: false });
    }
  }
  return result;
}

/** Returns a CSS-friendly rarity key used for colouring badges and borders. */
function rarityClass(rarity) {
  if (!rarity) return 'unknown';
  const r = rarity.toLowerCase();
  if (r === 'reverse holo')                                                   return 'rh';
  if (r.includes('hyper') || r.includes('special illustration'))              return 'secret';
  if (r.includes('illustration') || r.includes('ultra') ||
      r.includes('rainbow') || r.includes('radiant'))                         return 'ultra';
  if (r.includes('holo') || r === 'rare')                                      return 'holo';
  if (r === 'uncommon')                                                        return 'uncommon';
  if (r === 'common')                                                          return 'common';
  return 'rare';
}

/**
 * Derives a display label + CSS class for the card tile.
 * Priority: RH suffix → isSpecial → TCGDex rarity → "Regular" fallback.
 */
function cardTypeLabel(card) {
  const lid = String(card.localId);
  if (lid.endsWith('RH'))  return { label: 'Reverse Holo', cls: 'rh' };
  if (card.isSpecial)      return null;
  if (/^\d+$/.test(lid)) {
    if (card.rarity || card.rarity === 0) {
      // Simplify any "Rare Holo *" variant to just "Holo" for cleaner display
      const display = /holo/i.test(card.rarity) || /^rare$/i.test(card.rarity)
        ? 'Holo'
        : card.rarity;
      return { label: display, cls: rarityClass(card.rarity) };
    }
    return { label: 'Regular', cls: 'regular' };
  }
  return null;
}



// ─── Persistence ─────────────────────────────────────────────────────────────

function getStorageKey() {
  // Namespaced per user if available, falls back to shared key
  const uid = window.__dexoriaUserId || 'anon';
  return `${STORAGE_KEY}_${uid}`;
}

function loadCollected() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCollected(data) {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
  } catch { /* storage full or blocked */ }
}

function isCollected(setId, cardLocalId) {
  return !!(state.collected[`${setId}:${cardLocalId}`]);
}

function toggleCollected(setId, cardLocalId) {
  const key = `${setId}:${cardLocalId}`;
  if (state.collected[key]) {
    delete state.collected[key];
  } else {
    state.collected[key] = true;
  }
  saveCollected(state.collected);
  syncCollectionValue();
}

// ─── TCGDex fetching ─────────────────────────────────────────────────────────

async function fetchSet(setId) {
  // Check cache
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${setId}`);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch { /* ignore */ }

  const res = await fetch(`${TCGDEX_BASE}/sets/${setId}`);
  if (!res.ok) throw new Error(`TCGDex: set ${setId} returned ${res.status}`);
  const data = await res.json();

  try {
    localStorage.setItem(`${CACHE_PREFIX}${setId}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore */ }

  return data;
}

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  sets:        TRACKED_SETS.map(s => ({ ...s, cards: [], loaded: false, error: false })),
  activeIdx:   null,   // null = no set selected yet
  activeFilter: 'all',
  searchVal:   '',
  collected:   {},
};

// ─── Render: overall progress ─────────────────────────────────────────────────

function renderOverall() {
  const total = state.sets.reduce((a, s) => a + s.cards.length, 0);
  const col   = state.sets.reduce((a, s) => a + s.cards.filter(c => isCollected(s.id, c.localId)).length, 0);
  const pct   = total > 0 ? Math.round(col / total * 100) : 0;

  document.getElementById('totalCollected').textContent = col;
  document.getElementById('totalCards').textContent     = total;
  document.getElementById('totalSets').textContent      = state.sets.filter(s => s.loaded).length;
  document.getElementById('totalPct').textContent       = pct + '%';
  requestAnimationFrame(() => {
    document.getElementById('overallFill').style.width = pct + '%';
  });
}

// ─── Render: set hero cards ──────────────────────────────────────────────────

const SET_IMAGES = {
  'me05':   'Pitch Black Logo 2.png',
  'me04':   'Chaos Rising Logo.jpg',
  'me03':   'Perfect Order Logo.jpg',
  'me02.5': 'Ascended Heroes Logo.jpg',
  'me02':   'Phantasmal Flames Logo.png',
  'me01':   'Mega Evolution Logo.jpg',

  'sv10.5b': 'Black Bolt Logo.png',
  'sv10.5a': 'White Flare Logo.png',
  'sv10':    'Destined Rivals Logo.jpg',
  'sv09':    'Journey Together Logo.jpg',
  'sv08.5':  'Prismatic Evolutions Logo.jpg',
  'sv08':    'Surging Sparks Logo.jpg',
  'sv07':    'Stellar Crown Logo.jpg',
  'sv06.5':  'Shrouded Fable Logo.jpg',
  'sv06':    'Twilight Masquerade Logo.jpg',
  'sv05':    'Temporal Forces Logo.png',
  'sv04':    'Paradox Rift Logo.png',
  'sv03.5':  '151 Logo.png',
  'sv03':    'Obsidian Flames Logo.png',
  'sv02':    'Paldea Evolved Logo.png',
  'sv01':    'Scarlet & Violet Base Logo.webp',

  'swsh12.5': 'Crown Zenith Logo.jpg',
  'swsh10': 'Astral Radiance Logo.jpg',
  'swsh09': 'Brilliant Stars Logo.jpg',
  'swsh08': 'Fusion Strike Logo.jpg',
  'swsh07': 'Evolving Skies Logo.jpg',
  'swsh06': 'Chilling Reign Logo.jpg',
  'swsh05': 'Battle Styles Logo.jpg',
  'swsh04': 'Vivid Voltage Logo.jpg',
  'swsh03': 'Darkness Ablaze Logo.jpg',
  'swsh02': 'rebel Clash Logo.jpg',
  'swsh01': 'Sword & Shield Base Logo.jpg', 

  'base1': 'Base Set Logo.jpg',
  'base2': 'Jungle Logo.jpg',
  'base3': 'Fossil Logo.jpg',
  'base4': 'Base Set 2 Logo.jpg',
  'base5': 'Team Rocket Logo.jpg',
  
};

// Track which series are expanded — first series open by default
const expandedSeries = new Set();

function renderTabs() {
  const nav = document.getElementById('setNav');
  nav.innerHTML = '';

  // Group sets by series
  const seriesMap = new Map();
  state.sets.forEach((s, i) => {
    const seriesName = s.series ?? 'Other';
    if (!seriesMap.has(seriesName)) seriesMap.set(seriesName, []);
    seriesMap.get(seriesName).push({ s, i });
  });

  seriesMap.forEach((entries, seriesName) => {
    const isOpen = expandedSeries.has(seriesName);

    // Series totals for header progress
    const seriesTotal = entries.reduce((a, { s }) => a + s.cards.length, 0);
    const seriesCol   = entries.reduce((a, { s }) => a + s.cards.filter(c => isCollected(s.id, c.localId)).length, 0);
    const seriesPct   = seriesTotal > 0 ? Math.round(seriesCol / seriesTotal * 100) : 0;

    const section = document.createElement('div');
    section.className = 'st-series-section';

    // Series header
    const header = document.createElement('button');
    header.className = 'st-series-header' + (isOpen ? ' open' : '');
    header.innerHTML = `
      <div class="st-series-header-left">
        <svg class="st-series-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="st-series-name">${seriesName}</span>
        <span class="st-series-setcount">${entries.length} set${entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="st-series-header-right">
        <div class="st-series-bar"><div class="st-series-bar-fill" style="width:${seriesPct}%"></div></div>
        <span class="st-series-pct">${seriesTotal > 0 ? seriesPct + '%' : '…'}</span>
      </div>
    `;
    header.onclick = () => {
      const collapsing = expandedSeries.has(seriesName);
      if (collapsing) {
        expandedSeries.delete(seriesName);
        // If the active set lives in this series, deselect it so the panel hides
        const activeSet = state.activeIdx !== null ? state.sets[state.activeIdx] : null;
        if (activeSet && (activeSet.series ?? 'Other') === seriesName) {
          state.activeIdx = null;
        }
      } else {
        expandedSeries.add(seriesName);
      }
      renderTabs();
      renderPanel();
    };

    // Sets grid
    const grid = document.createElement('div');
    grid.className = 'st-series-grid' + (isOpen ? ' open' : '');

    entries.forEach(({ s, i }, j) => {
      const total    = s.cards.length;
      const col      = s.cards.filter(c => isCollected(s.id, c.localId)).length;
      const pct      = total > 0 ? Math.round(col / total * 100) : 0;
      const complete = total > 0 && col === total;
      const bgUrl    = SET_IMAGES[s.id] ?? null;

      const wrap = document.createElement('div');
      wrap.className = ['st-hero-card-wrap', i === state.activeIdx ? 'active' : '', complete ? 'complete' : ''].filter(Boolean).join(' ');
      wrap.style.animationDelay = `${j * 0.05}s`;

      const label = document.createElement('span');
      label.className   = 'st-hero-card-label';
      label.textContent = s.name;

      const card = document.createElement('button');
      card.className = ['st-hero-card', i === state.activeIdx ? 'active' : '', complete ? 'complete' : ''].filter(Boolean).join(' ');
      card.setAttribute('aria-pressed', i === state.activeIdx ? 'true' : 'false');
      card.innerHTML = `
        ${bgUrl ? `<img class="st-hero-img" src="${bgUrl}" alt="" aria-hidden="true" />` : ''}
        <div class="st-hero-scan" aria-hidden="true"></div>
        <span class="st-hero-year">${s.year}</span>
        <span class="st-hero-badge">Complete</span>
        <div class="st-hero-info">
          <div class="st-hero-progress"><div class="st-hero-progress-fill" style="width:${pct}%"></div></div>
          <div class="st-hero-meta">
            <span class="st-hero-pct">${s.loaded ? pct + '%' : '…'}</span>
            <span class="st-hero-count">${s.loaded ? col + ' / ' + total : ''}</span>
          </div>
        </div>
      `;

      const onclick = () => {
        state.activeIdx    = i;
        state.activeFilter = 'all';
        state.searchVal    = '';
        document.getElementById('cardSearch').value = '';
        document.querySelectorAll('.st-filter').forEach(f => f.classList.toggle('active', f.dataset.filter === 'all'));
        renderTabs();
        renderPanel();
        // Load immediately if not yet loaded — don't rely on background batch timing
        if (!s.loaded && !s.error) {
          loadSet(i);
        } else {
          enrichSetRarity(i);
        }
      };
      card.onclick  = onclick;
      label.onclick = onclick;

      wrap.appendChild(label);
      wrap.appendChild(card);
      grid.appendChild(wrap);
    });

    section.appendChild(header);
    section.appendChild(grid);
    nav.appendChild(section);
  });
}

// ─── Render: panel header + stats ────────────────────────────────────────────

function renderPanelHeader() {
  const s     = state.sets[state.activeIdx];
  const total = s.cards.length;
  const col   = s.cards.filter(c => isCollected(s.id, c.localId)).length;
  const pct   = total > 0 ? Math.round(col / total * 100) : 0;

  document.getElementById('panelName').textContent  = s.name;
  document.getElementById('panelMeta').textContent  = s.loaded
    ? `${total} cards · ${s.year}${s.releaseDate ? ' · Released ' + s.releaseDate : ''}`
    : `${s.year} · Loading...`;

  document.getElementById('pCollected').textContent = col;
  document.getElementById('pRemaining').textContent = Math.max(0, total - col);
  document.getElementById('pPct').textContent       = pct + '%';

  requestAnimationFrame(() => {
    document.getElementById('setPctFill').style.width      = pct + '%';
    document.getElementById('setPctLabel').textContent     = pct + '%';
  });
}

// ─── Render: card grid ────────────────────────────────────────────────────────

function renderGrid() {
  const s = state.sets[state.activeIdx];
  const grid    = document.getElementById('cardGrid');
  const loading = document.getElementById('stLoading');
  const empty   = document.getElementById('stEmpty');

  if (!s.loaded && !s.error) {
    loading.style.display = 'flex';
    grid.style.display    = 'none';
    empty.style.display   = 'none';
    return;
  }

  loading.style.display = 'none';

  // Filter
  let cards = s.cards;
  if (state.activeFilter === 'collected') cards = cards.filter(c =>  isCollected(s.id, c.localId));
  if (state.activeFilter === 'missing')   cards = cards.filter(c => !isCollected(s.id, c.localId));

  if (state.searchVal) {
    const q = state.searchVal.toLowerCase();
    cards = cards.filter(c =>
      (c.name ?? '').toLowerCase().includes(q) ||
      String(c.localId ?? '').includes(q)
    );
  }

  if (cards.length === 0) {
    grid.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.style.display  = 'grid';

  grid.innerHTML = cards.map((card, i) => {
    const collected  = isCollected(s.id, card.localId);
    const hasImg     = !!card.image;
    const delay      = Math.min(i * 0.015, 0.4);
    const typeInfo   = cardTypeLabel(card);
    const rc         = typeInfo?.cls ?? 'unknown';
    const displayNum = String(card.localId).replace(/RH$/, '');

    return `
      <div class="st-card-wrap" style="animation-delay:${delay}s">
        <div class="st-card ${collected ? 'collected' : ''} st-rarity-${rc}"
             data-set="${s.id}"
             data-local-id="${card.localId}"
             title="${card.name ?? ''} · #${card.localId} · ${typeInfo?.label ?? 'Unknown'}">
          ${hasImg ? `
            <img class="st-card-img" src="${card.image}/low.png" data-base="${card.image}" data-fallback-idx="0" alt="${card.name ?? ''}" loading="lazy" />
            <div class="st-card-img-overlay"></div>
          ` : ''}
          <div class="st-card-check">
            <svg viewBox="0 0 10 8" aria-hidden="true"><polyline points="1,4 4,7 9,1"/></svg>
          </div>
        </div>
        <div class="st-card-info">
          <div class="st-card-num">#${displayNum}</div>
          <div class="st-card-name">${card.name ?? '—'}</div>
          ${typeInfo ? `<div class="st-card-rarity rarity-${rc}">${typeInfo.label}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Attach click listeners
  grid.querySelectorAll('.st-card').forEach(el => {
    el.addEventListener('click', () => {
      const sid = el.dataset.set;
      const lid = el.dataset.localId;
      el.closest('.st-card-wrap')?.classList.toggle('collected', !el.classList.contains('collected'));
      toggleCollected(sid, lid);
      el.classList.toggle('collected');
      renderPanelHeader();
      renderMissing();
      renderOverall();
      updateTabPct(state.activeIdx);
      checkCompletion();
    });
  });

  // Attach image fallback/retry handlers — a brand new visitor is often the
  // very first request for a given card image, and TCGDex's CDN can take a
  // moment to generate/cache it, returning a 404 that a simple refresh fixes.
  grid.querySelectorAll('.st-card-img').forEach(img => {
    img.addEventListener('error', () => handleCardImgError(img));
  });
}

// Retry the same URL a couple of times (covers "CDN still generating the
// asset" on a cold cache), then fall back through other quality/format
// combos, then give up gracefully instead of showing a broken-image icon.
const IMG_RETRY_DELAYS = [600, 1500];          // ms, tried on the original URL
const IMG_FALLBACK_FORMATS = ['low.webp', 'high.png', 'high.webp'];

function handleCardImgError(img) {
  const base    = img.dataset.base;
  const retries = parseInt(img.dataset.retryCount || '0', 10);
  const fbIdx   = parseInt(img.dataset.fallbackIdx || '0', 10);

  if (retries < IMG_RETRY_DELAYS.length) {
    img.dataset.retryCount = String(retries + 1);
    setTimeout(() => {
      // Cache-bust so the browser doesn't just replay the same failed response
      img.src = `${base}/low.png?retry=${retries + 1}`;
    }, IMG_RETRY_DELAYS[retries]);
    return;
  }

  if (fbIdx < IMG_FALLBACK_FORMATS.length) {
    img.dataset.fallbackIdx = String(fbIdx + 1);
    img.src = `${base}/${IMG_FALLBACK_FORMATS[fbIdx]}`;
    return;
  }

  // Exhausted every option — hide the broken image instead of showing
  // the browser's broken-image icon; the card number/name still render.
  img.closest('.st-card-wrap')?.classList.add('st-img-broken');
  img.style.display = 'none';
}

// ─── Render: missing pills ────────────────────────────────────────────────────

function renderMissing() {
  const s       = state.sets[state.activeIdx];
  const missing = s.cards.filter(c => !isCollected(s.id, c.localId));
  const list    = document.getElementById('missingList');
  const shown   = missing.slice(0, 10);

  list.innerHTML = shown.map(c =>
    `<span class="st-missing-pill" data-set="${s.id}" data-local-id="${c.localId}">#${c.localId} ${c.name ?? ''}</span>`
  ).join('') + (missing.length > 10
    ? `<span class="st-missing-pill">+${missing.length - 10} more</span>`
    : '');

  // Click a missing pill → scroll to that card in the grid
  list.querySelectorAll('.st-missing-pill[data-local-id]').forEach(pill => {
    pill.addEventListener('click', () => {
      const target = document.querySelector(
        `.st-card[data-set="${pill.dataset.set}"][data-local-id="${pill.dataset.localId}"]`
      );
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

// ─── Render: completion banner ────────────────────────────────────────────────

function checkCompletion() {
  const s     = state.sets[state.activeIdx];
  const total = s.cards.length;
  const col   = s.cards.filter(c => isCollected(s.id, c.localId)).length;
  let banner  = document.getElementById('completeBanner');

  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'completeBanner';
    banner.className = 'st-complete-banner';
    banner.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
      Set Complete — Congratulations!
    `;
    document.getElementById('stPanel').appendChild(banner);
  }

  banner.classList.toggle('visible', total > 0 && col === total);
}

// ─── Update single tab % without full re-render ───────────────────────────────

function updateTabPct(idx) {
  // Re-render tabs to update series progress bars and individual set cards
  renderTabs();
}

// ─── Full panel render ────────────────────────────────────────────────────────

function renderPanel() {
  const panel = document.getElementById('stPanel');
  const noSel = document.getElementById('stNoSelection');

  if (state.activeIdx === null) {
    panel?.classList.remove('active');
    noSel?.classList.remove('hidden');
    return;
  }

  panel?.classList.add('active');
  noSel?.classList.add('hidden');
  renderPanelHeader();
  renderGrid();
  renderMissing();
  checkCompletion();
}

// ─── Filter / search (exposed on window for inline onclick) ──────────────────

window.setFilter = function(btn, filter) {
  state.activeFilter = filter;
  document.querySelectorAll('.st-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
};

window.filterSearch = function(val) {
  state.searchVal = val;
  renderGrid();
};

// ─── Mark all visible ─────────────────────────────────────────────────────────

function markAllVisible() {
  if (state.activeIdx === null) return;
  const s = state.sets[state.activeIdx];
  document.querySelectorAll('.st-card:not(.collected)').forEach(el => {
    toggleCollected(el.dataset.set, el.dataset.localId);
    el.classList.add('collected');
  });
  renderPanelHeader();
  renderMissing();
  renderOverall();
  updateTabPct(state.activeIdx);
  checkCompletion();
}

// ─── Reset set ────────────────────────────────────────────────────────────────

function resetActiveSet() {
  if (state.activeIdx === null) return;
  const s = state.sets[state.activeIdx];
  if (!confirm(`Reset all collected cards for "${s.name}"?`)) return;
  s.cards.forEach(c => {
    delete state.collected[`${s.id}:${c.localId}`];
  });
  saveCollected(state.collected);
  syncCollectionValue();
  renderTabs();
  renderPanel();
  renderOverall();
}

// ─── Export checklist ─────────────────────────────────────────────────────────

function exportChecklist() {
  if (state.activeIdx === null) return;
  const s       = state.sets[state.activeIdx];
  const lines   = [`${s.name} — Dexoria Set Tracker Checklist`, ''];
  s.cards.forEach(c => {
    const tick = isCollected(s.id, c.localId) ? '[x]' : '[ ]';
    lines.push(`${tick} #${c.localId} ${c.name ?? ''} (${c.rarity ?? 'Unknown'})`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${s.id}-checklist.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Rarity + pricing enrichment ───────────────────────────────────────────
// TCGDex set listings never include rarity or pricing — fetch each card
// individually. Rarity is cached for 7 days (never changes); pricing gets
// its own shorter-lived cache since Cardmarket updates daily.

function applyRarityMap(idx, map) {
  if (!map || !Object.keys(map).length) return;
  state.sets[idx].cards = state.sets[idx].cards.map(c => ({
    ...c,
    // Leave RH copies alone; update base cards with fetched rarity
    rarity: String(c.localId).endsWith('RH') ? c.rarity : (map[c.localId] ?? c.rarity),
  }));
  if (idx === state.activeIdx) renderGrid();
  renderOverall();
}

function applyPriceMap(idx, map) {
  if (!map || !Object.keys(map).length) return;
  state.sets[idx].cards = state.sets[idx].cards.map(c => ({
    ...c,
    // RH copies share the base card's price rather than having their own entry
    priceEUR: String(c.localId).endsWith('RH')
      ? (map[String(c.localId).replace(/RH$/, '')] ?? c.priceEUR)
      : (map[c.localId] ?? c.priceEUR),
  }));
  renderOverall();
  syncCollectionValue();
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function enrichSetRarity(idx) {
  if (idx === null || idx === undefined) return;
  const s = state.sets[idx];
  if (!s.loaded || s.error) return;

  // Only process base (non-RH) cards
  const base = s.cards.filter(c => !String(c.localId).endsWith('RH'));

  const rarityCacheKey = `${RARITY_CACHE_PREFIX}${s.id}`;
  const priceCacheKey  = `${PRICE_CACHE_PREFIX}${s.id}`;

  const rarityCached = readCache(rarityCacheKey);
  const priceCached   = readCache(priceCacheKey);

  const rarityFresh = !!(rarityCached && Date.now() - rarityCached.ts < RARITY_CACHE_TTL);
  const priceFresh  = !!(priceCached && Date.now() - priceCached.ts < PRICE_CACHE_TTL);

  const needsRarity = !base.every(c => c.rarity) && !rarityFresh;
  const needsPrice  = !priceFresh;

  // Apply whatever's already cached and fresh, immediately
  if (rarityFresh) applyRarityMap(idx, rarityCached.map);
  if (priceFresh)  applyPriceMap(idx, priceCached.map);

  if (!needsRarity && !needsPrice) return; // both fresh — nothing to fetch

  // Batch-fetch individual card data (10 concurrent requests) — one fetch
  // per card serves both rarity and pricing, whichever is stale.
  const rarityMap = {};
  const priceMap  = {};
  const BATCH = 10;
  for (let i = 0; i < base.length; i += BATCH) {
    const slice = base.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      slice.map(c =>
        fetch(`${TCGDEX_BASE}/sets/${s.id}/${c.localId}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );
    results.forEach((res, j) => {
      if (res.status !== 'fulfilled' || !res.value) return;
      const card = res.value;
      if (needsRarity && card.rarity) rarityMap[slice[j].localId] = card.rarity;
      if (needsPrice) {
        const eurPrice = card.pricing?.cardmarket?.trend ?? card.pricing?.cardmarket?.avg ?? null;
        if (typeof eurPrice === 'number') priceMap[slice[j].localId] = eurPrice;
      }
    });
  }

  if (needsRarity) {
    try { localStorage.setItem(rarityCacheKey, JSON.stringify({ map: rarityMap, ts: Date.now() })); } catch { /* ignore */ }
    applyRarityMap(idx, rarityMap);
  }
  if (needsPrice) {
    try { localStorage.setItem(priceCacheKey, JSON.stringify({ map: priceMap, ts: Date.now() })); } catch { /* ignore */ }
    applyPriceMap(idx, priceMap);
  }
}

// ─── Load a single set ────────────────────────────────────────────────────────

async function loadSet(idx) {
  const meta = state.sets[idx];
  try {
    const data          = await fetchSet(meta.id);
    // TCGDex primary → TRACKED_SETS fallback
    const officialCount = data.cardCount?.official || state.sets[idx].officialCount || null;
    const holoCount     = state.sets[idx].holoCount ?? null;
    state.sets[idx].cards       = buildCards(data.cards, officialCount, holoCount);
    state.sets[idx].releaseDate = data.releaseDate ?? null;
    state.sets[idx].loaded       = true;
  } catch (err) {
    console.warn(`[SetTracker] Failed to load set ${meta.id}:`, err);
    state.sets[idx].error  = true;
    state.sets[idx].loaded = true;
  }

  // If this is the active set, re-render and kick off rarity enrichment
  if (idx === state.activeIdx) {
    renderPanel();
    enrichSetRarity(idx); // background — re-renders grid when rarity arrives
  }
  renderTabs();
  renderOverall();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function populateFromCache() {
  // Synchronously load any cached sets into state before first render
  TRACKED_SETS.forEach((meta, idx) => {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${meta.id}`);
      if (!raw) return;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts >= CACHE_TTL) return; // stale
      // TCGDex primary → TRACKED_SETS fallback
      const officialCount         = data.cardCount?.official || state.sets[idx].officialCount || null;
      const holoCount             = state.sets[idx].holoCount ?? null;
      state.sets[idx].cards       = buildCards(data.cards, officialCount, holoCount);
      state.sets[idx].releaseDate = data.releaseDate ?? null;
      state.sets[idx].loaded      = true;
    } catch { /* ignore corrupt cache */ }
  });
}

async function init() {
  // Load user ID for namespaced storage
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) window.__dexoriaUserId = user.id;
  } catch { /* not logged in */ }

  state.collected = loadCollected();

  // ── Populate from cache synchronously so first render is instant ──
  populateFromCache();

  renderTabs();
  renderPanel();   // shows the no-selection placeholder (activeIdx is null)
  renderOverall();

  // Wire up buttons
  document.getElementById('exportBtn')?.addEventListener('click', exportChecklist);
  document.getElementById('resetBtn')?.addEventListener('click', resetActiveSet);
  document.getElementById('markAllBtn')?.addEventListener('click', markAllVisible);

  // ── Only fetch sets that aren't already loaded from cache ──
  const stale = state.sets.map((_, i) => i).filter(i => !state.sets[i].loaded);

  if (stale.length === 0) return; // everything cached — enrichSetRarity already fired above

  // Fetch active set first so the visible panel populates immediately
  if (stale.includes(state.activeIdx)) {
    await loadSet(state.activeIdx);
  }

  // Warm the rest of the cache one set at a time, during browser idle time.
  // This still gets everything cached (so overall stats fill in), but
  // avoids competing with the actively viewed set for connections/rate
  // limit on a cold, first-ever visit.
  const rest = stale.filter(i => i !== state.activeIdx);
  backgroundPrefetch(rest);
}

function backgroundPrefetch(indices) {
  if (indices.length === 0) return;
  const [next, ...remaining] = indices;
  const schedule = window.requestIdleCallback || (cb => setTimeout(cb, 300));
  schedule(async () => {
    await loadSet(next);
    backgroundPrefetch(remaining);
  });
}

document.addEventListener('DOMContentLoaded', init);/**
 * set-tracker.js
 * Dexoria — Set Tracker page
 *
 * Fetches card lists from TCGDex, persists collected state to
 * localStorage (keyed per Supabase user ID when logged in, or
 * anonymous key otherwise), and renders an interactive card grid.
 */

import { supabase } from './supabaseClient.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';

// Your Dexoria sets — update as new sets are added
// Add a `series` field to group sets into collapsible sections
const TRACKED_SETS = [
  { id: 'me05',   name: 'Pitch Black',        year: '2026', series: 'Mega Evolution Series', officialCount: 120 },
  { id: 'me04',   name: 'Chaos Rising',       year: '2026', series: 'Mega Evolution Series', officialCount: 198 },
  { id: 'me03',   name: 'Perfect Order',      year: '2026', series: 'Mega Evolution Series', officialCount: 203 },
  { id: 'me02.5', name: 'Ascended Heroes',    year: '2026', series: 'Mega Evolution Series', officialCount: 295 },
  { id: 'me02',   name: 'Phantasmal Flames',  year: '2025', series: 'Mega Evolution Series', officialCount: 214 },
  { id: 'me01',   name: 'Mega Evolution',     year: '2025', series: 'Mega Evolution Series', officialCount: 188 },

  { id: 'sv10.5b', name: 'Black Bolt',           year: '2025', series: 'Scarlet & Violet', officialCount: 90  },
  { id: 'sv10.5a', name: 'White Flare',          year: '2025', series: 'Scarlet & Violet', officialCount: 90  },
  { id: 'sv10',    name: 'Destined Rivals',      year: '2025', series: 'Scarlet & Violet', officialCount: 190 },
  { id: 'sv09',    name: 'Journey Together',     year: '2025', series: 'Scarlet & Violet', officialCount: 190 },
  { id: 'sv08.5',  name: 'Prismatic Evolutions', year: '2025', series: 'Scarlet & Violet', officialCount: 131 },
  { id: 'sv08',    name: 'Surging Sparks',       year: '2024', series: 'Scarlet & Violet', officialCount: 191 },
  { id: 'sv07',    name: 'Stellar Crown',        year: '2024', series: 'Scarlet & Violet', officialCount: 175 },
  { id: 'sv06.5',  name: 'Shrouded Fable',       year: '2024', series: 'Scarlet & Violet', officialCount: 99  },
  { id: 'sv06',    name: 'Twilight Masquerade',  year: '2024', series: 'Scarlet & Violet', officialCount: 167 },
  { id: 'sv05',    name: 'Temporal Forces',      year: '2024', series: 'Scarlet & Violet', officialCount: 162 },
  { id: 'sv04',    name: 'Paradox Rift',         year: '2024', series: 'Scarlet & Violet', officialCount: 266 },
  { id: 'sv03.5',  name: '151',                  year: '2023', series: 'Scarlet & Violet', officialCount: 207 },
  { id: 'sv03',    name: 'Obsidian Flames',      year: '2023', series: 'Scarlet & Violet', officialCount: 197 },
  { id: 'sv02',    name: 'Paldea Evolved',       year: '2023', series: 'Scarlet & Violet', officialCount: 193 },
  { id: 'sv01',    name: 'Scarlet & Violet Base', year: '2023', series: 'Scarlet & Violet', officialCount: 198 },


  { id: 'swsh12.5', name: 'Crown Zenith',         year: '2023', series: 'Sword & Shield', officialCount: 159 },
  { id: 'swsh10',   name: 'Astral Radiance',      year: '2023', series: 'Sword & Shield', officialCount: 189 },
  { id: 'swsh09',   name: 'Brilliant Stars',      year: '2022', series: 'Sword & Shield', officialCount: 186 },
  { id: 'swsh08',   name: 'Fusion Strike',        year: '2021', series: 'Sword & Shield', officialCount: 264 },
  { id: 'swsh07',   name: 'Evolving Skies',       year: '2021', series: 'Sword & Shield', officialCount: 203 },
  { id: 'swsh06',   name: 'Chilling Reign',       year: '2020', series: 'Sword & Shield', officialCount: 198 },
  { id: 'swsh05',   name: 'Battle Styles',        year: '2020', series: 'Sword & Shield', officialCount: 163 },
  { id: 'swsh04',   name: 'Vivid Voltage',        year: '2020', series: 'Sword & Shield', officialCount: 185 },
  { id: 'swsh03',   name: 'Darkness Ablaze',      year: '2020', series: 'Sword & Shield', officialCount: 189 },
  { id: 'swsh02',   name: 'Rebel Clash',          year: '2019', series: 'Sword & Shield', officialCount: 192 },
  { id: 'swsh01',   name: 'Sword & Shield Base',  year: '2019', series: 'Sword & Shield', officialCount: 202 },

  { id: 'base1', name: 'Base Set',    year: '1999', series: 'Base Set', officialCount: 102, holoCount: 16 },
  { id: 'base2', name: 'Jungle',      year: '1999', series: 'Base Set', officialCount: 64,  holoCount: 16 },
  { id: 'base3', name: 'Fossil',      year: '1999', series: 'Base Set', officialCount: 62,  holoCount: 15 },
  { id: 'base4', name: 'Base Set 2',  year: '2000', series: 'Base Set', officialCount: 130, holoCount: null },
  { id: 'base5', name: 'Team Rocket', year: '2000', series: 'Base Set', officialCount: 82,  holoCount: null },
];

const CACHE_PREFIX      = 'dexoria_set_v7_';  // bumped: fix || vs ?? for rarity fallback
const RARITY_CACHE_PREFIX = 'dexoria_rarity_v1_';
const CACHE_TTL         = 60 * 60 * 1000;          // 1 hour per set
const RARITY_CACHE_TTL  = 7 * 24 * 60 * 60 * 1000; // 7 days — rarity never changes
const STORAGE_KEY       = 'dexoria_tracker_collected';

// ─── Reverse holo logic ───────────────────────────────────────────────────────

// Cards whose names match these patterns never have a reverse holo print.
// Covers SV "ex", SWSH "V/VMAX/VSTAR", SM "GX", XY "EX", Radiant Pokémon.
const NO_RH_NAME     = /\b(ex|EX|GX|V|VMAX|VSTAR)\b/;
const RADIANT_PREFIX = /^Radiant\s/i;

function hasReverseHolo(name) {
  if (!name) return true; // unknown — include RH by default
  return !NO_RH_NAME.test(name) && !RADIANT_PREFIX.test(name);
}

/**
 * Maps raw TCGDex cards and appends a Reverse Holo variant for every
 * eligible card:
 *  - numeric localId within the official count, AND
 *  - card name does not indicate a high rarity (ex/V/GX etc.)
 * All other cards (special arts, ex, V, VMAX…) are flagged isSpecial
 * so they show no label and no RH twin.
 */
function buildCards(rawCards, officialCount, holoCount) {
  const result = [];
  for (const c of (rawCards ?? [])) {
    const lid        = String(c.localId);
    const num        = parseInt(lid, 10);
    const isNum      = /^\d+$/.test(lid);
    const aboveCount = isNum && officialCount != null && num > officialCount;
    const highRarity = isNum && !hasReverseHolo(c.name);   // ex/V/GX within main set
    const isSpecial  = !isNum || aboveCount || highRarity;

    // Use TCGDex-provided rarity first; fall back to holoCount for classic sets.
    // Use || not ?? so an empty string from TCGDex doesn't block the fallback.
    const isHolo = !c.rarity && holoCount && isNum && num <= holoCount;
    const rarity = c.rarity || (isHolo ? 'Rare Holo' : null);

    const base = { localId: c.localId, name: c.name, image: c.image ?? null, rarity, isSpecial };
    result.push(base);

    // Only eligible main-set numbered cards get a reverse holo copy
    if (!isSpecial) {
      result.push({ ...base, localId: `${c.localId}RH`, rarity: 'Reverse Holo', isSpecial: false });
    }
  }
  return result;
}

/** Returns a CSS-friendly rarity key used for colouring badges and borders. */
function rarityClass(rarity) {
  if (!rarity) return 'unknown';
  const r = rarity.toLowerCase();
  if (r === 'reverse holo')                                                   return 'rh';
  if (r.includes('hyper') || r.includes('special illustration'))              return 'secret';
  if (r.includes('illustration') || r.includes('ultra') ||
      r.includes('rainbow') || r.includes('radiant'))                         return 'ultra';
  if (r.includes('holo') || r === 'rare')                                      return 'holo';
  if (r === 'uncommon')                                                        return 'uncommon';
  if (r === 'common')                                                          return 'common';
  return 'rare';
}

/**
 * Derives a display label + CSS class for the card tile.
 * Priority: RH suffix → isSpecial → TCGDex rarity → "Regular" fallback.
 */
function cardTypeLabel(card) {
  const lid = String(card.localId);
  if (lid.endsWith('RH'))  return { label: 'Reverse Holo', cls: 'rh' };
  if (card.isSpecial)      return null;
  if (/^\d+$/.test(lid)) {
    if (card.rarity || card.rarity === 0) {
      // Simplify any "Rare Holo *" variant to just "Holo" for cleaner display
      const display = /holo/i.test(card.rarity) || /^rare$/i.test(card.rarity)
        ? 'Holo'
        : card.rarity;
      return { label: display, cls: rarityClass(card.rarity) };
    }
    return { label: 'Regular', cls: 'regular' };
  }
  return null;
}



// ─── Persistence ─────────────────────────────────────────────────────────────

function getStorageKey() {
  // Namespaced per user if available, falls back to shared key
  const uid = window.__dexoriaUserId || 'anon';
  return `${STORAGE_KEY}_${uid}`;
}

function loadCollected() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCollected(data) {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
  } catch { /* storage full or blocked */ }
}

function isCollected(setId, cardLocalId) {
  return !!(state.collected[`${setId}:${cardLocalId}`]);
}

function toggleCollected(setId, cardLocalId) {
  const key = `${setId}:${cardLocalId}`;
  if (state.collected[key]) {
    delete state.collected[key];
  } else {
    state.collected[key] = true;
  }
  saveCollected(state.collected);
}

// ─── TCGDex fetching ─────────────────────────────────────────────────────────

async function fetchSet(setId) {
  // Check cache
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${setId}`);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch { /* ignore */ }

  const res = await fetch(`${TCGDEX_BASE}/sets/${setId}`);
  if (!res.ok) throw new Error(`TCGDex: set ${setId} returned ${res.status}`);
  const data = await res.json();

  try {
    localStorage.setItem(`${CACHE_PREFIX}${setId}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore */ }

  return data;
}

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  sets:        TRACKED_SETS.map(s => ({ ...s, cards: [], loaded: false, error: false })),
  activeIdx:   null,   // null = no set selected yet
  activeFilter: 'all',
  searchVal:   '',
  collected:   {},
};

// ─── Render: overall progress ─────────────────────────────────────────────────

function renderOverall() {
  const total = state.sets.reduce((a, s) => a + s.cards.length, 0);
  const col   = state.sets.reduce((a, s) => a + s.cards.filter(c => isCollected(s.id, c.localId)).length, 0);
  const pct   = total > 0 ? Math.round(col / total * 100) : 0;

  document.getElementById('totalCollected').textContent = col;
  document.getElementById('totalCards').textContent     = total;
  document.getElementById('totalSets').textContent      = state.sets.filter(s => s.loaded).length;
  document.getElementById('totalPct').textContent       = pct + '%';
  requestAnimationFrame(() => {
    document.getElementById('overallFill').style.width = pct + '%';
  });
}

// ─── Render: set hero cards ──────────────────────────────────────────────────

const SET_IMAGES = {
  'me05':   'Pitch Black Logo 2.png',
  'me04':   'Chaos Rising Logo.jpg',
  'me03':   'Perfect Order Logo.jpg',
  'me02.5': 'Ascended Heroes Logo.jpg',
  'me02':   'Phantasmal Flames Logo.png',
  'me01':   'Mega Evolution Logo.jpg',

  'sv10.5b': 'Black Bolt Logo.png',
  'sv10.5a': 'White Flare Logo.png',
  'sv10':    'Destined Rivals Logo.jpg',
  'sv09':    'Journey Together Logo.jpg',
  'sv08.5':  'Prismatic Evolutions Logo.jpg',
  'sv08':    'Surging Sparks Logo.jpg',
  'sv07':    'Stellar Crown Logo.jpg',
  'sv06.5':  'Shrouded Fable Logo.jpg',
  'sv06':    'Twilight Masquerade Logo.jpg',
  'sv05':    'Temporal Forces Logo.png',
  'sv04':    'Paradox Rift Logo.png',
  'sv03.5':  '151 Logo.png',
  'sv03':    'Obsidian Flames Logo.png',
  'sv02':    'Paldea Evolved Logo.png',
  'sv01':    'Scarlet & Violet Base Logo.webp',

  'swsh12.5': 'Crown Zenith Logo.jpg',
  'swsh10': 'Astral Radiance Logo.jpg',
  'swsh09': 'Brilliant Stars Logo.jpg',
  'swsh08': 'Fusion Strike Logo.jpg',
  'swsh07': 'Evolving Skies Logo.jpg',
  'swsh06': 'Chilling Reign Logo.jpg',
  'swsh05': 'Battle Styles Logo.jpg',
  'swsh04': 'Vivid Voltage Logo.jpg',
  'swsh03': 'Darkness Ablaze Logo.jpg',
  'swsh02': 'rebel Clash Logo.jpg',
  'swsh01': 'Sword & Shield Base Logo.jpg', 

  'base1': 'Base Set Logo.jpg',
  'base2': 'Jungle Logo.jpg',
  'base3': 'Fossil Logo.jpg',
  'base4': 'Base Set 2 Logo.jpg',
  'base5': 'Team Rocket Logo.jpg',
  
};

// Track which series are expanded — first series open by default
const expandedSeries = new Set();

function renderTabs() {
  const nav = document.getElementById('setNav');
  nav.innerHTML = '';

  // Group sets by series
  const seriesMap = new Map();
  state.sets.forEach((s, i) => {
    const seriesName = s.series ?? 'Other';
    if (!seriesMap.has(seriesName)) seriesMap.set(seriesName, []);
    seriesMap.get(seriesName).push({ s, i });
  });

  seriesMap.forEach((entries, seriesName) => {
    const isOpen = expandedSeries.has(seriesName);

    // Series totals for header progress
    const seriesTotal = entries.reduce((a, { s }) => a + s.cards.length, 0);
    const seriesCol   = entries.reduce((a, { s }) => a + s.cards.filter(c => isCollected(s.id, c.localId)).length, 0);
    const seriesPct   = seriesTotal > 0 ? Math.round(seriesCol / seriesTotal * 100) : 0;

    const section = document.createElement('div');
    section.className = 'st-series-section';

    // Series header
    const header = document.createElement('button');
    header.className = 'st-series-header' + (isOpen ? ' open' : '');
    header.innerHTML = `
      <div class="st-series-header-left">
        <svg class="st-series-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="st-series-name">${seriesName}</span>
        <span class="st-series-setcount">${entries.length} set${entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="st-series-header-right">
        <div class="st-series-bar"><div class="st-series-bar-fill" style="width:${seriesPct}%"></div></div>
        <span class="st-series-pct">${seriesTotal > 0 ? seriesPct + '%' : '…'}</span>
      </div>
    `;
    header.onclick = () => {
      const collapsing = expandedSeries.has(seriesName);
      if (collapsing) {
        expandedSeries.delete(seriesName);
        // If the active set lives in this series, deselect it so the panel hides
        const activeSet = state.activeIdx !== null ? state.sets[state.activeIdx] : null;
        if (activeSet && (activeSet.series ?? 'Other') === seriesName) {
          state.activeIdx = null;
        }
      } else {
        expandedSeries.add(seriesName);
      }
      renderTabs();
      renderPanel();
    };

    // Sets grid
    const grid = document.createElement('div');
    grid.className = 'st-series-grid' + (isOpen ? ' open' : '');

    entries.forEach(({ s, i }, j) => {
      const total    = s.cards.length;
      const col      = s.cards.filter(c => isCollected(s.id, c.localId)).length;
      const pct      = total > 0 ? Math.round(col / total * 100) : 0;
      const complete = total > 0 && col === total;
      const bgUrl    = SET_IMAGES[s.id] ?? null;

      const wrap = document.createElement('div');
      wrap.className = ['st-hero-card-wrap', i === state.activeIdx ? 'active' : '', complete ? 'complete' : ''].filter(Boolean).join(' ');
      wrap.style.animationDelay = `${j * 0.05}s`;

      const label = document.createElement('span');
      label.className   = 'st-hero-card-label';
      label.textContent = s.name;

      const card = document.createElement('button');
      card.className = ['st-hero-card', i === state.activeIdx ? 'active' : '', complete ? 'complete' : ''].filter(Boolean).join(' ');
      card.setAttribute('aria-pressed', i === state.activeIdx ? 'true' : 'false');
      card.innerHTML = `
        ${bgUrl ? `<img class="st-hero-img" src="${bgUrl}" alt="" aria-hidden="true" />` : ''}
        <div class="st-hero-scan" aria-hidden="true"></div>
        <span class="st-hero-year">${s.year}</span>
        <span class="st-hero-badge">Complete</span>
        <div class="st-hero-info">
          <div class="st-hero-progress"><div class="st-hero-progress-fill" style="width:${pct}%"></div></div>
          <div class="st-hero-meta">
            <span class="st-hero-pct">${s.loaded ? pct + '%' : '…'}</span>
            <span class="st-hero-count">${s.loaded ? col + ' / ' + total : ''}</span>
          </div>
        </div>
      `;

      const onclick = () => {
        state.activeIdx    = i;
        state.activeFilter = 'all';
        state.searchVal    = '';
        document.getElementById('cardSearch').value = '';
        document.querySelectorAll('.st-filter').forEach(f => f.classList.toggle('active', f.dataset.filter === 'all'));
        renderTabs();
        renderPanel();
        // Load immediately if not yet loaded — don't rely on background batch timing
        if (!s.loaded && !s.error) {
          loadSet(i);
        } else {
          enrichSetRarity(i);
        }
      };
      card.onclick  = onclick;
      label.onclick = onclick;

      wrap.appendChild(label);
      wrap.appendChild(card);
      grid.appendChild(wrap);
    });

    section.appendChild(header);
    section.appendChild(grid);
    nav.appendChild(section);
  });
}

// ─── Render: panel header + stats ────────────────────────────────────────────

function renderPanelHeader() {
  const s     = state.sets[state.activeIdx];
  const total = s.cards.length;
  const col   = s.cards.filter(c => isCollected(s.id, c.localId)).length;
  const pct   = total > 0 ? Math.round(col / total * 100) : 0;

  document.getElementById('panelName').textContent  = s.name;
  document.getElementById('panelMeta').textContent  = s.loaded
    ? `${total} cards · ${s.year}${s.releaseDate ? ' · Released ' + s.releaseDate : ''}`
    : `${s.year} · Loading...`;

  document.getElementById('pCollected').textContent = col;
  document.getElementById('pRemaining').textContent = Math.max(0, total - col);
  document.getElementById('pPct').textContent       = pct + '%';

  requestAnimationFrame(() => {
    document.getElementById('setPctFill').style.width      = pct + '%';
    document.getElementById('setPctLabel').textContent     = pct + '%';
  });
}

// ─── Render: card grid ────────────────────────────────────────────────────────

function renderGrid() {
  const s = state.sets[state.activeIdx];
  const grid    = document.getElementById('cardGrid');
  const loading = document.getElementById('stLoading');
  const empty   = document.getElementById('stEmpty');

  if (!s.loaded && !s.error) {
    loading.style.display = 'flex';
    grid.style.display    = 'none';
    empty.style.display   = 'none';
    return;
  }

  loading.style.display = 'none';

  // Filter
  let cards = s.cards;
  if (state.activeFilter === 'collected') cards = cards.filter(c =>  isCollected(s.id, c.localId));
  if (state.activeFilter === 'missing')   cards = cards.filter(c => !isCollected(s.id, c.localId));

  if (state.searchVal) {
    const q = state.searchVal.toLowerCase();
    cards = cards.filter(c =>
      (c.name ?? '').toLowerCase().includes(q) ||
      String(c.localId ?? '').includes(q)
    );
  }

  if (cards.length === 0) {
    grid.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.style.display  = 'grid';

  grid.innerHTML = cards.map((card, i) => {
    const collected  = isCollected(s.id, card.localId);
    const hasImg     = !!card.image;
    const delay      = Math.min(i * 0.015, 0.4);
    const typeInfo   = cardTypeLabel(card);
    const rc         = typeInfo?.cls ?? 'unknown';
    const displayNum = String(card.localId).replace(/RH$/, '');

    return `
      <div class="st-card-wrap" style="animation-delay:${delay}s">
        <div class="st-card ${collected ? 'collected' : ''} st-rarity-${rc}"
             data-set="${s.id}"
             data-local-id="${card.localId}"
             title="${card.name ?? ''} · #${card.localId} · ${typeInfo?.label ?? 'Unknown'}">
          ${hasImg ? `
            <img class="st-card-img" src="${card.image}/low.png" data-base="${card.image}" data-fallback-idx="0" alt="${card.name ?? ''}" loading="lazy" />
            <div class="st-card-img-overlay"></div>
          ` : ''}
          <div class="st-card-check">
            <svg viewBox="0 0 10 8" aria-hidden="true"><polyline points="1,4 4,7 9,1"/></svg>
          </div>
        </div>
        <div class="st-card-info">
          <div class="st-card-num">#${displayNum}</div>
          <div class="st-card-name">${card.name ?? '—'}</div>
          ${typeInfo ? `<div class="st-card-rarity rarity-${rc}">${typeInfo.label}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Attach click listeners
  grid.querySelectorAll('.st-card').forEach(el => {
    el.addEventListener('click', () => {
      const sid = el.dataset.set;
      const lid = el.dataset.localId;
      el.closest('.st-card-wrap')?.classList.toggle('collected', !el.classList.contains('collected'));
      toggleCollected(sid, lid);
      el.classList.toggle('collected');
      renderPanelHeader();
      renderMissing();
      renderOverall();
      updateTabPct(state.activeIdx);
      checkCompletion();
    });
  });

  // Attach image fallback/retry handlers — a brand new visitor is often the
  // very first request for a given card image, and TCGDex's CDN can take a
  // moment to generate/cache it, returning a 404 that a simple refresh fixes.
  grid.querySelectorAll('.st-card-img').forEach(img => {
    img.addEventListener('error', () => handleCardImgError(img));
  });
}

// Retry the same URL a couple of times (covers "CDN still generating the
// asset" on a cold cache), then fall back through other quality/format
// combos, then give up gracefully instead of showing a broken-image icon.
const IMG_RETRY_DELAYS = [600, 1500];          // ms, tried on the original URL
const IMG_FALLBACK_FORMATS = ['low.webp', 'high.png', 'high.webp'];

function handleCardImgError(img) {
  const base    = img.dataset.base;
  const retries = parseInt(img.dataset.retryCount || '0', 10);
  const fbIdx   = parseInt(img.dataset.fallbackIdx || '0', 10);

  if (retries < IMG_RETRY_DELAYS.length) {
    img.dataset.retryCount = String(retries + 1);
    setTimeout(() => {
      // Cache-bust so the browser doesn't just replay the same failed response
      img.src = `${base}/low.png?retry=${retries + 1}`;
    }, IMG_RETRY_DELAYS[retries]);
    return;
  }

  if (fbIdx < IMG_FALLBACK_FORMATS.length) {
    img.dataset.fallbackIdx = String(fbIdx + 1);
    img.src = `${base}/${IMG_FALLBACK_FORMATS[fbIdx]}`;
    return;
  }

  // Exhausted every option — hide the broken image instead of showing
  // the browser's broken-image icon; the card number/name still render.
  img.closest('.st-card-wrap')?.classList.add('st-img-broken');
  img.style.display = 'none';
}

// ─── Render: missing pills ────────────────────────────────────────────────────

function renderMissing() {
  const s       = state.sets[state.activeIdx];
  const missing = s.cards.filter(c => !isCollected(s.id, c.localId));
  const list    = document.getElementById('missingList');
  const shown   = missing.slice(0, 10);

  list.innerHTML = shown.map(c =>
    `<span class="st-missing-pill" data-set="${s.id}" data-local-id="${c.localId}">#${c.localId} ${c.name ?? ''}</span>`
  ).join('') + (missing.length > 10
    ? `<span class="st-missing-pill">+${missing.length - 10} more</span>`
    : '');

  // Click a missing pill → scroll to that card in the grid
  list.querySelectorAll('.st-missing-pill[data-local-id]').forEach(pill => {
    pill.addEventListener('click', () => {
      const target = document.querySelector(
        `.st-card[data-set="${pill.dataset.set}"][data-local-id="${pill.dataset.localId}"]`
      );
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

// ─── Render: completion banner ────────────────────────────────────────────────

function checkCompletion() {
  const s     = state.sets[state.activeIdx];
  const total = s.cards.length;
  const col   = s.cards.filter(c => isCollected(s.id, c.localId)).length;
  let banner  = document.getElementById('completeBanner');

  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'completeBanner';
    banner.className = 'st-complete-banner';
    banner.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
      Set Complete — Congratulations!
    `;
    document.getElementById('stPanel').appendChild(banner);
  }

  banner.classList.toggle('visible', total > 0 && col === total);
}

// ─── Update single tab % without full re-render ───────────────────────────────

function updateTabPct(idx) {
  // Re-render tabs to update series progress bars and individual set cards
  renderTabs();
}

// ─── Full panel render ────────────────────────────────────────────────────────

function renderPanel() {
  const panel = document.getElementById('stPanel');
  const noSel = document.getElementById('stNoSelection');

  if (state.activeIdx === null) {
    panel?.classList.remove('active');
    noSel?.classList.remove('hidden');
    return;
  }

  panel?.classList.add('active');
  noSel?.classList.add('hidden');
  renderPanelHeader();
  renderGrid();
  renderMissing();
  checkCompletion();
}

// ─── Filter / search (exposed on window for inline onclick) ──────────────────

window.setFilter = function(btn, filter) {
  state.activeFilter = filter;
  document.querySelectorAll('.st-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
};

window.filterSearch = function(val) {
  state.searchVal = val;
  renderGrid();
};

// ─── Mark all visible ─────────────────────────────────────────────────────────

function markAllVisible() {
  if (state.activeIdx === null) return;
  const s = state.sets[state.activeIdx];
  document.querySelectorAll('.st-card:not(.collected)').forEach(el => {
    toggleCollected(el.dataset.set, el.dataset.localId);
    el.classList.add('collected');
  });
  renderPanelHeader();
  renderMissing();
  renderOverall();
  updateTabPct(state.activeIdx);
  checkCompletion();
}

// ─── Reset set ────────────────────────────────────────────────────────────────

function resetActiveSet() {
  if (state.activeIdx === null) return;
  const s = state.sets[state.activeIdx];
  if (!confirm(`Reset all collected cards for "${s.name}"?`)) return;
  s.cards.forEach(c => {
    delete state.collected[`${s.id}:${c.localId}`];
  });
  saveCollected(state.collected);
  renderTabs();
  renderPanel();
  renderOverall();
}

// ─── Export checklist ─────────────────────────────────────────────────────────

function exportChecklist() {
  if (state.activeIdx === null) return;
  const s       = state.sets[state.activeIdx];
  const lines   = [`${s.name} — Dexoria Set Tracker Checklist`, ''];
  s.cards.forEach(c => {
    const tick = isCollected(s.id, c.localId) ? '[x]' : '[ ]';
    lines.push(`${tick} #${c.localId} ${c.name ?? ''} (${c.rarity ?? 'Unknown'})`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${s.id}-checklist.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Rarity enrichment ───────────────────────────────────────────────────────
// TCGDex set listings never include rarity — fetch each card individually,
// cache the result for 7 days, then re-render silently.

function applyRarityMap(idx, map) {
  if (!map || !Object.keys(map).length) return;
  state.sets[idx].cards = state.sets[idx].cards.map(c => ({
    ...c,
    // Leave RH copies alone; update base cards with fetched rarity
    rarity: String(c.localId).endsWith('RH') ? c.rarity : (map[c.localId] ?? c.rarity),
  }));
  if (idx === state.activeIdx) renderGrid();
  renderOverall();
}

async function enrichSetRarity(idx) {
  if (idx === null || idx === undefined) return;
  const s = state.sets[idx];
  if (!s.loaded || s.error) return;

  // Only process base (non-RH) cards
  const base = s.cards.filter(c => !String(c.localId).endsWith('RH'));
  if (base.every(c => c.rarity)) return; // already complete

  // Try rarity cache first
  const cacheKey = `${RARITY_CACHE_PREFIX}${s.id}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { map, ts } = JSON.parse(cached);
      if (Date.now() - ts < RARITY_CACHE_TTL) { applyRarityMap(idx, map); return; }
    }
  } catch { /* ignore */ }

  // Batch-fetch individual card data (10 concurrent requests)
  const map = {};
  const BATCH = 10;
  for (let i = 0; i < base.length; i += BATCH) {
    const slice = base.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      slice.map(c =>
        fetch(`${TCGDEX_BASE}/sets/${s.id}/${c.localId}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );
    results.forEach((res, j) => {
      if (res.status === 'fulfilled' && res.value?.rarity) {
        map[slice[j].localId] = res.value.rarity;
      }
    });
  }

  // Persist for 7 days
  try { localStorage.setItem(cacheKey, JSON.stringify({ map, ts: Date.now() })); } catch { /* ignore */ }

  applyRarityMap(idx, map);
}

// ─── Load a single set ────────────────────────────────────────────────────────

async function loadSet(idx) {
  const meta = state.sets[idx];
  try {
    const data          = await fetchSet(meta.id);
    // TCGDex primary → TRACKED_SETS fallback
    const officialCount = data.cardCount?.official || state.sets[idx].officialCount || null;
    const holoCount     = state.sets[idx].holoCount ?? null;
    state.sets[idx].cards       = buildCards(data.cards, officialCount, holoCount);
    state.sets[idx].releaseDate = data.releaseDate ?? null;
    state.sets[idx].loaded       = true;
  } catch (err) {
    console.warn(`[SetTracker] Failed to load set ${meta.id}:`, err);
    state.sets[idx].error  = true;
    state.sets[idx].loaded = true;
  }

  // If this is the active set, re-render and kick off rarity enrichment
  if (idx === state.activeIdx) {
    renderPanel();
    enrichSetRarity(idx); // background — re-renders grid when rarity arrives
  }
  renderTabs();
  renderOverall();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function populateFromCache() {
  // Synchronously load any cached sets into state before first render
  TRACKED_SETS.forEach((meta, idx) => {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${meta.id}`);
      if (!raw) return;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts >= CACHE_TTL) return; // stale
      // TCGDex primary → TRACKED_SETS fallback
      const officialCount         = data.cardCount?.official || state.sets[idx].officialCount || null;
      const holoCount             = state.sets[idx].holoCount ?? null;
      state.sets[idx].cards       = buildCards(data.cards, officialCount, holoCount);
      state.sets[idx].releaseDate = data.releaseDate ?? null;
      state.sets[idx].loaded      = true;
    } catch { /* ignore corrupt cache */ }
  });
}

async function init() {
  // Load user ID for namespaced storage
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) window.__dexoriaUserId = user.id;
  } catch { /* not logged in */ }

  state.collected = loadCollected();

  // ── Populate from cache synchronously so first render is instant ──
  populateFromCache();

  renderTabs();
  renderPanel();   // shows the no-selection placeholder (activeIdx is null)
  renderOverall();

  // Wire up buttons
  document.getElementById('exportBtn')?.addEventListener('click', exportChecklist);
  document.getElementById('resetBtn')?.addEventListener('click', resetActiveSet);
  document.getElementById('markAllBtn')?.addEventListener('click', markAllVisible);

  // ── Only fetch sets that aren't already loaded from cache ──
  const stale = state.sets.map((_, i) => i).filter(i => !state.sets[i].loaded);

  if (stale.length === 0) return; // everything cached — enrichSetRarity already fired above

  // Fetch active set first so the visible panel populates immediately
  if (stale.includes(state.activeIdx)) {
    await loadSet(state.activeIdx);
  }

  // Warm the rest of the cache one set at a time, during browser idle time.
  // This still gets everything cached (so overall stats fill in), but
  // avoids competing with the actively viewed set for connections/rate
  // limit on a cold, first-ever visit.
  const rest = stale.filter(i => i !== state.activeIdx);
  backgroundPrefetch(rest);
}

function backgroundPrefetch(indices) {
  if (indices.length === 0) return;
  const [next, ...remaining] = indices;
  const schedule = window.requestIdleCallback || (cb => setTimeout(cb, 300));
  schedule(async () => {
    await loadSet(next);
    backgroundPrefetch(remaining);
  });
}

document.addEventListener('DOMContentLoaded', init);
