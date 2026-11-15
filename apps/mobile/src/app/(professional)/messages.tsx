import { Ionicons } from '@expo/vector-icons';
import type {
  CaregiverAssignmentResponse,
  ChildResponse,
  ConversationResponse,
  ProfessionalAssignmentResponse,
} from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { useChildren } from '../../hooks/useChildren.js';
import { fetchChildCaregivers } from '../../lib/children-api.js';
import {
  fetchChildProfessionals,
  filterActiveProfessionals,
  getMessageErrorMessage,
} from '../../lib/messages-api.js';

const LOCAL_COLORS = {
  white: '#FFFFFF',
  backdrop: 'rgba(0,0,0,0.45)',
  divider: '#EFEFEF',
  chevronBackBg: '#F4F4F4',
} as const;

export default function ProfessionalMessagesScreen() {
  const { t } = useTranslation(['professional', 'caregiver', 'common', 'errors']);
  const router = useRouter();
  const { user } = useAuth();
  const { children, status: childrenStatus, load: loadChildren } = useChildren();

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedChild, setSelectedChild] = useState<ChildResponse | null>(null);
  const [caregivers, setCaregivers] = useState<CaregiverAssignmentResponse[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalAssignmentResponse[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  const openThread = (conversation: ConversationResponse) => {
    const participantName =
      `${conversation.participant.firstName} ${conversation.participant.lastName}`.trim();

    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.CHAT_DETAIL as never,
      params: {
        childId: conversation.childId,
        withUserId: conversation.participant.userId,
        participantName,
        participantRole: conversation.participant.role,
        ...(conversation.participant.specialty
          ? { participantSpecialty: conversation.participant.specialty }
          : {}),
      },
    });
  };

  const loadRecipients = async (child: ChildResponse) => {
    setSelectedChild(child);
    setContactsLoading(true);
    setContactsError(null);
    try {
      const [childCaregivers, childProfessionals] = await Promise.all([
        fetchChildCaregivers(child.id),
        fetchChildProfessionals(child.id),
      ]);
      setCaregivers(childCaregivers);
      setProfessionals(
        filterActiveProfessionals(childProfessionals).filter(
          (item) => item.professionalId !== user?.id,
        ),
      );
    } catch (err) {
      setContactsError(getMessageErrorMessage(err, t('errors:messages.professionals')));
    } finally {
      setContactsLoading(false);
    }
  };

  const openModal = () => {
    setModalVisible(true);
    setContactsError(null);
    if (children.length === 1 && children[0]) {
      void loadRecipients(children[0]);
    } else {
      setSelectedChild(null);
      if (children.length === 0) {
        void loadChildren();
      }
    }
  };

  const handleSelectCaregiver = (assignment: CaregiverAssignmentResponse) => {
    if (!selectedChild) return;
    setModalVisible(false);
    const participantName =
      `${assignment.firstName} ${assignment.lastName}`.trim() ||
      t('professional:messages.caregiverFallback');

    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.CHAT_DETAIL as never,
      params: {
        childId: selectedChild.id,
        withUserId: assignment.caregiverId,
        participantName,
        participantRole: 'CAREGIVER',
      },
    });
  };

  const handleSelectProfessional = (assignment: ProfessionalAssignmentResponse) => {
    if (!selectedChild) return;
    setModalVisible(false);
    const fullName = `${assignment.firstName ?? ''} ${assignment.lastName ?? ''}`.trim();
    const participantName =
      fullName || t('caregiver:messages.newMessageModal.professionalFallback');

    router.push({
      pathname: APP_ROUTES.PROFESSIONAL.CHAT_DETAIL as never,
      params: {
        childId: selectedChild.id,
        withUserId: assignment.professionalId,
        participantName,
        participantRole: 'PROFESSIONAL',
        ...(assignment.specialty ? { participantSpecialty: assignment.specialty } : {}),
      },
    });
  };

  const renderModalBody = () => {
    if (childrenStatus === 'loading' && children.length === 0) {
      return (
        <View style={styles.modalCenter} testID="pro-new-message-loading-children">
          <ActivityIndicator size="small" color={PALETTE.primary} />
          <Text style={styles.modalInfoText}>{t('caregiver:home.loading')}</Text>
        </View>
      );
    }

    if (children.length === 0) {
      return (
        <View style={styles.modalCenter} testID="pro-new-message-no-children">
          <Text style={styles.modalInfoText}>
            {t('professional:messages.newMessageModal.noChildren')}
          </Text>
        </View>
      );
    }

    if (!selectedChild) {
      return (
        <View style={styles.modalSection} testID="pro-new-message-choose-child">
          <Text style={styles.modalSectionTitle}>
            {t('professional:messages.newMessageModal.chooseChild')}
          </Text>
          {children.map((child) => (
            <Pressable
              key={child.id}
              style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
              onPress={() => void loadRecipients(child)}
              accessibilityRole="button"
              testID={`pro-new-message-child-${child.id}`}
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

    if (contactsLoading) {
      return (
        <View style={styles.modalCenter} testID="pro-new-message-loading-contacts">
          <ActivityIndicator size="small" color={PALETTE.primary} />
          <Text style={styles.modalInfoText}>
            {t('professional:messages.newMessageModal.loading')}
          </Text>
        </View>
      );
    }

    if (contactsError) {
      return (
        <View style={styles.modalCenter} testID="pro-new-message-contacts-error">
          <Text style={styles.modalErrorText}>{contactsError}</Text>
          <Pressable
            style={({ pressed }) => [styles.modalRetryBtn, pressed && styles.pressed]}
            onPress={() => void loadRecipients(selectedChild)}
            accessibilityRole="button"
            testID="pro-new-message-contacts-retry"
          >
            <Text style={styles.modalRetryText}>{t('caregiver:messages.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    if (caregivers.length === 0 && professionals.length === 0) {
      return (
        <View style={styles.modalCenter} testID="pro-new-message-empty-contacts">
          <Text style={styles.modalInfoText}>
            {t('professional:messages.newMessageModal.empty')}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.modalSection} testID="pro-new-message-choose-recipient">
        <Text style={styles.modalSectionTitle}>
          {t('professional:messages.newMessageModal.chooseRecipient')}
        </Text>

        {caregivers.length > 0 ? (
          <>
            <Text style={styles.groupLabel}>
              {t('professional:messages.newMessageModal.caregiversSection')}
            </Text>
            {caregivers.map((cg) => {
              const name = `${cg.firstName} ${cg.lastName}`.trim();
              return (
                <Pressable
                  key={cg.caregiverId}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
                  onPress={() => handleSelectCaregiver(cg)}
                  accessibilityRole="button"
                  testID={`pro-new-message-caregiver-${cg.caregiverId}`}
                >
                  <View style={styles.pickerContent}>
                    <Text style={styles.pickerTitle}>{name}</Text>
                    <Text style={styles.pickerSubtitle}>
                      {t('professional:messages.caregiverSubtitle', { name: cg.relationship })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={PALETTE.text.muted} />
                </Pressable>
              );
            })}
          </>
        ) : null}

        {professionals.length > 0 ? (
          <>
            <Text style={styles.groupLabel}>
              {t('professional:messages.newMessageModal.professionalsSection')}
            </Text>
            {professionals.map((pro) => {
              const fullName = `${pro.firstName ?? ''} ${pro.lastName ?? ''}`.trim();
              const name = fullName || t('caregiver:messages.newMessageModal.professionalFallback');
              const specialtyLabel = pro.specialty
                ? t(`common:specialties.${pro.specialty}`, { defaultValue: pro.specialty })
                : null;
              return (
                <Pressable
                  key={pro.professionalId}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
                  onPress={() => handleSelectProfessional(pro)}
                  accessibilityRole="button"
                  testID={`pro-new-message-pro-${pro.professionalId}`}
                >
                  <View style={styles.pickerContent}>
                    <Text style={styles.pickerTitle}>{name}</Text>
                    {specialtyLabel ? (
                      <Text style={styles.pickerSubtitle}>{specialtyLabel}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={PALETTE.text.muted} />
                </Pressable>
              );
            })}
          </>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ConversationList
        mode="professional"
        childrenList={children}
        onRefreshExtra={async () => {
          await loadChildren();
        }}
        onSelectConversation={openThread}
        onNewMessage={openModal}
      />

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="pro-new-message-modal">
            <View style={styles.modalHeader}>
              {selectedChild && children.length > 1 ? (
                <Pressable
                  onPress={() => {
                    setSelectedChild(null);
                    setContactsError(null);
                  }}
                  style={styles.modalBackBtn}
                  accessibilityRole="button"
                  testID="pro-new-message-back"
                >
                  <Ionicons name="arrow-back" size={18} color={PALETTE.text.title} />
                </Pressable>
              ) : null}
              <Text style={styles.modalTitle}>
                {t('professional:messages.newMessageModal.title')}
              </Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.close', { defaultValue: 'Cerrar' })}
                testID="pro-new-message-close"
              >
                <Ionicons name="close" size={22} color={PALETTE.text.muted} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>{renderModalBody()}</ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: LOCAL_COLORS.backdrop,
    justifyContent: 'center',
    padding: SCREEN_MARGIN,
  },
  modalCard: {
    backgroundColor: LOCAL_COLORS.white,
    borderRadius: 20,
    padding: 18,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: LOCAL_COLORS.divider,
  },
  modalBackBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: LOCAL_COLORS.chevronBackBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    flex: 1,
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 17,
    color: PALETTE.text.title,
  },
  modalScroll: {
    marginTop: 12,
  },
  modalSection: {
    gap: 10,
  },
  modalSectionTitle: {
    fontFamily: font('medium'),
    fontWeight: '500',
    fontSize: 13,
    color: PALETTE.text.muted,
    marginBottom: 4,
  },
  groupLabel: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 12,
    color: PALETTE.primary,
    marginTop: 6,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border.default,
    backgroundColor: PALETTE.background,
  },
  pickerContent: {
    flex: 1,
    gap: 2,
  },
  pickerTitle: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 15,
    color: PALETTE.text.title,
  },
  pickerSubtitle: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.muted,
  },
  modalCenter: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
  },
  modalInfoText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.text.muted,
    textAlign: 'center',
  },
  modalErrorText: {
    fontFamily: font('regular'),
    fontSize: 14,
    color: PALETTE.feedback.error,
    textAlign: 'center',
  },
  modalRetryBtn: {
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  modalRetryText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 13,
    color: LOCAL_COLORS.white,
  },
  pressed: {
    opacity: 0.75,
  },
});
