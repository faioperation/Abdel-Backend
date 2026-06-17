import { z } from "zod";

const createTelephonySchema = z.object({
  body: z.object({
    businessId: z.string({ required_error: "Business ID is required" }).uuid("Invalid Business ID format"),
    twilioNumber: z.string({ required_error: "Twilio number is required" }),
    managerNumber: z.string({ required_error: "Manager number is required" }),
    vapiAgentId: z.string({ required_error: "Vapi Agent ID is required" }),
  }),
});

const updateTelephonySchema = z.object({
  body: z
    .object({
      twilioNumber: z.string().optional(),
      managerNumber: z.string().optional(),
    })
    .strict("Only twilioNumber and managerNumber can be updated"),
  params: z.object({
    id: z.string().uuid("Invalid Agent ID format"),
  }),
});

const getOrDeleteTelephonySchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid Agent ID format"),
  }),
});

export const TelephonyValidation = {
  createTelephonySchema,
  updateTelephonySchema,
  getOrDeleteTelephonySchema,
};
