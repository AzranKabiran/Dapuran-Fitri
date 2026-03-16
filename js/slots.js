/* ════════════════════════════════════════
   slots.js
   Supabase slot system untuk Dapuran Fitri
   ════════════════════════════════════════

   SETUP (lakukan sekali):
   1. Buat akun di https://supabase.com
   2. Buat project baru
   3. Buka SQL Editor, jalankan query di bawah ini:

   -- Buat tabel slots
   CREATE TABLE slots (
     id          SERIAL PRIMARY KEY,
     product_id  TEXT UNIQUE NOT NULL,
     name        TEXT NOT NULL,
     total       INT  NOT NULL DEFAULT 100,
     remaining   INT  NOT NULL DEFAULT 100,
     is_open     BOOLEAN NOT NULL DEFAULT true,
     updated_at  TIMESTAMPTZ DEFAULT now()
   );

   -- Insert data awal 11 produk
   INSERT INTO slots (product_id, name, total, remaining) VALUES
     ('nastar',         'Nastar',         100, 28),
     ('putri-salju',    'Putri Salju',     100, 36),
     ('semprit',        'Kue Semprit',     100, 45),
     ('gutem',          'Kue Gutem',       100, 32),
     ('lontong-paris',  'Lontong Paris',   100, 38),
     ('kacang-ijo',     'Kacang Ijo',      100, 42),
     ('skipi',          'Kue Skipi',       100, 48),
     ('bangkit-kampung','Bangkit Kampung', 100, 50),
     ('bangkit-susu',   'Bangkit Susu',    100, 44),
     ('paso',           'Kue Paso',        100, 55),
     ('sagon',          'Kue Sagon',       100, 58);

   -- Enable Row Level Security (RLS)
   ALTER TABLE slots ENABLE ROW LEVEL SECURITY;

   -- Policy: publik bisa READ
   CREATE POLICY "public_read_slots"
     ON slots FOR SELECT
     USING (true);

   -- Policy: hanya authenticated (admin) bisa UPDATE
   CREATE POLICY "admin_update_slots"
     ON slots FOR UPDATE
     USING (auth.role() = 'authenticated');

   4. Di Settings → API, salin:
      - Project URL  → isi SUPABASE_URL di bawah
      - anon public key → isi SUPABASE_ANON_KEY di bawah

   ════════════════════════════════════════ */

// ─── CONFIG — Ganti dengan credentials Supabase lo ───
const SUPABASE_URL      = 'https://vxvflguqvtvaxbmymudg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dmZsZ3VxdnR2YXhibXltdWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MjYyMzUsImV4cCI6MjA4OTEwMjIzNX0.weNQechph-_irqYANrmqtEyMyLHR1Sw6iQQjjwSoEHo';
// ──────────────────────────────────────────────────────

/* ── Helper: fetch wrapper ke Supabase REST API ── */
async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${options.token || SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        options.prefer || 'return=representation',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

/* ── PUBLIC: Ambil semua slot ── */
export async function fetchSlots() {
  return supabaseFetch('slots?select=*&order=id.asc');
}

/* ── PUBLIC: Subscribe real-time perubahan slot ──
   Supabase Realtime via WebSocket
   callback(slots) dipanggil setiap ada perubahan */
export function subscribeSlots(callback) {
  const ws = new WebSocket(
    `${SUPABASE_URL.replace('https', 'wss')}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`
  );

  ws.onopen = () => {
    ws.send(JSON.stringify({
      topic: 'realtime:public:slots',
      event: 'phx_join',
      payload: { config: { broadcast: { self: true }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'slots' }] } },
      ref: '1'
    }));
  };

  ws.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);
    if (data.event === 'postgres_changes') {
      // Ada perubahan → refresh semua slot
      const slots = await fetchSlots().catch(() => null);
      if (slots) callback(slots);
    }
  };

  // Heartbeat tiap 30 detik biar koneksi ga putus
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
    }
  }, 30000);

  return () => {
    clearInterval(heartbeat);
    ws.close();
  };
}

/* ── ADMIN: Login dengan email & password ── */
export async function adminLogin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error('Email atau password salah.');
  const data = await res.json();
  sessionStorage.setItem('df_admin_token', data.access_token);
  return data.access_token;
}

/* ── ADMIN: Logout ── */
export function adminLogout() {
  sessionStorage.removeItem('df_admin_token');
}

/* ── ADMIN: Cek apakah sudah login ── */
export function getAdminToken() {
  return sessionStorage.getItem('df_admin_token');
}

/* ── ADMIN: Update slot (remaining, total, is_open) ── */
export async function updateSlot(productId, fields) {
  const token = getAdminToken();
  if (!token) throw new Error('Belum login.');

  const updated = { ...fields, updated_at: new Date().toISOString() };

  return supabaseFetch(
    `slots?product_id=eq.${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(updated),
      prefer: 'return=representation',
    }
  );
}

/* ── ADMIN: Reset slot ke total semula ── */
export async function resetSlot(productId) {
  const token = getAdminToken();
  if (!token) throw new Error('Belum login.');

  // Ambil total dulu
  const [slot] = await supabaseFetch(`slots?product_id=eq.${productId}&select=total`);
  return updateSlot(productId, { remaining: slot.total });
}
