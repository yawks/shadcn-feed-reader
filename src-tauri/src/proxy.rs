use crate::ProxyState;
use axum::{
    body::{to_bytes, Body},
    extract::{Path, Query, State},
    http::{header, StatusCode, Uri},
    response::Response,
    routing::get,
    Router,
    middleware::{self, Next},
};
use tauri::http::Request;
use lol_html::{element, HtmlRewriter, Settings};
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use std::collections::HashMap;
use url::Url;

// Middleware to log all incoming requests
async fn log_requests(uri: Uri, req: axum::http::Request<Body>, next: Next) -> Response {
    println!("🌐 PROXY REQUEST: {} {}", req.method(), uri);
    next.run(req).await
}

// The entire Dark Reader library source code, to be injected.
const DARK_READER_JS: &str = include_str!("../../node_modules/darkreader/darkreader.js");

// The listener script that will be injected to handle communication.
const LISTENER_SCRIPT: &str = r#"
<script>
    // Injected Dark Reader library
    {{DARK_READER_JS}}

    // Listener for messages from the parent window
    window.addEventListener('message', (event) => {
        const { action, enabled, theme } = event.data;
        if (action === 'SET_DARK_MODE') {
            if (enabled) {
                DarkReader.enable(theme);
            } else {
                DarkReader.disable();
            }
        }
    });
</script>
"#;

pub async fn start_proxy_server(state: ProxyState) -> u16 {
    let port = portpicker::pick_unused_port().expect("failed to find a free port");

    let app = Router::new()
        .route("/proxy", get(proxy_resource_handler))
        .route("/*path", get(proxy_handler))
        .with_state(state)
        .layer(middleware::from_fn(log_requests))
        .layer(TraceLayer::new_for_http());

    tokio::spawn(async move {
        let listener = TcpListener::bind(format!("localhost:{}", port))
            .await
            .unwrap();
        axum::serve(listener, app).await.unwrap();
    });

    port
}

// Handler for proxying external resources via /proxy?url=...
async fn proxy_resource_handler(
    Query(params): Query<HashMap<String, String>>,
    req: Request<Body>,
) -> Result<Response, StatusCode> {
    let target_url_str = params.get("url").ok_or_else(|| {
        eprintln!("Proxy resource handler: No 'url' parameter provided");
        StatusCode::BAD_REQUEST
    })?;
    
    println!("Proxy resource handler - RAW URL parameter: '{}'", target_url_str);
    
    // Decode the URL parameter
    let decoded_url = urlencoding::decode(target_url_str).map_err(|e| {
        eprintln!("Proxy resource handler: Failed to decode URL '{}': {}", target_url_str, e);
        StatusCode::BAD_REQUEST
    })?;
    
    println!("Proxy resource handler - DECODED URL: '{}'", decoded_url);
    println!("Proxy resource handler - all params: {:?}", params);
    
    let target_url = Url::parse(&decoded_url).map_err(|e| {
        eprintln!("Proxy resource handler: Failed to parse decoded URL '{}': {}", decoded_url, e);
        StatusCode::BAD_REQUEST
    })?;

    let (parts, body) = req.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let client_req = client
        .request(parts.method, target_url.clone())
        .header(
            header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        )
        .header(header::ACCEPT, "*/*")
        .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.5")
        .header(header::CONNECTION, "keep-alive")
        .header(header::REFERER, target_url.as_str())
        .header(header::HOST, target_url.host_str().unwrap_or("localhost"))
        .body(body_bytes)
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = client
        .execute(client_req)
        .await
        .map_err(|e| {
            eprintln!("Proxy resource handler: Request failed for '{}': {}", target_url, e);
            StatusCode::BAD_GATEWAY
        })?;

    println!("Proxy resource handler - response status: {} for URL: {}", response.status(), target_url);

    let mut builder = Response::builder().status(response.status());
    
    // Copy headers but exclude problematic ones
    for (key, value) in response.headers() {
        if key != header::CONTENT_LENGTH 
            && key != header::CONTENT_SECURITY_POLICY
            && key != "x-frame-options"
            && key != "transfer-encoding" // Let Axum handle this
        {
            builder = builder.header(key, value);
        }
    }

    let body = Body::from_stream(response.bytes_stream());
    Ok(builder.body(body).unwrap())
}

