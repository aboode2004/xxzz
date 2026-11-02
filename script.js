const SUPABASE_URL = 'https://mixtajmjaitfcqsvflgl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-y-8QOaGJ6RzC4UxeG5ATw_LxVZByAo';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null, allProducts = [], allOrders = [], userWishlistIds = [], userAddresses = [];
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let recentViews = JSON.parse(localStorage.getItem('recentViews') || '[]');
let activeProductId = null, modalQty = 1, appliedDiscountAmount = 0, appliedCouponCode = "";
let previousOrderCount = 0;
let tempEmailForOtp = "";

function playOrderSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) { console.log('Audio Context Error:', e); }
}

function showPage(pageName) {
    ['home', 'auth', 'profile', 'admin'].forEach(p => document.getElementById('page-' + p).classList.add('hidden'));
    document.getElementById('page-' + pageName).classList.remove('hidden');
    if(pageName === 'profile') { switchUserTab('orders'); loadProfileData(); }
    if(pageName === 'admin') { switchAdminTab('products'); loadAdminData(); }
    if(pageName === 'home') { window.scrollTo(0,0); renderRecentlyViewed(); }
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}

async function initAuth() {
    const { data: { session } } = await db.auth.getSession();
    setUser(session ? session.user : null);
    db.auth.onAuthStateChange((_e, session) => setUser(session ? session.user : null));
}

function setUser(user) {
    currentUser = user;
    const nav = document.getElementById('navActions');
    
    // زر تواصل مع الدعم الفني في الأعلى
    const supportBtn = `<button class="nav-btn" onclick="window.open('https://wa.me/9647725372995', '_blank')" title="تواصل مع الدعم الفني"><i class="fab fa-whatsapp"></i> تواصل مع الدعم الفني</button>`;

    if (user) {
        const username = user.user_metadata?.username || 'مستخدم';
        const isAdmin = user.email === '2004oopp202326@gmail.com';
        nav.innerHTML = `${supportBtn}
                         <button class="nav-btn" onclick="showPage('profile')"><i class="fas fa-user"></i> ${username}</button>
                         ${isAdmin ? `<button class="nav-btn nav-btn-login" onclick="showPage('admin')"><i class="fas fa-cog"></i> الإدارة</button>` : ''}
                         <button class="nav-btn nav-btn-cart" onclick="toggleCart()"><i class="fas fa-shopping-cart"></i> <span class="cart-count" id="cartCount">0</span></button>`;
        loadWishlist(); loadAddresses();
    } else {
        userWishlistIds = []; userAddresses = [];
        nav.innerHTML = `${supportBtn}
                         <button class="nav-btn nav-btn-login" onclick="showPage('auth')">دخول</button>
                         <button class="nav-btn nav-btn-cart" onclick="toggleCart()"><i class="fas fa-shopping-cart"></i> <span class="cart-count" id="cartCount">0</span></button>`;
    }
    updateCartUI();
}

function switchAuthTab(t) {
    document.getElementById('tabLogin').classList.toggle('active', t === 'login');
    document.getElementById('tabSignup').classList.toggle('active', t === 'signup');
    document.getElementById('formLogin').classList.toggle('hidden', t !== 'login');
    document.getElementById('formSignup').classList.toggle('hidden', t !== 'signup');
}

async function sendEmailOTP(email) {
    tempEmailForOtp = email;
    const { error } = await db.auth.signInWithOtp({ email: email });
    if (error) {
        showToast('خطأ في إرسال الرمز: ' + error.message, 'error');
        return false;
    } else {
        showToast('تم إرسال رمز التأكيد إلى بريدك الإلكتروني 📩');
        return true;
    }
}

async function verifyEmailOTP(tokenCode) {
    const { data, error } = await db.auth.verifyOtp({
        email: tempEmailForOtp,
        token: tokenCode,
        type: 'email'
    });

    if (error) {
        showToast('رمز التأكيد غير صحيح أو انتهت صلاحيته', 'error');
    } else {
        showToast('تم تسجيل الدخول بنجاح! 🎉');
        setUser(data.user);
        showPage('home');
    }
}

async function handleLogin(e) {
    e.preventDefault(); 
    const btn = document.getElementById('btnLogin'); 
    btn.disabled = true; 
    btn.textContent = 'جاري...';
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!password) {
        await sendEmailOTP(email);
        btn.disabled = false; 
        btn.textContent = 'دخول';
        return;
    }

    const { error } = await db.auth.signInWithPassword({ email: email, password: password });
    if (error) { 
        showToast('خطأ: ' + (error.message === 'Invalid login credentials' ? 'البريد أو كلمة المرور غير صحيحة' : error.message), 'error'); 
        btn.disabled = false; 
        btn.textContent = 'دخول'; 
    } else { 
        showToast('مرحباً!'); 
        showPage('home'); 
    }
}

function generateUsername(name) {
    const cleanName = name.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return cleanName ? `${cleanName}_${randomNum}` : `user_${randomNum}`;
}

