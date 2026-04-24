/* ══════════════════════════════════════════════════════
   1. KONFIGURASI SUPABASE
══════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://lzjmyildurannngskrcyo.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6am15aWxkdXJhbm5nc2tyY3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMzU1NjUsImV4cCI6MjA4NjgxMTU2NX0.ybyZTOLYGMOjM_SucsfpsVU3WaL8qVY4m-1XYdK2J7Q';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TABLE  = 'KAMAR-NAGA-PUTIH';
const BUCKET = 'foto-piket';

/* ══════════════════════════════════════════════════════
   2. DATA MASTER JADWAL
══════════════════════════════════════════════════════ */
const GROUPS = [
  { persons: ['Jufri', 'Ardi'], photos: ['https://i.imgur.com/YPuXfjB.png', 'https://i.imgur.com/YPuXfjB.png'] },
  { persons: ['Reonaldo','Agus'], photos: ['https://i.imgur.com/sDDUjZQ.png', 'https://i.imgur.com/sDDUjZQ.png'] },
  { persons: ['Farizi', 'Yope Musang'], photos: ['https://i.imgur.com/JADPNwJ.png', 'https://i.imgur.com/JADPNwJ.png'] },
  { persons: ['Hasan', 'Geo'], photos: ['https://i.imgur.com/em5Nyuy.png', 'https://i.imgur.com/em5Nyuy.png'] },
  { persons: ['Aksan', 'Chandra'], photos: ['https://i.imgur.com/sDDUjZQ.png', 'https://i.imgur.com/sDDUjZQ.png'] },
  { persons: ['Imanuel', 'Dandi'], photos: ['https://i.imgur.com/JADPNwJ.png', 'https://i.imgur.com/JADPNwJ.png'] },
];

// Anchor awal jadwal (25 April 2026)
const ANCHOR = new Date('2026-04-25'); 
ANCHOR.setHours(0,0,0,0);

const CYCLE_DAYS = 5;
const ALL_MEMBERS = GROUPS.flatMap(g => g.persons.map((p,i) => ({ name: p, photo: g.photos[i] })));

/* ══════════════════════════════════════════════════════
   3. STATE & HELPER
══════════════════════════════════════════════════════ */
const today = new Date(); today.setHours(0,0,0,0);
const todayKey = fmtDate(today);
let weekOffset = 0;
let doneMap = {}; 

const DAY_S = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const DAY_F = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const MON_S = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const MON_F = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getGroupForDate(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const diff = Math.round((d - ANCHOR) / 86400000);
  if (diff < 0 || diff % CYCLE_DAYS !== 0) return null;
  return GROUPS[Math.floor(diff / CYCLE_DAYS) % GROUPS.length];
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 2600);
}

function refreshUI() {
  renderStrip();
  renderSchedule();
  renderMembers();
}

/* ══════════════════════════════════════════════════════
   4. SUPABASE FUNCTIONS
══════════════════════════════════════════════════════ */
async function loadData() {
  try {
    const { data, error } = await db.from(TABLE).select('tanggal, is_done, foto_url');
    if (error) throw error;
    doneMap = {};
    (data || []).forEach(row => {
      doneMap[row.tanggal] = { is_done: row.is_done, foto_url: row.foto_url };
    });
  } catch (err) {
    console.warn('Load gagal:', err.message);
  } finally {
    refreshUI();
  }
}

async function saveStatus(tanggal, isDone) {
  try {
    const { error } = await db.from(TABLE).upsert({ tanggal, is_done: isDone }, { onConflict: 'tanggal' });
    if (error) throw error;
  } catch (err) {
    showToast('❌ Gagal sinkron database');
  }
}

async function uploadFoto(tanggal, file) {
  if (!file) return;
  showToast('⏳ Mengunggah foto...');
  try {
    const fileName = `${tanggal}-${Date.now()}.jpg`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(fileName, file);
    if (upErr) throw upErr;

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(fileName);
    const fotoUrl = urlData.publicUrl;

    await db.from(TABLE).upsert({ tanggal, is_done: true, foto_url: fotoUrl }, { onConflict: 'tanggal' });
    
    doneMap[tanggal] = { is_done: true, foto_url: fotoUrl };
    refreshUI();
    showToast('📸 Bukti piket tersimpan!');
  } catch (err) {
    showToast('❌ Gagal upload foto');
  }
}

function listenRealtime() {
  db.channel('naga-putih').on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, payload => {
    const row = payload.new || {};
    if (row.tanggal) {
      doneMap[row.tanggal] = { is_done: row.is_done, foto_url: row.foto_url };
      refreshUI();
    }
  }).subscribe();
}

/* ══════════════════════════════════════════════════════
   5. SLIDER AUTO-BANNER
══════════════════════════════════════════════════════ */
(function initSlider() {
  const TOTAL = 7; const INTERVAL = 2500;
  const track = document.getElementById('sliderTrack');
  const dotsWrap = document.getElementById('sDots');
  const bar = document.getElementById('sBar');
  if (!track || !dotsWrap) return;

  let cur = 0, timer = null, raf = null, t0 = null;

  for (let i = 0; i < TOTAL; i++) {
    const d = document.createElement('button');
    d.className = 'dot' + (i === 0 ? ' active' : '');
    d.onclick = () => { cur = i; updateUI(); reset(); };
    dotsWrap.appendChild(d);
  }

  function updateUI() {
    track.style.transform = `translateX(-${cur * 100}%)`;
    const ctr = document.getElementById('sCtr');
    if(ctr) ctr.textContent = `${cur + 1} / ${TOTAL}`;
    dotsWrap.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === cur));
  }

  function startProgress() {
    cancelAnimationFrame(raf);
    t0 = performance.now();
    function step(now) {
      const pct = Math.min(((now - t0) / INTERVAL) * 100, 100);
      if (bar) bar.style.width = pct + '%';
      if (pct < 100) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  function start() {
    startProgress();
    timer = setInterval(() => { cur = (cur + 1) % TOTAL; updateUI(); startProgress(); }, INTERVAL);
  }

  function reset() { clearInterval(timer); cancelAnimationFrame(raf); start(); }

  document.getElementById('sPrev').onclick = () => { cur = (cur + TOTAL - 1) % TOTAL; updateUI(); reset(); };
  document.getElementById('sNext').onclick = () => { cur = (cur + 1) % TOTAL; updateUI(); reset(); };

  updateUI(); start();
})();

