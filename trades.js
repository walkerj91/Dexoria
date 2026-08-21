// ============================================
// IMPORTS
// ============================================
import { supabase }         from '../js/supabaseClient.js';
import { resolveCardImage } from '../js/card-image-cache.js';

// ============================================
// CONSTANTS
// ============================================
const TCGDEX = 'https://api.tcgdex.net/v2/en';

// ============================================
// STATE
// ============================================
let currentUser          = null;
let currentUserProfile   = null;
let tradePartner         = null;
let activeProposal       = null;
let tradeSetsLoaded      = false;
let tradeModalMode       = null;
let activeProposalSide   = null;
let proposalPollTimer    = null;
let messagePollTimer     = null;
let chatChannel          = null;
let proposalChannel      = null;
let lastMessageTimestamp = null;
let tradeAgreedModalShown = false;

// Multi-card trade state
let tradeType    = 'single';      // 'single' | 'multi'
let yourMultiCards = [];          // [{ image, name }, ...]
let theirMultiCards = [];

// ============================================
// TOAST
// ============================================
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 3000);
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.replace('../HTML/index.html'); return; }
    currentUser = user;

    const { data: profile } = await supabase
        .from('profiles').select('username, avatar_url')
        .eq('id', user.id).maybeSingle();
    currentUserProfile = profile;

    const params          = new URLSearchParams(window.location.search);
    const partnerUsername = params.get('user');

    await renderTradeListings();
    await loadConversationList(partnerUsername);
    wireButtons();
});

// ============================================
// NEW CONVERSATION MODAL
// ============================================
function openNewConversationModal() {
    const modal   = document.getElementById('newConversationModal');
    const input   = document.getElementById('newConvSearchInput');
    const results = document.getElementById('newConvSearchResults');
    if (!modal) return;
    if (input)   input.value      = '';
    if (results) results.innerHTML = '';
    modal.style.display = 'flex';
    input?.focus();
}

