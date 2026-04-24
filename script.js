/* ══════════════════════════════════════════════════════
   1. KONFIGURASI SUPABASE
   Ganti URL dan KEY di bawah dengan milik project kamu
══════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://lzjmyildurannngskrcyo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6am15aWxkdXJhbm5nc2tyY3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMzU1NjUsImV4cCI6MjA4NjgxMTU2NX0.ybyZTOLYGMOjM_SucsfpsVU3WaL8qVY4m-1XYdK2J7Q';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* Nama tabel dan bucket — sesuaikan jika berbeda */
const TABLE  = 'KAMAR-NAGA-PUTIH';
const BUCKET = 'foto-piket';

/* ══════════════════════════════════════════════════════
   2. DATA MASTER JADWAL
   Anchor = tanggal mulai jadwal (25 April 2026)
   Sistem berulang setiap 5 hari secara otomatis
══════════════════════════════════════════════════════ */
const GROUPS = [
  { persons: ['Jufri',   'Ardi'],       photos: ['https://i.imgur.com/YPuXfjB.png', 'https://i.imgur.com/YPuXfjB.png'] },
  { persons: ['Reonaldo','Agus'],        photos: ['https://i.imgur.com/sDDUjZQ.png', 'https://i.imgur.com/sDDUjZQ.png'] },
  { persons: ['Farizi',  'Yope Musang'], photos: ['https://i.imgur.com/JADPNwJ.png', 'https://i.imgur.com/JADPNwJ.png'] },
  { persons: ['Hasan',   'Geo'],         photos: ['https://i.imgur.com/em5Nyuy.png', 'https://i.imgur.com/em5Nyuy.png'] },
  { persons: ['Aksan',   'Chandra'],     photos: ['https://i.imgur.com/sDDUjZQ.png', 'https://i.imgur.com/sDDUjZQ.png'] },
  { persons: ['Imanuel', 'Dandi'],       photos: ['https://i.imgur.com/JADPNwJ.png', 'https://i.imgur.com/JADPNwJ.png'] },
];

const ANCHOR     = new Date('2026-04-25'); ANCHOR.setHours(0,0,0,0);
const CYCLE_DAYS = 5;
const ALL_MEMBERS = GROUPS.flatMap(g => g.persons.map((p,i) => ({ name: p, photo: g.photos[i] })));

/* ══════════════════════════════════════════════════════
   3. STATE & KONSTANTA
══════════════════════════════════════════════════════ */
const today = new Date(); today.setHours(0,0,0,0);
const todayKey = fmtDate(today);
let weekOffset = 0;
let doneMap    = {}; /* { "YYYY-MM-DD": { is_done: bool, foto_url: string|null } } */

const DAY_S = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const DAY_F = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const MON_S = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const MON_F = ['Januari','Februari','Maret','April','Mei','Juni',
               'Juli','Agustus','September','Oktober','November','Desember'];

/* ══════════════════════════════════════════════════════
   4. HELPER FUNCTIONS
══════════════════════════════════════════════════════ */

/** Format Date → "YYYY-MM-DD" */
function fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** Ambil grup piket untuk tanggal tertentu (atau null) */
function getGroupForDate(date) {
  const d    = new Date(date); d.setHours(0,0,0,0);
  const diff = Math.round((d - ANCHOR) / 86400000);
  if (diff < 0 || diff % CYCLE_DAYS !== 0) return null;
  return GROUPS[Math.floor(diff / CYCLE_DAYS) % GROUPS.length];
}

/** Tampilkan toast notifikasi */
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 2600);
}

/** Refresh semua UI sekaligus */
function refreshUI() {
  renderStrip();
  renderSchedule();
  renderMembers();
}

/* ══════════════════════════════════════════════════════
   5. SUPABASE — LOAD, SAVE, UPLOAD FOTO, REALTIME
══════════════════════════════════════════════════════ */

/** Ambil semua data dari Supabase saat pertama load */
async function loadData() {
  try {
    const { data, error } = await db
      .from(TABLE)
      .select('tanggal, is_done, foto_url');

    if (error) throw error;

    doneMap = {};
    (data || []).forEach(row => {
      doneMap[row.tanggal] = {
        is_done:  row.is_done  || false,
        foto_url: row.foto_url || null,
      };
    });
  } catch (err) {
    console.warn('Load gagal (offline?):', err.message);
  } finally {
    refreshUI();
  }
}

