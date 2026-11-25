// chat.js — logika widget chat pengunjung.
// Dimuat oleh index.html lewat <script type="module" src="chat.js"></script>.
//
// Versi ini (aman, pakai Firebase Auth + gerbang nama tanpa login):
//  - Pengunjung login ANONIM (signInAnonymously) -> dapat uid stabil per perangkat.
//  - chatId = user.uid, jadi tiap pengunjung hanya bisa akses percakapannya sendiri
//    (diterapkan lewat database.rules.json: auth.uid === $chatId).
//  - SEBELUM kirim pesan pertama, pengunjung diminta menulis NAMA (satu kolom,
//    tanpa password, tanpa akun). Nama disimpan di info.nama + localStorage,
//    lalu ditampilkan di panel admin (bukan "Pengunjung kode").
//  - Jendela chat FULL-SCREEN saat dibuka; pesan sambutan hanya muncul saat
//    percakapan masih kosong; badge belum-dibaca di FAB saat admin membalas.
//
// Catatan: pengunjung lama (chatId lama "chat_..." di localStorage) akan memulai
// percakapan baru di bawah uid anonimnya; riwayat lama tetap bisa dilihat admin.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, runTransaction, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
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

// ====== ID chat = uid anonim pengunjung (diisi setelah auth) ======
let chatId = null;

const PESAN_SAMBUTAN =
  "Halo Kak! Selamat datang di Jasa Pembuatan Aplikasi UMKM. Ada yang bisa kami bantu untuk bisnis Anda hari ini?";
const PESAN_HINT_NAMA =
  "Sebelum mulai, tulis nama Anda di kolom bawah ya, Kak — supaya kami bisa menyapa Anda dengan hangat.";

// ====== Elemen UI ======
const fab        = document.getElementById('chat-fab');
const badge      = document.getElementById('chat-badge');
const jendela    = document.getElementById('chat-window');
const btnClose   = document.getElementById('chat-close');
const btnKirim   = document.getElementById('btn-kirim-pesan');
const inputPesan = document.getElementById('input-pesan-user');
const chatBody   = document.getElementById('chat-box-messages');

let jendelaTerbuka = false;

// ====== Nama pengunjung (tanpa login) ======
const KEY_NAMA = 'chat_nama_pengunjung';
let namaPengunjung = '';
try {
  namaPengunjung = (localStorage.getItem(KEY_NAMA) || '').trim().slice(0, 30);
} catch (e) { namaPengunjung = ''; }

function updateInputState() {
  if (namaPengunjung) {
    inputPesan.placeholder = "Tulis pesan…";
  } else {
    inputPesan.placeholder = "Tulis nama Anda dulu…";
  }
  inputPesan.setAttribute('autocomplete', 'off');
}
updateInputState();

// Tampilan awal sebelum auth selesai.
chatBody.innerHTML = '<div class="msg-bubble admin-msg"><p>Menyiapkan chat...</p></div>';

let lastMessagesSnap = null;   // snapshot pesan terakhir, untuk re-render setelah nama diisi

// ====== Buka / tutup jendela (full-screen) ======
function bukaJendela() {
  jendela.classList.add('aktif');
  jendela.setAttribute('aria-hidden', 'false');
  jendelaTerbuka = true;
  sembunyikanBadge();
  if (chatId) {
    set(ref(db, `chats/${chatId}/info/unreadVisitor`), 0).catch(() => {});
  }
  setTimeout(() => inputPesan.focus(), 300);
}
function tutupJendela() {
  jendela.classList.remove('aktif');
  jendela.setAttribute('aria-hidden', 'true');
  jendelaTerbuka = false;
}
fab.addEventListener('click', () => (jendelaTerbuka ? tutupJendela() : bukaJendela()));
btnClose.addEventListener('click', tutupJendela);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && jendelaTerbuka) tutupJendela();
});

// ====== Badge belum-dibaca ======
function tampilkanBadge(n) {
  if (n > 0) {
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.hidden = false;
  } else {
    sembunyikanBadge();
  }
}
function sembunyikanBadge() { badge.hidden = true; badge.textContent = '0'; }

