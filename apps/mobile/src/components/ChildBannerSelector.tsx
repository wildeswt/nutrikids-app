import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { font } from '../constants/typography.js';
import { ChildBanner } from './ChildBanner.js';

export interface BannerSelectableChild {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Child banner that doubles as a dropdown: with more than one child, tapping it lists them.
 * With a single child it is just the banner.
 */
export function ChildBannerSelector({
  children,
  activeId,
  onSelect,
  subtitle,
  accessibilityLabel,
  testIDPrefix,
  style,
}: {
  children: readonly BannerSelectableChild[];
  activeId: string;
  onSelect: (id: string) => void;
  subtitle: string;
  accessibilityLabel: string;
  testIDPrefix: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const active = children.find((item) => item.id === activeId) ?? children[0];
  if (!active) return null;
  const fullName = `${active.firstName} ${active.lastName}`;

  if (children.length <= 1) {
    return <ChildBanner style={style} name={fullName} subtitle={subtitle} />;
  }

  return (
    <View style={style}>
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        testID={`${testIDPrefix}-child-selector`}
      >
        <ChildBanner name={fullName} subtitle={subtitle} style={styles.bannerInner} />
        <View style={styles.chevron} pointerEvents="none">
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={PALETTE.text.light}
          />
        </View>
      </Pressable>

      {open ? (
        <View style={styles.list} testID={`${testIDPrefix}-child-options`}>
          {children.map((item) => {
            const selected = item.id === active.id;
            return (
              <Pressable
                key={item.id}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => {
                  onSelect(item.id);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`${testIDPrefix}-child-${item.id}`}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {`${item.firstName} ${item.lastName}`}
                </Text>
                {selected ? <Ionicons name="checkmark" size={16} color={PALETTE.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bannerInner: { paddingRight: 44 },
  chevron: {
    position: 'absolute',
    right: 18,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  list: {
    marginTop: 8,
    backgroundColor: PALETTE.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.border.subtle,
    padding: 6,
    gap: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  optionSelected: { backgroundColor: PALETTE.primaryLight },
  optionText: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 14,
    color: PALETTE.text.body,
  },
  optionTextSelected: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.primary,
  },
});
