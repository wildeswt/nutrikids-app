import { Ionicons } from '@expo/vector-icons';
import { CreateChildInputSchema, type Sex } from '@nutrikids/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../components/KeyboardAwareScrollView.js';
import { AgeNotice } from '../../components/child-form/AgeNotice.js';
import { BirthDateField } from '../../components/child-form/BirthDateField.js';
import { LinkedAccountNotice } from '../../components/child-form/LinkedAccountNotice.js';
import { SexSelector } from '../../components/child-form/SexSelector.js';
import { PillField } from '../../components/ui/PillField.js';
import { PrimaryButton } from '../../components/ui/PrimaryButton.js';
import { ScreenHeader } from '../../components/ui/ScreenHeader.js';
import { PALETTE } from '../../constants/colors.js';
import { RADIUS_PILL, SCREEN_MARGIN } from '../../constants/layout.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { font } from '../../constants/typography.js';
import { useAuth } from '../../context/auth-context.js';
import { extractZodFieldErrors, formatAuthErrorMessage } from '../../lib/auth-errors.js';
import { formatDateInput } from '../../lib/checkup-form.js';
import {
  RELATIONSHIP_OPTIONS,
  buildCreateChildPayload,
  evaluateChildBirthDate,
  type Relationship,
} from '../../lib/child-form.js';
import { toChildRegisteredParams } from '../../lib/child-registered-route.js';
import { createChild } from '../../lib/children-api.js';

