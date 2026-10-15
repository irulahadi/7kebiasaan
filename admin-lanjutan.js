/* admin-lanjutan.js — Tahap 5: Dashboard, Tahun Ajaran & Naik Kelas, Konfigurasi, Kalender Libur, Pengumuman,
 * Backup & Restore (+ cadangan IndexedDB di klien). Semua aksi tulis online-only; hasil dashboard di-cache di IndexedDB.
 * Bergantung pada app.js, auth.js, db.js dan admin-pengguna.js (AdminKit). */
(function () {
  'use strict';
  const { adm, online, pesan, usersCache, simpanUsers, Imp } = AdminKit;
  const perluOnline = () => { if (!online()) { toast('Hanya bisa dilakukan saat online', true); return false; } return true; };
  function unduh(nama, isi, mime) {
    const url = URL.createObjectURL(new Blob([isi], { type: mime })), a = document.createElement('a');
    a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const v = (root, sel) => { const el = root.querySelector(sel); return el ? el.value.trim() : ''; };
  const bacaFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Gagal membaca berkas')); r.readAsText(f); });

  // ====================================================== DASHBOARD ======================================================
  function svgTren(tren) {
    const W = 320, H = 130, pl = 28, pr = 8, pt = 8, pb = 22, w = W - pl - pr, h = H - pt - pb, n = tren.length;
    const x = i => pl + (n > 1 ? i * w / (n - 1) : 0), y = p => pt + h - (p / 100) * h;
    let g = '';
    [0, 50, 100].forEach(t => { g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="var(--bd)"/><text x="' + (pl - 4) + '" y="' + (y(t) + 3) + '" font-size="9" text-anchor="end" fill="var(--mut)">' + t + '</text>'; });
    const seg = []; let cur = [];
    tren.forEach((t, i) => { if (t.persen == null) { if (cur.length) seg.push(cur); cur = []; } else cur.push([x(i), y(t.persen), t]); });
    if (cur.length) seg.push(cur);
    g += seg.map(s => '<polyline fill="none" stroke="var(--pri)" stroke-width="2" points="' + s.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>').join('');
    g += seg.reduce((a, s) => a.concat(s), []).map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="var(--pri)"><title>' + esc(p[2].tanggal) + ': ' + p[2].persen + '%</title></circle>').join('');
    tren.forEach((t, i) => { if (t.persen == null) g += '<rect x="' + (x(i) - 3) + '" y="' + (H - pb + 3) + '" width="6" height="4" fill="var(--mut)"><title>' + esc(t.tanggal) + ': libur</title></rect>'; });
    g += '<text x="' + pl + '" y="' + (H - 4) + '" font-size="9" fill="var(--mut)">' + esc(tren[0].tanggal.slice(5)) + '</text><text x="' + (W - pr) + '" y="' + (H - 4) + '" font-size="9" text-anchor="end" fill="var(--mut)">' + esc(tren[n - 1].tanggal.slice(5)) + '</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tren persentase siswa mengisi, 14 hari terakhir" style="width:100%;height:auto">' + g + '</svg>';
  }
  function gambarDash(root, d, waktu) {
    if (!d) { root.innerHTML = bannerHtml() + '<div class="card"><h2>Dashboard</h2><p class="muted">' + (online() ? 'Memuat…' : 'Belum ada data tersimpan. Buka saat online sekali untuk mengambil data.') + '</p></div>'; return; }
    const hi = d.hari_ini;
    root.innerHTML = bannerHtml() + '<div class="card"><div class="row"><h2 class="grow" style="margin:0">Dashboard</h2><button class="btn sm" data-adm="muat">Muat ulang</button></div>' +
      '<p class="muted">data per ' + esc(fmtWaktu(waktu)) + (online() ? '' : ' (offline)') + '</p><div class="stat">' +
      '<div><strong>' + d.siswa_aktif + '</strong>Siswa aktif</div>' +
      '<div><strong>' + (hi.libur ? 'Libur' : hi.persen + '%') + '</strong>Mengisi hari ini' + (hi.libur ? '' : '<br><small>' + hi.sudah + ' dari ' + hi.total + '</small>') + '</div>' +
      '<div><strong>' + d.kelengkapan7 + '%</strong>Kelengkapan 7 hari</div></div></div>' +
      '<div class="card"><h3>Tren 14 hari</h3>' + svgTren(d.tren) + '<p class="muted">Garis: persen siswa aktif yang mengisi. Kotak abu-abu: hari libur (tidak dihitung).</p></div>' +
      '<div class="card"><h3>Per kelas</h3><div style="overflow-x:auto"><table><tr><th>Kelas</th><th>Siswa</th><th>Hari ini</th><th>7 hari</th></tr>' +
      d.per_kelas.map(k => '<tr><td>' + esc(k.kelas) + '</td><td>' + k.jumlah + '</td><td>' + (k.persen_hari_ini == null ? 'libur' : k.sudah_hari_ini + ' (' + k.persen_hari_ini + '%)') + '</td><td>' + k.kelengkapan7 + '%</td></tr>').join('') + '</table></div></div>' +
      '<div class="card"><h3>Belum mengisi hari ini (' + d.belum_mengisi.length + ')</h3>' + (hi.libur ? '<p class="muted">Hari libur.</p>' :
        d.belum_mengisi.map(s => '<div class="item"><span class="grow"><b>' + esc(s.nama) + '</b><br><small class="muted">' + esc(s.nisn) + ' · ' + esc(s.kelas) + '</small></span></div>').join('') || '<p class="muted">Semua sudah mengisi.</p>') + '</div>';
  }
  async function renderDashboard(root) {
    const key = S.akun.id + ':dash', c = await DB.get('dashboard', key);
    gambarDash(root, c ? c.data : null, c ? c.waktu : 0);
    root.onclick = ev => { if (ev.target.closest('[data-adm="muat"]')) renderDashboard(root); };
    if (!online()) return;
    try {
      const d = await adm('getDashboard', {});
      await DB.put('dashboard', { rid: key, owner_id: S.akun.id, data: d, waktu: d.dihitung_pada });
      gambarDash(root, d, d.dihitung_pada);
    } catch (e) { toast(pesan(e), true); }
  }

  // ====================================================== TAHUN AJARAN & NAIK KELAS ======================================================
  let TA = [], NK = { hasil: null };
  const saranKelas = k => { const m = String(k).match(/^(XII|XI|X)(\s.*)?$/i); if (!m) return ''; const t = m[1].toUpperCase(); return t === 'X' ? 'XI' + (m[2] || '') : t === 'XI' ? 'XII' + (m[2] || '') : 'LULUS'; };
  const daftarNisn = t => [...new Set(String(t || '').split(/[\s,;]+/).filter(Boolean))];

  async function renderTA(root) {
    TA = S.periode.slice();
    const siswa = (await usersCache()).filter(u => u.role === 'siswa' && u.aktif);
    await gambarTA(root, siswa);
    root.onclick = ev => aksiTA(ev, root, siswa);
    if (online()) { try { TA = (await adm('setTahunAjaran', { op: 'list' })).tahunAjaran; await gambarTA(root, siswa); } catch (e) { toast(pesan(e), true); } }
  }
  async function gambarTA(root, siswa) {
    const kelas = {}; siswa.forEach(s => { kelas[s.kelas] = (kelas[s.kelas] || 0) + 1; });
    const ks = Object.keys(kelas).sort();
    root.innerHTML = '<div class="card"><div class="row"><h2 class="grow" style="margin:0">Tahun ajaran & semester</h2><button class="btn pri sm" data-adm="taForm">+ Periode</button></div>' +
      '<p class="muted">Satu periode aktif. Entri dikaitkan ke periode berdasarkan tanggal; periode lama menjadi baca saja.</p>' +
      (TA.slice().sort((a, b) => b.mulai.localeCompare(a.mulai)).map(p => '<div class="item"><span class="grow"><b>' + esc(p.nama) + '</b> · ' + esc(p.semester) + (p.aktif ? ' <span class="badge b-ok">Aktif</span>' : '') + '<br><small class="muted">' + esc(p.mulai) + ' s.d. ' + esc(p.selesai) + '</small></span>' +
        '<button class="btn sm" data-adm="taForm" data-id="' + esc(p.id) + '">Ubah</button></div>').join('') || '<p class="muted">Belum ada periode.</p>') + '</div>' +
      '<div class="card"><h2>Naik kelas massal</h2><p class="muted">Pemetaan kelas lama → kelas baru (atau LULUS). Siswa lulus dinonaktifkan, tidak dihapus. Pratinjau dulu sebelum eksekusi.</p>' +
      (ks.length ? '<form id="nkForm">' + ks.map(k => '<div class="row" style="margin:.3rem 0"><span class="grow">' + esc(k) + ' <small class="muted">(' + kelas[k] + ' siswa)</small></span><input data-peta="' + esc(k) + '" style="width:11rem" placeholder="kelas baru / LULUS" value="' + esc(saranKelas(k)) + '"></div>').join('') +
        '<label class="lbl">NISN tinggal kelas (pisahkan dengan spasi/koma/baris)</label><textarea id="nkTinggal" style="min-height:3.5rem"></textarea>' +
        '<label class="lbl">NISN lulus lebih awal / pengecualian lulus</label><textarea id="nkLulus" style="min-height:3.5rem"></textarea>' +
        '<label class="lbl"><input type="checkbox" id="nkReset"> Reset mapping guru (hapus semua penetapan guru–siswa)</label>' +
        '<div class="row" style="margin-top:.6rem"><button type="button" class="btn" data-adm="nkPratinjau">Pratinjau</button></div></form><div id="nkHasil">' + nkHasilHtml() + '</div>' : '<p class="muted">Tidak ada siswa aktif (atau data pengguna belum dimuat; buka menu Pengguna sekali saat online).</p>') + '</div>';
  }
  function nkHasilHtml() {
    const h = NK.hasil; if (!h) return '';
    return '<h3 style="margin-top:.8rem">Hasil pratinjau</h3><div style="overflow-x:auto"><table><tr><th>Kelas</th><th>Ke</th><th>Naik</th><th>Tinggal</th><th>Lulus</th><th>Tanpa peta</th></tr>' +
      h.ringkasan.map(r => '<tr><td>' + esc(r.kelas) + '</td><td>' + esc(r.ke) + '</td><td>' + r.naik + '</td><td>' + r.tinggal + '</td><td>' + r.lulus + '</td><td>' + r.tanpa_peta + '</td></tr>').join('') + '</table></div>' +
      (h.kelas_tanpa_peta.length ? '<div class="note err">Kelas tanpa pemetaan: ' + esc(h.kelas_tanpa_peta.join(', ')) + '. Isi pemetaannya atau abaikan (siswa kelas itu tidak berubah).</div><label class="lbl"><input type="checkbox" id="nkAbaikan"> Abaikan kelas tanpa pemetaan</label>' : '') +
      '<label class="lbl">Ketik <b>NAIK KELAS</b> untuk konfirmasi</label><input id="nkKonfirm" autocomplete="off"><button class="btn pri block" data-adm="nkEksekusi">Eksekusi naik kelas</button>';
  }
  function nkInput(root) {
    const peta = {}; root.querySelectorAll('[data-peta]').forEach(el => { const t = el.value.trim(); if (t) peta[el.dataset.peta] = t.toUpperCase() === 'LULUS' ? 'LULUS' : t; });
    const pec = {}; daftarNisn(v(root, '#nkTinggal')).forEach(n => { pec[n] = 'TINGGAL'; }); daftarNisn(v(root, '#nkLulus')).forEach(n => { pec[n] = 'LULUS'; });
    return { peta: peta, pengecualian: pec, reset_mapping: root.querySelector('#nkReset').checked };
  }
  function dialogTA(p) {
    dialog('<h3>' + (p ? 'Ubah' : 'Tambah') + ' periode</h3><form><label class="lbl">Nama (mis. 2026/2027)</label><input id="p_nama" maxlength="60" required value="' + esc(p ? p.nama : '') + '">' +
      '<label class="lbl">Semester</label><select id="p_sem"><option' + (p && p.semester === 'Ganjil' ? ' selected' : '') + '>Ganjil</option><option' + (p && p.semester === 'Genap' ? ' selected' : '') + '>Genap</option></select>' +
      '<label class="lbl">Mulai</label><input type="date" id="p_mulai" required value="' + esc(p ? p.mulai : '') + '"><label class="lbl">Selesai</label><input type="date" id="p_selesai" required value="' + esc(p ? p.selesai : '') + '">' +
      '<label class="lbl"><input type="checkbox" id="p_aktif"' + (!p || p.aktif ? ' checked' : '') + '> Jadikan periode aktif (periode aktif lain dinonaktifkan)</label><button class="btn pri block" type="submit">Simpan</button></form>');
    const body = $('#dlgBody');
    body.onsubmit = async ev => {
      ev.preventDefault();
      try {
        const d = await adm('setTahunAjaran', { id: p ? p.id : undefined, nama: v(body, '#p_nama'), semester: v(body, '#p_sem'), mulai: v(body, '#p_mulai'), selesai: v(body, '#p_selesai'), aktif: body.querySelector('#p_aktif').checked });
        TA = d.tahunAjaran; $('#dlg').close(); toast('Periode tersimpan'); renderTA($('#adminRoot'));
      } catch (e) { toast(pesan(e), true); }
    };
  }
  async function aksiTA(ev, root, siswa) {
    const b = ev.target.closest('[data-adm]'); if (!b) return;
    try {
      if (b.dataset.adm === 'taForm') { if (perluOnline()) dialogTA(TA.find(x => x.id === b.dataset.id)); }
      else if (b.dataset.adm === 'nkPratinjau') {
        if (!perluOnline()) return;
        const i = nkInput(root);
        if (!Object.keys(i.peta).length) return toast('Isi pemetaan minimal satu kelas', true);
        NK.hasil = await adm('naikKelas', { op: 'pratinjau', peta: i.peta, pengecualian: i.pengecualian });
        $('#nkHasil').innerHTML = nkHasilHtml();
      } else if (b.dataset.adm === 'nkEksekusi') {
        if (!perluOnline()) return;
        if (v(root, '#nkKonfirm') !== 'NAIK KELAS') return toast('Ketik NAIK KELAS untuk konfirmasi', true);
        const i = nkInput(root), ab = root.querySelector('#nkAbaikan');
        if (!confirm('Eksekusi naik kelas sekarang? Tindakan ini mengubah kelas banyak siswa dan tidak bisa dibatalkan otomatis.')) return;
        b.disabled = true;
        await adm('naikKelas', { op: 'eksekusi', konfirmasi: true, peta: i.peta, pengecualian: i.pengecualian, reset_mapping: i.reset_mapping, abaikan_tanpa_peta: !!(ab && ab.checked) });
        NK.hasil = null; await simpanUsers((await adm('kelolaPengguna', { op: 'list' })).pengguna);
        toast('Naik kelas selesai'); renderTA(root);
      }
    } catch (e) { toast(pesan(e), true); b.disabled = false; }
  }

  // ====================================================== KONFIGURASI ======================================================
  const MAIN = [['jam_bangun', 'Jam Bangun'], ['jam_tidur', 'Jam Tidur'], ['sholat', 'Ibadah Sholat'], ['olahraga', 'Kegiatan Olahraga'], ['makan', 'Menu Makan Sehat'], ['materi_belajar', 'Materi Belajar'], ['aksi_masyarakat', 'Aksi Bermasyarakat']];
  const RAM = [['puasa', 'Puasa'], ['tarawih', 'Sholat Tarawih'], ['tadarus', 'Tadarus Al-Qur\u2019an']];
  function renderKonfig(root) {
    const get = (k, lbl, i) => S.config.rows.find(x => x.kunci === k) || { kunci: k, aktif: k === 'jam_bangun' || k === 'jam_tidur' || MAIN.some(m => m[0] === k), label: lbl, wajib: false, urutan: i, mulai: '', selesai: '' };
    const rowHtml = (c, ram) => '<div class="item" style="flex-wrap:wrap"><label style="min-width:5rem"><input type="checkbox" data-k="' + c.kunci + '" data-f="aktif"' + (c.aktif ? ' checked' : '') + '> Aktif</label>' +
      '<input data-k="' + c.kunci + '" data-f="label" maxlength="60" class="grow" style="min-width:9rem" value="' + esc(c.label) + '" aria-label="Label">' +
      '<label><input type="checkbox" data-k="' + c.kunci + '" data-f="wajib"' + (c.wajib ? ' checked' : '') + '> Wajib</label>' +
      '<input data-k="' + c.kunci + '" data-f="urutan" type="number" min="1" max="99" style="width:4.5rem" value="' + esc(c.urutan) + '" aria-label="Urutan"></div>';
    const r1 = get('jam_bangun', '', 0), rm = RAM.map((m, i) => get(m[0], m[1], 20 + i)), anyR = rm[0];
    root.innerHTML = '<div class="card"><h2>Konfigurasi kebiasaan</h2><p class="muted">Versi konfigurasi saat ini: <b>' + S.config.versi + '</b>. Setiap entri menyimpan versi konfigurasi saat dibuat, sehingga data lama tetap terbaca. Perubahan berlaku pada formulir siswa setelah mereka sinkron.</p>' +
      '<form id="cfgForm">' + MAIN.map((m, i) => rowHtml(get(m[0], m[1], i + 1))).join('') +
      '<h3 style="margin-top:1rem">Mode Ramadan (per rentang tanggal)</h3><div class="row"><div class="grow"><label class="lbl">Mulai</label><input type="date" id="cfgMulai" value="' + esc(anyR.mulai) + '"></div><div class="grow"><label class="lbl">Selesai</label><input type="date" id="cfgSelesai" value="' + esc(anyR.selesai) + '"></div></div>' +
      rm.map(c => rowHtml(c)).join('') + '<button type="button" class="btn" style="margin-top:.5rem" data-adm="ramadan">Terapkan preset Mode Ramadan</button>' +
      '<button type="submit" class="btn pri block">Simpan konfigurasi</button></form></div>';
    root.onclick = ev => {
      if (!ev.target.closest('[data-adm="ramadan"]')) return;
      RAM.forEach(m => { root.querySelector('[data-k="' + m[0] + '"][data-f="aktif"]').checked = true; });
      if (!v(root, '#cfgMulai') || !v(root, '#cfgSelesai')) toast('Preset dicentang. Isi tanggal mulai & selesai lalu simpan.', true); else toast('Preset diterapkan. Klik Simpan untuk menyimpan.');
    };
    root.onsubmit = async ev => {
      ev.preventDefault(); if (!perluOnline()) return;
      const rows = [], mulai = v(root, '#cfgMulai'), selesai = v(root, '#cfgSelesai');
      const ambil = k => ({ kunci: k, aktif: root.querySelector('[data-k="' + k + '"][data-f="aktif"]').checked, label: v(root, '[data-k="' + k + '"][data-f="label"]'), wajib: root.querySelector('[data-k="' + k + '"][data-f="wajib"]').checked, urutan: Number(v(root, '[data-k="' + k + '"][data-f="urutan"]')) || 1 });
      MAIN.forEach(m => rows.push(ambil(m[0])));
      RAM.forEach(m => rows.push(Object.assign(ambil(m[0]), { mulai: mulai, selesai: selesai })));
      if (rows.some(r => !r.label)) return toast('Label tidak boleh kosong', true);
      if (!rows.filter(r => MAIN.some(m => m[0] === r.kunci)).some(r => r.aktif)) return toast('Aktifkan minimal satu kolom utama', true);
      if (rows.some(r => RAM.some(m => m[0] === r.kunci) && r.aktif) && (!mulai || !selesai)) return toast('Mode Ramadan aktif butuh tanggal mulai dan selesai', true);
      try {
        const d = await adm('simpanKonfigurasi', { rows: rows });
        await DB.tx(['config'], 'readwrite', async t => {
          await DB.delOwner(t, 'config', S.akun.id);
          for (const c of d.rows) await DB.rq(t.objectStore('config').put(Object.assign({ rid: S.akun.id + ':' + c.kunci, owner_id: S.akun.id, versi: d.versi }, c)));
        });
        await loadRef(); toast('Konfigurasi disimpan (versi ' + d.versi + ')'); renderKonfig(root);
      } catch (e) { toast(pesan(e), true); }
    };
  }

  // ====================================================== KALENDER LIBUR ======================================================
  async function renderLibur(root) {
    let list = S.libur.slice();
    const gambar = () => {
      root.innerHTML = '<div class="card"><h2>Kalender libur</h2><p class="muted">Akhir pekan (Sabtu–Minggu) otomatis libur. Hari libur tidak dihitung "belum mengisi" dan tidak masuk penyebut persentase.</p>' +
        '<form id="lbForm"><div class="row"><div class="grow"><label class="lbl">Mulai</label><input type="date" id="lbMulai" required></div><div class="grow"><label class="lbl">Selesai (opsional)</label><input type="date" id="lbSelesai"></div></div>' +
        '<label class="lbl">Keterangan</label><input id="lbKet" maxlength="100" required placeholder="mis. Libur semester"><button class="btn pri block" type="submit">Tambah libur</button></form></div>' +
        '<div class="card"><h3>Daftar libur (' + list.length + ')</h3>' + (list.slice().sort((a, b) => b.mulai.localeCompare(a.mulai)).map(l => '<div class="item"><span class="grow"><b>' + esc(l.keterangan) + '</b><br><small class="muted">' + esc(l.mulai) + (l.selesai && l.selesai !== l.mulai ? ' s.d. ' + esc(l.selesai) : '') + '</small></span><button class="btn sm" data-adm="hapus" data-id="' + esc(l.id) + '">Hapus</button></div>').join('') || '<p class="muted">Belum ada.</p>') + '</div>';
    };
    gambar();
    const jalankan = async data => { if (!perluOnline()) return; try { list = (await adm('kelolaLibur', data)).libur; await DB.tx(['libur'], 'readwrite', async t => { await DB.delOwner(t, 'libur', S.akun.id); for (const l of list) await DB.rq(t.objectStore('libur').put(Object.assign({ rid: S.akun.id + ':' + l.id, owner_id: S.akun.id }, l))); }); await loadRef(); gambar(); } catch (e) { toast(pesan(e), true); } };
    root.onsubmit = ev => { ev.preventDefault(); jalankan({ op: 'tambah', mulai: v(root, '#lbMulai'), selesai: v(root, '#lbSelesai'), keterangan: v(root, '#lbKet') }); };
    root.onclick = ev => { const b = ev.target.closest('[data-adm="hapus"]'); if (b && confirm('Hapus data libur ini?')) jalankan({ op: 'hapus', id: b.dataset.id }); };
    if (online()) { try { list = (await adm('kelolaLibur', { op: 'list' })).libur; gambar(); } catch (e) { /* tetap tampilkan cache */ } }
  }

  // ====================================================== PENGUMUMAN ======================================================
  async function renderPengumuman(root) {
    let list = S.pengumuman.filter(p => !p.deleted);
    const kelasList = [...new Set((await usersCache()).filter(u => u.role === 'siswa' && u.kelas).map(u => u.kelas))].sort();
    const gambar = () => {
      root.innerHTML = '<div class="card"><div class="row"><h2 class="grow" style="margin:0">Pengumuman</h2><button class="btn pri sm" data-adm="form">+ Baru</button></div><p class="muted">Tampil sebagai banner di dashboard sesuai target dan tanggal tayang; tersedia offline setelah sinkron.</p>' +
        (list.slice().sort((a, b) => b.tayang.localeCompare(a.tayang)).map(p => '<div class="item" style="align-items:flex-start"><span class="grow"><b>' + esc(p.judul) + '</b><br><small class="muted">Target: ' + esc(p.target_tipe + (p.target_nilai ? ' ' + p.target_nilai : '')) + ' · tayang ' + esc(p.tayang) + (p.kedaluwarsa ? ' s.d. ' + esc(p.kedaluwarsa) : '') + '</small></span>' +
          '<button class="btn sm" data-adm="form" data-id="' + esc(p.id) + '">Ubah</button><button class="btn sm" data-adm="hapus" data-id="' + esc(p.id) + '">Hapus</button></div>').join('') || '<p class="muted">Belum ada pengumuman.</p>') + '</div>';
    };
    gambar();
    const muat = async () => { try { list = (await adm('kelolaPengumuman', { op: 'list' })).pengumuman; gambar(); } catch (e) { toast(pesan(e), true); } };
    function form(p) {
      dialog('<h3>' + (p ? 'Ubah' : 'Buat') + ' pengumuman</h3><form><label class="lbl">Judul</label><input id="a_j" maxlength="120" required value="' + esc(p ? p.judul : '') + '">' +
        '<label class="lbl">Isi</label><textarea id="a_i" maxlength="2000" required>' + esc(p ? p.isi : '') + '</textarea><label class="lbl">Target</label><select id="a_t">' +
        ['semua', 'guru', 'siswa', 'kelas'].map(t => '<option' + (p && p.target_tipe === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
        '<div id="a_kw"' + (p && p.target_tipe === 'kelas' ? '' : ' hidden') + '><label class="lbl">Kelas</label><select id="a_k">' + kelasList.map(k => '<option' + (p && p.target_nilai === k ? ' selected' : '') + '>' + esc(k) + '</option>').join('') + '</select></div>' +
        '<div class="row"><div class="grow"><label class="lbl">Tayang</label><input type="date" id="a_ty" required value="' + esc(p ? p.tayang : todayStr()) + '"></div><div class="grow"><label class="lbl">Kedaluwarsa</label><input type="date" id="a_kd" value="' + esc(p ? p.kedaluwarsa : '') + '"></div></div>' +
        '<button class="btn pri block" type="submit">Simpan</button></form>');
      const body = $('#dlgBody');
      body.querySelector('#a_t').onchange = e => { body.querySelector('#a_kw').hidden = e.target.value !== 'kelas'; };
      body.onsubmit = async ev => {
        ev.preventDefault();
        try {
          await adm('kelolaPengumuman', { op: 'simpan', id: p ? p.id : undefined, judul: v(body, '#a_j'), isi: v(body, '#a_i'), target_tipe: v(body, '#a_t'), target_nilai: v(body, '#a_k'), tayang: v(body, '#a_ty'), kedaluwarsa: v(body, '#a_kd') });
          $('#dlg').close(); toast('Pengumuman disimpan'); muat();
        } catch (e) { toast(pesan(e), true); }
      };
    }
    root.onclick = async ev => {
      const b = ev.target.closest('[data-adm]'); if (!b || !perluOnline()) return;
      if (b.dataset.adm === 'form') form(list.find(x => x.id === b.dataset.id));
      else if (b.dataset.adm === 'hapus' && confirm('Hapus pengumuman ini?')) { try { await adm('kelolaPengumuman', { op: 'hapus', id: b.dataset.id }); muat(); } catch (e) { toast(pesan(e), true); } }
    };
    if (online()) muat();
  }

  // ====================================================== BACKUP & RESTORE ======================================================
  // Cadangan IndexedDB di klien: ekspor semua data milik akun aktif; impor menggabung tanpa menimpa data yang lebih baru.
  const Cadangan = {
    async ekspor() {
      const o = S.akun.id;
      return { format: '7kebiasaan-cadangan', versi: 1, dibuat: Date.now(), username: S.akun.username, role: S.akun.role,
        kebiasaan: await DB.byIndex('kebiasaan', 'owner_id', o), antrean: (await Repo.queueByOwner(o)).map(q => q.rid) };
    },
    async impor(obj) {
      if (!obj || obj.format !== '7kebiasaan-cadangan' || !Array.isArray(obj.kebiasaan)) throw new Error('Berkas bukan cadangan aplikasi ini');
      if (obj.username !== S.akun.username) throw new Error('Cadangan ini milik akun lain (' + obj.username + '). Login dengan akun tersebut.');
      if (obj.kebiasaan.length > 50000) throw new Error('Cadangan terlalu besar');
      const o = S.akun.id, stat = { ditambah: 0, diperbarui: 0, dilewati: 0, ditolak: 0 };
      await DB.tx(['kebiasaan', 'syncQueue'], 'readwrite', async t => {
        const ks = t.objectStore('kebiasaan'), qs = t.objectStore('syncQueue');
        for (const r of obj.kebiasaan) {
          if (!r || !/^[A-Za-z0-9\-]{8,64}$/.test(String(r.id)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.tanggal || '')) || (S.akun.role === 'siswa' && r.nisn !== S.akun.username)) { stat.ditolak++; continue; }
          const rec = Object.assign({}, r, { owner_id: o, rid: o + ':' + r.id }), ex = await DB.rq(ks.get(rec.rid));
          const lokalPending = ex && ex.sync_status !== 'synced', cadPending = rec.sync_status !== 'synced';
          let pakai;
          if (!ex) pakai = true;
          else if (lokalPending && cadPending) pakai = (rec.local_rev || 0) > (ex.local_rev || 0);
          else if (lokalPending) pakai = false;                       // perubahan lokal belum terkirim dipertahankan
          else if (cadPending) pakai = true;                          // cadangan membawa perubahan belum terkirim
          else pakai = (Number(rec.updated_at) || 0) > (Number(ex.updated_at) || 0);
          if (!pakai) { stat.dilewati++; continue; }
          await DB.rq(ks.put(rec)); ex ? stat.diperbarui++ : stat.ditambah++;
          if (cadPending) {
            const q = await DB.rq(qs.index('rid').getAll(IDBKeyRange.only(rec.rid)));
            if (!q.length) await DB.rq(qs.add({ owner_id: o, rid: rec.rid, status: 'pending', percobaan: 0, error_terakhir: '', dibuat: Date.now() }));
          }
        }
      });
      await Sync.hitungAntre(); return stat;
    }
  };
  globalThis.__Cadangan = Cadangan;
  globalThis.bukaCadangan = function () {
    dialog('<h3>Cadangan data perangkat</h3><p class="muted">Berisi entri kebiasaan dan antrean milik akun ini yang tersimpan di perangkat. Berguna sebelum ganti perangkat atau membersihkan data.</p>' +
      '<div class="row"><button class="btn pri" data-cad="ekspor">Unduh cadangan</button></div><label class="lbl">Pulihkan dari berkas</label><input type="file" id="cadFile" accept=".json,application/json"><button class="btn block" data-cad="impor">Pulihkan (gabung)</button>');
    const body = $('#dlgBody');
    body.onclick = async ev => {
      const b = ev.target.closest('[data-cad]'); if (!b) return;
      try {
        if (b.dataset.cad === 'ekspor') { const o = await Cadangan.ekspor(); unduh('cadangan-' + S.akun.username + '-' + todayStr() + '.json', JSON.stringify(o), 'application/json'); toast('Cadangan diunduh'); }
        else { const f = body.querySelector('#cadFile').files[0]; if (!f) return toast('Pilih berkas cadangan', true); const st = await Cadangan.impor(JSON.parse(await bacaFile(f))); toast('Dipulihkan: ' + st.ditambah + ' baru, ' + st.diperbarui + ' diperbarui, ' + st.dilewati + ' dilewati'); Sync.run(); render(); }
      } catch (e) { toast(e instanceof SyntaxError ? 'Berkas bukan JSON yang valid' : pesan(e), true); }
    };
  };

  async function renderBackup(root) {
    let periode = S.periode.slice();
    const kelas = [...new Set((await usersCache()).filter(u => u.role === 'siswa' && u.kelas).map(u => u.kelas))].sort();
    root.innerHTML = '<div class="card"><h2>Backup spreadsheet</h2><p class="muted">Menyalin seluruh spreadsheet ke folder Drive "Backup_7Kebiasaan" dan menyimpan beberapa salinan terakhir. Trigger mingguan dipasang dengan menjalankan <code>setupTriggerBackup()</code> sekali di editor Apps Script.</p><button class="btn pri" data-adm="backup">Backup sekarang</button><div id="bkHasil"></div></div>' +
      '<div class="card"><h2>Ekspor data kebiasaan</h2><label class="lbl">Periode</label><select id="exPeriode"><option value="">Rentang tanggal manual</option>' + periode.map(p => '<option value="' + esc(p.id) + '">' + esc(p.nama + ' ' + p.semester) + '</option>').join('') + '</select>' +
      '<div class="row"><div class="grow"><label class="lbl">Dari</label><input type="date" id="exMulai"></div><div class="grow"><label class="lbl">Sampai</label><input type="date" id="exSelesai"></div></div>' +
      '<label class="lbl">Kelas (opsional)</label><select id="exKelas"><option value="">Semua kelas</option>' + kelas.map(k => '<option>' + esc(k) + '</option>').join('') + '</select>' +
      '<div class="row" style="margin-top:.6rem"><button class="btn" data-adm="exJson">Ekspor JSON</button><button class="btn" data-adm="exCsv">Ekspor CSV</button></div></div>' +
      '<div class="card"><h2>Restore data</h2><div class="note">Mode <b>gabung</b>: baris yang lebih baru di server tidak ditimpa. Gunakan berkas JSON hasil ekspor di atas.</div>' +
      '<label class="lbl">Berkas JSON</label><input type="file" id="rsFile" accept=".json,application/json"><label class="lbl">Password admin (konfirmasi ulang)</label><input type="password" id="rsPw" autocomplete="current-password">' +
      '<button class="btn pri block" data-adm="restore">Restore (gabung)</button><div id="rsHasil"></div></div>' +
      '<div class="card"><h2>Cadangan perangkat ini</h2><p class="muted">Ekspor/impor cadangan IndexedDB untuk akun Anda.</p><button class="btn" onclick="bukaCadangan()">Buka</button></div>';
    root.onchange = ev => { if (ev.target.id === 'exPeriode') { const dis = !!ev.target.value; root.querySelector('#exMulai').disabled = dis; root.querySelector('#exSelesai').disabled = dis; } };
    root.onclick = async ev => {
      const b = ev.target.closest('[data-adm]'); if (!b) return; const a = b.dataset.adm;
      if (!perluOnline()) return;
      try {
        if (a === 'backup') {
          b.disabled = true; const d = await adm('backupSekarang', {});
          root.querySelector('#bkHasil').innerHTML = '<div class="note ok">Backup <b>' + esc(d.nama) + '</b> dibuat. Salinan tersimpan: ' + d.disimpan + '. <a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">Buka di Drive</a></div>'; b.disabled = false;
        } else if (a === 'exJson' || a === 'exCsv') {
          const q = { tahun_ajaran_id: v(root, '#exPeriode') || undefined, mulai: v(root, '#exMulai') || undefined, selesai: v(root, '#exSelesai') || undefined, kelas: v(root, '#exKelas') || undefined };
          const d = await adm('eksporData', q), tag = (q.kelas || 'semua').replace(/\W+/g, '_') + '-' + todayStr();
          if (!d.kebiasaan.length) return toast('Tidak ada data pada filter ini', true);
          if (a === 'exJson') unduh('kebiasaan-' + tag + '.json', JSON.stringify(d), 'application/json');
          else unduh('kebiasaan-' + tag + '.csv', '\ufeff' + [d.kolom].concat(d.kebiasaan.map(r => d.kolom.map(k => r[k]))).map(r => r.map(Imp.csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
          toast(d.kebiasaan.length + ' baris diekspor');
        } else if (a === 'restore') {
          const f = root.querySelector('#rsFile').files[0], pw = root.querySelector('#rsPw').value;
          if (!f) return toast('Pilih berkas JSON', true); if (!pw) return toast('Masukkan password admin', true);
          let obj; try { obj = JSON.parse(await bacaFile(f)); } catch (e) { return toast('Berkas bukan JSON yang valid', true); }
          const rows = Array.isArray(obj) ? obj : obj.kebiasaan;
          if (!Array.isArray(rows) || !rows.length) return toast('Berkas tidak berisi data kebiasaan', true);
          if (!confirm('Restore ' + rows.length + ' baris dengan mode gabung?')) return;
          b.disabled = true; const tot = { ditambah: 0, diperbarui: 0, dilewati: 0, ditolak: 0 };
          for (let i = 0; i < rows.length; i += 5000) { const s = await adm('restoreData', { password: pw, kebiasaan: rows.slice(i, i + 5000) }); Object.keys(tot).forEach(k => { tot[k] += s[k] || 0; }); }
          root.querySelector('#rsPw').value = '';
          root.querySelector('#rsHasil').innerHTML = '<div class="note ok">Restore selesai: ' + tot.ditambah + ' ditambah, ' + tot.diperbarui + ' diperbarui, ' + tot.dilewati + ' dilewati, ' + tot.ditolak + ' ditolak. Perangkat pengguna akan menarik ulang data penuh saat sinkron berikutnya.</div>'; b.disabled = false;
        }
      } catch (e) { toast(pesan(e), true); b.disabled = false; }
    };
  }

  AdminModules.push({ id: 'dashboard', label: 'Dashboard', order: 10, render: renderDashboard });
  AdminModules.push({ id: 'tahun', label: 'Tahun ajaran', order: 40, render: renderTA });
  AdminModules.push({ id: 'konfigurasi', label: 'Konfigurasi', order: 50, render: renderKonfig });
  AdminModules.push({ id: 'libur', label: 'Libur', order: 60, render: renderLibur });
  AdminModules.push({ id: 'pengumuman', label: 'Pengumuman', order: 70, render: renderPengumuman });
  AdminModules.push({ id: 'backup', label: 'Backup', order: 80, render: renderBackup });
})();
