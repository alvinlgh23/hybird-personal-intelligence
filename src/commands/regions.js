import { commandOf } from "../utils/format.js";
import { buildRegionalNewsBrief, isRegionCommand } from "../services/regionalNews.js";

export async function handleRegionCommand(text, { env, context }) {
  const command = commandOf(text);
  if (!isRegionCommand(command)) return null;
  await context.loading("Building regional intelligence brief...");
  return buildRegionalNewsBrief(command, { env });
}
