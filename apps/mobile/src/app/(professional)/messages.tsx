import type { ConversationResponse } from '@nutrikids/shared';
import { useRouter } from 'expo-router';
import React from 'react';
import { ConversationList } from '../../components/ConversationList.js';
import { APP_ROUTES } from '../../constants/routes.js';

export default function ProfessionalMessagesScreen() {
  const router = useRouter();

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

  // En el profesional no hay "Nuevo mensaje" en esta tarea (NK-50): solo responde en conversaciones existentes.
  return <ConversationList mode="professional" onSelectConversation={openThread} />;
}
