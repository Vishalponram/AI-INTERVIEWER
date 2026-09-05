"use client";

import { useEffect, useRef, useState } from "react";

// ==================================================
// TYPES
// ==================================================

type InterviewStage =
  | "START"
  | "SELF_INTRO"
  | "PROJECT"
  | "TECHNICAL"
  | "FOLLOW_UP"
  | "NON_TECHNICAL"
  | "FINAL";

type ConversationMessage = {
  speaker: "AI" | "CANDIDATE";
  text: string;
};

type InterviewEvaluation = {
  question: string;
  answer: string;
  score: number;
  relevance: number;
  technicalCorrectness: number;
  depth: number;
  clarity: number;
  completeness: number;
  decision: "PASS" | "FAIL";
  followUpRequired: boolean;
  followUpQuestion: string;
  strengths: string[];
  weaknesses: string[];
  internalSummary: string;
};

type InterviewState = {
  interviewId: string | null;

  stage: InterviewStage;

  role: string;

  candidate: {
    resume: string | null;
    name: string | null;
    experience: string | null;
    skills: string[];
    projects: string[];
  };

  conversation: ConversationMessage[];

  currentQuestion: string;

  questionNumber: number;

  evaluations: InterviewEvaluation[];

  technicalQuestionsAsked: number;

  nonTechnicalQuestionsAsked: number;

  followUpUsed: boolean;
};

// ==================================================
// COMPONENT
// ==================================================

