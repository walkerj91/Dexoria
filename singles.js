// singles.js
import { supabase } from './supabaseClient.js';

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
  const { data, error } = await supabase
    .from('card_singles')
    .select('*')
    .eq('is_active', true)
    .gt('quantity_available', 0)
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
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => a.price_cents - b.price_cents);
    case 'price-desc':
      return copy.sort((a, b) => b.price_cents - a.price_cents);
    case 'name':
      return copy.sort((a, b) => a.card_name.localeCompare(b.card_name));
    case 'newest':
    default:
      return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

function buildCard(single) {
  const el = document.createElement('div');
  el.className = 'dex-card';

  const priceLabel = formatPrice(single.price_cents);

  el.innerHTML = `
    <div class="dex-img-wrap">
      <img src="${single.image_url || ''}" alt="${escapeHtml(single.card_name)}" loading="lazy" />
    </div>
    <p class="singles-card-name">${escapeHtml(single.card_name)}</p>
    <p class="singles-card-set">${escapeHtml(single.set_name)}${single.card_number ? ' · #' + escapeHtml(single.card_number) : ''}</p>
    <div class="dex-row">
      <span class="dex-price">${priceLabel}</span>
      <span class="singles-stock">${single.quantity_available} left</span>
    </div>
    <div class="dex-row">
      <button class="dex-btn singles-add-btn">Add to Basket</button>
    </div>
  `;

  el.querySelector('.singles-add-btn').addEventListener('click', () => addToBasket(single, priceLabel));

  return el;
}

function addToBasket(single, priceLabel) {
  const cart = JSON.parse(localStorage.getItem('dexoria_cart')) || [];

  // Match same card already in basket by singleId, bump quantity instead of duplicating
  const existing = cart.find((item) => item.singleId === single.id);

  if (existing) {
    existing.quantity = (existing.quantity || 1) + 1;
  } else {
    cart.push({
      singleId: single.id,   // used by checkout to build the real Stripe line item + fulfillment
      name: single.card_name,
      price: priceLabel,     // matches basket.js's expected "£X.XX" display string
      image: single.image_url || '',
      quantity: 1,
    });
  }

  localStorage.setItem('dexoria_cart', JSON.stringify(cart));
  updateCartBadge(cart);
  showAddedToast(single.card_name);
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
