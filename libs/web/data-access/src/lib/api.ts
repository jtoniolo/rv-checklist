import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import {
  AttachmentSchema,
  ChecklistSchema,
  EquipmentItemSchema,
  LogEntrySchema,
  MaintenanceTaskSchema,
  McpTokenCreatedSchema,
  McpTokenStatusSchema,
  OAuthGrantSchema,
  OwnerSchema,
  PlaceDetailsSchema,
  PlaceSuggestionSchema,
  RouteDistanceSchema,
  StopReadSchema,
  WebSessionSchema,
  RigSchema,
  RunSchema,
  TripReadSchema,
  type Attachment,
  type Checklist,
  type CreateChecklist,
  type CreateEquipmentItem,
  type CreateLogEntry,
  type CreateMaintenanceTask,
  type CreateRig,
  type CreateRun,
  type CreateStop,
  type CreateTrip,
  type EquipmentItem,
  type Id,
  type LogEntry,
  type MaintenanceTask,
  type McpTokenCreated,
  type McpTokenStatus,
  type OAuthGrant,
  type Owner,
  type PlaceDetails,
  type PlaceSuggestion,
  type RouteDistance,
  type RouteDistanceRequest,
  type StopRead,
  type WebSession,
  type Rig,
  type Run,
  type RunStepOp,
  type TripRead,
  type UpdateChecklist,
  type UpdateEquipmentItem,
  type UpdateLogEntry,
  type UpdateMaintenanceTask,
  type UpdateRig,
  type UpdateRun,
  type UpdateStop,
  type UpdateTrip,
} from '@rv-checklist/domain';
import { Mutex } from 'async-mutex';
import { z } from 'zod';
import { signedIn, signedOut } from './auth.slice.js';
import { config } from './config.js';
import { resetLocalStore } from './powersync/browser-store.js';
import {
  checklistsQuery,
  equipmentQuery,
  logEntriesByRigQuery,
  logEntriesByTaskQuery,
  rigsQuery,
  runQuery,
  runsByChecklistQuery,
  runsByRigQuery,
  runsByTripQuery,
  tasksQuery,
  tripsByRigQuery,
} from './powersync/queries.js';
import { watchIntoCache } from './powersync/watch.js';

const RigArraySchema = z.array(RigSchema);
const ChecklistArraySchema = z.array(ChecklistSchema);
const RunArraySchema = z.array(RunSchema);
const MaintenanceTaskArraySchema = z.array(MaintenanceTaskSchema);
const LogEntryArraySchema = z.array(LogEntrySchema);
const EquipmentItemArraySchema = z.array(EquipmentItemSchema);
const OAuthGrantArraySchema = z.array(OAuthGrantSchema);
const TripReadArraySchema = z.array(TripReadSchema);
const StopReadArraySchema = z.array(StopReadSchema);
const PlaceSuggestionArraySchema = z.array(PlaceSuggestionSchema);
const WebSessionArraySchema = z.array(WebSessionSchema);

/**
 * The raw transport (ADR-0019): sends cookies via `credentials: 'include'`.
 * No bearer header — the httpOnly access cookie authenticates every request.
 */
const rawBaseQuery = fetchBaseQuery({
  baseUrl: config.apiBaseUrl,
  credentials: 'include',
});

const refreshMutex = new Mutex();

/**
 * The re-auth base query (ADR-0019). On a 401 it sends a cookie-based refresh
 * (the refresh cookie carries the token — no body needed), guarded by a mutex
 * so parallel requests trigger a single refresh, then retries the original
 * request. If the refresh itself fails, the session is cleared.
 */
const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, apiCtx, extraOptions) => {
  await refreshMutex.waitForUnlock();
  let result = await rawBaseQuery(args, apiCtx, extraOptions);

  if (result.error?.status !== 401) {
    return result;
  }

  if (refreshMutex.isLocked()) {
    await refreshMutex.waitForUnlock();
    return rawBaseQuery(args, apiCtx, extraOptions);
  }

  const release = await refreshMutex.acquire();
  try {
    const refreshResult = await rawBaseQuery(
      { url: '/auth/refresh', method: 'POST' },
      apiCtx,
      extraOptions,
    );
    if (refreshResult.error) {
      apiCtx.dispatch(signedOut());
      return result;
    }
    result = await rawBaseQuery(args, apiCtx, extraOptions);
  } finally {
    release();
  }
  return result;
};

