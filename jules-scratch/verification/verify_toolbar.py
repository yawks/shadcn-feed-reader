import json
from playwright.sync_api import sync_playwright, expect

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Listen for all console events and print them
    page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))

    try:
        # Mock API responses
        def handle_route(route):
            url = route.request.url

            if "apps/news/api/v1-2/folders" in url:
                mock_folders = {"folders": [{"id": 1, "name": "Test Folder"}]}
                route.fulfill(status=200, content_type="application/json", body=json.dumps(mock_folders))
                return

            if "apps/news/api/v1-2/feeds" in url:
                mock_feeds = {"feeds": [{"id": 1, "title": "Test Feed", "unreadCount": 1, "folderId": 1, "faviconLink": ""}]}
                route.fulfill(status=200, content_type="application/json", body=json.dumps(mock_feeds))
                return

            if "apps/news/api/v1-3/items" in url:
                mock_items = {
                    "items": [{
                        "id": 101, "feedId": 1, "title": "Test Article", "url": "https://example.com",
                        "pubDate": 1672531200, "unread": True, "starred": False,
                        "body": "<p>This is a test article body.</p>", "enclosureLink": "", "mediaThumbnail": ""
                    }]
                }
                route.fulfill(status=200, content_type="application/json", body=json.dumps(mock_items))
                return

            route.continue_()

        page.route("**/*", handle_route)

        # Mock the Tauri 'invoke' command on every new document
        page.add_init_script("""
            if (!window.__TAURI_INTERNALS__) {
                window.__TAURI_INTERNALS__ = {};
            }
            window.__TAURI_INTERNALS__.invoke = (cmd, args) => {
                if (cmd === 'fetch_article') {
                    return Promise.resolve('<p>This is a mocked article body.</p>');
                }
                if (cmd === 'fetch_raw_html') {
                    return Promise.resolve('<html><body><h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents.</p></body></html>');
                }
                return Promise.reject(`Unhandled Tauri command: ${cmd}`);
            };
        """)

        # Navigate to the base URL to set up the environment
        page.goto("http://localhost:5173")

        # Bypass login by setting isAuthenticated in localStorage
        page.evaluate("() => { localStorage.setItem('isAuthenticated', 'true'); }")

        # Navigate to the feed page
        page.goto("http://localhost:5173/feed/1")

        # Select the article to render FeedArticle component
        page.locator("text=Test Article").click()

        # 1. Verify initial state (readability mode)
        expect(page.locator(".prose")).to_be_visible(timeout=15000)
        expect(page.locator("text=This is a mocked article body.")).to_be_visible()

        # 2. Switch to dark mode
        page.get_by_role("button", name="Dark Mode").click()

        # 3. Verify dark mode state (iframe is visible and has content)
        iframe = page.frame_locator("iframe[title='Feed article']")
        expect(iframe.locator("body")).to_be_visible(timeout=15000)
        expect(iframe.locator("h1:text('Example Domain')")).to_be_visible()

        # Give darkreader a moment to apply styles
        page.wait_for_timeout(2000)

        # 4. Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)