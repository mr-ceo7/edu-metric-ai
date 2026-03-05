// Updated geminiService.ts: All model identifiers replaced with 'gemini-2.5-flash'

export const models = {
    geminiModelV1: "gemini-2.5-flash",
    geminiModelV2: "gemini-2.5-flash",
    // Additional models can be added here
};

export function getModel(modelName: string) {
    return models[modelName] || null;
}