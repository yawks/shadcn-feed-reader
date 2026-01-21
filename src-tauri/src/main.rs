#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Manager, State};
use url::Url;
use reqwest::header::USER_AGENT; // Keep for now if used locally, or remove if not
use reqwest::cookie::Jar;
use shadcn_feed_reader::shared::{
    ProxyState, LoginRequest, LoginResponse,
    logic_fetch_article, logic_fetch_raw_html, logic_perform_form_login
};
use shadcn_feed_reader::proxy;

const FALLBACK_SIGNAL: &str = "READABILITY_FAILED_FALLBACK";



#[command]
async fn start_proxy(app_handle: AppHandle) -> Result<u16, String> {
    let state: tauri::State<ProxyState> = app_handle.state();

    // Check if proxy is already running
    {
        let port_guard = state.port.lock().unwrap();
        if let Some(existing_port) = *port_guard {
            return Ok(existing_port);
        }
    } // Lock is released here before await

    // Start new proxy server
    let port = proxy::start_proxy_server(state.inner().clone()).await;

    // Store the port in the state
    let mut port_guard = state.port.lock().unwrap();
    *port_guard = Some(port);

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
fn set_proxy_auth(domain: String, username: String, password: String, state: State<ProxyState>) -> Result<(), String> {
    let mut credentials = state.auth_credentials.lock().unwrap();
    credentials.insert(domain.clone(), (username, password));
    println!("Set auth credentials for domain: {}", domain);
    Ok(())
}

#[command]
fn clear_proxy_auth(domain: String, state: State<ProxyState>) -> Result<(), String> {
    let mut credentials = state.auth_credentials.lock().unwrap();
    credentials.remove(&domain);
    println!("Cleared auth credentials for domain: {}", domain);
    Ok(())
}

#[command]
async fn fetch_raw_html(url: String, state: State<'_, ProxyState>) -> Result<String, String> {
    logic_fetch_raw_html(url, &state).await
}

#[command]
async fn fetch_article(url: String) -> Result<String, String> {
    logic_fetch_article(url).await
}


/// Perform a form-based login (POST) to authenticate on a website
#[command]
async fn perform_form_login(request: LoginRequest, state: State<'_, ProxyState>) -> Result<LoginResponse, String> {
    logic_perform_form_login(request, &state).await
}

fn main() {
    let initial_url = Url::parse("http://localhost").unwrap(); // Default empty URL
    let cookie_jar = Arc::new(Jar::default());

    let proxy_state = ProxyState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(proxy_state)
        .invoke_handler(tauri::generate_handler![
            fetch_article,
            fetch_raw_html,
            start_proxy,
            set_proxy_url,
            set_proxy_auth,
            clear_proxy_auth,
            perform_form_login
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}