/* app.js — UI (Siswa, Guru, kerangka Admin), router hash, formulir dinamis. Semua teks dinamis lewat esc(). */
const S = { akun: null, config: { versi: 1, rows: [] }, libur: [], periode: [], pengumuman: [], flash: '', rahasiaBaru: '' };
const AdminModules = []; // Tahap 4/5: AdminModules.push({ id, label, render: async (root, arg) => {} })
const SHOLAT = [['shubuh', 'Shubuh'], ['dzuhur', 'Dzuhur'], ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', "Isya'"]];
const RAMADAN = ['puasa', 'tarawih', 'tadarus'];
const DEFAULT_CONFIG = [['jam_bangun', 'Jam Bangun', 1], ['jam_tidur', 'Jam Tidur', 1], ['sholat', 'Ibadah Sholat', 0], ['olahraga', 'Kegiatan Olahraga', 0],
  ['makan', 'Menu Makan Sehat', 0], ['materi_belajar', 'Materi Belajar', 0], ['aksi_masyarakat', 'Aksi Bermasyarakat', 0]]
  .map((x, i) => ({ kunci: x[0], aktif: true, label: x[1], wajib: !!x[2], urutan: i + 1, preset: '', mulai: '', selesai: '' }));
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// ---------- util ----------
const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, 3500);
}
function dialog(html) { $('#dlgBody').innerHTML = html; const d = $('#dlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(s, n) { const p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
function dow(s) { const p = s.split('-').map(Number), x = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); return x === 0 ? 7 : x; }
function fmtTgl(s) { const p = s.split('-').map(Number); return HARI[dow(s) - 1] + ', ' + p[2] + ' ' + BULAN[p[1] - 1] + ' ' + p[0]; }
function fmtWaktu(ts) { return ts ? new Date(ts).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : 'belum pernah'; }
function isLibur(t) { return dow(t) >= 6 || S.libur.some(l => t >= l.mulai && t <= (l.selesai || l.mulai)); }
function batasEdit() { return (S.akun && S.akun.batas_edit_hari != null) ? S.akun.batas_edit_hari : APP.batasEditHariDefault; }
function bisaEdit(t) { const n = todayStr(); return t <= n && t >= addDays(n, -batasEdit()); }
function labelOf(k) { const c = S.config.rows.find(x => x.kunci === k); return c ? c.label : k; }
function badgeSync(rec) {
  if (rec.sync_status === 'synced') return '<span class="badge b-ok">Tersinkron</span>';
  if (rec.sync_status === 'error') return '<span class="badge b-err" title="' + esc(rec.error) + '">Ditolak</span>';
  return '<span class="badge b-wait">Menunggu kirim</span>';
}
function apiErr(e) { return e && e.message ? e.message : 'Terjadi kesalahan'; }

// ---------- referensi ----------
async function loadRef() {
  const o = S.akun.id;
  const cfg = (await DB.byIndex('config', 'owner_id', o)).sort((a, b) => a.urutan - b.urutan);
  S.config = cfg.length ? { versi: cfg[0].versi || 1, rows: cfg } : { versi: 1, rows: DEFAULT_CONFIG };
  S.libur = await DB.byIndex('libur', 'owner_id', o);
  S.periode = await DB.byIndex('tahunAjaran', 'owner_id', o);
  S.pengumuman = await DB.byIndex('pengumuman', 'owner_id', o);
}
function aktifKonfig(t) {
  return S.config.rows.filter(c => {
    if (!c.aktif) return false;
    if (c.preset === 'ramadan') { if (!c.mulai && !c.selesai) return false; if ((c.mulai && t < c.mulai) || (c.selesai && t > c.selesai)) return false; }
    return true;
  }).sort((a, b) => a.urutan - b.urutan);
}

// ---------- router & header ----------
function rute() {
  const h = (location.hash || '#/').slice(1), p = h.split('?');
  return { parts: p[0].split('/').filter(Boolean), q: new URLSearchParams(p[1] || '') };
}
function go(h) { if (location.hash === h) render(); else location.hash = h; }

function renderHeader() {
  const h = $('#hdr');
  if (!S.akun) { h.hidden = true; return; }
  h.hidden = false;
  h.innerHTML = '<div class="ttl">Data 7 Kebiasaan<small>' + esc(S.akun.nama) + ' · ' + esc(S.akun.role === 'siswa' ? 'Siswa ' + (S.akun.kelas || '') : S.akun.role === 'guru' ? 'Guru' : 'Admin') + '</small></div>' +
    '<span class="chip" id="stat"></span><button class="btn sm" data-aksi="menu" aria-label="Menu">☰</button><div class="menu" id="menu" hidden></div>';
  updateStatus(Sync.st);
}
function updateStatus(st) {
  const el = $('#stat'); if (!el) return;
  const on = navigator.onLine;
  el.innerHTML = '<span class="dot ' + (on ? 'on' : '') + '"></span>' + (on ? 'Online' : 'Offline') +
    (st.berjalan ? ' · menyinkronkan…' : '') + ' · ' + st.antre + ' antre' + (st.gagal ? ' · ' + st.gagal + ' gagal' : '');
}
async function bukaMenu() {
  const m = $('#menu'); if (!m.hidden) { m.hidden = true; return; }
  const q = await Repo.queueAll();
  m.innerHTML = '<button data-aksi="sync">Sinkronkan sekarang</button><button data-aksi="diag">Diagnostik sinkronisasi</button>' +
    '<button data-aksi="ganti">Ganti ' + (S.akun.role === 'siswa' ? 'PIN' : 'password') + '</button>' +
    '<button data-aksi="cadangan">Cadangan data perangkat</button>' +
    '<button data-aksi="bersih"' + (q.length ? ' disabled title="Aktif bila antrean kosong"' : '') + '>Bersihkan data perangkat ini</button>' +
    '<button data-aksi="keluar">Keluar</button>';
  m.hidden = false;
}

async function render() {
  S.akun = await Auth.akunAktif();
  renderHeader();
  const main = $('#main');
  if (!S.akun) return viewLogin(main);
  if (S.akun.pin_wajib_ganti) return viewGanti(main, true);
  await loadRef();
  const r = rute(), role = S.akun.role, p0 = r.parts[0];
  if (p0 === 'diag') return viewDiag(main);
  if (p0 === 'ganti') return viewGanti(main, false);
  if (role === 'siswa') return p0 === 'riwayat' ? viewRiwayat(main, r.parts[1]) : viewIsi(main, r.q.get('t'));
  if (role === 'guru') return viewGuru(main, r.parts[0] === 'guru' ? r.parts[1] : null, r.q.get('t'));
  return viewAdmin(main, p0 === 'admin' ? r.parts[1] : null, r.parts[2]);
}

// ---------- login ----------
let loginJenis = 'siswa', rahasiaSementara = '';
function viewLogin(main) {
  const sis = loginJenis === 'siswa';
  main.innerHTML = '<div class="card"><h2>Masuk</h2>' + (S.flash ? '<div class="note err">' + esc(S.flash) + '</div>' : '') +
    '<div class="tabs"><button class="tab ' + (sis ? 'on' : '') + '" data-aksi="jenis" data-v="siswa">Siswa</button>' +
    '<button class="tab ' + (!sis ? 'on' : '') + '" data-aksi="jenis" data-v="staf">Guru / Admin</button></div>' +
    '<form data-form="login" autocomplete="off">' +
    (sis ? '<label class="lbl" for="f_id">NISN</label><input id="f_id" inputmode="numeric" pattern="\\d{10}" maxlength="10" required>' +
      '<label class="lbl" for="f_rh">PIN (6 digit)</label><input id="f_rh" type="password" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="current-password">'
      : '<label class="lbl" for="f_id">Username</label><input id="f_id" autocapitalize="none" required>' +
        '<label class="lbl" for="f_rh">Password</label><input id="f_rh" type="password" required autocomplete="current-password">') +
    '<button class="btn pri block" type="submit">Masuk</button></form>' +
    '<p class="muted">Login pertama di perangkat ini wajib online. Setelah itu aplikasi dapat dibuka offline.</p></div>';
  S.flash = '';
}
async function doLogin(form) {
  const ident = form.querySelector('#f_id').value.trim(), secret = form.querySelector('#f_rh').value;
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    try {
      if (!navigator.onLine) throw new ApiError('JARINGAN', 'offline');
      await Auth.loginOnline(loginJenis, ident, secret);
    } catch (e) {
      if (e.kode !== 'JARINGAN') throw e;
      await Auth.loginOffline(loginJenis, ident, secret);
    }
    rahasiaSementara = secret; location.hash = '#/';
    await render(); Sync.run();
  } catch (e) { toast(apiErr(e), true); btn.disabled = false; }
}

