import { USER_ROLES } from '@nutrikids/shared';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/auth-context.js';

export default function CaregiverProfileScreen() {
  const { user, activeRole, switchRole, signOut } = useAuth();

  const hasDualRole =
    user?.roles.includes(USER_ROLES.CAREGIVER) && user?.roles.includes(USER_ROLES.PROFESSIONAL);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Mi Perfil</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Nombre:</Text>
          <Text style={styles.value}>
            {user?.firstName} {user?.lastName}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Correo:</Text>
          <Text style={styles.value}>{user?.email}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Perfil activo:</Text>
          <Text style={styles.badge}>{activeRole}</Text>
        </View>

        {hasDualRole && (
          <Pressable
            style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
            onPress={() => void switchRole(USER_ROLES.PROFESSIONAL)}
          >
            <Text style={styles.switchButtonText}>Cambiar a vista Profesional</Text>
          </Pressable>
        )}

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Nota: La gestión de datos personales y portabilidad se integrará en NK-41. La revocación
            de consentimientos por niño se agregará en NK-20.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
          onPress={() => void signOut()}
        >
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#14532D',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  value: {
    fontSize: 14,
    color: '#111827',
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
    backgroundColor: '#DCFCE7',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  switchButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  switchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  noteBox: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  noteText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  logoutButton: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
