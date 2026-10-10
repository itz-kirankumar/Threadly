import { NextResponse } from "next/server";
import { insertCommunityMember } from "@/lib/db";
import { sendCommunityInvite } from "@/lib/mailer";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Insert into DB
    await insertCommunityMember(email);
    
    // Send email via SES or console fallback
    await sendCommunityInvite(email);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Community Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
