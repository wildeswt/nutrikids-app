import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback } from 'react';

/**
 * Clears the given route params when the screen loses focus.
 *
 * The caregiver and professional groups are tab navigators, which keep each screen mounted and
 * remember its params. Without this, a screen opened in "edit" mode (a checkup to correct, a
 * feeding log to edit) would open in edit mode again the next time its tab is used.
 */
export function useClearParamsOnBlur(keys: readonly string[]): void {
  const navigation = useNavigation();
  const keysId = keys.join('|');

  useFocusEffect(
    useCallback(() => {
      return () => {
        const cleared: Record<string, undefined> = {};
        for (const key of keysId.split('|')) cleared[key] = undefined;
        navigation.setParams(cleared as never);
      };
    }, [navigation, keysId]),
  );
}
