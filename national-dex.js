/**
 * national-dex.js
 * Dexoria — National Dex Tracker section
 *
 * Fetches the full National Dex species list from PokeAPI (one call,
 * cached long-term), renders it as a collapsible-by-generation grid of
 * sprite tiles, and persists "owned" state to localStorage keyed per
 * Supabase user ID — same pattern as set-tracker.js.
 */

import { supabase } from './supabaseClient.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const SPECIES_LIST_URL = 'https://pokeapi.co/api/v2/pokemon-species?limit=1025&offset=0';
const SPRITE_BASE       = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

const CACHE_KEY  = 'dexoria_ndex_species_v1';
const CACHE_TTL  = 30 * 24 * 60 * 60 * 1000; // 30 days — dex list barely changes
const STORAGE_KEY = 'dexoria_national_dex_owned';

// National Dex generation ranges (Gen 1 – Gen 9, through Pecharunt #1025)
const GENERATIONS = [
  { name: 'Generation I',    from: 1,    to: 151  },
  { name: 'Generation II',   from: 152,  to: 251  },
  { name: 'Generation III',  from: 252,  to: 386  },
  { name: 'Generation IV',   from: 387,  to: 493  },
  { name: 'Generation V',    from: 494,  to: 649  },
  { name: 'Generation VI',   from: 650,  to: 721  },
  { name: 'Generation VII',  from: 722,  to: 809  },
  { name: 'Generation VIII', from: 810,  to: 905  },
  { name: 'Generation IX',   from: 906,  to: 1025 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatName(raw) {
  return raw
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function spriteUrl(id) {
  return `${SPRITE_BASE}/${id}.png`;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function getStorageKey() {
  const uid = window.__dexoriaUserId || 'anon';
  return `${STORAGE_KEY}_${uid}`;
}

function loadOwned() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOwned(data) {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
  } catch { /* storage full or blocked */ }
}

function isOwned(id) {
  return !!ndexState.owned[id];
}

function toggleOwned(id) {
  if (ndexState.owned[id]) {
    delete ndexState.owned[id];
  } else {
    ndexState.owned[id] = true;
  }
  saveOwned(ndexState.owned);
}

// ─── Fetch species list ────────────────────────────────────────────────────

async function fetchSpeciesList() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch { /* ignore corrupt cache */ }

  const res = await fetch(SPECIES_LIST_URL);
  if (!res.ok) throw new Error(`PokeAPI species list returned ${res.status}`);
  const json = await res.json();

  const species = json.results.map((r, i) => ({
    id: i + 1,
    name: formatName(r.name),
  }));

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: species, ts: Date.now() }));
  } catch { /* ignore */ }

  return species;
}

// ─── State ───────────────────────────────────────────────────────────────────

const ndexState = {
  species:  [],   // [{ id, name }]
  loaded:   false,
  error:    false,
  owned:    {},
  activeFilter: 'all',
  searchVal: '',
};

const expandedGens = new Set(['Generation I']); // first gen open by default

// ─── Render: overall progress ─────────────────────────────────────────────────

function renderOverall() {
  const total = ndexState.species.length;
  const col   = ndexState.species.filter(s => isOwned(s.id)).length;
  const pct   = total > 0 ? Math.round(col / total * 100) : 0;

  document.getElementById('ndexCollected').textContent = col;
  document.getElementById('ndexTotal').textContent     = total || '—';
  document.getElementById('ndexGens').textContent      = GENERATIONS.length;
  document.getElementById('ndexPct').textContent       = pct + '%';
  requestAnimationFrame(() => {
    document.getElementById('ndexOverallFill').style.width = pct + '%';
  });
}

// ─── Filtering helper ─────────────────────────────────────────────────────────

function visibleSpeciesFor(gen) {
  let list = ndexState.species.filter(s => s.id >= gen.from && s.id <= gen.to);

  if (ndexState.activeFilter === 'owned')   list = list.filter(s =>  isOwned(s.id));
  if (ndexState.activeFilter === 'missing') list = list.filter(s => !isOwned(s.id));

  if (ndexState.searchVal) {
    const q = ndexState.searchVal.toLowerCase();
    list = list.filter(s => s.name.toLowerCase().includes(q) || String(s.id).includes(q));
  }

  return list;
}

