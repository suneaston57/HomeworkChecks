// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  where, 
  writeBatch, 
  getDocs 
} from 'firebase/firestore';
import { 
  CheckCircle, 
  AlertCircle, 
  FileText, 
  User, 
  Plus, 
  X, 
  RefreshCw, 
  Trash2, 
  BookOpen, 
  Users, 
  ChevronDown, 
  Check, 
  Lock, 
  Unlock, 
  UserPlus, 
  Info,
  ShieldAlert,
  Search,
  Download,
  Printer,
  ListChecks,
  Square,
  CheckSquare,
  Ban
} from 'lucide-react';

// --- 注入 Tailwind CSS 與修改網頁標題 ---
if (typeof document !== 'undefined') {
  document.title = "作業點收系統";
  if (!document.getElementById('tailwind-script')) {
    const script = document.createElement('script');
    script.id = 'tailwind-script';
    script.src = 'https://cdn.tailwindcss.com';
    document.head.appendChild(script);
  }
}

// --- 1. Firebase 設定區 ---
const firebaseConfig = {
  apiKey: "AIzaSyDmybzthSJ6b4vO1XFS887SWi6YTlhP37M",
  authDomain: "homework-tracker-5371b.firebaseapp.com",
  projectId: "homework-tracker-5371b",
  storageBucket: "homework-tracker-5371b.firebasestorage.app",
  messagingSenderId: "629450246390",
  appId: "1:629450246390:web:6a6794eacc03f62eaa44d7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Types ---
type ClassGroup = { id: string; name: string; };
type Student = { id: string; number: string; classId: string; };
type Assignment = { id: string; title: string; date: string; classId: string; };
type StatusType = 'missing' | 'submitted' | 'correction' | 'completed' | 'exempt';
type Submission = {
  id: string; assignmentId: string; studentId: string; studentNumber: string; status: StatusType; updatedAt?: any;
};
type Notification = { id: number; message: string; type: 'success' | 'error' | 'info'; };

// --- Constants ---
const STATUS_CONFIG: Record<StatusType, { label: string; color: string; cardColor: string; borderColor: string; printColor: string; icon: any }> = {
  missing: { label: '未繳', color: 'bg-gray-500 text-white shadow-sm', cardColor: 'bg-white', borderColor: 'border-gray-300', printColor: 'text-gray-400', icon: X },
  submitted: { label: '已繳', color: 'bg-blue-600 text-white shadow-sm', cardColor: 'bg-blue-50', borderColor: 'border-blue-400', printColor: 'text-blue-600', icon: FileText },
  correction: { label: '訂正', color: 'bg-orange-600 text-white shadow-sm', cardColor: 'bg-orange-50', borderColor: 'border-orange-400', printColor: 'text-orange-600', icon: AlertCircle },
  completed: { label: '完成', color: 'bg-emerald-600 text-white shadow-sm', cardColor: 'bg-emerald-50', borderColor: 'border-emerald-400', printColor: 'text-emerald-600', icon: CheckCircle },
  exempt: { label: '免寫', color: 'bg-gray-300 text-gray-700 shadow-sm', cardColor: 'bg-gray-100', borderColor: 'border-gray-300', printColor: 'text-gray-500', icon: Ban }
};

const STATUS_ORDER: StatusType[] = ['missing', 'submitted', 'correction', 'completed', 'exempt'];
const CYCLE_STATUS_ORDER: StatusType[] = ['missing', 'submitted', 'correction', 'completed'];

const downloadCSV = (content: string, filename: string) => {
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.setAttribute('href', URL.createObjectURL(blob));
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- Main Component ---
export default function App() {
  const [user, setUser] = useState<any>(null);
  
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'by-assignment' | 'by-student' | 'export' | 'manage'>('by-assignment');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [assignmentSearchTerm, setAssignmentSearchTerm] = useState('');
  const [exportSelectedAssignments, setExportSelectedAssignments] = useState<Set<string>>(new Set());

  const [newClassName, setNewClassName] = useState('');
  
  // 【安全升級】完全改用 String State 以避免 React 渲染 NaN 造成的白屏崩潰
  const [startNumber, setStartNumber] = useState('1');
  const [endNumber, setEndNumber] = useState('30');
  
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDate, setNewAssignmentDate] = useState(new Date().toISOString().split('T')[0]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ id: Date.now(), message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSnapshotError = (err: any) => {
    setIsLoading(false);
    if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
      setPermissionError(true);
    }
  };

  useEffect(() => {
    signInAnonymously(auth).catch(() => {});
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'classes'));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassGroup)).sort((a, b) => a.name.localeCompare(b.name));
      setClasses(list);
      if (list.length > 0 && !selectedClassId) setSelectedClassId(list[0].id);
      setIsLoading(false);
    }, handleSnapshotError);
  }, [user]);

  useEffect(() => {
    if (!user || !selectedClassId) { setStudents([]); setAssignments([]); return; }
    
    const unsubStudents = onSnapshot(query(collection(db, 'students'), where('classId', '==', selectedClassId)), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)).sort((a, b) => parseInt(a.number || '0') - parseInt(b.number || '0'));
      setStudents(list);
    }, handleSnapshotError);

    const unsubAssignments = onSnapshot(query(collection(db, 'assignments'), where('classId', '==', selectedClassId)), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setAssignments(list);
      if (list.length > 0 && !selectedAssignmentId) setSelectedAssignmentId(list[0].id);
    }, handleSnapshotError);

    const unsubSubmissions = onSnapshot(collection(db, 'submissions'), (snap) => {
      const map: Record<string, Submission> = {};
      snap.docs.forEach(d => { map[d.id] = d.data() as Submission; });
      setSubmissions(map);
    }, handleSnapshotError);

    return () => { unsubStudents(); unsubAssignments(); unsubSubmissions(); };
  }, [user, selectedClassId]);

  // --- 歷史紀錄與現役學生合併邏輯 ---
  const allHistoricalStudents = useMemo(() => {
    const map = new Map();
    students.forEach(s => map.set(s.id, { ...s, isActive: true }));
    
    const classAssignmentIds = new Set(assignments.map(a => a.id));
    Object.values(submissions).forEach(sub => {
        if (classAssignmentIds.has(sub.assignmentId)) {
            if (!map.has(sub.studentId) && sub.studentId) {
                map.set(sub.studentId, {
                    id: sub.studentId,
                    number: sub.studentNumber,
                    isActive: false 
                });
            }
        }
    });
    return Array.from(map.values()).sort((a, b) => parseInt(a.number || '0') - parseInt(b.number || '0'));
  }, [students, submissions, assignments]);

  useEffect(() => {
    if (allHistoricalStudents.length > 0 && !selectedStudentId) {
        setSelectedStudentId(allHistoricalStudents[0].id);
    }
  }, [allHistoricalStudents, selectedStudentId]);

  // --- Derived Data ---
  const filteredAssignments = useMemo(() => assignments.filter(a => a.title.toLowerCase().includes(assignmentSearchTerm.toLowerCase()) || a.date.includes(assignmentSearchTerm)), [assignments, assignmentSearchTerm]);

  useEffect(() => {
    if (filteredAssignments.length > 0 && !filteredAssignments.find(a => a.id === selectedAssignmentId)) setSelectedAssignmentId(filteredAssignments[0].id);
  }, [filteredAssignments, selectedAssignmentId]);

  const currentAssignmentSubmissions = useMemo(() => {
      if (!selectedAssignmentId) return [];
      return Object.values(submissions).filter(s => s.assignmentId === selectedAssignmentId).sort((a, b) => parseInt(a.studentNumber || '0') - parseInt(b.studentNumber || '0'));
  }, [submissions, selectedAssignmentId]);

  const currentAssignmentStats = useMemo(() => {
    const stats = { completed: 0, correction: 0, submitted: 0, missing: 0, exempt: 0 };
    currentAssignmentSubmissions.forEach(s => { 
        if (stats[s.status] !== undefined) stats[s.status]++; 
    });
    return stats;
  }, [currentAssignmentSubmissions]);

  // 【安全升級】保證回傳的物件完全安全，不會因為除以 0 當機
  const getAssignmentCompletion = (assignId: string) => {
      if (!submissions) return { completed: 0, total: 0, isDone: false };
      const subs = Object.values(submissions).filter(s => s?.assignmentId === assignId);
      if (!subs || subs.length === 0) return { completed: 0, total: 0, isDone: false };
      
      const completed = subs.filter(s => s?.status === 'completed').length;
      const exempt = subs.filter(s => s?.status === 'exempt').length;
      return { completed, total: subs.length, isDone: (completed + exempt) === subs.length };
  };

  // --- Core Action: Cycle Status ---
  const handleCycleStatus = async (sub: Submission) => {
    if (!user) return;
    
    // 如果是免寫狀態，直接鎖定卡片點擊，不執行狀態切換
    if (sub.status === 'exempt') return; 

    // 只在 4 個主要狀態間循環
    const currentIndex = CYCLE_STATUS_ORDER.indexOf(sub.status);
    const nextIndex = (currentIndex + 1) % CYCLE_STATUS_ORDER.length;
    const newStatus = CYCLE_STATUS_ORDER[nextIndex];

    try {
        await setDoc(doc(db, 'submissions', sub.id), { status: newStatus, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err: any) { handleSnapshotError(err); }
  };

  // 獨立的切換免寫功能
  const toggleExemptStatus = async (sub: Submission, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡
    if (!user) return;
    const newStatus = sub.status === 'exempt' ? 'missing' : 'exempt';
    try {
        await setDoc(doc(db, 'submissions', sub.id), { status: newStatus, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err: any) { handleSnapshotError(err); }
  };

  const updateStatus = async (sub: Submission, newStatus: StatusType) => {
    if (!user) return;
    try { await setDoc(doc(db, 'submissions', sub.id), { status: newStatus, updatedAt: serverTimestamp() }, { merge: true }); } 
    catch (err: any) { handleSnapshotError(err); }
  };

  // --- Export Logic ---
  const toggleExportAssignment = (id: string) => {
    const newSet = new Set(exportSelectedAssignments);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setExportSelectedAssignments(newSet);
  };

  const handleSelectAllExport = () => {
    exportSelectedAssignments.size === assignments.length ? setExportSelectedAssignments(new Set()) : setExportSelectedAssignments(new Set(assignments.map(a => a.id)));
  };

  const handleExportMatrixCSV = () => {
    if (exportSelectedAssignments.size === 0) return showNotification("請至少選擇一項作業", "info");
    const selectedAssigns = assignments.filter(a => exportSelectedAssignments.has(a.id)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let csvContent = "座號" + selectedAssigns.map(a => `,${a.date} ${a.title}`).join('') + "\n";
    allHistoricalStudents.forEach(student => {
        csvContent += `${student.number}${student.isActive ? '' : '(歷史)'}` + selectedAssigns.map(a => {
            const sub = submissions[`${a.id}_${student.id}`];
            return `,${sub ? STATUS_CONFIG[sub.status].label : '無紀錄'}`;
        }).join('') + "\n";
    });
    downloadCSV(csvContent, `${classes.find(c => c.id === selectedClassId)?.name || '未命名'}_作業繳交總表.csv`);
    showNotification("總表已匯出", "success");
  };

  const handlePrint = () => window.print();

  // --- Management Actions ---
  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newClassName) return;
    try {
      const docRef = await addDoc(collection(db, 'classes'), { name: newClassName, createdAt: serverTimestamp() });
      setNewClassName(''); setSelectedClassId(docRef.id); setActiveTab('manage'); showNotification('班級已建立', 'success');
    } catch (err: any) { if(err.code !== 'permission-denied') showNotification('建立失敗', 'error'); }
  };

  const handleDeleteClass = async (id: string) => {
    try { await deleteDoc(doc(db, 'classes', id)); if (selectedClassId === id) setSelectedClassId(''); showNotification('班級已刪除', 'success'); } 
    catch (err: any) { if(err.code !== 'permission-denied') showNotification('刪除失敗', 'error'); }
  };

  const handleBatchCreateStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 【安全升級】解析字串狀態的數字
    const startNum = parseInt(startNumber, 10);
    const endNum = parseInt(endNumber, 10);

    if (!user || !selectedClassId || isNaN(startNum) || isNaN(endNum) || startNum > endNum) {
        showNotification("請輸入正確的起訖號碼", "error");
        return;
    }
    
    setIsLoading(true);
    const batch = writeBatch(db);
    const existingNumbers = new Set((await getDocs(query(collection(db, 'students'), where('classId', '==', selectedClassId)))).docs.map(d => parseInt(d.data().number)));
    
    let count = 0;
    for (let i = startNum; i <= endNum; i++) {
        if (!existingNumbers.has(i)) {
            batch.set(doc(collection(db, 'students')), { number: i.toString().padStart(2, '0'), classId: selectedClassId, createdAt: serverTimestamp() });
            count++;
        }
    }
    try { await batch.commit(); showNotification(`成功新增 ${count} 個座號`, 'success'); } 
    catch (err: any) { if(err.code !== 'permission-denied') showNotification("新增失敗", 'error'); } 
    finally { setIsLoading(false); }
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newAssignmentTitle || !selectedClassId) return;
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      const assignRef = doc(collection(db, 'assignments'));
      batch.set(assignRef, { title: newAssignmentTitle, date: newAssignmentDate, classId: selectedClassId, createdAt: serverTimestamp() });
      students.forEach(student => {
          const subId = `${assignRef.id}_${student.id}`;
          batch.set(doc(db, 'submissions', subId), { id: subId, assignmentId: assignRef.id, studentId: student.id, studentNumber: student.number, status: 'missing', updatedAt: serverTimestamp() });
      });
      await batch.commit(); setNewAssignmentTitle(''); showNotification('作業已建立', 'success');
    } catch (err: any) { if(err.code !== 'permission-denied') showNotification('建立失敗', 'error'); } 
    finally { setIsLoading(false); }
  };

  const syncStudentsToAssignment = async (assignmentId: string) => {
      setIsLoading(true);
      try {
          const batch = writeBatch(db); let count = 0;
          students.forEach(student => {
              const subId = `${assignmentId}_${student.id}`;
              if (!submissions[subId]) {
                  batch.set(doc(db, 'submissions', subId), { id: subId, assignmentId: assignmentId, studentId: student.id, studentNumber: student.number, status: 'missing', updatedAt: serverTimestamp() });
                  count++;
              }
          });
          if (count > 0) { await batch.commit(); showNotification(`已補入 ${count} 位學生`, 'success'); } else { showNotification('名單已是最新', 'info'); }
      } catch(err: any) { if(err.code !== 'permission-denied') showNotification('同步失敗', 'error'); } 
      finally { setIsLoading(false); }
  };

  const deleteAssignment = async (id: string) => { 
      try { await deleteDoc(doc(db, 'assignments', id)); showNotification('作業已刪除', 'success'); } 
      catch (err: any) { console.error(err); showNotification('刪除失敗', 'error'); } 
  };
  const deleteStudent = async (id: string) => { 
      try { await deleteDoc(doc(db, 'students', id)); showNotification('座號已刪除', 'success'); } 
      catch (err: any) { console.error(err); showNotification('刪除失敗', 'error'); } 
  };

  // --- Render Helpers ---
  const StatusBadge = ({ status, isMobile }: { status: StatusType, isMobile?: boolean }) => {
    const config = STATUS_CONFIG[status];
    const Icon = config.icon;
    if (isMobile) {
      return (
        <div className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-lg font-bold border-2 transition-all w-full shadow-sm ${config.color}`}>
          <Icon size={22} strokeWidth={2.5} /> {config.label}
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border transition-all ${config.color}`}>
        <Icon size={12} strokeWidth={2.5} /> {config.label}
      </div>
    );
  };

  const StatusSelector = ({ currentStatus, onSelect }: { currentStatus: StatusType, onSelect: (s: StatusType) => void }) => (
    <div className="flex bg-gray-100 p-1 rounded-lg gap-1 w-full print:hidden">
      {STATUS_ORDER.map(status => {
        const isActive = currentStatus === status;
        const activeStyle = isActive ? STATUS_CONFIG[status].color + ' ring-1 ring-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200';
        return <button key={status} onClick={() => onSelect(status)} className={`flex-1 px-1 py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all whitespace-nowrap ${activeStyle}`}>{STATUS_CONFIG[status].label}</button>
      })}
    </div>
  );

  const NotificationToast = () => {
    if (!notification) return null;
    const bgColors = { success: 'bg-gray-800 text-white', error: 'bg-red-500 text-white', info: 'bg-blue-600 text-white' };
    return (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-xl z-50 flex items-center gap-3 print:hidden">
            <div className={`flex items-center gap-3 px-6 py-3 rounded-lg ${bgColors[notification.type]} transition-all duration-300`}>
                <span className="text-base font-medium tracking-wide">{notification.message}</span>
            </div>
        </div>
    );
  };

  if (permissionError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-2xl w-full text-center">
          <ShieldAlert className="w-20 h-20 text-red-600 mx-auto mb-6" />
          <h2 className="text-3xl font-bold mb-2">資料庫存取被拒絕</h2>
          <button onClick={() => window.location.reload()} className="w-full bg-indigo-600 text-white px-6 py-4 rounded-xl font-bold">重新整理頁面</button>
        </div>
      </div>
    );
  }

  if (isLoading && classes.length === 0) return <div className="flex h-screen items-center justify-center bg-gray-50"><RefreshCw className="animate-spin text-indigo-600 w-8 h-8"/></div>;

  const selectedExportAssignsSorted = (assignments || []).filter(a => exportSelectedAssignments.has(a.id)).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-10 print:bg-white print:p-0">
      <NotificationToast />
      
      <header className="bg-white shadow-sm sticky top-0 z-20 border-b border-gray-200 print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row h-auto sm:h-14 items-center justify-between py-2 sm:py-0 gap-2">
            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-2">
                <div className="bg-indigo-600 p-1.5 rounded-lg text-white shadow-sm"><BookOpen size={18} /></div>
                <h1 className="text-base font-bold text-gray-800 hidden md:block">作業點收系統</h1>
              </div>
              <div className="relative group">
                <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} className="appearance-none bg-indigo-50 border border-indigo-100 text-indigo-700 py-1 pl-3 pr-8 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:bg-indigo-100 transition-colors">
                  <option value="" disabled>請選擇班級</option>
                  {(classes || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none"/>
              </div>
            </div>
            <nav className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
              {[{ id: 'by-assignment', label: '依作業', icon: FileText }, { id: 'by-student', label: '依學生', icon: User }, { id: 'export', label: '批次匯出', icon: ListChecks }, { id: 'manage', label: '管理資料', icon: Plus }].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} disabled={!selectedClassId && tab.id !== 'manage'} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm' : !selectedClassId && tab.id !== 'manage' ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700'}`}>
                  <tab.icon size={14} /><span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className="hidden print:block text-center mb-6 pt-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{classes.find(c => c.id === selectedClassId)?.name || '未命名'} 作業繳交總表</h1>
        <p className="text-sm text-gray-500">列印日期：{new Date().toLocaleDateString()}</p>
      </div>

      <main className="max-w-6xl mx-auto px-2 sm:px-4 lg:px-6 py-4 print:p-0 print:max-w-none">
        
        {/* VIEW 1: BY ASSIGNMENT */}
        {activeTab === 'by-assignment' && selectedClassId && (
            <div className="space-y-4">
                <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center print:hidden">
                    <div className="w-full sm:w-auto flex-1">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14}/>
                                <input type="text" placeholder="搜尋作業..." value={assignmentSearchTerm} onChange={(e) => setAssignmentSearchTerm(e.target.value)} className="w-full pl-8 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div className="flex gap-2 flex-1">
                                <select value={selectedAssignmentId} onChange={(e) => setSelectedAssignmentId(e.target.value)} className="flex-grow py-1.5 pl-2 pr-8 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-ellipsis overflow-hidden">
                                    {assignments.length === 0 && <option>尚無作業</option>}
                                    {(filteredAssignments || []).map(a => <option key={a.id} value={a.id}>{a.date} - {a.title}</option>)}
                                </select>
                                {selectedAssignmentId && <button onClick={() => syncStudentsToAssignment(selectedAssignmentId)} className="bg-indigo-50 text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors flex-shrink-0" title="同步名單"><UserPlus size={16}/></button>}
                            </div>
                        </div>
                    </div>
                    {assignments.length > 0 && (
                        <div className="grid grid-cols-5 gap-1 text-center divide-x divide-gray-100 bg-gray-50 p-1.5 rounded-lg border border-gray-200 flex-shrink-0 w-full sm:w-auto">
                            <div className="px-2"><div className="text-lg font-bold text-green-600 leading-tight">{currentAssignmentStats.completed}</div><div className="text-[10px] text-gray-500">完成</div></div>
                            <div className="px-2"><div className="text-lg font-bold text-orange-500 leading-tight">{currentAssignmentStats.correction}</div><div className="text-[10px] text-gray-500">訂正</div></div>
                            <div className="px-2"><div className="text-lg font-bold text-blue-500 leading-tight">{currentAssignmentStats.submitted}</div><div className="text-[10px] text-gray-500">已繳</div></div>
                            <div className="px-2"><div className="text-lg font-bold text-gray-600 leading-tight">{currentAssignmentStats.exempt}</div><div className="text-[10px] text-gray-500">免寫</div></div>
                            <div className="px-2"><div className="text-lg font-bold text-gray-400 leading-tight">{currentAssignmentStats.missing}</div><div className="text-[10px] text-gray-500">未繳</div></div>
                        </div>
                    )}
                </div>

                {selectedAssignmentId && assignments.length > 0 ? (
                    <>
                        <div className="block sm:hidden bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
                             <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-medium"><tr><th className="px-4 py-2 w-16">座號</th><th className="px-4 py-2 text-right">狀態 (點擊切換)</th></tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                {(currentAssignmentSubmissions || []).map(sub => {
                                    const config = STATUS_CONFIG[sub.status];
                                    const borderColor = config.borderColor.replace('border-', 'bg-');
                                    const isExempt = sub.status === 'exempt';
                                    
                                    return (
                                    <tr 
                                        key={sub.id} 
                                        onClick={() => handleCycleStatus(sub)} 
                                        className={`relative select-none transition-colors ${isExempt ? 'bg-gray-100 opacity-80' : 'hover:bg-gray-50 active:bg-gray-100 cursor-pointer'}`}
                                    >
                                        <td className="relative px-4 py-3 font-mono text-xl font-bold text-gray-700">
                                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${borderColor}`}></div>
                                            {sub.studentNumber}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                <button 
                                                    onClick={(e) => toggleExemptStatus(sub, e)}
                                                    className={`p-2.5 rounded-xl border-2 transition-all cursor-pointer pointer-events-auto ${isExempt ? 'bg-gray-200 border-gray-400 text-gray-700 shadow-inner' : 'bg-white border-gray-200 text-gray-300 hover:bg-gray-50'}`}
                                                    title="切換免寫鎖定"
                                                >
                                                    <Ban size={22} strokeWidth={2.5}/>
                                                </button>
                                                <div className="flex-1 pointer-events-none">
                                                    <StatusBadge status={sub.status} isMobile={true} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )})}
                                </tbody>
                             </table>
                        </div>
                        
                        <div className="hidden sm:grid grid-cols-5 gap-2 sm:gap-3 print:hidden">
                            {(currentAssignmentSubmissions || []).map(sub => {
                                const config = STATUS_CONFIG[sub.status];
                                const isExempt = sub.status === 'exempt';
                                
                                return (
                                <div 
                                    key={sub.id} 
                                    onClick={() => handleCycleStatus(sub)}
                                    className={`px-3 py-2 rounded-lg shadow-sm flex flex-col justify-center border-2 transition-all select-none ${config.cardColor} ${config.borderColor} ${isExempt ? 'opacity-80' : 'cursor-pointer hover:shadow-md active:scale-95'}`}
                                >
                                    <div className="flex justify-between items-center w-full">
                                        <span className="text-xl sm:text-2xl font-bold font-mono text-gray-800 tracking-tighter">{sub.studentNumber}</span>
                                        <div className="flex items-center gap-1.5">
                                            <button 
                                                onClick={(e) => toggleExemptStatus(sub, e)}
                                                className={`p-1.5 rounded-md border transition-all cursor-pointer pointer-events-auto ${isExempt ? 'bg-gray-300 border-gray-400 text-gray-700 shadow-inner' : 'bg-white border-gray-200 text-gray-300 hover:bg-gray-100 hover:text-gray-500'}`}
                                                title="切換免寫鎖定"
                                            >
                                                <Ban size={14} strokeWidth={3}/>
                                            </button>
                                            <div className="pointer-events-none">
                                                <StatusBadge status={sub.status} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </>
                ) : <div className="text-center py-12 text-gray-400 border border-dashed rounded-xl print:hidden">請選擇作業</div>}
            </div>
        )}

        {/* VIEW 2: BY STUDENT */}
        {activeTab === 'by-student' && selectedClassId && (
             <div className="space-y-6">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 print:hidden">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">選擇座號</label>
                    <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="w-full sm:w-64 p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none">
                        {allHistoricalStudents.length === 0 && <option>尚無學生</option>}
                        {(allHistoricalStudents || []).map(s => <option key={s.id} value={s.id}>{s.number} 號 {s.isActive ? '' : '(歷史紀錄)'}</option>)}
                    </select>
                </div>
                {selectedStudentId && (
                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:border-none print:shadow-none">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200 print:bg-white print:text-black">
                                <tr><th className="px-6 py-3">日期</th><th className="px-6 py-3">作業</th><th className="px-6 py-3 print:hidden">變更狀態</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                                {(assignments || []).map(assign => {
                                    const sub = submissions[`${assign.id}_${selectedStudentId}`];
                                    if(!sub) return null;
                                    return (
                                    <tr key={assign.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-500 text-xs print:text-black">{assign.date}</td>
                                        <td className="px-6 py-4 font-medium print:text-black">{assign.title}</td>
                                        <td className="px-6 py-4 print:hidden"><StatusSelector currentStatus={sub.status} onSelect={(s)=>updateStatus(sub, s)}/></td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                     </div>
                )}
             </div>
        )}

        {/* VIEW 3: BATCH EXPORT */}
        {activeTab === 'export' && selectedClassId && (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 print:hidden">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2"><ListChecks className="text-indigo-600"/> 批次匯出與列印</h2>
                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="flex-1">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-gray-700">1. 勾選要匯出的作業</h3>
                                <button onClick={handleSelectAllExport} className="text-sm text-indigo-600 font-medium">{exportSelectedAssignments.size === assignments.length ? '取消全選' : '全選'}</button>
                            </div>
                            <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto bg-gray-50 p-2 space-y-1">
                                {(assignments || []).map(a => (
                                    <div key={a.id} onClick={() => toggleExportAssignment(a.id)} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${exportSelectedAssignments.has(a.id) ? 'bg-indigo-50 border border-indigo-200' : 'bg-white border border-transparent hover:border-gray-200'}`}>
                                        {exportSelectedAssignments.has(a.id) ? <CheckSquare className="text-indigo-600" size={20}/> : <Square className="text-gray-400" size={20}/>}
                                        <div><div className="text-sm font-bold text-gray-800">{a.title}</div><div className="text-xs text-gray-500">{a.date}</div></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="w-full lg:w-72 flex flex-col gap-4">
                            <h3 className="font-bold text-gray-700">2. 選擇操作</h3>
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="flex flex-col gap-3">
                                    <button onClick={handleExportMatrixCSV} disabled={exportSelectedAssignments.size === 0} className={`flex items-center justify-center gap-2 py-3 rounded-lg font-bold shadow-sm ${exportSelectedAssignments.size > 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-300 text-gray-500'}`}><Download size={18}/> 下載 CSV 總表</button>
                                    <button onClick={handlePrint} disabled={exportSelectedAssignments.size === 0} className={`flex items-center justify-center gap-2 py-3 rounded-lg font-bold shadow-sm ${exportSelectedAssignments.size > 0 ? 'bg-gray-800 text-white hover:bg-gray-900' : 'bg-gray-300 text-gray-500'}`}><Printer size={18}/> 列印/預覽 總表</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="hidden print:block">
                    <table className="w-full text-sm text-center border-collapse border border-gray-300">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border border-gray-300 p-2 w-16">座號</th>
                                {selectedExportAssignsSorted?.map(a => (
                                    <th key={a.id} className="border border-gray-300 p-2"><div className="text-xs text-gray-500">{a.date}</div><div>{a.title}</div></th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(allHistoricalStudents || []).map(student => (
                                <tr key={student.id}>
                                    <td className="border border-gray-300 p-2 font-bold text-gray-700">
                                        {student.number}
                                        {!student.isActive && <span className="text-[10px] text-red-500 block font-normal leading-none mt-1">歷史</span>}
                                    </td>
                                    {selectedExportAssignsSorted?.map(a => {
                                        const sub = submissions[`${a.id}_${student.id}`];
                                        const simpleLabel = sub?.status === 'completed' ? 'O' : sub?.status === 'correction' ? '△' : sub?.status === 'submitted' ? 'V' : sub?.status === 'exempt' ? '-' : '';
                                        return <td key={a.id} className={`border border-gray-300 p-2 font-bold ${sub ? STATUS_CONFIG[sub.status].printColor : ''}`}>{simpleLabel}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="mt-4 text-xs text-gray-500 flex gap-4">
                        <span>圖例說明：</span>
                        <span>O = 完成</span>
                        <span>△ = 訂正</span>
                        <span>V = 已繳</span>
                        <span>- = 免寫</span>
                        <span>(空) = 未繳 / 無紀錄</span>
                    </div>
                </div>
            </div>
        )}

        {/* VIEW 4: MANAGE (已強化安全渲染) */}
        {activeTab === 'manage' && (
            <div className="space-y-6 print:hidden">
                {selectedClassId && (
                <div className="bg-indigo-50 p-4 rounded-xl flex justify-between items-center shadow-sm border border-indigo-100">
                    <span className="text-indigo-800 font-medium flex items-center gap-2"><Lock size={18}/> 安全管理區</span>
                    <button onClick={() => setIsEditMode(!isEditMode)} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all shadow-sm ${isEditMode ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border'}`}>{isEditMode ? <Unlock size={18}/> : <Lock size={18}/>} {isEditMode ? '編輯模式已開啟' : '開啟編輯模式'}</button>
                </div>
                )}
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 班級管理 */}
                    <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><Users size={20} className="text-indigo-600"/> 班級管理</h2>
                        <div className="flex flex-col sm:flex-row gap-4 items-end mb-4">
                            <div className="flex-grow w-full">
                                <label className="block text-sm font-medium text-gray-700 mb-1">建立新班級</label>
                                <input type="text" placeholder="例如：301 班" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg outline-none"/>
                            </div>
                            <button onClick={handleAddClass} className="w-full sm:w-auto bg-gray-800 text-white py-2 px-6 rounded-lg font-bold">新增班級</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(classes || []).map(c => (
                                <div key={c.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${selectedClassId === c.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white border-gray-200'}`}>
                                    <span>{c.name}</span>
                                    {isEditMode && selectedClassId !== c.id && <button onClick={(e) => {e.stopPropagation(); handleDeleteClass(c.id);}} className="ml-2 text-red-400 hover:text-red-600"><X size={14}/></button>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {selectedClassId && (
                        <>
                        {/* 作業管理 */}
                        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[500px]">
                            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><FileText size={20} className="text-indigo-600"/> 作業管理</h2>
                            <form onSubmit={handleAddAssignment} className="flex gap-2 mb-6 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <input type="date" required value={newAssignmentDate} onChange={(e) => setNewAssignmentDate(e.target.value)} className="w-32 p-2 bg-white border border-gray-200 rounded-md outline-none"/>
                                <input type="text" placeholder="新增作業..." required value={newAssignmentTitle} onChange={(e) => setNewAssignmentTitle(e.target.value)} className="flex-grow p-2 bg-white border rounded-md outline-none"/>
                                <button type="submit" className="bg-indigo-600 text-white p-2 rounded-md hover:bg-indigo-700"><Plus size={20}/></button>
                            </form>
                            <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                                {(assignments || []).map(a => {
                                    const status = getAssignmentCompletion(a.id);
                                    // 安全計算百分比，確保不會出現 NaN
                                    const totalForCalc = status.total || 1;
                                    const percent = Math.round((status.completed / totalForCalc) * 100) || 0;
                                    
                                    return (
                                        <div key={a.id} className={`flex justify-between items-center p-3 rounded-lg border ${status.isDone ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${status.isDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {status.isDone ? <Check size={18}/> : `${percent}%`}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-800">{a.title}</div>
                                                    <div className="text-xs text-gray-500">{a.date}</div>
                                                </div>
                                            </div>
                                            {isEditMode && (
                                                <button onClick={(e)=>{e.stopPropagation(); deleteAssignment(a.id)}} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200">
                                                    <Trash2 size={18}/>
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* 學生座號管理 */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[500px]">
                            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><User size={20} className="text-indigo-600"/> 學生座號管理</h2>
                            <form onSubmit={handleBatchCreateStudents} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <div className="flex items-center gap-2 mb-3">
                                    <input 
                                        type="number" 
                                        value={startNumber} 
                                        onChange={(e) => setStartNumber(e.target.value)} 
                                        className="w-full p-2 bg-white border border-gray-300 rounded-md text-center outline-none focus:border-indigo-500"
                                        placeholder="起"
                                    />
                                    <span className="text-gray-400 font-bold">~</span>
                                    <input 
                                        type="number" 
                                        value={endNumber} 
                                        onChange={(e) => setEndNumber(e.target.value)} 
                                        className="w-full p-2 bg-white border border-gray-300 rounded-md text-center outline-none focus:border-indigo-500"
                                        placeholder="迄"
                                    />
                                </div>
                                <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white py-2 rounded-md flex justify-center items-center gap-2 font-bold disabled:bg-indigo-400 hover:bg-indigo-700">
                                    {isLoading ? <RefreshCw className="animate-spin" size={18}/> : <Plus size={18}/>} 產生/補號
                                </button>
                            </form>
                            <div className="flex-grow overflow-y-auto pr-1">
                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                    {(students || []).map(s => (
                                        <div key={s.id} className={`relative bg-white border rounded-lg p-2 text-center transition-colors ${isEditMode ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                                            <span className="text-lg font-bold font-mono text-gray-700">{s?.number}</span>
                                            {isEditMode && (
                                                <button onClick={(e)=>{e.stopPropagation(); deleteStudent(s.id)}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm hover:scale-110 transition-transform">
                                                    <X size={12}/>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        </>
                    )}
                </div>
            </div>
        )}

      </main>
    </div>
  );
}