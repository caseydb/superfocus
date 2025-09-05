# Video Calling PRD – Comprehensive Checklist

Use this checklist to drive delivery for Phase 0 → GA. Items are grouped to mirror the PRD. Mark each with [x] when complete and add links/notes as you implement.

## 0) Open Questions (Resolve Early)
- [ ] Choose provider for Phase 1 (LiveKit Cloud vs Daily vs Twilio).
- [ ] Decide participant cap for GA (6 vs 8 vs 12).
- [ ] Decide whether in‑call text chat ships in Phase 1.
- [ ] Confirm guest access model (any external guests? how authenticated?).
- [ ] Confirm regional data residency constraints (if any).

## 1) Scope & Non‑Goals
- [ ] Confirm Phase 1 scope: 1:1 and small groups (target 6, hard cap 12).
- [ ] Confirm single screen‑sharer at a time.
- [ ] Confirm essential controls only: mic, camera, device selection, screen share.
- [ ] Confirm non‑goals: recordings, transcription, live streaming, PSTN, large webinars, advanced moderation, custom layouts.

## 2) Provider Setup & Abstraction
- [ ] Create provider account and obtain API keys.
- [ ] Add `.env` entries for provider keys/URLs (and CI secrets if needed).
- [ ] Implement thin `CallClient` interface (join/leave, mic/cam, device, screen share, events).
- [ ] Implement provider adapter (e.g., `LiveKitClient`) behind `CallClient`.
- [ ] Add feature flag `NEXT_PUBLIC_FEATURE_VIDEO_CALLS` and gate UI/routes.
- [ ] Document migration path to self‑hosted LiveKit (notes + assumptions).

## 3) Backend: Auth, Tokens, Presence
- [ ] `POST /api/call/start`: create `Call` if none active; returns `callId` + token.
- [ ] `POST /api/call/token`: validate Room access; mint short‑lived provider token scoped to `roomId`/`callId`.
- [ ] `POST /api/call/end`: mark call ended (host or last participant leaves).
- [ ] `GET /api/call/:roomId/status`: return active/presence for badging.
- [ ] Enforce Room permissions (e.g., canStartCall) on relevant endpoints.
- [ ] Add rate limiting and abuse protection (start/token endpoints).
- [ ] Emit analytics events for endpoint usage/errors.

## 4) Data Model (Prisma)
- [ ] Add `Call` model (id, roomId, startedAt, endedAt, status).
- [ ] Add `CallParticipant` model (id, callId, userId, joinedAt, leftAt, role).
- [ ] Add enums `CallStatus { ACTIVE, ENDED }`, `CallRole { HOST, MEMBER }`.
- [ ] Add relations to `Room` (and `User` if applicable).
- [ ] Run migration and verify CRUD via seed or dev console.
- [ ] Ensure no raw media is stored; metadata only.

## 5) Frontend: Core UX
- [ ] Add `CallBadge` in Room header with join/participant count and live indicator.
- [ ] Add `PrejoinModal` for device checks and permission prompts.
- [ ] Add `CallPanel` with participant grid, active speaker highlight, and screen share focus + filmstrip.
- [ ] Add `ParticipantTile` (video/audio elements, mute/cam state, active speaker border).
- [ ] Add `ControlsBar` (mute, camera, screen share, device switcher, leave).
- [ ] Add `DevicesMenu` (enumerate/select audioinput/audioutput/videoinput).
- [ ] Persist mute/camera state across rejoin (session‑scoped persistence).
- [ ] Handle UI states: pre‑join, joining, in‑call, reconnecting, permission denied, no devices.
- [ ] Show “Network is unstable” banner on degraded quality signals.

## 6) Mobile UX
- [ ] Responsive full‑screen call UI; grid/filmstrip adapted for mobile.
- [ ] Mobile menu quick action to join/leave.
- [ ] Picture‑in‑Picture or minimized tile while browsing app (where supported).
- [ ] iOS permission flows: explicit prompts and fallback messaging.

## 7) Workspace Integration Points
- [ ] `app/Components/Room/WorkSpace.tsx`: add CallBadge/Join button and call surface toggle.
- [ ] `app/Components/Room/MobileMenu.tsx`: add join/leave quick action and status.
- [ ] `app/Components/Instances.tsx`: show call presence if instances map to Rooms.
- [ ] `app/Components/Room/Timer.tsx`: ensure timer + call UI coexist (layout stacking).

