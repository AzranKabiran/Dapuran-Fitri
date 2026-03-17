/* ════════════════════════════════════════
   main.js
   Nav scroll, Fullscreen menu,
   Sticky CTA, Product carousel,
   FAQ accordion, Form submit, Reveal
════════════════════════════════════════ */

/* ── TICKER — auto-clone untuk seamless loop ── */
const tickerTrack = document.getElementById('tickerTrack');
if (tickerTrack) {
  // Clone semua item asli lalu append → tidak perlu duplikat manual di HTML
  const clone = tickerTrack.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  tickerTrack.parentElement.appendChild(clone);
}

/* ── SLOT BOARD — Load dari Supabase ── */
const _SB_URL = 'https://vxvflguqvtvaxbmymudg.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dmZsZ3VxdnR2YXhibXltdWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MjYyMzUsImV4cCI6MjA4OTEwMjIzNX0.weNQechph-_irqYANrmqtEyMyLHR1Sw6iQQjjwSoEHo';

async function fetchSlots() {
  const res = await fetch(`${_SB_URL}/rest/v1/slots?select=*&order=id.asc`, {
    headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}` }
  });
  if (!res.ok) throw new Error('Gagal fetch slots');
  return res.json();
}

function subscribeSlots(callback) {
  const ws = new WebSocket(
    `${_SB_URL.replace('https','wss')}/realtime/v1/websocket?apikey=${_SB_KEY}&vsn=1.0.0`
  );
  ws.onopen = () => ws.send(JSON.stringify({
    topic: 'realtime:public:slots', event: 'phx_join', ref: '1',
    payload: { config: { postgres_changes: [{ event: '*', schema: 'public', table: 'slots' }] } }
  }));
  ws.onmessage = async (msg) => {
    const d = JSON.parse(msg.data);
    if (d.event === 'postgres_changes') {
      const slots = await fetchSlots().catch(() => null);
      if (slots) callback(slots);
    }
  };
  const hb = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
  }, 30000);
  return () => { clearInterval(hb); ws.close(); };
}

function renderSlots(slots) {
  slots.forEach(slot => {
    const row = document.querySelector(`.slot-row[data-product="${slot.product_id}"]`);
    if (!row) return;

    const sisa    = parseFloat(slot.kg_remaining);
    const target  = parseFloat(slot.kg_target);
    const pct     = target > 0 ? Math.min(100, Math.round((sisa / target) * 100)) : 0;

    const fill    = row.querySelector('.slot-bar-fill');
    const countEl = row.querySelector('.slot-count');
    const subEl   = row.querySelector('.slot-bar-sub');

    // Bar = sisa kg (makin dikit sisa, makin pendek bar)
    if (fill) {
      fill.style.width = pct + '%';
      fill.style.background = pct <= 15 ? '#c45656' : pct <= 40 ? '#c4a056' : 'var(--gold)';
    }

    // Sub text kiri: "X kg tersisa dari Y kg" — dynamic dari Supabase
    if (subEl) {
      subEl.textContent = slot.is_open
        ? `${sisa.toFixed(1)} kg tersisa dari ${target.toFixed(0)} kg`
        : 'Produksi ditutup';
    }

    // Angka kanan: sisa kg — luxury label style
    if (countEl) {
      if (!slot.is_open) {
        countEl.innerHTML = `<div class="slot-count-num" style="font-size:13px;letter-spacing:2px;color:#c45656;font-style:normal;font-family:'Jost',sans-serif;font-weight:400">TUTUP</div>`;
      } else {
        countEl.innerHTML = `<div class="slot-count-num">${sisa.toFixed(1)}<sup>kg</sup></div>`;
      }
    }

    row.style.opacity = slot.is_open ? '1' : '.5';

    // ── Sold Out Badge di product card carousel ──
    const soldOut = !slot.is_open || sisa <= 0;
    const card = document.querySelector(`.prod-card[data-product-id="${slot.product_id}"]`);
    if (card) {
      card.classList.toggle('sold-out', soldOut);
      // Tambah/hapus badge
      let badge = card.querySelector('.vcard-sold-out');
      if (soldOut && !badge) {
        badge = document.createElement('div');
        badge.className = 'vcard-sold-out';
        badge.textContent = 'Slot Habis';
        card.querySelector('.vcard-photo').appendChild(badge);
      } else if (!soldOut && badge) {
        badge.remove();
      }
      // Tandai sold-out di custom dropdown (via data attribute, dicek saat sheet dibuka)
      document.querySelectorAll('.form-prod-name').forEach(trigger => {
        if (trigger.dataset.productId === slot.product_id) {
          trigger.dataset[slot.product_id + 'Disabled'] = soldOut ? 'true' : 'false';
        }
      });
    }
  });
}

async function loadSlotBoard() {
  // Tampilkan skeleton loading di semua slot count
  document.querySelectorAll('.slot-count').forEach(el => {
    el.innerHTML = `<div class="slot-count-num" style="opacity:.3;font-size:20px">···</div>`;
  });
  document.querySelectorAll('.slot-bar-fill').forEach(el => {
    el.style.width = '0%';
    el.style.opacity = '.3';
  });

  try {
    const slots = await fetchSlots();
    document.querySelectorAll('.slot-bar-fill').forEach(el => el.style.opacity = '');
    renderSlots(slots);
    subscribeSlots(renderSlots);
  } catch(e) {
    // Kembalikan tampilan statis kalau gagal
    document.querySelectorAll('.slot-bar-fill').forEach(el => el.style.opacity = '');
    console.warn('[Dapuran Fitri] Slot board statis — Supabase error:', e.message);
  }
}

loadSlotBoard();

/* ── COUNTDOWN LEBARAN ── */
(function() {
  // Target: 30 Maret 2027 (1 Syawal 1448H) — sesuaikan jika perlu
  const TARGET = new Date('2027-03-30T00:00:00+07:00').getTime();

  const cdDays  = document.getElementById('cdDays');
  const cdHours = document.getElementById('cdHours');
  const cdMins  = document.getElementById('cdMins');

  if (!cdDays) return;

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const now  = Date.now();
    const diff = TARGET - now;

    if (diff <= 0) {
      cdDays.textContent  = '00';
      cdHours.textContent = '00';
      cdMins.textContent  = '00';
      return;
    }

    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000)  / 60000);

    cdDays.textContent  = days;
    cdHours.textContent = pad(hours);
    cdMins.textContent  = pad(mins);
  }

  tick();
  setInterval(tick, 60000); // update tiap menit
})();

/* ── NAV SCROLL ── */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

/* ── MENU ── */
let menuOpen = false;
const navMenu = document.getElementById('navMenu');
const burger  = document.getElementById('burger');

function toggleMenu() {
  menuOpen = !menuOpen;
  navMenu.classList.toggle('open', menuOpen);
  burger.classList.toggle('open', menuOpen);
  burger.setAttribute('aria-expanded', menuOpen);
  burger.setAttribute('aria-label', menuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi');
  navMenu.setAttribute('aria-hidden', !menuOpen);
  document.body.style.overflow = menuOpen ? 'hidden' : '';
}
function closeMenu() {
  menuOpen = false;
  navMenu.classList.remove('open');
  burger.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Buka menu navigasi');
  navMenu.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Tutup menu/modal dengan tombol Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (menuOpen) closeMenu();
    const modal = document.getElementById('prodModal');
    if (modal && modal.classList.contains('open')) closeProductModal();
  }
});

/* ── STICKY CTA ── */
const stickyCta = document.getElementById('stickyCta');
const hero = document.querySelector('.hero');
const preorderSection = document.getElementById('preorder');

let heroVisible = true;
let preorderVisible = false;

function updateStickyCta() {
  stickyCta.classList.toggle('visible', !heroVisible && !preorderVisible);
}

new IntersectionObserver(entries => {
  entries.forEach(e => { heroVisible = e.isIntersecting; updateStickyCta(); });
}, { threshold: 0.1 }).observe(hero);

new IntersectionObserver(entries => {
  entries.forEach(e => { preorderVisible = e.isIntersecting; updateStickyCta(); });
}, { threshold: 0.3 }).observe(preorderSection);

function closeStickyAndScroll() {
  document.getElementById('preorder').scrollIntoView({ behavior: 'smooth' });
}

/* ── SCROLL REVEAL ── */
const revealEls = document.querySelectorAll('.reveal');
const revealIO = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('up');
      revealIO.unobserve(e.target);
    }
  });
}, { threshold: 0.08 });
revealEls.forEach(el => revealIO.observe(el));

/* ── PRODUCT CAROUSEL ── */
const carousel = document.getElementById('prodCarousel');
const swipeHint = document.getElementById('prodSwipeHint');

const cards = carousel ? Array.from(carousel.querySelectorAll('.prod-card')) : [];

const counter = document.getElementById('prodCounter');
const counterCurrent = counter ? counter.querySelector('.prod-counter-current') : null;

const setActive = (idx) => {
  cards.forEach((c, i) => c.classList.toggle('active', i === idx));
  if (counterCurrent) {
    counterCurrent.style.opacity = '0';
    setTimeout(() => {
      counterCurrent.textContent = idx + 1;
      counterCurrent.style.opacity = '1';
    }, 150);
  }
};

if (carousel) {
  setActive(0);

  carousel.addEventListener('scroll', () => {
    if (swipeHint && carousel.scrollLeft > 20) swipeHint.classList.add('hidden');
    // Cari card yang paling dekat dengan posisi scroll saat ini
    const scrollCenter = carousel.scrollLeft + carousel.offsetWidth / 2;
    let closest = 0;
    let minDist = Infinity;
    cards.forEach((c, i) => {
      const cardCenter = c.offsetLeft + c.offsetWidth / 2;
      const dist = Math.abs(cardCenter - scrollCenter);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setActive(closest);
  }, { passive: true });
}

function scrollToProd(i) {
  if (!carousel) return;
  if (cards[i]) carousel.scrollTo({ left: cards[i].offsetLeft, behavior: 'smooth' });
}

/* ── FAQ ── */
function toggleFaq(el) { el.classList.toggle('open'); }

/* ── INLINE FORM ERROR HELPERS ── */
function showFieldError(fieldId, msg) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.style.borderColor = '#c45656';
  let err = field.parentElement.querySelector('.field-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'field-error';
    err.style.cssText = 'font-size:12px;color:#c45656;margin-top:5px;letter-spacing:.5px;line-height:1.5;font-family:"Jost",sans-serif;';
    field.after(err);
  }
  err.textContent = msg;
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showRowError(rowEl, msg) {
  let err = rowEl.querySelector('.field-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'field-error';
    err.style.cssText = 'font-size:12px;color:#c45656;margin-top:5px;letter-spacing:.5px;grid-column:1/-1;font-family:"Jost",sans-serif;';
    rowEl.appendChild(err);
  }
  err.textContent = msg;
  rowEl.querySelectorAll('.form-input').forEach(f => f.style.borderColor = '#c45656');
}

function clearAllErrors() {
  document.querySelectorAll('.field-error').forEach(e => e.remove());
  document.querySelectorAll('#preorderForm .form-input').forEach(f => f.style.borderColor = '');
  // Clear kota trigger border
  const kotaTrigger = document.getElementById('kotaTrigger');
  if (kotaTrigger) kotaTrigger.style.borderColor = '';
}

/* ── FORM ── */

// Admin WA per kota — ganti nomor sesuai admin asli
const ADMIN_WA = {
  'Langsa':        '6282277578490', // ← Ganti nomor admin Langsa
  'Kuala Simpang': '6285276368647', // ← Ganti nomor admin Kuala Simpang
  'P. Brandan':    '6285261691081', // ← Ganti nomor admin P. Brandan
};

// Cooldown submit — cegah double submit / flooding
let _lastSubmitTime = 0;
const SUBMIT_COOLDOWN_MS = 30000; // 30 detik

// Reset form products ke state awal (pakai buildProductOptions agar data-product-id tetap ada)
function resetFormProducts() {
  const container = document.getElementById('formProducts');
  if (!container) return;
  container.innerHTML = buildProductRowHTML(true);
  recalcTotal();
}

// Tambah baris produk di form
/* ── PRICE MAP — diisi oleh loadPricesFromDB di index.html ── */
window._priceMap = {};

/* ── SHIPPING MAP — { 'Langsa': 30000, 'Kuala Simpang': 25000, ... } ── */
window._shippingMap = {};

/* ── Daftar produk ── */
const PROD_LIST = [
  { id: 'nastar',          label: 'Nastar' },
  { id: 'putri-salju',     label: 'Putri Salju' },
  { id: 'semprit',         label: 'Kue Semprit' },
  { id: 'gutem',           label: 'Kue Gutem' },
  { id: 'lontong-paris',   label: 'Lontong Paris' },
  { id: 'kacang-ijo',      label: 'Kacang Ijo' },
  { id: 'skipi',           label: 'Kue Skipi' },
  { id: 'bangkit-kampung', label: 'Bangkit Kampung' },
  { id: 'bangkit-susu',    label: 'Bangkit Susu' },
  { id: 'dahlia',          label: 'Kue Dahlia' },
  { id: 'sagon',           label: 'Kue Sagon' },
];

/* ── Custom Dropdown — state ── */
let _activeTrigger = null;

function openProdDropdown(trigger) {
  _activeTrigger = trigger;
  const overlay  = document.getElementById('prodDropdownOverlay');
  const sheet    = document.getElementById('prodDropdownSheet');
  const list     = document.getElementById('prodDropdownList');
  const selected = trigger.dataset.productId;

  // Build list items
  list.innerHTML = PROD_LIST.map(p => {
    const harga   = window._priceMap[p.id] || 0;
    const isSel   = p.id === selected;
    const isDisabled = trigger.dataset[p.id + 'Disabled'] === 'true';
    return `<div class="prod-dropdown-item${isSel ? ' selected' : ''}${isDisabled ? ' disabled' : ''}"
      onclick="selectProdItem('${p.id}','${p.label}',${harga})">
      <span class="prod-dropdown-item-name">${p.label}</span>
      <div class="prod-dropdown-item-right">
        <div class="prod-dropdown-item-price">${harga ? 'Rp ' + Number(harga).toLocaleString('id-ID') : '—'}</div>
        <div class="prod-dropdown-item-check">✓ dipilih</div>
      </div>
    </div>`;
  }).join('');

  trigger.classList.add('open');
  overlay.classList.add('visible');
  requestAnimationFrame(() => sheet.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function closeProdDropdown() {
  const overlay = document.getElementById('prodDropdownOverlay');
  const sheet   = document.getElementById('prodDropdownSheet');
  sheet.classList.remove('open');
  overlay.classList.remove('visible');
  if (_activeTrigger) _activeTrigger.classList.remove('open');
  _activeTrigger = null;
  document.body.style.overflow = '';
}

/* ── KOTA DROPDOWN — custom bottom sheet ── */
var KOTA_LIST = [
  { value: 'Langsa',        label: 'Langsa' },
  { value: 'Kuala Simpang', label: 'Kuala Simpang' },
  { value: 'P. Brandan',    label: 'P. Brandan' },
];

function openKotaDropdown() {
  var overlay  = document.getElementById('kotaDropdownOverlay');
  var sheet    = document.getElementById('kotaDropdownSheet');
  var list     = document.getElementById('kotaDropdownList');
  var selected = document.getElementById('fKota').value;

  var html = '';
  for (var i = 0; i < KOTA_LIST.length; i++) {
    var k = KOTA_LIST[i];
    var fee = (window._shippingMap && window._shippingMap[k.value] !== undefined)
      ? window._shippingMap[k.value] : null;

    var ongkirHTML;
    if (fee === null) {
      ongkirHTML = '&mdash;';
    } else if (fee > 0) {
      ongkirHTML = '+Rp ' + Number(fee).toLocaleString('id-ID') + ' ongkir';
    } else {
      ongkirHTML = '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">'
        + '<span style="font-family:Jost,sans-serif;font-size:8.5px;letter-spacing:3px;text-transform:uppercase;color:rgba(196,150,86,.7);font-weight:200;white-space:nowrap;">Free Delivery</span>'
        + '<div style="display:flex;align-items:center;gap:4px;width:100%;">'
        + '<div style="flex:1;height:.5px;background:rgba(196,150,86,.35);"></div>'
        + '<div style="font-size:4px;color:rgba(196,150,86,.5);line-height:1;flex-shrink:0;">&#9670;</div>'
        + '<div style="flex:1;height:.5px;background:rgba(196,150,86,.35);"></div>'
        + '</div></div>';
    }

    var selClass = (k.value === selected) ? ' selected' : '';
    html += '<div class="prod-dropdown-item' + selClass + '" data-kota-value="' + k.value + '" data-kota-label="' + k.label + '">'
      + '<span class="prod-dropdown-item-name">' + k.label + '</span>'
      + '<div class="prod-dropdown-item-right">'
      + '<div class="prod-dropdown-item-price">' + ongkirHTML + '</div>'
      + '<div class="prod-dropdown-item-check">&#10003; dipilih</div>'
      + '</div></div>';
  }
  list.innerHTML = html;

  // Attach click via event delegation — no inline onclick needed
  list.onclick = function(e) {
    var item = e.target.closest('.prod-dropdown-item');
    if (!item) return;
    selectKotaItem(item.dataset.kotaValue, item.dataset.kotaLabel);
  };

  var trigger = document.getElementById('kotaTrigger');
  if (trigger) trigger.style.borderColor = '';

  overlay.classList.add('visible');
  requestAnimationFrame(function() { sheet.classList.add('open'); });
  document.body.style.overflow = 'hidden';
}

function closeKotaDropdown() {
  var overlay = document.getElementById('kotaDropdownOverlay');
  var sheet   = document.getElementById('kotaDropdownSheet');
  if (sheet)   sheet.classList.remove('open');
  if (overlay) overlay.classList.remove('visible');
  document.body.style.overflow = '';
}

function selectKotaItem(value, label) {
  document.getElementById('fKota').value = value;

  var nameEl = document.getElementById('kotaTriggerName');
  var subEl  = document.getElementById('kotaTriggerSub');
  if (nameEl) {
    nameEl.textContent = label;
    nameEl.classList.remove('placeholder');
  }
  if (subEl) {
    var ongkir = (window._shippingMap && window._shippingMap[value] !== undefined)
      ? window._shippingMap[value] : null;
    subEl.textContent = ongkir === null ? '' : ongkir > 0
      ? '+Rp ' + Number(ongkir).toLocaleString('id-ID') + ' ongkir'
      : 'Free Delivery';
  }
  closeKotaDropdown();
  if (typeof recalcTotal === 'function') recalcTotal();
}

// Attach listeners setelah DOM ready
document.addEventListener('DOMContentLoaded', function() {
  var trigger = document.getElementById('kotaTrigger');
  var overlay = document.getElementById('kotaDropdownOverlay');
  if (trigger) {
    trigger.addEventListener('click', openKotaDropdown);
    trigger.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openKotaDropdown(); }
    });
  }
  if (overlay) overlay.addEventListener('click', closeKotaDropdown);
});

function selectProdItem(id, label, harga) {
  if (!_activeTrigger) return;
  _activeTrigger.dataset.productId = id;
  _activeTrigger.dataset.label     = label;
  _activeTrigger.dataset.price     = harga;

  const nameEl  = _activeTrigger.querySelector('.prod-dropdown-trigger-name');
  const priceEl = _activeTrigger.querySelector('.prod-dropdown-trigger-price');
  nameEl.textContent  = label;
  nameEl.classList.remove('placeholder');
  priceEl.textContent = harga ? 'Rp ' + Number(harga).toLocaleString('id-ID') : '';

  closeProdDropdown();
  recalcTotal();
}

/* ── Update harga di semua trigger setelah load dari Supabase ── */
function refreshDropdownPrices() {
  document.querySelectorAll('.prod-dropdown-trigger').forEach(trigger => {
    const id    = trigger.dataset.productId;
    const harga = id && window._priceMap[id];
    if (id && harga) {
      trigger.dataset.price = harga;
      const priceEl = trigger.querySelector('.prod-dropdown-trigger-price');
      if (priceEl) priceEl.textContent = 'Rp ' + Number(harga).toLocaleString('id-ID');
    }
  });
}

/* ── Buat row HTML produk baru ── */
function buildProductRowHTML(isFirst = false) {
  return `<div class="form-product-row">
    <div class="prod-dropdown-trigger form-prod-name"
      data-product-id="" data-label="" data-price="0"
      onclick="openProdDropdown(this)" role="button" tabindex="0">
      <span class="prod-dropdown-trigger-name placeholder">Pilih Produk</span>
      <span class="prod-dropdown-trigger-price"></span>
    </div>
    <input type="number" class="form-input form-prod-kg" placeholder="jml" min="0.25" step="0.25" required oninput="recalcTotal()">
    <button type="button" class="form-remove-row${isFirst ? ' hidden-btn' : ''}"
      ${isFirst ? 'aria-hidden="true" tabindex="-1"' : 'onclick="removeProductRow(this)" aria-label="Hapus baris"'}>✕</button>
  </div>`;
}

function recalcTotal() {
  const rows = document.querySelectorAll('.form-product-row');
  let subtotal = 0;
  rows.forEach(row => {
    const trigger = row.querySelector('.form-prod-name');
    const qty     = parseFloat(row.querySelector('.form-prod-kg').value) || 0;
    const harga   = trigger ? parseFloat(trigger.dataset.price || 0) : 0;
    subtotal += qty * harga;
  });

  // Ambil ongkir berdasarkan kota yang dipilih
  const kotaEl = document.getElementById('fKota');
  const kota = kotaEl ? kotaEl.value : '';
  const ongkir = (kota && window._shippingMap[kota] !== undefined) ? window._shippingMap[kota] : 0;
  const total = subtotal + ongkir;

  const totalEl   = document.getElementById('formTotal');
  const amountEl  = document.getElementById('formTotalAmount');
  const subEl     = document.getElementById('formSubtotal');
  const subRowEl  = document.getElementById('formSubtotalRow');
  const ongkirRowEl = document.getElementById('formOngkirRow');
  const ongkirEl  = document.getElementById('formOngkirAmt');
  const ongkirKotaEl = document.getElementById('formOngkirKota');

  if (totalEl && amountEl) {
    if (subtotal > 0) {
      totalEl.classList.add('visible');
      amountEl.textContent = 'Rp ' + Math.round(total).toLocaleString('id-ID');

      // Tampilkan rincian hanya jika ada ongkir
      if (ongkir > 0) {
        if (subRowEl) subRowEl.style.display = '';
        if (subEl) subEl.textContent = 'Rp ' + Math.round(subtotal).toLocaleString('id-ID');
        if (ongkirRowEl) ongkirRowEl.style.display = '';
        if (ongkirEl) ongkirEl.textContent = '+Rp ' + Math.round(ongkir).toLocaleString('id-ID');
        if (ongkirKotaEl) ongkirKotaEl.textContent = kota;
      } else {
        if (subRowEl) subRowEl.style.display = 'none';
        if (ongkirRowEl) ongkirRowEl.style.display = 'none';
      }
    } else {
      totalEl.classList.remove('visible');
    }
  }
}

function addProductRow() {
  const container = document.getElementById('formProducts');
  container.insertAdjacentHTML('beforeend', buildProductRowHTML(false));
  recalcTotal();
}

function removeProductRow(btn) {
  const rows = document.querySelectorAll('.form-product-row');
  if (rows.length <= 1) return; // minimal 1 baris harus ada
  btn.closest('.form-product-row').remove();
  recalcTotal();
}

async function submitForm(event) {
  event.preventDefault();
  clearAllErrors();

  // Rate limit: cegah spam submit
  const now = Date.now();
  if (now - _lastSubmitTime < SUBMIT_COOLDOWN_MS) {
    const sisa = Math.ceil((SUBMIT_COOLDOWN_MS - (now - _lastSubmitTime)) / 1000);
    showFieldError('fName', `Harap tunggu ${sisa} detik sebelum mengirim ulang.`);
    return;
  }

  const name   = document.getElementById('fName').value.trim();
  const wa     = document.getElementById('fWa').value.trim();
  const kota   = document.getElementById('fKota').value;
  const alamat = document.getElementById('fAlamat').value.trim();

  // Validasi inline — semua error dikumpulkan dulu
  let hasError = false;

  if (!name || name.length < 2) {
    showFieldError('fName', 'Mohon isi nama lengkap Anda (min. 2 karakter).');
    hasError = true;
  }

  const waDigits = wa.replace(/\D/g, '');
  if (!waDigits) {
    showFieldError('fWa', 'Mohon isi nomor WhatsApp Anda.');
    hasError = true;
  } else {
    const waValid = /^(08|628)\d{8,13}$/.test(waDigits);
    if (!waValid) {
      showFieldError('fWa', 'Format nomor tidak valid. Contoh: 08123456789 atau 628123456789');
      hasError = true;
    }
  }

  if (!kota) {
    // Error pada custom trigger, bukan hidden input
    const kotaTrigger = document.getElementById('kotaTrigger');
    if (kotaTrigger) {
      kotaTrigger.style.borderColor = '#c45656';
      let err = kotaTrigger.parentElement.querySelector('.kota-field-error');
      if (!err) {
        err = document.createElement('div');
        err.className = 'kota-field-error field-error';
        err.style.cssText = 'font-size:12px;color:#c45656;margin-top:5px;letter-spacing:.5px;line-height:1.5;font-family:"Jost",sans-serif;';
        kotaTrigger.after(err);
      }
      err.textContent = 'Mohon pilih kota Anda.';
      kotaTrigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    hasError = true;
  }

  if (!alamat) {
    showFieldError('fAlamat', 'Mohon isi alamat pengiriman.');
    hasError = true;
  }

  // Validasi baris produk
  const prodRows   = document.querySelectorAll('.form-product-row');
  const produkList = [];
  let prodError = false;
  for (const row of prodRows) {
    const trigger = row.querySelector('.form-prod-name');
    const nama    = trigger ? trigger.dataset.label : '';
    const prodId  = trigger ? trigger.dataset.productId : '';
    const kg      = parseFloat(row.querySelector('.form-prod-kg').value);
    if (!prodId) {
      showRowError(row, 'Mohon pilih produk.');
      prodError = true; hasError = true;
    } else if (!kg || kg <= 0) {
      showRowError(row, 'Mohon isi jumlah yang valid (min. 0.25).');
      prodError = true; hasError = true;
    } else {
      produkList.push({ nama, kg });
    }
  }

  if (!prodError && produkList.length === 0) {
    showFieldError('fKota', 'Mohon pilih minimal 1 produk.');
    hasError = true;
  }

  if (hasError) return;

  const waNormalized = waDigits.startsWith('0') ? '62' + waDigits.slice(1) : waDigits;

  // Disable tombol
  const btn = event.target.querySelector('.form-submit');
  btn.disabled = true;
  btn.textContent = 'Memproses...';

  try {
    // Simpan via Edge Function — aman, Service Role key tersembunyi di server
    const res = await fetch('https://vxvflguqvtvaxbmymudg.supabase.co/functions/v1/submit-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama_pembeli: name,
        wa_pembeli:   waNormalized,
        kota, alamat,
        produk: JSON.stringify(produkList),
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);

    // Catat waktu submit berhasil (cooldown)
    _lastSubmitTime = Date.now();

    // Buat pesan WA
    const produkStr = produkList.map(p => `- ${p.nama}: ${p.kg} toples`).join('\n');
    const ongkir    = (kota && window._shippingMap[kota] !== undefined) ? window._shippingMap[kota] : 0;
    const subtotal  = produkList.reduce((sum, p) => {
      const harga = window._priceMap[p.nama] || 0;
      return sum + (harga * p.kg);
    }, 0);
    const totalBayar = subtotal + ongkir;
    const ongkirStr  = ongkir > 0
      ? `\nOngkir (${kota}): Rp ${Number(ongkir).toLocaleString('id-ID')}`
      : '';
    const totalStr   = totalBayar > 0
      ? `\nEstimasi Total: Rp ${Math.round(totalBayar).toLocaleString('id-ID')}`
      : '';
    const msg = encodeURIComponent(
      `Halo Dapuran Fitri! Saya ingin pre-order Lebaran 2027.\n\n` +
      `Nama: ${name}\n` +
      `WA: ${waNormalized}\n` +
      `Kota: ${kota}\n` +
      `Alamat: ${alamat}\n\n` +
      `Produk:\n${produkStr}` +
      ongkirStr +
      totalStr +
      `\n\nMohon konfirmasi pesanan saya. Terima kasih!`
    );

    // Arahkan ke admin WA sesuai kota
    const adminWa = ADMIN_WA[kota];
    const waUrl = `https://wa.me/${adminWa}?text=${msg}`;

    // Tampilkan pesan sukses inline sebelum redirect
    const formNote = event.target.querySelector('.form-note');
    if (formNote) {
      formNote.style.cssText = 'color:var(--gold);font-size:13px;margin-top:12px;line-height:1.7;';
      formNote.textContent = `✓ Pesanan terdaftar! Anda akan diarahkan ke WhatsApp admin ${kota}...`;
    }

    // Reset form
    event.target.reset();
    resetFormProducts();

    // Redirect setelah 1.2 detik (beri waktu baca pesan sukses)
    setTimeout(() => { window.location.href = waUrl; }, 1200);

  } catch(e) {
    // Tampilkan error server di bagian atas form
    showFieldError('fName', `Terjadi kesalahan: ${e.message}. Silakan coba lagi.`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Daftar Pre-Order →';
  }
}
/* ════════════════════════════════════════
   PRODUCT MODAL
   - FLIP animation: icon flies from card → center
   - Bottom sheet slides up with staggered info
════════════════════════════════════════ */

const prodModal  = document.getElementById('prodModal');
const modalIcon  = document.getElementById('modalIcon');
const sheetBadge = document.getElementById('sheetBadge');
const sheetName  = document.getElementById('sheetName');
const sheetDesc  = document.getElementById('sheetDesc');
const sheetPriceVal = document.getElementById('sheetPriceVal');

function openProductModal(card) {
  // ── 1. Read data ──
  const badge = card.dataset.badge;
  const name  = card.dataset.name;
  const emText = card.dataset.em;
  const desc  = card.dataset.desc;
  const price = card.dataset.price;

  // ── 2. Get the SVG from inside the card (support both old & new structure) ──
  const svgEl = card.querySelector('.vcard-svg svg') || card.querySelector('.prod-emoji svg');
  if (!svgEl) return;

  // ── 3. Get card icon position on screen ──
  const emojiWrap = card.querySelector('.vcard-svg') || card.querySelector('.prod-emoji');
  const rect      = emojiWrap.getBoundingClientRect();

  // ── 4. Clone SVG into modal icon ──
  modalIcon.innerHTML = svgEl.outerHTML;
  modalIcon.querySelector('svg').style.cssText = 'width:100%;height:100%;color:var(--gold)';

  // ── 5. Set START position (where card icon is) ──
  modalIcon.style.transition = 'none';
  modalIcon.style.left    = rect.left + 'px';
  modalIcon.style.top     = rect.top  + 'px';
  modalIcon.style.width   = rect.width  + 'px';
  modalIcon.style.height  = rect.height + 'px';
  modalIcon.style.opacity = '0';

  // ── 6. Calculate TARGET position (upper 45% of screen, centered) ──
  const sheetH    = window.innerHeight * 0.52;  // sheet takes ~52%
  const iconArea  = window.innerHeight - sheetH; // remaining top area
  const iconSize  = Math.min(iconArea * 0.65, 220);
  const targetTop = (iconArea - iconSize) / 2;
  const targetLeft= (window.innerWidth - iconSize) / 2;

  // ── 7. Open modal (backdrop + sheet) ──
  prodModal.classList.add('open');
  prodModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  stickyCta.classList.remove('visible');

  // ── 8. Fill sheet info ──
  sheetBadge.textContent   = badge;
  sheetName.innerHTML      = `${name} <em>${emText}</em>`;
  sheetDesc.textContent    = desc;
  sheetPriceVal.textContent = price;

  // ── 9. Animate icon: fade in at card position, then fly to center ──
  requestAnimationFrame(() => {
    // Snap to start
    modalIcon.style.opacity = '1';

    requestAnimationFrame(() => {
      // Re-enable transitions and fly to target
      modalIcon.style.transition = [
        'top .55s cubic-bezier(.4,0,.2,1)',
        'left .55s cubic-bezier(.4,0,.2,1)',
        'width .55s cubic-bezier(.4,0,.2,1)',
        'height .55s cubic-bezier(.4,0,.2,1)',
        'opacity .35s ease'
      ].join(',');

      modalIcon.style.top    = targetTop  + 'px';
      modalIcon.style.left   = targetLeft + 'px';
      modalIcon.style.width  = iconSize   + 'px';
      modalIcon.style.height = iconSize   + 'px';

      // Start spin+pulse after landing
      setTimeout(() => {
        modalIcon.classList.add('flying');
      }, 550);
    });
  });
}

function closeProductModal() {
  modalIcon.classList.remove('flying');
  prodModal.classList.remove('open');
  prodModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (window.scrollY > hero.offsetHeight * 0.5) stickyCta.classList.add('visible');

  // Fade out icon
  modalIcon.style.opacity = '0';

  // Reset after transition
  setTimeout(() => {
    modalIcon.innerHTML = '';
    modalIcon.style.transition = 'none';
  }, 500);
}

// (Escape key handler sudah digabung di atas bersama menu handler)

// Close on backdrop tap (not on sheet)
function handleModalClick(e) {
  if (!e.target.closest('.prod-modal-sheet') &&
      !e.target.closest('.prod-modal-icon') &&
      !e.target.closest('.prod-modal-close')) {
    closeProductModal();
  }
}

// Close on swipe down
let touchStartY = 0;
document.getElementById('modalSheet').addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });
document.getElementById('modalSheet').addEventListener('touchend', e => {
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (dy > 60) closeProductModal();
}, { passive: true });
