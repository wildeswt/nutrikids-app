import React from 'react';
import { renderToString } from 'react-dom/server';
import { Alert, type AlertButton } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';

const MATEO = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: '2023-06-05',
  sex: 'MALE' as const,
};

const VALENTINA = {
  id: '44444444-4444-4444-8444-444444444444',
  firstName: 'Valentina',
  lastName: 'Ríos',
  birthDate: '2024-02-10',
  sex: 'FEMALE' as const,
};

const PENDING_REQUEST = {
  id: '22222222-2222-4222-8222-222222222222',
  childId: MATEO.id,
  status: 'pending' as const,
  requestedAt: '2026-11-14T12:00:00.000Z',
  dueAt: '2026-11-29T12:00:00.000Z',
  resolvedAt: null,
};

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  params: {} as Record<string, string>,
  focusCallbacks: [] as Array<() => void>,
  loadChildren: vi.fn(),
  loadCheckups: vi.fn(),
  loadRights: vi.fn(),
  requestDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
  exportHistory: vi.fn(),
  rectify: vi.fn(),
  children: { status: 'ready', children: [] as unknown[], error: null as string | null },
  checkups: { status: 'empty', checkups: [] as unknown[], error: null as string | null },
  rights: {
    status: 'ready',
    requests: [] as unknown[],
    error: null as string | null,
    busy: null as string | null,
    pendingRequest: null as unknown,
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: mocks.back,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mocks.params,
  useFocusEffect: (callback: () => void) => {
    mocks.focusCallbacks.push(callback);
  },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('mock-icon', props),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: { children: React.ReactNode }) =>
    React.createElement('mock-safe-area', null, props.children),
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: {
      id: 'u0000000-0000-0000-0000-000000000001',
      firstName: 'Andrea',
      lastName: 'Silva',
      email: 'andrea@example.com',
      roles: ['CAREGIVER'],
    },
    activeRole: 'CAREGIVER',
  }),
}));

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({ ...mocks.children, load: mocks.loadChildren, create: vi.fn() }),
}));

vi.mock('../hooks/useCheckups.js', () => ({
  useCheckups: () => ({
    ...mocks.checkups,
    saving: false,
    load: mocks.loadCheckups,
    create: vi.fn(),
  }),
}));

vi.mock('../hooks/useConsent.js', () => ({
  useConsent: () => ({
    status: 'active',
    consent: {
      id: 'c1',
      childId: MATEO.id,
      textVersion: 'v1',
      grantedAt: '2026-10-01T10:00:00.000Z',
      revokedAt: null,
    },
    error: null,
    load: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
  }),
}));

vi.mock('../hooks/useDataRights.js', () => ({
  useDataRights: () => ({
    ...mocks.rights,
    load: mocks.loadRights,
    requestDeletion: mocks.requestDeletion,
    cancelDeletion: mocks.cancelDeletion,
    exportHistory: mocks.exportHistory,
    rectify: mocks.rectify,
  }),
}));

import EditChildScreen, { EditChildForm } from '../app/(caregiver)/edit-child.js';
import MyDataScreen from '../app/(caregiver)/my-data.js';
import PrivacyScreen, { ChildPrivacyPanel } from '../app/(caregiver)/privacy.js';
import i18n from '../i18n/index.js';

interface ElementWithProps {
  props?: {
    testID?: string;
    children?: unknown;
    [key: string]: unknown;
  };
}

/** Finds an element by testID in the tree returned by calling a component function. */
function findElementByTestId(node: unknown, testId: string): ElementWithProps | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByTestId(child, testId);
      if (found) return found;
    }
    return null;
  }
  const element = node as ElementWithProps;
  if (element.props?.testID === testId) return element;
  return findElementByTestId(element.props?.children, testId);
}

function renderTree(Screen: () => unknown): unknown {
  let tree: unknown = null;
  function Wrapper() {
    tree = Screen();
    return null;
  }
  renderToString(React.createElement(Wrapper));
  return tree;
}

function press(tree: unknown, testId: string) {
  const onPress = findElementByTestId(tree, testId)?.props?.['onPress'] as (() => void) | undefined;
  expect(onPress, `no onPress for ${testId}`).toBeTypeOf('function');
  onPress!();
}

