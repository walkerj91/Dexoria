// ============================================
// SUPABASE IMPORT
// ============================================
import { supabase } from 'supabaseClient.js';

// ============================================
// GLOBAL STATE
// ============================================
let currentUser    = null;
let profileUserId  = null; // the profile being viewed (own or friend)
let isOwnProfile   = false;

// ============================================
// AUTH GUARD
// ============================================
(async () => {
    const { data: initial } = await supabase.auth.getSession();
    if (initial.session) {
        startProfilePage();
    } else {
        supabase.auth.onAuthStateChange((_event, session) => {
            if (session) startProfilePage();
            else window.location.replace("index.html");
        });
    }
})();

// ============================================
// BOOTSTRAP
// ============================================
function startProfilePage() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfile);
    } else {
        initProfile();
    }
}

// ============================================
// HELPERS
// ============================================
function safeImg(url, fallback) {
    return (url && url !== 'null') ? url : fallback;
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 3000);
}

function timeAgo(dateString) {
    const diff = Math.floor((Date.now() - new Date(dateString)) / 1000);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function rarityTier(rarity) {
    const r = rarity?.toLowerCase() || '';
    if (r.includes('secret') || r.includes('hyper')) return 5;
    if (r.includes('ultra')  || r.includes('vmax'))  return 4;
    if (r.includes('ex')     || r.includes('gx'))    return 3;
    if (r.includes('holo')   || r.includes('rare'))  return 2;
    return 1;
}

// ============================================
// COLLECTION VALUE
// ============================================
async function calculateCollectionValue() {
    const { data: cards } = await supabase
        .from('cards')
        .select('rarity')
        .eq('user_id', profileUserId);

    if (!cards || cards.length === 0) return 0;

    // Same price bands as marketplace
    const rarityPrices = {
        5: 80,   // secret / hyper rare
        4: 55,   // ultra rare / vmax
        3: 20,   // ex / gx
        2: 8,    // holo / rare
        1: 1,    // common / uncommon
    };

    const total = cards.reduce((sum, card) => {
        const tier = rarityTier(card.rarity);
        return sum + (rarityPrices[tier] ?? 1);
    }, 0);

    return total;
}

async function handleImageUpload(file, user, avatarDisplay) {
    try {
        showToast("Uploading to Dex-Servers...");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "Trainer_profiles");
        const res      = await fetch(`https://api.cloudinary.com/v1_1/ddifqujfn/image/upload`, { method: "POST", body: formData });
        const data     = await res.json();
        const imageUrl = data.secure_url;
        if (!imageUrl) throw new Error("Cloudinary upload failed");
        const { error } = await supabase.from('profiles').update({ avatar_url: imageUrl }).eq('id', user.id);
        if (error) throw error;
        if (avatarDisplay) avatarDisplay.src = imageUrl;
        showToast("Trainer Sprite Updated!");
        return imageUrl;
    } catch (err) {
        console.error(err);
        showToast("Sync Error: " + err.message);
    }
}

// ============================================
// COLLECTION RENDERS
// ============================================
async function renderMyCollection() {
    const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .eq('user_id', profileUserId)
        .is('binder_id', null);

    const { count: binderCardCount } = await supabase
        .from('cards')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profileUserId)
        .not('binder_id', 'is', null);

    const profileCardCount = cards?.length ?? 0;
    const totalCards       = profileCardCount + (binderCardCount ?? 0);
    const statCards        = document.getElementById('stat-cards');
    if (statCards) statCards.textContent = totalCards;

    const collectionValue = await calculateCollectionValue();
    const statValue = document.getElementById('stat-collection-value');
    if (statValue) statValue.textContent = '£' + collectionValue.toLocaleString();

    const container = document.getElementById('myCollectionGrid');
    if (!container) return;
    container.innerHTML = '';

    if (isOwnProfile) {
        const addTile = document.createElement('div');
        addTile.className = 'collection-card collection-card--add';
        addTile.innerHTML = `<div class="add-card-icon">+</div><div class="add-card-label">Add Card</div>`;
        addTile.addEventListener('click', openAddCardModal);
        container.appendChild(addTile);
    }

    if (!cards || cards.length === 0) {
        const empty = document.createElement('p');
        empty.className   = 'collection-empty';
        empty.textContent = isOwnProfile ? 'No cards yet - add your first one!' : 'No cards in collection yet.';
        container.appendChild(empty);
        return;
    }

    cards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'collection-card';
        div.innerHTML = `
            ${isOwnProfile ? `<button class="collection-card-remove" title="Remove card">x</button>` : ''}
            <img src="${card.card_image || ''}" class="collection-card-img" alt="${card.card_name || ''}" />
            <div class="collection-card-name">${card.card_name || ''}</div>
            <div class="collection-card-set">${card.card_set || ''}</div>
        `;
        if (isOwnProfile) {
            div.querySelector('.collection-card-remove').addEventListener('click', () => removeCard(card.id));
        }
        container.appendChild(div);
    });
}

async function renderTopRated() {
    const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .eq('user_id', profileUserId);

    const container = document.getElementById('topRatedCards');
    if (!container) return;
    container.innerHTML = '';

    if (!cards || cards.length === 0) {
        container.innerHTML = '<p class="collection-empty">No rated cards yet.</p>';
        return;
    }

    const topCards = [...cards]
        .sort((a, b) => rarityTier(b.rarity) - rarityTier(a.rarity))
        .slice(0, 5);

    topCards.forEach(card => {
        const tier = rarityTier(card.rarity);
        const div  = document.createElement('div');
        div.className = 'top-rated-card';
        div.innerHTML = `
            <img src="${card.card_image || card.image_url || ''}" class="top-rated-img" />
            <div class="top-rated-name">${card.card_name || ''}</div>
            <div class="top-rated-stars">${'*'.repeat(tier)}</div>
            <div class="top-rated-rarity" style="font-size:14px;color:rgba(255,215,0,0.6);margin-top:2px;">
                ${card.rarity || 'Common'}
            </div>
        `;
        container.appendChild(div);
    });
}

