export function mergeAgentModulesForSave(
  existing: Record<string, string> | null,
  updates: Record<string, string>,
): Record<string, string> {
  const merged = { ...(existing || {}) };
  for (const [key, value] of Object.entries(updates)) {
    if (value === "__DELETE__") {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}
