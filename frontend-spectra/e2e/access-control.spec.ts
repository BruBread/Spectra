import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_OPERATOR } from '../playwright.config';
import {
  apiAsAdmin,
  loginAs,
  loginViaUi,
  resetBackend,
  roleByKey,
  seedCamera,
  seedPerson,
  seedZone,
  seededRoles,
} from './support/api';

let api: APIRequestContext;

test.beforeAll(async () => {
  api = await apiAsAdmin();
});

test.afterAll(async () => {
  await resetBackend(api);
  await api.dispose();
});

test.beforeEach(async () => {
  await resetBackend(api);
});

const goTo = (page: Page, tab: string) => page.goto(`/access-control?tab=${tab}`);

/**
 * Role cards are addressed by key, not name: a name is editable text that also
 * appears in filters and descriptions, so matching on it picks up the wrong
 * element.
 */
const roleCard = (page: Page, key: string) => page.locator(`[data-role-key="${key}"]`);

/** Form fields are scoped to the dialog: the panels behind it have filters with the same labels. */
const dialog = (page: Page) => page.getByRole('dialog');

test.describe('access control: navigation and roles', () => {
  test('is reachable from the sidebar and shows the two seeded roles', async ({ page }) => {
    await loginViaUi(page);
    await page.getByRole('link', { name: 'Access Control' }).click();
    await expect(page).toHaveURL(/\/access-control/);

    await page.getByRole('tab', { name: 'Roles' }).click();

    // Seeded by the backend at boot, not fabricated by the UI.
    const roles = await seededRoles(api);
    expect(roles.map((role) => role.key).sort()).toEqual(['security_guard', 'staff']);

    await expect(roleCard(page, 'security_guard')).toContainText('Security guard');
    await expect(roleCard(page, 'staff')).toContainText('Staff');
  });

  test('says permissions are not enforced yet', async ({ page }) => {
    await loginViaUi(page);
    await goTo(page, 'roles');
    // The UI must not imply that configuring a role does anything today.
    await expect(page.getByText(/No detector or policy engine reads them yet/)).toBeVisible();
  });

  test('offers no zone rule controls until a zone exists', async ({ page }) => {
    await loginViaUi(page);
    await goTo(page, 'roles');

    await expect(page.getByText('No restricted zones exist yet.').first()).toBeVisible();
    // The restricted_area rule controls only appear once there is a real zone
    // to write a rule about.
    await expect(page.getByRole('button', { name: 'Allow', exact: true })).toHaveCount(0);
  });

  test('shows the whole catalog, with possible_weapon read-only', async ({ page }) => {
    await loginViaUi(page);
    await goTo(page, 'roles');

    const guard = roleCard(page, 'security_guard');
    // Rendered from the code-defined catalog, not invented by the UI.
    await expect(guard.locator('[data-action="restricted_area"]')).toBeVisible();
    await expect(guard.locator('[data-action="possible_weapon"]')).toContainText('Not active yet');
    await expect(guard.locator('[data-action="unattended_object"]')).toContainText(
      /ownership cannot be established/i,
    );
  });

  test('creates a custom role and grants it a zone, without confirmation', async ({ page }) => {
    const cameraId = await seedCamera(api);
    const zone = await seedZone(api, { name: 'Server Room', cameraId });

    await loginViaUi(page);
    await goTo(page, 'roles');

    await page.getByRole('button', { name: 'Add role' }).click();
    await dialog(page).getByLabel('Name').fill('Contractor');
    // The key is derived from the name until it is edited.
    await expect(dialog(page).getByLabel('Key')).toHaveValue('contractor');
    await dialog(page).getByRole('button', { name: 'Add role' }).click();

    const contractor = roleCard(page, 'contractor');
    await expect(contractor).toContainText('Contractor');

    // Allow the zone on this role. A role rule is specific, so it applies
    // immediately with no confirmation dialog.
    const row = contractor.locator(`[data-zone-rule="${zone._id}"]`);
    await row.getByRole('button', { name: 'Allow', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Allow', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const role = await roleByKey(api, 'contractor');
    const detail = await (await api.get(`/api/roles/${role._id}`)).json();
    expect(detail.permissions.actions).toEqual([
      expect.objectContaining({ action: 'restricted_area', rule: 'allow' }),
    ]);

    // The other roles must not have been granted anything by association.
    const staff = await roleByKey(api, 'staff');
    const staffDetail = await (await api.get(`/api/roles/${staff._id}`)).json();
    expect(staffDetail.permissions.actions).toHaveLength(0);
  });

  test('restricting a granted zone removes the rule rather than storing a denial', async ({ page }) => {
    const cameraId = await seedCamera(api);
    const zone = await seedZone(api, { name: 'Vault', cameraId });
    const guard = await roleByKey(api, 'security_guard');
    await api.patch(`/api/roles/${guard._id}`, {
      data: { permissions: { actions: [{ action: 'restricted_area', zoneId: zone._id, rule: 'allow' }] } },
    });

    await loginViaUi(page);
    await goTo(page, 'roles');

    const row = roleCard(page, 'security_guard').locator(`[data-zone-rule="${zone._id}"]`);
    await expect(row.getByRole('button', { name: 'Allow', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await row.getByRole('button', { name: 'Restrict', exact: true }).click();

    await expect(async () => {
      const detail = await (await api.get(`/api/roles/${guard._id}`)).json();
      // Restrict is the default; it is stored as the absence of a rule, not as
      // an explicit denial this two-state control never meant.
      expect(detail.permissions.actions).toHaveLength(0);
    }).toPass();
  });

  test('refuses to delete a role that people still hold, and says why', async ({ page }) => {
    const staff = await roleByKey(api, 'staff');
    await seedPerson(api, { name: 'E2E Held Role', roleId: staff._id });

    await loginViaUi(page);
    await goTo(page, 'roles');

    await roleCard(page, 'staff').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(/still in use and cannot be deleted/)).toBeVisible();
    // The role must survive.
    expect((await seededRoles(api)).some((role) => role.key === 'staff')).toBe(true);
  });

  test('cannot change a role key once created', async ({ page }) => {
    await loginViaUi(page);
    await goTo(page, 'roles');

    await roleCard(page, 'staff').getByRole('button', { name: 'Edit' }).click();

    await expect(dialog(page).getByLabel('Key')).toBeDisabled();
    await expect(page.getByText(/recorded policy decisions refer to it/)).toBeVisible();
  });
});

test.describe('access control: people', () => {
  test('shows an honest empty state before anyone is registered', async ({ page }) => {
    await loginViaUi(page);
    await goTo(page, 'people');

    await expect(page.getByText('No people registered yet')).toBeVisible();
  });

  test('shows an API-error state instead of an empty list when the request fails', async ({ page }) => {
    await loginViaUi(page);
    await page.route('**/api/people*', (route) => route.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await goTo(page, 'people');

    await expect(page.getByText('Could not load people')).toBeVisible();
    // A failed request must never read as "nobody is registered".
    await expect(page.getByText('No people registered yet')).toHaveCount(0);
  });

  test('creates a person and auto-assigns the next AprilTag', async ({ page }) => {
    const guard = await roleByKey(api, 'security_guard');
    await loginViaUi(page);
    await goTo(page, 'people');

    await page.getByRole('button', { name: 'Add person' }).click();
    // No AprilTag field: the form promises automatic assignment instead.
    await expect(dialog(page).getByLabel('AprilTag ID')).toHaveCount(0);
    await expect(dialog(page).getByTestId('apriltag-autoassign')).toContainText(
      'Spectra will assign the next available AprilTag automatically',
    );

    await dialog(page).getByLabel('Full name').fill('E2E Guard');
    await dialog(page).getByLabel('Role').selectOption(guard._id);
    await dialog(page).getByRole('button', { name: 'Add person' }).click();

    // The first person in a fresh backend gets tag 0, shown on the row.
    const row = page.locator('tr').filter({ hasText: 'E2E Guard' });
    await expect(row).toContainText('AprilTag only');
    await expect(row).toContainText('Tag 0');

    const people = await (await api.get('/api/people')).json();
    expect(people).toHaveLength(1);
    expect(people[0].aprilTagId).toBe(0);
  });

  test('issues an AprilTag to an active person who has none', async ({ page }) => {
    const staff = await roleByKey(api, 'staff');
    // A tagless active person — the state left after a release-then-reactivate,
    // or a record from before automatic assignment.
    await seedPerson(api, { name: 'E2E Untagged', roleId: staff._id });

    await loginViaUi(page);
    await goTo(page, 'people');

    const row = page.locator('tr').filter({ hasText: 'E2E Untagged' });
    await expect(row).toContainText('No credentials');
    await row.getByRole('button', { name: 'Issue AprilTag' }).click();

    await expect(row).toContainText('Tag 0');
    const people = await (await api.get('/api/people')).json();
    expect(people[0].aprilTagId).toBe(0);
  });

  test('removes a person and releases their credentials, after confirmation', async ({ page }) => {
    const staff = await roleByKey(api, 'staff');
    await seedPerson(api, { name: 'E2E Departing', roleId: staff._id, aprilTagId: 5, loraDeviceId: 'e2e-band-go' });

    await loginViaUi(page);
    await goTo(page, 'people');

    await page.locator('tr').filter({ hasText: 'E2E Departing' }).getByRole('button', { name: 'Remove' }).click();

    // The confirmation must spell out that both credentials become reusable.
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('AprilTag 5');
    await expect(confirm).toContainText('reusable');
    await confirm.getByRole('button', { name: 'Remove and release credentials' }).click();

    // Gone from the default (active) view…
    await expect(page.locator('tr').filter({ hasText: 'E2E Departing' })).toHaveCount(0);
    // …but archived, not deleted, with both credentials cleared.
    const all = await (await api.get('/api/people')).json();
    expect(all).toHaveLength(1);
    expect(all[0].active).toBe(false);
    expect(all[0].aprilTagId).toBeNull();
    expect(all[0].loraDeviceId).toBeNull();
  });

  test('states the four credential combinations for what they are', async ({ page }) => {
    const staff = await roleByKey(api, 'staff');
    await seedPerson(api, { name: 'E2E Both', roleId: staff._id, aprilTagId: 1, loraDeviceId: 'e2e-band-1' });
    await seedPerson(api, { name: 'E2E Tag Only', roleId: staff._id, aprilTagId: 2 });
    await seedPerson(api, { name: 'E2E Lora Only', roleId: staff._id, loraDeviceId: 'e2e-band-2' });
    await seedPerson(api, { name: 'E2E Neither', roleId: staff._id });

    await loginViaUi(page);
    await goTo(page, 'people');

    await expect(page.locator('tr').filter({ hasText: 'E2E Both' })).toContainText('AprilTag + LoRa');
    await expect(page.locator('tr').filter({ hasText: 'E2E Tag Only' })).toContainText('AprilTag only');
    await expect(page.locator('tr').filter({ hasText: 'E2E Lora Only' })).toContainText('LoRa only');
    await expect(page.locator('tr').filter({ hasText: 'E2E Neither' })).toContainText('No credentials');
  });

  test('says a LoRa-only person is not recognizable by camera', async ({ page }) => {
    const staff = await roleByKey(api, 'staff');
    await seedPerson(api, { name: 'E2E Band Only', roleId: staff._id, loraDeviceId: 'e2e-band-9' });

    await loginViaUi(page);
    await goTo(page, 'people');
    await page.locator('tr').filter({ hasText: 'E2E Band Only' }).getByRole('button', { name: 'View' }).click();

    const dialog = page.getByRole('dialog');
    // The core rule of the identity model, stated where it matters.
    await expect(dialog).toContainText('Not recognizable by camera');
    await expect(dialog).toContainText('never identifies a person or grants permissions');
  });

  test('lists only real LoRa devices, marking assigned ones', async ({ page }) => {
    const staff = await roleByKey(api, 'staff');
    await seedPerson(api, { name: 'E2E Band Owner', roleId: staff._id, loraDeviceId: 'e2e-band-taken' });

    await loginViaUi(page);
    await goTo(page, 'people');
    await page.getByRole('button', { name: 'Add person' }).click();

    const picker = page.getByLabel('LoRa device');
    // No uplinks were received, so the only known device is the assigned one.
    await expect(picker.locator('option')).toHaveCount(3); // None, the assigned device, manual entry
    await expect(picker.locator('option', { hasText: 'e2e-band-taken' })).toContainText('assigned to E2E Band Owner');
  });

  test('deactivates a person without deleting them, and keeps their tag reserved', async ({ page }) => {
    const staff = await roleByKey(api, 'staff');
    await seedPerson(api, { name: 'E2E Leaver', roleId: staff._id, aprilTagId: 3 });

    await loginViaUi(page);
    await goTo(page, 'people');
    await page.locator('tr').filter({ hasText: 'E2E Leaver' }).getByRole('button', { name: 'Deactivate' }).click();

    // Leaves the default active view once deactivated…
    await expect(page.locator('tr').filter({ hasText: 'E2E Leaver' })).toHaveCount(0);
    // …but is still on record, and — unlike Remove — keeps its AprilTag reserved.
    const people = await (await api.get('/api/people')).json();
    expect(people).toHaveLength(1);
    expect(people[0].active).toBe(false);
    expect(people[0].aprilTagId).toBe(3);
  });
});

test.describe('access control: restricted zones', () => {
  test('needs a camera before a zone can be drawn', async ({ page }) => {
    await loginViaUi(page);
    await goTo(page, 'zones');

    await expect(page.getByText('No cameras registered')).toBeVisible();
  });

  test('lists real zones and which roles are allowed in them', async ({ page }) => {
    const cameraId = await seedCamera(api);
    const zone = await seedZone(api, { name: 'E2E Pool Deck', cameraId });
    const guard = await roleByKey(api, 'security_guard');
    const granted = await api.patch(`/api/roles/${guard._id}`, {
      data: { permissions: { actions: [{ action: 'restricted_area', zoneId: zone._id, rule: 'allow' }] } },
    });
    expect(granted.ok()).toBe(true);

    await loginViaUi(page);
    await goTo(page, 'zones');

    const row = page.locator('tr').filter({ hasText: 'E2E Pool Deck' });
    await expect(row).toContainText('E2E Test Camera');
    await expect(row).toContainText('Security guard');
    await expect(row).toContainText('Active');
  });

  test('says a zone with no roles denies everyone', async ({ page }) => {
    const cameraId = await seedCamera(api);
    await seedZone(api, { name: 'E2E Nobody Zone', cameraId });

    await loginViaUi(page);
    await goTo(page, 'zones');

    await expect(page.locator('tr').filter({ hasText: 'E2E Nobody Zone' })).toContainText('None — everyone is denied');
  });

  test('says zones are not wired into detection', async ({ page }) => {
    await loginViaUi(page);
    await goTo(page, 'zones');
    await expect(page.getByText(/No detector reads them yet/)).toBeVisible();
  });

  test('cannot move a zone to another camera', async ({ page }) => {
    const cameraId = await seedCamera(api);
    await seedZone(api, { name: 'E2E Fixed Zone', cameraId });

    await loginViaUi(page);
    await goTo(page, 'zones');
    await page.locator('tr').filter({ hasText: 'E2E Fixed Zone' }).getByRole('button', { name: 'Edit' }).click();

    await expect(dialog(page).getByLabel('Camera')).toBeDisabled();
    await expect(page.getByText(/cannot move between cameras/)).toBeVisible();
  });

  test('archives a zone rather than losing it', async ({ page }) => {
    const cameraId = await seedCamera(api);
    await seedZone(api, { name: 'E2E Old Zone', cameraId });

    await loginViaUi(page);
    await goTo(page, 'zones');
    await page.locator('tr').filter({ hasText: 'E2E Old Zone' }).getByRole('button', { name: 'Archive' }).click();

    await expect(page.locator('tr').filter({ hasText: 'E2E Old Zone' })).toContainText('Archived');

    const zones = await (await api.get('/api/zones')).json();
    expect(zones).toHaveLength(1);
    expect(zones[0].active).toBe(false);
  });
});

test.describe('access control: unidentified-person policy', () => {
  test('defaults to restrict and explains the blast radius', async ({ page }) => {
    const cameraId = await seedCamera(api);
    const zone = await seedZone(api, { name: 'E2E Lobby', cameraId });

    await loginViaUi(page);
    await goTo(page, 'unidentified');

    await expect(page.getByText(/everyone the cameras cannot identify/i)).toBeVisible();
    const row = page.locator(`[data-zone-rule="${zone._id}"]`);
    // Restrict is the starting state — nobody has granted anything.
    await expect(row.getByRole('button', { name: 'Restrict', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('requires explicit confirmation to allow, and persists on confirm', async ({ page }) => {
    const cameraId = await seedCamera(api);
    const zone = await seedZone(api, { name: 'E2E Atrium', cameraId });

    await loginViaUi(page);
    await goTo(page, 'unidentified');

    const row = page.locator(`[data-zone-rule="${zone._id}"]`);
    await row.getByRole('button', { name: 'Allow', exact: true }).click();

    // A blanket allow for everyone unidentified must not happen on one click.
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('Allow every unidentified person?');
    await expect(confirm).toContainText('E2E Atrium');
    await confirm.getByRole('button', { name: /^Allow in/ }).click();

    await expect(async () => {
      const policy = await (await api.get('/api/unidentified-policy')).json();
      expect(policy.rules).toEqual([expect.objectContaining({ action: 'restricted_area', rule: 'allow' })]);
    }).toPass();
  });

  test('cancelling the confirmation leaves the zone restricted', async ({ page }) => {
    const cameraId = await seedCamera(api);
    const zone = await seedZone(api, { name: 'E2E Foyer', cameraId });

    await loginViaUi(page);
    await goTo(page, 'unidentified');

    await page.locator(`[data-zone-rule="${zone._id}"]`).getByRole('button', { name: 'Allow', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    // Nothing was written — the API still returns an empty rule set.
    const policy = await (await api.get('/api/unidentified-policy')).json();
    expect(policy.rules).toHaveLength(0);
  });

  test('an operator sees the policy but cannot change it', async ({ page }) => {
    const cameraId = await seedCamera(api);
    await seedZone(api, { name: 'E2E Operator Zone', cameraId });

    await loginAs(page, E2E_OPERATOR);
    await goTo(page, 'unidentified');

    await expect(page.getByText(/everyone the cameras cannot identify/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allow', exact: true }).first()).toBeDisabled();
  });
});

test.describe('access control: decision log', () => {
  test('is empty and says why, rather than inventing decisions', async ({ page }) => {
    await loginViaUi(page);
    await goTo(page, 'decisions');

    await expect(page.getByText('No policy decisions recorded')).toBeVisible();
    await expect(page.getByText(/has not been built/)).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('shows an API-error state instead of an empty log when the request fails', async ({ page }) => {
    await loginViaUi(page);
    await page.route('**/api/policy-decisions*', (route) => route.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await goTo(page, 'decisions');

    await expect(page.getByText('Could not load the decision log')).toBeVisible();
    // "We could not ask" is not "nothing happened".
    await expect(page.getByText('No policy decisions recorded')).toHaveCount(0);
  });
});

test.describe('access control: operator permissions', () => {
  test('an operator can read but is offered no mutation controls', async ({ page }) => {
    const cameraId = await seedCamera(api);
    await seedZone(api, { name: 'E2E Read Only Zone', cameraId });
    const staff = await roleByKey(api, 'staff');
    await seedPerson(api, { name: 'E2E Visible Person', roleId: staff._id });

    await loginAs(page, E2E_OPERATOR);
    await goTo(page, 'people');

    await expect(page.getByText(/Read-only: changing access control requires an admin account/)).toBeVisible();
    await expect(page.locator('tr').filter({ hasText: 'E2E Visible Person' })).toBeVisible();

    // Reading is allowed; every write control is absent rather than offered
    // and then rejected with a 403.
    await expect(page.getByRole('button', { name: 'Add person' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Issue AprilTag' })).toHaveCount(0);

    await goTo(page, 'zones');
    await expect(page.locator('tr').filter({ hasText: 'E2E Read Only Zone' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add zone' })).toHaveCount(0);

    await goTo(page, 'roles');
    await expect(page.getByRole('button', { name: 'Add role' })).toHaveCount(0);
    // The Allow/Restrict controls are visible but not operable.
    await expect(page.getByRole('button', { name: 'Allow', exact: true }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Restrict', exact: true }).first()).toBeDisabled();
  });
});
