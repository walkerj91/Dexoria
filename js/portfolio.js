import { supabase } from '../js/supabaseClient.js';

// ── DOM refs ──────────────────────────────────────────────
const binderSelectionScreen = document.getElementById('binderSelectionScreen');
const collectionScreen      = document.getElementById('collectionScreen');
const binderGrid            = document.getElementById('binderGrid');
const flipOverlay           = document.getElementById('flipOverlay');
const addBinderBtn          = document.getElementById('addBinderBtn');
const createBinderModal     = document.getElementById('createBinderModal');
const closeModal            = document.getElementById('closeModal');
const createBinderBtn       = document.getElementById('createBinderBtn');
const binderNameInput       = document.getElementById('binderName');
const binderError           = document.getElementById('binderError');
const coverUploadArea       = document.getElementById('coverUploadArea');
const coverImageInput       = document.getElementById('coverImageInput');
const coverPreview          = document.getElementById('coverPreview');
const colorPickerRow        = document.getElementById('colorPickerRow');
const customColorInput      = document.getElementById('customColor');
const backToBinders         = document.getElementById('backToBinders');
const openBinderTitle       = document.getElementById('openBinderTitle');

// ── Card search modal refs ────────────────────────────────
const cardSearchModal   = document.getElementById('cardSearchModal');
const closeCardSearch   = document.getElementById('closeCardSearch');
const cardNameInput     = document.getElementById('cardNameInput');
const cardSetSelect     = document.getElementById('cardSetSelect');
const cardSearchBtn     = document.getElementById('cardSearchBtn');
const cardSearchStatus  = document.getElementById('cardSearchStatus');
const cardSearchResults = document.getElementById('cardSearchResults');

// ── Edit binder modal refs ────────────────────────────────
const editBinderModal     = document.getElementById('editBinderModal');
const closeEditModal      = document.getElementById('closeEditModal');
const editBinderName      = document.getElementById('editBinderName');
const editColorPickerRow  = document.getElementById('editColorPickerRow');
const editCustomColor     = document.getElementById('editCustomColor');
const editCoverUploadArea = document.getElementById('editCoverUploadArea');
const editCoverImageInput = document.getElementById('editCoverImageInput');
const editCoverPreview    = document.getElementById('editCoverPreview');
const removeCoverBtn      = document.getElementById('removeCoverBtn');
const saveEditBinderBtn   = document.getElementById('saveEditBinderBtn');
const deleteBinderBtn     = document.getElementById('deleteBinderBtn');
const editBinderError     = document.getElementById('editBinderError');

// ── State ─────────────────────────────────────────────────
let selectedColor   = '#6F2DA8';
let coverImageFile  = null;
let currentUser     = null;
let currentBinderId = null;
let currentBinder   = null;
let slotMap         = {};

let editingBinder     = null;
let editCoverFile     = null;
let editSelectedColor = '#6F2DA8';
let removeCover       = false;

let isPublic     = false;   // create modal
let editIsPublic = false;   // edit modal
let isReadOnly   = false;   // true when viewing another user's binder

let activeSlotIndex = null;
let activeWrapper   = null;
let setsLoaded      = false;

const CARDS_PER_SIDE = 12;
const SLOTS_PER_PAGE = 24;

// ── Visibility toggles ────────────────────────────────────
document.querySelectorAll('#visibilityToggle .vis-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#visibilityToggle .vis-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    isPublic = btn.dataset.value === 'public';
  });
});

document.querySelectorAll('#editVisibilityToggle .vis-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#editVisibilityToggle .vis-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    editIsPublic = btn.dataset.value === 'public';
  });
});

// ══════════════════════════════════════════════════════════
// AUTH / BOOT
// ══════════════════════════════════════════════════════════
async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;
  await loadBinders();
}

// ══════════════════════════════════════════════════════════
// BINDER SELECTION
// ══════════════════════════════════════════════════════════
async function loadBinders() {
  binderGrid.innerHTML = '<p style="color:rgba(255,255,255,0.4);grid-column:1/-1;text-align:center;">Loading binders…</p>';

  const { data: binders, error } = await supabase
    .from('binders')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });

  if (error) {
    binderGrid.innerHTML = `<p style="color:#f87171;grid-column:1/-1;text-align:center;">Error: ${error.message}</p>`;
    return;
  }

  binderGrid.innerHTML = '';

  if (!binders || binders.length === 0) {
    binderGrid.innerHTML = '<p style="color:rgba(255,255,255,0.3);grid-column:1/-1;text-align:center;letter-spacing:1px;">No binders yet — create your first one!</p>';
    return;
  }

  binders.forEach(b => binderGrid.appendChild(buildBinderCard(b)));
}

