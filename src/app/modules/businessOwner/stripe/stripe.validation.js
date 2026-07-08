import { z } from "zod";

const updateStripeKeysSchema = z.object({
  body: z.object({
    stripeSecretKey: z
      .string({ required_error: "Stripe Secret Key is required" })
      .min(1, "Stripe Secret Key cannot be empty"),
    stripePublishableKey: z
      .string({ required_error: "Stripe Publishable Key is required" })
      .min(1, "Stripe Publishable Key cannot be empty"),
  }),
});

const deleteStripeKeysSchema = z.object({
  params: z.object({
    restaurantId: z
      .string({ required_error: "Restaurant ID is required" })
      .uuid("Invalid Restaurant ID format"),
  }),
});

export const StripeValidation = {
  updateStripeKeysSchema,
  deleteStripeKeysSchema,
};
