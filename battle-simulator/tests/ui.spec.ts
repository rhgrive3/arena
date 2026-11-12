import { test, expect, type Page } from '@playwright/test';
import { positions } from '../tools/balance-lib';
import type { UnitKind } from '../src/game/units';

async function launchCampaign(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'キャンペーンをはじめる' }).click();
  await page.getByRole('button', { name: '部隊を編成する' }).click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-phase', 'setup');
  await expect(page.getByTestId('unit-spear')).toBeEnabled();
}

async function clickWorld(page: Page, x: number, z: number, touch = false) {
  const point = await page.evaluate(({ x, z }) => {
    const engine = window.__engine as unknown as { proj: (x: number, y: number, z: number) => { x: number; y: number }; renderer: { domElement: HTMLCanvasElement } };
    const projected = engine.proj(x, 0, z);
    const bounds = engine.renderer.domElement.getBoundingClientRect();
    return { x: projected.x + bounds.left, y: projected.y + bounds.top };
  }, { x, z });
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
}

test('title screen, campaign browser and locked missions are usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('EPIC BATTLE');
  await page.getByRole('button', { name: 'キャンペーンをはじめる' }).click();
  await expect(page.getByRole('heading', { name: 'キャンペーン' })).toBeVisible();
  await page.locator('.stage-row').nth(1).click();
  await expect(page.getByRole('button', { name: '未解放のミッション' })).toBeDisabled();
  await page.locator('.chapter-nav button').nth(5).click();
  await expect(page.locator('.stage-row')).toHaveCount(4);
  await page.locator('.chapter-nav button').first().click();
  await expect(page.getByRole('button', { name: '部隊を編成する' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('campaign placement, spending, undo and a team reset work from the UI', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await launchCampaign(page);
  // Deployment shows flat 2D emblems only: nine cards plus the selected-unit panel, and no rendered portraits.
  await expect(page.locator('.unit-dock .unit-emblem')).toHaveCount(9);
  await expect(page.locator('.selected-unit-title .unit-emblem')).toHaveCount(1);
  await expect(page.locator('.game-screen .unit-portrait')).toHaveCount(0);
  const initialGold = await page.getByTestId('active-gold').innerText();
  await expect(page.locator('.start-battle-button')).toBeDisabled();
  await clickWorld(page, -20, 0);
  await expect(page.getByTestId('blue-count')).toHaveText('1');
  await expect(page.getByTestId('active-gold')).not.toHaveText(initialGold);
  await expect(page.locator('.start-battle-button')).toBeEnabled();
  await page.getByRole('button', { name: '取り消し', exact: true }).click();
  await expect(page.getByTestId('blue-count')).toHaveText('0');
  await expect(page.getByTestId('active-gold')).toHaveText(initialGold);
  await page.getByRole('button', { name: '5体ずつ' }).click();
  await clickWorld(page, -22, 4);
  await expect(page.getByTestId('blue-count')).toHaveText('5');
  await page.getByRole('button', { name: '自軍をリセット', exact: true }).click();
  await page.getByRole('button', { name: 'リセットする', exact: true }).click();
  await expect(page.getByTestId('blue-count')).toHaveText('0');
  await expect(page.getByTestId('active-gold')).toHaveText(initialGold);
  expect(errors).toEqual([]);
});

test('sandbox keeps armies separate and battle controls are functional', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'カスタム戦', exact: true }).click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-phase', 'setup');
  await expect(page.getByTestId('blue-count')).toHaveText('16');
  await page.getByRole('button', { name: '敵軍を配置' }).click();
  await expect(page.getByTestId('red-count')).toHaveText('16');
  await page.getByTestId('unit-archer').click();
  await clickWorld(page, 25, 8);
  await expect(page.getByTestId('red-count')).toHaveText('17');
  await expect(page.getByTestId('active-gold')).toHaveText('2,930');
  await page.getByLabel('戦場を選択').selectOption('2');
  await expect(page.getByLabel('戦場を選択')).toHaveValue('2');
  await page.locator('.start-battle-button').click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-phase', 'playing');
  await page.getByRole('button', { name: '部隊選択', exact: true }).click();
  await expect(page.getByRole('button', { name: '部隊選択', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'カメラ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'カメラ', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '2倍速' }).click();
  await expect(page.getByRole('button', { name: '2倍速' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '操作ガイド', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '操作方法' })).toBeVisible();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-screen')).toHaveAttribute('data-phase', 'playing');
  await page.getByRole('button', { name: '一時停止', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '一時停止' })).toBeVisible();
  await page.getByRole('button', { name: '戦闘を再開' }).click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-phase', 'playing');
});

test('armory search, faction selection, model viewer and try-unit link work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '兵種図鑑', exact: true }).first().click();
  await expect(page.locator('.armory-unit')).toHaveCount(9);
  await page.getByRole('tab', { name: '異邦' }).click();
  await expect(page.locator('.armory-unit')).toHaveCount(9);
  await page.getByLabel('兵種を検索').fill('マンモス');
  await expect(page.locator('.armory-unit')).toHaveCount(1);
  await page.locator('.armory-unit').click();
  await expect(page.locator('.armory-detail h2')).toHaveText('マンモス');
  await expect(page.locator('.unit-model canvas')).toBeVisible();
  await page.getByRole('button', { name: 'この兵種を試す' }).click();
  await expect(page.getByTestId('unit-mammoth')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('settings persist and the help dialog is keyboard accessible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('switch', { name: 'アニメーションを抑える' }).click();
  await page.getByRole('button', { name: '軽量', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'アニメーションを抑える' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: '軽量', exact: true })).toHaveClass('active');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '操作ガイド', exact: true }).click();
  await page.getByRole('tab', { name: '戦闘とカメラ' }).click();
  await expect(page.getByText('W A S D', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('mobile title, campaign and placement fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThan(2);
  await page.getByRole('button', { name: 'キャンペーンをはじめる' }).click();
  await page.getByRole('button', { name: '部隊を編成する' }).click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-phase', 'setup');
  await expect(page.locator('.start-battle-button')).toBeInViewport();
  await expect(page.getByTestId('unit-spear')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThan(2);
});

test('a real campaign victory shows results, unlocks a unit and persists progress', async ({ page }) => {
  await launchCampaign(page);
  const army = positions([['guardian', 3], ['spear', 5], ['archer', 3]], 'ranks');
  let selected: UnitKind = 'spear';
  for (const unit of army) {
    if (selected !== unit.kind) { await page.getByTestId(`unit-${unit.kind}`).click(); selected = unit.kind; }
    await clickWorld(page, unit.x, unit.z);
  }
  await expect(page.getByTestId('blue-count')).toHaveText('11');
  await page.locator('.start-battle-button').click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-phase', 'playing');
  // Run the real fixed-step simulation quickly, without waiting for every rendered frame.
  const winner = await page.evaluate(() => {
    const engine = window.__engine as unknown as { sim: { phase: string; result: { winner: number } | null; advance: (dt: number) => void; drainEvents: () => void } };
    for (let frame = 0; frame < 12000 && engine.sim.phase === 'playing'; frame++) {
      engine.sim.advance(1 / 60);
      if (frame % 60 === 0) engine.sim.drainEvents();
    }
    return engine.sim.result?.winner;
  });
  expect(winner).toBe(0);
  await expect(page.getByRole('dialog', { name: 'VICTORY' })).toBeVisible();
  await expect(page.locator('.result-unlock')).toContainText('剣士');
  await page.getByRole('button', { name: '次のミッションへ' }).click();
  await expect(page.getByTestId('unit-swordsman')).toBeEnabled();
  await expect(page.locator('.deployment-heading')).toContainText('霧の街道');
  expect(await page.evaluate(() => localStorage.getItem('ebs.story.cleared'))).toBe('1');
  await page.reload();
  await expect(page.getByRole('button', { name: 'キャンペーンを続ける' })).toBeVisible();
});

test('touch devices can place units and inspect enemy information', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: 'キャンペーンをはじめる' }).tap();
  await page.getByRole('button', { name: '部隊を編成する' }).tap();
  await expect(page.getByTestId('unit-spear')).toBeEnabled();
  await clickWorld(page, -20, 0, true);
  await expect(page.getByTestId('blue-count')).toHaveText('1');
  await page.getByRole('button', { name: '兵種と敵軍の情報' }).tap();
  await expect(page.getByRole('dialog', { name: '部隊と敵軍の情報' })).toContainText('骨弓兵');
  await page.getByRole('button', { name: '配置に戻る' }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.start-battle-button')).toBeEnabled();
  await context.close();
});