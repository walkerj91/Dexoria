// ============================================
// TCGDEX + POKEMON TCG API HELPERS
// Browser-compatible — no bundler needed
// ============================================

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const PTCG_KEY    = '21fca767-7ea9-490e-bbb9-428861aba644';

// ── TCGDex ────────────────────────────────────

export async function getCardById(id) {
    const res = await fetch(`${TCGDEX_BASE}/cards/${id}`);
    return res.json();
}

export async function searchCards(name) {
    const res  = await fetch(`${TCGDEX_BASE}/cards`);
    const data = await res.json();
    return data.filter(c => c.name?.toLowerCase().includes(name.toLowerCase()));
}

export async function getSet(id) {
    const res = await fetch(`${TCGDEX_BASE}/sets/${id}`);
    return res.json();
}

export async function listSets() {
    const res = await fetch(`${TCGDEX_BASE}/sets`);
    return res.json();
}

export async function listSeries() {
    const res = await fetch(`${TCGDEX_BASE}/series`);
    return res.json();
}

export function getCardImage(card, quality = 'high', format = 'png') {
    return `${card.image}/${quality}.${format}`;
}

// ── Pokemon TCG API (high res images) ─────────

export async function fetchHighResImage(cardName, setName) {
    try {
        const query = encodeURIComponent(`name:"${cardName}" set.name:"${setName}"`);
        const res   = await fetch(`https://api.pokemontcg.io/v2/cards?q=${query}&pageSize=1`, {
            headers: { 'X-Api-Key': PTCG_KEY }
        });
        const data  = await res.json();
        const card  = data.data?.[0];
        return card?.images?.large || card?.images?.small || null;
    } catch (err) {
        console.warn('PTCG API failed:', err);
        return null;
    }
}