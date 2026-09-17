import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADaSURBVHhe7dBBDQMBEMPAgi2lwjwMVwJDIFpH8se/+PP9Pe9lCiB5iQJIXqIAkpcogOQlCiAp1qYPogCSYm36IAogKdamD6IAkmJt+iAKICnWpg+iAJJibfogCiAp1qYPogCSYm36IAogKdamD6IAkmJt+iAKICnWpg+iAJJibfogCiAp1qYPogCSYm36IAogKdamD6IAkmJt+iAKICnWpg+iAJJibfogCiAp1qYPogCSYm36IAogKdamD6IAkmJt+iAKIHmJAkheogCSlyiA5CUKIHmJ4wGe9w+XK5Ebr9atOwAAAABJRU5ErkJggg==';

async function createPdfFixture(testInfo, pageCount = 2) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Sample page ${index + 1}`, { x: 72, y: 760, size: 24, font });
  }

  const bytes = await pdf.save();
  const filePath = testInfo.outputPath('sample.pdf');
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

function createImageFixture(testInfo) {
  const filePath = testInfo.outputPath('sample.png');
  fs.writeFileSync(filePath, Buffer.from(PNG_BASE64, 'base64'));
  return filePath;
}

test('renders the app shell and sidebar', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.logo-mark')).toHaveAttribute('src', '/modernland.png');
  await expect(page.locator('.topbar-title')).toHaveText('Modernland');
  await expect(page.locator('.privacy-chip')).toHaveCount(0);
  await expect(page.locator('link[rel="icon"][href="/icon-32.png"]')).toHaveCount(1);
  await expect(page.locator('.app-footer-credit')).toHaveText(
    'by Digital Management Modernland © 2026'
  );
  await expect(page.getByRole('link', { name: 'Alat PDF' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gabung File' })).toBeVisible();
});

test('navigates between modules', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Kompres PDF' }).click();
  await expect(page).toHaveURL(/#\/compress-pdf/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kompres PDF' })).toBeVisible();

  await page.getByRole('link', { name: 'Gambar ke PDF' }).click();
  await expect(page).toHaveURL(/#\/image-to-pdf/);
  await expect(page.getByRole('heading', { level: 1, name: 'Gambar ke PDF' })).toBeVisible();

  await page.getByRole('link', { name: 'Panduan' }).click();
  await expect(page).toHaveURL(/#\/guide/);
  await expect(page.getByRole('heading', { level: 1, name: 'Panduan' })).toBeVisible();
});

test('hamburger button hides and shows the sidebar', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#app-sidebar')).toBeVisible();
  await page.getByRole('button', { name: 'Sembunyikan navigasi' }).click();
  await expect(page.locator('#app-sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Tampilkan navigasi' }).click();
  await expect(page.locator('#app-sidebar')).toBeVisible();
});

test('content area scrolls when content is taller than the viewport', async ({ page }) => {
  await page.goto('/#/guide');

  const contentArea = page.locator('.content-area');
  const isScrollable = await contentArea.evaluate(node => node.scrollHeight > node.clientHeight);

  if (isScrollable) {
    await contentArea.evaluate(node => {
      node.scrollTop = node.scrollHeight;
    });
    const scrolled = await contentArea.evaluate(node => node.scrollTop > 0);
    expect(scrolled).toBe(true);
  } else {
    // Konten pendek: pastikan setidaknya window yang tidak discroll (bukan terpotong)
    const windowNotScrollable = await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight
    );
    expect(windowNotScrollable).toBe(true);
  }
});

test('PDF Tools loads a PDF and lists its pages', async ({ page }, testInfo) => {
  const pdfPath = await createPdfFixture(testInfo, 2);

  await page.goto('/');
  await page.setInputFiles('input[type="file"][accept="application/pdf"]', pdfPath);

  const cards = page.locator('.page-card');
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await expect(cards).toHaveCount(2);
  await expect(page.locator('.page-badge').first()).toHaveText('#1');
});

test('Compress PDF reads a document and estimates output', async ({ page }, testInfo) => {
  const pdfPath = await createPdfFixture(testInfo, 2);

  await page.goto('/#/compress-pdf');
  await page.setInputFiles('input[type="file"][accept*=".pdf"]', pdfPath);

  await expect(page.locator('.compress-file-card')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.compress-file-name')).toContainText('sample.pdf');
});

test('Image to PDF adds an image card', async ({ page }, testInfo) => {
  const imagePath = createImageFixture(testInfo);

  await page.goto('/#/image-to-pdf');
  await page.setInputFiles('input[type="file"][accept*="image/png"]', imagePath);

  await expect(page.locator('.page-card').first()).toBeVisible({ timeout: 30_000 });
});
