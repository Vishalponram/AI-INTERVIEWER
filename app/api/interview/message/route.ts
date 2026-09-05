import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (
      typeof body.interviewId !== "string" ||
      typeof body.speaker !== "string" ||
      typeof body.text !== "string" ||
      typeof body.messageOrder !== "number"
    ) {
      return NextResponse.json(
        { error: "Invalid message data" },
        { status: 400 }
      );
    }

    if (!["AI", "CANDIDATE"].includes(body.speaker)) {
      return NextResponse.json(
        { error: "Invalid speaker" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("interview_messages").upsert(
      {
        interview_id: body.interviewId,
        speaker: body.speaker,
        text: body.text.trim(),
        message_order: body.messageOrder,
        stage: body.stage ?? null,
      },
      { onConflict: "interview_id,message_order" }
    );

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Could not save message" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to save message" },
      { status: 500 }
    );
  }
}