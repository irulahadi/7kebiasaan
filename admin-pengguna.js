/* admin-pengguna.js — Tahap 4: Manajemen Pengguna, Impor Massal, Mapping Guru-Siswa, Log Aktivitas.
 * Semua aksi tulis online-only (ditegakkan juga di server). Data pengguna & mapping di-cache di IndexedDB
 * hanya untuk tampilan offline. Bergantung pada app.js (S, esc, toast, dialog, aksiPin, AdminModules) dan auth.js/db.js. */
(function () {
  'use strict';
  const online = () => navigator.onLine && S.akun && S.akun.token;

  async function adm(aksi, data) {
    if (!navigator.onLine) throw new Error('Aksi ini hanya bisa dilakukan saat online');
    if (!S.akun.token) throw new Error('Sesi berakhir. Keluar lalu login ulang secara online.');
    try { return await API.post(aksi, S.akun.token, data); }
    catch (e) {
      if (e.kode === 'TOKEN_INVALID' && Sync.api.onPaksaLogout) {
        S.akun.token = ''; await Auth.simpanAkun(S.akun);
        await Sync.api.onPaksaLogout('Sesi berakhir. Silakan login ulang.');
      }
      throw e;
    }
  }
  const pesan = e => (e && e.message) || 'Terjadi kesalahan';

  // ---------- cache ----------
  const usersCache = () => DB.byIndex('users', 'owner_id', S.akun.id);
  async function simpanUsers(list) {
    const o = S.akun.id;
    await DB.tx(['users'], 'readwrite', async t => {
      await DB.delOwner(t, 'users', o);
      for (const u of list) await DB.rq(t.objectStore('users').put(Object.assign({ rid: o + ':' + u.id, owner_id: o }, u)));
    });
  }
  async function mappingCache() { const m = await DB.get('meta', 'mapping:' + S.akun.id); return m ? m.value : []; }
  const simpanMapping = list => DB.put('meta', { key: 'mapping:' + S.akun.id, value: list });

  // ====================================================== PENGGUNA ======================================================
  const F = { cari: '', peran: '', kelas: '', aktif: '', batas: 100 };
  let U = [], rootP = null;

  function badgeUser(u) {
    return (u.aktif ? '' : ' <span class="badge b-err">Nonaktif</span>') + (u.terkunci ? ' <span class="badge b-wait">Terkunci</span>' : '') +
      (u.pin_wajib_ganti ? ' <span class="badge b-wait">Wajib ganti</span>' : '');
  }
  function barisUser(u) {
    const sis = u.role === 'siswa', tombol = [
      '<button class="btn sm" data-adm="ubah" data-id="' + esc(u.id) + '">Ubah</button>',
      '<button class="btn sm" data-adm="aktif" data-id="' + esc(u.id) + '" data-v="' + (u.aktif ? '0' : '1') + '">' + (u.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button>',
      sis ? '<button class="btn sm" data-adm="resetPin" data-nisn="' + esc(u.username) + '">Reset PIN</button>' : '<button class="btn sm" data-adm="resetPw" data-id="' + esc(u.id) + '">Reset password</button>',
      sis && u.pin_awal_tersedia ? '<button class="btn sm" data-adm="lihatPin" data-nisn="' + esc(u.username) + '">Lihat PIN awal</button>' : ''
    ].join('');
    return '<div class="item" style="align-items:flex-start"><div class="grow"><b>' + esc(u.nama) + '</b>' + badgeUser(u) + '<br><small class="muted">' + esc(u.username) + ' · ' +
      esc(u.role) + (u.kelas ? ' · ' + esc(u.kelas) : '') + '</small><div class="row" style="margin-top:.35rem">' + tombol + '</div></div></div>';
  }
  function saring() {
    const c = F.cari.toLowerCase();
    return U.filter(u => (!F.peran || u.role === F.peran) && (!F.kelas || u.kelas === F.kelas) && (F.aktif === '' || (F.aktif === '1') === !!u.aktif) &&
      (!c || (u.nama + ' ' + u.username).toLowerCase().indexOf(c) >= 0)).sort((a, b) => a.role.localeCompare(b.role) || a.nama.localeCompare(b.nama));
  }
  function gambarDaftar() {
    const el = document.getElementById('uList'); if (!el) return;
    const rows = saring(), tampil = rows.slice(0, F.batas);
    el.innerHTML = '<p class="muted">' + rows.length + ' pengguna' + (rows.length > tampil.length ? ' (menampilkan ' + tampil.length + ')' : '') + '</p>' +
      (tampil.map(barisUser).join('') || '<p class="muted">Tidak ada data.</p>') +
      (rows.length > tampil.length ? '<button class="btn block" data-adm="lagi">Tampilkan lebih banyak</button>' : '');
  }
  async function segarkan(diam) {
    if (!online()) { if (!diam) toast('Offline: menampilkan data tersimpan', true); return; }
    try {
      const d = await adm('kelolaPengguna', { op: 'list' });
      U = d.pengguna; await simpanUsers(U);
      const stat = document.getElementById('uStat'); if (stat) stat.textContent = 'Diperbarui ' + new Date().toLocaleTimeString('id-ID');
      gambarKelas(); gambarDaftar();
    } catch (e) { if (!diam) toast(pesan(e), true); }
  }
  function gambarKelas() {
    const sel = document.getElementById('uKelas'); if (!sel) return;
    const ks = [...new Set(U.filter(u => u.kelas).map(u => u.kelas))].sort();
    sel.innerHTML = '<option value="">Semua kelas</option>' + ks.map(k => '<option' + (k === F.kelas ? ' selected' : '') + '>' + esc(k) + '</option>').join('');
  }
  async function renderPengguna(root) {
    rootP = root; U = await usersCache();
    root.innerHTML = '<div class="card"><div class="row"><h2 class="grow" style="margin:0">Pengguna</h2><button class="btn pri sm" data-adm="tambah">+ Tambah</button><a class="btn sm" href="#/admin/pengguna/impor">Impor massal</a></div>' +
      '<p class="muted" id="uStat">' + (online() ? 'Memuat data terbaru…' : 'Offline — data tersimpan di perangkat. Perubahan hanya bisa saat online.') + '</p>' +
      '<div class="row"><input id="uCari" class="grow" placeholder="Cari nama / NISN / username" value="' + esc(F.cari) + '">' +
      '<select id="uPeran" class="sel-sm"><option value="">Semua peran</option>' + ['siswa', 'guru', 'admin'].map(r => '<option' + (F.peran === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<select id="uKelas" class="sel-sm"></select>' +
      '<select id="uAktif" class="sel-sm"><option value="">Semua status</option><option value="1"' + (F.aktif === '1' ? ' selected' : '') + '>Aktif</option><option value="0"' + (F.aktif === '0' ? ' selected' : '') + '>Nonaktif</option></select></div>' +
      '<div id="uList"></div></div>';
    gambarKelas(); gambarDaftar();
    root.oninput = ev => { if (ev.target.id === 'uCari') { F.cari = ev.target.value; F.batas = 100; gambarDaftar(); } };
    root.onchange = ev => {
      const i = ev.target.id;
      if (i === 'uPeran') F.peran = ev.target.value; else if (i === 'uKelas') F.kelas = ev.target.value; else if (i === 'uAktif') F.aktif = ev.target.value; else return;
      F.batas = 100; gambarDaftar();
    };
    root.onclick = aksiPengguna;
    segarkan(true);
  }

  function dialogTambah() {
    dialog('<h3>Tambah pengguna</h3><form data-adm-form="tambah" autocomplete="off">' +
      '<label class="lbl">Peran</label><select id="t_role"><option value="siswa">Siswa</option><option value="guru">Guru</option><option value="admin">Admin</option></select>' +
      '<label class="lbl" id="t_idl">NISN (10 digit)</label><input id="t_id" required>' +
      '<label class="lbl">Nama lengkap</label><input id="t_nama" maxlength="100" required>' +
      '<div id="t_kw"><label class="lbl">Kelas</label><input id="t_kelas" maxlength="30"></div>' +
      '<label class="lbl" id="t_rhl">PIN awal (opsional, 6 digit)</label><input id="t_rh" autocomplete="off" placeholder="Kosongkan agar dibuat otomatis">' +
      '<button class="btn pri block" type="submit">Simpan</button></form>');
    const body = document.getElementById('dlgBody'), role = body.querySelector('#t_role');
    role.onchange = () => {
      const sis = role.value === 'siswa';
      body.querySelector('#t_idl').textContent = sis ? 'NISN (10 digit)' : 'Username (huruf kecil, angka, . _ -)';
      body.querySelector('#t_kw').hidden = !sis;
      body.querySelector('#t_rhl').textContent = sis ? 'PIN awal (opsional, 6 digit)' : 'Password awal (opsional, min. 8 karakter huruf+angka)';
    };
    body.onsubmit = async ev => {
      ev.preventDefault();
      const r = role.value, v = n => body.querySelector(n).value.trim();
      const data = { op: 'tambah', role: r, username_nisn: v('#t_id'), nama: v('#t_nama'), kelas: r === 'siswa' ? v('#t_kelas') : '' };
      if (v('#t_rh')) data[r === 'siswa' ? 'pin' : 'password'] = v('#t_rh');
      try {
        const d = await adm('kelolaPengguna', data);
        hasilRahasia(r === 'siswa' ? 'PIN awal' : 'Password awal', d.rahasia_awal, d.pengguna.username, 'Pengguna wajib menggantinya saat login pertama.');
        segarkan(true);
      } catch (e) { toast(pesan(e), true); }
    };
  }
  function hasilRahasia(judul, rahasia, untuk, catatan) {
    dialog('<h3>' + esc(judul) + '</h3>' + (rahasia ? '<div class="big">' + esc(rahasia) + '</div><p class="muted">Untuk ' + esc(untuk) + '. Catat sekarang. ' + esc(catatan || '') + '</p>' :
      '<p>Pengguna <b>' + esc(untuk) + '</b> berhasil disimpan dengan ' + esc(judul.toLowerCase()) + ' yang Anda tentukan.</p>'));
    document.getElementById('dlgBody').onsubmit = null;
  }
  function dialogUbah(u) {
    dialog('<h3>Ubah pengguna</h3><p class="muted">' + esc(u.username) + ' · ' + esc(u.role) + '</p><form data-adm-form="ubah"><label class="lbl">Nama lengkap</label>' +
      '<input id="e_nama" maxlength="100" required value="' + esc(u.nama) + '">' +
      (u.role === 'siswa' ? '<label class="lbl">Kelas</label><input id="e_kelas" maxlength="30" required value="' + esc(u.kelas) + '">' : '') +
      '<button class="btn pri block" type="submit">Simpan</button></form>');
    const body = document.getElementById('dlgBody');
    body.onsubmit = async ev => {
      ev.preventDefault();
      try {
        await adm('kelolaPengguna', { op: 'ubah', id: u.id, nama: body.querySelector('#e_nama').value.trim(), kelas: u.role === 'siswa' ? body.querySelector('#e_kelas').value.trim() : '' });
        document.getElementById('dlg').close(); toast('Tersimpan'); segarkan(true);
      } catch (e) { toast(pesan(e), true); }
    };
  }
  async function aksiPengguna(ev) {
    const b = ev.target.closest('[data-adm]'); if (!b) return;
    const a = b.dataset.adm, u = U.find(x => x.id === b.dataset.id);
    try {
      if (a === 'lagi') { F.batas += 100; gambarDaftar(); return; }
      if (a === 'tambah') { if (!online()) return toast('Hanya bisa saat online', true); return dialogTambah(); }
      if (a === 'ubah' && u) { if (!online()) return toast('Hanya bisa saat online', true); return dialogUbah(u); }
      if (a === 'aktif' && u) {
        const aktif = b.dataset.v === '1';
        if (!confirm((aktif ? 'Aktifkan' : 'Nonaktifkan') + ' ' + u.nama + '?' + (aktif ? '' : ' Sesi aktifnya akan dicabut dan sync berikutnya ditolak.'))) return;
        await adm('kelolaPengguna', { op: 'aktif', id: u.id, aktif: aktif }); toast('Status diperbarui'); return segarkan(true);
      }
      if (a === 'resetPin') { await aksiPin('reset', b.dataset.nisn); return segarkan(true); }
      if (a === 'lihatPin') { await aksiPin('lihat', b.dataset.nisn); return segarkan(true); }
      if (a === 'resetPw' && u) {
        if (!confirm('Reset password ' + u.username + '? Password lama tidak berlaku.')) return;
        const d = await adm('resetPassword', { id: u.id });
        hasilRahasia('Password sementara', d.password_sementara, d.username, 'Wajib diganti saat login pertama.'); segarkan(true);
      }
    } catch (e) { toast(pesan(e), true); }
  }

  // ====================================================== IMPOR ======================================================
  const Imp = {
    splitCsv(line, d) {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true; else if (c === d) { out.push(cur); cur = ''; } else cur += c;
      }
      out.push(cur); return out.map(s => s.trim());
    },
    alias: { nisn: 'username_nisn', username: 'username_nisn', user: 'username_nisn', nama: 'nama', namalengkap: 'nama', kelas: 'kelas', rombel: 'kelas', pin: 'pin', password: 'password', katasandi: 'password', peran: 'role', role: 'role' },
    // Parse data tempel (CSV/TSV dari Excel). Mengembalikan {rows, peringatan, galat}
    parse(txt, peranDefault) {
      const lines = String(txt || '').replace(/\r/g, '').split('\n').filter(l => l.trim());
      if (!lines.length) return { rows: [], galat: 'Data kosong' };
      const d = lines[0].indexOf('\t') >= 0 ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');
      const norm = s => s.toLowerCase().replace(/[^a-z]/g, '');
      const first = Imp.splitCsv(lines[0], d), map = first.map(c => Imp.alias[norm(c)] || null);
      const header = map.some(Boolean);
      const cols = header ? map : (peranDefault === 'siswa' ? ['username_nisn', 'nama', 'kelas', 'pin'] : ['username_nisn', 'nama', 'password']);
      const rows = [], peringatan = [];
      lines.slice(header ? 1 : 0).forEach(l => {
        const c = Imp.splitCsv(l, d), r = {};
        cols.forEach((k, i) => { if (k && c[i] !== undefined) r[k] = c[i]; });
        r.role = (r.role || peranDefault).toLowerCase();
        if (r.role === 'siswa' && /^\d{6,9}$/.test(r.username_nisn || '')) { r.username_nisn = r.username_nisn.padStart(10, '0'); r._pad = true; }
        rows.push(r);
      });
      const pad = rows.filter(r => r._pad).length;
      if (pad) peringatan.push(pad + ' NISN dilengkapi angka 0 di depan (Excel sering menghapusnya). Periksa kembali.');
      if (rows.length > 5000) return { rows: [], galat: 'Maksimal 5000 baris per impor' };
      return { rows: rows, peringatan: peringatan };
    },
    csvCell(v) {
      v = String(v == null ? '' : v);
      if (/^\d+$/.test(v)) v = '="' + v + '"';          // pertahankan angka 0 di depan (NISN/PIN) di Excel/Sheets
      else if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;     // cegah formula injection
      return '"' + v.replace(/"/g, '""') + '"';
    },
    csv(kred) {
      const head = ['Peran', 'NISN / Username', 'Nama', 'Kelas', 'PIN / Password awal'];
      return '\ufeff' + [head].concat(kred.map(k => [k.peran, k.id, k.nama, k.kelas, k.rahasia])).map(r => r.map(Imp.csvCell).join(',')).join('\r\n');
    }
  };
  let imp = { rows: [], valid: [], kred: [], diunduh: false };

  async function kirimBatch(op, rows) {
    const hasil = { valid: 0, gagal: [], kred: [] };
    for (let i = 0; i < rows.length; i += 500) {
      const potong = rows.slice(i, i + 500), d = await adm('imporPengguna', { op: op, baris: potong.map(x => x.row) });
      hasil.valid += d.valid;
      d.gagal.forEach(g => hasil.gagal.push({ baris: potong[g.baris - 1].no, alasan: g.alasan }));
      if (op === 'simpan') hasil.kred = hasil.kred.concat(d.kredensial);
    }
    return hasil;
  }
  function renderImpor(root) {
    root.innerHTML = '<div class="card"><div class="row"><a class="btn sm" href="#/admin/pengguna">← Pengguna</a><h2 class="grow" style="margin:0">Impor massal</h2></div>' +
      '<p class="muted">Tempel data dari Excel/CSV. Kolom siswa: <b>NISN, Nama, Kelas, PIN</b> (PIN opsional). Kolom guru: <b>Username, Nama, Password</b> (opsional). Baris judul dikenali otomatis.</p>' +
      '<label class="lbl">Jenis data</label><select id="iPeran"><option value="siswa">Siswa</option><option value="guru">Guru</option></select>' +
      '<label class="lbl">Data</label><textarea id="iData" style="min-height:11rem" placeholder="0012345601&#9;Budi Santoso&#9;X TKJ 1"></textarea>' +
      '<div class="row" style="margin-top:.6rem"><button class="btn" data-adm="pratinjau">Pratinjau &amp; validasi</button><button class="btn pri" data-adm="simpanImpor" id="iSimpan" disabled>Simpan</button></div>' +
      '<div id="iHasil"></div></div>';
    imp = { rows: [], valid: [], kred: [], diunduh: false };
    root.oninput = ev => { if (ev.target.id === 'iData') { document.getElementById('iSimpan').disabled = true; imp.valid = []; } };
    root.onclick = aksiImpor;
  }
  async function aksiImpor(ev) {
    const b = ev.target.closest('[data-adm]'); if (!b) return;
    const a = b.dataset.adm, out = document.getElementById('iHasil');
    try {
      if (a === 'pratinjau') {
        const p = Imp.parse(document.getElementById('iData').value, document.getElementById('iPeran').value);
        if (p.galat) return toast(p.galat, true);
        // duplikat di dalam data tempel disaring di klien agar tidak saling menggagalkan
        const lihat = new Set(), kirim = [], gagal = [];
        p.rows.forEach((r, i) => {
          const k = (r.username_nisn || '').toLowerCase(), no = i + 1, row = Object.assign({}, r); delete row._pad;
          if (k && lihat.has(k)) gagal.push({ baris: no, alasan: 'Duplikat di dalam data tempel' }); else { if (k) lihat.add(k); kirim.push({ no: no, row: row }); }
        });
        b.disabled = true; out.innerHTML = '<p class="muted">Memvalidasi…</p>';
        const h = await kirimBatch('pratinjau', kirim);
        const gagalAll = gagal.concat(h.gagal).sort((x, y) => x.baris - y.baris), bad = new Set(h.gagal.map(g => g.baris));
        imp.valid = kirim.filter(x => !bad.has(x.no));
        out.innerHTML = (p.peringatan || []).map(w => '<div class="note">' + esc(w) + '</div>').join('') +
          '<div class="stat"><div><strong>' + p.rows.length + '</strong>Baris</div><div><strong>' + imp.valid.length + '</strong>Valid</div><div><strong>' + gagalAll.length + '</strong>Gagal</div></div>' +
          (gagalAll.length ? '<h3 style="margin-top:.7rem">Baris gagal</h3><div style="overflow-x:auto"><table><tr><th>Baris</th><th>Alasan</th></tr>' + gagalAll.slice(0, 200).map(g => '<tr><td>' + g.baris + '</td><td>' + esc(g.alasan) + '</td></tr>').join('') + '</table></div>' + (gagalAll.length > 200 ? '<p class="muted">Menampilkan 200 pertama.</p>' : '') : '');
        document.getElementById('iSimpan').disabled = !imp.valid.length;
        b.disabled = false;
      } else if (a === 'simpanImpor') {
        if (!imp.valid.length) return;
        if (!confirm('Simpan ' + imp.valid.length + ' pengguna? Baris yang gagal diabaikan.')) return;
        b.disabled = true; out.innerHTML = '<p class="muted">Menyimpan…</p>';
        const h = await kirimBatch('simpan', imp.valid);
        imp.kred = h.kred; imp.valid = []; imp.diunduh = false;
        tampilHasilImpor(out, h);
      } else if (a === 'unduh') {
        if (!imp.kred.length) return;
        const blob = new Blob([Imp.csv(imp.kred)], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), el = document.createElement('a');
        el.href = url; el.download = 'kredensial-awal-' + todayStr() + '.csv'; document.body.appendChild(el); el.click(); el.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        imp.kred = []; imp.diunduh = true;
        out.innerHTML = '<div class="note ok">CSV diunduh dan data rahasia dihapus dari layar. PIN awal yang dibuat otomatis masih bisa dilihat satu kali lewat tombol "Lihat PIN awal" di daftar pengguna.</div><a class="btn" href="#/admin/pengguna">Ke daftar pengguna</a>';
      } else if (a === 'cetak') window.print();
    } catch (e) { toast(pesan(e), true); b.disabled = false; }
  }
  function tampilHasilImpor(out, h) {
    const tampil = imp.kred.filter(k => k.rahasia);
    out.innerHTML = '<div class="note ok"><b>' + (h.kred.length) + ' pengguna disimpan.</b>' + (h.gagal.length ? ' ' + h.gagal.length + ' baris gagal saat menyimpan (mis. sudah terdaftar).' : '') + '</div>' +
      (tampil.length ? '<div class="note"><b>Unduh sekarang.</b> PIN/password awal yang dibuat otomatis hanya ditampilkan di layar ini dan bisa diunduh <b>satu kali</b> sebagai CSV (atau dicetak).</div>' +
        '<div class="row noprint"><button class="btn pri" data-adm="unduh">Unduh CSV (sekali)</button><button class="btn" data-adm="cetak">Cetak</button><a class="btn" href="#/admin/pengguna">Selesai</a></div>' +
        '<div id="cetakArea"><h3>Kredensial awal — ' + esc(todayStr()) + '</h3><div style="overflow-x:auto"><table><tr><th>Peran</th><th>NISN/Username</th><th>Nama</th><th>Kelas</th><th>PIN/Password awal</th></tr>' +
        tampil.map(k => '<tr><td>' + esc(k.peran) + '</td><td>' + esc(k.id) + '</td><td>' + esc(k.nama) + '</td><td>' + esc(k.kelas) + '</td><td><b>' + esc(k.rahasia) + '</b></td></tr>').join('') + '</table></div></div>'
        : '<a class="btn" href="#/admin/pengguna">Selesai</a>');
  }

  // ====================================================== MAPPING ======================================================
  let M = { map: [], users: [], guruPilih: '' };
  async function renderMapping(root) {
    M.users = (await usersCache()).filter(u => u.aktif); M.map = await mappingCache();
    gambarMapping(root);
    root.onclick = aksiMapping; root.onchange = ev => { if (ev.target.id === 'mGuru') { M.guruPilih = ev.target.value; gambarMapping(root); } };
    if (online()) {
      try {
        const [u, m] = await Promise.all([adm('kelolaPengguna', { op: 'list' }), adm('kelolaMapping', { op: 'list' })]);
        await simpanUsers(u.pengguna); await simpanMapping(m.mapping);
        M.users = u.pengguna.filter(x => x.aktif); M.map = m.mapping; gambarMapping(root);
      } catch (e) { toast(pesan(e), true); }
    }
  }
  function gambarMapping(root) {
    const gurus = M.users.filter(u => u.role === 'guru').sort((a, b) => a.nama.localeCompare(b.nama)), sis = M.users.filter(u => u.role === 'siswa');
    const guruDari = {}; M.map.forEach(m => { guruDari[m.nisn] = m.username_guru; });
    const tanpa = sis.filter(s => !guruDari[s.username]).sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));
    const opsiGuru = (pilih) => '<option value="">— pilih guru —</option>' + gurus.map(g => '<option value="' + esc(g.username) + '"' + (g.username === pilih ? ' selected' : '') + '>' + esc(g.nama) + ' (' + M.map.filter(m => m.username_guru === g.username).length + ')</option>').join('');
    const kelas = [...new Set(sis.map(s => s.kelas))].sort();
    const dis = online() ? '' : ' disabled';
    const milik = sis.filter(s => guruDari[s.username] === M.guruPilih).sort((a, b) => a.nama.localeCompare(b.nama));
    root.innerHTML = '<div class="card"><h2>Mapping guru–siswa</h2><p class="muted">Satu siswa satu guru bimbingan. ' + sis.length + ' siswa aktif, ' + tanpa.length + ' belum punya guru. ' + (online() ? '' : 'Offline: hanya tampilan.') + '</p></div>' +
      '<div class="card"><h3>Atur massal per kelas</h3><div class="row"><select id="mKelas" class="grow"><option value="">— pilih kelas —</option>' + kelas.map(k => '<option>' + esc(k) + '</option>').join('') + '</select>' +
      '<select id="mGuruMassal" class="grow">' + opsiGuru('') + '</select></div><label class="lbl"><input type="checkbox" id="mGanti" checked> Ganti guru yang sudah ada</label>' +
      '<button class="btn pri block" data-adm="massal"' + dis + '>Terapkan ke seluruh kelas</button></div>' +
      '<div class="card"><h3>Siswa belum punya guru (' + tanpa.length + ')</h3>' + (tanpa.slice(0, 100).map(s => '<div class="item"><span class="grow"><b>' + esc(s.nama) + '</b><br><small class="muted">' + esc(s.username) + ' · ' + esc(s.kelas) + '</small></span>' +
        '<select class="sel-sm" data-pilih="' + esc(s.username) + '">' + opsiGuru('') + '</select><button class="btn sm" data-adm="tetapkan" data-nisn="' + esc(s.username) + '"' + dis + '>Tetapkan</button></div>').join('') || '<p class="muted">Semua siswa sudah punya guru.</p>') +
      (tanpa.length > 100 ? '<p class="muted">Menampilkan 100 pertama; gunakan atur massal per kelas.</p>' : '') + '</div>' +
      '<div class="card"><h3>Per guru</h3><select id="mGuru">' + opsiGuru(M.guruPilih) + '</select>' +
      (M.guruPilih ? '<p class="muted">' + milik.length + ' siswa bimbingan</p>' + (milik.map(s => '<div class="item"><span class="grow"><b>' + esc(s.nama) + '</b><br><small class="muted">' + esc(s.username) + ' · ' + esc(s.kelas) + '</small></span>' +
        '<select class="sel-sm" data-pilih="' + esc(s.username) + '">' + opsiGuru('') + '</select><button class="btn sm" data-adm="pindah" data-nisn="' + esc(s.username) + '"' + dis + '>Pindahkan</button>' +
        '<button class="btn sm" data-adm="lepas" data-nisn="' + esc(s.username) + '"' + dis + '>Lepas</button></div>').join('') || '<p class="muted">Belum ada siswa.</p>') : '') + '</div>';
  }
  async function aksiMapping(ev) {
    const b = ev.target.closest('[data-adm]'); if (!b) return;
    const a = b.dataset.adm, root = b.closest('#adminRoot') || document.getElementById('adminRoot');
    const pilihan = () => { const el = root.querySelector('[data-pilih="' + b.dataset.nisn + '"]'); return el ? el.value : ''; };
    try {
      let d;
      if (a === 'tetapkan' || a === 'pindah') {
        const g = pilihan(); if (!g) return toast('Pilih guru terlebih dahulu', true);
        d = await adm('kelolaMapping', { op: a === 'pindah' ? 'pindah' : 'set', nisn: b.dataset.nisn, guru: g });
      } else if (a === 'lepas') {
        if (!confirm('Lepas siswa ini dari guru bimbingannya?')) return;
        d = await adm('kelolaMapping', { op: 'hapus', nisn: b.dataset.nisn });
      } else if (a === 'massal') {
        const k = root.querySelector('#mKelas').value, g = root.querySelector('#mGuruMassal').value;
        if (!k || !g) return toast('Pilih kelas dan guru', true);
        if (!confirm('Tetapkan guru ini untuk semua siswa aktif kelas ' + k + '?')) return;
        d = await adm('kelolaMapping', { op: 'massalKelas', kelas: k, guru: g, ganti: root.querySelector('#mGanti').checked });
      } else return;
      M.map = d.mapping; await simpanMapping(M.map); toast('Mapping diperbarui (' + d.diubah + ' perubahan)'); gambarMapping(root);
    } catch (e) { toast(pesan(e), true); }
  }

  // ====================================================== LOG ======================================================
  async function renderLog(root) {
    root.innerHTML = '<div class="card"><h2>Log aktivitas</h2><div class="row"><input id="lAksi" class="grow" placeholder="Filter aksi, mis. login_gagal"><button class="btn" data-adm="muat">Muat</button></div><div id="lHasil" class="muted" style="margin-top:.6rem"></div></div>';
    const muat = async () => {
      const out = document.getElementById('lHasil');
      if (!online()) { out.textContent = 'Log hanya dapat dilihat saat online.'; return; }
      out.textContent = 'Memuat…';
      try {
        const d = await adm('getLog', { limit: 200, aksi: document.getElementById('lAksi').value.trim() });
        out.innerHTML = d.log.length ? '<div style="overflow-x:auto"><table><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Target</th><th>Detail</th></tr>' +
          d.log.map(l => '<tr><td>' + esc(l.waktu) + '</td><td>' + esc(l.pelaku) + '</td><td>' + esc(l.aksi) + '</td><td>' + esc(l.target) + '</td><td>' + esc(l.detail) + '</td></tr>').join('') + '</table></div>' : 'Tidak ada log.';
      } catch (e) { out.textContent = pesan(e); }
    };
    root.onclick = ev => { if (ev.target.closest('[data-adm="muat"]')) muat(); };
    muat();
  }

  AdminModules.push({ id: 'pengguna', label: 'Pengguna', order: 20, render: (root, arg) => arg === 'impor' ? renderImpor(root) : renderPengguna(root) });
  AdminModules.push({ id: 'mapping', label: 'Mapping', order: 30, render: renderMapping });
  AdminModules.push({ id: 'log', label: 'Log', order: 90, render: renderLog });
  globalThis.__Imp = Imp; // untuk pengujian
  globalThis.AdminKit = { adm: adm, online: online, pesan: pesan, usersCache: usersCache, simpanUsers: simpanUsers, Imp: Imp }; // dipakai admin-lanjutan.js
})();
