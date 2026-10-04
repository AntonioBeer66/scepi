package fr.scepi.app;

import android.content.Context;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewAssetLoader;
import java.io.InputStream;

final class RepositoryPathHandler implements WebViewAssetLoader.PathHandler {
    private final Context context;
    private final String root;

    RepositoryPathHandler(Context context, String root) {
        this.context = context;
        this.root = root;
    }

    @Override
    public WebResourceResponse handle(String path) {
        try {
            String asset = root + "/" + path;
            InputStream stream = context.getAssets().open(asset);
            String mime = mimeType(path);
            return new WebResourceResponse(mime, "UTF-8", stream);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".wav")) return "audio/wav";
        if (path.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }
}
