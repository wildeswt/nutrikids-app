import { Ionicons } from '@expo/vector-icons';
import type { ChildResponse } from '@nutrikids/shared';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../constants/layout.js';
import { font } from '../constants/typography.js';
import { formatLongDate } from '../i18n/format.js';
import { formatChildAge } from '../lib/children-api.js';

const LOCAL_COLORS = {
  white: '#FFFFFF',
  backdrop: 'rgba(0,0,0,0.45)',
  divider: '#EFEFEF',
  selectedBorder: '#2D5F5A',
  selectedBackground: '#F0F6F5',
} as const;

export interface SelectChildModalProps {
  visible: boolean;
  childrenList: readonly ChildResponse[];
  selectedChildId: string | null;
  onSelect: (child: ChildResponse) => void;
  onClose: () => void;
  title?: string;
  isProfessional?: boolean;
  testID?: string;
}

/** Removes diacritics/accents and converts to lower case for flexible search */
function normalizeQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function SelectChildModal({
  visible,
  childrenList,
  selectedChildId,
  onSelect,
  onClose,
  title,
  isProfessional = false,
}: SelectChildModalProps) {
  const { t } = useTranslation(['caregiver', 'professional', 'common']);
  const [searchQuery, setSearchQuery] = useState('');

  const modalTitle =
    title ??
    (isProfessional
      ? t('professional:addCheckup.searchModal.titlePatient', {
          defaultValue: 'Seleccionar paciente',
        })
      : t('caregiver:addCheckup.searchModal.titleChild', {
          defaultValue: 'Seleccionar niño',
        }));

  const filteredChildren = useMemo(() => {
    const q = normalizeQuery(searchQuery);
    if (!q) return childrenList;
    return childrenList.filter((child) => {
      const first = normalizeQuery(child.firstName);
      const last = normalizeQuery(child.lastName);
      const full = `${first} ${last}`;
      return full.includes(q) || first.includes(q) || last.includes(q);
    });
  }, [childrenList, searchQuery]);

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  const handleSelect = (child: ChildResponse) => {
    setSearchQuery('');
    onSelect(child);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      testID="select-child-modal"
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.close', { defaultValue: 'Cerrar' })}
              testID="select-child-close"
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={22} color={PALETTE.text.muted} />
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={styles.searchBarContainer}>
            <Ionicons name="search-outline" size={20} color={PALETTE.input.placeholder} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('caregiver:addCheckup.searchModal.searchPlaceholder', {
                defaultValue: 'Buscar por nombre o apellido...',
              })}
              placeholderTextColor={PALETTE.input.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="words"
              autoCorrect={false}
              clearButtonMode="never"
              testID="select-child-search-input"
            />
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.clear', { defaultValue: 'Limpiar' })}
                testID="select-child-clear-search"
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Ionicons name="close-circle" size={18} color={PALETTE.text.muted} />
              </Pressable>
            ) : null}
          </View>

          {/* List of children */}
          <ScrollView
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          >
            {filteredChildren.length === 0 ? (
              <View style={styles.emptyContainer} testID="select-child-empty">
                <Ionicons name="search" size={32} color={PALETTE.input.placeholder} />
                <Text style={styles.emptyText}>
                  {t('caregiver:addCheckup.searchModal.emptySearch', {
                    defaultValue: 'No se encontraron resultados con ese nombre.',
                  })}
                </Text>
              </View>
            ) : (
              filteredChildren.map((item) => {
                const isSelected = item.id === selectedChildId;
                const fullName = `${item.firstName} ${item.lastName}`.trim();
                const ageLabel = formatChildAge(item.birthDate);
                const birthDateLabel = formatLongDate(item.birthDate);

                return (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.itemRow,
                      isSelected && styles.itemRowSelected,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => handleSelect(item)}
                    accessibilityRole="button"
                    testID={`select-child-item-${item.id}`}
                  >
                    <View style={styles.itemInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.itemTitle}>{fullName}</Text>
                        {isSelected ? (
                          <View style={styles.selectedBadge} testID={`selected-badge-${item.id}`}>
                            <Ionicons name="checkmark" size={12} color={LOCAL_COLORS.white} />
                            <Text style={styles.selectedBadgeText}>
                              {t('caregiver:addCheckup.searchModal.current', {
                                defaultValue: 'Actual',
                              })}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.itemSubtitle}>
                        {ageLabel} · {birthDateLabel}
                      </Text>
                    </View>
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'chevron-forward'}
                      size={20}
                      color={isSelected ? PALETTE.primary : PALETTE.text.muted}
                    />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: LOCAL_COLORS.backdrop,
    justifyContent: 'center',
    padding: SCREEN_MARGIN,
  },
  modalCard: {
    backgroundColor: LOCAL_COLORS.white,
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
    width: '100%',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: LOCAL_COLORS.divider,
  },
  modalTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 18,
    color: PALETTE.text.title,
  },
  closeButton: {
    padding: 4,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.input.background,
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 14,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 15,
    color: PALETTE.text.title,
    padding: 0,
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    backgroundColor: PALETTE.background,
  },
  itemRowSelected: {
    borderColor: LOCAL_COLORS.selectedBorder,
    backgroundColor: LOCAL_COLORS.selectedBackground,
  },
  itemInfo: {
    flex: 1,
    gap: 3,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 15,
    color: PALETTE.text.title,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  selectedBadgeText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 11,
    color: LOCAL_COLORS.white,
  },
  itemSubtitle: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
