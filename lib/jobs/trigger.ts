// Starts a queued job. Imported only by Next route handlers (next/* is fine
// here). See docs/ARCHITECTURE.md section 8.
import { after } from "next/server";
import { postToBackgroundFunction, runJob } from "@/lib/jobs/run-job";

/**
 * POSTs `{ jobId }` to the Netlify background function, which answers 202
 * and runs the job for up to 15 minutes. When that doesn't answer 202 (local
 * `next dev`, other hosts), runs the job in this process after the response
 * is sent. Duplicate triggers are safe: the job is claimed atomically.
 */
export async function triggerJob(jobId: string, origin: string): Promise<"background" | "in-process"> {
  if (await postToBackgroundFunction(jobId, origin)) return "background";
  after(async () => {
    await runJob(jobId, { origin });
  });
  return "in-process";
}
