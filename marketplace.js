import { resolveCardImages } from 'card-image-cache.js';

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';

let allCards = [];

// ============================================
// CARD DETAILS — price, score, condition by rarity
// ============================================
function getCardDetails(card) {
    const rarity = card.rarity?.toLowerCase() || '';

    let price, score, condition;

    if (rarity.includes('secret') || rarity.includes('hyper')) {
        price     = Math.floor(Math.random() * 400) + 200;
        score     = Math.floor(Math.random() * 10)  + 90;
        condition = 'NM';
    } else if (rarity.includes('ultra') || rarity.includes('vmax') || rarity.includes('ex')) {
        price     = Math.floor(Math.random() * 150) + 30;
        score     = Math.floor(Math.random() * 10)  + 80;
        condition = ['NM', 'LP'][Math.floor(Math.random() * 2)];
    } else if (rarity.includes('rare') || rarity.includes('holo')) {
        price     = Math.floor(Math.random() * 40)  + 5;
        score     = Math.floor(Math.random() * 10)  + 70;
        condition = ['NM', 'LP', 'MP'][Math.floor(Math.random() * 3)];
    } else {
        price     = Math.floor(Math.random() * 4)   + 1;
        score     = Math.floor(Math.random() * 10)  + 50;
        condition = ['LP', 'MP', 'HP'][Math.floor(Math.random() * 3)];
    }

    return { price, score, condition };
}

