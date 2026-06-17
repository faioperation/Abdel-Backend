import { z } from "zod";

const startCallSchema = z.object({
  body: z.object({
    agentId: z.string({
      required_error: "agentId is required",
    }).uuid("agentId must be a valid UUID"),
  }),
});

export const TestAgentValidation = {
  startCallSchema,
};