// ─── Render: generation accordion ────────────────────────────────────────────

function renderGens() {
  const nav = document.getElementById('ndexGenNav');
  if (!nav) return;
  nav.innerHTML = '';

  if (!ndexState.loaded) {
    nav.innerHTML = `
      <div class="ndex-loading">
        <div class="ndex-loading-inner">
          <div class="ndex-spinner"></div>
          <span class="ndex-loading-text">Loading National Dex from PokeAPI...</span>
        </div>
      </div>`;
    return;
  }

  if (ndexState.error) {
    nav.innerHTML = `
      <div class="ndex-empty">
        <span class="ndex-empty-text">Couldn't load the National Dex — try refreshing.</span>
      </div>`;
    return;
  }

  GENERATIONS.forEach((gen, gi) => {
    const isOpen  = expandedGens.has(gen.name);
    const all     = ndexState.species.filter(s => s.id >= gen.from && s.id <= gen.to);
    const col     = all.filter(s => isOwned(s.id)).length;
    const total   = all.length;
    const pct     = total > 0 ? Math.round(col / total * 100) : 0;
    const complete = total > 0 && col === total;

    const section = document.createElement('div');
    section.className = 'ndex-gen-section';
    section.dataset.gen = gen.name;

    const header = document.createElement('button');
    header.className = 'ndex-gen-header' + (isOpen ? ' open' : '');
    header.dataset.gen = gen.name;
    header.innerHTML = `
      <div class="ndex-gen-header-left">
        <svg class="ndex-gen-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="ndex-gen-name">${gen.name}</span>
        <span class="ndex-gen-range">#${String(gen.from).padStart(3,'0')}–#${String(gen.to).padStart(3,'0')}</span>
        ${complete ? '<span class="ndex-gen-complete-badge">Complete</span>' : ''}
      </div>
      <div class="ndex-gen-header-right">
        <div class="ndex-gen-bar"><div class="ndex-gen-bar-fill" style="width:${pct}%"></div></div>
        <span class="ndex-gen-pct">${total > 0 ? pct + '%' : '…'}</span>
      </div>
    `;
    header.onclick = () => {
      if (expandedGens.has(gen.name)) expandedGens.delete(gen.name);
      else expandedGens.add(gen.name);
      renderGens();
    };

    const grid = document.createElement('div');
    grid.className = 'ndex-gen-grid' + (isOpen ? ' open' : '');

    if (isOpen) {
      const list = visibleSpeciesFor(gen);
      if (list.length === 0) {
        grid.innerHTML = `
          <div class="ndex-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span class="ndex-empty-text">No Pokémon match your filter</span>
          </div>`;
      } else {
        grid.innerHTML = list.map((s, i) => {
          const owned = isOwned(s.id);
          const delay = Math.min(i * 0.01, 0.3);
          return `
            <div class="ndex-tile ${owned ? 'owned' : ''}" data-id="${s.id}" style="animation-delay:${delay}s" title="${s.name} · #${String(s.id).padStart(4,'0')}">
              <div class="ndex-tile-check">
                <svg viewBox="0 0 10 8" aria-hidden="true"><polyline points="1,4 4,7 9,1"/></svg>
              </div>
              <img class="ndex-tile-img" src="${spriteUrl(s.id)}" alt="${s.name}" loading="lazy" />
              <span class="ndex-tile-num">#${String(s.id).padStart(4,'0')}</span>
              <span class="ndex-tile-name">${s.name}</span>
            </div>
          `;
        }).join('');

        grid.querySelectorAll('.ndex-tile').forEach(el => {
          el.addEventListener('click', () => {
            const id = Number(el.dataset.id);
            toggleOwned(id);
            el.classList.toggle('owned');
            renderOverall();
            updateGenHeader(gen);
          });
        });
      }
    }

    section.appendChild(header);
    section.appendChild(grid);
    nav.appendChild(section);
  });
}

