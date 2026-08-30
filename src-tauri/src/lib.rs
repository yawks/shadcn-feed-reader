pub mod proxy;
pub mod shared;

use shared::{
    logic_fetch_article, logic_fetch_raw_html, logic_perform_form_login, LoginRequest,
    LoginResponse, ProxyState,
};
use tauri::{command, AppHandle, Manager, State};
use url::Url;

#[command]
async fn start_proxy(app_handle: AppHandle) -> Result<u16, String> {
    let state: tauri::State<ProxyState> = app_handle.state();

    if let Some(existing_port) = *state.port.lock().unwrap() {
        return Ok(existing_port);
    }

    let port = proxy::start_proxy_server(state.inner().clone()).await;
    *state.port.lock().unwrap() = Some(port);
    Ok(port)
}

#[command]
fn set_proxy_url(url: String, state: State<ProxyState>) -> Result<(), String> {
    *state.base_url.lock().unwrap() = Url::parse(&url).map_err(|error| error.to_string())?;
    Ok(())
}

#[command]
fn set_proxy_auth(
    domain: String,
    username: String,
    password: String,
    state: State<ProxyState>,
) -> Result<(), String> {
    state
        .auth_credentials
        .lock()
        .unwrap()
        .insert(domain, (username, password));
    Ok(())
}

#[command]
fn clear_proxy_auth(domain: String, state: State<ProxyState>) -> Result<(), String> {
    state.auth_credentials.lock().unwrap().remove(&domain);
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

#[command]
async fn perform_form_login(
    request: LoginRequest,
    state: State<'_, ProxyState>,
) -> Result<LoginResponse, String> {
    logic_perform_form_login(request, &state).await
}

/// Shared Tauri entry point used by both desktop executables and mobile libraries.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ProxyState::default())
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
        .expect("error while running Tauri application");
}
