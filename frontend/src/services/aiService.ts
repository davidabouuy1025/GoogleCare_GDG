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

function interpretVisionLabels(
  labels: { description: string; score: number }[],
  safeSearch: Record<string, string>
): { type: string; analysis: string; recommendations: string } {

  const topLabels = labels.map(l => l.description.toLowerCase());
  const labelSummary = labels
    .slice(0, 5)
    .map(l => `${l.description} (${(l.score * 100).toFixed(0)}%)`)
    .join(", ");

  let type = "Unknown";
  let analysis = "";
  let recommendations = "";

  if (topLabels.some(l =>
    l.includes("burn") || l.includes("scald") || l.includes("blister") || l.includes("char")
  )) {
    type = "Burn";
    analysis = `Burn wound detected. Vision AI identified visual patterns consistent with thermal or chemical burn injury. Detected features: ${labelSummary}.`;
    recommendations =
      "1. Cool the burn under running cold water for 10–20 minutes. Do NOT use ice.\n" +
      "2. Cover loosely with a sterile non-stick bandage or clean cloth.\n" +
      "3. Do NOT pop blisters — they protect against infection.\n" +
      "4. Avoid butter, toothpaste, or oils on the wound.\n" +
      "5. Seek immediate medical attention for burns larger than 3 inches or on face/hands.\n" +
      "6. Take OTC ibuprofen or paracetamol for pain.";

  } else if (topLabels.some(l =>
    l.includes("cut") || l.includes("laceration") || l.includes("incision") ||
    l.includes("slice") || l.includes("wound") || l.includes("bleeding")
  )) {
    type = "Cut";
    analysis = `Cut/Laceration detected. Vision AI identified sharp-edged wound patterns. Detected features: ${labelSummary}.`;
    recommendations =
      "1. Apply firm pressure with a clean cloth or gauze for 10–15 minutes to stop bleeding.\n" +
      "2. Rinse the cut gently under clean running water.\n" +
      "3. Apply antiseptic (Dettol, Betadine, or hydrogen peroxide).\n" +
      "4. Cover with a sterile adhesive bandage or wound dressing.\n" +
      "5. Deep cuts that won't stay closed may need stitches — go to a clinic.\n" +
      "6. Watch for infection: increasing redness, warmth, pus, or fever.";

  } else if (topLabels.some(l =>
    l.includes("infection") || l.includes("pus") || l.includes("abscess") ||
    l.includes("inflammation") || l.includes("redness") || l.includes("cellulitis")
  )) {
    type = "Infection";
    analysis = `Wound infection signs detected. Vision AI identified visual markers of inflammation or infection. Detected features: ${labelSummary}.`;
    recommendations =
      "1. Clean the wound gently with saline solution or clean water.\n" +
      "2. Apply antibiotic cream (Neosporin, Fucidin, or Bactroban).\n" +
      "3. Cover with fresh sterile dressing and change daily.\n" +
      "4. Do NOT squeeze or pop infected areas.\n" +
      "5. See a doctor immediately if you have fever, red streaks spreading from wound, or swollen lymph nodes.\n" +
      "6. Keep the wound elevated to reduce swelling.";

  } else if (topLabels.some(l =>
    l.includes("ulcer") || l.includes("sore") || l.includes("pressure") ||
    l.includes("diabetic") || l.includes("lesion") || l.includes("chronic")
  )) {
    type = "Ulcer";
    analysis = `Chronic wound/ulcer detected. Vision AI identified patterns consistent with a pressure sore or chronic skin ulcer. Detected features: ${labelSummary}.`;
    recommendations =
      "1. Keep the wound clean and covered with a moist wound dressing (hydrocolloid or foam).\n" +
      "2. Relieve pressure on the area — reposition every 2 hours if bedridden.\n" +
      "3. Clean gently with saline; avoid harsh antiseptics on ulcers.\n" +
      "4. Eat protein-rich foods and stay hydrated to support healing.\n" +
      "5. Seek specialist care — ulcers may need debridement or vascular assessment.\n" +
      "6. For diabetic ulcers, strict blood sugar control is critical.";

  } else {
    type = "Skin Wound";
    analysis = `Wound detected. Vision AI identified the following features: ${labelSummary}. Wound type could not be precisely classified — please consult a healthcare professional for proper diagnosis.`;
    recommendations =
      "1. Keep the wound clean by gently rinsing with water.\n" +
      "2. Apply antiseptic and cover with a clean bandage.\n" +
      "3. Change dressing daily and keep the area dry.\n" +
      "4. Watch for infection signs: increasing redness, warmth, pus, or fever.\n" +
      "5. Consult a doctor if the wound does not heal within a few days.";
  }

  // Safety override
  if (safeSearch.violence === "VERY_LIKELY" || safeSearch.adult === "VERY_LIKELY") {
    analysis = "Warning: Content moderation flags detected. Please upload a clear wound photo for accurate analysis.";
  }

  return { type, analysis, recommendations };
}

