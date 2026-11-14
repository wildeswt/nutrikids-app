import {
  UpdateAccountInputSchema,
  type AccountResponse,
  type UpdateAccountInput,
} from '@nutrikids/shared';

export interface AccountFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentPassword: string;
}

export type AccountFormErrors = Partial<Record<keyof AccountFormValues, string>>;

export function accountToFormValues(account: AccountResponse): AccountFormValues {
  return {
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    phone: account.phone ?? '',
    currentPassword: '',
  };
}

/** `true` when the email was edited: the form then asks for the current password. */
export function emailChanged(values: AccountFormValues, account: AccountResponse): boolean {
  return values.email.trim().toLowerCase() !== account.email.toLowerCase();
}

/**
 * Builds the body with only what changed and validates it with the shared schema.
 * Returns `{ errors }` with a message per field, or `{ input }` ready to send.
 */
export function buildAccountUpdate(
  values: AccountFormValues,
  account: AccountResponse,
): { input: UpdateAccountInput; errors?: never } | { errors: AccountFormErrors; input?: never } {
  const candidate: Record<string, string> = {};
  if (values.firstName.trim() !== account.firstName) candidate.firstName = values.firstName;
  if (values.lastName.trim() !== account.lastName) candidate.lastName = values.lastName;
  if (values.phone.trim() !== (account.phone ?? '')) candidate.phone = values.phone;
  if (emailChanged(values, account)) {
    candidate.email = values.email;
    candidate.currentPassword = values.currentPassword;
  }

  const parsed = UpdateAccountInputSchema.safeParse(candidate);
  if (parsed.success) return { input: parsed.data };

  const errors: AccountFormErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof AccountFormValues | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
    else if (!key && !errors.firstName) errors.firstName = issue.message;
  }
  return { errors };
}
