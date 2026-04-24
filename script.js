/* ══════════════════════════════════════════════════════
   1. KONFIGURASI SUPABASE
══════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://lzjmyildurannngskrcyo.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6am15aWxkdXJhbm5nc2tyY3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMzU1NjUsImV4cCI6MjA4NjgxMTU2NX0.ybyZTOLYGMOjM_SucsfpsVU3WaL8qVY4m-1XYdK2J7Q';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TABLE  = 'KAMAR-NAGA-PUTIH';
const BUCKET = 'foto-piket';

/* ══════════════════════════════════════════════════════
   2. DATA MASTER JADWAL (DENGAN FOTO)
══════════════════════════════════════════════════════ */
const GROUPS = [
  { persons: ['Jufri', 'Ardi'], photos: ['https://i.imgur.com/YPuXfjB.png', 'https://i.imgur.com/YPuXfjB.png'] },
  { persons: ['Reonaldo','Agus'], photos: ['https://i.imgur.com/sDDUjZQ.png', 'https://i.imgur.com/sDDUjZQ.png'] },
  { persons: ['Farizi', 'Yope Musang'], photos: ['https://i.imgur.com/JADPNwJ.png', 'https://i.imgur.com/JADPNwJ.png'] },
  { persons: ['Hasan', 'Geo'], photos: ['https://i.imgur.com/em5Nyuy.png', 'https://i.imgur.com/em5Nyuy.png'] },
  { persons: ['Aksan', 'Chandra'], photos: ['https://i.imgur.com/sDDUjZQ.png', 'https://i.imgur.com/sDDUjZQ.png'] },
  { persons: ['Imanuel', 'Dandi'], photos: ['https://i.imgur.com/JADPNwJ.png', 'https://i.imgur.com/JADPNwJ.png'] },
];

const ANCHOR = new Date('2026-04-25'); 
ANCHOR.setHours(0,0,0,0);

const CYCLE_DAYS = 5;
// Mengambil daftar unik semua anggota beserta fotonya
const ALL_MEMBERS = [];
GROUPS.forEach(g => {
    g.persons.forEach((p, i) => {
        if (!ALL_MEMBERS.find(m => m.name === p)) {
            ALL_MEMBERS.push({ name: p, photo: g.photos[i] });
        }
    });
});

/* ══════════════════════════════════════════════════════
   3. STATE & HELPERS
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
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 2600);
}

function refreshUI() {
  renderStrip();
  renderSchedule();
  renderMembers();
}

/* ══════════════════════════════════════════════════════
   4. SUPABASE ACTIONS
══════════════════════════════════════════════════════ */
async function loadData() {
  try {
    const { data, error } = await db.from(TABLE).select('*');
    if (error) throw error;
    doneMap = {};
    (data || []).forEach(row => {
      doneMap[row.tanggal] = { is_done: row.is_done, foto_url: row.foto_url };
    });
  } catch (err) { console.warn('Offline/Load Error'); }
  finally { refreshUI(); }
}

async function saveStatus(tanggal, isDone) {
  await db.from(TABLE).upsert({ tanggal, is_done: isDone }, { onConflict: 'tanggal' });
}

async function uploadFoto(tanggal, file) {
  showToast('⏳ Uploading...');
  const fileName = `${tanggal}-${Date.now()}.jpg`;
  await db.storage.from(BUCKET).upload(fileName, file);
  const { data } = db.storage.from(BUCKET).getPublicUrl(fileName);
  const url = data.publicUrl;
  await db.from(TABLE).upsert({ tanggal, is_done: true, foto_url: url }, { onConflict: 'tanggal' });
  doneMap[tanggal] = { is_done: true, foto_url: url };
  refreshUI();
  showToast('📸 Berhasil!');
}

function listenRealtime() {
  db.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, payload => {
    const r = payload.new;
    if (r) { doneMap[r.tanggal] = { is_done: r.is_done, foto_url: r.foto_url }; refreshUI(); }
  }).subscribe();
}

