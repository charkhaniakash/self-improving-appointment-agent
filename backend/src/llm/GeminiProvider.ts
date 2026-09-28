import {
  GoogleGenerativeAI,
  type FunctionDeclaration,
  type Content,
  SchemaType,
} from "@google/generative-ai";
import type { LLMProvider, LLMResponse } from "../types/llm.js";
import type { ChatMessage } from "../types/agent.js";
import type { ToolSchema } from "../types/tool.js";

/**
 * Converts our simple JSON-Schema-ish object to Gemini's SchemaType tree.
 * We only need the subset our tools use.
 */
function toGeminiSchema(json: Record<string, unknown>): FunctionDeclaration["parameters"] {
  const type = (json.type as string) ?? "object";
  const map: Record<string, SchemaType> = {
    object: SchemaType.OBJECT,
    string: SchemaType.STRING,
    number: SchemaType.NUMBER,
    integer: SchemaType.INTEGER,
    boolean: SchemaType.BOOLEAN,
    array: SchemaType.ARRAY,
  };
  const node: {
    type: SchemaType;
    description?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    items?: unknown;
  } = { type: map[type] ?? SchemaType.OBJECT };
  if (json.description) node.description = String(json.description);
  if (type === "object" && json.properties) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(
      json.properties as Record<string, Record<string, unknown>>,
    )) {
      props[k] = toGeminiSchema(v);
    }
    node.properties = props;
    if (json.required) node.required = json.required as string[];
  }
  return node as FunctionDeclaration["parameters"];
}

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenerativeAI;
  constructor(
    apiKey: string,
    private readonly modelName: string,
  ) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required for GeminiProvider");
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generate(params: {
    system: string;
    history: ChatMessage[];
    tools: ToolSchema[];
    toolResults?: Array<{ name: string; result: unknown }>;
  }): Promise<LLMResponse> {
    const functionDeclarations: FunctionDeclaration[] = params.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: toGeminiSchema(t.parameters as Record<string, unknown>),
    }));

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: params.system,
      tools: [{ functionDeclarations }],
    });

    const contents: Content[] = params.history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    if (params.toolResults && params.toolResults.length > 0) {
      contents.push({
        role: "user",
        parts: params.toolResults.map((tr) => ({
          functionResponse: {
            name: tr.name,
            response: (tr.result ?? {}) as object,
          },
        })),
      });
    }

    const result = await model.generateContent({ contents });
    const response = result.response;
    const text = response.text?.() ?? "";
    const calls = response.functionCalls?.() ?? [];
    return {
      text,
      toolCalls: calls.map((c) => ({
        name: c.name,
        arguments: (c.args ?? {}) as Record<string, unknown>,
      })),
    };
  }
}
