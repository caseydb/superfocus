# PRD: In-Room Video Calling

## Summary

Add built-in, low-latency video calling to Rooms so users can talk face‑to‑face while collaborating in the workspace. The feature supports 1:1 and small group calls, screen sharing, and essential call controls with a clear path to recordings and larger sessions later.

## Background / Problem

Today, teams coordinate in a Room using our shared workspace, but must switch to external tools (Zoom, Meet, etc.) for voice/video. This creates friction, context switching, and fragmented history. A native video layer reduces friction, increases engagement, and keeps collaboration inside the product.

## Goals

- Seamless in-Room calling: start/join a call in any Room in one click.
- High call quality: stable A/V under typical network conditions (<400 ms end‑to‑end latency, jitter tolerant).
- Cross‑platform: modern desktop browsers and mobile web; responsive UI.
- Essential collaboration features: screen share, mute/unmute, camera on/off, device selection.
- Security-first: encrypted media, scoped access, minimal data retention.
- Observability: quality metrics and analytics to guide improvements.

## Non‑Goals (Phase 1)

- Large webinars (>12 participants) and advanced moderation tools.
- Server‑side recordings, transcription, or live streaming.
- Custom layouts beyond a simple grid with active speaker highlight.
- PSTN dial‑in/dial‑out.

## Personas

- Collaborator: joins Rooms to work in real time; needs quick, reliable A/V.
- Facilitator: starts calls and screen shares; needs easy host controls.
- Viewer (mobile): joins quickly, with adaptive quality to save bandwidth.

## User Stories & Acceptance Criteria

1. Start a call in a Room
   - Given I am in a Room, when I click “Start Call,” then a call starts, my mic/camera permissions are requested, and I join as the first participant.
   - The Room visibly indicates there is a live call (badge + participant count).

2. Join/leave a call
   - Given a live call is in progress, when I click “Join,” then I see/hear other participants within 2 seconds and they see me join.
   - Leaving returns me to the Room without disrupting others.

3. Call controls
   - I can toggle mic/camera, change input/output devices, and screen share.
   - Mute state and camera state persist across rejoin in the same session.

4. Participant management
   - I can see a live participant list with statuses (muted, screensharing).
   - Active speaker is visually highlighted.

5. Network resilience
   - On poor networks, the call adapts (downscales video, pauses HD) without dropping audio; users see a “Network is unstable” banner.

6. Permissions & privacy
   - Only users with access to the Room can join calls in that Room.
   - Media is encrypted in transit. No unencrypted media is stored.

## Scope (Phase 1)

- 1:1 and small group calls (target 6, hard cap 12 in Phase 1).
- Screen sharing (one sharer at a time).
- Device management (camera, mic, speaker selection), mute/unmute, camera on/off.
- Call presence/badging in Room header and Mobile menu.
- Basic in-call text chat or reactions is optional; defer if at risk.

## Experience / UX

- Entry points: “Start Call” button in Room header; “Join Call” chip when active; Mobile menu quick action.
- Layout: grid of participant tiles with active speaker highlight; screen share takes focus with participant filmstrip.
- States: pre-join device check modal; joining; in-call; reconnecting; permission denied; no devices found.
- Mobile: full‑screen call UI with swipe to show workspace; picture‑in‑picture while browsing within app (where supported).
- Accessibility: keyboard navigable controls; visible focus states; captions later.

## Technical Approach

We will use WebRTC for media with a hosted SFU to ensure quality and scalability. Two paths are viable:

1) Managed provider (recommended for Phase 1)
- Options: LiveKit Cloud, Daily, Twilio, Agora.
- Pros: fastest to market, global TURN/SFU, built‑in analytics.
- Cons: vendor cost, lock‑in, some limits on customization.

2) Self‑host LiveKit (Phase 2/3 consideration)
- Pros: cost control, flexibility, on‑prem potential.
- Cons: operational overhead (scaling, TURN, observability).

Recommendation: Start with LiveKit (Cloud) or Daily to ship quickly; design with an abstraction layer so we can migrate to self-hosted LiveKit later.

### Architecture Overview

- Frontend (Next.js app, App Router):
  - Pre‑join device check component and in‑call UI components.
  - Media management hooks (getUserMedia, device enumeration) with provider SDK.
  - Room integration: calls are scoped to an existing Room id.

- Signaling & Auth:
  - Backend generates short‑lived access tokens for the provider using our auth context and Room permissions.
  - Token endpoint: `POST /api/call/token` with `roomId` → returns provider token and join info.

- SFU/TURN:
  - Use provider’s managed SFU + TURN (fallback to TURN on P2P paths where applicable).

- Observability:
  - Client emits QoS metrics and call events to our analytics (join, leave, mute, device changes, screen share start/stop, reconnects, failures).

### Data Model (Prisma – proposed additions)

We will not store raw media. We store call sessions and membership for presence, audit, and analytics.

```prisma
model Call {
  id           String   @id @default(cuid())
  roomId       String
  room         Room     @relation(fields: [roomId], references: [id])
  startedAt    DateTime @default(now())
  endedAt      DateTime?
  status       CallStatus @default(ACTIVE)
  participants CallParticipant[]
}

model CallParticipant {
  id        String   @id @default(cuid())
  callId    String
  userId    String
  joinedAt  DateTime @default(now())
  leftAt    DateTime?
  role      CallRole @default(MEMBER)

  call Call @relation(fields: [callId], references: [id])
  // user User @relation(fields: [userId], references: [id]) // depends on existing User model
}

enum CallStatus { ACTIVE ENDED }
enum CallRole { HOST MEMBER }
```