function buildBinderCard(binder) {
  const card = document.createElement('div');
  card.className = 'binder-card';
  card.dataset.id = binder.id;

  const spine = document.createElement('div');
  spine.className = 'binder-card-spine';

  const rings = document.createElement('div');
  rings.className = 'binder-card-rings';
  for (let i = 0; i < 4; i++) {
    const ring = document.createElement('div');
    ring.className = 'binder-ring';
    rings.appendChild(ring);
  }

  if (binder.cover_image_url) {
    const img = document.createElement('img');
    img.className = 'binder-card-cover';
    img.src = binder.cover_image_url;
    img.alt = binder.name;
    card.appendChild(img);
  } else {
    const bg = document.createElement('div');
    bg.className = 'binder-card-color-bg';
    bg.style.background = `linear-gradient(135deg, ${binder.color} 0%,
    ${darken(binder.color, 40)} 100%)`;

    const icon = document.createElement('span');
    icon.className = 'binder-card-icon';
    icon.textContent = '📓';

    bg.appendChild(icon);
    card.appendChild(bg);
  }

  card.appendChild(spine);
  card.appendChild(rings);

  const info = document.createElement('div');
  info.className = 'binder-card-info';
  info.innerHTML = `
    <p class="binder-card-name">${escapeHTML(binder.name)}</p>
    <p class="binder-card-count">${binder.card_count ?? 0} cards</p>
  `;

  card.appendChild(info);

  card.style.borderColor = binder.color;
  card.style.boxShadow = `0 0 20px ${binder.color}44`;

  if (binder.user_id === currentUser?.id) {
    const editBtn = document.createElement('button');
    editBtn.className = 'binder-card-edit-btn';
    editBtn.title = 'Edit binder';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', e => { e.stopPropagation(); openEditModal(binder); });
    card.appendChild(editBtn);

    const badge = document.createElement('div');
    badge.className = `binder-visibility-badge${binder.is_public ? ' public' : ''}`;
    badge.textContent = binder.is_public ? '🌐 Public' : '🔒 Private';
    card.appendChild(badge);
  }

  card.addEventListener('click', () => openBinder(binder));

  return card;

}

// ══════════════════════════════════════════════════════════
// OPEN / CLOSE BINDER
// ══════════════════════════════════════════════════════════
function openBinder(binder) {
  currentBinderId = binder.id;
  currentBinder   = binder;

  async function doOpen() {
    if (flipOverlay) flipOverlay.classList.remove('active');
    binderSelectionScreen.style.display = 'none';
    collectionScreen.style.display      = 'block';
    collectionScreen.style.minHeight    = '600px';
    openBinderTitle.textContent         = binder.name.toUpperCase();

    await loadCardsForBinder(binder.id);
    initCollectionView(binder);
  }

  // Run flip animation if overlay exists, otherwise open immediately
  if (flipOverlay) {
    document.documentElement.style.setProperty('--flip-color', binder.color ?? '#6F2DA8');
    flipOverlay.classList.add('active');
    setTimeout(doOpen, 750);
  } else {
    doOpen();
  }
}

backToBinders.addEventListener('click', () => {
  collectionScreen.style.display = 'none';
  binderSelectionScreen.style.display = 'flex';
  currentBinderId = null;
  currentBinder   = null;
  slotMap         = {};
  loadBinders();
});

async function loadCardsForBinder(binderId) {
  slotMap = {};
  const { data: cards, error } = await supabase
    .from('cards')
    .select('*')
    .eq('binder_id', binderId);

  if (error) { console.error('Error loading cards:', error.message); return; }
  (cards || []).forEach(c => { slotMap[c.slot_index] = c; });
}

