import { Ionicons } from '@expo/vector-icons';
import type {
  ChildResponse,
  ConversationResponse,
  ProfessionalAssignmentResponse,
} from '@nutrikids/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ConversationList } from '../../components/ConversationList.js';
import { PALETTE } from '../../constants/colors.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useChildren } from '../../hooks/useChildren.js';
import i18n from '../../i18n/index.js';
import {
  fetchChildProfessionals,
  filterActiveProfessionals,
  getMessageErrorMessage,
} from '../../lib/messages-api.js';

const LOCAL_COLORS = {
  backdrop: 'rgba(0, 0, 0, 0.45)',
  white: '#FFFFFF',
} as const;

export default function MessagesScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const { status: childrenStatus, children, load: loadChildren } = useChildren();

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedChild, setSelectedChild] = useState<ChildResponse | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalAssignmentResponse[]>([]);
  const [proLoading, setProLoading] = useState(false);
  const [proError, setProError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadChildren();
    }, [loadChildren]),
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME);
    }
  };

  const openThread = (conversation: ConversationResponse) => {
    const child = children.find((item) => item.id === conversation.childId);
    const participantName =
      `${conversation.participant.firstName} ${conversation.participant.lastName}`.trim();

    router.push({
      pathname: APP_ROUTES.CAREGIVER.CHAT_DETAIL as never,
      params: {
        childId: conversation.childId,
        withUserId: conversation.participant.userId,
        participantName,
        participantRole: conversation.participant.role,
        ...(conversation.participant.specialty
          ? { participantSpecialty: conversation.participant.specialty }
          : {}),
        ...(child
          ? {
              childFirstName: child.firstName,
              childFullName: `${child.firstName} ${child.lastName}`,
            }
          : {}),
      },
    });
  };

  const loadProfessionals = useCallback(async (child: ChildResponse) => {
    setSelectedChild(child);
    setProLoading(true);
    setProError(null);
    setProfessionals([]);

    try {
      const assignments = await fetchChildProfessionals(child.id);
      setProfessionals(filterActiveProfessionals(assignments));
    } catch (err) {
      setProError(getMessageErrorMessage(err, i18n.t('errors:messages.professionals')));
    } finally {
      setProLoading(false);
    }
  }, []);

  const handleOpenNewMessage = () => {
    setModalVisible(true);
    setProError(null);
    setProfessionals([]);
    if (children.length === 1 && children[0]) {
      void loadProfessionals(children[0]);
    } else {
      setSelectedChild(null);
      if (children.length === 0) {
        void loadChildren();
      }
    }
  };

  const handleSelectProfessional = (assignment: ProfessionalAssignmentResponse) => {
    if (!selectedChild) return;
    setModalVisible(false);
    const fullName = `${assignment.firstName ?? ''} ${assignment.lastName ?? ''}`.trim();
    const participantName =
      fullName || t('caregiver:messages.newMessageModal.professionalFallback');

    router.push({
      pathname: APP_ROUTES.CAREGIVER.CHAT_DETAIL as never,
      params: {
        childId: selectedChild.id,
        withUserId: assignment.professionalId,
        participantName,
        participantRole: 'PROFESSIONAL',
        ...(assignment.specialty ? { participantSpecialty: assignment.specialty } : {}),
        childFirstName: selectedChild.firstName,
        childFullName: `${selectedChild.firstName} ${selectedChild.lastName}`,
      },
    });
  };

  const renderModalBody = () => {
    if (childrenStatus === 'loading' && children.length === 0) {
      return (
        <View style={styles.modalCenter} testID="new-message-loading-children">
          <ActivityIndicator size="small" color={PALETTE.primary} />
          <Text style={styles.modalInfoText}>{t('caregiver:home.loading')}</Text>
        </View>
      );
    }

    if (children.length === 0) {
      return (
        <View style={styles.modalCenter} testID="new-message-no-children">
          <Text style={styles.modalInfoText}>
            {t('caregiver:messages.newMessageModal.noChildren')}
          </Text>
        </View>
      );
    }

    if (!selectedChild) {
      return (
        <View style={styles.modalSection} testID="new-message-choose-child">
          <Text style={styles.modalSectionTitle}>
            {t('caregiver:messages.newMessageModal.chooseChild')}
          </Text>
          {children.map((child) => (
            <Pressable
              key={child.id}
              style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
              onPress={() => void loadProfessionals(child)}
              accessibilityRole="button"
              testID={`new-message-child-${child.id}`}
            >
              <View style={styles.pickerContent}>
                <Text style={styles.pickerTitle}>
                  {child.firstName} {child.lastName}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={PALETTE.text.muted} />
            </Pressable>
          ))}
        </View>
      );
    }

    if (proLoading) {
      return (
        <View style={styles.modalCenter} testID="new-message-loading-professionals">
          <ActivityIndicator size="small" color={PALETTE.primary} />
          <Text style={styles.modalInfoText}>
            {t('caregiver:messages.newMessageModal.loading')}
          </Text>
        </View>
      );
    }

    if (proError) {
      return (
        <View style={styles.modalCenter} testID="new-message-pro-error">
          <Text style={styles.modalErrorText}>{proError}</Text>
          <Pressable
            style={({ pressed }) => [styles.modalRetryBtn, pressed && styles.pressed]}
            onPress={() => void loadProfessionals(selectedChild)}
            accessibilityRole="button"
            testID="new-message-pro-retry"
          >
            <Text style={styles.modalRetryText}>{t('caregiver:messages.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.modalSection}>
        {children.length > 1 ? (
          <Pressable
            style={({ pressed }) => [styles.changeChildLink, pressed && styles.pressed]}
            onPress={() => setSelectedChild(null)}
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={16} color={PALETTE.primary} />
            <Text style={styles.changeChildText}>
              {t('caregiver:messages.newMessageModal.changeChild')}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.modalSectionTitle}>
          {t('caregiver:messages.newMessageModal.chooseProfessional', {
            name: selectedChild.firstName,
          })}
        </Text>

        {professionals.length === 0 ? (
          <View style={styles.modalCenter} testID="new-message-no-professionals">
            <Text style={styles.modalEmptyTitle}>
              {t('caregiver:messages.newMessageModal.noProfessionals')}
            </Text>
            <Text style={styles.modalInfoText}>
              {t('caregiver:messages.newMessageModal.noProfessionalsHint', {
                name: selectedChild.firstName,
              })}
            </Text>
          </View>
        ) : (
          professionals.map((pro) => {
            const fullName = `${pro.firstName ?? ''} ${pro.lastName ?? ''}`.trim();
            const label = fullName || t('caregiver:messages.newMessageModal.professionalFallback');
            const specialty = pro.specialty
              ? t(`common:specialties.${pro.specialty}`, { defaultValue: pro.specialty })
              : null;

            return (
              <Pressable
                key={pro.id}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
                onPress={() => handleSelectProfessional(pro)}
                accessibilityRole="button"
                testID={`new-message-pro-${pro.professionalId}`}
              >
                <View style={styles.pickerContent}>
                  <Text style={styles.pickerTitle}>{label}</Text>
                  {specialty ? <Text style={styles.pickerSubtitle}>{specialty}</Text> : null}
                </View>
                <Ionicons name="chatbubble-outline" size={18} color={PALETTE.primary} />
              </Pressable>
            );
          })
        )}
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <ConversationList
        mode="caregiver"
        childrenList={children}
        onBack={handleBack}
        onRefreshExtra={() => void loadChildren()}
        onSelectConversation={openThread}
        onNewMessage={handleOpenNewMessage}
      />

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay} testID="new-message-modal">
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('caregiver:messages.newMessageModal.title')}</Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t('caregiver:messages.newMessageModal.close')}
                testID="new-message-close"
              >
                <Ionicons name="close" size={24} color={PALETTE.text.title} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {renderModalBody()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: LOCAL_COLORS.backdrop,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: PALETTE.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: PALETTE.text.title,
  },
  modalBody: {
    flexGrow: 0,
  },
  modalSection: {
    gap: 10,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text.muted,
    marginBottom: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: PALETTE.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
  },
  pickerContent: {
    flex: 1,
    gap: 2,
    paddingRight: 8,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.text.title,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  changeChildLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 4,
  },
  changeChildText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.primary,
  },
  modalCenter: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  modalEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.text.title,
    textAlign: 'center',
  },
  modalInfoText: {
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalErrorText: {
    fontSize: 14,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  modalRetryBtn: {
    backgroundColor: PALETTE.primary,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  modalRetryText: {
    color: LOCAL_COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
