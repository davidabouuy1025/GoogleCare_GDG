import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function analyzeSymptoms(symptoms: string, userEmail: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a medical AI assistant. Analyze these symptoms for user ${userEmail}: ${symptoms}. 
      Provide a detailed medical assessment. 
      Return a JSON object with: condition (string), recommendation (string), riskLevel (Low/Medium/High), confidence (0-100).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            condition: { type: Type.STRING },
            recommendation: { type: Type.STRING },
            riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
            confidence: { type: Type.NUMBER }
          },
          required: ["condition", "recommendation", "riskLevel", "confidence"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Symptom Analysis Error:", error);
    throw error;
  }
}

export async function checkInElderly(mood: string, healthStatus: string, userEmail: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Evaluate elderly check-in for user ${userEmail}. Mood: ${mood}, Health Status: ${healthStatus}. 
      Detect any immediate health risks.
      Return JSON: riskDetected (boolean), summary (string), riskLevel (Low/Medium/High).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            riskDetected: { type: Type.BOOLEAN },
            summary: { type: Type.STRING },
            riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High"] }
          },
          required: ["riskDetected", "summary", "riskLevel"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Elderly Check-In Error:", error);
    throw error;
  }
}

export async function analyzeWound(imageBase64: string, userEmail: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { text: `Analyze this wound image for user ${userEmail}. Identify the type (Burn, Cut, Infection, Ulcer) and provide care instructions. Return JSON: type (string), observation (string), care (string), riskLevel (Low/Medium/High).` },
        { inlineData: { data: imageBase64, mimeType: "image/png" } }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            observation: { type: Type.STRING },
            care: { type: Type.STRING },
            riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High"] }
          },
          required: ["type", "observation", "care", "riskLevel"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Wound Analysis Error:", error);
    throw error;
  }
}