async fn proxy_handler(
    Path(path): Path<String>,
    State(state): State<ProxyState>,
    req: Request<Body>,
) -> Result<Response, StatusCode> {
    let base_url = state.base_url.lock().unwrap().clone();
    
    // Check if this is a resource request (CSS, JS, images, etc.)
    let is_resource = path.ends_with(".css") || path.ends_with(".js") || path.ends_with(".png") || 
                     path.ends_with(".jpg") || path.ends_with(".jpeg") || path.ends_with(".gif") || 
                     path.ends_with(".svg") || path.ends_with(".ico") || path.ends_with(".woff") || 
                     path.ends_with(".woff2") || path.ends_with(".ttf") || path.ends_with(".eot") ||
                     path.starts_with("assets/") || path.starts_with("images/") || path.starts_with("fonts/");
    
    if is_resource {
        println!("🔄 REDIRECTING RESOURCE: {} -> proxy resource handler", path);
        // Build the full URL for the resource using domain root 
        // Note: Axum Path strips the leading '/' so we need to add it back for absolute paths
        // Most resources are absolute paths from domain root, not relative to current page
        let resource_url = format!("{}://{}/{}", base_url.scheme(), base_url.host_str().unwrap_or("localhost"), path);
        println!("🔗 RESOURCE URL: {} -> {}", path, resource_url);
        
        // Create a new request with the url parameter for the resource handler
        let mut query_params = HashMap::new();
        query_params.insert("url".to_string(), resource_url);
        
        // Call the resource handler directly
        return proxy_resource_handler(Query(query_params), req).await;
    }
    
    let target_url = base_url.join(&path).map_err(|_| StatusCode::BAD_REQUEST)?;

    // Get the actual proxy port from state
    let proxy_port = {
        let port_guard = state.port.lock().unwrap();
        port_guard.unwrap_or(3000)
    };

    let (parts, body) = req.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // Build request with filtered headers (exclude problematic ones)
    let mut client_req_builder = client.request(parts.method, target_url.clone());
    
    // Copy headers but exclude problematic ones
    for (name, value) in parts.headers.iter() {
        if name != header::HOST && name != header::CONNECTION {
            client_req_builder = client_req_builder.header(name, value);
        }
    }
    
    let client_req = client_req_builder
        .header(
            header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        )
        .header(header::ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
        .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.5")
        .header(header::CONNECTION, "keep-alive")
        .header("Upgrade-Insecure-Requests", "1")
        .header(header::REFERER, target_url.as_str())
        .header(header::HOST, target_url.host_str().unwrap_or("localhost"))
        .body(body_bytes)
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = client
        .execute(client_req)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let mut builder = Response::builder().status(response.status());
    
    // Copy headers but exclude problematic ones
    for (key, value) in response.headers() {
        if key != header::CONTENT_LENGTH 
            && key != header::CONTENT_SECURITY_POLICY
            && key != "x-frame-options"
            && key != "transfer-encoding" // Let Axum handle this
        {
            builder = builder.header(key, value);
        }
    }

    if content_type.contains("text/html") {
        let text = response.text().await.unwrap();
        let mut output = Vec::new();

        let final_script = LISTENER_SCRIPT.replace("{{DARK_READER_JS}}", DARK_READER_JS);

        let mut rewriter = HtmlRewriter::new(
            Settings {
                element_content_handlers: vec![
                    // Rewrite all src attributes (images, scripts, etc.)
                    element!("*[src]", |el| {
                        if let Some(src) = el.get_attribute("src") {
                            if src.contains("linuxfr2_plusieur.png") {
                                println!("🖼️  FOUND TARGET IMAGE: src='{}'", src);
                            }
                            if !src.starts_with("data:") && !src.starts_with("blob:") && !src.starts_with("http://localhost:") && !src.starts_with("https://") && !src.starts_with("http://") {
                                let absolute_url = if src.starts_with("//") {
                                    // Protocol-relative URL
                                    format!("{}:{}", target_url.scheme(), src)
                                } else if src.starts_with("/") {
                                    // Absolute path from domain root
                                    format!("{}://{}{}", target_url.scheme(), target_url.host_str().unwrap_or("localhost"), src)
                                } else {
                                    // Relative path
                                    match target_url.join(&src) {
                                        Ok(url) => url.to_string(),
                                        Err(_) => {
                                            println!("Failed to join src '{}' with base '{}'", src, target_url);
                                            return Ok(());
                                        }
                                    }
                                };
                                let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(&absolute_url));
                                println!("Rewriting src '{}' -> '{}' (base: {})", src, proxy_url, target_url);
                                el.set_attribute("src", &proxy_url).unwrap();
                            } else {
                                println!("Skipping src '{}' (data/blob/localhost/absolute)", src);
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite href attributes for stylesheets and other resources (not navigation links)
                    element!("link[href], area[href]", |el| {
                        if let Some(href) = el.get_attribute("href") {
                            if !href.starts_with("data:") && !href.starts_with("blob:") && !href.starts_with("http://localhost:") && !href.starts_with("#") && !href.starts_with("javascript:") && !href.starts_with("mailto:") && !href.starts_with("https://") && !href.starts_with("http://") {
                                let absolute_url = if href.starts_with("//") {
                                    // Protocol-relative URL
                                    format!("{}:{}", target_url.scheme(), href)
                                } else if href.starts_with("/") {
                                    // Absolute path from domain root
                                    format!("{}://{}{}", target_url.scheme(), target_url.host_str().unwrap_or("localhost"), href)
                                } else {
                                    // Relative path
                                    match target_url.join(&href) {
                                        Ok(url) => url.to_string(),
                                        Err(_) => {
                                            println!("Failed to join href '{}' with base '{}'", href, target_url);
                                            return Ok(());
                                        }
                                    }
                                };
                                let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(&absolute_url));
                                println!("Rewriting resource href '{}' -> '{}' (base: {})", href, proxy_url, target_url);
                                el.set_attribute("href", &proxy_url).unwrap();
                            } else {
                                println!("Skipping href '{}' (data/blob/localhost/anchor/js/mailto/absolute)", href);
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite navigation links to use direct paths (handled by main proxy handler)
                    element!("a[href]", |el| {
                        if let Some(href) = el.get_attribute("href") {
                            if !href.starts_with("data:") && !href.starts_with("blob:") && !href.starts_with("http://localhost:") && !href.starts_with("#") && !href.starts_with("javascript:") && !href.starts_with("mailto:") && !href.starts_with("https://") && !href.starts_with("http://") {
                                // For navigation links, just rewrite to be relative to proxy root
                                if href.starts_with("/") {
                                    // Remove leading slash since Axum will add it
                                    let new_href = &href[1..];
                                    println!("Rewriting navigation href '{}' -> '{}' (direct)", href, new_href);
                                    el.set_attribute("href", new_href).unwrap();
                                }
                                // Keep relative paths as-is for navigation
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite action attributes in forms
                    element!("form[action]", |el| {
                        if let Some(action) = el.get_attribute("action") {
                            if !action.starts_with("data:") && !action.starts_with("blob:") && !action.starts_with("http://localhost:") && !action.starts_with("#") && !action.starts_with("javascript:") {
                                if let Ok(absolute_url) = target_url.join(&action) {
                                    let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(absolute_url.as_str()));
                                    el.set_attribute("action", &proxy_url).unwrap();
                                }
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite srcset attributes for responsive images
                    element!("*[srcset]", |el| {
                        if let Some(srcset) = el.get_attribute("srcset") {
                            let mut new_srcset = String::new();
                            for src_descriptor in srcset.split(',') {
                                let parts: Vec<&str> = src_descriptor.trim().split_whitespace().collect();
                                if let Some(url) = parts.first() {
                                    if !url.starts_with("data:") && !url.starts_with("blob:") && !url.starts_with("http://localhost:") {
                                        if let Ok(absolute_url) = target_url.join(url) {
                                            let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(absolute_url.as_str()));
                                            new_srcset.push_str(&proxy_url);
                                            if parts.len() > 1 {
                                                new_srcset.push(' ');
                                                new_srcset.push_str(parts[1]);
                                            }
                                            new_srcset.push_str(", ");
                                        }
                                    } else {
                                        new_srcset.push_str(src_descriptor);
                                        new_srcset.push_str(", ");
                                    }
                                }
                            }
                            if new_srcset.ends_with(", ") {
                                new_srcset.truncate(new_srcset.len() - 2);
                            }
                            el.set_attribute("srcset", &new_srcset).unwrap();
                        }
                        Ok(())
                    }),
                    // Inject our script
                    element!("body", |el| {
                        el.append(&final_script, lol_html::html_content::ContentType::Html);
                        Ok(())
                    }),
                ],
                ..Settings::default()
            },
            |c: &[u8]| output.extend_from_slice(c),
        );

        rewriter.write(text.as_bytes()).unwrap();
        rewriter.end().unwrap();

        // Log a sample of navigation links in the final HTML for debugging
        let html_sample = String::from_utf8_lossy(&output);
        if let Some(start) = html_sample.find("<a href=") {
            let end = (start + 100).min(html_sample.len());
            println!("📄 NAVIGATION SAMPLE: {}", &html_sample[start..end]);
        }

        Ok(builder.body(Body::from(output)).unwrap())
    } else {
        let body = Body::from_stream(response.bytes_stream());
        Ok(builder.body(body).unwrap())
    }
}