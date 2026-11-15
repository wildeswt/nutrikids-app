import { PendingSyncList } from '../../components/PendingSyncList.js';
import { APP_ROUTES } from '../../constants/routes.js';

export default function ProfessionalPendingSyncScreen() {
  return PendingSyncList({ fallbackRoute: APP_ROUTES.PROFESSIONAL.ALERTS });
}
