import { supabase } from '../js/supabaseClient.js';

// ══════════════════════════════════════════════════════
// SEEDED RNG — ensures same questions for everyone on
// the same day, but different every day of the year
// ══════════════════════════════════════════════════════
function mulberry32(seed) {
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function getDayOfYear() {
    const n = new Date();
    return Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 86400000);
}

function seededShuffle(arr, seed) {
    const rng = mulberry32(seed);
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ── State ──────────────────────────────────────────────
let currentUser = null;

// ── Date helpers ───────────────────────────────────────
const today   = () => new Date().toISOString().split('T')[0];
const weekKey = () => {
    const d = new Date(), jan1 = new Date(d.getFullYear(), 0, 1);
    return `${d.getFullYear()}-W${String(Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)).padStart(2,'0')}`;
};

// ── PokeAPI cache (localStorage, expires daily) ────────
function pokeCache() {
    const key = `dexoria_poke_${today()}`;
    let store = {};
    try { store = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    return {
        get: (url) => store[url] || null,
        set: (url, data) => {
            store[url] = data;
            try { localStorage.setItem(key, JSON.stringify(store)); } catch {}
        }
    };
}

async function fetchPoke(url) {
    const cache = pokeCache();
    const cached = cache.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PokeAPI ${res.status}: ${url}`);
    const data = await res.json();
    cache.set(url, data);
    return data;
}

// ══════════════════════════════════════════════════════
// DYNAMIC TRIVIA — PokeAPI generated, never repeats
// Cycles through 1010 Pokémon (200+ unique days)
// ══════════════════════════════════════════════════════
const ALL_TYPES = ['normal','fire','water','grass','electric','ice','fighting',
                   'poison','ground','flying','psychic','bug','rock','ghost',
                   'dragon','dark','steel','fairy'];

const STAT_LABELS = {
    'hp':'HP', 'attack':'Attack', 'defense':'Defense',
    'special-attack':'Sp. Atk', 'special-defense':'Sp. Def', 'speed':'Speed'
};

// Each day picks 5 unique Pokémon IDs, never repeating within ~202 days
function getTodayTriviaIds() {
    const year = new Date().getFullYear();
    const day  = getDayOfYear();
    const all  = Array.from({ length: 1010 }, (_, i) => i + 1);
    const shuffled = seededShuffle(all, year * 9973 + 42);
    const start = (day * 5) % shuffled.length;
    // Wrap around gracefully
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(shuffled[(start + i) % shuffled.length]);
    return ids;
}

const TYPE_COLOURS = {
    fire: 'type-fire',
    water: 'type-water',
    grass: 'type-grass',
    electric: 'type-electric',
    psychic: 'type-psychic',
    ice: 'type-ice',
    dragon: 'type-dragon',
    dark: 'type-dark',
    fairy: 'type-fairy',
    normal: 'type-normal',
    fighting: 'type-fighting',
    flying: 'type-flying',
    poison: 'type-poison',
    ground: 'type-ground',
    rock: 'type-rock',
    bug: 'type-bug',
    ghost: 'type-ghost',
    steel: 'type-steel'
};

// Question types — one assigned per question slot for variety
const Q_TYPES = ['primary_type', 'highest_stat', 'base_hp', 'atk_vs_def', 'type_count'];

async function generatePokeQuestion(pokeId, qType, daySeed, slot) {
    const data = await fetchPoke(`https://pokeapi.co/api/v2/pokemon/${pokeId}`);
    const raw  = data.name;
    const name = raw.charAt(0).toUpperCase() + raw.slice(1).replace(/-/g, ' ');
    const types = data.types.map(t => t.type.name);
    const stats = Object.fromEntries(data.stats.map(s => [s.stat.name, s.base_stat]));
    const rng = mulberry32(daySeed * 100 + slot * 7 + pokeId);

    if (qType === 'primary_type') {
        const correct = types[0];
        const wrong = seededShuffle(ALL_TYPES.filter(t => !types.includes(t)), daySeed + slot).slice(0, 3);
        const opts = seededShuffle([correct, ...wrong], daySeed + slot + 1);
        return { q: `What is <strong>${name}</strong>'s primary type?`, o: opts, a: opts.indexOf(correct) };
    }

    if (qType === 'highest_stat') {
        const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
        const correct = STAT_LABELS[sorted[0][0]];
        const wrong   = Object.keys(STAT_LABELS).filter(k => k !== sorted[0][0])
                            .map(k => STAT_LABELS[k]);
        const wrongPick = seededShuffle(wrong, daySeed + slot + 2).slice(0, 3);
        const opts = seededShuffle([correct, ...wrongPick], daySeed + slot + 3);
        return { q: `Which is <strong>${name}</strong>'s highest base stat?`, o: opts, a: opts.indexOf(correct) };
    }

    if (qType === 'base_hp') {
        const hp = stats['hp'];
        const offsets = seededShuffle([-35, -20, -10, 10, 20, 35, -5, 5], daySeed + slot + 4);
        const wrong = [...new Set(
            offsets.map(off => Math.max(1, Math.min(255, hp + off))).filter(v => v !== hp)
        )].slice(0, 3);
        if (wrong.length < 3) wrong.push(hp + 15, hp - 15); // fallback
        const opts = seededShuffle([hp, ...wrong.slice(0,3)], daySeed + slot + 5).map(String);
        return { q: `What is <strong>${name}</strong>'s base HP stat?`, o: opts, a: opts.indexOf(String(hp)) };
    }

    if (qType === 'atk_vs_def') {
        const atk = stats['attack'], def = stats['defense'], spd = stats['speed'];
        const highest = atk >= def && atk >= spd ? 'Attack' : def >= spd ? 'Defense' : 'Speed';
        const opts = seededShuffle(['Attack', 'Defense', 'Speed', 'Sp. Atk'], daySeed + slot + 6);
        return { q: `Which stat is highest for <strong>${name}</strong>?`, o: opts, a: opts.indexOf(highest) };
    }

    if (qType === 'type_count') {
        const count = types.length;
        // Ask a harder version: which of these IS one of its types
        if (types.length > 1) {
            const correct = types[1]; // secondary type
            const wrong = seededShuffle(ALL_TYPES.filter(t => !types.includes(t)), daySeed + slot + 7).slice(0, 3);
            const opts = seededShuffle([correct, ...wrong], daySeed + slot + 8);
            return { q: `What is <strong>${name}</strong>'s secondary type?`, o: opts, a: opts.indexOf(correct) };
        } else {
            const opts = ['1', '2', '3', '4'];
            return { q: `How many types does <strong>${name}</strong> have?`, o: opts, a: opts.indexOf(String(count)) };
        }
    }

    // Fallback — shouldn't reach here
    const correct = types[0];
    const wrong = seededShuffle(ALL_TYPES.filter(t => t !== correct), daySeed + 99).slice(0, 3);
    const opts = seededShuffle([correct, ...wrong], daySeed + 100);
    return { q: `What type is <strong>${name}</strong>?`, o: opts, a: opts.indexOf(correct) };
}

async function loadTriviaQuestions() {
    const cacheKey = `dexoria_trivia_${today()}`;
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached) return cached;
    } catch {}

    const ids    = getTodayTriviaIds();
    const daySeed = getDayOfYear() * 1000 + new Date().getFullYear();

    const questions = await Promise.all(
        ids.map((id, i) => generatePokeQuestion(id, Q_TYPES[i], daySeed, i).catch(() => null))
    );

    const valid = questions.filter(Boolean);
    try { localStorage.setItem(cacheKey, JSON.stringify(valid)); } catch {}
    return valid;
}

