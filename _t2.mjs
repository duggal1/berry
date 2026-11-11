import OpenAI from "openai";
const c = new OpenAI({ baseURL: "https://api.reflection.ai/openai/v1", apiKey: process.env.REFLECTION_API_KEY });
const schema = { type: "object", properties: { city: { type: "string" }, country: { type: "string" } }, required: ["city","country"], additionalProperties: false };
try {
  const r = await c.chat.completions.create({
    model: "Beam-1.0-501B-A23B",
    messages: [{ role: "user", content: "Weather in Paris? Answer in the schema." }],
    response_format: { type: "json_schema", json_schema: { name: "answer", schema } },
    reasoning_effort: "low", max_completion_tokens: 3000,
  });
  console.log("finish:", r.choices[0].finish_reason, "content:", r.choices[0].message.content);
} catch (e) { console.log("ERR", e.status, e.message?.slice(0,500)); }
