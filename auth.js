/* auth.js — klien API, login online (NISN+PIN / staf), login offline (verifier PBKDF2), sesi multi-akun. */
class ApiError extends Error { constructor(kode, pesan) { super(pesan); this.kode = kode; } }

const API = {
  async post(aksi, token, data) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), APP.apiTimeoutMs);
    let resp;
    try {
      resp = await fetch(GAS_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctl.signal,
        body: JSON.stringify({ aksi: aksi, token: token || '', data: data || {}, v: 1 })
      });
    } catch (e) { throw new ApiError('JARINGAN', 'Tidak dapat terhubung ke server'); }
    finally { clearTimeout(to); }
    let j;
    try { j = await resp.json(); } catch (e) { throw new ApiError('JARINGAN', 'Respons server tidak valid'); }
    if (!j.ok) throw new ApiError(j.kode || 'SERVER', j.pesan || 'Terjadi kesalahan server');
    return j.data;
  }
};

async function pbkdf2Hex(secret, saltStr) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(saltStr), iterations: APP.pbkdf2Iter, hash: 'SHA-256' }, k, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function eqConst(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const Auth = {
  async saltPerangkat() {
    let m = await DB.get('meta', 'salt_perangkat');
    if (!m) { m = { key: 'salt_perangkat', value: uuid() + uuid() }; await DB.put('meta', m); }
    return m.value;
  },
  async verifier(secret, id) { return pbkdf2Hex(secret, (await this.saltPerangkat()) + ':' + id); },
  async semuaAkun() { return (await DB.all('session')).filter(x => x.key.indexOf('akun:') === 0); },
  async akunAktif() {
    const s = await DB.get('session', 'aktif');
    return s && s.id ? DB.get('session', 'akun:' + s.id) : null;
  },
  setAktif: id => DB.put('session', { key: 'aktif', id: id || null }),

  async loginOnline(jenis, ident, secret) {
    const d = await API.post(jenis === 'siswa' ? 'loginSiswa' : 'loginStaf', '',
      jenis === 'siswa' ? { nisn: ident, pin: secret } : { username: ident, password: secret });
    const akun = {
      key: 'akun:' + d.user.id, id: d.user.id, role: d.user.role, username: d.user.username, nama: d.user.nama, kelas: d.user.kelas,
      token: d.token, kedaluwarsa: d.kedaluwarsa, pin_wajib_ganti: !!d.user.pin_wajib_ganti,
      batas_edit_hari: d.batas_edit_hari, verifier: await this.verifier(secret, d.user.id), login_terakhir: Date.now()
    };
    await DB.put('session', akun);
    await this.setAktif(akun.id);
    return akun;
  },
  async loginOffline(jenis, ident, secret) {
    const uid = jenis === 'siswa' ? ident : ident.toLowerCase();
    const gKey = 'gagal:' + jenis + ':' + uid;
    const g = (await DB.get('meta', gKey)) || { key: gKey, n: 0, sampai: 0 };
    if (g.sampai > Date.now()) throw new ApiError('TERKUNCI', 'Terlalu banyak percobaan. Coba lagi dalam ' + APP.offlineKunciMenit + ' menit.');
    const pesan = jenis === 'siswa' ? 'NISN atau PIN salah' : 'Username atau password salah';
    const akun = (await this.semuaAkun()).find(a => a.username.toLowerCase() === uid.toLowerCase() && (jenis === 'siswa' ? a.role === 'siswa' : a.role !== 'siswa'));
    if (!akun) throw new ApiError('LOGIN', 'Login pertama di perangkat ini wajib dilakukan saat online.');
    const ok = eqConst(await this.verifier(secret, akun.id), akun.verifier || '');
    if (!ok) {
      g.n++;
      if (g.n >= APP.offlineMaksGagal) { g.sampai = Date.now() + APP.offlineKunciMenit * 60000; g.n = 0; }
      await DB.put('meta', g);
      throw new ApiError('LOGIN', pesan);
    }
    if (akun.pin_wajib_ganti) throw new ApiError('LOGIN', 'Anda wajib mengganti ' + (akun.role === 'siswa' ? 'PIN' : 'password') + ' saat online.');
    await DB.del('meta', gKey);
    akun.login_terakhir = Date.now(); await DB.put('session', akun);
    await this.setAktif(akun.id);
    return akun;
  },
  async simpanAkun(akun) { await DB.put('session', akun); }
};
