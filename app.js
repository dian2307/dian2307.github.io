let allData = [];
let filteredData = []; // Lưu trữ kết quả sau khi lọc
let currentPage = 1;
const itemsPerPage = 1000; // Tăng số lượng này lên để hiển thị toàn bộ danh sách
let cartItems = []; // Mảng lưu trữ giỏ hàng

// --- CẤU HÌNH GOOGLE SHEET ---
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwqFUHkgUfcJMsAmRVtmBP3CyDu7oon9WuIlUQJzzTOv2YtABFGWJMaqtTvymHxLaz6bg/exec";

function init() {
  fetch("data.json")
    .then(r => {
      if (!r.ok) throw new Error("Không thể tải data.json");
      return r.json();
    })
    .then(d => {
      allData = d;
      populateRarityOptions(allData); 
      search(); 
    })
    .catch(e => {
      console.error(e);
      const list = document.getElementById('resultList');
      if(list) list.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Lỗi tải dữ liệu: Vui lòng sử dụng Live Server</div>';
    });
}

// Hàm tạo option cho thẻ select Rarity dựa trên dữ liệu thật
function populateRarityOptions(data) {
  const raritySelect = document.getElementById('raritySelect');
  if (!raritySelect) return;

  // Giữ lại option đầu tiên (Tất cả)
  const firstOption = raritySelect.options[0];
  raritySelect.innerHTML = '';
  raritySelect.appendChild(firstOption);

  // Lấy danh sách rarity duy nhất và sắp xếp
  const rarities = [...new Set(data.map(item => item.rarity).filter(r => r))].sort();

  rarities.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    raritySelect.appendChild(opt);
  });
}

function search() {
  const keywordEl = document.getElementById('keyword');
  // Lấy từ khóa, chuyển về chữ thường và xóa khoảng trắng thừa
  const keyword = keywordEl ? keywordEl.value.toLowerCase().trim() : "";

  filteredData = allData.filter(item => {
    // Chuyển đổi sang String để an toàn hơn
    const name = String(item.name || "").toLowerCase();
    const code = String(item.code || "").toLowerCase();

    // Logic tìm kiếm: Trả về true nếu keyword nằm trong name HOẶC code
    return !keyword || name.includes(keyword) || code.includes(keyword);
  });

  // Reset về trang 1 khi tìm kiếm mới
  currentPage = 1;
  renderList(filteredData, true);
}

function onSearchInput() {
  search();
}

function onRarityChange() {
  search();
}

function onSortChange() {
  search();
}

