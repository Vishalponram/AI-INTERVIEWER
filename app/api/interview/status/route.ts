import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const allowedStatuses = [
  "IN_PROGRESS",
  "COMPLETED",
  "TERMINATED",
  "ERROR",
];

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (
      typeof body.interviewId !== "string" ||
      !allowedStatuses.includes(body.status)
    ) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("interviews")
      .update({
        status: body.status,
        ended_at:
          body.status === "IN_PROGRESS"
            ? null
            : new Date().toISOString(),
      })
      .eq("id", body.interviewId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not update status" },
      { status: 500 }
    );
  }
}