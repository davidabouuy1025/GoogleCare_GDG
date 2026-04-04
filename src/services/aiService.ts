// Based on the symptoms, provide:
// 1. The single most likely condition (topCondition) in plain English
// 2. 5 possible conditions ranked by likelihood, each with a confidence percentage (they don't need to add up to 100)
// 3. Practical advice with home remedies in bullet point format (advice field, use markdown bullets)
// 4. Overall risk level
// 5. A warm, conversational follow-up question to help narrow things down further — ask about specific details like: where exactly the pain is, how long it has been going on, recent food/drink/stress/medication, other symptoms they might not have mentioned. Keep it to ONE focused question.
// 6. Whether this needs an urgent check-in (triggerElderlyCheckIn) — only true if symptoms are genuinely alarming

import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const QUOTA_ERROR_MESSAGE = "AI is currently resting due to high demand. Please try again later or consult a medical professional for urgent concerns.";

export const analyzeSymptoms = async (symptoms: string, conversationContext: string = '') => {
  try {
    const fullContext = conversationContext
      ? `${conversationContext}\nAdditional info from user: ${symptoms}`
      : `User's symptoms: ${symptoms}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Simple health assistant. 
      
      IMPORTANT RULES:
      - Use layman terms ("fever" not "febrile episode", "sore throat" not "pharyngitis")
      - Suggest home remedies first, be concise and give detailed guides
      - Only recommend seeing a doctor if symptoms are life-threatening
      - Suggest medications available at common pharmarcy (1 sentence)
      - Followup questions: ask user to describe more conscisely (body parts, duration) accordingly
      
      ${fullContext}
      
      Return JSON only.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topCondition: { type: Type.STRING },
            possibleConditions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  confidence: { type: Type.NUMBER }
                },
                required: ["name", "confidence"]
              }
            },
            advice: { type: Type.STRING },
            med: {type: Type.STRING},
            risk_level: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
            followUpQuestion: { type: Type.STRING }
          },
          required: ["topCondition", "possibleConditions", "advice", "med", "risk_level", "followUpQuestion"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error: any) {
    if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) {
      return {
        topCondition: symptoms,
        possibleConditions: [],
        advice: QUOTA_ERROR_MESSAGE,
        risk_level: "Low",
        followUpQuestion: "Would you like to try again later?",
        triggerElderlyCheckIn: false,
        isQuotaExceeded: true
      };
    }
    console.error("Symptom Analysis Error:", error);
    throw error;
  }
};

export const checkInElderly = async (mood: string, vitals: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Evaluate elderly check-in. Mood: ${mood}, Vitals/Notes: ${vitals}. 
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
  } catch (error: any) {
    if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) {
      return {
        risk_detected: false,
        assessment: QUOTA_ERROR_MESSAGE,
        risk_level: "Low",
        isQuotaExceeded: true
      };
    }
    console.error("Elderly Check-In Error:", error);
    throw error;
  }
};

export const analyzeWound = async (base64Image: string, mimeType: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview", // Use image model for wound analysis
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
  } catch (error: any) {
    if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) {
      return {
        type: "Unknown",
        analysis: "AI analysis is currently unavailable.",
        recommendations: QUOTA_ERROR_MESSAGE,
        isQuotaExceeded: true
      };
    }
    console.error("Wound Analysis Error:", error);
    throw error;
  }
};