async function searchTrainers(query) {
    const resultsEl = document.getElementById('newConvSearchResults');
    if (!resultsEl || !query.trim()) { resultsEl.innerHTML = ''; return; }

    const { data: trainers } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${query}%`)
        .neq('id', currentUser.id)
        .limit(8);

    if (!trainers || trainers.length === 0) {
        resultsEl.innerHTML = '<p style="color:rgba(255,255,255,0.4); font-size:13px; padding:12px;">No trainers found.</p>';
        return;
    }

    resultsEl.innerHTML = '';
    trainers.forEach(t => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:10px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05);';
        item.onmouseenter = () => item.style.background = 'rgba(255,215,0,0.07)';
        item.onmouseleave = () => item.style.background = 'transparent';
        item.innerHTML = `
            <img src="${t.avatar_url || '../Images/Ash Ketchum User.jpg'}" alt="${t.username}"
                 style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid #8B6A18;flex-shrink:0;">
            <div>
                <div style="color:#ffd700;font-size:14px;font-weight:600;">${t.username}</div>
                <div style="color:rgba(255,255,255,0.4);font-size:11px;">Trainer</div>
            </div>
            <span style="margin-left:auto;color:#8B6A18;font-size:16px;">→</span>
        `;
        item.addEventListener('click', () => {
            document.getElementById('newConversationModal').style.display = 'none';
            startConversationWith({ id: t.id, username: t.username, avatar_url: t.avatar_url });
        });
        resultsEl.appendChild(item);
    });
}

// ============================================
// CONVERSATION LIST
// ============================================
async function loadConversationList(autoSelectUsername = null) {
    const listEl = document.getElementById('conversation-list');
    if (!listEl || !currentUser) return;

    listEl.innerHTML = '<p class="conv-empty">Loading...</p>';

    const [sent, received] = await Promise.all([
        supabase.from('trade_proposals').select('receiver_id, status, created_at').eq('sender_id', currentUser.id).order('created_at', { ascending: false }),
        supabase.from('trade_proposals').select('sender_id, status, created_at').eq('receiver_id', currentUser.id).order('created_at', { ascending: false })
    ]);

    const partnerIds = new Set([
        ...(sent.data ?? []).map(r => r.receiver_id),
        ...(received.data ?? []).map(r => r.sender_id)
    ]);

    const { data: msgConvos } = await supabase
        .from('trade_messages').select('conversation_id')
        .like('conversation_id', `%${currentUser.id}%`);

    (msgConvos ?? []).forEach(m => {
        m.conversation_id.split('_').forEach(id => { if (id !== currentUser.id) partnerIds.add(id); });
    });

    if (partnerIds.size === 0) {
        listEl.innerHTML = '<p class="conv-empty">No conversations yet.<br>Visit a trainer\'s profile and click Trade.</p>';
        return;
    }

    const { data: profiles } = await supabase
        .from('profiles').select('id, username, avatar_url').in('id', [...partnerIds]);

    if (!profiles || profiles.length === 0) {
        listEl.innerHTML = '<p class="conv-empty">No conversations yet.</p>';
        return;
    }

    const lastMessages = await Promise.all(profiles.map(async p => {
        const convoId = [currentUser.id, p.id].sort().join('_');
        const { data } = await supabase
            .from('trade_messages').select('message, created_at, sender_id')
            .eq('conversation_id', convoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        return { partnerId: p.id, msg: data };
    }));

    const lastMsgMap = Object.fromEntries(lastMessages.map(m => [m.partnerId, m.msg]));

    profiles.sort((a, b) => {
        const aTime = lastMsgMap[a.id]?.created_at ?? '0';
        const bTime = lastMsgMap[b.id]?.created_at ?? '0';
        return bTime.localeCompare(aTime);
    });

    listEl.innerHTML = '';

    profiles.forEach(partner => {
        const lastMsg  = lastMsgMap[partner.id];
        const preview  = lastMsg ? lastMsg.message : 'No messages yet';
        const timeStr  = lastMsg ? formatTime(lastMsg.created_at) : '';
        const isUnread = lastMsg && lastMsg.sender_id !== currentUser.id;

        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.dataset.partnerId = partner.id;
        item.innerHTML = `
            <img src="${partner.avatar_url || '../Images/Ash Ketchum User.jpg'}" class="conv-avatar" alt="${partner.username}">
            <div class="conv-info">
                <div class="conv-name">${partner.username}</div>
                <div class="conv-preview ${isUnread ? 'conv-unread' : ''}">${preview}</div>
            </div>
            <div class="conv-meta">
                <span class="conv-time">${timeStr}</span>
                ${isUnread ? '<span class="conv-dot"></span>' : ''}
            </div>
        `;
        item.addEventListener('click', () => selectConversation(partner, item));
        listEl.appendChild(item);

        if (autoSelectUsername && partner.username === autoSelectUsername) {
            selectConversation(partner, item);
        }
    });
}

// ============================================
// SELECT CONVERSATION
// ============================================
async function selectConversation(partner, itemEl) {
    if (chatChannel)       { supabase.removeChannel(chatChannel); chatChannel = null; }
    if (proposalChannel)   { supabase.removeChannel(proposalChannel); proposalChannel = null; }
    if (proposalPollTimer) { clearInterval(proposalPollTimer); proposalPollTimer = null; }
    if (messagePollTimer)  { clearInterval(messagePollTimer);  messagePollTimer  = null; }

    tradePartner          = partner;
    lastMessageTimestamp  = null;
    activeProposal        = null;
    tradeAgreedModalShown = false;
    tradeAgreedModalShown = false;
    tradeAgreedModalShown = false;

    resetZone('your');
    resetZone('their');
    const removeBtn = document.getElementById('remove-your-card');
    const addBtn    = document.querySelector('.add-trade-card-btn[data-side="your"]');
    if (removeBtn) removeBtn.style.display = 'none';
    if (addBtn)    addBtn.style.display    = '';

    document.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('active'));
    itemEl?.classList.add('active');

    document.getElementById('chat-window-empty').style.display  = 'none';
    document.getElementById('chat-window-active').style.display = 'flex';

    const nameEl   = document.getElementById('trade-partner-name');
    const avatarEl = document.getElementById('trade-partner-avatar');
    if (nameEl)   nameEl.textContent = partner.username;
    if (avatarEl) avatarEl.src = partner.avatar_url || '../Images/Ash Ketchum User.jpg';

    await loadMessages();
    await loadActiveProposal();
    subscribeToChat();
    subscribeToTradeAgreedBroadcast();
    startMessagePolling();
    startProposalPolling();
}

// ============================================
// TRADE AGREED EVENT — fired by navbar.js when
// it detects an unread trade-agreed notification.
// This is how user 1 gets the modal when user 2
// accepts — no broadcast needed.
// ============================================
window.addEventListener('dexoria:trade:agreed', async (e) => {
    if (tradeAgreedModalShown) return;
    if (!tradePartner) return;

    const proposalId = e.detail?.proposalId;
    if (!proposalId) return;

    // Fetch fresh proposal data
    const { data } = await supabase
        .from('trade_proposals').select('*')
        .eq('id', proposalId).single();

    if (data && data.sender_accepted && data.receiver_accepted) {
        activeProposal = data;
        tradeAgreedModalShown = true;
        showTradeSuccess();
        showTradeAgreedModal(proposalId);
    }
});

// ============================================
// START CONVERSATION WITH (from modal)
// ============================================
async function startConversationWith(partner) {
    await loadConversationList();

    let item = document.querySelector(`.conversation-item[data-partner-id="${partner.id}"]`);

    if (!item) {
        const listEl = document.getElementById('conversation-list');
        listEl?.querySelector('.conv-empty')?.remove();

        item = document.createElement('div');
        item.className = 'conversation-item';
        item.dataset.partnerId = partner.id;
        item.innerHTML = `
            <img src="${partner.avatar_url || '../Images/Ash Ketchum User.jpg'}" class="conv-avatar" alt="${partner.username}">
            <div class="conv-info">
                <div class="conv-name">${partner.username}</div>
                <div class="conv-preview">No messages yet</div>
            </div>
        `;
        item.addEventListener('click', () => selectConversation(partner, item));
        listEl?.prepend(item);
    }

    selectConversation(partner, item);
}

// ============================================
// FORMAT TIME
// ============================================
function formatTime(isoString) {
    const d    = new Date(isoString);
    const diff = Date.now() - d;
    if (diff < 60000)    return 'just now';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ============================================
// CONVERSATION ID
// ============================================
function getConversationId() {
    if (!currentUser || !tradePartner) return null;
    return [currentUser.id, tradePartner.id].sort().join('_');
}

// ============================================
// CHAT — LOAD HISTORY
// ============================================
async function loadMessages() {
    const chatFeed = document.getElementById('chat-feed');
    if (!chatFeed || !tradePartner) return;
    chatFeed.innerHTML = '';
    lastMessageTimestamp = null;

    const convoId = getConversationId();
    if (!convoId) return;

    const { data: messages, error } = await supabase
        .from('trade_messages').select('*')
        .eq('conversation_id', convoId)
        .order('created_at', { ascending: true });

    if (error) { console.error('Load messages error:', error); return; }

    if (!messages || messages.length === 0) {
        chatFeed.innerHTML = '<p class="chat-empty-hint">No messages yet. Say hello!</p>';
        return;
    }

    messages.forEach(msg => appendMessage(msg, false));
    lastMessageTimestamp = messages[messages.length - 1].created_at;
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

// ============================================
// CHAT — APPEND MESSAGE
// ============================================
function appendMessage(msg, updateTimestamp = true) {
    const chatFeed = document.getElementById('chat-feed');
    if (!chatFeed) return;
    chatFeed.querySelector('.chat-empty-hint')?.remove();

    const isMine  = msg.sender_id === currentUser.id;
    const time    = new Date(msg.created_at);
    const timeStr = time.getHours().toString().padStart(2, '0') + ':' +
                    time.getMinutes().toString().padStart(2, '0');

    const div     = document.createElement('div');
    div.className = `message ${isMine ? 'msg-sent' : 'msg-received'}`;
    div.innerHTML = isMine
        ? `<div class="bubble">${msg.message}<span class="timestamp">${timeStr}</span></div>`
        : `<img src="${tradePartner?.avatar_url || '../Images/Ash Ketchum User.jpg'}" class="chat-avatar" alt="">
           <div class="bubble">${msg.message}<span class="timestamp">${timeStr}</span></div>`;

    chatFeed.appendChild(div);
    chatFeed.scrollTop = chatFeed.scrollHeight;
    if (updateTimestamp && msg.created_at) lastMessageTimestamp = msg.created_at;
}

// ============================================
// CHAT — SEND
// ============================================
async function sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const text      = chatInput?.value.trim();
    if (!text) return;
    if (!tradePartner) { showToast('Select a conversation first.'); return; }

    chatInput.value = '';
    const convoId = getConversationId();
    if (!convoId) return;

    const msg = {
        conversation_id: convoId,
        sender_id:       currentUser.id,
        message:         text,
        created_at:      new Date().toISOString()
    };

    appendMessage(msg);

    if (chatChannel) {
        chatChannel.send({ type: 'broadcast', event: 'new-message', payload: msg });
    }

    const { error } = await supabase.from('trade_messages').insert({
        conversation_id: convoId,
        sender_id:       currentUser.id,
        message:         text
    });
    if (error) { console.error('Save error:', error); showToast('Message failed to save.'); return; }

    await loadConversationList();
    document.querySelector(`.conversation-item[data-partner-id="${tradePartner.id}"]`)?.classList.add('active');
}

// ============================================
// CHAT — BROADCAST SUBSCRIPTION
// ============================================
function subscribeToChat() {
    if (chatChannel) { supabase.removeChannel(chatChannel); chatChannel = null; }
    if (!tradePartner) return;

    const convoId = getConversationId();
    if (!convoId) return;

    chatChannel = supabase
        .channel(`chat-${convoId}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'new-message' }, ({ payload }) => {
            if (payload.conversation_id === convoId && payload.sender_id !== currentUser.id) {
                appendMessage(payload);
                loadConversationList().then(() => {
                    document.querySelector(`.conversation-item[data-partner-id="${tradePartner?.id}"]`)?.classList.add('active');
                });
            }
        })
        .subscribe(status => console.log('Chat channel:', status));
}

// ============================================
// CHAT — POLL FALLBACK (every 3s)
// ============================================
function startMessagePolling() {
    if (messagePollTimer) clearInterval(messagePollTimer);

    messagePollTimer = setInterval(async () => {
        if (!tradePartner || !currentUser) return;
        const convoId = getConversationId();
        if (!convoId) return;

        let query = supabase
            .from('trade_messages').select('*')
            .eq('conversation_id', convoId)
            .neq('sender_id', currentUser.id)
            .order('created_at', { ascending: true });

        if (lastMessageTimestamp) query = query.gt('created_at', lastMessageTimestamp);

        const { data: newMessages } = await query;
        if (newMessages && newMessages.length > 0) {
            newMessages.forEach(msg => appendMessage(msg));
            await loadConversationList();
            document.querySelector(`.conversation-item[data-partner-id="${tradePartner?.id}"]`)?.classList.add('active');
        }
    }, 3000);
}

// ============================================
// TRADE AGREED BROADCAST
// ============================================
function subscribeToTradeAgreedBroadcast() {
    if (proposalChannel) { supabase.removeChannel(proposalChannel); proposalChannel = null; }
    if (!tradePartner) return;

    const convoId = [currentUser.id, tradePartner.id].sort().join('_');

    proposalChannel = supabase
        .channel('trade-agreed-' + convoId, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'trade_agreed' }, ({ payload }) => {
            console.log('[Trade] Broadcast received:', payload);
            if (!tradeAgreedModalShown) {
                tradeAgreedModalShown = true;
                supabase.from('trade_proposals').select('*')
                    .eq('id', payload.proposalId).single()
                    .then(({ data }) => {
                        if (data) activeProposal = data;
                        showTradeSuccess();
                        showTradeAgreedModal(payload.proposalId);
                    });
            }
        })
        .subscribe(status => console.log('[Trade] Broadcast channel:', status));
}

