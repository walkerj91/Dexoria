// admin-orders.js
import { supabase } from './supabaseClient.js';

const FUNCTION_URL = 'https://uygnyhljorjpmwlnbkyp.supabase.co/functions/v1/admin-add-singles-index';

const authGate = document.getElementById('orders-auth-gate');
const toolbar = document.getElementById('orders-toolbar');
const filterSelect = document.getElementById('orders-filter');
const ordersList = document.getElementById('orders-list');
const ordersEmpty = document.getElementById('orders-empty');

let allOrders = [];

init();

async function init() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData?.session) {
    authGate.hidden = false;
    return;
  }

  toolbar.hidden = false;
  filterSelect.addEventListener('change', render);

  await loadOrders();
  render();
}

async function callAdminFunction(body) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Request failed');
  return result;
}

async function loadOrders() {
  try {
    const result = await callAdminFunction({ action: 'list_orders' });
    allOrders = result.orders || [];
  } catch (err) {
    console.error('Failed to load orders:', err);
    allOrders = [];
  }
}

function render() {
  const filter = filterSelect.value;

  const filtered = filter === 'all'
    ? allOrders
    : allOrders.filter((order) => order.status === filter);

  ordersList.innerHTML = '';

  if (filtered.length === 0) {
    ordersEmpty.hidden = false;
    return;
  }
  ordersEmpty.hidden = true;

  for (const order of filtered) {
    ordersList.appendChild(buildOrderCard(order));
  }
}

function buildOrderCard(order) {
  const el = document.createElement('div');
  el.className = 'order-card' + (order.status === 'fulfilled' ? ' order-card-fulfilled' : '');

  const date = new Date(order.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const address = order.shipping_address;
  const addressHtml = address
    ? `<p class="order-shipping-address">
        ${escapeHtml(address.line1 || '')}${address.line2 ? '<br>' + escapeHtml(address.line2) : ''}<br>
        ${escapeHtml(address.city || '')}${address.state ? ', ' + escapeHtml(address.state) : ''}<br>
        ${escapeHtml(address.postal_code || '')}<br>
        ${escapeHtml(address.country || '')}
      </p>`
    : `<p class="order-shipping-missing">No shipping address on file for this order.</p>`;

  const itemsHtml = (order.items || []).map((item) => `
    <div class="order-item-row">
      <img class="order-item-img" src="${item.card?.image_url || ''}" alt="" loading="lazy" />
      <span class="order-item-name">${escapeHtml(item.card?.card_name || 'Unknown card')}${item.card?.variant && item.card.variant !== 'normal' ? ` (${item.card.variant === 'holo' ? 'Holo' : 'Reverse Holo'})` : ''}</span>
      <span class="order-item-qty">x${item.quantity}</span>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="order-header">
      <div>
        <p class="order-id">Order ${order.id.slice(0, 8)}</p>
        <p class="order-date">${date}</p>
      </div>
      <span class="order-status order-status-${order.status}">${order.status}</span>
    </div>

    <div class="order-shipping">
      <p class="order-section-label">Ship to</p>
      ${order.shipping_name ? `<p class="order-shipping-name">${escapeHtml(order.shipping_name)}</p>` : ''}
      ${addressHtml}
    </div>

    <div class="order-items">
      <p class="order-section-label">Items</p>
      ${itemsHtml}
    </div>

    <p class="order-total">Total: £${(order.total_cents / 100).toFixed(2)}</p>

    ${order.status === 'paid' ? `<button class="dex-btn order-fulfill-btn">Mark Fulfilled</button>` : ''}
  `;

  const fulfillBtn = el.querySelector('.order-fulfill-btn');
  if (fulfillBtn) {
    fulfillBtn.addEventListener('click', async () => {
      fulfillBtn.disabled = true;
      fulfillBtn.textContent = 'Saving…';
      try {
        await callAdminFunction({ action: 'mark_fulfilled', id: order.id });
        await loadOrders();
        render();
      } catch (err) {
        alert(err.message || 'Could not update this order.');
        fulfillBtn.disabled = false;
        fulfillBtn.textContent = 'Mark Fulfilled';
      }
    });
  }

  return el;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
