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
  LogIn,
  MessageSquare,
  Truck,
  Search,
  Phone,
  MessageCircle,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Forum Import
import ForumTab from './TabForum';

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
  getDocFromServer,
  Firestore
} from 'firebase/firestore';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth } from './firebase';
import { analyzeSymptoms, checkInElderly, analyzeWound, predictEmergency } from './services/aiService';
import { COMMON_CAUSES } from './DATA_SYMPTOM/COMMON_CAUSES';
import { WOUND_EXPLANATION } from './DATA_WOUND/WOUND_EXPLANATION';
import { WOUND_TODO } from './DATA_WOUND/WOUND_TODO';
import { WOUND_EXAMPLES } from './DATA_WOUND/WOUND_EXAMPLES';

const AI_COOLDOWN_MS = 45000; // 45 seconds cooldown for AI calls

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { getMalaysiaTime, getMalaysiaISOString, getMalaysiaDateKey, getDeadlineDate } from './utility/time-related';

import { isUnsafeInput } from './utility/search_banned_words'


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
type Tab = 'emergency' | 'dashboard' | 'symptoms' | 'wound' | 'elderly' | 'forum' | 'profile';

type AnalysisMode = 'ai' | 'python' | 'both';

// To deploy it on Google Cloud, don't use local host
// const PYTHON_API = 'http://localhost:5001/api/python';
const PYTHON_API = 'https://google-care-73225723112.asia-southeast1.run.app/api/python';

interface ImageSlot {
  file: File | null;
  preview: string | null;
}

interface WoundResult {
  aiResult?: any;
  pythonResult?: {
    type: string;
    confidence: number;
    allScores: Record<string, number>;
  } | null;
  slotIndex: number;
}

