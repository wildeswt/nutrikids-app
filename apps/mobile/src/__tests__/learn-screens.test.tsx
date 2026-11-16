import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../constants/routes.js';

/** Child of 3 years and a bit: always inside the 36-47 months range. */
function birthDateMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

const MATEO = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Mateo',
  lastName: 'Gómez',
  birthDate: birthDateMonthsAgo(40),
  sex: 'MALE' as const,
};

const VALENTINA = {
  id: '44444444-4444-4444-8444-444444444444',
  firstName: 'Valentina',
  lastName: 'Ríos',
  birthDate: birthDateMonthsAgo(15),
  sex: 'FEMALE' as const,
};

const article = (n: number, title: string, minAgeMonths: number, maxAgeMonths: number) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  title,
  body: 'Primer párrafo del artículo.\n\nSegundo párrafo del artículo.',
  minAgeMonths,
  maxAgeMonths,
  language: 'es',
});

const TODDLER = article(1, 'Cuántas comidas necesita tu hijo', 12, 23);
const PRESCHOOL = article(2, 'Meriendas para llevar a la escuela', 36, 47);
const OLDER = article(3, 'Comer en familia', 48, 60);

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  params: {} as Record<string, string>,
  focusCallbacks: [] as Array<() => void>,
  loadChildren: vi.fn(),
  loadEducation: vi.fn(),
  children: { status: 'ready', children: [] as unknown[], error: null as string | null },
  education: {
    status: 'ready',
    articles: [] as unknown[],
    contentLanguage: 'es' as string | null,
    offline: false,
    error: null as string | null,
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

vi.mock('../hooks/useChildren.js', () => ({
  useChildren: () => ({ ...mocks.children, load: mocks.loadChildren, create: vi.fn() }),
}));

vi.mock('../hooks/useEducation.js', () => ({
  useEducation: () => ({ ...mocks.education, load: mocks.loadEducation }),
}));

import LearnArticleScreen from '../app/(caregiver)/learn-article.js';
import LearnScreen from '../app/(caregiver)/learn.js';
import i18n from '../i18n/index.js';

interface ElementWithProps {
  props?: {
    testID?: string;
    children?: unknown;
    [key: string]: unknown;
  };
}

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = {};
  mocks.focusCallbacks = [];
  mocks.children = { status: 'ready', children: [MATEO], error: null };
  mocks.education = {
    status: 'ready',
    articles: [TODDLER, PRESCHOOL, OLDER],
    contentLanguage: 'es',
    offline: false,
    error: null,
  };
});

afterEach(async () => {
  await i18n.changeLanguage('es');
});