/** Simpan status centang ke Supabase */
async function saveStatus(tanggal, isDone) {
  try {
    const { error } = await db
      .from(TABLE)
      .upsert(
  { tanggal: tanggal, is_done: isDone }, 
  { onConflict: 'tanggal' }
      );
    if (error) throw error;
  } catch (err) {
    console.error('Save status gagal:', err.message);
    showToast('❌ Gagal sinkron ke database');
  }
}

/** Upload foto bukti ke Supabase Storage lalu simpan URL-nya */
async function uploadFoto(tanggal, file) {
  if (!file) return;

  showToast('⏳ Mengunggah foto...');

  try {
    /* 1. Upload ke storage */
    const fileName = `${tanggal}-${Date.now()}.jpg`;
    const { error: upErr } = await db.storage
      .from(foto-piket)
      .upload(fileName, file, { upsert: true, contentType: file.type });

    if (upErr) throw upErr;

    /* 2. Ambil URL publik */
    const { data: urlData } = db.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    const fotoUrl = urlData.publicUrl;

    /* 3. Simpan URL ke tabel */
    const { error: dbErr } = await db
      .upsert(
  { tanggal: tanggal, is_done: isDone }, 
  { onConflict: 'tanggal' }
      );

    if (dbErr) throw dbErr;

    /* 4. Update lokal & refresh */
    if (!doneMap[tanggal]) doneMap[tanggal] = { is_done: false, foto_url: null };
    doneMap[tanggal].is_done  = true;
    doneMap[tanggal].foto_url = fotoUrl;

    refreshUI();
    showToast('📸 Foto bukti tersimpan!');
  } catch (err) {
    console.error('Upload foto gagal:', err.message);
    showToast('❌ Gagal upload foto');
  }
}

/** Dengarkan perubahan realtime — semua perangkat sinkron otomatis */
function listenRealtime() {
  db.channel('naga-putih-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      (payload) => {
        const row = payload.new || {};
        if (!row.tanggal) return;

        if (!doneMap[row.tanggal]) doneMap[row.tanggal] = { is_done: false, foto_url: null };
        doneMap[row.tanggal].is_done  = row.is_done  || false;
        doneMap[row.tanggal].foto_url = row.foto_url || null;

        refreshUI();
      }
    )
    .subscribe();
}

/* ══════════════════════════════════════════════════════
   6. SLIDER BANNER
══════════════════════════════════════════════════════ */
(function initSlider() {
  const TOTAL    = 7;
  const INTERVAL = 2500;
  const track    = document.getElementById('sliderTrack');
  const dotsWrap = document.getElementById('sDots');
  const ctr      = document.getElementById('sCtr');
  const bar      = document.getElementById('sBar');
  if (!track || !dotsWrap) return;

  let cur = 0, timer = null, raf = null, t0 = null;

  /* Buat dots */
  for (let i = 0; i < TOTAL; i++) {
    const d = document.createElement('button');
    d.className = 'dot' + (i === 0 ? ' active' : '');
    d.onclick = () => goTo(i, true);
    dotsWrap.appendChild(d);
  }

  function updateUI() {
    track.style.transform = `translateX(-${cur * 100}%)`;
    ctr.textContent = `${cur + 1} / ${TOTAL}`;
    dotsWrap.querySelectorAll('.dot').forEach((d, i) =>
      d.classList.toggle('active', i === cur)
    );
  }

  function goTo(i, manual) {
    cur = (i + TOTAL) % TOTAL;
    updateUI();
    if (manual) reset();
  }

  function startProgress() {
    cancelAnimationFrame(raf);
    if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }
    t0 = performance.now();
    function step(now) {
      const pct = Math.min(((now - t0) / INTERVAL) * 100, 100);
      if (bar) bar.style.width = pct + '%';
      if (pct < 100) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  function start() {
    clearInterval(timer);
    startProgress();
    timer = setInterval(() => { cur = (cur + 1) % TOTAL; updateUI(); startProgress(); }, INTERVAL);
  }

  function reset() { clearInterval(timer); cancelAnimationFrame(raf); start(); }

  document.getElementById('sPrev').onclick = () => goTo(cur - 1, true);
  document.getElementById('sNext').onclick = () => goTo(cur + 1, true);

  /* Swipe support */
  let tx = null;
  const wrap = document.getElementById('sliderWrap');
  wrap.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend', e => {
    if (tx === null) return;
    const diff = tx - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) goTo(diff > 0 ? cur + 1 : cur - 1, true);
    tx = null;
  });

  wrap.onmouseenter = () => { clearInterval(timer); cancelAnimationFrame(raf); };
  wrap.onmouseleave = start;

  updateUI();
  start();
})();

