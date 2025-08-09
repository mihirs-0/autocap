High-Level Architecture
	•	API tier: FastAPI (async), REST endpoints for upload/status/editor/export. Auth via JWT; request/response idempotency keys.
	•	Job orchestration: Redis/Celery (or Kafka + workers for scale); priority queues; backpressure; retries with exponential backoff.
	•	Compute workers (GPU): ASR + DSP + post-processing. Horizontal auto-scale; GPU utilization tracking; batching by segment.
	•	Storage: Object store (S3/GCS) for media & artifacts; Postgres for metadata; Redis for transient state.
	•	Editor (Web): React/Next.js; video preview, waveform, flag navigator, compliance chips, keyboard shortcuts.
	•	Integration: LMS/Kaltura (MediaSpace) push via webhook/adapter; audit log export.

Request Flow (Sequence)
	1.	Upload → POST /jobs → persist media; enqueue job.
	2.	Preprocess (ffmpeg): loudness normalization, denoise, VAD markers.
	3.	ASR (Whisper v3, word-timestamps, logprobs) on streaming segments (30–60s with 1s overlap).
	4.	(Optional) Diarization (pyannote) → speaker turns.
	5.	Segmentation: punctuation + pause-based chunking; respect min 2.0s, target ≤7.0s.
	6.	Line breaking: ≤2 lines, ~32 chars/line; grammar-aware “never-split” units.
	7.	STEM pass: normalize math (caret/subscript/operators/Greek), function-argument stickiness, “break before =”.
	8.	Compliance validators: timing, line count/length, WPM band, non-speech tags, placement heuristics.
	9.	Flagging: low confidence, rate violations, overlap, glossary miss, math review, timing snap.
	10.	Artifacts: SRT/VTT + audit JSON + editor payload.
	11.	HITL: editor clears flags; approve → final export + LMS push.

Data Model (core)
	•	Job(id, status, media_url, duration, model, created_at,…)
	•	CaptionGroup(id, start_ms, end_ms, lines[≤2], speaker?, conf, checks{}, tags[])
	•	Flag(id, type, severity, caption_id, message, suggestions[])
	•	Audit(wer_estimate, p95_wpm, violations_count, review_time, editor_id)
	•	Glossary(course_id, term, canonical, variants[])

Key Algorithms & Components
	•	Chunked ASR with stitch-back: overlap-add to avoid word truncation; de-dup via DTW on timestamps.
	•	VAD-snapping: align caption boundaries to nearest silence ≥120ms.
	•	Rate governor: compute WPM per caption; split on safe boundaries; light filler removal only if policy allows.
	•	Grammar-aware wrap: rule table (“never split” patterns: aux+verb, prep+obj, title+name, func+arg, numbers+units).
	•	STEM normalizer: x^2, a_ij, * not x, (x,y,z), a·b; spell out Greek.
	•	Confidence scoring: token logprob → group score; thresholding for flags; dynamic escalation on low SNR.
	•	Heuristic placement: bottom default; top when lower-third detected (simple luminance band or manual override per caption).

Scaling & Performance
	•	Throughput: parallel segment inference per GPU; tune batch size; pin memory; mixed precision.
	•	Caching: immutable ASR cache keyed by media hash; rerun post-processing without re-ASR.
	•	SLOs: p50 end-to-end ≤ 0.5× media length (draft), editor clear-time ≤ 0.6× flagged duration.
	•	Backpressure: queue depth monitors; reject/503 with retry-After if capacity exceeded.

Quality & Compliance
	•	Automatic gates: min duration, ≤2 lines, ≤32 chars/line (hard cap 37), WPM 120–160 target (100–170 soft), non-speech bracketing, speaker tags when multi-speaker.
	•	WER proxy: confidence-weighted, small golden sets for true WER.
	•	Auditability: per-job JSON of violations, flags, accepted suggestions, editor id/time; immutable logs.

HITL UX (where time is saved)
	•	Flag-first navigation (N next flag), inline suggestions (split here, borrow 120ms, apply glossary), live compliance chips, keyboard-only editing.
	•	Focus metrics: “% captions green on first pass”, “flags cleared per minute”.

Observability
	•	Metrics (Prometheus/Grafana): ASR latency, GPU utilization, segment error rate, queue lag, p50/p95 job latency.
	•	Product KPIs: edit minutes per video minute, % auto-green, residual violations per 30-min QA.
	•	Tracing: OpenTelemetry spans across API→worker→LMS.

Security & Privacy
	•	FERPA: encrypt at rest (SSE-S3); TLS in transit; presigned URLs; per-job RBAC; retention policy (e.g., purge media after 30d, keep audit only).
	•	PII controls: scoped access tokens; audit trails; least privilege for workers.

Failure Modes & Mitigations
	•	Noisy/choppy audio → higher flag density; fallback to larger model or forced alignment on segments.
	•	Diarization drift → treat as hint; disable if unstable; manual speaker override.
	•	Punctuation hallucinations → minimum chunk length + pause-priority segmentation.
	•	Model/driver crashes → idempotent steps, checkpoint per stage, resumable jobs.
	•	Queue overload → autoscale workers; degrade to smaller ASR model; enqueue with priority.

Trade-offs
	•	Accuracy vs. latency: start with medium model for draft, optional large re-pass for flagged spans only.
	•	Rules vs. ML: rules ensure auditability; consider learned resegmentation later (CART/LSTM) once logs accumulate.
	•	Diarization now vs. later: defer if not critical to compliance; invests cycles where it saves editor time most (math/rate).

Rollout Plan
	•	Pilot: 20 videos across 3 STEM courses. Measure edit ratio, violation rate, complaints.
	•	Tuning: adjust thresholds (YAML) from audit analytics; expand glossary.
	•	Scale: multi-tenant namespaces (per department), quota & cost controls.

Cost Thumb-Rules
	•	ASR GPU: ~$0.05–$0.15 per lecture minute (self-host, model-dependent).
	•	Human time: target ≤1 min edit per video minute, focused on 20–30% of spans.
	•	All-in: ≥70–85% labor savings vs. manual 4–6× editing.