export default function AddChildScreen() {
  const router = useRouter();
  const { t } = useTranslation(['caregiver', 'common']);
  const { user } = useAuth();

  const lastNameRef = useRef<React.ComponentRef<typeof KeyboardAwareTextInput>>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDateText, setBirthDateText] = useState('');
  const [sex, setSex] = useState<Sex>('MALE');
  const [relationship, setRelationship] = useState<Relationship>('MOTHER');
  const [isLegalRepresentative, setIsLegalRepresentative] = useState(true);

  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The tabs keep their screens mounted: clear the form when leaving, so registering another
  // child never starts with the previous child's data.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setFirstName('');
        setLastName('');
        setBirthDateText('');
        setSex('MALE');
        setRelationship('MOTHER');
        setIsLegalRepresentative(true);
        setLoading(false);
        setGeneralError(null);
        setFieldErrors({});
      };
    }, []),
  );

  const birthDateStatus = evaluateChildBirthDate(birthDateText);
  const caregiverName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(APP_ROUTES.CAREGIVER.HOME as never);
    }
  };

  const handleSubmit = async () => {
    if (loading) return;
    setGeneralError(null);
    setFieldErrors({});

    const payload = buildCreateChildPayload({
      firstName,
      lastName,
      birthDateText,
      sex,
      relationship,
      isLegalRepresentative,
    });

    const validation = CreateChildInputSchema.safeParse(payload);
    if (!validation.success) {
      const errors = extractZodFieldErrors(validation.error);
      if (errors['birthDate'] && birthDateStatus.kind === 'invalid') {
        errors['birthDate'] = t('addChild.birthDateInvalid', {
          example: formatDateInput(new Date()),
        });
      }
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const created = await createChild(validation.data);
      // Tras guardar al niño se ofrece vincular a su profesional (o dejarlo para después).
      router.replace({
        pathname: APP_ROUTES.CAREGIVER.CHILD_REGISTERED as never,
        params: toChildRegisteredParams(created),
      });
    } catch (err) {
      setGeneralError(formatAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <ScreenHeader
          title={t('addChild.title')}
          backLabel={t('common:actions.back')}
          onBack={handleBack}
          style={styles.header}
          testID="add-child-header"
        />

        {generalError ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={20} color={PALETTE.feedback.error} />
            <Text style={styles.errorBoxText}>{generalError}</Text>
          </View>
        ) : null}

        <View style={styles.formContainer}>
          {/* Nombre */}
          <PillField
            label={t('addChild.firstNameLabel')}
            error={fieldErrors['firstName']}
            testID="add-child-first-name-field"
          >
            <KeyboardAwareTextInput
              style={styles.pillTextInput}
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                clearFieldError('firstName');
              }}
              placeholder={t('addChild.firstNamePlaceholder')}
              placeholderTextColor={PALETTE.input.placeholder}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => lastNameRef.current?.focus()}
              blurOnSubmit={false}
              editable={!loading}
              accessibilityLabel={t('addChild.firstNameLabel')}
              testID="add-child-first-name"
            />
          </PillField>

          {/* Apellido */}
          <PillField
            label={t('addChild.lastNameLabel')}
            error={fieldErrors['lastName']}
            testID="add-child-last-name-field"
          >
            <KeyboardAwareTextInput
              ref={lastNameRef}
              style={styles.pillTextInput}
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                clearFieldError('lastName');
              }}
              placeholder={t('addChild.lastNamePlaceholder')}
              placeholderTextColor={PALETTE.input.placeholder}
              autoCapitalize="words"
              returnKeyType="next"
              editable={!loading}
              accessibilityLabel={t('addChild.lastNameLabel')}
              testID="add-child-last-name"
            />
          </PillField>

          {/* Fecha de nacimiento */}
          <BirthDateField
            label={t('addChild.birthDateLabel')}
            value={birthDateText}
            onChangeText={(val) => {
              setBirthDateText(val);
              clearFieldError('birthDate');
            }}
            placeholder={t('addChild.birthDatePlaceholder', {
              example: formatDateInput(new Date()),
            })}
            error={fieldErrors['birthDate']}
            editable={!loading}
            openPickerLabel={t('addChild.openDatePicker')}
            closePickerLabel={t('addChild.closeDatePicker')}
            testID="add-child-birth-date"
          />

          {/* Sexo */}
          <SexSelector
            label={t('addChild.sexLabel')}
            value={sex}
            onChange={setSex}
            femaleLabel={t('addChild.sexFemale')}
            maleLabel={t('addChild.sexMale')}
            femaleAccessibilityLabel={t('addChild.sexFemaleA11y')}
            maleAccessibilityLabel={t('addChild.sexMaleA11y')}
            disabled={loading}
            testID="add-child-sex"
          />

          {/* Edad calculada */}
          {birthDateStatus.kind === 'valid' || birthDateStatus.kind === 'outOfRange' ? (
            <AgeNotice birthDateIso={birthDateStatus.isoDate} testID="add-child-age-notice" />
          ) : null}

          {/* Aviso de cuenta vinculada */}
          <LinkedAccountNotice
            accountName={caregiverName}
            testID="add-child-linked-account-notice"
          />

          {/* Parentesco */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('addChild.relationshipLabel')}</Text>
            <View style={styles.relationshipRow}>
              {RELATIONSHIP_OPTIONS.map((rel) => {
                const isSelected = relationship === rel;
                return (
                  <Pressable
                    key={rel}
                    style={[
                      styles.relationshipChip,
                      isSelected ? styles.relationshipChipSelected : undefined,
                    ]}
                    onPress={() => setRelationship(rel)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={t(`common:relationships.${rel}`)}
                    accessibilityState={{ selected: isSelected, disabled: loading }}
                  >
                    <Text
                      style={[
                        styles.relationshipChipText,
                        isSelected ? styles.relationshipChipTextSelected : undefined,
                      ]}
                    >
                      {t(`common:relationships.${rel}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Confirmación de representante legal */}
          <View style={styles.checkboxGroup}>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => {
                setIsLegalRepresentative((prev) => !prev);
                clearFieldError('isLegalRepresentative');
              }}
              disabled={loading}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isLegalRepresentative }}
              accessibilityLabel={t('addChild.legalRepA11y')}
            >
              <View
                style={[
                  styles.checkboxBox,
                  isLegalRepresentative ? styles.checkboxBoxChecked : undefined,
                ]}
              >
                {isLegalRepresentative ? (
                  <Ionicons name="checkmark" size={16} color={PALETTE.text.light} />
                ) : null}
              </View>
              <Text style={styles.checkboxLabel}>{t('addChild.legalRepLabel')}</Text>
            </Pressable>
            {fieldErrors['isLegalRepresentative'] ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {fieldErrors['isLegalRepresentative']}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            label={t('addChild.submit')}
            onPress={() => void handleSubmit()}
            loading={loading}
            disabled={loading}
            accessibilityLabel={t('addChild.submit')}
            testID="add-child-submit"
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.background,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 22,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: PALETTE.feedback.errorBg,
    borderColor: PALETTE.feedback.errorBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
  },
  errorBoxText: {
    flex: 1,
    fontFamily: font('medium'),
    color: PALETTE.feedback.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  formContainer: {
    gap: 20,
  },
  pillTextInput: {
    fontFamily: font('regular'),
    fontSize: 16,
    color: PALETTE.text.body,
    paddingVertical: 0,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontFamily: font('medium'),
    fontSize: 18,
    fontWeight: '500',
    color: PALETTE.text.title,
  },
  relationshipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  relationshipChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: RADIUS_PILL,
    backgroundColor: PALETTE.input.background,
    borderWidth: 1,
    borderColor: PALETTE.border.input,
    paddingHorizontal: 8,
  },
  relationshipChipSelected: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  relationshipChipText: {
    fontFamily: font('medium'),
    fontSize: 13,
    fontWeight: '500',
    color: PALETTE.text.body,
    textAlign: 'center',
  },
  relationshipChipTextSelected: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    color: PALETTE.text.light,
  },
  checkboxGroup: {
    gap: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: PALETTE.border.checkbox,
    backgroundColor: PALETTE.input.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.text.body,
    lineHeight: 18,
  },
  errorText: {
    fontFamily: font('regular'),
    fontSize: 13,
    color: PALETTE.feedback.error,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 24,
  },
});