/* ══════════════════════════════════════════════════════
   5. SLIDER BANNER
══════════════════════════════════════════════════════ */
(function initSlider() {
  const TOTAL = 7; const INTERVAL = 3000;
  const track = document.getElementById('sliderTrack');
  const bar = document.getElementById('sBar');
  let cur = 0, t0 = performance.now();

  function move() {
    cur = (cur + 1) % TOTAL;
    if(track) track.style.transform = `translateX(-${cur * 100}%)`;
    t0 = performance.now();
  }
  
  let timer = setInterval(move, INTERVAL);
  
  function frame(now) {
    const p = Math.min(((now - t0) / INTERVAL) * 100, 100);
    if (bar) bar.style.width = p + '%';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ══════════════════════════════════════════════════════
   6. RENDER UI (LENGKAP DENGAN FOTO)
══════════════════════════════════════════════════════ */
function renderStrip() {
  const txt = document.getElementById('strip-text');
  const grp = getGroupForDate(today);
  if (!txt) return;

  if (today.getDay() === 0) {
    txt.innerHTML = `🎉 Hari ini Minggu — <b>Libur Piket!</b>`;
  } else if (grp) {
    const isDone = doneMap[todayKey]?.is_done;
    txt.innerHTML = isDone 
      ? `✅ Piket <b>${grp.persons.join(' & ')}</b> Selesai!` 
      : `🧹 Jadwal: <b>${grp.persons.join(' & ')}</b>`;
  } else {
    txt.innerHTML = `📅 Tidak ada jadwal piket.`;
  }
}

function renderSchedule() {
  const grid = document.getElementById('sched');
  if (!grid) return;

  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const mon = new Date(today); mon.setDate(today.getDate() - dow + weekOffset * 7);
  
  document.getElementById('week-label').textContent = `Minggu Ke-${weekOffset >= 0 ? weekOffset + 1 : weekOffset}`;

  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const dk = fmtDate(d);
    const grp = getGroupForDate(d);
    const row = doneMap[dk] || { is_done: false, foto_url: null };

    html += `
    <div class="day-card ${dk === todayKey ? 'is-today' : ''} ${row.is_done ? 'done-card' : ''}">
      <div class="date-col"><b>${DAY_S[d.getDay()]}</b><br>${d.getDate()}</div>
      <div class="card-body">
        ${d.getDay() === 0 ? '<div class="holiday-pill">Libur</div>' : grp ? `
          <div class="persons-list">
            ${grp.persons.map((p, idx) => `
              <div class="person-chip">
                <img src="${grp.photos[idx]}" class="av-mini">
                <span>${p}</span>
              </div>
            `).join('')}
          </div>
          <div class="action-row">
            <input type="checkbox" class="done-toggle" data-dk="${dk}" ${row.is_done ? 'checked' : ''}>
            <label class="btn-up">📸<input type="file" data-dk="${dk}" accept="image/*" hidden></label>
            ${row.foto_url ? `<img src="${row.foto_url}" class="proof-mini" onclick="window.open('${row.foto_url}')">` : ''}
          </div>
        ` : 'Kosong'}
      </div>
    </div>`;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.done-toggle').forEach(el => {
    el.onchange = (e) => { saveStatus(e.target.dataset.dk, e.target.checked); loadData(); };
  });
  grid.querySelectorAll('input[type="file"]').forEach(el => {
    el.onchange = (e) => { if(e.target.files[0]) uploadFoto(e.target.dataset.dk, e.target.files[0]); };
  });
}

function renderMembers() {
  const grid = document.getElementById('members');
  if (!grid) return;

  grid.innerHTML = ALL_MEMBERS.map(m => {
    const count = Object.keys(doneMap).filter(k => doneMap[k].is_done && getGroupForDate(k)?.persons.includes(m.name)).length;
    return `
      <div class="member-card">
        <img src="${m.photo}" class="member-photo">
        <div class="member-info">
          <div class="name">${m.name}</div>
          <div class="count">Total Piket: <b>${count}</b></div>
        </div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════
   7. RUN
══════════════════════════════════════════════════════ */
document.getElementById('btn-prev').onclick = () => { weekOffset--; renderSchedule(); };
document.getElementById('btn-next').onclick = () => { weekOffset++; renderSchedule(); };
document.getElementById('btn-today').onclick = () => { weekOffset = 0; renderSchedule(); };

function updateClock() {
    const n = new Date();
    const t = document.getElementById('live-time');
    if(t) t.textContent = n.toLocaleTimeString('id-ID');
}
setInterval(updateClock, 1000);
loadData();
listenRealtime();
