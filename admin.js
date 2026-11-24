// admin.js — halaman admin untuk membalas chat pengunjung satu per satu.
// Dimuat oleh admin.html lewat <script type="module" src="admin.js"></script>.
//
// Login memakai Firebase Authentication (Email + Password). Akun admin
// didaftarkan manual di Firebase Console → Authentication → Users → Add user.
// UID akun admin itu harus ditempel ke database.rules.json (ganti
// "MASUKKAN_UID_ADMIN_DI_SINI") supaya admin bisa membaca semua percakapan,
// sementara pengunjung (anonim) hanya bisa akses percakapannya sendiri.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, runTransaction, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ====== KONFIGURASI FIREBASE (sama dengan project yang sudah ada) ======
const firebaseConfig = {
  apiKey: "AIzaSyA3C3BpjOrEA16sop2uIIo52pVvFtAyEDQ",
  authDomain: "jasa-pembuatan-aplikasi-batam.firebaseapp.com",
  databaseURL: "https://jasa-pembuatan-aplikasi-batam-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jasa-pembuatan-aplikasi-batam",
  storageBucket: "jasa-pembuatan-aplikasi-batam.firebasestorage.app",
  messagingSenderId: "30894586214",
  appId: "1:30894586214:web:def6ccb3da69ebc26e30a7"
};

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

// ====== Elemen UI ======
const loginOverlay = document.getElementById('login-overlay');
const loginForm    = document.getElementById('login-form');
const emailInput   = document.getElementById('email-input');
const passInput    = document.getElementById('password-input');
const loginErr     = document.getElementById('login-err');
const adminApp     = document.getElementById('admin-app');
const btnLogout    = document.getElementById('btn-logout');

const daftarSesi   = document.getElementById('daftar-sesi');
const totalSesi    = document.getElementById('total-sesi');
const searchInput  = document.getElementById('search-sesi');

const placeholder  = document.getElementById('chat-placeholder');
const chatAktif    = document.getElementById('chat-aktif');
const chatNama     = document.getElementById('chat-nama');
const chatIdEl     = document.getElementById('chat-id');
const chatMsgs     = document.getElementById('chat-msgs');
const inputBalas   = document.getElementById('input-balas');
const btnBalas     = document.getElementById('btn-balas');
const chatBack     = document.getElementById('chat-back');

let activeChatId = null;
let snapshotChats = {};
let filterText = "";
let listenerTerpasang = false;

// ====== Login email/password ======
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErr.hidden = true;
  const email = emailInput.value.trim();
  const pass  = passInput.value;
  if (!email || !pass) { loginErr.hidden = false; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged akan menampilkan dashboard.
  } catch (err) {
    tampilkanErrorLogin(err);
  }
});

function tampilkanErrorLogin(err) {
  let pesan = "Email atau password salah.";
  if (err && err.code === 'auth/invalid-email') pesan = "Format email tidak valid.";
  else if (err && err.code === 'auth/user-not-found') pesan = "Akun admin belum terdaftar.";
  else if (err && err.code === 'auth/wrong-password') pesan = "Password salah.";
  else if (err && err.code === 'auth/too-many-requests') pesan = "Terlalu banyak percobaan. Coba lagi nanti.";
  else if (err && err.code === 'auth/network-request-failed') pesan = "Gangguan koneksi internet.";
  loginErr.textContent = pesan;
  loginErr.hidden = false;
  passInput.value = "";
  passInput.focus();
}

btnLogout.addEventListener('click', async () => {
  activeChatId = null;
  await signOut(auth);
  // onAuthStateChanged akan kembali ke layar login.
});

// ====== Status auth: tampilkan dashboard atau login ======
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginOverlay.hidden = true;
    adminApp.hidden = false;
    if (!listenerTerpasang) {
      pasangListenerChats();
      listenerTerpasang = true;
    }
  } else {
    adminApp.hidden = true;
    loginOverlay.hidden = false;
    emailInput.value = "";
    passInput.value = "";
    emailInput.focus();
  }
});

