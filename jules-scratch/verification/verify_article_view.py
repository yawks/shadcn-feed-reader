from playwright.sync_api import sync_playwright, Page, expect
import time
import json

def verify_article_view(page: Page):
    """
    This test verifies that the article view correctly displays the content
    fetched from the Tauri command.
    """
    # 1. Arrange: Go to the app and set up API mocking.

    # Mock the Nextcloud News API folder endpoint to simulate a successful login.
    page.route("**/index.php/apps/news/api/v1-2/folders", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({"folders": [{"id": 1, "name": "All"}]})
    ))

    # Mock the feeds endpoint to provide some dummy feed data.
    page.route("**/index.php/apps/news/api/v1-2/feeds", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({"feeds": [{"id": 1, "title": "Test Feed", "url": "https://example.com"}]})
    ))

    # Mock the items endpoint to provide a dummy article.
    page.route("**/index.php/apps/news/api/v1-2/items?type=3&id=0", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({"items": [{"id": 1, "title": "Test Article", "url": "https://example.com/article", "body": "Article content"}]})
    ))

    # 2. Act: Go to the application's home page and log in.
    page.goto("http://localhost:5173")

    # Fill in the login form with dummy data. The API mock will handle the rest.
    page.get_by_label("Nextcloud URL").fill("https://fake-nextcloud.com")
    page.get_by_label("Username").fill("testuser")
    page.get_by_label("Password").fill("password")
    page.get_by_role("button", name="Login").click()

    # Wait for navigation to what should be the main page.
    page.wait_for_url("http://localhost:5173/")

    # Take a screenshot to see what the page looks like after login.
    page.screenshot(path="jules-scratch/verification/post_login_page.png")

    # Now navigate to the feeds page, which should exist after a "successful" login.
    page.goto("http://localhost:5173/feeds")

    time.sleep(2) # Wait for content to load

    # Click on the first feed item link.
    page.locator("a[data-feed-id]").first.click()

    time.sleep(2)

    # 3. Assert: Check that the article content is visible.
    article_content = page.locator(".prose")
    expect(article_content).to_be_visible(timeout=15000)

    # 4. Screenshot: Capture the final result.
    page.screenshot(path="jules-scratch/verification/verification.png")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    verify_article_view(page)
    browser.close()