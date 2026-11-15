import { Ionicons } from '@expo/vector-icons';
import { USER_ROLES, type UserRole } from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';
import { PALETTE } from '../constants/colors.js';
import { RADIUS_PILL } from '../constants/layout.js';
import { APP_ROUTES, AUTH_STATUS } from '../constants/routes.js';
import { font } from '../constants/typography.js';
import { useOptionalAuth } from '../context/auth-context.js';
import { useConnectionBarState } from '../hooks/useConnectionBarState.js';
import type { ConnectionBarKind, ConnectionBarState } from '../lib/connection-bar.js';

type VisibleConnectionBarKind = Exclude<ConnectionBarKind, 'hidden'>;
type VisibleConnectionBarState = { kind: VisibleConnectionBarKind; count: number };

const BAR_TEXT_COLOR = '#FBFBFB';
const MAX_BAR_WIDTH = 368;
const EXPANDED_MAX_HEIGHT = 64;
const ANIMATION_DURATION_MS = 200;
const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

interface KindVisualConfig {
  backgroundColor: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
}

const VISUAL_BY_KIND: Record<VisibleConnectionBarKind, KindVisualConfig> = {
  offline: {
    backgroundColor: '#575757',
    iconName: 'cloud-offline-outline',
  },
  sending: {
    backgroundColor: '#F77E4D',
    iconName: 'sync-outline',
  },
  error: {
    backgroundColor: '#E14100',
    iconName: 'alert-circle-outline',
  },
  synced: {
    backgroundColor: '#2D5F5A',
    iconName: 'checkmark-circle-outline',
  },
};

function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    if (typeof AccessibilityInfo?.isReduceMotionEnabled === 'function') {
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => {
          if (active) {
            setReduceMotion(Boolean(enabled));
          }
        })
        .catch(() => {});
    }

    const subscription =
      typeof AccessibilityInfo?.addEventListener === 'function'
        ? AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
            setReduceMotion(Boolean(enabled));
          })
        : undefined;

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}

