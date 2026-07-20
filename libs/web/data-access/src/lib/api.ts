import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import {
  OwnerSchema,
  RigSchema,
  TokenPairSchema,
  type CreateRig,
  type Id,
  type Owner,
  type Rig,
  type TokenPair,
  type UpdateRig,
} from '@rv-checklist/domain';
import { Mutex } from 'async-mutex';
import { z } from 'zod';
import { signedOut, tokensReceived, type AuthRoot } from './auth.slice.js';
import { config } from './config.js';

const RigArraySchema = z.array(RigSchema);

/** The raw transport: attaches the bearer access token from the auth slice. */
const rawBaseQuery = fetchBaseQuery({
  baseUrl: config.apiBaseUrl,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as AuthRoot).auth.accessToken;
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

// One in-flight refresh at a time: concurrent 401s wait on the same rotation
// rather than each spending the single-use refresh token (ADR-0002).
const refreshMutex = new Mutex();

/**
 * The re-auth base query (the canonical RTK Query pattern). On a 401 it rotates
 * the refresh token once — guarded by a mutex so parallel requests trigger a
 * single refresh — writes the new pair to the auth slice, and retries the
 * original request. If there is no refresh token or the refresh itself fails,
 * the session is cleared.
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
    // A refresh is already running; wait for it, then retry with the new token.
    await refreshMutex.waitForUnlock();
    return rawBaseQuery(args, apiCtx, extraOptions);
  }

  const release = await refreshMutex.acquire();
  try {
    const refreshToken = (apiCtx.getState() as AuthRoot).auth.refreshToken;
    if (!refreshToken) {
      apiCtx.dispatch(signedOut());
      return result;
    }
    const refreshResult = await rawBaseQuery(
      { url: '/auth/refresh', method: 'POST', body: { refreshToken } },
      apiCtx,
      extraOptions,
    );
    const rotated = TokenPairSchema.safeParse(refreshResult.data);
    if (!rotated.success) {
      apiCtx.dispatch(signedOut());
      return result;
    }
    apiCtx.dispatch(tokensReceived(rotated.data));
    result = await rawBaseQuery(args, apiCtx, extraOptions);
  } finally {
    release();
  }
  return result;
};

/**
 * The single API slice (ADR-0011: RTK Query owns all server state). Rigs map to
 * the `Rig` tag type so a mutation invalidates exactly the reads it affects, and
 * responses are validated by the shared Zod schemas so the wire model has one
 * source of truth. Auth calls (sign-in, sign-out) live here too so they share
 * the re-auth transport; the token lifecycle is folded into the auth slice via
 * `onQueryStarted`.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Rig', 'Me'],
  endpoints: (builder) => ({
    me: builder.query<Owner, void>({
      query: () => '/me',
      transformResponse: (raw: unknown) => OwnerSchema.parse(raw),
      providesTags: ['Me'],
    }),

    loginWithGoogle: builder.mutation<TokenPair, string>({
      query: (idToken) => ({
        url: '/auth/google',
        method: 'POST',
        body: { idToken },
      }),
      transformResponse: (raw: unknown) => TokenPairSchema.parse(raw),
      async onQueryStarted(_idToken, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(tokensReceived(data));
        dispatch(api.util.invalidateTags(['Me', 'Rig']));
      },
    }),

    logout: builder.mutation<void, string>({
      query: (refreshToken) => ({
        url: '/auth/logout',
        method: 'POST',
        body: { refreshToken },
      }),
      async onQueryStarted(_refreshToken, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          // Local sign-out proceeds even if the server revoke call fails.
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
} = api;