// ============================================
// PROPOSALS — POLL (every 5s)
// ============================================
function startProposalPolling() {
    if (proposalPollTimer) clearInterval(proposalPollTimer);
    proposalPollTimer = setInterval(async () => { await loadActiveProposal(); }, 5000);
}

// ============================================
// LOAD ACTIVE PROPOSAL
// Role is derived from proposal data — never from a flag
// ============================================
async function loadActiveProposal() {
    if (!currentUser || !tradePartner) return;

    const [asSender, asReceiver] = await Promise.all([
        supabase.from('trade_proposals').select('*')
            .eq('sender_id', currentUser.id).eq('receiver_id', tradePartner.id)
            .not('status', 'eq', 'declined')
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('trade_proposals').select('*')
            .eq('sender_id', tradePartner.id).eq('receiver_id', currentUser.id)
            .not('status', 'eq', 'declined')
            .order('created_at', { ascending: false }).limit(1).maybeSingle()
    ]);

    activeProposal = asSender.data || asReceiver.data || null;

    if (activeProposal?.sender_accepted && activeProposal?.receiver_accepted && !tradeAgreedModalShown) {
        tradeAgreedModalShown = true;
        showTradeSuccess();
        showTradeAgreedModal(activeProposal.id);
        return;
    }

    renderProposal();
}

// ============================================
// RENDER PROPOSAL
// Role derived directly from proposal row — never drifts
// ============================================
function renderProposal() {
    const statusEl = document.getElementById('proposal-status');
    document.getElementById('trade-success-banner')?.remove();

    if (!activeProposal) {
        resetZone('their');
        yourMultiCards  = [];
        theirMultiCards = [];
        renderMultiZone('your',   yourMultiCards);
        renderMultiZone('their',  theirMultiCards);
        if (statusEl) statusEl.textContent = tradePartner
            ? 'Select a card from your listings, then propose a trade.'
            : '';
        setProposalButtons('propose');
        return;
    }

    // Show correct panel for proposal type
    const isMulti = activeProposal.trade_type === 'multi';
    document.getElementById('singleTradePanel').style.display = isMulti ? 'none' : '';
    document.getElementById('multiTradePanel').style.display  = isMulti ? ''     : 'none';
    document.getElementById('tradeTypeToggle').style.display  = activeProposal ? 'none' : '';

    if (isMulti) {
        const amSender   = activeProposal.sender_id   === currentUser.id;
        const amReceiver = activeProposal.receiver_id === currentUser.id;
        const senderCards   = activeProposal.sender_cards   ?? [];
        const receiverCards = activeProposal.receiver_cards ?? [];
        const receiverCardSet = receiverCards.length > 0;

        if (amSender) {
            renderMultiZone('your',   senderCards);
            renderMultiZone('their',  receiverCards);
            if (!receiverCardSet) {
                if (statusEl) statusEl.textContent = '⏳ Waiting for them to add and submit their cards...';
                setProposalButtons('cancel');
            } else if (activeProposal.sender_accepted && !activeProposal.receiver_accepted) {
                if (statusEl) statusEl.textContent = `✅ You've accepted! Waiting for ${tradePartner?.username ?? 'them'} to confirm...`;
                setProposalButtons('waiting');
            } else {
                if (statusEl) statusEl.textContent = '✅ Both cards ready — accept or decline the trade?';
                setProposalButtons('respond');
            }
        } else if (amReceiver) {
            renderMultiZone('their', senderCards);
            if (!receiverCardSet) {
                yourMultiCards = [];
                renderMultiZone('your', yourMultiCards);
                if (statusEl) statusEl.textContent = '📬 Add your cards to the offer, then submit!';
                setProposalButtons('submit');
            } else {
                renderMultiZone('your', receiverCards);
                if (activeProposal.receiver_accepted && !activeProposal.sender_accepted) {
                    if (statusEl) statusEl.textContent = `✅ You've accepted! Waiting for ${tradePartner?.username ?? 'them'} to confirm...`;
                    setProposalButtons('waiting');
                } else {
                    if (statusEl) statusEl.textContent = '✅ Both sets of cards ready — accept or decline?';
                    setProposalButtons('respond');
                }
            }
        }
        return;
    }

    if (activeProposal.status === 'accepted') {
        showTradeSuccess();
        if (!tradeAgreedModalShown) {
            tradeAgreedModalShown = true;
            showTradeAgreedModal(activeProposal.id);
        }
        return;
    }

    const amSender        = activeProposal.sender_id   === currentUser.id;
    const amReceiver      = activeProposal.receiver_id === currentUser.id;
    const receiverCardSet = !!activeProposal.receiver_card_image;
    const senderAccepted  = !!activeProposal.sender_accepted;
    const receiverAccepted = !!activeProposal.receiver_accepted;
    const partnerName     = tradePartner?.username ?? 'them';

    if (amSender) {
        populateZone('your',  activeProposal.sender_card_image,   activeProposal.sender_card_name);
        populateZone('their', activeProposal.receiver_card_image, activeProposal.receiver_card_name);

        if (!receiverCardSet) {
            if (statusEl) statusEl.textContent = '⏳ Waiting for them to select and submit a card...';
            setProposalButtons('cancel');
        } else if (senderAccepted && !receiverAccepted) {
            if (statusEl) statusEl.textContent = `✅ You've accepted! Waiting for ${partnerName} to confirm...`;
            setProposalButtons('waiting');
        } else if (!senderAccepted && receiverAccepted) {
            if (statusEl) statusEl.textContent = `🤝 ${partnerName} has accepted — your turn to accept or decline!`;
            setProposalButtons('respond');
        } else {
            if (statusEl) statusEl.textContent = '✅ Both cards ready — accept or decline the trade?';
            setProposalButtons('respond');
        }

    } else if (amReceiver) {
        populateZone('their', activeProposal.sender_card_image, activeProposal.sender_card_name);

        if (!receiverCardSet) {
            if (statusEl) statusEl.textContent = '📬 Select a card to offer, then submit!';
            setProposalButtons('submit');
        } else {
            populateZone('your', activeProposal.receiver_card_image, activeProposal.receiver_card_name);

            if (receiverAccepted && !senderAccepted) {
                if (statusEl) statusEl.textContent = `✅ You've accepted! Waiting for ${partnerName} to confirm...`;
                setProposalButtons('waiting');
            } else if (!receiverAccepted && senderAccepted) {
                if (statusEl) statusEl.textContent = `🤝 ${partnerName} has accepted — your turn to accept or decline!`;
                setProposalButtons('respond');
            } else {
                if (statusEl) statusEl.textContent = '✅ Both cards ready — accept or decline the trade?';
                setProposalButtons('respond');
            }
        }
    }
}

// ============================================
// SET PROPOSAL BUTTONS
// propose  = no proposal yet, sender picks card
// cancel   = sender waiting for receiver card
// submit   = receiver must pick + submit card
// respond  = both cards set, can accept/decline
// waiting  = you've accepted, waiting for other party
// none     = hide all
// ============================================
function setProposalButtons(mode) {
    const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };
    show('propose-btn',     mode === 'propose');
    show('submit-card-btn', mode === 'submit');
    show('cancel-btn',      mode === 'cancel' || mode === 'waiting');
    show('accept-btn',      mode === 'respond');
    show('decline-btn',     mode === 'submit' || mode === 'respond');
}

// ============================================
// ZONE HELPERS
// ============================================
function populateZone(side, imageUrl, cardName) {
    if (!imageUrl) return;
    const zone = document.getElementById(`${side}-zone`);
    const img  = document.getElementById(`${side}-img`);
    const ph   = zone?.querySelector('.placeholder-text');
    if (img)  { img.src = imageUrl; img.alt = cardName || ''; img.style.display = 'block'; }
    if (ph)     ph.style.display = 'none';
    if (zone) { zone.style.borderStyle = 'solid'; zone.style.borderColor = 'rgba(255,215,0,0.6)'; }
}

