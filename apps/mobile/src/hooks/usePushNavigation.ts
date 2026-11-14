import { USER_ROLES } from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { APP_ROUTES, AUTH_STATUS } from '../constants/routes.js';
import { useAuth } from '../context/auth-context.js';
import { alertIdFromPushResponse } from '../lib/push-notifications.js';

/**
 * Opens the alert detail when the professional taps a push notification (NK-33), both with the
 * app open (listener) and closed (last response at launch). The tap is kept until the session is
 * authenticated; a user with both roles who is in the caregiver view is switched to the
 * professional one first. Users without the professional role ignore the tap.
 */
export function usePushNavigation(): void {
  const { status, user, activeRole, switchRole } = useAuth();
  const router = useRouter();
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const switching = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const alertId = alertIdFromPushResponse(response);
        if (active && alertId) setPendingAlertId(alertId);
      })
      .catch(() => {});

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const alertId = alertIdFromPushResponse(response);
      if (alertId) setPendingAlertId(alertId);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingAlertId || status !== AUTH_STATUS.AUTHENTICATED) return;

    if (!user?.roles.includes(USER_ROLES.PROFESSIONAL)) {
      setPendingAlertId(null);
      return;
    }
    if (activeRole !== USER_ROLES.PROFESSIONAL) {
      // Once the role changes the effect runs again and navigates.
      if (!switching.current) {
        switching.current = true;
        void switchRole(USER_ROLES.PROFESSIONAL)
          .catch(() => setPendingAlertId(null))
          .finally(() => {
            switching.current = false;
          });
      }
      return;
    }

    setPendingAlertId(null);
    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.ALERT_DETAIL as never,
      params: { alertId: pendingAlertId },
    });
  }, [pendingAlertId, status, user, activeRole, switchRole, router]);
}
