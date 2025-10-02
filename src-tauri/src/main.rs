#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::io::Cursor;
use tauri::command;
use tokio::time::Duration;
use url::Url;
use reqwest::header::USER_AGENT;

const FALLBACK_SIGNAL: &str = "READABILITY_FAILED_FALLBACK";

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_article])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}