/* ══════════════════════════════════════════════════════
   6. RENDER UI FUNCTIONS
══════════════════════════════════════════════════════ */
function renderStrip() {
  const strip = document.getElementById('today-strip');
  const txt = document.getElementById('strip-text');
  if (!strip || !txt) return;
  strip.className = 'today-strip';
  if (today.getDay() === 0) {
    strip.classList.add('holiday');
    txt.textContent = 'Hari ini Minggu — Libur piket! 🎉';
    return;
  }
  const grp = getGroupForDate(today);
  const data = doneMap[todayKey];
  strip.classList.add('on-duty');
  if (grp) {
    txt.innerHTML = (data && data.is_done) ? `✅ Piket <strong>${grp.persons.join(' & ')}</strong> Selesai!` : `🧹 Giliran: <strong>${grp.persons.join(' & ')}</strong>`;
  } else {
    txt.innerHTML = `📅 Tidak ada jadwal piket hari ini`;
  }
}

function renderSchedule() {
  const grid = document.getElementById('sched');
  if (!grid) return;
  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow + weekOffset * 7);

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  });

  document.getElementById('week-label').textContent = dates[0].getDate() + ' ' + MON_S[dates[0].getMonth()] + ' – ' + dates[6].getDate() + ' ' + MON_S[dates[6].getMonth()] + ' ' + dates[6].getFullYear();

  let html = '';
  dates.forEach((date, idx) => {
    const dkey = fmtDate(date);
    const isSun = date.getDay() === 0;
    const isToday = dkey === todayKey;
    const rowData = doneMap[dkey] || { is_done: false, foto_url: null };
    const grp = getGroupForDate(date);

    let body = isSun ? `<div class="holiday-pill">🔴 Libur</div>` : grp ? `
      <div class="persons-row">
        <div class="persons-list">${grp.persons.map((p, i) => `<div class="person-chip"><span class="person-nm">${p}</span></div>`).join('')}</div>
        <input class="done-toggle" type="checkbox" id="chk-${dkey}" data-dk="${dkey}" ${rowData.is_done ? 'checked' : ''}>
      </div>
      <div class="proof-section">
        ${rowData.foto_url ? `<img src="${rowData.foto_url}" class="proof-preview" onclick="window.open('${rowData.foto_url}')">` : ''}
        <label class="upload-label">📸 <input type="file" accept="image/*" data-dk="${dkey}" style="display:none"> Upload</label>
      </div>` : `<div class="no-sched">Kosong</div>`;

    html += `<div class="day-card ${isToday ? 'is-today' : ''} ${rowData.is_done ? 'done-card' : ''}">
      <div class="date-col"><b>${DAY_S[date.getDay()]}</b><br>${date.getDate()}</div>
      <div class="card-body">${body}</div>
    </div>`;
  });
  grid.innerHTML = html;

  grid.querySelectorAll('.done-toggle').forEach(chk => {
    chk.onchange = async (e) => {
      const dk = e.target.dataset.dk;
      doneMap[dk] = { ...doneMap[dk], is_done: e.target.checked };
      refreshUI();
      await saveStatus(dk, e.target.checked);
    };
  });

  grid.querySelectorAll('input[type="file"]').forEach(inp => {
    inp.onchange = (e) => { if(e.target.files[0]) uploadFoto(e.target.dataset.dk, e.target.files[0]); };
  });
}

function renderMembers() {
  const grid = document.getElementById('members');
  if (!grid) return;
  let html = '';
  ALL_MEMBERS.forEach(m => {
    let count = Object.keys(doneMap).filter(dk => doneMap[dk].is_done && getGroupForDate(dk)?.persons.includes(m.name)).length;
    html += `<div class="member-card"><b>${m.name}</b><br>Selesai: ${count}x</div>`;
  });
  grid.innerHTML = html;
}

/* ══════════════════════════════════════════════════════
   7. INISIALISASI
══════════════════════════════════════════════════════ */
function updateClock() {
  const n = new Date();
  if (document.getElementById('live-date')) document.getElementById('live-date').textContent = DAY_F[n.getDay()] + ', ' + n.getDate() + ' ' + MON_F[n.getMonth()] + ' ' + n.getFullYear();
  if (document.getElementById('live-time')) document.getElementById('live-time').textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0') + ':' + String(n.getSeconds()).padStart(2, '0');
}

document.getElementById('btn-prev').onclick  = () => { weekOffset--; renderSchedule(); };
document.getElementById('btn-next').onclick  = () => { weekOffset++; renderSchedule(); };
document.getElementById('btn-today').onclick = () => { weekOffset = 0; renderSchedule(); };

setInterval(updateClock, 1000);
updateClock();
loadData();
listenRealtime();
