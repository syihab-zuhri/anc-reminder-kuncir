export const landingCopy = {
  brand: {
    name: "Pengingat ANC",
    descriptor: "Ruang pendampingan ibu hamil",
  },
  navigation: {
    workflow: "Cara kerja",
    access: "Ruang akses",
    staff: "Masuk petugas",
  },
  hero: {
    eyebrow: "Ruang kerja kesehatan ibu",
    title: "Setiap kunjungan, terlihat dan tertata.",
    description:
      "Satu ruang yang tenang untuk membantu Puskesmas, Bidan, dan ibu hamil mengikuti tindak lanjut ANC dari informasi yang disiapkan server.",
    primaryAction: "Lihat ruang akses",
    secondaryAction: "Pelajari alurnya",
    privacyNote: "Data ditampilkan secukupnya, sesuai peran dan wilayah kerja.",
  },
  preview: {
    eyebrow: "Ringkasan operasional",
    badge: "Fondasi aktif",
    title: "Ruang kerja siap disambungkan.",
    description:
      "Data operasional akan tampil setelah layanan autentikasi dan server API tersedia.",
    items: [
      {
        label: "Perlu perhatian",
        value: "—",
        note: "Menunggu data server",
      },
      {
        label: "Konfirmasi kunjungan",
        value: "—",
        note: "Menunggu data server",
      },
      {
        label: "Tindak lanjut pengingat",
        value: "—",
        note: "Menunggu data server",
      },
    ],
    footnote: "Tampilan ini tidak menghitung status ANC di perangkat.",
  },
  workflow: {
    eyebrow: "Satu alur, tiga peran",
    title: "Informasi yang tepat untuk tindakan yang tepat.",
    description:
      "Setiap pengguna mendapat ruang kerja yang ringkas tanpa membawa aturan klinis ke perangkat.",
    roles: [
      {
        index: "01",
        title: "Puskesmas",
        description:
          "Mengelola cakupan layanan, pencatatan, dan antrean tindak lanjut dalam satu pandangan.",
        label: "Ruang operasional",
      },
      {
        index: "02",
        title: "Bidan",
        description:
          "Melihat ibu hamil dalam penugasan dan menyelesaikan konfirmasi kunjungan secara ringkas.",
        label: "Ruang pendampingan",
      },
      {
        index: "03",
        title: "Ibu hamil",
        description:
          "Membuka ringkasan pribadi, informasi kunjungan berikutnya, dan kontak pendamping.",
        label: "Ruang pribadi",
      },
    ],
  },
  access: {
    eyebrow: "Akses bertahap",
    title: "Akses yang tepat, data yang secukupnya.",
    description:
      "Portal petugas dan akses pribadi ibu hamil akan diaktifkan bersama layanan autentikasi. Fondasi antarmuka sudah siap untuk tahap integrasi berikutnya.",
    staffTitle: "Portal petugas",
    staffDescription: "Untuk Puskesmas dan Bidan sesuai kewenangan.",
    motherTitle: "Akses ibu hamil",
    motherDescription: "Untuk melihat informasi kehamilan milik sendiri.",
    status: "Segera tersedia",
  },
  footer: {
    statement: "Pendampingan ANC yang tenang, jelas, dan dapat ditindaklanjuti.",
    availability: "Bahasa Indonesia · Asia/Jakarta",
  },
} as const;