async function removeCard(cardId) {
    const { error } = await supabase.from('cards').delete().eq('id', cardId);
    if (error) { console.error('Remove card error:', error); return; }
    await renderMyCollection();
    await renderTopRated();
}

// ============================================
// PUBLIC BINDERS
// ============================================
function darkenColor(hex, amount) {
    try {
        const [r, g, b] = hex.match(/\w\w/g).map(x => parseInt(x, 16));
        return `#${[r,g,b].map(c => Math.max(0,c-amount).toString(16).padStart(2,'0')).join('')}`;
    } catch { return '#1a1a1a'; }
}

async function renderPublicBinders() {
    const grid = document.getElementById('publicBindersGrid');
    if (!grid) return;

    const { data: binders, error } = await supabase
        .from('binders')
        .select('id, name, color, cover_image_url, card_count')
        .eq('user_id', profileUserId)
        .eq('is_public', true)
        .order('created_at', { ascending: true });

    if (error) { console.error('Binders fetch error:', error); return; }

    grid.innerHTML = '';

    if (!binders || binders.length === 0) {
        grid.innerHTML = `<p class="collection-empty">${
            isOwnProfile
                ? 'No public binders yet — set a binder to public in My Collection.'
                : 'This trainer has no public binders yet.'
        }</p>`;
        return;
    }

    binders.forEach(binder => {
        const wrap = document.createElement('a');
        wrap.href      = `../HTML/portfolio.html?id=${binder.id}`;
        wrap.className = 'profile-binder-card';
        wrap.style.borderColor = binder.color ?? '#C89B2A';
        wrap.style.boxShadow   = `0 0 18px ${binder.color ?? '#C89B2A'}44`;

        // Spine
        const spine = document.createElement('div');
        spine.className = 'profile-binder-spine';

        // Rings
        const rings = document.createElement('div');
        rings.className = 'profile-binder-rings';
        for (let i = 0; i < 4; i++) {
            const ring = document.createElement('div');
            ring.className = 'profile-binder-ring';
            rings.appendChild(ring);
        }

        // Cover
        if (binder.cover_image_url) {
            const img = document.createElement('img');
            img.src       = binder.cover_image_url;
            img.alt       = binder.name;
            img.className = 'profile-binder-cover';
            wrap.appendChild(img);
        } else {
            const bg = document.createElement('div');
            bg.className    = 'profile-binder-bg';
            bg.style.background = `linear-gradient(135deg, ${binder.color ?? '#6F2DA8'} 0%, ${darkenColor(binder.color ?? '#6F2DA8', 40)} 100%)`;
            bg.innerHTML = `<span class="profile-binder-icon">📓</span>`;
            wrap.appendChild(bg);
        }

        wrap.appendChild(spine);
        wrap.appendChild(rings);

        // Info overlay
        const info = document.createElement('div');
        info.className = 'profile-binder-info';
        info.innerHTML = `
            <p class="profile-binder-name">${binder.name}</p>
            <p class="profile-binder-count">${binder.card_count ?? 0} cards</p>
        `;
        wrap.appendChild(info);

        grid.appendChild(wrap);
    });
}

// ============================================
// SEND FRIEND REQUEST (global for inline onclick)
// ============================================
window.sendFriendRequest = async function(friendId, userId, btn) {
    btn.disabled  = true;
    btn.innerText = '...';

    const { data: existing } = await supabase
        .from('friends').select('id')
        .eq('user_id', userId).eq('friend_id', friendId).maybeSingle();

    if (existing) { btn.innerText = 'Added'; return; }

    const { error } = await supabase.from('friends').insert({ user_id: userId, friend_id: friendId });

    if (error) {
        console.error('Friend request error:', error);
        btn.innerText = 'Error'; btn.style.background = '#ff4444';
        return;
    }

    btn.innerText        = 'Added';
    btn.style.background = '#44cc44';
    btn.style.color      = 'white';
    showToast('Trainer added to friends!');
};

// ============================================
// ADD CARD MODAL
// ============================================
const TCGDEX = 'https://api.tcgdex.net/v2/en';
let profileSetsLoaded = false;

function openAddCardModal() {
    document.getElementById('profileCardNameInput').value          = '';
    document.getElementById('profileCardSearchStatus').textContent = '';
    document.getElementById('profileCardSearchResults').innerHTML  = '';
    document.getElementById('addCardModal').style.display          = 'flex';
    loadProfileSets();
    document.getElementById('profileCardNameInput').focus();
}

async function loadProfileSets() {
    if (profileSetsLoaded) return;
    try {
        const res  = await fetch(`${TCGDEX}/sets`);
        const sets = await res.json();
        sets.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
        const select = document.getElementById('profileCardSetSelect');
        sets.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id; opt.textContent = s.name;
            select.appendChild(opt);
        });
        profileSetsLoaded = true;
    } catch (e) { console.warn('Could not load sets:', e); }
}

