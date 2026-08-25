/* ================================================================
   STATE & ELEMEN
   ================================================================ */
let currentStudent = null;
let charts = {};
let daftarMatkul = []; // hasil fetch listMatkul, dipakai untuk isi dropdown
const $ = (id)=>document.getElementById(id);

// URL Web App Apps Script (ambil dari Deploy > Manage deployments, yang berakhiran /exec)
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyvZwHHmxVwKRrJKXoR4DfObAzKAWMzCmUg5ZyhUWZaGLMFLCjOiPp6fTWFhBz3CX0yyQ/exec';

/**
 * Debug helper — HANYA aktif kalau URL halaman diakhiri ?debug=1
 * (mis. https://xxx.github.io/repo/?debug=1). Berguna untuk melihat
 * log langsung di layar HP tanpa perlu sambungkan ke DevTools/komputer,
 * tapi tidak mengganggu tampilan mahasiswa yang normal.
 */
const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === '1';
function debugLog(msg){
  if(!DEBUG_MODE) return;
  let el = document.getElementById('debugBox');
  if(!el){
    el = document.createElement('div');
    el.id = 'debugBox';
    el.style = 'position:fixed;bottom:0;left:0;right:0;background:#000;color:#0f0;font-size:11px;padding:8px;z-index:9999;max-height:40vh;overflow:auto;';
    document.body.appendChild(el);
  }
  el.innerHTML += msg + '<br>';
}

/**
 * Helper JSONP: memuat data dari Apps Script lewat tag <script>, bukan
 * fetch(). Ini WAJIB dipakai (bukan fetch) karena script.google.com
 * tidak mengizinkan fetch() lintas domain (CORS diblokir browser),
 * sedangkan tag <script> tidak tunduk pada aturan CORS.
 */
function jsonp(url){
  return new Promise(function(resolve, reject){
    const namaCallback = 'jsonpCallback_' + Date.now() + '_' + Math.floor(Math.random()*100000);
    debugLog('jsonp() memanggil: ' + url);
    window[namaCallback] = function(data){
      debugLog('jsonp() callback JALAN untuk: ' + url);
      resolve(data);
      delete window[namaCallback];
      script.remove();
    };
    const script = document.createElement('script');
    script.src = url + (url.indexOf('?') > -1 ? '&' : '?') + 'callback=' + namaCallback;
    script.onerror = function(){
      debugLog('jsonp() SCRIPT ERROR untuk: ' + url);
      reject(new Error('Gagal memuat data (JSONP request error).'));
      delete window[namaCallback];
      script.remove();
    };
    document.body.appendChild(script);
  });
}

/* ================================================================
   DROPDOWN MATA KULIAH & KELAS
   ================================================================ */
function muatDaftarMatkul(){
  debugLog('muatDaftarMatkul() dipanggil. visibilityState=' + document.visibilityState);
  jsonp(WEBAPP_URL + '?action=listMatkul')
    .then(function(response){
      if(!response || !response.success){
        debugLog('listMatkul: response tidak sukses.');
        $('matkul-select').innerHTML = '<option value="">Gagal memuat daftar mata kuliah</option>';
        return;
      }
      daftarMatkul = response.data || [];
      debugLog('listMatkul: sukses, ' + daftarMatkul.length + ' baris diterima.');
      isiDropdownMatkul();
    })
    .catch(function(err){
      debugLog('listMatkul: GAGAL - ' + err.message);
      $('matkul-select').innerHTML = '<option value="">Gagal memuat daftar mata kuliah</option>';
      console.error(err);
    });
}

function isiDropdownMatkul(){
  // Ambil kombinasi matkulKode unik (tanpa duplikat kelas)
  const unikMap = {};
  daftarMatkul.forEach(m=>{ unikMap[m.matkulKode] = m.matkulNama; });
  const opsi = Object.keys(unikMap).map(kode=>`<option value="${kode}">${unikMap[kode]}</option>`).join('');
  $('matkul-select').innerHTML = '<option value="">-- Pilih Mata Kuliah --</option>' + opsi;
  $('kelas-select').innerHTML = '<option value="">Pilih mata kuliah dahulu</option>';
}

function isiDropdownKelas(matkulKode){
  if(!matkulKode){
    $('kelas-select').innerHTML = '<option value="">Pilih mata kuliah dahulu</option>';
    return;
  }
  const kelasList = daftarMatkul.filter(m=>m.matkulKode === matkulKode);
  const opsi = kelasList.map(k=>`<option value="${k.kelasKode}">${k.kelasNama}</option>`).join('');
  $('kelas-select').innerHTML = '<option value="">-- Pilih Kelas --</option>' + opsi;
}