### API Endpoints (Next.js route handlers)

- `POST /api/call/start` → creates `Call` if none active; returns `callId` and token
  - Requires Room permission (e.g., canStartCall).
- `POST /api/call/token` → mints provider token for a given `roomId`/`callId` if user has access
- `POST /api/call/end` → marks call ended (host permission or last participant leaves)
- `GET /api/call/:roomId/status` → presence for badging

### Frontend Components (proposed)

- `CallBadge` (Room header): shows active call and participant count; join button.
- `PrejoinModal`: device selection and permission prompts.
- `CallPanel`: main in-call surface with tiles, controls, and chat panel hook.
- `ParticipantTile`: video/audio element; mute/camera state; active speaker border.
- `ControlsBar`: mute, camera, share, device switcher, leave.
- `DevicesMenu`: enumerate/select input/output devices.

### Provider Abstraction

Create a thin interface to swap providers later:

```ts
// app/lib/rtc/CallClient.ts
export interface CallClient {
  join(opts: { roomId: string; token: string }): Promise<void>;
  leave(): Promise<void>;
  setMic(enabled: boolean): void;
  setCamera(enabled: boolean): void;
  setDevice(kind: 'audioinput'|'audiooutput'|'videoinput', deviceId: string): Promise<void>;
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
  on(event: 'participant-joined'|'participant-left'|'active-speaker'|'quality'|'error', cb: Function): void;
}
```

Back this with `LiveKitClient` or `DailyClient` implementations.

## Security & Privacy

- Media encryption in transit (SRTP/DTLS) guaranteed by WebRTC/provider.
- Access control: only authenticated users with access to the Room can obtain join tokens; tokens are short‑lived and scoped to `roomId`.
- PII minimization: store only metadata (call ids, timestamps, user ids). No media stored in Phase 1.
- Abuse controls: participant limit, optional host‑only screen share in Phase 1.
- Compliance: document data flows; DPA with provider; allow opt‑out from analytics.

## Performance & Reliability

- Join time: first media render within 2 seconds on typical networks.
- Audio priority: degrade video before audio; simulcast/SVC enabled where supported.
- Browser support: latest Chrome, Edge, Firefox, Safari (2 latest major).
- Mobile: adaptive bitrate; background audio behavior specified; handle iOS permission flows.

## Analytics & Telemetry

- Product: joins, leaves, call duration, screen share events, device changes.
- QoS: bitrate, packet loss, RTT, jitter, reconnects, ICE failures, end reason.
- Errors: permission denied, device not found, token invalid, provider errors.

## Rollout Plan

Phase 0 – Spike (1–2 weeks)
- Integrate provider SDK behind feature flag; build Prejoin + CallPanel prototype.
- Token endpoint PoC; join/leave; basic metrics logging.

Phase 1 – Beta (2–4 weeks)
- Complete call controls; screen share; participant list; active speaker.
- Room presence + badging; mobile layout; analytics dashboard; alerts.
- Security review; rate limits; error states; docs.

Phase 2 – GA (2 weeks)
- Stabilization, polish, bug fixes; expand to all Rooms; monitor SLOs.

Future (Out of Scope for Phase 1)
- Server recordings, transcription, breakout rooms, PSTN, raise hand, reactions, chat threads, moderation tools, larger rooms (12+).

## Dependencies

- Provider account/keys (LiveKit Cloud or Daily/Twilio/Agora).
- TURN/SFU by provider; fallback STUN for dev.
- Existing auth and Room permissions model.
- Frontend state management; analytics pipeline.

## Risks & Mitigations

- Network variability → use SFU with simulcast; clear UI for degraded state.
- Browser quirks (Safari/iOS) → device checks; targeted testing; capability flags.
- Vendor lock‑in → abstraction layer; migration guide for self‑hosted LiveKit.
- Cost overruns → participant caps; media constraints; monitor minutes used.
- Privacy concerns → explicit permission prompts; clear policy; minimal storage.

## Success Metrics

- Adoption: % Rooms with at least one call/week; MAU calling conversion.
- Quality: median join time < 2s; audio MOS proxy (loss/jitter) within target; <2% call failure rate.
- Engagement: avg call duration; repeat call rate; screen share usage.
- Reliability: reconnect rate; error rate; support tickets related to calls.

## Open Questions

- Preferred provider for Phase 1? (LiveKit vs Daily vs Twilio)
- Participant cap for initial GA (6 vs 8 vs 12)?
- Do we need in-call text chat in Phase 1?
- Are there Rooms with external guests? What auth model for guests?
- Any regional data residency constraints?

## Appendix: Developer Notes

- UI integration points
  - `app/Components/Room/WorkSpace.tsx`: add CallBadge/Join button and in-call surface toggle.
  - `app/Components/Room/MobileMenu.tsx`: add join/leave quick action and status.
  - `app/Components/Instances.tsx`: show call presence if instances map to Rooms.
  - `app/Components/Room/Timer.tsx`: ensure timer and call UI coexist (layout stacking).

- Config
  - Add `.env` entries for provider API keys and URLs.
  - Feature flag: `NEXT_PUBLIC_FEATURE_VIDEO_CALLS=true` to gate UI.

- Testing
  - Use two browsers to verify join/leave; simulate network throttling.
  - Unit test token endpoint; e2e smoke via Playwright for pre‑join and controls.

