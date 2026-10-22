"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  FileText,
  Layers,
  ListFilter,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "new_task" | "execution" | "deliverable" | "rag" | "history">("new_task");
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<TaskRecord | null>(null);
  const [tasksList, setTasksList] = useState<TaskRecord[]>([]);
  const [systemReady, setSystemReady] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check system readiness
  useEffect(() => {
    fetch("/ready")
      .then((res) => res.json())
      .then((data) => setSystemReady(data))
      .catch(() => setSystemReady({ ready: false }));

    loadTasks();
    loadDocuments();
  }, []);

  // Poll current task when running or pending
  useEffect(() => {
    if (!currentTaskId) return;

    const interval = setInterval(() => {
      fetch(`/api/tasks/${currentTaskId}`)
        .then((res) => res.json())
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

  const loadTasks = () => {
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setTasksList(data.reverse());
      })
      .catch(console.error);
  };

  const loadDocuments = () => {
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDocuments(data);
      })
      .catch(console.error);
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: prompt,
          user_id: "user_developer"
        })
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentTaskId(data.task_id);
        setActiveTab("execution");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        setUploadFile(null);
        loadDocuments();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const copyDeliverable = () => {
    if (!currentTask?.final_deliverable) return;
    navigator.clipboard.writeText(currentTask.final_deliverable);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getAgentBadge = (status?: string) => {
    switch (status) {
      case "completed":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Done</span>;
      case "running":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse"><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Active</span>;
      case "failed":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><AlertCircle className="w-3 h-3 mr-1" /> Failed</span>;
      case "blocked":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock className="w-3 h-3 mr-1" /> Blocked</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700"><Clock className="w-3 h-3 mr-1" /> Pending</span>;
    }
  };

  return (
    <div className="flex h-screen bg-[#090d16] text-slate-100 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-white/5 flex flex-col bg-slate-950/60 backdrop-blur-xl">
        <div className="p-6 border-b border-white/5 flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Multi-Agent AI</h1>
            <p className="text-[10px] text-slate-500 font-mono">LangGraph Orchestrator</p>
          </div>
        </div>

        {/* System Health Widget */}
        <div className="px-4 py-3 m-4 rounded-xl glass-panel text-xs flex items-center justify-between">
          <span className="text-slate-400 flex items-center">
            <span className={`w-2 h-2 rounded-full mr-2 ${systemReady?.ready ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            System Status
          </span>
          <span className="font-mono text-[11px] text-slate-300">
            {systemReady?.ready ? "Operational" : "Initializing"}
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 px-4 space-y-1">
          <button
            onClick={() => setActiveTab("new_task")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "new_task"
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Sparkles className="w-4 h-4 mr-3" />
            New Autonomous Task
          </button>

          <button
            onClick={() => setActiveTab("execution")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "execution"
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Layers className="w-4 h-4 mr-3" />
            Agent Workflow
          </button>

          <button
            onClick={() => setActiveTab("deliverable")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "deliverable"
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <FileText className="w-4 h-4 mr-3" />
            Deliverable Report
          </button>

          <button
            onClick={() => setActiveTab("rag")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "rag"
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Database className="w-4 h-4 mr-3" />
            Knowledge & RAG
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <ListFilter className="w-4 h-4 mr-3" />
            Task History
          </button>
        </nav>

        {/* Footer info */}
        <div className="p-4 border-t border-white/5 text-[11px] text-slate-500">
          <p>Model: Gemini 3.8 / 3.5 Flash</p>
          <p>Vector DB: Qdrant Cloud</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Header */}
        <header className="h-16 border-b border-white/5 px-8 flex items-center justify-between bg-slate-950/40 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <span className="text-xs uppercase font-semibold tracking-wider text-slate-400">
              {activeTab.replace("_", " ")}
            </span>
            {currentTask && (
              <span className="text-xs font-mono text-slate-500">
                • Task ID: {currentTask.task_id.slice(0, 8)}...
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {currentTask && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                currentTask.status === "completed"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : currentTask.status === "running"
                  ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
              }`}>
                {currentTask.status.toUpperCase()}
              </span>
            )}
          </div>
        </header>

        {/* Tab Views */}
        <div className="flex-1 p-8">
          {/* 1. New Task View */}
          {activeTab === "new_task" && (
            <div className="max-w-3xl mx-auto space-y-8">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Submit Natural Language Task</h2>
                <p className="text-sm text-slate-400 mt-1">
                  The Multi-Agent framework will decompose your request into subtasks, search knowledge documents in Qdrant, execute analysis, and verify the deliverable.
                </p>
              </div>

              <form onSubmit={handleSubmitTask} className="space-y-4">
                <div className="glass-panel rounded-2xl p-4 focus-within:border-indigo-500/50 transition-colors">
                  <textarea
                    rows={5}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.g., Compare top wireless noise-canceling headphones under $350 and recommend the best option with detailed specifications, trade-offs, and citations..."
                    className="w-full bg-transparent resize-none border-none outline-none text-slate-200 placeholder:text-slate-500 text-sm leading-relaxed"
                  />
                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <span className="text-[11px] text-slate-500">
                      Supports requirements, budget constraints, technical specifications.
                    </span>
                    <button
                      type="submit"
                      disabled={isSubmitting || !prompt.trim()}
                      className="inline-flex items-center px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                          Decomposing...
                        </>
                      ) : (
                        <>
                          Execute Workflow
                          <ArrowRight className="w-3.5 h-3.5 ml-2" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>

              {/* Sample Prompts */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Example Workflows</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    "I need a mobile phone under ₹20,000. Compare display, battery, camera, and processor performance.",
                    "Research and compare the top 2 enterprise vector databases (Qdrant vs Pinecone) with benchmarks and cost analysis.",
                    "Plan and architect a scalable microservices architecture for a real-time collaborative document editor.",
                    "Compare top lightweight ultraportable laptops for programming under $1200 with battery life and thermal analysis."
                  ].map((example, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(example)}
                      className="text-left p-3.5 rounded-xl glass-panel glass-panel-hover text-xs text-slate-300 leading-relaxed"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. Execution & Multi-Agent View */}
          {activeTab === "execution" && (
            <div className="max-w-5xl mx-auto space-y-8">
              {!currentTask ? (
                <div className="text-center py-20 text-slate-500">
                  <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No active task execution. Submit a task from the "New Autonomous Task" tab.</p>
                </div>
              ) : (
                <>
                  {/* Agent Status Stepper */}
                  <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-6">Autonomous Agent Coordination</h3>
                    <div className="grid grid-cols-5 gap-4">
                      {[
                        { key: "planner", label: "Planner Agent", desc: "Decomposition & Constraints" },
                        { key: "researcher", label: "Researcher Agent", desc: "Qdrant RAG & Search" },
                        { key: "analyst", label: "Analyst Agent", desc: "Evaluation & Trade-offs" },
                        { key: "executor", label: "Executor Agent", desc: "Deliverable Generation" },
                        { key: "verifier", label: "Verifier Agent", desc: "Quality Gate & Audit" }
                      ].map((agent) => (
                        <div key={agent.key} className="glass-panel p-4 rounded-xl flex flex-col justify-between space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-slate-200">{agent.label}</span>
                            </div>
                            <p className="text-[11px] text-slate-400">{agent.desc}</p>
                          </div>
                          <div>
                            {getAgentBadge(currentTask.agent_statuses?.[agent.key])}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Planned Subtasks Tree */}
                  {currentTask.plan && (
                    <div className="glass-panel rounded-2xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Planned Subtasks ({currentTask.subtasks?.length || 0})</h3>
                        <span className="text-xs font-mono text-slate-400">Objective: {currentTask.plan.objective}</span>
                      </div>

                      <div className="space-y-2">
                        {currentTask.subtasks.map((st) => (
                          <div key={st.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-mono text-xs text-indigo-400">[{st.id}]</span>
                                <span className="text-xs font-medium text-slate-200">{st.title}</span>
                                <span className="text-[10px] text-slate-500 font-mono">@{st.assigned_agent}</span>
                              </div>
                              <p className="text-[11px] text-slate-400">{st.description}</p>
                            </div>
                            <div>{getAgentBadge(st.status)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Execution Event Stream */}
                  <div className="glass-panel rounded-2xl p-6 space-y-3">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live Execution Event Stream</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 font-mono text-xs">
                      {currentTask.events?.map((ev, idx) => (
                        <div key={idx} className="flex items-start space-x-3 text-slate-400 py-1 border-b border-white/5">
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">{ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "--:--"}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 uppercase">{ev.stage}</span>
                          <span className="text-slate-300">{ev.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 3. Deliverable Report View */}
          {activeTab === "deliverable" && (
            <div className="max-w-4xl mx-auto space-y-6">
              {!currentTask?.final_deliverable ? (
                <div className="text-center py-20 text-slate-500">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No deliverable generated yet. Run a task to generate a verified report.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">Verified Final Deliverable</h2>
                      <p className="text-xs text-slate-400">Audited by Verifier Agent with Grounded Evidence</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={copyDeliverable}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg glass-panel hover:bg-white/10 text-xs text-slate-300 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        {copied ? "Copied!" : "Copy Markdown"}
                      </button>
                    </div>
                  </div>

                  {/* Verification Gate Audit Notice */}
                  {currentTask.verification_results && (
                    <div className={`p-4 rounded-xl border ${
                      currentTask.verification_results.is_approved
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                    } text-xs space-y-1`}>
                      <div className="flex items-center font-semibold">
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Verifier Audit Status: {currentTask.verification_results.is_approved ? "APPROVED" : "REJECTED"}
                      </div>
                      <p className="text-slate-300 text-[11px]">{currentTask.verification_results.audit_notes}</p>
                    </div>
                  )}

                  {/* Markdown Content */}
                  <div className="glass-panel rounded-2xl p-8 prose prose-invert prose-indigo max-w-none text-slate-200 leading-relaxed text-sm">
                    <ReactMarkdown>{currentTask.final_deliverable}</ReactMarkdown>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 4. Documents & RAG Knowledge View */}
          {activeTab === "rag" && (
            <div className="max-w-4xl mx-auto space-y-8">
              <div>
                <h2 className="text-2xl font-bold">Knowledge Documents & Vector RAG</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Upload PDF, DOCX, or TXT files. They are automatically chunked and indexed into your Qdrant Cloud cluster for semantic grounding.
                </p>
              </div>

              {/* Upload Form */}
              <form onSubmit={handleUploadDocument} className="glass-panel rounded-2xl p-6 space-y-4">
                <div className="border-2 border-dashed border-white/10 hover:border-indigo-500/40 rounded-xl p-8 text-center transition-colors">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-500 mt-2">Accepted formats: PDF, DOCX, TXT (up to 25MB)</p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isUploading || !uploadFile}
                    className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {isUploading ? "Chunking & Indexing..." : "Index into Qdrant"}
                  </button>
                </div>
              </form>

              {/* Documents List */}
              <div className="glass-panel rounded-2xl p-6 space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Indexed Repository Knowledge ({documents.length})</h3>
                {documents.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No documents indexed yet. Upload files above to ground the multi-agent system.</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-4 h-4 text-indigo-400" />
                          <span className="font-medium text-slate-200">{doc.filename}</span>
                        </div>
                        <div className="flex items-center space-x-4 text-slate-400 font-mono text-[11px]">
                          <span>{doc.chunk_count} Chunks</span>
                          <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. Task History View */}
          {activeTab === "history" && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Execution History</h2>
                  <p className="text-sm text-slate-400">Review past autonomous agent runs and deliverables</p>
                </div>
                <button
                  onClick={loadTasks}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg glass-panel hover:bg-white/10 text-xs text-slate-300"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Refresh
                </button>
              </div>

              <div className="space-y-3">
                {tasksList.length === 0 ? (
                  <div className="text-center py-20 text-slate-500 glass-panel rounded-2xl">
                    <p className="text-xs">No task history found.</p>
                  </div>
                ) : (
                  tasksList.map((t) => (
                    <div
                      key={t.task_id}
                      onClick={() => {
                        setCurrentTaskId(t.task_id);
                        setCurrentTask(t);
                        setActiveTab("execution");
                      }}
                      className="p-4 rounded-xl glass-panel glass-panel-hover cursor-pointer flex items-center justify-between transition-all"
                    >
                      <div className="space-y-1 max-w-2xl">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs text-slate-500">{t.task_id.slice(0, 8)}...</span>
                          <span className="text-xs font-semibold text-slate-200 line-clamp-1">{t.original_request}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          Objective: {t.plan?.objective || t.original_request}
                        </p>
                      </div>

                      <div className="flex items-center space-x-4">
                        <span className="text-[11px] font-mono text-slate-500">
                          {t.created_at ? new Date(t.created_at).toLocaleTimeString() : ""}
                        </span>
                        {getAgentBadge(t.status)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