// ══════════════════════════════════════════════════════
// WHO'S THAT POKÉMON — expanded to all generations
// ══════════════════════════════════════════════════════
function getTodayWhosPokemon() {
    const year = new Date().getFullYear();
    const day  = getDayOfYear();
    const all  = Array.from({ length: 905 }, (_, i) => i + 1); // Gen 1-8
    const shuffled = seededShuffle(all, year * 8831 + 17);
    return shuffled[day % shuffled.length];
}

async function loadWhosData() {
    const cacheKey = `dexoria_whos_${today()}`;
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached) return cached;
    } catch {}

    const correctId = getTodayWhosPokemon();
    const data = await fetchPoke(`https://pokeapi.co/api/v2/pokemon/${correctId}`);
    const name = data.name.charAt(0).toUpperCase() + data.name.slice(1).replace(/-/g, ' ');

    // Pick 3 wrong Pokémon from nearby IDs + random spread
    const daySeed  = getDayOfYear() + new Date().getFullYear() * 500;
    const wrongIds = seededShuffle(
        Array.from({length: 905}, (_, i) => i + 1).filter(id => id !== correctId),
        daySeed
    ).slice(0, 3);

    const wrongData = await Promise.all(wrongIds.map(id => fetchPoke(`https://pokeapi.co/api/v2/pokemon/${id}`)));
    const wrongNames = wrongData.map(d => d.name.charAt(0).toUpperCase() + d.name.slice(1).replace(/-/g, ' '));

    const options = seededShuffle([name, ...wrongNames], daySeed + 1);
    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${correctId}.png`;

    const result = { name, id: correctId, options, spriteUrl };
    try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}
    return result;
}

// ══════════════════════════════════════════════════════
// WEEKLY MASTER QUIZ — 120+ questions, 25 per week
// Covers games, anime, movies, TCG, lore — all eras
// ══════════════════════════════════════════════════════
const WEEKLY_BANK = [
    // ── GAMES ──────────────────────────────────────────
    { q:"Which game introduced the Dark and Steel types?", o:["Red/Blue","Gold/Silver","Ruby/Sapphire","Diamond/Pearl"], a:1 },
    { q:"What is the name of the rival in Pokémon Gold and Silver?", o:["Gary","Silver","Brendan","Barry"], a:1 },
    { q:"Which game introduced Mega Evolution?", o:["Black/White","X/Y","Sun/Moon","Sword/Shield"], a:1 },
    { q:"What is the first Pokémon main-series game released outside Japan?", o:["Pokémon Red","Pokémon Blue","Pokémon Yellow","Pokémon Gold"], a:0 },
    { q:"Which region is Pokémon Scarlet and Violet set in?", o:["Kalos","Galar","Paldea","Hisui"], a:2 },
    { q:"What is the name of the Professor in Pokémon Sword and Shield?", o:["Professor Elm","Professor Magnolia","Professor Kukui","Professor Sonia"], a:1 },
    { q:"Which main-series game introduced Pokémon Contests?", o:["FireRed/LeafGreen","Ruby/Sapphire","HeartGold/SoulSilver","Platinum"], a:1 },
    { q:"What is the name of the villain team in Pokémon Sun and Moon?", o:["Team Flare","Team Skull","Team Rocket","Team Plasma"], a:1 },
    { q:"Which game is set in the Hisui region (ancient Sinnoh)?", o:["Brilliant Diamond","Legends: Arceus","Platinum","Mystery Dungeon: Explorers"], a:1 },
    { q:"What was the subtitle of the Pokémon Diamond and Pearl remakes?", o:["HeartGold/SoulSilver","Omega Ruby/Alpha Sapphire","Brilliant Diamond/Shining Pearl","Ultra Sun/Ultra Moon"], a:2 },
    { q:"In which game did Ash-Greninja first appear as a mechanic?", o:["X/Y","Sun/Moon","Sword/Shield","Scarlet/Violet"], a:1 },
    { q:"What is the name of the champion in Pokémon Black and White?", o:["Cynthia","Alder","Diantha","Lance"], a:1 },
    { q:"Which spin-off game series lets you play AS a Pokémon?", o:["Pokémon Stadium","Pokémon Ranger","Mystery Dungeon","PokéPark"], a:2 },
    { q:"What is the name of the villain in Pokémon X and Y?", o:["Ghetsis","Lysandre","Cyrus","Archie"], a:1 },
    { q:"Which game introduced the concept of Gym Badges as 8 collectibles?", o:["Pokémon Red/Blue","Gold/Silver","Ruby/Sapphire","All of them"], a:0 },
    { q:"What region is Pokémon Ruby and Sapphire set in?", o:["Sinnoh","Johto","Hoenn","Unova"], a:2 },
    { q:"Which game introduced online trading via the GTS?", o:["FireRed/LeafGreen","Diamond/Pearl","HeartGold/SoulSilver","Ruby/Sapphire"], a:1 },
    { q:"What is the name of the Elite Four member who specialises in Dragon types in Kanto?", o:["Lance","Clair","Iris","Drake"], a:0 },
    { q:"Which game features a villain team trying to expand the land/sea?", o:["Ruby/Sapphire","Gold/Silver","X/Y","Black/White"], a:0 },
    { q:"What is the name of Pokémon GO's developer?", o:["Nintendo","Game Freak","Niantic","The Pokémon Company"], a:2 },
    { q:"In Pokémon Sword/Shield, what are the open areas with wild Pokémon called?", o:["Safari Zones","Wild Areas","Poke Zones","Routes"], a:1 },
    { q:"Which game first introduced the day/night cycle?", o:["Red/Blue","Gold/Silver","Ruby/Sapphire","Crystal"], a:1 },
    { q:"What was the first Pokémon game on the Nintendo DS?", o:["HeartGold","FireRed","Diamond/Pearl","Platinum"], a:2 },
    { q:"What villain organisation appears in Pokémon Diamond and Pearl?", o:["Team Rocket","Team Aqua","Team Galactic","Team Magma"], a:2 },
    { q:"Which game introduced Poké Amie — bonding with your Pokémon?", o:["X/Y","Sun/Moon","Black 2/White 2","Sword/Shield"], a:0 },

    // ── ANIME / TV ──────────────────────────────────────
    { q:"What is the name of Ash's first Pokémon?", o:["Squirtle","Bulbasaur","Pikachu","Caterpie"], a:2 },
    { q:"What type of Pokémon does Misty specialise in?", o:["Fire","Grass","Water","Normal"], a:2 },
    { q:"Which episode caused seizures in children due to flashing lights?", o:["Electric Soldier Porygon","Tentacool & Tentacruel","Holiday Hi-Jynx","The Ghost of Maiden's Peak"], a:0 },
    { q:"What is the name of Ash's main rival in the original series?", o:["Silver","Barry","Gary Oak","Paul"], a:2 },
    { q:"Which Pokémon does Brock always try to catch?", o:["Vulpix","Geodude","Onix","Jigglypuff"], a:0 },
    { q:"What does Team Rocket's motto end with?", o:["Prepare for trouble!","That's right!","Blast off again!","Meowth, that's right!"], a:3 },
    { q:"What region does Ash travel to after Kanto in the anime?", o:["Sinnoh","Johto","Hoenn","Unova"], a:1 },
    { q:"Which Pokémon follows the gang uninvited and sings everyone to sleep?", o:["Clefairy","Chansey","Jigglypuff","Wigglytuff"], a:2 },
    { q:"What is the name of Ash's Pikachu's voice actress in Japan?", o:["Rica Matsumoto","Ikue Ōtani","Mayumi Iizuka","Yūji Ueda"], a:1 },
    { q:"What series replaces Ash as the protagonist after his World Champion arc?", o:["Sun & Moon","Journeys","Horizons","XY"], a:2 },
    { q:"What is the name of the new protagonist introduced in Pokémon Horizons?", o:["Liko","Goh","Chloe","Dawn"], a:0 },
    { q:"In which season does Ash finally become a World Champion?", o:["XY","Sun & Moon","Ultimate Journeys","Journeys"], a:2 },
    { q:"What Pokémon does Ash's rival Paul mostly use?", o:["Infernape","Garchomp","Electivire","Torterra"], a:0 },
    { q:"What is the name of Dawn's starter Pokémon in the anime?", o:["Piplup","Turtwig","Chimchar","Pachirisu"], a:0 },
    { q:"Which character is known for saying 'Smell ya later!'?", o:["Silver","Paul","Gary Oak","Trip"], a:2 },

    // ── MOVIES ─────────────────────────────────────────
    { q:"What is the subtitle of the first Pokémon movie?", o:["The Power of One","Mewtwo Strikes Back","Spell of the Unown","Destiny Deoxys"], a:1 },
    { q:"Which legendary Pokémon is the main focus of the second movie?", o:["Lugia","Ho-Oh","Celebi","Entei"], a:0 },
    { q:"In which movie does Ash turn to stone?", o:["Movie 2","Movie 1","Movie 3","Movie 4"], a:1 },
    { q:"What is the title of the 20th anniversary Pokémon movie?", o:["I Choose You!","Evolution","The Power of Us","Volcanion and the Mechanical Marvel"], a:0 },
    { q:"Which movie features a mystery land created by Unown?", o:["The Power of One","Spell of the Unown","Lucario and the Mystery of Mew","Destiny Deoxys"], a:1 },
    { q:"What is the name of the villain in Pokémon Heroes (Movie 5)?", o:["Annie and Oakley","Butch and Cassidy","Jessie and James","Hunter J"], a:0 },
    { q:"Which movie was the first Pokémon film to receive a Netflix remake?", o:["Movie 2","Movie 3","Movie 1 (Mewtwo Strikes Back)","Movie 4"], a:2 },
    { q:"In Pokémon: The Movie 2000, how many legendary birds are there?", o:["2","3","4","5"], a:1 },
    { q:"Which movie features Marshadow as the main legendary?", o:["I Choose You!","The Power of Us","Secrets of the Jungle","Coco"], a:0 },
    { q:"What is the title of the 2019 live-action Pokémon film?", o:["Pokémon Go","Detective Pikachu","The Pikachu Movie","Pikachu's Story"], a:1 },

    // ── TCG ────────────────────────────────────────────
    { q:"Which TCG set is generally considered the most valuable vintage set?", o:["Jungle","Fossil","Base Set 1st Edition","Team Rocket"], a:2 },
    { q:"What does HP stand for on a Pokémon card?", o:["Hit Points","Health Power","Hero Points","High Potential"], a:0 },
    { q:"Which TCG set introduced VMAX cards?", o:["XY Base Set","Sun & Moon Base","Sword & Shield Base","Scarlet & Violet Base"], a:2 },
    { q:"What is the rarity symbol for a standard Rare card in the TCG?", o:["●","★","◆","♦"], a:1 },
    { q:"What does PSA stand for in Pokémon card grading?", o:["Professional Sports Authenticator","Pokémon Stamp Authority","Premium Seal Agency","Professional Standard Assessment"], a:0 },
    { q:"Which TCG set introduced EX Pokémon cards for the first time?", o:["Neo Destiny","Expedition","EX Ruby & Sapphire","Aquapolis"], a:2 },
    { q:"How many prize cards do you start with in a standard TCG game?", o:["4","5","6","7"], a:2 },
    { q:"Which Base Set card famously has a 'shadowless' first edition variant?", o:["Pikachu","Blastoise","Charizard","Venusaur"], a:2 },
    { q:"What is the maximum deck size in the Pokémon TCG?", o:["40","50","60","70"], a:2 },
    { q:"Which card type allows one special attack use before the Pokémon is knocked out?", o:["EX","GX","V","VSTAR"], a:1 },
    { q:"In the TCG, what does the weakness multiplier change to in modern sets (post-2023)?", o:["×1.5","×2","×3","It was removed"], a:1 },
    { q:"What is the term for a Pokémon card that has a holographic reverse side?", o:["Holo Rare","Secret Rare","Reverse Holo","Full Art"], a:2 },

    // ── LORE & MISC ────────────────────────────────────
    { q:"What is the name of the Pokémon world's equivalent of Earth?", o:["PokéEarth","The Pokémon World","Terra","Poké-Planet"], a:1 },
    { q:"What does the Pokédex number 000 belong to?", o:["Mew","MissingNo.","Egg","Victini"], a:3 },
    { q:"Which Pokémon is known as the 'God' of all Pokémon?", o:["Mewtwo","Rayquaza","Arceus","Lugia"], a:2 },
    { q:"What is the name of Pokémon's creator — the person who designed it?", o:["Shigeru Miyamoto","Satoshi Tajiri","Ken Sugimori","Junichi Masuda"], a:1 },
    { q:"What real-world creatures inspired Pokémon according to Tajiri?", o:["Action figures","Insects he collected as a child","Video game sprites","Dinosaur fossils"], a:1 },
    { q:"Which Pokémon was the original mascot before Pikachu took over?", o:["Eevee","Marill","Clefairy","Jigglypuff"], a:2 },
    { q:"What is the name of the dimension where Ghost and Psychic Pokémon originate, according to lore?", o:["The Shadow Realm","The Distortion World","The Spirit World","The Ultra Wormhole"], a:1 },
    { q:"What does the Pokémon Company classify Pokémon Legends: Arceus as in terms of gameplay style?", o:["Traditional RPG","Action RPG","Open World RPG","Adventure RPG"], a:1 },
    { q:"How many core series Pokémon generations existed as of 2024?", o:["7","8","9","10"], a:2 },
    { q:"What number did the total Pokémon species pass in Generation 9?", o:["800","900","1000","1100"], a:2 },
    { q:"Which Pokémon is referred to as the 'ancestor of all Pokémon' in lore?", o:["Mew","Mewtwo","Arceus","Ditto"], a:0 },
    { q:"What is the in-universe explanation for why Pokémon say only their name?", o:["They are simple creatures","They communicate via tone and inflection","Game Freak never explained it","They are trained to"], a:1 },
];

function getWeekMasterQuestions() {
    const year = new Date().getFullYear();
    const d = new Date(), jan1 = new Date(year, 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    const shuffled = seededShuffle(WEEKLY_BANK, year * 52 + week * 7 + 13);
    return shuffled.slice(0, 25);
}

// ══════════════════════════════════════════════════════
// SCORE / STREAK HELPERS
// ══════════════════════════════════════════════════════
async function getScore(gameType, dateKey) {
    if (!currentUser) return null;
    const { data } = await supabase.from('game_scores').select('*')
        .eq('user_id', currentUser.id).eq('game_type', gameType).eq('date_key', dateKey).maybeSingle();
    return data;
}

async function saveScore(gameType, dateKey, score) {
    if (!currentUser) {
        console.warn('[Dexoria] saveScore: no currentUser — score not saved');
        return;
    }
    const { error } = await supabase.from('game_scores').upsert({
        user_id: currentUser.id, game_type: gameType,
        date_key: dateKey, score, completed: true
    }, { onConflict: 'user_id,game_type,date_key' });
    if (error) console.error('[Dexoria] saveScore error:', error);
    else console.log(`[Dexoria] score saved — ${gameType} ${dateKey} ${score}`);
}

async function getStreak(gameType) {
    if (!currentUser) return 0;
    const { data } = await supabase.from('game_scores')
        .select('date_key').eq('user_id', currentUser.id)
        .eq('game_type', gameType).eq('completed', true)
        .order('date_key', { ascending: false }).limit(30);
    if (!data || !data.length) return 0;
    let streak = 0; const check = new Date();
    for (const row of data) {
        const d = check.toISOString().split('T')[0];
        if (row.date_key === d) { streak++; check.setDate(check.getDate() - 1); }
        else break;
    }
    return streak;
}

// ══════════════════════════════════════════════════════
// RENDER — TRIVIA
// ══════════════════════════════════════════════════════
async function renderTrivia() {
    const body    = document.getElementById('triviaBody');
    const dateKey = today();
    const existing = await getScore('daily_trivia', dateKey);

    if (existing?.completed) {
        const streak = await getStreak('daily_trivia');
        body.innerHTML = alreadyPlayedHTML(existing.score, 5, streak, 'Trivia');
        document.getElementById('triviaStreak').textContent = streak > 0 ? `🔥 ${streak} day streak` : '';
        return;
    }

    body.innerHTML = '<div class="game-loading">Generating today\'s questions…</div>';

    let questions;
    try {
        questions = await loadTriviaQuestions();
    } catch {
        body.innerHTML = '<div class="game-loading">⚠️ Failed to load — check your connection.</div>';
        return;
    }

    if (!questions.length) {
        body.innerHTML = '<div class="game-loading">No questions available today.</div>';
        return;
    }

    let current = 0, score = 0;
    const results = Array(questions.length).fill(null);

    function render() {
        const q = questions[current];
        body.innerHTML = `
            <div class="trivia-progress">
                ${results.map((r, i) => `<div class="trivia-pip ${r === true ? 'done-correct' : r === false ? 'done-wrong' : i === current ? 'current' : ''}"></div>`).join('')}
            </div>
            <div class="trivia-question">Q${current + 1}. ${q.q}</div>
            <div class="trivia-options">
                ${q.o.map((opt, i) => `<button class="trivia-option" data-idx="${i}">${opt}</button>`).join('')}
            </div>
            <div class="trivia-feedback" id="trivia-fb"></div>`;

        body.querySelectorAll('.trivia-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const chosen  = parseInt(btn.dataset.idx);
                const correct = chosen === q.a;
                results[current] = correct;
                if (correct) score++;

                body.querySelectorAll('.trivia-option').forEach(b => {
                    b.disabled = true;
                    if (parseInt(b.dataset.idx) === q.a) b.classList.add('correct');
                    else if (parseInt(b.dataset.idx) === chosen) b.classList.add('wrong');
                });

                const fb = document.getElementById('trivia-fb');
                fb.textContent  = correct ? '✅ Correct!' : `❌ Answer: ${q.o[q.a]}`;
                fb.className    = `trivia-feedback ${correct ? 'correct' : 'wrong'}`;

                setTimeout(() => {
                    current++;
                    if (current < questions.length) render();
                    else finishTrivia();
                }, 1300);
            });
        });
    }

    async function finishTrivia() {
        await saveScore('daily_trivia', dateKey, score);
        const streak = await getStreak('daily_trivia');
        body.innerHTML = gameResultHTML(score, questions.length, streak, 'Trivia', true);
        document.getElementById('triviaStreak').textContent = streak > 0 ? `🔥 ${streak} day streak` : '';
        renderLeaderboard('daily_trivia');
    }

    render();
}

// ══════════════════════════════════════════════════════
// RENDER — WHO'S THAT POKÉMON?
// ══════════════════════════════════════════════════════
async function renderWhos() {
    const body    = document.getElementById('whosBody');
    const dateKey = today();
    const existing = await getScore('whos_pokemon', dateKey);

    body.innerHTML = '<div class="game-loading">Loading today\'s Pokémon…</div>';

    let pokeData;
    try {
        pokeData = await loadWhosData();
    } catch {
        body.innerHTML = '<div class="game-loading">⚠️ Failed to load Pokémon data.</div>';
        return;
    }

    const { name, id, options, spriteUrl } = pokeData;

    if (existing?.completed) {
        const streak = await getStreak('whos_pokemon');
        body.innerHTML = `
            <div class="whos-container">
                <div class="whos-silhouette-wrap">
                    <div class="whos-glow"></div>
                    <img class="whos-pokemon-img revealed" src="${spriteUrl}" alt="${name}">
                </div>
                <p style="font-family:'Cinzel',serif;color:#ffd700;letter-spacing:2px;font-size:16px;">${name.toUpperCase()}</p>
                ${alreadyPlayedInlineHTML(existing.score, 1, streak)}
            </div>`;
        document.getElementById('whosStreak').textContent = streak > 0 ? `🔥 ${streak} day streak` : '';
        return;
    }

    body.innerHTML = `
        <div class="whos-container">
            <div class="whos-silhouette-wrap">
                <div class="whos-glow"></div>
                <img class="whos-pokemon-img" id="whosPoke" src="${spriteUrl}" alt="???"
                     onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png'">
            </div>
            <p style="font-family:'Cinzel',serif;color:white;letter-spacing:3px;font-size:14px;">WHO'S THAT POKÉMON?</p>
            <div class="whos-options">
                ${options.map(opt => `<button class="whos-option" data-name="${opt}">${opt.toUpperCase()}</button>`).join('')}
            </div>
            <div class="whos-result" id="whosResult"></div>
        </div>`;

    body.querySelectorAll('.whos-option').forEach(btn => {
        btn.addEventListener('click', async () => {
            const chosen  = btn.dataset.name;
            const correct = chosen === name;

            body.querySelectorAll('.whos-option').forEach(b => {
                b.disabled = true;
                if (b.dataset.name === name) b.classList.add('correct');
                else if (b.dataset.name === chosen) b.classList.add('wrong');
            });

            document.getElementById('whosPoke').classList.add('revealed');

            const res = document.getElementById('whosResult');
            res.style.color = correct ? '#4ade80' : '#f87171';
            res.textContent  = correct ? `✅ Correct! It's ${name}!` : `❌ It was ${name}!`;

            await saveScore('whos_pokemon', dateKey, correct ? 1 : 0);
            const streak = await getStreak('whos_pokemon');
            document.getElementById('whosStreak').textContent = streak > 0 ? `🔥 ${streak} day streak` : '';
            renderLeaderboard('whos_pokemon');

            setTimeout(() => {
                const next = document.createElement('button');
                next.className = 'game-btn'; next.textContent = 'SEE RESULTS';
                next.onclick   = () => {
                    body.innerHTML = `
                        <div class="whos-container">
                            <div class="whos-silhouette-wrap">
                                <div class="whos-glow"></div>
                                <img class="whos-pokemon-img revealed" src="${spriteUrl}" alt="${name}"
                                     onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png'">
                            </div>
                            ${gameResultHTML(correct ? 1 : 0, 1, streak, "Who's That Pokémon?", true)}
                        </div>`;
                };
                body.querySelector('.whos-container').appendChild(next);
            }, 1000);
        });
    });
}

