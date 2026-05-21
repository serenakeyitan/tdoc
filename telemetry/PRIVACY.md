# Privacy text for your skill's README

If you adopt skill-telemetry, please reproduce this section (or something
very close) in your skill's README. Users deserve to know what's happening
before they install.

---

## Telemetry

When you use this skill, it records:

- The skill name
- Whether the run succeeded, errored, or was abandoned
- How long it took (in seconds)
- If it failed: which step, plus a short error tag (≤160 characters)
- A randomly-generated UUID for your machine (created once, stored at
  `~/.<skill-name>/telemetry/installation-id`)
- Your Claude Code session ID

It does NOT record:

- Your name, email, IP address, or hostname
- The contents of your prompts or Claude's responses
- The contents of any files this skill reads or writes
- Anything about other skills or other Claude Code sessions

This data is sent to the skill author's Supabase project (the URL is
visible in `<path-to-skill>/telemetry/supabase/config.sh`). It is NOT sent
to Anthropic, OpenAI, or any other third party.

The author uses this to figure out which steps trip people up and what
needs fixing. Without it, they're guessing.

### Opt out

Set `SKILL_TELEMETRY=off` in your shell:

```bash
# disable for one shell
export SKILL_TELEMETRY=off

# disable permanently
echo 'export SKILL_TELEMETRY=off' >> ~/.zshrc   # or ~/.bashrc
```

With this set, nothing is written locally and nothing is sent. The skill
otherwise works identically.

### Delete your data

Your installation_id is at `~/.<skill-name>/telemetry/installation-id`.
Send it to the skill author and ask them to delete rows matching it. (If
they don't, that's between you and them — but they have one SQL line
that does the whole job, so there's no excuse.)