// ---------- ganti PIN / password ----------
function viewGanti(main, wajib) {
  const sis = S.akun.role === 'siswa', nm = sis ? 'PIN' : 'password';
  main.innerHTML = '<div class="card"><h2>Ganti ' + nm + '</h2>' +
    (wajib ? '<div class="note">Demi keamanan, Anda wajib mengganti ' + nm + ' awal sebelum melanjutkan. Perlu koneksi internet.</div>' : '') +
    '<form data-form="ganti" autocomplete="off">' +
    '<label class="lbl" for="g_lama">' + nm + ' saat ini</label><input id="g_lama" type="password" ' + (sis ? 'inputmode="numeric" maxlength="6"' : '') + ' value="' + esc(wajib ? rahasiaSementara : '') + '" required>' +
    '<label class="lbl" for="g_baru">' + nm + ' baru</label><input id="g_baru" type="password" ' + (sis ? 'inputmode="numeric" pattern="\\d{6}" maxlength="6"' : 'minlength="8"') + ' required>' +
    '<label class="lbl" for="g_ulang">Ulangi ' + nm + ' baru</label><input id="g_ulang" type="password" ' + (sis ? 'inputmode="numeric" maxlength="6"' : '') + ' required>' +
    '<p class="muted">' + (sis ? 'PIN 6 digit angka, tidak boleh mudah ditebak (mis. 123456).' : 'Minimal 8 karakter, mengandung huruf dan angka.') + '</p>' +
    '<div class="row"><button class="btn pri grow" type="submit">Simpan</button>' + (wajib ? '<button class="btn" type="button" data-aksi="keluar">Keluar</button>' : '<a class="btn" href="#/">Batal</a>') + '</div></form></div>';
}
async function doGanti(form) {
  const lama = form.querySelector('#g_lama').value, baru = form.querySelector('#g_baru').value, ulang = form.querySelector('#g_ulang').value;
  const sis = S.akun.role === 'siswa';
  if (baru !== ulang) return toast('Konfirmasi tidak sama', true);
  if (!navigator.onLine) return toast('Ganti ' + (sis ? 'PIN' : 'password') + ' hanya bisa saat online', true);
  if (!S.akun.token) return toast('Sesi berakhir. Keluar lalu login ulang secara online.', true);
  try {
    if (sis) await API.post('gantiPin', S.akun.token, { pin_lama: lama, pin_baru: baru });
    else await API.post('gantiPassword', S.akun.token, { password_lama: lama, password_baru: baru });
    S.akun.pin_wajib_ganti = false;
    S.akun.verifier = await Auth.verifier(baru, S.akun.id);
    await Auth.simpanAkun(S.akun); rahasiaSementara = '';
    toast('Berhasil diganti'); location.hash = '#/'; await render(); Sync.run();
  } catch (e) { toast(apiErr(e), true); }
}

