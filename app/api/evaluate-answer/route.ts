import { NextResponse } from "next/server";

import { createHash } from "crypto";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

type EvaluationRequest = {
  interviewId?: unknown;
  question?: unknown;
  answer?: unknown;
  role?: unknown;
  experienceLevel?: unknown;
  stage?: unknown;
  questionNumber?: unknown;
  followUpUsed?: unknown;
};

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    return JSON.stringify(error);
  }

  return String(error);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EvaluationRequest;

    if (
      typeof body.interviewId !== "string" ||
      typeof body.question !== "string" ||
      typeof body.answer !== "string" ||
      !body.interviewId ||
      !body.question.trim() ||
      !body.answer.trim() ||
      typeof body.questionNumber !== "number" ||
      typeof body.stage !== "string"
    ) {
      return NextResponse.json(
        { error: "interviewId, question, and answer are required" },
        { status: 400 }
      );
    }

    const n8nUrl = process.env.N8N_EVALUATOR_URL;

    if (!n8nUrl) {
      return NextResponse.json(
        {
          error: "N8N_EVALUATOR_URL is not configured",
        },
        { status: 500 }
      );
    }

    const evaluationKey = createHash("sha256")
      .update(`${body.question.trim()}\n${body.answer.trim()}`)
      .digest("hex");

    const supabase = getSupabaseAdmin();
    const { error: pendingError } = await supabase
      .from("interview_answers")
      .upsert(
        {
          interview_id: body.interviewId,
          question_number: body.questionNumber,
          stage: body.stage,
          question: body.question.trim(),
          answer: body.answer.trim(),
          evaluation_key: evaluationKey,
          follow_up_used: Boolean(body.followUpUsed),
          evaluation_status: "PENDING",
        },
        { onConflict: "interview_id,evaluation_key" }
      );

    if (pendingError) {
      throw pendingError;
    }

    let response: Response;

    try {
      response = await fetch(n8nUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          interviewId: body.interviewId,
          question: body.question.trim(),
          answer: body.answer.trim(),
          role: typeof body.role === "string" ? body.role : "Data Engineer",
          experienceLevel:
            typeof body.experienceLevel === "string"
              ? body.experienceLevel
              : "Junior",
        }),
      });
    } catch (error) {
      console.error("[N8N REQUEST ERROR]", error);
      return NextResponse.json(
        { error: "Could not reach n8n evaluator" },
        { status: 502 }
      );
    }

    const responseText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "n8n evaluation failed",
          status: response.status,
          details: responseText,
        },
        { status: response.status }
      );
    }

    let data;

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { raw: responseText };
    }

    const { error: storageError } = await supabase
      .from("interview_answers")
      .update({
        score: Number(data.score) || 0,
        relevance: Number(data.relevance) || 0,
        technical_correctness: Number(data.technicalCorrectness) || 0,
        depth: Number(data.depth) || 0,
        clarity: Number(data.clarity) || 0,
        completeness: Number(data.completeness) || 0,
        decision: data.decision === "FAIL" ? "FAIL" : "PASS",
        follow_up_required: Boolean(data.followUpRequired),
        follow_up_question: String(data.followUpQuestion || ""),
        strengths: Array.isArray(data.strengths) ? data.strengths : [],
        weaknesses: Array.isArray(data.weaknesses) ? data.weaknesses : [],
        internal_summary: String(data.internalSummary || ""),
        evaluation_status: "COMPLETED",
        evaluated_at: new Date().toISOString(),
      })
      .eq("interview_id", body.interviewId)
      .eq("evaluation_key", evaluationKey);

    if (storageError) {
      console.error("[EVALUATION STORAGE ERROR]", storageError);
      return NextResponse.json(
        { error: "Evaluation completed but could not be stored" },
        { status: 502 }
      );
    }

    const { data: answers } = await supabase
      .from("interview_answers")
      .select("score")
      .eq("interview_id", body.interviewId)
      .eq("evaluation_status", "COMPLETED");

    const scores = (answers ?? [])
      .map((row) => Number(row.score))
      .filter(Number.isFinite);
    const totalScore = scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;

    await supabase
      .from("interviews")
      .update({
        total_score: Number(totalScore.toFixed(2)),
        evaluation_count: scores.length,
      })
      .eq("id", body.interviewId);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[EVALUATION PROXY ERROR]", error);

    return NextResponse.json(
      {
        error: "Failed to evaluate answer",
        details: getErrorDetails(error),
      },
      { status: 502 }
    );
  }
}
