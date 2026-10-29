# Decision Log
## Decisions
### D-0001: Keep capital-radius collection separate
Status: Accepted
Context: Existing source-country JSON and HTML are already in use.
Decision: Save capital-radius data under a distinct directory with its own aggregate and HTML.
Consequences: The existing collection remains unchanged and both approaches can be compared.
### D-0002: Use API location-filter coordinates
Status: Accepted
Context: API supports geographic-radius queries with latitude, longitude, and a 1–100 km radius.
Decision: Query one 100 km radius for each EU capital.
Consequences: Results may overlap across circles, so the aggregate and HTML must deduplicate stories.
