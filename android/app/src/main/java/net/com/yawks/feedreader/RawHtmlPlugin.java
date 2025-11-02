package net.yawks.feedreader;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Simple Capacitor plugin to fetch raw HTML server-side (bypassing CORS).
 */
public class RawHtmlPlugin extends Plugin {

    private OkHttpClient client = new OkHttpClient();

    @PluginMethod
    public void fetchRawHtml(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Missing url") ;
            return;
        }

        try {
            Request req = new Request.Builder().url(url).get().build();
            Response res = client.newCall(req).execute();
            if (!res.isSuccessful()) {
                call.reject("HTTP error: " + res.code());
                return;
            }
            String body = res.body() != null ? res.body().string() : "";
            JSObject ret = new JSObject();
            ret.put("html", body);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to fetch: " + e.getMessage(), e);
        }
    }
}
