// testimoni.js — halaman testimoni full-screen: form + daftar testimoni klien.
// Dimuat oleh index.html lewat <script type="module" src="testimoni.js"></script>.
//
// Fitur:
//  - Form testimoni: nama, rating bintang 1-5, pesan. Disimpan ke Firebase Realtime
//    Database node "testimoni/$uid" (satu testimoni per pengunjung anonim;
//    kirim ulang = menimpa testimoni lama milik pengunjung yang sama).
//  - Daftar testimoni: avatar lingkaran berwarna + inisial nama, bintang 1-5,
//    waktu relatif ("1 jam lalu"), diurutkan terbaru di atas.
//  - Auth: reuse default Firebase app (sama dengan chat.js) supaya uid anonim
//    konsisten. Bila chat.js belum init, modul ini init sendiri (aman).
//
// Catatan: rules Firebase WAJIB menambah node "testimoni" (read publik, write
// owner). Lihat database.rules.json versi baru.

import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ====== KONFIGURASI FIREBASE ======
const firebaseConfig = {
  apiKey: "AIzaSyA3C3BpjOrEA16sop2uIIo52pVvFtAyEDQ",
  authDomain: "jasa-pembuatan-aplikasi-batam.firebaseapp.com",
  databaseURL: "https://jasa-pembuatan-aplikasi-batam-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jasa-pembuatan-aplikasi-batam",
  storageBucket: "jasa-pembuatan-aplikasi-batam.firebasestorage.app",
  messagingSenderId: "30894586214",
  appId: "1:30894586214:web:def6ccb3da69ebc26e30a7"
};

// Reuse default app (sama dengan chat.js) supaya uid anonim konsisten.
let app;
try { app = getApp(); } catch (e) { app = initializeApp(firebaseConfig); }
const db   = getDatabase(app);
const auth = getAuth(app);

let uidSekarang = null;

// ====== Elemen UI ======
const overlay     = document.getElementById('testimoni-overlay');
const btnBuka     = document.getElementById('drawer-testimoni');
const btnTutup    = document.getElementById('testimoni-close');
const form        = document.getElementById('testimoni-form');
const inputNama   = document.getElementById('testimoni-nama');
const inputTeks   = document.getElementById('testimoni-teks');
const bintangWrap = document.getElementById('testimoni-bintang');
const statusEl    = document.getElementById('testimoni-status');
const listEl      = document.getElementById('testimoni-list');

let rating = 0;

// ====== Bintang 1-5 (interaktif) ======
function bangunBintang() {
  bintangWrap.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bintang-btn';
    b.dataset.nilai = i;
    b.setAttribute('aria-label', i + ' bintang');
    b.innerHTML = '<i class="fa-solid fa-star"></i>';
    b.addEventListener('click', () => { rating = i; segarkanBintang(); });
    b.addEventListener('mouseenter', () => sorotBintang(i));
    b.addEventListener('mouseleave', () => segarkanBintang());
    bintangWrap.appendChild(b);
  }
}
function segarkanBintang() {
  bintangWrap.querySelectorAll('.bintang-btn').forEach(b => {
    b.classList.toggle('nyala', Number(b.dataset.nilai) <= rating);
    b.classList.remove('sorot');
  });
}
function sorotBintang(n) {
  bintangWrap.querySelectorAll('.bintang-btn').forEach(b => {
    b.classList.toggle('sorot', Number(b.dataset.nilai) <= n);
  });
}
bangunBintang();

// ====== Buka / tutup overlay ======
function bukaOverlay() {
  overlay.classList.add('aktif');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function tutupOverlay() {
  overlay.classList.remove('aktif');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
if (btnBuka) {
  btnBuka.addEventListener('click', (e) => { e.preventDefault(); bukaOverlay(); });
}
if (btnTutup) btnTutup.addEventListener('click', tutupOverlay);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.classList.contains('aktif')) tutupOverlay();
});

// ====== Avatar warna + inisial ======
function warnaDariNama(nama) {
  let h = 0;
  const s = String(nama || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return 'hsl(' + h + ', 65%, 45%)';
}
function inisialDariNama(nama) {
  const t = String(nama || '?').trim();
  if (!t) return '?';
  return t.charAt(0).toUpperCase();
}

// ====== Waktu relatif ======
function waktuRelatif(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const dtk = Math.floor(diff / 1000);
  if (dtk < 60) return 'Barusan';
  const mnt = Math.floor(dtk / 60);
  if (mnt < 60) return mnt + ' menit lalu';
  const jam = Math.floor(mnt / 60);
  if (jam < 24) return jam + ' jam lalu';
  const hr = Math.floor(jam / 24);
  if (hr < 7) return hr + ' hari lalu';
  const mg = Math.floor(hr / 7);
  if (mg < 4) return mg + ' minggu lalu';
  return new Date(ms).toLocaleDateString("id-ID", { day: '2-digit', month: 'short', year: 'numeric' });
}

// ====== Bintang tetap (untuk daftar) ======
function bintangTetap(n) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += '<i class="fa-' + (i <= n ? 'solid' : 'regular') + ' fa-star"></i>';
  }
  return html;
  }

