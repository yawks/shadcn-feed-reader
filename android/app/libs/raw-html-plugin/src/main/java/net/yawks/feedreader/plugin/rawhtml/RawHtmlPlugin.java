package net.yawks.feedreader.plugin.rawhtml;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URLDecoder;

import fi.iki.elonen.NanoHTTPD;
import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.Credentials;
import okhttp3.FormBody;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.Callback;
import okhttp3.Call;

import org.json.JSONArray;
import org.json.JSONObject;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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
    private static final String USER_AGENT = "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    // Cookie storage for session persistence across requests
    // Key is the cookie domain (or host if no domain), stores cookies by name to handle updates
    private final ConcurrentHashMap<String, Map<String, Cookie>> cookieStore = new ConcurrentHashMap<>();

    private final CookieJar cookieJar = new CookieJar() {
        @Override
        public void saveFromResponse(HttpUrl url, List<Cookie> cookies) {
            if (cookies.isEmpty()) return;

            for (Cookie cookie : cookies) {
                // Use cookie's domain if set, otherwise use host
                String domain = cookie.domain();

                // Get or create the cookie map for this domain
                Map<String, Cookie> domainCookies = cookieStore.computeIfAbsent(domain, k -> new ConcurrentHashMap<>());

                // Store cookie by name (this handles updates correctly)
                domainCookies.put(cookie.name(), cookie);
                Log.d(TAG, "Saved cookie '" + cookie.name() + "' for domain: " + domain);
            }
        }

        @Override
        public List<Cookie> loadForRequest(HttpUrl url) {
            List<Cookie> matchingCookies = new ArrayList<>();
            String host = url.host();

            // Check all stored domains for matching cookies
            for (Map.Entry<String, Map<String, Cookie>> entry : cookieStore.entrySet()) {
                String domain = entry.getKey();

                // Check if this domain matches the request host
                // A cookie domain ".example.com" should match "www.example.com" and "example.com"
                if (host.equals(domain) || host.endsWith("." + domain) || domain.equals("." + host) ||
                    (domain.startsWith(".") && host.endsWith(domain.substring(1)))) {

                    for (Cookie cookie : entry.getValue().values()) {
                        // Check if cookie is not expired and path matches
                        if (cookie.expiresAt() >= System.currentTimeMillis() &&
                            url.encodedPath().startsWith(cookie.path())) {
                            matchingCookies.add(cookie);
                        }
                    }
                }
            }

            if (!matchingCookies.isEmpty()) {
                Log.d(TAG, "Loading " + matchingCookies.size() + " cookies for: " + host);
            }
            return matchingCookies;
        }
    };

    // Build client with cookie jar for session persistence
    private OkHttpClient client = new OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .build();

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
            Request.Builder reqBuilder = new Request.Builder()
                .url(url)
                // Use a complete User-Agent that mimics a real Chrome browser on Android
                .addHeader("User-Agent", "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
                .addHeader("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
                .addHeader("Accept-Language", "en-US,en;q=0.9")
                .addHeader("Connection", "keep-alive")
                .addHeader("Upgrade-Insecure-Requests", "1");
            
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

    @PluginMethod
    public void performFormLogin(PluginCall call) {
        String loginUrl = call.getString("loginUrl");
        JSArray fieldsArray = call.getArray("fields");
        String responseSelector = call.getString("responseSelector");

        if (loginUrl == null || loginUrl.isEmpty()) {
            call.reject("Missing loginUrl");
            return;
        }

        if (fieldsArray == null) {
            call.reject("Missing fields");
            return;
        }

        try {
            // Build form body from fields array
            FormBody.Builder formBuilder = new FormBody.Builder();
            for (int i = 0; i < fieldsArray.length(); i++) {
                JSONObject field = fieldsArray.getJSONObject(i);
                String name = field.getString("name");
                String value = field.getString("value");
                formBuilder.add(name, value);
                Log.d(TAG, "Form field: " + name + " = [hidden]");
            }

            Request request = new Request.Builder()
                .url(loginUrl)
                .post(formBuilder.build())
                .addHeader("User-Agent", USER_AGENT)
                .addHeader("Content-Type", "application/x-www-form-urlencoded")
                .addHeader("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .addHeader("Accept-Language", "en-US,en;q=0.9")
                .build();

            Log.d(TAG, "Performing form login to: " + loginUrl);

            // Execute asynchronously
            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onResponse(Call httpCall, Response response) {
                    try {
                        int statusCode = response.code();
                        boolean success = response.isSuccessful() || response.isRedirect() ||
                                          (statusCode >= 300 && statusCode < 400);

                        Log.d(TAG, "Login response: " + statusCode + ", success: " + success);

                        // Log cookies received
                        String host = HttpUrl.parse(loginUrl).host();
                        Map<String, Cookie> domainCookies = cookieStore.get(host);
                        if (domainCookies != null) {
                            Log.d(TAG, "Cookies stored for " + host + ": " + domainCookies.size());
                        }

                        // Extract text using CSS selector if provided
                        String extractedText = null;
                        if (responseSelector != null && !responseSelector.isEmpty()) {
                            try {
                                String html = response.body().string();
                                Document doc = Jsoup.parse(html);
                                Elements elements = doc.select(responseSelector);
                                if (!elements.isEmpty()) {
                                    extractedText = elements.first().text().trim();
                                    Log.d(TAG, "Extracted text: " + extractedText);
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "Error extracting text with selector", e);
                            }
                        }

                        JSObject result = new JSObject();
                        result.put("success", success);
                        result.put("statusCode", statusCode);
                        result.put("message", "Status: " + statusCode);
                        if (extractedText != null) {
                            result.put("extractedText", extractedText);
                        }
                        call.resolve(result);
                    } catch (Exception e) {
                        Log.e(TAG, "Error processing login response", e);
                        call.reject("Error processing response: " + e.getMessage());
                    } finally {
                        response.close();
                    }
                }

                @Override
                public void onFailure(Call httpCall, IOException e) {
                    Log.e(TAG, "Login request failed", e);
                    call.reject("Login failed: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Error building login request", e);
            call.reject("Error: " + e.getMessage());
        }
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

        /**
         * Add CORS headers to a response
         */
        private Response addCorsHeaders(Response response) {
            response.addHeader("Access-Control-Allow-Origin", "*");
            response.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
            return response;
        }

        @Override
        public Response serve(IHTTPSession session) {
            String uri = session.getUri();
            String method = session.getMethod().toString();
            Log.d(TAG, "Proxy request: " + method + " " + uri);

            // Handle CORS preflight (OPTIONS request)
            if ("OPTIONS".equals(method)) {
                Response response = newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "");
                return addCorsHeaders(response);
            }

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
                            // Use a complete User-Agent that mimics a real Chrome browser on Android
                            .addHeader("User-Agent", "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
                            .addHeader("Accept", "*/*")
                            .addHeader("Accept-Language", "en-US,en;q=0.9")
                            .addHeader("Connection", "keep-alive");
                        
                        // For images and other resources, use the base_url (article URL) as Referer
                        // This helps bypass hotlinking protection on CDNs
                        String baseUrl = plugin.getCurrentBaseUrl();
                        if (baseUrl != null && !baseUrl.isEmpty()) {
                            reqBuilder.addHeader("Referer", baseUrl);
                            Log.d(TAG, "Using article URL as Referer: " + baseUrl);
                        }
                        
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
                            Response authResponse = newFixedLengthResponse(Response.Status.OK, 
                                "text/html; charset=utf-8", authHtml);
                            return addCorsHeaders(authResponse);
                        }
                        
                        if (!res.isSuccessful()) {
                            Response errorResponse = newFixedLengthResponse(Response.Status.INTERNAL_ERROR, 
                                "text/plain", "Proxy error: " + res.code());
                            return addCorsHeaders(errorResponse);
                        }
                        
                        String contentType = res.header("Content-Type", "text/html");
                        byte[] body = res.body() != null ? res.body().bytes() : new byte[0];
                        
                        // If HTML, rewrite URLs to use proxy
                        if (contentType.contains("text/html")) {
                            String html = new String(body, "UTF-8");
                            // Reuse baseUrl variable declared above
                            int port = getListeningPort();
                            
                            // Simple URL rewriting (similar to Rust proxy)
                            html = rewriteHtmlUrls(html, baseUrl, port);
                            body = html.getBytes("UTF-8");
                        }
                        
                        Response successResponse = newFixedLengthResponse(Response.Status.OK, contentType, 
                            new java.io.ByteArrayInputStream(body), body.length);
                        return addCorsHeaders(successResponse);
                    }
                }
                
                Response notFoundResponse = newFixedLengthResponse(Response.Status.NOT_FOUND, 
                    "text/plain", "Not found");
                return addCorsHeaders(notFoundResponse);
                    
            } catch (Exception e) {
                Log.e(TAG, "Proxy error", e);
                Response errorResponse = newFixedLengthResponse(Response.Status.INTERNAL_ERROR, 
                    "text/plain", "Error: " + e.getMessage());
                return addCorsHeaders(errorResponse);
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
                
                // Inject script to ensure videos have controls, iframes have fullscreen attributes, and handle Android immersive mode
                String injectedScript = "<script>(function(){" +
                    "function enableFullscreenForMedia(media){" +
                    "if(media.tagName==='IFRAME'){" +
                    "media.setAttribute('allowfullscreen','');" +
                    "media.setAttribute('webkitallowfullscreen','');" +
                    "media.setAttribute('mozallowfullscreen','');" +
                    "}else if(media.tagName==='VIDEO'&&!media.hasAttribute('controls')){" +
                    "media.setAttribute('controls','controls');" +
                    "}" +
                    "}" +
                    "function setupFullscreenHandlers(){" +
                    "if(window.AndroidFullscreenHandler){" +
                    "document.addEventListener('fullscreenchange',function(){" +
                    "if(document.fullscreenElement){" +
                    "window.AndroidFullscreenHandler.enterFullscreen();" +
                    "}else{" +
                    "window.AndroidFullscreenHandler.exitFullscreen();" +
                    "}" +
                    "});" +
                    "document.addEventListener('webkitfullscreenchange',function(){" +
                    "if(document.webkitFullscreenElement){" +
                    "window.AndroidFullscreenHandler.enterFullscreen();" +
                    "}else{" +
                    "window.AndroidFullscreenHandler.exitFullscreen();" +
                    "}" +
                    "});" +
                    "}" +
                    "}" +
                    "function processExistingMedia(){" +
                    "document.querySelectorAll('video,iframe').forEach(enableFullscreenForMedia);" +
                    "}" +
                    "var observer=new MutationObserver(function(mutations){" +
                    "mutations.forEach(function(mutation){" +
                    "mutation.addedNodes.forEach(function(node){" +
                    "if(node.nodeType===1){" +
                    "if(node.tagName==='VIDEO'||node.tagName==='IFRAME'){" +
                    "enableFullscreenForMedia(node);" +
                    "}" +
                    "if(node.querySelectorAll){" +
                    "node.querySelectorAll('video,iframe').forEach(enableFullscreenForMedia);" +
                    "}" +
                    "}" +
                    "});" +
                    "});" +
                    "});" +
                    "if(document.body){" +
                    "processExistingMedia();" +
                    "setupFullscreenHandlers();" +
                    "observer.observe(document.body,{childList:true,subtree:true});" +
                    "}else{" +
                    "document.addEventListener('DOMContentLoaded',function(){" +
                    "processExistingMedia();" +
                    "setupFullscreenHandlers();" +
                    "observer.observe(document.body,{childList:true,subtree:true});" +
                    "});" +
                    "}" +
                    "})();</script>";

                if (html.contains("</body>")) {
                    html = html.replace("</body>", injectedScript + "</body>");
                } else if (html.contains("</html>")) {
                    html = html.replace("</html>", injectedScript + "</html>");
                } else {
                    html = html + injectedScript;
                }

                return html;
            } catch (Exception e) {
                Log.e(TAG, "URL rewriting error", e);
                return html;
            }
        }
    }
}
