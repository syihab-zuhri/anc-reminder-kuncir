export const landingCopy = {
  brand: {
    name: "Pengingat ANC",
    descriptor: "Ruang pendampingan ibu hamil",
  },
  navigation: {
    workflow: "Cara kerja",
    access: "Ruang akses",
    mother: "Masuk ibu hamil",
    staff: "Masuk petugas",
  },
  hero: {
    eyebrow: "Ruang kerja kesehatan ibu",
    title: "Setiap kunjungan, terlihat dan tertata.",
    description:
      "Satu ruang yang tenang untuk membantu Puskesmas, Bidan, dan ibu hamil mengikuti jadwal pemeriksaan kehamilan (ANC) bersama.",
    primaryAction: "Lihat ruang akses",
    secondaryAction: "Pelajari alurnya",
    privacyNote: "Data ditampilkan secukupnya, sesuai peran dan wilayah kerja.",
  },
  preview: {
    eyebrow: "Jadwal pemeriksaan kehamilan",
    badge: "Model ANC WHO 2016",
    title: "Delapan kali periksa selama kehamilan.",
    description:
      "Jadwal dihitung dari tanggal HPHT. Pengingat dikirim selama waktu tiap kunjungan berjalan.",
    items: [
      {
        label: "Trimester 1",
        value: "K1",
        note: "Sampai usia 12 minggu",
      },
      {
        label: "Trimester 2",
        value: "K2–K3",
        note: "Usia 13–27 minggu",
      },
      {
        label: "Trimester 3",
        value: "K4–K8",
        note: "Usia 28 minggu sampai persalinan",
      },
    ],
    footnote: "Pengingat datang lewat aplikasi Android, atau lewat WhatsApp dari Bidan.",
  },
  workflow: {
    eyebrow: "Satu alur, tiga peran",
    title: "Informasi yang tepat untuk tindakan yang tepat.",
    description:
      "Setiap pengguna mendapat ruang kerja yang ringkas, sesuai peran dan wilayah tugasnya.",
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
    eyebrow: "Ruang akses",
    title: "Akses yang tepat, data yang secukupnya.",
    description:
      "Portal petugas dan portal ibu hamil telah terhubung ke layanan sistem pendampingan ANC.",
    staffTitle: "Portal petugas",
    staffDescription: "Untuk Puskesmas dan Bidan sesuai kewenangan.",
    motherTitle: "Akses ibu hamil",
    motherDescription: "Untuk melihat informasi kehamilan milik sendiri.",
    staffStatus: "Buka portal",
    motherStatus: "Buka portal",
  },
  footer: {
    statement: "Pendampingan ANC yang tenang, jelas, dan dapat ditindaklanjuti.",
    availability: "Bahasa Indonesia · Asia/Jakarta",
  },
} as const;
