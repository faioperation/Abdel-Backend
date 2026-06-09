import { z } from "zod";

const createAgentSchema = z.object({
  body: z.object({
    assistant_name: z.string({
      required_error: "assistant_name is required",
    }),
    welcome_message: z.string().optional(),
  }),
});

export const AiTrainingValidation = {
  createAgentSchema,
};
