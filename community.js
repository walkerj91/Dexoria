// =========================
//  IMPORTS
// =========================
import { supabase } from './supabaseClient.js';

// =========================
//  CLOUDINARY CONFIG
// =========================
const CLOUD_NAME    = "ddifqujfn";
const UPLOAD_PRESET = "community_posts";

// =========================
//  STATE
// =========================
let currentUser   = null;
let currentTab    = 'home';
let filterTag     = null;
let selectedFiles = [];

// =========================
//  BOOTSTRAP
// =========================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;

    await loadUserAvatar();
    setupTabs();
    setupComposer();
    setupDragDrop();
    setupRealtime();
    await loadFeed();
    loadTrainerCount();
    loadSuggestedTopics();

    await updateLastSeen();
    setInterval(updateLastSeen, 2 * 60 * 1000); // keep active status fresh every 2 min
});

// =========================
//  TABS
// =========================
function setupTabs() {
    document.querySelectorAll('.comm-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('.comm-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            await loadFeed();
        });
    });
}

// =========================
//  LOAD FEED
// =========================
async function loadFeed() {
    const container = document.getElementById('feedContainer');
    if (!container) return;
    container.innerHTML = '<p class="feed-loading">Loading feed…</p>';

    if (!currentUser) {
    container.innerHTML += renderAuthGate();
}


    // Saved tab — fetch saved post IDs first
    let savedIds = new Set();
    let likedIds  = new Set();

    if (currentUser) {
        const [likesRes, savesRes] = await Promise.all([
            supabase.from('post_likes').select('post_id').eq('user_id', currentUser.id),
            supabase.from('saved_posts').select('post_id').eq('user_id', currentUser.id)
        ]);
        (likesRes.data  || []).forEach(r => likedIds.add(r.post_id));
        (savesRes.data  || []).forEach(r => savedIds.add(r.post_id));
    }

    if (currentTab === 'saved' && savedIds.size === 0) {
        container.innerHTML = '<p class="feed-empty">No saved posts yet — tap 🔖 to save one.</p>';
        return;
    }

    let query = supabase
        .from('community_posts')
        .select('id, user_id, message, media_url, created_at, like_count, profiles:user_id (id, username, avatar_url)');

    // Apply hashtag filter if one is active
    if (filterTag) query = query.ilike('message', `%${filterTag}%`);

    if (currentTab === 'trending') {
        query = query.order('like_count', { ascending: false }).limit(30);
    } else if (currentTab === 'saved') {
        query = query.in('id', [...savedIds]).order('created_at', { ascending: false });
    } else {
        query = query.order('created_at', { ascending: false }).limit(40);
    }

    const { data: posts, error } = await query;

    if (error) {
        container.innerHTML = '<p class="feed-empty">Failed to load feed.</p>';
        console.error(error);
        return;
    }

    container.innerHTML = '';

    if (!posts || posts.length === 0) {
        container.innerHTML = '<p class="feed-empty">No posts yet — be the first! 👋</p>';
        return;
    }

    posts.forEach(post => container.appendChild(buildPostCard(post, likedIds, savedIds)));
    setupCarousels();
    wireButtons();
}

