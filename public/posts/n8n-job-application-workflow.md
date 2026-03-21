## Stop Getting Ghosted: Build Your Own AI Resume War Machine with n8n and Claude

We've all been there. You find the *perfect* job description at 2:00 AM. You know you're qualified, but your base resume looks like a generic template from 2018. You have two choices: spend three hours manually moving bullet points around, or send it as-is and hope the ATS gods have mercy.

**Plot twist: There is a third option.**

Today, we are building a fully automated **AI Resume Tailor**. This isn't just a wrapper — it's a high-level workflow that takes your LaTeX resume, analyzes it against a job description, scores it, and — if the score is too low — loops back to revise it until it hits the mark.

---

## Prerequisites

Before you build anything, make sure you have these ready:

- **n8n installed locally** — run `npm install -g n8n` then `n8n start` to open it at `http://localhost:5678`
- **Anthropic API key** — get one at console.anthropic.com under API Keys
- **Resume Matcher running locally** — see Phase 3 for setup details
- **Your resume in LaTeX format** — we'll use this as the base template
- **An Overleaf account** — free at overleaf.com, where you'll compile the final PDF

---

## The Stack

| Tool | Role |
|------|------|
| **n8n** | The brain — orchestrates every step |
| **Claude Sonnet 4 (Anthropic)** | The editor — tailors and revises LaTeX with surgical precision |
| **Resume Matcher (Local)** | The judge — scores your resume against the job description using NLP |
| **Overleaf** | The finisher — compiles your `.tex` file into a polished PDF |

---

## The Workflow at a Glance

Here is the full pipeline before we build it node by node:

```
Trigger → Edit Fields → Claude Tailor → Resume Analyzer → Check Score
                                                               │
                                              ┌────── TRUE ───────────────────┐
                                              │                               ▼
                                           FALSE                     Prepare TEX File
                                              │                               ▲
                                              └──→ Claude Revise ─────────────┘
```

If the score clears the threshold, the resume goes straight to export. If not, it goes to Claude Revise for a targeted second pass, then to export. Either way you get one clean `.tex` file at the end.

---

## Phase 1: The Input Chamber

Every great mission starts with data. We need to feed our machine three things: the job description, your master resume, and identifiers for the output filename.

**Node 1 — Manual Trigger**
This is your Go button. Click Execute Workflow and the whole pipeline fires.

**Node 2 — Edit Fields**
Add an Edit Fields node with four fields:

| Field | Value |
|-------|-------|
| `job_description` | Paste the full job posting text |
| `resume_text` | Paste your full LaTeX resume source |
| `company_name` | e.g. `shopify` |
| `role_slug` | e.g. `junior-backend-engineer` |

You update `job_description`, `company_name`, and `role_slug` each time you apply for a new role. The `resume_text` stays constant — it is your master template.

---

## Phase 2: The First Draft (Claude Tailor)

We do not want a generic AI rewrite. We want a surgical strike.

Add an **HTTP Request** node named **HTTP Request**. Configure it as follows:

**Method:** `POST`
**URL:** `https://api.anthropic.com/v1/messages`

**Headers (all three are required — missing any one will cause a 401 error):**

| Name | Value |
|------|-------|
| `Content-Type` | `application/json` |
| `anthropic-version` | `2023-06-01` |
| `x-api-key` | your Anthropic API key |

**Body — add three fields using "Using Fields Below" mode:**

| Field | Value |
|-------|-------|
| `model` | `claude-sonnet-4-20250514` |
| `max_tokens` | `4000` |
| `messages` | *(Expression mode — see below)* |

Switch the `messages` field to **Expression mode** and paste:

```
[{"role": "user", "content": "You are tailoring an existing LaTeX resume. Preserve the exact LaTeX structure, preamble, packages, and formatting. Do NOT create a new template. Do NOT invent skills, metrics, or experience. Only improve wording and alignment with the job description.\n\nReturn ONLY raw LaTeX. No markdown fences. No explanation.\n\nJOB DESCRIPTION:\n" + $node["Edit Fields"].json["job_description"] + "\n\nBASE RESUME LATEX:\n" + $node["Edit Fields"].json["resume_text"]}]
```

**The Secret Sauce:** We are not asking Claude to rewrite your resume from scratch. We are telling it to treat your LaTeX as a sacred template — preserve every command, every spacing rule, every separator — and only adjust the words. This keeps the output truthful and compiles cleanly in Overleaf every time.

---

## Phase 3: The Judge (Resume Analyzer)

How do we know if Claude did a good job? We build a judge.