## 8) Security & Privacy
- [ ] Enforce Room access for token minting (authz checks).
- [ ] Use short‑lived tokens scoped to `roomId`/`callId`.
- [ ] Ensure SRTP/DTLS encryption in transit (provider guarantees).
- [ ] No media storage in Phase 1; PII minimization (only metadata).
- [ ] Add rate limits; participant caps; optional host‑only screen share.
- [ ] Update privacy policy and DPA with provider; document data flows.
- [ ] Provide analytics opt‑out where applicable.

## 9) Performance & Reliability Targets
- [ ] Join time: first media render < 2s on typical networks.
- [ ] Maintain <400 ms end‑to‑end latency target under normal conditions.
- [ ] Prioritize audio over video; enable simulcast/SVC when supported.
- [ ] Implement auto downscale/pause HD under poor network conditions.
- [ ] Reconnection strategy with user feedback (toasts/banners) and backoff.
- [ ] Browser support: latest Chrome, Edge, Firefox, Safari (2 latest major versions).
- [ ] Mobile behavior: adaptive bitrate; background audio handling defined.

## 10) Observability, Analytics, Alerts
- [ ] Emit product events: joins, leaves, duration, screen share start/stop, device changes.
- [ ] Emit QoS metrics: bitrate, packet loss, RTT, jitter, reconnects, ICE failures, end reason.
- [ ] Track error states: permission denied, device not found, token invalid, provider errors.
- [ ] Build dashboard for adoption/quality (conversion, failure rate, MOS proxy, reconnect rate).
- [ ] Configure alerts on failure/reconnect/error thresholds.

## 11) Testing Strategy
- [ ] Unit tests: token endpoint logic and permission checks.
- [ ] Integration tests: start/join/leave flow with mocked provider.
- [ ] E2E (Playwright): pre‑join, device switching, controls, screen share.
- [ ] Manual cross‑browser validation: Chrome, Firefox, Safari, Edge (desktop + mobile Safari).
- [ ] Network throttling scenarios: high loss/high latency; verify audio priority and UI banners.
- [ ] Device matrix smoke: multiple cameras/mics; device hot‑swap while in call.

## 12) Rollout Plan
- [ ] Phase 0 – Spike
  - [ ] Integrate provider SDK behind feature flag.
  - [ ] Build Prejoin + CallPanel prototype.
  - [ ] Token endpoint PoC; basic join/leave.
  - [ ] Log essential metrics.
- [ ] Phase 1 – Beta
  - [ ] Complete call controls; participant list; active speaker.
  - [ ] Room presence + badging; mobile layout.
  - [ ] Analytics dashboard + alerting.
  - [ ] Security review; rate limits; error states; docs.
- [ ] Phase 2 – GA
  - [ ] Stabilization, polish, bug fixes.
  - [ ] Expand to all Rooms; monitor SLOs and alerting.

## 13) Dependencies
- [ ] Provider account/keys (LiveKit Cloud or Daily/Twilio/Agora).
- [ ] TURN/SFU by provider; STUN fallback for local dev.
- [ ] Existing auth and Room permissions model integrated with token endpoints.
- [ ] Frontend state management wired for call state.
- [ ] Analytics pipeline ready to receive call/QoS events.

## 14) Risks & Mitigations (Track During Build)
- [ ] Network variability → use SFU with simulcast; clear degraded‑network UI.
- [ ] Browser quirks (Safari/iOS) → device checks; targeted tests; capability flags.
- [ ] Vendor lock‑in → abstraction layer; migration notes for self‑hosted LiveKit.
- [ ] Cost overruns → participant caps; media constraints; monitor usage minutes.
- [ ] Privacy concerns → explicit permission prompts; clear policy; minimal storage.

## 15) Success Metrics (Define + Instrument)
- [ ] Adoption: % Rooms with ≥1 call/week; MAU calling conversion.
- [ ] Quality: median join time < 2s; audio MOS proxy within target; <2% call failure rate.
- [ ] Engagement: average call duration; repeat call rate; screen share usage.
- [ ] Reliability: reconnect rate; error rate; call‑related support tickets.

## 16) Implementation Links (fill as you go)
- [ ] Provider adapter: `app/lib/rtc/`
- [ ] Token endpoints: `app/api/call/`
- [ ] UI components: `app/Components/Room/`
- [ ] Prisma models/migrations: `prisma/`

