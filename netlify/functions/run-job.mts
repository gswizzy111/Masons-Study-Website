// Background function that runs one study-set job (build_set or
// exam_questions) for up to 15 minutes. Netlify answers the caller with 202
// right away; the return value is discarded.
// POST { "jobId": "<uuid>" } to /.netlify/functions/run-job.
// Imports are relative and nothing here depends on Next.
import type { Config } from "@netlify/functions";
import { isJobId, runJob } from "../../lib/jobs/run-job";

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Send a JSON body with a jobId.", { status: 400 });
  }
  const jobId = body && typeof body === "object" ? (body as Record<string, unknown>).jobId : undefined;
  if (!isJobId(jobId)) return new Response("A valid jobId is required.", { status: 400 });

  // A job that runs out of time continues in a fresh invocation at this origin.
  await runJob(jobId, { origin: new URL(req.url).origin });
  return new Response(null, { status: 204 });
}

export default handler;

export const config: Config = {
  background: true,
};
