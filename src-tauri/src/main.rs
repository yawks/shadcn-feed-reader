#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::io::Cursor;
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Manager, State};
use tokio::time::Duration;
use url::Url;
use reqwest::header::USER_AGENT;

mod proxy;

const FALLBACK_SIGNAL: &str = "READABILITY_FAILED_FALLBACK";

// Shared state for the proxy's base URL
#[derive(Clone)]
pub struct ProxyState {
    pub base_url: Arc<Mutex<Url>>,
}

#[command]
async fn start_proxy(app_handle: AppHandle) -> Result<u16, String> {
    let state: tauri::State<ProxyState> = app_handle.state();
    let port = proxy::start_proxy_server(state.inner().clone()).await;
    Ok(port)
}

#[command]
fn set_proxy_url(url: String, state: State<ProxyState>) -> Result<(), String> {
    let new_url = Url::parse(&url).map_err(|e| e.to_string())?;
    let mut base_url = state.base_url.lock().unwrap();
    *base_url = new_url;
    Ok(())
}

#[command]
async fn fetch_article(url: String) -> Result<String, String> {
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


fn main() {
    let initial_url = Url::parse("http://localhost").unwrap(); // Default empty URL
    let proxy_state = ProxyState {
        base_url: Arc::new(Mutex::new(initial_url)),
    };

    tauri::Builder::default()
        .manage(proxy_state)
        .invoke_handler(tauri::generate_handler![
            fetch_article,
            start_proxy,
            set_proxy_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}