// ══════════════════════════════════════════════════════════
// COLLECTION VIEW
// ══════════════════════════════════════════════════════════
function initCollectionView(binder) {
  let totalPages  = binder.page_count;   // ⭐ dynamic page count
  let currentPage = 1;

  // Save for other functions
  currentBinder = binder;

  function renderPage() {
    document.getElementById('pageCurrent').textContent = currentPage;
    document.getElementById('pageTotal').textContent   = totalPages;

    renderDots(totalPages, currentPage);
    renderSpread(currentPage);
    updateStats();
  }

  // Navigation
  document.getElementById('prevBtn').onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      renderPage();
    }
  };

  document.getElementById('nextBtn').onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderPage();
    }
  };

  // ⭐ ADD PAGE BUTTON
  document.getElementById('addPageBtn').onclick = async () => {
    const newPageCount = totalPages + 1;

    const { error } = await supabase
      .from("binders")
      .update({ page_count: newPageCount })
      .eq("id", currentBinder.id);

    if (error) {
      console.error("Failed to add page:", error.message);
      return;
    }

    // Update local binder object
    currentBinder.page_count = newPageCount;
    totalPages = newPageCount;

    // Jump to the new page
    currentPage = newPageCount;
    renderPage();
  };

  // ⭐ DELETE PAGE
  document.getElementById('deletePageBtn').onclick = async () => {
    if (totalPages === 1) {
      alert("You must have at least one page.");
      return;
    }

    const pageToDelete = currentPage;

    // 1. Remove all cards on that page
    const startSlot = (pageToDelete - 1) * SLOTS_PER_PAGE;
    const endSlot   = startSlot + SLOTS_PER_PAGE;

    await supabase
      .from("cards")
      .delete()
      .gte("slot_index", startSlot)
      .lt("slot_index", endSlot)
      .eq("binder_id", currentBinder.id);

    // 2. Shift all cards after this page down by 24 slots
    const { data: cardsAfter } = await supabase
      .from("cards")
      .select("*")
      .gt("slot_index", endSlot - 1)
      .eq("binder_id", currentBinder.id);

    for (const card of cardsAfter) {
      await supabase
        .from("cards")
        .update({ slot_index: card.slot_index - SLOTS_PER_PAGE })
        .eq("id", card.id);
    }
    // 3. Update page count
    const newPageCount = totalPages - 1;

    await supabase
      .from("binders")
      .update({ page_count: newPageCount })
      .eq("id", currentBinder.id);

    currentBinder.page_count = newPageCount;
    totalPages = newPageCount;

    // 4. Fix current page if needed
    if (currentPage > totalPages) currentPage = totalPages;

    // 5. Reload cards + re-render
    await loadCardsForBinder(currentBinder.id);
    renderPage();
  };

  renderPage();
}


function renderDots(total, current) {
  const dots = document.getElementById('pageDots');
  dots.innerHTML = '';

  for (let i = 1; i <= total; i++) {
    const dot = document.createElement('div');
    dot.className = 'page-dot' + (i === current ? ' active' : '');
    dots.appendChild(dot);
  }
}

function renderSpread(page) {
  const left  = document.getElementById('pageLeft');
  const right = document.getElementById('pageRight');

  left.innerHTML  = '';
  right.innerHTML = '';

  const baseSlot = (page - 1) * SLOTS_PER_PAGE;

  for (let i = 0; i < CARDS_PER_SIDE; i++) {
    left.appendChild(makeCardSlot(baseSlot + i));
    right.appendChild(makeCardSlot(baseSlot + CARDS_PER_SIDE + i));
  }
}


// ── Card slot ─────────────────────────────────────────────
function makeCardSlot(slotIndex) {
  console.log("Creating slot:", slotIndex);
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.dataset.slot = slotIndex;

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const existing = slotMap[slotIndex];

  if (existing) {
    // Filled slot — show card image
    const img = document.createElement('img');
    img.src = existing.card_image || existing.image_url;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:10px;display:block;';
    inner.appendChild(img);

    if (existing.is_holo) {
      const badge = document.createElement('span');
      badge.className = 'holo-badge';
      badge.textContent = '✨';
      inner.appendChild(badge);
    }

    if (!isReadOnly) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'card-remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove card';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        removeCard(slotIndex, existing.id, wrapper);
      });
      inner.appendChild(removeBtn);
    }

  } else {
    if (!isReadOnly) {
      // Empty slot — clicking opens TCGdex search modal
      const plus = document.createElement('span');
      plus.className = 'card-plus-btn';
      plus.textContent = '+';
      inner.appendChild(plus);
      inner.addEventListener('click', () => openCardSearch(slotIndex, wrapper));
    }
  }

  wrapper.appendChild(inner);
  return wrapper;
}