function renderList(items, reset = false) {
  const list = document.getElementById('resultList');
  const loadMoreBtnId = 'btnLoadMore';

  // Xóa nút Load More cũ nếu có
  const existingBtn = document.getElementById(loadMoreBtnId);
  if (existingBtn) existingBtn.remove();
  
  if (reset) {
    list.innerHTML = "";
    const title = document.getElementById('listTitle');
    if(title) title.innerText = `ピック買取 (${items.length})`;
  }

  if (items.length === 0) {
    list.innerHTML = `<p style="text-align:center; padding:20px; color:#888;">Lỗi rồi bạn</p>`;
    return;
  }

  // Logic phân trang (Pagination)
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageItems = items.slice(start, end);

  const html = pageItems.map(item => {
    const price = Number(item.price).toLocaleString();
    const safeName = String(item.name || "").replace(/'/g, "\\'");
    const safeCode = String(item.code || "").replace(/'/g, "\\'");
    const imgUrl = item.image || "logo.png";
    const rarityBadge = item.rarity ? `<span class="rarity-badge">${item.rarity}</span>` : "";
    
    return `
      <div class="item-row">
        <div class="item-img">
          ${rarityBadge}
          <img src="${imgUrl}" class="product-img" loading="lazy" onclick="showModal('${imgUrl}')" onerror="this.onerror=null;this.src='logo.png';">
        </div>
        <div class="item-info">
          <div class="item-title-row" style="flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <div class="item-title" onclick="copyText('${safeCode}', 'Sao chép mã')">
              ${item.name}
            </div>
            <div style="font-size:0.8em; color:#888;">${item.code || ""}</div>
          </div>
          <div class="item-bottom-row">
            <div class="price-group" onclick="copyText('${item.price}', 'Sao chép giá')">
              <span class="price-val">¥${price}</span>
            </div>
            <div class="item-actions">
              <div class="qty-wrapper">
                <button class="qty-btn" onclick="changeQty(this, -1)">-</button>
                <input type="number" class="qty-val" placeholder="" min="1">
                <button class="qty-btn" onclick="changeQty(this, 1)">+</button>
              </div>
              <button onclick="addToCart('${safeCode}', '${safeName}', ${item.price}, this)" class="btn-action btn-cart">Thêm vào giỏ</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  list.insertAdjacentHTML('beforeend', html);

  // Hiển thị nút "Xem thêm" nếu còn dữ liệu
  if (end < items.length) {
    const remaining = items.length - end;
    const btnHtml = `
      <div id="${loadMoreBtnId}" style="text-align:center; margin: 20px 0 40px; width:100%;">
        <button onclick="loadMore()" 
          style="
            background: #fff; border: 1px solid #ddd; padding: 12px 40px; 
            border-radius: 30px; font-weight: 700; color: #555; cursor: pointer;
            box-shadow: 0 4px 10px rgba(0,0,0,0.05); transition: all 0.2s;
          ">
          Xem thêm (còn ${remaining})
        </button>
      </div>
    `;
    list.insertAdjacentHTML('beforeend', btnHtml);
  }
}

function loadMore() {
  currentPage++;
  renderList(filteredData, false);
}

function copyText(text, msg) {
  if (!text) return;
  navigator.clipboard.writeText(String(text)).then(() => {
    const t = document.getElementById('toast');
    const m = document.getElementById('toastMsg');
    if (t && m) {
      m.innerText = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }
  });
}

function showModal(src) {
  const m = document.getElementById('modal');
  const img = document.getElementById('modalImage');
  if (m && img) {
    img.src = src;
    m.style.display = 'flex';
  }
}

function toggleFav(name, btn) {
  btn.classList.toggle('active');
}

function toggleViewMode() {
  const list = document.getElementById('resultList');
  const btn = document.getElementById('viewToggleBtn');
  list.classList.toggle('grid-mode');
  if (list.classList.contains('grid-mode')) {
    btn.innerText = "≣";
    btn.classList.add('active');
  } else {
    btn.innerText = "⊞";
    btn.classList.remove('active');
  }
}



function searchByTag(tag) {
  document.getElementById('keyword').value = tag;
  search();
}

function fetchLatest() {
  const keyword = document.getElementById('keyword');
  if (keyword) keyword.value = "";
  // Đã loại bỏ các dòng reset rarity/price vì các phần tử này không tồn tại trong HTML
  search();
}

function copyFavText() {
    alert("Chức năng chưa được triển khai (Chế độ JSON)");
}

function toggleFavFilter() {
    const btn = document.getElementById('favFilterBtn');
    if (btn) btn.classList.toggle('active');
}

function changeQty(btn, delta) {
  const input = btn.parentElement.querySelector('.qty-val');
  let val = parseInt(input.value);
  
  if (isNaN(val)) val = 0;
  
  val += delta;
  if (val < 1) input.value = "";
  else input.value = val;
}

// --- LOGIC GIỎ HÀNG ---

function addToCart(code, name, price, btn) {
  const input = btn.previousElementSibling.querySelector('.qty-val');
  const qty = parseInt(input.value) || 1;
  // Kiểm tra xem sản phẩm đã có trong giỏ chưa
  const existingItem = cartItems.find(item => item.code === code);
  
  if (existingItem) {
    existingItem.qty += qty;
  } else {
    cartItems.push({
      code: code,
      name: name,
      price: price,
      qty: qty
    });
  }

  updateCartCount();
  
  // Hiển thị thông báo Toast thay vì Alert
  const t = document.getElementById('toast');
  const m = document.getElementById('toastMsg');
  if (t && m) {
    m.innerText = `Đã thêm ${qty} thẻ vào giỏ!`;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }
  
  // Reset ô nhập số lượng về rỗng
  input.value = "";
}

function updateCartCount() {
  const count = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const badge = document.getElementById('cartCount');
  const headerBadge = document.getElementById('headerCartCount');
  
  if (badge) badge.innerText = count;
  if (headerBadge) {
      headerBadge.innerText = count;
      headerBadge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function openCart() {
  const modal = document.getElementById('cartModal');
  if (modal) {
    renderCart();
    modal.style.display = 'flex';
  }
}

function closeCart() {
  const modal = document.getElementById('cartModal');
  if (modal) modal.style.display = 'none';
}

function renderCart() {
  const container = document.getElementById('cartBody');
  const totalEl = document.getElementById('cartTotalAmount');
  if (!container) return;
  
  // Đảm bảo Footer hiển thị lại (nếu trước đó bị ẩn bởi màn hình Success)
  document.querySelector('.cart-footer').style.display = 'block';

  if (cartItems.length === 0) {
    container.innerHTML = '<div style="padding:30px; text-align:center; color:#999;">Giỏ hàng trống</div>';
    totalEl.innerText = "¥0";
    return;
  }

  let total = 0;
  container.innerHTML = cartItems.map((item, index) => {
    const subtotal = item.price * item.qty;
    total += subtotal;
    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <span class="cart-item-name">${item.name}</span>
          <span class="cart-item-meta">Mã: ${item.code} | SL: ${item.qty}</span>
        </div>
        <div class="cart-item-right">
          <span class="cart-item-price">¥${subtotal.toLocaleString()}</span>
          <button class="btn-remove-item" onclick="removeFromCart(${index})">Xóa</button>
        </div>
      </div>
    `;
  }).join("");

  totalEl.innerText = "¥" + total.toLocaleString();
}

function removeFromCart(index) {
  cartItems.splice(index, 1);
  updateCartCount();
  renderCart();
}

function submitOrder() {
  if (cartItems.length === 0) return;

  const nameInput = document.getElementById('customerName');
  const customerName = nameInput.value.trim();

  if (!customerName) {
    alert("Vui lòng nhập tên của bạn trước khi gửi!");
    nameInput.focus();
    return;
  }

  // Kiểm tra xem người dùng đã dán link Script chưa
  if (GOOGLE_SCRIPT_URL.includes("https://docs.google.com/spreadsheets/d/18qJBWkzBqQefopUpgPXKH3Xj_aE8P2CCE1sLMeywDLA/edit?gid=0#gid=0")) {
    alert("Lỗi cấu hình: Chưa kết nối với Google Sheet. Vui lòng liên hệ Admin.");
    console.error("Chưa cập nhật biến GOOGLE_SCRIPT_URL trong app.js");
    return;
  }

  if (GOOGLE_SCRIPT_URL === "HAY_DAN_LINK_WEB_APP_SCRIPT_CUA_BAN_VAO_DAY" || !GOOGLE_SCRIPT_URL.startsWith("https://script.google.com")) {
    alert("Lỗi cấu hình: Bạn chưa dán Link Web App (kết thúc bằng /exec) vào file app.js!");
    console.error("Link Google Script không hợp lệ. Phải bắt đầu bằng https://script.google.com...");
    return;
  }

  // Tạo mã đơn hàng ngẫu nhiên (6 số)
  const orderId = Math.floor(100000 + Math.random() * 900000);

  // Chuẩn bị dữ liệu gửi đi
  // Tính tổng tiền toàn bộ đơn hàng (để tham khảo hoặc nếu cần dùng sau này)
  let total = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);

  const payload = {
    orderId: orderId,
    customerName: customerName,
    orderDate: new Date().toLocaleString('vi-VN'), // Thêm ngày giờ gửi
    total: total,
    items: cartItems // Gửi nguyên mảng object để Apps Script xử lý tách dòng
  };

  const btn = document.getElementById('btnSubmitOrder');
  const originalText = btn.innerText;
  
  // UI Feedback: Hiển thị trạng thái đang xử lý rõ ràng
  btn.innerText = "⏳ Đang gửi đơn...";
  btn.disabled = true;
  btn.style.opacity = "0.7";
  btn.style.cursor = "not-allowed";

  // Gửi dữ liệu sang Google Sheet
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors', 
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).then(() => {
    // Sau khi gửi thành công (hoặc request đã đi)
    
    // --- XÓA DỮ LIỆU NGAY LẬP TỨC ---
    cartItems = [];
    updateCartCount();
    document.getElementById('customerName').value = "";

    // Ẩn footer (nút gửi)
    document.querySelector('.cart-footer').style.display = 'none';
    
    // Hiển thị giao diện thành công ngay trong Modal
    const container = document.getElementById('cartBody');
    container.innerHTML = `
      <div class="cart-success-view">
        <div class="success-icon-large">🎉</div>
        <h3 style="color: #27ae60; margin:0 0 5px;">Gửi đơn thành công!</h3>
        <p style="color:#888; font-size:12px;">Cảm ơn ${customerName} đã gửi yêu cầu.</p>
        
        <div class="order-id-box" onclick="copyText('${orderId}', 'Đã sao chép mã đơn')">${orderId}</div>
        
        <p class="success-note">Vui lòng <b>chụp màn hình</b> hoặc <b>sao chép mã số</b> trên và gửi cho nhân viên giao dịch.</p>
        
        <button onclick="finishOrder()" class="btn-checkout" style="background:#333;">Hoàn tất & Đóng</button>
      </div>
    `;
    
    // Reset nút bấm (để lần sau mở lại không bị kẹt)
    btn.innerText = "Gửi đơn hàng";
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  }).catch(err => {
    console.error(err);
    alert("Có lỗi xảy ra khi gửi đơn. Vui lòng thử lại!");
    btn.innerText = originalText;
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  });
}

function finishOrder() {
  // Dữ liệu đã được xóa ngay khi gửi thành công, giờ chỉ cần đóng modal
  closeCart();
}
