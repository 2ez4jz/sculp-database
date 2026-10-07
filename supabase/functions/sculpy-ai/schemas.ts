export const extractSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    preferences: { type: "array", items: { type: "string" } },
    opportunities: { type: "array", items: { type: "string" } },
    partners: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["name", "type", "confidence"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number" },
  },
  required: [
    "summary",
    "preferences",
    "opportunities",
    "partners",
    "confidence",
  ],
  additionalProperties: false,
};

export const searchSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    results: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["booking", "artist", "partner"] },
          id: { type: "string" },
          label: { type: "string" },
          reason: { type: "string" },
        },
        required: ["kind", "id", "label", "reason"],
        additionalProperties: false,
      },
    },
    evidenceIds: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "results", "evidenceIds"],
  additionalProperties: false,
};