// ── Remove card ───────────────────────────────────────────
async function removeCard(slotIndex, cardId, wrapper) {
  if (!confirm('Remove this card from the binder?')) return;

  const { error } = await supabase.from('cards').delete().eq('id', cardId);
  if (error) { console.error('Remove failed:', error.message); return; }

  delete slotMap[slotIndex];
  wrapper.replaceWith(makeCardSlot(slotIndex));
  await syncCardCount();
  updateStats();
}

// ── Sync card_count ───────────────────────────────────────
async function syncCardCount() {
  const count = Object.keys(slotMap).length;
  await supabase.from('binders').update({ card_count: count }).eq('id', currentBinderId);
  if (currentBinder) currentBinder.card_count = count;
}

// ── Stats ─────────────────────────────────────────────────
function updateStats() {
  const cards = Object.values(slotMap);
  const holos  = cards.filter(c => c.is_holo).length;
  const pages  = Math.max(1, Math.ceil(cards.length / SLOTS_PER_PAGE));
  document.getElementById('statCards').textContent = cards.length;
  document.getElementById('statHolos').textContent = holos;
  document.getElementById('statPages').textContent = pages;
}

// ══════════════════════════════════════════════════════════
// TCGDEX CARD SEARCH (UPDATED WITH VARIANTS + TRAINERS)
// ══════════════════════════════════════════════════════════
const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';

async function loadSets() {
  if (setsLoaded) return;
  try {
    const res  = await fetch(`${TCGDEX_BASE}/sets`);
    const sets = await res.json();
    sets.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
    sets.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      cardSetSelect.appendChild(opt);
    });
    setsLoaded = true;
  } catch (e) {
    console.warn('Could not load sets:', e);
  }
}

function openCardSearch(slotIndex, wrapper) {
  activeSlotIndex = slotIndex;
  activeWrapper   = wrapper;
  cardNameInput.value          = '';
  cardSearchStatus.textContent = '';
  cardSearchResults.innerHTML  = '';
  cardSearchModal.classList.add('active');
  loadSets();
  cardNameInput.focus();
}

closeCardSearch.addEventListener('click', () => cardSearchModal.classList.remove('active'));
cardSearchModal.addEventListener('click', e => {
  if (e.target === cardSearchModal) cardSearchModal.classList.remove('active');
});

cardSearchBtn.addEventListener('click', runCardSearch);
cardNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') runCardSearch(); });

async function runCardSearch() {
  const name  = cardNameInput.value.trim();
  const setId = cardSetSelect.value;

  if (!name && !setId) {
    cardSearchStatus.textContent = 'Enter a card name or choose a set.';
    return;
  }

  cardSearchStatus.textContent = 'Searching…';
  cardSearchResults.innerHTML  = '';
  cardSearchBtn.disabled       = true;

  try {
    let cards = [];

    // 1. FETCH BASIC CARD LIST
    if (setId) {
      const res  = await fetch(`${TCGDEX_BASE}/sets/${setId}`);
      const data = await res.json();
      cards = (data.cards ?? []).map(c => ({
        id:    `${setId}-${c.localId}`,
        name:  c.name,
        image: c.image ? `${c.image}/high.png` : null,
      }));
      if (name) {
        cards = cards.filter(c => c.name.toLowerCase().includes(name.toLowerCase()));
      }
    } else {
      const res = await fetch(`${TCGDEX_BASE}/cards`);
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();

      // ✅ FIX 1: No 'let' here — assign to the outer 'cards'
      cards = data.filter(card =>
        card.name?.toLowerCase().includes(name.toLowerCase())
      );
    }

    // Remove cards with no image
    cards = cards.filter(c => c.image);

    // 2. FETCH FULL CARD DETAILS
    // ✅ FIX 2: Loop over cards.length, not binder.page_count
    for (let i = 0; i < cards.length; i++) {
      try {
        const full = await fetch(`${TCGDEX_BASE}/cards/${cards[i].id}`).then(r => r.json());

        cards[i].category    = full.category    ?? null;
        cards[i].trainerType = full.trainerType ?? null;
        cards[i].rarity      = full.rarity      ?? null;
        cards[i].variants    = full.variants    ?? { normal: false, holo: false, reverse: false };

        if (!cards[i].image && full.image) {
          cards[i].image = `${full.image}/high.png`;
        }
      } catch (err) {
        console.warn("Failed to load full card data:", cards[i].id, err);
      }
    }

    // 3. DISPLAY RESULTS
    cards = cards.filter(c => c.image);

    if (cards.length === 0) {
      cardSearchStatus.textContent = 'No cards found with images. Try a different search.';
      cardSearchBtn.disabled = false;
      return;
    }

    cardSearchStatus.textContent = `${cards.length} card${cards.length !== 1 ? 's' : ''} found`;
    renderCardResults(cards);

  } catch (err) {
    cardSearchStatus.textContent = 'Search failed — check your connection and try again.';
    console.error(err);
  }

  cardSearchBtn.disabled = false;
}


