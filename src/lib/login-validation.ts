export const MIN_ADMIN_PASSWORD_LENGTH = 12;

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginValidationErrors = Partial<Record<keyof LoginInput, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginInput(input: LoginInput): LoginValidationErrors {
  const errors: LoginValidationErrors = {};

  if (!EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (input.password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
  }

  return errors;
}
