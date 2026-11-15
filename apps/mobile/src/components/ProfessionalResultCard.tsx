import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/colors.js';
import { font } from '../constants/typography.js';
import { professionalInitials } from '../lib/professionals-api.js';
import { Card } from './ui/Card.js';

interface ProfessionalResultCardProps {
  firstName: string;
  lastName: string;
  /** Texto de la segunda línea, p. ej. «Nutrición · 1234567890». */
  detail: string;
  /** Texto de lo que podrá ver el profesional. */
  note: string;
  testID?: string;
}

/** Tarjeta con el profesional encontrado: avatar de iniciales, nombre, especialidad y alcance. */
export function ProfessionalResultCard({
  firstName,
  lastName,
  detail,
  note,
  testID = 'professional-result',
}: ProfessionalResultCardProps) {
  return (
    <Card testID={testID} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar} testID={`${testID}-avatar`}>
          <Text style={styles.avatarText}>{professionalInitials(firstName, lastName)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{`${firstName} ${lastName}`.trim()}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </View>
      <Text style={styles.note}>{note}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PALETTE.input.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 15,
    color: PALETTE.primary,
  },
  info: { flex: 1, gap: 2 },
  name: {
    fontFamily: font('semibold'),
    fontWeight: '600',
    fontSize: 17,
    color: PALETTE.text.title,
  },
  detail: { fontFamily: font('regular'), fontSize: 13, color: PALETTE.text.muted },
  note: { fontFamily: font('regular'), fontSize: 13, color: PALETTE.text.body },
});
