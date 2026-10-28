const providerSecretPattern = /(API_KEY|_KEY$|_TOKEN$|_SECRET$)/i;

export function offlineTestEnvironment(overrides = {}) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (providerSecretPattern.test(name)) delete environment[name];
  }
  return { ...environment, ...overrides };
}
