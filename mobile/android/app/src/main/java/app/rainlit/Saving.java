package app.rainlit;

import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** Saving files and pictures from chats to the phone's Downloads folder (in a Rainlit folder). */
final class Saving {

    private Saving() {}

    static String safeName(String name) {
        String clean = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return clean.isEmpty() ? "rainlit-file" : clean.length() > 120 ? clean.substring(clean.length() - 120) : clean;
    }

    /** Downloads a web address (a chat file, still signed in, or a GIF) with Android's download manager. */
    static void download(Context context, String url, String name, String type) {
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
            .setTitle(safeName(name))
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        String cookie = CookieManager.getInstance().getCookie(url);
        if (cookie != null) request.addRequestHeader("Cookie", cookie);
        if (type != null && !type.isEmpty()) request.setMimeType(type);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Rainlit/" + safeName(name));
        } else {
            // Older Androids would need a storage permission for the shared Downloads folder.
            request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, safeName(name));
        }
        context.getSystemService(DownloadManager.class).enqueue(request);
        Toast.makeText(context, "Saving to Downloads…", Toast.LENGTH_SHORT).show();
    }

    /** Saves bytes the page already has (a file sent straight through a call). */
    static void saveBytes(Context context, byte[] data, String name, String type) throws Exception {
        String file = safeName(name);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = context.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, file);
            if (type != null && !type.isEmpty()) values.put(MediaStore.Downloads.MIME_TYPE, type);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Rainlit");
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("Couldn't save");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                out.write(data);
            }
        } else {
            File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            try (OutputStream out = new FileOutputStream(new File(dir, file))) {
                out.write(data);
            }
        }
        Toast.makeText(context, "Saved " + file + " to Downloads", Toast.LENGTH_SHORT).show();
    }
}