// =========================
//  BUILD POST CARD
// =========================
function buildPostCard(post, likedIds, savedIds) {
    const isLiked  = likedIds.has(post.id);
    const isSaved  = savedIds.has(post.id);
    const isOwner  = !!currentUser && currentUser.id === post.user_id;
    const avatar   = post.profiles?.avatar_url || 'Ash Ketchum User.jpg';
    const username = post.profiles?.username   || 'Trainer';
    const likes    = post.like_count ?? 0;

    // Build media
    // Parse media_url regardless of how Supabase stored it
    // (text[] → array, jsonb → array, text → JSON string or plain URL)
    let urls = [];
    if (Array.isArray(post.media_url)) {
        urls = post.media_url.filter(Boolean);
    } else if (typeof post.media_url === 'string' && post.media_url.trim()) {
        if (post.media_url.trim().startsWith('[')) {
            try { urls = JSON.parse(post.media_url).filter(Boolean); }
            catch { urls = [post.media_url]; }
        } else {
            urls = [post.media_url];
        }
    }

    let mediaHTML = '';
    if (urls.length > 0) {
        const slides = urls.map(url =>
            url.match(/\.(mp4|webm|mov)(\?|$)/i)
                ? `<video controls src="${url}" class="post-media-slide" playsinline></video>`
                : `<img src="${url}" class="post-media-slide" loading="lazy" alt="Post image">`
        ).join('');

        mediaHTML = `
            <div class="post-carousel" data-index="0" data-total="${urls.length}">
                <div class="post-carousel-track">${slides}</div>
                ${urls.length > 1 ? `
                    <button class="carousel-btn carousel-prev" aria-label="Previous">‹</button>
                    <button class="carousel-btn carousel-next" aria-label="Next">›</button>
                    <div class="carousel-dots">
                        ${urls.map((_, i) =>
                            `<span class="carousel-dot${i === 0 ? ' active' : ''}"></span>`
                        ).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    const article = document.createElement('article');
    article.className = 'comm-bubble post-card';
    article.dataset.id = post.id;
    article.innerHTML = `
        <div class="post-card-header">
            <img class="post-card-avatar" src="${avatar}" alt="${escapeHTML(username)}"
                 onerror="this.src='Ash Ketchum User.jpg'">
            <div class="post-card-meta">
                <span class="post-card-username">${escapeHTML(username)}</span>
                <span class="post-card-time">${timeAgo(post.created_at)}</span>
            </div>
            ${isOwner ? `
                <button class="post-delete-btn" data-id="${post.id}" title="Delete post">✕</button>
            ` : ''}
        </div>

        ${post.message ? `<p class="post-card-caption">${escapeHTML(post.message)}</p>` : ''}

        ${mediaHTML}

        <div class="post-card-actions">
            <div class="post-card-actions-left">
                <button class="post-like-btn ${isLiked ? 'liked' : ''}" data-id="${post.id}" aria-label="Like">
                    <span class="like-icon">${isLiked ? '❤️' : '🤍'}</span>
                    <span class="like-count">${likes > 0 ? likes : ''}</span>
                </button>
                <button class="post-share-btn" data-id="${post.id}" aria-label="Share">🔗</button>
            </div>
            <button class="post-save-btn ${isSaved ? 'saved' : ''}" data-id="${post.id}"
                    title="${isSaved ? 'Unsave' : 'Save'}">
                ${isSaved ? '🔖' : '🏷️'}
            </button>
        </div>
    `;

    return article;
}

// =========================
//  WIRE BUTTONS
// =========================
function wireButtons() {
    document.querySelectorAll('.post-like-btn').forEach(btn =>
        btn.addEventListener('click', () => handleLike(btn.dataset.id, btn))
    );
    document.querySelectorAll('.post-save-btn').forEach(btn =>
        btn.addEventListener('click', () => handleSave(btn.dataset.id, btn))
    );
    document.querySelectorAll('.post-delete-btn').forEach(btn =>
        btn.addEventListener('click', () => handleDelete(btn.dataset.id))
    );
    document.querySelectorAll('.post-share-btn').forEach(btn =>
        btn.addEventListener('click', () => {
            navigator.clipboard?.writeText(window.location.href)
                .then(() => showToast('Link copied!'));
        })
    );

    // Lightbox — click any image to open it full size
    document.querySelectorAll('.post-media-slide').forEach(img => {
        img.addEventListener('click', e => {
            e.stopPropagation(); // don't trigger carousel nav
            openLightbox(img.src);
        });
    });
}

// =========================
//  LIKE
// =========================
async function handleLike(postId, btn) {
    if (!currentUser) { showLoginPrompt(); return; }

    const isLiked   = btn.classList.contains('liked');
    const countEl   = btn.querySelector('.like-count');
    const iconEl    = btn.querySelector('.like-icon');
    const current   = parseInt(countEl.textContent) || 0;
    const newCount  = isLiked ? Math.max(0, current - 1) : current + 1;

    // Optimistic update
    btn.classList.toggle('liked', !isLiked);
    iconEl.textContent  = isLiked ? '🤍' : '❤️';
    countEl.textContent = newCount > 0 ? newCount : '';

    if (isLiked) {
        await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
        await supabase.from('community_posts').update({ like_count: newCount }).eq('id', postId);
    } else {
        const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: currentUser.id });
        if (!error) await supabase.from('community_posts').update({ like_count: newCount }).eq('id', postId);
        else {
            // Already liked — roll back
            btn.classList.remove('liked');
            iconEl.textContent  = '🤍';
            countEl.textContent = current > 0 ? current : '';
        }
    }
}

