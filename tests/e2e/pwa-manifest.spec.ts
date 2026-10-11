import { expect, test } from '@playwright/test';

for (const [mode, origin] of [
  ['development', 'http://127.0.0.1:4175'],
  ['production', 'http://127.0.0.1:4176'],
] as const) {
  test(mode + ' serves a valid manifest and icons under the deployment base', async ({ page }) => {
    await page.goto(origin + '/laplace/');
    const manifestUrl = await page
      .locator('link[rel="manifest"]')
      .evaluate((element: HTMLLinkElement) => element.href);
    expect(manifestUrl).toBe(origin + '/laplace/manifest.webmanifest');
    const response = await page.request.get(manifestUrl);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await response.json();
    expect(manifest.name).toBe('Laplace');
    expect(new URL(manifest.start_url, manifestUrl).href).toBe(origin + '/laplace/');
    expect(new URL(manifest.scope, manifestUrl).href).toBe(origin + '/laplace/');
    for (const icon of manifest.icons) {
      expect(icon.src).not.toContain('__APP_ID__');
      const iconResponse = await page.request.get(new URL(icon.src, manifestUrl).href);
      expect(iconResponse.status()).toBe(200);
      expect(iconResponse.headers()['content-type']).toContain(icon.type);
    }
    const faviconUrl = await page
      .locator('link[rel="icon"]')
      .evaluate((element: HTMLLinkElement) => element.href);
    expect(faviconUrl).toBe(origin + '/laplace/icons/laplace.svg');
    const cdp = await page.context().newCDPSession(page);
    const parsed = await cdp.send('Page.getAppManifest');
    expect(parsed.errors).toEqual([]);
  });
}