We use [Resume Matcher](https://github.com/srbhr/Resume-Matcher) — an open-source Python engine that uses NLP to score your resume against a job description.

**Setup (one time only):**
1. Clone and run the Resume Matcher project locally following its README
2. It needs one custom endpoint added: `POST /api/v1/analyze` that accepts `resume_text` and `job_description` as plain text strings and returns structured JSON
3. Confirm it is running: `curl http://localhost:8000/api/v1/health` should return `{"status":"ok"}`

**Node — Resume Analyzer**

Add an HTTP Request node named **Resume analyser**:

**Method:** `POST`
**URL:** `http://127.0.0.1:8000/api/v1/analyze`
**Header:** `Content-Type: application/json`

**Body (Expression mode):**
```
{"resume_text": "{{ $('HTTP Request').item.json.content[0].text }}", "job_description": "{{ $('Edit Fields').item.json.job_description }}"}
```

The response comes back with:

```json
{
  "data": {
    "original_score": 0.63,
    "new_score": 0.73,
    "improvements": [
      { "suggestion": "Add a distinct Skills section listing React and TypeScript..." }
    ],
    "job_keywords": "React, Node.js, PostgreSQL",
    "skill_comparison": [...]
  }
}
```

**Why this matters:** While most people just hope their resume sounds good, you are using a dedicated NLP engine to mathematically verify your match rate before you hit apply. Running it locally means your resume data never leaves your machine.

> Note: The `/api/v1/analyze` endpoint is not part of the original Resume Matcher repo — you’ll need to add a custom API wrapper.  
> Modify it to return structured JSON like: `original_score`, `new_score`, `improvements`, `job_keywords`, and `skill_comparison`.
---

## Phase 4: The Quality Gate (Check Score)

Now we add logic. Add an **IF** node named **Check Score**.

**Condition:**
- Value 1: `{{ $('Resume analyser').item.json.data.new_score }}`
- Operation: `greater than`
- Value 2: `0.75`

If **TRUE** — the resume cleared the threshold. Connect this path directly to the Prepare TEX File node. No revision needed.

If **FALSE** — the score is too low. This path goes to Claude Revise.

---

## Phase 5: The Loop of Perfection (Claude Revise)

If the score was too low, we do not guess what to fix. We send Claude the exact suggestions the analyzer produced.

Add another **HTTP Request** node named **Claude Revise**. Same URL and headers as Phase 2.

The key difference is the prompt. In the `messages` expression:

```
[{"role": "user", "content": "You are revising an existing LaTeX resume. Preserve the exact LaTeX structure with 100% fidelity. Return ONLY raw LaTeX. No markdown fences.\n\nSTRICT RULES:\n- Only use skills and tools already present in the resume\n- Never invent metrics, frameworks, or experience\n- Skip any suggestion that requires inventing something new\n\nANALYZER SUGGESTIONS:\n" + $("Resume analyser").first().json.data.improvements.map(i => "- " + i.suggestion).join("\n") + "\n\nJOB KEYWORDS:\n" + $("Resume analyser").first().json.data.job_keywords + "\n\nCURRENT RESUME:\n" + $("HTTP Request").first().json.content[0].text}]
```

This is the feedback loop that separates this workflow from a simple AI rewrite. Claude gets the specific gaps the NLP engine found and addresses them directly — without inventing anything that was not already in the original resume.

---

## Phase 6: The Export (Prepare TEX File)

Now for the final step. We have a string of LaTeX text coming back from Claude. We need to clean it and package it as a proper file.

Add a **Code** node named **Prepare Tex File**. Connect both the TRUE path from Check Score and the output of Claude Revise into this node.

Paste this code:

```javascript
const raw = $input.first().json.content[0].text;

const company = $('Edit Fields').first().json.company_name;
const role = $('Edit Fields').first().json.role_slug;
const date = new Date().toISOString().split('T')[0];
const filename = `resume_${company}_${role}_${date}.tex`;

// Strip any markdown fences Claude may have added
let clean = raw
  .replace(/^```latex\n?/i, '')
  .replace(/^```\n?/i, '')
  .replace(/```$/i, '')
  .trim();

const buffer = Buffer.from(clean, 'utf8');

return [{
  json: { filename },
  binary: {
    data: {
      data: buffer.toString('base64'),
      mimeType: 'text/plain',
      fileName: filename
    }
  }
}];
```

This does three things:
1. Strips any accidental markdown fences Claude might add despite being told not to
2. Builds a clean filename like `resume_shopify_junior-backend-engineer_2026-03-20.tex`
3. Converts the text into a binary buffer so n8n treats it as a real file

---

## Taking It to Overleaf

Once the workflow runs, you have two options:

**Option A — Copy the output text** from the Prepare Tex File node's OUTPUT panel and paste it into your Overleaf project's main `.tex` file.

**Option B (recommended) — Add a Write File node** after Prepare Tex File to automatically save the `.tex` file to your Desktop. Then upload it directly to Overleaf using the Upload button. Direct upload preserves all line breaks perfectly, whereas copy-paste can occasionally collapse formatting.

Hit compile in Overleaf. Your tailored, NLP-verified, AI-polished resume renders as a clean PDF — ready to apply.

---

## The Result

What used to take 30–40 minutes per application now takes under 2 minutes:

- Paste the job description and company name
- Click Execute Workflow
- Wait 60–90 seconds
- Copy the output into Overleaf
- Apply

The resume is tailored, scored, revised if needed, and formatted identically to your base template every single time. No invented skills. No broken LaTeX. No guessing.

That is the machine. Now go build it.

---