/** Lightweight update of one generation's header bar — patches existing DOM
 *  in place rather than re-rendering, so scroll position is never disturbed. */
function updateGenHeader(gen) {
  const header = document.querySelector(`.ndex-gen-header[data-gen="${gen.name}"]`);
  if (!header) { renderGens(); return; } // fallback if somehow not found

  const all     = ndexState.species.filter(s => s.id >= gen.from && s.id <= gen.to);
  const col     = all.filter(s => isOwned(s.id)).length;
  const total   = all.length;
  const pct     = total > 0 ? Math.round(col / total * 100) : 0;
  const complete = total > 0 && col === total;

  const fill = header.querySelector('.ndex-gen-bar-fill');
  if (fill) fill.style.width = pct + '%';

  const pctEl = header.querySelector('.ndex-gen-pct');
  if (pctEl) pctEl.textContent = total > 0 ? pct + '%' : '…';

  const left = header.querySelector('.ndex-gen-header-left');
  const existingBadge = left?.querySelector('.ndex-gen-complete-badge');
  if (complete && !existingBadge) {
    left.insertAdjacentHTML('beforeend', '<span class="ndex-gen-complete-badge">Complete</span>');
  } else if (!complete && existingBadge) {
    existingBadge.remove();
  }
}

// ─── Filter / search ───────────────────────────────────────────────────────

function wireFilters() {
  document.querySelectorAll('.ndex-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      ndexState.activeFilter = btn.dataset.filter;
      document.querySelectorAll('.ndex-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGens();
    });
  });

  const search = document.getElementById('ndexSearch');
  search?.addEventListener('input', (e) => {
    ndexState.searchVal = e.target.value;
    // Auto-expand every generation that has a match so search results are visible
    if (ndexState.searchVal) {
      GENERATIONS.forEach(gen => {
        const hasMatch = ndexState.species.some(s =>
          s.id >= gen.from && s.id <= gen.to &&
          (s.name.toLowerCase().includes(ndexState.searchVal.toLowerCase()) || String(s.id).includes(ndexState.searchVal))
        );
        if (hasMatch) expandedGens.add(gen.name);
      });
    }
    renderGens();
  });
}

// ─── Export checklist ─────────────────────────────────────────────────────────

function exportChecklist() {
  const lines = ['National Dex — Dexoria Checklist', ''];
  GENERATIONS.forEach(gen => {
    lines.push(`-- ${gen.name} (#${gen.from}-#${gen.to}) --`);
    ndexState.species
      .filter(s => s.id >= gen.from && s.id <= gen.to)
      .forEach(s => {
        const tick = isOwned(s.id) ? '[x]' : '[ ]';
        lines.push(`${tick} #${String(s.id).padStart(4,'0')} ${s.name}`);
      });
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `national-dex-checklist.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Reset all ─────────────────────────────────────────────────────────────

function resetAll() {
  if (!confirm('Reset your entire National Dex progress? This cannot be undone.')) return;
  ndexState.owned = {};
  saveOwned(ndexState.owned);
  renderGens();
  renderOverall();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initNationalDex() {
  const section = document.getElementById('ndexSection');
  if (!section) return; // section not present on this page

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) window.__dexoriaUserId = user.id;
  } catch { /* not logged in */ }

  ndexState.owned = loadOwned();

  renderGens();
  renderOverall();
  wireFilters();

  document.getElementById('ndexExportBtn')?.addEventListener('click', exportChecklist);
  document.getElementById('ndexResetBtn')?.addEventListener('click', resetAll);

  try {
    ndexState.species = await fetchSpeciesList();
    ndexState.loaded  = true;
  } catch (err) {
    console.warn('[NationalDex] Failed to load species list:', err);
    ndexState.error  = true;
    ndexState.loaded = true;
  }

  renderGens();
  renderOverall();
}

document.addEventListener('DOMContentLoaded', initNationalDex);