async function profileSearchCards() {
    const name      = document.getElementById('profileCardNameInput').value.trim();
    const setId     = document.getElementById('profileCardSetSelect').value;
    const status    = document.getElementById('profileCardSearchStatus');
    const resultsEl = document.getElementById('profileCardSearchResults');
    const btn       = document.getElementById('profileCardSearchBtn');

    if (!name && !setId) { status.textContent = 'Enter a card name or choose a set.'; return; }
    status.textContent = 'Searching...'; resultsEl.innerHTML = ''; btn.disabled = true;

    try {
        let cards = [];

        if (setId) {
            const res  = await fetch(`${TCGDEX}/sets/${setId}`);
            const data = await res.json();
            cards = (data.cards ?? []).map(c => ({
                id: `${setId}-${c.localId}`, name: c.name,
                image: c.image ? `${c.image}/high.png` : null, set: data.name
            }));
            if (name) cards = cards.filter(c => c.name.toLowerCase().includes(name.toLowerCase()));
        } else {
            const res  = await fetch(`${TCGDEX}/cards`);
            const data = await res.json();
            cards = data
                .filter(c => c.name?.toLowerCase().includes(name.toLowerCase()))
                .map(c => ({ ...c, image: c.image ? `${c.image}/high.png` : null }));
        }

        cards = cards.filter(c => c.image).slice(0, 60);

        if (cards.length === 0) { status.textContent = 'No cards found.'; btn.disabled = false; return; }
        status.textContent = `${cards.length} card${cards.length !== 1 ? 's' : ''} found`;

        cards.forEach(card => {
            const item = document.createElement('div');
            item.style.cssText = 'cursor:pointer; text-align:center;';
            const img = document.createElement('img');
            img.src = card.image; img.alt = card.name; img.loading = 'lazy';
            img.style.cssText = 'width:100%; border-radius:8px; display:block; transition:transform 0.15s;';
            img.onmouseenter = () => img.style.transform = 'scale(1.05)';
            img.onmouseleave = () => img.style.transform = 'scale(1)';
            const label = document.createElement('span');
            label.textContent = card.name;
            label.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.7); display:block; margin-top:4px;';
            item.appendChild(img); item.appendChild(label);
            item.addEventListener('click', () => profileSelectCard(card));
            resultsEl.appendChild(item);
        });

    } catch (err) { status.textContent = 'Search failed.'; console.error(err); }
    btn.disabled = false;
}

import { resolveCardImage } from '../js/card-image-cache.js';

async function profileSelectCard(card) {
    document.getElementById('addCardModal').style.display = 'none';

    // Cache image in Supabase Storage before saving
    const rawImage = card.image?.replace(/\/high\.png$/, '') ?? card.image;
    const imageUrl = await resolveCardImage(rawImage, card.id, card.name, card.set);
    const { error } = await supabase.from('cards').insert({
        user_id:    currentUser.id,
        card_name:  card.name,
        card_image: imageUrl,  // ← Supabase URL instead of TCGDex
        image_url:  imageUrl,
        card_set:   card.set ?? null,
        binder_id:  null,
        rating:     0
    });

    if (error) { console.error('Add card error:', error); return; }
    await renderMyCollection();
    await renderTopRated();
}

// ============================================
// MAIN INIT
// ============================================
async function initProfile() {

    // 1. AUTH
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.replace("index.html"); return; }
    currentUser = user;

    // Set online + update last_seen on load
await supabase.from('profiles')
    .update({ is_online: true, last_seen: new Date().toISOString() })
    .eq('id', user.id);

// Keep last_seen fresh every 2 minutes while active
setInterval(async () => {
    if (document.visibilityState === 'visible') {
        await supabase.from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', user.id);
    }
}, 120000);