$('matkul-select').addEventListener('change', (e)=>{ isiDropdownKelas(e.target.value); });

/** Dropdown dianggap masih kosong kalau cuma berisi placeholder (atau 0 opsi sama sekali). */
function dropdownMatkulMasihKosong(){
  const el = $('matkul-select');
  return !el || el.options.length <= 1;
}

/**
 * Wrapper aman-prerender untuk memicu muatDaftarMatkul() saat halaman
 * dibuka. Ini menangani kasus link yang dibuka lewat Chrome Custom Tabs
 * dari aplikasi lain (mis. Google Classroom di Android), yang sering
 * me-render halaman ini di tab TERSEMBUNYI lebih dulu sebelum pengguna
 * benar-benar mengetuk link, supaya terasa instan. Kalau request
 * listMatkul terlanjur jalan saat halaman masih tersembunyi, hasilnya
 * bisa "hilang" begitu tab akhirnya ditampilkan. Chrome menyediakan
 * document.prerendering & event 'prerenderingchange' persis untuk
 * kasus ini; visibilitychange & pageshow jadi jaring pengaman tambahan
 * untuk kasus tab background pada umumnya.
 */
function muatDaftarMatkulAmanPrerender(){
  const jalankan = () => muatDaftarMatkul();

  if (document.prerendering) {
    debugLog('Halaman sedang di-prerender, tunggu sampai aktif...');
    document.addEventListener('prerenderingchange', jalankan, { once: true });
  } else {
    jalankan();
  }

  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'visible' && dropdownMatkulMasihKosong()) {
      debugLog('visibilitychange: tab visible & dropdown masih kosong, coba lagi...');
      muatDaftarMatkul();
    }
  });

  window.addEventListener('pageshow', function(){
    if (dropdownMatkulMasihKosong()) {
      debugLog('pageshow: dropdown masih kosong, coba lagi...');
      muatDaftarMatkul();
    }
  });
}

/* Tombol "Muat ulang" manual (opsional). Kalau Anda tambahkan elemen
   <button id="btn-reload-matkul">Muat Ulang</button> di HTML dekat
   dropdown mata kuliah, tombol itu otomatis akan berfungsi sebagai
   cadangan terakhir bila semua penanganan otomatis di atas tetap gagal. */
if ($('btn-reload-matkul')) {
  $('btn-reload-matkul').addEventListener('click', muatDaftarMatkul);
}

muatDaftarMatkulAmanPrerender(); // panggil sekali saat halaman dibuka (aman dari prerendering Chrome Custom Tabs)

function muatDaftarMatkulDenganRetry(maxPercobaan = 5) {
  let percobaan = 0;

  function coba() {
    percobaan++;

    debugLog('Percobaan memuat matkul ke-' + percobaan);

    jsonp(WEBAPP_URL + '?action=listMatkul')
      .then(function(response) {

        if (response && response.success && Array.isArray(response.data)) {
          daftarMatkul = response.data;
          debugLog('Berhasil memuat ' + daftarMatkul.length + ' mata kuliah.');

          isiDropdownMatkul();
          return;
        }

        throw new Error('Response tidak valid');

      })
      .catch(function(err) {

        debugLog('Gagal percobaan ' + percobaan + ': ' + err.message);

        if (percobaan < maxPercobaan) {
          setTimeout(coba, 1500);
        } else {
          $('matkul-select').innerHTML =
            '<option value="">Gagal memuat daftar mata kuliah</option>';
        }

      });
  }

  coba();
}
/* ================================================================
   LOGIN: pencarian NIM lewat backend (Code.gs)
   ================================================================ */
$('btn-login').addEventListener('click', handleLogin);
$('nim-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter') handleLogin(); });