// ───────────────────────────────────────────────
// RENDER SEARCH RESULTS
// ───────────────────────────────────────────────
function renderCardResults(cards) {
  cardSearchResults.innerHTML = '';

  cards.slice(0, 60).forEach(card => {
    const item = document.createElement('div');
    item.className = 'card-result-item';

    const img = document.createElement('img');
    img.src     = card.image;
    img.alt     = card.name;
    img.loading = 'lazy';

    // Build label text
    let labelText = card.name;

    // Trainer type
    if (card.category === "Trainer" && card.trainerType) {
      labelText += ` — ${card.trainerType}`;
    }

    // Variants
    const v = card.variants ?? {};
    const variantParts = [];
    if (v.normal)  variantParts.push("Normal");
    if (v.holo)    variantParts.push("Holo");
    if (v.reverse) variantParts.push("Reverse Holo");

    if (variantParts.length > 0) {
      labelText += ` (${variantParts.join(", ")})`;
    }

    const label = document.createElement('span');
    label.className   = 'card-result-label';
    label.textContent = labelText;

    item.appendChild(img);
    item.appendChild(label);
    item.addEventListener('click', () => selectCard(card));
    cardSearchResults.appendChild(item);
  });
}


// ───────────────────────────────────────────────
// SELECT CARD → INSERT INTO BINDER
// ───────────────────────────────────────────────
async function selectCard(card) {
  cardSearchModal.classList.remove('active');

  // card.image already includes /high.png from the search builder
  const imageUrl = card.image ?? '';

  const inner = activeWrapper.querySelector('.card-inner');
  inner.innerHTML = `
    <span style="color:rgba(255,255,255,0.4);font-size:11px;text-align:center;padding:8px;">
      Adding…
    </span>
  `;

  const { data: inserted, error } = await supabase
    .from('cards')
    .insert({
      binder_id:   currentBinderId,
      user_id:     currentUser.id,
      card_name:   card.name,
      card_set:    card.set?.name ?? null,
      card_image:  imageUrl,
      image_url:   imageUrl,
      slot_index:  activeSlotIndex,
      is_holo:     card.variants?.holo || card.variants?.reverse || false,
      category:    card.category    ?? null,
      trainerType: card.trainerType ?? null,
      rarity:      card.rarity      ?? null,
      rating:      0
    })
    .select()
    .single();

  if (error) {
    inner.innerHTML = `
      <span style="color:#f87171;font-size:11px;padding:8px;text-align:center;">
        Save failed
      </span>
    `;
    console.error(error.message);
    return;
  }

  slotMap[activeSlotIndex] = inserted;
  activeWrapper.replaceWith(makeCardSlot(activeSlotIndex));
  await syncCardCount();
  updateStats();
}

// ══════════════════════════════════════════════════════════
// CREATE BINDER MODAL
// ══════════════════════════════════════════════════════════
addBinderBtn.addEventListener('click', () => {
  createBinderModal.classList.add('active');
  binderError.textContent = '';
  binderNameInput.value   = '';
  coverImageFile          = null;
  coverPreview.innerHTML  = '<span>+ Upload Image</span>';
  coverPreview.className  = 'cover-preview-empty';
  // reset visibility to private
  isPublic = false;
  document.querySelectorAll('#visibilityToggle .vis-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === 'private')
  );
});

closeModal.addEventListener('click', () => createBinderModal.classList.remove('active'));
createBinderModal.addEventListener('click', e => {
  if (e.target === createBinderModal) createBinderModal.classList.remove('active');
});

colorPickerRow.querySelectorAll('.color-swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    colorPickerRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    selectedColor = swatch.dataset.color;
  });
});

