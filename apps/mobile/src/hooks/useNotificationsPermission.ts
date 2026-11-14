import { useCallback, useState } from 'react';
import {
  enableNotifications,
  getNotificationsPermission,
  type NotificationsPermission,
} from '../lib/push-notifications.js';

/**
 * Whether the phone lets the app show notifications. `null` until it is first read. Call `refresh`
 * when the screen gains focus (the user may have changed it in the phone settings).
 */
export function useNotificationsPermission() {
  const [permission, setPermission] = useState<NotificationsPermission | null>(null);

  const refresh = useCallback(async () => {
    setPermission(await getNotificationsPermission());
  }, []);

  const enable = useCallback(async () => {
    setPermission(await enableNotifications());
  }, []);

  return { permission, refresh, enable };
}
