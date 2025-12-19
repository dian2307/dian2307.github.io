let allData = [];
let filteredData = []; // Lưu trữ kết quả sau khi lọc
let currentPage = 1;
const itemsPerPage = 1000; // Tăng số lượng này lên để hiển thị toàn bộ danh sách
let cartItems = []; // Mảng lưu trữ giỏ hàng
let currentCategory = 'A'; // Mặc định là kho A
let autoRefreshInterval = null; // Biến lưu bộ đếm thời gian tự động cập nhật

// --- CẤU HÌNH GOOGLE SHEET ---
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxdgDU7YlI_RrIeIWR4AIFWfdixjw-_ChwukFM-Z1iZJSyzkhoTFIAPm4kIhHKEwhh0sg/exec";

// --- CẤU HÌNH NGUỒN DỮ LIỆU GIÁ (MỚI) ---
// Cấu hình nhiều nguồn dữ liệu cho các Tab khác nhau
const DATA_SOURCES = {
  'A': "data.json", // Đọc trực tiếp từ file data.json nội bộ
  'B': "https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLgD_xLem9qQfsXiQNWlDW0UgQ-pVqqQZ4vlKV9vYhYvntcUbf6ulljWNfRHHJmkAGKRBsc7ofOMHW16PAlBjR2eZO8ADTMCu_3aLPoehFkMFGzuJ-1ld52h6TwUPligPHUXQ39fcibr7-_Hx1ooopRLH8EKyeaVnFqf4xhjom_3_zW_1k2PDhEhC9xNA49Txb0iz0i3ARB1kxTB6FWAcIxCiPq18jSCjGNriQ6Oq5SqLVpJ9hczuFECaEGQBSQEXBCII9zH16gtIepcF8jKiYcgr6IJNQ&lib=McgONiI0ShgZoplbgizBChjUevPycBIIq"  // Link cho Tab Áo (Sheet khác)
};

// --- LOADER HELPER FUNCTIONS ---
function showLoader() {
    const loader = document.getElementById('fullPageLoader');
    const bar = document.getElementById('loaderBarFill');
    if (!loader || !bar) return;

    loader.style.display = 'flex';
    bar.classList.remove('completing');
    bar.style.width = '0%';
    
    void loader.offsetWidth; // Force reflow

    loader.classList.add('show');
    
    setTimeout(() => {
        bar.style.width = '95%'; // Bắt đầu chạy thanh loading "ảo"
    }, 50);
}

function hideLoader(isSuccess = true) {
    const loader = document.getElementById('fullPageLoader');
    const bar = document.getElementById('loaderBarFill');
    if (!loader || !bar) return;

    if (isSuccess) {
        bar.classList.add('completing'); // Chạy nốt đến 100%
        setTimeout(() => {
            loader.classList.remove('show');
            setTimeout(() => { loader.style.display = 'none'; }, 300);
        }, 500); // Đợi thanh loading chạy xong rồi mới ẩn
    } else {
        loader.classList.remove('show');
        setTimeout(() => { loader.style.display = 'none'; }, 300);
    }
}

