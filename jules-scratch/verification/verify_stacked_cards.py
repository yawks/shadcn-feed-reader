from playwright.sync_api import sync_playwright
import json

def run(playwright):
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()

    # Mock API calls
    def mock_feeds(route):
        feeds_data = {
          "feeds": [
            {"id": 1, "title": "Apple News", "unreadCount": 2, "faviconLink": "https://www.apple.com/favicon.ico", "folderId": 1},
            {"id": 2, "title": "TechCrunch", "unreadCount": 0, "faviconLink": "https://techcrunch.com/favicon.ico", "folderId": 1},
            {"id": 3, "title": "The Verge", "unreadCount": 1, "faviconLink": "https://www.theverge.com/favicon.ico", "folderId": 1}
          ]
        }
        route.fulfill(status=200, content_type="application/json", body=json.dumps(feeds_data))

    def mock_items(route):
        items_data = {
          "items": [
            {"id": 1, "feedId": 1, "title": "Apple announces the new M4 chip", "url": "http://example.com/1", "pubDate": 1678886400, "unread": True, "starred": False, "body": "Body 1", "enclosureLink": "https://images.pexels.com/photos/1841841/pexels-photo-1841841.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260"},
            {"id": 2, "feedId": 2, "title": "The new Apple M4 chip is a beast", "url": "http://example.com/2", "pubDate": 1678886400, "unread": True, "starred": False, "body": "Body 2", "enclosureLink": "https://images.pexels.com/photos/1029757/pexels-photo-1029757.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260"},
            {"id": 3, "feedId": 3, "title": "Microsoft announces new Surface Pro", "url": "http://example.com/3", "pubDate": 1678886400, "unread": True, "starred": False, "body": "Body 3", "enclosureLink": "https://images.pexels.com/photos/459654/pexels-photo-459654.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260"},
            {"id": 4, "feedId": 1, "title": "A deep dive into the Apple M4 architecture", "url": "http://example.com/4", "pubDate": 1678886400, "unread": False, "starred": False, "body": "Body 4", "enclosureLink": "https://images.pexels.com/photos/326514/pexels-photo-326514.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260"}
          ]
        }
        route.fulfill(status=200, content_type="application/json", body=json.dumps(items_data))

    context.route("**/api/v1-2/feeds", mock_feeds)
    context.route("**/api/v1-3/items**", mock_items)

    # Bypass login
    page.goto("http://localhost:5173")
    page.evaluate("localStorage.setItem('isAuthenticated', 'true')")
    page.evaluate("localStorage.setItem('backend-url', 'http://localhost:5173')")
    page.evaluate("localStorage.setItem('backend-login', 'test')")
    page.evaluate("localStorage.setItem('backend-password', 'test')")
    page.goto("http://localhost:5173")

    # Wait for the article list to be visible
    page.wait_for_selector('div.space-y-1')

    # Check if any stacked cards are present
    stacked_card_selector = 'div.relative:has(h2:text("Actualité: Apple announces the new M4 chip"))'
    stacked_card = page.query_selector(stacked_card_selector)

    if stacked_card:
        # Take a screenshot of the initial view
        page.screenshot(path="jules-scratch/verification/initial_view.png")
        # Click on the first stacked card
        stacked_card.click()
        # Wait for the animation to complete
        page.wait_for_timeout(1000)
        # Take a screenshot of the expanded view
        page.screenshot(path="jules-scratch/verification/expanded_view.png")
    else:
        # If no stacked cards are present, just take a screenshot of the list
        page.screenshot(path="jules-scratch/verification/no_stacked_cards_view.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
