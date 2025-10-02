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
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(url_obj.clone())
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let html = response.text().await.map_err(|e| e.to_string())?;

    if html.trim().is_empty() {
        return Err("Fetched HTML content is empty.".into());
    }

    let mut content_cursor = Cursor::new(html.as_bytes());
    match readability::extractor::extract(&mut content_cursor, &url_obj) {
        Ok(product) if !product.content.trim().is_empty() => Ok(product.content),
        _ => Ok(FALLBACK_SIGNAL.to_string()), // Signal to fallback to iframe
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_article])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}