export const analyzeSymptoms = async (symptoms: string, conversationContext: string = '') => {
  try {
    const fullContext = conversationContext
      ? `${conversationContext}\nAdditional info from user: ${symptoms}`
      : `User's symptoms: ${symptoms}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
            med: { type: Type.STRING },
            risk_level: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
            followUpQuestion: { type: Type.STRING }
          },
          required: ["topCondition", "possibleConditions", "advice", "med", "risk_level", "followUpQuestion"]
        }
      }
    });
    return JSON.parse(response.text ?? "{}");
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
      model: "gemini-3.1-flash-lite-preview",
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

    return JSON.parse(response.text ?? "{}");
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

const VISION_API_KEY = import.meta.env.VITE_GOOGLE_CLOUD_VISION_API_KEY;

const VISION_API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;

export const analyzeWound = async (base64Image: string, mimeType: string) => {
  try {
    // Remove data URI prefix if present (Vision API wants raw base64 only)
    const cleanBase64 = base64Image.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;

    const requestBody = {
      requests: [
        {
          image: {
            content: cleanBase64,
          },
          features: [
            { type: "LABEL_DETECTION", maxResults: 15 },    // What's in the image
            { type: "OBJECT_LOCALIZATION", maxResults: 5 }, // Locate wound region
            { type: "SAFE_SEARCH_DETECTION" },               // Safety check
            { type: "IMAGE_PROPERTIES" },                    // Color analysis (redness/bruising)
          ],
        },
      ],
    };

    const response = await fetch(VISION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Vision API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const result = data.responses?.[0];

    if (!result) throw new Error("Empty response from Vision API");

    // Error inside the response (e.g. billing not enabled)
    if (result.error) {
      throw new Error(`Vision API: ${result.error.message}`);
    }

    // Extract labels
    const labels: { description: string; score: number }[] =
      result.labelAnnotations?.map((l: any) => ({
        description: l.description,
        score: l.score,
      })) || [];

    // Extract safe search
    const safeSearch: Record<string, string> = {
      adult: result.safeSearchAnnotation?.adult || "UNKNOWN",
      violence: result.safeSearchAnnotation?.violence || "UNKNOWN",
      medical: result.safeSearchAnnotation?.medical || "UNKNOWN",
    };

    // Extract dominant colors
    const dominantColors =
      result.imagePropertiesAnnotation?.dominantColors?.colors
        ?.slice(0, 3)
        .map((c: any) => {
          const r = Math.round(c.color?.red || 0);
          const g = Math.round(c.color?.green || 0);
          const b = Math.round(c.color?.blue || 0);
          return `rgb(${r},${g},${b}) ${(c.pixelFraction * 100).toFixed(1)}%`;
        })
        .join(", ") || "N/A";

    // Extract localized objects
    const objects =
      result.localizedObjectAnnotations?.map((o: any) => o.name).join(", ") ||
      "None detected";

    // Interpret into wound result
    const { type, analysis, recommendations } = interpretVisionLabels(labels, safeSearch);

    const medicalUnlikely = ['UNLIKELY', 'VERY_UNLIKELY', 'UNKNOWN'].includes(safeSearch.medical);

    if (medicalUnlikely) {
      return {
        type: 'Unable to Classify',
        analysis:
          '⚠️ The image did not contain recognisable wound features. ' +
          'This may be due to poor lighting, image angle, or the wound being ' +
          'obscured. Please retake the photo in good lighting, close-up, and ' +
          'ensure the wound is clearly visible.',
        recommendations:
          'For accurate analysis, upload a clear, well-lit photograph of the wound. ' +
          'If you are concerned about your wound, please consult a healthcare professional.',
      };
    }

    return {
      type,
      analysis:
        `${analysis}\n\n` +
        `📍 Objects detected: ${objects}\n` +
        `🎨 Dominant colors: ${dominantColors}\n` +
        `🏥 Medical content likelihood: ${safeSearch.medical}`,
      recommendations,
    };

    } catch (error: any) {
      if (
        error.message?.includes("429") ||
        error.message?.toLowerCase().includes("quota")
      ) {
        return {
          type: "Unknown",
          analysis: "Vision API quota exceeded.",
          recommendations: QUOTA_ERROR_MESSAGE,
          isQuotaExceeded: true,
        };
      }
      console.error("Wound Analysis (Vision API) Error:", error);
      throw error;
    }
  };