const render = (Screen: () => React.ReactNode) => renderToString(React.createElement(Screen));
const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key as never, options as never);

/** The panel is a child component: its tree is read by calling it inside a render. */
const MateoPanelTree = () => ChildPrivacyPanel({ child: MATEO });
const MateoPanel = () => React.createElement(ChildPrivacyPanel, { child: MATEO });

let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocks.params = {};
  mocks.focusCallbacks = [];
  mocks.children = { status: 'ready', children: [MATEO, VALENTINA], error: null };
  mocks.checkups = { status: 'empty', checkups: [], error: null };
  mocks.rights = { status: 'ready', requests: [], error: null, busy: null, pendingRequest: null };
});

afterEach(() => {
  alertSpy.mockRestore();
});

/** Buttons of the last `Alert.alert` call. */
const lastAlertButtons = () => (alertSpy.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];

describe('MyDataScreen («Mis datos»)', () => {
  it('shows the account section (loaded from the API, editable)', () => {
    const html = render(MyDataScreen);

    expect(html).toContain(t('caregiver:myData.accountTitle'));
    expect(html).toContain('account-loading');
    expect(html).not.toContain(t('caregiver:myData.accountLocked'));
  });

  it('lists the linked children with their age', () => {
    const html = render(MyDataScreen);

    expect(html).toContain('Mateo Gómez');
    expect(html).toContain('Valentina Ríos');
    expect(html).toContain(t('caregiver:myData.fixData'));
  });

  it('opens the correction form and the privacy screen of a child', () => {
    const tree = renderTree(MyDataScreen as () => unknown);

    press(tree, `my-data-fix-${VALENTINA.id}`);
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.EDIT_CHILD,
      params: { childId: VALENTINA.id },
    });

    press(tree, `my-data-privacy-${MATEO.id}`);
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.PRIVACY,
      params: { childId: MATEO.id },
    });
  });

  it('shows loading, error with retry and an empty state', () => {
    mocks.children = { status: 'loading', children: [], error: null };
    expect(render(MyDataScreen)).toContain(t('caregiver:myData.loading'));

    mocks.children = { status: 'error', children: [], error: 'Sin conexión' };
    const tree = renderTree(MyDataScreen as () => unknown);
    expect(render(MyDataScreen)).toContain('Sin conexión');
    press(tree, 'my-data-retry');
    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);

    mocks.children = { status: 'empty', children: [], error: null };
    expect(render(MyDataScreen)).toContain(t('caregiver:myData.emptyTitle'));
  });

  it('shows the ChildBanner below the title and the bottom link to privacy', () => {
    const tree = renderTree(MyDataScreen as () => unknown);
    const html = render(MyDataScreen);

    expect(findElementByTestId(tree, 'my-data-banner')).not.toBeNull();
    expect(html).toContain('Andrea Silva');
    expect(html).toContain(t('caregiver:myData.privacySubtitle'));
    press(tree, 'my-data-privacy-bottom');
    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.PRIVACY);
  });

  it('reloads the children every time the screen gains focus', () => {
    render(MyDataScreen);
    mocks.focusCallbacks.at(-1)!();

    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);
  });
});