// ============================================
// MAIN MARKETPLACE
// ============================================
async function initMarketplace() {
    const grid = document.querySelector('.dex-grid');
    const btn  = document.getElementById('expandBtn');

    if (!grid || !btn) return;

    const BATCH_SIZE = 8;
    let shown = 0;

    function renderCards(cards) {
        cards.forEach(card => {
            const { price, score, condition } = card;

            const div = document.createElement('div');
            div.className = 'dex-card';
            div.innerHTML = `
                <div class="dex-img-wrap">
                    <img src="${card.image}/high.png" alt="${card.name}" loading="lazy">
                </div>
                <h3 class="dex-card-title">${card.name}</h3>
                <p class="dex-card-sub">${card.setName} • ${card.rarity || 'Unknown'}</p>
                <div class="dex-row">
                    <span class="dex-condition">${condition}</span>
                    <span class="dex-price">£${price}</span>
                    <span class="dex-score">★ ${score}</span>
                </div>
            `;
            grid.appendChild(div);
        });
    }

    function showNextBatch() {
        const next = allCards.slice(shown, shown + BATCH_SIZE);
        renderCards(next);
        shown += next.length;
        if (shown >= allCards.length) btn.style.display = 'none';
    }

    try {
        const setIds = ['me01', 'me02', 'me02.5', 'me03', 'me04', 'me05'];

        const setResults = await Promise.allSettled(
            setIds.map(id => fetch(`${TCGDEX_BASE}/sets/${id}`).then(r => r.json()))
        );

        const cardFetchPromises = [];

        setResults.forEach((result, i) => {
            if (result.status !== 'fulfilled') {
                console.warn(`Set ${setIds[i]} failed to load`);
                return;
            }
            const set = result.value;
            if (!set?.cards) return;
            const setName = set.name || setIds[i];

            set.cards.forEach(card => {
                if (!card.image) return;
                cardFetchPromises.push(
                    fetch(`${TCGDEX_BASE}/cards/${setIds[i]}-${card.localId}`)
                        .then(r => r.json())
                        .then(fullCard => ({
                            ...fullCard,
                            image: card.image,
                            setName
                        }))
                        .catch(() => ({
                            ...card,
                            setName,
                            rarity: null
                        }))
                );
            });
        });

        const BATCH = 20;
        for (let i = 0; i < cardFetchPromises.length; i += BATCH) {
            const batch = await Promise.allSettled(cardFetchPromises.slice(i, i + BATCH));
            batch.forEach(result => {
                if (result.status === 'fulfilled' && result.value?.image) {
                    allCards.push(result.value);
                }
            });
        }

        allCards = allCards
            .map(card => ({ ...card, ...getCardDetails(card) }))
            .sort((a, b) => b.score - a.score);

        showNextBatch();
        btn.addEventListener('click', showNextBatch);
        initMarketIntelligence();
        initSearch();
        initFilters();

        resolveCardImages(allCards).then(resolved => {
            allCards = resolved;
            console.log('Card images cached in background');
        });

    } catch (error) {
        console.error("TCGdex error:", error);
    }

    function initFilters() {
        const filterSet      = document.getElementById('filterSet');
        const filterRarity   = document.getElementById('filterRarity');
        const applyBtn       = document.getElementById('filterApplyBtn');
        const resetBtn       = document.getElementById('filterResetBtn');
        const grid           = document.querySelector('.dex-grid');
        const expandBtn      = document.getElementById('expandBtn');

        if (!filterSet || !filterRarity) return;

        const setOrder = [
            'Mega Evolution',
            'Phantasmal Flames',
            'Ascended Heroes',
            'Perfect Order',
            'Chaos Rising',
            'Pitch Black',
        ];

        const setNames = [...new Set(allCards.map(c => c.setName))]
            .filter(name => name && name !== 'undefined')
            .sort((a, b) => {
                const ai = setOrder.indexOf(a);
                const bi = setOrder.indexOf(b);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return  1;
                return a.localeCompare(b);
            });

        console.log('Sets in dropdown:', setNames);

        setNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value       = name;
            opt.textContent = name;
            filterSet.appendChild(opt);
        });

        function applyFilters() {
            const selectedSet    = filterSet.value;
            const selectedRarity = filterRarity.value;

            const filtered = allCards.filter(card => {
                const rarity        = card.rarity?.toLowerCase() || '';
                const matchesSet    = !selectedSet    || card.setName === selectedSet;
                const matchesRarity = !selectedRarity || rarity.includes(selectedRarity);
                return matchesSet && matchesRarity;
            });

            grid.innerHTML = '';
            expandBtn.style.display = 'none';

            if (filtered.length === 0) {
                grid.innerHTML = `<p style="color:rgba(255,255,255,0.4); text-align:center; grid-column:1/-1; padding:40px 0;">No cards found for this filter.</p>`;
                return;
            }

            filtered.forEach(card => {
                const div = document.createElement('div');
                div.className = 'dex-card';
                div.innerHTML = `
                    <div class="dex-img-wrap">
                        <img src="${card.image}/high.png" alt="${card.name}" loading="lazy">
                    </div>
                    <h3 class="dex-card-title">${card.name}</h3>
                    <p class="dex-card-sub">${card.setName} • ${card.rarity || 'Unknown'}</p>
                    <div class="dex-row">
                        <span class="dex-condition">${card.condition}</span>
                        <span class="dex-price">£${card.price}</span>
                        <span class="dex-score">★ ${card.score}</span>
                    </div>
                `;
                grid.appendChild(div);
            });
        }

        function resetFilters() {
            filterSet.value    = '';
            filterRarity.value = '';
            grid.innerHTML     = '';

            let shown = 0;
            const BATCH_SIZE = 8;

            function showBatch() {
                const next = allCards.slice(shown, shown + BATCH_SIZE);
                next.forEach(card => {
                    const div = document.createElement('div');
                    div.className = 'dex-card';
                    div.innerHTML = `
                        <div class="dex-img-wrap">
                            <img src="${card.image}/high.png" alt="${card.name}" loading="lazy">
                        </div>
                        <h3 class="dex-card-title">${card.name}</h3>
                        <p class="dex-card-sub">${card.setName} • ${card.rarity || 'Unknown'}</p>
                        <div class="dex-row">
                            <span class="dex-condition">${card.condition}</span>
                            <span class="dex-price">£${card.price}</span>
                            <span class="dex-score">★ ${card.score}</span>
                        </div>
                    `;
                    grid.appendChild(div);
                });
                shown += next.length;
                expandBtn.style.display = shown >= allCards.length ? 'none' : 'block';
            }

            showBatch();
            expandBtn.onclick = showBatch;
        }

        applyBtn.addEventListener('click', applyFilters);
        resetBtn.addEventListener('click', resetFilters);
    }
}

// ============================================
// MARKET INTELLIGENCE
// ============================================

const MI_TRACKED_SETS = ['me01', 'me02', 'me02.5', 'me03', 'me04', 'me05'];