// ---------- pengumuman ----------
function bannerHtml() {
  const n = todayStr();
  const list = S.pengumuman.filter(p => !p.dibaca && p.tayang <= n && (!p.kedaluwarsa || p.kedaluwarsa >= n));
  return list.map(p => '<div class="note"><b>' + esc(p.judul) + '</b><br>' + esc(p.isi).replace(/\n/g, '<br>') +
    '<div class="row end"><button class="btn sm" data-aksi="baca" data-id="' + esc(p.id) + '">Tandai dibaca</button></div></div>').join('');
}

// ---------- formulir dinamis ----------
function formHtml(t, rec, ro) {
  const A = aktifKonfig(t), dis = ro ? ' disabled' : '', v = k => esc(rec ? (rec[k] || '') : ''), ek = k => esc(rec && rec.ekstra ? (rec.ekstra[k] || '') : '');
  const req = c => c.wajib ? '<span class="req" title="Wajib">*</span>' : '';
  let h = '';
  A.forEach(c => {
    const L = '<label class="lbl">' + esc(c.label) + req(c) + '</label>';
    switch (c.kunci) {
      case 'jam_bangun': case 'jam_tidur':
        h += '<div>' + L + '<input type="time" name="' + c.kunci + '" value="' + v(c.kunci) + '"' + dis + '></div>'; break;
      case 'sholat':
        h += '<div class="card"><div class="lbl" style="margin-top:0">' + esc(c.label) + '</div>' + SHOLAT.map(s => {
          const on = rec && rec['sholat_' + s[0]] === '1';
          return '<div class="sholat"><label><input type="checkbox" name="sholat_' + s[0] + '" data-sholat="' + s[0] + '"' + (on ? ' checked' : '') + dis + '>' + esc(s[1]) + '</label>' +
            '<select name="ket_' + s[0] + '"' + (on ? '' : ' hidden') + dis + '><option value="">—</option><option value="jamaah"' + (rec && rec['ket_' + s[0]] === 'jamaah' ? ' selected' : '') + '>Berjamaah</option><option value="sendiri"' + (rec && rec['ket_' + s[0]] === 'sendiri' ? ' selected' : '') + '>Sendiri</option></select></div>';
        }).join('') + '</div>'; break;
      case 'olahraga':
        h += '<div>' + L + '<input name="olahraga_kegiatan" maxlength="200" placeholder="Kegiatan, mis. lari pagi" value="' + v('olahraga_kegiatan') + '"' + dis + '>' +
          '<input name="olahraga_menit" type="number" min="0" max="600" inputmode="numeric" placeholder="Durasi (menit)" style="margin-top:.4rem" value="' + v('olahraga_menit') + '"' + dis + '></div>'; break;
      case 'makan':
        h += '<div>' + L + [['makan_sarapan', 'Sarapan'], ['makan_siang', 'Makan siang'], ['makan_malam', 'Makan malam']].map(m =>
          '<input name="' + m[0] + '" maxlength="200" placeholder="' + m[1] + '" style="margin-bottom:.4rem" value="' + v(m[0]) + '"' + dis + '>').join('') + '</div>'; break;
      case 'materi_belajar': case 'aksi_masyarakat':
        h += '<div>' + L + '<textarea name="' + c.kunci + '" maxlength="500"' + dis + '>' + v(c.kunci) + '</textarea></div>'; break;
      case 'puasa': case 'tarawih':
        h += '<div class="sholat"><label><input type="checkbox" name="ekstra_' + c.kunci + '"' + (rec && rec.ekstra && rec.ekstra[c.kunci] === '1' ? ' checked' : '') + dis + '>' + esc(c.label) + req(c) + '</label></div>'; break;
      case 'tadarus':
        h += '<div>' + L + '<input name="ekstra_tadarus" maxlength="200" placeholder="Juz / halaman" value="' + ek('tadarus') + '"' + dis + '></div>'; break;
    }
  });
  return h || '<p class="muted">Tidak ada kolom aktif.</p>';
}
function collectForm(root, A) {
  const f = {}; ['jam_bangun', 'jam_tidur', 'olahraga_kegiatan', 'olahraga_menit', 'makan_sarapan', 'makan_siang', 'makan_malam', 'materi_belajar', 'aksi_masyarakat'].forEach(k => { f[k] = ''; });
  SHOLAT.forEach(s => { f['sholat_' + s[0]] = ''; f['ket_' + s[0]] = ''; });
  f.ekstra = {};
  const val = n => { const el = root.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
  const has = k => A.some(c => c.kunci === k);
  if (has('jam_bangun')) f.jam_bangun = val('jam_bangun');
  if (has('jam_tidur')) f.jam_tidur = val('jam_tidur');
  if (has('sholat')) SHOLAT.forEach(s => {
    const on = root.querySelector('[name="sholat_' + s[0] + '"]').checked;
    f['sholat_' + s[0]] = on ? '1' : '0'; f['ket_' + s[0]] = on ? val('ket_' + s[0]) : '';
  });
  if (has('olahraga')) { f.olahraga_kegiatan = val('olahraga_kegiatan'); f.olahraga_menit = val('olahraga_menit'); }
  if (has('makan')) { f.makan_sarapan = val('makan_sarapan'); f.makan_siang = val('makan_siang'); f.makan_malam = val('makan_malam'); }
  if (has('materi_belajar')) f.materi_belajar = val('materi_belajar');
  if (has('aksi_masyarakat')) f.aksi_masyarakat = val('aksi_masyarakat');
  ['puasa', 'tarawih'].forEach(k => { if (has(k)) f.ekstra[k] = root.querySelector('[name="ekstra_' + k + '"]').checked ? '1' : '0'; });
  if (has('tadarus')) f.ekstra.tadarus = val('ekstra_tadarus');
  return f;
}
function validasiForm(f, A) {
  const w = k => { const c = A.find(x => x.kunci === k); return c && c.wajib; };
  const lbl = k => (A.find(x => x.kunci === k) || {}).label || k;
  for (const k of ['jam_bangun', 'jam_tidur']) {
    if (!A.some(c => c.kunci === k)) continue;
    if (!f[k]) { if (w(k)) return 'Kolom wajib diisi: ' + lbl(k); } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f[k])) return 'Format jam tidak valid';
  }
  if (A.some(c => c.kunci === 'olahraga')) {
    if (!f.olahraga_kegiatan && w('olahraga')) return 'Kolom wajib diisi: ' + lbl('olahraga');
    if (f.olahraga_menit !== '' && (!/^\d+$/.test(f.olahraga_menit) || +f.olahraga_menit > 600)) return 'Durasi olahraga harus 0-600 menit';
  }
  if (A.some(c => c.kunci === 'makan') && w('makan') && (!f.makan_sarapan || !f.makan_siang || !f.makan_malam)) return 'Sarapan, makan siang, dan makan malam wajib diisi';
  for (const k of ['materi_belajar', 'aksi_masyarakat']) if (A.some(c => c.kunci === k) && w(k) && !f[k]) return 'Kolom wajib diisi: ' + lbl(k);
  if (A.some(c => c.kunci === 'tadarus') && w('tadarus') && !f.ekstra.tadarus) return 'Kolom wajib diisi: ' + lbl('tadarus');
  return '';
}