describe('EditChildScreen («Corregir datos»)', () => {
  beforeEach(() => {
    mocks.params = { childId: MATEO.id };
  });

  it('shows the form with the current data and the orange banner', () => {
    const html = render(EditChildScreen);

    expect(html).toContain('Mateo Gómez');
    expect(html).toContain('value="Mateo"');
    expect(html).toContain('value="Gómez"');
    expect(html).toContain('value="05/06/2023"');
    expect(html.indexOf(i18n.t('caregiver:addChild.sexFemale'))).toBeLessThan(
      html.indexOf(i18n.t('caregiver:addChild.sexMale')),
    );
    expect(html).toContain('edit-child-sex-MALE-check');
    expect(html).toContain('edit-child-age-notice');
  });

  it('lets the birth date and sex change while the child has no checkups', () => {
    const html = render(EditChildScreen);

    expect(html).not.toContain(t('caregiver:editChild.locked', { name: 'Mateo' }));
    expect(html).not.toContain(t('caregiver:editChild.checking'));
  });

  it('keeps the birth date and sex editable only for a child without checkups (form)', () => {
    // The form is a child component, so its tree is read through its own render.
    let editable: unknown;
    function Probe() {
      editable = EditChildForm({
        child: MATEO,
        identityEditable: true,
        identityState: 'editable',
        onBack: mocks.back,
      });
      return null;
    }
    renderToString(React.createElement(Probe));

    expect(findElementByTestId(editable, 'edit-child-birth-date')?.props?.['editable']).toBe(true);
    expect(findElementByTestId(editable, 'edit-child-locked')).toBeNull();
  });

  it('locks the birth date and sex, explaining why, once the child has checkups', () => {
    mocks.checkups = { status: 'ready', checkups: [{}], error: null };

    expect(render(EditChildScreen)).toContain(t('caregiver:editChild.locked', { name: 'Mateo' }));

    let locked: unknown;
    function Probe() {
      locked = EditChildForm({
        child: MATEO,
        identityEditable: false,
        identityState: 'locked',
        onBack: mocks.back,
      });
      return null;
    }
    renderToString(React.createElement(Probe));
    expect(findElementByTestId(locked, 'edit-child-birth-date')?.props?.['editable']).toBe(false);
    expect(findElementByTestId(locked, 'edit-child-locked')).not.toBeNull();
  });

  it('waits to know if the child has checkups before letting the identity change', () => {
    mocks.checkups = { status: 'loading', checkups: [], error: null };

    expect(render(EditChildScreen)).toContain(t('caregiver:editChild.checking'));
  });

  it('says so when the child is not among the caregiver’s children', () => {
    mocks.params = { childId: '99999999-9999-4999-8999-999999999999' };

    const tree = renderTree(EditChildScreen as () => unknown);

    expect(findElementByTestId(tree, 'edit-child-not-found')).not.toBeNull();
    press(tree, 'edit-child-to-list');
    expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.MY_DATA);
  });

  it('shows loading and error states while the children load', () => {
    mocks.children = { status: 'loading', children: [], error: null };
    expect(
      findElementByTestId(renderTree(EditChildScreen as () => unknown), 'edit-child-loading'),
    ).not.toBeNull();

    mocks.children = { status: 'error', children: [], error: 'Sin conexión' };
    const tree = renderTree(EditChildScreen as () => unknown);
    expect(render(EditChildScreen)).toContain('Sin conexión');
    press(tree, 'edit-child-retry');
    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);
  });

  it('reads the children and the checkups every time the screen gains focus', () => {
    render(EditChildScreen);
    for (const callback of mocks.focusCallbacks) callback();

    expect(mocks.loadChildren).toHaveBeenCalled();
    expect(mocks.loadCheckups).toHaveBeenCalled();
  });
});

describe('PrivacyScreen («Privacidad e historial»)', () => {
  it('shows the intro, the integrated child selector and the panel of the child received in the route', () => {
    mocks.params = { childId: VALENTINA.id };

    const tree = renderTree(PrivacyScreen as () => unknown);
    const html = render(PrivacyScreen);

    expect(html).toContain(t('caregiver:privacy.intro'));
    expect(findElementByTestId(tree, 'privacy-child-selector')).not.toBeNull();
    expect(html).toContain('Valentina Ríos');
  });

  it('does not show the child selector with a single child', () => {
    mocks.children = { status: 'ready', children: [MATEO], error: null };

    const tree = renderTree(PrivacyScreen as () => unknown);

    expect(findElementByTestId(tree, 'privacy-child-selector')).toBeNull();
  });

  it('includes the bottom link back to Mis datos and omits PDF export', () => {
    const tree = renderTree(PrivacyScreen as () => unknown);
    const html = render(PrivacyScreen);

    expect(html).not.toContain('PDF');
    press(tree, 'privacy-back-to-my-data');
    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.MY_DATA);
  });

  it('shows loading, error with retry and an empty state for the children', () => {
    mocks.children = { status: 'loading', children: [], error: null };
    expect(render(PrivacyScreen)).toContain(t('caregiver:privacy.loading'));

    mocks.children = { status: 'error', children: [], error: 'Sin conexión' };
    const tree = renderTree(PrivacyScreen as () => unknown);
    press(tree, 'privacy-children-retry');
    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);

    mocks.children = { status: 'empty', children: [], error: null };
    expect(render(PrivacyScreen)).toContain(t('caregiver:privacy.noChildrenTitle'));
  });
});