// ====== Format waktu ======
function formatWaktu(ms) {
  if (!ms) return "";
  if ((Date.now() - ms) / 1000 < 60) return "Barusan";
  return new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function formatWaktuList(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const mnt = Math.floor(diff / 60000);
  if (mnt < 1) return "Baru";
  if (mnt < 60) return mnt + " mnt";
  const jam = Math.floor(mnt / 60);
  if (jam < 24) return jam + " jam";
  const hr = Math.floor(jam / 24);
  if (hr < 7) return hr + " hr";
  return new Date(ms).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

// ====== Listener utama: node "chats/" (hanya admin yang boleh, via rules) ======
function pasangListenerChats() {
  onValue(
    ref(db, 'chats/'),
    (snap) => {
      snapshotChats = snap.val() || {};
      renderDaftar();
      renderAktif();
    },
    (err) => {
      // Biasanya permission denied kalau UID admin belum dimasukkan ke rules.
      console.warn("Listener chats/ gagal:", err.code, err.message);
      daftarSesi.innerHTML =
        '<p class="empty-state">Akses ditolak. Pastikan UID akun admin sudah ' +
        'ditempel ke database.rules.json (ganti "MASUKKAN_UID_ADMIN_DI_SINI") ' +
        'lalu Publish ulang di Firebase Console.</p>';
    }
  );
}

// ====== Render daftar sesi (panel kiri) ======
function semuaSesi() {
  const arr = [];
  for (const [id, data] of Object.entries(snapshotChats)) {
    const info = (data && data.info) || {};
    let lastTime = info.lastTime || 0;
    if (!lastTime && data && data.messages) {
      const msgs = Object.values(data.messages);
      lastTime = msgs.reduce((m, x) => Math.max(m, x.waktu || 0), 0);
    }
    arr.push({ id, info, lastTime, data });
  }
  arr.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
  return arr;
}

function namaSesi(id) {
  // chatId baru = uid (panjang), chatId lama = "chat_...". Ambil 4-6 karakter akhir.
  const pendek = id.replace(/^chat_/, '').slice(-6);
  return 'Pengunjung ' + pendek;
}

function renderDaftar() {
  const sesi = semuaSesi();
  const f = filterText.trim().toLowerCase();
  const filtered = f
    ? sesi.filter(s => (s.info.lastMessage || "").toLowerCase().includes(f) || s.id.toLowerCase().includes(f))
    : sesi;

  totalSesi.textContent = sesi.length;

  if (filtered.length === 0) {
    daftarSesi.innerHTML = `<p class="empty-state">${sesi.length === 0 ? 'Belum ada percakapan masuk.' : 'Tidak cocok dengan pencarian.'}</p>`;
    return;
  }

  daftarSesi.innerHTML = "";
  filtered.forEach(s => {
    const item = document.createElement('div');
    item.className = 'sesi-item' + (s.id === activeChatId ? ' aktif' : '');
    item.dataset.id = s.id;

    const unread = s.info.unreadAdmin || 0;
    const last = s.info.lastMessage || '(belum ada pesan)';
    const fromAdmin = s.info.lastSender === 'admin';

    item.innerHTML = `
      <div class="sesi-avatar"><i class="fa-solid fa-user"></i></div>
      <div class="sesi-meta">
        <div class="sesi-top">
          <span class="sesi-nama"></span>
          <span class="sesi-time">${formatWaktuList(s.lastTime)}</span>
        </div>
        <div class="sesi-last${fromAdmin ? ' from-admin' : ''}"></div>
      </div>
      ${unread > 0 ? `<span class="sesi-unread">${unread > 9 ? '9+' : unread}</span>` : ''}
    `;
    item.querySelector('.sesi-nama').textContent = namaSesi(s.id);
    item.querySelector('.sesi-last').textContent = (fromAdmin ? 'Anda: ' : '') + last;

    item.addEventListener('click', () => pilihSesi(s.id));
    daftarSesi.appendChild(item);
  });
}

searchInput.addEventListener('input', () => { filterText = searchInput.value; renderDaftar(); });

// ====== Pilih sesi ======
function pilihSesi(id) {
  activeChatId = id;
  renderDaftar();
  renderAktif();
  set(ref(db, `chats/${id}/info/unreadAdmin`), 0).catch(() => {});
  adminApp.classList.add('mobile-in-chat');
  inputBalas.focus();
}

chatBack.addEventListener('click', () => {
  adminApp.classList.remove('mobile-in-chat');
});

// ====== Render percakapan aktif (panel kanan) ======
function renderAktif() {
  if (!activeChatId || !snapshotChats[activeChatId]) {
    placeholder.hidden = false;
    chatAktif.hidden = true;
    return;
  }
  const data = snapshotChats[activeChatId];
  const info = data.info || {};
  const messages = data.messages || {};

  placeholder.hidden = true;
  chatAktif.hidden = false;

  chatNama.textContent = namaSesi(activeChatId);
  chatIdEl.textContent = activeChatId;

  const list = Object.entries(messages)
    .map(([k, v]) => v)
    .filter(v => v && v.teks)
    .sort((a, b) => (a.waktu || 0) - (b.waktu || 0));

  chatMsgs.innerHTML = "";
  list.forEach(d => {
    const b = document.createElement('div');
    b.className = `msg-bubble ${d.pengirim === 'admin' ? 'admin-msg' : 'user-msg'}`;
    const p = document.createElement('p');
    p.textContent = d.teks;
    const t = document.createElement('span');
    t.className = 'msg-time';
    t.textContent = formatWaktu(d.waktu);
    b.appendChild(p);
    b.appendChild(t);
    chatMsgs.appendChild(b);
  });
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

// ====== Balas pesan ======
async function balasPesan() {
  const teks = inputBalas.value.trim();
  if (!teks || !activeChatId) return;
  inputBalas.value = "";
  try {
    await push(ref(db, `chats/${activeChatId}/messages`), {
      teks, pengirim: "admin", waktu: Date.now()
    });
    await runTransaction(ref(db, `chats/${activeChatId}/info`), (info) => {
      info = info || {};
      info.lastMessage   = teks;
      info.lastTime      = Date.now();
      info.lastSender    = "admin";
      info.unreadAdmin   = 0;
      info.unreadVisitor = (info.unreadVisitor || 0) + 1;
      return info;
    });
  } catch (err) {
    alert("Gagal mengirim balasan. Periksa koneksi internet Anda.");
    inputBalas.value = teks;
  }
}
btnBalas.addEventListener('click', balasPesan);
inputBalas.addEventListener('keypress', (e) => { if (e.key === 'Enter') balasPesan(); }); 
