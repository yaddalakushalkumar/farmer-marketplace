let currentLang = 'en';
let currentView = 'buyer';
let cart = [];
let products = [];
let activeCategory = 'all';
let searchQuery = '';
let activeFarmerId = '';
let farmers = [];

// DOM Elements
document.addEventListener("DOMContentLoaded", () => {
    init();
});

function init() {
    // Check if there is stored language
    const savedLang = localStorage.getItem("kisanDhanLang");
    if (savedLang && translations[savedLang]) {
        currentLang = savedLang;
    }
    document.getElementById("langSelect").value = currentLang;

    // Load static translations
    applyTranslations();

    // Fetch initial product catalog
    fetchProducts();
    fetchFarmersList();

    // Set up global event handlers
    setupEventHandlers();
}

function setupEventHandlers() {
    // Language select changer
    document.getElementById("langSelect").addEventListener("change", (e) => {
        currentLang = e.target.value;
        localStorage.setItem("kisanDhanLang", currentLang);
        applyTranslations();
        renderProducts();
        renderCart();
        if (activeFarmerId) {
            loadFarmerDashboard(activeFarmerId);
        }
    });

    // View toggler
    document.getElementById("btnBuyerView").addEventListener("click", () => switchView("buyer"));
    document.getElementById("btnFarmerView").addEventListener("click", () => switchView("farmer"));

    // Category Tabs
    const tabs = document.querySelectorAll(".category-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            tabs.forEach(t => t.classList.remove("active"));
            e.target.classList.add("active");
            activeCategory = e.target.dataset.category;
            fetchProducts();
        });
    });

    // Search bar
    const searchInput = document.getElementById("productSearch");
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        // Debounce slightly if needed, or simple direct call
        fetchProducts();
    });

    // Farmer Registration Form
    document.getElementById("farmerRegForm").addEventListener("submit", (e) => {
        e.preventDefault();
        registerFarmer();
    });

    // Farmer Dashboard Access
    document.getElementById("btnDashboardLogin").addEventListener("click", () => {
        const select = document.getElementById("selectActiveFarmer");
        if (select.value) {
            activeFarmerId = select.value;
            loadFarmerDashboard(activeFarmerId);
        } else {
            alert(getTranslationText("alertFillFields"));
        }
    });

    // Product Listing Form
    document.getElementById("addProductForm").addEventListener("submit", (e) => {
        e.preventDefault();
        listProduct();
    });

    // Checkout modal closer
    document.getElementById("modalClose").addEventListener("click", closeModal);
    document.getElementById("modalSuccessClose").addEventListener("click", closeModal);

    // Payment Form Submission
    document.getElementById("paymentForm").addEventListener("submit", (e) => {
        e.preventDefault();
        executeDirectPayment();
    });

    // Logged Out Farmer button
    document.getElementById("btnFarmerLogout").addEventListener("click", () => {
        activeFarmerId = '';
        document.getElementById("farmerDashboardPanel").classList.add("hidden");
        document.getElementById("farmerLoginPanel").classList.remove("hidden");
        fetchFarmersList();
    });
}

// Switch UI View (Customer vs Farmer)
function switchView(view) {
    currentView = view;
    document.getElementById("btnBuyerView").classList.toggle("active", view === 'buyer');
    document.getElementById("btnFarmerView").classList.toggle("active", view === 'farmer');

    if (view === 'buyer') {
        document.getElementById("buyerSection").classList.remove("hidden");
        document.getElementById("farmerSection").classList.add("hidden");
        fetchProducts();
    } else {
        document.getElementById("buyerSection").classList.add("hidden");
        document.getElementById("farmerSection").classList.remove("hidden");
        fetchFarmersList();
        if (activeFarmerId) {
            loadFarmerDashboard(activeFarmerId);
        }
    }
}

// Translations Injector
function applyTranslations() {
    const langObj = translations[currentLang];
    
    // Select elements with data-translate attribute
    const elements = document.querySelectorAll("[data-translate]");
    elements.forEach(el => {
        const key = el.getAttribute("data-translate");
        if (langObj[key]) {
            el.textContent = langObj[key];
        }
    });

    // Placeholder updates
    const searchInput = document.getElementById("productSearch");
    if (searchInput) {
        searchInput.placeholder = langObj.searchPlaceholder;
    }

    // Category Tabs direct update
    document.querySelector("[data-category='all']").textContent = langObj.allCategories;
    document.querySelector("[data-category='Grains']").textContent = langObj.grains;
    document.querySelector("[data-category='Fruits']").textContent = langObj.fruits;
    document.querySelector("[data-category='Vegetables']").textContent = langObj.vegetables;
    document.querySelector("[data-category='Spices']").textContent = langObj.spices;
}