// =========================
//  SAVE
// =========================
async function handleSave(postId, btn) {
    if (!currentUser) { showLoginPrompt(); return; }

    const isSaved = btn.classList.contains('saved');

    btn.classList.toggle('saved', !isSaved);
    btn.textContent = isSaved ? '🏷️' : '🔖';
    btn.title       = isSaved ? 'Save' : 'Unsave';

    if (isSaved) {
        await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', currentUser.id);
        showToast('Removed from saved.');
    } else {
        await supabase.from('saved_posts').insert({ post_id: postId, user_id: currentUser.id });
        showToast('Saved!');
    }
}

// =========================
//  DELETE
// =========================
async function handleDelete(postId) {
    if (!currentUser) { showLoginPrompt(); return; }

    // Verify ownership client-side before sending the request
    const card = document.querySelector(`.post-card[data-id="${postId}"]`);
    if (!card) return;

    if (!confirm('Delete this post? This cannot be undone.')) return;

    const { error } = await supabase
        .from('community_posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', currentUser.id); // server-side ownership check

    if (error) {
        showToast('Could not delete — you may not own this post.');
        console.error(error);
    } else {
        card.remove();
        showToast('Post deleted.');
    }
}

// =========================
//  POST COMPOSER
// =========================
function setupComposer() {

    if (!currentUser) {
    const textEl = document.getElementById('postText');
    const postBtn = document.getElementById('postBtn');

    if (textEl) {
        textEl.placeholder = "Sign in to post...";
        textEl.disabled = true;
    }

    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = "Sign in to post";
    }
}

    document.getElementById('postBtn')?.addEventListener('click', handlePostSubmit);
    document.getElementById('uploadBtn')?.addEventListener('click', () => {
        document.getElementById('mediaUpload')?.click();
    });
    document.getElementById('clearBtn')?.addEventListener('click', () => {
        const textEl = document.getElementById('postText');
        if (textEl) textEl.value = '';
        selectedFiles = [];
        refreshPreviews();
    });
    document.getElementById('postText')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePostSubmit();
    });
}

async function handlePostSubmit() {
    const textEl      = document.getElementById('postText');
    const postBtn     = document.getElementById('postBtn');
    const progressBar = document.querySelector('.progress-bar');
    const progressFill = document.querySelector('.progress-fill');
    const text        = textEl?.value.trim();

    if (!text && selectedFiles.length === 0) {
        showToast('Write something or add an image first.'); return;
    }
    if (!currentUser) { showLoginPrompt(); return; }

    postBtn.disabled    = true;
    postBtn.textContent = 'Posting…';
    if (progressBar) progressBar.style.display = 'block';

    let mediaUrls = [];
    let total = selectedFiles.length;
    let done  = 0;

    for (const file of selectedFiles) {
        try {
            const url = await uploadToCloudinary(file, pct => {
                if (progressFill)
                    progressFill.style.width = `${((done / total) + (pct / total / 100)) * 100}%`;
            });
            if (url) mediaUrls.push(url);
        } catch (uploadErr) {
            console.error('Cloudinary upload failed:', uploadErr);
            showToast('Image upload failed — check your Cloudinary preset is set to unsigned.');
        }
        done++;
    }

    const { error } = await supabase.from('community_posts').insert({
        user_id:    currentUser.id,
        message:    text,
        media_url:  mediaUrls,
        like_count: 0,
        created_at: new Date().toISOString()
    });

    if (error) {
        showToast('Post failed — try again.');
        console.error(error);
    } else {
        if (textEl) textEl.value = '';
        selectedFiles = [];
        refreshPreviews();
        showToast('Posted! 🎉');
        if (currentTab === 'home') await loadFeed();
    }

    postBtn.disabled    = false;
    postBtn.textContent = 'Post';
    if (progressBar) { progressBar.style.display = 'none'; }
    if (progressFill) progressFill.style.width = '0%';
}

