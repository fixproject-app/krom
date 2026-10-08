// ============================================================
// 3 WARNA TEKNIK — app.js (Supabase). Ganti 2 nilai di bawah.
// ============================================================
const SUPABASE_URL = 'https://cfgmhylqtoiuuddlczqz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bWuK7OJGYhd4eREUc9y9Rg_k9avxnUy'; // anon/public key, aman di frontend (dilindungi RLS)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Helper umum ──
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const num = n => Number(n || 0).toLocaleString('id-ID');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowJam = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const tglID = s => s ? s.split('-').reverse().join('/') : '';
const hariTgl = s => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long' }) + ', ' + tglID(s); // Selasa, 29/09/2026
const waktuID = (t, j) => `${(j || '00:00').slice(0, 5)} ${hariTgl(t)}`;           // 10:30 Kamis, 08/10/2026
// Warna baris per tanggal: berdasarkan nomor hari, jadi tanggal berurutan selalu beda warna
const dayClass = s => Math.floor(Date.parse(s + 'T00:00:00Z') / 86400000) % 8;
const ketLabel = k => ({ proses_ulang: 'Proses Ulang', kembali_gudang: 'Kembali ke Gudang' }[k] || '-');
const showLoading = () => $('loading-overlay').classList.remove('d-none');
const hideLoading = () => $('loading-overlay').classList.add('d-none');

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`; el.textContent = msg;
  $('toast-container').appendChild(el); setTimeout(() => el.remove(), 3500);
}
function friendly(e) {
  const m = e.message || 'Terjadi kesalahan.';
  if (m.includes('duplicate key')) return 'Data dengan nama/kode yang sama sudah ada.';
  if (m.includes('violates foreign key')) return 'Data masih dipakai oleh transaksi lain.';
  if (m.includes('row-level security')) return 'Akses ditolak. Pastikan akun Anda adalah admin.';
  return m;
}
// Semua panggilan Supabase lewat sini: loading + toast error konsisten
async function call(promise, okMsg) {
  showLoading();
  try {
    const { data, error, count } = await promise;
    if (error) throw error;
    if (okMsg) toast(okMsg);
    return { ok: true, data, count };
  } catch (e) { toast(friendly(e), 'danger'); return { ok: false }; }
  finally { hideLoading(); }
}

// ── State ──
let vendors = [], items = [], cfg = {}, appReady = false, chart = null, rwTimer = null;
const mTx = () => bootstrap.Modal.getOrCreateInstance($('modal-tx'));
const mVd = () => bootstrap.Modal.getOrCreateInstance($('modal-vendor'));
const mKt = () => bootstrap.Modal.getOrCreateInstance($('modal-kat'));

// ── Tema ──
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-bs-theme', t);
  localStorage.setItem('theme', t);
}
function toggleDarkMode() { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); if (chart) loadDashboard(); }
setTheme(localStorage.getItem('theme') || 'light');

// ── Auth ──
async function doLogin(e) {
  e.preventDefault();
  await call(sb.auth.signInWithPassword({ email: $('lg-email').value, password: $('lg-pass').value }));
}
async function doLogout() { await sb.auth.signOut(); }
sb.auth.onAuthStateChange((event, session) => {
  if (session && !appReady) {
    appReady = true;
    $('view-login').classList.add('d-none'); $('view-app').classList.remove('d-none');
    setTimeout(startApp, 0); // hindari deadlock di dalam callback auth
  } else if (!session) {
    appReady = false;
    $('view-app').classList.add('d-none'); $('view-login').classList.remove('d-none');
  }
});

async function startApp() {
  $('d-hariini').value = todayStr();
  const [w1, w2] = weekRange(); $('d-dari').value = w1; $('d-sampai').value = w2; // dasbor default: minggu ini
  await loadMaster();
  navigateTo('dashboard');
}

// ── Data master (vendor, katalog, config) ──
async function loadMaster() {
  const [v, i, c] = await Promise.all([
    call(sb.from('vendors').select('*').order('nama')),
    call(sb.from('catalog_items').select('*').order('kode')),
    call(sb.from('app_config').select('*'))
  ]);
  if (v.ok) vendors = v.data; if (i.ok) items = i.data;
  if (c.ok) cfg = Object.fromEntries(c.data.map(r => [r.key, r.value]));
  fillVendorSelects(); renderVendors(); renderKatalog(); applyConfig();
}
function fillVendorSelects() {
  const opt = (all, list) => (all ? `<option value="">${all}</option>` : '') + list.map(v => `<option value="${v.id}">${esc(v.nama)}${v.aktif ? '' : ' (nonaktif)'}</option>`).join('');
  const act = vendors.filter(v => v.aktif);
  ['d-vendor', 'rw-vendor', 'tr-vendor'].forEach(id => { const s = $(id), c = s.value; s.innerHTML = opt('Semua Vendor', vendors); s.value = c; });
  const iv = $('iv-vendor'), c2 = iv.value; iv.innerHTML = opt('-- Pilih Vendor --', act); iv.value = c2;
}
function applyConfig() {
  $('brand-name').textContent = cfg.nama_bengkel || '3 WARNA TEKNIK';
  $('iv-nama').textContent = cfg.nama_bengkel || ''; $('iv-sub').textContent = cfg.subjudul || ''; $('iv-alamat').textContent = cfg.alamat || '';
  applyLogo();
  $('cf-nama').value = cfg.nama_bengkel || ''; $('cf-sub').value = cfg.subjudul || ''; $('cf-alamat').value = cfg.alamat || '';
}

// ── Navigasi SPA ──
function toggleSidebar() { $('sidebar').classList.toggle('open'); }
function navigateTo(id) {
  document.querySelectorAll('.app-section').forEach(el => el.classList.add('d-none'));
  $(`section-${id}`).classList.remove('d-none');
  document.querySelectorAll('.nav-x').forEach(el => el.classList.toggle('active', el.dataset.section === id));
  $('sidebar').classList.remove('open');
  if (id === 'dashboard') { loadDashboard(); loadHariIni(); }
  if (id === 'riwayat') loadRiwayat(0);
  if (id === 'transaksi') loadTransaksi();
  if (id === 'invoice') loadInvoiceList();
}

// ============================================================
// DASBOR
// ============================================================
const KPI = [
  ['out', 'Mentah (Out)', 'var(--out)', 'fa-truck-arrow-right', 'Dikirim ke Vendor'],
  ['in', 'Jadi (In)', 'var(--in)', 'fa-circle-check', 'Selesai Krom Diterima'],
  ['rej', 'Reject', 'var(--rej)', 'fa-triangle-exclamation', 'Gagal Krom'],
  ['proc', 'Dalam Proses', 'var(--accent)', 'fa-spinner', 'Sisa Antrean (sepanjang waktu)'],
  ['tag', 'Total Tagihan', 'var(--tag)', 'fa-receipt', 'Hanya dari Jadi (In)']
];
$('kpi-row').innerHTML = KPI.map(k => `<div class="col-6 col-lg"><div class="card-x kpi">
  <div class="kpi-h" style="color:${k[2]}"><span>${k[1]}</span><i class="fa-solid ${k[3]}"></i></div>
  <div class="kpi-v" id="k-${k[0]}">0</div><div class="kpi-s">${k[4]}</div><div class="kpi-l" id="l-${k[0]}"></div></div></div>`).join('');

// Minggu ini = Senin s/d Minggu
function weekRange() {
  const d = new Date(), s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const e = new Date(s); e.setDate(s.getDate() + 6);
  const f = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  return [f(s), f(e)];
}
function setMingguIni() { const [a, b] = weekRange(); $('d-vendor').value = ''; $('d-dari').value = a; $('d-sampai').value = b; loadDashboard(); }
function setSemuaWaktu() { $('d-vendor').value = ''; $('d-dari').value = ''; $('d-sampai').value = ''; loadDashboard(); }

async function loadDashboard() {
  const r = await call(sb.rpc('dashboard_per_item', {
    p_vendor: $('d-vendor').value || null, p_dari: $('d-dari').value || null, p_sampai: $('d-sampai').value || null
  }));
  if (!r.ok) return;
  const rows = r.data, sum = k => rows.reduce((a, x) => a + Number(x[k]), 0);
  const list = (id, key, cls) => {
    const f = rows.filter(x => Number(x[key]) !== 0);
    $(id).innerHTML = f.length ? f.map(x => `<div><span>${esc(x.item)}</span><b class="${Number(x[key]) < 0 ? 'text-danger' : cls}">${Number(x[key]) < 0 ? '⚠ ' : ''}${num(x[key])}</b></div>`).join('') : '<i class="text-muted">Tidak ada data</i>';
  };
  $('k-out').textContent = num(sum('qty_out')) + ' Pcs'; $('k-in').textContent = num(sum('qty_in')) + ' Pcs';
  $('k-rej').textContent = num(sum('qty_reject')) + ' Pcs';
  $('k-proc').textContent = num(rows.reduce((a, x) => a + Math.max(0, Number(x.sisa)), 0)) + ' Pcs';
  $('k-tag').textContent = rp(sum('tagihan'));
  list('l-out', 'qty_out', 'tx-out'); list('l-in', 'qty_in', 'tx-in'); list('l-rej', 'qty_reject', 'tx-rej');
  list('l-proc', 'sisa', 'text-info'); $('l-tag').innerHTML = rows.filter(x => Number(x.tagihan) > 0).map(x => `<div><span>${esc(x.item)}</span><b>${rp(x.tagihan)}</b></div>`).join('') || '<i class="text-muted">Tidak ada data</i>';

  // Grafik
  if (chart) chart.destroy();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  chart = new Chart($('dashChart'), {
    type: 'bar',
    data: { labels: rows.map(x => x.item), datasets: [
      { label: 'Mentah (Out)', data: rows.map(x => Number(x.qty_out)), backgroundColor: '#f59e0b', borderRadius: 4 },
      { label: 'Jadi (In)', data: rows.map(x => Number(x.qty_in)), backgroundColor: '#10b981', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: dark ? '#e2e8f0' : '#1e293b' } } },
      scales: { x: { ticks: { color: dark ? '#94a3b8' : '#64748b' } }, y: { beginAtZero: true, ticks: { color: dark ? '#94a3b8' : '#64748b' } } } }
  });
  // Insight otomatis
  const top = rows.filter(x => Number(x.sisa) > 0).sort((a, b) => b.sisa - a.sisa)[0];
  const neg = rows.filter(x => Number(x.sisa) < 0);
  $('ai-insight').textContent = (top ? `Antrean terbesar: "${top.item}" dengan ${num(top.sisa)} pcs masih di vendor.` : 'Tidak ada antrean barang di vendor.')
    + (neg.length ? ` Perhatian: ${neg.map(x => x.item).join(', ')} bernilai negatif (Jadi/Reject melebihi Mentah) — periksa input.` : '');
}

// Kartu "Transaksi Krom Hari Ini" per vendor
async function loadHariIni() {
  const t = $('d-hariini').value || todayStr();
  const r = await call(sb.rpc('ringkasan_harian', { p_tanggal: t }));
  if (!r.ok) return;
  $('hariini-row').innerHTML = r.data.length ? r.data.map(v => {
    const idle = !Number(v.qty_out) && !Number(v.qty_in) && !Number(v.qty_reject);
    return `<div class="col-6 col-md-4 col-xl-3"><div class="card-x day-card ${idle ? 'idle' : ''}">
      <div class="dn">${esc(v.vendor)}</div>
      <div class="dg"><span>Mentah<b class="tx-out">${num(v.qty_out)}</b></span><span>Jadi<b class="tx-in">${num(v.qty_in)}</b></span><span>Reject<b class="tx-rej">${num(v.qty_reject)}</b></span></div>
      <div class="dt">${rp(v.tagihan)}</div></div></div>`;
  }).join('') : '<p class="small text-muted mb-0">Belum ada vendor aktif.</p>';
}
function setHariIni() { $('d-hariini').value = todayStr(); loadHariIni(); }
// Otomatis ikut pergantian hari (selama filter masih di "hari ini" sebelumnya)
let lastToday = todayStr();
setInterval(() => {
  const t = todayStr();
  if (t !== lastToday) {
    if ($('d-hariini').value === lastToday) { $('d-hariini').value = t; if (!$('section-dashboard').classList.contains('d-none')) loadHariIni(); }
    lastToday = t;
  }
}, 30000);

// ============================================================
// RIWAYAT (Barang Masuk & Keluar)
// ============================================================
const RW = 25;
function debounceRw() { clearTimeout(rwTimer); rwTimer = setTimeout(() => loadRiwayat(0), 350); }
async function loadRiwayat(p = 0) {
  const q = $('rw-q').value.trim(), v = $('rw-vendor').value, asc = $('rw-sort').value === 'asc';
  let qb = sb.from('transactions').select(`*, vendors(nama), catalog_items${q ? '!inner' : ''}(nama)`, { count: 'exact' }).is('deleted_at', null);
  if (v) qb = qb.eq('vendor_id', v);
  if (q) qb = qb.ilike('catalog_items.nama', `%${q}%`);
  qb = qb.order('tanggal', { ascending: asc }).order('jam', { ascending: asc }).range(p * RW, p * RW + RW - 1);
  const r = await call(qb); if (!r.ok) return;
  $('rw-count').textContent = r.count ?? r.data.length;
  $('rw-body').innerHTML = r.data.length ? r.data.map(t => {
    const lock = !!t.invoice_id;
    return `<tr class="dc-${dayClass(t.tanggal)}">
      <td class="fw-semibold text-nowrap">${waktuID(t.tanggal, t.jam)}</td><td>${esc(t.vendors?.nama)}</td><td>${esc(t.catalog_items?.nama)}</td>
      <td class="text-center tx-out">${t.qty_out}</td><td class="text-center tx-in">${t.qty_in}</td><td class="text-center tx-rej">${t.qty_reject}</td>
      <td>${ketLabel(t.reject_action)}</td><td class="text-end">${rp(t.harga)}</td><td class="text-end tx-tag">${rp(t.qty_in * t.harga)}</td>
      <td class="text-center text-nowrap">${lock ? '<i class="fa-solid fa-lock text-muted" title="Sudah masuk invoice"></i>' :
        `<button class="btn btn-sm text-info" onclick="openTx('${t.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
         <button class="btn btn-sm text-danger" onclick="delTx('${t.id}')"><i class="fa-solid fa-trash"></i></button>`}</td></tr>`;
  }).join('') : '<tr><td colspan="10" class="text-center text-muted p-3">Belum ada transaksi</td></tr>';
  const pages = Math.ceil((r.count || 0) / RW);
  $('rw-pager').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) =>
    `<button class="btn btn-sm ${i === p ? 'btn-accent' : 'btn-outline-secondary'}" onclick="loadRiwayat(${i})">${i + 1}</button>`).join('') : '';
}

function fillItemSelect(currentId) {
  $('tx-item').innerHTML = '<option value="">-- Pilih Produk --</option>' + items.filter(i => i.aktif || i.id === currentId)
    .map(i => `<option value="${i.id}" data-tarif="${i.tarif}">${esc(i.nama)} (${rp(i.tarif)})</option>`).join('');
}
function onItemChange() {
  const o = $('tx-item').selectedOptions[0];
  if (o && o.dataset.tarif) $('tx-harga').value = o.dataset.tarif;
}
async function openTx(id) {
  $('tx-id').value = id || '';
  $('tx-title').textContent = id ? 'Edit Transaksi' : 'Input Transaksi Baru';
  let t = null;
  if (id) { const r = await call(sb.from('transactions').select('*').eq('id', id).single()); if (!r.ok) return; t = r.data; }
  $('tx-vendor').innerHTML = vendors.filter(v => v.aktif || v.id === t?.vendor_id).map(v => `<option value="${v.id}">${esc(v.nama)}</option>`).join('');
  fillItemSelect(t?.item_id);
  $('tx-tanggal').value = t?.tanggal || todayStr(); $('tx-jam').value = t ? t.jam.slice(0, 5) : nowJam();
  if (t) { $('tx-vendor').value = t.vendor_id; $('tx-item').value = t.item_id; }
  $('tx-out').value = t?.qty_out ?? 0; $('tx-in').value = t?.qty_in ?? 0; $('tx-rej').value = t?.qty_reject ?? 0;
  $('tx-ket').value = t?.reject_action || ''; $('tx-harga').value = t?.harga ?? 0;
  mTx().show();
}
async function saveTx(e) {
  e.preventDefault();
  const id = $('tx-id').value;
  const o = {
    tanggal: $('tx-tanggal').value, jam: $('tx-jam').value, vendor_id: $('tx-vendor').value, item_id: $('tx-item').value,
    qty_out: +$('tx-out').value || 0, qty_in: +$('tx-in').value || 0, qty_reject: +$('tx-rej').value || 0
  };
  o.reject_action = o.qty_reject > 0 ? ($('tx-ket').value || null) : null;
  o.harga = o.qty_in > 0 ? (+$('tx-harga').value || 0) : 0; // ongkos hanya berlaku untuk barang Jadi
  if (o.qty_out + o.qty_in + o.qty_reject === 0) return toast('Isi minimal satu jumlah.', 'danger');
  if (o.qty_reject > 0 && !o.reject_action) return toast('Pilih keterangan reject.', 'danger');
  if (o.qty_in > 0 && o.harga === 0 && !confirm('Ongkos 0 untuk barang Jadi. Lanjutkan?')) return;
  const r = await call(id ? sb.from('transactions').update(o).eq('id', id) : sb.from('transactions').insert(o), 'Transaksi tersimpan.');
  if (r.ok) { mTx().hide(); refreshActive(); }
}
async function delTx(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  const r = await call(sb.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id), 'Transaksi dihapus.');
  if (r.ok) refreshActive();
}
function refreshActive() {
  const a = document.querySelector('.nav-x.active')?.dataset.section; if (a) navigateTo(a);
}

// ============================================================
// TRANSAKSI (rekap harian, baca saja)
// ============================================================
async function loadTransaksi() {
  let qb = sb.from('v_transaksi_harian').select('*').order('tanggal', { ascending: false }).order('vendor').order('item');
  const v = $('tr-vendor').value, d = $('tr-dari').value, s = $('tr-sampai').value;
  if (v) qb = qb.eq('vendor_id', v); if (d) qb = qb.gte('tanggal', d); if (s) qb = qb.lte('tanggal', s);
  const r = await call(qb.limit(500)); if (!r.ok) return;
  $('tr-body').innerHTML = r.data.length ? r.data.map(x => `<tr>
    <td class="fw-semibold text-nowrap">${hariTgl(x.tanggal)}</td><td>${esc(x.vendor)}</td><td>${esc(x.item)}${x.invoice_id ? ' <i class="fa-solid fa-lock text-muted" title="Sudah ditagihkan"></i>' : ''}</td>
    <td class="text-center tx-out">${x.qty_out}</td><td class="text-center tx-in">${x.qty_in}</td><td class="text-center tx-rej">${x.qty_reject}</td>
    <td class="text-end">${rp(x.ongkos || 0)}</td><td class="text-end tx-tag">${rp(x.total)}</td></tr>`).join('')
    : '<tr><td colspan="8" class="text-center text-muted p-3">Belum ada data</td></tr>';
  $('tr-total').textContent = rp(r.data.reduce((a, x) => a + Number(x.total), 0));
}

// ============================================================
// VENDOR
// ============================================================
function renderVendors() {
  $('vendor-cards').innerHTML = vendors.length ? vendors.map(v => `<div class="col-md-6 col-lg-4"><div class="card-x p-3 ${v.aktif ? '' : 'opacity-50'}">
    <div class="d-flex justify-content-between"><h6 class="fw-bold">${esc(v.nama)}</h6>
      <div><button class="btn btn-sm text-info p-0 me-2" onclick="openVendor('${v.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
      <button class="btn btn-sm p-0 text-secondary" title="${v.aktif ? 'Nonaktifkan' : 'Aktifkan'}" onclick="toggleVendor('${v.id}',${!v.aktif})"><i class="fa-solid fa-${v.aktif ? 'toggle-on' : 'toggle-off'}"></i></button></div></div>
    <div class="small"><i class="fa-solid fa-phone me-1 text-muted"></i>${esc(v.kontak || '-')}</div>
    <div class="small"><i class="fa-solid fa-location-dot me-1 text-muted"></i>${esc(v.alamat || '-')}</div></div></div>`).join('')
    : '<p class="small text-muted">Belum ada vendor.</p>';
}
function openVendor(id) {
  const v = vendors.find(x => x.id === id);
  $('vd-title').textContent = v ? 'Edit Vendor' : 'Tambah Vendor';
  $('vd-id').value = v?.id || ''; $('vd-nama').value = v?.nama || ''; $('vd-kontak').value = v?.kontak || ''; $('vd-alamat').value = v?.alamat || '';
  mVd().show();
}
async function saveVendor(e) {
  e.preventDefault();
  const id = $('vd-id').value, o = { nama: $('vd-nama').value.trim(), kontak: $('vd-kontak').value, alamat: $('vd-alamat').value };
  const r = await call(id ? sb.from('vendors').update(o).eq('id', id) : sb.from('vendors').insert(o), 'Vendor tersimpan.');
  if (r.ok) { mVd().hide(); await loadMaster(); }
}
async function toggleVendor(id, aktif) {
  const r = await call(sb.from('vendors').update({ aktif }).eq('id', id)); if (r.ok) loadMaster();
}

// ============================================================
// KATALOG
// ============================================================
function renderKatalog() {
  $('kat-body').innerHTML = items.length ? items.map(i => `<tr class="${i.aktif ? '' : 'opacity-50'}">
    <td class="font-monospace">${esc(i.kode)}</td><td class="fw-semibold">${esc(i.nama)}</td><td>${esc(i.finishing || '-')}</td>
    <td class="text-end tx-tag">${rp(i.tarif)}</td><td class="text-center">${i.aktif ? 'Aktif' : 'Nonaktif'}</td>
    <td class="text-center"><button class="btn btn-sm text-info" onclick="openKatalog('${i.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
    <button class="btn btn-sm text-secondary" onclick="toggleItem('${i.id}',${!i.aktif})"><i class="fa-solid fa-${i.aktif ? 'toggle-on' : 'toggle-off'}"></i></button></td></tr>`).join('')
    : '<tr><td colspan="6" class="text-center text-muted p-3">Belum ada data katalog</td></tr>';
}
function openKatalog(id) {
  const i = items.find(x => x.id === id);
  $('kt-title').textContent = i ? 'Edit Item Katalog' : 'Tambah Item Katalog';
  $('kt-id').value = i?.id || ''; $('kt-kode').value = i?.kode || ''; $('kt-nama').value = i?.nama || '';
  $('kt-finish').value = i?.finishing || ''; $('kt-tarif').value = i?.tarif ?? '';
  mKt().show();
}
async function saveKatalog(e) {
  e.preventDefault();
  const id = $('kt-id').value, o = { kode: $('kt-kode').value.trim(), nama: $('kt-nama').value.trim(), finishing: $('kt-finish').value, tarif: +$('kt-tarif').value || 0 };
  const r = await call(id ? sb.from('catalog_items').update(o).eq('id', id) : sb.from('catalog_items').insert(o), 'Katalog tersimpan.');
  if (r.ok) { mKt().hide(); await loadMaster(); }
}
async function toggleItem(id, aktif) {
  const r = await call(sb.from('catalog_items').update({ aktif }).eq('id', id)); if (r.ok) loadMaster();
}

// ============================================================
// INVOICE (mengacu ke rekap harian)
// ============================================================
function renderInvoice(rows, meta) {
  const v = vendors.find(x => x.id === meta.vendor_id);
  $('iv-no').textContent = meta.nomor; $('iv-periode').textContent = meta.periode; $('iv-status').textContent = meta.status;
  $('iv-vname').textContent = v?.nama || '-'; $('iv-vkontak').textContent = v ? `${v.kontak || '-'} - ${v.alamat || '-'}` : '';
  $('iv-harian').innerHTML = rows.length ? rows.map((x, n) => `<tr><td>${n + 1}</td><td>${hariTgl(x.tanggal)}</td><td>${esc(x.item)}</td>
    <td class="text-center">${x.qty_out}</td><td class="text-center">${x.qty_in}</td><td class="text-center">${x.qty_reject}</td>
    <td class="text-end">${rp(x.ongkos || 0)}</td><td class="text-end">${rp(x.total)}</td></tr>`).join('')
    : '<tr><td colspan="8" class="text-center text-muted">Tidak ada transaksi pada periode ini</td></tr>';
  const g = {};
  rows.filter(x => x.qty_in > 0).forEach(x => {
    const k = x.item + '|' + x.ongkos; g[k] = g[k] || { item: x.item, ongkos: x.ongkos, qty: 0, sub: 0 };
    g[k].qty += x.qty_in; g[k].sub += Number(x.total);
  });
  const rk = Object.values(g);
  $('iv-rekap').innerHTML = rk.length ? rk.map((x, n) => `<tr><td>${n + 1}</td><td>${esc(x.item)}</td><td class="text-center">${num(x.qty)} Pcs</td><td class="text-end">${rp(x.ongkos)}</td><td class="text-end">${rp(x.sub)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="text-center text-muted">Tidak ada rekap tagihan</td></tr>';
  $('iv-total').textContent = rp(rk.reduce((a, x) => a + x.sub, 0));
}
function invParams() {
  const vendor_id = $('iv-vendor').value, d = $('iv-dari').value, s = $('iv-sampai').value;
  if (!vendor_id) { toast('Pilih vendor dulu.', 'danger'); return null; }
  if (!d || !s) { toast('Isi periode Dari dan Sampai.', 'danger'); return null; }
  return { vendor_id, d, s };
}
async function previewInvoice() {
  const p = invParams(); if (!p) return;
  const r = await call(sb.from('v_transaksi_harian').select('*').eq('vendor_id', p.vendor_id).is('invoice_id', null)
    .gte('tanggal', p.d).lte('tanggal', p.s).order('tanggal').order('item'));
  if (r.ok) renderInvoice(r.data, { vendor_id: p.vendor_id, nomor: '(Pratinjau)', periode: `${tglID(p.d)} s/d ${tglID(p.s)}`, status: 'Belum diterbitkan' });
}
async function terbitkanInvoice() {
  const p = invParams(); if (!p) return;
  if (!confirm('Terbitkan invoice? Transaksi pada periode ini akan terkunci.')) return;
  const r = await call(sb.rpc('buat_invoice', { p_vendor: p.vendor_id, p_awal: p.d, p_akhir: p.s }), 'Invoice diterbitkan.');
  if (r.ok) { await loadInvoiceList(); lihatInvoice(r.data); }
}
async function lihatInvoice(id) {
  const [inv, rows] = await Promise.all([
    call(sb.from('invoices').select('*').eq('id', id).single()),
    call(sb.from('v_transaksi_harian').select('*').eq('invoice_id', id).order('tanggal').order('item'))
  ]);
  if (!inv.ok || !rows.ok) return;
  const i = inv.data;
  renderInvoice(rows.data, { vendor_id: i.vendor_id, nomor: i.nomor, periode: `${tglID(i.periode_awal)} s/d ${tglID(i.periode_akhir)}`, status: i.status === 'lunas' ? 'LUNAS' : 'BELUM LUNAS' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function loadInvoiceList() {
  const r = await call(sb.from('invoices').select('*, vendors(nama)').order('created_at', { ascending: false }).limit(30));
  if (!r.ok) return;
  $('iv-list').innerHTML = r.data.length ? r.data.map(i => `<tr><td class="fw-semibold">${esc(i.nomor)}</td><td>${esc(i.vendors?.nama)}</td>
    <td>${tglID(i.periode_awal)} - ${tglID(i.periode_akhir)}</td><td class="text-end tx-tag">${rp(i.total)}</td>
    <td>${i.status === 'lunas' ? '<span class="badge bg-success">Lunas</span>' : '<span class="badge bg-warning text-dark">Terbit</span>'}</td>
    <td class="text-center text-nowrap"><button class="btn btn-sm text-info" title="Lihat" onclick="lihatInvoice('${i.id}')"><i class="fa-solid fa-eye"></i></button>
      ${i.status !== 'lunas' ? `<button class="btn btn-sm text-success" title="Tandai lunas" onclick="setLunas('${i.id}')"><i class="fa-solid fa-check"></i></button>
      <button class="btn btn-sm text-danger" title="Batalkan invoice" onclick="batalInvoice('${i.id}')"><i class="fa-solid fa-ban"></i></button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="6" class="text-center text-muted p-3">Belum ada invoice</td></tr>';
}
async function setLunas(id) {
  const r = await call(sb.from('invoices').update({ status: 'lunas' }).eq('id', id), 'Ditandai lunas.'); if (r.ok) loadInvoiceList();
}
async function batalInvoice(id) {
  if (!confirm('Batalkan invoice? Transaksi akan terbuka kembali dan bisa ditagihkan ulang.')) return;
  const r = await call(sb.from('invoices').delete().eq('id', id), 'Invoice dibatalkan.'); if (r.ok) loadInvoiceList();
}

// ============================================================
// PENGATURAN
// ============================================================
async function saveConfig(e) {
  e.preventDefault();
  const rows = [{ key: 'nama_bengkel', value: $('cf-nama').value }, { key: 'subjudul', value: $('cf-sub').value }, { key: 'alamat', value: $('cf-alamat').value }];
  const r = await call(sb.from('app_config').upsert(rows, { onConflict: 'key' }), 'Pengaturan tersimpan.');
  if (r.ok) { rows.forEach(x => cfg[x.key] = x.value); applyConfig(); }
}

// ── Logo (Supabase Storage, bucket "logo") ──
function applyLogo() {
  const u = cfg.logo_url, box = $('brand-logo');
  box.classList.toggle('has-img', !!u);
  box.innerHTML = u ? `<img class="logo-img" src="${esc(u)}" alt="Logo" />` : '3W';
  const iv = $('iv-logo'); iv.classList.toggle('d-none', !u); if (u) iv.src = u; else iv.removeAttribute('src');
  const pv = $('cf-logo-prev'); pv.classList.toggle('d-none', !u); $('cf-logo-empty').classList.toggle('d-none', !!u); if (u) pv.src = u; else pv.removeAttribute('src');
}
async function uploadLogo() {
  const f = $('cf-logo-file').files[0];
  if (!f) return toast('Pilih file logo dulu.', 'danger');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return toast('Format harus PNG, JPG, atau WEBP.', 'danger');
  if (f.size > 1048576) return toast('Ukuran logo maksimal 1 MB.', 'danger');
  const path = `logo-${Date.now()}.${f.type.split('/')[1].replace('jpeg', 'jpg')}`;
  const up = await call(sb.storage.from('logo').upload(path, f, { contentType: f.type }));
  if (!up.ok) return;
  const url = sb.storage.from('logo').getPublicUrl(path).data.publicUrl;
  const oldPath = cfg.logo_path;
  const r = await call(sb.from('app_config').upsert([{ key: 'logo_url', value: url }, { key: 'logo_path', value: path }], { onConflict: 'key' }), 'Logo diperbarui.');
  if (!r.ok) return;
  cfg.logo_url = url; cfg.logo_path = path; applyLogo(); $('cf-logo-file').value = '';
  if (oldPath) sb.storage.from('logo').remove([oldPath]); // bersihkan file lama
}
async function hapusLogo() {
  if (!cfg.logo_url || !confirm('Hapus logo dan kembali ke logo "3W"?')) return;
  const oldPath = cfg.logo_path;
  const r = await call(sb.from('app_config').delete().in('key', ['logo_url', 'logo_path']), 'Logo dihapus.');
  if (!r.ok) return;
  delete cfg.logo_url; delete cfg.logo_path; applyLogo();
  if (oldPath) sb.storage.from('logo').remove([oldPath]);
}