/* ══════════════════════════════════════════════════════
   7. RENDER — STRIP HEADER
══════════════════════════════════════════════════════ */
function renderStrip() {
  const strip = document.getElementById('today-strip');
  const txt   = document.getElementById('strip-text');
  if (!strip || !txt) return;

  strip.className = 'today-strip';

  if (today.getDay() === 0) {
    strip.classList.add('holiday');
    txt.textContent = 'Hari ini Minggu — Libur piket! 🎉';
    return;
  }

  const grp  = getGroupForDate(today);
  const data = doneMap[todayKey];
  strip.classList.add('on-duty');

  if (grp) {
    txt.innerHTML = (data && data.is_done)
      ? `✅ Piket <strong>${grp.persons.join(' & ')}</strong> sudah selesai!`
      : `🧹 Giliran: <strong>${grp.persons.join(' & ')}</strong> — Semangat!`;
  } else {
    txt.innerHTML = `📅 Tidak ada jadwal piket hari ini`;
  }
}

/* ══════════════════════════════════════════════════════
   8. RENDER — JADWAL MINGGUAN
══════════════════════════════════════════════════════ */
function renderSchedule() {
  const grid = document.getElementById('sched');
  if (!grid) return;

  /* Hitung tanggal Senin minggu ini + offset */
  const dow    = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow + weekOffset * 7);

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  /* Update label minggu */
  const sun = dates[6];
  document.getElementById('week-label').textContent =
    dates[0].getDate() + ' ' + MON_S[dates[0].getMonth()] + ' – ' +
    sun.getDate() + ' ' + MON_S[sun.getMonth()] + ' ' + sun.getFullYear();

  let html = '';

  dates.forEach((date, idx) => {
    const dkey   = fmtDate(date);
    const isSun  = date.getDay() === 0;
    const isToday = dkey === todayKey;
    const rowData = doneMap[dkey] || { is_done: false, foto_url: null };
    const done    = rowData.is_done;
    const fotoUrl = rowData.foto_url;
    const grp     = getGroupForDate(date);

    /* Kelas kartu */
    let cls = 'day-card' +
      (isToday ? ' is-today live' : done ? ' done-card' : ' upcoming') +
      (isSun ? ' is-sunday' : '');

    let body = '';

    if (isSun) {
      /* Hari libur */
      body = `<div class="holiday-pill">🔴 Libur — Minggu</div>`;

    } else if (grp) {
      /* Ada jadwal piket */
      const chips = grp.persons.map((p, i) => `
        <div class="person-chip">
          <div class="avatar-sm ${done ? 'done-av' : ''}">
            <img src="${grp.photos[i]}" alt="${p}" onerror="this.style.display='none'">
          </div>
          <span class="person-nm">${p}</span>
        </div>`).join('');

      /* Preview foto jika sudah ada */
      const fotoHtml = fotoUrl
        ? `<img
             src="${fotoUrl}"
             class="proof-preview"
             title="Klik untuk lihat bukti"
             onclick="window.open('${fotoUrl}', '_blank')"
           >`
        : '';

      /* Hint teks */
      const hintText = done
        ? (fotoUrl ? '✓ Bukti terunggah' : 'Upload foto bukti')
        : 'Upload foto bukti setelah selesai';

      body = `
        <div class="persons-row">
          <div class="persons-list">${chips}</div>
          <div class="done-wrap">
            <label class="done-lbl" for="chk-${dkey}">
              ${done ? '✓ Selesai' : 'Tandai'}
            </label>
            <input
              class="done-toggle"
              type="checkbox"
              id="chk-${dkey}"
              data-dk="${dkey}"
              ${done ? 'checked' : ''}
            >
          </div>
        </div>
        <div class="proof-section">
          ${fotoHtml}
          <label class="upload-label">
            📸 ${fotoUrl ? 'Ganti Foto' : 'Upload Bukti'}
            <input type="file" accept="image/*" data-dk="${dkey}">
          </label>
          <span class="upload-hint">${hintText}</span>
        </div>`;

    } else {
      /* Tidak ada jadwal */
      body = `<div class="no-sched">Tidak ada jadwal piket hari ini</div>`;
    }

    html += `
      <div class="${cls}" style="animation-delay:${idx * 0.05}s">
        <div class="day-row">
          <div class="date-col">
            <div class="date-dow">${DAY_S[date.getDay()]}</div>
            <div class="date-num">${date.getDate()}</div>
            <div class="date-mon">${MON_S[date.getMonth()]}</div>
          </div>
          <div class="card-body">${body}</div>
        </div>
      </div>`;
  });

  grid.innerHTML = html;

  /* Bind checkbox */
  grid.querySelectorAll('.done-toggle').forEach(chk => {
    chk.onclick = async function () {
      const dk  = this.dataset.dk;
      const val = this.checked;

      if (!doneMap[dk]) doneMap[dk] = { is_done: false, foto_url: null };
      doneMap[dk].is_done = val;
      if (!val) doneMap[dk].foto_url = null;

      refreshUI();
      await saveStatus(dk, val);
      showToast(val ? '✅ Tersimpan ke database!' : '↩ Tanda dibatalkan');
    };
  });

  /* Bind file upload */
  grid.querySelectorAll('input[type="file"][data-dk]').forEach(input => {
    input.onchange = function () {
      const file = this.files[0];
      if (file) uploadFoto(this.dataset.dk, file);
    };
  });
}

