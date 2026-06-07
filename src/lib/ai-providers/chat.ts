import { aiPdfExtractionSchema, type AIPdfExtraction } from "@/lib/ai-pdf-import/schema";

type ProviderProfileForUse = {
  apiKey: string;
  base_url: string;
  model: string;
  name: string;
  provider: string;
  supports_pdf_input: boolean;
  supports_vision_images: boolean;
};

type ProviderInput = {
  fileName: string;
  pageImageDataUrls: string[];
  pdfBase64: string;
  prompt: string;
  profile: ProviderProfileForUse;
};

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function parseJsonContent(value: string) {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
}

function mockExtraction(): AIPdfExtraction {
  return {
    questions: [
      {
        asset_placeholders: [],
        content_html: "<p>Mock AI PDF import content.</p>",
        content_source: "Mock AI PDF import content.",
        difficulty_rating: 500,
        new_tag_names: ["AI Imported"],
        page_refs: [1],
        question_code: "AI-PDF-MOCK-1",
        question_type: "frq",
        solution_html: "<p>Mock AI PDF import solution.</p>",
        solution_source: "Mock AI PDF import solution.",
        tag_names: [],
        tag_slugs: [],
        title: "Mock AI PDF import question",
      },
    ],
    warnings: ["Mock provider response used."],
  };
}

export async function testAIProviderConnection(
  profile: Pick<ProviderProfileForUse, "apiKey" | "base_url" | "model" | "name">,
) {
  if (profile.base_url === "mock://ai-pdf-import") {
    return {
      message: `Mock provider ${profile.name} is reachable.`,
      ok: true as const,
    };
  }

  const response = await fetch(endpoint(profile.base_url), {
    body: JSON.stringify({
      max_tokens: 8,
      messages: [
        {
          content: "Connection test. Reply with OK.",
          role: "user",
        },
      ],
      model: profile.model,
      temperature: 0,
    }),
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `AI provider test failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const contentText = payload.choices?.[0]?.message?.content?.trim();

  return {
    message: contentText
      ? `Connection test succeeded. Provider replied: ${contentText.slice(0, 80)}`
      : "Connection test succeeded.",
    ok: true as const,
  };
}

export async function callAIPdfExtractionProvider({
  fileName,
  pageImageDataUrls,
  pdfBase64,
  profile,
  prompt,
}: ProviderInput) {
  if (profile.base_url === "mock://ai-pdf-import") {
    return mockExtraction();
  }

  const content: unknown[] = [
    {
      text: prompt,
      type: "text",
    },
  ];

  if (profile.supports_pdf_input) {
    content.push({
      file: {
        file_data: `data:application/pdf;base64,${pdfBase64}`,
        filename: fileName,
      },
      type: "file",
    });
  } else if (profile.supports_vision_images) {
    for (const dataUrl of pageImageDataUrls) {
      content.push({
        image_url: {
          url: dataUrl,
        },
        type: "image_url",
      });
    }
  } else {
    throw new Error("Selected AI provider does not support PDF or image input.");
  }

  const response = await fetch(endpoint(profile.base_url), {
    body: JSON.stringify({
      messages: [
        {
          content,
          role: "user",
        },
      ],
      model: profile.model,
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `AI provider request failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const contentText = payload.choices?.[0]?.message?.content;

  if (!contentText) {
    throw new Error("AI provider response did not include message content.");
  }

  return aiPdfExtractionSchema.parse(parseJsonContent(contentText));
}