// Set offline when tab closes
window.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
        await supabase.from('profiles').update({ is_online: false }).eq('id', user.id);
    } else {
        await supabase.from('profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', user.id);
    }
});

    // 2. OWN vs FRIEND PROFILE
    const urlParams       = new URLSearchParams(window.location.search);
    const viewingUsername = urlParams.get('user');
    let profile;

    if (viewingUsername) {
        const { data: friendProfile, error } = await supabase
            .from('profiles').select('*').eq('username', viewingUsername).single();
        if (error || !friendProfile) { console.error('Could not load profile:', error); window.location.replace("index.html"); return; }
        profile = friendProfile;
    } else {
        const { data: ownProfile, error } = await supabase
            .from('profiles').select('*').eq('id', user.id).single();
        if (error) console.error('Profile fetch error:', error);
        profile = ownProfile;
    }

    isOwnProfile = !viewingUsername || profile?.id === user.id;
    profileUserId = profile.id;

    window._isOwnProfile     = isOwnProfile;
    window._currentUserId    = user.id;
    window._currentProfileId = profile.id;

    // 3. DOM REFS
    const content       = document.getElementById('profile-page-content');
    const nameDisplay   = document.getElementById('trainer-name-display');
    const avatarDisplay = document.querySelector('.user-avatar');
    const bioDisplay    = document.querySelector('.user-bio');
    const bannerDisplay = document.querySelector('.profile-banner img');

    // 4. POPULATE PROFILE
    if (profile) {
        if (nameDisplay)   nameDisplay.innerText = profile.username || 'Trainer';
        if (avatarDisplay) avatarDisplay.src     = safeImg(profile.avatar_url, 'Ash Ketchum User.jpg');
        if (bioDisplay)    bioDisplay.innerText  = profile.bio || 'Pro Trainer | Legendary Card Hunter | Kanto Region';
        if (bannerDisplay) bannerDisplay.src     = safeImg(profile.banner_url, 'Arcanine_Full.png');
        if (content)       content.classList.add('auth-confirmed');

        // Trade count stat — written by increment_trade_count RPC when a trade completes
        const statTrades = document.getElementById('stat-trades');
        if (statTrades) statTrades.textContent = profile.trade_count ?? 0;

        // Render trade activity chart once userId is confirmed
        renderTradeActivityChart(profileUserId).catch(e => console.warn('Chart error:', e));

        // Rating stat — computed from trade_reviews
        const { data: ratingData } = await supabase
            .from('trade_reviews')
            .select('rating')
            .eq('reviewed_id', profileUserId);
        const statRating = document.getElementById('stat-rating');
        if (statRating) {
            if (ratingData && ratingData.length > 0) {
                const avg = ratingData.reduce((sum, r) => sum + r.rating, 0) / ratingData.length;
                statRating.textContent = avg.toFixed(1) + ' ★';
            } else {
                statRating.textContent = '—';
            }
        }
    }

    // 5. EDIT PROFILE MODAL
    const editBtn   = document.querySelector('.edit-profile-btn');
    const editModal = document.getElementById('editModal');
    const closeBtn  = document.getElementById('closeEdit');

    if (editBtn) {
        if (!isOwnProfile) {
            editBtn.style.display = 'none';
        } else {
            editBtn.onclick = () => {
                if (!editModal) return;
                editModal.style.display = 'flex';
                editModal.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
                const clean = v => (!v || v === 'null') ? '' : v;
                document.getElementById('editUsername').value     = clean(profile?.username);
                document.getElementById('editEmailAddress').value = clean(user?.email);
                document.getElementById('editBio').value          = clean(profile?.bio);
            };
        }
    }

    if (closeBtn) closeBtn.onclick = () => { 
        if (editModal) {
            editModal.style.display = 'none';
        }
    };

    // TRADE BUTTON — shown on other users' profiles only
    const tradeBtn = document.getElementById('trade-with-btn');
    if (tradeBtn) {
        if (!isOwnProfile && profile?.username) {
            tradeBtn.href = `../HTML/trades.html?user=${profile.username}`;
            tradeBtn.style.display = '';
        } else {
            tradeBtn.style.display = 'none';
        }
    }
    

    // 6. AVATAR & BANNER PICKERS
    document.querySelectorAll('#editAvatarGrid .avatar-option').forEach(img => {
        img.onclick = () => {
            document.querySelectorAll('#editAvatarGrid .avatar-option').forEach(a => a.classList.remove('selected'));
            img.classList.add('selected');
        };
    });
    document.querySelectorAll('#editBannerGrid .banner-option').forEach(img => {
        img.onclick = () => {
            document.querySelectorAll('#editBannerGrid .banner-option').forEach(b => b.classList.remove('selected'));
            img.classList.add('selected');
        };
    });

    // 7. SAVE PROFILE
    const editForm = document.getElementById('editProfileForm');
    if (editForm && isOwnProfile) {
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            const newName  = document.getElementById('editUsername')?.value.trim()     || profile?.username || '';
            const newEmail = document.getElementById('editEmailAddress')?.value.trim() || user?.email       || '';
            const newBio   = document.getElementById('editBio')?.value.trim()           || profile?.bio      || 'Pro Trainer | Legendary Card Hunter';
            const selectedAvatar = document.querySelector('#editAvatarGrid .avatar-option.selected');
            const newAvatar = selectedAvatar ? selectedAvatar.getAttribute('src') : safeImg(profile?.avatar_url, 'Ash Ketchum User.jpg');
            const selectedBanner = document.querySelector('#editBannerGrid .banner-option.selected');
            const newBanner = selectedBanner ? selectedBanner.getAttribute('src') : safeImg(profile?.banner_url, 'Arcanine_Full.png');

            const { error: updateError } = await supabase.from('profiles')
                .upsert({ id: user.id, username: newName, bio: newBio, avatar_url: newAvatar, banner_url: newBanner });

            if (updateError) { console.error('Profile update error:', updateError); showToast("Error saving profile!"); return; }
            if (newEmail !== user.email) {
                const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
                if (emailError) console.error('Email update error:', emailError);
            }
            if (nameDisplay)   nameDisplay.innerText = newName;
            if (avatarDisplay) avatarDisplay.src     = newAvatar;
            if (bioDisplay)    bioDisplay.innerText  = newBio;
            if (bannerDisplay) bannerDisplay.src     = newBanner;
            profile.username = newName; profile.bio = newBio; profile.avatar_url = newAvatar; profile.banner_url = newBanner;
            if (editModal) editModal.style.display = 'none';
            showToast("Trainer Profile Updated!");
            editForm.reset();
            document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        };
    }

    // 8. FILE UPLOAD
    const fileInput = document.getElementById('avatarUpload');
    if (fileInput && isOwnProfile) {
        fileInput.onchange = e => { const file = e.target.files[0]; if (file) handleImageUpload(file, user, avatarDisplay); };
    }

    // 9. FRIENDS LIST
    const friendsList = document.getElementById('friends-list');
    if (friendsList) {
        const { data: friends } = await supabase.from('friends').select('friend_id').eq('user_id', user.id);

        if (friends && friends.length > 0) {
            const friendIds = friends.map(f => f.friend_id);
            const { data: friendProfiles } = await supabase
                .from('profiles').select('id, username, avatar_url, is_online').in('id', friendIds);

            friendsList.innerHTML = friendProfiles && friendProfiles.length > 0
                ? friendProfiles.map(p => `
                    <a href="profile.html?user=${p.username}" style="text-decoration:none; color:inherit;">
                        <div class="user-item">
                            <img src="${safeImg(p.avatar_url, 'Ash Ketchum User.jpg')}"
                                 alt="${p.username}"
                                 onerror="this.src='Ash Ketchum User.jpg'">
                            <span>${p.username}</span>
                            <i class="status ${p.is_online ? 'online' : 'offline'}"></i>
                        </div>
                    </a>`).join('')
                : `<p class="empty-state">No friends added yet.</p>`;
        } else {
            friendsList.innerHTML = `<p class="empty-state">No friends added yet.</p>`;
        }
    }

    // 10. RECENT TRADES — reads from trade_history for both sender and receiver roles
    const tradesList = document.getElementById('trades-list');
    if (tradesList) {
        const { data: trades } = await supabase
            .from('trade_history')
            .select('sender_id, receiver_id, sender_card_name, sender_card_image, receiver_card_name, receiver_card_image, completed_at')
            .or(`sender_id.eq.${profileUserId},receiver_id.eq.${profileUserId}`)
            .order('completed_at', { ascending: false })
            .limit(5);

        if (trades && trades.length > 0) {
            // Fetch all trade partner profiles in one query
            const partnerIds = [...new Set(trades.map(t =>
                t.sender_id === profileUserId ? t.receiver_id : t.sender_id
            ))];
            const { data: partnerProfiles } = await supabase
                .from('profiles').select('id, username, avatar_url').in('id', partnerIds);
            const profileMap = Object.fromEntries((partnerProfiles ?? []).map(p => [p.id, p]));

            tradesList.innerHTML = trades.map(t => {
                const amSender      = t.sender_id === profileUserId;
                const gave          = amSender ? t.sender_card_name    : t.receiver_card_name;
                const received      = amSender ? t.receiver_card_name  : t.sender_card_name;
                const gaveImg       = amSender ? t.sender_card_image   : t.receiver_card_image;
                const receivedImg   = amSender ? t.receiver_card_image : t.sender_card_image;
                const partnerId     = amSender ? t.receiver_id : t.sender_id;
                const partner       = profileMap[partnerId];
                const partnerName   = partner?.username ?? 'Trainer';
                const partnerAvatar = safeImg(partner?.avatar_url, 'Ash Ketchum User.jpg');
                return `
                    <div class="trade-item">
                        <div class="trade-item-partner">
                            <img src="${partnerAvatar}" class="trade-item-avatar" alt="${partnerName}">
                            <span class="trade-item-partner-name">${partnerName}</span>
                            <span class="trade-time">${timeAgo(t.completed_at)}</span>
                        </div>
                        <div class="trade-item-cards">
                            ${gaveImg     ? `<img src="${gaveImg}"     class="trade-item-img" title="Gave: ${gave     ?? ''}" alt="${gave     ?? ''}">` : ''}
                            <span class="trade-item-arrow">⇄</span>
                            ${receivedImg ? `<img src="${receivedImg}" class="trade-item-img" title="Got: ${received  ?? ''}"  alt="${received  ?? ''}">` : ''}
                        </div>
                        <p>Gave <strong>${gave ?? '—'}</strong> · Got <strong>${received ?? '—'}</strong></p>
                    </div>`;
            }).join('');
        } else {
            tradesList.innerHTML = `<p class="empty-state">No recent trades.</p>`;
        }
    }

    // 11. TRADER REVIEWS SIDEBAR
    await renderTradeReviews();

    // 12. FIND FRIENDS MODAL (own profile only)
    const findFriendsBtn      = document.getElementById('find-friends-btn');
    const findFriendsModal    = document.getElementById('findFriendsModal');
    const closeFindFriends    = document.getElementById('closeFindFriends');
    const friendSearchInput   = document.getElementById('friendSearchInput');
    const friendSearchResults = document.getElementById('friendSearchResults');

    if (findFriendsBtn) findFriendsBtn.style.display = isOwnProfile ? '' : 'none';

    if (findFriendsBtn && isOwnProfile && findFriendsModal) {
        findFriendsBtn.onclick = async () => {
            findFriendsModal.style.display = 'flex';
            friendSearchInput.value        = '';
            friendSearchInput.focus();
            friendSearchResults.innerHTML  = `<p style="color:#aaa;font-size:13px;">Loading trainers...</p>`;

            const { data: results } = await supabase.from('profiles').select('id, username, avatar_url')
                .neq('id', user.id).order('username', { ascending: true }).limit(20);

            friendSearchResults.innerHTML = !results || results.length === 0
                ? `<p style="color:#aaa;font-size:13px;">No trainers found.</p>`
                : results.map(r => `
                    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #3d2b3d;">
                        <img src="${safeImg(r.avatar_url, '../Images/Ash Ketchum User.jpg')}" alt="${r.username}"
                             style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid #ffd700;">
                        <span style="flex:1;font-size:14px;">${r.username}</span>
                        <button onclick="sendFriendRequest('${r.id}','${user.id}',this)"
                                style="background:#ffd700;color:#2d1b2d;border:none;padding:6px 16px;border-radius:50px;font-weight:800;font-size:12px;cursor:pointer;">
                            + Add
                        </button>
                    </div>`).join('');
        };
    }

    if (closeFindFriends) {
        closeFindFriends.onclick = () => {
            findFriendsModal.style.display = 'none';
            if (friendSearchInput)   friendSearchInput.value       = '';
            if (friendSearchResults) friendSearchResults.innerHTML = '';
        };
    }

    if (findFriendsModal) {
        findFriendsModal.onclick = e => {
            if (e.target === findFriendsModal) {
                findFriendsModal.style.display = 'none';
                if (friendSearchInput)   friendSearchInput.value       = '';
                if (friendSearchResults) friendSearchResults.innerHTML = '';
            }
        };
    }

    if (friendSearchInput) {
        let searchTimeout;
        friendSearchInput.oninput = () => {
            clearTimeout(searchTimeout);
            const query = friendSearchInput.value.trim();
            if (query.length < 2) { friendSearchResults.innerHTML = ''; return; }
            friendSearchResults.innerHTML = `<p style="color:#aaa;font-size:13px;">Searching...</p>`;
            searchTimeout = setTimeout(async () => {
                const { data: results } = await supabase.from('profiles').select('id, username, avatar_url')
                    .ilike('username', `%${query}%`).neq('id', user.id).limit(10);
                friendSearchResults.innerHTML = !results || results.length === 0
                    ? `<p style="color:#aaa;font-size:13px;">No trainers found.</p>`
                    : results.map(r => `
                        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #3d2b3d;">
                            <img src="${safeImg(r.avatar_url, '../Images/Ash Ketchum User.jpg')}" alt="${r.username}"
                                 style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid #ffd700;">
                            <span style="flex:1;font-size:14px;">${r.username}</span>
                            <button onclick="sendFriendRequest('${r.id}','${user.id}',this)"
                                    style="background:#ffd700;color:#2d1b2d;border:none;padding:6px 16px;border-radius:50px;font-weight:800;font-size:12px;cursor:pointer;">
                                + Add
                            </button>
                        </div>`).join('');
            }, 400);
        };
    }

    // 13. ADD CARD MODAL WIRING (own profile only)
    const addCardModal = document.getElementById('addCardModal');
    if (addCardModal) {
        document.getElementById('closeAddCard')?.addEventListener('click', () => { addCardModal.style.display = 'none'; });
        addCardModal.addEventListener('click', e => { if (e.target === addCardModal) addCardModal.style.display = 'none'; });
        if (isOwnProfile) {
            document.getElementById('profileCardSearchBtn')?.addEventListener('click', profileSearchCards);
            document.getElementById('profileCardNameInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') profileSearchCards(); });
        }
    }

    // 14. COLLECTION
    await renderMyCollection();
    await renderTopRated();
    await renderPublicBinders();

    await renderWishlist();
    initWishlistModal();
    

    // 15. BACK TO TOP
    const backToTopBtn = document.getElementById("backToTop");
    if (backToTopBtn) {
        window.onscroll = () => backToTopBtn.classList.toggle("show-btn", window.scrollY > 300);
        backToTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    }

} // end initProfile