function resetZone(side) {
    const zone = document.getElementById(`${side}-zone`);
    const img  = document.getElementById(`${side}-img`);
    const ph   = zone?.querySelector('.placeholder-text');
    if (img)  { img.src = ''; img.style.display = 'none'; }
    if (ph)     ph.style.display = '';
    if (zone) { zone.style.borderStyle = ''; zone.style.borderColor = ''; }
    if (side === 'your') {
        const proposeBtn = document.getElementById('propose-btn');
        const submitBtn  = document.getElementById('submit-card-btn');
        if (proposeBtn) proposeBtn.disabled = true;
        if (submitBtn)  submitBtn.disabled  = true;
    }
}

function fillProposal(side, imageUrl, cardName = '') {
    populateZone(side, imageUrl, cardName);
    if (side === 'your') {
        const removeBtn = document.getElementById('remove-your-card');
        const addBtn    = document.querySelector('.add-trade-card-btn[data-side="your"]');
        if (removeBtn) removeBtn.style.display = '';
        if (addBtn)    addBtn.style.display    = 'none';
        const proposeBtn = document.getElementById('propose-btn');
        const submitBtn  = document.getElementById('submit-card-btn');
        if (proposeBtn && proposeBtn.style.display !== 'none') proposeBtn.disabled = false;
        if (submitBtn  && submitBtn.style.display  !== 'none') submitBtn.disabled  = false;
    }
}

// ============================================
// SUBMIT RECEIVER CARD
// ============================================
async function submitReceiverCard() {
    if (!activeProposal) return;
    if (activeProposal.trade_type === 'multi') { await submitMultiReceiverCards(); return; }
    const yourImg = document.getElementById('your-img');
    if (!yourImg?.src || yourImg.style.display === 'none') {
        showToast('Select a card to offer first.'); return;
    }
    const { error } = await supabase.from('trade_proposals')
        .update({ receiver_card_image: yourImg.src, receiver_card_name: yourImg.alt || '', receiver_card_value: parseFloat(yourImg.dataset?.price) || null })
        .eq('id', activeProposal.id);
    if (error) { showToast('Error submitting card.'); return; }
    activeProposal.receiver_card_image = yourImg.src;
    activeProposal.receiver_card_name  = yourImg.alt || '';
    renderProposal();
    showToast('Card submitted! The sender can now see your offer.');
}

// ============================================
// PROPOSE TRADE
// ============================================
async function proposeTrade() {
    if (tradeType === 'multi') { await proposeMultiTrade(); return; }
    const yourImg = document.getElementById('your-img');
    if (!yourImg?.src || yourImg.style.display === 'none') { showToast('Select a card first.'); return; }
    if (!tradePartner) { showToast('Select a conversation first.'); return; }
    const senderCardValue = parseFloat(yourImg.dataset?.price) || null;
    const { data, error } = await supabase.from('trade_proposals').insert({
        sender_id: currentUser.id, receiver_id: tradePartner.id,
        trade_type: 'single',
        sender_card_image: yourImg.src, sender_card_name: yourImg.alt || '',
        sender_card_value: senderCardValue,
        status: 'pending'
    }).select().single();
    if (error) { showToast('Error sending proposal.'); return; }
    activeProposal = data;
    renderProposal();
    showToast('Trade proposal sent!');
}

// ============================================
// CANCEL PROPOSAL
// ============================================
async function cancelProposal() {
    if (!activeProposal) return;
    await supabase.from('trade_proposals').update({ status: 'cancelled' }).eq('id', activeProposal.id);
    activeProposal = null;
    resetZone('your'); resetZone('their');
    renderProposal(); showToast('Proposal cancelled.');
}

// ============================================
// ACCEPT TRADE — two-step handshake
// Each user sets their own flag. Trade finalises
// only when both sender_accepted AND receiver_accepted
// are true.
// ============================================
async function acceptTrade() {
    if (!activeProposal) return;
    const amSender   = activeProposal.sender_id   === currentUser.id;
    const amReceiver = activeProposal.receiver_id === currentUser.id;

    if (!amSender && !amReceiver) { showToast('Not part of this trade.'); return; }

    // Sender cannot accept until receiver has submitted their card
    if (amSender && !activeProposal.receiver_card_image) {
        showToast('Still waiting for the other trainer to submit their card.');
        return;
    }

    // Build update: set this user's accepted flag
    const acceptField = amSender ? 'sender_accepted' : 'receiver_accepted';
    const updates     = { [acceptField]: true };

    // If receiver is accepting without having pre-submitted via submitReceiverCard(),
    // capture their card from the UI now. Never read your-img for the sender —
    // it holds the sender's card and would overwrite the wrong field.
    if (amReceiver && !activeProposal.receiver_card_image) {
        const yourImg = document.getElementById('your-img');
        if (yourImg?.src && yourImg.style.display !== 'none') {
            updates.receiver_card_image = yourImg.src;
            updates.receiver_card_name  = yourImg.alt || '';
        }
    }

    const { error } = await supabase.from('trade_proposals').update(updates).eq('id', activeProposal.id);
    if (error) { showToast('Error accepting trade.'); return; }

    // Re-fetch fresh from DB — avoids stale local state causing bothAccepted to miss
    const { data: freshProposal } = await supabase
        .from('trade_proposals').select('*')
        .eq('id', activeProposal.id).single();

    if (freshProposal) activeProposal = freshProposal;
    else activeProposal = { ...activeProposal, ...updates };

    const otherUserId  = amSender ? activeProposal.receiver_id : activeProposal.sender_id;
    const myUsername   = currentUserProfile?.username ?? 'Your trade partner';
    const bothAccepted = activeProposal.sender_accepted && activeProposal.receiver_accepted;

    console.log('[Trade] bothAccepted:', bothAccepted,
        '| sender_accepted:', activeProposal.sender_accepted,
        '| receiver_accepted:', activeProposal.receiver_accepted);

    if (bothAccepted) {
        try {
            const tradeUrl        = '/HTML/trade-confirmation.html?trade_id=' + activeProposal.id;
            const partnerUsername = tradePartner?.username ?? 'Your trade partner';
            const convoId         = [currentUser.id, otherUserId].sort().join('_');

            // Mark accepted + set updated_at so poll detects it
            const { error: sErr } = await supabase.from('trade_proposals')
                .update({ status: 'accepted', updated_at: new Date().toISOString() })
                .eq('id', activeProposal.id);
            if (sErr) console.error('[Trade] status error:', sErr);
            else activeProposal.status = 'accepted';

            // Broadcast to the waiting user instantly
            const bc = supabase.channel('trade-agreed-' + convoId);
            bc.send({ type: 'broadcast', event: 'trade_agreed', payload: { proposalId: activeProposal.id } });
            setTimeout(() => supabase.removeChannel(bc), 3000);

            const { error: hErr } = await supabase.from('trade_history').insert({
                proposal_id:         activeProposal.id,
                sender_id:           activeProposal.sender_id,
                receiver_id:         activeProposal.receiver_id,
                sender_card_name:    activeProposal.sender_card_name,
                sender_card_image:   activeProposal.sender_card_image,
                receiver_card_name:  activeProposal.receiver_card_name  ?? null,
                receiver_card_image: activeProposal.receiver_card_image ?? null,
                completed_at:        new Date().toISOString()
            });
            if (hErr) console.error('[Trade] history error:', hErr);

            const markTraded = async (userId, cardName) => {
                if (!cardName) return;
                await supabase.from('trade_listings').update({ status: 'traded' })
                    .eq('user_id', userId).eq('card_name', cardName);
            };
            await Promise.all([
                markTraded(activeProposal.sender_id,   activeProposal.sender_card_name),
                markTraded(activeProposal.receiver_id, activeProposal.receiver_card_name)
            ]);
            await Promise.all([
                supabase.rpc('increment_trade_count', { uid: activeProposal.sender_id }),
                supabase.rpc('increment_trade_count', { uid: activeProposal.receiver_id })
            ]);

            // Show modal for user who accepted second
            tradeAgreedModalShown = true;
            showTradeSuccess();
            showTradeAgreedModal(activeProposal.id);

            // Notifications — split inserts to avoid constraint issues
            const { error: n1Err } = await supabase.from('notifications').insert({
                user_id: otherUserId,  type: 'trade_accepted',
                title:   '🎉 Trade Agreed — Pay Shipping!',
                body:    myUsername + ' has confirmed the trade! Tap here to pay for your shipping label.',
                link:    tradeUrl
            });
            if (n1Err) console.error('[Trade] notif error (other):', n1Err);

            const { error: n2Err } = await supabase.from('notifications').insert({
                user_id: currentUser.id,  type: 'trade_accepted',
                title:   '🎉 Trade Agreed — Pay Shipping!',
                body:    'Your trade with ' + partnerUsername + ' is confirmed! Tap here to pay for your shipping label.',
                link:    tradeUrl
            });
            if (n2Err) console.error('[Trade] notif error (self):', n2Err);

            await renderTradeListings();

        } catch (err) {
            console.error('[Trade] bothAccepted error:', err);
            showTradeAgreedModal(activeProposal.id);
        }

    } else {
        // ── Only one party has accepted — notify the other ────────
        await supabase.from('notifications').insert({
            user_id: otherUserId,
            type:    'trade_awaiting',
            title:   'Trade Accepted — Your Turn!',
            body:    `${myUsername} has accepted the trade. Open the trade page to confirm or decline.`,
            link:    `/HTML/trades.html?user=${currentUserProfile?.username ?? ''}`
        });

        showToast('✅ You\'ve accepted! Waiting for the other trainer to confirm...');
        renderProposal();
    }
}

