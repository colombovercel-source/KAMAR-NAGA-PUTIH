/* ──────────────────────────────────────────
   1. KONFIGURASI SUPABASE
────────────────────────────────────────── */
const SUPABASE_URL = 'https://link-proyek-anda.supabase.co'; // Ganti dengan URL Anda
const SUPABASE_KEY = 'isi-anon-key-anda-di-sini'; // Ganti dengan Anon Key Anda
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ──────────────────────────────────────────
   2. DATA MASTER & GRUP
────────────────────────────────────────── */
const GROUPS = [
  { persons: ['Jufri', 'Ardi'], photos: ['https://i.imgur.com/YPuXfjB.png', 'https://i.imgur.com/YPuXfjB.png'] },
  { persons: ['Reonaldo', 'Agus'], photos: ['https://i.imgur.com/sDDUjZQ.png', 'https://i.imgur.com/sDDUjZQ.png'] },
  { persons: ['Farizi', 'Yope Musang'], photos: ['https://i.imgur.com/JADPNwJ.png', 'https://i.imgur.com/JADPNwJ.png'] },
  { persons: ['Hasan', 'Geo'], photos: ['https://i.imgur.com/em5Nyuy.png', 'https://i.imgur.com/em5Nyuy.png'] },
  { persons: ['Aksan', 'Chandra'], photos: ['https://i.imgur.com/sDDUjZQ.png', 'https://i.imgur.com/sDDUjZQ.png'] },
  { persons: ['Imanuel', 'Dandi'], photos: ['https://i.imgur.com/JADPNwJ.png', 'https://i.imgur.com/JADPNwJ.png'] },
];

const ANCHOR = new Date('2026-04-25');
ANCHOR.setHours(0,0,0,0);
const CYCLE_DAYS = 5;
const ALL_MEMBERS = GROUPS.flatMap(g => g.persons.map((p,i)=>({name:p,photo:g.photos[i]})));

/* ──────────────────────────────────────────
   3. HELPERS & DATE LOGIC
────────────────────────────────────────── */
const today = new Date(); today.setHours(0,0,0,0);
let weekOffset = 0;
let doneMap = {};