export default function InterviewPage() {
  // ==================================================
  // N8N
  // ==================================================

  const N8N_EVALUATOR_URL =
    "/api/evaluate-answer";

  // ==================================================
  // INTERVIEW STATE
  // ==================================================

  const interviewStateRef =
    useRef<InterviewState>({
      interviewId: null,

      stage: "START",

      role: "",

      candidate: {
        resume: null,
        name: null,
        experience: null,
        skills: [],
        projects: [],
      },

      conversation: [],

      currentQuestion: "",

      questionNumber: 0,

      evaluations: [],

      technicalQuestionsAsked: 0,

      nonTechnicalQuestionsAsked: 0,

      followUpUsed: false,
    });

  // ==================================================
  // UI STATE
  // ==================================================

  const [status, setStatus] =
    useState("Starting...");

  const [subtitle, setSubtitle] =
    useState("");

  const [candidateSubtitle, setCandidateSubtitle] =
    useState("");

  const [error, setError] =
    useState("");

  const [isSpeaking, setIsSpeaking] =
    useState(false);

  const [isListening, setIsListening] =
    useState(false);

  const [isGeminiReady, setIsGeminiReady] =
    useState(false);

  const [conversation, setConversation] =
    useState<ConversationMessage[]>([]);

  const [isTerminated, setIsTerminated] =
    useState(false);

  // ==================================================
  // GEMINI WEBSOCKET
  // ==================================================

  const wsRef =
    useRef<WebSocket | null>(null);

  const sessionIdRef =
    useRef(0);

  const isTerminatedRef =
    useRef(false);


  // ==================================================
  // AI AUDIO
  // ==================================================

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const nextAudioTimeRef =
    useRef(0);

  const activeSourcesRef =
    useRef<AudioBufferSourceNode[]>([]);

  // ==================================================
  // AI SUBTITLE
  // ==================================================

  const aiTurnActiveRef =
    useRef(false);

  const currentSubtitleRef =
    useRef("");

  const currentAITranscriptRef =
    useRef("");

  // ==================================================
  // CANDIDATE MICROPHONE
  // ==================================================

  const microphoneStreamRef =
    useRef<MediaStream | null>(null);

  const microphoneContextRef =
    useRef<AudioContext | null>(null);

  const microphoneSourceRef =
    useRef<MediaStreamAudioSourceNode | null>(
      null
    );

  const processorRef =
    useRef<ScriptProcessorNode | null>(null);

  // ==================================================
  // CANDIDATE RESPONSE
  // ==================================================

  const candidateResponseRef =
    useRef("");

  const candidateTurnActiveRef =
    useRef(false);

  const candidateAnswerTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentCandidateTranscriptRef =
    useRef("");

  // Prevent duplicate evaluations
  const lastEvaluatedCandidateRef =
    useRef("");

  // ==================================================
  // MERGE TRANSCRIPT
  // ==================================================

  function mergeTranscript(
    current: string,
    incoming: string
  ) {
    const previous =
      current.trim();

    const next =
      incoming.trim();

    if (!next) {
      return previous;
    }

    if (!previous) {
      return next;
    }

    if (
      next.startsWith(previous)
    ) {
      return next;
    }

    if (
      previous.startsWith(next)
    ) {
      return previous;
    }

    const maxOverlap =
      Math.min(
        previous.length,
        next.length
      );

    for (
      let length = maxOverlap;
      length > 0;
      length--
    ) {
      const previousEnd =
        previous.slice(
          previous.length -
            length
        );

      const nextStart =
        next.slice(
          0,
          length
        );

      if (
        previousEnd.toLowerCase() ===
        nextStart.toLowerCase()
      ) {
        return (
          previous +
          next.slice(length)
        );
      }
    }

    return `${previous} ${next}`;
  }

  function persistInterviewMessage(
    message: ConversationMessage,
    messageOrder: number,
    stage: InterviewStage
  ) {
    const interviewId = interviewStateRef.current.interviewId;

    if (!interviewId) return;

    void fetch("/api/interview/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interviewId,
        speaker: message.speaker,
        text: message.text,
        messageOrder,
        stage,
      }),
      keepalive: true,
    }).catch((error) => {
      console.error("[TRANSCRIPT STORAGE ERROR]", error);
    });
  }

  // ==================================================
  // SAVE AI TURN
  // ==================================================

  function saveAITurn() {
    const text =
      currentAITranscriptRef.current.trim();

    if (!text) {
      return;
    }

    const conversation =
      interviewStateRef.current
        .conversation;

    const lastMessage =
      conversation[
        conversation.length - 1
      ];

    // Prevent duplicate AI messages
    if (
      lastMessage?.speaker ===
        "AI" &&
      lastMessage.text === text
    ) {
      currentAITranscriptRef.current =
        "";

      return;
    }

    const message = {
      speaker: "AI",
      text,
    } satisfies ConversationMessage;
    conversation.push(message);

    setConversation([...conversation]);

    console.log(
      "[INTERVIEW] AI turn saved:",
      text
    );

    /*
     * If this looks like a question,
     * keep it as the current question.
     */

    interviewStateRef.current.currentQuestion =
      text;

    persistInterviewMessage(
      message,
      conversation.length,
      interviewStateRef.current.stage
    );

    currentAITranscriptRef.current =
      "";
  }

  // ==================================================
  // SAVE CANDIDATE TURN
  // ==================================================

  function saveCandidateTurn() {
    const text =
      currentCandidateTranscriptRef.current.trim();

    if (!text) {
      return false;
    }

    const conversation =
      interviewStateRef.current
        .conversation;

    const lastMessage =
      conversation[
        conversation.length - 1
      ];

    // Prevent duplicate candidate messages
    if (
      lastMessage?.speaker ===
        "CANDIDATE" &&
      lastMessage.text === text
    ) {
      return false;
    }

    const message = {
      speaker: "CANDIDATE",
      text,
    } satisfies ConversationMessage;
    conversation.push(message);

    setConversation([...conversation]);

    console.log(
      "[INTERVIEW] Candidate turn saved:",
      text
    );

    persistInterviewMessage(
      message,
      conversation.length,
      interviewStateRef.current.stage
    );

    // Clear transcript for the next candidate answer
    candidateResponseRef.current = "";
    currentCandidateTranscriptRef.current = "";
    setCandidateSubtitle("");

    return true;
  }

  function processCandidateAnswer() {
    if (isTerminatedRef.current) {
      return;
    }

    const answer =
      currentCandidateTranscriptRef.current.trim();

    if (!answer) {
      console.log(
        "[INTERVIEW] No candidate answer to process"
      );
      return;
    }

    console.log(
      "[INTERVIEW] Candidate answer detected:",
      answer
    );

    const question =
      interviewStateRef.current.currentQuestion
        .trim();

    // ----------------------------------------
    // READINESS CHECK
    // ----------------------------------------

    if (
      question
        .toLowerCase()
        .includes("are you ready to begin")
    ) {
      const isReady =
        /^(yes|yeah|yep|sure|okay|ok|ready|let's begin|let us begin)\b/i.test(
          answer
        );

      // Save the readiness response, but NEVER evaluate it.
      const saved =
        saveCandidateTurn();

      if (!saved) {
        return;
      }

      if (isReady) {
        console.log(
          "[INTERVIEW] Candidate is ready. Starting interview."
        );

        interviewStateRef.current.stage =
          "SELF_INTRO";

        askNextInterviewQuestion(
          `The candidate is ready to begin.

Ask exactly this question:
"Please introduce yourself and briefly tell me about your professional experience."

Do not ask anything else.`
        );
      } else {
        console.log(
          "[INTERVIEW] Candidate is not ready yet."
        );

        askNextInterviewQuestion(
          `The candidate is not ready yet.

Respond briefly:
"No problem. Take your time and let me know when you're ready."

Do not start the interview.
Do not ask another interview question.`
        );
      }

      return;
    }

    // ----------------------------------------
    // NORMAL INTERVIEW ANSWER
    // ----------------------------------------

    const saved =
      saveCandidateTurn();

    if (!saved) {
      return;
    }

    console.log(
      "[EVALUATION] New candidate answer detected"
    );

    void evaluateLatestCandidateAnswer()
      .catch((error) => {
        console.error(
          "[EVALUATION ERROR]",
          error
        );
      });
  }

  // ==================================================
  // EVALUATE CANDIDATE ANSWER
  // ==================================================

  async function evaluateCandidateAnswer() {
    const state = interviewStateRef.current;
    const conversation = state.conversation;

    if (!state.interviewId) {
      console.error("[EVALUATION] Missing interview ID");
      return;
    }

    // Find the latest candidate answer
    let candidateIndex = -1;

    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].speaker === "CANDIDATE") {
        candidateIndex = i;
        break;
      }
    }

    if (candidateIndex === -1) {
      console.log("[EVALUATION] No candidate answer found");
      return;
    }

    const candidateAnswer =
      conversation[candidateIndex].text.trim();

    if (!candidateAnswer) {
      console.log("[EVALUATION] Candidate answer is empty");
      return;
    }

    // Find the AI question immediately before the candidate answer
    let question = "";

    for (let i = candidateIndex - 1; i >= 0; i--) {
      if (conversation[i].speaker === "AI") {
        question = conversation[i].text.trim();
        break;
      }
    }

    if (!question) {
      console.log("[EVALUATION] No question found");
      return;
    }

    const normalizedQuestion = question.toLowerCase();

    if (
      normalizedQuestion.includes("uploaded your resume") ||
      normalizedQuestion.includes("upload your resume")
    ) {
      console.log(
        "[EVALUATION] Skipping resume-upload confirmation question"
      );
      return;
    }

    console.log("[EVALUATION] Sending answer to n8n");

    try {
      const response = await fetch(N8N_EVALUATOR_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          interviewId: state.interviewId,
          question,
          answer: candidateAnswer,
          role: state.role || "Data Engineer",
          experienceLevel:
            state.candidate.experience || "Junior",
          stage: state.stage,
          questionNumber: state.questionNumber,
          followUpUsed: state.followUpUsed,
        }),
      });

      console.log(
        "[EVALUATION] n8n response status:",
        response.status
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.details
            ? `n8n returned ${response.status}: ${errorBody.details}`
            : errorBody?.error || `Evaluation request returned ${response.status}`
        );
      }

      const rawEvaluation = await response.json();

      const evaluation: InterviewEvaluation = {
        question,
        answer: candidateAnswer,
        score: Number(rawEvaluation.score) || 0,
        relevance: Number(rawEvaluation.relevance) || 0,
        technicalCorrectness: Number(rawEvaluation.technicalCorrectness) || 0,
        depth: Number(rawEvaluation.depth) || 0,
        clarity: Number(rawEvaluation.clarity) || 0,
        completeness: Number(rawEvaluation.completeness) || 0,
        decision: rawEvaluation.decision === "FAIL" ? "FAIL" : "PASS",
        followUpRequired: Boolean(rawEvaluation.followUpRequired),
        followUpQuestion: String(rawEvaluation.followUpQuestion || ""),
        strengths: Array.isArray(rawEvaluation.strengths) ? rawEvaluation.strengths : [],
        weaknesses: Array.isArray(rawEvaluation.weaknesses) ? rawEvaluation.weaknesses : [],
        internalSummary: String(rawEvaluation.internalSummary || ""),
      };

      console.log(
        "[EVALUATION] Result:",
        evaluation
      );

      // Evaluation data stays in memory and is never rendered to the candidate.
      state.evaluations.push(evaluation);

      console.log(
        "[EVALUATION] Score stored privately:",
        evaluation.score
      );

      // --------------------------------------------------
      // INTERVIEW FLOW CONTROL
      // --------------------------------------------------

      const wasFollowUpAnswer = state.stage === "FOLLOW_UP";

      if (
        evaluation.followUpRequired &&
        evaluation.followUpQuestion &&
        !wasFollowUpAnswer &&
        !isTerminatedRef.current
      ) {
        // Allow exactly one follow-up for this answer.
        state.followUpUsed = true;
        state.stage = "FOLLOW_UP";

        console.log(
          "[INTERVIEW] Follow-up required:",
          evaluation.followUpQuestion
        );

        const websocket = wsRef.current;

        if (websocket?.readyState === WebSocket.OPEN) {
          websocket.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: `
Ask this one clarifying follow-up question exactly once.

Question:
${evaluation.followUpQuestion}

Do not mention evaluation, scoring, or internal assessment.
Do not ask another question.
                  `.trim(),
                      },
                    ],
                  },
                ],
                turnComplete: true,
              },
            })
          );
        }
      } else if (!isTerminatedRef.current) {
        // Either:
        // 1. This answer did not require a follow-up, or
        // 2. This was already the one allowed follow-up.

        state.followUpUsed = false;

        console.log(
          "[INTERVIEW] Advancing from stage:",
          state.stage
        );

        advanceInterviewStage();
      }

      // Candidate NEVER sees the evaluation.
    } catch (error) {
      console.error(
        "[EVALUATION ERROR]",
        error
      );
    }
  }

  // ==================================================
  // EVALUATE LATEST CANDIDATE ANSWER
  // ==================================================

  async function evaluateLatestCandidateAnswer() {
    const state =
      interviewStateRef.current;

    const conversation =
      state.conversation;

    let candidateIndex =
      -1;

    for (
      let i = conversation.length - 1;
      i >= 0;
      i--
    ) {
      if (
        conversation[i].speaker ===
        "CANDIDATE"
      ) {
        candidateIndex = i;

        break;
      }
    }

    if (
      candidateIndex === -1
    ) {
      return;
    }

    const candidateAnswer =
      conversation[
        candidateIndex
      ].text;

    let question = "";

    for (let i = candidateIndex - 1; i >= 0; i--) {
      if (conversation[i].speaker === "AI") {
        question = conversation[i].text.trim();
        break;
      }
    }

    if (
      question.toLowerCase().includes("uploaded your resume") ||
      question.toLowerCase().includes("upload your resume")
    ) {
      console.log(
        "[EVALUATION] Skipping resume-upload confirmation question"
      );
      return;
    }

    if (
      lastEvaluatedCandidateRef.current ===
      candidateAnswer
    ) {
      console.log(
        "[EVALUATION] Answer already evaluated"
      );

      return;
    }

    lastEvaluatedCandidateRef.current =
      candidateAnswer;

    console.log(
      "[EVALUATION] Evaluating latest candidate answer..."
    );

    await evaluateCandidateAnswer();
  }

  function askNextInterviewQuestion(instruction: string) {
    if (isTerminatedRef.current) {
      return;
    }

    const websocket = wsRef.current;

    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.error("[INTERVIEW] WebSocket is not ready");
      return;
    }

    console.log("[INTERVIEW] Next stage:", interviewStateRef.current.stage);
    console.log("[INTERVIEW] Instruction:", instruction);

    websocket.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: instruction,
                },
              ],
            },
          ],
          turnComplete: true,
        },
      })
    );
  }

  function advanceInterviewStage() {
    const state = interviewStateRef.current;

    if (isTerminatedRef.current) {
      return;
    }

    switch (state.stage) {
      case "START":
        state.stage = "SELF_INTRO";

        askNextInterviewQuestion(
          `Move to the self-introduction stage.

Ask exactly one natural question:
"Please introduce yourself and briefly tell me about your professional experience."

Do not ask anything else.`
        );
        break;

      case "SELF_INTRO":
        state.stage = "PROJECT";

        askNextInterviewQuestion(
          `Move to the project discussion stage.

Ask the candidate about one specific project they have worked on.
Ask exactly one question and encourage them to explain what they built, their role, and the impact.

Do not mention evaluation or scores.`
        );
        break;

      case "PROJECT":
        state.stage = "TECHNICAL";
        state.technicalQuestionsAsked = 1;
        state.questionNumber += 1;

        askNextInterviewQuestion(
          `Move to the technical interview stage.

Ask technical question 1 for the candidate's role and experience level.
Base the question on the candidate context available to you.
Ask exactly one technical question.

Do not move to non-technical questions.`
        );
        break;

      case "TECHNICAL":
        if (state.technicalQuestionsAsked < 2) {
          state.technicalQuestionsAsked += 1;
          state.questionNumber += 1;

          askNextInterviewQuestion(
            `Continue the technical interview.

Ask technical question ${state.technicalQuestionsAsked} for the candidate's role and experience level.
Ask exactly one technical question.
Do not ask a non-technical question yet.`
          );
        } else {
          state.stage = "NON_TECHNICAL";
          state.nonTechnicalQuestionsAsked = 1;
          state.questionNumber += 1;

          askNextInterviewQuestion(
            `Move to the non-technical interview stage.

Ask one situational question that tests how the candidate handles a realistic workplace situation.
Ask exactly one question.`
          );
        }
        break;

      case "NON_TECHNICAL":
        if (state.nonTechnicalQuestionsAsked < 2) {
          state.nonTechnicalQuestionsAsked += 1;
          state.questionNumber += 1;

          askNextInterviewQuestion(
            `Ask the second and final non-technical interview question.

Ask one question about teamwork, management, collaboration, or the tools/processes the candidate uses.
Ask exactly one question.`
          );
        } else {
          state.stage = "FINAL";

          askNextInterviewQuestion(
            `The interview is complete.

Thank the candidate naturally for their time.
Do not reveal scores, evaluation details, or internal assessment.
Do not ask another question.`
          );

          setTimeout(() => {
            completeSession();
          }, 3000);
        }
        break;

      case "FOLLOW_UP":
        // Follow-up is handled by the evaluation logic.
        break;

      case "FINAL":
        break;
    }
  }

  // ==================================================
  // DECODE PCM AUDIO
  // ==================================================

  function decodePCM16(
    base64: string,
    sampleRate = 24000
  ) {
    const binary =
      atob(base64);

    const bytes =
      new Uint8Array(
        binary.length
      );

    for (
      let i = 0;
      i < binary.length;
      i++
    ) {
      bytes[i] =
        binary.charCodeAt(i);
    }

    const view =
      new DataView(
        bytes.buffer
      );

    const sampleCount =
      Math.floor(
        bytes.length / 2
      );

    const samples =
      new Float32Array(
        sampleCount
      );

    for (
      let i = 0;
      i < sampleCount;
      i++
    ) {
      samples[i] =
        view.getInt16(
          i * 2,
          true
        ) / 32768;
    }

    const context =
      audioContextRef.current;

    if (!context) {
      return null;
    }

    const buffer =
      context.createBuffer(
        1,
        samples.length,
        sampleRate
      );

    buffer.copyToChannel(
      samples,
      0
    );

    return buffer;
  }

  // ==================================================
  // SCHEDULE AI AUDIO
  // ==================================================

  function scheduleAudio(
    buffer: AudioBuffer
  ) {
    const context =
      audioContextRef.current;

    if (!context) {
      return;
    }

    if (
      nextAudioTimeRef.current <
      context.currentTime
    ) {
      nextAudioTimeRef.current =
        context.currentTime;
    }

    const source =
      context.createBufferSource();

    source.buffer = buffer;

    source.connect(
      context.destination
    );

    const startTime =
      nextAudioTimeRef.current;

    source.start(
      startTime
    );

    nextAudioTimeRef.current =
      startTime +
      buffer.duration;

    activeSourcesRef.current.push(
      source
    );

    setIsSpeaking(true);

    source.onended = () => {
      activeSourcesRef.current =
        activeSourcesRef.current.filter(
          (item) =>
            item !== source
        );

      if (
        activeSourcesRef.current
          .length === 0
      ) {
        setIsSpeaking(false);
      }
    };
  }

  // ==================================================
  // STOP AI AUDIO
  // ==================================================

  function stopAllAudio() {
    for (
      const source of
        activeSourcesRef.current
    ) {
      try {
        source.stop();
      } catch {}

      try {
        source.disconnect();
      } catch {}
    }

    activeSourcesRef.current = [];

    const context =
      audioContextRef.current;

    if (context) {
      nextAudioTimeRef.current =
        context.currentTime;
    }

    setIsSpeaking(false);
  }

  function persistInterviewStatus(
    status:
      | "IN_PROGRESS"
      | "COMPLETED"
      | "TERMINATED"
      | "ERROR"
  ) {
    const interviewId = interviewStateRef.current.interviewId;

    if (!interviewId) return;

    const payload = JSON.stringify({
      interviewId,
      status,
    });

    try {
      navigator.sendBeacon(
        "/api/interview/status",
        new Blob([payload], { type: "application/json" })
      );
    } catch {
      // Lifecycle cleanup can run after browser APIs are unavailable.
    }
  }

  // Keep all termination paths in one place so visibility and page lifecycle
  // events cannot leave a microphone stream or Live session running.
  function terminateSession(reason: string) {
    if (isTerminatedRef.current) {
      return;
    }

    isTerminatedRef.current = true;
    persistInterviewStatus("TERMINATED");
    sessionIdRef.current += 1;
    stopMicrophone();
    stopAllAudio();

    try {
      wsRef.current?.close();
    } catch {}

    setIsGeminiReady(false);
    setIsTerminated(true);
    setStatus("Interview terminated");
    setError(reason);
  }

  function completeSession() {
    if (isTerminatedRef.current) {
      return;
    }

    isTerminatedRef.current = true;

    persistInterviewStatus("COMPLETED");

    sessionIdRef.current += 1;

    stopMicrophone();
    stopAllAudio();

    try {
      wsRef.current?.close();
    } catch {}

    setIsGeminiReady(false);
    setIsTerminated(true);
    setStatus("Interview completed");
    setError("");
  }

  function printTranscript() {
    window.print();
  }

  // ==================================================
  // FLOAT32 → PCM16
  // ==================================================

  function float32ToPCM16(
    input: Float32Array
  ) {
    const output =
      new Int16Array(
        input.length
      );

    for (
      let i = 0;
      i < input.length;
      i++
    ) {
      const sample =
        Math.max(
          -1,
          Math.min(
            1,
            input[i]
          )
        );

      output[i] =
        sample < 0
          ? sample * 0x8000
          : sample * 0x7fff;
    }

    return output;
  }

  // ==================================================
  // RESAMPLE TO 16 KHZ
  // ==================================================

  function resampleTo16k(
    input: Float32Array,
    inputSampleRate: number
  ) {
    const outputLength =
      Math.round(
        input.length *
          (16000 /
            inputSampleRate)
      );

    const output =
      new Float32Array(
        outputLength
      );

    const ratio =
      inputSampleRate /
      16000;

    for (
      let i = 0;
      i < outputLength;
      i++
    ) {
      const position =
        i * ratio;

      const left =
        Math.floor(
          position
        );

      const right =
        Math.min(
          left + 1,
          input.length - 1
        );

      const fraction =
        position - left;

      output[i] =
        input[left] *
          (1 - fraction) +
        input[right] *
          fraction;
    }

    return output;
  }

  // ==================================================
  // PCM16 → BASE64
  // ==================================================

  function int16ToBase64(
    pcm: Int16Array
  ) {
    const bytes =
      new Uint8Array(
        pcm.buffer
      );

    let binary = "";

    const chunkSize =
      0x8000;

    for (
      let i = 0;
      i < bytes.length;
      i += chunkSize
    ) {
      const chunk =
        bytes.subarray(
          i,
          Math.min(
            i + chunkSize,
            bytes.length
          )
        );

      binary +=
        String.fromCharCode(
          ...chunk
        );
    }

    return btoa(binary);
  }

  // ==================================================
  // START MICROPHONE
  // ==================================================

  async function startMicrophone() {
    try {
      const websocket =
        wsRef.current;

      if (
        !websocket ||
        websocket.readyState !==
          WebSocket.OPEN
      ) {
        throw new Error(
          "Gemini connection is not ready."
        );
      }

      setError("");

      console.log(
        "[MIC] Requesting microphone permission..."
      );

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }
        );

      microphoneStreamRef.current =
        stream;

      const context =
        new AudioContext();

      microphoneContextRef.current =
        context;

      await context.resume();

      console.log(
        "[MIC] Microphone sample rate:",
        context.sampleRate
      );

      const source =
        context.createMediaStreamSource(
          stream
        );

      microphoneSourceRef.current =
        source;

      const processor =
        context.createScriptProcessor(
          4096,
          1,
          1
        );

      processorRef.current =
        processor;

      processor.onaudioprocess =
        (event) => {
          const ws =
            wsRef.current;

          if (
            !ws ||
            ws.readyState !==
              WebSocket.OPEN
          ) {
            return;
          }

          const input =
            event.inputBuffer
              .getChannelData(0);

          const resampled =
            resampleTo16k(
              input,
              context.sampleRate
            );

          const pcm =
            float32ToPCM16(
              resampled
            );

          const base64 =
            int16ToBase64(
              pcm
            );

          ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  data: base64,
                  mimeType:
                    "audio/pcm;rate=16000",
                },
              },
            })
          );
        };

      source.connect(
        processor
      );

      const silentGain =
        context.createGain();

      silentGain.gain.value = 0;

      processor.connect(
        silentGain
      );

      silentGain.connect(
        context.destination
      );

      candidateResponseRef.current =
        "";

      currentCandidateTranscriptRef.current =
        "";

      setCandidateSubtitle("");

      candidateTurnActiveRef.current =
        true;

      setIsListening(true);

      setStatus(
        "Listening — speak naturally"
      );

      console.log(
        "[MIC] Microphone started"
      );
    } catch (err) {
      console.error(
        "[MIC ERROR]",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not access microphone."
      );
    }
  }

  // ==================================================
  // STOP MICROPHONE
  // ==================================================

  function stopMicrophone() {
    console.log(
      "[MIC] Stopping microphone"
    );

    const processor =
      processorRef.current;

    if (processor) {
      processor.onaudioprocess =
        null;

      try {
        processor.disconnect();
      } catch {}
    }

    const source =
      microphoneSourceRef.current;

    if (source) {
      try {
        source.disconnect();
      } catch {}
    }

    const stream =
      microphoneStreamRef.current;

    if (stream) {
      stream
        .getTracks()
        .forEach((track) => {
          track.stop();
        });
    }

    const context =
      microphoneContextRef.current;

    if (context) {
      try {
        context.close();
      } catch {}
    }

    processorRef.current = null;

    microphoneSourceRef.current =
      null;

    microphoneStreamRef.current =
      null;

    microphoneContextRef.current =
      null;

    candidateTurnActiveRef.current =
      false;

    setIsListening(false);

    if (
      wsRef.current &&
      wsRef.current.readyState ===
        WebSocket.OPEN
    ) {
      setStatus(
        "Connected — interviewer ready"
      );
    }
  }

  // ==================================================
  // CONNECT TO GEMINI
  // ==================================================

  async function connectToGemini(
    sessionId: number
  ) {
    try {
      console.log(
        `[SESSION ${sessionId}] Starting`
      );

      setStatus(
        "Getting secure session..."
      );

      setIsGeminiReady(false);

      const tokenResponse =
        await fetch(
          "/api/gemini-token",
          {
            method: "GET",
            cache: "no-store",
          }
        );

      if (
        sessionId !==
        sessionIdRef.current
      ) {
        return;
      }

      if (
        !tokenResponse.ok
      ) {
        throw new Error(
          `Token request failed: ${tokenResponse.status}`
        );
      }

      const tokenData =
        await tokenResponse.json();

      if (
        !tokenData.token
      ) {
        throw new Error(
          "Gemini token was not returned."
        );
      }

      console.log(
        `[SESSION ${sessionId}] Token received`
      );

      // ----------------------------------------------
      // AUDIO CONTEXT
      // ----------------------------------------------

      const context =
        new AudioContext({
          sampleRate: 24000,
        });

      audioContextRef.current =
        context;

      nextAudioTimeRef.current =
        context.currentTime;

      // ----------------------------------------------
      // WEBSOCKET
      // ----------------------------------------------

      setStatus(
        "Opening Gemini connection..."
      );

      const websocketUrl =
        "wss://generativelanguage.googleapis.com/ws/" +
        "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained" +
        `?access_token=${tokenData.token}`;

      const websocket =
        new WebSocket(
          websocketUrl
        );

      wsRef.current =
        websocket;

      // ----------------------------------------------
      // OPEN
      // ----------------------------------------------

      websocket.onopen = () => {
        if (
          sessionId !==
          sessionIdRef.current
        ) {
          websocket.close();

          return;
        }

        console.log(
          `[SESSION ${sessionId}] WebSocket OPEN`
        );

        setStatus(
          "Connected — configuring interviewer..."
        );

        const setupMessage = {
          setup: {
            model:
              "models/gemini-3.1-flash-live-preview",

            generationConfig: {
              responseModalities: [
                "AUDIO",
              ],
            },

            outputAudioTranscription: {},

            inputAudioTranscription: {},

            systemInstruction: {
              parts: [
                {
                  text: `
You are a professional AI interviewer.

Your personality:

- Natural
- Calm
- Warm
- Professional
- Confident
- Patient

Speak naturally like a real human interviewer.

Do not sound robotic.

Ask only one question at a time.

Never reveal candidate scores.

Never reveal internal evaluation.

The candidate may have speech recognition errors.

Use the surrounding conversation context to
understand the candidate's intended meaning.

For example, if the candidate says "receiver"
when the conversation is clearly about their
"resume", understand that "resume" may have
been misrecognized.

Do not invent information.

Do not artificially improve the candidate's English.

You are conducting a real-time voice interview.

Wait for the candidate's spoken response before
asking the next question.

Do not ask the candidate to click a button to
submit an answer.

Do not start speaking until the application
explicitly tells you to begin.

The application controls interview stages. Do not independently move from
technical questions to non-technical questions. When asked to repeat a
question, repeat the current question clearly. If the candidate is silent,
offer to repeat the question rather than advancing.

Candidate context:
- Role: ${interviewStateRef.current.role || "Not provided"}
- Experience: ${interviewStateRef.current.candidate.experience || "Not provided"}
- Candidate name: ${interviewStateRef.current.candidate.name || "Not provided"}
                  `.trim(),
                },
              ],
            },
          },
        };

        websocket.send(
          JSON.stringify(
            setupMessage
          )
        );
      };

      // ----------------------------------------------
      // MESSAGE
      // ----------------------------------------------

      websocket.onmessage =
        async (event) => {
          if (
            sessionId !==
            sessionIdRef.current
          ) {
            return;
          }

          try {
            let rawData: string;

            if (
              event.data instanceof Blob
            ) {
              rawData =
                await event.data.text();
            } else {
              rawData =
                String(event.data);
            }

            const message =
              JSON.parse(
                rawData
              );

            // ------------------------------------------
            // SETUP COMPLETE
            // ------------------------------------------

            if (
              message.setupComplete
            ) {
              console.log(
                `[SESSION ${sessionId}] SETUP COMPLETE`
              );

              setIsGeminiReady(true);

              setStatus(
                "Connected — interviewer ready"
              );

              currentSubtitleRef.current =
                "";

              currentAITranscriptRef.current =
                "";

              currentCandidateTranscriptRef.current =
                "";

              setSubtitle("");

              setCandidateSubtitle("");

              aiTurnActiveRef.current =
                false;

              candidateTurnActiveRef.current =
                false;

              nextAudioTimeRef.current =
                context.currentTime;

              // ----------------------------------------
              // OPENING GREETING
              // ----------------------------------------

              websocket.send(
                JSON.stringify({
                  clientContent: {
                    turns: [
                      {
                        role: "user",

                        parts: [
                          {
                            text: `
Begin the interview.

Say exactly:

"Hello, welcome to your interview. I will ask you a few questions about your experience, technical skills, and workplace situations. Are you ready to begin?"

Do not say anything else.
                            `.trim(),
                          },
                        ],
                      },
                    ],

                    turnComplete: true,
                  },
                })
              );

              return;
            }

            // ------------------------------------------
            // SERVER CONTENT
            // ------------------------------------------

            const serverContent =
              message.serverContent;

            if (!serverContent) {
              return;
            }

            // ------------------------------------------
            // AI TRANSCRIPTION
            // ------------------------------------------

            if (
              serverContent
                .outputTranscription
                ?.text
            ) {
              const incoming =
                serverContent
                  .outputTranscription
                  .text
                  .trim();

              if (incoming) {
                if (
                  !aiTurnActiveRef.current
                ) {
                  aiTurnActiveRef.current =
                    true;

                  currentSubtitleRef.current =
                    "";

                  currentAITranscriptRef.current =
                    "";

                  setSubtitle("");
                }

                const merged =
                  mergeTranscript(
                    currentSubtitleRef.current,
                    incoming
                  );

                currentSubtitleRef.current =
                  merged;

                currentAITranscriptRef.current =
                  merged;

                setSubtitle(
                  merged
                );
              }
            }

            // ------------------------------------------
            // AI AUDIO
            // ------------------------------------------

            if (
              serverContent
                .modelTurn
                ?.parts
            ) {
              for (
                const part of
                  serverContent
                    .modelTurn
                    .parts
              ) {
                const inlineData =
                  part.inlineData;

                if (
                  inlineData?.data &&
                  inlineData.mimeType?.startsWith(
                    "audio/"
                  )
                ) {
                  const buffer =
                    decodePCM16(
                      inlineData.data,
                      24000
                    );

                  if (buffer) {
                    scheduleAudio(
                      buffer
                    );
                  }
                }
              }
            }

            // ------------------------------------------
            // CANDIDATE TRANSCRIPTION
            // ------------------------------------------

            if (
              serverContent
                .inputTranscription
                ?.text
            ) {
              const incoming =
                serverContent
                  .inputTranscription
                  .text
                  .trim();

              if (incoming) {
                console.log(
                  "[CANDIDATE TRANSCRIPT]",
                  incoming
                );

                candidateResponseRef.current =
                  mergeTranscript(
                    candidateResponseRef.current,
                    incoming
                  );

                currentCandidateTranscriptRef.current =
                  candidateResponseRef.current;

                setCandidateSubtitle(
                  candidateResponseRef.current
                );

                // Process the candidate answer after a short period without new transcript text.
                if (candidateAnswerTimerRef.current) {
                  clearTimeout(candidateAnswerTimerRef.current);
                }

                candidateAnswerTimerRef.current =
                  setTimeout(() => {
                    candidateAnswerTimerRef.current = null;

                    if (!isTerminatedRef.current) {
                      processCandidateAnswer();
                    }
                  }, 4000);
              }
            }

            // ------------------------------------------
            // VAD SPEECH START
            // ------------------------------------------

            if (
              serverContent
                .voiceActivityDetection
                ?.speechStarted
            ) {
              console.log(
                "[VAD] Candidate speech started"
              );

              candidateTurnActiveRef.current =
                true;
            }

            // ------------------------------------------
            // VAD SPEECH END
            // ------------------------------------------

            if (
              serverContent
                .voiceActivityDetection
                ?.speechEnded
            ) {
              console.log(
                "[VAD] Candidate speech ended"
              );

              candidateTurnActiveRef.current =
                false;

              if (candidateAnswerTimerRef.current) {
                clearTimeout(
                  candidateAnswerTimerRef.current
                );
              }

              // Give Gemini's input transcription a short moment to arrive before processing the answer.
              candidateAnswerTimerRef.current =
                setTimeout(() => {
                  candidateAnswerTimerRef.current = null;

                  processCandidateAnswer();
                }, 700);
            }

            // ------------------------------------------
            // INTERRUPTION
            // ------------------------------------------

            if (
              serverContent.interrupted
            ) {
              console.log(
                "[AI] Interrupted"
              );

              stopAllAudio();

              aiTurnActiveRef.current =
                false;
            }

            // Save completed AI questions without processing candidate answers here.
            if (
              serverContent.turnComplete
            ) {
              saveAITurn();

              aiTurnActiveRef.current =
                false;
            }

          } catch (err) {
            console.error(
              "[MESSAGE ERROR]",
              err
            );
          }
        };

      // ----------------------------------------------
      // ERROR
      // ----------------------------------------------

      websocket.onerror = (
        event
      ) => {
        if (
          sessionId !==
          sessionIdRef.current
        ) {
          return;
        }

        console.error(
          "[WEBSOCKET ERROR]",
          event
        );

        setIsGeminiReady(false);

        setStatus(
          "Gemini connection error"
        );

        setError(
          "Gemini WebSocket encountered an error."
        );
      };

      // ----------------------------------------------
      // CLOSE
      // ----------------------------------------------

      websocket.onclose = (
        event
      ) => {
        if (
          sessionId !==
          sessionIdRef.current
        ) {
          return;
        }

        console.log(
          `[SESSION ${sessionId}] WebSocket closed`,
          {
            code: event.code,
            reason: event.reason,
          }
        );

        setIsGeminiReady(false);

        stopMicrophone();

        stopAllAudio();

        setStatus(
          "Gemini connection closed"
        );
      };
    } catch (err) {
      if (
        sessionId !==
        sessionIdRef.current
      ) {
        return;
      }

      console.error(
        "[CONNECTION ERROR]",
        err
      );

      setIsGeminiReady(false);

      setStatus(
        "Connection failed"
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unknown connection error"
      );
    }
  }

  // ==================================================
  // START SESSION
  // ==================================================

  useEffect(() => {
    const savedCandidate = sessionStorage.getItem("ai-interviewer-candidate");

    if (!savedCandidate) {
      return;
    }

    try {
      const candidate = JSON.parse(savedCandidate) as {
        interviewId?: string;
        name?: string;
        role?: string;
        experience?: string;
        resumeName?: string;
      };

      interviewStateRef.current.interviewId = candidate.interviewId || null;
      interviewStateRef.current.role = candidate.role || "";
      interviewStateRef.current.candidate.name = candidate.name || null;
      interviewStateRef.current.candidate.experience = candidate.experience || null;
      interviewStateRef.current.candidate.resume = candidate.resumeName || null;
    } catch {
      sessionStorage.removeItem("ai-interviewer-candidate");
    }
  }, []);

  useEffect(() => {
    const terminateForIntegrity = () => {
      if (document.visibilityState === "hidden") {
        terminateSession("Interview ended because the interview page was left or minimized.");
      }
    };

    const cleanupForExit = () => {
      if (isTerminatedRef.current) {
        return;
      }

      terminateSession("Interview ended because the interview page was left.");
    };

    document.addEventListener("visibilitychange", terminateForIntegrity);
    window.addEventListener("pagehide", cleanupForExit);
    window.addEventListener("beforeunload", cleanupForExit);

    return () => {
      document.removeEventListener("visibilitychange", terminateForIntegrity);
      window.removeEventListener("pagehide", cleanupForExit);
      window.removeEventListener("beforeunload", cleanupForExit);
    };
  }, []);

  useEffect(() => {
    sessionIdRef.current += 1;

    const sessionId =
      sessionIdRef.current;

    connectToGemini(sessionId);

    return () => {
      if (!isTerminatedRef.current) {
        sessionIdRef.current += 1;

        if (candidateAnswerTimerRef.current) {
          clearTimeout(
            candidateAnswerTimerRef.current
          );
          candidateAnswerTimerRef.current = null;
        }

        stopMicrophone();
        stopAllAudio();

        try {
          wsRef.current?.close();
        } catch {}
      }

      try {
        audioContextRef.current?.close();
      } catch {}
    };
  }, []);

  // ==================================================
  // UI
  // ==================================================

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      {/* HEADER */}

      <header className="border-b border-white/10">

        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-slate-950">
              AI
            </div>

            <div>

              <h1 className="font-semibold tracking-tight">
                AI Interviewer
              </h1>

              <p className="text-xs text-slate-400">
                Interview in progress
              </p>

            </div>

          </div>

          {/* CONNECTION STATUS */}

          <div className="flex items-center gap-3">

            <span
              className={`h-2 w-2 rounded-full ${
                isGeminiReady
                  ? "bg-green-400"
                  : status.includes(
                      "error"
                    ) ||
                    status.includes(
                      "failed"
                    )
                  ? "bg-red-400"
                  : "bg-yellow-400"
              }`}
            />

            <span className="text-sm text-slate-400">
              {status}
            </span>

            <button
              type="button"
              onClick={printTranscript}
              className="no-print rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              Print transcript
            </button>

          </div>

        </div>

      </header>

      {/* INTERVIEW */}

      <section className="mx-auto flex min-h-[calc(100vh-81px)] max-w-5xl flex-col px-6 py-10">

        {/* AI AREA */}

        <div className="flex flex-1 flex-col items-center justify-center">

          {/* AI AVATAR */}

          <div
            className={`relative flex h-32 w-32 items-center justify-center rounded-full bg-white text-2xl font-bold text-slate-950 shadow-2xl transition-transform duration-300 ${
              isSpeaking
                ? "scale-110"
                : "scale-100"
            }`}
          >

            AI

            {isSpeaking && (
              <>
                <span className="absolute inset-0 animate-ping rounded-full border border-white/40" />

                <span className="absolute -inset-3 rounded-full border border-white/10" />
              </>
            )}

          </div>

          <p className="mt-5 text-sm text-slate-400">
            AI Interviewer
          </p>

          {/* AI SUBTITLE */}

          <div className="mt-10 min-h-[160px] max-w-3xl text-center">

            {subtitle ? (

              <p className="text-2xl font-medium leading-relaxed md:text-3xl">
                {subtitle}
              </p>

            ) : (

              <p className="text-lg text-slate-500">
                {status}
              </p>

            )}

            {isSpeaking && (

              <p className="mt-5 text-xs uppercase tracking-[0.2em] text-slate-500">
                AI speaking
              </p>

            )}

          </div>

        </div>

        {/* CANDIDATE */}

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">

          <div className="text-center">

            <p className="text-sm font-medium text-slate-300">
              Your response
            </p>

            {/* CANDIDATE TRANSCRIPT */}

            <div className="mx-auto mt-4 min-h-[70px] max-w-2xl">

              {candidateSubtitle ? (

                <p className="text-lg leading-relaxed text-slate-300">
                  {candidateSubtitle}
                </p>

              ) : (

                <p className="text-sm text-slate-500">
                  Your speech will appear here...
                </p>

              )}

            </div>

            {/* MICROPHONE */}

            <button
              type="button"
              disabled={
                !isGeminiReady || isTerminated
              }
              onClick={() => {

                if (!isGeminiReady || isTerminated) {
                  return;
                }

                if (
                  isListening
                ) {
                  stopMicrophone();
                } else {
                  startMicrophone();
                }

              }}
              className={`mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-full text-2xl transition ${
                !isGeminiReady || isTerminated
                  ? "cursor-not-allowed bg-slate-800 opacity-40"
                  : isListening
                  ? "bg-red-500 shadow-lg shadow-red-500/20"
                  : "bg-white text-slate-950 hover:scale-105"
              }`}
            >
              🎙
            </button>

            {/* MICROPHONE STATUS */}

            <p className="mt-4 text-xs text-slate-500">

              {!isGeminiReady
                ? isTerminated
                  ? "This interview session has ended"
                  : "Waiting for interviewer..."
                : isListening
                ? "Listening — speak naturally. Gemini will detect when you finish."
                : "Click the microphone to respond"}

            </p>

          </div>

        </div>

        {/* ERROR */}

        {error && (

          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-300">
            {error}
          </div>

        )}

        <section className="no-print mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Interview transcript</h2>
              <p className="mt-1 text-sm text-slate-400">
                Your conversation is saved locally for this session.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {conversation.filter((message) => message.speaker === "AI").length} questions
            </span>
          </div>

          <div className="mt-5 max-h-80 space-y-4 overflow-y-auto pr-2">
            {conversation.filter((message) => message.speaker === "AI").length ? conversation.filter((message) => message.speaker === "AI").map((message, index) => (
              <div key={`${message.speaker}-${index}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {message.speaker === "AI" ? "AI interviewer" : "You"}
                </p>
                <p className="mt-1 leading-6 text-slate-200">{message.text}</p>
              </div>
            )) : (
              <p className="text-sm text-slate-500">The transcript will appear as the interview progresses.</p>
            )}
          </div>
        </section>

        <section className="print-only print-transcript">
          <h1>Interview Transcript</h1>
          <p>Candidate: {interviewStateRef.current.candidate.name || "Not provided"}</p>
          <p>Role: {interviewStateRef.current.role || "Not provided"}</p>
          <hr />
          {conversation.map((message, index) => (
            <div key={`print-${message.speaker}-${index}`}>
              <strong>{message.speaker === "AI" ? "AI" : "Candidate"}:</strong> {message.text}
            </div>
          ))}
        </section>

      </section>

    </main>
  );
}