// ============================================
// TRADE REVIEWS — render in profile sidebar
// ============================================
async function renderTradeReviews() {
    // Inject reviews section into sidebar if not already present
    const sidebar = document.querySelector('.social-sidebar');
    if (sidebar && !document.getElementById('reviews-sidebar-group')) {
        const group = document.createElement('div');
        group.id = 'reviews-sidebar-group';
        group.className = 'sidebar-group';
        group.innerHTML = `<h4>TRADER REVIEWS</h4><div class="review-list" id="reviews-list"></div>`;
        sidebar.appendChild(group);
    }

    const reviewsList = document.getElementById('reviews-list');
    if (!reviewsList) return;

    const { data: reviews } = await supabase
        .from('trade_reviews')
        .select('reviewer_id, rating, comment, created_at')
        .eq('reviewed_id', profileUserId)
        .order('created_at', { ascending: false })
        .limit(5);

    if (!reviews || reviews.length === 0) {
        reviewsList.innerHTML = `<p class="empty-state">No reviews yet.</p>`;
        return;
    }

    // Fetch reviewer usernames
    const reviewerIds = [...new Set(reviews.map(r => r.reviewer_id))];
    const { data: reviewerProfiles } = await supabase
        .from('profiles').select('id, username, avatar_url').in('id', reviewerIds);
    const profileMap = Object.fromEntries((reviewerProfiles ?? []).map(p => [p.id, p]));

    reviewsList.innerHTML = reviews.map(r => {
        const reviewer     = profileMap[r.reviewer_id];
        const name         = reviewer?.username ?? 'Trainer';
        const avatar       = safeImg(reviewer?.avatar_url, 'Ash Ketchum User.jpg');
        const stars        = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        return `
            <div class="review-item">
                <div class="review-header">
                    <img src="${avatar}" class="trade-item-avatar" alt="${name}">
                    <span class="review-name">${name}</span>
                    <span class="review-stars" data-rating="${r.rating}">${stars}</span>
                </div>
                ${r.comment ? `<p class="review-comment">"${r.comment}"</p>` : ''}
                <span class="trade-time">${timeAgo(r.created_at)}</span>
            </div>`;
    }).join('');
}

