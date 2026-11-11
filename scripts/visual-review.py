"""Local-only visual QA. Source: Foundation v1.1; retains synthetic screenshots as evidence."""
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width":390,"height":844},timezone_id="Asia/Shanghai",service_workers="block")
    page.goto('http://127.0.0.1:4173/#/login')
    page.wait_for_load_state('networkidle')
    output=Path('docs/evidence/screenshots')
    output.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(output/'visual-login.png'),full_page=True)
    page.get_by_placeholder('请输入演示账号').fill('demo_a')
    page.get_by_placeholder('请输入演示密码').fill('demo-only')
    page.get_by_role('button',name='演示登录',exact=True).click()
    page.get_by_role('heading',name='一起行动').wait_for()
    page.wait_for_load_state('networkidle')
    page.screenshot(path=str(output/'visual-activities.png'),full_page=True)
    print({"browser":browser.version,"title":page.title(),"headings":page.locator('h1,h2').all_text_contents()})
    browser.close()
