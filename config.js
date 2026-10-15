/* config.js — ganti GAS_URL dengan URL Web App hasil deploy (berakhiran /exec). */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbylfeyfvtLqQKcPP5RVDtgTStxbL1Row4KqftAF75qASWF3yew2i6vgmpv-6UuF63Htfw/exec';

const APP = {
  versiSkema: 1,                 // versi skema IndexedDB
  batasEditHariDefault: 1,       // dioverride dari respons login server
  syncIntervalMs: 60000,         // sync berkala saat online & tab terlihat
  apiTimeoutMs: 25000,
  maksPush: 50,                  // harus <= PUSH_MAKS di Code.gs
  offlineMaksGagal: 5,           // batas percobaan login offline
  offlineKunciMenit: 15,
  pbkdf2Iter: 150000
};
