import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { CARD_SHADOW } from '../constants/layout.js';
import { font } from '../constants/typography.js';

export interface ActionModalItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}

export interface ActionModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: ActionModalItem[];
  onClose: () => void;
}

export function ActionModal({ visible, title, subtitle, actions, onClose }: ActionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="action-modal"
    >
      <Pressable style={styles.backdrop} onPress={onClose} testID="action-modal-backdrop">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          {title ? (
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          ) : null}

          <View style={styles.actionsList}>
            {actions.map((action) => {
              const iconColor = action.destructive ? PALETTE.feedback.error : PALETTE.primary;
              return (
                <Pressable
                  key={action.id}
                  style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  onPress={action.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  testID={`action-item-${action.id}`}
                >
                  <View
                    style={[
                      styles.iconWrapper,
                      action.destructive && styles.iconWrapperDestructive,
                    ]}
                  >
                    <Ionicons name={action.icon} size={20} color={iconColor} />
                  </View>
                  <Text
                    style={[
                      styles.actionLabel,
                      action.destructive && styles.actionLabelDestructive,
                    ]}
                  >
                    {action.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={PALETTE.text.muted} />
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
            onPress={onClose}
            accessibilityRole="button"
            testID="action-modal-cancel"
          >
            <Text style={styles.cancelButtonText}>Cerrar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 34,
    ...CARD_SHADOW,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    marginBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontFamily: font('semibold'),
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.text.title,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  actionsList: {
    gap: 8,
    marginBottom: 16,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: PALETTE.background,
  },
  actionItemPressed: {
    backgroundColor: '#F3F4F6',
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconWrapperDestructive: {
    backgroundColor: '#FEE2E2',
  },
  actionLabel: {
    flex: 1,
    fontFamily: font('medium'),
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.text.body,
  },
  actionLabelDestructive: {
    color: PALETTE.feedback.error,
  },
  cancelButton: {
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonPressed: {
    opacity: 0.8,
  },
  cancelButtonText: {
    fontFamily: font('semibold'),
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.text.title,
  },
});
