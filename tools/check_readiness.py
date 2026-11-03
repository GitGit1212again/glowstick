"""Isolated browser checks of the public bundle; no personal browser profile or data.
Run: python tools/check_readiness.py [--screenshots DIR] [--channel msedge|chrome]
Requires Playwright (pip install playwright) and an installed Microsoft Edge (Windows default) or Google Chrome
(other systems). Does not test an Android device or an iPhone.
"""
import argparse
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright


def dismiss_celebrations(page):
    for _ in range(20):
        page.wait_for_timeout(200)
        button = page.locator(".celebrate button")
        if not button.count():
            close = page.locator("#modal[aria-label=\"Draw a card\"]:not(.hidden) button").filter(has_text="Close")
            if close.count():
                close.click()
                continue
            return
        button.first.click()
    raise AssertionError("Too many celebration dialogs")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--channel", default="msedge" if sys.platform == "win32" else "chrome", help="installed browser to drive")
    parser.add_argument("--video", type=Path, help="Directory for a raw clean-browser WebM demonstration")
    args = parser.parse_args()
    url = (Path(__file__).resolve().parents[1] / "dist" / "Glowstick-store.html").as_uri()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    if args.video:
        args.video.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel=args.channel)
        opts = {"viewport": {"width": 412, "height": 892}}
        if args.video:
            opts["record_video_dir"] = str(args.video)
            opts["record_video_size"] = {"width": 412, "height": 892}
        context = browser.new_context(**opts)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url)
        page.wait_for_timeout(500)
        page.get_by_role("button", name="Skip", exact=True).click()
        page.get_by_role("button", name="Try a clean demo", exact=True).click()
        page.get_by_role("button", name="Try demo", exact=True).click()
        page.get_by_text("Fictional demo finances", exact=True).wait_for()
        assert page.evaluate("GS.S.settings.notify.phone") == ""
        if args.screenshots:
            page.screenshot(path=str(args.screenshots / "home-demo.png"), full_page=True)
            page.screenshot(path=str(args.screenshots / "home-phone.png"))
        page.wait_for_timeout(1000)
        page.evaluate("GS.go('goals')")
        page.get_by_text("Emergency fund (example)", exact=True).wait_for()
        if args.screenshots:
            page.screenshot(path=str(args.screenshots / "savings-goal-demo.png"), full_page=True)
        page.get_by_role("button", name="Negotiate plan", exact=True).click()
        page.wait_for_timeout(1000)
        if args.screenshots:
            page.screenshot(path=str(args.screenshots / "savings-plan-demo.png"))
        # Reload checks persisted demo state and resets transient dialogs.
        page.reload()
        page.wait_for_timeout(300)
        dismiss_celebrations(page)
        assert page.evaluate("GS.S.goals[0].saved") == 450
        page.evaluate("window.savedSetter=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota')};GS.S.settings.income=3300;GS.save()")
        page.get_by_text("Storage needs attention", exact=True).wait_for()
        assert page.evaluate("JSON.parse(localStorage.getItem('glowstick.v1')).settings.income") == 3200
        page.evaluate("Storage.prototype.setItem=window.savedSetter;void 0")
        page.get_by_role("button", name="Retry saving", exact=True).click()
        assert page.locator("#storage-problem").count() == 0
        assert page.evaluate("JSON.parse(localStorage.getItem('glowstick.v1')).settings.income") == 3300
        page.evaluate("GS.go('more')")
        page.get_by_text("Backup & reset", exact=True).click()
        saved = page.evaluate("JSON.stringify(GS.S)")
        page.locator("input[type=file]").set_input_files({"name":"bad.json","mimeType":"application/json","buffer":b'{"v":1}'})
        page.get_by_text("Invalid backup: Backup is missing settings or game state", exact=True).wait_for()
        assert page.evaluate("JSON.stringify(GS.S)") == saved
        page.locator("input[type=file]").set_input_files({"name":"valid.json","mimeType":"application/json","buffer":saved.encode()})
        page.get_by_role("button", name="Replace", exact=True).click()
        page.get_by_text("Fictional demo finances", exact=True).wait_for()
        broken = browser.new_context(viewport={"width":412,"height":892})
        broken.add_init_script("localStorage.setItem('glowstick.v1','{bad saved data')")
        bad_page = broken.new_page()
        bad_page.goto(url)
        bad_page.wait_for_timeout(600)
        bad_page.get_by_text("Storage needs attention", exact=True).wait_for()
        assert bad_page.evaluate("localStorage.getItem('glowstick.v1')") == "{bad saved data"
        assert not errors, errors
        context.close()
        browser.close()
    print("PASS: demo, savings goal/planning, reload persistence, quota warning/retry, invalid backup rejection, valid restore, corrupt-storage preservation; no page errors.")


if __name__ == "__main__":
    main()