const MI_RARITY_PRICES = {
    'Special Illustration Rare': { min: 18,  max: 95  },
    'Hyper Rare':                 { min: 22,  max: 120 },
    'Ultra Rare':                 { min: 8,   max: 55  },
    'Double Rare':                { min: 4,   max: 28  },
    'Illustration Rare':          { min: 6,   max: 40  },
    'Rare':                       { min: 1.5, max: 12  },
    'Common':                     { min: 0.1, max: 1.5 },
    'Uncommon':                   { min: 0.2, max: 2   },
};

const MI_CACHE_KEY = 'dexoria_market_intelligence';
const MI_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function miSeededRng(seed) {
    let s = seed;
    return () => {
        s ^= s << 13; s ^= s >> 7; s ^= s << 17;
        return ((s >>> 0) / 0xFFFFFFFF);
    };
}

function miWeeklySeed() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay());
    return startOfWeek.getTime() / 1000;
}

async function miFetchSetCards(setId) {
    try {
        const res = await fetch(`${TCGDEX_BASE}/sets/${setId}`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function fetchMarketData() {
    try {
        const cached = sessionStorage.getItem(MI_CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < MI_CACHE_TTL) return data;
        }
    } catch { /* ignore */ }

    const rng = miSeededRng(miWeeklySeed());
    const setResults = await Promise.allSettled(
        MI_TRACKED_SETS.map(id => miFetchSetCards(id))
    );

    const cards   = [];
    const setMeta = [];

    for (const result of setResults) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const set = result.value;
        const cardCount = set.cards?.length ?? 0;
        if (cardCount === 0) continue;

        setMeta.push({ name: set.name, id: set.id, cardCount });

        const sample = (set.cards ?? []).slice(0, 20);
        for (const card of sample) {
            const rarity    = card.rarity ?? 'Common';
            const band      = MI_RARITY_PRICES[rarity] ?? MI_RARITY_PRICES['Common'];
            const basePrice = band.min + rng() * (band.max - band.min);
            const gain      = (rng() * 30 - 5);
            cards.push({
                id:        card.id,
                fullName:  card.name ?? 'Unknown',
                set:       set.name,
                setId:     set.id,
                rarity,
                price:     parseFloat(basePrice.toFixed(2)),
                gain:      parseFloat(gain.toFixed(1)),
                dealScore: Math.min(99, Math.max(50, Math.round(60 + rng() * 39))),
            });
        }
    }

    if (cards.length === 0) return null;

    const gainers = [...cards]
        .filter(c => c.gain > 0)
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 10);

    const topDeals = [...cards].sort((a, b) => b.dealScore - a.dealScore).slice(0, 2);

    const topSets = [...setMeta]
        .sort((a, b) => b.cardCount - a.cardCount)
        .slice(0, 3);

    const avgGain  = gainers.length
        ? parseFloat((gainers.reduce((s, c) => s + c.gain, 0) / gainers.length).toFixed(1))
        : 0;
    const bestGain = gainers[0]?.gain ?? 0;

    const data = {
        topDeals,
        gainers,
        topSets,
        stats: {
            avgGain,
            bestGain,
            activeCards: cards.filter(c => c.gain > 0).length,
            hotSets:     topSets.length,
        },
        generatedAt: Date.now(),
    };

    try {
        sessionStorage.setItem(MI_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch { /* ignore */ }

    return data;
}

function miRenderTopDeals(deals) {
    if (!deals?.length) return;

    deals.forEach((deal, idx) => {
        const suffix  = idx === 0 ? '' : '2';
        const nameEl  = document.getElementById(`miDealName${suffix}`);
        const setEl   = document.getElementById(`miDealSet${suffix}`);
        const scoreEl = document.getElementById(`miScoreNum${suffix}`);
        const ringEl  = document.getElementById(`miScoreRing${suffix}`);
        const barEl   = document.getElementById(`miDealBarFill${suffix}`);

        if (nameEl)  nameEl.textContent  = deal.fullName;
        if (setEl)   setEl.textContent   = deal.set;
        if (scoreEl) scoreEl.textContent = deal.dealScore;

        if (ringEl) {
            const offset = 163.36 * (1 - deal.dealScore / 100);
            setTimeout(() => { ringEl.style.strokeDashoffset = offset; }, 100 + idx * 150);
        }
        if (barEl) {
            setTimeout(() => { barEl.style.width = `${deal.dealScore}%`; }, 100 + idx * 150);
        }
    });
}

function miRenderGainers(gainers) {
    const list = document.getElementById('miGainersList');
    if (!list) return;

    const maxGain = Math.max(...gainers.map(g => g.gain), 1);

    list.innerHTML = gainers.map((card, i) => `
        <div class="mi-gainer-row" style="animation-delay: ${i * 0.06}s">
            <span class="mi-gainer-rank">${i + 1}</span>
            <span class="mi-gainer-name" title="${card.fullName}">${card.fullName}</span>
            <div class="mi-gainer-bar-wrap">
                <div class="mi-gainer-bar" data-pct="${(card.gain / maxGain) * 100}"></div>
            </div>
            <span class="mi-gainer-pct">+${card.gain}%</span>
        </div>
    `).join('');

    requestAnimationFrame(() => {
        list.querySelectorAll('.mi-gainer-bar').forEach(bar => {
            setTimeout(() => { bar.style.width = bar.dataset.pct + '%'; }, 80);
        });
    });
}

function miRenderTopSets(sets) {
    const list = document.getElementById('miSetsList');
    if (!list) return;

    const maxCount = Math.max(...sets.map(s => s.cardCount), 1);

    list.innerHTML = sets.map((set, i) => `
        <div class="mi-set-row" style="animation-delay: ${i * 0.08}s">
            <div class="mi-set-row-top">
                <span class="mi-set-name">${set.name}</span>
                <span class="mi-set-count">${set.cardCount} cards</span>
            </div>
            <div class="mi-set-progress">
                <div class="mi-set-fill" data-pct="${(set.cardCount / maxCount) * 100}"></div>
            </div>
        </div>
    `).join('');

    requestAnimationFrame(() => {
        list.querySelectorAll('.mi-set-fill').forEach(fill => {
            setTimeout(() => { fill.style.width = fill.dataset.pct + '%'; }, 80);
        });
    });
}

function miRenderStats(stats) {
    const avgEl   = document.getElementById('miAvgGain');
    const topEl   = document.getElementById('miTopGain');
    const cardsEl = document.getElementById('miActiveCards');
    const setsEl  = document.getElementById('miActiveSets');

    if (avgEl)   { avgEl.textContent  = `+${stats.avgGain}%`;  avgEl.classList.add('mi-positive'); }
    if (topEl)   { topEl.textContent  = `+${stats.bestGain}%`; topEl.classList.add('mi-positive'); }
    if (cardsEl) cardsEl.textContent  = stats.activeCards;
    if (setsEl)  setsEl.textContent   = stats.hotSets;
}

function miRenderTicker(data) {
    const inner = document.getElementById('miTickerInner');
    if (!inner) return;

    const { topDeals, gainers, topSets } = data;
    const items = [
        `<span class="mi-ticker-item"><span class="mi-t-dim">—</span> TOP DEALS: ${topDeals.map(d => `<span class="mi-t-gold">${d.fullName}</span> <span class="mi-t-dim">${d.dealScore}%</span>`).join('<span class="mi-ticker-separator"> · </span>')}</span>`,
        `<span class="mi-ticker-item"><span class="mi-t-dim">—</span> TOP GAINERS: ${gainers.map(g => `<span class="mi-t-green">${g.fullName} +${g.gain}%</span>`).join('<span class="mi-ticker-separator"> · </span>')}</span>`,
        `<span class="mi-ticker-item"><span class="mi-t-dim">—</span> TOP SETS: ${topSets.map(s => `<span class="mi-t-gold">${s.name}</span>`).join('<span class="mi-ticker-separator"> · </span>')}</span>`,
    ];

    inner.innerHTML = [...items, ...items].join('');
    inner.classList.add('mi-ticker-animate');
}

function miSetLastUpdated() {
    const el = document.getElementById('miLastUpdated');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function miRenderError() {
    const gainers  = document.getElementById('miGainersList');
    const sets     = document.getElementById('miSetsList');
    const errorMsg = '<p style="font-family:Rajdhani,sans-serif;font-size:12px;color:#5a4a2a;margin:0;">Unable to load data</p>';
    if (gainers) gainers.innerHTML = errorMsg;
    if (sets)    sets.innerHTML    = errorMsg;

    const ticker = document.getElementById('miTickerInner');
    if (ticker) ticker.innerHTML = '<span class="mi-ticker-loading">Market data unavailable — check back soon</span>';
}

async function initMarketIntelligence() {
    const refreshBtn = document.getElementById('miRefreshBtn');

    async function load(forceRefresh = false) {
        if (forceRefresh) {
            try { sessionStorage.removeItem(MI_CACHE_KEY); } catch { /* ignore */ }
        }

        if (refreshBtn) {
            refreshBtn.classList.add('spinning');
            refreshBtn.disabled = true;
        }

        try {
            const data = await fetchMarketData();
            if (!data) { miRenderError(); return; }

            miRenderTopDeals(data.topDeals);
            miRenderGainers(data.gainers);
            miRenderTopSets(data.topSets);
            miRenderStats(data.stats);
            miRenderTicker(data);
            miSetLastUpdated();
        } catch (err) {
            console.error('[MarketIntelligence] Failed to load:', err);
            miRenderError();
        } finally {
            if (refreshBtn) {
                refreshBtn.classList.remove('spinning');
                refreshBtn.disabled = false;
            }
        }
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => load(true));
    }

    await load();
}

// ============================================
// SEARCH
// ============================================
function initSearch() {
    const input          = document.getElementById('marketSearchInput');
    const btn            = document.getElementById('marketSearchBtn');
    const status         = document.getElementById('marketSearchStatus');
    const searchGrid     = document.getElementById('marketSearchGrid');
    const mainGrid       = document.querySelector('.dex-grid');
    const expandBtn      = document.getElementById('expandBtn');
    const clearBtn       = document.getElementById('clearSearchBtn');
    const clearContainer = document.getElementById('clearSearchContainer');

    if (!input || !btn) return;

    async function doSearch() {
        const query = input.value.trim();
        if (!query) return;

        status.textContent   = 'Searching…';
        searchGrid.innerHTML = '';
        btn.disabled         = true;

        try {
            const res   = await fetch(`${TCGDEX_BASE}/cards`);
            const cards = await res.json();

            const matches = cards
                .filter(c => c.name?.toLowerCase().includes(query.toLowerCase()) && c.image)
                .slice(0, 60)
                .map(card => ({
                    ...card,
                    setName: card.set?.name ?? 'Unknown Set',
                    ...getCardDetails(card)
                }));

            if (matches.length === 0) {
                status.textContent = 'No cards found.';
                btn.disabled = false;
                return;
            }

            status.textContent = `${matches.length} card${matches.length !== 1 ? 's' : ''} found`;

            mainGrid.style.display       = 'none';
            expandBtn.style.display      = 'none';
            clearContainer.style.display = 'flex';
            searchGrid.style.display     = 'grid';

            matches.forEach(card => {
                const div = document.createElement('div');
                div.className = 'dex-card';
                div.innerHTML = `
                    <div class="dex-img-wrap">
                        <img src="${card.image}/high.png" alt="${card.name}" loading="lazy">
                    </div>
                    <h3 class="dex-card-title">${card.name}</h3>
                    <p class="dex-card-sub">${card.setName} • ${card.rarity || 'Unknown'}</p>
                    <div class="dex-row">
                        <span class="dex-condition">${card.condition}</span>
                        <span class="dex-price">£${card.price}</span>
                        <span class="dex-score">★ ${card.score}</span>
                    </div>
                `;
                searchGrid.appendChild(div);
            });

        } catch (err) {
            status.textContent = 'Search failed — check your connection.';
            console.error(err);
        }

        btn.disabled = false;
    }

    function clearSearch() {
        input.value                  = '';
        status.textContent           = '';
        searchGrid.innerHTML         = '';
        searchGrid.style.display     = 'none';
        clearContainer.style.display = 'none';
        mainGrid.style.display       = 'grid';
        expandBtn.style.display      = 'block';
    }

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    clearBtn.addEventListener('click', clearSearch);
}

document.addEventListener('DOMContentLoaded', initMarketplace);
