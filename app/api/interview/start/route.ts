import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      typeof body.role !== "string" ||
      !body.role.trim() ||
      typeof body.experience !== "string" ||
      !body.experience.trim() ||
      typeof body.resumeName !== "string" ||
      !body.resumeName.trim()
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const interviewId = crypto.randomUUID();

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("interviews").insert({
      id: interviewId,
      candidate_name: body.name.trim(),
      role: body.role.trim(),
      experience_level: body.experience.trim(),
      resume_name: body.resumeName.trim(),
      status: "IN_PROGRESS",
    });

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Could not create interview" },
        { status: 500 }
      );
    }

    return NextResponse.json({ interviewId }, { status: 201 });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to start interview" },
      { status: 500 }
    );
  }
}
