import * as Yup from "yup";

export const validationMessages = {
  required: (fieldLabel = "This field") => `${fieldLabel} is required`,
  email: "Enter a valid email address",
  url: "Enter a valid URL",
  passwordMin: "Password must be at least 12 characters",
  otpLength: "Enter the 6-digit code",
};

export const emailSchema = Yup.string()
  .email(validationMessages.email)
  .required(validationMessages.required("Email"));

export const passwordSchema = Yup.string()
  .min(12, validationMessages.passwordMin)
  .required(validationMessages.required("Password"));

export const otpSchema = Yup.string()
  .matches(/^[0-9]{6}$/g, validationMessages.otpLength)
  .required(validationMessages.required("Code"));

export const rememberSchema = Yup.boolean().default(false);

export const loginValidationSchema = Yup.object({
  email: emailSchema,
  password: passwordSchema,
  remember: rememberSchema,
});

export const forgotPasswordSchema = Yup.object({
  email: emailSchema,
});

export const otpValidationSchema = Yup.object({
  code: otpSchema,
});

export const resetPasswordSchema = Yup.object({
  password: passwordSchema,
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password")], "Passwords do not match")
    .required(validationMessages.required("Confirm password")),
});

export const userModalSchema = Yup.object({
  name: Yup.string().required(validationMessages.required("Name")),
  email: emailSchema,
  phone: Yup.string().required(validationMessages.required("Contact number")),
  jobTitle: Yup.string(),
  roleId: Yup.number().nullable().required(validationMessages.required("User group")),
});

export const clientFormSchema = Yup.object({
  name: Yup.string().required(validationMessages.required("Client name")),
  vat: Yup.string().required(validationMessages.required("VAT ID")),
  kvk: Yup.string().required(validationMessages.required("Company reg no / KVK / National ID")),
  phone: Yup.string().required(validationMessages.required("Contact number")),
  email: emailSchema,
  website: Yup.string()
    .required(validationMessages.required("Website"))
    .url(validationMessages.url),
  address_line_1: Yup.string().required(validationMessages.required("Address line 1")),
  address_line_2: Yup.string(),
  city: Yup.string().required(validationMessages.required("City")),
  province: Yup.string().required(validationMessages.required("Province")),
  country: Yup.string().required(validationMessages.required("Country")),
  zip_code: Yup.string().required(validationMessages.required("Zip code")),
});

// Helper to show Formik error text conditionally
export const getFieldError = (
  touched?: boolean,
  error?: string,
  submitCount: number = 0
): string | undefined => ((touched || submitCount > 0) && error ? error : undefined);
