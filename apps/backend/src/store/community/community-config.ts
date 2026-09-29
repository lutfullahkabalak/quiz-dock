export const OFFICIAL_REGISTRY =
  'https://raw.githubusercontent.com/quizdock/quiz-store/main/registry.json';
export function communityRegistries(): string[] {
  return (process.env.QUIZ_STORE_URL ?? OFFICIAL_REGISTRY)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 5);
}
export function communityHosts(registries = communityRegistries()): Set<string> {
  const hosts = new Set(
    (process.env.QUIZ_STORE_HOSTS ?? 'github.com,release-assets.githubusercontent.com')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const registry of registries) {
    try {
      hosts.add(new URL(registry).hostname.toLowerCase());
    } catch {
      /* Invalid registry is reported when listed. */
    }
  }
  return hosts;
}
