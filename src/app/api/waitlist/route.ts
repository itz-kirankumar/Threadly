import { NextResponse } from "next/server";
import { insertWaitlist } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Basic validation
    if (!data.fullName || !data.startupName || !data.industry || !data.challenge1) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await insertWaitlist({
      fullName: data.fullName,
      startupName: data.startupName,
      industry: data.industry,
      url: data.url || "",
      challenge1: data.challenge1,
      challenge2: data.challenge2 || "",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Waitlist Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