describe('ChildPrivacyPanel (consent, export and deletion)', () => {
  it('shows the consent section without the legacy ConsentChildItem component', () => {
    const html = render(MateoPanel);

    expect(html).toContain(t('caregiver:privacy.consentTitle'));
    expect(html).toContain(t('caregiver:privacy.readConsent'));
    expect(html).toContain(t('caregiver:privacy.revokeConsent'));
    expect(html).not.toContain(t('caregiver:consentItem.viewDocument'));
  });

  it('exports the history from the button', () => {
    press(renderTree(MateoPanelTree as () => unknown), 'privacy-export-button');

    expect(mocks.exportHistory).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before requesting the deletion, and only then sends it', () => {
    press(renderTree(MateoPanelTree as () => unknown), 'privacy-delete-button');

    expect(mocks.requestDeletion).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      t('caregiver:privacy.deleteConfirmTitle', { name: 'Mateo' }),
      expect.stringContaining('15'),
      expect.any(Array),
    );
    const [cancel, confirm] = lastAlertButtons();
    expect(cancel?.style).toBe('cancel');
    expect(confirm?.style).toBe('destructive');

    confirm!.onPress!();
    expect(mocks.requestDeletion).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the confirmation is dismissed', () => {
    press(renderTree(MateoPanelTree as () => unknown), 'privacy-delete-button');

    lastAlertButtons()[0]!.onPress?.();

    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it('shows the pending request with its deadline and lets the user cancel it', () => {
    mocks.rights = {
      ...mocks.rights,
      requests: [PENDING_REQUEST],
      pendingRequest: PENDING_REQUEST,
    };

    const tree = renderTree(MateoPanelTree as () => unknown);
    const html = render(MateoPanel);

    expect(html).toContain(t('caregiver:privacy.pendingTitle'));
    expect(findElementByTestId(tree, 'privacy-delete-button')).toBeNull();

    press(tree, 'privacy-cancel-button');
    expect(mocks.cancelDeletion).not.toHaveBeenCalled();
    lastAlertButtons()[1]!.onPress!();
    expect(mocks.cancelDeletion).toHaveBeenCalledWith(PENDING_REQUEST.id);
  });

  it('explains that only the legal representative can do this (403)', () => {
    mocks.rights = { ...mocks.rights, status: 'forbidden' };

    const tree = renderTree(MateoPanelTree as () => unknown);

    expect(render(MateoPanel)).toContain(t('caregiver:privacy.forbidden', { name: 'Mateo' }));
    expect(findElementByTestId(tree, 'privacy-export-button')).toBeNull();
    expect(findElementByTestId(tree, 'privacy-delete-button')).toBeNull();
  });

  it('shows loading and an error with retry', () => {
    mocks.rights = { ...mocks.rights, status: 'loading' };
    expect(render(MateoPanel)).toContain(t('caregiver:privacy.loading'));

    mocks.rights = { ...mocks.rights, status: 'error', error: 'Sin conexión' };
    const tree = renderTree(MateoPanelTree as () => unknown);
    expect(render(MateoPanel)).toContain('Sin conexión');
    press(tree, 'privacy-retry');
    expect(mocks.loadRights).toHaveBeenCalledTimes(1);
  });

  it('disables the actions while one is running', () => {
    mocks.rights = { ...mocks.rights, busy: 'export' };

    const tree = renderTree(MateoPanelTree as () => unknown);

    expect(findElementByTestId(tree, 'privacy-export-button')?.props?.['disabled']).toBe(true);
    expect(findElementByTestId(tree, 'privacy-delete-button')?.props?.['disabled']).toBe(true);
    expect(render(MateoPanel)).toContain(t('caregiver:privacy.exporting'));
  });

  it('reads the requests every time the screen gains focus', () => {
    render(MateoPanel);
    mocks.focusCallbacks.at(-1)!();

    expect(mocks.loadRights).toHaveBeenCalledTimes(1);
  });
});