// ============================================
// DECLINE TRADE — works for both sender and receiver
// ============================================
async function declineTrade() {
    if (!activeProposal) return;
    const amSender = activeProposal.sender_id === currentUser.id;

    const { error } = await supabase.from('trade_proposals')
        .update({ status: 'declined' }).eq('id', activeProposal.id);
    if (error) { showToast('Error declining.'); return; }

    // Notify the other party with the correct username
    const otherUserId = amSender ? activeProposal.receiver_id : activeProposal.sender_id;
    const myUsername  = currentUserProfile?.username ?? 'Your trade partner';

    await supabase.from('notifications').insert({
        user_id: otherUserId,
        type:    'trade_declined',
        title:   'Trade Proposal Declined',
        body:    `${myUsername} declined the trade offer.`,
        link:    `/HTML/trades.html?user=${currentUserProfile?.username ?? ''}`
    });

    activeProposal = null;
    resetZone('your'); resetZone('their');
    renderProposal();
    showToast('Trade declined.');
}

// ============================================
// TRADE AGREED MODAL
// Shown to both users when both have accepted.
// Fires for the accepting user immediately, and
// for the waiting user via the proposal poll.
// ============================================
function showTradeAgreedModal(proposalId) {
    console.log('[Trade] showTradeAgreedModal fired');
    document.getElementById('tradeAgreedModal')?.remove();

    const partnerName = tradePartner?.username ?? 'your trading partner';
    const confirmUrl  = '/HTML/trade-confirmation.html?trade_id=' + proposalId;

    const backdrop = document.createElement('div');
    backdrop.id        = 'tradeAgreedModal';
    backdrop.className = 'trade-agreed-backdrop';

    const card = document.createElement('div');
    card.className = 'trade-agreed-card';

    const closeBtn = document.createElement('button');
    closeBtn.className   = 'trade-agreed-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close');

    const icon = document.createElement('div');
    icon.className   = 'trade-agreed-icon';
    icon.textContent = '🎉';

    const title = document.createElement('h2');
    title.className   = 'trade-agreed-title';
    title.textContent = 'TRADE AGREED!';

    const subtitle = document.createElement('p');
    subtitle.className = 'trade-agreed-subtitle';
    subtitle.innerHTML = 'Both you and <strong>' + partnerName + '</strong> have confirmed the trade.<br>Pay for your shipping label to complete the swap.';

    const info = document.createElement('div');
    info.className   = 'trade-agreed-info';
    info.textContent = '📦 Both traders pay shipping separately. Once paid, a prepaid label is emailed to each of you.';

    const cta = document.createElement('a');
    cta.className   = 'trade-agreed-cta';
    cta.href        = confirmUrl;
    cta.textContent = 'Pay for Shipping Label →';

    const dismissBtn = document.createElement('button');
    dismissBtn.className   = 'trade-agreed-dismiss';
    dismissBtn.textContent = "Dismiss — I'll do this later";

    card.appendChild(closeBtn);
    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(info);
    card.appendChild(cta);
    card.appendChild(dismissBtn);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    closeBtn.addEventListener('click', close);
    dismissBtn.addEventListener('click', close);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
}

// ============================================
// SHOW TRADE SUCCESS
// ============================================
function showTradeSuccess() {
    const statusEl = document.getElementById('proposal-status');
    if (statusEl) statusEl.textContent = '';
    setProposalButtons('none');

    const amSender = activeProposal.sender_id === currentUser.id;

    const myCardImg     = amSender ? activeProposal.sender_card_image   : activeProposal.receiver_card_image;
    const myCardName    = amSender ? activeProposal.sender_card_name    : activeProposal.receiver_card_name;
    const theirCardImg  = amSender ? activeProposal.receiver_card_image : activeProposal.sender_card_image;
    const theirCardName = amSender ? activeProposal.receiver_card_name  : activeProposal.sender_card_name;

    if (myCardImg)    populateZone('your',  myCardImg,    myCardName);
    if (theirCardImg) populateZone('their', theirCardImg, theirCardName);

    const glassPanel = document.querySelector('.proposal-section');
    if (!glassPanel || document.getElementById('trade-success-banner')) return;

    const reviewedId       = amSender ? activeProposal.receiver_id : activeProposal.sender_id;
    const reviewedUsername = tradePartner?.username ?? 'Trainer';
    const proposalId       = activeProposal.id;

    const banner = document.createElement('div');
    banner.id = 'trade-success-banner';
    banner.innerHTML = `
        <div style="text-align:center; padding:12px 0 20px;">
            <div style="font-size:36px; margin-bottom:6px;">🎉</div>
            <h3 style="color:#ffd700; margin:0 0 6px; font-family:'Cinzel',serif; letter-spacing:1px;">TRADE AGREED!</h3>
            <p style="color:rgba(255,255,255,0.6); font-size:13px; margin:0 0 10px;">
                Arrange the card swap with <strong style="color:#ffd700;">${reviewedUsername}</strong>.
            </p>
            <div style="background:rgba(255,215,0,0.07); border:1px solid rgba(255,215,0,0.2); border-radius:10px;
                        padding:10px 14px; margin:0 0 16px; font-size:12px; color:rgba(255,255,255,0.5); text-align:left;">
                📬 <strong style="color:rgba(255,215,0,0.7);">Send your card promptly.</strong>
                Dexoria relies on good faith between traders. Repeated failure to honour a trade
                may result in account suspension. If something goes wrong, use the report button below.
            </div>
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                <button id="leave-review-btn"
                    style="background:rgba(255,215,0,0.15); border:1px solid rgba(255,215,0,0.4); color:#ffd700;
                           padding:7px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600;">
                    ⭐ Leave a Review
                </button>
                <button id="report-trader-btn"
                    style="background:rgba(255,60,60,0.1); border:1px solid rgba(255,60,60,0.3); color:#ff6b6b;
                           padding:7px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600;">
                    🚩 Report Trader
                </button>
                <button id="clear-trade-btn"
                    style="background:transparent; border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.4);
                           padding:7px 16px; border-radius:8px; cursor:pointer; font-size:12px;">
                    ✕ Dismiss
                </button>
            </div>
        </div>
    `;

    const tradeGrid = glassPanel.querySelector('.trade-grid');
    glassPanel.insertBefore(banner, tradeGrid);

    document.getElementById('leave-review-btn')
        ?.addEventListener('click', () => openReviewModal(proposalId, reviewedId, reviewedUsername));
    document.getElementById('report-trader-btn')
        ?.addEventListener('click', () => openReportModal(proposalId, reviewedId, reviewedUsername));
    document.getElementById('clear-trade-btn')
        ?.addEventListener('click', () => {
            banner.remove();
            activeProposal = null;
            resetZone('your'); resetZone('their');
            const removeBtn = document.getElementById('remove-your-card');
            const addBtn    = document.querySelector('.add-trade-card-btn[data-side="your"]');
            if (removeBtn) removeBtn.style.display = 'none';
            if (addBtn)    addBtn.style.display    = '';
            renderProposal();
        });
}

