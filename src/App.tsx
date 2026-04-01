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
  Clock,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Firebase imports
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signInAnonymously,
  User as FirebaseUser 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { analyzeSymptoms, checkInElderly, analyzeWound } from './services/aiService';

// --- Local Knowledge Base (to minimize AI usage) ---
const COMMON_CAUSES: Record<string, string> = {
  "headache": "Common causes: Dehydration, stress, eye strain, or lack of sleep. Try drinking water and resting in a dark room.",
  "fever": "Common causes: Viral infection, cold, or flu. Monitor your temperature and stay hydrated.",
  "sore throat": "Common causes: Common cold, allergies, or dry air. Try warm salt water gargles.",
  "cough": "Common causes: Post-nasal drip, allergies, or a lingering cold. Stay hydrated and use a humidifier.",
  "nausea": "Common causes: Indigestion, motion sickness, or mild food poisoning. Sip clear liquids and rest.",
  "fatigue": "Common causes: Lack of sleep, stress, or minor illness. Ensure you're getting enough rest and nutrition."
};

const AI_COOLDOWN_MS = 30000; // 30 seconds cooldown for AI calls

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getMalaysiaTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
}

function getMalaysiaISOString() {
  return getMalaysiaTime().toISOString();
}

function getMalaysiaDateKey() {
  return getMalaysiaTime().toISOString().split('T')[0];
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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
}

