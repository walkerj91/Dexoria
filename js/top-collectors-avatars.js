import { supabase } from './supabaseClient.js';

// ============================================
// TROPHY SVG — reused for all three ranks
// ============================================
const TROPHY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512">
    <path d="M400 0H176c-26.5 0-48 21.5-48 48v16H48C21.5 64 0 85.5 0 112v24c0 
    92.6 33.6 177 88.9 241.7 19.3 22.8 40.9 43.1 64.5 60.4C197 441.2 240.3 
    448 288 448s91-6.8 134.6-9.9c23.6-17.3 45.2-37.6 
    64.5-60.4C542.4 313 576 228.6 576 136v-24c0-26.5-21.5-48-48-48H416V48c0-26.5-21.5-48-48-48zM96 
    136v-8h80v61.4c-19-16.7-36.1-35.4-51-55.4H96zm384 
    0c-14.9 20-32 38.7-51 55.4V128h80v8c0-26.5 0 0 0 0zm-192 
    240c-44.2 0-80-35.8-80-80s35.8-80 80-80 80 35.8 80 80-35.8 80-80 
    80zm0-112c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 
    32-32-14.3-32-32-32zM240 480h96l-16 32H256l-16-32zm-64 32h256v-1H176v1z"/>
</svg>`;

const CROWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="24">
    <path fill="currentColor" d="M528 448H112c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 
    16 16h416c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16zm64-320c-26.5 
    0-48 21.5-48 48 0 7.1 1.6 13.7 4.4 19.8L480 240l-89.6-128C382 
    101.5 372.8 96 362.7 96H277.3c-10.1 0-19.3 5.5-27.7 16L160 
    240 91.6 195.8c2.8-6.1 4.4-12.7 4.4-19.8 0-26.5-21.5-48-48-48S0 
    149.5 0 176s21.5 48 48 48c2.6 0 5.2-.3 7.7-.6L96 
    448h448l40.3-224.6c2.5.3 5.1.6 7.7.6 26.5 0 48-21.5 
    48-48s-21.5-48-48-48z"/>
</svg>`;

// ============================================
// ESTIMATE CARD VALUE BY RARITY
// Fixed prices — matches profile.js exactly so
// both pages always show the same collection value
// ============================================
function estimateCardValue(rarity) {
    const r = rarity?.toLowerCase() || '';
    if (r.includes('secret') || r.includes('hyper')) return 80;
    if (r.includes('ultra')  || r.includes('vmax'))  return 55;
    if (r.includes('ex')     || r.includes('gx'))    return 20;
    if (r.includes('holo')   || r.includes('rare'))  return 8;
    return 1;
}

// ============================================
// FETCH TOP 3 COLLECTORS
// Ranked by card count from the cards table
// ============================================
async function fetchTopCollectors() {

    // 1. Get all profiles
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url');

    if (profileError || !profiles) {
        console.error('Top collectors fetch error:', profileError);
        return [];
    }

    // 2. For each profile, count cards and estimate value
    const collectorData = await Promise.all(profiles.map(async (profile) => {

        const { data: cards } = await supabase
            .from('cards')
            .select('card_name, rarity')
            .eq('user_id', profile.id);

        const cardCount     = cards?.length || 0;
        const portfolioValue = (cards || []).reduce((sum, card) => {
            return sum + estimateCardValue(card.rarity);
        }, 0);

        return {
            id:             profile.id,
            username:       profile.username || 'Trainer',
            avatar_url:     profile.avatar_url,
            initials:       (profile.username || '??').slice(0, 2).toUpperCase(),
            cardCount,
            portfolioValue
        };
    }));

    // 3. Sort by card count descending, take top 3
    return collectorData
        .sort((a, b) => b.cardCount - a.cardCount)
        .slice(0, 3);
}

