import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  FileText,
  Upload,
  ShieldCheck,
  Sparkles,
  BookOpen,
  CalendarDays,
  Users,
  Wallet,
  HelpCircle,
  ArrowLeft,
  Download,
  X,
  Send,
  Link,
  Trash2,
  Plus,
  MessageCircle,
  Compass,
  ChevronRight,
  Clock,
  LoaderCircle,
} from "lucide-react";
import type { Result, Page, VerifiedFact } from "../shared/schema";
import "./style.css";
import { SourceButton, FactList } from "./components";
import { matchesRecipient } from "../shared/matching";
type Example = {
  id: string;
  title: string;
  category: string;
  description: string;
  text: string;
};
async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(
    url,
    body instanceof FormData
      ? { method: "POST", body }
      : body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Service unavailable.");
  return data;
}
function checklistId(result: Result) {
  if (result.exampleId) return result.exampleId;
  let hash = 2166136261;
  for (const page of result.pages)
    for (const char of page.text)
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return "document-" + (hash >>> 0).toString(16);
}
function Logo() {
  return (
    <span className="logo">
      <svg
        width="35"
        height="32"
        viewBox="0 0 35 32"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 25V17C3 8 11 4 17.5 4C24 4 32 8 32 17V25M3 17H32M11 17V25M24 17V25"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      ponte<span className="logo-dot">.</span>
    </span>
  );
}
function dateLabel(iso: string | null | undefined, fallback: string) {
  if (!iso) return fallback;
  const date = new Date(iso + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  )
    return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
function App() {
  const [ai, setAi] = useState(false),
    [providerLabel, setProviderLabel] = useState("OpenRouter"),
    [configReady, setConfigReady] = useState(false),
    [examples, setExamples] = useState<Example[]>([]),
    [tab, setTab] = useState<"pdf" | "text">("pdf"),
    [text, setText] = useState(""),
    [pages, setPages] = useState<Page[]>([]),
    [fileName, setFileName] = useState(""),
    [role, setRole] = useState(""),
    [audience, setAudience] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState<Result | null>(null),
    [source, setSource] = useState<VerifiedFact | null>(null),
    [showDoc, setShowDoc] = useState(false),
    [checked, setChecked] = useState<number[]>([]),
    [question, setQuestion] = useState(""),
    [chat, setChat] = useState<
      { question: string; answer: string; citations: VerifiedFact[] }[]
    >([]),
    [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  useEffect(() => {
    Promise.all([
      api<{ aiAvailable: boolean; provider: string; model: string }>(
        "/api/config",
      ),
      api<Example[]>("/api/examples"),
    ])
      .then(([c, e]) => {
        setAi(c.aiAvailable);
        setProviderLabel(c.provider);
        setConfigReady(true);
        setExamples(e);
      })
      .catch(() =>
        setError("The server is unavailable. Start Ponte and reload the page."),
      );
  }, []);
  useEffect(() => {
    if (source) {
      sourceRef.current?.showModal();
    } else if (sourceRef.current?.open) sourceRef.current.close();
  }, [source]);
  useEffect(() => {
    if (result) {
      document.title = result.analysis.title + " · Ponte";
      try {
        const value = JSON.parse(
          sessionStorage.getItem("ponte-checklist") || "null",
        );
        setChecked(value?.id === checklistId(result) ? value.checked : []);
      } catch {
        setChecked([]);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else document.title = "Ponte — Everyday documents, made clearer.";
  }, [result]);
  async function loadFile(file: File) {
    setError("");
    setPages([]);
    setFileName("");
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Unsupported format. Upload a PDF or paste the text.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("The file exceeds the 10 MB limit.");
      return;
    }
    setBusy("Reading your PDF…");
    const id = ++requestId.current;
    try {
      const data = await api<{ pages: Page[] }>(
        "/api/extract",
        (() => {
          const f = new FormData();
          f.append("file", file);
          return f;
        })(),
      );
      if (id !== requestId.current) return;
      setPages(data.pages);
      setFileName(file.name);
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setBusy("");
    }
  }
  async function analyze(exampleId?: string) {
    setError("");
    setBusy(exampleId ? "Opening the example…" : "Analysing your notice…");
    const id = ++requestId.current;
    try {
      const data = await api<Result>(
        exampleId ? "/api/demo" : "/api/analyze",
        exampleId
          ? { id: exampleId }
          : {
              pages:
                tab === "text" ? [{ number: 1, text: text.trim() }] : pages,
              role,
              audience,
            },
      );
      if (id !== requestId.current) return;
      setResult(data);
      setChat([]);
      setShowDoc(false);
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setBusy("");
    }
  }
  function reset() {
    requestId.current++;
    setResult(null);
    setPages([]);
    setFileName("");
    setText("");
    setChat([]);
    setChecked([]);
    setSource(null);
    setError("");
    setBusy("");
    setQuestion("");
    setShowDoc(false);
    setRole("");
    setAudience("");
    sessionStorage.removeItem("ponte-checklist");
  }
  function toggle(i: number) {
    const next = checked.includes(i)
      ? checked.filter((n) => n !== i)
      : [...checked, i];
    setChecked(next);
    try {
      sessionStorage.setItem(
        "ponte-checklist",
        JSON.stringify({
          id: result ? checklistId(result) : "",
          checked: next,
        }),
      );
    } catch {
      /* Checklist still works in memory. */
    }
  }
  async function ask(q = question) {
    if (!q.trim() || !result || busy) return;
    setQuestion("");
    setBusy("Checking the document…");
    setError("");
    const id = ++requestId.current;
    try {
      const answer = await api<{ answer: string; citations: VerifiedFact[] }>(
        "/api/chat",
        { question: q, pages: result.pages, exampleId: result.exampleId },
      );
      if (id === requestId.current)
        setChat((c) => [...c, { question: q, ...answer }]);
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setBusy("");
    }
  }
  function download() {
    if (!result) return;
    const a = result.analysis;
    const sections = [
      ["In plain English", a.summary],
      ["Who this is for", a.recipients],
      ["Your to-do list", a.actions],
      ["Dates & deadlines", a.dates],
      ["Costs & documents", a.costs],
      ["What needs clarification", a.questions],
    ] as const;
    const out =
      `PONTE · ${a.title}\n${result.mode === "demo" ? "EXAMPLE GUIDE — Sample notice with prepared explanations" : "DOCUMENT SUMMARY — Check the original for full details"}\n\n` +
      sections
        .map(
          ([title, items]) =>
            title +
            "\n" +
            (items.length
              ? items
                  .map(
                    (f, i) =>
                      `${title === "Your to-do list" ? (checked.includes(i) ? "[x] " : "[ ] ") : "• "}${f.verified ? "" : "[UNVERIFIED] "}${"kind" in f ? "[" + f.kind.toUpperCase() + "] " : ""}${f.text}${f.detail ? " — " + f.detail : ""}${"deadline" in f ? "\nDeadline: " + f.deadline + " · Who: " + f.who + " · You need: " + f.prerequisites + " · " + (f.optional ? "Optional / if interested" : "Required under the stated conditions") : ""}\nSource${f.sourcePage ? " · page " + f.sourcePage : ""}: «${f.citation.quote}»`,
                  )
                  .join("\n\n")
              : "The document does not specify this."),
        )
        .join("\n\n") +
      "\n\nORIGINAL DOCUMENT\n" +
      result.pages.map((p) => "Page " + p.number + "\n" + p.text).join("\n\n");
    const url = URL.createObjectURL(
      new Blob([out], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "ponte-summary.txt";
    link.click();
    URL.revokeObjectURL(url);
  }
  const a = result?.analysis;
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header>
        <div className="nav">
          <button
            className="brand-button"
            onClick={reset}
            aria-label="Ponte, go to home"
          >
            <Logo />
          </button>
          <nav aria-label="Main navigation">
            <a href={result ? "#overview" : "#how-it-works"}>How it works</a>
            <a href={result ? "#questions" : "#examples"}>
              {result ? "Ask a question" : "Try an example"}
            </a>
            <a href="#privacy" className="nav-privacy">
              <ShieldCheck size={16} />
              Privacy
            </a>
          </nav>
          <span className="nav-tag">
            <span className="tiny-dot" />
            Everyday documents, made clearer
          </span>
        </div>
      </header>
      {!result ? (
        <main className="home" id="main-content">
          <div
            className="journey"
            id="how-it-works"
            aria-label="How Ponte works"
          >
            <div>
              <span className="journey-number active">1</span>
              <strong>Add a notice</strong>
            </div>
            <ChevronRight size={17} />
            <div>
              <span className="journey-number">2</span>
              <span>Understand it</span>
            </div>
            <ChevronRight size={17} />
            <div>
              <span className="journey-number">3</span>
              <span>Take the next step</span>
            </div>
          </div>
          <section className="workspace">
            <div className="hero">
              <div className="eyebrow">
                <span className="tiny-dot" />
                LESS PAPERWORK. MORE CLARITY.
              </div>
              <h1>
                Any notice.
                <br />
                <span>Clear next steps.</span>
              </h1>
              <p className="hero-sub">
                A letter, a bill, an appointment or an official notice.
                Understand what it means, what to do and by when.
              </p>
              <div className="benefits-list">
                <div>
                  <span className="benefit-icon blue">
                    <BookOpen size={21} />
                  </span>
                  <div>
                    <h3>Understand the essentials</h3>
                    <p>
                      A plain-English explanation, including who it applies to.
                    </p>
                  </div>
                </div>
                <div>
                  <span className="benefit-icon teal">
                    <CheckCheck size={21} />
                  </span>
                  <div>
                    <h3>Turn information into action</h3>
                    <p>A checklist, deadlines, fees and things to prepare.</p>
                  </div>
                </div>
                <div>
                  <span className="benefit-icon lavender">
                    <Link size={21} />
                  </span>
                  <div>
                    <h3>Check it against the original</h3>
                    <p>Every extracted item links back to its source.</p>
                  </div>
                </div>
              </div>
              <div className="hero-pills">
                <span>
                  <Check size={15} />
                  No account needed
                </span>
                <span>
                  <Check size={15} />
                  Made for everyday life
                </span>
              </div>
              <div className="honesty">
                <HelpCircle size={20} />
                <div>
                  <strong>Missing details stay missing.</strong>
                  <p>
                    Ponte flags unclear dates and missing information, so you
                    know what to ask the sender.
                  </p>
                </div>
              </div>
            </div>
            <section className="upload-card" aria-labelledby="upload-title">
              <div className="card-intro">
                <span className="square-icon">
                  <FileText size={24} />
                </span>
                <div>
                  <span className="section-kicker">START HERE</span>
                  <h2 id="upload-title">Add a document</h2>
                </div>
              </div>
              <div
                className="tabs"
                role="tablist"
                aria-label="Document input"
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const next = tab === "pdf" ? "text" : "pdf";
                    setTab(next);
                    document.getElementById(next + "-tab")?.focus();
                  }
                }}
              >
                <button
                  id="pdf-tab"
                  role="tab"
                  aria-controls="upload-panel"
                  aria-selected={tab === "pdf"}
                  tabIndex={tab === "pdf" ? 0 : -1}
                  className={tab === "pdf" ? "selected" : ""}
                  onClick={() => setTab("pdf")}
                >
                  <Upload size={17} />
                  Upload PDF
                </button>
                <button
                  id="text-tab"
                  role="tab"
                  aria-controls="upload-panel"
                  aria-selected={tab === "text"}
                  tabIndex={tab === "text" ? 0 : -1}
                  className={tab === "text" ? "selected" : ""}
                  onClick={() => setTab("text")}
                >
                  <FileText size={17} />
                  Paste text
                </button>
              </div>
              <div
                id="upload-panel"
                role="tabpanel"
                aria-labelledby={tab === "pdf" ? "pdf-tab" : "text-tab"}
              >
                {tab === "pdf" ? (
                  <div
                    className={"dropzone " + (drag ? "dragging" : "")}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrag(false);
                      if (e.dataTransfer.files[0])
                        void loadFile(e.dataTransfer.files[0]);
                    }}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      hidden
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void loadFile(e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                    <span className="upload-art">
                      {fileName ? (
                        <CheckCheck size={32} />
                      ) : (
                        <Upload size={30} />
                      )}
                    </span>
                    <strong>{fileName || "Drop your PDF here"}</strong>
                    <p>
                      {fileName
                        ? `${pages.length} page${pages.length === 1 ? "" : "s"} read successfully`
                        : "or choose a file from your device"}
                    </p>
                    <button
                      className="choose-button"
                      onClick={() => inputRef.current?.click()}
                      disabled={!!busy}
                    >
                      {fileName ? "Change file" : "Choose a PDF"}
                      <ArrowRight size={16} />
                    </button>
                    <small>Selectable text only · up to 10 MB · 20 pages</small>
                  </div>
                ) : (
                  <>
                    <label htmlFor="document-text" className="sr-only">
                      Document text
                    </label>
                    <textarea
                      id="document-text"
                      className="document-text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={60000}
                      placeholder="Paste the complete document here, including any dates, costs and instructions…"
                    />
                    <span className="character-count">
                      {text.length.toLocaleString("en-GB")} / 60,000 characters
                    </span>
                  </>
                )}
              </div>
              <details className="personalize">
                <summary>
                  Add a little context <span>Optional</span>
                </summary>
                <p>
                  Optionally tell us who you are reading for. Recipient matches
                  are checked against the original wording.
                </p>
                <div className="fields">
                  <label>
                    Reading for
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="">Choose an option</option>
                      <option value="myself">Myself</option>
                      <option value="someone_else">Someone I help</option>
                    </select>
                  </label>
                  <label>
                    Recipient or group
                    <input
                      placeholder="e.g. Oak Street"
                      value={audience}
                      maxLength={40}
                      onChange={(e) => setAudience(e.target.value)}
                    />
                  </label>
                </div>
              </details>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              {ai ? (
                <>
                  <button
                    className="primary analyze"
                    disabled={
                      !!busy ||
                      !configReady ||
                      (tab === "text" ? !text.trim() : !pages.length)
                    }
                    onClick={() => void analyze()}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="spin" size={18} />
                        {busy}
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} />
                        Explain this notice
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  <p className="upload-note">
                    <ShieldCheck size={14} />
                    Your text will be sent to {providerLabel}
                    {providerLabel === "OpenRouter"
                      ? " and its model provider"
                      : ""}{" "}
                    for analysis.
                  </p>
                  <button
                    className="demo-shortcut"
                    onClick={() => void analyze("gita")}
                    disabled={!!busy || !examples.length}
                  >
                    Or try a sample notice <ArrowRight size={15} />
                  </button>
                </>
              ) : (
                <div className="demo-start">
                  <div className="demo-context">
                    <span className="mode-badge">EXPLORE PONTE</span>
                    <p>
                      Explore an example while document analysis is temporarily
                      unavailable.
                    </p>
                  </div>
                  <button
                    className="primary analyze"
                    onClick={() => void analyze("gita")}
                    disabled={!!busy || !examples.length}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="spin" size={18} />
                        {busy}
                      </>
                    ) : (
                      <>
                        Try a sample notice
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  {(pages.length > 0 || text.trim()) && (
                    <p className="upload-note">
                      Your document is ready. Analysis is temporarily
                      unavailable. Please try again later.
                    </p>
                  )}
                </div>
              )}
            </section>
          </section>
          <section className="examples-section" id="examples">
            <div className="section-heading">
              <div>
                <span className="section-kicker">TAKE A LOOK AROUND</span>
                <h2>Three notices. See how it works.</h2>
                <p>
                  Explore everyday situations, with clear actions, deadlines and
                  source references.
                </p>
              </div>
              <span className="example-label">
                <ShieldCheck size={15} />
                Sample notices · no personal data
              </span>
            </div>
            <div className="example-grid">
              {examples.map((e, i) => (
                <button
                  key={e.id}
                  className="example-card"
                  onClick={() => void analyze(e.id)}
                  disabled={!!busy}
                >
                  <div className="example-card-top">
                    <span className={"example-icon icon-" + i}>
                      {i === 0 ? (
                        <Compass size={23} />
                      ) : i === 1 ? (
                        <Users size={23} />
                      ) : (
                        <HelpCircle size={23} />
                      )}
                    </span>
                    <span className="example-category">{e.category}</span>
                  </div>
                  <h3>{e.title}</h3>
                  <p>{e.description}</p>
                  <span className="try-link">
                    Explore example
                    <ArrowRight size={17} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        </main>
      ) : (
        <main className="results" id="main-content">
          <div className="result-top">
            <button className="text-button" onClick={reset}>
              <ArrowLeft size={17} />
              New notice
            </button>
            <span className="mode-badge">
              {result.mode === "demo" ? "EXAMPLE GUIDE" : "DOCUMENT SUMMARY"}
            </span>
          </div>
          <div className="result-heading">
            <div>
              <span className="section-kicker">YOUR NOTICE, EXPLAINED</span>
              <h1>{a!.title}</h1>
              <p>Understand the details. Take the next step.</p>
            </div>
            <div className="result-tools">
              <button
                className="secondary"
                onClick={() => setShowDoc(!showDoc)}
              >
                <FileText size={17} />
                {showDoc ? "Hide document" : "View document"}
              </button>
              <button className="secondary" onClick={download}>
                <Download size={17} />
                Download summary
              </button>
              <button
                className="secondary print-button"
                onClick={() => window.print()}
              >
                Print / PDF
              </button>
            </div>
          </div>
          {result.mode === "demo" && (
            <div className="demo-banner">
              <Sparkles size={18} />
              <p>
                <strong>Example guide.</strong> This sample notice includes
                prepared explanations and answers. View the source to see where
                each detail comes from.
              </p>
            </div>
          )}
          <div className="at-a-glance" aria-label="Notice at a glance">
            <a href="#actions">
              <span className="glance-icon teal">
                <CheckCheck size={23} />
              </span>
              <div>
                <span>YOUR TO-DO LIST</span>
                <strong>
                  {a!.actions.length
                    ? `${checked.length} of ${a!.actions.length} completed`
                    : "No actions specified"}
                </strong>
              </div>
              <ArrowUpRight size={17} />
            </a>
            <a href="#dates">
              <span className="glance-icon blue">
                <CalendarDays size={23} />
              </span>
              <div>
                <span>EARLIEST DATED DEADLINE</span>
                <strong>
                  {dateLabel(
                    a!.dates.find(
                      (d) => d.kind === "deadline" && d.verified && d.iso,
                    )?.iso,
                    "No dated deadline specified",
                  )}
                </strong>
              </div>
              <ArrowUpRight size={17} />
            </a>
            <a href="#clarifications">
              <span
                className={
                  "glance-icon " + (a!.questions.length ? "amber" : "teal")
                }
              >
                <HelpCircle size={23} />
              </span>
              <div>
                <span>DETAILS TO CHECK</span>
                <strong>
                  {a!.questions.length
                    ? `${a!.questions.length} point${a!.questions.length === 1 ? "" : "s"} need clarification`
                    : "No specific issues flagged"}
                </strong>
              </div>
              <ArrowUpRight size={17} />
            </a>
          </div>
          <nav className="section-nav" aria-label="Result sections">
            <a href="#overview">
              <BookOpen size={16} />
              Overview
            </a>
            <a href="#actions">
              <CheckCheck size={16} />
              To-do list
            </a>
            <a href="#dates">
              <CalendarDays size={16} />
              Dates & costs
            </a>
            <a href="#clarifications">
              <HelpCircle size={16} />
              To clarify
              {a!.questions.length > 0 && <span>{a!.questions.length}</span>}
            </a>
            <a href="#questions">
              <MessageCircle size={16} />
              Ask a question
            </a>
          </nav>
          <p className="print-disclaimer">
            {result.mode === "demo"
              ? "Example guide — Sample notice with prepared explanations."
              : "Document summary — Check the original notice for full details."}
          </p>
          <div className={"result-layout " + (showDoc ? "split" : "")}>
            <div className="result-content">
              <section className="result-card summary-card" id="overview">
                <div className="result-card-title">
                  <span className="heading-icon blue">
                    <BookOpen size={21} />
                  </span>
                  <div>
                    <h2>In plain English</h2>
                    <p>The important details, without the formal language.</p>
                  </div>
                </div>
                <FactList
                  items={a!.summary}
                  empty="No source-backed explanation is available."
                  onOpen={setSource}
                />
                <div className="audience-block">
                  <div className="audience-title">
                    <Users size={18} />
                    <h3>Who this is for</h3>
                  </div>
                  <FactList
                    items={a!.recipients}
                    empty="The document does not specify who it is for."
                    onOpen={setSource}
                  />
                  {audience && (
                    <p className="class-note">
                      Recipient or group: <strong>{audience}</strong>.{" "}
                      {a!.recipients.some(
                        (f) =>
                          f.verified &&
                          matchesRecipient(audience, f.citation.quote),
                      )
                        ? "An explicit match was found in the source."
                        : "An exact match could not be confirmed. Check the recipients in the original notice."}
                    </p>
                  )}
                </div>
              </section>
              <section className="result-card actions-card" id="actions">
                <div className="result-card-title">
                  <span className="heading-icon teal">
                    <CheckCheck size={22} />
                  </span>
                  <div>
                    <h2>Your to-do list</h2>
                    <p>Tick each step as you complete it.</p>
                  </div>
                  <span className="count">
                    {checked.length}/{a!.actions.length} done
                  </span>
                </div>
                {a!.actions.length > 0 && (
                  <div className="progress-track" aria-hidden="true">
                    <div
                      style={{
                        width: `${(checked.length / a!.actions.length) * 100}%`,
                      }}
                    />
                  </div>
                )}
                {a!.actions.length ? (
                  a!.actions.map((f, i) => (
                    <div
                      key={i}
                      className={
                        "action-row " +
                        (checked.includes(i) ? "completed" : "") +
                        (!f.verified ? " unverified" : "")
                      }
                    >
                      <input
                        type="checkbox"
                        id={"action-" + i}
                        checked={checked.includes(i)}
                        onChange={() => toggle(i)}
                      />
                      <div className="action-body">
                        <div className="action-title">
                          <label htmlFor={"action-" + i}>{f.text}</label>
                          <span className="action-kind">
                            {f.optional
                              ? "If you choose to take part"
                              : "Required under the stated conditions"}
                          </span>
                        </div>
                        <div className="action-meta">
                          <span>
                            <Users size={14} />
                            {f.who || "Person not specified"}
                          </span>
                          <span className="deadline-tag">
                            <Clock size={14} />
                            {f.deadline || "Deadline not specified"}
                          </span>
                        </div>
                        {f.prerequisites && (
                          <p className="prerequisites">
                            <strong>You’ll need:</strong> {f.prerequisites}
                          </p>
                        )}
                        <SourceButton fact={f} onOpen={setSource} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="empty-note">
                    No explicit actions are given in the document.
                  </p>
                )}
                <p className="section-note action-footnote">
                  Requirements apply under the conditions stated in the notice.
                </p>
              </section>
              <div className="result-two" id="dates">
                <section className="result-card">
                  <div className="result-card-title">
                    <span className="heading-icon blue">
                      <CalendarDays size={21} />
                    </span>
                    <div>
                      <h2>Dates & deadlines</h2>
                      <p>Due dates and event dates are kept separate.</p>
                    </div>
                  </div>
                  {a!.dates.length ? (
                    a!.dates.map((f, i) => (
                      <div
                        key={i}
                        className={
                          "date-item " + (!f.verified ? "unverified" : "")
                        }
                      >
                        <span className={"date-kind " + f.kind}>
                          {f.kind === "event"
                            ? "EVENT"
                            : f.kind === "deadline"
                              ? "DEADLINE"
                              : "NEEDS CLARIFICATION"}
                        </span>
                        <h3>{f.detail || "Date in the original notice"}</h3>
                        <p>{f.text}</p>
                        <SourceButton fact={f} onOpen={setSource} />
                      </div>
                    ))
                  ) : (
                    <p className="empty-note">
                      The document does not specify any dates.
                    </p>
                  )}
                </section>
                <section className="result-card">
                  <div className="result-card-title">
                    <span className="heading-icon lavender">
                      <Wallet size={21} />
                    </span>
                    <div>
                      <h2>Costs & documents</h2>
                      <p>Only what the notice explicitly mentions.</p>
                    </div>
                  </div>
                  <FactList
                    items={a!.costs}
                    empty="No costs or required documents are specified."
                    onOpen={setSource}
                  />
                </section>
              </div>
              <section
                id="clarifications"
                className={
                  "result-card " +
                  (a!.questions.length ? "warning-card" : "clear-card")
                }
              >
                <div className="result-card-title">
                  <span
                    className={
                      "heading-icon " + (a!.questions.length ? "amber" : "teal")
                    }
                  >
                    <HelpCircle size={21} />
                  </span>
                  <div>
                    <h2>What needs clarification</h2>
                    <p>
                      {a!.questions.length
                        ? "Check these details with the sender before acting."
                        : "A final check of the original is always a good idea."}
                    </p>
                  </div>
                </div>
                <FactList
                  items={a!.questions}
                  empty="No specific issues were flagged. This does not guarantee the notice is complete or the analysis is correct."
                  onOpen={setSource}
                />
              </section>
              <section className="result-card chat-card" id="questions">
                <div className="result-card-title">
                  <span className="heading-icon blue">
                    <MessageCircle size={21} />
                  </span>
                  <div>
                    <h2>Ask about this notice</h2>
                    <p>
                      Answers come from the document, with source references.
                    </p>
                  </div>
                </div>
                <div className="question-chips">
                  {[
                    "Do I need to sign anything?",
                    "What is the payment deadline?",
                    "What documents do I need?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => void ask(q)}
                      disabled={!!busy}
                    >
                      {q}
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
                <div aria-live="polite">
                  {chat.map((c, i) => (
                    <div className="chat-message" key={i}>
                      <strong>{c.question}</strong>
                      <p>{c.answer}</p>
                      {c.citations.map((f, j) => (
                        <SourceButton fact={f} onOpen={setSource} key={j} />
                      ))}
                    </div>
                  ))}
                  {busy && (
                    <p className="loading-line">
                      <LoaderCircle size={17} className="spin" />
                      {busy}
                    </p>
                  )}
                </div>
                <form
                  className="chat-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask();
                  }}
                >
                  <label className="sr-only" htmlFor="question">
                    Question about the notice
                  </label>
                  <input
                    id="question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={500}
                    placeholder="Ask a question about this notice…"
                  />
                  <button
                    className="primary"
                    disabled={!!busy || !question.trim()}
                    aria-label="Send question"
                  >
                    <Send size={19} />
                  </button>
                </form>
                {result.mode === "demo" && (
                  <small className="demo-chat-note">
                    This example includes prepared answers about forms, fees,
                    dates, booking and recipients. Upload your own notice for
                    document analysis.
                  </small>
                )}
              </section>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="reset-button" onClick={reset}>
                <Trash2 size={16} />
                Clear document & start again
              </button>
            </div>
            {showDoc && (
              <aside className="original-document">
                <div className="result-card-title">
                  <FileText size={20} />
                  <h2>Original document</h2>
                  <button
                    className="icon-button"
                    aria-label="Close document"
                    onClick={() => setShowDoc(false)}
                  >
                    <X size={19} />
                  </button>
                </div>
                <p className="section-note">
                  Read the extracted text below. Quotations retain the original
                  wording.
                </p>
                {result.pages.map((p) => (
                  <article key={p.number}>
                    <span className="section-kicker">
                      {result.exampleId ? "SAMPLE NOTICE · " : ""}PAGE{" "}
                      {p.number}
                    </span>
                    <pre>{p.text}</pre>
                  </article>
                ))}
              </aside>
            )}
          </div>
        </main>
      )}
      <section className="privacy" id="privacy">
        <ShieldCheck size={23} />
        <div>
          <strong>Your notice. Your next steps. Your privacy.</strong>
          <p>
            {ai
              ? `Document text and questions are sent to ${providerLabel}${providerLabel === "OpenRouter" ? " and its model provider" : ""}. Documents are not saved on our server; the providers’ retention policies apply separately.`
              : "Sample notices do not send data to an AI provider. Uploaded PDFs are read on the server without being saved to disk."}{" "}
            Checklist progress stays in your browser session.
          </p>
        </div>
        <span>No account required</span>
      </section>
      <footer>
        <Logo />
        <p>A bridge between documents and everyday life.</p>
        <span>Everyday documents. Clear next steps.</span>
      </footer>
      <dialog
        ref={sourceRef}
        className="source-dialog"
        aria-labelledby="source-title"
        onCancel={() => setSource(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSource(null);
        }}
      >
        <div className="modal-top">
          <h2 id="source-title">
            <Link size={21} />
            Check the original
          </h2>
          <button
            autoFocus
            className="icon-button"
            onClick={() => setSource(null)}
            aria-label="Close source"
          >
            <X size={23} />
          </button>
        </div>
        {source && (
          <>
            <span
              className={
                "verification " + (source.verified ? "" : "not-verified")
              }
            >
              {source.verified ? (
                <>
                  <ShieldCheck size={17} />
                  Exact quote found
                  {source.sourcePage ? ` · page ${source.sourcePage}` : ""}
                </>
              ) : (
                "Quote not found — this information is unverified"
              )}
            </span>
            <p className="quote-label">EXACT WORDING FROM THE NOTICE</p>
            <blockquote>{source.citation.quote}</blockquote>
            {source.context && (
              <>
                <h3>Surrounding context</h3>
                <p className="source-context">{source.context}</p>
              </>
            )}
            <button
              className="secondary"
              onClick={() => {
                setShowDoc(true);
                setSource(null);
              }}
            >
              View the full document
              <ArrowRight size={17} />
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