// --- Components ---

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Connection test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  // Fetch patient data on auth change
  useEffect(() => {
    if (!user) {
      setPatient(null);
      return;
    }

    const patientRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(patientRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setPatient({
          id: user.uid,
          name: data.patientName || user.displayName || 'Patient',
          age: data.patientAge || 0,
          contact: data.patientContactNo || '',
          address: data.patientAddress || '',
          emergencyContact: data.patientEmergencyContact || '',
          checkInDeadline: data.checkInDeadline || '09:00',
          lastCheckIn: data.lastCheckIn || null,
          deadlineMissed: data.deadlineMissed || false,
        });
      } else {
        // Initialize patient profile if it doesn't exist
        const initialPatient = {
          patientID: user.uid,
          patientName: user.displayName || 'Guest',
          patientAge: 0,
          patientAddress: '',
          patientContactNo: '',
          patientEmergencyContact: '',
          checkInDeadline: '09:00',
          lastCheckIn: null,
          deadlineMissed: false
        };
        setPatient({
          id: user.uid,
          name: initialPatient.patientName,
          age: initialPatient.patientAge,
          contact: initialPatient.patientContactNo,
          address: initialPatient.patientAddress,
          emergencyContact: initialPatient.patientEmergencyContact,
          checkInDeadline: initialPatient.checkInDeadline,
          lastCheckIn: initialPatient.lastCheckIn,
          deadlineMissed: initialPatient.deadlineMissed,
        });
        setDoc(patientRef, initialPatient).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const loginAnonymously = async () => {
    try {
      await signInAnonymously(auth);
      setShowGuestModal(false);
    } catch (err) {
      console.error("Anonymous login failed", err);
    }
  };

  const updateProfile = async (updates: Partial<Patient>) => {
    if (!user) return;
    const patientRef = doc(db, 'users', user.uid);
    
    // Map Patient type back to Firestore schema
    const firestoreUpdates: any = {};
    if (updates.name !== undefined) firestoreUpdates.patientName = updates.name;
    if (updates.age !== undefined) firestoreUpdates.patientAge = updates.age;
    if (updates.contact !== undefined) firestoreUpdates.patientContactNo = updates.contact;
    if (updates.address !== undefined) firestoreUpdates.patientAddress = updates.address;
    if (updates.emergencyContact !== undefined) firestoreUpdates.patientEmergencyContact = updates.emergencyContact;
    if (updates.checkInDeadline !== undefined) firestoreUpdates.checkInDeadline = updates.checkInDeadline;

    try {
      await updateDoc(patientRef, firestoreUpdates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  if (loading || !isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">Initializing Care System...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center space-y-6">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-100">
            <Heart size={40} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">GoogleCare</h1>
            <p className="text-slate-500 mt-2">Please sign in to access your health dashboard and monitoring tools.</p>
          </div>
          <div className='flex gap-3'>
            <button 
              onClick={login}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-100 active:scale-95"
            >
              <LogIn size={40} />
              Sign in with Google
            </button>
            <button 
              onClick={() => setShowGuestModal(true)}
              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 px-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all"
            >
              Continue as Guest
            </button>
          </div>
          <p className="text-xs text-slate-400">Secured, <abbr className="underline" title="Health Insurance Portability and Accountability Act">HIPAA-compliant</abbr> patient monitoring</p>
        </div>

        {showGuestModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full space-y-6 shadow-2xl">
              <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle size={28} className="text-orange-500" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold">Guest Account Warning</h2>
                <p className="text-slate-500 text-sm">
                  Your data is tied to this device only. Clearing your browser or switching devices will <span className="font-bold text-red-500">permanently delete</span> your health records.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={loginAnonymously}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-2xl font-bold transition-all active:scale-95"
                >
                  I Understand, Continue as Guest
                </button>
                <button
                  onClick={() => setShowGuestModal(false)}
                  className="w-full border border-slate-200 hover:bg-slate-50 text-slate-600 py-3 rounded-2xl font-bold transition-all"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
        
        <div className="hidden md:block mt-auto pt-6 border-t border-slate-100">
          <button 
            onClick={() => auth.signOut()}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all w-full"
          >
            <X size={20} />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <Dashboard key="dashboard" patient={patient} onEmergency={() => setActiveTab('emergency')} />}
          {activeTab === 'symptoms' && <SymptomAnalyzer key="symptoms" patientId={patient?.id} />}
          {activeTab === 'wound' && <WoundAnalyzer key="wound" patientId={patient?.id} />}
          {activeTab === 'elderly' && <ElderlyCheckIn key="elderly" patient={patient} onUpdateDeadline={(time) => updateProfile({ checkInDeadline: time })} />}
          {activeTab === 'emergency' && <EmergencyTab key="emergency" patient={patient} onProfile={() => setActiveTab('profile')}/>}
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
  const [symptomHistory, setSymptomHistory] = useState<any[]>([]);
  const [moodHistory, setMoodHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!patient?.id) return;
    const q = query(
      collection(db, 'symptoms'),
      where('patientID', '==', patient.id),
      orderBy('date', 'desc'),
      limit(5)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setSymptomHistory(snap.docs.map(d => ({
        condition: d.data().topCondition || d.data().Symptom,
        risk: d.data().riskLevel,
        date: new Date(d.data().date).toLocaleDateString()
      })));
    }, (err) => console.error('Symptom history error:', err));
    return () => unsubscribe();
  }, [patient?.id]);

  useEffect(() => {
    if (!patient?.id) return;
    const q = query(
      collection(db, 'moods'),
      where('patientID', '==', patient.id),
      orderBy('date', 'desc'),
      limit(7)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setMoodHistory(snap.docs.map(d => ({
        mood: d.data().mood,
        date: new Date(d.data().date).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })
      })));
    }, (err) => console.error('Mood history error:', err));
    return () => unsubscribe();
  }, [patient?.id]);

  const highRiskAlerts = symptomHistory.filter(h => h.risk === 'High');


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

      {/* Mood Summary - Last 7 Days */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Heart size={20} className="text-pink-500" />
          Mood History (Last 7 Days)
        </h2>
        <div className="flex justify-between gap-2 overflow-x-auto pb-2">
          {moodHistory.length === 0 ? (
            <p className="text-slate-400 text-sm italic">No mood records yet.</p>
          ) : (
            moodHistory.map((m, i) => (
              <div key={i} className="flex flex-col items-center gap-1 min-w-[60px] p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-2xl">{m.mood.split(' ')[0]}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">{m.date}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <History size={20} className="text-blue-500" />
              Recent Symptom History
            </h2>
          </div>
          <div className="space-y-3">
            {symptomHistory.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No symptom records yet.</p>
            ) : (
              symptomHistory.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <div>
                    <p className="font-semibold">{h.condition}</p>
                    <p className="text-xs text-slate-400">{h.date}</p>
                  </div>
                  <RiskBadge level={h.risk} />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-orange-500" />
            Risk Alerts
          </h2>
          <div className="space-y-3">
            {highRiskAlerts.length > 0 ? (
              highRiskAlerts.map((a, i) => (
                <div key={i} className="p-3 bg-orange-50 border border-orange-100 rounded-2xl text-sm text-orange-800">
                  <p className="font-semibold">{a.condition}</p>
                  <p className="text-xs text-orange-600 mt-1">{a.date}</p>
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

function SymptomAnalyzer({ patientId }: { patientId?: string }) {
  const [input, setInput] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [conversationContext, setConversationContext] = useState('');
  const [followUpAnswer, setFollowUpAnswer] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [lastAiCall, setLastAiCall] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setInterval(() => {
        setCooldownRemaining(prev => Math.max(0, prev - 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownRemaining]);

  const commonIllnesses = [
    { name: "Fever", symptoms: ["High temperature", "Chills", "Sweating", "Headache"] },
    { name: "Cold/Flu", symptoms: ["Runny nose", "Sore throat", "Cough", "Fatigue"] },
    { name: "Digestive", symptoms: ["Nausea", "Vomiting", "Diarrhea", "Stomach pain"] },
    { name: "Skin", symptoms: ["Rashes", "Itching", "Redness", "Swelling"] }
  ];

  const [localAdvice, setLocalAdvice] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const symptomsText = input || selectedSymptoms.join(', ');
    if (!symptomsText) return;

    // Check cooldown
    const now = Date.now();
    if (now - lastAiCall < AI_COOLDOWN_MS) {
      setCooldownRemaining(AI_COOLDOWN_MS - (now - lastAiCall));
      return;
    }

    // Minimize AI usage: Check local knowledge base first
    const lowerInput = symptomsText.toLowerCase();
    const foundCause = Object.keys(COMMON_CAUSES).find(cause => lowerInput.includes(cause));
    if (foundCause && !input.includes("analyze deeply")) {
      setLocalAdvice(COMMON_CAUSES[foundCause]);
      // We still allow them to analyze deeply if they want
    } else {
      setLocalAdvice(null);
    }

    setLoading(true);
    setResult(null);
    setConversationContext('');
    setFollowUpAnswer('');

    try {
      const data = await analyzeSymptoms(symptomsText, '');
      setResult(data);
      setLastAiCall(Date.now());
      setConversationContext(`User symptoms: ${symptomsText}`);

      // Save to Firestore — symptoms collection only
      if (patientId) {
        await addDoc(collection(db, 'symptoms'), {
          patientID: patientId,
          Symptom: symptomsText,
          topCondition: data.topCondition || '',
          riskLevel: data.risk_level || 'Low',
          confidenceScore: data.possibleConditions?.[0]?.confidence || 0,
          date: new Date().toISOString()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'symptoms'));
      }

      if (!data.isQuotaExceeded) {
        speak(data.advice);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    console.log("SymptomAnalyzer: Data is successfully saved to Firebase.")
  };

  const handleFollowUp = async () => {
    if (!followUpAnswer.trim()) return;

    // Check cooldown
    const now = Date.now();
    if (now - lastAiCall < AI_COOLDOWN_MS) {
      setCooldownRemaining(AI_COOLDOWN_MS - (now - lastAiCall));
      return;
    }

    setFollowUpLoading(true);
    try {
      const updatedContext = `${conversationContext}\nFollow-up answer: ${followUpAnswer}`;
      const data = await analyzeSymptoms(followUpAnswer, updatedContext);
      setResult(data);
      setLastAiCall(Date.now());
      setConversationContext(updatedContext);
      setFollowUpAnswer('');
    } catch (err) {
      console.error(err);
    } finally {
      setFollowUpLoading(false);
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

  const disableButton = true;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="bg-white-600 text-black text-3xl px-5 py-4 rounded-xl font-bold shadow-md">🩺 Symptom Analysis</h1>
      
      
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
          disabled={loading || (!input && selectedSymptoms.length === 0) || cooldownRemaining > 0}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          {loading ? "Analyzing..." : cooldownRemaining > 0 ? `Wait ${Math.ceil(cooldownRemaining / 1000)}s` : "Analyze Symptoms"}
          <ChevronRight size={20} />
        </button>
      </div>

      {localAdvice && !result && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3">
          <Info className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-blue-900">Quick Tip (Local Check)</p>
            <p className="text-sm text-blue-700">{localAdvice}</p>
            <button 
              onClick={() => { setInput(prev => prev + " (analyze deeply)"); handleAnalyze(); }}
              className="text-xs font-bold text-blue-600 underline mt-2"
            >
              Still concerned? Run full AI analysis
            </button>
          </div>
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={cn(
          "bg-white p-8 rounded-3xl border shadow-xl space-y-6",
          result.isQuotaExceeded ? "border-amber-200 bg-amber-50/30" : "border-slate-100"
        )}>
          {result.isQuotaExceeded && (
            <div className="bg-amber-100 text-amber-800 p-3 rounded-xl flex items-center gap-2 text-sm font-medium">
              <AlertTriangle size={18} />
              AI Quota Reached: Showing simplified assessment.
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-blue-600">{result.topCondition}</h2>
            <RiskBadge level={result.risk_level} />
          </div>

          {/* 5 Possible Conditions */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Possible Conditions</h3>
            {result.possibleConditions?.map((c: any, i: number) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className={cn("font-medium", i === 0 ? "text-blue-600" : "text-slate-700")}>{c.name}</span>
                  <span className="text-slate-400">{c.confidence*100}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-2 rounded-full", i === 0 ? "bg-blue-500" : "bg-slate-300")}
                    style={{ width: `${c.confidence*100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="prose prose-slate max-w-none">
            <h3 className="text-lg font-bold mb-2">What to do?</h3>
            <ReactMarkdown>{result.advice}</ReactMarkdown>
          </div>

          {result.triggerElderlyCheckIn && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
              <AlertCircle className="text-red-600 shrink-0" />
              <div>
                <p className="font-bold text-red-900">Urgent Check-In Recommended</p>
                <p className="text-sm text-red-700">Based on your symptoms, please complete a full health check-in immediately.</p>
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

          {/* Follow-up Question */}
          {result.followUpQuestion && (
            <div className="border-t border-slate-100 pt-6 space-y-3">
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-2xl">
                <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-blue-800 text-sm font-medium">{result.followUpQuestion}</p>
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={followUpAnswer}
                  onChange={(e) => setFollowUpAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFollowUp()}
                  placeholder="Type your answer here..."
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                <button
                  onClick={handleFollowUp}
                  disabled={disableButton && followUpLoading || !followUpAnswer.trim() || cooldownRemaining > 0}
                  className="px-5 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {followUpLoading ? "..." : cooldownRemaining > 0 ? `${Math.ceil(cooldownRemaining / 1000)}s` : <><ChevronRight size={18} /></>}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function WoundAnalyzer({ patientId }: { patientId?: string }) {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastAiCall, setLastAiCall] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setInterval(() => {
        setCooldownRemaining(prev => Math.max(0, prev - 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownRemaining]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleAnalyze = async () => {
    if (!image) return;

    // Check cooldown
    const now = Date.now();
    if (now - lastAiCall < AI_COOLDOWN_MS) {
      setCooldownRemaining(AI_COOLDOWN_MS - (now - lastAiCall));
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const data = await analyzeWound(base64, image.type);
        setResult(data);
        setLastAiCall(Date.now());
        
        // Save to Firestore
        if (patientId) {
          await addDoc(collection(db, 'wounds'), {
            patientID: patientId,
            type: data.type || 'Unknown',
            analysis: data.analysis || '',
            recommendations: data.recommendations || '',
            date: new Date().toISOString()
          }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'wounds'));
        }
        
        setLoading(false);
      };
      reader.readAsDataURL(image);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
    console.log("WoundAnalyzer: Data is successfully saved to Firebase.")
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="bg-white-600 text-black text-3xl px-5 py-4 rounded-xl font-bold shadow-md">🩸 Wound Analysis</h1>
      
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
          disabled={loading || !image || cooldownRemaining > 0}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
        >
          {loading ? "Analyzing Image..." : cooldownRemaining > 0 ? `Wait ${Math.ceil(cooldownRemaining / 1000)}s` : "Analyze Wound"}
        </button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={cn(
          "bg-white p-8 rounded-3xl border shadow-xl space-y-6",
          result.isQuotaExceeded ? "border-amber-200 bg-amber-50/30" : "border-slate-100"
        )}>
          {result.isQuotaExceeded && (
            <div className="bg-amber-100 text-amber-800 p-3 rounded-xl flex items-center gap-2 text-sm font-medium">
              <AlertTriangle size={18} />
              AI Quota Reached: Showing simplified care instructions.
            </div>
          )}
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

function ElderlyCheckIn({ patient, onUpdateDeadline }: { patient: Patient | null, onUpdateDeadline: (time: string) => void }) {
  const [mood, setMood] = useState('');
  const [vitals, setVitals] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [deadline, setDeadline] = useState(patient?.checkInDeadline || '09:00');
  const [lastAiCall, setLastAiCall] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [moodHistory, setMoodHistory] = useState<any[]>([]);

  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setInterval(() => {
        setCooldownRemaining(prev => Math.max(0, prev - 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownRemaining]);

  useEffect(() => {
    if (!patient?.id) return;
    const q = query(
      collection(db, 'moods'),
      where('patientID', '==', patient.id),
      orderBy('date', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setMoodHistory(snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
    }, (err) => console.error('Mood history error:', err));
    return () => unsubscribe();
  }, [patient?.id]);

  const handleSubmit = async () => {
    if (!patient) return;

    // Minimize AI usage: Simple check for normal status
    if (mood === '😊 Happy' && (!vitals || vitals.toLowerCase().includes('normal'))) {
      const localResult = {
        risk_detected: false,
        assessment: "You're doing great! Keep up the positive mood and healthy habits.",
        risk_level: "Low",
        isLocal: true
      };
      setResult(localResult);
      await saveCheckIn(localResult);
      return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - lastAiCall < AI_COOLDOWN_MS) {
      setCooldownRemaining(AI_COOLDOWN_MS - (now - lastAiCall));
      return;
    }

    setLoading(true);
    try {
      const data = await checkInElderly(mood, vitals);
      setResult(data);
      setLastAiCall(Date.now());
      await saveCheckIn(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveCheckIn = async (data: any) => {
    if (!patient) return;
    
    const dateKey = getMalaysiaDateKey();
    const docId = `${patient.id}_${dateKey}`;
    const now = getMalaysiaISOString();

    // Save to Firestore - Use setDoc with a predictable ID to ensure only one record per day
    await setDoc(doc(db, 'moods', docId), {
      patientID: patient.id,
      date: now,
      mood: mood,
      remark: vitals,
      assessment: data.assessment || '',
      riskLevel: data.risk_level || 'Low'
    }).catch(err => handleFirestoreError(err, OperationType.WRITE, `moods/${docId}`));

    console.log("Check-In: Data(Mood) is successfully saved into Firebase")

    // Update patient profile
    const patientRef = doc(db, 'users', patient.id);
    await updateDoc(patientRef, {
      lastCheckIn: now,
      deadlineMissed: false
    }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${patient.id}`));

    console.log("Check-In: Data(lastCheckIn, deadlineMissed) is successfully saved to Firebase.")
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="bg-white-600 text-black text-3xl px-5 py-4 rounded-xl font-bold shadow-md">👴👵 Elderly Check-In</h1>
      
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
          disabled={loading || !mood || !vitals || cooldownRemaining > 0}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
        >
          {loading ? "Processing..." : cooldownRemaining > 0 ? `Wait ${Math.ceil(cooldownRemaining / 1000)}s` : "Submit Check-In"}
        </button>
      </div>

      {result && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className={cn(
            "p-8 rounded-3xl border shadow-xl space-y-4",
            result.isQuotaExceeded ? "bg-amber-50 border-amber-200" : 
            result.risk_detected ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"
          )}
        >
          {result.isQuotaExceeded && (
            <div className="bg-amber-100 text-amber-800 p-3 rounded-xl flex items-center gap-2 text-sm font-medium">
              <AlertTriangle size={18} />
              AI Quota Reached: Showing simplified assessment.
            </div>
          )}
          {result.isLocal && (
            <div className="bg-blue-100 text-blue-800 p-2 rounded-lg text-[10px] font-bold uppercase tracking-widest inline-block">
              Local Verification
            </div>
          )}
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

      {/* Mood History List */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <History size={24} className="text-blue-600" />
          Mood Check-In History
        </h2>
        <div className="space-y-3">
          {moodHistory.length === 0 ? (
            <div className="bg-white p-8 rounded-3xl border border-slate-100 text-center text-slate-400 italic">
              No check-in history yet.
            </div>
          ) : (
            moodHistory.map((h, i) => (
              <div key={h.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{h.mood.split(' ')[0]}</span>
                    <div>
                      <p className="font-bold text-slate-800">{h.mood.split(' ').slice(1).join(' ')}</p>
                      <p className="text-xs text-slate-400">{new Date(h.date).toLocaleString('en-MY')}</p>
                    </div>
                  </div>
                  <RiskBadge level={h.riskLevel || 'Low'} />
                </div>
                {h.remark && (
                  <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl italic">
                    "{h.remark}"
                  </div>
                )}
                {h.assessment && (
                  <div className="text-xs text-slate-500 border-t border-slate-50 pt-2">
                    <span className="font-bold text-blue-600 uppercase tracking-tighter mr-2">AI Assessment:</span>
                    {h.assessment}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function EmergencyTab({patient, onProfile}:{patient:Patient | null, onProfile: () => void}) {
  const [emergencyData, setEmergencyData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const emergencyContact = patient.emergencyContact;

  const emergencies = [
    { title: "Seizure", advice: "1. Cushion head. 2. Loosen tight clothing. 3. Turn on side. 4. Do NOT put anything in mouth. 5. Time the seizure." },
    { title: "Asthma Attack", advice: "1. Sit upright. 2. Take slow, steady breaths. 3. Use inhaler (blue). 4. Seek help if no improvement." },
    { title: "Allergic Reaction", advice: "1. Use EpiPen if available. 2. Call emergency services. 3. Lay flat with legs raised. 4. Monitor breathing." },
    { title: "Heart Attack", advice: "1. Call 911 immediately. 2. Chew aspirin if not allergic. 3. Sit and stay calm. 4. Loosen clothing." }
  ];

  const triggerEmergency = async (situation: string) => {
    setLoading(true);
    setEmergencyData(null);

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;

      try {
        let severity = "High";
        const s = situation.toLowerCase();
        if (s.includes("allergic")) severity = "Medium";
        else if (s.includes("asthma") || s.includes("seizure") || s.includes("heart")) severity = "Critical";

        // OpenStreetMap Overpass API — find hospitals and clinics within 10km
        const overpassQuery = `
          [out:json][timeout:15];
          (
            node["amenity"="hospital"](around:10000,${lat},${lng});
            way["amenity"="hospital"](around:10000,${lat},${lng});
            node["amenity"="clinic"](around:10000,${lat},${lng});
            way["amenity"="clinic"](around:10000,${lat},${lng});
          );
          out center;
        `;

        const response = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          body: overpassQuery,
        });

        const osmData = await response.json();

        const facilities = osmData.elements
          .map((el: any) => {
            const elLat = el.lat ?? el.center?.lat;
            const elLng = el.lon ?? el.center?.lon;
            if (!elLat || !elLng) return null;
            const distance = getDistance(lat, lng, elLat, elLng);
            const name = el.tags?.name;
            if (!name) return null;
            return {
              name,
              type: el.tags?.amenity === "hospital" ? "Hospital" : "Clinic",
              distance,
              distanceStr: distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`,
              phone: el.tags?.phone || el.tags?.["contact:phone"] || null,
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => a.distance - b.distance)
          .slice(0, 5);

        setEmergencyData({
          severity,
          facilities,
          instructions: severity === "Critical"
            ? "Call an ambulance immediately. Stay calm, do not move the patient unless necessary."
            : "Please make your way to the nearest facility listed below for treatment.",
        });
      } catch (err) {
        console.error("OSM fetch error:", err);
        setEmergencyData({ severity: "Unknown", facilities: [], instructions: "Could not fetch nearby facilities. Please call emergency services directly." });
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
      <div className="flex items-center justify-between gap-4 bg-red-50 border border-red-200 p-4 rounded-2xl shadow-sm">

    <h1 className="text-2xl md:text-3xl font-bold text-red-600 tracking-tight">
      🚨 Emergency Assistance
    </h1>

    {emergencyContact ? (
      <a
        href={`tel:${emergencyContact}`}
        className="bg-red-600 text-white px-5 py-3 rounded-xl font-bold text-sm md:text-base shadow-md hover:bg-red-700 active:scale-95 transition flex items-center gap-2"
      >
        📞 Call Emergency Contact
      </a>
    ) : (
      <button
        onClick={onProfile}
        className="bg-yellow-100 text-yellow-800 border border-yellow-300 px-5 py-3 rounded-xl font-bold text-sm md:text-base shadow-sm hover:bg-yellow-200 active:scale-95 transition flex items-center gap-2"
      >
        ⚠️ Set Emergency Contact
      </button>
    )}
  </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {emergencies.map(e => (
          <div key={e.title} className="bg-white p-6 rounded-3xl border border-red-100 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-red-600">{e.title}</h2>
            <p className="text-sm text-slate-600 whitespace-pre-line">{e.advice}</p>
            <button 
              onClick={() => triggerEmergency(e.title)}
              disabled={loading}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {loading ? "Finding nearby facilities..." : `Request Help for ${e.title}`}
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
              <p className="text-red-100">Showing nearest hospitals & clinics</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold border-b border-red-500 pb-2">Nearest Medical Facilities</h3>
            {emergencyData.facilities.length === 0 ? (
              <p className="text-red-100 text-sm italic">No facilities found nearby. Please call emergency services directly.</p>
            ) : (
              emergencyData.facilities.map((h: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-white/10 p-4 rounded-2xl">
                  <div>
                    <p className="font-bold">{h.name}</p>
                    <p className="text-xs text-red-100">{h.distanceStr} away • {h.type}</p>
                    {h.phone && <p className="text-xs text-red-200 mt-0.5">{h.phone}</p>}
                  </div>
                  {h.phone ? (
                    <a
                      href={`tel:${h.phone}`}
                      className="bg-white text-red-600 px-4 py-2 rounded-xl font-bold text-sm shrink-0"
                    >
                      Call
                    </a>
                  ) : (
                    <span className="bg-white/30 text-white/60 px-4 py-2 rounded-xl font-bold text-sm shrink-0 cursor-not-allowed">
                      No number
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
          <p className="text-sm bg-red-700/50 p-4 rounded-xl italic">{emergencyData.instructions}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

function ProfileTab({ patient, onUpdate }: { patient: Patient | null, onUpdate: (updates: Partial<Patient>) => void }) {
  if (!patient) return null;

  const [aiStatus, setAiStatus] = useState<'online' | 'offline' | 'checking' | null>(null);

  const checkAiStatus = async () => {
    setAiStatus('checking');
    try {
      // Simple lightweight call to check if quota is available
      await analyzeSymptoms("status check", "This is a system health check. Please respond with a valid JSON.");
      setAiStatus('online');
    } catch (err: any) {
      if (err.message?.includes("429") || err.message?.toLowerCase().includes("quota")) {
        setAiStatus('offline');
      } else {
        setAiStatus('offline');
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="bg-white-600 text-black text-3xl px-5 py-4 rounded-xl font-bold shadow-md">⚙️ Setting & Profile</h1>
      
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
          <h3 className="font-bold mb-4">System Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
              <div>
                <p className="font-bold">AI Diagnostic Engine</p>
                <p className="text-xs text-slate-400">Check if the AI analysis service is available</p>
              </div>
              <div className="flex items-center gap-3">
                {aiStatus === 'online' && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">ONLINE</span>}
                {aiStatus === 'offline' && <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">QUOTA FULL</span>}
                <button 
                  onClick={checkAiStatus}
                  disabled={aiStatus === 'checking'}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                  {aiStatus === 'checking' ? 'Checking...' : 'Test Connection'}
                </button>
              </div>
            </div>
          </div>
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