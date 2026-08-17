import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import {
  ChecklistSchema,
  EquipmentItemSchema,
  LogEntrySchema,
  MaintenanceTaskSchema,
  McpTokenCreatedSchema,
  McpTokenStatusSchema,
  OwnerSchema,
  RigSchema,
  RunSchema,
  type Checklist,
  type CreateChecklist,
  type CreateEquipmentItem,
  type CreateLogEntry,
  type CreateMaintenanceTask,
  type CreateRig,
  type CreateRun,
  type EquipmentItem,
  type Id,
  type LogEntry,
  type MaintenanceTask,
  type McpTokenCreated,
  type McpTokenStatus,
  type Owner,
  type Rig,
  type Run,
  type UpdateChecklist,
  type UpdateEquipmentItem,
  type UpdateLogEntry,
  type UpdateMaintenanceTask,
  type UpdateRig,
  type UpdateRun,
} from '@rv-checklist/domain';
import { Mutex } from 'async-mutex';
import { z } from 'zod';
import { signedIn, signedOut } from './auth.slice.js';
import { config } from './config.js';

const RigArraySchema = z.array(RigSchema);
const ChecklistArraySchema = z.array(ChecklistSchema);
const RunArraySchema = z.array(RunSchema);
const MaintenanceTaskArraySchema = z.array(MaintenanceTaskSchema);
const LogEntryArraySchema = z.array(LogEntrySchema);
const EquipmentItemArraySchema = z.array(EquipmentItemSchema);

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
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'Rig',
    'Checklist',
    'Run',
    'Task',
    'LogEntry',
    'Equipment',
    'Me',
    'McpToken',
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
    }),

    getRun: builder.query<Run, Id>({
      query: (id) => `/runs/${id}`,
      transformResponse: (raw: unknown) => RunSchema.parse(raw),
      providesTags: (_result, _error, id) => [{ type: 'Run', id }],
    }),

    createRun: builder.mutation<Run, CreateRun>({
      query: (body) => ({ url: '/runs', method: 'POST', body }),
      transformResponse: (raw: unknown) => RunSchema.parse(raw),
      invalidatesTags: (result, _error, { checklistId }) => [
        { type: 'Run', id: `LIST:${checklistId}` },
        ...(result
          ? [{ type: 'Run' as const, id: `RIG:${result.rigId}` }]
          : []),
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

    deleteRun: builder.mutation<void, Id>({
      query: (id) => ({ url: `/runs/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Run', id }],
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
      invalidatesTags: (_result, _error, { id }) => [{ type: 'LogEntry', id }],
    }),

    deleteLogEntry: builder.mutation<void, Id>({
      query: (id) => ({ url: `/log-entries/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'LogEntry', id }],
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
  useGetRunQuery,
  useCreateRunMutation,
  useUpdateRunMutation,
  useDeleteRunMutation,
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
} = api;