// ══════════════════════════════════════════════════════
// RENDER — TYPE TRAINER
// ══════════════════════════════════════════════════════
async function renderTypeTrainer() {
    const body    = document.getElementById('typeBody');
    const dateKey = weekKey();
    const existing = await getScore('type_trainer', dateKey);

    if (existing?.completed) {
        const streak = await getStreak('type_trainer');
        body.innerHTML = alreadyPlayedHTML(existing.score, 25, streak, 'Weekly Master Quiz', 'RESETS MONDAY');
        document.getElementById('typeStreak').textContent = streak > 0 ? `🔥 ${streak} week streak` : '';
        return;
    }

    const questions = getWeekMasterQuestions();
    const total = questions.length; // 25
    let current = 0, score = 0;
    const results = Array(total).fill(null);

    function render() {
        const q = questions[current];
        // Split progress into two rows of ~13 pips for readability
        const pipHTML = results.map((r, i) => `<div class="trivia-pip ${r===true?'done-correct':r===false?'done-wrong':i===current?'current':''}"></div>`).join('');
        body.innerHTML = `
            <p style="font-family:'Cinzel',serif;font-size:12px;letter-spacing:3px;color:white;margin-bottom:10px;">
                QUESTION ${current + 1} / ${total}
            </p>
            <div class="trivia-progress" style="margin-bottom:16px;">${pipHTML}</div>
            <p class="type-question-text">${q.q}</p>
            <div class="trivia-options">
                ${q.o.map((opt, i) => `<button class="trivia-option" data-idx="${i}">${opt}</button>`).join('')}
            </div>
            <div class="trivia-feedback" id="type-fb" style="margin-top:14px;"></div>`;

        body.querySelectorAll('.trivia-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const chosen  = parseInt(btn.dataset.idx);
                const correct = chosen === q.a;
                results[current] = correct;
                if (correct) score++;

                body.querySelectorAll('.trivia-option').forEach(b => {
                    b.disabled = true;
                    if (parseInt(b.dataset.idx) === q.a) b.classList.add('correct');
                    else if (parseInt(b.dataset.idx) === chosen) b.classList.add('wrong');
                });

                const fb = document.getElementById('type-fb');
                fb.textContent = correct ? '✅ Correct!' : `❌ Answer: ${q.o[q.a]}`;
                fb.className   = `trivia-feedback ${correct ? 'correct' : 'wrong'}`;

                setTimeout(() => { current++; current < total ? render() : finishType(); }, 1100);
            });
        });
    }

    async function finishType() {
        await saveScore('type_trainer', dateKey, score);
        const streak = await getStreak('type_trainer');
        body.innerHTML = gameResultHTML(score, total, streak, 'Weekly Master Quiz', false);
        document.getElementById('typeStreak').textContent = streak > 0 ? `🔥 ${streak} week streak` : '';
        renderLeaderboard('type_trainer');
    }

    render();
}

