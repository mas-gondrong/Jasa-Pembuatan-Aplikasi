// chat.js — logika widget chat pengunjung.
// Dimuat oleh index.html lewat <script type="module" src="chat.js"></script>.
//
// Versi ini (aman, pakai Firebase Auth):
//  - Pengunjung login ANONIM (signInAnonymously) -> dapat uid stabil per perangkat.
//  - chatId = user.uid, jadi tiap pengunjung hanya bisa akses percakapannya sendiri
//    (diterapkan lewat database.rules.json: auth.uid === $chatId).
//  - Jendela chat FULL-SCREEN saat dibuka (tombol FAB -> overlay seluruh layar,
//    tombol X jelas untuk menutup).
//  - Pesan sambutan hanya muncul saat percakapan masih kosong.
//  - Badge belum-dibaca di FAB saat admin membalas dan jendela tertutup.
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

// ====== Elemen UI ======
const fab        = document.getElementById('chat-fab');
const badge      = document.getElementById('chat-badge');
const jendela    = document.getElementById('chat-window');
const btnClose   = document.getElementById('chat-close');
const btnKirim   = document.getElementById('btn-kirim-pesan');
const inputPesan = document.getElementById('input-pesan-user');
const chatBody   = document.getElementById('chat-box-messages');

let jendelaTerbuka = false;

// Tampilan awal sebelum auth selesai.
chatBody.innerHTML = '<div class="msg-bubble admin-msg"><p>Menyiapkan chat...</p></div>';

// ====== Buka / tutup jendela (full-screen) ======
function bukaJendela() {
  jendela.classList.add('aktif');
  jendela.setAttribute('aria-hidden', 'false');
  jendelaTerbuka = true;
  sembunyikanBadge();
  if (chatId) {
    // Tandai pesan admin sudah dibaca pengunjung.
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

// ====== Listener pesan real-time ======
let hentikanChat = null;
function pasangChat() {
  if (!chatId) return;
  if (hentikanChat) hentikanChat();
  hentikanChat = onValue(ref(db, `chats/${chatId}/messages`), (snap) => {
    chatBody.innerHTML = "";
    const adaPesan = snap.exists();
    if (!adaPesan) {
      chatBody.appendChild(buatBubble(PESAN_SAMBUTAN, "admin", "Barusan"));
    }
    snap.forEach((child) => {
      const d = child.val();
      if (!d || !d.teks) return;
      chatBody.appendChild(buatBubble(d.teks, d.pengirim, formatWaktu(d.waktu)));
    });
    chatBody.scrollTop = chatBody.scrollHeight;
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
      chatBody.innerHTML =
        '<div class="msg-bubble admin-msg"><p>Chat belum bisa dibuka. ' +
        'Pastikan "Anonymous" sudah diaktifkan di Firebase Console → Authentication → Sign-in method.</p></div>';
    });
  }
});

// ====== Kirim pesan ======
async function kirimPesan() {
  const teks = inputPesan.value.trim();
  if (teks === "") return;
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