// ============================================
// BUILD A PODIUM CARD
// ============================================
function buildCollectorCard(collector, rank) {
    const rankMeta = {
        1: { cardClass: 'gold',   badgeClass: 'gold-glow',    avClass: 'gold-av',   nameClass: 'gold-name',   dividerClass: 'gold-divider', valClass: 'gold-val', numClass: 'gold-num', trophyClass: 'trophy-gold'   },
        2: { cardClass: 'silver', badgeClass: 'silver-badge', avClass: 'silver-av', nameClass: '',            dividerClass: '',             valClass: '',         numClass: '',         trophyClass: 'trophy-silver' },
        3: { cardClass: 'bronze', badgeClass: 'bronze-badge', avClass: 'bronze-av', nameClass: '',            dividerClass: '',             valClass: '',         numClass: 'bronze-num', trophyClass: 'trophy-bronze' },
    };

    const m          = rankMeta[rank];
    const avatarHTML = collector.avatar_url
        ? `<img src="${collector.avatar_url}" alt="${collector.initials}" 
               onerror="this.parentElement.innerHTML='<span>${collector.initials}</span>'">`
        : `<span>${collector.initials}</span>`;

    const crownHTML  = rank === 1 ? `<div class="gold-crown">${CROWN_SVG}</div>` : '';
    const value      = collector.portfolioValue >= 1000
        ? `£${(collector.portfolioValue / 1000).toFixed(1)}k`
        : `£${collector.portfolioValue}`;

    return `
        <div class="collector-card ${m.cardClass}">
            <div class="rank-badge ${m.badgeClass}">#${rank}</div>
            <div class="card-inner">
                <div class="trophy-wrap">
                    <svg class="trophy-svg ${m.trophyClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512">
                        <path d="M400 0H176c-26.5 0-48 21.5-48 48v16H48C21.5 64 0 85.5 0 112v24c0 
                        92.6 33.6 177 88.9 241.7 19.3 22.8 40.9 43.1 64.5 60.4C197 441.2 240.3 
                        448 288 448s91-6.8 134.6-9.9c23.6-17.3 45.2-37.6 
                        64.5-60.4C542.4 313 576 228.6 576 136v-24c0-26.5-21.5-48-48-48H416V48c0-26.5-21.5-48-48-48zM96 
                        136v-8h80v61.4c-19-16.7-36.1-35.4-51-55.4H96zm384 
                        0c-14.9 20-32 38.7-51 55.4V128h80v8c0-26.5 0 0 0 0zm-192 
                        240c-44.2 0-80-35.8-80-80s35.8-80 80-80 80 35.8 80 80-35.8 80-80 
                        80zm0-112c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 
                        32-32-14.3-32-32-32zM240 480h96l-16 32H256l-16-32zm-64 32h256v-1H176v1z"/>
                    </svg>
                    <div class="trophy-rank-num ${m.numClass}">${rank}</div>
                </div>

                <div class="collector-avatar ${m.avClass}" id="avatar-${rank}">
                    ${avatarHTML}
                </div>

                <a href="profile.html?user=${collector.username}" 
                   class="collector-name ${m.nameClass}"
                   style="text-decoration:none; cursor:pointer;">
                    ${collector.username}
                </a>

                <div class="collector-divider ${m.dividerClass}"></div>

                <div class="collector-stat-row">
                    <span class="stat-key">Portfolio</span>
                    <span class="stat-val ${m.valClass}">${value}</span>
                </div>
                <div class="collector-stat-row">
                    <span class="stat-key">Cards</span>
                    <span class="stat-val ${m.valClass}">${collector.cardCount}</span>
                </div>

                ${crownHTML}
            </div>
        </div>
    `;
}

// ============================================
// RENDER PODIUM
// ============================================
function renderPodium(collectors) {
    const container = document.querySelector('.podium-container');
    if (!container) return;

    // Podium order: 2nd, 1st, 3rd
    const podiumOrder = [
        collectors[1] || null,  // 2nd place (left)
        collectors[0] || null,  // 1st place (centre)
        collectors[2] || null,  // 3rd place (right)
    ];
    const ranks = [2, 1, 3];

    container.innerHTML = podiumOrder.map((collector, i) => {
        if (!collector) return '';
        return buildCollectorCard(collector, ranks[i]);
    }).join('');
}

function showPodiumSkeletons() {
    const container = document.querySelector('.podium-container');
    if (!container) return;
    container.innerHTML = Array(3).fill(`
        <div class="collector-card" style="opacity:0.4">
            <div class="card-inner" style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:30px 20px;">
                <div style="width:60px;height:60px;border-radius:50%;background:#2d1b2d;animation:shimmer 1.5s infinite;"></div>
                <div style="width:80px;height:14px;border-radius:6px;background:#2d1b2d;animation:shimmer 1.5s infinite;"></div>
                <div style="width:60px;height:12px;border-radius:6px;background:#2d1b2d;animation:shimmer 1.5s infinite;"></div>
            </div>
        </div>
    `).join('');
}

// ============================================
// INIT
// ============================================
async function initTopCollectors() {
    showPodiumSkeletons();
    try {
        const collectors = await fetchTopCollectors();
        if (collectors.length === 0) {
            document.querySelector('.podium-container').innerHTML =
                `<p style="color:rgba(255,255,255,0.4);text-align:center;width:100%;padding:40px 0;">No collectors yet — be the first!</p>`;
            return;
        }
        renderPodium(collectors);
    } catch (err) {
        console.error('Top collectors error:', err);
    }
}

document.addEventListener('DOMContentLoaded', initTopCollectors);