// ══════════════════════════════════════════════════════
// LEADERBOARD
// ══════════════════════════════════════════════════════
async function renderLeaderboard(gameType = 'daily_trivia') {
    const body    = document.getElementById('leaderboardBody');
    const dateKey = gameType === 'type_trainer' ? weekKey() : today();

    body.innerHTML = `
        <div class="leaderboard-tabs">
            <button class="lb-tab ${gameType==='daily_trivia'?'active':''}"  data-game="daily_trivia">🧠 Trivia</button>
            <button class="lb-tab ${gameType==='whos_pokemon'?'active':''}"  data-game="whos_pokemon">❓ Who's That?</button>
            <button class="lb-tab ${gameType==='type_trainer'?'active':''}"  data-game="type_trainer">🌟 Master Quiz</button>
        </div>
        <div id="lbRows"><div class="lb-empty">Loading…</div></div>`;

    body.querySelectorAll('.lb-tab').forEach(t => t.addEventListener('click', () => renderLeaderboard(t.dataset.game)));

    const { data: scores, error: scoresErr } = await supabase.from('game_scores')
        .select('user_id, score')
        .eq('game_type', gameType).eq('date_key', dateKey).eq('completed', true)
        .order('score', { ascending: false }).limit(10);

    if (scoresErr) { console.error('[Dexoria] leaderboard scores error:', scoresErr); }

    const rows = document.getElementById('lbRows');
    if (!scores?.length) { rows.innerHTML = '<p class="lb-empty">No scores yet — be the first! 🏆</p>'; return; }

    // Fetch profiles separately — avoids relying on a FK join between game_scores and profiles
    const userIds = scores.map(s => s.user_id);
    const { data: profiles, error: profilesErr } = await supabase
        .from('profiles').select('id, username, avatar_url').in('id', userIds);
    if (profilesErr) console.error('[Dexoria] leaderboard profiles error:', profilesErr);

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    const total = gameType === 'type_trainer' ? 25 : gameType === 'daily_trivia' ? 5 : 1;
    const rank  = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
    const cls   = i => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const pct   = s => Math.round((s.score / total) * 100);
    const bar   = s => {
        const p = pct(s);
        const colour = p === 100 ? '#ffd700' : p >= 80 ? '#4ade80' : p >= 50 ? '#60a5fa' : '#f87171';
        return `<div style="width:100%;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;margin-top:4px;">
                    <div style="width:${p}%;height:100%;background:${colour};border-radius:2px;transition:width 0.4s;"></div>
                </div>`;
    };

    rows.innerHTML = scores.map((s, i) => {
        const p = profileMap[s.user_id] || {};
        return `
        <div class="lb-row">
            <div class="lb-rank ${cls(i)}">${rank(i)}</div>
            <img class="lb-avatar" src="${p.avatar_url || '../Images/Ash Ketchum User.jpg'}"
                 alt="${p.username || 'Trainer'}"
                 onerror="this.src='../Images/Ash Ketchum User.jpg'">
            <div class="lb-name" style="flex:1;">
                <div style="font-size:14px;font-weight:700;color:rgba(255,255,255,0.85);font-family:'Rajdhani',sans-serif;">${p.username || 'Trainer'}</div>
                ${bar(s)}
            </div>
            <div class="lb-score">${s.score}<span style="font-size:12px;color:rgba(255,255,255,0.3);font-weight:400;">/${total}</span></div>
        </div>`;
    }).join('');
}

