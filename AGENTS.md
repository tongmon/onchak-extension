# AGENTS.md

## Mantine Rule

- For any Mantine-related code (theme, components, providers, styling, API usage), always consult and follow `https://mantine.dev/llms.txt` first.
- Use Mantine official guidance from that source as the default reference.
- If project constraints conflict, keep project constraints and explain the tradeoff in the response.

## Architecture Rule

- Please refer to this `https://fsd.how/llms-full.txt` link first when designing or modifying the project architecture.

## Dist Release Version Rule

- When generating a `dist` artifact that includes code or feature changes, bump the extension version before building.
- Use patch bumps for normal feature/fix releases. Example: `0.1.1` -> `0.1.2`.
- Keep `package.json` version, `dist/manifest.json` version, and release artifact names aligned.
- If a git tag is created for the artifact, use the same version with a `v` prefix. Example: `v0.1.2`.
