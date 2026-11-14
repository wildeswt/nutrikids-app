import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ChatThread } from '../../components/ChatThread.js';
import { APP_ROUTES } from '../../constants/routes.js';

type ProfessionalChatParams = {
  childId?: string;
  withUserId?: string;
  participantName?: string;
  participantRole?: 'CAREGIVER' | 'PROFESSIONAL';
  participantSpecialty?: string;
};

export default function ProfessionalChatDetailScreen() {
  const params = useLocalSearchParams<ProfessionalChatParams>();

  return (
    <ChatThread
      mode="professional"
      childId={params.childId ?? null}
      withUserId={params.withUserId ?? null}
      participantName={params.participantName}
      participantRole={params.participantRole}
      participantSpecialty={params.participantSpecialty ?? null}
      fallbackRoute={APP_ROUTES.PROFESSIONAL.MESSAGES}
    />
  );
}
