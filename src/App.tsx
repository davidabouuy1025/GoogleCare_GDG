/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Stethoscope, 
  User, 
  AlertCircle, 
  Heart, 
  Camera, 
  Mic, 
  Volume2, 
  History, 
  MapPin, 
  PhoneCall,
  ChevronRight,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
  Edit2,
  Save,
  X,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Tab = 'dashboard' | 'symptoms' | 'wound' | 'elderly' | 'emergency' | 'profile';

interface Patient {
  id: string;
  name: string;
  age: number;
  contact: string;
  address: string;
  emergencyContact: string;
  checkInDeadline: string;
  lastCheckIn: string | null;
  deadlineMissed: boolean;
  history: Array<{ date: string; condition: string; risk: string }>;
  riskAlerts: Array<{ date: string; message: string }>;
}

// --- Components ---

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch patient data on load
  useEffect(() => {
    fetchPatient('123');
  }, []);

  const fetchPatient = async (id: string) => {
    try {
      const res = await fetch(`/api/dashboard/${id}`);
      const data = await res.json();
      setPatient(data);
    } catch (err) {
      console.error("Failed to fetch patient", err);
    }
  };

  const updateProfile = async (updates: Partial<Patient>) => {
    if (!patient) return;
    try {
      const res = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: patient.id, updates })
      });
      const data = await res.json();
      if (data.success) {
        setPatient(data.patient);
      }
    } catch (err) {
      console.error("Failed to update profile", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 md:pb-0 md:pl-64">
      {/* Sidebar / Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 md:top-0 md:bottom-0 md:w-64 md:border-t-0 md:border-r flex md:flex-col justify-around md:justify-start p-2 md:p-6 gap-2">
        <div className="hidden md:flex items-center gap-2 mb-8 px-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
            <Heart size={24} fill="currentColor" />
          </div>
          <span className="text-xl font-bold tracking-tight">GoogleCare</span>
        </div>

        <NavItem icon={<Activity size={20} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavItem icon={<Stethoscope size={20} />} label="Symptoms" active={activeTab === 'symptoms'} onClick={() => setActiveTab('symptoms')} />
        <NavItem icon={<Camera size={20} />} label="Wound" active={activeTab === 'wound'} onClick={() => setActiveTab('wound')} />
        <NavItem icon={<User size={20} />} label="Elderly" active={activeTab === 'elderly'} onClick={() => setActiveTab('elderly')} />
        <NavItem icon={<AlertCircle size={20} />} label="Emergency" active={activeTab === 'emergency'} onClick={() => setActiveTab('emergency')} />
        <NavItem icon={<User size={20} />} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <Dashboard key="dashboard" patient={patient} onEmergency={() => setActiveTab('emergency')} />}
          {activeTab === 'symptoms' && <SymptomAnalyzer key="symptoms" patientId={patient?.id} onAnalysisComplete={() => fetchPatient('123')} />}
          {activeTab === 'wound' && <WoundAnalyzer key="wound" />}
          {activeTab === 'elderly' && <ElderlyCheckIn key="elderly" patient={patient} onCheckInComplete={() => fetchPatient('123')} onUpdateDeadline={(time) => updateProfile({ checkInDeadline: time })} />}
          {activeTab === 'emergency' && <EmergencyTab key="emergency" />}
          {activeTab === 'profile' && <ProfileTab key="profile" patient={patient} onUpdate={updateProfile} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-xl transition-all duration-200 w-full",
        active ? "bg-blue-50 text-blue-600 font-semibold" : "text-slate-500 hover:bg-slate-100"
      )}
    >
      {icon}
      <span className="text-[10px] md:text-sm">{label}</span>
    </button>
  );
}

// --- Tab Components ---

function Dashboard({ patient, onEmergency }: { patient: Patient | null, onEmergency: () => void }) {
  if (!patient) return <div className="flex items-center justify-center h-64">Loading Dashboard...</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
      {patient.deadlineMissed && (
        <div className="bg-red-600 text-white p-4 rounded-2xl flex items-center gap-3 shadow-lg animate-bounce">
          <AlertCircle size={24} />
          <div className="flex-1">
            <p className="font-bold">Check-In Deadline Missed!</p>
            <p className="text-sm text-red-100">Emergency contact {patient.emergencyContact} has been notified.</p>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {patient.name}</h1>
          <p className="text-slate-500">Here's your health summary for today.</p>
        </div>
        <button 
          onClick={onEmergency}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-200 transition-transform active:scale-95"
        >
          <PhoneCall size={20} />
          EMERGENCY
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <History size={20} className="text-blue-500" />
              Recent Symptom History
            </h2>
          </div>
          <div className="space-y-3">
            {patient.history.map((h, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                <div>
                  <p className="font-semibold">{h.condition}</p>
                  <p className="text-xs text-slate-400">{h.date}</p>
                </div>
                <RiskBadge level={h.risk} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-orange-500" />
            Risk Alerts
          </h2>
          <div className="space-y-3">
            {patient.riskAlerts.length > 0 ? (
              patient.riskAlerts.map((a, i) => (
                <div key={i} className="p-3 bg-orange-50 border border-orange-100 rounded-2xl text-sm text-orange-800">
                  {a.message}
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-sm italic">No active alerts.</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SymptomAnalyzer({ patientId, onAnalysisComplete }: { patientId?: string, onAnalysisComplete: () => void }) {
  const [input, setInput] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const commonIllnesses = [
    { name: "Fever", symptoms: ["High temperature", "Chills", "Sweating", "Headache"] },
    { name: "Cold/Flu", symptoms: ["Runny nose", "Sore throat", "Cough", "Fatigue"] },
    { name: "Digestive", symptoms: ["Nausea", "Vomiting", "Diarrhea", "Stomach pain"] },
    { name: "Skin", symptoms: ["Rashes", "Itching", "Redness", "Swelling"] }
  ];

  const handleAnalyze = async () => {
    const symptoms = input || selectedSymptoms.join(', ');
    if (!symptoms) return;

    setLoading(true);
    try {
      const res = await fetch('/api/analyze-symptoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms, patientId, isElderly: true })
      });
      const data = await res.json();
      setResult(data);
      onAnalysisComplete();
      speak(data.advice);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.start();
  };

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="text-3xl font-bold">Symptom Analysis</h1>
      
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Describe how you feel</label>
          <div className="relative">
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., I have a sharp pain in my lower back and I feel nauseous..."
              className="w-full h-32 p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
            <button 
              onClick={startListening}
              className={cn(
                "absolute bottom-4 right-4 p-3 rounded-full transition-colors",
                isListening ? "bg-red-50 text-white animate-pulse" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
              )}
            >
              <Mic size={20} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-bold text-slate-700">Or select common symptoms</label>
          <div className="space-y-4">
            {commonIllnesses.map((ill, i) => (
              <div key={i} className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{ill.name}</p>
                <div className="flex flex-wrap gap-2">
                  {ill.symptoms.map(s => (
                    <button 
                      key={s}
                      onClick={() => toggleSymptom(s)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm transition-all",
                        selectedSymptoms.includes(s) 
                          ? "bg-blue-600 text-white shadow-md shadow-blue-100" 
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={handleAnalyze}
          disabled={loading || (!input && selectedSymptoms.length === 0)}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          {loading ? "Analyzing..." : "Analyze Symptoms"}
          <ChevronRight size={20} />
        </button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-blue-600">{result.condition}</h2>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Confidence</p>
                <p className="font-bold text-blue-600">{result.confidence}%</p>
              </div>
              <RiskBadge level={result.risk_level} />
            </div>
          </div>

          <div className="prose prose-slate max-w-none">
            <h3 className="text-lg font-bold mb-2">What to do?</h3>
            <ReactMarkdown>{result.advice}</ReactMarkdown>
          </div>

          {result.triggerElderlyCheckIn && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
              <AlertCircle className="text-red-600 shrink-0" />
              <div>
                <p className="font-bold text-red-900">Elderly Check-In Triggered</p>
                <p className="text-sm text-red-700">Based on your symptoms, we recommend completing a full health check-in immediately.</p>
              </div>
            </div>
          )}

          <button 
            onClick={() => speak(result.advice)}
            className="flex items-center gap-2 text-blue-600 font-bold hover:underline"
          >
            <Volume2 size={20} />
            Listen to Advice
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

function WoundAnalyzer() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('image', image);

    try {
      const res = await fetch('/api/analyze-wound', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="text-3xl font-bold">Wound Analysis</h1>
      
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div 
          className="border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 hover:border-blue-400 transition-colors cursor-pointer relative overflow-hidden"
          onClick={() => document.getElementById('wound-upload')?.click()}
        >
          {preview ? (
            <img src={preview} alt="Wound preview" className="w-full h-64 object-cover rounded-2xl" />
          ) : (
            <>
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                <Upload size={32} />
              </div>
              <div className="text-center">
                <p className="font-bold">Click or Drag to Upload Image</p>
                <p className="text-sm text-slate-400">Take a clear picture of the wound</p>
              </div>
            </>
          )}
          <input id="wound-upload" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </div>

        <button 
          onClick={handleAnalyze}
          disabled={loading || !image}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
        >
          {loading ? "Analyzing Image..." : "Analyze Wound"}
        </button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Wound Type</p>
              <h2 className="text-2xl font-bold">{result.type}</h2>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="font-bold flex items-center gap-2 mb-1">
                <Info size={16} className="text-blue-500" />
                Analysis
              </h3>
              <p className="text-slate-600">{result.analysis}</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-2xl">
              <h3 className="font-bold text-blue-900 mb-1">Recommendations</h3>
              <p className="text-blue-800 text-sm">{result.recommendations}</p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function ElderlyCheckIn({ patient, onCheckInComplete, onUpdateDeadline }: { patient: Patient | null, onCheckInComplete: () => void, onUpdateDeadline: (time: string) => void }) {
  const [mood, setMood] = useState('');
  const [vitals, setVitals] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [deadline, setDeadline] = useState(patient?.checkInDeadline || '09:00');

  const handleSubmit = async () => {
    if (!patient) return;
    setLoading(true);
    try {
      const res = await fetch('/api/check-in-elderly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood, vitals, patientId: patient.id })
      });
      const data = await res.json();
      setResult(data);
      onCheckInComplete();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="text-3xl font-bold">Elderly Check-In</h1>
      
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div className="p-4 bg-blue-50 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="text-blue-600" />
            <div>
              <p className="text-sm font-bold text-blue-900">Daily Check-In Deadline</p>
              <p className="text-xs text-blue-700">Alerts sent if not checked in by this time.</p>
            </div>
          </div>
          <input 
            type="time" 
            value={deadline}
            onChange={(e) => {
              setDeadline(e.target.value);
              onUpdateDeadline(e.target.value);
            }}
            className="bg-white border border-blue-200 rounded-xl px-3 py-2 text-blue-600 font-bold outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">How are you feeling today? (Mood)</label>
            <div className="flex gap-4">
              {['😊 Happy', '😐 Neutral', '😔 Sad', '😫 Tired'].map(m => (
                <button 
                  key={m}
                  onClick={() => setMood(m)}
                  className={cn(
                    "flex-1 py-3 rounded-2xl border transition-all",
                    mood === m ? "bg-blue-600 text-white border-blue-600" : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Vitals & Health Notes</label>
            <textarea 
              value={vitals}
              onChange={(e) => setVitals(e.target.value)}
              placeholder="e.g., Blood pressure: 120/80, Heart rate: 72. Feeling slightly dizzy this morning."
              className="w-full h-32 p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>
        </div>

        <button 
          onClick={handleSubmit}
          disabled={loading || !mood || !vitals}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
        >
          {loading ? "Processing..." : "Submit Check-In"}
        </button>
      </div>

      {result && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className={cn(
            "p-8 rounded-3xl border shadow-xl space-y-4",
            result.risk_detected ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"
          )}
        >
          <div className="flex items-center justify-between">
            <h2 className={cn("text-2xl font-bold", result.risk_detected ? "text-red-600" : "text-green-600")}>
              {result.risk_detected ? "Risk Detected" : "Health Status: Good"}
            </h2>
            <RiskBadge level={result.risk_level} />
          </div>
          <p className={cn("text-lg", result.risk_detected ? "text-red-800" : "text-green-800")}>
            {result.assessment}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

function EmergencyTab() {
  const [location, setLocation] = useState<any>(null);
  const [emergencyData, setEmergencyData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const emergencies = [
    { title: "Seizure", advice: "1. Cushion head. 2. Loosen tight clothing. 3. Turn on side. 4. Do NOT put anything in mouth. 5. Time the seizure." },
    { title: "Asthma Attack", advice: "1. Sit upright. 2. Take slow, steady breaths. 3. Use inhaler (blue). 4. Seek help if no improvement." },
    { title: "Allergic Reaction", advice: "1. Use EpiPen if available. 2. Call emergency services. 3. Lay flat with legs raised. 4. Monitor breathing." },
    { title: "Heart Attack", advice: "1. Call 911 immediately. 2. Chew aspirin if not allergic. 3. Sit and stay calm. 4. Loosen clothing." }
  ];

  const triggerEmergency = async (situation: string) => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(loc);

      try {
        const res = await fetch('/api/emergency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ situation, location: loc, patientId: '123' })
        });
        const data = await res.json();
        setEmergencyData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.error(err);
      setLoading(false);
      alert("Please enable location access to find the nearest medical facility.");
    });
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="text-3xl font-bold text-red-600">Emergency Assistance</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {emergencies.map(e => (
          <div key={e.title} className="bg-white p-6 rounded-3xl border border-red-100 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-red-600">{e.title}</h2>
            <p className="text-sm text-slate-600 whitespace-pre-line">{e.advice}</p>
            <button 
              onClick={() => triggerEmergency(e.title)}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors"
            >
              Request Help for {e.title}
            </button>
          </div>
        ))}
      </div>

      {emergencyData && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-red-600 text-white p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
              <PhoneCall size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{emergencyData.severity} Severity</h2>
              <p className="text-red-100">Recommended: {emergencyData.recommendedFacility}</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold border-b border-red-500 pb-2">Nearest {emergencyData.recommendedFacility} Facilities</h3>
            {emergencyData.facilities.map((h: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-white/10 p-4 rounded-2xl">
                <div>
                  <p className="font-bold">{h.name}</p>
                  <p className="text-xs text-red-100">{h.distance} away • {h.type}</p>
                </div>
                <a href={`tel:${h.contact}`} className="bg-white text-red-600 px-4 py-2 rounded-xl font-bold text-sm">
                  Call
                </a>
              </div>
            ))}
          </div>
          <p className="text-sm bg-red-700/50 p-4 rounded-xl italic">{emergencyData.instructions}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

function ProfileTab({ patient, onUpdate }: { patient: Patient | null, onUpdate: (updates: Partial<Patient>) => void }) {
  if (!patient) return null;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="text-3xl font-bold">Patient Profile</h1>
      
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-8">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 bg-blue-100 rounded-3xl flex items-center justify-center text-blue-600 text-3xl font-bold">
            {patient.name.charAt(0)}
          </div>
          <div className="flex-1">
            <EditableField 
              label="Full Name" 
              value={patient.name} 
              onSave={(val) => onUpdate({ name: val })} 
              className="text-2xl font-bold"
            />
            <p className="text-slate-500">Patient ID: {patient.id}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <EditableField label="Age" value={patient.age.toString()} onSave={(val) => onUpdate({ age: parseInt(val) })} />
          <EditableField label="Contact Number" value={patient.contact} onSave={(val) => onUpdate({ contact: val })} />
          <EditableField label="Address" value={patient.address} onSave={(val) => onUpdate({ address: val })} />
          <EditableField label="Emergency Contact" value={patient.emergencyContact} onSave={(val) => onUpdate({ emergencyContact: val })} />
        </div>

        <div className="pt-6 border-t border-slate-100">
          <h3 className="font-bold mb-4">Security & Settings</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
              <div>
                <p className="font-bold">Biometric Authentication</p>
                <p className="text-xs text-slate-400">Use FaceID or Fingerprint to access records</p>
              </div>
              <div className="w-12 h-6 bg-blue-600 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function EditableField({ label, value, onSave, className }: { label: string, value: string, onSave: (val: string) => void, className?: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const handleSave = () => {
    onSave(tempValue);
    setIsEditing(false);
  };

  return (
    <div className="group relative space-y-1 p-2 rounded-xl hover:bg-slate-50 transition-colors">
      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{label}</p>
      {isEditing ? (
        <div className="flex items-center gap-2">
          <input 
            autoFocus
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            className={cn("bg-white border border-blue-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 w-full", className)}
          />
          <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-50 rounded-md"><Save size={16} /></button>
          <button onClick={() => setIsEditing(false)} className="p-1 text-red-600 hover:bg-red-50 rounded-md"><X size={16} /></button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className={cn("font-semibold text-slate-700", className)}>{value}</p>
          <button 
            onClick={() => setIsEditing(true)}
            className="opacity-0 group-hover:opacity-100 p-1 text-blue-600 hover:bg-blue-50 rounded-md transition-all"
          >
            <Edit2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors = {
    Low: "bg-green-100 text-green-700 border-green-200",
    Medium: "bg-orange-100 text-orange-700 border-orange-200",
    High: "bg-red-100 text-red-700 border-red-200"
  };
  return (
    <span className={cn("px-3 py-1 rounded-full text-xs font-bold border", colors[level as keyof typeof colors] || colors.Low)}>
      {level} Risk
    </span>
  );
}
