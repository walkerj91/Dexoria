import { supabase } from './supabaseClient.js';

export async function renderNavbar(containerId) {

    const container = document.getElementById(containerId);
    if (!container) return;

    // ============================================
    // SESSION
    // ============================================
    let session = null;
    const { data: initial } = await supabase.auth.getSession();
    session = initial.session;

    if (!session) {
    // Give Supabase 800ms to restore session from storage, then proceed regardless
    await new Promise(resolve => {
        const timeout = setTimeout(resolve, 800);
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            if (newSession !== undefined) {
                session = newSession;
                clearTimeout(timeout);
                subscription.unsubscribe();
                resolve();
            }
        });
    });
}

    const isLoggedIn = !!session;

    // ============================================
    // USERNAME
    // ============================================
    let username = 'Trainer';
    if (isLoggedIn) {
        const { data: profile } = await supabase
            .from('profiles').select('username').eq('id', session.user.id).single();
        if (profile?.username) username = profile.username;
    }

    // ============================================
    // BUILD NAVBAR
    // ============================================
    container.innerHTML = `
    <nav>
        <div class="nav-logo">
            <a href="index.html">
                <img src="Dexoria_Logo_Icon_bg.jpg">
            </a>
        </div>

        <div class="menu-toggle" id="menu-toggle">☰</div>

        <div class="nav-links" id="nav-links">

            <a href="index.html">HOME</a>

            <div class="dropdown">
                <a href="marketplace.html">MARKETPLACE ▾</a>
                <div class="dropdown-content">
                    <a href="binders.html">Binders</a>
                </div>
            </div>

            <a href="trades.html"    id="trades-nav-link">TRADES</a>
            <a href="community.html" id="community-nav-link">COMMUNITY</a>

            <div class="dropdown">
                <a href="portfolio.html" id="portfolio-nav-link">PORTFOLIO ▾</a>
                <div class="dropdown-content">
                    <a href="set-tracker.html" id="set-tracker-link">Set Tracker</a>
                </div>
            </div>

            <a href="profile.html" id="profile-nav-link">PROFILE</a>

            <!-- NOTIFICATION BELL — logged in only -->
            ${isLoggedIn ? `
            <div class="notif-wrapper" id="notif-wrapper">
                <button class="notif-bell" id="notif-bell" title="Notifications" aria-label="Notifications">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    <span class="notif-badge" id="notif-badge" style="display:none;">0</span>
                </button>

                <div class="notif-dropdown" id="notif-dropdown">
                    <div class="notif-dropdown-header">
                        <h4>Notifications</h4>
                        <div class="notif-header-actions">
                            <button class="notif-mark-all" id="notif-mark-all">Mark all read</button>
                            <button class="notif-clear-all" id="notif-clear-all">Clear all</button>
                        </div>
                    </div>
                    <div class="notif-list" id="notif-list">
                        <p class="notif-empty">Loading...</p>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- CART -->
            <div class="cart-icon-container" onclick="location.href='basket.html'"
                 style="position:relative; display:inline-block; cursor:pointer; margin:0 15px; vertical-align:middle;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
                <span id="cart-count"
                      style="position:absolute; top:-8px; right:-8px; background:#ffd700; color:#333;
                             font-size:10px; font-weight:bold; border-radius:50%; width:16px; height:16px;
                             display:flex; align-items:center; justify-content:center; border:1px solid #5B0D76;">0</span>
            </div>

            ${isLoggedIn
                ? `<a href="#" id="logout-link">LOGOUT (${username})</a>`
                : `<a href="login.html">LOGIN</a>`
            }

        </div>
    </nav>
    `;

    // ============================================
    // NAV INTERACTIONS
    // ============================================
    setupNavbar();
    updateCartBadge();

    const logoutBtn = document.getElementById('logout-link');
    if (logoutBtn) {
        logoutBtn.onclick = async (e) => {
            e.preventDefault();
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        };
    }

    const guardedLinks = [
        { id: 'profile-nav-link' },
        { id: 'trades-nav-link' },
        { id: 'portfolio-nav-link' },
        { id: 'set-tracker-link' },
    ];

    // Optional tooltip hint for logged-out users
    const commLink = document.getElementById('community-nav-link');
    if (commLink && !isLoggedIn) {
    commLink.title = "Browse posts — sign in to join the conversation";
    }

    guardedLinks.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (el) el.onclick = (e) => { if (!isLoggedIn) { e.preventDefault(); showLoginRequiredModal(); } };
    });

    // ============================================
    // TRAINER COUNT
    // ============================================
    const trainerCountEl = document.getElementById('trainer-count');
    if (trainerCountEl) {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        if (count !== null) trainerCountEl.innerText = count.toLocaleString();
    }

    // ============================================
    // NOTIFICATIONS (logged in only)
    // ============================================
    if (isLoggedIn && session?.user?.id) {
        await loadNotifications(session.user.id);
        setupNotificationPanel(session.user.id);
        // Poll every 30 seconds for new notifications
        setInterval(() => loadNotifications(session.user.id), 5000);
        window.addEventListener('dexoria:notifications:refresh', () => loadNotifications(session.user.id));
    }
}

// ============================================
// LOAD NOTIFICATIONS
// ============================================
async function loadNotifications(userId) {
    const { data: notifs, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) return;

    const unreadCount = (notifs ?? []).filter(n => !n.is_read).length;
    const badge       = document.getElementById('notif-badge');
    const listEl      = document.getElementById('notif-list');
    const markAllBtn  = document.getElementById('notif-mark-all');
    const clearAllBtn = document.getElementById('notif-clear-all');

    // Update badge
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent  = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    if (!listEl) return;

    if (!notifs || notifs.length === 0) {
        listEl.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
        if (markAllBtn) markAllBtn.style.display = 'none';
        if (clearAllBtn) clearAllBtn.style.display = 'none';
        return;
    }

    if (markAllBtn) markAllBtn.style.display = unreadCount > 0 ? '' : 'none';
    if (clearAllBtn) clearAllBtn.style.display = '';

    listEl.innerHTML = '';
    notifs.forEach(n => {
        const item    = document.createElement('div');
        item.className = `notif-item${n.is_read ? '' : ' notif-unread'}`;
        item.dataset.id = n.id;

        const icon = { message: '💬', trade_proposal: '⇄', trade_accepted: '🎉', trade_agreed: '🎉', trade_awaiting: '⏳', trade_declined: '❌', general: '🔔' }[n.type] ?? '🔔';
        const time = formatNotifTime(n.created_at);

        item.innerHTML = `
            <div class="notif-icon">${icon}</div>
            <div class="notif-content">
                <div class="notif-title">${n.title}</div>
                <div class="notif-body">${n.body}</div>
                <div class="notif-time">${time}</div>
            </div>
            ${!n.is_read ? '<div class="notif-dot"></div>' : ''}
        `;

        item.addEventListener('click', async () => {
            // Mark as read
            await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
            item.classList.remove('notif-unread');
            item.querySelector('.notif-dot')?.remove();

            // Update badge
            const currentCount = parseInt(badge?.textContent ?? '0', 10);
            const newCount     = Math.max(0, currentCount - 1);
            if (badge) {
                badge.textContent  = newCount;
                badge.style.display = newCount > 0 ? '' : 'none';
            }

            // Navigate to link
            if (n.link) window.location.href = n.link;
        });

        listEl.appendChild(item);
    });

    // If there is any unread trade-agreed notification, tell trades.js to show the modal
    const tradeAgreedNotif = (notifs ?? []).find(n =>
        !n.is_read &&
        n.title === '🎉 Trade Agreed — Pay Shipping!' &&
        n.link?.includes('trade-confirmation.html')
    );
    if (tradeAgreedNotif) {
        window.dispatchEvent(new CustomEvent('dexoria:trade:agreed', {
            detail: { proposalId: tradeAgreedNotif.link.split('trade_id=')[1] }
        }));
    }
}

// ============================================
// NOTIFICATION PANEL — open/close + mark all
// ============================================
function setupNotificationPanel(userId) {
    const bell     = document.getElementById('notif-bell');
    const dropdown = document.getElementById('notif-dropdown');
    const markAll  = document.getElementById('notif-mark-all');
    const clearAll = document.getElementById('notif-clear-all');

    if (!bell || !dropdown) return;

    // Toggle dropdown
    bell.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('open');
        if (isOpen) loadNotifications(userId); // refresh on open
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!document.getElementById('notif-wrapper')?.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });

    // Mark all read
    if (markAll) {
        markAll.addEventListener('click', async (e) => {
            e.stopPropagation();
            await supabase.from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .eq('is_read', false);
            await loadNotifications(userId);
        });
    }

    // Clear all
    if (clearAll) {
        clearAll.addEventListener('click', async (e) => {
            e.stopPropagation();

            // Optimistic UI — clear list immediately
            const listEl = document.getElementById('notif-list');
            const badge  = document.getElementById('notif-badge');
            if (listEl) listEl.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
            if (badge)  { badge.textContent = '0'; badge.style.display = 'none'; }
            clearAll.style.display = 'none';
            const markAll = document.getElementById('notif-mark-all');
            if (markAll) markAll.style.display = 'none';

            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('user_id', userId);

            if (error) {
                console.error('Failed to clear notifications:', error);
                // Revert optimistic update so user knows it failed
                await loadNotifications(userId);
            }
        });
    }
}

// ============================================
// FORMAT NOTIFICATION TIME
// ============================================
function formatNotifTime(isoString) {
    const d    = new Date(isoString);
    const diff = Date.now() - d;
    if (diff < 60000)    return 'just now';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ============================================
// NAVBAR SETUP
// ============================================
function setupNavbar() {
    const toggle = document.getElementById('menu-toggle');
    const nav    = document.getElementById('nav-links');

    if (toggle && nav) {
        toggle.addEventListener('click', () => nav.classList.toggle('active'));
    }

    document.querySelectorAll('.dropdown > a').forEach(link => {
        link.addEventListener('click', function (e) {
            if (window.innerWidth <= 768) {
                e.preventDefault();
                this.parentElement.classList.toggle('active');
            }
        });
    });

    const current = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-links a').forEach(link => {
        if (link.getAttribute('href') === current) link.classList.add('active');
    });
}

// ============================================
// CART
// ============================================
function updateCartBadge() {
    const cart  = JSON.parse(localStorage.getItem('dexoria_cart')) || [];
    const badge = document.getElementById('cart-count');
    if (badge) {
        const total = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        badge.innerText = total;
    }
}

// ============================================
// LOGIN MODAL
// ============================================
function showLoginRequiredModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.85);
        display:flex; align-items:center; justify-content:center;
        z-index:9999;
    `;
    overlay.innerHTML = `
        <div style="background:#1E2329; padding:40px; border-radius:20px;
                    border:2px solid #D4AF37; text-align:center; max-width:400px; color: #F8F9FA;">
            <h2 style="color: #D4AF37; margin-bottom:15px;">Trainer Access Required</h2>
            <p style="margin-bottom:25px;">
                Please <strong>Sign In</strong> to continue or <strong>Sign Up</strong> to join Dexoria!
            </p>
            <button id="continueBtn"
                style="background: #D4AF37; color: #2d1b2d; border:2px solid #D4AF37;
                       padding:10px 30px; border-radius:50px;
                       font-weight:800; cursor:pointer;">
                CONTINUE
            </button>
        </div>
    `;
    overlay.querySelector('#continueBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = 'login.html?view=login&loginRequired=true';
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}