function getTranslationText(key, replacement = null) {
    const langObj = translations[currentLang];
    let val = langObj[key] || translations['en'][key] || key;
    if (replacement) {
        for (const [k, v] of Object.entries(replacement)) {
            val = val.replace(`{${k}}`, v);
        }
    }
    return val;
}

// Fetch lists from Backend
async function fetchProducts() {
    try {
        let url = `/api/products`;
        const params = [];
        if (activeCategory !== 'all') {
            params.push(`category=${encodeURIComponent(activeCategory)}`);
        }
        if (searchQuery) {
            params.push(`search=${encodeURIComponent(searchQuery)}`);
        }
        if (params.length > 0) {
            url += `?${params.join('&')}`;
        }

        const res = await fetch(url);
        if (res.ok) {
            products = await res.json();
            renderProducts();
        }
    } catch (err) {
        console.error("Error fetching products:", err);
    }
}

async function fetchFarmersList() {
    try {
        const res = await fetch(`/api/farmers`);
        if (res.ok) {
            farmers = await res.json();
            const select = document.getElementById("selectActiveFarmer");
            // Save current selection value
            const currentSelVal = select.value;
            select.innerHTML = `<option value="" disabled selected>-- Select Registered Farmer --</option>`;
            farmers.forEach(f => {
                const opt = document.createElement("option");
                opt.value = f.govt_farmer_id;
                opt.textContent = `${f.name} (ID: ${f.govt_farmer_id})`;
                select.appendChild(opt);
            });
            if (currentSelVal) {
                select.value = currentSelVal;
            }
        }
    } catch (err) {
        console.error("Error fetching farmers:", err);
    }
}

// Render catalog
function renderProducts() {
    const grid = document.getElementById("productsGrid");
    grid.innerHTML = "";

    if (products.length === 0) {
        grid.innerHTML = `<div class="text-center mt-4" style="grid-column: 1/-1; color: var(--text-muted);">No products found.</div>`;
        return;
    }

    products.forEach(p => {
        const card = document.createElement("div");
        card.className = "product-card";

        const hasStock = p.stock > 0;
        const stockClass = p.stock === 0 ? "stock-out" : (p.stock < 10 ? "stock-low" : "stock-ok");
        const stockText = p.stock === 0 ? getTranslationText("outOfStock") : `${getTranslationText("inStock")}: ${p.stock} ${p.unit}`;

        card.innerHTML = `
            <div class="product-image-container">
                <img class="product-image" src="${p.image_url}" alt="${p.title}" onerror="this.src='https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&q=80&w=400'">
                <span class="category-badge">${p.category}</span>
                <span class="farmer-badge">${getTranslationText("soldBy")}: ${p.farmer_name || 'Farmer'}</span>
            </div>
            <div class="product-info">
                <h3 class="product-title">${p.title}</h3>
                <p class="product-desc">${p.description || ''}</p>
                <div class="product-meta">
                    <span class="product-price">${getTranslationText("priceUnit", {unit: p.unit})}</span>
                    <span class="product-stock ${stockClass}">${stockText}</span>
                </div>
                <button class="btn-add-cart" ${hasStock ? '' : 'disabled'} onclick="addToCart(${p.id})">
                    <span>🛒</span> ${getTranslationText("addToCart")}
                </button>
            </div>
        `;
        
        // Setup price dynamic override (due to complex template tag)
        card.querySelector(".product-price").textContent = `₹${p.price}/${p.unit}`;
        
        grid.appendChild(card);
    });
}

// Cart System
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existing = cart.find(item => item.product_id === productId);
    if (existing) {
        if (existing.quantity < product.stock) {
            existing.quantity++;
        }
    } else {
        cart.push({
            product_id: product.id,
            title: product.title,
            price: product.price,
            unit: product.unit,
            stock: product.stock,
            quantity: 1
        });
    }
    renderCart();
}

function changeCartQty(productId, delta) {
    const item = cart.find(item => item.product_id === productId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
        cart = cart.filter(i => i.product_id !== productId);
    } else if (item.quantity > item.stock) {
        item.quantity = item.stock;
    }
    renderCart();
}

