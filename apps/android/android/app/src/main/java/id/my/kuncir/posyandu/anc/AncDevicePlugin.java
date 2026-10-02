package id.my.kuncir.posyandu.anc;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * What the WebView cannot do by itself: it has no download handler, so a file "downloaded" by the
 * page is silently dropped, and window.print() does nothing. The portal calls these two methods
 * through window.Capacitor.Plugins.AncDevice instead.
 */
@CapacitorPlugin(name = "AncDevice")
public class AncDevicePlugin extends Plugin {

    private static final String DOWNLOAD_FOLDER = "Pengingat ANC";

    /**
     * Saves a base64 file to Download/Pengingat ANC (Android 10+). Older Android versions need a
     * storage permission for that folder, so the file goes to the share sheet instead and the
     * user picks where it ends up.
     */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String fileName = call.getString("fileName");
        String data = call.getString("data");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (fileName == null || fileName.trim().isEmpty() || data == null) {
            call.reject("Nama file dan isi file wajib diisi.");
            return;
        }
        String safeName = fileName.trim().replaceAll("[\\\\/:*?\"<>|]", "_");
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Isi file tidak valid.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(
                MediaStore.MediaColumns.RELATIVE_PATH,
                Environment.DIRECTORY_DOWNLOADS + "/" + DOWNLOAD_FOLDER
            );
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                call.reject("Folder Download tidak bisa ditulis.");
                return;
            }
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("No output stream");
                out.write(bytes);
            } catch (IOException e) {
                resolver.delete(uri, null, null);
                call.reject("File gagal disimpan.", e);
                return;
            }
            // MediaStore may rename a duplicate ("file (1).xlsx"); report the name it really used.
            JSObject result = new JSObject();
            result.put("location", Environment.DIRECTORY_DOWNLOADS + "/" + DOWNLOAD_FOLDER + "/" + storedName(resolver, uri, safeName));
            result.put("shared", false);
            call.resolve(result);
            return;
        }

        File dir = new File(getContext().getCacheDir(), "exports");
        if (!dir.isDirectory() && !dir.mkdirs()) {
            call.reject("Folder sementara tidak bisa dibuat.");
            return;
        }
        File file = new File(dir, safeName);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        } catch (IOException e) {
            call.reject("File gagal disimpan.", e);
            return;
        }
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeType);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(Intent.createChooser(send, "Simpan atau bagikan " + safeName));
        JSObject result = new JSObject();
        result.put("location", safeName);
        result.put("shared", true);
        call.resolve(result);
    }

    /** Opens the Android print dialog for the current page, which also offers "Save as PDF". */
    @PluginMethod
    public void print(PluginCall call) {
        String jobName = call.getString("jobName", "Pengingat ANC");
        getActivity()
            .runOnUiThread(() -> {
                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) {
                    call.reject("Layanan cetak tidak tersedia di perangkat ini.");
                    return;
                }
                PrintDocumentAdapter adapter = getBridge().getWebView().createPrintDocumentAdapter(jobName);
                printManager.print(
                    jobName,
                    adapter,
                    new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build()
                );
                call.resolve();
            });
    }

    private static String storedName(ContentResolver resolver, Uri uri, String fallback) {
        try (
            android.database.Cursor cursor = resolver.query(
                uri,
                new String[] { MediaStore.MediaColumns.DISPLAY_NAME },
                null,
                null,
                null
            )
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (RuntimeException ignored) {
            // The file is saved either way; fall back to the requested name.
        }
        return fallback;
    }
}
