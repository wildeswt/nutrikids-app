import { useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ChatThread } from '../../components/ChatThread.js';
import { APP_ROUTES } from '../../constants/routes.js';
import { useChildren } from '../../hooks/useChildren.js';

type ChatRouteParams = {
  childId?: string;
  withUserId?: string;
  participantName?: string;
  participantRole?: 'CAREGIVER' | 'PROFESSIONAL';
  participantSpecialty?: string;
  childFirstName?: string;
  childFullName?: string;
};

export default function ChatDetailScreen() {
  const params = useLocalSearchParams<ChatRouteParams>();
  const { children, load: loadChildren } = useChildren();

  const childId = params.childId ?? null;
  const withUserId = params.withUserId ?? null;

  useEffect(() => {
    if (childId && !params.childFirstName) {
      void loadChildren();
    }
  }, [childId, loadChildren, params.childFirstName]);

  const child = childId ? children.find((item) => item.id === childId) : undefined;
  const childFirstName = params.childFirstName ?? child?.firstName;
  const childFullName =
    params.childFullName ?? (child ? `${child.firstName} ${child.lastName}` : undefined);

  return (
    <ChatThread
      mode="caregiver"
      childId={childId}
      withUserId={withUserId}
      participantName={params.participantName}
      participantRole={params.participantRole}
      participantSpecialty={params.participantSpecialty ?? null}
      childFirstName={childFirstName}
      childFullName={childFullName}
      fallbackRoute={APP_ROUTES.CAREGIVER.MESSAGES}
    />
  );
}
