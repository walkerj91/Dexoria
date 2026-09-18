// admin-add-single.js
import { supabase } from './supabaseClient.js';

const FUNCTION_URL = 'https://uygnyhljorjpmwlnbkyp.supabase.co/functions/v1/admin-add-single';

const authGate = document.getElementById('admin-auth-gate');
const form = document.getElementById('admin-add-single-form');

const idInput = document.getElementById('tcgdex-id-input');
const lookupBtn = document.getElementById('lookup-btn');
const lookupError = document.getElementById('lookup-error');

const preview = document.getElementById('card-preview');
const previewImg = document.getElementById('preview-img');
const previewName = document.getElementById('preview-name');
const previewSet = document.getElementById('preview-set');
const previewRarity = document.getElementById('preview-rarity');

const priceInput = document.getElementById('price-input');
const quantityInput = document.getElementById('quantity-input');
const submitBtn = document.getElementById('submit-btn');
const submitSuccess = document.getElementById('submit-success');
const submitError = document.getElementById('submit-error');

const inventoryList = document.getElementById('inventory-list');
const inventoryEmpty = document.getElementById('inventory-empty');

let currentCard = null; // holds the resolved TCGDex card data

init();

async function init() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData?.session) {
    authGate.hidden = false;
    return;
  }

  // The admin-add-single function itself is the real gatekeeper (checks
  // user.id against ADMIN_USER_ID) — this just avoids showing the form
  // to a logged-in-but-not-admin visitor.
  form.hidden = false;

  lookupBtn.addEventListener('click', handleLookup);
  form.addEventListener('submit', handleSubmit);

  loadInventory();
}

async function handleLookup() {
  const id = idInput.value.trim();
  lookupError.hidden = true;
  preview.hidden = true;
  submitBtn.disabled = true;
  currentCard = null;

  if (!id) return;

  lookupBtn.disabled = true;
  lookupBtn.textContent = 'Looking up…';

  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Card not found');
    const card = await res.json();

    currentCard = card;

    previewImg.src = card.image ? `${card.image}/high.png` : '';
    previewImg.alt = card.name || '';
    previewName.textContent = card.name || 'Unknown card';
    previewSet.textContent = card.set?.name || '';
    previewRarity.textContent = card.rarity || '';

    preview.hidden = false;
    submitBtn.disabled = false;
  } catch (err) {
    console.error(err);
    lookupError.textContent = "Couldn't find that card on TCGDex — double check the ID.";
    lookupError.hidden = false;
  } finally {
    lookupBtn.disabled = false;
    lookupBtn.textContent = 'Look up';
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  submitSuccess.hidden = true;
  submitError.hidden = true;

  if (!currentCard) return;

  const priceCents = Math.round(parseFloat(priceInput.value) * 100);
  const quantity = Math.max(1, parseInt(quantityInput.value, 10) || 1);

  if (!priceCents || priceCents <= 0) {
    submitError.textContent = 'Enter a valid price.';
    submitError.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding…';

  try {
    const result = await callAdminFunction({
      action: 'add',
      tcgdex_card_id: currentCard.id,
      card_name: currentCard.name,
      set_name: currentCard.set?.name || '',
      set_id: currentCard.set?.id || '',
      card_number: currentCard.localId || '',
      rarity: currentCard.rarity || '',
      image_url: currentCard.image ? `${currentCard.image}/high.png` : '',
      price_cents: priceCents,
      quantity_available: quantity,
    });

    submitSuccess.textContent = `${currentCard.name} added to the store.`;
    submitSuccess.hidden = false;

    // Reset for the next card
    idInput.value = '';
    priceInput.value = '';
    quantityInput.value = 1;
    preview.hidden = true;
    currentCard = null;

    loadInventory();
  } catch (err) {
    console.error(err);
    submitError.textContent = err.message || 'Something went wrong.';
    submitError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add to Store';
  }
}

// ─── Shared call to the admin Edge Function ────────────────────────────────
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

// ─── Inventory list ─────────────────────────────────────────────────────────
async function loadInventory() {
  try {
    const result = await callAdminFunction({ action: 'list' });
    renderInventory(result.singles || []);
  } catch (err) {
    console.error('Failed to load inventory:', err);
  }
}

function renderInventory(singles) {
  inventoryList.innerHTML = '';

  if (singles.length === 0) {
    inventoryEmpty.hidden = false;
    return;
  }
  inventoryEmpty.hidden = true;

  for (const single of singles) {
    inventoryList.appendChild(buildInventoryRow(single));
  }
}

function buildInventoryRow(single) {
  const row = document.createElement('div');
  row.className = 'admin-inv-row' + (single.is_active ? '' : ' admin-inv-row-inactive');

  row.innerHTML = `
    <img class="admin-inv-img" src="${single.image_url || ''}" alt="${escapeHtml(single.card_name)}" loading="lazy" />
    <div class="admin-inv-details">
      <p class="admin-inv-name">${escapeHtml(single.card_name)}</p>
      <p class="admin-inv-set">${escapeHtml(single.set_name)}</p>
      <div class="admin-inv-fields">
        <label class="admin-inv-field">
          £<input type="number" step="0.01" min="0" class="admin-inv-price" value="${(single.price_cents / 100).toFixed(2)}" />
        </label>
        <label class="admin-inv-field">
          Qty <input type="number" min="0" class="admin-inv-qty" value="${single.quantity_available}" />
        </label>
        <button class="dex-btn admin-inv-save">Save</button>
        <button class="dex-btn admin-inv-toggle">${single.is_active ? 'Remove from Store' : 'Restore to Store'}</button>
      </div>
      <p class="admin-inv-status">${single.is_active ? '' : 'Hidden from store'}${single.quantity_sold ? ` · ${single.quantity_sold} sold` : ''}</p>
    </div>
  `;

  row.querySelector('.admin-inv-save').addEventListener('click', async (e) => {
    const btn = e.target;
    const priceCents = Math.round(parseFloat(row.querySelector('.admin-inv-price').value) * 100);
    const quantityAvailable = Math.max(0, parseInt(row.querySelector('.admin-inv-qty').value, 10) || 0);

    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await callAdminFunction({
        action: 'update',
        id: single.id,
        price_cents: priceCents,
        quantity_available: quantityAvailable,
      });
      loadInventory();
    } catch (err) {
      alert(err.message || 'Could not save changes.');
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });

  row.querySelector('.admin-inv-toggle').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    try {
      await callAdminFunction({
        action: 'toggle',
        id: single.id,
        is_active: !single.is_active,
      });
      loadInventory();
    } catch (err) {
      alert(err.message || 'Could not update this card.');
      btn.disabled = false;
    }
  });

  return row;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
