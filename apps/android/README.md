# Android Capacitor Shell

Android ini adalah shell Capacitor untuk portal web Pengingat ANC. Aplikasi produksi memuat portal
web melalui HTTPS; tanpa alamat server, aplikasi hanya menampilkan halaman fallback lokal.

## Menyiapkan build lokal

1. Pastikan aplikasi web sudah dideploy ke URL HTTPS.
2. Di PowerShell, tetapkan URL tersebut hanya untuk sesi kerja saat ini:

   ```powershell
   $env:CAPACITOR_SERVER_URL = "https://contoh-domain-anda.id"
   npm.cmd run cap:sync --workspace=@anc/android
   ```

3. Buka folder `apps/android/android` menggunakan Android Studio, lalu pilih build `debug` atau
   `release`.

Atau, dari terminal:

```powershell
Set-Location apps/android/android
.\gradlew.bat assembleDebug
.\gradlew.bat assembleRelease
```

## Penandatanganan build release

Kredensial keystore tidak disimpan di repositori. Salin
`apps/android/android/keystore.properties.example` menjadi `keystore.properties` (diabaikan Git) lalu
isi nilainya, atau berikan lewat variabel lingkungan `ANC_ANDROID_KEYSTORE_FILE`,
`ANC_ANDROID_KEYSTORE_PASSWORD`, `ANC_ANDROID_KEY_ALIAS`, dan `ANC_ANDROID_KEY_PASSWORD`.
Tanpa kredensial tersebut `assembleRelease` menghasilkan APK yang belum ditandatangani, sedangkan
`assembleDebug` tidak terpengaruh.

## Push notification Firebase

Untuk mengaktifkan push notification pada build produksi, simpan file Firebase yang asli sebagai
`apps/android/android/app/google-services.json`. Berkas tersebut sudah diabaikan oleh Git dan tidak
boleh dikirim ke repositori.

Tanpa berkas Firebase, APK tetap dapat dibangun dan portal tetap dapat digunakan, tetapi push
notification tidak akan berfungsi.
