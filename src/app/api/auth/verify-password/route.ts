import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { password, gate } = await request.json();

    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    // Get the correct password based on the gate
    let correctPassword: string | undefined;

    if (gate === "executive-access") {
      correctPassword = process.env.EXECUTIVE_PASSWORD;
    }

    // Fallback to a general password if specific one not set
    if (!correctPassword) {
      correctPassword = process.env.SHARED_PASSWORD;
    }

    if (!correctPassword) {
      console.error("No password configured for gate:", gate);
      return NextResponse.json({ error: "Password not configured" }, { status: 500 });
    }

    if (password === correctPassword) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  } catch (error) {
    console.error("Password verification error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
