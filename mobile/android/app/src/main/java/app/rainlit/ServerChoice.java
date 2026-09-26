package app.rainlit;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import com.getcapacitor.CapConfig;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Which Rainlit server the app opens: rainlit.app (built in), or another one you picked (anyone
 * can run their own; see SELF-HOSTING.md). For another server, the app starts with its built-in
 * settings but that server's address in place of rainlit.app, so everything the app does
 * (calls, notifications, saving files) works there too.
 */
final class ServerChoice {

    static final String DEFAULT = "https://rainlit.app";

    private ServerChoice() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("rainlit.server", Context.MODE_PRIVATE);
    }

    /** The server you picked, or null for rainlit.app. */
    static String picked(Context context) {
        String url = prefs(context).getString("url", null);
        return url != null && url.matches("^https://[^/]+$") ? url : null;
    }

    static void pick(Context context, String url) {
        SharedPreferences.Editor e = prefs(context).edit();
        if (url == null || DEFAULT.equals(url)) e.remove("url");
        else e.putString("url", url);
        e.commit(); // (the app starts again straight after)
    }

    /** The app's settings for the server you picked, or null to use the built-in ones. */
    static CapConfig config(Context context) {
        String url = picked(context);
        if (url == null) return null;
        try {
            JSONObject json = new JSONObject(read(context.getAssets().open("capacitor.config.json")));
            JSONObject server = json.getJSONObject("server");
            server.put("url", url);
            server.put("allowNavigation", new JSONArray().put(Uri.parse(url).getAuthority()));
            // (The "can't reach it" page tries this server again, and offers rainlit.app.)
            server.put("errorPath", "offline.html?server=" + Uri.encode(url));
            File dir = new File(context.getFilesDir(), "server-config");
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            try (FileOutputStream out = new FileOutputStream(new File(dir, "capacitor.config.json"))) {
                out.write(json.toString().getBytes(StandardCharsets.UTF_8));
            }
            return CapConfig.loadFromFile(context, dir.getAbsolutePath());
        } catch (Exception e) {
            return null; // something's off: rainlit.app, as built in
        }
    }

    /** An address as typed ("chat.example.com", "https://chat.example.com/"), as https://host. */
    static String clean(String typed) {
        if (typed == null) return null;
        String text = typed.trim();
        if (!text.matches("^[a-zA-Z][a-zA-Z0-9+.-]*://.*")) text = "https://" + text;
        Uri uri = Uri.parse(text);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getAuthority() == null || uri.getAuthority().isEmpty()) return null;
        return "https://" + uri.getAuthority().toLowerCase(java.util.Locale.ROOT);
    }

    /**
     * Is there a Rainlit server at this address? Returns { url, name }, or throws with a
     * message for the person. Talks to the network: not on the main thread.
     */
    static JSONObject check(String url) throws IOException {
        HttpURLConnection con;
        try {
            con = (HttpURLConnection) new URL(url + "/api/server-info").openConnection();
            con.setConnectTimeout(8000);
            con.setReadTimeout(8000);
            con.setInstanceFollowRedirects(true);
            int status = con.getResponseCode();
            if (status < 200 || status >= 300) throw new IOException("There's no Rainlit server at that address.");
        } catch (IOException e) {
            if (e.getMessage() != null && e.getMessage().startsWith("There's no")) throw e;
            throw new IOException("Couldn't reach that address. Check it, and that the server's running.");
        }
        try {
            JSONObject info = new JSONObject(read(con.getInputStream()));
            if (!info.optBoolean("rainlit", false)) throw new IOException();
            JSONObject found = new JSONObject();
            // (It may have sent us on to its real address, like www.)
            URL landed = con.getURL();
            found.put("url", "https://" + landed.getAuthority());
            String name = info.optString("name", "Rainlit");
            found.put("name", name.length() > 60 ? name.substring(0, 60) : name);
            return found;
        } catch (Exception e) {
            throw new IOException("There's no Rainlit server at that address.");
        } finally {
            con.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream stream = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int total = 0;
            for (int n; (n = stream.read(buf)) > 0; ) {
                total += n;
                if (total > 256 * 1024) throw new IOException("too big");
                out.write(buf, 0, n);
            }
            return out.toString("UTF-8");
        }
    }
}
