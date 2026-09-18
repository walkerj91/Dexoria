// singles.js
import { supabase } from './supabaseClient.js';

const VARIANT_NAMES = { normal: '', holo: 'Holo', reverse: 'Reverse Holo' };

let allSingles = [];

const grid = document.getElementById('singles-grid');
const emptyMsg = document.getElementById('singles-empty');
const searchInput = document.getElementById('singles-search');
const sortSelect = document.getElementById('singles-sort');

init();

async function init() {
  await loadSingles();
  render();

  searchInput.addEventListener('input', render);
  sortSelect.addEventListener('change', render);
}

async function loadSingles() {
  // Sold-out cards (quantity_available = 0) stay listed as "Sold Out" rather
  // than disappearing — only is_active=false (manually pulled from sale) hides them.
  const { data, error } = await supabase
    .from('card_singles')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load singles:', error);
    allSingles = [];
    return;
  }

  allSingles = data || [];
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const sort = sortSelect.value;

  let filtered = allSingles.filter((s) =>
    s.card_name.toLowerCase().includes(query) ||
    s.set_name.toLowerCase().includes(query)
  );

  filtered = sortSingles(filtered, sort);

  grid.innerHTML = '';

  if (filtered.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  for (const single of filtered) {
    grid.appendChild(buildCard(single));
  }
}

function sortSingles(list, sort) {
  const copy = [...list];
  let sorted;
  switch (sort) {
    case 'price-asc':
      sorted = copy.sort((a, b) => a.price_cents - b.price_cents);
      break;
    case 'price-desc':
      sorted = copy.sort((a, b) => b.price_cents - a.price_cents);
      break;
    case 'name':
      sorted = copy.sort((a, b) => a.card_name.localeCompare(b.card_name));
      break;
    case 'newest':
    default:
      sorted = copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // Sold-out cards sink to the bottom regardless of sort choice
  return sorted.sort((a, b) => {
    const aSoldOut = a.quantity_available <= 0;
    const bSoldOut = b.quantity_available <= 0;
    return aSoldOut === bSoldOut ? 0 : aSoldOut ? 1 : -1;
  });
}

function buildCard(single) {
  const el = document.createElement('div');
  const soldOut = single.quantity_available <= 0;
  el.className = 'dex-card' + (soldOut ? ' singles-sold-out' : '');

  const priceLabel = formatPrice(single.price_cents);
  const stockLabel = soldOut ? 'Sold Out' : `${single.quantity_available} left`;
  const variantLabel = VARIANT_NAMES[single.variant] || '';
  const cartName = variantLabel ? `${single.card_name} (${variantLabel})` : single.card_name;

  el.innerHTML = `
    <div class="dex-img-wrap">
      <img src="${single.image_url || ''}" alt="${escapeHtml(single.card_name)}" loading="lazy" />
      ${soldOut ? '<span class="singles-sold-out-badge">Sold Out</span>' : ''}
    </div>
    <p class="singles-card-name">${escapeHtml(single.card_name)}</p>
    <p class="singles-card-set">${escapeHtml(single.set_name)}${single.card_number ? ' · #' + escapeHtml(single.card_number) : ''}${variantLabel ? ' · ' + escapeHtml(variantLabel) : ''}</p>
    <div class="dex-row">
      <span class="dex-price">${priceLabel}</span>
      <span class="singles-stock${soldOut ? ' singles-stock-sold-out' : ''}">${stockLabel}</span>
    </div>
    <div class="dex-row">
      <button class="dex-btn singles-add-btn" ${soldOut ? 'disabled' : ''}>
        ${soldOut ? 'Sold Out' : 'Add to Basket'}
      </button>
    </div>
  `;

  if (!soldOut) {
    el.querySelector('.singles-add-btn').addEventListener('click', () => addToBasket(single, priceLabel, cartName));
  }

  return el;
}

function addToBasket(single, priceLabel, cartName) {
  const cart = JSON.parse(localStorage.getItem('dexoria_cart')) || [];

  // Match same card+variant already in basket by singleId, bump quantity instead of duplicating
  const existing = cart.find((item) => item.singleId === single.id);

  if (existing) {
    existing.quantity = (existing.quantity || 1) + 1;
  } else {
    cart.push({
      singleId: single.id,   // used by checkout to build the real Stripe line item + fulfillment
      name: cartName,        // includes variant, e.g. "Charizard VMAX (Holo)"
      price: priceLabel,     // matches basket.js's expected "£X.XX" display string
      image: single.image_url || '',
      quantity: 1,
    });
  }

  localStorage.setItem('dexoria_cart', JSON.stringify(cart));
  updateCartBadge(cart);
  showAddedToast(cartName);
}

function updateCartBadge(cart) {
  const badge = document.getElementById('cart-count');
  if (!badge) return;
  const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  badge.innerText = totalItems;
}

function showAddedToast(cardName) {
  let toast = document.querySelector('.singles-added-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'singles-added-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = `${cardName} added to basket`;
  toast.classList.add('show');
  clearTimeout(showAddedToast._t);
  showAddedToast._t = setTimeout(() => toast.classList.remove('show'), 1800);
}

function formatPrice(cents) {
  return `£${(cents / 100).toFixed(2)}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
