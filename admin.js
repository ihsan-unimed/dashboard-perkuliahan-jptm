const $ = (id) => document.getElementById(id);
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyvZwHHmxVwKRrJKXoR4DfObAzKAWMzCmUg5ZyhUWZaGLMFLCjOiPp6fTWFhBz3CX0yyQ/exec'; // samakan dengan script.js

let ADMIN_SECRET = '', currentMatkul = '', currentKelas = '', daftarMatkul = [];

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const nama = 'jsonpAdmin_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    window[nama] = (data) => { resolve(data); delete window[nama]; script.remove(); };
    const script = document.createElement('script');
    script.src = url + (url.indexOf('?') > -1 ? '&' : '?') + 'callback=' + nama;
    script.onerror = () => { reject(new Error('Gagal memuat data.')); delete window[nama]; script.remove(); };
    document.body.appendChild(script);
  });
}

$('btn-admin-login').addEventListener('click', () => {
  const secret = $('admin-password').value.trim();
  $('admin-login-error').classList.remove('show');
  jsonp(WEBAPP_URL + '?action=cekAdminSecret&secret=' + encodeURIComponent(secret)).then(resp => {
    if (resp && resp.success) {
      ADMIN_SECRET = secret;
      $('page-admin-login').style.display = 'none';
      $('page-admin-pilih').style.display = 'block';
      muatDaftarMatkulAdmin();
    } else {
      $('admin-login-error').textContent = 'Kata sandi salah.';
      $('admin-login-error').classList.add('show');
    }
  });
});

function muatDaftarMatkulAdmin() {
  jsonp(WEBAPP_URL + '?action=listMatkul').then(resp => {
    daftarMatkul = (resp && resp.data) || [];
    const unikMap = {};
    daftarMatkul.forEach(m => unikMap[m.matkulKode] = m.matkulNama);
    $('admin-matkul-select').innerHTML = '<option value="">-- Pilih Mata Kuliah --</option>' +
      Object.keys(unikMap).map(k => `<option value="${k}">${unikMap[k]}</option>`).join('');
  });
}

$('admin-matkul-select').addEventListener('change', (e) => {
  const kelasList = daftarMatkul.filter(m => m.matkulKode === e.target.value);
  $('admin-kelas-select').innerHTML = '<option value="">-- Pilih Kelas --</option>' +
    kelasList.map(k => `<option value="${k.kelasKode}">${k.kelasNama}</option>`).join('');
});

$('btn-admin-tampilkan').addEventListener('click', () => {
  currentMatkul = $('admin-matkul-select').value;
  currentKelas = $('admin-kelas-select').value;
  if (!currentMatkul || !currentKelas) { alert('Pilih mata kuliah dan kelas terlebih dahulu.'); return; }
  $('page-admin-pilih').style.display = 'none';
  $('page-admin-dashboard').style.display = 'block';
  muatRekap();
  muatRandomChecking();
});

/** Cari nama tampilan Mata Kuliah dari kodenya, pakai data yang sudah dimuat di daftarMatkul. */
function namaMatkulDariKode(kode) {
  const m = daftarMatkul.find(m => m.matkulKode === kode);
  return m ? m.matkulNama : kode;
}

/** Cari nama tampilan Kelas dari kodenya (dicocokkan juga dengan Mata Kuliahnya). */
function namaKelasDariKode(matkulKode, kelasKode) {
  const k = daftarMatkul.find(m => m.matkulKode === matkulKode && m.kelasKode === kelasKode);
  return k ? k.kelasNama : kelasKode;
}

function muatRekap() {
  const url = WEBAPP_URL + '?action=adminRekap&secret=' + encodeURIComponent(ADMIN_SECRET) +
    '&matkul=' + encodeURIComponent(currentMatkul) + '&kelas=' + encodeURIComponent(currentKelas);
  jsonp(url).then(resp => {
    if (!resp.success) { $('tbl-rekap').innerHTML = `<tr><td colspan="7">${resp.message}</td></tr>`; return; }

    // --- Baris info Mata Kuliah / Kelas / Prodi (dulu jadi 3 kolom, sekarang cukup 1 baris) ---
    const daftarProdi = [...new Set(resp.data.map(r => r.prodi).filter(Boolean))];
    const teksProdi = daftarProdi.length ? daftarProdi.join(', ') : '-';
    $('rekap-context-info').innerHTML =
      `Mata Kuliah: <b>${namaMatkulDariKode(currentMatkul)}</b> &middot; ` +
      `Kelas: <b>${namaKelasDariKode(currentMatkul, currentKelas)}</b> &middot; ` +
      `Prodi: <b>${teksProdi}</b>`;

    // --- Tabel sekarang 7 kolom: No, Nama, Kehadiran, Tugas KKNI, Rata-Rata Nilai KKNI, UTS, UAS ---
    $('tbl-rekap').innerHTML = resp.data.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.nama}</td>
        <td>${r.jumlahHadir} / ${r.totalPertemuan}</td>
        <td>${r.jumlahTugasKumpul} / ${r.totalTugas}</td>
        <td>${r.rataNilaiKKNI ?? '-'}</td>
        <td>${r.nilaiUTS ?? '-'}</td>
        <td>${r.nilaiUAS ?? '-'}</td>
      </tr>`).join('');
  });
}

function muatRandomChecking(acakUlangTugas) {
  const action = acakUlangTugas ? 'adminAcakUlang' : 'adminRandomChecking';
  let url = WEBAPP_URL + '?action=' + action + '&secret=' + encodeURIComponent(ADMIN_SECRET) +
    '&matkul=' + encodeURIComponent(currentMatkul) + '&kelas=' + encodeURIComponent(currentKelas);
  if (acakUlangTugas) url += '&tugas=' + encodeURIComponent(acakUlangTugas);

  jsonp(url).then(resp => {
    if (!resp.success) { $('tbl-random-checking').innerHTML = `<tr><td colspan="4">${resp.message}</td></tr>`; return; }
    $('tbl-random-checking').innerHTML = resp.data.map(d => `
      <tr>
        <td>${d.no}</td>
        <td>${d.jenisTugas}</td>
        <td>${d.mahasiswaTerpilih.join(', ') || '<i>Belum ada yang mengumpulkan</i>'}</td>
        <td><button class="btn-ghost-light" onclick="muatRandomChecking('${d.jenisTugas}')">Acak Ulang</button></td>
      </tr>`).join('');
  });
}
