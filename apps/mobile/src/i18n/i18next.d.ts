import 'i18next';
import type { BaseResources } from './resources.js';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: BaseResources;
  }
}