// ── Wishlist modal wiring ────────────────────────────────────────────────────

function initWishlistModal() {
    const addBtn    = document.getElementById('wishlistAddBtn');
    const modal     = document.getElementById('wishlistModal');
    const closeBtn  = document.getElementById('closeWishlistModal');
    const closeBtn2 = document.getElementById('closeWishlistModal2');
    const searchBtn = document.getElementById('wishlistSearchBtn');
    const input     = document.getElementById('wishlistSearchInput');

    if (addBtn)    addBtn.addEventListener('click', openWishlistModal);
    if (closeBtn)  closeBtn.addEventListener('click',  () => { modal.style.display = 'none'; });
    if (closeBtn2) closeBtn2.addEventListener('click', () => { modal.style.display = 'none'; });
    if (modal)     modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    if (searchBtn) searchBtn.addEventListener('click', wishlistSearchCards);
    if (input)     input.addEventListener('keydown', e => { if (e.key === 'Enter') wishlistSearchCards(); });
}

// ── Render wishlist section ──────────────────────────────────────────────────
 
async function renderWishlist() {
    const grid      = document.getElementById('wishlistGrid');
    const emptyEl   = document.getElementById('wishlistEmpty');
    const emptyText = document.getElementById('wishlistEmptyText');
    const addBtn    = document.getElementById('wishlistAddBtn');
 
    if (!grid) return;
 
    // Show add button only on own profile
    if (addBtn) addBtn.style.display = isOwnProfile ? 'inline-flex' : 'none';
 
    // Fetch wishlist for this profile
    const { data: items, error } = await supabase
        .from('wishlists')
        .select('*')
        .eq('user_id', profileUserId)
        .order('created_at', { ascending: false });
 
    if (error) { console.error('Wishlist fetch error:', error); return; }
 
    grid.innerHTML = '';

    // Add tile as first item on own profile
    if (isOwnProfile) {
        const addTile = document.createElement('button');
        addTile.className = 'wishlist-add-btn';
        addTile.innerHTML = '<span>+</span>Add Card';
        addTile.addEventListener('click', openWishlistModal);
        grid.appendChild(addTile);
    }

    // Hide the standalone header button
    const headerBtn = document.getElementById('wishlistAddBtn');
    if (headerBtn) headerBtn.style.display = 'none';

    if (!items || items.length === 0) {
        if (emptyEl && !isOwnProfile) {
            emptyEl.style.display = 'block';
            if (emptyText) emptyText.textContent = 'This trainer hasn\'t added any wish list cards yet.';
        }
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
 
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'wishlist-card';
        card.innerHTML = `
            ${isOwnProfile ? `
                <button class="wishlist-remove-btn" data-id="${item.id}" title="Remove from wish list">✕</button>
            ` : `
                <button class="wishlist-trade-btn" data-name="${item.card_name}" title="I have this card!">
                    ⇄ I have this!
                </button>
            `}
            <div class="wishlist-card-img-wrap">
                <img src="${item.card_image || ''}" alt="${item.card_name}" class="wishlist-card-img"
                     onerror="this.src='card-placeholder.png'" loading="lazy" />
            </div>
            <div class="wishlist-card-name">${item.card_name}</div>
            <div class="wishlist-card-set">${item.card_set || ''}</div>
        `;
 
        // Own profile — remove button
        if (isOwnProfile) {
            card.querySelector('.wishlist-remove-btn').addEventListener('click', async () => {
                await supabase.from('wishlists').delete().eq('id', item.id);
                await renderWishlist();
                showToast('Removed from wish list.');
            });
        } else {
            // Other profile — "I have this!" opens trade page pre-filled
            card.querySelector('.wishlist-trade-btn').addEventListener('click', () => {
                const profileName = document.getElementById('trainer-name-display')?.textContent ?? '';
                window.location.href = `trades.html?with=${encodeURIComponent(profileName)}&card=${encodeURIComponent(item.card_name)}`;
            });
        }
 
        grid.appendChild(card);
    });
}
 