// =========================
//  CLOUDINARY UPLOAD
// =========================
async function uploadToCloudinary(file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`);
        xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
        });
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== 4) return;
            try {
                const res = JSON.parse(xhr.responseText);
                res.secure_url ? resolve(res.secure_url) : reject(res.error ?? res);
            } catch (e) { reject(e); }
        };
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', UPLOAD_PRESET);
        xhr.send(fd);
    });
}

// =========================
//  DRAG & DROP / FILE PICKER
// =========================
function setupDragDrop() {
    const area  = document.getElementById('uploadArea');
    const input = document.getElementById('mediaUpload');
    if (!area || !input) return;

    area.addEventListener('click',     () => input.click());
    area.addEventListener('dragover',  e => { e.preventDefault(); area.classList.add('dragover'); });
    area.addEventListener('dragleave', ()  => area.classList.remove('dragover'));
    area.addEventListener('drop',      e  => {
        e.preventDefault(); area.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', e => handleFiles(e.target.files));
}

function handleFiles(files) {
    for (const file of files) {
        if (selectedFiles.length >= 4) break;
        if (file.type.startsWith('video')) {
            if (selectedFiles.some(f => f.type.startsWith('video'))) continue;
            selectedFiles = [file]; break;
        }
        selectedFiles.push(file);
    }
    refreshPreviews();
}

function refreshPreviews() {
    const container = document.getElementById('previewContainer');
    if (!container) return;
    container.innerHTML = '';
    selectedFiles.forEach((file, i) => {
        const div = document.createElement('div');
        div.className = 'preview-thumb';
        if (file.type.startsWith('video')) {
            const v = document.createElement('video');
            v.src = URL.createObjectURL(file); v.muted = true;
            div.appendChild(v);
        } else {
            div.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
        }
        const rm = document.createElement('div');
        rm.className = 'preview-remove'; rm.textContent = '×';
        rm.onclick = () => { selectedFiles.splice(i, 1); refreshPreviews(); };
        div.appendChild(rm);
        container.appendChild(div);
    });
}

// =========================
//  CAROUSEL
// =========================
function setupCarousels() {
    document.querySelectorAll('.post-carousel').forEach(c => {
        const track = c.querySelector('.post-carousel-track');
        const dots  = c.querySelectorAll('.carousel-dot');
        let idx = 0;

        const go = n => {
            const total = parseInt(c.dataset.total);
            idx = Math.max(0, Math.min(total - 1, n));
            track.style.transform = `translateX(-${idx * 100}%)`;
            dots.forEach((d, i) => d.classList.toggle('active', i === idx));
            c.dataset.index = idx;
        };

        c.querySelector('.carousel-prev')?.addEventListener('click', e => { e.stopPropagation(); go(idx - 1); });
        c.querySelector('.carousel-next')?.addEventListener('click', e => { e.stopPropagation(); go(idx + 1); });

        let sx = 0;
        track.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
        track.addEventListener('touchend',   e => {
            const d = e.changedTouches[0].clientX - sx;
            if (Math.abs(d) > 40) go(d < 0 ? idx + 1 : idx - 1);
        });
    });
}

// =========================
//  AVATAR
// =========================
async function loadUserAvatar() {
    if (!currentUser) return;
    const { data: profile } = await supabase
        .from('profiles').select('avatar_url').eq('id', currentUser.id).maybeSingle();
    const el = document.getElementById('composerAvatar');
    if (profile?.avatar_url && el) {
        el.style.backgroundImage    = `url('${profile.avatar_url}')`;
        el.style.backgroundSize     = 'cover';
        el.style.backgroundPosition = 'center';
    }
}

// =========================
//  REAL-TIME
// =========================
function setupRealtime() {
    supabase.channel('community_feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts' }, () => {
            if (currentTab === 'home') loadFeed();
        })
        .subscribe();
}

// =========================
//  HELPERS
// =========================
// ── Last Seen Heartbeat ─────────────────────────────────
async function updateLastSeen() {
    if (!currentUser) return;
    await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', currentUser.id);
}

// ── Suggested Topics ────────────────────────────────────
async function loadSuggestedTopics() {
    const list = document.getElementById('suggested-topics');
    if (!list) return;

    // Fetch recent 200 posts — enough to get meaningful hashtag data
    const { data: posts } = await supabase
        .from('community_posts')
        .select('message')
        .not('message', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

    if (!posts || posts.length === 0) {
        list.innerHTML = '<li style="opacity:0.4;cursor:default;font-size:12px;">No topics yet — use #hashtags in posts!</li>';
        return;
    }

    // Count hashtag frequency
    const counts = {};
    posts.forEach(post => {
        const tags = (post.message || '').match(/#[a-zA-Z0-9_]+/g) || [];
        tags.forEach(tag => {
            const t = tag.toLowerCase();
            counts[t] = (counts[t] || 0) + 1;
        });
    });

    const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    if (sorted.length === 0) {
        list.innerHTML = '<li style="opacity:0.4;cursor:default;font-size:12px;">No hashtags yet — try adding one!</li>';
        return;
    }

    list.innerHTML = sorted.map(([tag, count]) => `
        <li class="topic-item ${filterTag === tag ? 'active' : ''}" data-tag="${tag}">
            <span class="topic-name">${tag}</span>
            <span class="topic-count">${count}</span>
        </li>
    `).join('');

    // Wire clicks — toggle filter
    list.querySelectorAll('.topic-item').forEach(li => {
        li.addEventListener('click', async () => {
            if (filterTag === li.dataset.tag) {
                // Clear filter
                filterTag = null;
                li.classList.remove('active');
            } else {
                filterTag = li.dataset.tag;
                list.querySelectorAll('.topic-item').forEach(i => i.classList.remove('active'));
                li.classList.add('active');
            }
            await loadFeed();
        });
    });
}


// ── Auth Gate ────────────────────────────────────────────
function renderAuthGate() {
    return `
        <div class="comm-auth-gate">
            <p class="comm-auth-title">🔒 Join the Community</p>
            <p class="comm-auth-text">
                Sign in to post, like and save content from other trainers.
            </p>
            <a class="comm-auth-btn" href="./login.html?view=login&community=true">
                Sign In / Sign Up
            </a>
        </div>
    `;
}

// ── Lightbox ────────────────────────────────────────────
// ── Trainer Count ───────────────────────────────────────
async function loadTrainerCount() {
    // Footer — total registered trainers
    const { count: total } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

    const footer = document.getElementById('trainer-count');
    if (footer) footer.textContent = total ?? '—';

    // Sidebar — trainers seen in the last 5 minutes (actively signed in)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: active } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen', fiveMinAgo);

    const sidebar = document.getElementById('trainer-count-sidebar');
    if (sidebar) sidebar.textContent = active ?? '—';
}

function openLightbox(src) {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';

    const img = document.createElement('img');
    img.className = 'lightbox-img';
    img.src = src;
    img.alt = 'Full size image';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lightbox-close';
    closeBtn.innerHTML = '✕';
    closeBtn.setAttribute('aria-label', 'Close image');

    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));

    function closeLightbox() {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 220);
    }

    closeBtn.addEventListener('click', closeLightbox);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeLightbox(); });
    img.addEventListener('click', e => e.stopPropagation());

    const onKey = e => {
        if (e.key === 'Escape') { closeLightbox(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
}

function timeAgo(iso) {
    const diff = Date.now() - new Date(iso);
    if (diff < 60000)    return 'just now';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
    return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, c =>
        ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
    );
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className  = 'toast-notification';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 50);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}

function showLoginPrompt() {
    const overlay = document.createElement('div');
    overlay.className = 'login-overlay';

    overlay.innerHTML = `
        <div class="login-modal">
            <h3>🔒 Sign in required</h3>
            <p>
                Join the Dexoria community to like, save, and share posts.
            </p>
            <a class="login-btn" href="./login.html?view=login&community=true">
                Sign In / Sign Up
            </a>
        </div>
    `;

    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
}
