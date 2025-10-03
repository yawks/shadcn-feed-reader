use crate::ProxyState;
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, Request, StatusCode},
    response::Response,
    routing::get,
    Router,
};
use lol_html::{element, HtmlRewriter, Settings};
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

pub async fn start_proxy_server(state: ProxyState) -> u16 {
    let port = portpicker::pick_unused_port().expect("failed to find a free port");

    let app = Router::new()
        .route("/*path", get(proxy_handler))
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    tokio::spawn(async move {
        let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
            .await
            .unwrap();
        axum::serve(listener, app).await.unwrap();
    });

    port
}

use axum::body::to_bytes;

async fn proxy_handler(
    State(state): State<ProxyState>,
    Path(path): Path<String>,
    req: Request<Body>,
) -> Result<Response, StatusCode> {
    let base_url = state.base_url.lock().unwrap().clone();
    let target_url = base_url.join(&path).map_err(|_| StatusCode::BAD_REQUEST)?;

    let (parts, body) = req.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let client = reqwest::Client::new();
    let client_req = client
        .request(parts.method, target_url)
        .headers(parts.headers)
        .header(
            header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        )
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
    *builder.headers_mut().unwrap() = response.headers().clone();

    if content_type.contains("text/html") {
        let text = response.text().await.unwrap();
        let mut output = Vec::new();

        let mut rewriter = HtmlRewriter::new(
            Settings {
                element_content_handlers: vec![
                    element!("a[href], link[href]", |el| {
                        if let Some(href) = el.get_attribute("href") {
                            if !href.starts_with("http") && !href.starts_with("//") {
                                let new_href = format!("/{}", href.trim_start_matches('/'));
                                el.set_attribute("href", &new_href).unwrap();
                            }
                        }
                        Ok(())
                    }),
                    element!("img[src], script[src], iframe[src]", |el| {
                         if let Some(src) = el.get_attribute("src") {
                            if !src.starts_with("http") && !src.starts_with("//") {
                                let new_src = format!("/{}", src.trim_start_matches('/'));
                                el.set_attribute("src", &new_src).unwrap();
                            }
                        }
                        Ok(())
                    }),
                ],
                ..Settings::default()
            },
            |c: &[u8]| output.extend_from_slice(c),
        );

        rewriter.write(text.as_bytes()).unwrap();
        rewriter.end().unwrap();

        Ok(builder.body(Body::from(output)).unwrap())
    } else {
        let body = Body::from_stream(response.bytes_stream());
        Ok(builder.body(body).unwrap())
    }
}