customColorInput.addEventListener('input', () => {
  colorPickerRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  selectedColor = customColorInput.value;
});

coverUploadArea.addEventListener('click', () => coverImageInput.click());
coverImageInput.addEventListener('change', () => {
  const file = coverImageInput.files[0];
  if (!file) return;
  coverImageFile = file;
  const url = URL.createObjectURL(file);
  coverPreview.innerHTML = '';
  coverPreview.className = '';
  const img = document.createElement('img');
  img.src = url;
  img.className = 'cover-preview-img';
  coverPreview.appendChild(img);
});

createBinderBtn.addEventListener('click', async () => {

  const name = binderNameInput.value.trim();

  if (!name) {
    binderError.textContent = 'Please enter a binder name.';
    return;
  }

  createBinderBtn.disabled = true;
  createBinderBtn.textContent = 'Creating…';
  binderError.textContent = '';

  let coverUrl = null;

  // ✅ Upload cover image if provided
  if (coverImageFile) {
    const ext = coverImageFile.name.split('.').pop();
    const path = `binder-covers/${currentUser?.id ?? 'anon'}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('binder-covers')
      .upload(path, coverImageFile, { upsert: true });

    if (uploadError) {
      binderError.textContent = 'Image upload failed: ' + uploadError.message;
      createBinderBtn.disabled = false;
      createBinderBtn.textContent = 'Create Binder';
      return;
    }

    const { data: urlData } = supabase
      .storage
      .from('binder-covers')
      .getPublicUrl(path);

    coverUrl = urlData.publicUrl;
  }

  // ✅ Insert binder into database
  const { data, error } = await supabase
    .from('binders')
    .insert({
      user_id: currentUser?.id,
      name,
      color: selectedColor,
      cover_image_url: coverUrl,
      card_count: 0,
      page_count: 1,
      is_public: isPublic
    })
    .select()
    .single();

  // ✅ Handle error properly
  if (error) {
    binderError.textContent = 'Error: ' + error.message;
    createBinderBtn.disabled = false;
    createBinderBtn.textContent = 'Create Binder';
    return;
  }

  // ✅ Reset UI
  createBinderModal.classList.remove('active');
  createBinderBtn.disabled = false;
  createBinderBtn.textContent = 'Create Binder';

  // ✅ IMPORTANT: open binder directly (no redirect)
  openBinder(data);

});

// ══════════════════════════════════════════════════════════
// EDIT BINDER MODAL
// ══════════════════════════════════════════════════════════
function openEditModal(binder) {
  editingBinder     = binder;
  editCoverFile     = null;
  removeCover       = false;
  editBinderError.textContent = '';

  editBinderName.value = binder.name;
  editSelectedColor    = binder.color;
  editColorPickerRow.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === binder.color);
  });
  editCustomColor.value = binder.color;

  if (binder.cover_image_url) {
    editCoverPreview.innerHTML = '';
    editCoverPreview.className = '';
    const img = document.createElement('img');
    img.src = binder.cover_image_url;
    img.className = 'cover-preview-img';
    editCoverPreview.appendChild(img);
    removeCoverBtn.style.display = 'block';
  } else {
    editCoverPreview.innerHTML   = '<span>+ Upload Image</span>';
    editCoverPreview.className   = 'cover-preview-empty';
    removeCoverBtn.style.display = 'none';
  }

  editBinderModal.classList.add('active');

  // Set visibility toggle
  editIsPublic = binder.is_public ?? false;
  document.querySelectorAll('#editVisibilityToggle .vis-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === (editIsPublic ? 'public' : 'private'))
  );
}

closeEditModal.addEventListener('click', () => editBinderModal.classList.remove('active'));
editBinderModal.addEventListener('click', e => {
  if (e.target === editBinderModal) editBinderModal.classList.remove('active');
});

editColorPickerRow.querySelectorAll('.color-swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    editColorPickerRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    editSelectedColor = swatch.dataset.color;
  });
});

editCustomColor.addEventListener('input', () => {
  editColorPickerRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  editSelectedColor = editCustomColor.value;
});

editCoverUploadArea.addEventListener('click', () => editCoverImageInput.click());
editCoverImageInput.addEventListener('change', () => {
  const file = editCoverImageInput.files[0];
  if (!file) return;
  editCoverFile = file;
  removeCover   = false;
  const url = URL.createObjectURL(file);
  editCoverPreview.innerHTML = '';
  editCoverPreview.className = '';
  const img = document.createElement('img');
  img.src = url;
  img.className = 'cover-preview-img';
  editCoverPreview.appendChild(img);
  removeCoverBtn.style.display = 'block';
});

removeCoverBtn.addEventListener('click', e => {
  e.stopPropagation();
  removeCover                  = true;
  editCoverFile                = null;
  editCoverPreview.innerHTML   = '<span>+ Upload Image</span>';
  editCoverPreview.className   = 'cover-preview-empty';
  removeCoverBtn.style.display = 'none';
});

saveEditBinderBtn.addEventListener('click', async () => {
  const name = editBinderName.value.trim();
  if (!name) { editBinderError.textContent = 'Please enter a binder name.'; return; }

  saveEditBinderBtn.disabled    = true;
  saveEditBinderBtn.textContent = 'Saving…';
  editBinderError.textContent   = '';

  let coverUrl = editingBinder.cover_image_url;

  if (editCoverFile) {
    const ext  = editCoverFile.name.split('.').pop();
    const path = `binder-covers/${currentUser?.id ?? 'anon'}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('binder-covers')
      .upload(path, editCoverFile, { upsert: true });

    if (uploadError) {
      editBinderError.textContent   = 'Image upload failed: ' + uploadError.message;
      saveEditBinderBtn.disabled    = false;
      saveEditBinderBtn.textContent = 'Save Changes';
      return;
    }
    const { data: urlData } = supabase.storage.from('binder-covers').getPublicUrl(path);
    coverUrl = urlData.publicUrl;
  }

  if (removeCover) coverUrl = null;

  const { error } = await supabase
    .from('binders')
    .update({ name, color: editSelectedColor, cover_image_url: coverUrl, is_public: editIsPublic })
    .eq('id', editingBinder.id);

  if (error) {
    editBinderError.textContent   = 'Error: ' + error.message;
    saveEditBinderBtn.disabled    = false;
    saveEditBinderBtn.textContent = 'Save Changes';
    return;
  }

  editBinderModal.classList.remove('active');
  saveEditBinderBtn.disabled    = false;
  saveEditBinderBtn.textContent = 'Save Changes';
  await loadBinders();
});