/* ══════════════════════════════════════════════════════
   9. RENDER — KARTU ANGGOTA
══════════════════════════════════════════════════════ */
function renderMembers() {
  const grid = document.getElementById('members');
  if (!grid) return;

  let html = '';

  ALL_MEMBERS.forEach((m, i) => {
    let count = 0;
    Object.keys(doneMap).forEach(dk => {
      const row = doneMap[dk];
      if (row && row.is_done) {
        const g = getGroupForDate(new Date(dk + 'T00:00:00'));
        if (g && g.persons.includes(m.name)) count++;
      }
    });

    html += `
      <div class="member-card" style="animation-delay:${i * 0.05}s">
        <div class="member-av">
          <img src="${m.photo}" alt="${m.name}"
            onerror="this.parentElement.style.background='var(--brand-dim)'">
        </div>
        <div class="member-name">${m.name}</div>
        <div class="member-count">Selesai: <strong>${count}×</strong></div>
      </div>`;
  });

  grid.innerHTML = html;
}

/* ══════════════════════════════════════════════════════
   10. JAM & NAVIGASI MINGGU
══════════════════════════════════════════════════════ */
function updateClock() {
  const n  = new Date();
  const dEl = document.getElementById('live-date');
  const tEl = document.getElementById('live-time');
  if (dEl) dEl.textContent =
    DAY_F[n.getDay()] + ', ' + n.getDate() + ' ' + MON_F[n.getMonth()] + ' ' + n.getFullYear();
  if (tEl) tEl.textContent =
    String(n.getHours()).padStart(2, '0') + ':' +
    String(n.getMinutes()).padStart(2, '0') + ':' +
    String(n.getSeconds()).padStart(2, '0');
}

document.getElementById('btn-prev').onclick  = () => { weekOffset--; renderSchedule(); };
document.getElementById('btn-next').onclick  = () => { weekOffset++; renderSchedule(); };
document.getElementById('btn-today').onclick = () => { weekOffset = 0; renderSchedule(); showToast('↩ Kembali ke minggu ini'); };

/* ══════════════════════════════════════════════════════
   11. INISIALISASI
══════════════════════════════════════════════════════ */
setInterval(updateClock, 1000);
updateClock();
loadData();
listenRealtime();
