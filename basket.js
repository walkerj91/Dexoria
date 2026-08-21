// 1. Core Render Function
function renderBasket() {
    console.log("Checking storage for items...");
    const basketList = document.getElementById('basket-items-list');
    const totalPriceEl = document.getElementById('total-price');
    
    // Ensure container exists before trying to write to it
    if (!basketList) {
        console.error("Critical Error: 'basket-items-list' div not found in HTML.");
        return;
    }

    // Pull from storage
    const cart = JSON.parse(localStorage.getItem('dexoria_cart')) || [];
    console.log("Current Cart Data:", cart);

    if (cart.length === 0) {
        basketList.innerHTML = '<p class="placeholder-text" style="text-align:center; padding: 40px; color:white;">Your basket is currently empty.</p>';
        if (totalPriceEl) totalPriceEl.innerText = 'TOTAL: £0.00';
        return;
    }

    let html = '';
    let total = 0;

    cart.forEach((item, index) => {
        const qty = item.quantity || 1;
        const unitPrice = parseFloat(item.price.replace(/[^\d.]/g, '')) || 0;
        const lineTotal = unitPrice * qty;
        total += lineTotal;

  html += `
    <div class="trading-row" style="display: flex; align-items: center; justify-content: flex-start; gap: 30px; padding: 25px 0; border-bottom: 1px solid rgba(255,255,255,0.1); width: 100%;">
        
        <!-- Image Section (Now on the left side of the row) -->
        <div class="card-image" style="width: 120px; height: 120px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0;">
            <img src="${item.image}" alt="${item.name}" 
                 onerror="this.src='quickball.png'"
                 style="width: 100%; height: 100%; object-fit: cover; display: block;">
        </div>

        <!-- Info Section (Stacked in a column next to image) -->
        <div class="card-info" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left;">
            <h3 style="margin: 0 0 5px 0; font-size: 1.2rem; color: white;">${item.name}</h3>
            <p style="color: #ffd700; font-weight: bold; margin: 0 0 12px 0; font-size: 0.9rem;">Unit Price: ${item.price}</p>
            
            <!-- Compact Quantity Selector -->
            <div class="qty-selector" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <button onclick="updateQty(${index}, -1)" class="qty-btn" style="width:28px; height:28px; border-radius:50%; border:1px solid #ffd700; background:none; color:white; cursor:pointer; display:flex; align-items:center; justify-content:center;">-</button>
                <span style="font-weight:bold; font-size: 1rem; min-width: 15px; text-align: center;">${qty}</span>
                <button onclick="updateQty(${index}, 1)" class="qty-btn" style="width:28px; height:28px; border-radius:50%; border:1px solid #ffd700; background:none; color:white; cursor:pointer; display:flex; align-items:center; justify-content:center;">+</button>
            </div>

            <button onclick="removeItem(${index})" style="color: #ff4d4d; background:none; border:none; cursor:pointer; text-decoration:underline; font-size: 0.8rem; padding:0;">Remove Item</button>
        </div>
    </div>
`;

    });

    basketList.innerHTML = html;
    if (totalPriceEl) totalPriceEl.innerText = `TOTAL: £${total.toFixed(2)}`;
}

// 2. Quantity & Removal Logic
window.updateQty = function(index, change) {
    let cart = JSON.parse(localStorage.getItem('dexoria_cart')) || [];
    if (!cart[index].quantity) cart[index].quantity = 1;
    cart[index].quantity += change;
    if (cart[index].quantity < 1) cart[index].quantity = 1;
    localStorage.setItem('dexoria_cart', JSON.stringify(cart));
    renderBasket();    
    updateCartBadge(); 
};

window.removeItem = function(index) {
    let cart = JSON.parse(localStorage.getItem('dexoria_cart')) || [];
    cart.splice(index, 1);
    localStorage.setItem('dexoria_cart', JSON.stringify(cart));
    renderBasket();
    updateCartBadge(); 
};

window.clearEntireCart = function() {
    if (confirm("Clear all items from your basket?")) {
        localStorage.removeItem('dexoria_cart');
        renderBasket();
        updateCartBadge();
    }
};

// 3. Navbar Sync
function updateCartBadge() {
    const cart = JSON.parse(localStorage.getItem('dexoria_cart')) || [];
    const badge = document.getElementById('cart-count');
    if (badge) {
        const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        badge.innerText = totalItems;
    }
}

// 4. Initialization (The Failsafe)
function initBasket() {
    // Small delay ensures other scripts (like navbar injection) have finished
    setTimeout(() => {
        renderBasket();
        updateCartBadge();
    }, 50); 
}

if (document.readyState !== 'loading') {
    initBasket();
} else {
    document.addEventListener('DOMContentLoaded', initBasket);
}