function init() {
  // Mặc định tải danh mục A khi vào trang
  switchCategory('A');

  // --- THAY ĐỔI GIAO DIỆN TRA CỨU (ICON MODE) ---
  const trackBox = document.querySelector('.header-track-box');
  if (trackBox) {
    // Thay thế nội dung cũ bằng Icon SVG kính lúp đẹp
    trackBox.innerHTML = `<div class="header-track-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div>`;
    trackBox.onclick = openTrackModal; // Gán sự kiện mở Modal
  }

  // --- THAY ĐỔI ICON GIỎ HÀNG (SVG) ---
  const cartIcon = document.querySelector('.cart-icon');
  if (cartIcon) {
    cartIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`;
  }
}

function switchCategory(catId, btnElement) {
  currentCategory = catId; // Cập nhật kho hiện tại khi chuyển tab
  
  // 0. Xóa bộ đếm giờ cũ nếu có (để tránh chạy chồng chéo khi chuyển tab liên tục)
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  
  // Reset ô tìm kiếm khi chuyển danh mục mới
  const keywordEl = document.getElementById('keyword');
  if (keywordEl) keywordEl.value = "";

  // 1. Cập nhật giao diện Tab (Active)
  if (btnElement) {
    document.querySelectorAll('.g-card').forEach(el => el.classList.remove('active'));
    btnElement.classList.add('active');
  }

  // 2. Hiển thị loader và xóa nội dung cũ
  showLoader();
  const list = document.getElementById('resultList');
  if (list) list.innerHTML = '';

  const localKey = `cache_data_${catId}`; // Tên khóa lưu trữ: cache_data_A, cache_data_B
  const cachedData = localStorage.getItem(localKey);
  let hasCache = false;

  if (cachedData) {
    try {
      allData = JSON.parse(cachedData);
      hasCache = true;
      console.log(`Đã tải ${allData.length} sản phẩm từ Cache trình duyệt.`);
    } catch (e) {
      console.error("Lỗi đọc cache", e);
      hasCache = false; // Nếu cache lỗi, coi như không có cache
    }
  }

  // --- HÀM TẢI DỮ LIỆU (Được tách ra để gọi định kỳ) ---
  const fetchData = () => {
    let baseUrl = DATA_SOURCES[catId];
    if (!baseUrl) { hideLoader(false); return; }
    
    // CHỐNG CACHE TRÌNH DUYỆT: Thêm tham số thời gian (?t=...)
    const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 't=' + new Date().getTime();

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error("Không thể tải dữ liệu");
        return r.json();
      })
      .then(d => {
        // Kiểm tra xem dữ liệu có thực sự thay đổi không (để tránh render lại nếu không cần thiết)
        const isDataChanged = JSON.stringify(d) !== JSON.stringify(allData);
        
        allData = d;
        
        // Lưu dữ liệu mới vào Cache trình duyệt cho lần sau
        localStorage.setItem(localKey, JSON.stringify(d));

        // 2. TỰ ĐỘNG ĐỒNG BỘ GIÁ TRONG GIỎ HÀNG
        let cartUpdated = false;
        cartItems.forEach(item => {
          if (item.category === currentCategory) {
            const freshItem = allData.find(d => String(d.code) === String(item.code));
            if (freshItem && Number(freshItem.price) !== Number(item.price)) {
              console.log(`Đồng bộ giá mới cho ${item.name}: ${item.price} -> ${freshItem.price}`);
              item.price = Number(freshItem.price);
              cartUpdated = true;
            }
          }
        });
        
        if (cartUpdated) renderCart();

        // Ẩn loader khi thành công
        hideLoader(true);

        // Chỉ render lại danh sách nếu dữ liệu có thay đổi hoặc chưa có dữ liệu (lần đầu)
        if (isDataChanged || !hasCache) {
          populateRarityOptions(allData); 
          search(); // Gọi search để render lại danh sách theo từ khóa hiện tại
          console.log("Dữ liệu đã được cập nhật mới nhất từ Server.");
        } else if (hasCache) {
          // Nếu không có gì thay đổi và đã có cache, render lại cache
          populateRarityOptions(allData);
          search();
        }
      })
      .catch(e => {
        console.error(e);
        hideLoader(false); // Ẩn loader khi có lỗi
        let errorMsg = `Lỗi tải dữ liệu kho ${catId}`;
        if (e.message.includes("JSON") || e.name === "SyntaxError") {
            errorMsg = `⚠️ Lỗi cú pháp file dữ liệu (data.json).<br>Bạn hãy kiểm tra xem có thừa dấu phẩy (,) ở dòng cuối cùng không?`;
        }
        if(list) list.innerHTML = `<div style="text-align:center; padding:20px; color:red; line-height:1.6;">${errorMsg}<br><small style="color:#666; font-size:11px;">(${e.message})</small></div>`;
      });
  };

  // 3. Gọi hàm tải dữ liệu ngay lập tức
  fetchData();

  // 4. Cài đặt chạy tự động mỗi 10 giây (10000ms)
  // Web sẽ tự động kiểm tra và cập nhật nếu bạn xóa/sửa dữ liệu trong Sheet
  autoRefreshInterval = setInterval(fetchData, 10000);
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
    
    // Xử lý hiển thị Note (Chú thích) thay vì Rarity Badge
    const noteText = item.note || item.rarity || ""; // Ưu tiên lấy note, fallback về rarity nếu cũ
    const noteHtml = noteText ? `<div class="product-note">※ ${noteText}</div>` : "";
    
    return `
      <div class="item-row">
        <div class="item-img">
          <img src="${imgUrl}" class="product-img" loading="lazy" onclick="showModal('${imgUrl}')" onerror="this.onerror=null;this.src='logo.png';">
        </div>
        <div class="item-info">
          <div class="item-title-row" style="flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <div class="item-title" onclick="copyText('${safeCode}', 'Sao chép mã')">
              ${item.name}
            </div>
            <div style="font-size:0.8em; color:#888;">${item.code || ""}</div>
            ${noteHtml}
          </div>
          <div class="item-bottom-row">
            <div class="price-group" onclick="copyText('${item.price}', 'Sao chép giá')">
              <span class="price-val">¥${price}</span>
            </div>
            <div class="item-actions">
              <div class="qty-wrapper">
                <button class="qty-btn" onclick="changeQty(this, -1)">-</button>
                <input type="number" class="qty-val" placeholder="" min="0">
                <button class="qty-btn" onclick="changeQty(this, 1)">+</button>
              </div>
              <button onclick="addToCart('${safeCode}', this)" class="btn-action btn-cart">Thêm vào giỏ</button>
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

function addToCart(code, btn) {
  // 1. TÌM DỮ LIỆU MỚI NHẤT TỪ BIẾN TOÀN CỤC (allData)
  // Biến allData luôn được cập nhật ngầm từ Server, nên giá ở đây là chuẩn nhất
  const itemData = allData.find(i => String(i.code) === String(code));

  if (!itemData) {
    alert("Sản phẩm này có thể đã bị xóa hoặc không còn tồn tại trong danh sách mới nhất.");
    return;
  }

  const name = itemData.name;
  const price = Number(itemData.price); // Lấy giá thực tế mới nhất

  // SỬA LỖI: Tìm input số lượng an toàn hơn (dùng closest thay vì previousElementSibling)
  const container = btn.closest('.item-actions');
  const input = container ? container.querySelector('.qty-val') : null;
  
  // YÊU CẦU MỚI: Nếu ô số lượng trống thì báo lỗi và KHÔNG thêm vào giỏ
  if (!input || !input.value) {
      showAlert("Vui lòng nhập số lượng<br>trước khi thêm vào giỏ!");
      if (input) input.focus();
      return; // Dừng lại tại đây
  }

  let qty = parseInt(input.value);
  if (isNaN(qty) || qty <= 0) return; // Bảo vệ thêm trường hợp nhập số 0 hoặc âm

  // Kiểm tra xem sản phẩm đã có trong giỏ chưa
  // Kiểm tra cả Mã và Kho (Category) để tránh nhầm lẫn giữa các kho
  const existingItem = cartItems.find(item => item.code === code && item.category === currentCategory);
  
  if (existingItem) {
    // Nếu sản phẩm đã có, cập nhật luôn giá mới nhất cho dòng đó (phòng trường hợp lúc trước thêm giá cũ)
    if (existingItem.price !== price) {
        console.log(`Cập nhật giá mới cho ${name}: ${existingItem.price} -> ${price}`);
        existingItem.price = price;
    }
    existingItem.qty += qty;
  } else {
    cartItems.push({
      code: code,
      name: name,
      price: price,
      qty: qty,
      category: currentCategory // Lưu lại sản phẩm này thuộc kho nào (A hoặc B)
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
  if (input) input.value = "";
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
          <span class="cart-item-meta"> Mã: ${item.code} | SL: ${item.qty}</span>
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

  // 3. KIỂM TRA LẠI GIÁ LẦN CUỐI TRƯỚC KHI GỬI (AN TOÀN TUYỆT ĐỐI)
  // Đề phòng trường hợp mạng quá lag, sync chưa kịp chạy
  cartItems.forEach(item => {
    // Tìm trong allData hiện tại (đã là mới nhất)
    const freshItem = allData.find(d => String(d.code) === String(item.code));
    // Nếu tìm thấy và giá khác nhau, cập nhật ngay
    if (freshItem && Number(freshItem.price) !== Number(item.price)) {
       item.price = Number(freshItem.price);
    }
  });
  // Cập nhật lại tổng tiền hiển thị (nếu cần thiết, dù người dùng sắp gửi đi rồi)
  renderCart();

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
    mode: 'no-cors', // Bật lại no-cors để tránh lỗi Failed to fetch
    headers: {
      'Content-Type': 'text/plain'
    },
    body: JSON.stringify(payload)
  }).then(() => {
    // Với no-cors, ta không đọc được phản hồi nên mặc định là thành công
    
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
    alert("Gửi thất bại: " + err.message);
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

// --- TÍNH NĂNG TRA CỨU ĐƠN HÀNG ---
function openTrackModal() {
  const modal = document.getElementById('trackModal');
  const body = document.getElementById('trackBody');
  if (!modal || !body) return;

  // Reset nội dung Modal về form nhập liệu ban đầu
  // Sử dụng class cart-modal-content để đồng bộ giao diện
  modal.innerHTML = `
    <div class="cart-modal-content" style="max-width: 400px;">
      <div class="cart-header">
        <h3>Tra cứu đơn hàng</h3>
        <button class="btn-close-cart" onclick="closeTrackModal()">×</button>
      </div>
      <div class="cart-body" id="trackBody" style="padding: 20px;">
        <p style="font-size:13px; color:#666; margin-bottom:15px;">Nhập mã đơn hàng của bạn để kiểm tra trạng thái xử lý.</p>
        <div class="cart-input-group">
          <input type="search" id="modalOrderId" class="cart-input" placeholder="Ví dụ: 123456" inputmode="numeric" pattern="[0-9]*">
        </div>
        <button onclick="trackOrder()" class="btn-checkout">Kiểm tra ngay</button>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
}

function trackOrder() {
  const input = document.getElementById('modalOrderId');
  const orderId = input.value.trim();

  if (!orderId) {
    alert("Vui lòng nhập mã đơn hàng!");
    if(input) input.focus();
    return;
  }

  // Hiển thị Modal và Loading
  const body = document.getElementById('trackBody');
  body.innerHTML = '<div style="text-align:center; padding:40px;">⏳ Đang tra cứu thông tin...</div>';

  // Gọi API Google Script (Sử dụng chung URL với submitOrder nhưng thêm tham số)
  // Lưu ý: Script doGet phải được cấu hình để xử lý tham số orderId
  // Thêm tham số t=... để chống Cache trình duyệt
  const url = GOOGLE_SCRIPT_URL + "?orderId=" + encodeURIComponent(orderId) + "&t=" + new Date().getTime();
  
  console.log("Đang gọi API:", url); // Log để kiểm tra link

  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("Lỗi HTTP: " + r.status);
      
      // Kiểm tra xem Server trả về JSON hay HTML (Lỗi Google Script thường trả về HTML)
      const contentType = r.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        return r.text().then(text => {
          // Nếu là lỗi "Script function not found"
          if (text.includes("Script function not found") || text.includes("スクリプト関数が見つかりません")) {
             throw new Error("Lỗi Server: Hàm doGet chưa được tìm thấy.<br>Vui lòng vào Apps Script > Deploy > New Version.");
          }
          throw new Error("Lỗi Server (HTML):<br>1. Hãy vào Apps Script > Deploy > Manage deployments > Edit > Chọn 'New version' > Deploy.<br>2. Đảm bảo quyền truy cập là 'Anyone'.");
        });
      }
      
      return r.json(); // Nếu là JSON thì parse bình thường
    })
    .then(res => {
      // Kiểm tra nếu Server trả về mảng (dấu hiệu của Script cũ chưa update)
      if (Array.isArray(res)) {
        throw new Error("Lỗi Server: Vui lòng vào Google Apps Script > Deploy > New Version.");
      }
      if (!res || typeof res.status === 'undefined') {
        throw new Error("Phản hồi không hợp lệ từ hệ thống.");
      }

      if (res.status === 'error') {
        body.innerHTML = `<div style="text-align:center; padding:30px; color:red;">❌ ${res.message}</div>`;
      } else {
        renderTrackResult(res.data);
      }
    })
    .catch(err => {
      console.error(err);
      let msg = err.message || 'Lỗi kết nối.';
      if (msg === 'Failed to fetch') {
          msg = 'Lỗi quyền truy cập (CORS).<br>Hãy đảm bảo Script đã được Deploy chế độ "Anyone" (Bất kỳ ai).';
      }
      // Hiển thị lỗi cụ thể nếu có
      body.innerHTML = `<div style="text-align:center; padding:30px; color:red;">${msg}</div>`;
    });
}

function renderTrackResult(data) {
  const body = document.getElementById('trackBody');
  
  // Xác định màu sắc trạng thái
  let statusClass = 'status-pending';
  if (data.status.includes('Hoàn tất') || data.status.includes('Đã nhận')) statusClass = 'status-approved';
  if (data.status.includes('Hủy')) statusClass = 'status-rejected';

  // Render danh sách sản phẩm
  const itemsHtml = data.items.map(item => `
    <tr>
      <td>
        <div style="font-weight:700;">${item.name}</div>
        <div style="font-size:10px; color:#888;">${item.code}</div>
      </td>
      <td style="text-align:center;">x${item.qty}</td>
      <td style="text-align:right;">¥${(item.price * item.qty).toLocaleString()}</td>
    </tr>
  `).join('');

  body.innerHTML = `
    <div class="track-info-row">
      <div><b>Mã đơn:</b> #${data.orderId}</div>
      <div><b>Khách hàng:</b> ${data.customerName}</div>
      <div><b>Ngày gửi:</b> ${data.orderDate}</div>
      <div style="margin-top:5px;"><b>Trạng thái:</b> <span class="track-status-badge ${statusClass}">${data.status}</span></div>
    </div>
    <div>
      <table class="track-table">
        <thead><tr><th>Sản phẩm</th><th style="text-align:center; width:40px;">SL</th><th style="text-align:right;">Thành tiền</th></tr></thead>
        <tbody>
          ${itemsHtml}
          <tr class="track-total-row">
            <td colspan="2">Tổng cộng</td>
            <td style="text-align:right;">¥${Number(data.total).toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
      <button onclick="openTrackModal()" class="btn-checkout" style="margin-top:20px; background:#666;">Tra cứu đơn khác</button>
    </div>
  `;
}

function closeTrackModal() {
  document.getElementById('trackModal').style.display = 'none';
}

// --- ALERT MODAL FUNCTION ---
function showAlert(msg) {
  const modal = document.getElementById('alertModal');
  const msgEl = document.getElementById('alertMessage');
  if (modal && msgEl) {
    msgEl.innerHTML = msg;
    modal.style.display = 'flex';
  }
}
function closeAlert() {
  const modal = document.getElementById('alertModal');
  if (modal) modal.style.display = 'none';
}