// ══════════════════════════════════════════════════════
// RESULT HTML
// ══════════════════════════════════════════════════════
function gameResultHTML(score, total, streak, label, isDaily) {
    const pct = Math.round((score / total) * 100);
    const msg = pct === 100 ? '🎉 Perfect score! Legendary Trainer!' :
                pct >= 80  ? '⭐ Excellent work, Trainer!' :
                pct >= 60  ? '👍 Good effort — keep training!' :
                pct >= 40  ? '😅 Nice try — come back tomorrow!' :
                             '💪 Keep practising!';
    return `
        <div class="game-result">
            <div class="result-score">${score}/${total}</div>
            <div class="result-label">YOUR SCORE</div>
            <div class="result-message">${msg}</div>
            ${streak > 1 ? `<div class="result-streak">🔥 ${streak} ${isDaily?'day':'week'} streak!</div>` : ''}
            <div class="game-next-badge">${isDaily ? 'NEW QUESTIONS AT MIDNIGHT' : 'NEW CHALLENGE ON MONDAY'}</div>
        </div>`;
}

function alreadyPlayedHTML(score, total, streak, label, resetText = 'NEW QUESTIONS AT MIDNIGHT') {
    return `
        <div class="game-result">
            <div class="result-score">${score}/${total}</div>
            <div class="result-label">TODAY'S SCORE</div>
            <div class="result-message">You've already played today's ${label}!</div>
            ${streak > 1 ? `<div class="result-streak">🔥 ${streak} day streak — keep it up!</div>` : ''}
            <div class="game-next-badge">${resetText}</div>
        </div>`;
}