/**
 * The single API slice (ADR-0011: RTK Query owns all server state). Auth calls
 * (sign-in, sign-out) live here too so they share the re-auth transport; the
 * auth slice is notified via `onQueryStarted` so the UI updates. No tokens
 * are read from the body — the server sets httpOnly cookies (ADR-0019).
 *
 * Endpoints whose payload is a faithful projection of the ten synced tables
 * also carry an `onCacheEntryAdded` watch (ADR-0029): while anything is
 * subscribed, the local PowerSync store feeds that entry, online and offline
 * alike. Precedence is local store > network response > SSR seed — a watch
 * emission leaves a fulfilled entry, which the seeder's clobber guard (#134)
 * then skips, so `seed-cache.ts` needs no change.
 *
 * Endpoints without a watch stay network-only on purpose: the Maps proxies,
 * the MCP and OAuth surfaces and the session list are network by nature, and
 * `me` is left to the auth work in #149. Endpoints carrying a value the API
 * computes from data that does not sync belong to #155.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'Rig',
    'Checklist',
    'Run',
    'Task',
    'Trip',
    'LogEntry',
    'Equipment',
    'Me',
    'McpToken',
    'OAuthGrant',
    'WebSession',
  ],
  endpoints: (builder) => ({
    me: builder.query<Owner, void>({
      query: () => '/me',
      transformResponse: (raw: unknown) => OwnerSchema.parse(raw),
      providesTags: ['Me'],
    }),

    loginWithGoogle: builder.mutation<void, string>({
      query: (idToken) => ({
        url: '/auth/google',
        method: 'POST',
        body: { idToken },
      }),
      async onQueryStarted(_idToken, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        // Whoever the page last resolved as is now the wrong owner. Drop the
        // handle (without clearing — the incoming owner's store is a different
        // file) so the first watch after this re-resolves and connects with the
        // new token (ADR-0029, decision 10).
        await resetLocalStore({ clear: false });
        dispatch(signedIn());
        dispatch(api.util.invalidateTags(['Me', 'Rig']));
      },
    }),

    logout: builder.mutation<void, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(signedOut());
          dispatch(api.util.resetApiState());
          // Resetting the API state tears the watches down but leaves the
          // replicated rows on disk — and PowerSync keeps `hasSynced` there
          // too, so without this the next owner to sign in on this browser is
          // served the previous one's data (ADR-0029, decision 10).
          await resetLocalStore({ clear: true });
        }
      },
    }),

    listRigs: builder.query<Rig[], void>({
      query: () => '/rigs',
      transformResponse: (raw: unknown) => RigArraySchema.parse(raw),
      providesTags: (result) =>
        result
          ? [
              ...result.map((rig) => ({ type: 'Rig' as const, id: rig.id })),
              { type: 'Rig' as const, id: 'LIST' },
            ]
          : [{ type: 'Rig' as const, id: 'LIST' }],
      onCacheEntryAdded: (_arg, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: rigsQuery,
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listRigs', arg: undefined, value },
              ]),
            ),
        }),
    }),

    createRig: builder.mutation<Rig, CreateRig>({
      query: (body) => ({ url: '/rigs', method: 'POST', body }),
      transformResponse: (raw: unknown) => RigSchema.parse(raw),
      invalidatesTags: [{ type: 'Rig', id: 'LIST' }],
    }),

    updateRig: builder.mutation<Rig, { id: Id; changes: UpdateRig }>({
      query: ({ id, changes }) => ({
        url: `/rigs/${id}`,
        method: 'PATCH',
        body: changes,
      }),
      transformResponse: (raw: unknown) => RigSchema.parse(raw),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Rig', id },
        { type: 'Rig', id: 'LIST' },
      ],
    }),

    deleteRig: builder.mutation<void, Id>({
      query: (id) => ({ url: `/rigs/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Rig', id },
        { type: 'Rig', id: 'LIST' },
      ],
    }),

    listChecklists: builder.query<Checklist[], Id>({
      query: (rigId) => `/checklists?rigId=${rigId}`,
      transformResponse: (raw: unknown) => ChecklistArraySchema.parse(raw),
      providesTags: (result, _error, rigId) =>
        result
          ? [
              ...result.map((c) => ({ type: 'Checklist' as const, id: c.id })),
              { type: 'Checklist' as const, id: `LIST:${rigId}` },
            ]
          : [{ type: 'Checklist' as const, id: `LIST:${rigId}` }],
      onCacheEntryAdded: (rigId, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: checklistsQuery(rigId),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listChecklists', arg: rigId, value },
              ]),
            ),
        }),
    }),

    createChecklist: builder.mutation<Checklist, CreateChecklist>({
      query: (body) => ({ url: '/checklists', method: 'POST', body }),
      transformResponse: (raw: unknown) => ChecklistSchema.parse(raw),
      invalidatesTags: (_result, _error, { rigId }) => [
        { type: 'Checklist', id: `LIST:${rigId}` },
      ],
    }),

    updateChecklist: builder.mutation<
      Checklist,
      { id: Id; changes: UpdateChecklist }
    >({
      query: ({ id, changes }) => ({
        url: `/checklists/${id}`,
        method: 'PATCH',
        body: changes,
      }),
      transformResponse: (raw: unknown) => ChecklistSchema.parse(raw),
      invalidatesTags: (result, _error, { id }) => [
        { type: 'Checklist', id },
        ...(result
          ? [{ type: 'Checklist' as const, id: `LIST:${result.rigId}` }]
          : []),
      ],
    }),

    deleteChecklist: builder.mutation<void, Id>({
      query: (id) => ({ url: `/checklists/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Checklist', id }],
    }),

    listRuns: builder.query<Run[], Id>({
      query: (checklistId) => `/runs?checklistId=${checklistId}`,
      transformResponse: (raw: unknown) => RunArraySchema.parse(raw),
      providesTags: (result, _error, checklistId) =>
        result
          ? [
              ...result.map((r) => ({ type: 'Run' as const, id: r.id })),
              { type: 'Run' as const, id: `LIST:${checklistId}` },
            ]
          : [{ type: 'Run' as const, id: `LIST:${checklistId}` }],
      onCacheEntryAdded: (checklistId, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: runsByChecklistQuery(checklistId),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listRuns', arg: checklistId, value },
              ]),
            ),
        }),
    }),

    listRunsByRig: builder.query<Run[], Id>({
      query: (rigId) => `/runs?rigId=${rigId}`,
      transformResponse: (raw: unknown) => RunArraySchema.parse(raw),
      providesTags: (result, _error, rigId) =>
        result
          ? [
              ...result.map((r) => ({ type: 'Run' as const, id: r.id })),
              { type: 'Run' as const, id: `RIG:${rigId}` },
            ]
          : [{ type: 'Run' as const, id: `RIG:${rigId}` }],
      onCacheEntryAdded: (rigId, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: runsByRigQuery(rigId),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listRunsByRig', arg: rigId, value },
              ]),
            ),
        }),
    }),

    listRunsByTrip: builder.query<Run[], Id>({
      query: (tripId) => `/runs?tripId=${tripId}`,
      transformResponse: (raw: unknown) => RunArraySchema.parse(raw),
      providesTags: (result, _error, tripId) =>
        result
          ? [
              ...result.map((r) => ({ type: 'Run' as const, id: r.id })),
              { type: 'Run' as const, id: `TRIP:${tripId}` },
            ]
          : [{ type: 'Run' as const, id: `TRIP:${tripId}` }],
      onCacheEntryAdded: (tripId, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: runsByTripQuery(tripId),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listRunsByTrip', arg: tripId, value },
              ]),
            ),
        }),
    }),

    getRun: builder.query<Run, Id>({
      query: (id) => `/runs/${id}`,
      transformResponse: (raw: unknown) => RunSchema.parse(raw),
      providesTags: (_result, _error, id) => [{ type: 'Run', id }],
      onCacheEntryAdded: (id, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: runQuery(id),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'getRun', arg: id, value },
              ]),
            ),
        }),
    }),

    createRun: builder.mutation<Run, CreateRun>({
      query: (body) => ({ url: '/runs', method: 'POST', body }),
      transformResponse: (raw: unknown) => RunSchema.parse(raw),
      invalidatesTags: (result, _error, { checklistId }) => [
        { type: 'Run', id: `LIST:${checklistId}` },
        ...(result
          ? [{ type: 'Run' as const, id: `RIG:${result.rigId}` }]
          : []),
        ...(result?.tripId === undefined
          ? []
          : [{ type: 'Run' as const, id: `TRIP:${result.tripId}` }]),
      ],
    }),

    updateRun: builder.mutation<Run, { id: Id; changes: UpdateRun }>({
      query: ({ id, changes }) => ({
        url: `/runs/${id}`,
        method: 'PATCH',
        body: changes,
      }),
      transformResponse: (raw: unknown) => RunSchema.parse(raw),
      invalidatesTags: (result, _error, { id }) => [
        { type: 'Run', id },
        ...(result
          ? [{ type: 'Run' as const, id: `LIST:${result.checklistId}` }]
          : []),
      ],
    }),

    /**
     * Record run work as per-step operations (ADR-0030, issue #144) — the write the run
     * screen makes on every tap, and the one shape that survives two devices working the
     * same run offline: each op names a single step, so the request carries no opinion
     * about the steps the user did not touch.
     *
     * It is the one call that generates its own `Idempotency-Key` (issue #142). The header
     * is deliberately narrow rather than a client-wide interceptor — the general offline
     * queue owns that everywhere else (issue #147). One key is minted per dispatch, so a
     * replay of *this* operation is deduped while a genuine second tap is not.
     */
    applyRunStepOps: builder.mutation<
      Run,
      { id: Id; ops: readonly RunStepOp[] }
    >({
      query: ({ id, ops }) => ({
        url: `/runs/${id}/step-ops`,
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: { ops },
      }),
      transformResponse: (raw: unknown) => RunSchema.parse(raw),
      invalidatesTags: (result, _error, { id }) => [
        { type: 'Run', id },
        ...(result
          ? [{ type: 'Run' as const, id: `LIST:${result.checklistId}` }]
          : []),
      ],
    }),

    deleteRun: builder.mutation<void, Id>({
      query: (id) => ({ url: `/runs/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Run', id }],
    }),

    listTripsByRig: builder.query<TripRead[], Id>({
      query: (rigId) => `/trips?rigId=${rigId}`,
      transformResponse: (raw: unknown) => TripReadArraySchema.parse(raw),
      providesTags: (result, _error, rigId) =>
        result
          ? [
              ...result.map((t) => ({ type: 'Trip' as const, id: t.id })),
              { type: 'Trip' as const, id: `LIST:${rigId}` },
            ]
          : [{ type: 'Trip' as const, id: `LIST:${rigId}` }],
      onCacheEntryAdded: (rigId, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: tripsByRigQuery(rigId),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listTripsByRig', arg: rigId, value },
              ]),
            ),
        }),
    }),

    createTrip: builder.mutation<TripRead, CreateTrip>({
      query: (body) => ({ url: '/trips', method: 'POST', body }),
      transformResponse: (raw: unknown) => TripReadSchema.parse(raw),
      invalidatesTags: (_result, _error, { rigId }) => [
        { type: 'Trip', id: `LIST:${rigId}` },
      ],
    }),

    updateTrip: builder.mutation<
      TripRead,
      { id: Id; rigId: Id; changes: UpdateTrip }
    >({
      query: ({ id, changes }) => ({
        url: `/trips/${id}`,
        method: 'PATCH',
        body: changes,
      }),
      transformResponse: (raw: unknown) => TripReadSchema.parse(raw),
      invalidatesTags: (_result, _error, { id, rigId }) => [
        { type: 'Trip', id },
        { type: 'Trip', id: `LIST:${rigId}` },
      ],
    }),

    setStopArrived: builder.mutation<
      StopRead,
      { id: Id; arrived: boolean; rigId: Id; tripId: Id }
    >({
      query: ({ id, arrived }) => ({
        url: `/stops/${id}/arrival`,
        method: 'POST',
        body: { arrived },
      }),
      transformResponse: (raw: unknown) => StopReadSchema.parse(raw),
      // Arrival logs the leg onto the rig's Distance, so the rig is stale too.
      invalidatesTags: (_result, _error, { rigId, tripId }) => [
        { type: 'Trip', id: tripId },
        { type: 'Trip', id: `LIST:${rigId}` },
        { type: 'Rig', id: rigId },
        { type: 'Rig', id: 'LIST' },
      ],
    }),

    deleteTrip: builder.mutation<void, { id: Id; rigId: Id }>({
      query: ({ id }) => ({ url: `/trips/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { rigId }) => [
        { type: 'Trip', id: `LIST:${rigId}` },
      ],
    }),

    createStop: builder.mutation<StopRead, CreateStop>({
      query: (body) => ({ url: '/stops', method: 'POST', body }),
      transformResponse: (raw: unknown) => StopReadSchema.parse(raw),
      invalidatesTags: (_result, _error, { tripId }) => [
        { type: 'Trip', id: tripId },
      ],
    }),

    updateStop: builder.mutation<
      StopRead,
      { id: Id; tripId: Id; rigId: Id; changes: UpdateStop }
    >({
      query: ({ id, changes }) => ({
        url: `/stops/${id}`,
        method: 'PATCH',
        body: changes,
      }),
      transformResponse: (raw: unknown) => StopReadSchema.parse(raw),
      // Editing an arrived stop's leg moves the rig's Distance by the
      // difference (issue #111), so the Rig caches refetch too.
      invalidatesTags: (result, _error, { tripId, rigId, changes }) => [
        { type: 'Trip', id: tripId },
        { type: 'Trip', id: `LIST:${rigId}` },
        ...(result?.arrived === true && 'legKm' in changes
          ? [
              { type: 'Rig' as const, id: rigId },
              { type: 'Rig' as const, id: 'LIST' },
            ]
          : []),
      ],
    }),

    deleteStop: builder.mutation<void, { id: Id; tripId: Id; rigId: Id }>({
      query: ({ id }) => ({ url: `/stops/${id}`, method: 'DELETE' }),
      // Deleting an arrived stop backs its leg out of the rig's Distance.
      invalidatesTags: (_result, _error, { tripId, rigId }) => [
        { type: 'Trip', id: tripId },
        { type: 'Trip', id: `LIST:${rigId}` },
        { type: 'Rig', id: rigId },
        { type: 'Rig', id: 'LIST' },
      ],
    }),

    reorderStop: builder.mutation<
      StopRead[],
      { id: Id; tripId: Id; rigId: Id; position: number }
    >({
      query: ({ id, position }) => ({
        url: `/stops/${id}/reorder`,
        method: 'POST',
        body: { position },
      }),
      transformResponse: (raw: unknown) => StopReadArraySchema.parse(raw),
      invalidatesTags: (_result, _error, { tripId, rigId }) => [
        { type: 'Trip', id: tripId },
        { type: 'Trip', id: `LIST:${rigId}` },
      ],
    }),

    // Attachment endpoints (issue #117, ADR-0026). Attachment metadata rides
    // on stop reads, which arrive through the rig's trips list — so every
    // mutation invalidates the trip and the trips list to refresh the UI.
    uploadAttachment: builder.mutation<
      Attachment,
      { stopId: Id; tripId: Id; rigId: Id; file: File }
    >({
      query: ({ stopId, file }) => {
        // fetchBaseQuery passes FormData through untouched; the browser sets
        // the multipart boundary. The field must be named `file` (the API's
        // single-file interceptor).
        const body = new FormData();
        body.append('file', file);
        return { url: `/stops/${stopId}/attachments`, method: 'POST', body };
      },
      transformResponse: (raw: unknown) => AttachmentSchema.parse(raw),
      invalidatesTags: (_result, _error, { tripId, rigId }) => [
        { type: 'Trip', id: tripId },
        { type: 'Trip', id: `LIST:${rigId}` },
      ],
    }),

    setCampgroundMap: builder.mutation<
      Attachment,
      { id: Id; tripId: Id; rigId: Id; isCampgroundMap: boolean }
    >({
      query: ({ id, isCampgroundMap }) => ({
        url: `/attachments/${id}/campground-map`,
        method: 'POST',
        body: { isCampgroundMap },
      }),
      transformResponse: (raw: unknown) => AttachmentSchema.parse(raw),
      // Flagging swaps the flag off any sibling attachment server-side, so
      // the whole stop read is stale, not just this attachment.
      invalidatesTags: (_result, _error, { tripId, rigId }) => [
        { type: 'Trip', id: tripId },
        { type: 'Trip', id: `LIST:${rigId}` },
      ],
    }),

    deleteAttachment: builder.mutation<void, { id: Id; tripId: Id; rigId: Id }>(
      {
        query: ({ id }) => ({ url: `/attachments/${id}`, method: 'DELETE' }),
        invalidatesTags: (_result, _error, { tripId, rigId }) => [
          { type: 'Trip', id: tripId },
          { type: 'Trip', id: `LIST:${rigId}` },
        ],
      },
    ),

    // Maps proxy endpoints (issue #112, ADR-0025): responses only pre-fill
    // editable fields and are never persisted, so nothing here carries tags.
    // The queries are used lazily — the component debounces autocomplete and
    // fires place details on pick.
    mapsAutocomplete: builder.query<PlaceSuggestion[], string>({
      query: (input) => `/maps/autocomplete?input=${encodeURIComponent(input)}`,
      transformResponse: (raw: unknown) =>
        PlaceSuggestionArraySchema.parse(raw),
    }),

    placeDetails: builder.query<PlaceDetails, string>({
      query: (placeId) => `/maps/places/${placeId}`,
      transformResponse: (raw: unknown) => PlaceDetailsSchema.parse(raw),
    }),

    routeDistance: builder.mutation<RouteDistance, RouteDistanceRequest>({
      query: (body) => ({
        url: '/maps/route-distance',
        method: 'POST',
        body,
      }),
      transformResponse: (raw: unknown) => RouteDistanceSchema.parse(raw),
    }),

    listTasks: builder.query<MaintenanceTask[], Id>({
      query: (rigId) => `/tasks?rigId=${rigId}`,
      transformResponse: (raw: unknown) =>
        MaintenanceTaskArraySchema.parse(raw),
      providesTags: (result, _error, rigId) =>
        result
          ? [
              ...result.map((t) => ({ type: 'Task' as const, id: t.id })),
              { type: 'Task' as const, id: `LIST:${rigId}` },
            ]
          : [{ type: 'Task' as const, id: `LIST:${rigId}` }],
      onCacheEntryAdded: (rigId, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: tasksQuery(rigId),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listTasks', arg: rigId, value },
              ]),
            ),
        }),
    }),

    createTask: builder.mutation<MaintenanceTask, CreateMaintenanceTask>({
      query: (body) => ({ url: '/tasks', method: 'POST', body }),
      transformResponse: (raw: unknown) => MaintenanceTaskSchema.parse(raw),
      invalidatesTags: (_result, _error, { rigId }) => [
        { type: 'Task', id: `LIST:${rigId}` },
      ],
    }),

    updateTask: builder.mutation<
      MaintenanceTask,
      { id: Id; changes: UpdateMaintenanceTask }
    >({
      query: ({ id, changes }) => ({
        url: `/tasks/${id}`,
        method: 'PATCH',
        body: changes,
      }),
      transformResponse: (raw: unknown) => MaintenanceTaskSchema.parse(raw),
      invalidatesTags: (result, _error, { id }) => [
        { type: 'Task', id },
        ...(result
          ? [{ type: 'Task' as const, id: `LIST:${result.rigId}` }]
          : []),
      ],
    }),

    deleteTask: builder.mutation<void, { id: Id; rigId: Id }>({
      query: ({ id }) => ({ url: `/tasks/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { id, rigId }) => [
        { type: 'Task', id },
        { type: 'LogEntry', id: `RIG:${rigId}` },
      ],
    }),

    listLogEntries: builder.query<LogEntry[], Id>({
      query: (taskId) => `/log-entries?taskId=${taskId}`,
      transformResponse: (raw: unknown) => LogEntryArraySchema.parse(raw),
      providesTags: (result, _error, taskId) =>
        result
          ? [
              ...result.map((e) => ({ type: 'LogEntry' as const, id: e.id })),
              { type: 'LogEntry' as const, id: `LIST:${taskId}` },
            ]
          : [{ type: 'LogEntry' as const, id: `LIST:${taskId}` }],
      onCacheEntryAdded: (taskId, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: logEntriesByTaskQuery(taskId),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listLogEntries', arg: taskId, value },
              ]),
            ),
        }),
    }),

    listLogEntriesByRig: builder.query<LogEntry[], Id>({
      query: (rigId) => `/log-entries?rigId=${rigId}`,
      transformResponse: (raw: unknown) => LogEntryArraySchema.parse(raw),
      providesTags: (result, _error, rigId) =>
        result
          ? [
              ...result.map((e) => ({ type: 'LogEntry' as const, id: e.id })),
              { type: 'LogEntry' as const, id: `RIG:${rigId}` },
            ]
          : [{ type: 'LogEntry' as const, id: `RIG:${rigId}` }],
      onCacheEntryAdded: (rigId, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: logEntriesByRigQuery(rigId),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listLogEntriesByRig', arg: rigId, value },
              ]),
            ),
        }),
    }),

    createLogEntry: builder.mutation<LogEntry, CreateLogEntry>({
      query: (body) => ({ url: '/log-entries', method: 'POST', body }),
      transformResponse: (raw: unknown) => LogEntrySchema.parse(raw),
      invalidatesTags: (result, _error, { taskId }) => [
        { type: 'LogEntry', id: `LIST:${taskId}` },
        ...(result
          ? [
              { type: 'LogEntry' as const, id: `RIG:${result.rigId}` },
              { type: 'Task' as const, id: `LIST:${result.rigId}` },
            ]
          : []),
      ],
    }),

    updateLogEntry: builder.mutation<
      LogEntry,
      { id: Id; changes: UpdateLogEntry }
    >({
      query: ({ id, changes }) => ({
        url: `/log-entries/${id}`,
        method: 'PATCH',
        body: changes,
      }),
      transformResponse: (raw: unknown) => LogEntrySchema.parse(raw),
      // A corrected date or distance changes due standing, so the rig's task
      // list refetches too — same as createLogEntry.
      invalidatesTags: (result, _error, { id }) => [
        { type: 'LogEntry', id },
        ...(result
          ? [{ type: 'Task' as const, id: `LIST:${result.rigId}` }]
          : []),
      ],
    }),

    // DELETE returns no body, so the caller passes the entry's rigId for the
    // due-standing invalidation.
    deleteLogEntry: builder.mutation<void, { id: Id; rigId: Id }>({
      query: ({ id }) => ({ url: `/log-entries/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { id, rigId }) => [
        { type: 'LogEntry', id },
        { type: 'Task', id: `LIST:${rigId}` },
      ],
    }),

    listEquipment: builder.query<EquipmentItem[], Id>({
      query: (rigId) => `/equipment?rigId=${rigId}`,
      transformResponse: (raw: unknown) => EquipmentItemArraySchema.parse(raw),
      providesTags: (result, _error, rigId) =>
        result
          ? [
              ...result.map((e) => ({
                type: 'Equipment' as const,
                id: e.id,
              })),
              { type: 'Equipment' as const, id: `LIST:${rigId}` },
            ]
          : [{ type: 'Equipment' as const, id: `LIST:${rigId}` }],
      onCacheEntryAdded: (rigId, { dispatch, cacheEntryRemoved }) =>
        watchIntoCache({
          query: equipmentQuery(rigId),
          removed: cacheEntryRemoved,
          emit: (value) =>
            dispatch(
              api.util.upsertQueryEntries([
                { endpointName: 'listEquipment', arg: rigId, value },
              ]),
            ),
        }),
    }),

    createEquipment: builder.mutation<EquipmentItem, CreateEquipmentItem>({
      query: (body) => ({ url: '/equipment', method: 'POST', body }),
      transformResponse: (raw: unknown) => EquipmentItemSchema.parse(raw),
      invalidatesTags: (_result, _error, { rigId }) => [
        { type: 'Equipment', id: `LIST:${rigId}` },
      ],
    }),

    updateEquipment: builder.mutation<
      EquipmentItem,
      { id: Id; changes: UpdateEquipmentItem }
    >({
      query: ({ id, changes }) => ({
        url: `/equipment/${id}`,
        method: 'PATCH',
        body: changes,
      }),
      transformResponse: (raw: unknown) => EquipmentItemSchema.parse(raw),
      invalidatesTags: (result, _error, { id }) => [
        { type: 'Equipment', id },
        ...(result
          ? [{ type: 'Equipment' as const, id: `LIST:${result.rigId}` }]
          : []),
      ],
    }),

    deleteEquipment: builder.mutation<void, { id: Id; rigId: Id }>({
      query: ({ id }) => ({ url: `/equipment/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { id, rigId }) => [
        { type: 'Equipment', id },
        { type: 'Equipment', id: `LIST:${rigId}` },
      ],
    }),

    mcpTokenStatus: builder.query<McpTokenStatus, void>({
      query: () => '/mcp-token',
      transformResponse: (raw: unknown) => McpTokenStatusSchema.parse(raw),
      providesTags: ['McpToken'],
    }),

    generateMcpToken: builder.mutation<McpTokenCreated, void>({
      query: () => ({ url: '/mcp-token', method: 'POST' }),
      transformResponse: (raw: unknown) => McpTokenCreatedSchema.parse(raw),
      invalidatesTags: ['McpToken'],
    }),

    revokeMcpToken: builder.mutation<void, void>({
      query: () => ({ url: '/mcp-token', method: 'DELETE' }),
      invalidatesTags: ['McpToken'],
    }),

    listOAuthGrants: builder.query<OAuthGrant[], void>({
      query: () => '/oauth-grants',
      transformResponse: (raw: unknown) => OAuthGrantArraySchema.parse(raw),
      providesTags: (result) =>
        result
          ? [
              ...result.map((g) => ({
                type: 'OAuthGrant' as const,
                id: g.id,
              })),
              { type: 'OAuthGrant' as const, id: 'LIST' },
            ]
          : [{ type: 'OAuthGrant' as const, id: 'LIST' }],
    }),

    revokeOAuthGrant: builder.mutation<void, Id>({
      query: (id) => ({ url: `/oauth-grants/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'OAuthGrant', id },
        { type: 'OAuthGrant', id: 'LIST' },
      ],
    }),

    listWebSessions: builder.query<WebSession[], void>({
      query: () => '/sessions',
      transformResponse: (raw: unknown) => WebSessionArraySchema.parse(raw),
      providesTags: (result) =>
        result
          ? [
              ...result.map((s) => ({
                type: 'WebSession' as const,
                id: s.sessionId,
              })),
              { type: 'WebSession' as const, id: 'LIST' },
            ]
          : [{ type: 'WebSession' as const, id: 'LIST' }],
    }),

    revokeWebSession: builder.mutation<void, Id>({
      query: (sessionId) => ({
        url: `/sessions/${sessionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, sessionId) => [
        { type: 'WebSession', id: sessionId },
        { type: 'WebSession', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useMeQuery,
  useLoginWithGoogleMutation,
  useLogoutMutation,
  useListRigsQuery,
  useCreateRigMutation,
  useUpdateRigMutation,
  useDeleteRigMutation,
  useListChecklistsQuery,
  useCreateChecklistMutation,
  useUpdateChecklistMutation,
  useDeleteChecklistMutation,
  useListRunsQuery,
  useListRunsByRigQuery,
  useListRunsByTripQuery,
  useGetRunQuery,
  useCreateRunMutation,
  useUpdateRunMutation,
  useApplyRunStepOpsMutation,
  useDeleteRunMutation,
  useListTripsByRigQuery,
  useCreateTripMutation,
  useUpdateTripMutation,
  useSetStopArrivedMutation,
  useDeleteTripMutation,
  useCreateStopMutation,
  useUpdateStopMutation,
  useDeleteStopMutation,
  useReorderStopMutation,
  useUploadAttachmentMutation,
  useSetCampgroundMapMutation,
  useDeleteAttachmentMutation,
  useLazyMapsAutocompleteQuery,
  useLazyPlaceDetailsQuery,
  useRouteDistanceMutation,
  useListTasksQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useListLogEntriesQuery,
  useListLogEntriesByRigQuery,
  useCreateLogEntryMutation,
  useUpdateLogEntryMutation,
  useDeleteLogEntryMutation,
  useListEquipmentQuery,
  useCreateEquipmentMutation,
  useUpdateEquipmentMutation,
  useDeleteEquipmentMutation,
  useMcpTokenStatusQuery,
  useGenerateMcpTokenMutation,
  useRevokeMcpTokenMutation,
  useListOAuthGrantsQuery,
  useRevokeOAuthGrantMutation,
  useListWebSessionsQuery,
  useRevokeWebSessionMutation,
} = api;

/**
 * The action that clears every cached query entry and cancels the watches
 * behind them.
 *
 * The web app reaches this library through its declaration output, and that
 * output loses the RTK Query module augmentation that puts `util` on `api`:
 * the app resolves `@reduxjs/toolkit/query` to the ESM declaration file and
 * `@reduxjs/toolkit/query/react` to the CommonJS one, so the two `ApiModules`
 * interfaces never merge. Exporting the action creator directly gives the app
 * a type it can resolve.
 */
export const resetApiState = api.util.resetApiState;

/**
 * The URL an attachment's bytes stream from — the API's proxied download
 * (ADR-0026), authenticated by the same httpOnly cookies as every other call
 * (ADR-0019), so a plain same-site link or a `credentials: 'include'` fetch
 * both work. Exported so screens never build API URLs from raw config.
 */
export function attachmentUrl(id: Id): string {
  return `${config.apiBaseUrl}/attachments/${id}`;
}
