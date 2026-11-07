# Content bundles (exam tree, syllabus, eligibility)

Official exam information reaches the database in three steps (ADR 0005):

1. **Prepare:** the content agent (or a person) reads an **official** notification or syllabus and
   writes a bundle file in `content/imports/<ref>.json`, in a pull request.
2. **Load:** after the pull request is merged into `main`, the **Import content drafts** GitHub
   workflow loads every bundle as **drafts**. Rows that already exist are reused, never changed.
3. **Approve:** a reviewer checks each draft against the cited document in **Admin → Exams and
   syllabus** and approves it top-down. Students only ever see approved items.

Nothing in a bundle is ever approved automatically. Re-running the import is safe.

## Rules
- Cite **official** documents only: `official_notification` or `official_syllabus`, `https://`
  links on a host in `official-domains.json`. Never coaching sites, blogs, PDFs re-hosted by third
  parties, or AI summaries.
- Every source has `document_sha256` (SHA-256 of the downloaded file) and `retrieved_on`. A changed
  file therefore appears as a new source draft.
- Paper facts (duration, marks, negative marking), syllabus versions and eligibility rules must cite
  a source. Leave a fact out rather than guess it.
- Copy wording faithfully; summarise long syllabus text into topic names without adding content.
  Don't invent Marathi names: leave `name_mr` out unless the official document gives it.
- Codes are capital letters, digits and `_`. Reuse existing codes for the same exam so the import
  matches existing rows (codes used in the database are listed in the import workflow's log).
- `ref` is lowercase with dashes and equals the file name, e.g.
  `2026-11-mpsc-rajyaseva-prelims-syllabus`.

## Format (`examsaathi.content-bundle/v1`)
```jsonc
{
  "format": "examsaathi.content-bundle/v1",
  "ref": "2026-11-example-commission-notice",
  "sources": [
    {
      "key": "notice",                       // used below to cite this source
      "kind": "official_notification",        // or "official_syllabus"
      "title": "Advertisement No. 12/2026",
      "publisher": "Example Public Service Commission",
      "url": "https://example.gov.in/advt-12-2026.pdf",
      "published_on": "2026-10-01",
      "retrieved_on": "2026-11-07",
      "document_sha256": "<64 hex characters>"
    }
  ],
  "families": [
    {
      "code": "EXPSC", "name_en": "Example Public Service Commission",
      "exams": [
        {
          "code": "EXPSC_CIVIL", "name_en": "Example Civil Services", "state": "Maharashtra",
          "eligibility": [
            {
              "label": "Advertisement 12/2026: Group B posts",
              "post_name": "Assistant Section Officer",
              "min_education": "graduate",          // none | class_8 | class_10 | class_12 | diploma | graduate | postgraduate | doctorate
              "education_note": "Degree in any discipline; final-year students may apply.",
              "age_min": 19, "age_max": 38, "age_reference_date": "2026-11-01",
              "age_relaxations": { "OBC": 3, "SC": 5, "ST": 5 },
              "domicile_state": "Maharashtra",
              "other_conditions": "Indian citizen. Marathi reading and writing required.",
              "valid_from": "2026-10-01", "valid_until": "2026-10-31",
              "source": "notice"
            }
          ],
          "stages": [
            {
              "code": "PRELIMS", "name_en": "Preliminary examination", "sort_order": 1,
              "papers": [
                {
                  "code": "GS1", "name_en": "General Studies Paper I",
                  "duration_min": 120, "total_marks": 200, "negative_marking": 0.25,
                  "source": "notice",
                  "syllabus_versions": [
                    {
                      "label": "Syllabus as notified in 2026", "effective_from": "2026-10-01",
                      "source": "notice",
                      "subjects": [
                        {
                          "name_en": "History", "sort_order": 1,
                          "topics": [
                            { "name_en": "Modern India: social and economic reforms", "sort_order": 1 }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```
Optional topic fields: `weight` (default 1; any other value needs `weight_note` before approval),
`est_learn_min` (default 60), `name_mr`.

## Checks
- On every pull request, CI validates each bundle (`content/validate.mjs`) and imports it into a
  throwaway database (`supabase/tests/content-bundles.test.ts`).
- After merge, the import runs only if the database already has the import function: run
  **Deploy database** first when a pull request also contains migrations.