// ── Wishlist add modal ────────────────────────────────────────────────────────
 
let wishlistSetsLoaded = false;
 
async function openWishlistModal() {
    document.getElementById('wishlistSearchInput').value    = '';
    document.getElementById('wishlistSearchStatus').textContent = '';
    document.getElementById('wishlistSearchResults').innerHTML  = '';
    document.getElementById('wishlistModal').style.display  = 'flex';
    await loadWishlistSets();
    document.getElementById('wishlistSearchInput').focus();
}
 
async function loadWishlistSets() {
    if (wishlistSetsLoaded) return;
    try {
        const res  = await fetch('https://api.tcgdex.net/v2/en/sets');
        const sets = await res.json();
        sets.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
        const select = document.getElementById('wishlistSetSelect');
        sets.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id; opt.textContent = s.name;
            select.appendChild(opt);
        });
        wishlistSetsLoaded = true;
    } catch (e) { console.warn('Could not load sets for wishlist:', e); }
}
 
async function wishlistSearchCards() {
    const name      = document.getElementById('wishlistSearchInput').value.trim();
    const setId     = document.getElementById('wishlistSetSelect').value;
    const status    = document.getElementById('wishlistSearchStatus');
    const resultsEl = document.getElementById('wishlistSearchResults');
    const btn       = document.getElementById('wishlistSearchBtn');
 
    if (!name && !setId) { status.textContent = 'Enter a card name or choose a set.'; return; }
    status.textContent = 'Searching...'; resultsEl.innerHTML = ''; btn.disabled = true;
 
    const TCGDEX = 'https://api.tcgdex.net/v2/en';
 
    try {
        let cards = [];
 
        if (setId) {
            const res  = await fetch(`${TCGDEX}/sets/${setId}`);
            const data = await res.json();
            cards = (data.cards ?? []).map(c => ({
                id:    `${setId}-${c.localId}`,
                name:  c.name,
                image: c.image ? `${c.image}/high.png` : null,
                set:   data.name,
            }));
            if (name) cards = cards.filter(c => c.name?.toLowerCase().includes(name.toLowerCase()));
        } else {
            const res  = await fetch(`${TCGDEX}/cards`);
            const data = await res.json();
            cards = data
                .filter(c => c.name?.toLowerCase().includes(name.toLowerCase()))
                .map(c => ({ ...c, image: c.image ? `${c.image}/high.png` : null }));
        }
 
        cards = cards.filter(c => c.image).slice(0, 60);
 
        if (cards.length === 0) { status.textContent = 'No cards found.'; btn.disabled = false; return; }
        status.textContent = `${cards.length} card${cards.length !== 1 ? 's' : ''} found`;
 
        cards.forEach(card => {
            const item = document.createElement('div');
            item.style.cssText = 'cursor:pointer; text-align:center;';
 
            const img = document.createElement('img');
            img.src = card.image; img.alt = card.name; img.loading = 'lazy';
            img.style.cssText = 'width:100%; border-radius:8px; display:block; transition:transform 0.15s;';
            img.onmouseenter = () => img.style.transform = 'scale(1.05)';
            img.onmouseleave = () => img.style.transform = 'scale(1)';
 
            const label = document.createElement('span');
            label.textContent = card.name;
            label.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.7); display:block; margin-top:4px;';
 
            item.appendChild(img);
            item.appendChild(label);
            item.addEventListener('click', () => wishlistSelectCard(card));
            resultsEl.appendChild(item);
        });
 
    } catch (err) { status.textContent = 'Search failed.'; console.error(err); }
    btn.disabled = false;
}
 
