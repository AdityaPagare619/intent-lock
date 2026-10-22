# Security policy

## Reporting a vulnerability

Do not report a suspected vulnerability in a public issue.

Email the maintainer, Aditya Pagare, at
**adityapaagare619@gmail.com**. Include:

- the affected component and, if known, the commit or file;
- a concise description of the impact;
- reproduction steps or a proof of concept;
- relevant logs with credentials and personal data removed;
- any workaround you have already found.

## Project security rules

- API keys belong only in a server-side process environment. They
  must never be committed, written into repository files, or printed
  in logs.
- The demo runs keyless. Without `GEMINI_API_KEY`, host extraction
  uses the deterministic local floor and labels that fallback.
- The Intent Lock MCP server itself requires no API key and runs no
  model.
- Keep real credentials out of issues, pull requests, screenshots,
  and test fixtures. If a credential has been exposed, rotate it
  before discussing the incident in a public place.
