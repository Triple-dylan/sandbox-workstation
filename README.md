# Sandbox Workstation

A canvas-and-graph workstation where people and agents work together, and agents keep project context up to date automatically.

- Product: [docs/SPEC.md](docs/SPEC.md)
- Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Status and how to run: [docs/STATE.md](docs/STATE.md)
- History: [docs/record/](docs/record/) (interview record), [docs/archive/](docs/archive/) (superseded plans and evidence)

Requires Node 22.18 or later.

```sh
cd workstation
npm ci
npm start      # http://127.0.0.1:4174
```

Agents need an OpenAI key: `cp .env.example .env` here in the repo root and set `OPENAI_API_KEY`. Without it agents say they are not connected and answer nothing. With `NOUS_API_KEY` also set, Claude Sonnet 5.5 answers through Nous Research only when OpenAI can't, and those replies say so.
