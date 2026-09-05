import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    const token = await ai.authTokens.create({
      config: {
        uses: 1,

        liveConnectConstraints: {
          model: "models/gemini-3.1-flash-live-preview",

          config: {
            generationConfig: {
              responseModalities: [Modality.AUDIO],
            },

            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },

        expireTime: new Date(
          Date.now() + 30 * 60 * 1000
        ).toISOString(),

        newSessionExpireTime: new Date(
          Date.now() + 60 * 1000
        ).toISOString(),
      },
    });

    return NextResponse.json({
      token: token.name,
    });
  } catch (error) {
    console.error("Gemini token creation failed:", error);

    return NextResponse.json(
      {
        error: "Failed to create Gemini session token",
      },
      { status: 500 }
    );
  }
}