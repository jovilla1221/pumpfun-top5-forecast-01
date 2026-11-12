# Entri FINAL yang berlaku — v7 "jembatan" (pumpfun-top5-forecast-01)

Dokumen acuan untuk @yo-lo / tim Rereh dan agent lain, diperbarui 12 Nov 2026 ±20:30 WIB.
Dokumen ini MENGGANTIKAN status di `FORMULA-V5-TOP-LB.md` dan `ARGON-FORMULA-V9.md`:
entri yang berlaku sekarang BUKAN lagi round 8 (v5 murni).

## Status final (terverifikasi dari server make.fun)

- Entri berlaku: **submission #10, ID `01a1cfb4-d276-7186-9965-45eaaaf2c2b1`**, stage **scored**.
- Kode: commit remote `a8d75fcf` di repo ini (snapshot dari commit lokal `546b047`,
  tree identik). Isi = `main.ts` v5 + suku jembatan di bawah.
- Skor practice RESMI #10: total **-33,152723** (order -18,749426, size -14,403296,
  agreement 62) — **persis sama dengan v5, memang begitu rancangannya** (lihat alasan di bawah).
- Peringkat practice saat cek terakhir malam penutupan: **22 dari 947** entri di papan.
- Kuota submission **HABIS 10/10. Jangan submit lagi untuk bounty ini.**
- Entri tutup Kamis 12 Nov 2026 21:00 WIB. Final dinilai di data baru setelah tutup;
  hasil resmi terbit paling lambat **2026-11-27**. Klaim USDC manual hanya bila
  peringkat final masuk zona berbayar (total $200; peringkat 1 = $50 menurun
  sampai peringkat 10 = $12, sesuai halaman bounty) DAN di atas entri house terbaik di final.
- PERINGATAN dari bounty werewolf (sudah kejadian hari yang sama): pemilik bounty bisa
  membatalkan penilaian final dan menentukan peringkat dari skor PRACTICE. Dalam skenario
  itu peringkat practice kita 22 berada di LUAR zona berbayar. Jangan anggap practice
  "cuma latihan".

## Formula jembatan (satu-satunya perbedaan dari v5)

Di blok size histograms `main.ts`, penyesuaian per read ditambah satu suku:

```
adj = -SIZE_DOWN0 * exp(-h / 0.6)          // v5: 0,09, geser turun read awal
      - SIZE_FLATTEN * (mr - m0)           // v5: 0,45, perataan ramp berjangkar read[0]
      - SIZE_GAP_DOSE * (1 - exp(-max(0, h - 1.2) / 2.5))   // BARU: SIZE_GAP_DOSE = 0,17
```

- Suku baru **persis nol untuk semua read dengan h <= 1,2**, jadi output di jendela
  practice byte-identik dengan v5 (sha256 sama, terverifikasi) dan skor practice tidak berubah.
- Di geometri final, read pertama berada di h≈7 (blind gap ±7 jam sesudah cut), tempat
  suku exp v5 sudah mati dan jangkar flatten (m0) ikut terangkat oleh seluruh blind gap.
  Di sana suku jembatan menurunkan pusat sizes ±0,14 per place, memulihkan dosis geser
  turun yang memenangkan jendela practice.

## Kenapa varian ini diambil (konsultasi Argon High, ronde 2)

- Analisis Argon: kemenangan size v5 hampir seluruhnya berasal dari perataan ramp 45%
  yang berjangkar di read[0]. Di final read[0] = h7, bukan h1 seperti practice, sehingga
  v5 murni diperkirakan UNDER-DOSED ±45-50% di jendela final (potensi kehilangan
  0,6-0,8 poin size).
- Interpolasi parabola 3 titik dari pengukuran resmi menempatkan puncak dosis di ±1,1x;
  varian jembatan adalah cara mencapai dosis itu TANPA mengubah satu pun output practice.
- Keputusan eksplisit user: "Submit varian jembatan sekarang" (18:52 WIB), lalu
  "Gambling, eksekusi #10" (19:20 WIB) setelah #9 ditolak server (lihat bawah).

## Perjalanan submission #9 dan #10 (penting untuk agent lain)

- #9 (varian jembatan, bundle lama): **REJECTED** pada cek `thinking_priced`. Bukan karena
  kode: server mengganti `pricing_rev` di tengah hari (1ea1b8ea pagian menjadi 69078b05).
  Di rev baru, sesi Muse app WAJIB membawa minimal 1 baris usage, dan file sesi Muse
  tidak pernah memuat usage (usage disimpan Muse di databasenya).
- #10 LOLOS dengan resep bundle generasi baru, ini resep WAJIB untuk semua bounty
  make.fun berikutnya dari agent Muse:
  1. Unduh kit SEGAR dari server (`https://make.fun/c/<slug>/kit`); CLI lama menolak
     atau tidak mengenal mekanisme baru.
  2. Bundle dari file sesi Muse ASLI (`~/agents/<agent>/sessions/<id>.jsonl`),
     TANPA konversi format ke Claude Code (konversi selalu gagal `thinking_priced`).
  3. Ekspor baris usage sesi build dari database Muse dengan SQL persis dari
     `bundle --help` kit segar (tabel `agent.agent_message_token_usage` JOIN
     `agent.agents`; isinya hanya agent_id, message_id, waktu, jumlah token, nama
     model, TANPA teks pesan), tulis apa adanya ke file JSONL.
  4. `bundle --harness Muse --provider Meta --model muse-spark-1.3 --muse-usage <file>`
     lalu submit dari chat koordinator saja.
- Submission yang rejected TIDAK menggeser entri valid yang berdiri (aturan Force_Last);
  #9 yang ditolak tidak membatalkan round 8, dan #10 yang lolos menggantikannya.

## Aturan main untuk eksperimen lanjutan (bounty lain / musim berikutnya)

- Acuan satu-satunya = skor practice RESMI dari server. Backtest lokal untuk size
  terbukti anti-prediktif 4x di bounty ini; backtest order akurat. Jangan sajikan
  angka lokal seolah skor resmi.
- Satu variabel per uji; simpan titik restore (di sini v5) dan pulihkan segera bila
  varian baru kalah resmi.
- Konsultasi Argon High wajib sebelum formula dibekukan; saran Argon = hipotesis,
  diuji satu eksperimen terkontrol, disimpan hanya bila skor resmi membaik.
- Peringkat practice dilaporkan apa adanya, termasuk risikonya; jangan dibingkai
  "cuma latihan" (lihat peringatan werewolf di atas).
