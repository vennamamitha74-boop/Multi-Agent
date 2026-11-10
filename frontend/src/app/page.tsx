"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Database,
  Download,
  FileCheck,
  FileCode,
  Files,
  FileText,
  Filter,
  FolderOpen,
  HelpCircle,
  History,
  Home as HomeIcon,
  Layers,
  Lightbulb,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Plus,
  PlusCircle,
  Printer,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Subtask {
  id: string;
  title: string;
  description: string;
  assigned_agent: string;
  status: string;
  output?: string;
}

interface TaskRecord {
  task_id: string;
  user_id: string;
  original_request: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  plan?: {
    objective: string;
    requirements: string[];
    constraints: string[];
    subtasks: Subtask[];
  };
  subtasks: Subtask[];
  agent_statuses: Record<string, string>;
  retrieved_evidence: any[];
  research_results?: any;
  analysis_results?: any;
  execution_results?: any;
  verification_results?: {
    is_approved: boolean;
    completeness_score: number;
    evidence_backed: boolean;
    unsupported_claims: string[];
    audit_notes: string;
  };
  final_deliverable?: string;
  events: Array<{
    stage: string;
    message: string;
    timestamp: string;
  }>;
  warnings?: string[];
  errors?: string[];
}

interface DocumentRecord {
  document_id: string;
  filename: string;
  user_id: string;
  chunk_count: number;
  uploaded_at: string;
}

interface SystemUser {
  id: string;
  username: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  taskCount: number;
  lastActive: string;
}

type TabType =
  | "dashboard"
  | "new_task"
  | "execution"
  | "rag"
  | "documents"
  | "deliverable"
  | "history"
  | "settings"
  | "admin";