async function wishlistSelectCard(card) {
    // Check for duplicate
    const { data: existing } = await supabase
        .from('wishlists')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('card_name', card.name)
        .maybeSingle();
 
    if (existing) {
        showToast('That card is already on your wish list!');
        return;
    }
 
    const { error } = await supabase.from('wishlists').insert({
        user_id:    currentUser.id,
        card_id:    card.id   ?? null,
        card_name:  card.name,
        card_image: card.image ?? null,
        card_set:   card.set  ?? null,
    });
 
    if (error) { console.error('Wishlist insert error:', error); showToast('Error adding card.'); return; }
 
    document.getElementById('wishlistModal').style.display = 'none';
    await renderWishlist();
    showToast(`${card.name} added to wish list!`);
}

// ─── TRADE ACTIVITY CHART ─────────────────────────────────────────────────────
async function renderTradeActivityChart(userId) {
    const canvas = document.getElementById('trade-activity-canvas');
    if (!canvas) return;

    // Build last 6 month date ranges
    const months = [];
    const now    = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            label: d.toLocaleDateString('en-GB', { month: 'short' }),
            from:  new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
            to:    new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString(),
        });
    }

    // User's completed trades per month
    const userCounts = await Promise.all(months.map(async m => {
        const { count } = await supabase
            .from('trade_proposals')
            .select('id', { count: 'exact', head: true })
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'active')
            .gte('updated_at', m.from)
            .lte('updated_at', m.to);
        return count || 0;
    }));

    // Site-wide average per user
    const { count: totalUsers } = await supabase
        .from('profiles').select('id', { count: 'exact', head: true });
    const activeUsers = Math.max(totalUsers || 1, 1);

    const siteCounts = await Promise.all(months.map(async m => {
        const { count } = await supabase
            .from('trade_proposals')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .gte('updated_at', m.from)
            .lte('updated_at', m.to);
        return Math.round(((count || 0) / activeUsers) * 10) / 10;
    }));

    const labels = months.map(m => m.label);

    // Use ResizeObserver so canvas gets correct width even if layout isn't settled
    const observer = new ResizeObserver(() => {
        observer.disconnect();
        drawTradeChart(canvas, labels, userCounts, siteCounts);
    });
    observer.observe(canvas);

    // Fallback: also draw immediately in case observer fires too late
    requestAnimationFrame(() => drawTradeChart(canvas, labels, userCounts, siteCounts));
}

function drawTradeChart(canvas, labels, userSeries, avgSeries) {
    const W = canvas.offsetWidth;
    const H = 90;
    if (!W) return; // not yet laid out

    canvas.width  = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const PAD_L = 28, PAD_R = 12, PAD_T = 8, PAD_B = 22;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;
    const n      = labels.length;
    const maxVal = Math.max(...userSeries, ...avgSeries, 1);

    ctx.clearRect(0, 0, W, H);

    // Gridlines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    for (let i = 1; i <= 3; i++) {
        const y = PAD_T + chartH - (chartH / 3) * i;
        ctx.beginPath();
        ctx.moveTo(PAD_L, y);
        ctx.lineTo(PAD_L + chartW, y);
        ctx.stroke();
    }

    // Y labels
    ctx.fillStyle = '#444';
    ctx.font = '10px Rajdhani, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(maxVal, PAD_L - 4, PAD_T + 4);
    ctx.fillText(0,      PAD_L - 4, PAD_T + chartH + 3);

    const xPos = i => PAD_L + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
    const yPos = v => PAD_T + chartH - (v / maxVal) * chartH;

    function drawLine(series, color, dash = []) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.lineJoin    = 'round';
        ctx.setLineDash(dash);
        series.forEach((v, i) => i === 0 ? ctx.moveTo(xPos(i), yPos(v)) : ctx.lineTo(xPos(i), yPos(v)));
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawFill(series, color) {
        ctx.beginPath();
        series.forEach((v, i) => i === 0 ? ctx.moveTo(xPos(i), yPos(v)) : ctx.lineTo(xPos(i), yPos(v)));
        ctx.lineTo(xPos(n - 1), PAD_T + chartH);
        ctx.lineTo(PAD_L,       PAD_T + chartH);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    // Site average dashed
    drawLine(avgSeries, 'rgba(100,100,100,0.6)', [4, 3]);

    // User fill + line + dots
    drawFill(userSeries, 'rgba(212,175,55,0.08)');
    drawLine(userSeries, '#d4af37');
    userSeries.forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(xPos(i), yPos(v), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#d4af37';
        ctx.fill();
    });

    // Value labels above dots
    ctx.fillStyle = '#d4af37';
    ctx.font      = 'bold 10px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    userSeries.forEach((v, i) => {
        if (v > 0) ctx.fillText(v, xPos(i), yPos(v) - 7);
    });

    // Month labels
    ctx.fillStyle = '#555';
    ctx.font      = '10px Rajdhani, sans-serif';
    labels.forEach((lbl, i) => ctx.fillText(lbl, xPos(i), H - 6));
}
