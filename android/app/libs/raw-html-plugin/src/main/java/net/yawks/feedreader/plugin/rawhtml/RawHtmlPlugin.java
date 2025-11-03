package net.yawks.feedreader.plugin.rawhtml;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URLDecoder;

import fi.iki.elonen.NanoHTTPD;
import okhttp3.Credentials;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

import java.util.HashMap;
import java.util.Map;

/**
 * Capacitor plugin with local HTTP proxy server (like Tauri desktop).
 * Provides:
 * - fetchRawHtml: fetch HTML server-side (bypass CORS)
 * - startProxyServer: starts local HTTP proxy that rewrites URLs
 * - setProxyAuth: set HTTP Basic Auth credentials for a domain
 */
@CapacitorPlugin(name = "RawHtml")
public class RawHtmlPlugin extends Plugin {

    private static final String TAG = "RawHtmlPlugin";
    private OkHttpClient client = new OkHttpClient();
    private ProxyServer proxyServer;
    private Map<String, String> authCredentials = new HashMap<>();
    private String currentBaseUrl = "";

    @PluginMethod
    public void fetchRawHtml(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Missing url");
            return;
        }

        try {
            // Extract domain for auth lookup
            String domain = null;
            try {
                java.net.URL urlObj = new java.net.URL(url);
                domain = urlObj.getProtocol() + "://" + urlObj.getHost();
                if (urlObj.getPort() != -1) {
                    domain += ":" + urlObj.getPort();
                }
            } catch (Exception e) {
                Log.e(TAG, "Error parsing URL for domain in fetchRawHtml", e);
            }
            
            // Build request with optional auth
            Request.Builder reqBuilder = new Request.Builder().url(url);
            
            // Add Authorization header if we have credentials for this domain
            if (domain != null) {
                String auth = getAuthForDomain(domain);
                if (auth != null) {
                    reqBuilder.addHeader("Authorization", auth);
                    Log.d(TAG, "Adding auth for domain in fetchRawHtml: " + domain);
                }
            }
            
            Request req = reqBuilder.get().build();
            Response res = client.newCall(req).execute();
            
            // Check for 401 Unauthorized
            if (res.code() == 401) {
                Log.d(TAG, "401 in fetchRawHtml - auth required for: " + domain);
                // Return special error that will trigger auth dialog
                JSObject ret = new JSObject();
                ret.put("error", "auth_required");
                ret.put("domain", domain);
                call.reject("AUTH_REQUIRED", "401", ret);
                return;
            }
            
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

    @PluginMethod
    public void startProxyServer(PluginCall call) {
        if (proxyServer != null && proxyServer.isAlive()) {
            JSObject ret = new JSObject();
            ret.put("port", proxyServer.getListeningPort());
            call.resolve(ret);
            return;
        }

        try {
            int port = findAvailablePort();
            proxyServer = new ProxyServer(port, client, this);
            proxyServer.start();
            Log.d(TAG, "Proxy server started on port " + port);
            
            JSObject ret = new JSObject();
            ret.put("port", port);
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Failed to start proxy server: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void setProxyUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Missing url");
            return;
        }
        
        currentBaseUrl = url;
        Log.d(TAG, "Set proxy base URL: " + url);
        call.resolve();
    }

    @PluginMethod
    public void setProxyAuth(PluginCall call) {
        String domain = call.getString("domain");
        String username = call.getString("username");
        String password = call.getString("password");
        
        if (domain == null || username == null || password == null) {
            call.reject("Missing domain, username or password");
            return;
        }
        
        String credentials = Credentials.basic(username, password);
        authCredentials.put(domain, credentials);
        Log.d(TAG, "Set auth credentials for domain: " + domain);
        call.resolve();
    }

    @PluginMethod
    public void clearProxyAuth(PluginCall call) {
        String domain = call.getString("domain");
        if (domain == null) {
            call.reject("Missing domain");
            return;
        }
        
        authCredentials.remove(domain);
        Log.d(TAG, "Cleared auth credentials for domain: " + domain);
        call.resolve();
    }

    public String getCurrentBaseUrl() {
        return currentBaseUrl;
    }

    public String getAuthForDomain(String domain) {
        return authCredentials.get(domain);
    }

    private int findAvailablePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

    /**
     * Local HTTP proxy server using NanoHTTPD
     */
    private static class ProxyServer extends NanoHTTPD {
        private final OkHttpClient client;
        private final RawHtmlPlugin plugin;

        public ProxyServer(int port, OkHttpClient client, RawHtmlPlugin plugin) {
            super(port);
            this.client = client;
            this.plugin = plugin;
        }

        @Override
        public Response serve(IHTTPSession session) {
            String uri = session.getUri();
            Log.d(TAG, "Proxy request: " + uri);

            try {
                if (uri.startsWith("/proxy")) {
                    // Extract target URL from query parameter
                    String query = session.getQueryParameterString();
                    if (query != null && query.startsWith("url=")) {
                        String encodedUrl = query.substring(4);
                        String targetUrl = URLDecoder.decode(encodedUrl, "UTF-8");
                        
                        Log.d(TAG, "Proxying: " + targetUrl);
                        
                        // Extract domain from URL for auth lookup
                        String domain = null;
                        try {
                            java.net.URL url = new java.net.URL(targetUrl);
                            domain = url.getProtocol() + "://" + url.getHost();
                            if (url.getPort() != -1) {
                                domain += ":" + url.getPort();
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Error parsing URL for domain", e);
                        }
                        
                        // Build request with optional auth
                        Request.Builder reqBuilder = new Request.Builder()
                            .url(targetUrl)
                            .addHeader("User-Agent", "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36");
                        
                        // Add Authorization header if we have credentials for this domain
                        if (domain != null) {
                            String auth = plugin.getAuthForDomain(domain);
                            if (auth != null) {
                                reqBuilder.addHeader("Authorization", auth);
                                Log.d(TAG, "Adding auth for domain: " + domain);
                            }
                        }
                        
                        Request req = reqBuilder.get().build();
                        okhttp3.Response res = client.newCall(req).execute();
                        
                        // Check for 401 Unauthorized
                        if (res.code() == 401) {
                            Log.d(TAG, "401 Unauthorized - auth required for: " + domain);
                            // Return HTML page with script that requests auth via postMessage
                            String authHtml = "<!DOCTYPE html><html><head><meta charset='UTF-8'></head><body>" +
                                "<script>" +
                                "window.parent.postMessage({" +
                                "  type: 'PROXY_AUTH_REQUIRED'," +
                                "  domain: '" + domain.replace("'", "\\'") + "'" +
                                "}, '*');" +
                                "</script>" +
                                "<p style='font-family: system-ui; text-align: center; padding: 2rem;'>" +
                                "Authentication required for " + domain + "</p>" +
                                "</body></html>";
                            return newFixedLengthResponse(Response.Status.OK, 
                                "text/html; charset=utf-8", authHtml);
                        }
                        
                        if (!res.isSuccessful()) {
                            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, 
                                "text/plain", "Proxy error: " + res.code());
                        }
                        
                        String contentType = res.header("Content-Type", "text/html");
                        byte[] body = res.body() != null ? res.body().bytes() : new byte[0];
                        
                        // If HTML, rewrite URLs to use proxy
                        if (contentType.contains("text/html")) {
                            String html = new String(body, "UTF-8");
                            String baseUrl = plugin.getCurrentBaseUrl();
                            int port = getListeningPort();
                            
                            // Simple URL rewriting (similar to Rust proxy)
                            html = rewriteHtmlUrls(html, baseUrl, port);
                            body = html.getBytes("UTF-8");
                        }
                        
                        return newFixedLengthResponse(Response.Status.OK, contentType, 
                            new java.io.ByteArrayInputStream(body), body.length);
                    }
                }
                
                return newFixedLengthResponse(Response.Status.NOT_FOUND, 
                    "text/plain", "Not found");
                    
            } catch (Exception e) {
                Log.e(TAG, "Proxy error", e);
                return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, 
                    "text/plain", "Error: " + e.getMessage());
            }
        }

        private String rewriteHtmlUrls(String html, String baseUrl, int port) {
            try {
                java.net.URL base = new java.net.URL(baseUrl);
                String proxyBase = "http://localhost:" + port + "/proxy?url=";
                
                // Rewrite src attributes (images, scripts)
                html = html.replaceAll(
                    "(<[^>]+src=['\"])(?!http|data:|blob:)([^'\"]+)(['\"])",
                    "$1" + proxyBase + "$2" + "$3"
                );
                
                // Rewrite href attributes (stylesheets)
                html = html.replaceAll(
                    "(<link[^>]+href=['\"])(?!http|data:|blob:|#|javascript:)([^'\"]+)(['\"])",
                    "$1" + proxyBase + "$2" + "$3"
                );
                
                return html;
            } catch (Exception e) {
                Log.e(TAG, "URL rewriting error", e);
                return html;
            }
        }
    }
}