function renderCart() {
    const container = document.getElementById("cartItems");
    container.innerHTML = "";

    if (cart.length === 0) {
        container.innerHTML = `<p class="text-center" data-translate="cartEmpty" style="color:var(--text-muted); padding:1rem 0;">${getTranslationText("cartEmpty")}</p>`;
        document.getElementById("cartSummaryBlock").classList.add("hidden");
        document.getElementById("checkoutActionBtn").disabled = true;
        return;
    }

    document.getElementById("cartSummaryBlock").classList.remove("hidden");
    document.getElementById("checkoutActionBtn").disabled = false;

    let subtotal = 0;
    cart.forEach(item => {
        const cost = item.price * item.quantity;
        subtotal += cost;

        const row = document.createElement("div");
        row.className = "cart-item";
        row.innerHTML = `
            <div class="cart-item-detail">
                <h4>${item.title}</h4>
                <p>₹${item.price} / ${item.unit}</p>
            </div>
            <div class="cart-qty-ctrl">
                <button class="qty-btn" onclick="changeCartQty(${item.product_id}, -1)">-</button>
                <span class="qty-val">${item.quantity}</span>
                <button class="qty-btn" onclick="changeCartQty(${item.product_id}, 1)">+</button>
            </div>
        `;
        container.appendChild(row);
    });

    const platformFeeVal = subtotal * 0.05;
    const directPayoutVal = subtotal - platformFeeVal;

    document.getElementById("cartSubtotal").textContent = `₹${subtotal.toFixed(2)}`;
    document.getElementById("cartPlatformFee").textContent = `₹${platformFeeVal.toFixed(2)}`;
    document.getElementById("cartDirectPayout").textContent = `₹${directPayoutVal.toFixed(2)}`;
    document.getElementById("cartTotal").textContent = `₹${subtotal.toFixed(2)}`;
}

// Payment Checkout Process
function openCheckoutModal() {
    if (cart.length === 0) return;

    let total = 0;
    cart.forEach(i => total += i.price * i.quantity);

    // Render payment sum details
    document.getElementById("paySumGross").textContent = `₹${total.toFixed(2)}`;
    document.getElementById("paySumFee").textContent = `₹${(total * 0.05).toFixed(2)}`;
    document.getElementById("paySumPayout").textContent = `₹${(total * 0.95).toFixed(2)}`;

    // Set checkout form button text
    const btn = document.getElementById("btnPayUPI");
    btn.textContent = getTranslationText("payNowBtn", {amount: total.toFixed(2)});

    // Generate simulated QR code SVG
    document.getElementById("qrPlaceholder").innerHTML = generateMockQRSVG();

    // Reset checkout states
    document.getElementById("paymentFormContainer").classList.remove("hidden");
    document.getElementById("paymentProcessing").classList.add("hidden");
    document.getElementById("paymentSuccessScreen").classList.add("hidden");

    // Open Modal
    document.getElementById("checkoutModal").classList.add("active");
}

function closeModal() {
    document.getElementById("checkoutModal").classList.remove("active");
}

async function executeDirectPayment() {
    const buyerName = document.getElementById("buyerName").value.trim();
    const buyerPhone = document.getElementById("buyerPhone").value.trim();

    if (!buyerName || !buyerPhone) {
        alert(getTranslationText("alertFillFields"));
        return;
    }

    // Hide input form, show loading spinner
    document.getElementById("paymentFormContainer").classList.add("hidden");
    document.getElementById("paymentProcessing").classList.remove("hidden");

    // Prepare API data
    const requestData = {
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
    };

    try {
        // Post to checkout settlement API
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (response.ok) {
            const data = await response.json();
            
            // Wait 2 seconds to simulate banking network split delay
            setTimeout(() => {
                showSuccessCheckoutState(data);
            }, 2000);
        } else {
            const error = await response.json();
            alert(error.detail || "Transaction failed.");
            closeModal();
        }
    } catch (err) {
        console.error("Checkout error:", err);
        alert("Server connection failed.");
        closeModal();
    }
}