// ============================================
// REVIEW MODAL
// ============================================
function openReviewModal(proposalId, reviewedId, reviewedUsername) {
    document.getElementById('reviewModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'reviewModal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.82); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(6px);';
    modal.innerHTML = `
        <div style="background:#2d1b2d; border:1px solid #ffd700; border-radius:20px; padding:32px;
                    width:90%; max-width:420px; position:relative;">
            <button id="closeReviewModal"
                style="position:absolute; top:14px; right:16px; background:none; border:none;
                       color:#ffd700; font-size:20px; cursor:pointer;">✕</button>
            <h3 style="color:#ffd700; margin:0 0 6px; font-family:'Cinzel',serif; font-size:16px; letter-spacing:1px;">
                RATE YOUR TRADE
            </h3>
            <p style="color:rgba(255,255,255,0.5); font-size:13px; margin:0 0 20px;">
                How was your trade with <strong style="color:#ffd700;">${reviewedUsername}</strong>?
            </p>
            <div id="star-rating"
                style="display:flex; gap:10px; justify-content:center; margin-bottom:8px; font-size:36px; cursor:pointer;">
                ${[1,2,3,4,5].map(i =>
                    `<span class="star" data-value="${i}"
                           style="color:rgba(255,215,0,0.2); transition:color 0.12s; user-select:none;">★</span>`
                ).join('')}
            </div>
            <div id="star-label"
                style="text-align:center; color:rgba(255,215,0,0.6); font-size:12px; margin-bottom:18px; min-height:16px; letter-spacing:1px;"></div>
            <textarea id="review-comment" placeholder="Leave a comment (optional)..."
                style="width:100%; padding:12px; border-radius:10px; border:1px solid rgba(255,215,0,0.25);
                       background:#1a0f1a; color:white; font-size:13px; resize:none; height:80px;
                       box-sizing:border-box; outline:none; font-family:inherit;"></textarea>
            <button id="submitReviewBtn"
                style="width:100%; margin-top:14px; background:#ffd700; color:#1a0f1a; border:none;
                       border-radius:50px; padding:12px; font-weight:800; font-size:14px; cursor:pointer;
                       letter-spacing:1px; font-family:'Cinzel',serif;">
                SUBMIT REVIEW
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    let selectedRating = 0;
    const stars  = modal.querySelectorAll('.star');
    const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];

    const highlight = val => {
        stars.forEach(s => {
            s.style.color = parseInt(s.dataset.value) <= val ? '#ffd700' : 'rgba(255,215,0,0.2)';
        });
        document.getElementById('star-label').textContent = labels[val] ?? '';
    };

    stars.forEach(star => {
        star.addEventListener('mouseenter', () => highlight(parseInt(star.dataset.value)));
        star.addEventListener('mouseleave', () => highlight(selectedRating));
        star.addEventListener('click', () => { selectedRating = parseInt(star.dataset.value); highlight(selectedRating); });
    });

    document.getElementById('closeReviewModal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('submitReviewBtn')?.addEventListener('click', async () => {
        if (!selectedRating) { showToast('Please select a star rating.'); return; }
        const comment = document.getElementById('review-comment')?.value.trim() || null;
        await submitReview(proposalId, reviewedId, selectedRating, comment, modal);
    });
}

async function submitReview(proposalId, reviewedId, rating, comment, modal) {
    const btn = document.getElementById('submitReviewBtn');
    if (btn) btn.disabled = true;

    const { error } = await supabase.from('trade_reviews').insert({
        reviewer_id: currentUser.id,
        reviewed_id: reviewedId,
        proposal_id: proposalId,
        rating,
        comment: comment ?? null
    });

    if (error) {
        showToast(error.code === '23505' ? "You've already reviewed this trade." : 'Error submitting review.');
        console.error(error);
        if (btn) btn.disabled = false;
        return;
    }

    modal?.remove();
    showToast('⭐ Review submitted — thanks!');
}

// ============================================
// REPORT MODAL
// ============================================
function openReportModal(proposalId, reportedId, reportedUsername) {
    document.getElementById('reportModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'reportModal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.82); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(6px);';
    modal.innerHTML = `
        <div style="background:#2d1b2d; border:1px solid #ff6b6b; border-radius:20px; padding:32px;
                    width:90%; max-width:420px; position:relative;">
            <button id="closeReportModal"
                style="position:absolute; top:14px; right:16px; background:none; border:none;
                       color:#ff6b6b; font-size:20px; cursor:pointer;">✕</button>
            <h3 style="color:#ff6b6b; margin:0 0 6px; font-family:'Cinzel',serif; font-size:16px; letter-spacing:1px;">
                REPORT TRADER
            </h3>
            <p style="color:rgba(255,255,255,0.5); font-size:13px; margin:0 0 20px;">
                Reporting <strong style="color:#ff6b6b;">${reportedUsername}</strong>.
                This will be reviewed by the Dexoria admin team.
            </p>
            <label style="color:rgba(255,255,255,0.55); font-size:12px; display:block; margin-bottom:6px; letter-spacing:0.5px;">
                REASON
            </label>
            <select id="report-reason"
                style="width:100%; padding:10px 14px; border-radius:10px; border:1px solid rgba(255,107,107,0.3);
                       background:#1a0f1a; color:white; font-size:13px; box-sizing:border-box; margin-bottom:14px; outline:none;">
                <option value="">Select a reason...</option>
                <option value="did_not_send">Did not send card after trade was accepted</option>
                <option value="wrong_card">Sent the wrong card</option>
                <option value="damaged_card">Card arrived damaged</option>
                <option value="abusive">Abusive or threatening behaviour</option>
                <option value="other">Other</option>
            </select>
            <label style="color:rgba(255,255,255,0.55); font-size:12px; display:block; margin-bottom:6px; letter-spacing:0.5px;">
                ADDITIONAL DETAILS
            </label>
            <textarea id="report-details" placeholder="Please describe what happened..."
                style="width:100%; padding:12px; border-radius:10px; border:1px solid rgba(255,107,107,0.3);
                       background:#1a0f1a; color:white; font-size:13px; resize:none; height:90px;
                       box-sizing:border-box; outline:none; font-family:inherit;"></textarea>
            <button id="submitReportBtn"
                style="width:100%; margin-top:14px; background:#ff6b6b; color:white; border:none;
                       border-radius:50px; padding:12px; font-weight:800; font-size:14px; cursor:pointer;
                       letter-spacing:1px; font-family:'Cinzel',serif;">
                SUBMIT REPORT
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeReportModal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('submitReportBtn')?.addEventListener('click', async () => {
        const reason  = document.getElementById('report-reason')?.value;
        const details = document.getElementById('report-details')?.value.trim() || null;
        if (!reason) { showToast('Please select a reason.'); return; }
        await submitReport(proposalId, reportedId, reportedUsername, reason, details, modal);
    });
}