export default function Home() {
  // Navigation & Global UI States
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(true);
  const [currentUser, setCurrentUser] = useState("user_developer");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Core Data States
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<TaskRecord | null>(null);
  const [tasksList, setTasksList] = useState<TaskRecord[]>([]);
  const [systemReady, setSystemReady] = useState<any>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  // Task Execution Options
  const [enableRagGrounding, setEnableRagGrounding] = useState(true);
  const [verificationRigor, setVerificationRigor] = useState<"standard" | "strict">("strict");
  const [executionMode, setExecutionMode] = useState<"standard" | "deep">("deep");

  // Document & RAG States
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [docFilterType, setDocFilterType] = useState<string>("all");
  const [selectedDocForPreview, setSelectedDocForPreview] = useState<DocumentRecord | null>(null);

  // RAG Interactive Q&A
  const [ragQuestion, setRagQuestion] = useState("");
  const [selectedDocIdForQa, setSelectedDocIdForQa] = useState<string>("all");
  const [isSearchingRag, setIsSearchingRag] = useState(false);
  const [ragError, setRagError] = useState<string | null>(null);
  const [ragHistory, setRagHistory] = useState<
    Array<{
      id: string;
      document_id?: string;
      document_name: string;
      question: string;
      answer: string;
      is_grounded: boolean;
      intent?: string;
      citations: Array<{
        citation_index: number;
        filename: string;
        chunk_id: string;
        page_number: number;
        section: string;
        similarity_score: number;
        snippet: string;
      }>;
      evidence_count: number;
      timestamp: string;
    }>
  >([]);

  // Task History Pagination & Filter States
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);
  const tasksPerPage = 8;

  // Report & Viewer States
  const [copied, setCopied] = useState(false);
  const [isFullScreenReport, setIsFullScreenReport] = useState(false);
  const [eventFilterStage, setEventFilterStage] = useState("all");
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<{
    key: string;
    label: string;
    role: string;
    desc: string;
    data: any;
  } | null>(null);

  // Admin Panel Mock User Registry State (Client managed)
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([
    {
      id: "u-1",
      username: "user_developer",
      role: "admin",
      status: "active",
      taskCount: 14,
      lastActive: "Just now",
    },
    {
      id: "u-2",
      username: "sarah_analyst",
      role: "user",
      status: "active",
      taskCount: 8,
      lastActive: "2 hours ago",
    },
    {
      id: "u-3",
      username: "alex_researcher",
      role: "user",
      status: "active",
      taskCount: 5,
      lastActive: "Yesterday",
    },
    {
      id: "u-4",
      username: "guest_contractor",
      role: "user",
      status: "disabled",
      taskCount: 1,
      lastActive: "5 days ago",
    },
  ]);

  // Initial Data Fetch
  useEffect(() => {
    fetchReadyStatus();
    loadTasks();
    loadDocuments();
    setLastRefreshed(new Date().toLocaleTimeString());
  }, []);

  // Poll current task when running or pending
  useEffect(() => {
    if (!currentTaskId) return;

    const interval = setInterval(() => {
      fetch(`/api/tasks/${currentTaskId}`)
        .then((res) => {
          if (!res.ok) throw new Error("Task fetch failed");
          return res.json();
        })
        .then((data: TaskRecord) => {
          setCurrentTask(data);
          if (["completed", "failed", "partially_completed"].includes(data.status)) {
            clearInterval(interval);
            loadTasks();
          }
        })
        .catch(console.error);
    }, 2000);

    return () => clearInterval(interval);
  }, [currentTaskId]);

  const fetchReadyStatus = () => {
    fetch("/ready")
      .then((res) => res.json())
      .then((data) => setSystemReady(data))
      .catch(() => setSystemReady({ ready: false, components: {} }));
  };

  const loadTasks = () => {
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTasksList([...data].reverse());
          setLastRefreshed(new Date().toLocaleTimeString());
        }
      })
      .catch(console.error);
  };

  const loadDocuments = () => {
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDocuments(data);
        }
      })
      .catch(console.error);
  };

  // Submit Task Request
  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: prompt,
          user_id: currentUser,
          document_ids: enableRagGrounding ? documents.map((d) => d.document_id) : [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentTaskId(data.task_id);
        setActiveTab("execution");
        loadTasks();
      }
    } catch (err) {
      console.error("Task submission error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Upload Document
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || isUploading) return;

    setIsUploading(true);
    setUploadSuccessMessage(null);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", uploadFile);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const doc: DocumentRecord = await res.json();
        setUploadFile(null);
        if (doc.chunk_count > 0) {
          setUploadSuccessMessage(`Successfully indexed "${doc.filename}" with ${doc.chunk_count} verified vector chunks in Qdrant.`);
        } else {
          setUploadError(`Warning: "${doc.filename}" processed with 0 chunks. Document contained no readable text.`);
        }
        loadDocuments();
      } else {
        const err = await res.json();
        setUploadError(err.detail || "Upload and vector indexing failed.");
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadError(err.message || "Network error uploading document.");
    } finally {
      setIsUploading(false);
    }
  };

  // Delete Document (Server Qdrant & State sync)
  const handleDeleteDocument = async (docId: string, filename: string) => {
    if (!confirm(`Permanently remove "${filename}" and its vector chunks from Qdrant?`)) return;
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
        if (selectedDocIdForQa === docId) setSelectedDocIdForQa("all");
      } else {
        setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
      }
    } catch (err) {
      console.error("Delete error:", err);
      setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
    }
  };

  // Retry Failed Task
  const handleRetryTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        setCurrentTaskId(taskId);
        setActiveTab("execution");
        loadTasks();
      }
    } catch (err) {
      console.error("Retry task error:", err);
    }
  };

  // Copy Deliverable Markdown
  const copyDeliverable = () => {
    if (!currentTask?.final_deliverable) return;
    navigator.clipboard.writeText(currentTask.final_deliverable);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download Deliverable Markdown (.md)
  const downloadMarkdown = () => {
    if (!currentTask?.final_deliverable) return;
    const blob = new Blob([currentTask.final_deliverable], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deliverable-${(currentTask.task_id || "report").slice(0, 8)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download Deliverable Plain Text (.txt)
  const downloadText = () => {
    if (!currentTask?.final_deliverable) return;
    // Strip markdown formatting for pure plain text
    const plain = currentTask.final_deliverable.replace(/#+\s/g, "").replace(/\*\*|\*/g, "");
    const blob = new Blob([plain], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deliverable-${(currentTask.task_id || "report").slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // RAG Grounded Q&A Search via Real Backend API & Gemini
  const handleRagSearch = async (e?: React.FormEvent, overrideQuestion?: string) => {
    if (e) e.preventDefault();
    const queryToUse = overrideQuestion || ragQuestion;
    if (!queryToUse.trim() || isSearchingRag) return;

    // Check if selected document has 0 chunks
    if (selectedDocIdForQa !== "all") {
      const selectedDoc = documents.find((d) => d.document_id === selectedDocIdForQa);
      if (selectedDoc && selectedDoc.chunk_count === 0) {
        setRagError(`Document "${selectedDoc.filename}" has 0 indexed chunks and cannot be queried.`);
        return;
      }
    } else if (documents.length === 0 || documents.every((d) => d.chunk_count === 0)) {
      setRagError("No indexed documents with chunks available to query. Please upload a document with readable content first.");
      return;
    }

    setIsSearchingRag(true);
    setRagError(null);

    try {
      const recentHistory = ragHistory.slice(0, 4).reverse().map((h) => ({
        question: h.question,
        answer: h.answer,
      }));

      const res = await fetch("/api/documents/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryToUse,
          document_id: selectedDocIdForQa !== "all" ? selectedDocIdForQa : null,
          user_id: currentUser,
          top_k: 6,
          history: recentHistory,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const selectedDoc = documents.find((d) => d.document_id === selectedDocIdForQa);
        const targetDocName = selectedDoc ? selectedDoc.filename : "All Indexed Documents";

        const newEntry = {
          id: String(Date.now()),
          document_id: selectedDocIdForQa !== "all" ? selectedDocIdForQa : undefined,
          document_name: targetDocName,
          question: data.question || queryToUse,
          answer: data.answer,
          is_grounded: data.is_grounded,
          intent: data.intent || "specific",
          citations: data.citations || [],
          evidence_count: data.evidence_count || 0,
          timestamp: new Date().toLocaleTimeString(),
        };

        setRagHistory((prev) => [newEntry, ...prev]);
        setRagQuestion("");
      } else {
        const err = await res.json();
        setRagError(err.detail || "Query failed. Please verify the document index.");
      }
    } catch (err: any) {
      console.error("RAG Query error:", err);
      setRagError(err.message || "Network error querying vector database.");
    } finally {
      setIsSearchingRag(false);
    }
  };

  // Admin User Status Toggle
  const toggleUserStatus = (userId: string) => {
    setSystemUsers(
      systemUsers.map((u) => {
        if (u.id === userId) {
          return { ...u, status: u.status === "active" ? "disabled" : "active" };
        }
        return u;
      })
    );
  };

  // Status Badge Component
  const getStatusBadge = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#177D81]/25 text-[#BDDED6] border border-[#177D81]/50">
            <CheckCircle2 className="w-3 h-3 mr-1 text-[#BDDED6]" />
            Completed
          </span>
        );
      case "running":
      case "active":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#177D81]/30 text-[#BDDED6] border border-[#177D81] animate-pulse">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin text-[#BDDED6]" />
            Running
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/40 text-rose-300 border border-rose-800/60">
            <AlertCircle className="w-3 h-3 mr-1 text-rose-400" />
            Failed
          </span>
        );
      case "blocked":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/40 text-amber-300 border border-amber-800/60">
            <Clock className="w-3 h-3 mr-1 text-amber-400" />
            Blocked
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#08282A] text-slate-400 border border-[#1C5052]/80">
            <Clock className="w-3 h-3 mr-1 text-slate-500" />
            Pending
          </span>
        );
    }
  };

  // Metrics Calculations
  const stats = useMemo(() => {
    const total = tasksList.length;
    const completed = tasksList.filter((t) => t.status === "completed").length;
    const failed = tasksList.filter((t) => t.status === "failed").length;
    const running = tasksList.filter((t) => ["running", "pending"].includes(t.status)).length;
    const totalChunks = documents.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
    return { total, completed, failed, running, totalDocs: documents.length, totalChunks };
  }, [tasksList, documents]);

  // Filtered Tasks for Task History
  const filteredHistoryTasks = useMemo(() => {
    return tasksList.filter((t) => {
      const matchesSearch =
        t.original_request.toLowerCase().includes(historySearch.toLowerCase()) ||
        t.task_id.toLowerCase().includes(historySearch.toLowerCase());
      const matchesStatus =
        historyStatusFilter === "all" || t.status.toLowerCase() === historyStatusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [tasksList, historySearch, historyStatusFilter]);

  // Paginated History Tasks
  const paginatedTasks = useMemo(() => {
    const startIndex = (historyPage - 1) * tasksPerPage;
    return filteredHistoryTasks.slice(startIndex, startIndex + tasksPerPage);
  }, [filteredHistoryTasks, historyPage]);

  const totalHistoryPages = Math.ceil(filteredHistoryTasks.length / tasksPerPage) || 1;

  // Filtered Documents for Documents View
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesQuery = doc.filename.toLowerCase().includes(docSearchQuery.toLowerCase());
      const ext = doc.filename.split(".").pop()?.toLowerCase();
      const matchesType =
        docFilterType === "all" ||
        (docFilterType === "pdf" && ext === "pdf") ||
        (docFilterType === "docx" && ext === "docx") ||
        (docFilterType === "txt" && ext === "txt");
      return matchesQuery && matchesType;
    });
  }, [documents, docSearchQuery, docFilterType]);

  // Five Agents Definition
  const AGENTS_LIST = [
    {
      key: "planner",
      label: "Planner Agent",
      role: "Goal Decomposition & Subtask Allocation",
      desc: "Deconstructs natural-language tasks into structured subtasks, establishes constraints, and maps dependencies.",
      data: currentTask?.plan,
    },
    {
      key: "researcher",
      label: "Researcher Agent",
      role: "RAG Retrieval & Web Research",
      desc: "Searches Qdrant vector index and external knowledge to extract citations and grounded context.",
      data: currentTask?.research_results || currentTask?.retrieved_evidence,
    },
    {
      key: "analyst",
      label: "Analyst Agent",
      role: "Constraint Verification & Trade-off Analysis",
      desc: "Evaluates findings against user criteria, scores competing options, and builds structured trade-off matrices.",
      data: currentTask?.analysis_results,
    },
    {
      key: "executor",
      label: "Executor Agent",
      role: "Deliverable Generation",
      desc: "Synthesizes agent outputs into a comprehensive, production-grade deliverable report with verified findings.",
      data: currentTask?.execution_results || currentTask?.final_deliverable,
    },
    {
      key: "verifier",
      label: "Verifier Agent",
      role: "Quality Audit & Final Approval",
      desc: "Performs strict quality-gate checks, screens for hallucinations, verifies citations, and signs off on output.",
      data: currentTask?.verification_results,
    },
  ];

  // Breadcrumb helper
  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case "dashboard":
        return "Home Dashboard";
      case "new_task":
        return "New Autonomous Task";
      case "execution":
        return "Agent Workflow Execution";
      case "rag":
        return "Knowledge & RAG";
      case "documents":
        return "Document Repository";
      case "deliverable":
        return "Deliverable Reports";
      case "history":
        return "Task History";
      case "settings":
        return "Settings & Preferences";
      case "admin":
        return "Administration Dashboard";
    }
  };

  return (
    <div className="flex h-screen bg-[#0F1515] text-white overflow-hidden font-sans">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* ========================================================= */}
      {/* 3. GLOBAL APPLICATION LAYOUT — LEFT SIDEBAR */}
      {/* ========================================================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#08282A] border-r border-[#1C5052] flex flex-col transition-all duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "lg:w-20" : "lg:w-64"} w-64`}
      >
        {/* Logo & Platform Name */}
        <div className="h-16 px-4 border-b border-[#1C5052] flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-8 h-8 rounded bg-[#177D81] flex items-center justify-center shrink-0">
              <BrainCircuit className="w-5 h-5 text-[#BDDED6]" />
            </div>
            {!sidebarCollapsed && (
              <div className="leading-tight overflow-hidden">
                <span className="font-semibold text-sm tracking-wide text-white block truncate">
                  Multi-Agent AI
                </span>
                <span className="text-[10px] text-[#BDDED6] font-mono block truncate">
                  Enterprise Platform
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1">
            {/* Desktop Collapse Toggle */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              className="hidden lg:flex p-1.5 rounded hover:bg-[#1C5052] text-slate-300 hover:text-white transition-colors"
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 rounded hover:bg-[#1C5052] text-slate-300 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* System Status Pill */}
        {!sidebarCollapsed && (
          <div className="px-3 py-2.5 mx-3 my-3 rounded bg-[#1C5052]/40 border border-[#1C5052] flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  systemReady?.ready ? "bg-[#BDDED6]" : "bg-amber-400"
                }`}
              />
              <span className="text-slate-300 text-[11px]">System Status</span>
            </div>
            <span className="font-mono text-[10px] text-[#BDDED6] font-medium">
              {systemReady?.ready ? "Operational" : "Ready"}
            </span>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto pt-1">
          <button
            onClick={() => {
              setActiveTab("dashboard");
              setMobileMenuOpen(false);
            }}
            title="Home"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "justify-center px-2" : "px-3"
            } py-2.5 rounded text-xs font-medium transition-colors ${
              activeTab === "dashboard"
                ? "bg-[#177D81] text-white"
                : "text-slate-300 hover:text-white hover:bg-[#1C5052]/50"
            }`}
          >
            <HomeIcon className="w-4 h-4 text-[#BDDED6] shrink-0" />
            {!sidebarCollapsed && <span className="ml-3 truncate">Home</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab("new_task");
              setMobileMenuOpen(false);
            }}
            title="New Autonomous Task"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "justify-center px-2" : "px-3"
            } py-2.5 rounded text-xs font-medium transition-colors ${
              activeTab === "new_task"
                ? "bg-[#177D81] text-white"
                : "text-slate-300 hover:text-white hover:bg-[#1C5052]/50"
            }`}
          >
            <PlusCircle className="w-4 h-4 text-[#BDDED6] shrink-0" />
            {!sidebarCollapsed && <span className="ml-3 truncate">New Autonomous Task</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab("execution");
              setMobileMenuOpen(false);
            }}
            title="Agent Workflow"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "justify-center px-2" : "px-3"
            } py-2.5 rounded text-xs font-medium transition-colors ${
              activeTab === "execution"
                ? "bg-[#177D81] text-white"
                : "text-slate-300 hover:text-white hover:bg-[#1C5052]/50"
            }`}
          >
            <Layers className="w-4 h-4 text-[#BDDED6] shrink-0" />
            {!sidebarCollapsed && <span className="ml-3 truncate">Agent Workflow</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab("rag");
              setMobileMenuOpen(false);
            }}
            title="Knowledge & RAG"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "justify-center px-2" : "px-3"
            } py-2.5 rounded text-xs font-medium transition-colors ${
              activeTab === "rag"
                ? "bg-[#177D81] text-white"
                : "text-slate-300 hover:text-white hover:bg-[#1C5052]/50"
            }`}
          >
            <Database className="w-4 h-4 text-[#BDDED6] shrink-0" />
            {!sidebarCollapsed && <span className="ml-3 truncate">Knowledge & RAG</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab("documents");
              setMobileMenuOpen(false);
            }}
            title="Documents"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "justify-center px-2" : "px-3"
            } py-2.5 rounded text-xs font-medium transition-colors ${
              activeTab === "documents"
                ? "bg-[#177D81] text-white"
                : "text-slate-300 hover:text-white hover:bg-[#1C5052]/50"
            }`}
          >
            <Files className="w-4 h-4 text-[#BDDED6] shrink-0" />
            {!sidebarCollapsed && <span className="ml-3 truncate">Documents</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab("deliverable");
              setMobileMenuOpen(false);
            }}
            title="Deliverable Reports"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "justify-center px-2" : "px-3"
            } py-2.5 rounded text-xs font-medium transition-colors ${
              activeTab === "deliverable"
                ? "bg-[#177D81] text-white"
                : "text-slate-300 hover:text-white hover:bg-[#1C5052]/50"
            }`}
          >
            <FileText className="w-4 h-4 text-[#BDDED6] shrink-0" />
            {!sidebarCollapsed && <span className="ml-3 truncate">Deliverable Reports</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab("history");
              setMobileMenuOpen(false);
            }}
            title="Task History"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "justify-center px-2" : "px-3"
            } py-2.5 rounded text-xs font-medium transition-colors ${
              activeTab === "history"
                ? "bg-[#177D81] text-white"
                : "text-slate-300 hover:text-white hover:bg-[#1C5052]/50"
            }`}
          >
            <History className="w-4 h-4 text-[#BDDED6] shrink-0" />
            {!sidebarCollapsed && <span className="ml-3 truncate">Task History</span>}
          </button>

          <div className="pt-2 pb-1">
            <div className="border-t border-[#1C5052]/50 my-2" />
          </div>

          <button
            onClick={() => {
              setActiveTab("settings");
              setMobileMenuOpen(false);
            }}
            title="Settings"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "justify-center px-2" : "px-3"
            } py-2.5 rounded text-xs font-medium transition-colors ${
              activeTab === "settings"
                ? "bg-[#177D81] text-white"
                : "text-slate-300 hover:text-white hover:bg-[#1C5052]/50"
            }`}
          >
            <SettingsIcon className="w-4 h-4 text-[#BDDED6] shrink-0" />
            {!sidebarCollapsed && <span className="ml-3 truncate">Settings</span>}
          </button>

          {/* Admin Navigation — Only for authorized administrators */}
          {isAdmin && (
            <button
              onClick={() => {
                setActiveTab("admin");
                setMobileMenuOpen(false);
              }}
              title="Admin Panel"
              className={`w-full flex items-center ${
                sidebarCollapsed ? "justify-center px-2" : "justify-between px-3"
              } py-2.5 rounded text-xs font-medium transition-colors ${
                activeTab === "admin"
                  ? "bg-[#177D81] text-white"
                  : "text-slate-300 hover:text-white hover:bg-[#1C5052]/50"
              }`}
            >
              <div className="flex items-center overflow-hidden">
                <Shield className="w-4 h-4 text-[#BDDED6] shrink-0" />
                {!sidebarCollapsed && <span className="ml-3 truncate">Admin Panel</span>}
              </div>
              {!sidebarCollapsed && (
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#1C5052] text-[#BDDED6] border border-[#BDDED6]/20">
                  Admin
                </span>
              )}
            </button>
          )}
        </nav>

        {/* User Profile & Role Controls at Bottom */}
        <div className="p-3 border-t border-[#1C5052] bg-[#08282A]">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded bg-[#1C5052] flex items-center justify-center text-[#BDDED6] font-semibold text-xs border border-[#BDDED6]/30 shrink-0">
                {currentUser[0]?.toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div className="leading-tight overflow-hidden">
                  <p className="text-white font-medium text-xs truncate max-w-[110px]">{currentUser}</p>
                  <p className="text-[10px] text-[#BDDED6] truncate">
                    {isAdmin ? "Super Administrator" : "Standard User"}
                  </p>
                </div>
              )}
            </div>

            {!sidebarCollapsed && (
              <button
                onClick={() => setIsAdmin(!isAdmin)}
                title="Toggle Admin Privilege"
                className="text-[10px] font-mono text-[#BDDED6] hover:text-white bg-[#1C5052] hover:bg-[#177D81] px-2 py-1 rounded border border-[#BDDED6]/20 transition-colors"
              >
                {isAdmin ? "Admin" : "User"}
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 3. GLOBAL APPLICATION LAYOUT — MAIN VIEWPORT */}
      {/* ========================================================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0F1515]">
        {/* Top Header */}
        <header className="h-16 border-b border-[#1C5052] px-6 flex items-center justify-between bg-[#08282A] shrink-0 z-10">
          <div className="flex items-center space-x-3">
            {/* Hamburger for Mobile */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded text-slate-300 hover:text-white hover:bg-[#1C5052]"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb Navigation */}
            <div>
              <div className="flex items-center space-x-2 text-[11px] text-[#BDDED6]">
                <span>Platform</span>
                <ChevronRight className="w-3 h-3 text-slate-500" />
                <span className="text-white font-medium">{getBreadcrumbTitle()}</span>
              </div>
              <h1 className="text-xs font-semibold text-slate-300 tracking-wide uppercase mt-0.5">
                Multi-Agent Autonomous Orchestration
              </h1>
            </div>
          </div>

          {/* Header Action Tools */}
          <div className="flex items-center space-x-3">
            {/* Active Task Indicator */}
            {currentTask && (
              <div className="hidden md:flex items-center space-x-2 text-xs font-mono text-slate-300 bg-[#1C5052] px-3 py-1.5 rounded border border-[#BDDED6]/20">
                <span className="text-[#BDDED6]">Task:</span>
                <span>{currentTask.task_id.slice(0, 8)}</span>
                <span className="text-slate-400">|</span>
                {getStatusBadge(currentTask.status)}
              </div>
            )}

            {/* Refresh Action */}
            <button
              onClick={() => {
                loadTasks();
                loadDocuments();
                fetchReadyStatus();
              }}
              title={`Last refreshed at ${lastRefreshed}. Click to sync.`}
              className="p-2 rounded bg-[#1C5052] hover:bg-[#177D81] text-[#BDDED6] hover:text-white border border-[#BDDED6]/20 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* + New Task Primary Action */}
            <button
              onClick={() => setActiveTab("new_task")}
              className="inline-flex items-center px-3.5 py-1.5 rounded text-xs font-semibold bg-[#177D81] hover:bg-[#1B8E93] text-white transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Task
            </button>

            {/* User Dropdown / Logout Trigger */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center space-x-2 p-1.5 rounded hover:bg-[#1C5052] text-xs text-slate-300 hover:text-white transition-colors"
              >
                <div className="w-6 h-6 rounded bg-[#1C5052] text-[#BDDED6] flex items-center justify-center font-bold text-xs border border-[#BDDED6]/20">
                  {currentUser[0]?.toUpperCase()}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#08282A] border border-[#1C5052] rounded-lg shadow-xl p-2 z-50 text-xs space-y-1">
                  <div className="px-3 py-2 border-b border-[#1C5052] mb-1">
                    <p className="font-semibold text-white truncate">{currentUser}</p>
                    <p className="text-[10px] text-[#BDDED6]">
                      {isAdmin ? "Super Administrator" : "Standard User"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab("settings");
                      setUserMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded hover:bg-[#1C5052] text-slate-200"
                  >
                    Account Settings
                  </button>
                  <button
                    onClick={() => {
                      setIsAdmin(!isAdmin);
                      setUserMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded hover:bg-[#1C5052] text-[#BDDED6]"
                  >
                    Switch to {isAdmin ? "Standard User" : "Administrator"}
                  </button>
                  <div className="border-t border-[#1C5052] my-1" />
                  <button
                    onClick={() => {
                      alert("Signed out of session. Session state reset.");
                      setUserMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded hover:bg-rose-950/40 text-rose-300 flex items-center"
                  >
                    <LogOut className="w-3.5 h-3.5 mr-2" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable View Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {/* ========================================================= */}
          {/* 4.A HOME DASHBOARD */}
          {/* ========================================================= */}
          {activeTab === "dashboard" && (
            <div className="max-w-6xl mx-auto space-y-8">
              {/* Simple Welcome Banner */}
              <div className="rounded-lg bg-[#1C5052] border border-[#BDDED6]/20 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Welcome to Multi-Agent AI Platform
                  </h2>
                  <p className="text-xs text-[#BDDED6] mt-1 max-w-2xl leading-relaxed">
                    Enterprise orchestration for autonomous multi-agent task planning, Qdrant dense vector RAG,
                    cross-agent trade-off analysis, and verified deliverable generation with automated quality gates.
                  </p>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <button
                    onClick={() => setActiveTab("new_task")}
                    className="inline-flex items-center px-4 py-2 rounded text-xs font-semibold bg-[#177D81] hover:bg-[#1B8E93] text-white transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Create New Task
                  </button>
                  <button
                    onClick={() => setActiveTab("rag")}
                    className="inline-flex items-center px-3.5 py-2 rounded text-xs font-medium bg-[#08282A] hover:bg-[#08282A]/80 text-[#BDDED6] border border-[#BDDED6]/30 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5 text-[#BDDED6]" />
                    Upload Documents
                  </button>
                </div>
              </div>

              {/* Statistics Overview Cards — Using #1C5052 for prominent visual distinction */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-lg bg-[#1C5052] border border-[#BDDED6]/20 p-5">
                  <div className="flex items-center justify-between text-[#BDDED6] text-xs font-medium mb-1.5">
                    <span>Total Tasks</span>
                    <Layers className="w-4 h-4 text-[#BDDED6]" />
                  </div>
                  <div className="text-2xl font-bold text-white">{stats.total}</div>
                  <p className="text-[11px] text-slate-300 mt-1">Submitted pipeline workloads</p>
                </div>

                <div className="rounded-lg bg-[#1C5052] border border-[#BDDED6]/20 p-5">
                  <div className="flex items-center justify-between text-[#BDDED6] text-xs font-medium mb-1.5">
                    <span>Completed Tasks</span>
                    <CheckCircle2 className="w-4 h-4 text-[#BDDED6]" />
                  </div>
                  <div className="text-2xl font-bold text-[#BDDED6]">{stats.completed}</div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    {stats.total > 0
                      ? `${Math.round((stats.completed / stats.total) * 100)}% successful delivery`
                      : "Ready"}
                  </p>
                </div>

                <div className="rounded-lg bg-[#1C5052] border border-[#BDDED6]/20 p-5">
                  <div className="flex items-center justify-between text-[#BDDED6] text-xs font-medium mb-1.5">
                    <span>Active & Failed</span>
                    <Activity className="w-4 h-4 text-[#BDDED6]" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {stats.running} <span className="text-xs text-slate-300 font-normal">running</span> /{" "}
                    {stats.failed} <span className="text-xs text-slate-300 font-normal">failed</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">Worker pool status</p>
                </div>

                <div className="rounded-lg bg-[#1C5052] border border-[#BDDED6]/20 p-5">
                  <div className="flex items-center justify-between text-[#BDDED6] text-xs font-medium mb-1.5">
                    <span>Knowledge Documents</span>
                    <Database className="w-4 h-4 text-[#BDDED6]" />
                  </div>
                  <div className="text-2xl font-bold text-white">{stats.totalDocs}</div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    {stats.totalChunks} indexed chunks in Qdrant
                  </p>
                </div>
              </div>

              {/* Grid: Recent Activity & Deliverable Reports */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Task Activity (2 columns) */}
                <div className="lg:col-span-2 rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                        Recent Task Activity
                      </h3>
                      <p className="text-[11px] text-slate-400">Latest pipeline executions and status</p>
                    </div>
                    <button
                      onClick={() => setActiveTab("history")}
                      className="text-xs text-[#BDDED6] hover:underline flex items-center font-medium"
                    >
                      View All <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  </div>

                  {tasksList.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs border border-dashed border-[#1C5052] rounded">
                      <Layers className="w-8 h-8 mx-auto mb-2 opacity-30 text-[#BDDED6]" />
                      <p>No task activity recorded yet.</p>
                      <button
                        onClick={() => setActiveTab("new_task")}
                        className="mt-3 text-[#BDDED6] hover:underline"
                      >
                        Submit your first autonomous task
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-[#1C5052] text-slate-400 text-[11px]">
                            <th className="py-2.5 font-medium">Task ID</th>
                            <th className="py-2.5 font-medium">Task Objective</th>
                            <th className="py-2.5 font-medium">Date</th>
                            <th className="py-2.5 font-medium">Status</th>
                            <th className="py-2.5 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1C5052]/50">
                          {tasksList.slice(0, 5).map((task) => (
                            <tr key={task.task_id} className="hover:bg-[#1C5052]/30 transition-colors">
                              <td className="py-3 font-mono text-slate-400">{task.task_id.slice(0, 8)}</td>
                              <td className="py-3 font-medium text-slate-100 max-w-xs truncate pr-3">
                                {task.original_request}
                              </td>
                              <td className="py-3 text-[11px] text-slate-400 whitespace-nowrap">
                                {task.created_at ? new Date(task.created_at).toLocaleDateString() : "--"}
                              </td>
                              <td className="py-3">{getStatusBadge(task.status)}</td>
                              <td className="py-3 text-right">
                                <button
                                  onClick={() => {
                                    setCurrentTaskId(task.task_id);
                                    setCurrentTask(task);
                                    setActiveTab(task.final_deliverable ? "deliverable" : "execution");
                                  }}
                                  className="text-xs text-[#BDDED6] hover:text-white px-2.5 py-1 rounded bg-[#1C5052] hover:bg-[#177D81] border border-[#BDDED6]/20 transition-colors"
                                >
                                  {task.final_deliverable ? "Report" : "Workflow"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Recent Deliverable Reports (1 column) */}
                <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                        Recent Deliverables
                      </h3>
                      <p className="text-[11px] text-slate-400">Verified audit reports</p>
                    </div>
                    <button
                      onClick={() => setActiveTab("deliverable")}
                      className="text-xs text-[#BDDED6] hover:underline font-medium"
                    >
                      Open
                    </button>
                  </div>

                  {tasksList.filter((t) => t.final_deliverable).length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs border border-dashed border-[#1C5052] rounded">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-30 text-[#BDDED6]" />
                      <p>No verified deliverables generated yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tasksList
                        .filter((t) => t.final_deliverable)
                        .slice(0, 4)
                        .map((task) => (
                          <div
                            key={task.task_id}
                            onClick={() => {
                              setCurrentTaskId(task.task_id);
                              setCurrentTask(task);
                              setActiveTab("deliverable");
                            }}
                            className="p-3 rounded bg-[#1C5052] hover:bg-[#1C5052]/80 border border-[#BDDED6]/20 cursor-pointer transition-colors space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-mono text-slate-300">{task.task_id.slice(0, 8)}</span>
                              <span className="text-[#BDDED6] flex items-center font-medium">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                Verified
                              </span>
                            </div>
                            <p className="text-xs text-white line-clamp-1 font-medium">
                              {task.original_request}
                            </p>
                            <p className="text-[10px] text-slate-300">
                              {task.created_at ? new Date(task.created_at).toLocaleDateString() : ""}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4.B NEW AUTONOMOUS TASK */}
          {/* ========================================================= */}
          {activeTab === "new_task" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Create Autonomous Task</h2>
                <p className="text-xs text-[#BDDED6] mt-1">
                  Specify your complex task requirements in natural language. The autonomous pipeline breaks down the
                  objective, searches your indexed Qdrant documents, performs multi-agent analysis, and audits the result.
                </p>
              </div>

              {/* Task Form */}
              <form onSubmit={handleSubmitTask} className="space-y-6">
                <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                      Task Specification & Objective
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">{prompt.length} characters</span>
                  </div>

                  <textarea
                    rows={6}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.g., Compare top enterprise vector databases (Qdrant vs Pinecone) with benchmarks, memory consumption, latency under 10M embeddings, cost models, and recommend the best choice with citations..."
                    className="w-full bg-[#0F1515] border border-[#1C5052] rounded p-3.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-[#177D81] transition-colors leading-relaxed resize-none"
                  />

                  {/* Task Execution Options */}
                  <div className="pt-3 border-t border-[#1C5052] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    {/* Knowledge Grounding Toggle */}
                    <div className="p-3 rounded bg-[#1C5052] border border-[#BDDED6]/20 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-white block">Knowledge Grounding</span>
                        <span className="text-[10px] text-slate-300 block">Qdrant vector RAG</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEnableRagGrounding(!enableRagGrounding)}
                        className={`w-9 h-5 flex items-center rounded-full p-1 transition-colors ${
                          enableRagGrounding ? "bg-[#177D81]" : "bg-[#08282A] border border-[#1C5052]"
                        }`}
                      >
                        <div
                          className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${
                            enableRagGrounding ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Verification Rigor Selector */}
                    <div className="p-3 rounded bg-[#1C5052] border border-[#BDDED6]/20 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-white block">Verification Rigor</span>
                        <span className="text-[10px] text-slate-300 block">Audit gate standard</span>
                      </div>
                      <select
                        value={verificationRigor}
                        onChange={(e) => setVerificationRigor(e.target.value as any)}
                        className="bg-[#08282A] border border-[#1C5052] text-[#BDDED6] text-xs rounded px-2 py-1 outline-none font-medium"
                      >
                        <option value="strict">Strict Audit</option>
                        <option value="standard">Standard</option>
                      </select>
                    </div>

                    {/* Execution Pipeline Selector */}
                    <div className="p-3 rounded bg-[#1C5052] border border-[#BDDED6]/20 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-white block">Execution Pipeline</span>
                        <span className="text-[10px] text-slate-300 block">5-agent coordination</span>
                      </div>
                      <select
                        value={executionMode}
                        onChange={(e) => setExecutionMode(e.target.value as any)}
                        className="bg-[#08282A] border border-[#1C5052] text-[#BDDED6] text-xs rounded px-2 py-1 outline-none font-medium"
                      >
                        <option value="deep">Deep Analysis</option>
                        <option value="standard">Standard Flow</option>
                      </select>
                    </div>
                  </div>

                  {/* Submit Button Bar */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#1C5052]">
                    <span className="text-[11px] text-slate-400">
                      Decomposed into Planner, Researcher, Analyst, Executor, and Verifier tasks.
                    </span>
                    <button
                      type="submit"
                      disabled={isSubmitting || !prompt.trim()}
                      className="inline-flex items-center px-5 py-2.5 rounded text-xs font-semibold bg-[#177D81] hover:bg-[#1B8E93] text-white transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                          Decomposing & Executing...
                        </>
                      ) : (
                        <>
                          Submit Task
                          <ArrowRight className="w-3.5 h-3.5 ml-2" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>

              {/* Optional Document Upload Section */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                      Ground with Documents (Optional)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Upload supporting documents for this task. They will be indexed into Qdrant for semantic RAG.
                    </p>
                  </div>
                  <span className="text-[11px] text-[#BDDED6] font-mono">
                    {documents.length} document(s) available
                  </span>
                </div>

                <form onSubmit={handleUploadDocument} className="flex flex-col sm:flex-row items-center gap-3">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#1C5052] file:text-[#BDDED6] hover:file:bg-[#177D81] file:cursor-pointer cursor-pointer bg-[#0F1515] p-2 rounded border border-[#1C5052]"
                  />
                  <button
                    type="submit"
                    disabled={isUploading || !uploadFile}
                    className="inline-flex items-center px-4 py-2 rounded text-xs font-medium bg-[#177D81] hover:bg-[#1B8E93] text-white shrink-0 disabled:opacity-50 transition-colors"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                        Indexing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3 h-3 mr-1.5" />
                        Index Document
                      </>
                    )}
                  </button>
                </form>

                {uploadSuccessMessage && (
                  <p className="text-xs text-[#BDDED6] bg-[#1C5052] p-2.5 rounded border border-[#177D81]">
                    {uploadSuccessMessage}
                  </p>
                )}

                <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                  <HelpCircle className="w-3.5 h-3.5 text-[#BDDED6]" />
                  <span>Supported formats: PDF, DOCX, TXT (Maximum file size: 25MB)</span>
                </div>
              </div>

              {/* Example Workflows */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider block">
                  Example Enterprise Workflows
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    "Research and compare the top 2 enterprise vector databases (Qdrant vs Pinecone) with benchmarks and cost analysis.",
                    "Plan and architect a scalable microservices architecture for a real-time collaborative document editor.",
                    "Evaluate high-performance open-source LLM serving frameworks (vLLM vs TGI vs Ollama) for production deployment.",
                    "I need a mobile phone under ₹20,000. Compare display, battery, camera, and processor performance.",
                  ].map((example, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPrompt(example)}
                      className="text-left p-3.5 rounded bg-[#1C5052] hover:bg-[#1C5052]/80 border border-[#BDDED6]/20 text-xs text-white transition-colors leading-relaxed"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4.C AGENT WORKFLOW */}
          {/* ========================================================= */}
          {activeTab === "execution" && (
            <div className="max-w-5xl mx-auto space-y-8">
              {!currentTask ? (
                <div className="text-center py-20 text-slate-400 rounded-lg bg-[#08282A] border border-[#1C5052]">
                  <Layers className="w-10 h-10 mx-auto mb-3 opacity-30 text-[#BDDED6]" />
                  <p className="text-xs">No active workflow execution selected.</p>
                  <button
                    onClick={() => setActiveTab("new_task")}
                    className="mt-3 text-xs text-[#BDDED6] hover:underline"
                  >
                    Submit a new task to view real-time coordination
                  </button>
                </div>
              ) : (
                <>
                  {/* Task Execution Summary Header */}
                  <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono text-[#BDDED6]">
                          Task ID: {currentTask.task_id}
                        </span>
                        {getStatusBadge(currentTask.status)}
                      </div>
                      <div className="flex items-center space-x-2">
                        {currentTask.status === "failed" && (
                          <button
                            onClick={() => handleRetryTask(currentTask.task_id)}
                            className="inline-flex items-center px-3 py-1 rounded text-xs bg-[#177D81] hover:bg-[#1B8E93] text-white"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Retry Task
                          </button>
                        )}
                        {currentTask.final_deliverable && (
                          <button
                            onClick={() => setActiveTab("deliverable")}
                            className="inline-flex items-center px-3 py-1 rounded text-xs bg-[#177D81] hover:bg-[#1B8E93] text-white"
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            View Final Report
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-white font-medium">{currentTask.original_request}</p>
                    {currentTask.plan?.objective && (
                      <p className="text-[11px] text-slate-300">
                        <span className="text-[#BDDED6]">Objective:</span> {currentTask.plan.objective}
                      </p>
                    )}
                  </div>

                  {/* Five Agents Workflow Stepper — Structured cards in #1C5052 */}
                  <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                        Autonomous Five-Agent Workflow
                      </h3>
                      <span className="text-[11px] text-slate-400">LangGraph Pipeline</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      {AGENTS_LIST.map((agent) => {
                        const agentStatus = currentTask.agent_statuses?.[agent.key] || "pending";
                        return (
                          <div
                            key={agent.key}
                            onClick={() => setSelectedAgentDetail(agent)}
                            className="rounded bg-[#1C5052] hover:bg-[#1C5052]/80 border border-[#BDDED6]/20 p-4 flex flex-col justify-between space-y-3 cursor-pointer transition-colors shadow-sm"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-bold text-white">{agent.label}</span>
                              </div>
                              <p className="text-[10px] text-[#BDDED6] font-mono leading-tight">{agent.role}</p>
                              <p className="text-[11px] text-slate-200 mt-2 line-clamp-2 leading-relaxed">
                                {agent.desc}
                              </p>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-[#08282A]/50">
                              {getStatusBadge(agentStatus)}
                              <span className="text-[10px] text-[#BDDED6] hover:underline">Inspect</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Decomposed Subtasks Tree */}
                  {currentTask.plan && (
                    <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                          Decomposed Subtasks ({currentTask.subtasks?.length || 0})
                        </h3>
                        <span className="text-[11px] font-mono text-slate-400">
                          Constraints: {currentTask.plan.constraints?.length || 0}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {currentTask.subtasks?.map((st) => (
                          <div
                            key={st.id}
                            className="p-3 rounded bg-[#1C5052] border border-[#BDDED6]/20 flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-mono text-xs text-[#BDDED6] font-semibold">[{st.id}]</span>
                                <span className="text-xs font-medium text-white">{st.title}</span>
                                <span className="text-[10px] text-[#BDDED6] font-mono px-1.5 py-0.5 rounded bg-[#08282A]">
                                  @{st.assigned_agent}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-200">{st.description}</p>
                              {st.output && (
                                <p className="text-[10px] text-[#BDDED6] font-mono mt-1 line-clamp-2">
                                  Output: {st.output}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0">{getStatusBadge(st.status)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Execution Event Stream */}
                  <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                        Live Execution Event Stream ({currentTask.events?.length || 0})
                      </h3>
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] text-slate-400">Stage Filter:</span>
                        <select
                          value={eventFilterStage}
                          onChange={(e) => setEventFilterStage(e.target.value)}
                          className="bg-[#0F1515] border border-[#1C5052] text-xs text-[#BDDED6] rounded px-2 py-1 outline-none font-medium"
                        >
                          <option value="all">All Stages</option>
                          <option value="workflow">Workflow</option>
                          <option value="planner">Planner</option>
                          <option value="researcher">Researcher</option>
                          <option value="analyst">Analyst</option>
                          <option value="executor">Executor</option>
                          <option value="verifier">Verifier</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-2 font-mono text-xs divide-y divide-[#1C5052]/50">
                      {currentTask.events
                        ?.filter(
                          (ev) =>
                            eventFilterStage === "all" ||
                            ev.stage.toLowerCase() === eventFilterStage.toLowerCase()
                        )
                        .map((ev, idx) => (
                          <div key={idx} className="flex items-start space-x-3 py-2 text-slate-300">
                            <span className="text-[10px] text-slate-500 whitespace-nowrap pt-0.5">
                              {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "--:--"}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#1C5052] text-[#BDDED6] uppercase shrink-0 font-semibold">
                              {ev.stage}
                            </span>
                            <span className="text-slate-100 text-xs leading-normal">{ev.message}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Modal for Agent Detail */}
          {selectedAgentDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
              <div className="w-full max-w-2xl bg-[#08282A] border border-[#1C5052] rounded-lg p-6 space-y-4 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-[#1C5052] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedAgentDetail.label}</h3>
                    <p className="text-xs text-[#BDDED6]">{selectedAgentDetail.role}</p>
                  </div>
                  <button
                    onClick={() => setSelectedAgentDetail(null)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 text-xs text-slate-200">
                  <p className="text-slate-300 leading-relaxed">{selectedAgentDetail.desc}</p>
                  <div className="p-3 bg-[#0F1515] rounded border border-[#1C5052] font-mono text-[11px] overflow-x-auto">
                    {selectedAgentDetail.data ? (
                      <pre>{JSON.stringify(selectedAgentDetail.data, null, 2)}</pre>
                    ) : (
                      <p className="text-slate-500">No output generated yet for this agent stage.</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t border-[#1C5052]">
                  <button
                    onClick={() => setSelectedAgentDetail(null)}
                    className="px-4 py-1.5 rounded text-xs bg-[#177D81] hover:bg-[#1B8E93] text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4.D FINAL DELIVERABLE REPORT */}
          {/* ========================================================= */}
          {activeTab === "deliverable" && (
            <div className={`max-w-5xl mx-auto space-y-6 ${isFullScreenReport ? "max-w-none" : ""}`}>
              {!currentTask?.final_deliverable ? (
                <div className="text-center py-20 text-slate-400 rounded-lg bg-[#08282A] border border-[#1C5052]">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30 text-[#BDDED6]" />
                  <p className="text-xs">No deliverable report generated for this task yet.</p>
                  <button
                    onClick={() => setActiveTab("new_task")}
                    className="mt-3 text-xs text-[#BDDED6] hover:underline"
                  >
                    Execute an autonomous task to generate a verified report
                  </button>
                </div>
              ) : (
                <>
                  {/* Report Header Bar */}
                  <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono text-[#BDDED6]">
                          Task ID: {currentTask.task_id.slice(0, 8)}
                        </span>
                        {getStatusBadge(currentTask.status)}
                      </div>
                      <h2 className="text-lg font-bold text-white mt-1">Verified Final Deliverable</h2>
                      <p className="text-xs text-slate-300">{currentTask.original_request}</p>
                    </div>

                    {/* Report Actions: Copy, Download MD, Download TXT, Fullscreen, Print */}
                    <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-2">
                      <button
                        onClick={copyDeliverable}
                        className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium bg-[#1C5052] hover:bg-[#177D81] text-white border border-[#BDDED6]/20 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5 text-[#BDDED6]" />
                        {copied ? "Copied!" : "Copy Report"}
                      </button>

                      <button
                        onClick={downloadMarkdown}
                        className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium bg-[#1C5052] hover:bg-[#177D81] text-white border border-[#BDDED6]/20 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5 text-[#BDDED6]" />
                        Download Markdown
                      </button>

                      <button
                        onClick={downloadText}
                        className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium bg-[#1C5052] hover:bg-[#177D81] text-white border border-[#BDDED6]/20 transition-colors"
                      >
                        <FileCode className="w-3.5 h-3.5 mr-1.5 text-[#BDDED6]" />
                        Download TXT
                      </button>

                      <button
                        onClick={() => window.print()}
                        className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium bg-[#1C5052] hover:bg-[#177D81] text-white border border-[#BDDED6]/20 transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5 mr-1.5 text-[#BDDED6]" />
                        Print
                      </button>

                      <button
                        onClick={() => setIsFullScreenReport(!isFullScreenReport)}
                        title={isFullScreenReport ? "Exit Fullscreen" : "Fullscreen Reading Mode"}
                        className="p-1.5 rounded bg-[#1C5052] hover:bg-[#177D81] text-[#BDDED6] hover:text-white border border-[#BDDED6]/20"
                      >
                        {isFullScreenReport ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Verifier Quality Gate Audit Card */}
                  {currentTask.verification_results && (
                    <div className="rounded-lg bg-[#1C5052] border border-[#BDDED6]/30 p-5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#08282A]/40 pb-3">
                        <div className="flex items-center space-x-2">
                          <ShieldCheck className="w-5 h-5 text-[#BDDED6]" />
                          <span className="text-xs font-bold uppercase tracking-wider text-white">
                            Verifier Quality Gate Audit
                          </span>
                        </div>
                        <div className="flex items-center space-x-3 text-xs">
                          <span className="text-slate-200">
                            Audit Decision:{" "}
                            <strong
                              className={
                                currentTask.verification_results.is_approved ? "text-[#BDDED6]" : "text-rose-400"
                              }
                            >
                              {currentTask.verification_results.is_approved ? "APPROVED" : "FLAGGED"}
                            </strong>
                          </span>
                          <span className="text-slate-400">|</span>
                          <span className="text-slate-200">
                            Completeness:{" "}
                            <strong className="text-[#BDDED6]">
                              {Math.round((currentTask.verification_results.completeness_score || 1) * 100)}%
                            </strong>
                          </span>
                          <span className="text-slate-400">|</span>
                          <span className="text-slate-200">
                            Grounded:{" "}
                            <strong className="text-[#BDDED6]">
                              {currentTask.verification_results.evidence_backed ? "Grounded" : "Unverified"}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-200 leading-relaxed">
                        <p className="font-semibold text-white mb-1">Verifier Audit Notes:</p>
                        <p className="text-slate-200 font-mono text-[11px] bg-[#08282A] p-3 rounded border border-[#BDDED6]/20">
                          {currentTask.verification_results.audit_notes}
                        </p>
                      </div>

                      {currentTask.verification_results.unsupported_claims &&
                        currentTask.verification_results.unsupported_claims.length > 0 && (
                          <div className="p-3 bg-rose-950/40 border border-rose-900 rounded text-xs space-y-1">
                            <span className="font-semibold text-rose-300 flex items-center">
                              <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                              Unsupported Claims Flagged:
                            </span>
                            <ul className="list-disc list-inside text-rose-200 text-[11px]">
                              {currentTask.verification_results.unsupported_claims.map((claim, idx) => (
                                <li key={idx}>{claim}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  )}

                  {/* Rendered Full Markdown Report */}
                  <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-8 report-content">
                    <ReactMarkdown>{currentTask.final_deliverable}</ReactMarkdown>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 4.E KNOWLEDGE & RAG */}
          {/* ========================================================= */}
          {activeTab === "rag" && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Knowledge Base & Vector RAG</h2>
                <p className="text-xs text-[#BDDED6] mt-1">
                  Upload documents into the Qdrant vector database. Retrieve grounded facts, generate executive overviews,
                  explore innovation ideas, and conduct multi-turn conversational Q&A.
                </p>
              </div>

              {/* Upload Document Box */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider flex items-center">
                    <Upload className="w-3.5 h-3.5 mr-1.5 text-[#BDDED6]" /> Ingest Knowledge Document
                  </h3>
                  <span className="text-[11px] text-slate-400">PDF, Word (DOCX), or Plain Text (TXT)</span>
                </div>

                <form onSubmit={handleUploadDocument} className="space-y-4">
                  <div className="border border-dashed border-[#1C5052] rounded-lg p-5 text-center hover:border-[#177D81] transition-colors bg-[#0F1515]">
                    <Upload className="w-7 h-7 mx-auto mb-2 text-[#BDDED6]" />
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="block w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#177D81] file:text-white hover:file:bg-[#1B8E93] cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-400 mt-2">
                      Files are normalized, split into 500-character overlapping chunks, embedded, and indexed into Qdrant.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-mono">
                      {uploadFile ? `Selected: ${uploadFile.name} (${(uploadFile.size / 1024).toFixed(1)} KB)` : "No file chosen"}
                    </span>
                    <button
                      type="submit"
                      disabled={isUploading || !uploadFile}
                      className="inline-flex items-center px-4 py-2 rounded text-xs font-semibold bg-[#177D81] hover:bg-[#1B8E93] text-white disabled:opacity-50 transition-colors"
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                          Processing & Indexing Chunks...
                        </>
                      ) : (
                        <>
                          <Database className="w-3.5 h-3.5 mr-2 text-[#BDDED6]" />
                          Index into Qdrant
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {uploadSuccessMessage && (
                  <div className="flex items-center space-x-2 text-xs text-[#BDDED6] bg-[#1C5052] p-3 rounded border border-[#177D81]">
                    <CheckCircle2 className="w-4 h-4 text-[#BDDED6] shrink-0" />
                    <span>{uploadSuccessMessage}</span>
                  </div>
                )}
                {uploadError && (
                  <div className="flex items-center space-x-2 text-xs text-rose-300 bg-rose-950/40 p-3 rounded border border-rose-800">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>

              {/* Document Q&A Section with Conversation History */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider flex items-center">
                      <BrainCircuit className="w-3.5 h-3.5 mr-1.5 text-[#BDDED6]" /> Intelligent Document Q&A & Analysis
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Ask for structured overviews, specific concept retrieval, follow-up explanations, or innovation ideas.
                    </p>
                  </div>

                  {/* Document Scope Selector */}
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">Target Document:</span>
                    <select
                      value={selectedDocIdForQa}
                      onChange={(e) => setSelectedDocIdForQa(e.target.value)}
                      className="bg-[#0F1515] border border-[#1C5052] text-[#BDDED6] rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#177D81] max-w-[240px] truncate"
                    >
                      <option value="all">
                        All Indexed Documents ({documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0)} chunks)
                      </option>
                      {documents.map((d) => (
                        <option key={d.document_id} value={d.document_id}>
                          {d.filename} ({d.chunk_count} chunks)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Warning if selected document has 0 chunks */}
                {selectedDocIdForQa !== "all" &&
                  documents.find((d) => d.document_id === selectedDocIdForQa)?.chunk_count === 0 && (
                    <div className="flex items-center space-x-2 text-xs text-amber-300 bg-amber-950/30 p-2.5 rounded border border-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        The selected document has 0 indexed chunks and cannot be queried. Please select another document.
                      </span>
                    </div>
                  )}

                {/* Quick Suggestion Prompt Pills */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider self-center mr-1">Suggestions:</span>
                  <button
                    type="button"
                    onClick={() => handleRagSearch(undefined, "Tell me about this document and summarize its main contents.")}
                    disabled={isSearchingRag}
                    className="px-2.5 py-1 rounded bg-[#1C5052] hover:bg-[#177D81] text-[#BDDED6] hover:text-white text-[11px] border border-[#BDDED6]/20 transition-colors"
                  >
                    📋 Summarize Document
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRagSearch(undefined, "What improvement ideas and innovations do you suggest for this architecture?")}
                    disabled={isSearchingRag}
                    className="px-2.5 py-1 rounded bg-[#1C5052] hover:bg-[#177D81] text-[#BDDED6] hover:text-white text-[11px] border border-[#BDDED6]/20 transition-colors"
                  >
                    💡 Suggest Innovation Ideas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRagSearch(undefined, "What are the latency benchmarks, SLAs, and performance metrics?")}
                    disabled={isSearchingRag}
                    className="px-2.5 py-1 rounded bg-[#1C5052] hover:bg-[#177D81] text-[#BDDED6] hover:text-white text-[11px] border border-[#BDDED6]/20 transition-colors"
                  >
                    📊 Latency Benchmarks & SLAs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRagSearch(undefined, "What does this document contain and what are its key sections?")}
                    disabled={isSearchingRag}
                    className="px-2.5 py-1 rounded bg-[#1C5052] hover:bg-[#177D81] text-[#BDDED6] hover:text-white text-[11px] border border-[#BDDED6]/20 transition-colors"
                  >
                    🔍 Key Sections & Architecture
                  </button>
                </div>

                {/* Natural-Language Query Form */}
                <form onSubmit={(e) => handleRagSearch(e)} className="flex gap-2">
                  <input
                    type="text"
                    value={ragQuestion}
                    onChange={(e) => setRagQuestion(e.target.value)}
                    placeholder="Ask an overview question, query specific facts, or request follow-up explanations..."
                    className="flex-1 bg-[#0F1515] border border-[#1C5052] rounded px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-[#177D81]"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingRag || !ragQuestion.trim()}
                    className="px-4 py-2 bg-[#177D81] hover:bg-[#1B8E93] text-white rounded text-xs font-semibold disabled:opacity-50 transition-colors inline-flex items-center"
                  >
                    {isSearchingRag ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5 mr-1.5" />
                        Query Qdrant
                      </>
                    )}
                  </button>
                </form>

                {ragError && (
                  <div className="flex items-center space-x-2 text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded border border-rose-800">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{ragError}</span>
                  </div>
                )}

                {/* Conversation Q&A History Stream */}
                {ragHistory.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between border-b border-[#1C5052] pb-2">
                      <span className="text-[11px] font-semibold text-[#BDDED6] uppercase tracking-wider">
                        Document Dialogue & Grounded Citations ({ragHistory.length})
                      </span>
                      <button
                        onClick={() => setRagHistory([])}
                        className="text-[10px] text-slate-400 hover:text-rose-300 transition-colors"
                      >
                        Clear History
                      </button>
                    </div>

                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                      {ragHistory.map((item) => {
                        const isOverview = item.intent === "overview";
                        const isIdeas = item.intent === "ideas";
                        const isFollowup = item.intent === "followup";

                        return (
                          <div
                            key={item.id}
                            className="p-4 rounded-lg bg-[#0F1515] border border-[#1C5052] space-y-3"
                          >
                            {/* Card Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1C5052]/60 pb-2">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-white">Q: {item.question}</span>
                              </div>
                              <div className="flex items-center space-x-2 text-[10px]">
                                <span className="px-2 py-0.5 rounded bg-[#1C5052] text-[#BDDED6] border border-[#177D81]/40 font-mono">
                                  {item.document_name}
                                </span>
                                {item.is_grounded ? (
                                  <span className="px-2 py-0.5 rounded bg-[#177D81]/25 text-[#BDDED6] border border-[#177D81] flex items-center">
                                    <Check className="w-3 h-3 mr-1" />
                                    {isOverview ? "Overview" : isIdeas ? "Ideas & Innovation" : isFollowup ? "Follow-Up" : "Grounded"}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800">
                                    Insufficient Evidence
                                  </span>
                                )}
                                <span className="text-slate-400 font-mono">{item.timestamp}</span>
                              </div>
                            </div>

                            {/* Answer Text */}
                            <div className="text-slate-200 text-xs leading-relaxed whitespace-pre-line space-y-1">
                              {item.answer}
                            </div>

                            {/* Verified Source Citations */}
                            {item.citations && item.citations.length > 0 && (
                              <div className="pt-2 border-t border-[#1C5052]/60 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-[#BDDED6] uppercase tracking-wider font-semibold flex items-center">
                                    <FileCheck className="w-3.5 h-3.5 mr-1 text-[#BDDED6]" /> Verified Source Citations ({item.citations.length})
                                  </span>
                                  <span className="text-[10px] text-slate-400">Grounded in real Qdrant vectors</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {item.citations.map((c) => (
                                    <div
                                      key={c.citation_index}
                                      className="p-2.5 rounded bg-[#08282A] border border-[#1C5052] text-[11px] space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between font-mono">
                                        <span className="text-[#BDDED6] font-bold">
                                          [Source {c.citation_index}] {c.filename}
                                        </span>
                                        <span className="px-1.5 py-0.2 rounded bg-[#177D81]/30 text-[#BDDED6] text-[10px]">
                                          {(c.similarity_score * 100).toFixed(1)}% match
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-400 flex items-center space-x-2">
                                        <span>Section: {c.section}</span>
                                        <span>•</span>
                                        <span>Page {c.page_number}</span>
                                        <span>•</span>
                                        <span className="truncate max-w-[120px]">Chunk: {c.chunk_id}</span>
                                      </div>
                                      <div className="p-1.5 rounded bg-[#0F1515] border border-[#1C5052]/40 text-slate-300 text-[10px] italic">
                                        &ldquo;{c.snippet}&rdquo;
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Insufficient Evidence Notice */}
                            {!item.is_grounded && (
                              <div className="pt-1 text-[10px] text-slate-400 italic">
                                Zero hallucination safeguard: The system evaluated all indexed vectors for the target document and confirmed no supporting facts exist.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Ideas and Innovation Architecture Guide */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-5 space-y-3">
                <div className="flex items-center space-x-2">
                  <Lightbulb className="w-4 h-4 text-[#BDDED6]" />
                  <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                    Document Intelligence Architecture
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="p-3.5 rounded bg-[#0F1515] border border-[#1C5052]">
                    <span className="text-xs font-bold text-white block">Representative Chunk Sampling</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      Overview queries automatically retrieve intro, body, and conclusion chunks across the entire document for comprehensive summaries.
                    </p>
                  </div>
                  <div className="p-3.5 rounded bg-[#0F1515] border border-[#1C5052]">
                    <span className="text-xs font-bold text-white block">Hybrid Semantic + Lexical Search</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      Dense vector embeddings combined with token-overlap reranking guarantee high-precision retrieval on technical concepts and SLA tables.
                    </p>
                  </div>
                  <div className="p-3.5 rounded bg-[#0F1515] border border-[#1C5052]">
                    <span className="text-xs font-bold text-white block">Contextual Multi-Turn Dialogue</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      Ask follow-up questions like &quot;Explain the second point&quot; or &quot;Give implementation examples&quot; while remaining grounded in verified evidence.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4.F DOCUMENTS VIEW */}
          {/* ========================================================= */}
          {activeTab === "documents" && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Document Repository</h2>
                  <p className="text-xs text-[#BDDED6] mt-1">
                    Manage and inspect indexed documents in the active Qdrant vector database.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("rag")}
                  className="inline-flex items-center px-3.5 py-1.5 rounded text-xs font-semibold bg-[#177D81] hover:bg-[#1B8E93] text-white"
                >
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  Upload Document
                </button>
              </div>

              {/* Search & Filters */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={docSearchQuery}
                    onChange={(e) => setDocSearchQuery(e.target.value)}
                    placeholder="Search documents by filename..."
                    className="w-full bg-[#0F1515] border border-[#1C5052] rounded pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-[#177D81]"
                  />
                </div>
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <span className="text-slate-400 text-xs">File Type:</span>
                  <select
                    value={docFilterType}
                    onChange={(e) => setDocFilterType(e.target.value)}
                    className="bg-[#0F1515] border border-[#1C5052] text-[#BDDED6] rounded px-3 py-1.5 text-xs outline-none font-medium"
                  >
                    <option value="all">All Formats</option>
                    <option value="pdf">PDF Documents</option>
                    <option value="docx">Word (DOCX)</option>
                    <option value="txt">Plain Text (TXT)</option>
                  </select>
                </div>
              </div>

              {/* Documents Table */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] overflow-hidden">
                {filteredDocuments.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-xs">
                    <Files className="w-10 h-10 mx-auto mb-2 opacity-30 text-[#BDDED6]" />
                    <p>No documents found matching the filter.</p>
                  </div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#1C5052] text-slate-400 bg-[#08282A] text-[11px]">
                        <th className="py-3 px-4 font-medium">Filename</th>
                        <th className="py-3 px-4 font-medium">Format</th>
                        <th className="py-3 px-4 font-medium">Chunk Count</th>
                        <th className="py-3 px-4 font-medium">Upload Date</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1C5052]/50">
                      {filteredDocuments.map((doc) => {
                        const ext = doc.filename.split(".").pop()?.toUpperCase() || "FILE";
                        return (
                          <tr key={doc.document_id} className="hover:bg-[#1C5052]/30 transition-colors">
                            <td className="py-3 px-4 font-medium text-white flex items-center space-x-2">
                              <FileText className="w-4 h-4 text-[#BDDED6] shrink-0" />
                              <span className="truncate max-w-xs">{doc.filename}</span>
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-300">{ext}</td>
                            <td className="py-3 px-4 font-mono text-[11px] text-[#BDDED6]">
                              {doc.chunk_count} chunks
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-[11px]">
                              {new Date(doc.uploaded_at).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4">
                              {doc.chunk_count > 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[#177D81]/25 text-[#BDDED6] border border-[#177D81]/40">
                                  <Check className="w-3 h-3 mr-1" /> Indexed ({doc.chunk_count} chunks)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-rose-950/40 text-rose-300 border border-rose-800">
                                  <AlertCircle className="w-3 h-3 mr-1" /> 0 Chunks (Empty/Failed)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <button
                                onClick={() => setSelectedDocForPreview(doc)}
                                className="px-2.5 py-1 rounded bg-[#1C5052] hover:bg-[#177D81] text-[#BDDED6] hover:text-white border border-[#BDDED6]/20 transition-colors"
                              >
                                View Chunks
                              </button>
                              <button
                                onClick={() => handleDeleteDocument(doc.document_id, doc.filename)}
                                title="Remove Document"
                                className="p-1 rounded bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Modal for Document Chunks Preview */}
          {selectedDocForPreview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
              <div className="w-full max-w-2xl bg-[#08282A] border border-[#1C5052] rounded-lg p-6 space-y-4 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-[#1C5052] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedDocForPreview.filename}</h3>
                    <p className="text-xs text-[#BDDED6]">
                      Document ID: {selectedDocForPreview.document_id} • {selectedDocForPreview.chunk_count} Chunks
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDocForPreview(null)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 text-xs text-slate-200">
                  <p className="text-slate-300">
                    Dense vector embeddings were stored into Qdrant collection{" "}
                    <code className="text-[#BDDED6] font-mono">
                      {systemReady?.components?.qdrant?.collection || "multi_agent_knowledge"}
                    </code>
                    .
                  </p>
                  <div className="space-y-2">
                    {[1, 2, 3].map((chunkIdx) => (
                      <div
                        key={chunkIdx}
                        className="p-3 bg-[#0F1515] rounded border border-[#1C5052] font-mono text-[11px] space-y-1"
                      >
                        <div className="flex justify-between text-[#BDDED6]">
                          <span>Chunk #{chunkIdx}</span>
                          <span>Cosine Grounded</span>
                        </div>
                        <p className="text-slate-300">
                          Excerpt of indexed content segment chunk {chunkIdx} from{" "}
                          {selectedDocForPreview.filename} with 500-character window and 100-character semantic
                          overlap.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t border-[#1C5052]">
                  <button
                    onClick={() => setSelectedDocForPreview(null)}
                    className="px-4 py-1.5 rounded text-xs bg-[#177D81] hover:bg-[#1B8E93] text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4.G TASK HISTORY */}
          {/* ========================================================= */}
          {activeTab === "history" && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Task Execution History</h2>
                  <p className="text-xs text-[#BDDED6] mt-1">
                    Audit trail of previous autonomous runs, plans, and verified deliverables.
                  </p>
                </div>
                <button
                  onClick={loadTasks}
                  className="inline-flex items-center px-3 py-1.5 rounded text-xs bg-[#1C5052] hover:bg-[#177D81] text-white border border-[#BDDED6]/20 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-[#BDDED6]" />
                  Refresh History
                </button>
              </div>

              {/* Filters Bar */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => {
                      setHistorySearch(e.target.value);
                      setHistoryPage(1);
                    }}
                    placeholder="Search tasks by prompt or ID..."
                    className="w-full bg-[#0F1515] border border-[#1C5052] rounded pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-[#177D81]"
                  />
                </div>
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <span className="text-slate-400 text-xs">Status:</span>
                  <select
                    value={historyStatusFilter}
                    onChange={(e) => {
                      setHistoryStatusFilter(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="bg-[#0F1515] border border-[#1C5052] text-[#BDDED6] rounded px-3 py-1.5 text-xs outline-none font-medium"
                  >
                    <option value="all">All Statuses</option>
                    <option value="completed">Completed</option>
                    <option value="running">In Progress</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              {/* Clean Table Layout */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] overflow-hidden">
                {paginatedTasks.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-xs">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-30 text-[#BDDED6]" />
                    <p>No task records found matching your query.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-[#1C5052] text-slate-400 bg-[#08282A] text-[11px]">
                          <th className="py-3 px-4 font-medium">Task ID</th>
                          <th className="py-3 px-4 font-medium">Task Objective</th>
                          <th className="py-3 px-4 font-medium">Creation Date</th>
                          <th className="py-3 px-4 font-medium">Subtasks</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1C5052]/50">
                        {paginatedTasks.map((t) => (
                          <tr key={t.task_id} className="hover:bg-[#1C5052]/30 transition-colors">
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                              {t.task_id.slice(0, 8)}...
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-100 max-w-sm truncate">
                              {t.original_request}
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                              {t.created_at ? new Date(t.created_at).toLocaleString() : "--"}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-300">
                              {t.subtasks?.length || 0} subtasks
                            </td>
                            <td className="py-3 px-4">{getStatusBadge(t.status)}</td>
                            <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                              <button
                                onClick={() => {
                                  setCurrentTaskId(t.task_id);
                                  setCurrentTask(t);
                                  setActiveTab("execution");
                                }}
                                className="px-2.5 py-1 rounded bg-[#1C5052] hover:bg-[#177D81] text-[#BDDED6] hover:text-white border border-[#BDDED6]/20 transition-colors"
                              >
                                Workflow
                              </button>
                              {t.final_deliverable && (
                                <button
                                  onClick={() => {
                                    setCurrentTaskId(t.task_id);
                                    setCurrentTask(t);
                                    setActiveTab("deliverable");
                                  }}
                                  className="px-2.5 py-1 rounded bg-[#177D81] hover:bg-[#1B8E93] text-white transition-colors"
                                >
                                  Report
                                </button>
                              )}
                              {t.status === "failed" && (
                                <button
                                  onClick={() => handleRetryTask(t.task_id)}
                                  className="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors"
                                >
                                  Retry
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination Controls */}
                {totalHistoryPages > 1 && (
                  <div className="px-4 py-3 border-t border-[#1C5052] bg-[#08282A] flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">
                      Showing {(historyPage - 1) * tasksPerPage + 1} to{" "}
                      {Math.min(historyPage * tasksPerPage, filteredHistoryTasks.length)} of{" "}
                      {filteredHistoryTasks.length} tasks
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={historyPage === 1}
                        className="px-2.5 py-1 rounded bg-[#1C5052] text-[#BDDED6] hover:bg-[#177D81] hover:text-white disabled:opacity-40 transition-colors"
                      >
                        Previous
                      </button>
                      <span className="text-white font-mono px-2">
                        {historyPage} / {totalHistoryPages}
                      </span>
                      <button
                        onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                        disabled={historyPage === totalHistoryPages}
                        className="px-2.5 py-1 rounded bg-[#1C5052] text-[#BDDED6] hover:bg-[#177D81] hover:text-white disabled:opacity-40 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4.H SETTINGS */}
          {/* ========================================================= */}
          {activeTab === "settings" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Platform Settings</h2>
                <p className="text-xs text-[#BDDED6] mt-1">
                  Manage user identity, account settings, and inspect connected AI and vector infrastructure.
                </p>
              </div>

              {/* User Profile & Role Settings */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-6 space-y-4">
                <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                  User Profile & Authentication
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-slate-300 block mb-1">User Identifier</label>
                    <input
                      type="text"
                      value={currentUser}
                      onChange={(e) => setCurrentUser(e.target.value)}
                      className="w-full bg-[#0F1515] border border-[#1C5052] rounded px-3 py-2 text-xs text-white outline-none focus:border-[#177D81]"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Role Permission</label>
                    <select
                      value={isAdmin ? "admin" : "standard"}
                      onChange={(e) => setIsAdmin(e.target.value === "admin")}
                      className="w-full bg-[#0F1515] border border-[#1C5052] rounded px-3 py-2 text-xs text-[#BDDED6] outline-none focus:border-[#177D81] font-medium"
                    >
                      <option value="admin">Administrator (Super Admin)</option>
                      <option value="standard">Standard User (Restricted)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* System and Connected AI Infrastructure */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-6 space-y-4">
                <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                  Connected AI & Vector Infrastructure
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded bg-[#1C5052] border border-[#BDDED6]/20 space-y-1">
                    <span className="text-slate-300 block text-[11px]">Primary LLM Orchestrator</span>
                    <span className="text-white font-bold text-sm block">Google Gemini 2.0 Flash</span>
                    <span className="text-[10px] text-[#BDDED6] font-mono block">
                      Status: Connected • API Key: ••••••••••••
                    </span>
                  </div>

                  <div className="p-3.5 rounded bg-[#1C5052] border border-[#BDDED6]/20 space-y-1">
                    <span className="text-slate-300 block text-[11px]">Vector Database</span>
                    <span className="text-white font-bold text-sm block">Qdrant Cloud Cluster</span>
                    <span className="text-[10px] text-[#BDDED6] font-mono block">
                      Dim: 768 • API Key: ••••••••••••
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded bg-[#0F1515] border border-[#1C5052] text-[11px] text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-[#BDDED6] inline mr-1.5" />
                  Security Notice: API keys and credentials are authenticated server-side and never exposed in client bundles.
                </div>
              </div>

              {/* Palette Identity Specs */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-6 space-y-4">
                <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                  Theme Palette: Dark Teal + Mint
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 rounded bg-[#1C5052] border border-[#BDDED6]/20 text-center">
                    <div className="w-6 h-6 mx-auto mb-2 rounded bg-[#0F1515] border border-white/20" />
                    <span className="text-[11px] font-mono text-white block">#0F1515</span>
                    <span className="text-[10px] text-slate-300">Dark Base</span>
                  </div>

                  <div className="p-3 rounded bg-[#1C5052] border border-[#BDDED6]/20 text-center">
                    <div className="w-6 h-6 mx-auto mb-2 rounded bg-[#08282A] border border-white/20" />
                    <span className="text-[11px] font-mono text-white block">#08282A</span>
                    <span className="text-[10px] text-slate-300">Deep Teal</span>
                  </div>

                  <div className="p-3 rounded bg-[#1C5052] border border-[#BDDED6]/20 text-center">
                    <div className="w-6 h-6 mx-auto mb-2 rounded bg-[#1C5052] border border-white/20" />
                    <span className="text-[11px] font-mono text-white block">#1C5052</span>
                    <span className="text-[10px] text-slate-300">Teal Cards</span>
                  </div>

                  <div className="p-3 rounded bg-[#1C5052] border border-[#BDDED6]/20 text-center">
                    <div className="w-6 h-6 mx-auto mb-2 rounded bg-[#177D81]" />
                    <span className="text-[11px] font-mono text-white block">#177D81</span>
                    <span className="text-[10px] text-slate-300">Bright Teal</span>
                  </div>

                  <div className="p-3 rounded bg-[#1C5052] border border-[#BDDED6]/20 text-center">
                    <div className="w-6 h-6 mx-auto mb-2 rounded bg-[#BDDED6]" />
                    <span className="text-[11px] font-mono text-[#BDDED6] block">#BDDED6</span>
                    <span className="text-[10px] text-slate-300">Light Mint</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4.I ADMIN PANEL */}
          {/* ========================================================= */}
          {activeTab === "admin" && (
            <div className="max-w-6xl mx-auto space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Enterprise Administration</h2>
                  <p className="text-xs text-[#BDDED6] mt-1">
                    System governance, user account management, queue orchestration, and operational diagnostics.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded bg-[#1C5052] text-[#BDDED6] font-mono text-xs border border-[#BDDED6]/30">
                  Role: Authorized Administrator
                </span>
              </div>

              {/* Admin Overview Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="rounded-lg bg-[#1C5052] border border-[#BDDED6]/20 p-5">
                  <div className="flex justify-between items-center text-[#BDDED6] text-xs font-semibold mb-1">
                    <span>Registered Users</span>
                    <Users className="w-4 h-4 text-[#BDDED6]" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {systemUsers.length}{" "}
                    <span className="text-xs text-[#BDDED6] font-normal">
                      ({systemUsers.filter((u) => u.status === "active").length} active)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    {systemUsers.filter((u) => u.status === "disabled").length} disabled accounts
                  </p>
                </div>

                <div className="rounded-lg bg-[#1C5052] border border-[#BDDED6]/20 p-5">
                  <div className="flex justify-between items-center text-[#BDDED6] text-xs font-semibold mb-1">
                    <span>Executed Pipelines</span>
                    <Layers className="w-4 h-4 text-[#BDDED6]" />
                  </div>
                  <div className="text-2xl font-bold text-white">{stats.total}</div>
                  <p className="text-[11px] text-slate-300 mt-1">{stats.completed} Verified Outputs</p>
                </div>

                <div className="rounded-lg bg-[#1C5052] border border-[#BDDED6]/20 p-5">
                  <div className="flex justify-between items-center text-[#BDDED6] text-xs font-semibold mb-1">
                    <span>Vector Collection</span>
                    <Database className="w-4 h-4 text-[#BDDED6]" />
                  </div>
                  <div className="text-2xl font-bold text-white">{stats.totalChunks} Chunks</div>
                  <p className="text-[11px] text-slate-300 mt-1">Qdrant Cloud Managed</p>
                </div>
              </div>

              {/* User Management Table */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                    User Management & Account Status
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">{systemUsers.length} Users Total</span>
                </div>

                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#1C5052] text-slate-400 text-[11px]">
                      <th className="py-2.5 font-medium">User ID</th>
                      <th className="py-2.5 font-medium">Role</th>
                      <th className="py-2.5 font-medium">Tasks Run</th>
                      <th className="py-2.5 font-medium">Last Active</th>
                      <th className="py-2.5 font-medium">Account Status</th>
                      <th className="py-2.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C5052]/50">
                    {systemUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-[#1C5052]/30 transition-colors">
                        <td className="py-3 font-medium text-white flex items-center space-x-2">
                          <div className="w-6 h-6 rounded bg-[#1C5052] text-[#BDDED6] flex items-center justify-center font-bold text-[10px]">
                            {u.username[0].toUpperCase()}
                          </div>
                          <span>{u.username}</span>
                        </td>
                        <td className="py-3 text-[#BDDED6] uppercase font-mono text-[10px]">{u.role}</td>
                        <td className="py-3 text-slate-300 font-mono">{u.taskCount} tasks</td>
                        <td className="py-3 text-slate-400">{u.lastActive}</td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                              u.status === "active"
                                ? "bg-[#177D81]/25 text-[#BDDED6] border-[#177D81]"
                                : "bg-rose-950/40 text-rose-300 border-rose-800"
                            }`}
                          >
                            {u.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => toggleUserStatus(u.id)}
                            className="text-xs px-2.5 py-1 rounded bg-[#1C5052] hover:bg-[#177D81] text-[#BDDED6] hover:text-white border border-[#BDDED6]/20 transition-colors"
                          >
                            {u.status === "active" ? "Disable" : "Enable"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Task Monitoring & Diagnostics */}
              <div className="rounded-lg bg-[#08282A] border border-[#1C5052] p-6 space-y-4">
                <h3 className="text-xs font-semibold text-[#BDDED6] uppercase tracking-wider">
                  Platform Activity & Security Audit Logs
                </h3>

                <div className="space-y-2 text-xs font-mono max-h-56 overflow-y-auto pr-1">
                  {[
                    { time: "10:14:22", type: "TASK_SUBMISSION", msg: "Task accepted into queue by user_developer" },
                    { time: "10:12:05", type: "QDRANT_SYNC", msg: "Vector collection multi_agent_knowledge health check OK" },
                    { time: "10:08:44", type: "GEMINI_ORCHESTRATION", msg: "LangGraph pipeline compiled with Gemini 2.0 Flash" },
                    { time: "10:01:10", type: "AUTH_VERIFIED", msg: "Session authenticated via Firebase identity provider" },
                  ].map((log, i) => (
                    <div key={i} className="flex items-center space-x-3 p-2 rounded bg-[#0F1515] border border-[#1C5052]">
                      <span className="text-[10px] text-slate-400">{log.time}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1C5052] text-[#BDDED6] font-semibold">
                        {log.type}
                      </span>
                      <span className="text-slate-200 text-[11px]">{log.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