// ====== Render pesan ======
function formatWaktu(ms) {
  if (!ms || (Date.now() - ms) / 1000 < 60) return "Barusan";
  return new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function buatBubble(teks, pengirim, waktu) {
  const b = document.createElement('div');
  b.className = `msg-bubble ${pengirim === 'user' ? 'user-msg' : 'admin-msg'}`;
  const p = document.createElement('p');
  p.textContent = teks;
  const s = document.createElement('span');
  s.className = 'msg-time';
  s.textContent = waktu;
  b.appendChild(p);
  b.appendChild(s);
  return b;
}
function buatBubbleHint(teks) {
  const b = document.createElement('div');
  b.className = 'msg-bubble admin-msg msg-hint';
  const p = document.createElement('p');
  p.textContent = teks;
  b.appendChild(p);
  return b;
}

function renderChatBody() {
  chatBody.innerHTML = "";
  const snap = lastMessagesSnap;
  const adaPesan = snap && snap.exists();
  if (!adaPesan) {
    chatBody.appendChild(buatBubble(PESAN_SAMBUTAN, "admin", "Barusan"));
  } else {
    snap.forEach((child) => {
      const d = child.val();
      if (!d || !d.teks) return;
      chatBody.appendChild(buatBubble(d.teks, d.pengirim, formatWaktu(d.waktu)));
    });
  }
  // Hint nama hanya tampil selama pengunjung belum menulis namanya.
  if (!namaPengunjung) {
    chatBody.appendChild(buatBubbleHint(PESAN_HINT_NAMA));
  }
  chatBody.scrollTop = chatBody.scrollHeight;
}

// ====== Listener pesan real-time ======
let hentikanChat = null;
function pasangChat() {
  if (!chatId) return;
  if (hentikanChat) hentikanChat();
  hentikanChat = onValue(ref(db, `chats/${chatId}/messages`), (snap) => {
    lastMessagesSnap = snap;
    renderChatBody();
  });
}

// ====== Listener info (badge belum-dibaca) ======
let hentikanInfo = null;
function pasangInfo() {
  if (!chatId) return;
  if (hentikanInfo) hentikanInfo();
  hentikanInfo = onValue(ref(db, `chats/${chatId}/info`), (snap) => {
    const info = snap.val() || {};
    const unread = info.unreadVisitor || 0;
    if (jendelaTerbuka) sembunyikanBadge();
    else tampilkanBadge(unread);
  });
}

// ====== Auth anonim pengunjung ======
onAuthStateChanged(auth, (user) => {
  if (user) {
    chatId = user.uid;            // chatId terikat uid -> aman via rules
    pasangChat();
    pasangInfo();
  } else {
    chatId = null;
    signInAnonymously(auth).catch((err) => {
      console.warn("Auth anonim gagal:", err.code, err.message);
      let pesan = "Chat belum bisa dibuka. ";
      if (err.code === "auth/unauthorized-domain" || /unauthorized-domain/i.test(err.message || "")) {
        pesan += "Domain ini (<b>" + location.hostname + "</b>) belum diizinkan Firebase. " +
          "Buka Firebase Console → Authentication → Settings → Authorized domains → " +
          "<b>Add domain</b>, lalu tambahkan <b>" + location.hostname + "</b>. " +
          "(Tanpa ini, login admin juga akan gagal.)";
      } else if (err.code === "auth/operation-not-allowed") {
        pesan += "Metode <b>Anonymous</b> belum diaktifkan. Buka Firebase Console → " +
          "Authentication → Sign-in method → Anonymous → <b>Enable</b> → Save.";
      } else if (err.code === "auth/admin-restricted-operation") {
        pesan += "Metode <b>Anonymous</b> belum diaktifkan, atau opsi <b>Enable create (sign-up)</b> " +
          "dimatikan di Firebase. Buka Firebase Console → Authentication → <b>Sign-in method</b> → " +
          "<b>Anonymous</b> → <b>Enable</b> → Save. Lalu buka tab <b>Settings</b> → pastikan " +
          "<b>Enable create (sign-up)</b> aktif (ON).";
      } else if (err.code === "auth/api-key-not-valid" || /api-key/i.test(err.code || "")) {
        pesan += "API key Firebase tidak valid. Periksa kembali <b>firebaseConfig</b> di chat.js.";
      } else if (err.code === "auth/network-request-failed") {
        pesan += "Gangguan koneksi internet. Muat ulang halaman.";
      } else {
        pesan += "Kode error: <b>" + (err.code || "tidak diketahui") +
          "</b>. Buka konsol browser (F12) untuk detail.";
      }
      chatBody.innerHTML =
        '<div class="msg-bubble admin-msg"><p>' + pesan + '</p></div>';
    });
  }
});

// ====== Kirim: gerbang nama dulu, lalu pesan ======
async function kirimPesan() {
  const teks = inputPesan.value.trim();
  if (teks === "") return;

  // --- Tahap 1: belum ada nama -> simpan sebagai nama (belum kirim pesan) ---
  if (!namaPengunjung) {
    const nama = teks.slice(0, 30);
    namaPengunjung = nama;
    try { localStorage.setItem(KEY_NAMA, nama); } catch (e) {}
    inputPesan.value = "";
    updateInputState();
    if (chatId) {
      runTransaction(ref(db, `chats/${chatId}/info`), (info) => {
        info = info || {};
        info.nama = nama;
        return info;
      }).catch(() => {});
    }
    renderChatBody();   // hilangkan bubble hint
    setTimeout(() => inputPesan.focus(), 30);
    return;
  }

  // --- Tahap 2: nama sudah ada -> kirim pesan ---
  if (!chatId) {
    alert("Chat sedang bersiap, coba beberapa detik lagi.");
    inputPesan.value = "";
    return;
  }
  inputPesan.value = "";
  try {
    await push(ref(db, `chats/${chatId}/messages`), {
      teks, pengirim: "user", waktu: Date.now()
    });
    await runTransaction(ref(db, `chats/${chatId}/info`), (info) => {
      info = info || {};
      info.nama = namaPengunjung;        // pastikan nama tetap tercatat
      info.lastMessage = teks;
      info.lastTime    = Date.now();
      info.lastSender  = "user";
      info.unreadAdmin = (info.unreadAdmin || 0) + 1;
      return info;
    });
  } catch (err) {
    alert("Gagal mengirim. Periksa koneksi internet Anda.");
    inputPesan.value = teks;
  }
}
btnKirim.addEventListener('click', kirimPesan);
inputPesan.addEventListener('keypress', (e) => { if (e.key === 'Enter') kirimPesan(); });

// Pengunjung kembali ke tab -> pasang ulang listener.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && chatId) { pasangChat(); pasangInfo(); }
});