function showSuccessCheckoutState(data) {
    document.getElementById("paymentProcessing").classList.add("hidden");
    document.getElementById("paymentSuccessScreen").classList.remove("hidden");

    // Display transaction reference
    document.getElementById("txnRefId").textContent = data.payment_gateway_ref;

    // Display settlement accounts breakdown
    const container = document.getElementById("settlementBreakdownList");
    container.innerHTML = "";

    data.settlements.forEach(s => {
        const item = document.createElement("div");
        item.className = "settlement-item";
        item.innerHTML = `
            <div class="settlement-item-header">
                <span>${s.product_title} (${getTranslationText("soldBy")}: ${s.farmer_name})</span>
                <span>₹${s.gross_amount_inr.toFixed(2)}</span>
            </div>
            <div class="settlement-bank">
                Direct Credit to Bank: <strong>${s.bank_name} (${s.account_number})</strong> | IFSC: ${s.ifsc}
            </div>
            <div class="settlement-amount-breakdown">
                <span>Platform Fee (5%): ₹${s.platform_fee_inr.toFixed(2)}</span>
                <span style="color:var(--primary-light); font-weight:bold;">Net Credited (95%): ₹${s.net_credited_inr.toFixed(2)}</span>
            </div>
        `;
        container.appendChild(item);
    });

    // Clear cart and update store lists
    cart = [];
    renderCart();
    fetchProducts();
}

function generateMockQRSVG() {
    let svg = `<svg class="qr-code-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect x="5" y="5" width="25" height="25" fill="#1e5c36" stroke="#fff" stroke-width="2"/>`;
    svg += `<rect x="10" y="10" width="15" height="15" fill="#fff"/>`;
    svg += `<rect x="13" y="13" width="9" height="9" fill="#1e5c36"/>`;

    svg += `<rect x="70" y="5" width="25" height="25" fill="#1e5c36" stroke="#fff" stroke-width="2"/>`;
    svg += `<rect x="75" y="10" width="15" height="15" fill="#fff"/>`;
    svg += `<rect x="78" y="13" width="9" height="9" fill="#1e5c36"/>`;

    svg += `<rect x="5" y="70" width="25" height="25" fill="#1e5c36" stroke="#fff" stroke-width="2"/>`;
    svg += `<rect x="10" y="75" width="15" height="15" fill="#fff"/>`;
    svg += `<rect x="13" y="78" width="9" height="9" fill="#1e5c36"/>`;

    for (let r = 35; r < 65; r += 5) {
        for (let c = 5; c < 95; c += 5) {
            if (Math.random() > 0.4) {
                svg += `<rect x="${c}" y="${r}" width="4" height="4" fill="#1e5c36"/>`;
            }
        }
    }
    for (let r = 5; r < 30; r += 5) {
        for (let c = 35; c < 65; c += 5) {
            if (Math.random() > 0.45) {
                svg += `<rect x="${c}" y="${r}" width="4" height="4" fill="#1e5c36"/>`;
            }
        }
    }
    for (let r = 70; r < 95; r += 5) {
        for (let c = 35; c < 95; c += 5) {
            if (Math.random() > 0.45) {
                svg += `<rect x="${c}" y="${r}" width="4" height="4" fill="#1e5c36"/>`;
            }
        }
    }
    svg += `<rect x="42" y="42" width="16" height="16" rx="4" fill="#f0a500"/>`;
    svg += `<text x="50" y="52" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">₹</text>`;
    svg += `</svg>`;
    return svg;
}

// Farmer Dashboard Control
async function registerFarmer() {
    const govtId = document.getElementById("farmerGovtId").value.trim();
    const name = document.getElementById("farmerName").value.trim();
    const phone = document.getElementById("farmerPhone").value.trim();
    const bank = document.getElementById("farmerBank").value.trim();
    const account = document.getElementById("farmerAccount").value.trim();
    const ifsc = document.getElementById("farmerIfsc").value.trim();

    if (!govtId || !name || !phone || !bank || !account || !ifsc) {
        alert(getTranslationText("alertFillFields"));
        return;
    }

    const payload = {
        govt_farmer_id: govtId,
        name: name,
        phone: phone,
        bank_name: bank,
        account_number: account,
        ifsc_code: ifsc
    };

    try {
        const response = await fetch('/api/farmers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert(getTranslationText("alertRegSuccess"));
            document.getElementById("farmerRegForm").reset();
            await fetchFarmersList();
            
            // Auto login to new dashboard
            activeFarmerId = govtId;
            loadFarmerDashboard(activeFarmerId);
        } else {
            const err = await response.json();
            alert(err.detail || "Registration failed.");
        }
    } catch (err) {
        console.error("Farmer register error:", err);
    }
}

