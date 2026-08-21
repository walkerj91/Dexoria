
const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const SET_IDS     = ['me01', 'me02', 'me02.5', 'me03', 'me04', 'me05'];

function getRarityTier(rarity) {
    const r = rarity?.toLowerCase() || '';
    if (r.includes('secret') || r.includes('hyper'))                         return 5;
    if (r.includes('ultra') || r.includes('vmax') || r.includes('full art')) return 4;
    if (r.includes('ex') || r.includes('gx'))                                return 3;
    if (r.includes('holo') || r.includes('rare'))                            return 2;
    return 1;
}

function getPrice(rarity) {
    const r = rarity?.toLowerCase() || '';
    if (r.includes('secret') || r.includes('hyper')) return Math.floor(Math.random() * 400) + 200;
    if (r.includes('ultra')  || r.includes('vmax'))  return Math.floor(Math.random() * 150) + 50;
    if (r.includes('ex')     || r.includes('gx'))    return Math.floor(Math.random() * 80)  + 20;
    if (r.includes('holo')   || r.includes('rare'))  return Math.floor(Math.random() * 40)  + 5;
    return Math.floor(Math.random() * 4) + 1;
}

function getTrend(tier) {
    const change    = (Math.random() * tier * 3 + 0.5).toFixed(1);
    const direction = Math.random() > 0.25 ? 'up' : 'down';
    return { change, direction };
}

async function fetchTopCards() {
    const allCards = [];

    const setResults = await Promise.allSettled(
        SET_IDS.map(id => fetch(`${TCGDEX_BASE}/sets/${id}`).then(r => r.json()))
    );

    const cardFetchPromises = [];
    setResults.forEach((result, i) => {
        if (result.status !== 'fulfilled') return;
        const set = result.value;
        if (!set?.cards) return;
        const setName = set.name || SET_IDS[i];

        set.cards.forEach(card => {
            if (!card.image) return;
            cardFetchPromises.push(
                fetch(`${TCGDEX_BASE}/cards/${SET_IDS[i]}-${card.localId}`)
                    .then(r => r.json())
                    .then(full => ({ ...full, image: card.image, setName }))
                    .catch(() => ({ ...card, setName, rarity: null }))
            );
        });
    });

    for (let i = 0; i < cardFetchPromises.length; i += 20) {
        const batch = await Promise.allSettled(cardFetchPromises.slice(i, i + 20));
        batch.forEach(r => {
            if (r.status === 'fulfilled' && r.value?.image) allCards.push(r.value);
        });
    }

    return allCards
    .map(card => ({
        ...card,
        id:    `${card.setName}-${card.localId}`.replace(/\s+/g, '-'), // ← add clean id
        image: `${card.image.replace(/\/(high|low|thumb)\.png$/, '')}/high.png`, // ← append /high.png here
        tier:  getRarityTier(card.rarity),
        price: getPrice(card.rarity),
        trend: getTrend(getRarityTier(card.rarity))
    }))
    .sort((a, b) => b.tier - a.tier || Math.random() - 0.5)
    .slice(0, 12);
}

function renderTicker(cards) {
    const ticker = document.getElementById('mm-ticker');
    if (!ticker) return;

    const items = [...cards, ...cards].map(card => {
        const isUp   = card.trend.direction === 'up';
        const arrow  = isUp ? '▲' : '▼';
        const colour = isUp ? '#00e676' : '#ff5252';

        return `
            <div class="mm-item">
                <img src="${card.image}" alt="${card.name}" class="mm-card-img">
                <div class="mm-item-info">
                    <span class="mm-card-name">${card.name}</span>
                    <span class="mm-card-set">${card.setName}</span>
                </div>
                <div class="mm-item-stats">
                    <span class="mm-price">£${card.price}</span>
                    <span class="mm-trend" style="color:${colour}">${arrow} ${card.trend.change}%</span>
                </div>
                <div class="mm-divider">|</div>
            </div>
        `;
    }).join('');

    ticker.innerHTML = items;
}

async function initMarketMovers() {
    const ticker = document.getElementById('mm-ticker');
    if (!ticker) return;

    ticker.innerHTML = `<span style="color:rgba(255,255,255,0.4);padding:0 20px;font-size:13px;">Loading market data…</span>`;

    try {
        const cards = await fetchTopCards();
        renderTicker(cards);
    } catch (err) {
        console.error('Market movers error:', err);
        ticker.innerHTML = `<span style="color:rgba(255,255,255,0.4);padding:0 20px;font-size:13px;">Market data unavailable.</span>`;
    }
}                                         

document.addEventListener('DOMContentLoaded', initMarketMovers);