describe('LearnScreen («Aprende en casa»)', () => {
  it('lists only the articles for the age in months of the child, with the orange banner', () => {
    const html = render(LearnScreen);

    expect(html).toContain('Meriendas para llevar a la escuela');
    expect(html).not.toContain('Cuántas comidas necesita tu hijo');
    expect(html).not.toContain('Comer en familia');
    expect(html).toContain('Mateo Gómez');
    expect(html).toContain(t('caregiver:learn.ageRange', { min: 36, max: 47 }));
    expect(html).toContain(t('caregiver:learn.readTime', { count: 1 }));
  });

  it('shows a plain-language preview of each article', () => {
    const html = render(LearnScreen);

    expect(html).toContain('Primer párrafo del artículo.');
  });

  it('opens the article when it is pressed', () => {
    press(renderTree(LearnScreen as () => unknown), `learn-article-${PRESCHOOL.id}`);

    expect(mocks.push).toHaveBeenCalledWith({
      pathname: APP_ROUTES.CAREGIVER.LEARN_ARTICLE,
      params: { id: PRESCHOOL.id },
    });
  });

  it('filters by the child received in the route when there are several', () => {
    mocks.children = { status: 'ready', children: [MATEO, VALENTINA], error: null };
    mocks.params = { childId: VALENTINA.id };

    const html = render(LearnScreen);

    expect(html).toContain('Valentina Ríos');
    expect(html).toContain('Cuántas comidas necesita tu hijo');
    expect(html).not.toContain('Meriendas para llevar a la escuela');
  });

  it('offers a chip per child and one for all ages, only with several children', () => {
    const single = renderTree(LearnScreen as () => unknown);
    expect(findElementByTestId(single, 'learn-filter-all')).toBeNull();

    mocks.children = { status: 'ready', children: [MATEO, VALENTINA], error: null };
    const several = renderTree(LearnScreen as () => unknown);
    expect(findElementByTestId(several, `learn-filter-${MATEO.id}`)).not.toBeNull();
    expect(findElementByTestId(several, `learn-filter-${VALENTINA.id}`)).not.toBeNull();
    expect(findElementByTestId(several, 'learn-filter-all')).not.toBeNull();
  });

  it('shows every article when the child has no data yet (no children)', () => {
    mocks.children = { status: 'empty', children: [], error: null };

    const html = render(LearnScreen);

    expect(html).toContain('Cuántas comidas necesita tu hijo');
    expect(html).toContain('Comer en familia');
    expect(html).not.toContain('child-banner');
  });

  it('explains when there are no articles for the age and offers to see all', () => {
    mocks.education = { ...mocks.education, articles: [TODDLER, OLDER] };

    const tree = renderTree(LearnScreen as () => unknown);

    expect(findElementByTestId(tree, 'learn-empty-age')).not.toBeNull();
    expect(render(LearnScreen)).toContain(t('caregiver:learn.emptyForAgeSubtitle'));
    press(tree, 'learn-show-all');
  });

  it('shows the offline notice when the articles come from the saved copy', () => {
    mocks.education = { ...mocks.education, offline: true };

    const html = render(LearnScreen);

    expect(html).toContain(t('caregiver:learn.offlineNotice'));
    expect(html).toContain('Meriendas para llevar a la escuela');
  });

  it('warns when the articles are in another language than the app (Kichwa)', async () => {
    await i18n.changeLanguage('qu');

    const html = render(LearnScreen);

    expect(html).toContain(t('caregiver:learn.languageFallback'));
  });

  it('does not warn about the language when it matches', () => {
    expect(render(LearnScreen)).not.toContain(t('caregiver:learn.languageFallback'));
  });

  it('asks to connect once when nothing was downloaded yet', () => {
    mocks.education = { ...mocks.education, status: 'needs-connection', articles: [] };

    const tree = renderTree(LearnScreen as () => unknown);

    expect(render(LearnScreen)).toContain(t('caregiver:learn.needsConnectionTitle'));
    press(tree, 'learn-retry');
    expect(mocks.loadEducation).toHaveBeenCalledTimes(1);
  });

  it('shows loading, error with retry and an empty catalog', () => {
    mocks.education = { ...mocks.education, status: 'loading', articles: [] };
    expect(render(LearnScreen)).toContain(t('caregiver:learn.loading'));

    mocks.education = { ...mocks.education, status: 'error', error: 'Servidor caído' };
    expect(render(LearnScreen)).toContain('Servidor caído');

    mocks.education = { ...mocks.education, status: 'empty', error: null };
    expect(render(LearnScreen)).toContain(t('caregiver:learn.emptyCatalogTitle'));
  });

  it('reloads the children and the catalog every time the screen gains focus', () => {
    render(LearnScreen);
    mocks.focusCallbacks.at(-1)!();

    expect(mocks.loadChildren).toHaveBeenCalledTimes(1);
    expect(mocks.loadEducation).toHaveBeenCalledTimes(1);
  });

  it('goes back', () => {
    press(renderTree(LearnScreen as () => unknown), 'learn-back');
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });
});

describe('LearnArticleScreen («Detalle del artículo»)', () => {
  it('shows the article in plain paragraphs with its age range and reading time', () => {
    mocks.params = { id: PRESCHOOL.id };

    const html = render(LearnArticleScreen);

    expect(html).toContain('Meriendas para llevar a la escuela');
    expect(html).toContain('Primer párrafo del artículo.');
    expect(html).toContain('Segundo párrafo del artículo.');
    expect(html).toContain(t('caregiver:learn.ageRange', { min: 36, max: 47 }));
    expect(html).toContain(t('caregiver:learn.readTime', { count: 1 }));
  });

  it('says so when the article does not exist and goes back to the list', () => {
    mocks.params = { id: 'e0000000-0000-4000-8000-0000000000ff' };

    const tree = renderTree(LearnArticleScreen as () => unknown);
    expect(render(LearnArticleScreen)).toContain(t('caregiver:learn.article.notFoundTitle'));

    press(tree, 'learn-article-to-list');
    expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.CAREGIVER.LEARN);
  });

  it('shows loading while the catalog is read', () => {
    mocks.params = { id: PRESCHOOL.id };
    mocks.education = { ...mocks.education, status: 'loading', articles: [] };

    expect(render(LearnArticleScreen)).toContain(t('caregiver:learn.loading'));
  });

  it('shows the error with a retry when the catalog cannot be loaded', () => {
    mocks.params = { id: PRESCHOOL.id };
    mocks.education = { ...mocks.education, status: 'needs-connection', articles: [] };

    const tree = renderTree(LearnArticleScreen as () => unknown);
    expect(render(LearnArticleScreen)).toContain(t('caregiver:learn.needsConnectionTitle'));

    press(tree, 'learn-article-retry');
    expect(mocks.loadEducation).toHaveBeenCalledTimes(1);
  });

  it('loads the catalog when the screen gains focus (works from the saved copy offline)', () => {
    mocks.params = { id: PRESCHOOL.id };
    render(LearnArticleScreen);
    mocks.focusCallbacks.at(-1)!();

    expect(mocks.loadEducation).toHaveBeenCalledTimes(1);
  });
});