async function handleSignup(e) {
    e.preventDefault(); const btn = document.getElementById('btnSignup'); btn.disabled = true; btn.textContent = 'جاري...';
    const name = document.getElementById('signupName').value;
    const username = generateUsername(name);
    const { error } = await db.auth.signUp({ email: document.getElementById('signupEmail').value, password: document.getElementById('signupPassword').value, options: { data: { full_name: name, username: username } } });
    if (error) { showToast('خطأ: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'إنشاء حساب'; } 
    else { showToast('تم إنشاء الحساب! اسمك: ' + username); showPage('home'); }
}

async function handleLogout() { await db.auth.signOut(); showPage('home'); showToast('تم الخروج'); }

async function handleChangePassword(e) {
    e.preventDefault();
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmPassword').value;
    const btn = document.getElementById('btnChangePassword');

    if (newPass !== confirmPass) { showToast('كلمتا المرور غير متطابقتين', 'error'); return; }
    btn.disabled = true; btn.textContent = 'جاري التحديث...';
    const { error } = await db.auth.updateUser({ password: newPass });
    if (error) { showToast('خطأ: ' + error.message, 'error'); } 
    else { showToast('تم تغيير كلمة المرور بنجاح! 🔒'); document.getElementById('changePasswordForm').reset(); }
    btn.disabled = false; btn.textContent = 'تحديث كلمة المرور';
}

async function loadAddresses() {
    if(!currentUser) return;
    const { data } = await db.from('addresses').select('*').eq('user_id', currentUser.id);
    userAddresses = data || [];
    const select = document.getElementById('savedAddressSelect');
    if(select) {
        select.innerHTML = '<option value="">-- اختر عنواناً --</option>' + userAddresses.map(a => `<option value="${a.id}">${a.title} - ${a.city}</option>`).join('');
    }
    const addrList = document.getElementById('addressesList');
    if(addrList) {
        addrList.innerHTML = userAddresses.length ? userAddresses.map(a => `
            <div class="address-card">
                <div><b>${a.title}</b><br><small>${a.city} - ${a.details}</small></div>
                <button onclick="deleteAddress(${a.id})" class="btn-delete"><i class="fas fa-trash"></i></button>
            </div>
        `).join('') : '<p>لا توجد عناوين.</p>';
    }
}

async function submitNewAddress(e) {
    e.preventDefault();
    await db.from('addresses').insert([{ user_id: currentUser.id, title: document.getElementById('addrTitle').value, city: document.getElementById('addrCity').value, details: document.getElementById('addrDetails').value }]);
    document.getElementById('addAddressForm').reset(); showToast('تمت الإضافة'); loadAddresses();
}

async function deleteAddress(id) { await db.from('addresses').delete().eq('id', id); showToast('تم الحذف'); loadAddresses(); }

async function loadWishlist() {
    if(!currentUser) return;
    const { data } = await db.from('wishlist').select('product_id').eq('user_id', currentUser.id);
    userWishlistIds = data ? data.map(w => w.product_id) : [];
    renderProducts(allProducts);
}

async function toggleWishlist(id, event) {
    event.stopPropagation();
    if (!currentUser) { showToast('سجل دخول أولاً', 'error'); showPage('auth'); return; }
    if (userWishlistIds.includes(id)) {
        await db.from('wishlist').delete().eq('user_id', currentUser.id).eq('product_id', id);
        userWishlistIds = userWishlistIds.filter(x => x !== id); showToast('تمت الإزالة');
    } else {
        await db.from('wishlist').insert([{ user_id: currentUser.id, product_id: id }]);
        userWishlistIds.push(id); showToast('تمت الإضافة للمفضلة ❤️');
    }
    renderProducts(allProducts);
    if(!document.getElementById('userWishlistSection').classList.contains('hidden')) loadWishlistItems();
}

function switchUserTab(tab) {
    document.getElementById('tabUserOrders').classList.toggle('active', tab === 'orders');
    document.getElementById('tabUserWishlist').classList.toggle('active', tab === 'wishlist');
    document.getElementById('tabUserAddresses').classList.toggle('active', tab === 'addresses');
    document.getElementById('tabUserSecurity').classList.toggle('active', tab === 'security');
    
    document.getElementById('userOrdersSection').classList.toggle('hidden', tab !== 'orders');
    document.getElementById('userWishlistSection').classList.toggle('hidden', tab !== 'wishlist');
    document.getElementById('userAddressesSection').classList.toggle('hidden', tab !== 'addresses');
    document.getElementById('userSecuritySection').classList.toggle('hidden', tab !== 'security');

    if(tab === 'wishlist') loadWishlistItems();
}

async function loadWishlistItems() {
    const grid = document.getElementById('wishlistGrid');
    if (userWishlistIds.length === 0) { grid.innerHTML = '<p>لا توجد منتجات.</p>'; return; }
    const wishProducts = allProducts.filter(p => userWishlistIds.includes(p.id));
    grid.innerHTML = wishProducts.map(p => `
        <div class="product-card" onclick="openProduct(${p.id})">
            <div class="product-image" style="${p.image_url ? `background-image:url('${p.image_url}');` : ''}">${!p.image_url ? (p.icon || '📦') : ''}</div>
            <div class="product-title">${p.name}</div>
            <div class="product-price">${Number(p.price).toLocaleString()} د.ع</div>
            <button class="add-to-cart" onclick="event.stopPropagation(); addToCart(${p.id})">أضف للسلة</button>
        </div>
    `).join('');
}

async function loadProducts() {
    const { data } = await db.from('products').select('*');
    allProducts = data || []; renderProducts(allProducts); renderRecentlyViewed();
}

function renderProducts(list) {
    const g = document.getElementById('productsGrid');
    if (!list.length) { g.innerHTML = '<p>لا توجد منتجات</p>'; return; }
    g.innerHTML = list.map(p => {
        let finalPrice = Number(p.price), priceHtml = `${finalPrice.toLocaleString('ar-IQ')} د.ع`, badgeHtml = '';
        if(p.discount > 0) {
            finalPrice = finalPrice - (finalPrice * (p.discount / 100));
            priceHtml = `<span class="old-price">${Number(p.price).toLocaleString('ar-IQ')}</span> ${finalPrice.toLocaleString('ar-IQ')} د.ع`;
            badgeHtml = `<div class="discount-badge">${p.discount}% خصم</div>`;
        }
        const isWish = userWishlistIds.includes(p.id);
        return `
        <div class="product-card" onclick="openProduct(${p.id})">
            ${badgeHtml}
            <button class="wishlist-btn ${isWish ? 'active' : ''}" onclick="toggleWishlist(${p.id}, event)"><i class="${isWish ? 'fas' : 'far'} fa-heart"></i></button>
            <div class="product-image" style="${p.image_url ? `background-image:url('${p.image_url}');` : ''}">${!p.image_url ? (p.icon || '📦') : ''}</div>
            <div class="product-title">${p.name}</div>
            <div style="color:#ffc107; font-size:0.8rem; margin-bottom:5px;">${'⭐'.repeat(Math.round(p.rating || 5))}</div>
            <div class="product-price">${priceHtml}</div>
            <button class="add-to-cart" onclick="event.stopPropagation(); addToCart(${p.id})">أضف للسلة</button>
        </div>`;
    }).join('');
}

function filterProducts() { const term = document.getElementById('searchInput').value.toLowerCase(); renderProducts(allProducts.filter(p => p.name.toLowerCase().includes(term))); }
function filterByPrice(type) { let s = [...allProducts]; if(type === 'low') s.sort((a, b) => Number(a.price) - Number(b.price)); if(type === 'high') s.sort((a, b) => Number(b.price) - Number(a.price)); renderProducts(s); }
function filterByRating() { let s = [...allProducts]; s.sort((a, b) => (b.rating || 0) - (a.rating || 0)); renderProducts(s); }

function addToRecentViews(id) {
    recentViews = recentViews.filter(x => x !== id); recentViews.unshift(id);
    if(recentViews.length > 5) recentViews.pop();
    localStorage.setItem('recentViews', JSON.stringify(recentViews));
}

function renderRecentlyViewed() {
    const section = document.getElementById('recentlyViewedSection'), list = document.getElementById('recentlyViewedList');
    if(recentViews.length === 0) { section.classList.add('hidden'); return; }
    const prods = recentViews.map(id => allProducts.find(p => p.id === id)).filter(p => p);
    if(prods.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    list.innerHTML = prods.map(p => `<div class="product-card" onclick="openProduct(${p.id})"><div class="product-image">${p.icon || '📦'}</div><div class="product-title">${p.name}</div><div class="product-price">${Number(p.price).toLocaleString()}</div></div>`).join('');
}

async function openProduct(id) {
    const p = allProducts.find(x => x.id === id); if (!p) return;
    activeProductId = id; modalQty = 1; document.getElementById('modalQty').textContent = modalQty;
    addToRecentViews(id);
    const iconDiv = document.getElementById('modalIcon');
    if (p.image_url) { iconDiv.style.backgroundImage = `url('${p.image_url}')`; iconDiv.textContent = ''; }
    else { iconDiv.style.backgroundImage = 'none'; iconDiv.textContent = p.icon || '📦'; }
    document.getElementById('modalTitle').textContent = p.name;
    let priceText = `${Number(p.price).toLocaleString('ar-IQ')} د.ع`;
    if(p.discount > 0) { let fp = Number(p.price) - (Number(p.price) * (p.discount / 100)); priceText = `<span class="old-price">${Number(p.price).toLocaleString('ar-IQ')}</span> ${fp.toLocaleString('ar-IQ')} د.ع`; }
    document.getElementById('modalPrice').innerHTML = priceText;
    document.getElementById('productModal').classList.add('active');
    document.getElementById('reviewForm').classList.toggle('hidden', !currentUser);
    document.getElementById('reviewsList').innerHTML = 'جاري التحميل...';
    const { data: reviews } = await db.from('reviews').select('*').eq('product_id', id);
    document.getElementById('reviewsList').innerHTML = reviews && reviews.length ? reviews.map(r => `<div class="review-item"><div style="display:flex;justify-content:space-between;"><b>${r.user_name}</b><span class="stars">${'⭐'.repeat(r.rating)}</span></div><p>${r.comment}</p></div>`).join('') : '<p>لا توجد تقييمات.</p>';
    const similar = allProducts.filter(x => x.id !== p.id).slice(0, 2);
    document.getElementById('similarProductsList').innerHTML = similar.map(s => `<div style="background:var(--gray-light); padding:8px; border-radius:8px; cursor:pointer;" onclick="openProduct(${s.id})"><div style="height:60px; font-size:2rem; text-align:center;">${s.icon || '📦'}</div><div style="font-size:0.8rem; font-weight:bold;">${s.name}</div><div style="font-size:0.8rem; color:var(--orange);">${Number(s.price).toLocaleString()}</div></div>`).join('');
}

function changeModalQty(delta) { if (modalQty + delta < 1) return; modalQty += delta; document.getElementById('modalQty').textContent = modalQty; }

function addToCartFromModal() {
    const p = allProducts.find(x => x.id === activeProductId);
    if(p.stock <= 0) { showToast('عذراً، هذا المنتج غير متوفر حالياً', 'error'); return; }
    const item = cart.find(x => x.id === activeProductId);
    let fp = Number(p.price); if(p.discount > 0) fp -= (fp * (p.discount / 100));
    if (item) item.qty += modalQty; else cart.push({ ...p, price: fp, qty: modalQty });
    saveCart(); updateCartUI(); showToast(`تمت الإضافة`); closeModal('productModal');
}

function buyNowFromModal() { addToCartFromModal(); openCheckout(); }

async function submitReview(e) {
    e.preventDefault();
    await db.from('reviews').insert([{ product_id: activeProductId, user_id: currentUser.id, user_name: currentUser.user_metadata?.full_name || 'مستخدم', rating: parseInt(document.getElementById('reviewRating').value), comment: document.getElementById('reviewComment').value }]);
    showToast('شكراً!'); openProduct(activeProductId); document.getElementById('reviewForm').reset();
}

function toggleCart() { document.getElementById('cartSidebar').classList.toggle('active'); }

function addToCart(id) {
    const p = allProducts.find(x => x.id === id);
    if(p.stock <= 0) { showToast('نفدت الكمية', 'error'); return; }
    const item = cart.find(x => x.id === id);
    let fp = Number(p.price); if(p.discount > 0) fp -= (fp * (p.discount / 100));
    if (item) item.qty++; else cart.push({ ...p, price: fp, qty: 1 });
    saveCart(); updateCartUI(); showToast('تمت الإضافة');
}

function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }

function updateCartUI() {
    const countEl = document.getElementById('cartCount'); if (countEl) countEl.textContent = cart.reduce((s, i) => s + i.qty, 0);
    const container = document.getElementById('cartItems'), footer = document.getElementById('cartFooter');
    if (!cart.length) { container.innerHTML = '<p style="text-align:center;">السلة فارغة</p>'; footer.style.display = 'none'; return; }
    container.innerHTML = cart.map(i => `<div class="cart-item-row"><div><b>${i.name}</b><br><span style="color:var(--orange)">${(i.price * i.qty).toLocaleString()} د.ع</span></div><div style="display:flex;align-items:center;gap:5px;"><button onclick="changeQty(${i.id}, -1)">-</button><span>${i.qty}</span><button onclick="changeQty(${i.id}, 1)">+</button></div></div>`).join('');
    document.getElementById('cartTotal').textContent = cart.reduce((s, i) => s + (i.price * i.qty), 0).toLocaleString() + ' د.ع';
    footer.style.display = 'block';
}

function changeQty(id, delta) { const item = cart.find(x => x.id === id); if (!item) return; item.qty += delta; if (item.qty <= 0) cart = cart.filter(x => x.id !== id); saveCart(); updateCartUI(); }

function openCheckout() { if (!currentUser) { showToast('سجل دخول أولاً', 'error'); toggleCart(); showPage('auth'); return; } appliedDiscountAmount = 0; document.getElementById('couponCode').value = ""; updateChkTotals(); document.getElementById('checkoutModal').classList.add('active'); toggleCart(); }

function applyCoupon() { const code = document.getElementById('couponCode').value.trim().toUpperCase(); appliedDiscountAmount = 0; if(code === "NINEVEH10") { appliedDiscountAmount = 0.10; appliedCouponCode = code; showToast('خصم 10%!'); } else if(code === "FREE5") { appliedDiscountAmount = 5000; appliedCouponCode = code; showToast('خصم 5000 د.ع!'); } else { showToast('كود غير صحيح', 'error'); } updateChkTotals(); }

function updateChkTotals() {
    const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
    let dv = 0; if(appliedDiscountAmount < 1 && appliedDiscountAmount > 0) dv = subtotal * appliedDiscountAmount; else dv = appliedDiscountAmount;
    let total = subtotal - dv; if(total < 0) total = 0;
    document.getElementById('chkSubtotal').textContent = subtotal.toLocaleString() + ' د.ع';
    document.getElementById('chkDiscount').textContent = dv > 0 ? `- ${dv.toLocaleString()} د.ع` : '0 د.ع';
    document.getElementById('chkTotal').textContent = total.toLocaleString() + ' د.ع (يضاف التوصيل لاحقاً)';
}

async function submitOrder(e) {
    e.preventDefault(); const btn = document.getElementById('btnSubmitOrder'); btn.disabled = true;
    const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
    let dv = 0; if(appliedDiscountAmount < 1 && appliedDiscountAmount > 0) dv = subtotal * appliedDiscountAmount; else dv = appliedDiscountAmount;
    let ft = subtotal - dv; if(ft < 0) ft = 0;
    
    const { data, error } = await db.from('orders').insert([{ 
        user_id: currentUser.id, 
        total: ft, 
        status: 'pending', 
        customer_name: document.getElementById('orderName').value, 
        customer_phone: document.getElementById('orderPhone').value, 
        customer_address: document.getElementById('orderAddress').value, 
        customer_city: 'نينوى',
        coupon_used: appliedCouponCode,
        delivery_cost: 0,
        delivery_time: 'قيد التحديد'
    }]).select();
    
    if (error) { showToast(error.message, 'error'); btn.disabled = false; } 
    else { document.getElementById('invoiceId').textContent = '#' + data[0].id; document.getElementById('checkoutModal').classList.remove('active'); document.getElementById('invoiceModal').classList.add('active'); cart = []; saveCart(); updateCartUI(); btn.disabled = false; }
}

async function userCancelOrder(orderId) {
    if(!confirm('هل أنت متأكد من إلغاء هذا الطلب؟')) return;
    const { error } = await db.from('orders').update({ status: 'rejected' }).eq('id', orderId).eq('user_id', currentUser.id);
    if(error) { showToast('تعذر إلغاء الطلب: ' + error.message, 'error'); }
    else { showToast('تم إلغاء الطلب بنجاح'); loadProfileData(); }
}

async function loadProfileData() {
    if (!currentUser) return;
    document.getElementById('profileUsername').textContent = '@' + (currentUser.user_metadata?.username || 'مستخدم');
    document.getElementById('profileName').textContent = currentUser.user_metadata?.full_name || 'غير محدد';
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileAvatar').textContent = (currentUser.user_metadata?.username || 'U').charAt(0).toUpperCase();
    const { data } = await db.from('orders').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    document.getElementById('ordersList').innerHTML = data && data.length ? data.map(o => {
        let s1 = 'active', s2 = '', s3 = '', isRejected = o.status === 'rejected';
        if(isRejected) { s1 = ''; s2 = ''; s3 = ''; }
        else { if(o.status === 'shipped') s2 = 'active'; if(o.status === 'delivered') { s2 = 'active'; s3 = 'active'; } }
        
        let trackHtml = isRejected 
            ? '<div style="color:var(--red); font-weight:bold; text-align:center; margin-top:10px;">❌ تم إلغاء الطلب</div>' 
            : `<div class="status-track"><div class="status-step ${s1}"><div class="status-dot"></div>انتظار</div><div class="status-step ${s2}"><div class="status-dot"></div>توصيل (${o.delivery_time || 'قيد التحديد'})</div><div class="status-step ${s3}"><div class="status-dot"></div>تم</div></div>`;

        let cancelBtnHtml = (o.status === 'pending') ? `<button onclick="userCancelOrder(${o.id})" class="btn-delete" style="margin-top:10px; width:100%;"><i class="fas fa-times-circle"></i> إلغاء الطلب الآن</button>` : '';
        let deliveryInfo = (o.delivery_cost && o.delivery_cost > 0) ? `<div style="margin-top:5px; color:var(--blue);">تكلفة التوصيل: ${Number(o.delivery_cost).toLocaleString()} د.ع (${o.delivery_time})</div>` : '';
        
        return `<div style="background:white; padding:15px; border-radius:10px; margin-bottom:15px;"><div style="display:flex; justify-content:space-between; border-bottom:1px solid #ddd; padding-bottom:10px;"><b>طلب #${o.id}</b><b style="color:var(--orange)">الإجمالي: ${(o.total + (o.delivery_cost || 0)).toLocaleString()} د.ع</b></div>${deliveryInfo}${trackHtml}${cancelBtnHtml}</div>`;
    }).join('') : '<p>لا توجد طلبات.</p>';
}

function switchAdminTab(tab) {
    ['products', 'orders', 'lottery', 'settings', 'reports'].forEach(t => {
        const btn = document.getElementById('tabAdmin' + t.charAt(0).toUpperCase() + t.slice(1));
        const sec = document.getElementById('admin' + t.charAt(0).toUpperCase() + t.slice(1) + 'Section');
        if(btn) btn.classList.toggle('active', t === tab);
        if(sec) sec.classList.toggle('hidden', t !== tab);
    });
}

async function quickUpdateStock(productId, delta) {
    const p = allProducts.find(x => x.id === productId);
    if (!p) return;
    const newStock = Math.max(0, (p.stock || 0) + delta);
    const { error } = await db.from('products').update({ stock: newStock }).eq('id', productId);
    if (error) { showToast('خطأ: ' + error.message, 'error'); }
    else { p.stock = newStock; renderAdminProducts(); renderLowStock(); showToast(`تم تحديث المخزون إلى ${newStock}`); }
}

async function loadAdminData() {
    const { data: p } = await db.from('products').select('*'); 
    const { data: o } = await db.from('orders').select('*').order('created_at', { ascending: false });
    allProducts = p || []; allOrders = o || []; 
    
    if (previousOrderCount > 0 && allOrders.length > previousOrderCount) {
        playOrderSound();
        showToast('🔔 هناك طلب جديد ورد إلى المتجر الآن!', 'success');
    }
    previousOrderCount = allOrders.length;

    let ts = 0, totalStockCount = 0; 
    allOrders.forEach(x => { if(x.status !== 'rejected') ts += (x.total + (x.delivery_cost || 0)); });
    allProducts.forEach(prod => { totalStockCount += (prod.stock || 0); });

    document.getElementById('statOrders').textContent = allOrders.length; 
    document.getElementById('statSales').textContent = ts.toLocaleString();
    document.getElementById('statProductsCount').textContent = allProducts.length;
    document.getElementById('statTotalStock').textContent = totalStockCount;

    renderAdminProducts(); 
    renderAdminOrders();
    renderLowStock();
}

// ------------------- ميزة تصفير الإحصائيات للمدير -------------------
async function resetAdminStats() {
    if (!confirm('⚠️ هل أنت متأكد من تصفير جميع الإحصائيات وحذف جميع الطلبات السجّلة نهائياً؟')) return;
    
    const { error } = await db.from('orders').delete().neq('id', 0); // حذف كافة الطلبات لتصفير المبيعات والطلبات
    if (error) {
        showToast('تعذر تصفير الإحصائيات: ' + error.message, 'error');
    } else {
        showToast('🔄 تم تصفير جميع إحصائيات المبيعات والطلبات بنجاح!');
        loadAdminData();
    }
}

function renderAdminProducts() {
    const t = document.getElementById('adminProductSearch').value.toLowerCase();
    document.getElementById('adminProductsList').innerHTML = allProducts.filter(p => p.name.toLowerCase().includes(t)).map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ddd; padding:10px 0;">
            <div>
                <b>${p.name}</b> - ${Number(p.price).toLocaleString()} د.ع 
                <br>
                <small>المخزون الحالي: <strong style="color:var(--orange)">${p.stock || 0}</strong> قطعة</small>
            </div>
            <div style="display:flex; gap:5px; align-items:center;">
                <button onclick="quickUpdateStock(${p.id}, -1)" class="btn-stock">-</button>
                <button onclick="quickUpdateStock(${p.id}, 1)" class="btn-stock">+</button>
                <button onclick="openEditProduct(${p.id})" class="btn-edit" style="margin-right:8px;"><i class="fas fa-edit"></i></button>
                <button onclick="deleteProduct(${p.id})" class="btn-delete"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function printShippingLabel(orderId) {
    const o = allOrders.find(x => x.id === orderId);
    if (!o) return;
    const printArea = document.getElementById('printSection');
    printArea.innerHTML = `
        <div style="border:3px dashed #1a1a1a; padding:25px; border-radius:15px; max-width:450px; margin:0 auto; background:#fff;">
            <h2 style="text-align:center; color:#fea621; margin-bottom:15px;">🛍️ بوليصة شحن - متجر يساعدكم</h2>
            <hr style="margin-bottom:15px;">
            <p style="font-size:1.1rem; margin-bottom:8px;"><b>رقم الطلب:</b> #${o.id}</p>
            <p style="font-size:1.1rem; margin-bottom:8px;"><b>اسم الزبون:</b> ${o.customer_name}</p>
            <p style="font-size:1.1rem; margin-bottom:8px;"><b>رقم الهاتف:</b> ${o.customer_phone}</p>
            <p style="font-size:1.1rem; margin-bottom:8px;"><b>عنوان التوصيل:</b> ${o.customer_address}</p>
            <p style="font-size:1.1rem; margin-bottom:8px;"><b>وقت التوصيل:</b> ${o.delivery_time || 'غير محدد'}</p>
            <hr style="margin:15px 0;">
            <h3 style="text-align:center; color:#28a745;">المبلغ المطلوب عند الاستلام: ${(o.total + (o.delivery_cost || 0)).toLocaleString()} د.ع</h3>
        </div>
    `;
    printArea.style.display = 'block';
    window.print();
    printArea.style.display = 'none';
}

function renderAdminOrders() {
    const t = document.getElementById('adminOrderSearch').value.toLowerCase();
    document.getElementById('adminOrdersList').innerHTML = allOrders.filter(o => o.customer_name.toLowerCase().includes(t) || o.customer_phone.includes(t)).map(o => {
        let actions = '';
        if(o.status === 'pending') {
            actions = `<button onclick="openDeliveryModal(${o.id})" class="btn-accept"><i class="fas fa-check"></i> قبول وتحديد التوصيل</button>
                       <button onclick="updateOrderStatus(${o.id}, 'rejected')" class="btn-reject"><i class="fas fa-times"></i> إلغاء الطلب</button>`;
        } else if(o.status === 'shipped') {
            actions = `<button onclick="updateOrderStatus(${o.id}, 'delivered')" class="btn-accept"><i class="fas fa-check-double"></i> تم التوصيل</button>
                       <button onclick="printShippingLabel(${o.id})" class="btn-edit" style="background:var(--purple-dark);"><i class="fas fa-print"></i> طباعة البوليصة</button>
                       <button onclick="updateOrderStatus(${o.id}, 'rejected')" class="btn-reject"><i class="fas fa-times"></i> إلغاء الطلب</button>`;
        } else if(o.status === 'rejected') {
            actions = `<span style="color:var(--red); font-size:0.8rem;">تم إلغاء الطلب</span>`;
        } else {
            actions = `<button onclick="printShippingLabel(${o.id})" class="btn-edit" style="background:var(--purple-dark);"><i class="fas fa-print"></i> طباعة البوليصة</button>
                       <span style="color:var(--green); font-size:0.8rem; margin-right:5px;">مكتمل</span>`;
        }
        return `<div class="order-card"><div class="order-header"><span>#${o.id}</span><span>المجموع: ${(o.total + (o.delivery_cost || 0)).toLocaleString()} د.ع</span></div><div class="order-details"><div><b>الزبون:</b> ${o.customer_name} - ${o.customer_phone}</div><div><b>العنوان:</b> ${o.customer_address}</div><div><b>التوصيل:</b> ${o.delivery_cost ? o.delivery_cost + ' د.ع (' + o.delivery_time + ')' : 'لم يحدد بعد'}</div></div><div class="order-actions">${actions}</div></div>`;
    }).join('');
}

function openDeliveryModal(orderId) {
    document.getElementById('deliveryOrderId').value = orderId;
    document.getElementById('deliveryTimeInput').value = 'يومين';
    document.getElementById('deliveryCostInput').value = '2000';
    document.getElementById('deliveryDetailsModal').classList.add('active');
}

async function saveDeliveryDetails(e) {
    e.preventDefault();
    const orderId = document.getElementById('deliveryOrderId').value;
    const time = document.getElementById('deliveryTimeInput').value;
    const cost = Number(document.getElementById('deliveryCostInput').value);

    const { error } = await db.from('orders').update({ status: 'shipped', delivery_time: time, delivery_cost: cost }).eq('id', orderId);
    if(error) { showToast('خطأ: ' + error.message, 'error'); } 
    else { showToast('تم قبول الطلب وتحديد التوصيل بنجاح'); closeModal('deliveryDetailsModal'); loadAdminData(); }
}

async function updateOrderStatus(id, s) { 
    await db.from('orders').update({ status: s }).eq('id', id); 
    showToast('تم تحديث حالة الطلب'); 
    loadAdminData(); 
}

function runLotteryDraw() {
    const startTimeStr = document.getElementById('lotteryStartTime').value;
    const endTimeStr = document.getElementById('lotteryEndTime').value;
    
    if(!startTimeStr || !endTimeStr) { showToast('يرجى تحديد وقت البداية والنهاية للقرعة', 'error'); return; }

    const validOrders = allOrders.filter(o => {
        if(!o.created_at) return false;
        const orderTime = new Date(o.created_at).toTimeString().slice(0,5);
        return orderTime >= startTimeStr && orderTime <= endTimeStr && o.status !== 'rejected';
    });

    const resultContainer = document.getElementById('lotteryResultContainer');
    const winnerDetails = document.getElementById('lotteryWinnerDetails');

    if(validOrders.length === 0) {
        resultContainer.style.display = 'block';
        winnerDetails.innerHTML = '<span style="color:var(--red);">لا توجد طلبات مسجلة ضمن هذا الوقت المحدد للقرعة!</span>';
        return;
    }

    const randomIndex = Math.floor(Math.random() * validOrders.length);
    const winner = validOrders[randomIndex];

    resultContainer.style.display = 'block';
    winnerDetails.innerHTML = `رقم الطلب: #${winner.id} <br>اسم الزبون: ${winner.customer_name} <br>هاتف الزبون: ${winner.customer_phone} <br>العنوان: ${winner.customer_address}`;
    showToast('تم إجراء القرعة بنجاح وإعلان الفائز! 🎁');
}

function renderLowStock() {
    const lowStockList = document.getElementById('lowStockList');
    const items = allProducts.filter(p => (p.stock || 0) < 5);
    if (!items.length) {
        lowStockList.innerHTML = '<p style="color:var(--green);">جميع المنتجات في المخزن متوفرة بجميع الكميات الكافية 👍</p>';
        return;
    }
    lowStockList.innerHTML = items.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding:10px 0;">
            <div><b>${p.name}</b><br><small style="color:var(--red);">الكمية المتبقية: ${p.stock || 0} قطعة فقط</small></div>
            <button onclick="openEditProduct(${p.id})" class="btn-edit">تزويد المخزون</button>
        </div>
    `).join('');
}

async function handleAdminUpdateEmail(e) {
    e.preventDefault();
    const newEmail = document.getElementById('adminNewEmail').value.trim();
    const btn = document.getElementById('btnAdminEmail');
    if(!newEmail) return;
    btn.disabled = true; btn.textContent = 'جاري التحديث...';
    const { error } = await db.auth.updateUser({ email: newEmail });
    if(error) { showToast('خطأ: ' + error.message, 'error'); } 
    else { showToast('تم تحديث البريد الإلكتروني للمدير بنجاح! 📧'); document.getElementById('adminNewEmail').value = ''; }
    btn.disabled = false; btn.textContent = 'حفظ البريد الجديد';
}

async function handleAdminUpdatePassword(e) {
    e.preventDefault();
    const newPass = document.getElementById('adminNewPass').value;
    const confirmPass = document.getElementById('adminConfirmPass').value;
    const btn = document.getElementById('btnAdminPass');
    if (newPass !== confirmPass) { showToast('كلمتا المرور غير متطابقتين', 'error'); return; }
    btn.disabled = true; btn.textContent = 'جاري التحديث...';
    const { error } = await db.auth.updateUser({ password: newPass });
    if (error) { showToast('خطأ: ' + error.message, 'error'); } 
    else { showToast('تم تغيير كلمة مرور المدير بنجاح! 🔒'); document.getElementById('adminNewPass').value = ''; document.getElementById('adminConfirmPass').value = ''; }
    btn.disabled = false; btn.textContent = 'تحديث كلمة المرور';
}

function exportOrdersCSV() {
    if(!allOrders.length) { showToast('لا توجد طلبات لتصديرها', 'error'); return; }
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "رقم الطلب,اسم الزبون,الهاتف,العنوان,المبلغ الإجمالي,تكلفة التوصيل,الحالة\n";
    allOrders.forEach(o => {
        csvContent += `"${o.id}","${o.customer_name}","${o.customer_phone}","${o.customer_address}","${o.total}","${o.delivery_cost || 0}","${o.status}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `orders_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('تم تصدير ملف الطلبات بنجاح');
}

function openEditProduct(id) { const p = allProducts.find(x => x.id === id); document.getElementById('editPId').value = p.id; document.getElementById('editPName').value = p.name; document.getElementById('editPPrice').value = p.price; document.getElementById('editPDiscount').value = p.discount || 0; document.getElementById('editPStock').value = p.stock || 0; document.getElementById('editProductModal').classList.add('active'); }

async function uploadProductImage(file) {
    if (!file) return null;
    if (!file.type || !file.type.startsWith('image/')) throw new Error('الملف المختار ليس صورة');
    if (file.size > 5 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 5 ميغابايت');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `products/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await db.storage.from('products').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data } = db.storage.from('products').getPublicUrl(path);
    if (!data || !data.publicUrl) throw new Error('تعذر إنشاء رابط الصورة');
    return data.publicUrl;
}

async function submitEditProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('btnEditProduct');
    const id = document.getElementById('editPId').value;
    const product = allProducts.find(x => String(x.id) === String(id));
    if (!product) { showToast('المنتج غير موجود', 'error'); return; }
    btn.disabled = true;
    try {
        const file = document.getElementById('editPImageFile').files[0];
        const imageUrl = file ? await uploadProductImage(file) : product.image_url;
        const updates = {
            name: document.getElementById('editPName').value.trim(),
            price: Number(document.getElementById('editPPrice').value),
            discount: parseInt(document.getElementById('editPDiscount').value) || 0,
            stock: parseInt(document.getElementById('editPStock').value) || 0
        };
        if (imageUrl) updates.image_url = imageUrl;
        const { error } = await db.from('products').update(updates).eq('id', id);
        if (error) throw error;
        showToast('تم تحديث المنتج والصورة');
        document.getElementById('editProductForm').reset();
        closeModal('editProductModal');
        await loadProducts(); await loadAdminData();
    } catch (err) {
        showToast('تعذر الحفظ: ' + (err.message || 'خطأ غير معروف'), 'error');
    } finally { btn.disabled = false; }
}

async function deleteProduct(id) {
    if (!confirm('هل انت متأكد من حذف هذا المنتج؟')) return;
    const { error } = await db.from('products').delete().eq('id', id);
    if (error) { showToast('تعذر الحذف: ' + error.message, 'error'); return; }
    showToast('تم الحذف'); await loadProducts(); await loadAdminData();
}

async function submitNewProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('btnAddProduct'); btn.disabled = true;
    try {
        const file = document.getElementById('pImageFile').files[0];
        const imageUrl = file ? await uploadProductImage(file) : null;
        const product = {
            name: document.getElementById('pName').value.trim(),
            price: Number(document.getElementById('pPrice').value),
            discount: parseInt(document.getElementById('pDiscount').value) || 0,
            stock: parseInt(document.getElementById('pStock').value) || 0,
            icon: '📦'
        };
        if (imageUrl) product.image_url = imageUrl;
        const { error } = await db.from('products').insert([product]);
        if (error) throw error;
        showToast(imageUrl ? 'تمت إضافة المنتج والصورة بنجاح' : 'تمت إضافة المنتج بدون صورة');
        document.getElementById('addProductForm').reset();
        await loadProducts(); await loadAdminData();
    } catch (err) {
        showToast('تعذرت إضافة المنتج: ' + (err.message || 'خطأ غير معروف'), 'error');
    } finally { btn.disabled = false; }
}

function showToast(m, t = 'success') { const el = document.getElementById('toast'); el.textContent = m; el.style.background = t === 'error' ? '#dc3545' : '#28a745'; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); }

document.addEventListener('DOMContentLoaded', () => { 
    initAuth(); 
    loadProducts(); 
    setInterval(() => {
        if (currentUser && currentUser.email === '2004oopp202326@gmail.com') {
            loadAdminData();
        }
    }, 30000);
});
