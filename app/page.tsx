"use client";

import { useState } from "react";

export default function Home() {
  const [resume, setResume] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [experience, setExperience] = useState("");
  const [hasConsent, setHasConsent] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const handleFile = (file: File | undefined) => {
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type)) {
      alert("Please upload a PDF or DOCX file.");
      return;
    }

    setResume(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const startInterview = async () => {
    if (!resume) {
      alert("Please upload your resume before starting.");
      return;
    }

    if (!name.trim() || !role.trim() || !experience || !hasConsent) {
      alert("Please complete your name, role, experience level, and consent before starting.");
      return;
    }

    setIsStarting(true);
    setStartError("");

    try {
      const response = await fetch("/api/interview/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          experience,
          resumeName: resume.name,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.interviewId) {
        throw new Error(data.error || "Could not create the interview record.");
      }

      // The file remains in the browser until resume storage/analysis is added.
      // The server-generated interview ID links every later evaluation to this run.
      sessionStorage.setItem(
        "ai-interviewer-candidate",
        JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          experience,
          resumeName: resume.name,
          interviewId: data.interviewId,
        })
      );

      window.location.href = "/interview";
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "Could not start the interview."
      );
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              AI
            </div>

            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                AI Interviewer
              </h1>
              <p className="text-xs text-slate-500">
                Intelligent interview platform
              </p>
            </div>
          </div>

          <div className="text-sm text-slate-500">
            Candidate Portal
          </div>
        </div>
      </header>

      {/* Main */}
      <section className="mx-auto max-w-4xl px-6 py-12">
        {/* Welcome */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
            AI-powered interview
          </div>

          <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
            Welcome to your interview
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-500">
            Please provide your details and upload your latest resume.
            Once you are ready, start the interview to meet your AI
            interviewer.
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Name */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Full Name
              </label>

              <input
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            {/* Email */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Email
              </label>

              <input
                type="email"
                placeholder="Enter your email"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            {/* Role */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Interview Role
              </label>

              <input
                type="text"
                placeholder="e.g. AI Engineer"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            {/* Experience */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Experience Level
              </label>

              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                value={experience}
                onChange={(event) => setExperience(event.target.value)}
              >
                <option value="" disabled>
                  Select experience level
                </option>
                <option>Fresher</option>
                <option>0–2 years</option>
                <option>2–5 years</option>
                <option>5+ years</option>
              </select>
            </div>
          </div>

          {/* Resume */}
          <div className="mt-8">
            <label className="mb-2 block text-sm font-medium">
              Resume
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() =>
                document.getElementById("resume-upload")?.click()
              }
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${
                dragging
                  ? "border-slate-900 bg-slate-100"
                  : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
              }`}
            >
              <input
                id="resume-upload"
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />

              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
                📄
              </div>

              {resume ? (
                <>
                  <p className="font-medium text-slate-900">
                    {resume.name}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Resume selected successfully
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-slate-900">
                    Upload your resume
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Drag and drop your file here, or click to browse
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Supported formats: PDF, DOCX
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-semibold text-slate-900">
              Before you begin
            </h3>

            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <li>• The interview will be conducted through voice.</li>
              <li>• Please allow microphone access when requested.</li>
              <li>• Stay on the interview page throughout the session.</li>
              <li>• Leaving the interview page may terminate your session.</li>
              <li>• Answer questions naturally and clearly.</li>
              <li>• The AI may ask one follow-up question when clarification is needed.</li>
              <li>• Your evaluation scores will not be displayed during the interview.</li>
            </ul>
          </div>

          {/* Consent */}
          <div className="mt-6 flex items-start gap-3">
            <input
              id="consent"
              type="checkbox"
              checked={hasConsent}
              onChange={(event) => setHasConsent(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />

            <label
              htmlFor="consent"
              className="text-sm leading-6 text-slate-600"
            >
              I understand the interview instructions and agree to
              participate in the AI-powered interview.
            </label>
          </div>

          {/* Start */}
          <button
            onClick={startInterview}
            disabled={isStarting}
            className="mt-8 w-full rounded-xl bg-slate-900 px-6 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99]"
          >
            {isStarting ? "Creating interview..." : "Start Interview"}
          </button>

          {startError && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {startError}
            </p>
          )}
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Your interview responses will be processed to evaluate your
          suitability for the selected role.
        </p>
      </section>
    </main>
  );
}
