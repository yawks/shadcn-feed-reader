use std::sync::{Arc, Mutex};
use std::io::Cursor;
use url::Url;
use reqwest::header::USER_AGENT;
use reqwest::cookie::Jar;
use serde::{Deserialize, Serialize};
use tokio::time::Duration;

pub const FALLBACK_SIGNAL: &str = "READABILITY_FAILED_FALLBACK";

// Shared state for the proxy's base URL, port, auth credentials, and cookie jar
#[derive(Clone)]
pub struct ProxyState {
    pub base_url: Arc<Mutex<Url>>,
    pub port: Arc<Mutex<Option<u16>>>,
    pub auth_credentials: Arc<Mutex<std::collections::HashMap<String, (String, String)>>>,
    /// If true, the proxy will rewrite URLs as relative paths (e.g. "/proxy?url=...")
    /// This is used when the proxy is running on the same origin as the frontend (Web App mode).
    pub use_relative_paths: Arc<Mutex<bool>>,
    /// Shared cookie jar for session persistence across requests
    pub cookie_jar: Arc<Jar>,
}

impl Default for ProxyState {
    fn default() -> Self {
        Self {
            base_url: Arc::new(Mutex::new(Url::parse("http://localhost").unwrap())),
            port: Arc::new(Mutex::new(None)),
            auth_credentials: Arc::new(Mutex::new(std::collections::HashMap::new())),
            use_relative_paths: Arc::new(Mutex::new(false)),
            cookie_jar: Arc::new(Jar::default()),
        }
    }
}

// Types for form login
#[derive(Debug, Deserialize)]
pub struct FormField {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub login_url: String,
    pub fields: Vec<FormField>,
    pub response_selector: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub success: bool,
    pub message: String,
    pub status_code: u16,
    pub extracted_text: Option<String>,
}

// --- Core Logic Functions (Tauri/Axum Agnostic) ---

pub async fn logic_fetch_raw_html(url: String, state: &ProxyState) -> Result<String, String> {
    let url_obj = Url::parse(&url).map_err(|e| e.to_string())?;

    // Extract domain for auth lookup
    let domain = format!("{}://{}",
        url_obj.scheme(),
        url_obj.host_str().unwrap_or("localhost")
    );

    // Check for auth credentials for this domain
    let auth_credentials = {
        let creds = state.auth_credentials.lock().unwrap();
        creds.get(&domain).cloned()
    };

    // Use shared cookie jar for session persistence (important for CSRF tokens)
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .cookie_provider(state.cookie_jar.clone())
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .build()
        .map_err(|e| e.to_string())?;

    let mut request_builder = client
        .get(url_obj.clone())
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.5")
        .header("Connection", "keep-alive")
        .header("Upgrade-Insecure-Requests", "1");

    // Add HTTP Basic Auth if credentials are available
    if let Some((username, password)) = auth_credentials {
        println!("Adding HTTP Basic Auth for domain: {}", domain);
        request_builder = request_builder.basic_auth(username, Some(password));
    }

    let response = request_builder
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // Check for 401 Unauthorized
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        println!("fetch_raw_html: 401 Unauthorized for URL: {}", url);
        return Err(format!("AUTH_REQUIRED:{}", domain));
    }

    let html = response.text().await.map_err(|e| e.to_string())?;
    Ok(html)
}