const DAY_S=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const DAY_F=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const MON_S=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const MON_F=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtDate(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
const todayKey = fmtDate(today);

function getGroupForDate(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const diff = Math.round((d - ANCHOR) / 86400000);
  if (diff < 0) return null;
  if (diff % CYCLE_DAYS !== 0) return null;
  const groupIdx = Math.floor(diff / CYCLE_DAYS) % GROUPS.length;
  return GROUPS[groupIdx];
}

/* ──────────────────────────────────────────
   4. SUPABASE SYNC (LOAD, SAVE, & REALTIME)
────────────────────────────────────────── */
async function loadData() {
  try {
    const { data, error } = await supabaseClient
      .from('KAMAR-NAGA-PUTIH') 
      .select('tanggal, is_done');

    if (error) throw error;

    doneMap = {};
    if (data) {
      data.forEach(item => { doneMap[item.tanggal] = item.is_done; });
    }
    refreshUI();
  } catch (err) {
    console.error('Error load:', err.message);
    refreshUI(); 
  }
}

// FUNGSI BARU: Mendengarkan perubahan data secara Real-Time
function listenRealtime() {
  supabaseClient
    .channel('perubahan-piket') // Nama channel bebas
    .on(
      'postgres_changes', 
      { event: '*', schema: 'public', table: 'KAMAR-NAGA-PUTIH' }, 
      (payload) => {
        console.log('Ada perubahan data!', payload);
        
        // Update data lokal berdasarkan perubahan di database
        const { tanggal, is_done } = payload.new;
        if (is_done) {
          doneMap[tanggal] = true;
        } else {
          delete doneMap[tanggal];
        }

        // Jalankan render ulang otomatis tanpa refresh
        refreshUI();
      }
    )
    .subscribe();
}

async function saveData(tanggal, isDone) {
  try {
    const { error } = await supabaseClient
      .from('KAMAR-NAGA-PUTIH')
      .upsert({ tanggal: tanggal, is_done: isDone }, { onConflict: 'tanggal' });
    if (error) throw error;
  } catch (err) {
    console.error('Save error:', err.message);
    showToast('❌ Gagal sinkron');
  }
}
/* ──────────────────────────────────────────
   5. SLIDER LOGIC
────────────────────────────────────────── */
(function initSlider(){
  const TOTAL=7, INTERVAL=2500;
  const track=document.getElementById('sliderTrack');
  const dots=document.getElementById('sDots');
  if(!track || !dots) return;
  
  let cur=0;
  for(let i=0;i<TOTAL;i++){
    const d=document.createElement('button');
    d.className='dot'+(i===0?' active':'');
    d.onclick=()=> { cur=i; updateSlider(); };
    dots.appendChild(d);
  }

  function updateSlider(){
    track.style.transform=`translateX(-${cur*100}%)`;
    const allDots = dots.querySelectorAll('.dot');
    allDots.forEach((d,i)=>d.classList.toggle('active',i===cur));
  }
  
  setInterval(()=>{ cur=(cur+1)%TOTAL; updateSlider(); }, INTERVAL);
})();

/* ──────────────────────────────────────────
   6. UI RENDERING
────────────────────────────────────────── */
function renderStrip(){
  const strip=document.getElementById('today-strip');
  const txt=document.getElementById('strip-text');
  if(!strip || !txt) return;

  strip.className = 'today-strip';
  if(today.getDay() === 0){
    strip.classList.add('holiday');
    txt.textContent = 'Hari ini Minggu — Libur piket! 🎉';
    return;
  }

  const grp = getGroupForDate(today);
  const done = !!doneMap[todayKey];
  strip.classList.add('on-duty');

  if(grp){
    txt.innerHTML = done 
      ? `✅ Piket <strong>${grp.persons.join(' & ')}</strong> Selesai!` 
      : `🧹 Giliran: <strong>${grp.persons.join(' & ')}</strong> — Semangat!`;
  } else {
    txt.innerHTML = `📅 Tidak ada jadwal piket hari ini`;
  }
}

function renderSchedule(){
  const grid=document.getElementById('sched');
  if(!grid) return;
  
  const dow=today.getDay()===0?6:today.getDay()-1;
  const mon=new Date(today);
  mon.setDate(today.getDate()-dow+weekOffset*7);
  const dates = Array.from({length:7},(_,i)=>{
    const d=new Date(mon); d.setDate(mon.getDate()+i); return d;
  });

  const sun = dates[6];
  document.getElementById('week-label').textContent = 
    dates[0].getDate()+' '+MON_S[dates[0].getMonth()]+' – '+sun.getDate()+' '+MON_S[sun.getMonth()]+' '+sun.getFullYear();

  let html='';
  dates.forEach((date,idx)=>{
    const dkey=fmtDate(date);
    const isSun=date.getDay()===0;
    const isToday=dkey===todayKey;
    const done=!!doneMap[dkey];
    const grp=getGroupForDate(date);

    let cls='day-card' + (isToday?' is-today live':'') + (done?' done-card':' upcoming') + (isSun?' is-sunday':'');
    
    let body = '';
    if(isSun) {
      body = `<div class="holiday-pill">🔴 Libur — Minggu</div>`;
    } else if(grp) {
      const chips = grp.persons.map((p,i)=>`
        <div class="person-chip">
          <div class="avatar-sm ${done?'done-av':''}"><img src="${grp.photos[i]}" onerror="this.style.display='none'"></div>
          <span class="person-nm">${p}</span>
        </div>`).join('');
      
      body = `<div class="persons-row">
                <div class="persons-list">${chips}</div>
                <div class="done-wrap">
                  <label class="done-lbl" for="chk-${dkey}">${done?'✓ Selesai':'Tandai'}</label>
                  <input class="done-toggle" type="checkbox" id="chk-${dkey}" data-dk="${dkey}" ${done?'checked':''}>
                </div>
              </div>`;
    } else {
      body = `<div class="no-sched">Tidak ada jadwal piket</div>`;
    }

    html += `<div class="${cls}" style="animation-delay:${idx*0.05}s">
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
  grid.querySelectorAll('.done-toggle').forEach(chk => {
    chk.onchange = async function() {
      const dk = this.dataset.dk;
      const val = this.checked;
      if(val) doneMap[dk] = true; else delete doneMap[dk];
      refreshUI();
      await saveData(dk, val);
      showToast(val ? '✅ Tersimpan ke Database' : '↩ Tanda dibatalkan');
    };
  });
}

function renderMembers(){
  const grid=document.getElementById('members');
  if(!grid) return;
  let html='';
  ALL_MEMBERS.forEach((m,i)=>{
    let count=0;
    Object.keys(doneMap).forEach(k => {
      const g = getGroupForDate(new Date(k+'T00:00:00'));
      if(doneMap[k] && g && g.persons.includes(m.name)) count++;
    });
    html += `<div class="member-card" style="animation-delay:${i*0.05}s">
              <div class="member-av"><img src="${m.photo}" alt="${m.name}"></div>
              <div class="member-name">${m.name}</div>
              <div class="member-count">Selesai: <strong>${count}×</strong></div>
            </div>`;
  });
  grid.innerHTML = html;
}

/* ──────────────────────────────────────────
   7. CLOCK & TOAST & NAV
────────────────────────────────────────── */
function clock(){
  const n=new Date();
  const dEl=document.getElementById('live-date'), tEl=document.getElementById('live-time');
  if(dEl) dEl.textContent = DAY_F[n.getDay()]+', '+n.getDate()+' '+MON_F[n.getMonth()]+' '+n.getFullYear();
  if(tEl) tEl.textContent = String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0');
}

function showToast(msg){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

document.getElementById('btn-prev').onclick=()=>{ weekOffset--; renderSchedule(); };
document.getElementById('btn-next').onclick=()=>{ weekOffset++; renderSchedule(); };
document.getElementById('btn-today').onclick=()=>{ weekOffset=0; renderSchedule(); };

/* ──────────────────────────────────────────
   8. INIT
────────────────────────────────────────── */
setInterval(clock, 1000); 
clock();

// Jalankan pengambilan data awal
loadData(); 

// Jalankan pendengar Real-Time
listenRealtime();
