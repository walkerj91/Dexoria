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
  'me05':   '../images/Pitch Black Logo 2.png',
  'me04':   '../images/Chaos Rising Logo.jpg',
  'me03':   '../images/Perfect Order Logo.jpg',
  'me02.5': '../images/Ascended Heroes Logo.jpg',
  'me02':   '../images/Phantasmal Flames Logo.png',
  'me01':   '../images/Mega Evolution Logo.jpg',

  'sv10.5b': '../images/Black Bolt Logo.png',
  'sv10.5a': '../images/White Flare Logo.png',
  'sv10':    '../images/Destined Rivals Logo.jpg',
  'sv09':    '../images/Journey Together Logo.jpg',
  'sv08.5':  '../images/Prismatic Evolutions Logo.jpg',
  'sv08':    '../images/Surging Sparks Logo.jpg',
  'sv07':    '../images/Stellar Crown Logo.jpg',
  'sv06.5':  '../images/Shrouded Fable Logo.jpg',
  'sv06':    '../images/Twilight Masquerade Logo.jpg',
  'sv05':    '../images/Temporal Forces Logo.png',
  'sv04':    '../images/Paradox Rift Logo.png',
  'sv03.5':  '../images/151 Logo.png',
  'sv03':    '../images/Obsidian Flames Logo.png',
  'sv02':    '../images/Paldea Evolved Logo.png',
  'sv01':    '../images/Scarlet & Violet Base Logo.webp',

  'swsh12.5': '../images/Crown Zenith Logo.jpg',
  'swsh10': '../images/Astral Radiance Logo.jpg',
  'swsh09': '../images/Brilliant Stars Logo.jpg',
  'swsh08': '../images/Fusion Strike Logo.jpg',
  'swsh07': '../images/Evolving Skies Logo.jpg',
  'swsh06': '../images/Chilling Reign Logo.jpg',
  'swsh05': '../images/Battle Styles Logo.jpg',
  'swsh04': '../images/Vivid Voltage Logo.jpg',
  'swsh03': '../images/Darkness Ablaze Logo.jpg',
  'swsh02': '../images/rebel Clash Logo.jpg',
  'swsh01': '../images/Sword & Shield Base Logo.jpg', 

  'base1': '../images/Base Set Logo.jpg',
  'base2': '../images/Jungle Logo.jpg',
  'base3': '../images/Fossil Logo.jpg',
  'base4': '../images/Base Set 2 Logo.jpg',
  'base5': '../images/Team Rocket Logo.jpg',
  
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
            <img class="st-card-img" src="${card.image}/low.png" alt="${card.name ?? ''}" loading="lazy" />
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

  // Fetch all remaining stale sets in parallel batches of 5
  // This ensures everything gets cached quickly on first visit
  const rest = stale.filter(i => i !== state.activeIdx);
  const BATCH = 5;
  for (let b = 0; b < rest.length; b += BATCH) {
    await Promise.allSettled(rest.slice(b, b + BATCH).map(i => loadSet(i)));
  }
}

document.addEventListener('DOMContentLoaded', init);