#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::io::Cursor;
use tauri::command;
use tokio::time::Duration;
use url::Url;

#[command]
async fn fetch_article(url: String) -> Result<String, String> {
    let url_obj = Url::parse(&url).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(url_obj.clone()).send().await.map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    // Attempt to extract the main content using the readability crate.
    let mut content_cursor = Cursor::new(html.as_bytes());
    if let Ok(product) = readability::extractor::extract(&mut content_cursor, &url_obj) {
        if !product.content.trim().is_empty() {
            return Ok(product.content);
        }
    }

    // If readability fails or returns empty content, fall back to the full HTML.
    Ok(html)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_article])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}