// ---------- siswa ----------
function navSiswa(aktif) {
  return '<div class="tabs"><a class="tab ' + (aktif === 'isi' ? 'on' : '') + '" href="#/">Isi kebiasaan</a><a class="tab ' + (aktif === 'riwayat' ? 'on' : '') + '" href="#/riwayat">Riwayat</a></div>';
}
async function viewIsi(main, t) {
  const n = todayStr(), hariBoleh = []; for (let i = 0; i <= batasEdit(); i++) hariBoleh.push(addDays(n, -i));
  if (!t || hariBoleh.indexOf(t) < 0) t = n;
  const rec = await Repo.getEntri(S.akun.id, S.akun.username, t);
  main.innerHTML = navSiswa('isi') + bannerHtml() +
    '<div class="tabs">' + hariBoleh.map((d, i) => '<a class="tab ' + (d === t ? 'on' : '') + '" href="#/?t=' + d + '">' + (i === 0 ? 'Hari ini' : i === 1 ? 'Kemarin' : d) + '</a>').join('') + '</div>' +
    '<div class="card"><div class="row"><h2 class="grow">' + esc(fmtTgl(t)) + '</h2>' + (rec ? badgeSync(rec) : '<span class="badge b-wait">Belum diisi</span>') + '</div>' +
    (isLibur(t) ? '<div class="note ok">Hari libur: boleh tetap diisi, tidak dihitung sebagai "belum mengisi".</div>' : '') +
    (rec && rec.sync_status === 'error' ? '<div class="note err">Ditolak server: ' + esc(rec.error) + '. Perbaiki lalu simpan lagi.</div>' : '') +
    '<form id="frm" data-form="simpan" data-t="' + esc(t) + '">' + formHtml(t, rec, false) +
    '<button class="btn pri block" type="submit">Simpan</button></form>' +
    '<p class="muted">Disimpan di perangkat dan dikirim otomatis saat online. Data tanggal sebelumnya hanya bisa dilihat.</p></div>';
}
async function simpanForm(form) {
  const t = form.dataset.t;
  if (!bisaEdit(t)) return toast('Tanggal ini sudah melewati batas edit', true);
  const A = aktifKonfig(t), f = collectForm(form, A), err = validasiForm(f, A);
  if (err) return toast(err, true);
  f.versi_config = S.config.versi; f.diedit_tanggal = todayStr();
  await Repo.saveEntri(S.akun.id, S.akun.username, t, f);
  await Sync.hitungAntre();
  toast(navigator.onLine ? 'Tersimpan. Menyinkronkan…' : 'Tersimpan di perangkat. Akan dikirim saat online.');
  Sync.run().then(() => { if (rute().parts.length === 0) render(); });
  render();
}
function ringkasEntri(r) {
  const s = SHOLAT.filter(x => r['sholat_' + x[0]] === '1').length;
  return 'Sholat ' + s + '/5' + (r.jam_bangun ? ' · bangun ' + r.jam_bangun : '') + (r.jam_tidur ? ' · tidur ' + r.jam_tidur : '') +
    (+r.olahraga_menit > 0 ? ' · olahraga ' + r.olahraga_menit + ' mnt' : '');
}
function detailEntri(r) {
  const kv = (k, v) => v ? '<b>' + esc(k) + '</b><span>' + esc(v) + '</span>' : '';
  const sh = SHOLAT.map(x => r['sholat_' + x[0]] === '1' ? x[1] + (r['ket_' + x[0]] ? ' (' + (r['ket_' + x[0]] === 'jamaah' ? 'berjamaah' : 'sendiri') + ')' : '') : '').filter(Boolean).join(', ');
  const ek = r.ekstra || {};
  return '<div class="kv">' + kv(labelOf('jam_bangun'), r.jam_bangun) + kv(labelOf('jam_tidur'), r.jam_tidur) + kv(labelOf('sholat'), sh) +
    kv(labelOf('olahraga'), r.olahraga_kegiatan ? r.olahraga_kegiatan + (r.olahraga_menit ? ' (' + r.olahraga_menit + ' menit)' : '') : '') +
    kv('Sarapan', r.makan_sarapan) + kv('Makan siang', r.makan_siang) + kv('Makan malam', r.makan_malam) +
    kv(labelOf('materi_belajar'), r.materi_belajar) + kv(labelOf('aksi_masyarakat'), r.aksi_masyarakat) +
    (ek.puasa ? kv(labelOf('puasa'), ek.puasa === '1' ? 'Ya' : 'Tidak') : '') + (ek.tarawih ? kv(labelOf('tarawih'), ek.tarawih === '1' ? 'Ya' : 'Tidak') : '') + kv(labelOf('tadarus'), ek.tadarus) + '</div>';
}
async function viewRiwayat(main, t) {
  const list = await Repo.listEntri(S.akun.id, S.akun.username);
  if (t) {
    const r = list.find(x => x.tanggal === t);
    main.innerHTML = navSiswa('riwayat') + '<div class="card"><div class="row"><h2 class="grow">' + esc(fmtTgl(t)) + '</h2>' + (r ? badgeSync(r) : '') + '</div>' +
      (r ? detailEntri(r) : '<p class="muted">Tidak ada entri.</p>') + '<div class="row" style="margin-top:.8rem"><a class="btn" href="#/riwayat">Kembali</a>' +
      (bisaEdit(t) ? '<a class="btn pri" href="#/?t=' + esc(t) + '">Edit</a>' : '') + '</div></div>';
    return;
  }
  main.innerHTML = navSiswa('riwayat') + '<div class="card"><h2>Riwayat (' + list.length + ')</h2>' +
    (list.slice(0, 90).map(r => '<div class="item"><a href="#/riwayat/' + esc(r.tanggal) + '"><b>' + esc(fmtTgl(r.tanggal)) + '</b><br><small class="muted">' + esc(ringkasEntri(r)) + '</small></a>' + badgeSync(r) + '</div>').join('') ||
      '<p class="muted">Belum ada entri.</p>') + '</div>';
}

