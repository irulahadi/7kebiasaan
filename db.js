/* db.js — IndexedDB `db7kebiasaan` + repositori data. Semua record milik pengguna diberi owner_id.
 * Catatan desain: store referensi dan kebiasaan memakai keyPath gabungan `rid` = owner_id + ':' + id,
 * agar akun berbeda di satu perangkat (mis. siswa dan gurunya) tidak saling menimpa record yang sama. */
const DB = (() => {
  let _db = null;
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('db7kebiasaan', APP.versiSkema);
      r.onupgradeneeded = () => {
        const d = r.result;
        const mk = (n, kp, idx, opt) => {
          const s = d.createObjectStore(n, Object.assign({ keyPath: kp }, opt || {}));
          (idx || []).forEach(i => s.createIndex(i[0], i[1]));
          return s;
        };
        mk('session', 'key'); mk('meta', 'key');
        mk('users', 'rid', [['owner_id', 'owner_id'], ['role', 'role'], ['kelas', 'kelas']]);
        mk('kebiasaan', 'rid', [['owner_id', 'owner_id'], ['owner_nisn', ['owner_id', 'nisn']],
          ['owner_nisn_tanggal', ['owner_id', 'nisn', 'tanggal']], ['sync_status', 'sync_status'], ['updated_at', 'updated_at']]);
        ['config', 'libur', 'pengumuman', 'tahunAjaran', 'dashboard'].forEach(n => mk(n, 'rid', [['owner_id', 'owner_id']]));
        mk('syncQueue', 'qid', [['owner_id', 'owner_id'], ['status', 'status'], ['rid', 'rid']], { autoIncrement: true });
      };
      r.onsuccess = () => { _db = r.result; _db.onversionchange = () => _db.close(); res(_db); };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('Database terblokir oleh tab lain'));
    });
  }
  function tx(names, mode, fn) {
    return new Promise((res, rej) => {
      const t = _db.transaction(names, mode);
      let out;
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transaksi dibatalkan'));
      Promise.resolve().then(() => fn(t)).then(v => { out = v; }).catch(e => { try { t.abort(); } catch (_) { /* sudah selesai */ } rej(e); });
    });
  }
  const st = (store, mode) => _db.transaction(store, mode || 'readonly').objectStore(store);
  const get = (store, key) => rq(st(store).get(key));
  const put = (store, val) => rq(st(store, 'readwrite').put(val));
  const del = (store, key) => rq(st(store, 'readwrite').delete(key));
  const all = store => rq(st(store).getAll());
  const byIndex = (store, index, key) => rq(st(store).index(index).getAll(IDBKeyRange.only(key)));
  const clear = store => rq(st(store, 'readwrite').clear());
  function each(request, fn) {
    return new Promise((res, rej) => {
      request.onsuccess = () => {
        const c = request.result;
        if (!c) return res();
        if (fn(c) === false) return res();
        c.continue();
      };
      request.onerror = () => rej(request.error);
    });
  }
  // hapus (di dalam transaksi t) semua record store milik owner yang lolos pred
  const delOwner = (t, store, owner, pred) =>
    each(t.objectStore(store).index('owner_id').openCursor(IDBKeyRange.only(owner)), c => { if (!pred || pred(c.value)) c.delete(); });
  function reset() {
    return new Promise((res, rej) => {
      if (_db) _db.close();
      const r = indexedDB.deleteDatabase('db7kebiasaan');
      r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res();
    });
  }
  return { open, tx, rq, get, put, del, all, byIndex, clear, each, delOwner, reset };
})();

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

const Repo = {
  async getEntri(owner, nisn, tanggal) {
    const r = await DB.byIndex('kebiasaan', 'owner_nisn_tanggal', [owner, nisn, tanggal]);
    return r[0] || null;
  },
  async listEntri(owner, nisn) {
    const r = await DB.byIndex('kebiasaan', 'owner_nisn', [owner, nisn]);
    return r.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  },
  // Simpan entri milik siswa + masukkan ke outbox (digabung bila sudah ada item untuk entri yang sama).
  async saveEntri(owner, nisn, tanggal, fields) {
    return DB.tx(['kebiasaan', 'syncQueue'], 'readwrite', async t => {
      const ks = t.objectStore('kebiasaan'), qs = t.objectStore('syncQueue');
      const ex = (await DB.rq(ks.index('owner_nisn_tanggal').getAll(IDBKeyRange.only([owner, nisn, tanggal]))))[0];
      const id = ex ? ex.id : uuid();
      const rec = Object.assign({}, ex || {}, fields, {
        id: id, rid: owner + ':' + id, owner_id: owner, nisn: nisn, tanggal: tanggal,
        sync_status: 'pending', error: '', local_rev: ((ex && ex.local_rev) || 0) + 1
      });
      await DB.rq(ks.put(rec));
      const q = await DB.rq(qs.index('rid').getAll(IDBKeyRange.only(rec.rid)));
      if (!q.length) await DB.rq(qs.add({ owner_id: owner, rid: rec.rid, status: 'pending', percobaan: 0, error_terakhir: '', dibuat: Date.now() }));
      else { const it = q[0]; it.status = 'pending'; it.percobaan = 0; it.error_terakhir = ''; await DB.rq(qs.put(it)); }
      return rec;
    });
  },
  queueByOwner: owner => DB.byIndex('syncQueue', 'owner_id', owner),
  queueAll: () => DB.all('syncQueue'),
  async ulangiGagal() {
    return DB.tx(['syncQueue', 'kebiasaan'], 'readwrite', async t => {
      const items = (await DB.rq(t.objectStore('syncQueue').getAll())).filter(i => i.status === 'error');
      for (const it of items) {
        it.status = 'pending'; it.percobaan = 0; await DB.rq(t.objectStore('syncQueue').put(it));
        const rec = await DB.rq(t.objectStore('kebiasaan').get(it.rid));
        if (rec) { rec.sync_status = 'pending'; await DB.rq(t.objectStore('kebiasaan').put(rec)); }
      }
      return items.length;
    });
  }
};