async function submitReport(proposalId, reportedId, reportedUsername, reason, details, modal) {
    const btn = document.getElementById('submitReportBtn');
    if (btn) btn.disabled = true;

    const reasonLabels = {
        did_not_send: 'Did not send card after trade was accepted',
        wrong_card:   'Sent the wrong card',
        damaged_card: 'Card arrived damaged',
        abusive:      'Abusive or threatening behaviour',
        other:        'Other'
    };

    // Keep a record in Supabase
    await supabase.from('reports').insert({
        reporter_id: currentUser.id,
        reported_id: reportedId,
        proposal_id: proposalId,
        reason,
        details: details ?? null
    });

    // Send email to admin via EmailJS
    try {
        await emailjs.send(
            'service_fko9f4n',
            'template_g23bscd',
            {
                reported_username: reportedUsername,
                reporter_username: currentUserProfile?.username ?? 'Unknown',
                reason:            reasonLabels[reason] ?? reason,
                details:           details || 'No additional details provided.',
                proposal_id:       proposalId,
                time:              new Date().toLocaleString('en-GB')
            },
            { publicKey: '6-iJbNQLnFG07npGw' }
        );
    } catch (emailErr) {
        console.error('EmailJS error:', emailErr);
        // Don't block the user — report is already saved to Supabase
    }

    modal?.remove();
    if (btn) btn.disabled = false;
    showToast('🚩 Report submitted. The admin team will review this shortly.');
}

// ============================================
// TRADE LISTINGS — RENDER
// ============================================
async function renderTradeListings() {
    const container = document.getElementById('trade-listings-grid');
    if (!container) return;
    container.innerHTML = '';

    if (currentUser) {
        const addTile = document.createElement('div');
        addTile.className = 'trading-row trading-row--add';
        addTile.innerHTML = `<div class="add-card-icon">+</div><div class="add-card-label">Add Card to Trade List</div>`;
        addTile.addEventListener('click', () => openTradeModal('listing'));
        container.appendChild(addTile);
    }

    const { data: listings, error } = await supabase
        .from('trade_listings').select('*')
        .eq('user_id', currentUser?.id)
        .order('created_at', { ascending: false });

    if (error || !listings || listings.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'collection-empty';
        empty.textContent = 'No cards listed for trade yet.';
        container.appendChild(empty);
        return;
    }

    listings.forEach(listing => {
        const row = document.createElement('div');
        row.className = 'trading-row';
        row.innerHTML = `
            <div class="card-image"><img src="${listing.card_image || ''}" alt="${listing.card_name || ''}"></div>
            <div class="card-info">
                <h3>${listing.card_name || 'Unknown Card'}</h3>
                <p class="rarity">${listing.rarity || ''} • ${listing.card_set || ''}</p>
                <span class="status-tag" data-status="${listing.status || 'available'}">${listing.status || 'Available'}</span>
            </div>
            <button class="remove-listing-btn" title="Remove">✕</button>
        `;
        row.addEventListener('click', e => {
            if (e.target.classList.contains('remove-listing-btn')) return;
            fillProposal('your', listing.card_image, listing.card_name);
        });
        row.querySelector('.remove-listing-btn').addEventListener('click', () => removeListing(listing.id));
        container.appendChild(row);
    });
}

async function removeListing(listingId) {
    await supabase.from('trade_listings').delete().eq('id', listingId);
    showToast('Card removed.'); await renderTradeListings();
}

// ============================================
// MODAL
// ============================================
function openTradeModal(mode, side = null) {
    tradeModalMode = mode; activeProposalSide = side;
    const modal = document.getElementById('tradeCardModal');
    if (!modal) return;
    document.getElementById('tradeModalTitle').textContent       = mode === 'listing' ? 'Add a Card to Your Trade List' : 'Select a Card for Your Proposal';
    document.getElementById('tradeCardNameInput').value          = '';
    document.getElementById('tradeCardSearchStatus').textContent = '';
    document.getElementById('tradeCardSearchResults').innerHTML  = '';
    modal.style.display = 'flex';
    loadTradeSets();
    document.getElementById('tradeCardNameInput').focus();
}

function closeTradeModal() {
    document.getElementById('tradeCardModal').style.display = 'none';
}

async function loadTradeSets() {
    if (tradeSetsLoaded) return;
    try {
        const sets = await fetch(`${TCGDEX}/sets`).then(r => r.json());
        const select = document.getElementById('tradeCardSetSelect');

        // Dexoria sets always appear first — update this list as new sets are added
        const DEXORIA_SETS = ['me01', 'me02', 'me02.5', 'me03', 'me04', 'me05'];

        const dexoriaSets  = DEXORIA_SETS.map(id => sets.find(s => s.id === id)).filter(Boolean);
        const standardSets = sets
            .filter(s => !DEXORIA_SETS.includes(s.id))
            .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));

        // Dexoria group
        if (dexoriaSets.length) {
            const group = document.createElement('optgroup');
            group.label = '— Dexoria Sets —';
            dexoriaSets.forEach(s => {
                const o = document.createElement('option');
                o.value = s.id; o.textContent = s.name;
                group.appendChild(o);
            });
            select.appendChild(group);
        }

        // Standard sets group
        const stdGroup = document.createElement('optgroup');
        stdGroup.label = '— Standard Sets —';
        standardSets.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id; o.textContent = s.name;
            stdGroup.appendChild(o);
        });
        select.appendChild(stdGroup);

        tradeSetsLoaded = true;
    } catch (e) { console.warn('Sets load failed:', e); }
}

async function tradeSearchCards() {
    const name      = document.getElementById('tradeCardNameInput')?.value.trim();
    const setId     = document.getElementById('tradeCardSetSelect')?.value;
    const statusEl  = document.getElementById('tradeCardSearchStatus');
    const resultsEl = document.getElementById('tradeCardSearchResults');
    const btn       = document.getElementById('tradeCardSearchBtn');

    if (!name && !setId) { if (statusEl) statusEl.textContent = 'Enter a name or choose a set.'; return; }
    if (statusEl) statusEl.textContent = 'Searching...';
    resultsEl.innerHTML = ''; btn.disabled = true;

    try {
        let cards = [];
        if (setId) {
            const data = await fetch(`${TCGDEX}/sets/${setId}`).then(r => r.json());
            cards = (data.cards ?? []).map(c => ({ id: `${setId}-${c.localId}`, name: c.name, image: c.image ? `${c.image}/high.png` : null, set: data.name, rarity: c.rarity ?? null }));
            if (name) cards = cards.filter(c => c.name.toLowerCase().includes(name.toLowerCase()));
        } else {
            const data = await fetch(`${TCGDEX}/cards`).then(r => r.json());
            cards = data.filter(c => c.name?.toLowerCase().includes(name.toLowerCase())).map(c => ({ ...c, image: c.image ? `${c.image}/high.png` : null }));
        }
        cards = cards.filter(c => c.image).slice(0, 60);
        if (!cards.length) { statusEl.textContent = 'No cards found.'; btn.disabled = false; return; }
        statusEl.textContent = `${cards.length} card${cards.length !== 1 ? 's' : ''} found`;

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
            label.style.cssText = 'font-size:11px; color:rgba(255,215,0,0.6); display:block; margin-top:4px;';
            item.appendChild(img); item.appendChild(label);
            item.addEventListener('click', () => tradeSelectCard(card));
            resultsEl.appendChild(item);
        });
    } catch (err) { statusEl.textContent = 'Search failed.'; console.error(err); }
    btn.disabled = false;
}