// ---------- guru ----------
const jamKeMenit = s => /^\d\d:\d\d$/.test(s || '') ? +s.slice(0, 2) * 60 + +s.slice(3) : null;
function rataJam(list, tidur) {
  const v = list.map(jamKeMenit).filter(x => x !== null).map(m => (tidur && m < 720) ? m + 1440 : m);
  if (!v.length) return '–';
  const a = Math.round(v.reduce((x, y) => x + y, 0) / v.length) % 1440;
  return pad(Math.floor(a / 60)) + ':' + pad(a % 60);
}
function ringkasanMingguan(recs, akhir) {
  const hari = []; for (let i = 6; i >= 0; i--) hari.push(addDays(akhir, -i));
  const kerja = hari.filter(d => !isLibur(d)), ent = recs.filter(r => hari.indexOf(r.tanggal) >= 0);
  const entKerja = ent.filter(r => kerja.indexOf(r.tanggal) >= 0);
  const tick = ent.reduce((s, r) => s + SHOLAT.filter(x => r['sholat_' + x[0]] === '1').length, 0);
  return {
    awal: hari[0], akhir: akhir, terisi: entKerja.length, hariKerja: kerja.length,
    sholatPersen: ent.length ? Math.round(1000 * tick / (5 * ent.length)) / 10 : null,
    rataTidur: rataJam(ent.map(r => r.jam_tidur), true), rataBangun: rataJam(ent.map(r => r.jam_bangun), false),
    hariOlahraga: ent.filter(r => +r.olahraga_menit > 0 || r.olahraga_kegiatan).length
  };
}
let guruFilter = { cari: '', kelas: '' };
async function viewGuru(main, nisn, t) {
  const siswa = (await DB.byIndex('users', 'owner_id', S.akun.id)).filter(s => s.role === 'siswa').sort((a, b) => a.nama.localeCompare(b.nama));
  if (nisn) return viewGuruDetail(main, siswa.find(s => s.username === nisn), t);
  const n = todayStr(), libur = isLibur(n), sudah = new Set();
  for (const s of siswa) if (await Repo.getEntri(S.akun.id, s.username, n)) sudah.add(s.username);
  const kelas = [...new Set(siswa.map(s => s.kelas))].sort();
  main.innerHTML = bannerHtml() + '<div class="card"><h2>Siswa bimbingan (' + siswa.length + ')</h2>' +
    '<div class="row"><input id="gCari" class="grow" placeholder="Cari nama / NISN" value="' + esc(guruFilter.cari) + '"><select id="gKelas" style="width:9rem"><option value="">Semua kelas</option>' +
    kelas.map(k => '<option' + (k === guruFilter.kelas ? ' selected' : '') + '>' + esc(k) + '</option>').join('') + '</select></div>' +
    (libur ? '<div class="note ok">Hari ini libur: tidak ada penanda "belum mengisi".</div>' : '') +
    '<div id="gList"></div></div>';
  main._guru = { siswa: siswa, sudah: sudah, libur: libur };
  isiListGuru(main);
}
function isiListGuru(main) {
  const g = main._guru; if (!g) return;
  const c = guruFilter.cari.toLowerCase();
  const rows = g.siswa.filter(s => (!guruFilter.kelas || s.kelas === guruFilter.kelas) && (!c || (s.nama + ' ' + s.username).toLowerCase().indexOf(c) >= 0));
  $('#gList').innerHTML = rows.map(s => '<div class="item"><a href="#/guru/' + esc(s.username) + '"><b>' + esc(s.nama) + '</b><br><small class="muted">' + esc(s.username) + ' · ' + esc(s.kelas) + (s.aktif ? '' : ' · nonaktif') + '</small></a>' +
    (g.libur ? '' : g.sudah.has(s.username) ? '<span class="badge b-ok">Sudah mengisi</span>' : '<span class="badge b-wait">Belum mengisi</span>') + '</div>').join('') || '<p class="muted">Tidak ada siswa.</p>';
}
async function viewGuruDetail(main, s, t) {
  if (!s) { main.innerHTML = '<div class="card"><p>Siswa tidak ditemukan.</p><a class="btn" href="#/guru">Kembali</a></div>'; return; }
  const n = todayStr(); if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t) || t > n) t = n;
  const recs = await Repo.listEntri(S.akun.id, s.username), r = recs.find(x => x.tanggal === t), m = ringkasanMingguan(recs, t);
  main.innerHTML = '<div class="card"><div class="row"><a class="btn sm" href="#/guru">← Kembali</a><h2 class="grow" style="margin:0">' + esc(s.nama) + '</h2></div>' +
    '<p class="muted">' + esc(s.username) + ' · ' + esc(s.kelas) + '</p>' +
    '<div class="row"><button class="btn sm" data-aksi="lihatPin" data-nisn="' + esc(s.username) + '">Lihat PIN awal</button><button class="btn sm" data-aksi="resetPin" data-nisn="' + esc(s.username) + '">Reset PIN</button></div></div>' +
    '<div class="card"><h3>Ringkasan 7 hari (' + esc(m.awal) + ' s.d. ' + esc(m.akhir) + ')</h3><div class="stat">' +
    '<div><strong>' + (m.sholatPersen == null ? '–' : m.sholatPersen + '%') + '</strong>Sholat 5 waktu</div><div><strong>' + m.terisi + '/' + m.hariKerja + '</strong>Hari kerja terisi</div>' +
    '<div><strong>' + esc(m.rataTidur) + '</strong>Rata-rata tidur</div><div><strong>' + esc(m.rataBangun) + '</strong>Rata-rata bangun</div><div><strong>' + m.hariOlahraga + '</strong>Hari olahraga</div></div></div>' +
    '<div class="card"><div class="row"><input type="date" id="gTgl" class="grow" max="' + esc(n) + '" value="' + esc(t) + '"></div>' +
    '<h3 style="margin-top:.7rem">' + esc(fmtTgl(t)) + '</h3>' + (r ? detailEntri(r) : '<p class="muted">' + (isLibur(t) ? 'Hari libur.' : 'Belum mengisi.') + '</p>') + '</div>' +
    '<div class="card"><h3>Entri terakhir</h3>' + (recs.slice(0, 14).map(x => '<div class="item"><a href="#/guru/' + esc(s.username) + '?t=' + esc(x.tanggal) + '"><b>' + esc(fmtTgl(x.tanggal)) + '</b><br><small class="muted">' + esc(ringkasEntri(x)) + '</small></a></div>').join('') || '<p class="muted">Belum ada data.</p>') + '</div>';
}

