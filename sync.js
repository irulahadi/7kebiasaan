/* sync.js — sinkronisasi dua arah. Push: outbox (syncQueue) per pemilik dengan token masing-masing.
 * Pull: delta sejak lastPullAt untuk pengguna aktif. Server = sumber kebenaran (last-write-wins). */
const Sync = (() => {
  const st = { online: typeof navigator !== 'undefined' ? navigator.onLine : true, berjalan: false, terakhir: 0, galat: '', antre: 0, gagal: 0 };
  const subs = [];
  let timer = null, retryT = null, backoffIdx = 0;
  const BACKOFF = [5000, 15000, 60000];
  const api = { onPaksaLogout: null, onGantiKredensial: null };

  const emit = () => subs.forEach(f => { try { f(st); } catch (e) { /* abaikan */ } });
  const subscribe = f => { subs.push(f); f(st); };

  async function hitungAntre() {
    const q = await Repo.queueAll();
    st.antre = q.filter(x => x.status === 'pending').length;
    st.gagal = q.filter(x => x.status === 'error').length;
    emit();
  }

  function wire(rec) {
    const e = {};
    ['id', 'tanggal', 'jam_bangun', 'jam_tidur', 'sholat_shubuh', 'sholat_dzuhur', 'sholat_ashar', 'sholat_maghrib', 'sholat_isya',
      'ket_shubuh', 'ket_dzuhur', 'ket_ashar', 'ket_maghrib', 'ket_isya', 'olahraga_kegiatan', 'olahraga_menit',
      'makan_sarapan', 'makan_siang', 'makan_malam', 'materi_belajar', 'aksi_masyarakat', 'versi_config', 'diedit_tanggal']
      .forEach(k => { e[k] = rec[k] == null ? '' : rec[k]; });
    e.nisn = rec.nisn; e.ekstra = rec.ekstra || {};
    return e;
  }

  // Tangani galat per pemilik akun. Mengembalikan true bila galat sudah ditangani (bukan galat jaringan).
  async function tanganiGalat(e, ownerId) {
    const akun = await DB.get('session', 'akun:' + ownerId);
    const aktif = await Auth.akunAktif();
    if (e.kode === 'TOKEN_INVALID') {
      if (akun) { akun.token = ''; await DB.put('session', akun); }
      if (aktif && aktif.id === ownerId && api.onPaksaLogout) await api.onPaksaLogout('Sesi berakhir atau akun dinonaktifkan. Silakan login ulang (data belum tersinkron tetap aman di perangkat).');
      return true;
    }
    if (e.kode === 'GANTI_KREDENSIAL') {
      if (akun) { akun.pin_wajib_ganti = true; await DB.put('session', akun); }
      if (aktif && aktif.id === ownerId && api.onGantiKredensial) await api.onGantiKredensial();
      return true;
    }
    return false;
  }

  async function pushOwner(ownerId) {
    const akun = await DB.get('session', 'akun:' + ownerId);
    if (!akun || !akun.token) return;
    let items = (await Repo.queueByOwner(ownerId)).filter(i => i.status === 'pending').sort((a, b) => a.dibuat - b.dibuat);
    while (items.length) {
      const batch = items.splice(0, APP.maksPush), entri = [], peta = {};
      for (const it of batch) {
        const rec = await DB.get('kebiasaan', it.rid);
        if (!rec) { await DB.del('syncQueue', it.qid); continue; }
        entri.push(wire(rec)); peta[rec.id] = { it: it, rev: rec.local_rev };
      }
      if (!entri.length) continue;
      let res;
      try { res = await API.post('pushKebiasaan', akun.token, { entri: entri }); }
      catch (e) {
        if (e.kode === 'JARINGAN' || e.kode === 'SERVER') {
          await DB.tx(['syncQueue'], 'readwrite', async t => { for (const k in peta) { const it = peta[k].it; it.percobaan = (it.percobaan || 0) + 1; await DB.rq(t.objectStore('syncQueue').put(it)); } });
        }
        throw e;
      }
      await DB.tx(['kebiasaan', 'syncQueue'], 'readwrite', async t => {
        const ks = t.objectStore('kebiasaan'), qs = t.objectStore('syncQueue');
        for (const h of res.hasil) {
          const m = peta[h.id]; if (!m) continue;
          const rec = await DB.rq(ks.get(m.it.rid));
          if (!rec) { await DB.rq(qs.delete(m.it.qid)); continue; }
          if (h.status === 'ok') {
            rec.updated_at = h.updated_at; rec.error = '';
            if (rec.local_rev === m.rev) { rec.sync_status = 'synced'; await DB.rq(qs.delete(m.it.qid)); }
            await DB.rq(ks.put(rec)); // bila diedit lagi saat dikirim: tetap pending dan dikirim ulang
          } else {
            rec.sync_status = 'error'; rec.error = h.alasan || 'Ditolak server'; await DB.rq(ks.put(rec));
            m.it.status = 'error'; m.it.error_terakhir = h.alasan || 'Ditolak server'; await DB.rq(qs.put(m.it));
          }
        }
      });
    }
  }

  async function pushSemua() {
    const q = (await Repo.queueAll()).filter(i => i.status === 'pending');
    const owners = [...new Set(q.map(i => i.owner_id))];
    let galatJaringan = null;
    for (const o of owners) {
      try { await pushOwner(o); }
      catch (e) { if (!(await tanganiGalat(e, o))) galatJaringan = e; } // galat satu akun tidak menghentikan akun lain
    }
    if (galatJaringan) throw galatJaringan;
  }

  function kebiasaanLokal(owner, r) {
    let ek = {};
    try { ek = r.ekstra_json ? JSON.parse(r.ekstra_json) : {}; } catch (e) { ek = {}; }
    const rec = Object.assign({}, r, { owner_id: owner, rid: owner + ':' + r.id, updated_at: Number(r.updated_at) || 0, ekstra: ek, sync_status: 'synced', error: '' });
    delete rec.ekstra_json; delete rec.deleted;
    return rec;
  }

  async function terapkanPull(akun, d) {
    const o = akun.id;
    await DB.tx(['kebiasaan', 'users', 'config', 'libur', 'tahunAjaran', 'pengumuman', 'meta', 'session'], 'readwrite', async t => {
      const put = (s, v) => DB.rq(t.objectStore(s).put(v));
      // referensi kecil: ganti seluruhnya
      for (const s of ['config', 'libur', 'tahunAjaran']) await DB.delOwner(t, s, o);
      for (const c of d.config.rows) await put('config', Object.assign({ rid: o + ':' + c.kunci, owner_id: o, versi: d.config.versi }, c));
      for (const l of d.libur) await put('libur', Object.assign({ rid: o + ':' + l.id, owner_id: o }, l));
      for (const p of d.tahunAjaran) await put('tahunAjaran', Object.assign({ rid: o + ':' + p.id, owner_id: o }, p));
      // pengumuman: delta
      const dibaca = new Set(d.dibaca || []);
      for (const p of d.pengumuman) {
        const rid = o + ':' + p.id;
        if (p.deleted) { await DB.rq(t.objectStore('pengumuman').delete(rid)); continue; }
        const ex = await DB.rq(t.objectStore('pengumuman').get(rid));
        const sudahServer = dibaca.has(p.id);
        await put('pengumuman', Object.assign({}, p, { rid: rid, owner_id: o,
          dibaca: !!(ex && ex.dibaca) || sudahServer,
          dibaca_sinkron: sudahServer ? true : !!(ex && ex.dibaca_sinkron) }));
      }
      // tanda baca dari server untuk pengumuman lama
      await DB.each(t.objectStore('pengumuman').index('owner_id').openCursor(IDBKeyRange.only(o)), c => {
        if (dibaca.has(c.value.id) && !c.value.dibaca) { const v = c.value; v.dibaca = true; v.dibaca_sinkron = true; c.update(v); }
      });
      // kebiasaan
      if (d.pull_penuh) await DB.delOwner(t, 'kebiasaan', o, r => r.sync_status === 'synced');
      if (akun.role === 'guru' && d.siswa) {
        const set = new Set(d.siswa.map(s => s.username));
        await DB.delOwner(t, 'users', o);
        for (const s of d.siswa) await put('users', Object.assign({ rid: o + ':' + s.id, owner_id: o }, s));
        await DB.delOwner(t, 'kebiasaan', o, r => !set.has(r.nisn));
      }
      if (akun.role === 'admin' && d.pengguna) {
        await DB.delOwner(t, 'users', o);
        for (const s of d.pengguna) await put('users', Object.assign({ rid: o + ':' + s.id, owner_id: o }, s));
      }
      for (const r of d.kebiasaan) {
        const rid = o + ':' + r.id, ex = await DB.rq(t.objectStore('kebiasaan').get(rid));
        if (ex && ex.sync_status !== 'synced') continue; // perubahan lokal belum terkirim tidak ditimpa
        if (r.deleted === '1') { await DB.rq(t.objectStore('kebiasaan').delete(rid)); continue; }
        await put('kebiasaan', kebiasaanLokal(o, r));
      }
      // profil akun
      const ak = await DB.rq(t.objectStore('session').get('akun:' + o));
      if (ak && d.profil) { ak.nama = d.profil.nama; ak.kelas = d.profil.kelas; await put('session', ak); }
      await put('meta', { key: 'lastPullAt:' + o, value: d.cursor });
    });
  }

  async function pullAktif() {
    const akun = await Auth.akunAktif();
    if (!akun || !akun.token) return;
    try {
      const m = await DB.get('meta', 'lastPullAt:' + akun.id);
      const d = await API.post('pullKebiasaan', akun.token, { since: m ? m.value : 0, sertakan_pengguna: akun.role === 'admin' });
      await terapkanPull(akun, d);
    } catch (e) { if (!(await tanganiGalat(e, akun.id))) throw e; }
  }

  async function kirimBaca() {
    const akun = await Auth.akunAktif();
    if (!akun || !akun.token) return;
    const list = (await DB.byIndex('pengumuman', 'owner_id', akun.id)).filter(p => p.dibaca && !p.dibaca_sinkron);
    if (!list.length) return;
    try {
      await API.post('tandaiBaca', akun.token, { ids: list.map(p => p.id).slice(0, 50) });
      for (const p of list.slice(0, 50)) { p.dibaca_sinkron = true; await DB.put('pengumuman', p); }
    } catch (e) { if (!(await tanganiGalat(e, akun.id)) && e.kode !== 'VALIDASI') throw e; }
  }

  function jadwalUlang() {
    clearTimeout(retryT);
    retryT = setTimeout(() => run(), BACKOFF[Math.min(backoffIdx++, BACKOFF.length - 1)]);
  }

  async function run() {
    if (st.berjalan || !navigator.onLine) return { dilewati: true };
    st.berjalan = true; st.galat = ''; emit();
    try {
      await pushSemua(); await pullAktif(); await kirimBaca();
      st.terakhir = Date.now(); backoffIdx = 0; clearTimeout(retryT);
      await DB.put('meta', { key: 'terakhirSync', value: st.terakhir });
    } catch (e) {
      st.galat = e.message || 'Sinkronisasi gagal';
      await DB.put('meta', { key: 'galatTerakhir', value: { waktu: Date.now(), pesan: st.galat } });
      if (e.kode === 'JARINGAN' || e.kode === 'SERVER') jadwalUlang();
    } finally {
      st.berjalan = false; await hitungAntre();
      if (api.onSelesai) api.onSelesai(st);
    }
    return { ok: !st.galat };
  }

  async function start() {
    const m = await DB.get('meta', 'terakhirSync'); st.terakhir = m ? m.value : 0;
    await hitungAntre();
    window.addEventListener('online', () => { st.online = true; emit(); run(); });
    window.addEventListener('offline', () => { st.online = false; emit(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden && navigator.onLine) run(); }, APP.syncIntervalMs);
    run();
  }

  return { st, api, subscribe, run, start, hitungAntre };
})();
