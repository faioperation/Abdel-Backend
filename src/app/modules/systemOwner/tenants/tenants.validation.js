import { z } from "zod";

const updateTenantSchema = z.object({
  body: z
    .object({
      name: z
        .string({
          required_error: "Name is required",
        })
        .min(1, "Name cannot be empty"),
    })
    .strict(),
});

const createTenantSchema = z.object({
  body: z.object({
    first_name: z.string({ required_error: "First name is required" }),
    last_name: z.string({ required_error: "Last name is required" }),
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email"),
    password: z
      .string({ required_error: "Password is required" })
      .min(6, "Password must be at least 6 characters"),
    business_name: z.string({ required_error: "Business name is required" }),
    phone: z.string().optional(),
    business_type: z.string().optional(),
  }),
});

export const TenantsValidation = {
  updateTenantSchema,
  createTenantSchema,
};