// ---------- admin (kerangka; modul diisi Tahap 4 & 5) ----------
async function viewAdmin(main, id, arg) {
  const mods = [...AdminModules].sort((a, b) => (a.order || 50) - (b.order || 50));
  if (!id && mods.length) id = mods[0].id;
  const tabs = '<div class="tabs">' + mods.map(m => '<a class="tab ' + (id === m.id ? 'on' : '') + '" href="#/admin/' + esc(m.id) + '">' + esc(m.label) + '</a>').join('') + '</div>';
  const mod = mods.find(m => m.id === id);
  if (!mod) { main.innerHTML = bannerHtml() + '<div class="card"><h2>Admin</h2><p>Selamat datang, ' + esc(S.akun.nama) + '.</p><div class="note">Modul pengelolaan belum dimuat.</div></div>'; return; }
  main.innerHTML = tabs + '<div id="adminRoot"></div>';
  await mod.render($('#adminRoot'), arg);
}

// ---------- diagnostik ----------
async function viewDiag(main) {
  const q = await Repo.queueAll(), semua = await Auth.semuaAkun(), nm = {}; semua.forEach(a => { nm[a.id] = a; });
  const g = await DB.get('meta', 'galatTerakhir');
  const rows = [];
  for (const it of q.sort((a, b) => a.dibuat - b.dibuat)) {
    const rec = await DB.get('kebiasaan', it.rid);
    rows.push('<tr><td>' + esc(rec ? rec.tanggal : '?') + '</td><td>' + esc(nm[it.owner_id] ? nm[it.owner_id].username : it.owner_id) + '</td><td>' + esc(it.status) + '</td><td>' + (it.percobaan || 0) + '</td><td>' + esc(it.error_terakhir) + '</td></tr>');
  }
  const perluLogin = semua.filter(a => !a.token && q.some(i => i.owner_id === a.id));
  main.innerHTML = '<div class="card"><h2>Diagnostik sinkronisasi</h2><div class="kv"><b>Koneksi</b><span>' + (navigator.onLine ? 'Online' : 'Offline') + '</span>' +
    '<b>Sync terakhir</b><span>' + esc(fmtWaktu(Sync.st.terakhir)) + '</span><b>Antrean</b><span>' + Sync.st.antre + ' menunggu, ' + Sync.st.gagal + ' gagal</span>' +
    '<b>Galat terakhir</b><span>' + (g ? esc(g.value.pesan) + ' (' + esc(fmtWaktu(g.value.waktu)) + ')' : '–') + '</span></div>' +
    (perluLogin.length ? '<div class="note err">Perlu login online untuk mengirim data akun: ' + esc(perluLogin.map(a => a.username).join(', ')) + '</div>' : '') +
    '<div class="row" style="margin-top:.7rem"><button class="btn pri" data-aksi="sync">Sinkronkan sekarang</button><button class="btn" data-aksi="ulangi">Ulangi yang gagal</button><a class="btn" href="#/">Kembali</a></div></div>' +
    '<div class="card"><h3>Antrean (' + q.length + ')</h3>' + (rows.length ? '<div style="overflow-x:auto"><table><tr><th>Tanggal</th><th>Akun</th><th>Status</th><th>Coba</th><th>Galat</th></tr>' + rows.join('') + '</table></div>' : '<p class="muted">Antrean kosong.</p>') + '</div>';
}

