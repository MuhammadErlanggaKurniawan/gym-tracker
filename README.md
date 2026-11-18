# Gym Tracker (web)

Web app buat nyatet latihan gym, dibuka dari Home Screen iPhone kayak app biasa (PWA).
Data disimpan di perangkat (localStorage), jalan offline, tanpa server dan tanpa akun.

Fitur: catat set (kg × reps) dengan isian otomatis dari sesi terakhir, rest timer
(±15 detik cuma buat istirahat yang lagi jalan; default diatur di tab Latihan), template rutinitas,
riwayat, progres per gerakan (rekor pribadi + grafik beban/volume/reps), ekspor CSV,
backup/pulihkan JSON.

## Pasang di iPhone

Buka URL-nya di Safari → Share → **Add to Home Screen** → pastikan **Open as Web App** nyala.

## Struktur

- `logic.js` — logika murni (parsing angka, format, statistik, timer, skala grafik). Tanpa DOM.
- `store.js` — model data, simpan/muat, ekspor CSV.
- `app.js` — tampilan dan interaksi.
- `sw.js` — cache offline. **Naikkan `CACHE` tiap deploy**, kalau nggak, HP tetap pakai versi lama.
- `tests/` — `node --test` buat `logic.js` dan `store.js`.

## Perintah

```bash
npm test                    # node --test tests/*.test.js
npm run serve               # python3 -m http.server 8000 → http://localhost:8000
```

Batasan yang diketahui: notifikasi rest timer waktu HP dikunci tidak ada (butuh server push);
getar tidak didukung Safari iOS; bunyi beep ikut tombol silent. Versi native SwiftUI ada di `~/gym-tracker`.