function alreadyPlayedInlineHTML(score, total, streak) {
    return `
        <p style="font-size:13px;color:rgba(255,255,255,0.5);font-family:'Rajdhani',sans-serif;">
            ${score === 1 ? '✅ You got it right!' : '❌ Better luck tomorrow!'}
        </p>
        ${streak > 1 ? `<p style="font-family:'Cinzel',serif;font-size:12px;color:rgba(255,215,0,0.6);">🔥 ${streak} day streak</p>` : ''}
        <div class="game-next-badge">NEW POKÉMON AT MIDNIGHT</div>`;
}

// ══════════════════════════════════════════════════════
// STREAK BAR
// ══════════════════════════════════════════════════════
async function renderStreakBar() {
    if (!currentUser) return;
    const [ts, ws, wt] = await Promise.all([
        getStreak('daily_trivia'), getStreak('whos_pokemon'), getStreak('type_trainer'),
    ]);
    if ((ts + ws + wt) === 0) return;
    const bar = document.getElementById('streakBar');
    document.getElementById('streakInner').innerHTML = [
        ts > 0 ? `🧠 Trivia: 🔥 ${ts} day${ts !== 1 ? 's' : ''}` : '',
        ws > 0 ? `❓ Who's That: 🔥 ${ws} day${ws !== 1 ? 's' : ''}` : '',
        wt > 0 ? `⚡ Master Quiz: 🔥 ${wt} week${wt !== 1 ? 's' : ''}` : '',
    ].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
    bar.style.display = 'block';
}