// ---------- aksi klik / form ----------
async function keluar() {
  const a = S.akun, q = a ? await Repo.queueByOwner(a.id) : [];
  if (q.length && !confirm('Ada ' + q.length + ' data belum tersinkron. Data tetap aman di perangkat dan akan dikirim saat online. Tetap keluar?')) return;
  if (a && !q.length && navigator.onLine && a.token) { try { await API.post('logout', a.token); } catch (e) { /* abaikan */ } a.token = ''; await Auth.simpanAkun(a); }
  await Auth.setAktif(null); rahasiaSementara = ''; location.hash = ''; render();
}
async function bersih() {
  const q = await Repo.queueAll();
  if (q.length) return toast('Masih ada data belum tersinkron', true);
  if (!confirm('Hapus SEMUA data aplikasi di perangkat ini (termasuk akun tersimpan untuk login offline)?')) return;
  await DB.reset(); location.reload();
}
async function aksiPin(jenis, nisn) {
  if (!navigator.onLine) return toast('Hanya bisa saat online', true);
  if (jenis === 'reset' && !confirm('Reset PIN siswa ini? PIN lama tidak berlaku dan siswa wajib menggantinya.')) return;
  try {
    const d = await API.post(jenis === 'reset' ? 'resetPin' : 'lihatPinAwal', S.akun.token, { nisn: nisn });
    dialog('<h3>' + (jenis === 'reset' ? 'PIN sementara' : 'PIN awal') + '</h3><div class="big">' + esc(d.pin_sementara || d.pin) + '</div><p class="muted">Bagikan ke siswa ' + esc(nisn) + '. ' + (jenis === 'reset' ? 'Siswa wajib menggantinya saat login.' : 'PIN ini hanya ditampilkan sekali.') + '</p>');
  } catch (e) { toast(apiErr(e), true); }
}
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-aksi]');
  const menu = $('#menu'); if (menu && !menu.hidden && !ev.target.closest('#menu') && !(el && el.dataset.aksi === 'menu')) menu.hidden = true;
  if (!el) return;
  const a = el.dataset.aksi; if (menu) menu.hidden = true;
  try {
    if (a === 'menu') bukaMenu();
    else if (a === 'jenis') { loginJenis = el.dataset.v; render(); }
    else if (a === 'sync') { toast('Menyinkronkan…'); const r = await Sync.run(); if (r.dilewati) toast('Perangkat offline', true); else toast(Sync.st.galat ? 'Gagal: ' + Sync.st.galat : 'Sinkronisasi selesai', !!Sync.st.galat); render(); }
    else if (a === 'diag') go('#/diag');
    else if (a === 'ganti') go('#/ganti');
    else if (a === 'keluar') keluar();
    else if (a === 'bersih') bersih();
    else if (a === 'cadangan') { if (typeof bukaCadangan === 'function') bukaCadangan(); }
    else if (a === 'ulangi') { const n = await Repo.ulangiGagal(); toast(n + ' entri dijadwalkan ulang'); await Sync.hitungAntre(); Sync.run().then(render); render(); }
    else if (a === 'baca') {
      const p = S.pengumuman.find(x => x.id === el.dataset.id);
      if (p) { p.dibaca = true; p.dibaca_sinkron = false; await DB.put('pengumuman', p); render(); Sync.run(); }
    }
    else if (a === 'lihatPin') aksiPin('lihat', el.dataset.nisn);
    else if (a === 'resetPin') aksiPin('reset', el.dataset.nisn);
    else if (a === 'tutupDialog') $('#dlg').close();
  } catch (e) { toast(apiErr(e), true); }
});
document.addEventListener('submit', ev => {
  const f = ev.target.closest('form[data-form]'); if (!f) return;
  ev.preventDefault();
  const k = f.dataset.form;
  if (k === 'login') doLogin(f); else if (k === 'ganti') doGanti(f); else if (k === 'simpan') simpanForm(f);
});
document.addEventListener('change', ev => {
  const c = ev.target;
  if (c.dataset && c.dataset.sholat) { const sel = document.querySelector('[name="ket_' + c.dataset.sholat + '"]'); if (sel) { sel.hidden = !c.checked; if (!c.checked) sel.value = ''; } }
  if (c.id === 'gTgl') { const p = rute(); location.hash = '#/guru/' + p.parts[1] + '?t=' + c.value; }
  if (c.id === 'gKelas') { guruFilter.kelas = c.value; isiListGuru($('#main')); }
});
document.addEventListener('input', ev => { if (ev.target.id === 'gCari') { guruFilter.cari = ev.target.value; isiListGuru($('#main')); } });
window.addEventListener('hashchange', render);

// ---------- boot ----------
async function boot() {
  try {
    await DB.open();
    Sync.api.onPaksaLogout = async msg => { await Auth.setAktif(null); S.flash = msg; location.hash = ''; await render(); };
    Sync.api.onGantiKredensial = () => render();
    Sync.api.onSelesai = () => { if (S.akun && !document.querySelector('#main form')) render(); }; // jangan merender ulang saat ada formulir terbuka
    Sync.subscribe(updateStatus);
    await render();
    await Sync.start();
    if ('serviceWorker' in navigator) {
      let sudahAda = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (sudahAda) toast('Versi baru aplikasi terpasang. Muat ulang halaman untuk memakainya.'); sudahAda = true; });
      navigator.serviceWorker.register('sw.js').catch(() => { /* tanpa SW aplikasi tetap jalan online */ });
    }
  } catch (e) {
    $('#main').innerHTML = '<div class="card"><div class="note err">Gagal memulai aplikasi: ' + esc(e.message) + '</div></div>';
  }
}
if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot); // setelah modul admin terdaftar
