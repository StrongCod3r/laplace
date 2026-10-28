import { expect, test } from '@playwright/test';

const publicUrl = 'https://strongcod3r.github.io/laplace/';
test.use({ baseURL: 'http://127.0.0.1:4176', serviceWorkers: 'block' });

test('production HTML supplies consistent search and social metadata before JavaScript', async ({
  page,
}) => {
  const response = await page.goto('/laplace/');
  expect(response?.status()).toBe(200);
  const html = await response!.text();
  expect(html).not.toMatch(/__APP_[A-Z_]+__/);
  expect(html).toContain('<title>Laplace — Local-first Markdown notes</title>');
  const metadata = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, 'text/html');
    const content = (selector: string) => document.querySelector(selector)?.getAttribute('content');
    return {
      canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map((link) =>
        link.getAttribute('href'),
      ),
      description: content('meta[name="description"]'),
      socialDescription: content('meta[property="og:description"]'),
      socialUrl: content('meta[property="og:url"]'),
      socialImage: content('meta[property="og:image"]'),
      twitterImage: content('meta[name="twitter:image"]'),
      schema: JSON.parse(
        document.querySelector('script[type="application/ld+json"]')!.textContent!,
      ),
    };
  }, html);
  expect(metadata.canonicals).toEqual([publicUrl]);
  expect(metadata.description).toContain('Markdown notes');
  expect(metadata.socialDescription).toBe(metadata.description);
  expect(metadata.socialUrl).toBe(publicUrl);
  expect(metadata.socialImage).toBe(`${publicUrl}icons/laplace-512.png`);
  expect(metadata.twitterImage).toBe(metadata.socialImage);
  expect(metadata.schema).toMatchObject({
    '@type': 'WebApplication',
    name: 'Laplace',
    url: publicUrl,
  });
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page).toHaveTitle('Laplace — Local-first Markdown notes');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', publicUrl);
});

test('sitemap and social image are available under the production base', async ({ request }) => {
  const response = await request.get('/laplace/sitemap.xml');
  expect(response.status()).toBe(200);
  const sitemap = await response.text();
  expect(sitemap.match(/<loc>/g)).toHaveLength(1);
  expect(sitemap).toContain(`<loc>${publicUrl}</loc>`);
  const image = await request.get('/laplace/icons/laplace-512.png');
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });

  test('the app has a readable introduction instead of a permanent loading skeleton', async ({
    page,
  }) => {
    await page.goto('/laplace/');
    await expect(
      page.getByRole('heading', { name: 'Laplace — Local-first Markdown notes' }),
    ).toBeVisible();
    await expect(page.locator('noscript main p').nth(2)).toHaveText(
      'Enable JavaScript to open your workspace.',
    );
    await expect(
      page.getByRole('link', { name: 'Read the documentation on GitHub' }),
    ).toBeVisible();
    await expect(page.locator('#root')).toBeHidden();
    const overflow = await page.locator('body').evaluate((body) => {
      return body.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);
  });
});