pub async fn logic_fetch_article(url: String) -> Result<String, String> {
    let url_obj = Url::parse(&url).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(url_obj.clone())
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.5")
        .header("Connection", "keep-alive")
        .header("Upgrade-Insecure-Requests", "1")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // Check content type to ensure we're dealing with HTML
    let content_type = response.headers()
        .get("content-type")
        .and_then(|ct| ct.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("text/html") && !content_type.contains("application/xhtml") {
        return Err(format!("Content type '{}' is not HTML", content_type));
    }

    let html = response.text().await.map_err(|e| e.to_string())?;

    if html.trim().is_empty() {
        return Err("Fetched HTML content is empty.".into());
    }

    // Check for minimal HTML content that should use iframe fallback
    let trimmed = html.trim();

    // Check for exact match of empty HTML
    if trimmed == "<!DOCTYPE html><html><head></head><body></body></html>" {
        return Ok(FALLBACK_SIGNAL.to_string());
    }

    // Check for variations and minimal content
    if trimmed.len() < 150 {
        if trimmed.contains("<head></head>") && trimmed.contains("<body></body>") {
            return Ok(FALLBACK_SIGNAL.to_string());
        }

        // Check if it's essentially empty (no meaningful content tags)
        let has_content = trimmed.contains("<p") || trimmed.contains("<div") ||
                         trimmed.contains("<article") || trimmed.contains("<main") ||
                         trimmed.contains("<section") || trimmed.contains("<h1") ||
                         trimmed.contains("<h2") || trimmed.contains("<span");

        if !has_content {
            return Ok(FALLBACK_SIGNAL.to_string());
        }
    }

    // Check if content contains non-printable characters (might indicate binary data or decompression issues)
    if html.chars().take(100).any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t') {
        return Err("Content appears to be binary or corrupted.".into());
    }

    // Check if we got a minimal HTML document (likely from JavaScript-heavy sites)
    let html_normalized = html.trim().replace('\n', "").replace('\r', "");

    // Multiple patterns to catch different variations of empty HTML
    let patterns = [
        r"^<!DOCTYPE html><html><head></head><body></body></html>$",
        r"^<!doctype html><html><head></head><body></body></html>$",
        r"^<html><head></head><body></body></html>$",
        r"^<!DOCTYPE html><html><head>\s*</head><body>\s*</body></html>$",
    ];

    for pattern in &patterns {
        let regex = regex::Regex::new(pattern).unwrap();
        if regex.is_match(&html_normalized) {
            return Ok(FALLBACK_SIGNAL.to_string());
        }
    }

    // Additional check: if the body is essentially empty
    if html.len() < 200 && !html.contains("<p") && !html.contains("<div") && !html.contains("<article") && !html.contains("<main") {
        return Ok(FALLBACK_SIGNAL.to_string());
    }

    let mut content_cursor = Cursor::new(html.as_bytes());
    match readability::extractor::extract(&mut content_cursor, &url_obj) {
        Ok(product) => {
            let extracted_content = product.content.trim();

            // Check if extracted content is meaningful
            if extracted_content.is_empty() {
                return Ok(FALLBACK_SIGNAL.to_string());
            }

            // Check if extracted content is just minimal HTML
            if extracted_content.len() < 100 &&
               (extracted_content.contains("<head></head>") ||
                extracted_content == "<!DOCTYPE html><html><head></head><body></body></html>") {
                return Ok(FALLBACK_SIGNAL.to_string());
            }

            Ok(product.content)
        },
        Err(_) => {
            Ok(FALLBACK_SIGNAL.to_string())
        }
    }
}

pub async fn logic_perform_form_login(request: LoginRequest, state: &ProxyState) -> Result<LoginResponse, String> {
    let login_url = Url::parse(&request.login_url).map_err(|e| e.to_string())?;

    println!("[shared::perform_form_login] Logging in to: {}", login_url);

    // Build form data
    let form_data: Vec<(String, String)> = request.fields
        .into_iter()
        .map(|f| (f.name, f.value))
        .collect();

    // Create client with shared cookie jar
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .cookie_provider(state.cookie_jar.clone())
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    // Perform POST request
    let response = client
        .post(login_url.clone())
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Origin", format!("{}://{}", login_url.scheme(), login_url.host_str().unwrap_or("")))
        .header("Referer", login_url.to_string())
        .form(&form_data)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let status_code = status.as_u16();

    // Consider 2xx and 3xx (redirects) as success
    let success = status.is_success() || status.is_redirection();

    println!("[shared::perform_form_login] Response status: {} (success: {})", status, success);

    // Extract text from response if selector is provided
    let extracted_text = if let Some(selector) = request.response_selector {
        if !selector.is_empty() {
            match response.text().await {
                Ok(html) => {
                    // Use scraper to extract text from CSS selector
                    match scraper::Selector::parse(&selector) {
                        Ok(css_selector) => {
                            let document = scraper::Html::parse_document(&html);
                            let mut extracted = String::new();
                            for element in document.select(&css_selector) {
                                extracted.push_str(&element.text().collect::<String>());
                            }
                            if extracted.is_empty() {
                                None
                            } else {
                                println!("[shared::perform_form_login] Extracted text: {}", extracted.trim());
                                Some(extracted.trim().to_string())
                            }
                        }
                        Err(e) => {
                            println!("[shared::perform_form_login] Invalid CSS selector '{}': {:?}", selector, e);
                            None
                        }
                    }
                }
                Err(_) => None
            }
        } else {
            None
        }
    } else {
        None
    };

    Ok(LoginResponse {
        success,
        message: format!("Status: {}", status),
        status_code,
        extracted_text,
    })
}
