# Formula v5 — yang menembus Top Leaderboard (pumpfun-top5-forecast-01)

Dokumen eksperimen untuk @yo-lo / tim Rereh, 12 Nov 2026.
Kode v5 PERSIS sudah ada di repo ini: `main.ts` pada commit `747d9b95`
(round 6) dan commit `d912895d` (round 8, restore; isi identik).
Submission round 8 `01a1ce47` adalah entri yang berlaku.
UPDATE 12 Nov 2026 malam: round 8 sudah DIGANTIKAN submission #10 (varian
jembatan v5 + suku blind-gap) sebagai entri final — lihat `FINAL-ENTRY-V7-BRIDGE.md`.
Skor practice RESMI v5: total **-33,152723** (order -18,749426, size -14,403296,
agreement 62) — peringkat 5-7 dari ±390, zona berbayar (top 10).

Dokumen ini merangkum resep lengkap v5 + seluruh peta pengukuran resmi,
supaya eksperimen lanjutan bisa dimulai dari titik terbaik, bukan dari nol.

## 1. Mesin dasar (dari v2, tidak berubah di v5)

- Monte Carlo **4.000 lintasan per answer read** (7 read), PRNG seeded,
  deterministik byte-identik, runtime ±4 detik.
- Langkah harga: **bootstrap distribusi empiris** perubahan log-cap SEMUA koin
  di history (ekor tebal asli dipertahankan; jangan diganti distribusi parametrik).
- Drift: slope log-cap per koin, **diredam dan meluruh** seiring horizon.
- Koin bisa **mati** di dalam lintasan.
- Generator pendatang baru **dua lapis**:
  - champion: lahir di dekat proyeksi cap place-1,
  - challenger: lahir di dekat proyeksi cap place-4/5,
  - kekuatan keduanya **dire dam sesaat setelah cut** (koin baru butuh ±10 menit
    untuk lahir dan graduate), lalu penuh.
- Probabilitas place = frekuensi pemenang lintasan, dicampur **25% Plackett-Luce**
  analitik (suhu melebar mengikuti horizon, T(h) = 0,14 + 0,22·h^0,42).
- Baris probabilitas: tepat 100/place; termasuk baris kecil 0,0012 untuk lapis
  tengah dan baris **p=0 untuk "zombie chart survivors"** (±80-83 koin/place:
  masih di chart tapi mati momentum) agar mereka keluar dari pembagian unnamed.
- Unnamed per place (sisa probabilitas) naik mengikuti horizon:
  practice ±0,31-0,75 total bernama per place (place 1 paling sedikit bernama);
  pada geometri final unnamed mencapai 0,72-0,84 per place.

## 2. Sizes v2 (sebelum koreksi v5)

Histogram log-cap PEMENANG simulasi per place per read, dicampur 15% model
analitik lama, lalu dirata-ratakan lintas read. Pusat output practice (log10 SOL):

    place 1..5 = 3,97 / 3,72 / 3,62 / 3,56 / 3,52 ; sd = 0,38 / 0,31 / 0,28 / 0,25 / 0,25

Skor resmi v2: total -34,97 (size -16,22, peringkat komponen size 59).

## 3. Koreksi v5 (SELURUH perbedaan v5 dari v2; order byte-identik)

Dua tuas pada sampel cap pemenang, per read r dengan horizon h jam:

1. **Geser turun per read:** setiap sampel digeser turun sebesar

       down(h) = 0,09 * exp(-h / 0,6)

   (parameter kode: SIZE_DOWN0 = 0,09, peluruhan 0,6 jam).

2. **Perataan ramp antar-read 45%:** kenaikan pusat antar-read diratakan;
   pusat read r menjadi

       mu_flat[r] = mu[0] + 0,55 * (mu[r] - mu[0])

   (parameter kode: SIZE_FLATTEN = 0,45). Lebar dan bentuk ekor TIDAK diubah.

Hasil pusat output practice v5 (terukur dari file output):

    place 1..5 = 3,84 / 3,59 / 3,49 / 3,44 / 3,41 ; sd = 0,36 / 0,29 / 0,26 / 0,24 / 0,24

Skor resmi v5: size **-14,403296** (peringkat komponen 15), total **-33,152723**.

## 4. Peta dosis-respons RESMI (satu-satunya bukti yang sah untuk sizes)

| Varian | Perubahan | Skor total | Size resmi |
|---|---|---|---|
| v1 | analitik PL murni | -37,83 | -18,38 |
| v2 | Monte Carlo (dosis 0) | -34,97 | -16,22 |
| v3 | v2 + sd sizes x0,88 (menyempit) | -35,29 | -16,54 |
| v4 | v2 + angkat read awal + winsorisasi ekor atas | -39,16 | -20,41 |
| v5 | v2 + geser turun + ramp datar 45% (dosis 1x) | **-33,15** | **-14,40** |
| v6 | dosis 1,5x v5 (DOWN0 0,135, FLATTEN 0,675) | -33,37 | -14,62 |

Kurva dosis (0x / 1x / 1,5x): -16,22 / -14,40 / -14,62 → puncak terinterpolasi
± dosis 1,1x ≈ -14,38 (hanya 0,02 di atas v5).

## 5. Aturan main eksperimen (terbukti mahal bila dilanggar)

- **Backtest lokal untuk SIZE anti-prediktif** (4x berturut berlawanan arah
  dengan resmi). Jangan memakai skor size lokal sebagai gerbang. Satu-satunya
  pengukur size yang sah adalah submission resmi (skorer practice).
- Backtest lokal untuk ORDER terbukti akurat 2x; grid order menyeluruh
  menunjukkan order v2/v5 di plateau (±0,2, arah bertabrakan antar potongan).
  Selisih order ke papan atas (±0,6) dinilai plateau + winner's curse.
- JANGAN menyempitkan distribusi sizes (v3) dan JANGAN mengangkat pusat /
  memotong ekor atas (v4). Arah yang terbukti: pusat TURUN, lebar UTUH.
- Aturan lomba: submission terakhir sebelum deadline (21:00 WIB 12 Nov) yang
  berlaku; setiap eksperimen yang di-submit WAJIB punya jatah restore ke
  versi terbaik terakhir. Kuota total 10; terpakai 8; sisa 2.
- Penilaian FINAL memakai jendela berbeda (history s.d. 20:00 WIB, read
  03:00-09:00 WIB keesokan hari, h=7..13). Untuk risiko under-dosing v5 di
  geometri final dan formula koreksinya, lihat `ARGON-FORMULA-V9.md` di repo ini.

## 6. Konteks papan (12 Nov ±12:47 WIB)

±393 entri; #1 -31,8; peringkat 10 (garis berbayar) ±-33,4; kita -33,152723.
Hadiah (dari peringkat FINAL, syarat di atas house terbaik): total $200 —
1=$50, 2=$30, 3=$24, 4=$20, 5=$16, 6-10=$12. Hasil final maks 27 Nov 2026.