async function loadFarmerDashboard(farmerId) {
    try {
        const resFarmer = await fetch(`/api/farmers/${farmerId}`);
        if (!resFarmer.ok) {
            alert(getTranslationText("errFarmerNotFound"));
            return;
        }
        const farmer = await resFarmer.json();

        // Show dashboard panel, hide login panel
        document.getElementById("farmerLoginPanel").classList.add("hidden");
        document.getElementById("farmerDashboardPanel").classList.remove("hidden");

        // Populate Farmer meta text
        document.getElementById("dashFarmerName").textContent = farmer.name;
        document.getElementById("dashFarmerGovtId").textContent = farmer.govt_farmer_id;
        document.getElementById("dashBankName").textContent = farmer.bank_name;
        document.getElementById("dashAccNumber").textContent = `******${farmer.account_number.slice(-4)}`;
        document.getElementById("dashIfsc").textContent = farmer.ifsc_code;
        document.getElementById("dashBalance").textContent = `₹${farmer.balance.toFixed(2)}`;

        // Load specific products listed by farmer
        renderFarmerProducts(farmer.govt_farmer_id);

        // Load settlements ledger
        loadSettlementsLedger(farmer.govt_farmer_id);
    } catch (err) {
        console.error("Error loading dashboard:", err);
    }
}

async function renderFarmerProducts(farmerId) {
    const list = document.getElementById("farmerProductsList");
    list.innerHTML = "";

    try {
        const res = await fetch(`/api/products`);
        if (res.ok) {
            const allProd = await res.json();
            const farmerProd = allProd.filter(p => p.farmer_id === farmerId);

            if (farmerProd.length === 0) {
                list.innerHTML = `<li style="color:var(--text-muted); font-size:0.85rem; padding:0.5rem 0;">No active listings. Add a product below to start.</li>`;
                return;
            }

            farmerProd.forEach(p => {
                const li = document.createElement("li");
                li.style.display = "flex";
                li.style.justify = "space-between";
                li.style.padding = "0.5rem 0";
                li.style.borderBottom = "1px dashed var(--border)";
                li.style.fontSize = "0.85rem";
                li.innerHTML = `
                    <span><strong>${p.title}</strong> (${p.category})</span>
                    <span>₹${p.price}/${p.unit} | Stock: ${p.stock} ${p.unit}</span>
                `;
                list.appendChild(li);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadSettlementsLedger(farmerId) {
    const body = document.getElementById("ledgerTableBody");
    body.innerHTML = "";

    try {
        const res = await fetch(`/api/transactions?farmer_id=${encodeURIComponent(farmerId)}`);
        if (res.ok) {
            const txns = await res.json();

            if (txns.length === 0) {
                body.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--text-muted);">No sales settlements yet.</td></tr>`;
                return;
            }

            txns.forEach(t => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>#${t.id}</td>
                    <td>${t.created_at}</td>
                    <td>${t.product_title}</td>
                    <td>${t.buyer_name}</td>
                    <td>₹${t.amount.toFixed(2)}</td>
                    <td style="color:#e53e3e;">₹${t.platform_fee.toFixed(2)}</td>
                    <td style="color:var(--primary-light); font-weight:bold;">₹${t.farmer_share.toFixed(2)}</td>
                    <td><span class="badge-payment">${getTranslationText("txnCompleted")}</span></td>
                `;
                body.appendChild(tr);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

async function listProduct() {
    if (!activeFarmerId) return;

    const title = document.getElementById("prodTitle").value.trim();
    const category = document.getElementById("prodCategory").value;
    const price = parseFloat(document.getElementById("prodPrice").value);
    const unit = document.getElementById("prodUnit").value.trim();
    const stock = parseFloat(document.getElementById("prodStock").value);
    const imgUrl = document.getElementById("prodImgUrl").value.trim();
    const desc = document.getElementById("prodDesc").value.trim();

    if (!title || !category || isNaN(price) || !unit || isNaN(stock)) {
        alert(getTranslationText("alertFillFields"));
        return;
    }

    const payload = {
        farmer_id: activeFarmerId,
        title: title,
        category: category,
        price: price,
        unit: unit,
        stock: stock,
        image_url: imgUrl || null,
        description: desc || null
    };

    try {
        const res = await fetch(`/api/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert(getTranslationText("alertAddProductSuccess"));
            document.getElementById("addProductForm").reset();
            // Reload dashboard lists and backend products
            loadFarmerDashboard(activeFarmerId);
            fetchProducts();
        } else {
            const err = await res.json();
            alert(err.detail || "Listing failed.");
        }
    } catch (err) {
        console.error(err);
    }
}