deleteBinderBtn.addEventListener('click', async () => {
  if (!confirm(`Delete "${editingBinder.name}"? This cannot be undone.`)) return;

  deleteBinderBtn.disabled    = true;
  deleteBinderBtn.textContent = 'Deleting…';

  const { error } = await supabase.from('binders').delete().eq('id', editingBinder.id);

  if (error) {
    editBinderError.textContent = 'Error: ' + error.message;
    deleteBinderBtn.disabled    = false;
    deleteBinderBtn.textContent = 'Delete';
    return;
  }

  editBinderModal.classList.remove('active');
  deleteBinderBtn.disabled    = false;
  deleteBinderBtn.textContent = 'Delete';
  await loadBinders();
});

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function darken(hex, amount) {
  let [r, g, b] = hex.match(/\w\w/g).map(x => parseInt(x, 16));
  r = Math.max(0, r - amount);
  g = Math.max(0, g - amount);
  b = Math.max(0, b - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ══════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════
// Detect direct binder page load — if present, skip init() entirely
// to avoid a race condition between the binder selection screen and the collection view
const params   = new URLSearchParams(window.location.search);
const binderId = params.get('id');

if (binderId) {
  loadBinderDirect(binderId);
} else {
  init();
}

async function loadBinderDirect(binderId) {
  const { data: binder, error } = await supabase
    .from('binders')
    .select('*')
    .eq('id', binderId)
    .single();

  if (error || !binder) {
    console.error("Failed to load binder:", error?.message);
    return;
  }

  // Resolve current user and ownership in one call
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;
  isReadOnly  = !user || user.id !== binder.user_id;

  collectionScreen.style.display      = 'block';
  collectionScreen.style.minHeight    = '600px';
  binderSelectionScreen.style.display = 'none';

  // Hide edit controls for read-only viewers
  if (isReadOnly) {
    document.getElementById('addPageBtn').style.display    = 'none';
    document.getElementById('deletePageBtn').style.display = 'none';
  }

  openBinderTitle.textContent = binder.name.toUpperCase();

  await loadCardsForBinder(binder.id);
  initCollectionView(binder);
}