// ====== Render daftar testimoni ======
function renderDaftar(snap) {
  const data = snap.val() || {};
  const arr = Object.values(data).filter(t => t && t.nama && t.teks);
  arr.sort((a, b) => (b.waktu || 0) - (a.waktu || 0));

  if (arr.length === 0) {
    listEl.innerHTML = '<p class="testimoni-kosong">Jadilah yang pertama memberi testimoni! 🌟</p>';
    return;
  }

  listEl.innerHTML = "";
  arr.forEach(t => {
    const card = document.createElement('div');
    card.className = 'testimoni-card';

    const avatar = document.createElement('div');
    avatar.className = 'testimoni-avatar';
    avatar.style.background = warnaDariNama(t.nama);
    avatar.textContent = inisialDariNama(t.nama);

    const body = document.createElement('div');
    body.className = 'testimoni-card-body';

    const head = document.createElement('div');
    head.className = 'testimoni-card-head';
    const namaEl = document.createElement('strong');
    namaEl.textContent = t.nama;
    const waktuEl = document.createElement('span');
    waktuEl.className = 'testimoni-waktu';
    waktuEl.textContent = waktuRelatif(t.waktu);
    head.appendChild(namaEl);
    head.appendChild(waktuEl);

    const bintangEl = document.createElement('div');
    bintangEl.className = 'testimoni-bintang-tetap';
    bintangEl.innerHTML = bintangTetap(t.bintang || 0);

    const teksEl = document.createElement('p');
    teksEl.className = 'testimoni-teks';
    teksEl.textContent = t.teks;

    body.appendChild(head);
    body.appendChild(bintangEl);
    body.appendChild(teksEl);
    card.appendChild(avatar);
    card.appendChild(body);
    listEl.appendChild(card);
  });
}

// ====== Listener daftar testimoni (read publik via rules) ======
onValue(ref(db, 'testimoni'), (snap) => renderDaftar(snap), (err) => {
  console.warn("Listener testimoni gagal:", err.code, err.message);
  listEl.innerHTML =
    '<p class="testimoni-kosong">Belum bisa memuat testimoni. Pastikan rules Firebase ' +
    'sudah menambahkan node "testimoni" (lihat database.rules.json).</p>';
});

// ====== Submit form ======
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = inputNama.value.trim().slice(0, 30);
  const teks = inputTeks.value.trim().slice(0, 300);
  if (!nama) { tampilStatus('Nama tidak boleh kosong.', 'error'); return; }
  if (!teks) { tampilStatus('Testimoni tidak boleh kosong.', 'error'); return; }
  if (rating < 1 || rating > 5) { tampilStatus('Pilih rating bintang 1-5.', 'error'); return; }

  // Pastikan anonim auth.
  if (!uidSekarang) {
    try { await signInAnonymously(auth); }
    catch (err) { tampilStatus('Gagal masuk. Periksa koneksi internet.', 'error'); return; }
  }
  if (!uidSekarang) {
    tampilStatus('Sedang menyiapkan sesi, coba beberapa detik lagi.', 'error');
    return;
  }

  tampilStatus('Mengirim...', 'info');
  const btn = form.querySelector('.testimoni-kirim');
  btn.disabled = true;
  try {
    await set(ref(db, 'testimoni/' + uidSekarang), {
      nama, teks, bintang: rating, waktu: Date.now(), uid: uidSekarang
    });
    tampilStatus('Terima kasih! Testimoni Anda terkirim. 🌟', 'sukses');
    inputNama.value = "";
    inputTeks.value = "";
    rating = 0;
    segarkanBintang();
  } catch (err) {
    let pesan = 'Gagal mengirim testimoni. ';
    if (err.code === 'PERMISSION_DENIED' || err.code === 'permission-denied') {
      pesan += 'Rules Firebase belum menambah node "testimoni". Buka Firebase Console → ' +
        'Realtime Database → Rules, pastikan ada rules "testimoni" (lihat database.rules.json), ' +
        'lalu Publish.';
    } else if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation') {
      pesan += 'Auth Anonymous belum diaktifkan di Firebase Console.';
    } else {
      pesan += 'Kode error: ' + (err.code || 'tidak diketahui');
    }
    tampilStatus(pesan, 'error');
  } finally {
    btn.disabled = false;
  }
});

function tampilStatus(pesan, jenis) {
  statusEl.textContent = pesan;
  statusEl.className = 'testimoni-status ' + (jenis || 'info');
  statusEl.hidden = false;
}

// ====== Auth state ======
onAuthStateChanged(auth, (user) => {
  uidSekarang = user ? user.uid : null;
});
