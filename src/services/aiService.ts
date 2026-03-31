import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const analyzeSymptoms = async (symptoms: string, isElderly: boolean) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a medical AI assistant. Analyze these symptoms: ${symptoms}. ${isElderly ? "Patient is elderly/critical." : ""} 
      Provide a detailed medical assessment. 
      Return a JSON object with: condition (string), advice (string), risk_level (Low/Medium/High), confidence (0-100), triggerElderlyCheckIn (boolean).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            condition: { type: Type.STRING },
            advice: { type: Type.STRING },
            risk_level: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
            confidence: { type: Type.NUMBER },
            triggerElderlyCheckIn: { type: Type.BOOLEAN }
          },
          required: ["condition", "advice", "risk_level", "confidence", "triggerElderlyCheckIn"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Symptom Analysis Error:", error);
    throw error;
  }
};

export const checkInElderly = async (mood: string, vitals: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Evaluate elderly check-in. Mood: ${mood}, Vitals: ${vitals}. 
      Detect any immediate health risks.
      Return JSON: risk_detected (boolean), assessment (string), risk_level (Low/Medium/High).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            risk_detected: { type: Type.BOOLEAN },
            assessment: { type: Type.STRING },
            risk_level: { type: Type.STRING, enum: ["Low", "Medium", "High"] }
          },
          required: ["risk_detected", "assessment", "risk_level"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Elderly Check-In Error:", error);
    throw error;
  }
};

export const analyzeWound = async (base64Image: string, mimeType: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { text: "Analyze this wound image. Identify the type (Burn, Cut, Infection, Ulcer) and provide care instructions. Return JSON: type (string), analysis (string), recommendations (string)." },
        { inlineData: { data: base64Image, mimeType: mimeType } }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            analysis: { type: Type.STRING },
            recommendations: { type: Type.STRING }
          },
          required: ["type", "analysis", "recommendations"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Wound Analysis Error:", error);
    throw error;
  }
};
