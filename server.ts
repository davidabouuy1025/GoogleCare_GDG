import express from "express";
import cors from "cors";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// AI Initialization
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Mock Database (In-Memory)
const patients: Record<string, any> = {
  "123": {
    id: "123",
    name: "John Doe",
    age: 72,
    contact: "+1 234 567 890",
    address: "123 Health St, Wellness City",
    emergencyContact: "Jane Doe (+1 987 654 321)",
    checkInDeadline: "09:00", // Default 9 AM
    lastCheckIn: null,
    history: [
      { date: "2026-03-20", condition: "Mild Fever", risk: "Low" },
      { date: "2026-03-25", condition: "Cough", risk: "Low" }
    ],
    riskAlerts: []
  }
};

// --- API Routes ---

// 1. Symptom Analysis (Refined Prompt)
app.post("/api/analyze-symptoms", async (req, res) => {
  const { symptoms, isElderly } = req.body;

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

    const result = JSON.parse(response.text);
    
    if (req.body.patientId && patients[req.body.patientId]) {
      patients[req.body.patientId].history.push({
        date: new Date().toISOString().split('T')[0],
        condition: result.condition,
        risk: result.risk_level
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Symptom Analysis Error:", error);
    res.status(500).json({ error: "Failed to analyze symptoms" });
  }
});

// 2. Elderly Check-In (Updated with timestamp)
app.post("/api/check-in-elderly", async (req, res) => {
  const { mood, vitals, patientId } = req.body;

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

    const result = JSON.parse(response.text);
    
    if (patientId && patients[patientId]) {
      patients[patientId].lastCheckIn = new Date().toISOString();
      if (result.risk_detected) {
        patients[patientId].riskAlerts.push({
          date: new Date().toISOString(),
          message: `High risk detected during check-in: ${result.assessment}`
        });
      }
    }

    res.json(result);
  } catch (error) {
    console.error("Elderly Check-In Error:", error);
    res.status(500).json({ error: "Failed to process check-in" });
  }
});

// 3. Patient Dashboard & Profile Update
app.get("/api/dashboard/:patientId", (req, res) => {
  const patient = patients[req.params.patientId];
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  
  // Check if deadline missed
  const now = new Date();
  const [hours, minutes] = patient.checkInDeadline.split(':').map(Number);
  const deadlineToday = new Date();
  deadlineToday.setHours(hours, minutes, 0, 0);

  const lastCheckInDate = patient.lastCheckIn ? new Date(patient.lastCheckIn) : null;
  const missed = (!lastCheckInDate || lastCheckInDate < deadlineToday) && now > deadlineToday;

  res.json({ ...patient, deadlineMissed: missed });
});

app.post("/api/update-profile", (req, res) => {
  const { patientId, updates } = req.body;
  if (patients[patientId]) {
    patients[patientId] = { ...patients[patientId], ...updates };
    res.json({ success: true, patient: patients[patientId] });
  } else {
    res.status(404).json({ error: "Patient not found" });
  }
});

// 4. Wound Analysis (Unchanged)
app.post("/api/analyze-wound", upload.single('image'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });

  try {
    const base64Image = req.file.buffer.toString('base64');
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { text: "Analyze this wound image. Identify the type (Burn, Cut, Infection, Ulcer) and provide care instructions. Return JSON: type (string), analysis (string), recommendations (string)." },
        { inlineData: { data: base64Image, mimeType: req.file.mimetype } }
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

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error("Wound Analysis Error:", error);
    res.status(500).json({ error: "Failed to analyze wound" });
  }
});

// 5. Emergency Trigger (Improved with facility types)
app.post("/api/emergency", async (req, res) => {
  const { situation, location, patientId } = req.body;
  
  // Logic to determine facility type based on situation
  let facilityType = "Hospital";
  let severity = "High";

  if (situation.toLowerCase().includes("allergic") || situation.toLowerCase().includes("rash")) {
    facilityType = "Pharmacy/Clinic";
    severity = "Medium";
  } else if (situation.toLowerCase().includes("asthma") || situation.toLowerCase().includes("seizure") || situation.toLowerCase().includes("heart")) {
    facilityType = "Hospital (Emergency Room)";
    severity = "Critical";
  }

  // Mock finding nearest facilities based on type
  const facilities = facilityType === "Pharmacy/Clinic" ? [
    { name: "Green Cross Pharmacy", distance: "0.4km", contact: "555-0101", type: "Pharmacy" },
    { name: "Neighborhood Clinic", distance: "0.8km", contact: "555-0102", type: "Clinic" }
  ] : [
    { name: "City General Hospital", distance: "1.2km", contact: "911-001", type: "Hospital" },
    { name: "St. Jude Medical Center", distance: "2.5km", contact: "911-002", type: "Hospital" }
  ];

  res.json({
    status: "Emergency Triggered",
    severity,
    recommendedFacility: facilityType,
    facilities,
    instructions: severity === "Critical" 
      ? "Ambulance dispatched. Stay on the line. Do not move the patient." 
      : "Please visit the nearest facility listed below for immediate treatment."
  });
});

// --- Server Startup ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`GoogleCare Server running on http://localhost:${PORT}`);
  });
}

startServer();