// ══════════════════════════════════════════════════════
// POKÉMON SPOTLIGHT
// Different Pokémon from the Who's That quiz each day
// ══════════════════════════════════════════════════════
function getSpotlightId() {
    const year = new Date().getFullYear();
    const day  = getDayOfYear();
    const all  = Array.from({ length: 905 }, (_, i) => i + 1);
    const shuffled = seededShuffle(all, year * 5557 + day * 3 + 99);
    return shuffled[day % shuffled.length];
}

function getGenLabel(id) {
    if (id <= 151)  return 'GEN I';
    if (id <= 251)  return 'GEN II';
    if (id <= 386)  return 'GEN III';
    if (id <= 493)  return 'GEN IV';
    if (id <= 649)  return 'GEN V';
    if (id <= 721)  return 'GEN VI';
    if (id <= 809)  return 'GEN VII';
    if (id <= 905)  return 'GEN VIII';
    return 'GEN IX';
}

const STAT_META = {
    'hp':             { label: 'HP',    colour: '#ff6b6b' },
    'attack':         { label: 'ATK',   colour: '#ff9b4e' },
    'defense':        { label: 'DEF',   colour: '#f5d06b' },
    'special-attack': { label: 'SP.ATK',colour: '#60a5fa' },
    'special-defense':{ label: 'SP.DEF',colour: '#34d399' },
    'speed':          { label: 'SPD',   colour: '#a78bfa' },
};