export interface ConnectionBarProps {
  /** Rol activo opcional; si se omite se toma del contexto de autenticación. */
  role?: UserRole;
  /** Estado explícito opcional (útil para pruebas o vistas aisladas). */
  state?: ConnectionBarState;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Píldora de estado de conectividad y sincronización siempre visible en la parte superior
 * de las pantallas autenticadas. Al tocarla abre «Pendientes de envío» según el rol activo.
 */
export function ConnectionBar({
  role,
  state: stateOverride,
  testID = 'connection-bar',
  style,
}: ConnectionBarProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const auth = useOptionalAuth();
  const liveState = useConnectionBarState();
  const reduceMotion = useReducedMotion();

  const resolvedState: ConnectionBarState =
    auth?.status === AUTH_STATUS.UNAUTHENTICATED
      ? { kind: 'hidden', count: 0 }
      : (stateOverride ?? liveState);

  const visibleState: VisibleConnectionBarState | null =
    resolvedState.kind === 'hidden'
      ? null
      : { kind: resolvedState.kind, count: resolvedState.count };

  const [exitingState, setExitingState] = useState<VisibleConnectionBarState | null>(null);
  const activeState = visibleState ?? exitingState;

  const progress = useRef(new Animated.Value(visibleState ? 1 : 0)).current;

  useEffect(() => {
    if (visibleState) {
      setExitingState(visibleState);
      if (reduceMotion || typeof Animated?.timing !== 'function') {
        progress.setValue(1);
        return undefined;
      }
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: ANIMATION_DURATION_MS,
        useNativeDriver: false,
      });
      anim.start();
      return () => {
        anim.stop();
      };
    }

    if (!exitingState) {
      progress.setValue(0);
      return undefined;
    }

    if (reduceMotion || typeof Animated?.timing !== 'function') {
      progress.setValue(0);
      setExitingState(null);
      return undefined;
    }

    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: ANIMATION_DURATION_MS,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) {
        setExitingState(null);
      }
    });
    return () => {
      anim.stop();
    };
  }, [exitingState, progress, reduceMotion, visibleState]);

  if (!activeState) {
    return null;
  }

  const resolvedRole = role ?? auth?.activeRole ?? USER_ROLES.CAREGIVER;
  const targetRoute =
    resolvedRole === USER_ROLES.PROFESSIONAL
      ? APP_ROUTES.PROFESSIONAL.PENDING_SYNC
      : APP_ROUTES.CAREGIVER.PENDING_SYNC;

  const visual = VISUAL_BY_KIND[activeState.kind];

  let message: string;
  switch (activeState.kind) {
    case 'offline':
      message =
        activeState.count > 0
          ? t('connectionBar.offlineWithCount', { count: activeState.count })
          : t('connectionBar.offline');
      break;
    case 'error':
      message = t('connectionBar.error', { count: activeState.count });
      break;
    case 'sending':
      message = t('connectionBar.sending', { count: activeState.count });
      break;
    case 'synced':
      message = t('connectionBar.synced');
      break;
  }

  const actionLabel = activeState.kind === 'error' ? t('connectionBar.errorAction') : null;
  const fullAccessibilityLabel = actionLabel ? `${message} · ${actionLabel}` : message;

  const animatedContainerStyle = {
    maxHeight: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, EXPANDED_MAX_HEIGHT],
    }),
    opacity: progress,
  };

  return (
    <Animated.View style={[styles.animatedSlot, animatedContainerStyle, style]}>
      <View style={styles.slotInner}>
        <Pressable
          onPress={() => {
            router.push(targetRoute as never);
          }}
          accessibilityRole="button"
          accessibilityLiveRegion="polite"
          accessibilityLabel={fullAccessibilityLabel}
          testID={testID}
          style={({ pressed }) => [
            styles.pill,
            { backgroundColor: visual.backgroundColor },
            pressed && styles.pillPressed,
          ]}
        >
          <Ionicons name={visual.iconName} size={20} color={BAR_TEXT_COLOR} />
          <Text style={styles.messageText} numberOfLines={1}>
            {message}
          </Text>
          {actionLabel ? <Text style={styles.actionText}>{actionLabel}</Text> : null}
        </Pressable>
      </View>
    </Animated.View>
  );
}

export interface ConnectionBarLayoutProps {
  role: UserRole;
  children: React.ReactNode;
}

/**
 * Marco de layout autenticado que reserva el espacio superior para `ConnectionBar`
 * dentro del área segura sin solapar encabezados ni duplicar el margen superior en las pantallas hijas.
 */
export function ConnectionBarLayout({ role, children }: ConnectionBarLayoutProps) {
  const insets = useContext(SafeAreaInsetsContext) ?? ZERO_INSETS;
  const innerInsets = useMemo<EdgeInsets>(() => ({ ...insets, top: 0 }), [insets]);

  return (
    <View style={styles.layoutContainer}>
      <View style={[styles.topSafeRegion, { paddingTop: insets.top }]}>
        <ConnectionBar role={role} />
      </View>
      <SafeAreaInsetsContext.Provider value={innerInsets}>
        <View style={styles.contentContainer}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  layoutContainer: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  topSafeRegion: {
    backgroundColor: PALETTE.background,
    zIndex: 10,
  },
  contentContainer: {
    flex: 1,
  },
  animatedSlot: {
    overflow: 'hidden',
    width: '100%',
  },
  slotInner: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  pill: {
    width: '100%',
    maxWidth: MAX_BAR_WIDTH,
    alignSelf: 'center',
    borderRadius: RADIUS_PILL,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
  },
  pillPressed: {
    opacity: 0.88,
  },
  messageText: {
    flex: 1,
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: BAR_TEXT_COLOR,
  },
  actionText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: BAR_TEXT_COLOR,
  },
});