function handleLogin(){
  const nim = $('nim-input').value.trim();
  const matkulKode = $('matkul-select').value;
  const kelasKode = $('kelas-select').value;
  const errorBox = $('login-error');
  const btn = $('btn-login');
  errorBox.classList.remove('show');

  // Validasi ringan di frontend dulu (validasi lengkap tetap dilakukan di backend)
  if(!matkulKode){
    errorBox.textContent = 'Silakan pilih mata kuliah terlebih dahulu.';
    errorBox.classList.add('show');
    return;
  }
  if(!kelasKode){
    errorBox.textContent = 'Silakan pilih kelas terlebih dahulu.';
    errorBox.classList.add('show');
    return;
  }
  if(!nim){
    errorBox.textContent = 'NIM tidak boleh kosong. Silakan masukkan NIM Anda.';
    errorBox.classList.add('show');
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;

  const url = WEBAPP_URL
    + '?nim=' + encodeURIComponent(nim)
    + '&matkul=' + encodeURIComponent(matkulKode)
    + '&kelas=' + encodeURIComponent(kelasKode);

  jsonp(url)
    .then(function(response){
      btn.classList.remove('loading');
      btn.disabled = false;

      if(!response || !response.success){
        errorBox.textContent = (response && response.message) ||
          'Data mahasiswa tidak ditemukan. Silakan periksa kembali NIM Anda.';
        errorBox.classList.add('show');
        return;
      }
      loadDashboard(response.data);
    })
    .catch(function(err){
      btn.classList.remove('loading');
      btn.disabled = false;
      errorBox.textContent = 'Terjadi kesalahan koneksi ke server. Silakan coba lagi.';
      errorBox.classList.add('show');
      console.error(err);
    });
}


/* ================================================================
   MEMUAT DASHBOARD DENGAN DATA MAHASISWA
   ================================================================ */
function loadDashboard(data){
  currentStudent = data;
  $('page-login').style.display = 'none';
  $('page-dashboard').classList.add('active');

  renderProfil(data.mahasiswa);
  renderRingkasan(data);
  renderKehadiran(data.kehadiran);
  renderTugas(data.tugas.enamTugas);
  renderUjian(data.tugas.utsUas);
  renderRapi(data.rapi);
  renderNilaiAkhir(data.nilaiAkhir);   // <-- tambahan
  renderChartsDashboard(data);
  switchPanel('dashboard');
}

function renderProfil(m){
  $('welcome-title').textContent = m.nama;
  $('meta-nim').textContent = m.nim;
  $('meta-prodi').textContent = m.prodi;
  $('meta-angkatan').textContent = m.angkatan;
  $('meta-mk').textContent = m.matakuliah;
  $('meta-kelas').textContent = m.kelas;
  $('pf-nama').textContent = m.nama;
  $('pf-nim').textContent = m.nim;
  $('pf-prodi').textContent = m.prodi;
  $('pf-angkatan').textContent = m.angkatan;
  $('pf-mk').textContent = m.matakuliah;
  $('pf-kelas').textContent = m.kelas;
}

/* ================================================================
   GAMBARAN NILAI AKHIR (panel Profil)
   ================================================================ */
function renderNilaiAkhir(na){
  const emptyBox = $('na-empty');

  if(!na){
    $('na-nilai-akhir').textContent = '–';
    $('na-grade').innerHTML = '–';
    ['kehadiran','uts','uas','tugas'].forEach(k=>{
      $('na-'+k+'-label').textContent = '–';
      $('na-'+k+'-fill').style.width = '0%';
    });
    emptyBox.style.display = 'block';
    return;
  }
  emptyBox.style.display = 'none';

  $('na-nilai-akhir').textContent = na.nilaiAkhir != null ? Number(na.nilaiAkhir).toFixed(2) : '–';
  $('na-grade').innerHTML = '<span class="badge '+gradeBadgeClass(na.grade)+'">'+(na.grade || '-')+'</span>';

  const k = na.komponen || {};
  setKomponenNilai('kehadiran', k.kehadiran);
  setKomponenNilai('uts', k.uts);
  setKomponenNilai('uas', k.uas);
  setKomponenNilai('tugas', k.tugasKkni);
}

/** Isi label + progress bar untuk satu komponen nilai (skala 0-100). */
function setKomponenNilai(prefix, nilai){
  const v = nilai || 0;
  $('na-'+prefix+'-label').textContent = Number(v).toFixed(1);
  $('na-'+prefix+'-fill').style.width = Math.max(0, Math.min(100, v)) + '%';
}

/** Warna badge grade: A hijau, B biru, C amber, selain itu (D/E) merah. */
function gradeBadgeClass(grade){
  const g = (grade || '').toString().trim().toUpperCase();
  if(g === 'A') return 'badge-green';
  if(g === 'B') return 'badge-blue';
  if(g === 'C') return 'badge-amber';
  return 'badge-red';
}

function setRing(circleId, labelId, percent, decimals){
  const c = document.getElementById(circleId);
  const r = 24, circumference = 2*Math.PI*r;
  const pct = Math.max(0, Math.min(100, percent || 0));
  c.style.strokeDasharray = circumference;
  c.style.strokeDashoffset = circumference;
  requestAnimationFrame(()=>{
    c.style.strokeDashoffset = circumference - (pct/100)*circumference;
  });
  document.getElementById(labelId).textContent = (decimals ? pct.toFixed(1) : Math.round(pct)) + '%';
}

/* ================================================================
   RINGKASAN 4 KARTU
   ================================================================ */
function renderRingkasan(data){
  const rekap = (data.kehadiran && data.kehadiran.rekap) || {hadir:0, totalPertemuan:0};
  const enamTugas = (data.tugas && data.tugas.enamTugas) || [];
  const rapi = data.rapi || [];

  const totalPertemuan = rekap.totalPertemuan || 0;

  const hadir =
    (rekap.hadir || 0) +
    (rekap.izin || 0) +
    (rekap.sakit || 0);

  const persenKehadiran =
    totalPertemuan ? (hadir / totalPertemuan * 100) : 0;  

  const totalTugas = enamTugas.length;
  const terkumpul = enamTugas.filter(t=>t.pengumpulan==='Terkumpul').length;
  const dinilai = enamTugas.filter(t=>t.nilai !== null && t.nilai !== undefined);
  const rataNilai = dinilai.length ? (dinilai.reduce((s,t)=>s+Number(t.nilai),0)/dinilai.length) : 0;

  // Rata-rata RAPI dihitung dari kolom RAPI INDEX (skor gabungan per tugas) yang sudah ada di sheet
  const rapiIndexValid = rapi.map(r=>r.rapiIndex).filter(v=>v !== null && v !== undefined);
  const rapiAvg = rapiIndexValid.length ? (rapiIndexValid.reduce((a,b)=>a+Number(b),0)/rapiIndexValid.length) : 0;

  setRing('ring-kehadiran','ring-kehadiran-label', persenKehadiran, true);
  $('sum-kehadiran').textContent = persenKehadiran.toFixed(1)+'%';
  $('sum-kehadiran-sub').textContent = hadir+' / '+totalPertemuan+' pertemuan';

  setRing('ring-tugas','ring-tugas-label', totalTugas? (terkumpul/totalTugas*100):0, false);
  $('sum-tugas').textContent = terkumpul+' / '+totalTugas;

  setRing('ring-nilai','ring-nilai-label', rataNilai, false);
  $('sum-nilai').textContent = rataNilai ? rataNilai.toFixed(1) : '–';

  setRing('ring-rapi','ring-rapi-label', rapiAvg, false);
  $('sum-rapi').textContent = rapiIndexValid.length ? rapiAvg.toFixed(1)+'%' : '–';
}

/* ================================================================
   BADGE STATUS
   ================================================================ */
function statusBadge(status){
  const map = {
    'Hadir': 'badge-green', 'Izin': 'badge-blue', 'Sakit': 'badge-amber',
    'Alpa': 'badge-red', '-': 'badge-amber',
    'Terkumpul': 'badge-green', 'Belum': 'badge-amber',
    'Dinilai': 'badge-blue', 'Belum Dinilai': 'badge-amber'
  };
  return '<span class="badge '+(map[status]||'badge-blue')+'">'+status+'</span>';
}

/* ================================================================
   KEHADIRAN
   ================================================================ */
function renderKehadiran(kehadiranObj){
  const rekap = (kehadiranObj && kehadiranObj.rekap) || {
    hadir: 0,
    izin: 0,
    sakit: 0,
    alpa: 0,
    totalPertemuan: 0
  };

  const detail = (kehadiranObj && kehadiranObj.detail) || [];

  const totalPertemuan = rekap.totalPertemuan || 0;

  // Hadir + Izin + Sakit dihitung sebagai memenuhi kehadiran
  const hadir =
    (rekap.hadir || 0) +
    (rekap.izin || 0) +
    (rekap.sakit || 0);

  // Yang tidak memenuhi kehadiran = Alpa
  const tidakHadir = rekap.alpa || 0;

  const persen = totalPertemuan
    ? (hadir / totalPertemuan * 100)
    : 0;

  $('keh-total').textContent = totalPertemuan;
  $('keh-hadir').textContent = hadir + ' / ' + totalPertemuan;
  $('keh-persen').textContent = persen.toFixed(1) + '%';

  $('kehadiran-desc').textContent = totalPertemuan
  ? (
      (rekap.hadir || 0) +
      ' hadir, ' +
      (rekap.izin || 0) +
      ' izin, ' +
      (rekap.sakit || 0) +
      ' sakit, ' +
      (rekap.alpa || 0) +
      ' alpa dari total ' +
      totalPertemuan +
      ' pertemuan.'
    )
  : 'Belum ada data kehadiran.';

  const tbody = $('tbl-kehadiran');
  const emptyBox = $('empty-kehadiran');

  if(!detail.length){
    tbody.innerHTML = '';
    emptyBox.style.display = 'block';
    return;
  }

  emptyBox.style.display = 'none';

    tbody.innerHTML = detail.map(k =>
    `<tr>
      <td>Pertemuan ${k.pertemuan}</td>
      <td>${k.tanggal}</td>
      <td>${statusBadge(k.status)}</td>
      <td>${k.keterangan}</td>
    </tr>`
  ).join('');
}

/* ================================================================
   6 TUGAS KKNI
   ================================================================ */
function renderTugas(list, filter){
  list = list || [];
  filter = filter || 'semua';
  const total = list.length;
  const kumpul = list.filter(t=>t.pengumpulan==='Terkumpul').length;
  const belum = total - kumpul;

  $('tg-total').textContent = total;
  $('tg-kumpul').textContent = kumpul;
  $('tg-belum').textContent = belum;
  const pct = total ? (kumpul/total*100) : 0;
  $('tg-progress-fill').style.width = pct+'%';
  $('tg-progress-label').textContent = kumpul+' dari '+total+' tugas ('+pct.toFixed(0)+'%)';

  const emptyBox = $('empty-tugas');
  if(!list.length){
    $('tbl-tugas').innerHTML = '';
    emptyBox.style.display = 'block';
    return;
  }
  emptyBox.style.display = 'none';

  let filtered = list;
  if(filter==='terkumpul') filtered = list.filter(t=>t.pengumpulan==='Terkumpul');
  if(filter==='belum') filtered = list.filter(t=>t.pengumpulan==='Belum');
  if(filter==='dinilai') filtered = list.filter(t=>t.status==='Dinilai');

  $('tbl-tugas').innerHTML = filtered.map(t=>{
    // Tugas Rutin pakai kolom "keterangan" (mis. "Lengkap"), tugas lain pakai "tanggal"
    const kolomKetiga = t.keterangan
  ? (isNaN(Number(t.keterangan))
      ? t.keterangan
      : 'Kurang ' + t.keterangan)
  : (t.tanggal || '-');
    return `<tr><td><b>${t.nama}</b></td><td>${statusBadge(t.pengumpulan)}</td><td>${kolomKetiga}</td><td>${t.nilai ?? '-'}</td><td>${statusBadge(t.status)}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--slate-400);padding:24px;">Tidak ada tugas pada filter ini.</td></tr>';
}

document.querySelectorAll('#tugas-filter .chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('#tugas-filter .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    renderTugas(currentStudent.tugas.enamTugas, chip.dataset.filter);
  });
});

/* ================================================================
   NILAI UJIAN (UTS/UAS) — terpisah dari 6 Tugas KKNI
   ================================================================ */
function renderUjian(list){
  list = list || [];
  $('ujian-cards').innerHTML = list.map(u=>`
    <div class="stat-box">
      <div class="n">${u.nilai ?? '-'}</div>
      <div class="t">${u.nama} &middot; ${statusBadge(u.status)}</div>
    </div>
  `).join('') || '<p style="color:var(--slate-400);font-size:13px;">Belum ada data ujian.</p>';
}

// Interpretasi RAPI Index — bantu mahasiswa menilai progres praktik
// penggunaan AI-nya sendiri, bukan cuma melihat angka mentah.
// Skor 0-100: makin tinggi = makin bertanggung jawab (hasil AI diverifikasi,
// prosesnya akuntabel & transparan, tidak terlalu bergantung pada AI).
const RAPI_INTERPRETASI = [
  { min: 80, label: 'Sangat Baik', badge: 'badge-green',
    saran: 'Praktik penggunaan AI-mu sudah bertanggung jawab: hasil AI diverifikasi, prosesnya transparan, dan kamu tidak terlalu bergantung padanya. Pertahankan pola ini di tugas berikutnya.' },
  { min: 60, label: 'Baik', badge: 'badge-blue',
    saran: 'Sudah cukup baik. Coba tingkatkan lagi konsistensi verifikasi hasil AI dan keterbukaan proses penggunaannya di tugas berikutnya.' },
  { min: 40, label: 'Berkembang', badge: 'badge-amber',
    saran: 'Masih ada ruang untuk berkembang. Perbanyak pengecekan ulang (verifikasi) terhadap hasil AI, dan kurangi ketergantungan langsung pada jawaban AI.' },
  { min: 0, label: 'Perlu Perhatian', badge: 'badge-red',
    saran: 'Pola penggunaan AI-mu perlu dievaluasi: kemungkinan hasil AI kurang diverifikasi atau kamu cukup bergantung padanya. Coba diskusikan dengan dosen kalau perlu.' }
];

/** Kembalikan objek interpretasi ({label, badge, saran}) sesuai rentang skor RAPI Index, atau null kalau nilainya belum ada. */
function interpretasiRapi(nilai){
  if(nilai === null || nilai === undefined) return null;
  return RAPI_INTERPRETASI.find(b => nilai >= b.min) || null;
}

/**
 * Menulis narasi interpretasi TREN RAPI di bawah chart "Perkembangan
 * Indikator RAPI" — membandingkan tugas pertama vs terakhir yang sudah
 * dinilai, supaya mahasiswa langsung paham progres praktik AI-nya,
 * bukan cuma melihat garis grafik naik-turun tanpa konteks.
 */
function renderNarasiTrenRapi(list){
  const box = $('rapi-trend-narasi');
  if(!box) return;

  const valid = (list || []).filter(r => r.rapiIndex !== null && r.rapiIndex !== undefined);

  if(valid.length === 0){
    box.innerHTML = `<p style="font-size:13px;color:var(--slate-500);margin-top:12px;">Belum ada tugas dengan data RAPI yang dinilai.</p>`;
    return;
  }

  if(valid.length === 1){
    const satu = valid[0];
    const interp = interpretasiRapi(satu.rapiIndex);
    box.innerHTML = `
      <div style="margin-top:14px; padding:14px 16px; background:var(--slate-50); border:1px solid var(--slate-200); border-radius:12px;">
        <span class="badge ${interp ? interp.badge : 'badge-amber'}">RAPI Index ${satu.rapiIndex}%</span>
        <p style="font-size:13.5px; color:var(--slate-700); margin-top:10px; line-height:1.6;">
          Baru ada satu tugas dengan data RAPI lengkap, yaitu <b>${satu.namaTugas}</b> (${satu.rapiIndex}%).
          ${interp ? `Saat ini kamu berada di kategori <b>${interp.label}</b>.` : ''}
        </p>
        <p style="font-size:13px; color:var(--slate-500); margin-top:8px; line-height:1.6;">
          Tren perkembangan baru bisa ditampilkan setelah ada minimal 2 tugas dengan data RAPI.
        </p>
      </div>
    `;
    return;
  }

  const awal = valid[0];
  const akhir = valid[valid.length - 1];
  const deltaRapi = akhir.rapiIndex - awal.rapiIndex;
  const arah = deltaRapi > 5 ? 'naik' : (deltaRapi < -5 ? 'turun' : 'relatif stabil');
  const warnaBadge = deltaRapi > 5 ? 'badge-green' : (deltaRapi < -5 ? 'badge-red' : 'badge-amber');
  const interpAkhir = interpretasiRapi(akhir.rapiIndex);

  // --- Cari indikator mana yang paling mendorong perubahan ---
  const fragmen = [];
  const dR = (akhir.aiReliance!=null && awal.aiReliance!=null) ? akhir.aiReliance - awal.aiReliance : null;
  const dV = (akhir.aiVerification!=null && awal.aiVerification!=null) ? akhir.aiVerification - awal.aiVerification : null;
  const dA = (akhir.aiAkuntabilitasTransparansi!=null && awal.aiAkuntabilitasTransparansi!=null) ? akhir.aiAkuntabilitasTransparansi - awal.aiAkuntabilitasTransparansi : null;

  if(dR !== null){
    if(dR <= -5) fragmen.push(`ketergantungan pada AI <b>menurun</b> ${Math.abs(dR).toFixed(1)} poin — tanda kamu makin mandiri`);
    else if(dR >= 5) fragmen.push(`ketergantungan pada AI <b>meningkat</b> ${Math.abs(dR).toFixed(1)} poin — perlu diperhatikan`);
  }
  if(dV !== null){
    if(dV >= 5) fragmen.push(`kebiasaan verifikasi hasil AI <b>meningkat</b> ${Math.abs(dV).toFixed(1)} poin`);
    else if(dV <= -5) fragmen.push(`kebiasaan verifikasi hasil AI <b>menurun</b> ${Math.abs(dV).toFixed(1)} poin`);
  }
  if(dA !== null){
    if(dA >= 5) fragmen.push(`akuntabilitas &amp; transparansi <b>meningkat</b> ${Math.abs(dA).toFixed(1)} poin`);
    else if(dA <= -5) fragmen.push(`akuntabilitas &amp; transparansi <b>menurun</b> ${Math.abs(dA).toFixed(1)} poin`);
  }

  const kalimatDetail = fragmen.length
    ? 'Didorong oleh: ' + fragmen.join(', ') + '.'
    : 'Ketiga indikator utama relatif stabil dari tugas pertama ke tugas terakhir.';

  box.innerHTML = `
    <div style="margin-top:14px; padding:14px 16px; background:var(--slate-50); border:1px solid var(--slate-200); border-radius:12px;">
      <span class="badge ${warnaBadge}">RAPI Index ${arah}</span>
      <p style="font-size:13.5px; color:var(--slate-700); margin-top:10px; line-height:1.6;">
        Dari <b>${awal.namaTugas}</b> (${awal.rapiIndex}%) ke <b>${akhir.namaTugas}</b> (${akhir.rapiIndex}%),
        RAPI Index kamu ${arah} sebesar ${Math.abs(deltaRapi).toFixed(1)} poin.
        ${interpAkhir ? `Saat ini kamu berada di kategori <b>${interpAkhir.label}</b>.` : ''}
      </p>
      <p style="font-size:13px; color:var(--slate-500); margin-top:8px; line-height:1.6;">
        ${kalimatDetail}
      </p>
    </div>
  `;
}

/* ================================================================
   RAPI
   ================================================================ */
function renderRapi(list){
  list = list || [];
  const box = $('rapi-detail');
  if(!list.length){
    box.innerHTML = '<div class="empty-state"><p>Belum ada data RAPI untuk tugas yang dinilai.</p></div>';
    return;
  }
  box.innerHTML = list.map(r=>{
    if (r.tidakMenggunakanAI) {
      return `
      <div class="rapi-task-card">
        <h4>${r.namaTugas} <span class="badge badge-blue">Tidak Menggunakan AI</span></h4>
        <p style="font-size:12.5px;color:var(--slate-500);margin-top:8px;line-height:1.5;">
          Mahasiswa menyatakan tidak menggunakan AI untuk tugas ini, sehingga indikator RAPI
          (Reliance, Verification, Akuntabilitas &amp; Transparansi) tidak berlaku dan tidak dinilai untuk tugas ini.
        </p>
      </div>`;
    }
    const interp = interpretasiRapi(r.rapiIndex);
    const rapiIndexLabel = interp ? (r.rapiIndex + '% — ' + interp.label) : 'Belum lengkap';
    const badgeClass = interp ? interp.badge : 'badge-amber';
    return `
    <div class="rapi-task-card">
      <h4>${r.namaTugas} <span class="badge ${badgeClass}">RAPI Index: ${rapiIndexLabel}</span></h4>
      ${rapiBar('AI Usage', r.aiUsage)}
      ${rapiBar('AI Reliance', r.aiReliance)}
      ${rapiBar('AI Verification', r.aiVerification)}
      ${rapiBar('Akuntabilitas &amp; Transparansi', r.aiAkuntabilitasTransparansi)}
      ${interp ? `<p style="font-size:12.5px;color:var(--slate-500);margin-top:10px;line-height:1.5;">💡 ${interp.saran}</p>` : ''}
    </div>
  `;
  }).join('');
}

function rapiBar(label, value){
  const ada = value !== null && value !== undefined;
  const lebar = ada ? Math.max(0, Math.min(100, Number(value))) : 0;
  const tampil = ada ? Number(value)+'%' : '-';
  return `<div class="progress-line">
    <div class="pl-top"><b>${label}</b><span>${tampil}</span></div>
    <div class="progress-track"><div class="progress-fill" style="width:${lebar}%"></div></div>
  </div>`;
}

/* ================================================================
   GRAFIK (Chart.js)
   ================================================================ */
function destroyCharts(){
  Object.values(charts).forEach(c=>c && c.destroy());
  charts = {};
}

// Nama pendek untuk sumbu grafik, supaya tidak berdesakan di layar kecil
const LABEL_PENDEK = {
  'Tugas Rutin':'Rutin', 'CJR':'CJR', 'CBR':'CBR',
  'Mini Riset':'M.Riset', 'Rekayasa Ide':'R.Ide', 'TBP':'TBP'
};

function renderChartsDashboard(data){
  destroyCharts();
  const gridColor = '#EEF1F6';
  const enamTugas = (data.tugas && data.tugas.enamTugas) || [];
  const rekapKehadiran = (data.kehadiran && data.kehadiran.rekap) || { hadir:0, totalPertemuan:0 };
  const rapi = data.rapi || [];

  // Grafik perkembangan nilai 6 Tugas KKNI
  const nilaiLabels = enamTugas.map(t=>LABEL_PENDEK[t.nama] || t.nama);
  const nilaiData = enamTugas.map(t=>t.nilai);
  charts.nilai = new Chart($('chart-nilai'), {
    type:'line',
    data:{ labels:nilaiLabels, datasets:[{
      label:'Nilai', data:nilaiData, spanGaps:true,
      borderColor:'#2563EB', backgroundColor:'rgba(37,99,235,.08)',
      pointBackgroundColor:'#2563EB', pointRadius:4, tension:.35, fill:true
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        y:{min:0, max:100, grid:{color:gridColor}, ticks:{color:'#64748B'}},
        x:{grid:{display:false}, ticks:{color:'#64748B'}}
      }
    }
  });

  // Mini donat kehadiran
const hadir = rekapKehadiran.hadir || 0;
const izin = rekapKehadiran.izin || 0;
const sakit = rekapKehadiran.sakit || 0;
const alpa = rekapKehadiran.alpa || 0;

charts.kehadiranMini = new Chart($('chart-kehadiran-mini'), {
  type: 'doughnut',

  data: {
    labels: ['Hadir', 'Izin', 'Sakit', 'Alpa'],

    datasets: [{
      data: [hadir, izin, sakit, alpa],
      backgroundColor: [
        '#15803D', // Hadir
        '#2563EB', // Izin
        '#F59E0B', // Sakit
        '#DC2626'  // Alpa
      ],
      borderWidth: 0
    }]
  },

  options: {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',

    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 10,
          font: {
            size: 11
          }
        }
      }
    }
  }
});

  // Rata-rata RAPI (bar horizontal)
  const rapiAvg = avgRapi(rapi);
  charts.rapiMini = new Chart($('chart-rapi-mini'), {
    type:'bar',
    data:{ labels:['AI Usage','AI Reliance','AI Verification','Akuntabilitas & Transparansi'],
      datasets:[{ data:[rapiAvg.aiUsage, rapiAvg.aiReliance, rapiAvg.aiVerification, rapiAvg.aiAkuntabilitasTransparansi],
        backgroundColor:['#94A3B8','#2563EB','#3B82F6','#1B3A5C'], borderRadius:6, maxBarThickness:34 }]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{ x:{min:0,max:100, grid:{color:gridColor}}, y:{grid:{display:false}} }
    }
  });

    // Tren RAPI per tugas yang sudah dinilai
  const rapiLabels = rapi.map(r=>LABEL_PENDEK[r.namaTugas] || r.namaTugas);
  charts.rapiTrend = new Chart($('chart-rapi-trend'), {
    type:'line',
    data:{ labels:rapiLabels, datasets:[
      lineset('AI Usage', rapi.map(r=>r.aiUsage), '#94A3B8'),
      lineset('AI Reliance', rapi.map(r=>r.aiReliance), '#2563EB'),
      lineset('AI Verification', rapi.map(r=>r.aiVerification), '#15803D'),
      lineset('Akuntabilitas & Transparansi', rapi.map(r=>r.aiAkuntabilitasTransparansi), '#B45309')
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom', labels:{boxWidth:10, font:{size:11}}}},
      scales:{ y:{min:0,max:100, grid:{color:gridColor}}, x:{grid:{display:false}} }
    }
  });

  renderNarasiTrenRapi(rapi);   // <-- tambahkan di sini
}

function lineset(label, data, color){
  return { label, data, borderColor:color, backgroundColor:color, pointRadius:3, tension:.35, fill:false, spanGaps:true };
}

function avgRapi(list){
  const fields = ['aiUsage','aiReliance','aiVerification','aiAkuntabilitasTransparansi'];
  const result = {};
  fields.forEach(f=>{
    const vals = list.map(r=>r[f]).filter(v=>v!==null && v!==undefined);
    result[f] = vals.length ? (vals.reduce((a,b)=>a+Number(b),0)/vals.length) : 0;
  });
  return result;
}

/* ================================================================
   NAVIGASI SIDEBAR / BOTTOM NAV
   ================================================================ */
function switchPanel(panel){
  document.querySelectorAll('.section-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+panel).classList.add('active');
  document.querySelectorAll('.nav-item, .bottom-nav button').forEach(b=>{
    b.classList.toggle('active', b.dataset.panel===panel);
  });
  closeSidebar();
}
document.querySelectorAll('.nav-item, .bottom-nav button').forEach(btn=>{
  btn.addEventListener('click', ()=>switchPanel(btn.dataset.panel));
});

/* Ganti NIM: kembali ke halaman login */
$('btn-ganti-nim').addEventListener('click', ()=>{
  $('page-dashboard').classList.remove('active');
  $('page-login').style.display = 'flex';
  $('nim-input').value = '';
  $('matkul-select').value = '';
  isiDropdownKelas('');
  $('login-error').classList.remove('show');
  destroyCharts();
});

/* Sidebar mobile */
function openSidebar(){ $('sidebar').classList.add('open'); $('sidebar-overlay').classList.add('show'); }
function closeSidebar(){ $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('show'); }
$('btn-open-sidebar').addEventListener('click', openSidebar);
$('sidebar-overlay').addEventListener('click', closeSidebar);
