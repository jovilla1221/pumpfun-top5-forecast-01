# Usulan Formula v9 — Argon High (konsultasi ronde 2, 12 Nov 2026)

Sumber: konsultasi Gemini "Kode & analisis 4 Argon", penalaran Tinggi.
Percakapan: https://gemini.google.com/app/6c67110f19830a01
Status: USULAN, belum diimplementasikan, belum disubmit. Entri yang berlaku saat ini
tetap v5 (submission round 8, commit remote `d912895d`, skor practice -33,152723).

## Masalah yang dipecahkan

Kemenangan v5 (size resmi -16,22 → -14,40) hampir seluruhnya berasal dari perataan
ramp antar-read 45%, BUKAN dari suku geser `-0,09 * exp(-h / 0,6)` (kontribusi suku
itu di jendela practice hanya rata-rata -0,003 log).

Perataan ramp berjangkar di read[0]:

    mu_flat[r] = mu[0] + 0.55 * (mu[r] - mu[0])

- Practice: read[0] di h=1, jadi inflasi Monte Carlo h=1→7 ikut terpangkas 45%.
- Final: read[0] baru di h=7 (history berakhir 20:00 WIB, read pertama besok
  03:00 WIB; read di h=7..13). Inflasi selama blind gap h=0→7 lolos 100% tanpa
  pemangkasan, dan ramp h=7→13 lebih landai (akar h), jadi total koreksi v5 di
  final diperkirakan hanya ±-0,055..-0,065 log rata-rata (≈ dosis 0,5x), alias
  UNDER-DOSED. Estimasi Argon: potensi kehilangan 0,6-0,8 poin size di final.

## Formula usulan (satu-satunya perubahan dari v5)

Basis: kode v5 persis (commit lokal `b26ac11`; order 100% tidak berubah;
perataan ramp 45% dipertahankan; lebar/ekor sizes tidak disentuh).

Ganti suku pergeseran sampel per read dari:

    shift(h) = -0,09 * exp(-h / 0,6)

menjadi fungsi dua rezim:

    shift(h) = -0,09 * exp(-h / 0,6) - 0,065 * (1 - exp(-max(0, h - 2,0) / 2,5))

Catatan implementasi dari Argon: bila pergeseran diaplikasikan SEBELUM perataan
ramp, tambahkan suku kedua sebagai offset konstan pada distribusi PASCA-ramp
(atau pastikan komponen konstannya diteruskan utuh ±-0,056..-0,065 log ke semua
read); perataan ramp hanya boleh meredam kenaikan antar-read, bukan offset ini.

## Profil yang diharapkan (untuk verifikasi)

Jendela practice (h=1..7):
- h=1,2: suku kedua = 0 → identik v5.
- h=3..7: tambahan rata-rata ±-0,025 log → dosis efektif ±1,12x (puncak kurva
  dosis resmi: 0x -16,22; 1x -14,40; 1,5x -14,62; parabola puncak ±1,1x ≈ -14,38).
- Skor practice #9 diperkirakan -33,13..-33,18 (nyaris sama dengan v5 -33,152723);
  fungsi papan practice di sini hanya verifikasi tidak ada bug.

Jendela final (h=7..13):
- read[0] (h=7): koreksi awal -0,056 log.
- read[3] (h=10): total geser ±-0,117 log (suku kedua -0,062 + ramp ±-0,055).
- read[6] (h=13): total geser ±-0,174 log (suku kedua -0,064 + ramp ±-0,110).
- Rata-rata 7 read final: ±-0,118 log → kembali ke pita optimal -0,11..-0,13 log.
- Klaim EV Argon untuk final: +0,5..+0,9 poin vs v5. INI ESTIMASI, belum terukur;
  manfaat final tidak bisa diverifikasi sebelum hasil final terbit (maks 27 Nov).

## Wajib diverifikasi lokal sebelum submit (tanpa kuota)

1. Efek jangkar: jalankan kode v5 pada input sintetis bergeometri final
   (read h=7..13) dan ukur pusat sizes per read; bandingkan dengan geometri
   practice. Efek jangkar harus benar-benar ada di implementasi ini.
2. Profil rumus baru di KEDUA geometri harus cocok dengan tabel di atas.
3. Runtime pada h=13: pastikan jauh di bawah batas 300 detik (v5 di simulasi
   final 66 mark: ±4 detik).
4. Jangkar newcomer pada h=10..13: proyeksi place-1 dan place-4/5 tidak boleh
   kolaps/NaN bila koin history yang bertahan di satu lintasan < 5.
5. JANGAN menyempitkan lebar histogram sebagai kompensasi apa pun (pelajaran
   v3 -0,32 dan v4 -4,19). History final berasal dari jam sepi 07:00-13:00 UTC;
   lebar alami simulasi yang mengompensasinya.

## Konteks keputusan

- Kuota submission tersisa 2 dari 10: #9 = implementasi formula ini,
  #10 = restore darurat ke v5 HANYA bila #9 terlihat rusak (practice anjlok /
  bug). Bila #9 sehat di practice, #9 menjadi entri final dan #10 tidak dipakai.
- Deadline submission: hari ini 21:00 WIB. Penilaian final: history sampai
  20:00 WIB, 7 read 03:00-09:00 WIB besok; hadiah dari peringkat final saja
  (total $200: 1=$50, 2=$30, 3=$24, 4=$20, 5=$16, 6-10=$12), syarat skor final
  di atas entri house terbaik.
- Order dinyatakan plateau + winner's curse oleh Argon dan oleh grid lokal kami;
  jangan mengutak-atik order.
