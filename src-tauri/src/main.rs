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

    // Use a cursor as the readability::extractor::extract function expects a mutable reader.
    let mut content = Cursor::new(html);
    let product = readability::extractor::extract(&mut content, &url_obj).map_err(|e| e.to_string())?;

    Ok(product.content)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_article])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}