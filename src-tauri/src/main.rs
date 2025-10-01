#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use readability::extractor;
use std::time::Duration;
use tauri::command;

#[command]
async fn fetch_article(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    // Use the extractor to get the main content of the article
    let article = extractor::extract_text(&html).map_err(|e| e.to_string())?;

    Ok(article)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_article])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}