import { commandOf } from "../utils/format.js";
import { buildRegionalNewsBrief, isRegionCommand } from "../services/regionalNews.js";

export async function handleRegionCommand(text, { env, context }) {
  const command = commandOf(text);
  if (!isRegionCommand(command)) return null;
  const deep = /\sdeep\b/iu.test(text);
  const synth = /\ssynth\b/iu.test(text);
  const itemIndex = Number(text.match(/^\/\w+(?:@\w+)?\s+([1-9]|10)\b/iu)?.[1] || 0) || null;
  await context.loading(itemIndex ? "Opening regional signal detail..." : deep ? "Building deep regional intelligence brief..." : synth ? "Building regional synthesis..." : "Building regional signals...");
  return buildRegionalNewsBrief(command, { env, deep, synth, itemIndex, limit: 3 });
}