async function tradeSelectCard(card) {
    // Snapshot values immediately to prevent drift during async work
    const cardId     = card.id     ?? null;
    const cardName   = card.name   ?? '';
    const cardSet    = card.set    ?? null;
    const cardImage  = card.image  ?? null;
    const cardRarity = card.rarity ?? null;

    closeTradeModal();

    // Use TCGDex URL directly — bypasses resolveCardImage which can return
    // stale cache hits when card metadata is incomplete (name-only searches)
    const imageUrl = cardImage ?? '';

    if (tradeModalMode === 'listing') {
        if (!currentUser) { showToast('Please log in.'); return; }
        const { error } = await supabase.from('trade_listings').insert({
            user_id: currentUser.id, card_id: cardId, card_name: cardName,
            card_image: imageUrl, card_set: cardSet, rarity: cardRarity, status: 'available'
        });
        if (error) { showToast('Error adding card.'); return; }
        showToast(`${cardName} added!`); await renderTradeListings();
    } else if (tradeModalMode === 'multi') {
        if (!yourMultiCards.find(c => c.image === imageUrl)) {
            yourMultiCards.push({ image: imageUrl, name: cardName });
            renderMultiZone('your', yourMultiCards);
            updateMultiProposeBtn();
        } else {
            showToast('That card is already in your offer.');
        }
    } else {
        // Fetch live market price from TCGDex (included in every card response)
        let cardPrice = null;
        if (cardId) {
            try {
                const res  = await fetch(`https://api.tcgdex.net/v2/en/cards/${cardId}`);
                if (res.ok) {
                    const cd = await res.json();
                    // CardMarket trend (EUR) first, TCGPlayer market price (USD) as fallback
                    cardPrice = cd.pricing?.cardmarket?.trend
                             ?? cd.pricing?.tcgplayer?.normal?.marketPrice
                             ?? null;
                    if (cardPrice) console.log(`[Price] ${cardName}: ${cardPrice}`);
                }
            } catch (e) { console.warn('[Price] lookup failed:', e); }
        }
        const yourImg = document.getElementById('your-img');
        if (yourImg) yourImg.dataset.price = cardPrice != null ? cardPrice : '';
        fillProposal(activeProposalSide, imageUrl, cardName);
    }
}

// ============================================
// TRADE TYPE TOGGLE
// ============================================
function initTradeTypeToggle() {
    const singleBtn = document.getElementById('tradeTypeSingle');
    const multiBtn  = document.getElementById('tradeTypeMulti');
    if (!singleBtn || !multiBtn) return;

    singleBtn.addEventListener('click', () => {
        if (activeProposal) { showToast('Cannot change trade type during an active proposal.'); return; }
        tradeType = 'single';
        singleBtn.classList.add('active');
        multiBtn.classList.remove('active');
        document.getElementById('singleTradePanel').style.display = '';
        document.getElementById('multiTradePanel').style.display  = 'none';
    });

    multiBtn.addEventListener('click', () => {
        if (activeProposal) { showToast('Cannot change trade type during an active proposal.'); return; }
        tradeType = 'multi';
        multiBtn.classList.add('active');
        singleBtn.classList.remove('active');
        document.getElementById('singleTradePanel').style.display = 'none';
        document.getElementById('multiTradePanel').style.display  = '';
    });
}

// ============================================
// MULTI-CARD ZONE RENDERING
// ============================================
function renderMultiZone(side, cards) {
    const zone      = document.getElementById(`${side}-multi-zone`);
    const countEl   = document.getElementById(`${side === 'your' ? 'your' : 'their'}CardCount`);
    if (!zone) return;

    if (countEl) countEl.textContent = `(${cards.length})`;

    if (cards.length === 0) {
        zone.innerHTML = `<span class="placeholder-text">${side === 'your' ? 'Add cards to your offer...' : 'Waiting for their cards...'}</span>`;
        return;
    }

    zone.innerHTML = cards.map((card, idx) => `
        <div class="multi-card-item">
            <img src="${card.image}" alt="${card.name}" class="multi-card-img" />
            <span class="multi-card-name">${card.name}</span>
            ${side === 'your' && !activeProposal ? `
                <button class="multi-card-remove" data-idx="${idx}" title="Remove">✕</button>
            ` : ''}
        </div>
    `).join('');

    if (side === 'your' && !activeProposal) {
        zone.querySelectorAll('.multi-card-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                yourMultiCards.splice(idx, 1);
                renderMultiZone('your', yourMultiCards);
                updateMultiProposeBtn();
            });
        });
    }
}

function updateMultiProposeBtn() {
    const proposeBtn = document.getElementById('propose-btn');
    const submitBtn  = document.getElementById('submit-card-btn');
    const hasCards   = yourMultiCards.length > 0;
    if (proposeBtn && proposeBtn.style.display !== 'none') proposeBtn.disabled = !hasCards;
    if (submitBtn  && submitBtn.style.display  !== 'none') submitBtn.disabled  = !hasCards;
}

// ============================================
// PROPOSE MULTI TRADE
// ============================================
async function proposeMultiTrade() {
    if (yourMultiCards.length === 0) { showToast('Add at least one card to your offer.'); return; }
    if (!tradePartner) { showToast('Select a conversation first.'); return; }

    const { data, error } = await supabase.from('trade_proposals').insert({
        sender_id:    currentUser.id,
        receiver_id:  tradePartner.id,
        trade_type:   'multi',
        sender_cards: yourMultiCards,
        receiver_cards: [],
        sender_card_image: yourMultiCards[0]?.image ?? '',
        sender_card_name:  `${yourMultiCards.length} cards`,
        status: 'pending'
    }).select().single();

    if (error) { showToast('Error sending proposal.'); return; }
    activeProposal = data;
    theirMultiCards = [];
    renderProposal();
    showToast('Multi-card trade proposal sent!');
}

// ============================================
// SUBMIT MULTI RECEIVER CARDS
// ============================================
async function submitMultiReceiverCards() {
    if (!activeProposal) return;
    if (yourMultiCards.length === 0) { showToast('Add at least one card to offer.'); return; }

    const { error } = await supabase.from('trade_proposals')
        .update({
            receiver_cards:      yourMultiCards,
            receiver_card_image: yourMultiCards[0]?.image ?? '',
            receiver_card_name:  `${yourMultiCards.length} cards`,
        })
        .eq('id', activeProposal.id);

    if (error) { showToast('Error submitting cards.'); return; }
    activeProposal.receiver_cards      = yourMultiCards;
    activeProposal.receiver_card_image = yourMultiCards[0]?.image ?? '';
    renderProposal();
    showToast('Cards submitted!');
}

// ============================================
// WIRE BUTTONS
// ============================================
function wireButtons() {
    document.getElementById('propose-btn')    ?.addEventListener('click', proposeTrade);
    document.getElementById('submit-card-btn')?.addEventListener('click', submitReceiverCard);
    document.getElementById('cancel-btn')     ?.addEventListener('click', cancelProposal);
    document.getElementById('accept-btn')     ?.addEventListener('click', acceptTrade);
    document.getElementById('decline-btn')    ?.addEventListener('click', declineTrade);

    document.getElementById('new-conversation-btn')
        ?.addEventListener('click', openNewConversationModal);
    document.getElementById('closeNewConversation')
        ?.addEventListener('click', () => { document.getElementById('newConversationModal').style.display = 'none'; });
    document.getElementById('newConvSearchInput')
        ?.addEventListener('input', e => searchTrainers(e.target.value));

    document.getElementById('send-btn')
        ?.addEventListener('click', sendMessage);
    document.getElementById('chat-input')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

    document.querySelectorAll('.add-trade-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.side === 'multi') {
                openTradeModal('multi', 'your');
            } else {
                openTradeModal('proposal', btn.dataset.side);
            }
        });
    });

    initTradeTypeToggle();

    document.getElementById('remove-your-card')
        ?.addEventListener('click', () => {
            resetZone('your');
            document.getElementById('remove-your-card').style.display = 'none';
            document.querySelector('.add-trade-card-btn[data-side="your"]').style.display = '';
        });

    document.getElementById('tradeCardSearchBtn')
        ?.addEventListener('click', tradeSearchCards);
    document.getElementById('tradeCardNameInput')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') tradeSearchCards(); });
    document.getElementById('closeTradeCardModal')
        ?.addEventListener('click', closeTradeModal);
    document.getElementById('tradeCardModal')
        ?.addEventListener('click', e => { if (e.target === document.getElementById('tradeCardModal')) closeTradeModal(); });
}