async function renderSpotlight() {
    const body = document.getElementById('spotlightBody');
    const id   = getSpotlightId();

    const cacheKey = `dexoria_spotlight_${today()}`;
    let data;
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        // Validate cached entry has the fields we need
        if (cached && cached.name && cached.types && cached.stats) {
            data = cached;
        } else {
            if (cached) localStorage.removeItem(cacheKey); // clear bad/stale entry
            const raw = await fetchPoke(`https://pokeapi.co/api/v2/pokemon/${id}`);
            // Store a slim version to avoid hitting localStorage quota
            data = {
                name:  raw.name,
                types: raw.types,
                stats: raw.stats,
            };
            try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
        }
    } catch (err) {
        console.error('[Dexoria] Spotlight fetch failed:', err);
        localStorage.removeItem(cacheKey); // clear so next load retries fresh
        body.innerHTML = '<div class="game-loading">⚠️ Could not load Pokémon data — check your connection and refresh.</div>';
        return;
    }

    const name   = data.name.charAt(0).toUpperCase() + data.name.slice(1).replace(/-/g, ' ');
    const types  = data.types.map(t => t.type.name);
    const stats  = data.stats;
    const artwork = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
    const gen    = getGenLabel(id);

    const typeChips = types.map(t =>
        `<span class="type-chip-sm">${t.toUpperCase()}</span>`
    ).join('');

    const statBars = stats.map(s => {
        const meta = STAT_META[s.stat.name];
        if (!meta) return '';
        const pct = Math.min(100, Math.round((s.base_stat / 255) * 100));
        return `
            <div class="stat-row">
                <div class="stat-name">${meta.label}</div>
                <div class="stat-bar-track">
                    <div class="stat-bar-fill" data-width="${pct}" style="background:${meta.colour};"></div>
                </div>
                <div class="stat-val">${s.base_stat}</div>
            </div>`;
    }).join('');

    body.innerHTML = `
        <div class="spotlight-pokemon">
            <img class="spotlight-artwork" src="${artwork}" alt="${name}"
                 onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png'">
            <div class="spotlight-name">${name.toUpperCase()}</div>
            <div class="spotlight-meta">
                ${typeChips}
                <span class="spotlight-gen">${gen}</span>
            </div>
            <div class="spotlight-stats">${statBars}</div>
        </div>`;

    // Animate stat bars after paint
    requestAnimationFrame(() => requestAnimationFrame(() => {
        body.querySelectorAll('.stat-bar-fill').forEach(bar => {
            bar.style.width = bar.dataset.width + '%';
        });
    }));
}

// ══════════════════════════════════════════════════════
// COUNTDOWN TIMERS
// ══════════════════════════════════════════════════════
function pad(n) { return String(n).padStart(2, '0'); }

function msUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight - now;
}

function msUntilMonday() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon...
    const daysUntilMon = day === 1 ? 7 : (8 - day) % 7 || 7;
    const nextMon = new Date(now);
    nextMon.setDate(now.getDate() + daysUntilMon);
    nextMon.setHours(0, 0, 0, 0);
    return nextMon - now;
}

function formatCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const s  = Math.floor(ms / 1000);
    const h  = Math.floor(s / 3600);
    const m  = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    return `${pad(h)}:${pad(m)}:${pad(sc)}`;
}

function formatWeeklyCountdown(ms) {
    if (ms <= 0) return '0d 00:00:00';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    return `${d}d ${pad(h)}:${pad(m)}:${pad(sc)}`;
}

async function startCountdowns() {
    const dailyEl  = document.getElementById('dailyCountdown');
    const weeklyEl = document.getElementById('weeklyCountdown');
    const playedEl = document.getElementById('playedToday');

    // How many trainers played today
    const dateKey = today();
    const { count: playedCount } = await supabase
        .from('game_scores')
        .select('user_id', { count: 'exact', head: true })
        .eq('date_key', dateKey)
        .eq('completed', true);

    if (playedEl && playedCount > 0) {
        playedEl.textContent = `🎮 ${playedCount} trainer${playedCount !== 1 ? 's' : ''} played today`;
    }

    function initTimerSpans(el, text) {
        el.innerHTML = [...text].map(() => `<span></span>`).join('');
        el._spans = el.querySelectorAll('span');
    }

    function setTimer(el, text) {
        if (!el._spans || el._spans.length !== text.length) initTimerSpans(el, text);
        [...text].forEach((c, i) => {
            if (el._spans[i].textContent !== c) el._spans[i].textContent = c;
        });
    }

    function tick() {
        if (dailyEl)  setTimer(dailyEl,  formatCountdown(msUntilMidnight()));
        if (weeklyEl) setTimer(weeklyEl, formatWeeklyCountdown(msUntilMonday()));
    }

    tick();
    setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;

    await Promise.all([
        renderTrivia(),
        renderWhos(),
        renderTypeTrainer(),
        renderSpotlight(),
        renderLeaderboard(),
        renderStreakBar(),
    ]);
    startCountdowns();
});