interface Patient {
  id: string;
  name: string;
  age: number;
  address: string;
  contact: string;
  phone?: string;
  bloodType: string;
  conditions: string;
  allergy: string;
  emergencyContact: string;
  checkInDeadline: string;
  lastCheckIn: string | null;
  deadlineMissed: boolean;
  forceCheckIn: boolean;
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
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("testConnection(): Please check your Firebase configuration. ");
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
          conditions: data.patientCondition || '',
          allergy: data.patientAllergy || '',
          bloodType: data.patientBloodType,
          checkInDeadline: data.checkInDeadline || '09:00',
          lastCheckIn: data.lastCheckIn || null,
          deadlineMissed: data.deadlineMissed ?? false,
          forceCheckIn: data.forceCheckIn ?? false
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
          patientCondition: '',
          patientAllergy: '',
          patientBloodType: '',
          checkInDeadline: '09:00',
          lastCheckIn: getMalaysiaISOString(),
          deadlineMissed: false,
          forceCheckIn: false
        };
        setPatient({
          id: user.uid,
          name: initialPatient.patientName,
          age: initialPatient.patientAge,
          contact: initialPatient.patientContactNo,
          address: initialPatient.patientAddress,
          emergencyContact: initialPatient.patientEmergencyContact,
          conditions: initialPatient.patientCondition,
          allergy: initialPatient.patientAllergy,
          bloodType: initialPatient.patientBloodType,
          checkInDeadline: initialPatient.checkInDeadline,
          lastCheckIn: initialPatient.lastCheckIn ?? '',
          deadlineMissed: initialPatient.deadlineMissed,
          forceCheckIn: initialPatient.forceCheckIn
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
      console.error("login: Login failed", err);
    }
  };

  const loginAnonymously = async () => {
    try {
      await signInAnonymously(auth);
      setShowGuestModal(false);
    } catch (err) {
      console.error("login: Anonymous login failed", err);
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
    if (updates.conditions !== undefined) firestoreUpdates.patientCondition = updates.conditions;
    if (updates.allergy !== undefined) firestoreUpdates.patientAllergy = updates.allergy;
    if (updates.bloodType !== undefined) firestoreUpdates.patientBloodType = updates.bloodType;
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

  var showCheckInAlert = true;

  if (!patient) {
    showCheckInAlert = false;
  } else if (!patient.lastCheckIn) {
    showCheckInAlert = true;
  } else {
    const last = new Date(patient.lastCheckIn);
    const deadline = getDeadlineDate(patient.checkInDeadline);

    showCheckInAlert = last <= deadline;
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

        {showCheckInAlert && (
          <div className="hidden md:flex items-center gap-3 mb-4 px-3 py-3 bg-red-50 border border-red-200 rounded-2xl animate-pulse">
            <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-red-500" />
            </div>
            <div>
              <p className="text-red-600 font-bold text-xs">Check-In Overdue</p>
              <p className="text-red-400 text-[10px]">Please check in immediately</p>
            </div>
          </div>
        )}

        <hr></hr>
        <NavItem icon={<AlertCircle size={20} />} label="Emergency" active={activeTab === 'emergency'} onClick={() => setActiveTab('emergency')} />
        <hr></hr>
        <NavItem icon={<Activity size={20} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavItem icon={<Stethoscope size={20} />} label="Symptoms" active={activeTab === 'symptoms'} onClick={() => setActiveTab('symptoms')} />
        <NavItem icon={<Camera size={20} />} label="Wound" active={activeTab === 'wound'} onClick={() => setActiveTab('wound')} />
        <NavItem icon={<User size={20} />} label="Elderly" active={activeTab === 'elderly'} onClick={() => setActiveTab('elderly')} />
        <NavItem icon={<MessageSquare size={20} />} label="Forum" active={activeTab === 'forum'} onClick={() => setActiveTab('forum')} />
        <NavItem icon={<User size={20} />} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
        <hr></hr>

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
          {activeTab === 'wound' && <WoundAnalyzer key="wound" patientId={patient?.id} wound={WOUND_EXAMPLES[0]} onClose={() => setActiveTab('wound')} />}
          {activeTab === 'elderly' && <ElderlyCheckIn key="elderly" patient={patient} onUpdateDeadline={(time) => updateProfile({ checkInDeadline: time })} />}
          {activeTab === 'forum' && <ForumTab key="forum" userName={patient?.name || 'Patient'} />}
          {activeTab === 'emergency' && <EmergencyTab key="emergency" patient={patient} onProfile={() => setActiveTab('profile')} onUpdate={updateProfile} />}
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
    // Proactively request location to trigger browser popup when entering dashboard
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => console.log("Location access granted"),
        (err) => console.warn("Location access denied or failed:", err),
        { timeout: 5000 }
      );
    }
  }, []);

  useEffect(() => {
    if (!patient?.id) return;

    const q = query(
      collection(db, 'symptoms'),
      where('patientID', '==', patient.id),
      orderBy('date', 'desc'),
      // limit(5)
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

  const highRiskAlerts = symptomHistory.filter(h => (h.risk === 'High') || (h.risk === 'Medium'));

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
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
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
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {highRiskAlerts.length > 0 ? (
              highRiskAlerts.map((a, i) => (
                <div key={i} className={`p-3 rounded-2xl text-sm border ${a.risk === 'High'
                  ? 'bg-red-100 border-red-100 text-red-800'
                  : 'bg-orange-100 border-orange-100 text-orange-800'
                  }`}>
                  <p className="font-bold">{a.condition}</p>
                  <p className={`text-xs mt-1 ${a.risk === 'High' ? 'text-red-600' : 'text-orange-600'}`}>
                    {a.date}
                  </p>
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

  // Create delay
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleAnalyze = async (manualText?: string) => {
    if (loading) return;
    const symptomsText = (typeof manualText === 'string' ? manualText : '') || input || selectedSymptoms.join(', ');
    if (!symptomsText) return;

    // Check cooldown
    const now = Date.now();
    if (now - lastAiCall < AI_COOLDOWN_MS) {
      setCooldownRemaining(AI_COOLDOWN_MS - (now - lastAiCall));
      return;
    }

    setLoading(true);
    setResult(null);
    setConversationContext('');
    setFollowUpAnswer('');
    setLocalAdvice(null);

    // Minimize AI usage: Check local knowledge base first
    const lowerInput = symptomsText.toLowerCase();
    const foundCause = Object.keys(COMMON_CAUSES).find(cause => lowerInput.includes(cause));
    if (foundCause && !symptomsText.includes("analyze deeply")) {
      await sleep(2000);
      setLocalAdvice(COMMON_CAUSES[foundCause]);
      setLoading(false);
      return;
    }

    setLastAiCall(Date.now());

    try {
      if (isUnsafeInput(symptomsText)) {
        const data = {
          topCondition: "Unable to assess safely",
          possibleConditions: [],
          advice: "I can't safely assist with that request. Please consult a medical professional.",
          med: "",
          risk_level: "Medium",
          followUpQuestion: "Can you describe your symptoms in a safe and general way?"
        };
        setResult(data);
      } else {
        const data = await analyzeSymptoms(symptomsText, '');
        setResult(data);
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

        // Disable voice 
        // if (!data.isQuotaExceeded) {
        //   speak(data.advice);
        // }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    console.log("SymptomAnalyzer: Data is successfully saved to Firebase.")
  };

  const handleFollowUp = async () => {
    if (followUpLoading || !followUpAnswer.trim()) return;

    // Check cooldown
    const now = Date.now();
    if (now - lastAiCall < AI_COOLDOWN_MS) {
      setCooldownRemaining(AI_COOLDOWN_MS - (now - lastAiCall));
      return;
    }

    setFollowUpLoading(true);
    setLastAiCall(Date.now());
    try {
      const updatedContext = `${conversationContext}\nFollow-up answer: ${followUpAnswer}`;
      const data = await analyzeSymptoms(followUpAnswer, updatedContext);
      setResult(data);
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

  const disableButton = false;

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
          onClick={() => handleAnalyze()}
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
            <br></br>
            <button
              onClick={() => {
                const deepText = input + " (analyze deeply)";
                setInput(deepText);
                handleAnalyze(deepText);
              }}
              className="text-xs font-bold text-blue-600 underline mt-2"
            >
              Still concerned? Run full AI analysis
            </button>
            <p className="text-xs text-blue-700">
              👆 Give more details for better results (e.g. where it hurts and how long it has lasted)
            </p>

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
                  <span className="text-slate-400">{c.confidence * 100}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-2 rounded-full", i === 0 ? "bg-blue-500" : "bg-slate-300")}
                    style={{ width: `${c.confidence * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="prose prose-slate max-w-none">
            <h3 className="text-lg font-bold mb-2">What to do?</h3>
            <ReactMarkdown>{result.advice}</ReactMarkdown>
          </div>

          <div className="prose prose-slate max-w-none">
            <h3 className="text-lg font-bold mb-2">Medication</h3>
            <ReactMarkdown>{result.med}</ReactMarkdown>
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

const URGENCY_CONFIG = {
  low: { icon: ShieldCheck, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', label: 'Low Urgency' },
  moderate: { icon: Info, color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', label: 'Moderate Urgency' },
  high: { icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'Seek Care Soon' },
};

function WoundAnalyzer({ patientId, wound, onClose }: { patientId?: string; wound: typeof WOUND_EXAMPLES[0]; onClose: () => void; }) {
  const [customSlot, setCustomSlot] = useState<ImageSlot>({ file: null, preview: null });
  const [mode, setMode] = useState<AnalysisMode>('both');
  const [results, setResults] = useState<WoundResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pythonStatus, setPythonStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [lastAiCall, setLastAiCall] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [activeWound, setActiveWound] = useState<typeof WOUND_EXAMPLES[0] | null>(null);
  const urgency = URGENCY_CONFIG[wound.info.urgencyLevel as keyof typeof URGENCY_CONFIG];
  const UrgencyIcon = urgency.icon;

  const normalizeType = (type?: string) => {
    return type?.toLowerCase().trim() || "unknown";
  };

  // Check Python server status
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${PYTHON_API}/health`);
        setPythonStatus(res.ok ? 'online' : 'offline');
      } catch {
        setPythonStatus('offline');
      }
    };
    check();
  }, []);

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
    if (!file) return;
    setCustomSlot({ file, preview: URL.createObjectURL(file) });
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const urlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const runAnalysis = async (base64: string, mimeType: string, slotIdx: number, currentMode: AnalysisMode) => {
    let pythonResult = null;
    let aiResult = null;

    // Run Python model
    if (currentMode === 'python' || currentMode === 'both') {
      try {
        const res = await fetch(`${PYTHON_API}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: [base64] })
        });
        const data = await res.json();
        pythonResult = data.results?.[0] || null;
      } catch (err) {
        console.error('Python analysis failed:', err);
      }
    }

    // Run AI model
    if (currentMode === 'ai' || currentMode === 'both') {
      try {
        aiResult = await analyzeWound(base64, mimeType);
      } catch (err) {
        console.error('AI analysis failed:', err);
      }
    }

    const result: WoundResult = {
      slotIndex: slotIdx,
      aiResult,
      pythonResult
    };

    setResults(prev => {
      const filtered = prev.filter(r => r.slotIndex !== slotIdx);
      return [...filtered, result];
    });

    if (aiResult?.type == 'Unable to Classify') {
      return
    }

    // console.log(patientId, slotIdx, aiResult?.type, pythonResult?.type, aiResult?.analysis, aiResult?.recommendations)

    // Save to Firestore
    if (patientId && (aiResult || pythonResult)) {
      addDoc(collection(db, 'wounds'), {
        patientID: patientId,
        imageIndex: slotIdx,
        type: aiResult?.type || pythonResult?.type || 'Unknown',
        pythonType: pythonResult?.type || null,
        pythonConfidence: pythonResult?.confidence || null,
        analysis: aiResult?.analysis || '',
        recommendations: aiResult?.recommendations || '',
        date: new Date().toISOString(),
        isExample: slotIdx < 100 // Example indices are 0, 1, 2. Custom is 100.
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'wounds'));
    }
  };

  const handleAnalyzeCustom = async () => {
    if (loading || !customSlot.file) return;

    const now = Date.now();
    if (mode !== 'python' && now - lastAiCall < AI_COOLDOWN_MS) {
      setCooldownRemaining(AI_COOLDOWN_MS - (now - lastAiCall));
      return;
    }

    setLoading(true);
    if (mode !== 'python') setLastAiCall(now);

    try {
      const base64 = await fileToBase64(customSlot.file);
      await runAnalysis(base64, customSlot.file.type, 100, mode); // 100 is index for custom
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 pb-12">
        <h1 className="bg-white-600 text-black text-3xl px-5 py-4 rounded-xl font-bold shadow-md">🩸 Wound Analysis</h1>

        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
              <Info size={18} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Wound Reference Guide</h2>
          </div>
          <p className="text-slate-500 text-sm">
            Tap any wound type to learn about its characteristics and care instructions.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {WOUND_EXAMPLES.map((wound, i) => (
              <button
                key={i}
                onClick={() => setActiveWound(wound)}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col text-left hover:shadow-md hover:border-blue-200 transition-all group"
              >
                <div className="relative overflow-hidden">
                  <img
                    src={wound.url}
                    alt={wound.title}
                    className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <span className={cn('absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full', wound.badgeColor)}>
                    {wound.badge}
                  </span>
                </div>
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <h3 className="font-bold text-slate-800 text-sm leading-tight">{wound.title}</h3>
                  <p className="text-[11px] text-slate-400 flex-1">{wound.description}</p>
                  <span className="text-[11px] font-bold text-blue-500 group-hover:text-blue-700 transition-colors mt-1">
                    View info →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>


        <hr className="border-slate-200" />

        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
              <Upload size={18} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Custom Analysis</h2>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            {/* Analysis Mode Selector */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3">Analysis Mode</label>
              <div className="flex gap-3">
                {(['ai', 'python', 'both'] as AnalysisMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex-1 py-3 rounded-2xl font-bold text-sm transition-all border",
                      mode === m
                        ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {m === 'ai' && '🤖 AI Only'}
                    {m === 'python' && '🐍 Python Model'}
                    {m === 'both' && '⚡ Both'}
                  </button>
                ))}
              </div>

              {/* Python server status */}
              {(mode === 'python' || mode === 'both') && (
                <div className={cn(
                  "mt-3 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-2",
                  pythonStatus === 'online' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                )}>
                  <div className={cn("w-2 h-2 rounded-full", pythonStatus === 'online' ? "bg-green-500" : "bg-red-500")} />
                  {pythonStatus === 'online' ? 'Online - Server running...' : 'Pending - Server loading, please wait for a while.. '}
                </div>
              )}
            </div>

            {/* Single Upload Slot */}
            <div
              className="border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 hover:border-blue-400 transition-colors cursor-pointer relative overflow-hidden"
              onClick={() => document.getElementById('wound-upload-custom')?.click()}
            >
              {customSlot.preview ? (
                <img src={customSlot.preview} alt="Custom wound" className="w-full h-64 object-cover rounded-2xl" />
              ) : (
                <>
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                    <Upload size={32} />
                  </div>
                  <div className="text-center">
                    <p className="font-bold">Click to Upload Your Photo</p>
                    <p className="text-sm text-slate-400">Take a clear picture of the wound</p>
                  </div>
                </>
              )}
              <input id="wound-upload-custom" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </div>

            <button
              onClick={handleAnalyzeCustom}
              disabled={loading || !customSlot.file || cooldownRemaining > 0 || (mode !== 'ai' && pythonStatus === 'offline')}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100"
            >
              {loading ? "Analyzing..." : cooldownRemaining > 0 ? `Wait ${Math.ceil(cooldownRemaining / 1000)}s` : "Analyze My Wound"}
            </button>
          </div>
        </section>

        {/* Results Display */}
        {results.length > 0 && (
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <CheckCircle2 size={24} className="text-green-500" />
              Analysis Results
            </h2>
            <div className="grid grid-cols-1 gap-6">
              {results.sort((a, b) => b.slotIndex - a.slotIndex).map((r) => (
                <motion.div
                  key={r.slotIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl space-y-6"
                >

                  <div className={cn(
                    "grid gap-6",
                    r.aiResult && r.pythonResult ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                  )}>

                    {/* Python Result */}
                    {r.pythonResult && (() => {
                      // 🔥 Normalize type safely
                      const woundType = r.pythonResult.type?.toLowerCase().trim();

                      // 🔗 Lookup mapping
                      const explanation = WOUND_EXPLANATION[woundType] || "No description available.";
                      const todo = WOUND_TODO[woundType] || "No care instructions available.";

                      return (
                        <div className="p-5 bg-purple-50 border border-purple-100 rounded-2xl space-y-4">

                          {/* Header */}
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-purple-500 uppercase tracking-wider">
                              🐍 Python Model
                            </p>
                            <RiskBadge
                              level={
                                r.pythonResult.confidence > 0.7
                                  ? 'High'
                                  : r.pythonResult.confidence > 0.4
                                    ? 'Medium'
                                    : 'Low'
                              }
                            />
                          </div>

                          {/* Main Result */}
                          <div>
                            <p className="text-2xl font-bold text-purple-900">
                              {r.pythonResult.type.toUpperCase()}
                            </p>
                            <p className="text-sm text-purple-700 font-medium">
                              Confidence: {(r.pythonResult.confidence).toFixed(1)}%
                            </p>
                          </div>

                          {/* Score Bars */}
                          <div className="space-y-2">
                            {Object.entries(r.pythonResult.allScores).map(([label, score]) => (
                              <div key={label} className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold">
                                  <span className="text-purple-700 uppercase">{label}</span>
                                  <span className="text-purple-500">{(score).toFixed(0)}%</span>
                                </div>
                                <div className="h-2 bg-purple-100 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${score}%` }}
                                    className="h-full bg-purple-500 rounded-full"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* 🔥 Explanation + Action */}
                          <div className="space-y-3">

                            {/* Explanation */}
                            <div className="p-3 bg-white rounded-xl border border-purple-100">
                              <p className="text-xs font-bold text-purple-600 uppercase">
                                Explanation
                              </p>
                              <p className="text-sm text-purple-900">
                                {explanation}
                              </p>
                            </div>

                            {/* What To Do */}
                            <div className="p-3 bg-white rounded-xl border border-purple-100">
                              <p className="text-xs font-bold text-purple-600 uppercase">
                                What To Do
                              </p>
                              <p className="text-sm text-purple-900">
                                {todo}
                              </p>
                            </div>

                          </div>
                        </div>
                      );
                    })()}

                    {/* AI Result */}
                    {r.aiResult && (
                      <div className="p-5 bg-blue-50 border border-blue-100 rounded-2xl space-y-4">

                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">
                            🤖 AI Analysis
                          </p>
                          <RiskBadge level="Medium" />
                        </div>

                        {/* Wound type */}
                        <div>
                          <p className="text-2xl font-bold text-blue-900">{r.aiResult.type}</p>
                          <p className="text-sm text-blue-800 leading-relaxed mt-1">
                            {r.aiResult.analysis}
                          </p>
                        </div>

                        {/* Care recommendations */}
                        <div className="p-4 bg-white/60 rounded-xl border border-blue-100">
                          <p className="text-xs font-bold text-blue-700 mb-2 uppercase tracking-wider">
                            Care Recommendations
                          </p>
                          <p className="text-sm text-blue-900 italic">
                            "{r.aiResult.recommendations}"
                          </p>
                        </div>

                        {/* Meta — only render if meta exists */}
                        {r.aiResult.meta && (
                          <div className="space-y-2 pt-1 border-t border-blue-100">

                            <div className="flex items-start gap-2 text-xs text-blue-700">
                              <span className="shrink-0">📍</span>
                              <div>
                                <span className="font-bold uppercase tracking-wider">Objects detected</span>
                                <p className="text-blue-600 mt-0.5">{r.aiResult.meta.objects}</p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2 text-xs text-blue-700">
                              <span className="shrink-0">🎨</span>
                              <div>
                                <span className="font-bold uppercase tracking-wider">Dominant colours</span>
                                <div className="flex gap-2 mt-1 flex-wrap">
                                  {r.aiResult.meta.dominantColors.split(', ').map((c: string, i: number) => {
                                    const rgb = c.match(/rgb\([\d,]+\)/)?.[0];
                                    const pct = c.match(/[\d.]+%/)?.[0];
                                    return (
                                      <div key={i} className="flex items-center gap-1">
                                        {rgb && (
                                          <div
                                            className="w-4 h-4 rounded-full border border-blue-100 shrink-0"
                                            style={{ background: rgb }}
                                          />
                                        )}
                                        <span className="text-blue-500">{pct}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-start gap-2 text-xs text-blue-700">
                              <span className="shrink-0">🏥</span>
                              <div>
                                <span className="font-bold uppercase tracking-wider">Medical likelihood</span>
                                <p className={cn(
                                  "mt-0.5 font-bold",
                                  r.aiResult.meta.medicalLikelihood === 'VERY_LIKELY' && "text-green-600",
                                  r.aiResult.meta.medicalLikelihood === 'LIKELY' && "text-green-500",
                                  r.aiResult.meta.medicalLikelihood === 'POSSIBLE' && "text-yellow-600",
                                  r.aiResult.meta.medicalLikelihood === 'UNLIKELY' && "text-red-500",
                                  r.aiResult.meta.medicalLikelihood === 'VERY_UNLIKELY' && "text-red-600",
                                )}>
                                  {r.aiResult.meta.medicalLikelihood}
                                </p>
                              </div>
                            </div>

                          </div>
                        )}

                      </div>
                    )}

                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {activeWound && (() => {
          const urgency = URGENCY_CONFIG[activeWound.info.urgencyLevel as keyof typeof URGENCY_CONFIG];
          const UrgencyIcon = urgency.icon;

          return (
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setActiveWound(null)}  // ✅ clears state, doesn't close parent
            >
              <motion.div
                key="panel"
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="relative">
                  <img
                    src={activeWound.url}        // ✅ activeWound, not wound
                    alt={activeWound.title}
                    className="w-full h-48 object-cover rounded-t-3xl"
                  />
                  <button
                    onClick={() => setActiveWound(null)}  // ✅ clears state
                    className="absolute top-3 right-3 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-colors"
                  >
                    <X size={16} className="text-slate-600" />
                  </button>
                  <span className={cn('absolute bottom-3 left-3 text-xs font-bold px-3 py-1 rounded-full', activeWound.badgeColor)}>
                    {activeWound.badge}
                  </span>
                </div>

                <div className="p-6 space-y-5">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">{activeWound.title}</h2>
                    <p className="text-sm text-slate-400 mt-0.5">{activeWound.description}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">About this wound</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{activeWound.info.what}</p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">What to do</p>
                    <ul className="space-y-2">
                      {activeWound.info.todo.map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm text-slate-700">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={cn('flex gap-3 p-4 rounded-2xl border text-sm', urgency.bg, urgency.border)}>
                    <UrgencyIcon size={18} className={cn('flex-shrink-0 mt-0.5', urgency.color)} />
                    <div>
                      <p className={cn('font-bold text-xs uppercase tracking-wider mb-1', urgency.color)}>{urgency.label}</p>
                      <p className={cn('text-sm', urgency.color)}>{activeWound.info.urgency}</p>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    This information is for general guidance only and does not replace professional medical advice.
                    Always consult a qualified healthcare provider for diagnosis and treatment.
                  </p>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
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
    if (loading || !patient) return;

    // Minimize AI usage: Simple check for normal status
    if (mood === '😊 Happy' || !vitals || vitals.toLowerCase().includes('normal')) {
      setLoading(true);
      const localResult = {
        risk_detected: false,
        assessment: "You're doing great! Keep up the positive mood and healthy habits.",
        risk_level: "Low",
        isLocal: true
      };
      setResult(localResult);
      await saveCheckIn(localResult);
      setLoading(false);
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
      setLastAiCall(Date.now());
      const data = await checkInElderly(mood, vitals);
      setResult(data);
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

    console.log("Check-In: Data(Mood) is successfully saved into Firebase at ", now)

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
        {/* <h2 className="text-xl font-bold flex items-center gap-2">Daily Check-In</h2> */}
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
          disabled={loading || !mood || cooldownRemaining > 0}
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
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
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

function EmergencyTab({ patient, onProfile, onUpdate }: { patient: Patient | null, onProfile: () => void, onUpdate: (updates: Partial<Patient>) => void }) {
  const [emergencyData, setEmergencyData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm999, setShowConfirm999] = useState(false);
  const [showAmbulanceNotif, setShowAmbulanceNotif] = useState(false);
  const [showFacilitiesPanel, setShowFacilitiesPanel] = useState(false);
  const [showPatientInfo, setShowPatientInfo] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedEmergency, setSelectedEmergency] = useState<any>(null);
  const [bloodType, setBloodType] = useState(patient?.bloodType || "");
  const [conditions, setConditions] = useState(patient?.conditions || "");
  const [phone, setPhone] = useState(patient?.phone || "");
  const [showCallNotif, setShowCallNotif] = useState(false);
  const [showSmsNotif, setShowSmsNotif] = useState(false);
  const [symptomHistory, setSymptomHistory] = useState<any[]>([]);
  const [predictCondition, setPredictCondition] = useState<any>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const analysisInProgress = useRef(false);

  useEffect(() => {
    if (!patient?.id) return;

    const q = query(
      collection(db, 'symptoms'),
      where('patientID', '==', patient.id),
      orderBy('date', 'desc'),
      // limit(5)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setSymptomHistory(snap.docs.map(d => ({
        condition: d.data().topCondition || d.data().Symptom,
        date: new Date(d.data().date).toLocaleDateString()
      })));
    }, (err) => console.error('Symptom history error:', err));
    return () => unsubscribe();
  }, [patient?.id]);

  useEffect(() => {
    const runAnalysis = async () => {
      // Check the lock and check if we have data
      if (symptomHistory.length > 0 && !analysisInProgress.current) {

        analysisInProgress.current = true;

        let symptomList = null;
        symptomList = JSON.stringify(symptomHistory)

        try {
          const result = await predictEmergency(symptomHistory);
          console.log("Predicted Emergency Conditions: " + result);
          setPredictCondition(result);
        } catch (err) {
          console.error("AI Analysis failed", err);
          analysisInProgress.current = false; // Unlock on error to allow retry
        }
      }
    };
    runAnalysis();
  }, [symptomHistory]);

  // For blood type (semilar to Profile)
  useEffect(() => {
    if (patient) {
      setBloodType(patient.bloodType || "");
    }
  }, [patient?.id, patient?.bloodType]);

  const updateBloodType = async (newBloodType: string) => {
    if (!patient) return;

    const patientData = doc(db, 'users', patient.id);

    await updateDoc(patientData, {
      bloodType: newBloodType
    }).catch(err =>
      handleFirestoreError(err, OperationType.UPDATE, `users/${patient.id}`)
    );
  };

  // Cache for nearby facilities
  const cacheRef = useRef<{
    lat: number;
    lng: number;
    timestamp: number;
    data: any;
  } | null>(null);

  // Get emergency contact of user
  const emergencyContact = patient?.emergencyContact;

  // Common emergencies
  const emergencies = [
    {
      title: "Heart Attack",
      advice: "1. Call 999 immediately. \n2. Chew aspirin if not allergic. \n3. Sit and stay calm. \n4. Loosen clothing.\n5. Apply CPR if losing pulse",
      video: "/videos/heart_attack.mp4"
    },
    {
      title: "Seizure",
      advice: "1. Cushion head. \n2. Loosen tight clothing. \n3. Turn on side. \n4. Do NOT put anything in mouth. \n5. Time the seizure.",
      video: "/videos/seizure.mp4"
    },
    {
      title: "Asthma Attack",
      advice: "1. Sit upright. \n2. Take slow, steady breaths. \n3. Use inhaler (blue). \n4. Seek help if no improvement.",
      video: "/videos/asthma.mp4"
    },
    {
      title: "Allergy",
      advice: "1. Use EpiPen if available. \n2. Call emergency services. \n3. Lay flat with legs raised. \n4. Monitor breathing.",
      video: "/videos/allergy.mp4"
    },
  ];

  // Background search for facilities
  useEffect(() => {
    searchNearbyFacilities(false);
  }, []);

  const searchNearbyFacilities = async (isManual = true) => {
    setLoading(true);
    setLocationError(null);
    let lat: number, lng: number;

    try {
      const pos = await getGeolocation();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch (err: any) {
      console.warn("Geolocation failed:", err);
      if (isManual) {
        let msg = "Location access failed.";
        if (err.code === 1) msg = "Location access denied. Please enable GPS/Location permissions in your browser settings.";
        else if (err.code === 2) msg = "Location unavailable. Please check your signal.";
        else if (err.code === 3) msg = "Location request timed out.";

        setLocationError(msg);
        setLoading(false);
        return;
      }
      lat = 3.1390; // Fallback KL for initial background load
      lng = 101.6869;
    }

    try {
      const overpassQuery = `
        [out:json][timeout:20];
        (
          node["amenity"="hospital"](around:15000,${lat},${lng});
          way["amenity"="hospital"](around:15000,${lat},${lng});
          node["amenity"="clinic"](around:15000,${lat},${lng});
          way["amenity"="clinic"](around:15000,${lat},${lng});
          node["amenity"="pharmacy"](around:15000,${lat},${lng});
          way["amenity"="pharmacy"](around:15000,${lat},${lng});
        );
        out center;
      `;

      const endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
      ];

      let osmData = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { method: "POST", body: overpassQuery });
          if (response.ok) {
            osmData = await response.json();
            break;
          }
        } catch (e) { continue; }
      }

      if (osmData) {
        const all = osmData.elements.map((el: any) => {
          const elLat = el.lat ?? el.center?.lat;
          const elLng = el.lon ?? el.center?.lon;
          if (!elLat || !elLng) return null;
          const distance = getDistance(lat, lng, elLat, elLng);
          const name = el.tags?.name || "Unnamed Facility";
          const type = el.tags?.amenity;
          // Estimate ETA (assume 35km/h avg city speed)
          const eta = Math.round((distance / 35) * 60) + 2; // +2 mins buffer
          return { name, type, distance, eta, phone: el.tags?.phone || el.tags?.["contact:phone"] };
        }).filter(Boolean);

        const hospitals = all.filter((f: any) => f.type === "hospital").sort((a: any, b: any) => a.distance - b.distance).slice(0, 5);
        const clinics = all.filter((f: any) => f.type === "clinic").sort((a: any, b: any) => a.distance - b.distance).slice(0, 3);
        const pharmacies = all.filter((f: any) => f.type === "pharmacy").sort((a: any, b: any) => a.distance - b.distance).slice(0, 3);

        setEmergencyData({ hospitals, clinics, pharmacies });
      }
    } catch (err) {
      console.error("Facility search error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Get current geolocation with timeout feature
  const getGeolocation = (timeout = 10000): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Geolocation timeout"));
      }, timeout);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve(pos);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
        { enableHighAccuracy: true, timeout }
      );
    });
  };

  // Get current location for SMS purpose
  const getLocation = () => {
    return new Promise<{ lat: number, lng: number }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
        },
        (err) => reject(err)
      );
    });
  };

  const fetchLocation = async () => {
    try {
      const loc = await getLocation();
      console.log(loc);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  // When user clicks 'Request Help for XXX' button
  const triggerEmergency = async (situation: string) => {
    setLoading(true);
    setEmergencyData(null);

    let lat: number, lng: number;

    try {
      const pos = await getGeolocation();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch (err) {
      console.warn("Geolocation failed, using fallback (KL center):", err);
      // Fallback to KL center
      lat = 3.1390;
      lng = 101.6869;
    }

    // Check cache (within 500m and 10 minutes)
    const now = Date.now();
    if (cacheRef.current) {
      const dist = getDistance(lat, lng, cacheRef.current.lat, cacheRef.current.lng);
      if (dist < 0.5 && (now - cacheRef.current.timestamp) < 10 * 60 * 1000) {
        console.log("EmergencyTab: Using cached emergency data");
        setEmergencyData(cacheRef.current.data);
        setLoading(false);
        return;
      }
    }

    try {
      let severity = "High";
      const s = situation.toLowerCase();
      if (s.includes("allergic"))
        severity = "Medium";
      else if (s.includes("asthma") || s.includes("seizure") || s.includes("heart"))
        severity = "Critical";

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

      const endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.osm.ch/api/interpreter"
      ];

      let osmData = null;
      let lastError = null;

      // Try each endpoints
      for (const endpoint of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

          const response = await fetch(endpoint, {
            method: "POST",
            body: overpassQuery,
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const text = await response.text();
          try {
            osmData = JSON.parse(text);
            break; // Success!
          } catch (e) {
            throw new Error("Invalid JSON response from server");
          }
        } catch (err: any) {
          console.warn(`Failed to fetch from ${endpoint}:`, err.message);
          lastError = err;
          continue; // Try next endpoint
        }
      }

      if (!osmData) {
        throw lastError || new Error("All medical facility search endpoints failed");
      }

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

      const newData = {
        severity,
        facilities,
        instructions: severity === "Critical"
          ? "Call an ambulance immediately. Stay calm, do not move the patient unless necessary."
          : "Please make your way to the nearest facility listed below for treatment.",
      };

      setEmergencyData(newData);
      cacheRef.current = { lat, lng, timestamp: now, data: newData };
    } catch (err) {
      console.error("OSM fetch error:", err);
      setEmergencyData({
        severity: "Unknown",
        facilities: [],
        instructions: "The medical facility search service is currently busy. Please call emergency services (999) directly for immediate help."
      });
    } finally {
      setLoading(false);
    }
  };

  let aiResult = null;

  // Call 999
  const handleCall999 = () => {
    setShowConfirm999(false);
    setShowAmbulanceNotif(true);
    // TEMP DISABLE: CALL 999
    // window.location.href = 'tel:999';
    setShowPatientInfo(true);
  };

  // HTML
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 relative">
      {/* Ambulance Notification */}
      <AnimatePresence>
        {showAmbulanceNotif && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-4 right-4 z-[60] bg-green-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 max-w-xs border-2 border-white"
          >
            <div className="bg-white/20 p-2 rounded-full animate-pulse">
              <Truck size={24} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">Ambulance is on their way!</p>
              <p className="text-[10px] opacity-90">Emergency services have been notified.</p>
            </div>
            <button onClick={() => setShowAmbulanceNotif(false)} className="p-1 hover:bg-white/10 rounded-lg">
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-red-50 border border-red-200 p-6 rounded-3xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-red-600 tracking-tight">
            🚨 Emergency Assistance
          </h1>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                setShowFacilitiesPanel(true);
                searchNearbyFacilities(true);
              }}
              className="flex-1 sm:flex-none bg-blue-600 text-white px-4 py-3 rounded-2xl font-bold text-sm shadow-md hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <Search size={18} /> Search Hospital
            </button>
            <button
              onClick={() => setShowConfirm999(true)}
              className="flex-1 sm:flex-none bg-red-600 text-white px-6 py-3 rounded-2xl font-black text-lg shadow-lg hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-2 animate-pulse"
            >
              🆘 CALL 999
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {emergencyContact ? (
            <>
              <a
                href={`tel:${emergencyContact}`}
                onClick={() => {
                  setShowCallNotif(true);
                  setTimeout(() => setShowCallNotif(false), 4000); // auto-dismiss
                }}
                className="bg-white border-2 border-red-600 text-red-600 px-5 py-3 rounded-xl font-bold text-sm md:text-base shadow-sm hover:bg-red-50 transition flex items-center justify-center gap-2"
              >
                📞 Call Emergency Contact ({emergencyContact})
              </a>

              <a
                href={`sms:${emergencyContact}?body=EMERGENCY! I need help. My location is being tracked.`}
                onClick={() => {
                  setShowSmsNotif(true);
                  setTimeout(() => setShowSmsNotif(false), 4000);
                }}
                className="bg-white border-2 border-blue-600 text-blue-600 px-5 py-3 rounded-xl font-bold text-sm md:text-base shadow-sm hover:bg-blue-50 transition flex items-center justify-center gap-2"
              >
                💬 SMS Emergency Contact
              </a>
            </>
          ) : (
            <button
              onClick={onProfile}
              className="col-span-full bg-yellow-100 text-yellow-800 border border-yellow-300 px-5 py-3 rounded-xl font-bold text-sm md:text-base shadow-sm hover:bg-yellow-200 transition flex items-center justify-center gap-2"
            >
              ⚠️ Set Emergency Contact in Profile
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {emergencies.map(e => (
          <div key={e.title} className="bg-white p-6 rounded-3xl border border-red-100 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-red-600">{e.title}</h2>
            <p className="text-sm text-slate-600 line-clamp-2">{e.advice}</p>
            <button
              onClick={() => setSelectedEmergency(e)}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors"
            >
              Request Help for {e.title}
            </button>
          </div>
        ))}
      </div>

      {/* Medical Facilities Side Panel */}
      <AnimatePresence>
        {showCallNotif && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-4 right-4 z-[60] bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 max-w-xs border-2 border-white"
          >
            <div className="bg-white/20 p-2 rounded-full animate-pulse">
              <Phone size={24} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">Calling Emergency Contact</p>
              <p className="text-[10px] opacity-90">Dialing {emergencyContact}...</p>
            </div>
            <button onClick={() => setShowCallNotif(false)} className="p-1 hover:bg-white/10 rounded-lg">
              <X size={18} />
            </button>
          </motion.div>
        )}

        {showSmsNotif && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-4 right-4 z-[60] bg-blue-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 max-w-xs border-2 border-white"
          >
            <div className="bg-white/20 p-2 rounded-full animate-pulse">
              <MessageCircle size={24} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">SMS Prepared</p>
              <p className="text-[10px] opacity-90">Opening message to {emergencyContact}...</p>
            </div>
            <button onClick={() => setShowSmsNotif(false)} className="p-1 hover:bg-white/10 rounded-lg">
              <X size={18} />
            </button>
          </motion.div>
        )}
        {showFacilitiesPanel && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFacilitiesPanel(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[80] flex flex-col"
            >
              <div className="p-6 border-b flex items-center justify-between bg-blue-600 text-white">
                <div className="flex items-center gap-2">
                  <MapPin size={24} />
                  <h2 className="text-xl font-bold">Nearby Facilities</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => searchNearbyFacilities(true)}
                    disabled={loading}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                    title="Refresh Location"
                  >
                    <Activity size={20} className={loading ? "animate-spin" : ""} />
                  </button>
                  <button
                    onClick={() => setShowFacilitiesPanel(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {locationError && (
                  <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-red-600 text-xs flex items-start gap-3">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <p>{locationError}</p>
                  </div>
                )}

                {loading && !emergencyData && (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="font-medium">Searching for facilities...</p>
                  </div>
                )}

                {emergencyData ? (
                  <>
                    {/* Hospitals */}
                    <div className="space-y-4">
                      <h3 className="font-bold text-red-600 flex items-center gap-2 sticky top-0 bg-white py-2 z-10">🏥 Hospitals (Top 5)</h3>
                      <div className="grid grid-cols-1 gap-4">
                        {emergencyData.hospitals.map((h: any, i: number) => (
                          <FacilityCard key={i} facility={h} color="red" />
                        ))}
                      </div>
                    </div>

                    {/* Clinics */}
                    <div className="space-y-4">
                      <h3 className="font-bold text-blue-600 flex items-center gap-2 sticky top-0 bg-white py-2 z-10">🩺 Clinics (Top 3)</h3>
                      <div className="grid grid-cols-1 gap-4">
                        {emergencyData.clinics.map((h: any, i: number) => (
                          <FacilityCard key={i} facility={h} color="blue" />
                        ))}
                      </div>
                    </div>

                    {/* Pharmacies */}
                    <div className="space-y-4">
                      <h3 className="font-bold text-green-600 flex items-center gap-2 sticky top-0 bg-white py-2 z-10">💊 Pharmacies (Top 3)</h3>
                      <div className="grid grid-cols-1 gap-4">
                        {emergencyData.pharmacies.map((h: any, i: number) => (
                          <FacilityCard key={i} facility={h} color="green" />
                        ))}
                      </div>
                    </div>
                  </>
                ) : !loading && (
                  <div className="p-12 bg-slate-50 rounded-3xl text-center text-slate-400 italic">
                    No facility data available. Try refreshing.
                  </div>
                )}
              </div>

              <div className="p-4 border-t bg-slate-50 text-[10px] text-slate-400 text-center">
                Data provided by OpenStreetMap • Estimated travel times are approximate
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Emergency Incident Modal */}
      <AnimatePresence>
        {selectedEmergency && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b flex items-center justify-between bg-red-600 text-white">
                <h2 className="text-2xl font-bold">{selectedEmergency.title} Instructions</h2>
                <button
                  onClick={() => setSelectedEmergency(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                <div className="aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-inner relative group">
                  <video
                    src={"/videos/" + selectedEmergency.title.toLowerCase().split(" ").join("_") + ".mp4"}
                    autoPlay
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {/* <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-transparent transition-colors">
                    <p className="text-white/50 text-xs font-mono">Video: {selectedEmergency.video}</p>
                  </div> */}
                </div>

                <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
                  <h3 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                    <Info size={20} /> Immediate Actions
                  </h3>
                  <div className="text-red-800 whitespace-pre-line leading-relaxed">
                    {selectedEmergency.advice}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setSelectedEmergency(null);
                      setShowConfirm999(true);
                    }}
                    className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg"
                  >
                    🆘 Call 999 Now
                  </button>
                  <button
                    onClick={() => setSelectedEmergency(null)}
                    className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    I Understand
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for 999 */}
      <AnimatePresence>
        {showConfirm999 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 text-center"
            >
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle size={40} />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900">Confirm Emergency Call?</h2>
                <p className="text-slate-600">This will initiate a call to emergency services (999). Only use this for real life-threatening emergencies.</p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleCall999}
                  className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-xl shadow-lg hover:bg-red-700 transition-all"
                >
                  YES, CALL 999
                </button>
                <button
                  onClick={() => setShowConfirm999(false)}
                  className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Patient Info Form Modal */}
      <AnimatePresence>
        {showPatientInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Emergency Patient Info</h2>
                <button onClick={() => setShowPatientInfo(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="bg-blue-50 p-4 rounded-2xl space-y-2">
                <p className="text-blue-800 font-bold flex items-center gap-2">
                  <Info size={18} /> REMINDER
                </p>
                <p className="text-blue-700 text-sm">Please remember to bring along your <b>IC (Identification Card)</b> and <b>Medication History</b> when the ambulance arrives.</p>
              </div>

              <div className="bg-yellow-50 p-4 rounded-2xl space-y-2">
                <p className="text-yellow-800 font-bold flex items-center gap-2">
                  <Info size={18} /> PREDICTION
                </p>
                <p className="text-yellow-700 text-sm">{predictCondition?.predictCondition} ({predictCondition?.predictChances * 100}%)</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-2 gap-6">
                  <div>
                    <label className="flex text-sm font-bold text-slate-700 mb-1">Patient Name</label>
                    <input
                      type="name"
                      value={patient?.name ?? ''}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="e.g. 012-3456789"
                    />
                  </div>

                  <div>
                    <label className="flex text-sm font-bold text-slate-700 mb-1">Patient Age</label>
                    <input
                      type="age"
                      value={patient?.age ?? 20}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="e.g. 012-3456789"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Emergency Contact Number</label>
                  <input
                    type="tel"
                    value={patient?.emergencyContact ?? ''}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="e.g. 012-3456789"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Blood Type</label>
                  <select
                    value={patient?.bloodType ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      onUpdate({ bloodType: val });
                      updateBloodType(val);
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select Blood Type</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Medical Conditions</label>
                  <textarea
                    value={patient?.conditions ?? ''}
                    onChange={(e) => setConditions(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none h-24"
                    placeholder="e.g. Diabetes, Hypertension, Asthma..."
                  />
                </div>
              </div>

              <button
                onClick={() => setShowPatientInfo(false)}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all"
              >
                Save & Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Helper component for facility cards
function FacilityCard({ facility, color }: { facility: any, color: 'red' | 'blue' | 'green' }) {
  const colorClasses = {
    red: "bg-red-50 border-red-100 text-red-900",
    blue: "bg-blue-50 border-blue-100 text-blue-900",
    green: "bg-green-50 border-green-100 text-green-900"
  };

  const btnClasses = {
    red: "bg-red-600 hover:bg-red-700",
    blue: "bg-blue-600 hover:bg-blue-700",
    green: "bg-green-600 hover:bg-green-700"
  };

  return (
    <div className={cn("p-4 rounded-2xl border shadow-sm flex flex-col justify-between gap-3", colorClasses[color])}>
      <div>
        <p className="font-bold text-sm line-clamp-1">{facility.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/50 uppercase">
            {facility.type}
          </span>
          <span className="text-[10px] opacity-70">
            {facility.distance < 1 ? `${Math.round(facility.distance * 1000)}m` : `${facility.distance.toFixed(1)}km`}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs font-bold">
          <Clock size={12} />
          <span>Est. {facility.eta} mins</span>
        </div>
      </div>

      {facility.phone ? (
        <a
          href={`tel:${facility.phone}`}
          className={cn("w-full text-center text-white py-2 rounded-xl text-xs font-bold transition-all", btnClasses[color])}
        >
          Call Facility
        </a>
      ) : (
        <div className="w-full text-center bg-slate-200 text-slate-400 py-2 rounded-xl text-xs font-bold cursor-not-allowed">
          No Phone
        </div>
      )}
    </div>
  );
}

function ProfileTab({ patient, onUpdate }: { patient: Patient | null, onUpdate: (updates: Partial<Patient>) => void }) {

  const [aiStatus, setAiStatus] = useState<'online' | 'offline' | 'checking' | null>(null);
  const [bloodType, setBloodType] = useState<string>(patient?.bloodType || "");
  const [forceCheckIn, setforceCheckIn] = useState<boolean>(patient?.forceCheckIn || false);
  const [isEnabled, setIsEnabled] = useState<boolean>(patient?.forceCheckIn || false);

  useEffect(() => {
    if (patient) {
      setBloodType(patient.bloodType || "");
      setforceCheckIn(patient.forceCheckIn ?? false);
      setIsEnabled(patient.forceCheckIn || false);
    }
  }, [patient?.id, patient?.bloodType, patient?.forceCheckIn]);

  if (!patient) return null;

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

  const handleToggle = async () => {
    const next = !isEnabled;
    setIsEnabled(next);
    onUpdate({ forceCheckIn: next });
    await saveCheckInSetting(next);
  };

  const saveCheckInSetting = async (checkInSetting: boolean) => {
    if (!patient) return;

    const patientData = doc(db, 'users', patient.id);

    await updateDoc(patientData, {
      forceCheckIn: checkInSetting
    }).catch(err =>
      handleFirestoreError(err, OperationType.UPDATE, `users/${patient.id}`)
    );
  };

  const updateBloodType = async (newBloodType: string) => {
    if (!patient) return;

    const patientData = doc(db, 'users', patient.id);

    await updateDoc(patientData, {
      bloodType: newBloodType
    }).catch(err =>
      handleFirestoreError(err, OperationType.UPDATE, `users/${patient.id}`)
    );
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <h1 className="bg-white-600 text-black text-3xl px-5 py-4 rounded-xl font-bold shadow-md">⚙️ Profile & Profile</h1>

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

        <h3 className="font-bold mb-4">Personal Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <EditableField
            label="Age"
            value={patient.age.toString()}
            onSave={(val) => onUpdate({ age: parseInt(val) })} />
          <EditableField
            label="Contact Number"
            value={patient.contact}
            onSave={(val) => onUpdate({ contact: val })} />
          <EditableField
            label="Emergency Contact"
            value={patient.emergencyContact}
            onSave={(val) => onUpdate({ emergencyContact: val })} />
          <EditableField
            label="Address"
            value={patient.address}
            onSave={(val) => onUpdate({ address: val })} />
        </div>

        <h3 className="font-bold mb-4">Medical Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="pt-6 border-t border-slate-100">
            <EditableField
              label="Medical Conditions"
              value={patient.conditions}
              onSave={(val) => onUpdate({ conditions: val })}
              className="text-sm"
            />
          </div>

          <div className="pt-6 border-t border-slate-100">
            <EditableField
              label="Allergies"
              value={patient.allergy}
              onSave={(val) => onUpdate({ allergy: val })}
              className="text-sm"
            />
          </div>

          <div className="group relative space-y-1 p-2 rounded-xl hover:bg-slate-50 transition-colors">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
              Blood Type
            </label>

            <select
              value={patient.bloodType}
              onChange={(e) => {
                const val = e.target.value;
                onUpdate({ bloodType: val });
                updateBloodType(val);
              }}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select Blood Type</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
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
          <h3 className="font-bold mb-4">Features</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
              <div>
                <p className="font-bold">Daily Check-In Reminder</p>
                <p className="text-xs text-slate -400">Set daily check-in to compulsory</p>
              </div>
              <div
                onClick={handleToggle}
                className={`w-12 h-6 rounded-full relative cursor-pointer transition ${isEnabled ? "bg-blue-600" : "bg-gray-300"
                  }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition ${isEnabled ? "right-1" : "left-1"
                    }`}
                ></div>
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